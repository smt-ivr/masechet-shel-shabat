// ============================================================
//  admin.js — ניהול (מנהל בלבד): משתמשים, הגדרות, יומן כניסות, יומן פעולות, מייל פתיחה
//  כל פעולת ניהול נרשמת ביומן הפעולות.
// ============================================================
import { badRequest, conflict, notFound, readJson, str, json, israelNow } from './http.js';
import { passwordKey, normalizeEmail, requireAdmin } from './auth.js';
import { getConfig, publicSettings, updateSettings, fillTemplate } from './settings.js';
import { logAction } from './audit.js';
import { welcomeMail, sendMail, validEmail, mailReady, renderMail } from './mail.js';

const isIp = (v) =>
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v) || // IPv4
  (v.includes(':') && /^[0-9a-fA-F:]{2,45}$/.test(v)); // IPv6

function accountOut(a) {
  return {
    id: a.id,
    type: a.rule_type,
    username: a.username,
    email: a.email,
    ip: a.ip,
    name: a.display_name,
    is_admin: !!a.is_admin,
    active: !!a.active,
    has_password: !!(a.password_hash || a.legacy_sha256),
    last_used_at: a.last_used_at,
    created_at: a.created_at,
  };
}

async function activeAdmins(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) n FROM ms_accounts WHERE is_admin = 1 AND active = 1').first();
  return r.n;
}

async function checkUnique(env, field, value, exceptId = 0) {
  if (!value) return;
  const q = {
    password: "SELECT id FROM ms_accounts WHERE rule_type = 'user' AND password_hash = ? AND id != ?",
    email: 'SELECT id FROM ms_accounts WHERE email = ? AND id != ?',
    ip: "SELECT id FROM ms_accounts WHERE rule_type = 'ip' AND ip = ? AND id != ?",
  }[field];
  const hit = await env.DB.prepare(q).bind(value, exceptId).first();
  if (hit) throw conflict({ password: 'הסיסמה כבר בשימוש אצל משתמש אחר – בחרו סיסמה אחרת', email: 'המייל כבר משויך למשתמש אחר', ip: 'כתובת ה-IP כבר קיימת' }[field]);
}

// ===== משתמשים =====
async function listAccounts(env) {
  const { results } = await env.DB.prepare('SELECT * FROM ms_accounts ORDER BY is_admin DESC, active DESC, display_name').all();
  return json({ accounts: results.map(accountOut) });
}

async function createAccount(request, env, ctx) {
  const b = await readJson(request);
  const type = b.type === 'ip' ? 'ip' : 'user';
  const name = str(b.name, 80);
  if (!name) throw badRequest('חסר שם לתצוגה');
  const now = israelNow();

  if (type === 'ip') {
    const ip = str(b.ip, 45);
    if (!isIp(ip)) throw badRequest('כתובת IP לא תקינה');
    await checkUnique(env, 'ip', ip);
    const r = await env.DB.prepare('INSERT INTO ms_accounts (rule_type, ip, display_name, is_admin, active, created_at) VALUES (?, ?, ?, 0, ?, ?)')
      .bind('ip', ip, name, b.active === false ? 0 : 1, now).run();
    await logAction(env, request, ctx, { kind: 'admin', action: 'הוספת משתמש', target: name, details: { סוג: 'IP', ip } });
    return json({ id: r.meta.last_row_id });
  }

  const password = String(b.password || '');
  const email = b.email ? normalizeEmail(b.email) : null;
  if (password.length < 6) throw badRequest('סיסמה חייבת להיות לפחות 6 תווים');
  if (email && !validEmail(email)) throw badRequest('כתובת המייל אינה תקינה');
  await checkUnique(env, 'email', email);
  const key = await passwordKey(env, password);
  await checkUnique(env, 'password', key);
  const r = await env.DB.prepare(
    "INSERT INTO ms_accounts (rule_type, email, password_hash, password_salt, display_name, is_admin, active, created_at) VALUES ('user', ?, ?, 'system', ?, ?, ?, ?)",
  ).bind(email, key, name, b.is_admin ? 1 : 0, b.active === false ? 0 : 1, now).run();
  await logAction(env, request, ctx, {
    kind: 'admin', action: 'הוספת משתמש', target: name, details: { סוג: 'סיסמה', מייל: email || '', מנהל: b.is_admin ? 'כן' : 'לא' },
  });
  return json({ id: r.meta.last_row_id });
}

