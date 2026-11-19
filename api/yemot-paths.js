// ============================================================
//  yemot-paths.js — נתיבים מורשים בימות המשיח
//  כל פנייה לימות נבדקת: הנתיב חייב להיות ברשימה (נערכת בהגדרות הניהול).
//  נתיב מורשה כולל גם את כל מה שמתחתיו. הרשאה: read (קריאה) / write (קריאה ושינוי).
// ============================================================
import { badRequest, forbidden } from './http.js';

export const DEFAULT_PATH_RULES = [
  { path: 'EnterID/ListAllInformation.ini', access: 'write', label: 'קובץ הלקוחות' },
  { path: 'Points', access: 'read', label: 'קבצי הנקודות' },
  { path: '1/2/1/Record', access: 'read', label: 'הקלטות ההרשמה' },
  { path: '2/1', access: 'write', label: 'המבחן, השאלות, ההקלטות ומבחנים קודמים' },
];

// "ivr2:/2/1/" → "2/1". נתיב עם .. או . נדחה
export function normalizePath(raw) {
  let p = String(raw ?? '').trim();
  try { p = decodeURIComponent(p); } catch { /* כבר מפוענח */ }
  p = p.replace(/\\/g, '/').replace(/^ivr2:/i, '').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
  if (p.split('/').some((s) => s === '..' || s === '.')) return null;
  return p;
}

export function parseRules(json) {
  let list;
  try { list = typeof json === 'string' ? JSON.parse(json) : json; } catch { list = null; }
  if (!Array.isArray(list)) return DEFAULT_PATH_RULES;
  return list
    .map((r) => ({ path: normalizePath(r && r.path), access: r && r.access === 'write' ? 'write' : 'read', label: String((r && r.label) || '').slice(0, 80) }))
    .filter((r) => r.path);
}

// בדיקה ושמירה מהגדרות הניהול
export function validateRules(input) {
  let list;
  try { list = typeof input === 'string' ? JSON.parse(input) : input; } catch { throw badRequest('רשימת הנתיבים אינה תקינה'); }
  if (!Array.isArray(list)) throw badRequest('רשימת הנתיבים אינה תקינה');
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const raw = String((r && r.path) || '').trim();
    if (!raw) continue;
    const path = normalizePath(raw);
    if (path === null) throw badRequest(`נתיב לא תקין: ${raw}`);
    if (path === '') throw badRequest('אי אפשר להרשות את כל המערכת (נתיב ריק או /). הגדירו תיקייה מסוימת');
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, access: r.access === 'write' ? 'write' : 'read', label: String(r.label || '').trim().slice(0, 80) });
  }
  if (out.length > 100) throw badRequest('יותר מדי נתיבים (עד 100)');
  return out;
}

const inside = (target, rule) => target === rule || target.startsWith(rule + '/');

// האם מותר: need = 'read' / 'write'
function allowed(rules, target, need) {
  return rules.some((r) => inside(target, r.path) && (need === 'read' || r.access === 'write'));
}

// איזה פרמטר מכיל נתיב, ומה צריך עליו, לכל פעולה
function requirements(method, params) {
  const req = [];
  const add = (key, need) => { if (params[key] !== undefined && params[key] !== '') req.push([key, need]); };
  switch (method) {
    case 'GetTextFile': add('what', 'read'); break;
    case 'RenderYMGRFile': add('wath', 'read'); add('what', 'read'); break;
    case 'GetIVR2Dir': add('path', 'read'); break;
    case 'DownloadFile': add('path', 'read'); add('what', 'read'); break;
    case 'UploadTextFile': add('what', 'write'); break;
    case 'UploadFile': add('path', 'write'); add('what', 'write'); break;
    case 'UpdateExtension': add('path', 'write'); break;
    case 'FileAction':
      // העתקה: קריאה מהמקור וכתיבה ליעד. העברה / מחיקה / שינוי שם: כתיבה בשניהם
      add('what', params.action === 'copy' ? 'read' : 'write');
      add('target', 'write');
      break;
    default: break;
  }
  return req;
}

// זורק שגיאה אם אחד הנתיבים לא מורשה. מחזיר את רשימת הנתיבים שנבדקו (ליומן)
export function enforcePaths(method, params, rules) {
  if (method === 'GetSession') return [];
  const req = requirements(method, params);
  if (!req.length) throw forbidden('חסר נתיב בפנייה לימות');
  const checked = [];
  for (const [key, need] of req) {
    const target = normalizePath(params[key]);
    if (target === null) throw forbidden(`נתיב לא תקין: ${params[key]}`);
    if (!allowed(rules, target, need)) {
      throw forbidden(`הנתיב "${target || '/'}" לא מורשה ל${need === 'write' ? 'שינוי' : 'קריאה'}. אפשר להוסיף אותו בהגדרות הניהול`);
    }
    checked.push(target);
  }
  return checked;
}
