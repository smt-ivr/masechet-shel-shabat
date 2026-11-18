// ============================================================
//  proxy.js — כל הפניות לימות המשיח ולנדרים פלוס עוברות דרך השרת
//  הדפדפן לא מחזיק טוקנים: השרת מוסיף את הטוקן / מפתח ה-API מההגדרות במסד.
//  כל פנייה נרשמת ביומן הפעולות (בלי הטוקנים).
//
//  /masechet/api/yemot/<Method>?...   → https://www.call2all.co.il/ym/api/<Method>
//  /masechet/api/nedarim?Action=...    → https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx
// ============================================================
import { ApiError, badRequest } from './http.js';
import { getConfig } from './settings.js';
import { logAction, safeDetails } from './audit.js';
import { requirePermission, requireAnyPermission } from './permissions.js';

const YEMOT_BASE = 'https://www.call2all.co.il/ym/api/';
const NEDARIM_URL = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx';

// רק הפעולות שהאתר משתמש בהן
const YEMOT_METHODS = {
  GetTextFile: 'read',
  GetIVR2Dir: 'read',
  RenderYMGRFile: 'read',
  DownloadFile: 'read',
  GetSession: 'read',
  UploadTextFile: 'write',
  UploadFile: 'write',
  FileAction: 'write',
  UpdateExtension: 'write',
};

const NEDARIM_ACTIONS = {
  GetClient_Table: 'read',
  GetClientCard: 'read',
  GetLimitedStoresList: 'read',
  SaveClientCard: 'write',
  SetClientMagneticCard: 'write',
  AddTlush: 'write',
  PrikatTlush: 'write',
};

const YEMOT_NAMES = {
  GetTextFile: 'ימות: קריאת קובץ', GetIVR2Dir: 'ימות: רשימת תיקייה', RenderYMGRFile: 'ימות: קריאת יומן',
  DownloadFile: 'ימות: הורדת קובץ', GetSession: 'ימות: בדיקת חיבור', UploadTextFile: 'ימות: שמירת קובץ',
  UploadFile: 'ימות: העלאת קובץ', FileAction: 'ימות: פעולה על קבצים', UpdateExtension: 'ימות: עדכון שלוחה',
};

const NEDARIM_NAMES = {
  GetClient_Table: 'נדרים: רשימת לקוחות', GetClientCard: 'נדרים: כרטיס לקוח', GetLimitedStoresList: 'נדרים: קבוצות חנויות',
  SaveClientCard: 'נדרים: שמירת לקוח', SetClientMagneticCard: 'נדרים: הוספת כרטיס מגנטי', AddTlush: 'נדרים: טעינה',
  PrikatTlush: 'נדרים: פריקת טעינה',
};

// קריאות שקורות בכל טעינת עמוד – נרשמות פעם אחת לכל משתמש בכל 10 דקות, כדי שהיומן לא יוצף
async function shouldLogRead(env, ctx, action, target) {
  const since = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(Date.now() - 10 * 60000));
  const row = await env.DB.prepare(
    'SELECT 1 FROM ms_action_log WHERE account_id = ? AND action = ? AND target = ? AND created_at > ? LIMIT 1',
  ).bind(ctx.account.id, action, target, since).first();
  return !row;
}

function yemotTarget(params) {
  return params.what || params.wath || params.path || params.folder || params.extension || '';
}