async function updateAccount(request, env, ctx, id) {
  const a = await env.DB.prepare('SELECT * FROM ms_accounts WHERE id = ?').bind(id).first();
  if (!a) throw notFound('המשתמש לא נמצא');
  const b = await readJson(request);
  const changes = {};
  const set = [];
  const vals = [];
  const put = (col, val, label, shown = val) => { set.push(`${col} = ?`); vals.push(val); changes[label] = shown; };

  if (b.name !== undefined) {
    const name = str(b.name, 80);
    if (!name) throw badRequest('חסר שם לתצוגה');
    if (name !== a.display_name) put('display_name', name, 'שם');
  }
  if (a.rule_type === 'ip' && b.ip !== undefined) {
    const ip = str(b.ip, 45);
    if (!isIp(ip)) throw badRequest('כתובת IP לא תקינה');
    if (ip !== a.ip) { await checkUnique(env, 'ip', ip, id); put('ip', ip, 'IP'); }
  }
  if (a.rule_type === 'user') {
    if (b.email !== undefined) {
      const e = b.email ? normalizeEmail(b.email) : null;
      if (e && !validEmail(e)) throw badRequest('כתובת המייל אינה תקינה');
      if (e !== (a.email || null)) { await checkUnique(env, 'email', e, id); put('email', e, 'מייל', e || '(הוסר)'); }
    }
    if (b.password) {
      if (String(b.password).length < 6) throw badRequest('סיסמה חייבת להיות לפחות 6 תווים');
      const key = await passwordKey(env, String(b.password));
      await checkUnique(env, 'password', key, id);
      set.push('password_hash = ?', "password_salt = 'system'", 'legacy_sha256 = NULL');
      vals.push(key);
      changes['סיסמה'] = 'הוחלפה';
    }
    if (b.is_admin !== undefined && !!b.is_admin !== !!a.is_admin) put('is_admin', b.is_admin ? 1 : 0, 'מנהל', b.is_admin ? 'כן' : 'לא');
  }
  if (b.active !== undefined && !!b.active !== !!a.active) put('active', b.active ? 1 : 0, 'פעיל', b.active ? 'כן' : 'לא');

  // לא משאירים את המערכת בלי מנהל פעיל
  const losesAdmin = a.is_admin && a.active && ((b.is_admin !== undefined && !b.is_admin) || (b.active !== undefined && !b.active));
  if (losesAdmin && (await activeAdmins(env)) <= 1) throw badRequest('חייב להישאר לפחות מנהל פעיל אחד');

  if (!set.length) return json({ updated: false });
  await env.DB.prepare(`UPDATE ms_accounts SET ${set.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  // השבתה / החלפת סיסמה / הסרת ניהול → ניתוק החיבורים הפעילים של המשתמש
  if (changes['סיסמה'] || changes['פעיל'] === 'לא' || changes['IP']) {
    await env.DB.prepare('DELETE FROM ms_sessions WHERE account_id = ? AND token_hash != ?').bind(id, ctx.sessionHash || '').run();
  }
  await logAction(env, request, ctx, { kind: 'admin', action: 'עדכון משתמש', target: a.display_name, details: changes });
  return json({ updated: true });
}

async function deleteAccount(request, env, ctx, id) {
  if (id === ctx.account.id) throw badRequest('אי אפשר למחוק את עצמך');
  const a = await env.DB.prepare('SELECT * FROM ms_accounts WHERE id = ?').bind(id).first();
  if (!a) throw notFound('המשתמש לא נמצא');
  if (a.is_admin && a.active && (await activeAdmins(env)) <= 1) throw badRequest('חייב להישאר לפחות מנהל פעיל אחד');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ms_sessions WHERE account_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ms_accounts WHERE id = ?').bind(id),
  ]);
  await logAction(env, request, ctx, { kind: 'admin', action: 'מחיקת משתמש', target: a.display_name, details: { סוג: a.rule_type === 'ip' ? `IP ${a.ip}` : 'סיסמה' } });
  return json({ deleted: true });
}

async function sendWelcome(request, env, ctx, id) {
  const a = await env.DB.prepare('SELECT * FROM ms_accounts WHERE id = ?').bind(id).first();
  if (!a) throw notFound('המשתמש לא נמצא');
  if (a.rule_type !== 'user') throw badRequest('מייל פתיחה נשלח רק למשתמש עם סיסמה');
  const b = await readJson(request).catch(() => ({}));
  const to = b.to ? normalizeEmail(b.to) : a.email;
  if (!to) throw badRequest('למשתמש אין מייל. הוסיפו מייל או הזינו כתובת לשליחה');
  const cfg = await getConfig(env);
  const m = welcomeMail(cfg, {
    displayName: a.display_name, password: b.password ? String(b.password) : '',
    email: to, google: cfg.google_enabled && !!cfg.google_client_id && to === a.email,
  }, fillTemplate);
  const res = await sendMail(cfg, m);
  await logAction(env, request, ctx, { kind: 'admin', action: 'שליחת מייל פתיחה', target: a.display_name, details: { אל: to, 'כולל סיסמה': b.password ? 'כן' : 'לא' } });
  return json(res);
}

// ===== הגדרות =====
async function saveSettings(request, env, ctx) {
  const b = await readJson(request);
  const changed = await updateSettings(env, b);
  if (changed.length) await logAction(env, request, ctx, { kind: 'admin', action: 'עדכון הגדרות', details: { שדות: changed.join(', ') } });
  return json(await publicSettings(env));
}

async function testMail(request, env, ctx) {
  const b = await readJson(request);
  const to = normalizeEmail(b.to);
  if (!validEmail(to)) throw badRequest('כתובת המייל אינה תקינה');
  const cfg = await getConfig(env);
  const res = await sendMail(cfg, {
    to, subject: 'מייל בדיקה – מסכת של שבת', title: 'מייל בדיקה',
    paragraphs: ['אם קיבלתם את המייל הזה, שליחת המיילים במערכת מסכת של שבת עובדת.'],
  });
  await logAction(env, request, ctx, { kind: 'admin', action: 'מייל בדיקה', target: to });
  return json(res);
}

async function previewWelcome(request, env) {
  const b = await readJson(request).catch(() => ({}));
  const cfg = { ...(await getConfig(env)), ...Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith('welcome_'))) };
  const m = welcomeMail(cfg, { displayName: 'ר׳ משה כהן', password: 'sod1234', email: 'office@example.com', google: cfg.google_enabled }, fillTemplate);
  return json({ subject: m.subject, html: renderMail(m), mail_ready: mailReady(cfg) });
}

// ===== יומנים =====
const page = (url) => {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  return { limit, offset };
};

async function loginLog(env, url) {
  const { limit, offset } = page(url);
  const { results } = await env.DB.prepare(
    `SELECT l.*, a.display_name FROM ms_login_log l LEFT JOIN ms_accounts a ON a.id = l.account_id
     ORDER BY l.id DESC LIMIT ? OFFSET ?`,
  ).bind(limit + 1, offset).all();
  return json({ rows: results.slice(0, limit), more: results.length > limit });
}

async function actionLog(env, url) {
  const { limit, offset } = page(url);
  const where = [];
  const vals = [];
  const kind = url.searchParams.get('kind');
  if (kind) { where.push('kind = ?'); vals.push(kind); }
  const account = parseInt(url.searchParams.get('account') || '', 10);
  if (account) { where.push('account_id = ?'); vals.push(account); }
  const q = str(url.searchParams.get('q'), 100);
  if (q) { where.push('(action LIKE ? OR target LIKE ? OR details LIKE ? OR account_name LIKE ?)'); vals.push(...Array(4).fill(`%${q}%`)); }
  const { results } = await env.DB.prepare(
    `SELECT * FROM ms_action_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).bind(...vals, limit + 1, offset).all();
  return json({ rows: results.slice(0, limit), more: results.length > limit });
}

