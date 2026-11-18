// התחברות לאתר מסכת של שבת
// https://smti.uk/masechet/api/login
//
//   GET                  → זיהוי לפי כתובת IP
//   POST {"pass": "..."} → זיהוי לפי סיסמה (סיסמה שגויה = 401)
//   משתמש חסום           → 403
//
// הנתונים בטבלה ms_users במסד D1 ‏yemot-pay (binding: DB).
//   match_type  = 'pass' → match_value הוא SHA-256 של הסיסמה
//   match_type  = 'ip'   → match_value הוא כתובת ה-IP
//
// ניהול המשתמשים: https://smti.uk/masechet/admin (כניסה עם סיסמה של משתמש מנהל, is_admin = 1)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ===== חיבור מנהל (טוקן שנשמר בדפדפן, כדי לא להקיש סיסמה שוב) =====
const ADMIN_SESSION_DAYS = 30;

export async function createAdminSession(db, userId) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expires = Date.now() + ADMIN_SESSION_DAYS * 86400000;
  await db.prepare('DELETE FROM ms_admin_sessions WHERE expires_at < ?').bind(Date.now()).run();
  await db
    .prepare('INSERT INTO ms_admin_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expires)
    .run();
  return token;
}

async function findUser(db, type, value) {
  return db
    .prepare('SELECT id, name, blocked, can_receive_config, is_admin, config FROM ms_users WHERE match_type = ? AND match_value = ?')
    .bind(type, value)
    .first();
}

export async function handleLogin(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (!env.DB) return json({ error: 'מסד הנתונים לא מחובר' }, 500);

  const clientIP = request.headers.get('cf-connecting-ip') || 'unknown';

  let pass = null;
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (body && typeof body.pass === 'string' && body.pass.trim()) pass = body.pass.trim();
    } catch {
      // גוף ריק – ממשיכים לזיהוי לפי IP
    }
  }

  let row = null;
  try {
    if (pass) {
      row = await findUser(env.DB, 'pass', await sha256(pass));
      if (!row) return json({ error: 'סיסמה שגויה' }, 401);
    } else {
      row = await findUser(env.DB, 'ip', clientIP);
    }
  } catch (err) {
    console.error('login db error:', err);
    return json({ error: 'שגיאה בגישה למסד הנתונים' }, 500);
  }

  let config = {};
  try {
    config = row?.config ? JSON.parse(row.config) : {};
  } catch {
    config = {};
  }

  const blocked = !!row?.blocked;
  const canReceiveConfig = !!row?.can_receive_config;

  const payload = {
    ip: clientIP,
    isAuthorized: !blocked,
    username: row?.name || 'לא רשום',
    canReceiveConfig,
    config: canReceiveConfig ? config : null,
  };

  // מנהל שהתחבר בסיסמה – מקבל טוקן ניהול (כפתור "ניהול" באתר, בלי להקיש סיסמה שוב)
  if (pass && row?.is_admin && !blocked) {
    try {
      payload.isAdmin = true;
      payload.adminToken = await createAdminSession(env.DB, row.id);
    } catch (err) {
      console.error('admin session error:', err);
    }
  }

  return json(payload, blocked ? 403 : 200);
}
