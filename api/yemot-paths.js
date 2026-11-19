// ============================================================
//  yemot-paths.js — הכתובות (נתיבים) במערכת ימות המשיח שהאתר עובד איתן
//  נערכות בהגדרות הניהול: אם מעבירים שלוחה בימות, משנים כאן והאתר ממשיך לעבוד.
//  השרת מרשה פנייה לימות רק לכתובות האלה (וכל מה שמתחתן), לפי סוג השימוש:
//  read = קריאה בלבד, write = קריאה ושינוי. כל כתובת אחרת נחסמת.
// ============================================================
import { badRequest, forbidden } from './http.js';

export const PATH_FIELDS = [
  { key: 'clients_file', label: 'קובץ הלקוחות', type: 'file', access: 'write', default: 'EnterID/ListAllInformation.ini' },
  { key: 'points_file', label: 'קובץ הנקודות', type: 'file', access: 'read', default: 'Points/Split/points_total.ini' },
  { key: 'points_report', label: 'דוח הנקודות (אתר ישן)', type: 'file', access: 'read', default: 'Points/Split/points_total.ymgr' },
  { key: 'recordings_folder', label: 'תיקיית הקלטות ההרשמה', type: 'folder', access: 'read', default: '1/2/1/Record' },
  { key: 'exam_folder', label: 'תיקיית המבחן', type: 'folder', access: 'write', default: '2/1',
    hint: 'כוללת את קובץ התוצאות (ExaminationLogOK), קובץ השאלות (examination.ini) והקלטות השאלות' },
  { key: 'archive_folder', label: 'תיקיית מבחנים קודמים', type: 'folder', access: 'write', default: '2/1/מבחנים-קודמים' },
];

export const DEFAULT_PATHS = Object.fromEntries(PATH_FIELDS.map((f) => [f.key, f.default]));

// "ivr2:/2/1/" → "2/1". כתובת עם .. או . נדחית
export function normalizePath(raw) {
  let p = String(raw ?? '').trim();
  try { p = decodeURIComponent(p); } catch { /* כבר מפוענח */ }
  p = p.replace(/\\/g, '/').replace(/^ivr2:/i, '').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
  if (p.split('/').some((s) => s === '..' || s === '.')) return null;
  return p;
}

// הכתובות השמורות (או ברירת המחדל לכל מה שלא נשמר)
export function getPaths(json) {
  let saved = {};
  try { saved = typeof json === 'string' ? JSON.parse(json) : json || {}; } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const out = {};
  for (const f of PATH_FIELDS) {
    const p = normalizePath(saved[f.key]);
    out[f.key] = p ? p : f.default;
  }
  return out;
}

// בדיקה ושמירה מהגדרות הניהול
export function validatePaths(input) {
  let obj;
  try { obj = typeof input === 'string' ? JSON.parse(input) : input; } catch { throw badRequest('הכתובות אינן תקינות'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw badRequest('הכתובות אינן תקינות');
  const out = {};
  for (const f of PATH_FIELDS) {
    const raw = String(obj[f.key] ?? '').trim();
    if (!raw) throw badRequest(`חסרה כתובת: ${f.label}`);
    const p = normalizePath(raw);
    if (p === null) throw badRequest(`כתובת לא תקינה (${f.label}): ${raw}`);
    if (p === '') throw badRequest(`${f.label}: אי אפשר להגדיר את כל המערכת (/). הגדירו שלוחה או קובץ מסוים`);
    out[f.key] = p;
  }
  return out;
}

// הכתובות → הרשאות גישה
export function rulesFromPaths(paths) {
  return PATH_FIELDS.map((f) => ({ path: paths[f.key], access: f.access }));
}

const inside = (target, rule) => target === rule || target.startsWith(rule + '/');

function allowed(rules, target, need) {
  return rules.some((r) => inside(target, r.path) && (need === 'read' || r.access === 'write'));
}

// איזה פרמטר מכיל כתובת, ומה צריך עליה, לכל פעולה
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

// זורק שגיאה אם אחת הכתובות לא מורשית
export function enforcePaths(method, params, rules) {
  if (method === 'GetSession') return [];
  const req = requirements(method, params);
  if (!req.length) throw forbidden('חסרה כתובת בפנייה לימות');
  const checked = [];
  for (const [key, need] of req) {
    const target = normalizePath(params[key]);
    if (target === null) throw forbidden(`כתובת לא תקינה: ${params[key]}`);
    if (!allowed(rules, target, need)) {
      throw forbidden(`הכתובת "${target || '/'}" לא מוגדרת בכתובות של האתר (${need === 'write' ? 'שינוי' : 'קריאה'}). אפשר לעדכן בהגדרות הניהול`);
    }
    checked.push(target);
  }
  return checked;
}