export async function proxyYemot(request, env, ctx, method) {
  const kind = YEMOT_METHODS[method];
  if (!kind) throw badRequest('פעולה לא מורשית מול ימות');
  const cfg = await getConfig(env);
  if (!cfg.yemot_token) throw new ApiError(503, 'yemot_not_configured', 'טוקן ימות המשיח לא הוגדר. מנהל המערכת צריך להגדיר אותו בדף הניהול');

  const url = new URL(request.url);
  const query = new URLSearchParams(url.search);
  query.delete('token');
  query.set('token', cfg.yemot_token);

  const init = { method: request.method, headers: {} };
  const logged = Object.fromEntries([...query].filter(([k]) => k !== 'token'));

  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      form.delete('token');
      for (const [k, v] of form) logged[k] = v;
      form.set('token', cfg.yemot_token);
      init.body = form;
    } else {
      const body = new URLSearchParams(await request.text());
      body.delete('token');
      for (const [k, v] of body) logged[k] = v;
      body.set('token', cfg.yemot_token);
      init.body = body;
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  const range = request.headers.get('Range');
  if (range) init.headers.Range = range;

  const action = YEMOT_NAMES[method] || method;
  const target = yemotTarget(logged);

  // הרשאות: קריאה – צפייה בלקוחות / במבחנים / אתר ישן.
  // שמירת קובץ הלקוחות – עריכת לקוחות. כל שינוי אחר בימות – ניהול מבחנים
  try {
    if (kind === 'read') requireAnyPermission(ctx, ['clients_view', 'exams_view', 'old_site']);
    else if (method === 'UploadTextFile' && /ListAllInformation/i.test(target)) requirePermission(ctx, 'clients_edit');
    else requirePermission(ctx, 'exams_manage');
  } catch (err) {
    await logAction(env, request, ctx, { kind, action, target, details: safeDetails(logged), status: 'נחסם: אין הרשאה' });
    throw err;
  }

  const upstream = await fetch(`${YEMOT_BASE}${method}?${query.toString()}`, init);
  const contentType = upstream.headers.get('content-type') || '';

  // קבצים (הקלטות) – מועברים כמו שהם
  if (!contentType.includes('json')) {
    if (kind === 'write' || (await shouldLogRead(env, ctx, action, target))) {
      await logAction(env, request, ctx, { kind, action, target, details: safeDetails(logged), status: String(upstream.status) });
    }
    const headers = new Headers();
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set('Cache-Control', 'private, max-age=300');
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const text = await upstream.text();
  let status = String(upstream.status);
  try {
    const data = JSON.parse(text);
    status = data.responseStatus ? `${data.responseStatus}${data.message ? `: ${String(data.message).slice(0, 120)}` : ''}` : status;
  } catch { /* לא JSON */ }

  if (kind === 'write' || (await shouldLogRead(env, ctx, action, target))) {
    await logAction(env, request, ctx, { kind, action, target, details: safeDetails(logged), status });
  }
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function proxyNedarim(request, env, ctx) {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  const actionKey = params.get('Action') || '';
  const kind = NEDARIM_ACTIONS[actionKey];
  if (!kind) throw badRequest('פעולה לא מורשית מול נדרים');

  // הרשאות: קריאה – צפייה בלקוחות; שמירת לקוח – עריכת לקוחות; טעינות וכרטיסים – טעינות וכרטיסים
  const perm = kind === 'read' ? 'clients_view' : actionKey === 'SaveClientCard' ? 'clients_edit' : 'nedarim_charge';
  try {
    requirePermission(ctx, perm);
  } catch (err) {
    const blocked = Object.fromEntries([...params].filter(([k]) => !['MosadId', 'ApiPassword', 'Action'].includes(k)));
    await logAction(env, request, ctx, {
      kind, action: NEDARIM_NAMES[actionKey] || actionKey, target: blocked.ClientId || blocked.Zeout || blocked.TlushId || '',
      details: safeDetails(blocked), status: 'נחסם: אין הרשאה',
    });
    throw err;
  }

  const cfg = await getConfig(env);
  if (!cfg.nedarim_mosad_id || !cfg.nedarim_api_password) {
    throw new ApiError(503, 'nedarim_not_configured', 'פרטי נדרים פלוס לא הוגדרו. מנהל המערכת צריך להגדיר אותם בדף הניהול');
  }
  params.delete('MosadId');
  params.delete('ApiPassword');
  params.set('MosadId', cfg.nedarim_mosad_id);
  params.set('ApiPassword', cfg.nedarim_api_password);

  const upstream = await fetch(`${NEDARIM_URL}?${params.toString()}`);
  const text = await upstream.text();

  let status = String(upstream.status);
  try {
    const data = JSON.parse(text);
    if (data.Result) status = `${data.Result}${data.Message ? `: ${String(data.Message).slice(0, 120)}` : ''}`;
  } catch { /* לא JSON */ }

  const logged = Object.fromEntries([...params].filter(([k]) => !['MosadId', 'ApiPassword', 'Action'].includes(k)));
  const action = NEDARIM_NAMES[actionKey] || actionKey;
  const target = logged.ClientId || logged.Zeout || logged.TlushId || '';
  if (kind === 'write' || (await shouldLogRead(env, ctx, action, target))) {
    await logAction(env, request, ctx, { kind, action, target, details: safeDetails(logged), status });
  }
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// בדיקת חיבור לשני השירותים (לחלון ההגדרות באתר)
export async function connectionStatus(env) {
  const cfg = await getConfig(env);
  const out = { yemot: { ok: false, message: 'לא הוגדר טוקן' }, nedarim: { ok: false, message: 'לא הוגדרו פרטים' } };
  if (cfg.yemot_token) {
    try {
      const r = await (await fetch(`${YEMOT_BASE}GetSession?token=${encodeURIComponent(cfg.yemot_token)}`)).json();
      out.yemot = r.responseStatus === 'OK'
        ? { ok: true, message: `מחובר${r.username ? ` (מערכת ${r.username})` : ''}` }
        : { ok: false, message: r.message || 'הטוקן לא תקין' };
    } catch { out.yemot = { ok: false, message: 'שגיאת תקשורת' }; }
  }
  if (cfg.nedarim_mosad_id && cfg.nedarim_api_password) {
    try {
      const p = new URLSearchParams({ Action: 'GetLimitedStoresList', MosadId: cfg.nedarim_mosad_id, ApiPassword: cfg.nedarim_api_password });
      const r = await (await fetch(`${NEDARIM_URL}?${p}`)).json();
      out.nedarim = r.Result === 'Error'
        ? { ok: false, message: r.Message || 'הפרטים לא תקינים' }
        : { ok: true, message: `מחובר (מוסד ${cfg.nedarim_mosad_id})` };
    } catch { out.nedarim = { ok: false, message: 'שגיאת תקשורת' }; }
  }
  return out;
}
