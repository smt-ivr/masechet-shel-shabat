// ============================================================
//  router.js — כל ה-API של מסכת של שבת: /masechet/api/...
//  ללא כניסה:  auth/login, auth/google, auth/options, auth/me, auth/logout
//  עם כניסה:   status, client/browser-cleanup, yemot/<Method>, nedarim
//  מנהל בלבד:  admin/...
// ============================================================
import { json, errorResponse, notFound, readJson, str, clientIp } from './http.js';
import { ensureSchema } from './schema.js';
import { login, loginGoogle, loginOptions, logout, authenticate, publicAccount } from './auth.js';
import { proxyYemot, proxyNedarim, connectionStatus } from './proxy.js';
import { handleAdmin } from './admin.js';
import { logAction } from './audit.js';
import { getConfig } from './settings.js';
import { getPaths } from './yemot-paths.js';
import { sha256Hex } from './auth.js';

// מפתחות שהאתר הישן שמר בדפדפן (טוקנים וסיסמאות) – נמחקים ומדווחים
const KNOWN_BROWSER_KEYS = [
  'yemotToken', 'yemotUsername', 'yemotPassword', 'nedarimMosadId', 'nedarimPassword',
  'msAdminToken', 'ymgr_apiToken', 'ymgr_systemNumber', 'ymgr_password',
];

async function browserCleanup(request, env, ctx) {
  const b = await readJson(request).catch(() => ({}));
  const found = (Array.isArray(b.found) ? b.found : [])
    .filter((k) => KNOWN_BROWSER_KEYS.includes(k))
    .slice(0, 20);
  await logAction(env, request, ctx, {
    kind: 'cleanup',
    action: 'ניקוי דפדפן',
    target: found.length ? `נמצאו ונמחקו ${found.length} פריטים` : 'לא נמצאו נתונים שמורים',
    details: found.length ? { 'פריטים שנמחקו': found.join(', '), דפדפן: str(request.headers.get('user-agent'), 150) } : null,
    status: found.length ? 'נמחק' : 'נקי',
  });
  return json({ logged: true });
}

// ===== הודעה בראש האתר: הטקסט בהגדרות; סגירה נשמרת בחשבון המשתמש (לא בדפדפן) =====
// מזהה ההודעה = גיבוב של הטקסט, כך ששינוי הטקסט מציג אותה מחדש לכולם
async function announcement(request, env, ctx, action) {
  const cfg = await getConfig(env);
  const id = (await sha256Hex(cfg.announcement_text || '')).slice(0, 16);
  if (action === 'dismiss' || action === 'restore') {
    await env.DB.prepare('UPDATE ms_accounts SET announcement_dismissed = ? WHERE id = ?')
      .bind(action === 'dismiss' ? id : null, ctx.account.id).run();
    await logAction(env, request, ctx, { kind: 'auth', action: action === 'dismiss' ? 'סגירת הודעה' : 'הצגת הודעה מחדש', target: cfg.announcement_text });
    return json({ show: action === 'restore' && cfg.announcement_enabled, text: cfg.announcement_text });
  }
  return json({ show: cfg.announcement_enabled && !!cfg.announcement_text && ctx.account.announcement_dismissed !== id, text: cfg.announcement_text });
}

export async function handleApi(request, env, path) {
  try {
    if (!env.DB) throw new Error('D1 binding DB is missing');
    await ensureSchema(env);
    const url = new URL(request.url);
    const m = request.method;

    if (path === 'auth/login' && m === 'POST') return await login(request, env);
    if (path === 'auth/google' && m === 'POST') return await loginGoogle(request, env);
    if (path === 'auth/options' && m === 'GET') return await loginOptions(env);
    if (path === 'auth/logout' && m === 'POST') return await logout(request, env);

    const ctx = await authenticate(request, env);

    if (path === 'auth/me' && m === 'GET') return json({ user: publicAccount(ctx.account), ip: clientIp(request) });
    if (path === 'status' && m === 'GET') return json(await connectionStatus(env));
    // הכתובות בימות שהאתר עובד איתן (נערכות בהגדרות הניהול)
    if (path === 'config' && m === 'GET') return json({ paths: getPaths((await getConfig(env)).yemot_paths) });
    if (path === 'announcement' && m === 'GET') return await announcement(request, env, ctx);
    if (path === 'announcement/dismiss' && m === 'POST') return await announcement(request, env, ctx, 'dismiss');
    if (path === 'announcement/restore' && m === 'POST') return await announcement(request, env, ctx, 'restore');
    if (path === 'client/browser-cleanup' && m === 'POST') return await browserCleanup(request, env, ctx);
    // חסימה של נטפרי בדפדפן המשתמש – נרשמת ביומן כדי שהמנהל יראה מה נחסם
    if (path === 'client/netfree-block' && m === 'POST') {
      const b = await readJson(request).catch(() => ({}));
      await logAction(env, request, ctx, {
        kind: 'netfree', action: 'חסימת נטפרי', target: str(b.target, 200) || str(b.action, 60),
        details: { פעולה: str(b.action, 60), סיבה: str(b.reason, 40) === 'badwords' ? 'סינון מילים' : str(b.reason, 40) },
        status: 'נחסם בנטפרי',
      });
      return json({ logged: true });
    }
    if (path.startsWith('yemot/')) return await proxyYemot(request, env, ctx, path.slice('yemot/'.length));
    if (path === 'nedarim' && m === 'GET') return await proxyNedarim(request, env, ctx);
    if (path.startsWith('admin/')) return await handleAdmin(request, env, ctx, path.slice('admin/'.length), url);

    throw notFound('הכתובת לא נמצאה');
  } catch (err) {
    return errorResponse(err);
  }
}
