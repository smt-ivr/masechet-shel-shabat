// ============================================================
//  lotteries.js — הגרלות: שמירה, עריכה, מחיקה וטעינת הזכייה בנדרים פלוס
//  כל הגרלה משויכת למבחן: exam_key = "current" (המבחן הפעיל) או הנתיב של מבחן קודם.
//  כשהמבחן הפעיל נסגר ועובר לארכיון – ההגרלות שלו עוברות איתו (relink).
//  ההגרלה עצמה מתבצעת בדפדפן מתוך נתוני המבחן; השרת שומר את התוצאות.
//  טעינה בנדרים: השרת מאתר את מספר הלקוח בנדרים לפי ת"ז ומבצע AddTlush לכל זוכה.
// ============================================================
import { json, readJson, str, badRequest, notFound, conflict, ApiError, israelNow } from './http.js';
import { requirePermission, requireAnyPermission } from './permissions.js';
import { logAction } from './audit.js';
import { getConfig } from './settings.js';

const NEDARIM_URL = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx';

// נתיב מבחן אחיד: בלי ivr2: ובלי / בהתחלה ובסוף
export function examKey(v) {
  const s = String(v ?? '').trim();
  if (!s || s === 'current') return 'current';
  return s.replace(/^(\/*ivr2:)+/i, '').replace(/^\/+|\/+$/g, '').slice(0, 300);
}

const num = (v, min, max, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};

function cleanWinner(w, i) {
  const zeout = str(w?.zeout, 20).replace(/\D/g, '');
  if (!zeout) throw badRequest(`לזוכה ${i + 1} חסר מספר זהות`);
  return {
    position: Math.round(num(w.position, 1, 999, i + 1)),
    zeout,
    name: str(w.name, 120),
    status_code: str(w.status_code, 20),
    phone: str(w.phone, 30),
    phone2: str(w.phone2, 30),
    exam_phone: str(w.exam_phone, 30),
    score: w.score === null || w.score === undefined || w.score === '' ? null : Math.round(num(w.score, -1000, 100000)),
    points: str(w.points, 20),
    exam_date: str(w.exam_date, 40),
    city: str(w.city, 60),
    prize_amount: w.prize_amount === null || w.prize_amount === undefined || w.prize_amount === '' ? null : num(w.prize_amount, 0, 100000),
    notes: str(w.notes, 300),
  };
}

// שלבי פרסים: [{ count, amount }]
function cleanTiers(v) {
  let list = v;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
  return (Array.isArray(list) ? list : []).slice(0, 20)
    .map((t) => ({ count: Math.round(num(t?.count, 0, 500)), amount: num(t?.amount, 0, 100000) }))
    .filter((t) => t.count > 0);
}

function cleanLottery(b) {
  const title = str(b.title, 120);
  if (!title) throw badRequest('חסר שם להגרלה');
  const statuses = [...new Set((Array.isArray(b.statuses) ? b.statuses : []).map((x) => str(x, 20)))].slice(0, 30);
  const exp = str(b.prize_expiration, 10);
  if (exp && !/^\d{2}\/\d{2}\/\d{4}$/.test(exp)) throw badRequest('תאריך התוקף צריך להיות בפורמט dd/MM/yyyy');
  return {
    title,
    exam_name: str(b.exam_name, 200),
    statuses: JSON.stringify(statuses),
    min_score: Math.round(num(b.min_score, 0, 1000)),
    exclude_previous: b.exclude_previous === false ? 0 : 1,
    pool_size: Math.round(num(b.pool_size, 0, 100000)),
    prize_amount: num(b.prize_amount, 0, 100000),
    prize_expiration: exp,
    prize_limited_id: str(b.prize_limited_id, 20),
    prize_comment: str(b.prize_comment, 200),
    notes: str(b.notes, 1000),
    prize_tiers: JSON.stringify(cleanTiers(b.prize_tiers)),
  };
}

async function loadLottery(env, id) {
  const l = await env.DB.prepare('SELECT * FROM ms_lotteries WHERE id = ?').bind(id).first();
  if (!l) throw notFound('ההגרלה לא נמצאה');
  const { results } = await env.DB.prepare('SELECT * FROM ms_lottery_winners WHERE lottery_id = ? ORDER BY position, id').bind(id).all();
  return { ...l, statuses: JSON.parse(l.statuses || '[]'), prize_tiers: cleanTiers(l.prize_tiers), exclude_previous: !!l.exclude_previous, winners: results };
}

const amountOf = (l, w) => (w.prize_amount !== null && w.prize_amount !== undefined ? Number(w.prize_amount) : Number(l.prize_amount)) || 0;

// ===== רשימה =====
async function listLotteries(env, url) {
  const exam = url.searchParams.get('exam');
  const where = exam ? 'WHERE l.exam_key = ?' : '';
  const { results } = await env.DB.prepare(
    `SELECT l.*, COUNT(w.id) AS winners,
            SUM(CASE WHEN w.load_status = 'ok' THEN 1 ELSE 0 END) AS loaded,
            SUM(CASE WHEN w.load_status = 'error' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN w.prize_amount IS NOT NULL THEN w.prize_amount ELSE l.prize_amount END) AS total_amount
     FROM ms_lotteries l LEFT JOIN ms_lottery_winners w ON w.lottery_id = l.id
     ${where} GROUP BY l.id ORDER BY l.id DESC LIMIT 300`,
  ).bind(...(exam ? [examKey(exam)] : [])).all();
  return json({ lotteries: results.map((l) => ({ ...l, statuses: JSON.parse(l.statuses || '[]'), prize_tiers: cleanTiers(l.prize_tiers), loaded: l.loaded || 0, failed: l.failed || 0, total_amount: l.total_amount || 0 })) });
}

// ===== יצירה =====
async function createLottery(request, env, ctx) {
  const b = await readJson(request);
  const l = cleanLottery(b);
  const key = examKey(b.exam_key);
  const winners = (Array.isArray(b.winners) ? b.winners : []).slice(0, 500).map(cleanWinner);
  if (!winners.length) throw badRequest('אין זוכים לשמירה');
  const now = israelNow();
  const r = await env.DB.prepare(
    `INSERT INTO ms_lotteries (exam_key, exam_name, title, statuses, min_score, exclude_previous, pool_size, prize_amount, prize_expiration, prize_limited_id, prize_comment, notes, prize_tiers, created_by, created_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(key, l.exam_name, l.title, l.statuses, l.min_score, l.exclude_previous, l.pool_size, l.prize_amount, l.prize_expiration, l.prize_limited_id, l.prize_comment, l.notes, l.prize_tiers, ctx.account.id, ctx.account.display_name, now).run();
  const id = r.meta.last_row_id;
  await insertWinners(env, id, winners);
  await logAction(env, request, ctx, {
    kind: 'write', action: 'שמירת הגרלה', target: l.title,
    details: { מבחן: l.exam_name || key, זוכים: winners.map((w) => `${w.name || ''} (${w.zeout})`).join(', '), 'סכום לזוכה': l.prize_amount, משתתפים: l.pool_size },
  });
  return json({ id, lottery: await loadLottery(env, id) });
}

function insertWinners(env, id, winners) {
  if (!winners.length) return null;
  return env.DB.batch(winners.map((w) => env.DB.prepare(
    `INSERT INTO ms_lottery_winners (lottery_id, position, zeout, name, status_code, phone, phone2, exam_phone, score, points, exam_date, city, prize_amount, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, w.position, w.zeout, w.name, w.status_code, w.phone, w.phone2, w.exam_phone, w.score, w.points, w.exam_date, w.city, w.prize_amount, w.notes)));
}

// ===== עריכה: פרטי ההגרלה והזוכים (זוכה שכבר נטען לא נמחק בשקט) =====
async function updateLottery(request, env, ctx, id) {
  const old = await loadLottery(env, id);
  const b = await readJson(request);
  const l = cleanLottery({ ...old, ...b, statuses: b.statuses ?? old.statuses, prize_tiers: b.prize_tiers ?? old.prize_tiers });
  const stmts = [env.DB.prepare(
    `UPDATE ms_lotteries SET title = ?, exam_name = ?, statuses = ?, min_score = ?, exclude_previous = ?, pool_size = ?, prize_amount = ?, prize_expiration = ?, prize_limited_id = ?, prize_comment = ?, notes = ?, prize_tiers = ?, updated_at = ? WHERE id = ?`,
  ).bind(l.title, l.exam_name, l.statuses, l.min_score, l.exclude_previous, l.pool_size, l.prize_amount, l.prize_expiration, l.prize_limited_id, l.prize_comment, l.notes, l.prize_tiers, israelNow(), id)];
  const changes = {};
  if (old.title !== l.title) changes['שם'] = `${old.title} ← ${l.title}`;
  if (Number(old.prize_amount) !== l.prize_amount) changes['סכום לזוכה'] = `${old.prize_amount} ← ${l.prize_amount}`;
  if (old.notes !== l.notes) changes['הערות'] = 'עודכנו';

  if (Array.isArray(b.winners)) {
    const incoming = b.winners.slice(0, 500);
    const keep = new Set(incoming.filter((w) => w.id).map((w) => Number(w.id)));
    const removed = old.winners.filter((w) => !keep.has(w.id));
    const loadedRemoved = removed.filter((w) => w.load_status === 'ok');
    if (loadedRemoved.length && !b.force) {
      throw conflict(`לזוכים הבאים כבר נטענה הזכייה בנדרים: ${loadedRemoved.map((w) => w.name || w.zeout).join(', ')}. יש לבטל קודם את הטעינה`, 'winner_loaded');
    }
    for (const w of removed) stmts.push(env.DB.prepare('DELETE FROM ms_lottery_winners WHERE id = ? AND lottery_id = ?').bind(w.id, id));
    const added = [];
    incoming.forEach((raw, i) => {
      const w = cleanWinner(raw, i);
      const prev = raw.id ? old.winners.find((x) => x.id === Number(raw.id)) : null;
      if (prev) {
        stmts.push(env.DB.prepare('UPDATE ms_lottery_winners SET position = ?, prize_amount = ?, notes = ? WHERE id = ? AND lottery_id = ?')
          .bind(w.position, w.prize_amount, w.notes, prev.id, id));
      } else {
        added.push(w);
      }
    });
    if (removed.length) changes['זוכים שהוסרו'] = removed.map((w) => `${w.name || ''} (${w.zeout})`).join(', ');
    if (added.length) changes['זוכים שנוספו'] = added.map((w) => `${w.name || ''} (${w.zeout})`).join(', ');
    await env.DB.batch(stmts);
    await insertWinners(env, id, added);
  } else {
    await env.DB.batch(stmts);
  }
  await logAction(env, request, ctx, { kind: 'write', action: 'עריכת הגרלה', target: l.title, details: Object.keys(changes).length ? changes : { שינויים: 'פרטים כלליים' } });
  return json({ lottery: await loadLottery(env, id) });
}

async function deleteLottery(request, env, ctx, id) {
  const l = await loadLottery(env, id);
  const loaded = l.winners.filter((w) => w.load_status === 'ok');
  const url = new URL(request.url);
  if (loaded.length && url.searchParams.get('force') !== '1') {
    throw conflict(`ל-${loaded.length} זוכים כבר נטענה הזכייה בנדרים. מחיקת ההגרלה לא מבטלת את הטעינה`, 'has_loaded');
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ms_lottery_winners WHERE lottery_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ms_lotteries WHERE id = ?').bind(id),
  ]);
  await logAction(env, request, ctx, { kind: 'write', action: 'מחיקת הגרלה', target: l.title, details: { מבחן: l.exam_name || l.exam_key, זוכים: l.winners.length, 'כבר נטענו': loaded.length } });
  return json({ deleted: true });
}

// ===== נדרים פלוס =====
// env.NEDARIM_TEST_URL – רק לבדיקות מקומיות (שרת נדרים מדומה). בשרת האמיתי לא מוגדר
async function nedarim(cfg, params, env) {
  const p = new URLSearchParams({ ...params, MosadId: cfg.nedarim_mosad_id, ApiPassword: cfg.nedarim_api_password });
  const res = await fetch(`${(env && env.NEDARIM_TEST_URL) || NEDARIM_URL}?${p}`);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { Result: 'Error', Message: text.slice(0, 200) || `שגיאה ${res.status}` }; }
}

function nedarimReady(cfg) {
  if (!cfg.nedarim_mosad_id || !cfg.nedarim_api_password) {
    throw new ApiError(503, 'nedarim_not_configured', 'פרטי נדרים פלוס לא הוגדרו. מנהל המערכת צריך להגדיר אותם בדף הניהול');
  }
}

const tlushIdOf = (r) => String(r?.TlushId ?? r?.TlushID ?? r?.ID ?? r?.Id ?? r?.id ?? (typeof r?.Message === 'string' && /^\d+$/.test(r.Message) ? r.Message : '') ?? '');

// טעינה לכל הזוכים (או לנבחרים). מי שכבר נטען – מדולג, כך שאין טעינה כפולה
async function loadPrizes(request, env, ctx, id) {
  const l = await loadLottery(env, id);
  const b = await readJson(request).catch(() => ({}));
  const only = Array.isArray(b.winner_ids) && b.winner_ids.length ? new Set(b.winner_ids.map(Number)) : null;
  const targets = l.winners.filter((w) => w.load_status !== 'ok' && (!only || only.has(w.id)));
  if (!targets.length) throw badRequest('אין זוכים שממתינים לטעינה');
  const cfg = await getConfig(env);
  nedarimReady(cfg);

  const table = await nedarim(cfg, { Action: 'GetClient_Table' }, env);
  if (table.Result !== 'OK' || !Array.isArray(table.data)) throw new ApiError(502, 'nedarim_failed', `לא הצלחנו למשוך את רשימת הלקוחות מנדרים: ${table.Message || 'שגיאה'}`);
  const byZeout = {};
  for (const c of table.data) if (c && c.Zeout) byZeout[String(c.Zeout).replace(/\D/g, '')] = c;

  const comment = l.prize_comment || `זכייה בהגרלה: ${l.title}${l.exam_name ? ` – ${l.exam_name}` : ''}`;
  const results = [];
  for (const w of targets) {
    const amount = amountOf(l, w);
    const client = byZeout[w.zeout];
    let status = 'error';
    let message = '';
    let tlush = '';
    if (!(amount > 0)) message = 'לא הוגדר סכום לזכייה';
    else if (!client) message = 'אין חשבון בנדרים פלוס לתעודת הזהות הזו';
    else {
      const params = { Action: 'AddTlush', ClientId: String(client.ClientId), Amount: String(amount), Comments: comment };
      if (l.prize_expiration) params.Expiration = l.prize_expiration;
      if (l.prize_limited_id) params.LimitedId = l.prize_limited_id;
      try {
        const r = await nedarim(cfg, params, env);
        if (r.Result === 'OK') { status = 'ok'; tlush = tlushIdOf(r); message = 'נטען בהצלחה'; } else message = r.Message || 'הטעינה נכשלה';
      } catch (e) { message = `שגיאת תקשורת: ${e.message}`; }
    }
    const now = israelNow();
    await env.DB.prepare(
      'UPDATE ms_lottery_winners SET load_status = ?, load_message = ?, tlush_id = ?, nedarim_client_id = ?, loaded_at = ?, loaded_by = ? WHERE id = ?',
    ).bind(status, message, tlush || null, client ? String(client.ClientId) : null, now, ctx.account.display_name, w.id).run();
    results.push({ id: w.id, zeout: w.zeout, name: w.name, amount, status, message, tlush_id: tlush, balance: client?.Ytra || '' });
    await logAction(env, request, ctx, {
      kind: 'write', action: 'נדרים: טעינת זכייה בהגרלה', target: `${w.name || ''} (${w.zeout})`,
      details: { הגרלה: l.title, סכום: amount, 'מספר לקוח בנדרים': client?.ClientId || '', טעינה: tlush || '' }, status: status === 'ok' ? 'OK' : `נכשל: ${message}`,
    });
  }
  const ok = results.filter((r) => r.status === 'ok');
  return json({
    results,
    summary: { ok: ok.length, failed: results.length - ok.length, total: ok.reduce((s, r) => s + r.amount, 0) },
    lottery: await loadLottery(env, id),
  });
}

// ביטול טעינה של זוכה אחד (פריקת הטעינה בנדרים)
async function unloadWinner(request, env, ctx, id, wid) {
  const l = await loadLottery(env, id);
  const w = l.winners.find((x) => x.id === wid);
  if (!w) throw notFound('הזוכה לא נמצא');
  if (w.load_status !== 'ok') throw badRequest('לזוכה הזה לא נטענה זכייה');
  if (!w.tlush_id) throw badRequest('אין מספר טעינה שמור – יש לבטל את הטעינה ידנית בכרטיס הלקוח');
  const cfg = await getConfig(env);
  nedarimReady(cfg);
  const r = await nedarim(cfg, { Action: 'PrikatTlush', TlushId: w.tlush_id }, env);
  const ok = r.Result === 'OK';
  if (ok) {
    await env.DB.prepare("UPDATE ms_lottery_winners SET load_status = 'cancelled', load_message = ?, loaded_at = ?, loaded_by = ? WHERE id = ?")
      .bind('הטעינה בוטלה', israelNow(), ctx.account.display_name, wid).run();
  }
  await logAction(env, request, ctx, {
    kind: 'write', action: 'נדרים: ביטול טעינת זכייה', target: `${w.name || ''} (${w.zeout})`,
    details: { הגרלה: l.title, טעינה: w.tlush_id }, status: ok ? 'OK' : `נכשל: ${r.Message || ''}`,
  });
  if (!ok) throw new ApiError(502, 'nedarim_failed', `ביטול הטעינה נכשל: ${r.Message || 'שגיאה'}`);
  return json({ lottery: await loadLottery(env, id) });
}

// המבחן הפעיל נסגר → ההגרלות שלו עוברות למבחן בארכיון
async function relink(request, env, ctx) {
  const b = await readJson(request);
  const to = examKey(b.to);
  if (to === 'current') throw badRequest('חסר נתיב המבחן החדש');
  const r = await env.DB.prepare("UPDATE ms_lotteries SET exam_key = ?, exam_name = ?, updated_at = ? WHERE exam_key = 'current'")
    .bind(to, str(b.name, 200), israelNow()).run();
  const n = r.meta.changes || 0;
  if (n) await logAction(env, request, ctx, { kind: 'write', action: 'שיוך הגרלות למבחן שנסגר', target: str(b.name, 200), details: { הגרלות: n } });
  return json({ moved: n });
}

// ===== תבניות להגרלה השבועית =====
function cleanTemplateItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 30).map((it) => ({
    title: str(it?.title, 120),
    statuses: [...new Set((Array.isArray(it?.statuses) ? it.statuses : []).map((x) => str(x, 20)))].slice(0, 30),
    min_score: Math.round(num(it?.min_score, 0, 1000)),
    only_nedarim: !!it?.only_nedarim,
    tiers: cleanTiers(it?.tiers),
  })).filter((it) => it.title && it.tiers.length);
}

async function listTemplates(env) {
  const { results } = await env.DB.prepare('SELECT * FROM ms_lottery_templates ORDER BY name').all();
  return json({ templates: results.map((t) => ({ ...t, items: JSON.parse(t.items || '[]'), settings: JSON.parse(t.settings || '{}') })) });
}

async function saveTemplate(request, env, ctx, id) {
  const b = await readJson(request);
  const name = str(b.name, 80);
  if (!name) throw badRequest('חסר שם לתבנית');
  const items = cleanTemplateItems(b.items);
  if (!items.length) throw badRequest('אין בתבנית הגרלות (לכל הגרלה צריך שם וכמות זוכים)');
  const settings = JSON.stringify({ exclude_previous: b.settings?.exclude_previous !== false, prize_limited_id: str(b.settings?.prize_limited_id, 20), prize_comment: str(b.settings?.prize_comment, 200), expiration_days: Math.round(num(b.settings?.expiration_days, 0, 3650)) });
  const now = israelNow();
  if (id) {
    const r = await env.DB.prepare('UPDATE ms_lottery_templates SET name = ?, items = ?, settings = ?, updated_at = ? WHERE id = ?').bind(name, JSON.stringify(items), settings, now, id).run();
    if (!r.meta.changes) throw notFound('התבנית לא נמצאה');
  } else {
    id = (await env.DB.prepare('INSERT INTO ms_lottery_templates (name, items, settings, created_by_name, created_at) VALUES (?, ?, ?, ?, ?)').bind(name, JSON.stringify(items), settings, ctx.account.display_name, now).run()).meta.last_row_id;
  }
  await logAction(env, request, ctx, { kind: 'write', action: 'שמירת תבנית הגרלות', target: name, details: { הגרלות: items.map((i) => `${i.title}: ${i.tiers.map((t) => `${t.count}×${t.amount}`).join(' + ')}`).join(' · ') } });
  return json({ id });
}

async function deleteTemplate(request, env, ctx, id) {
  const t = await env.DB.prepare('SELECT name FROM ms_lottery_templates WHERE id = ?').bind(id).first();
  if (!t) throw notFound('התבנית לא נמצאה');
  await env.DB.prepare('DELETE FROM ms_lottery_templates WHERE id = ?').bind(id).run();
  await logAction(env, request, ctx, { kind: 'write', action: 'מחיקת תבנית הגרלות', target: t.name });
  return json({ deleted: true });
}

export async function handleLotteries(request, env, ctx, sub, url) {
  const m = request.method;
  const tm = sub.match(/^templates(?:\/(\d+))?$/);
  if (tm) {
    if (m === 'GET' && !tm[1]) { requireAnyPermission(ctx, ['exams_view', 'exams_manage']); return listTemplates(env); }
    requirePermission(ctx, 'exams_manage');
    if (m === 'POST' && !tm[1]) return saveTemplate(request, env, ctx, null);
    if (m === 'PUT' && tm[1]) return saveTemplate(request, env, ctx, Number(tm[1]));
    if (m === 'DELETE' && tm[1]) return deleteTemplate(request, env, ctx, Number(tm[1]));
  }
  const idm = sub.match(/^(\d+)$/);
  const loadm = sub.match(/^(\d+)\/load$/);
  const unm = sub.match(/^(\d+)\/winners\/(\d+)\/unload$/);
  if (!sub && m === 'GET') { requireAnyPermission(ctx, ['exams_view', 'exams_manage']); return listLotteries(env, url); }
  if (idm && m === 'GET') { requireAnyPermission(ctx, ['exams_view', 'exams_manage']); return json({ lottery: await loadLottery(env, Number(idm[1])) }); }
  if (!sub && m === 'POST') { requirePermission(ctx, 'exams_manage'); return createLottery(request, env, ctx); }
  if (sub === 'relink' && m === 'POST') { requirePermission(ctx, 'exams_manage'); return relink(request, env, ctx); }
  if (idm && m === 'PUT') { requirePermission(ctx, 'exams_manage'); return updateLottery(request, env, ctx, Number(idm[1])); }
  if (idm && m === 'DELETE') { requirePermission(ctx, 'exams_manage'); return deleteLottery(request, env, ctx, Number(idm[1])); }
  if (loadm && m === 'POST') { requirePermission(ctx, 'nedarim_charge'); return loadPrizes(request, env, ctx, Number(loadm[1])); }
  if (unm && m === 'POST') { requirePermission(ctx, 'nedarim_charge'); return unloadWinner(request, env, ctx, Number(unm[1]), Number(unm[2])); }
  throw notFound('הכתובת לא נמצאה');
}
