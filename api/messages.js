// ============================================================
//  messages.js — הודעות מהמנהל למשתמשים: אישור קריאה, מסירה ותשובות
//  רגילה: הודעה קטנה וברשימת ההודעות. חשובה: קופצת על המסך עד "קראתי".
//  target_site: new (אתר חדש) / old (אתר ישן) / both
//  read_delay: כמה שניות עד שאפשר ללחוץ "קראתי"
//  seen_at + seen_site = השרת מסר את ההודעה למשתמש המזוהה (גם אם לא לחץ "קראתי")
//  read_at + read_site = המשתמש אישר שקרא
//  תשובות: המשתמש עונה; המנהל משיב לכל משתמש בנפרד (ההודעה חוזרת להיות "לא נקראה" אצלו)
// ============================================================
import { badRequest, notFound, readJson, str, json, israelNow } from './http.js';
import { logAction, siteOf } from './audit.js';
import { getConfig } from './settings.js';
import { sendMail, mailReady, validEmail } from './mail.js';

const SITES = ['new', 'old', 'both'];
const SITE_NAMES = { new: 'אתר חדש', old: 'אתר ישן', both: 'שני האתרים' };

async function repliesFor(env, messageIds, accountId = null) {
  if (!messageIds.length) return [];
  const where = `message_id IN (${messageIds.map(() => '?').join(',')})${accountId ? ' AND account_id = ?' : ''}`;
  const { results } = await env.DB.prepare(`SELECT * FROM ms_message_replies WHERE ${where} ORDER BY id`)
    .bind(...messageIds, ...(accountId ? [accountId] : [])).all();
  return results;
}

