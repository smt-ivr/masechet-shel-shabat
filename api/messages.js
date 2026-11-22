// ============================================================
//  messages.js — הודעות מהמנהל למשתמשים, עם אישור קריאה
//  רגילה: מופיעה כהודעה קטנה וברשימת ההודעות באזור האישי.
//  חשובה: קופצת על המסך עד שהמשתמש לוחץ "קראתי".
//  seen_at = ההודעה הוצגה למשתמש · read_at = המשתמש אישר שקרא / פתח אותה
// ============================================================
import { badRequest, notFound, readJson, str, json, israelNow } from './http.js';
import { logAction } from './audit.js';

// ===== מנהל =====
export async function sendMessage(request, env, ctx) {
  const b = await readJson(request);
  const title = str(b.title, 120);
  const body = String(b.body ?? '').trim().slice(0, 4000);
  if (!title) throw badRequest('חסרה כותרת להודעה');
  if (!body) throw badRequest('חסר תוכן להודעה');
  const important = b.important ? 1 : 0;
  const audience = b.audience === 'selected' ? 'selected' : 'all';

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
    'INSERT INTO ms_messages (title, body, important, audience, created_by, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(title, body, important, audience, ctx.account.id, ctx.account.display_name, israelNow()).run();
  const id = r.meta.last_row_id;
  await env.DB.batch(recipients.map((a) => env.DB.prepare('INSERT INTO ms_message_recipients (message_id, account_id) VALUES (?, ?)').bind(id, a)));

  await logAction(env, request, ctx, {
    kind: 'admin', action: 'שליחת הודעה', target: title,
    details: { סוג: important ? 'חשובה (קופצת)' : 'רגילה', נמענים: audience === 'all' ? `כל המשתמשים (${recipients.length})` : String(recipients.length) },
  });
  return json({ id, recipients: recipients.length });
}

export async function listMessages(env) {
  const { results } = await env.DB.prepare(
    `SELECT m.*, COUNT(r.account_id) AS total, SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count,
            SUM(CASE WHEN r.seen_at IS NOT NULL THEN 1 ELSE 0 END) AS seen_count
     FROM ms_messages m LEFT JOIN ms_message_recipients r ON r.message_id = m.id
     GROUP BY m.id ORDER BY m.id DESC LIMIT 200`,
  ).all();
  return json({ messages: results.map((m) => ({ ...m, important: !!m.important, read_count: m.read_count || 0, seen_count: m.seen_count || 0 })) });
}

export async function messageDetails(env, id) {
  const m = await env.DB.prepare('SELECT * FROM ms_messages WHERE id = ?').bind(id).first();
  if (!m) throw notFound('ההודעה לא נמצאה');
  const { results } = await env.DB.prepare(
    `SELECT r.account_id, COALESCE(a.display_name, '(משתמש שנמחק)') AS name, r.seen_at, r.read_at
     FROM ms_message_recipients r LEFT JOIN ms_accounts a ON a.id = r.account_id
     WHERE r.message_id = ? ORDER BY (r.read_at IS NULL), a.display_name`,
  ).bind(id).all();
  return json({ message: { ...m, important: !!m.important }, recipients: results });
}

export async function deleteMessage(request, env, ctx, id) {
  const m = await env.DB.prepare('SELECT title FROM ms_messages WHERE id = ?').bind(id).first();
  if (!m) throw notFound('ההודעה לא נמצאה');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ms_message_recipients WHERE message_id = ?').bind(id),
    env.DB.prepare('DELETE FROM ms_messages WHERE id = ?').bind(id),
  ]);
  await logAction(env, request, ctx, { kind: 'admin', action: 'מחיקת הודעה', target: m.title });
  return json({ deleted: true });
}

// ===== משתמש =====
export async function myMessages(env, ctx) {
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.title, m.body, m.important, m.created_at, m.created_by_name, r.seen_at, r.read_at
     FROM ms_message_recipients r JOIN ms_messages m ON m.id = r.message_id
     WHERE r.account_id = ? ORDER BY (r.read_at IS NULL) DESC, m.id DESC LIMIT 50`,
  ).bind(ctx.account.id).all();
  return json({ messages: results.map((m) => ({ ...m, important: !!m.important })), unread: results.filter((m) => !m.read_at).length });
}

// ההודעות הוצגו למשתמש (נראו)
export async function markSeen(request, env, ctx) {
  const b = await readJson(request).catch(() => ({}));
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter((n) => n > 0))].slice(0, 50);
  if (!ids.length) return json({ updated: 0 });
  await env.DB.batch(ids.map((id) => env.DB.prepare('UPDATE ms_message_recipients SET seen_at = ? WHERE message_id = ? AND account_id = ? AND seen_at IS NULL').bind(israelNow(), id, ctx.account.id)));
  return json({ updated: ids.length });
}

// המשתמש אישר שקרא
export async function markRead(request, env, ctx, id) {
  const r = await env.DB.prepare(
    `SELECT m.title, r.read_at FROM ms_message_recipients r JOIN ms_messages m ON m.id = r.message_id WHERE r.message_id = ? AND r.account_id = ?`,
  ).bind(id, ctx.account.id).first();
  if (!r) throw notFound('ההודעה לא נמצאה');
  if (!r.read_at) {
    const now = israelNow();
    await env.DB.prepare('UPDATE ms_message_recipients SET read_at = ?, seen_at = COALESCE(seen_at, ?) WHERE message_id = ? AND account_id = ?')
      .bind(now, now, id, ctx.account.id).run();
    await logAction(env, request, ctx, { kind: 'auth', action: 'קריאת הודעה', target: r.title });
  }
  return json({ read: true });
}
