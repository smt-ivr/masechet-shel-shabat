// ============================================================
//  auth.js — כניסה למערכת והרשאות (בסגנון אסיפה, מערכת אחת)
//  POST /auth/login   { username, password }  — או בלי פרטים: כניסה לפי IP מורשה
//  POST /auth/google  { credential }           — כניסה עם Google לפי המייל
//  POST /auth/logout
//  GET  /auth/me                               — המשתמש המחובר
//  GET  /auth/options                          — מזהה Google למסך הכניסה
//  החיבור נשמר בעוגייה מאובטחת (HttpOnly) ל-30 יום – הדפדפן לא שומר טוקנים.
// ============================================================
import { ApiError, unauthorized, forbidden, badRequest, readJson, str, clientIp, israelNow, json } from './http.js';
import { getConfig } from './settings.js';
import { logAction } from './audit.js';

const SESSION_DAYS = 30;
const MAX_FAILS = 8; // ניסיונות כושלים מאותה כתובת ברבע שעה
const ITERATIONS = 100000;
const COOKIE = 'ms_session';

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randomToken = () =>
  b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt = b64(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITERATIONS },
    key,
    256,
  );
  return { hash: b64(bits), salt };
}

function sameHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

export function publicAccount(a) {
  return {
    id: a.id,
    name: a.display_name,
    method: a.rule_type,
    username: a.username || null,
    email: a.email || null,
    is_admin: !!a.is_admin,
  };
}

async function loginLog(env, request, { success, method, username, accountId }) {
  try {
    await env.DB.prepare(
      'INSERT INTO ms_login_log (created_at, success, method, username, account_id, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(israelNow(), success ? 1 : 0, method, username || null, accountId || null, clientIp(request),
        (request.headers.get('user-agent') || '').slice(0, 300))
      .run();
  } catch (e) {
    console.error('login log failed:', e);
  }
}

async function checkRateLimit(env, request) {
  const since = israelNowMinus(15);
  const fails = await env.DB.prepare('SELECT COUNT(*) n FROM ms_login_log WHERE ip = ? AND success = 0 AND created_at > ?')
    .bind(clientIp(request), since)
    .first();
  if (fails.n >= MAX_FAILS) throw new ApiError(429, 'too_many_attempts', 'יותר מדי ניסיונות כניסה שגויים. נסו שוב בעוד רבע שעה');
}

function israelNowMinus(minutes) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(Date.now() - minutes * 60000));
}

function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/masechet; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function readCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}

async function openSession(env, request, account) {
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ms_sessions (token_hash, account_id, ip, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(
      await sha256Hex(token), account.id, clientIp(request),
      new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(), israelNow(),
    ),
    env.DB.prepare('UPDATE ms_accounts SET last_used_at = ? WHERE id = ?').bind(israelNow(), account.id),
    env.DB.prepare('DELETE FROM ms_sessions WHERE expires_at < ?').bind(new Date().toISOString()),
  ]);
  return json({ authorized: true, user: publicAccount(account) }, 200, {
    'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400),
  });
}

// בדיקת סיסמה; משתמש שהועבר מהמערכת הקודמת (SHA-256) משודרג אוטומטית ל-PBKDF2 בכניסה הראשונה
async function verifyPassword(env, account, password) {
  if (account.password_hash) {
    return sameHash((await hashPassword(password, account.password_salt)).hash, account.password_hash);
  }
  if (account.legacy_sha256 && sameHash(await sha256Hex(password), account.legacy_sha256)) {
    const { hash, salt } = await hashPassword(password);
    await env.DB.prepare('UPDATE ms_accounts SET password_hash = ?, password_salt = ?, legacy_sha256 = NULL WHERE id = ?')
      .bind(hash, salt, account.id)
      .run();
    return true;
  }
  return false;
}