// ===== מנהל =====
export async function sendMessage(request, env, ctx) {
  const b = await readJson(request);
  const title = str(b.title, 120);
  const body = String(b.body ?? '').trim().slice(0, 4000);
  if (!title) throw badRequest('חסרה כותרת להודעה');
  if (!body) throw badRequest('חסר תוכן להודעה');
  const important = b.important ? 1 : 0;
  const audience = b.audience === 'selected' ? 'selected' : 'all';
  const targetSite = SITES.includes(b.target_site) ? b.target_site : 'new';
  const readDelay = Math.min(Math.max(parseInt(b.read_delay, 10) || 0, 0), 300);

  let recipients;
  if (audience === 'all') {
    const { results } = await env.DB.prepare('SELECT id FROM ms_accounts WHERE active = 1').all();
    recipients = results.map((r) => r.id);
  } else {
    const ids = [...new Set((Array.isArray(b.recipients) ? b.recipients : []).map(Number).filter((n) => n > 0))];
    if (!ids.length) throw badRequest('לא נבחרו נמענים');
    const { results } = await env.DB.prepare(`SELECT id FROM ms_accounts WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    recipients = results.map((r) => r.id);
    if (!recipients.length) throw badRequest('הנמענים שנבחרו לא נמצאו');
  }

  const r = await env.DB.prepare(
    'INSERT INTO ms_messages (title, body, important, audience, target_site, read_delay, created_by, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(title, body, important, audience, targetSite, readDelay, ctx.account.id, ctx.account.display_name, israelNow()).run();
  const id = r.meta.last_row_id;
  await env.DB.batch(recipients.map((a) => env.DB.prepare('INSERT INTO ms_message_recipients (message_id, account_id) VALUES (?, ?)').bind(id, a)));

  await logAction(env, request, ctx, {
    kind: 'admin', action: 'שליחת הודעה', target: title,
    details: {
      סוג: important ? 'חשובה (קופצת)' : 'רגילה', 'מוצגת ב': SITE_NAMES[targetSite],
      'השהיה לפני קראתי': readDelay ? `${readDelay} שניות` : 'אין',
      נמענים: audience === 'all' ? `כל המשתמשים (${recipients.length})` : String(recipients.length),
    },
  });
  return json({ id, recipients: recipients.length });
}

export async function listMessages(env) {
  const { results } = await env.DB.prepare(
    `SELECT m.*, COUNT(r.account_id) AS total,
            SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count,
            SUM(CASE WHEN r.seen_at IS NOT NULL THEN 1 ELSE 0 END) AS seen_count,
            (SELECT COUNT(*) FROM ms_message_replies x WHERE x.message_id = m.id AND x.sender = 'user') AS reply_count
     FROM ms_messages m LEFT JOIN ms_message_recipients r ON r.message_id = m.id
     GROUP BY m.id ORDER BY m.id DESC LIMIT 200`,
  ).all();
  return json({
    messages: results.map((m) => ({ ...m, important: !!m.important, read_count: m.read_count || 0, seen_count: m.seen_count || 0 })),
  });
}

export async function messageDetails(env, id) {
  const m = await env.DB.prepare('SELECT * FROM ms_messages WHERE id = ?').bind(id).first();
  if (!m) throw notFound('ההודעה לא נמצאה');
  const { results } = await env.DB.prepare(
    `SELECT r.account_id, COALESCE(a.display_name, '(משתמש שנמחק)') AS name, r.seen_at, r.seen_site, r.read_at, r.read_site
     FROM ms_message_recipients r LEFT JOIN ms_accounts a ON a.id = r.account_id
     WHERE r.message_id = ? ORDER BY (r.read_at IS NULL), a.display_name`,
  ).bind(id).all();
  const replies = await repliesFor(env, [id]);
  return json({
    message: { ...m, important: !!m.important },
    recipients: results.map((r) => ({ ...r, replies: replies.filter((x) => x.account_id === r.account_id) })),
  });
}

// המנהל משיב למשתמש מסוים – ההודעה חוזרת להיות "לא נקראה" אצלו
export async function adminReply(request, env, ctx, id) {
  const b = await readJson(request);
  const accountId = Number(b.account_id);
  const body = String(b.body ?? '').trim().slice(0, 2000);
  if (!body) throw badRequest('חסר תוכן לתשובה');
  const r = await env.DB.prepare(
    'SELECT m.title, a.display_name FROM ms_message_recipients r JOIN ms_messages m ON m.id = r.message_id LEFT JOIN ms_accounts a ON a.id = r.account_id WHERE r.message_id = ? AND r.account_id = ?',
  ).bind(id, accountId).first();
  if (!r) throw notFound('המשתמש אינו מקבל של ההודעה הזו');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ms_message_replies (message_id, account_id, sender, author_name, body, site, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, accountId, 'admin', ctx.account.display_name, body, 'admin', israelNow()),
    env.DB.prepare('UPDATE ms_message_recipients SET read_at = NULL, read_site = NULL, seen_at = NULL, seen_site = NULL WHERE message_id = ? AND account_id = ?').bind(id, accountId),
  ]);
  await logAction(env, request, ctx, { kind: 'admin', action: 'תשובה להודעה', target: r.title, details: { אל: r.display_name || '', תשובה: body } });
  return json({ replied: true });
}

export async function deleteMessage(request, env, ctx, id) {
  const m = await env.DB.prepare('SELECT title FROM ms_messages WHERE id = ?').bind(id).first();
  if (!m) throw notFound('ההודעה לא נמצאה');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ms_message_replies WHERE message_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ms_message_recipients WHERE message_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ms_messages WHERE id = ?').bind(id),
  ]);
  await logAction(env, request, ctx, { kind: 'admin', action: 'מחיקת הודעה', target: m.title });
  return json({ deleted: true });
}

// ===== משתמש =====
// site = האתר שממנו מבקשים (new / old). רק הודעות שמיועדות לאתר הזה.
// כל הודעה שנשלחת כאן בפעם הראשונה נרשמת כ"נמסרה" – עם הזמן והאתר
export async function myMessages(request, env, ctx) {
  const url = new URL(request.url);
  const site = url.searchParams.get('site') === 'old' ? 'old' : 'new';
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.title, m.body, m.important, m.read_delay, m.created_at, m.created_by_name, r.seen_at, r.read_at
     FROM ms_message_recipients r JOIN ms_messages m ON m.id = r.message_id
     WHERE r.account_id = ? AND m.target_site IN (?, 'both')
     ORDER BY (r.read_at IS NULL) DESC, m.id DESC LIMIT 50`,
  ).bind(ctx.account.id, site).all();

  const now = israelNow();
  const fresh = results.filter((m) => !m.seen_at).map((m) => m.id);
  if (fresh.length) {
    await env.DB.batch(fresh.map((id) => env.DB.prepare(
      'UPDATE ms_message_recipients SET seen_at = ?, seen_site = ? WHERE message_id = ? AND account_id = ? AND seen_at IS NULL',
    ).bind(now, site, id, ctx.account.id)));
  }
  const replies = await repliesFor(env, results.map((m) => m.id), ctx.account.id);
  return json({
    messages: results.map((m) => ({
      ...m, important: !!m.important, is_new: fresh.includes(m.id),
      replies: replies.filter((x) => x.message_id === m.id).map((x) => ({ sender: x.sender, author: x.author_name, body: x.body, created_at: x.created_at })),
    })),
    unread: results.filter((m) => !m.read_at).length,
  });
}

// המשתמש אישר שקרא
export async function markRead(request, env, ctx, id) {
  const r = await env.DB.prepare(
    'SELECT m.title, r.read_at FROM ms_message_recipients r JOIN ms_messages m ON m.id = r.message_id WHERE r.message_id = ? AND r.account_id = ?',
  ).bind(id, ctx.account.id).first();
  if (!r) throw notFound('ההודעה לא נמצאה');
  if (!r.read_at) {
    const now = israelNow();
    const site = siteOf(request);
    await env.DB.prepare('UPDATE ms_message_recipients SET read_at = ?, read_site = ?, seen_at = COALESCE(seen_at, ?), seen_site = COALESCE(seen_site, ?) WHERE message_id = ? AND account_id = ?')
      .bind(now, site, now, site, id, ctx.account.id).run();
    await logAction(env, request, ctx, { kind: 'auth', action: 'קריאת הודעה', target: r.title });
  }
  return json({ read: true });
}

// המשתמש עונה על הודעה
export async function userReply(request, env, ctx, id) {
  const b = await readJson(request);
  const body = String(b.body ?? '').trim().slice(0, 2000);
  if (!body) throw badRequest('כתבו תשובה');
  const r = await env.DB.prepare(
    'SELECT m.title FROM ms_message_recipients r JOIN ms_messages m ON m.id = r.message_id WHERE r.message_id = ? AND r.account_id = ?',
  ).bind(id, ctx.account.id).first();
  if (!r) throw notFound('ההודעה לא נמצאה');
  const now = israelNow();
  const site = siteOf(request);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ms_message_replies (message_id, account_id, sender, author_name, body, site, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ctx.account.id, 'user', ctx.account.display_name, body, site, now),
    // מי שעונה – קרא
    env.DB.prepare('UPDATE ms_message_recipients SET read_at = COALESCE(read_at, ?), read_site = COALESCE(read_site, ?), seen_at = COALESCE(seen_at, ?), seen_site = COALESCE(seen_site, ?) WHERE message_id = ? AND account_id = ?')
      .bind(now, site, now, site, id, ctx.account.id),
  ]);
  const mail = await notifyAdmins(env, { title: r.title, from: ctx.account.display_name, body, site });
  await logAction(env, request, ctx, { kind: 'auth', action: 'תשובה להודעה', target: r.title, details: { תשובה: body, 'מייל למנהל': mail } });
  return json({ replied: true });
}

