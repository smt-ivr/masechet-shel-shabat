// ============================================================
//  schema.js — טבלאות מסכת של שבת (קידומת ms_) במסד D1 המשותף yemot-pay
//  נוצרות / מתעדכנות אוטומטית בבקשה הראשונה (כמו migrate.js באסיפה).
// ============================================================

const MIGRATIONS = [
  {
    version: 1,
    name: 'auth_logs_settings',
    sql: [
      // משתמשים: שם משתמש + סיסמה, או כתובת IP מורשית
      `CREATE TABLE IF NOT EXISTS ms_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_type TEXT NOT NULL CHECK (rule_type IN ('user', 'ip')),
        username TEXT COLLATE NOCASE,
        email TEXT COLLATE NOCASE,
        password_hash TEXT,
        password_salt TEXT,
        legacy_sha256 TEXT,
        ip TEXT,
        display_name TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ms_accounts_username ON ms_accounts(username) WHERE rule_type = 'user'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ms_accounts_email ON ms_accounts(email) WHERE email IS NOT NULL AND email != ''`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ms_accounts_ip ON ms_accounts(ip) WHERE rule_type = 'ip'`,

      // חיבורים פעילים (עוגייה). נשמר רק גיבוב של הטוקן
      `CREATE TABLE IF NOT EXISTS ms_sessions (
        token_hash TEXT PRIMARY KEY,
        account_id INTEGER NOT NULL,
        ip TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,

      // יומן כניסות
      `CREATE TABLE IF NOT EXISTS ms_login_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        success INTEGER NOT NULL,
        method TEXT,
        username TEXT,
        account_id INTEGER,
        ip TEXT,
        user_agent TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS ms_login_log_ip ON ms_login_log(ip, created_at)`,

      // יומן פעולות – כל פעולה במערכת
      `CREATE TABLE IF NOT EXISTS ms_action_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        account_id INTEGER,
        account_name TEXT,
        ip TEXT,
        kind TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        status TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS ms_action_log_time ON ms_action_log(created_at)`,

      // הגדרות המערכת: טוקנים, מפתחות ופרטי מייל – נערכות בדף הניהול
      `CREATE TABLE IF NOT EXISTS ms_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
];

let ready = null;

async function run(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ms_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  ).run();
  const { results } = await env.DB.prepare('SELECT version FROM ms_schema_migrations').all();
  const done = new Set(results.map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await env.DB.batch([
      ...m.sql.map((s) => env.DB.prepare(s)),
      env.DB.prepare('INSERT INTO ms_schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').bind(
        m.version, m.name, new Date().toISOString(),
      ),
    ]);
  }
}

export function ensureSchema(env) {
  if (!ready) ready = run(env).catch((e) => { ready = null; throw e; });
  return ready;
}
