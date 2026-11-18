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
    if (path === 'client/browser-cleanup' && m === 'POST') return await browserCleanup(request, env, ctx);
    if (path.startsWith('yemot/')) return await proxyYemot(request, env, ctx, path.slice('yemot/'.length));
    if (path === 'nedarim' && m === 'GET') return await proxyNedarim(request, env, ctx);
    if (path.startsWith('admin/')) return await handleAdmin(request, env, ctx, path.slice('admin/'.length), url);

    throw notFound('הכתובת לא נמצאה');
  } catch (err) {
    return errorResponse(err);
  }
}