// מייל לכל המנהלים הפעילים על תשובה שהתקבלה. כשל בשליחה לא מפיל את התשובה עצמה
async function notifyAdmins(env, { title, from, body, site }) {
  try {
    const cfg = await getConfig(env);
    if (!mailReady(cfg)) return 'לא נשלח – המייל לא הוגדר';
    const { results } = await env.DB.prepare("SELECT email FROM ms_accounts WHERE is_admin = 1 AND active = 1 AND email IS NOT NULL AND email != ''").all();
    const to = [...new Set(results.map((a) => a.email.trim().toLowerCase()).filter(validEmail))];
    if (!to.length) return 'לא נשלח – אין למנהל כתובת מייל';
    const admin = (cfg.site_url || 'https://smti.uk/masechet/').replace(/\/?$/, '/') + 'admin';
    await Promise.all(to.map((addr) => sendMail(cfg, {
      to: addr,
      subject: `תשובה חדשה מ${from}: ${title}`,
      title: 'התקבלה תשובה להודעה',
      preheader: `${from} ענה על ההודעה "${title}"`,
      paragraphs: [body],
      details: [['מאת', from], ['על ההודעה', title], ['נשלחה מ', SITE_NAMES[site] || site], ['זמן', israelNow()]],
      button: { label: 'לצפייה ולתשובה בדף הניהול', url: admin },
    })));
    return `נשלח (${to.length})`;
  } catch (e) {
    console.error('[reply mail]', e);
    return 'השליחה נכשלה';
  }
}
