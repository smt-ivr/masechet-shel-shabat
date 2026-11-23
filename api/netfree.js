// ============================================================
//  netfree.js — יומן חסימות נטפרי מכל האתר
//  הדפדפן של המשתמש מזהה חסימה (תשובה 418 של נטפרי, או קובץ / ספרייה שלא נטענו)
//  ומדווח לכאן. אפשר לדווח גם בלי כניסה (מסך הכניסה עצמו יכול להיחסם) – מוגבל לפי כתובת IP.
//  confirmed = 1: נטפרי אישר שזו חסימה. 0: קובץ חיצוני שלא נטען – כנראה נטפרי, אבל אי אפשר לוודא
// ============================================================
import { json, readJson, str, clientIp, israelNow, badRequest } from './http.js';
import { authenticate } from './auth.js';
import { logAction } from './audit.js';

const SITES = ['new', 'old', 'admin', 'login'];
const SOURCES = ['api', 'fetch', 'xhr', 'resource', 'script', 'style', 'image', 'page'];
const REASONS = { badwords: 'סינון מילים', image: 'תמונה', video: 'וידאו', domain: 'אתר לא מאושר', url: 'כתובת לא מאושרת' };
export const reasonName = (r) => REASONS[r] || r || '';

const MAX_PER_IP_10MIN = 40;

export async function reportBlock(request, env) {
  let ctx = null;
  try { ctx = await authenticate(request, env); } catch { /* גם בלי כניסה */ }
  const ip = clientIp(request);
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM ms_netfree_log WHERE ip = ? AND created_at > ?")
    .bind(ip, israelNow(-10 * 60000)).first();
  if ((recent?.n || 0) >= MAX_PER_IP_10MIN) return json({ logged: false, throttled: true });

  const b = await readJson(request).catch(() => ({}));
  const items = (Array.isArray(b.items) ? b.items : [b]).slice(0, 10);
  if (!items.length) throw badRequest('אין מה לדווח');
  const site = SITES.includes(b.site) ? b.site : 'new';
  const page = str(b.page, 200);
  const ua = str(request.headers.get('user-agent'), 200);
  const now = israelNow();
  const rows = items.map((it) => ({
    source: SOURCES.includes(it.source) ? it.source : 'fetch',
    url: str(it.url, 500),
    what: str(it.what, 300),
    reason: str(it.reason, 40),
    block_url: /^https:\/\/([a-z0-9-]+\.)*netfree\.link\//i.test(String(it.block_url || '')) ? str(it.block_url, 500) : '',
    confirmed: it.confirmed === false ? 0 : 1,
  })).filter((r) => r.url || r.what);
  if (!rows.length) return json({ logged: false });

  await env.DB.batch(rows.map((r) => env.DB.prepare(
    `INSERT INTO ms_netfree_log (created_at, account_id, account_name, ip, site, page, source, url, what, reason, block_url, confirmed, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(now, ctx?.account?.id || null, ctx?.account?.display_name || null, ip, site, page, r.source, r.url, r.what, r.reason, r.block_url, r.confirmed, ua)));

  // גם ביומן הפעולות – כדי שיופיע ברצף הפעולות של המשתמש
  for (const r of rows) {
    await logAction(env, request, ctx, {
      kind: 'netfree',
      action: r.confirmed ? 'חסימת נטפרי' : 'קובץ לא נטען (ייתכן נטפרי)',
      target: r.what || r.url,
      details: { כתובת: r.url, סיבה: reasonName(r.reason), מקור: r.source },
      status: r.confirmed ? 'נחסם בנטפרי' : 'לא נטען',
    });
  }
  return json({ logged: true, count: rows.length });
}

// ===== מנהל =====
export async function netfreeLog(env, url) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const where = [];
  const vals = [];
  const site = url.searchParams.get('site');
  if (SITES.includes(site)) { where.push('site = ?'); vals.push(site); }
  const account = url.searchParams.get('account');
  if (account === 'none') where.push('account_id IS NULL');
  else if (parseInt(account, 10)) { where.push('account_id = ?'); vals.push(parseInt(account, 10)); }
  const conf = url.searchParams.get('confirmed');
  if (conf === '1' || conf === '0') { where.push('confirmed = ?'); vals.push(Number(conf)); }
  const q = str(url.searchParams.get('q'), 100);
  if (q) { where.push('(url LIKE ? OR what LIKE ? OR account_name LIKE ? OR ip LIKE ?)'); vals.push(...Array(4).fill(`%${q}%`)); }
  const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(`SELECT * FROM ms_netfree_log ${W} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(...vals, limit + 1, offset).all();
  const sum = await env.DB.prepare(
    `SELECT SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) day, SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) week, COUNT(*) total FROM ms_netfree_log`,
  ).bind(israelNow(-86400000), israelNow(-7 * 86400000)).first();
  const { results: top } = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(what, ''), url) item, COUNT(*) n, MAX(created_at) last FROM ms_netfree_log
     WHERE created_at > ? GROUP BY item ORDER BY n DESC LIMIT 5`,
  ).bind(israelNow(-7 * 86400000)).all();
  return json({
    rows: results.slice(0, limit).map((r) => ({ ...r, reason_name: reasonName(r.reason) })),
    more: results.length > limit,
    summary: { day: sum?.day || 0, week: sum?.week || 0, total: sum?.total || 0, top },
  });
}

// מספר החסימות מאז הצפייה האחרונה של המנהל (ללשונית)
export async function netfreeCount(env, since) {
  const r = await env.DB.prepare('SELECT COUNT(*) n, MAX(id) last FROM ms_netfree_log WHERE id > ?').bind(Number(since) || 0).first();
  return json({ count: r?.n || 0, last: r?.last || 0 });
}
