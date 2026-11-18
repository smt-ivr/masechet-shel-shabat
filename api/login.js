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
// הוספת משתמש עם סיסמה (ב-Cloudflare → D1 → yemot-pay → Console):
//   INSERT INTO ms_users (match_type, match_value, name, can_receive_config, config)
//   VALUES ('pass', '<sha256 של הסיסמה>', 'שם', 1, '{"yemotToken":"..."}');

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

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function findUser(db, type, value) {
  return db
    .prepare('SELECT name, blocked, can_receive_config, config FROM ms_users WHERE match_type = ? AND match_value = ?')
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

  return json(
    {
      ip: clientIP,
      isAuthorized: !blocked,
      username: row?.name || 'לא רשום',
      canReceiveConfig,
      config: canReceiveConfig ? config : null,
    },
    blocked ? 403 : 200,
  );
}
