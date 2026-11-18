// ניהול משתמשי האתר – רק למשתמש עם is_admin = 1 (כניסה עם הסיסמה שלו)
//
// דף הניהול:  https://smti.uk/masechet/admin
// API:        https://smti.uk/masechet/api/admin/...
//   POST   /check            – בדיקת סיסמת מנהל
//   GET    /users            – רשימת משתמשים
//   POST   /users            – הוספת משתמש
//   PUT    /users?id=N       – עדכון משתמש
//   DELETE /users?id=N       – מחיקת משתמש
// סיסמת המנהל נשלחת בכל בקשה בכותרת X-Admin-Pass.

import { sha256 } from './login.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const CONFIG_KEYS = ['yemotUsername', 'yemotPassword', 'yemotToken', 'nedarimMosadId', 'nedarimPassword', 'forceUpdate'];

async function getAdmin(request, env) {
  const pass = (request.headers.get('X-Admin-Pass') || '').trim();
  if (!pass) return null;
  return env.DB
    .prepare("SELECT id, name FROM ms_users WHERE match_type = 'pass' AND match_value = ? AND is_admin = 1 AND blocked = 0")
    .bind(await sha256(pass))
    .first();
}

const toUser = (r) => {
  let config = {};
  try { config = JSON.parse(r.config || '{}'); } catch { config = {}; }
  return {
    id: r.id,
    type: r.match_type,
    ip: r.match_type === 'ip' ? r.match_value : null,
    name: r.name || '',
    blocked: !!r.blocked,
    canReceiveConfig: !!r.can_receive_config,
    isAdmin: !!r.is_admin,
    config,
    createdAt: r.created_at,
  };
};

// ניקוי ההגדרות – רק מפתחות מוכרים, ערכים כטקסט, בלי ריקים
function cleanConfig(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of CONFIG_KEYS) {
    if (input[k] === undefined || input[k] === null) continue;
    const v = k === 'forceUpdate' ? (input[k] === true || input[k] === 'true' ? 'true' : '') : String(input[k]).trim();
    if (v !== '') out[k] = v;
  }
  return out;
}

const isIp = (v) =>
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v) || // IPv4
  (v.includes(':') && /^[0-9a-fA-F:]{2,45}$/.test(v)); // IPv6

async function adminCount(db) {
  const r = await db.prepare("SELECT count(*) AS n FROM ms_users WHERE is_admin = 1 AND blocked = 0 AND match_type = 'pass'").first();
  return r?.n || 0;
}

export async function handleAdminApi(request, env, path) {
  if (!env.DB) return json({ error: 'מסד הנתונים לא מחובר' }, 500);

  const admin = await getAdmin(request, env);
  if (!admin) {
    await new Promise((r) => setTimeout(r, 800)); // האטה מול ניחוש סיסמאות
    return json({ error: 'סיסמת מנהל שגויה' }, 401);
  }

  const url = new URL(request.url);
  const db = env.DB;

  try {
    if (path === 'check') {
      return json({ ok: true, name: admin.name, ip: request.headers.get('cf-connecting-ip') || '' });
    }

    if (path !== 'users') return json({ error: 'לא נמצא' }, 404);

    // ----- רשימה -----
    if (request.method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM ms_users ORDER BY is_admin DESC, name').all();
      return json({ users: results.map(toUser), me: admin.id });
    }

    const body = request.method === 'DELETE' ? {} : await request.json().catch(() => ({}));
    const id = Number(url.searchParams.get('id'));

    // ----- הוספה -----
    if (request.method === 'POST') {
      const type = body.type === 'ip' ? 'ip' : 'pass';
      let value;
      if (type === 'ip') {
        value = String(body.ip || '').trim();
        if (!isIp(value)) return json({ error: 'כתובת IP לא תקינה' }, 400);
      } else {
        const pass = String(body.password || '').trim();
        if (pass.length < 4) return json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' }, 400);
        value = await sha256(pass);
      }
      const name = String(body.name || '').trim();
      if (!name) return json({ error: 'חסר שם' }, 400);

      const exists = await db.prepare('SELECT id FROM ms_users WHERE match_type = ? AND match_value = ?').bind(type, value).first();
      if (exists) return json({ error: type === 'ip' ? 'כתובת ה-IP כבר קיימת' : 'הסיסמה כבר בשימוש אצל משתמש אחר' }, 409);

      await db
        .prepare('INSERT INTO ms_users (match_type, match_value, name, blocked, can_receive_config, is_admin, config) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(type, value, name, body.blocked ? 1 : 0, body.canReceiveConfig ? 1 : 0, type === 'pass' && body.isAdmin ? 1 : 0, JSON.stringify(cleanConfig(body.config)))
        .run();
      return json({ ok: true });
    }

    if (!id) return json({ error: 'חסר מזהה משתמש' }, 400);
    const current = await db.prepare('SELECT * FROM ms_users WHERE id = ?').bind(id).first();
    if (!current) return json({ error: 'המשתמש לא נמצא' }, 404);

    // ----- מחיקה -----
    if (request.method === 'DELETE') {
      if (id === admin.id) return json({ error: 'אי אפשר למחוק את עצמך' }, 400);
      await db.prepare('DELETE FROM ms_users WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // ----- עדכון -----
    if (request.method === 'PUT') {
      let value = current.match_value;
      if (current.match_type === 'ip' && body.ip !== undefined) {
        value = String(body.ip).trim();
        if (!isIp(value)) return json({ error: 'כתובת IP לא תקינה' }, 400);
      }
      if (current.match_type === 'pass' && body.password) {
        const pass = String(body.password).trim();
        if (pass.length < 4) return json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' }, 400);
        value = await sha256(pass);
      }
      if (value !== current.match_value) {
        const clash = await db.prepare('SELECT id FROM ms_users WHERE match_type = ? AND match_value = ? AND id != ?').bind(current.match_type, value, id).first();
        if (clash) return json({ error: current.match_type === 'ip' ? 'כתובת ה-IP כבר קיימת' : 'הסיסמה כבר בשימוש אצל משתמש אחר' }, 409);
      }

      const name = body.name !== undefined ? String(body.name).trim() : current.name;
      if (!name) return json({ error: 'חסר שם' }, 400);
      const blocked = body.blocked !== undefined ? (body.blocked ? 1 : 0) : current.blocked;
      const isAdmin = current.match_type === 'pass' && body.isAdmin !== undefined ? (body.isAdmin ? 1 : 0) : current.is_admin;

      // לא משאירים את המערכת בלי מנהל פעיל
      if (current.is_admin && (!isAdmin || blocked) && (await adminCount(db)) <= 1) {
        return json({ error: 'חייב להישאר לפחות מנהל פעיל אחד' }, 400);
      }

      await db
        .prepare('UPDATE ms_users SET match_value = ?, name = ?, blocked = ?, can_receive_config = ?, is_admin = ?, config = ? WHERE id = ?')
        .bind(
          value,
          name,
          blocked,
          body.canReceiveConfig !== undefined ? (body.canReceiveConfig ? 1 : 0) : current.can_receive_config,
          isAdmin,
          body.config !== undefined ? JSON.stringify(cleanConfig(body.config)) : current.config,
          id,
        )
        .run();
      return json({ ok: true });
    }

    return json({ error: 'פעולה לא נתמכת' }, 405);
  } catch (err) {
    console.error('admin api error:', err);
    return json({ error: 'שגיאת שרת' }, 500);
  }
}
