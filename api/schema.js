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
  {
    // כניסה בסיסמה בלבד: הסיסמה מזהה את המשתמש, ולכן היא ייחודית
    version: 2,
    name: 'password_only_login',
    sql: [
      `CREATE UNIQUE INDEX IF NOT EXISTS ms_accounts_password ON ms_accounts(password_hash) WHERE rule_type = 'user' AND password_hash IS NOT NULL`,
    ],
  },
  {
    // משתמש = שם ומייל. בתוכו: סיסמה, כתובות IP (כמה שרוצים) והרשאות.
    // הודעה בראש האתר: סגירה נשמרת בחשבון המשתמש
    version: 3,
    name: 'users_ips_permissions_announcement',
    sql: [
      `CREATE TABLE IF NOT EXISTS ms_user_ips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        ip TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ms_user_ips_ip ON ms_user_ips(ip)`,
      `ALTER TABLE ms_accounts ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE ms_accounts ADD COLUMN announcement_dismissed TEXT`,
      `ALTER TABLE ms_sessions ADD COLUMN method TEXT`,
      // משתמשי IP קיימים → משתמש רגיל עם כתובת IP
      `INSERT INTO ms_user_ips (account_id, ip, created_at) SELECT id, ip, created_at FROM ms_accounts WHERE rule_type = 'ip' AND ip IS NOT NULL`,
      `DELETE FROM ms_sessions WHERE account_id IN (SELECT id FROM ms_accounts WHERE rule_type = 'ip')`,
      `UPDATE ms_accounts SET rule_type = 'user', ip = NULL WHERE rule_type = 'ip'`,
      // כל המשתמשים הקיימים ממשיכים לעבוד כרגיל – כל ההרשאות באתר
      `UPDATE ms_accounts SET permissions = '["clients_view","clients_edit","nedarim_charge","exams_view","exams_manage","old_site"]'`,
    ],
  },
  {
    // סינון מילים: "הצג טקסט מלא" נשמר לחיבור (מחשב) מסוים
    version: 4,
    name: 'session_unfiltered',
    sql: [`ALTER TABLE ms_sessions ADD COLUMN unfiltered INTEGER NOT NULL DEFAULT 0`],
  },
  {
    // יומן: מאיזה אתר בוצעה הפעולה. הודעות למשתמשים עם אישור קריאה
    version: 5,
    name: 'log_site_and_messages',
    sql: [
      `ALTER TABLE ms_action_log ADD COLUMN site TEXT`,
      `CREATE TABLE IF NOT EXISTS ms_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        important INTEGER NOT NULL DEFAULT 0,
        audience TEXT NOT NULL DEFAULT 'all',
        created_by INTEGER,
        created_by_name TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ms_message_recipients (
        message_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        seen_at TEXT,
        read_at TEXT,
        PRIMARY KEY (message_id, account_id)
      )`,
      `CREATE INDEX IF NOT EXISTS ms_message_recipients_account ON ms_message_recipients(account_id, read_at)`,
    ],
  },
  {
    // סינון המילים הוסר – העמודה כבר לא בשימוש
    version: 6,
    name: 'drop_session_unfiltered',
    sql: [`ALTER TABLE ms_sessions DROP COLUMN unfiltered`],
  },
  {
    // הודעות: באיזה אתר מוצגות, השהיה לפני "קראתי", מאיזה אתר נמסרה ונקראה, ותשובות
    version: 7,
    name: 'messages_site_delay_replies',
    sql: [
      `ALTER TABLE ms_messages ADD COLUMN target_site TEXT NOT NULL DEFAULT 'new'`,
      `ALTER TABLE ms_messages ADD COLUMN read_delay INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE ms_message_recipients ADD COLUMN seen_site TEXT`,
      `ALTER TABLE ms_message_recipients ADD COLUMN read_site TEXT`,
      `CREATE TABLE IF NOT EXISTS ms_message_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        sender TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
        author_name TEXT,
        body TEXT NOT NULL,
        site TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ms_message_replies_msg ON ms_message_replies(message_id, account_id)`,
    ],
  },
  {
    // יומן חסימות נטפרי מכל האתר (חדש, ישן, ניהול, מסך כניסה) – כולל קבצים וספריות שנחסמו
    version: 8,
    name: 'netfree_log',
    sql: [
      `CREATE TABLE IF NOT EXISTS ms_netfree_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        account_id INTEGER,
        account_name TEXT,
        ip TEXT,
        site TEXT,
        page TEXT,
        source TEXT,
        url TEXT,
        what TEXT,
        reason TEXT,
        block_url TEXT,
        confirmed INTEGER NOT NULL DEFAULT 1,
        user_agent TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS ms_netfree_log_time ON ms_netfree_log(created_at)`,
      `CREATE INDEX IF NOT EXISTS ms_netfree_log_ip ON ms_netfree_log(ip, created_at)`,
      // חסימות שכבר נרשמו ביומן הפעולות עוברות גם ליומן החדש
      `INSERT INTO ms_netfree_log (created_at, account_id, account_name, ip, site, source, url, what, reason, confirmed)
       SELECT created_at, account_id, account_name, ip, site, 'api', json_extract(details, '$.פעולה'), target, json_extract(details, '$.סיבה'), 1
       FROM ms_action_log WHERE kind = 'netfree'`,
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