// ===== נתב =====
export async function handleAdmin(request, env, ctx, sub, url) {
  requireAdmin(ctx);
  const m = request.method;
  const idMatch = sub.match(/^accounts\/(\d+)(\/welcome)?$/);

  if (sub === 'accounts' && m === 'GET') return listAccounts(env);
  if (sub === 'accounts' && m === 'POST') return createAccount(request, env, ctx);
  if (idMatch && !idMatch[2] && m === 'PUT') return updateAccount(request, env, ctx, Number(idMatch[1]));
  if (idMatch && !idMatch[2] && m === 'DELETE') return deleteAccount(request, env, ctx, Number(idMatch[1]));
  if (idMatch && idMatch[2] && m === 'POST') return sendWelcome(request, env, ctx, Number(idMatch[1]));
  if (sub === 'settings' && m === 'GET') return json(await publicSettings(env));
  if (sub === 'settings' && m === 'PUT') return saveSettings(request, env, ctx);
  if (sub === 'settings/test-mail' && m === 'POST') return testMail(request, env, ctx);
  if (sub === 'settings/preview' && m === 'POST') return previewWelcome(request, env);
  if (sub === 'login-log' && m === 'GET') return loginLog(env, url);
  if (sub === 'action-log' && m === 'GET') return actionLog(env, url);
  throw notFound('הכתובת לא נמצאה');
}