export async function login(request, env) {
  const body = await readJson(request).catch(() => ({}));
  const username = str(body.username, 60).replace(/\s+/g, ' ');
  const password = String(body.password || '');
  const ip = clientIp(request);

  await checkRateLimit(env, request);

  let account = null;
  if (username) {
    const a = await env.DB.prepare("SELECT * FROM ms_accounts WHERE rule_type = 'user' AND username = ? AND active = 1")
      .bind(username)
      .first();
    if (a && (await verifyPassword(env, a, password))) account = a;
  } else if (ip) {
    account = await env.DB.prepare("SELECT * FROM ms_accounts WHERE rule_type = 'ip' AND ip = ? AND active = 1").bind(ip).first();
  }

  // כניסה לפי IP בלי הצלחה היא בדיקה שקטה – לא נרשמת ככישלון
  if (username || account) {
    await loginLog(env, request, { success: !!account, method: username ? 'user' : 'ip', username: username || ip, accountId: account?.id });
  }
  if (!account) {
    if (!username) return json({ authorized: false, ip });
    throw new ApiError(401, 'bad_credentials', 'שם משתמש או סיסמה שגויים');
  }
  await logAction(env, request, { account }, { kind: 'auth', action: 'כניסה', target: username ? 'שם משתמש וסיסמה' : 'IP מורשה' });
  return openSession(env, request, account);
}

export async function loginOptions(env) {
  const c = await getConfig(env);
  return json({ google_client_id: c.google_enabled && c.google_client_id ? c.google_client_id : null });
}

// כניסה עם Google: Google מאמת את החתימה (tokeninfo); בודקים שהאסימון הונפק לאתר שלנו,
// שהמייל מאומת, ושיש משתמש פעיל עם המייל הזה
export async function loginGoogle(request, env) {
  const cfg = await getConfig(env);
  if (!cfg.google_enabled || !cfg.google_client_id) throw new ApiError(403, 'google_off', 'הכניסה עם Google אינה זמינה');
  const body = await readJson(request);
  const credential = str(body.credential, 4096);
  if (!credential) throw badRequest('חסר אסימון Google');
  await checkRateLimit(env, request);

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const g = res.ok ? await res.json() : null;
  if (!g || !g.email || g.aud !== cfg.google_client_id || String(g.email_verified) !== 'true' || Number(g.exp) * 1000 < Date.now()) {
    throw new ApiError(401, 'google_failed', 'האימות מול Google נכשל. נסו שוב');
  }
  const email = normalizeEmail(g.email);
  const account = await env.DB.prepare("SELECT * FROM ms_accounts WHERE rule_type = 'user' AND email = ? AND active = 1").bind(email).first();
  await loginLog(env, request, { success: !!account, method: 'google', username: email, accountId: account?.id });
  if (!account) throw new ApiError(401, 'no_user', `אין במערכת משתמש פעיל עם המייל ${g.email}. פנו למנהל המערכת`);
  await logAction(env, request, { account }, { kind: 'auth', action: 'כניסה', target: `Google (${email})` });
  return openSession(env, request, account);
}

export async function logout(request, env) {
  const token = readCookie(request);
  let ctx = null;
  try { ctx = await authenticate(request, env); } catch { /* כבר מנותק */ }
  if (token) await env.DB.prepare('DELETE FROM ms_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  if (ctx) await logAction(env, request, ctx, { kind: 'auth', action: 'יציאה' });
  return json({ logged_out: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

// הקשר הבקשה: { account } – זורק 401 אם אין חיבור תקף
export async function authenticate(request, env) {
  const token = readCookie(request);
  if (!token) throw unauthorized();
  const row = await env.DB.prepare(
    `SELECT a.*, s.expires_at AS s_expires, s.ip AS s_ip FROM ms_sessions s JOIN ms_accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND a.active = 1`,
  ).bind(await sha256Hex(token)).first();
  if (!row || row.s_expires < new Date().toISOString()) throw unauthorized('פג תוקף הכניסה, יש להיכנס מחדש');
  // הרשאת IP תקפה רק מאותה כתובת
  if (row.rule_type === 'ip' && row.ip !== clientIp(request)) throw unauthorized('הכתובת שלכם השתנתה, יש להיכנס מחדש');
  return { account: row, sessionHash: await sha256Hex(token) };
}

export function requireAdmin(ctx) {
  if (!ctx.account.is_admin) throw forbidden('אזור זה זמין למנהל בלבד');
}

// בדיקה שקטה (לדפים שמוגשים מהשרת, למשל האתר הישן)
export async function isLoggedIn(request, env) {
  try { await authenticate(request, env); return true; } catch { return false; }
}
