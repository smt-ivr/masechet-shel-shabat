// פונקציות משותפות לשלוחות כרטיס נדרים

export const BALANCE_URL = 'https://www.matara.pro/NedarimPlus/Mechubad/Manage.aspx?Action=GetCardTlushim';
export const REPORTS_URL = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx';

export const reply = (msg) =>
  new Response(`id_list_message=${msg}&`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

// תשובה גולמית לימות המשיח
export const raw = (text) =>
  new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

// יציאה מהשלוחה (ממשיך לפי הגדרות השלוחה)
export const exit = () => raw('&');

// ניקוי תווים ששוברים את מחרוזת ההשמעה של ימות המשיח
export const clean = (str) =>
  String(str ?? '').replace(/[.\-=&"',]/g, ' ').replace(/\s+/g, ' ').trim();

// טקסט להקראה (TTS)
export const tts = (text) => 't-' + clean(text);

// הקראה שממתינה להקשה: * יציאה, 8 דילוג לעמוד הבא, סיום ההשמעה בלי הקשה שולח next
export const readPage = (msg, param) =>
  raw(`read=${msg}=${param},,1,,1,NO,,,,*8,1,Ok,next,,no`);

export const isExit = (val) => val === '*' || val === '&' || val === 'exit';

// העמוד האחרון שנשלח עם הקידומת (למשל pa_3) והמקש שהוקש בו
export function lastParam(params, prefix) {
  let page = -1;
  let val = null;
  for (const [key, v] of Object.entries(params)) {
    if (!key.startsWith(prefix)) continue;
    const n = parseInt(key.slice(prefix.length), 10);
    if (!isNaN(n) && n >= page) {
      page = n;
      val = v;
    }
  }
  return { page, val };
}

// תאריכים בהקראה: היום / אתמול / בתאריך 16 לאחד עשר (עם שנה רק אם לא השנה הנוכחית)
const MONTH_WORDS = ['לראשון', 'לשני', 'לשלישי', 'לרביעי', 'לחמישי', 'לשישי', 'לשביעי', 'לשמיני', 'לתשיעי', 'לעשירי', 'לאחד עשר', 'לשנים עשר'];

function israelToday() {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = s.split('-').map(Number);
  return { y, utc: Date.UTC(y, m - 1, d) };
}

// מקבל תאריך בפורמט 17/11/26 או 17/11/2026
export function sayDay(dateStr) {
  const m = String(dateStr || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return 'בתאריך לא ידוע';
  const d = Number(m[1]), mo = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const today = israelToday();
  const diff = Math.round((today.utc - Date.UTC(y, mo - 1, d)) / 86400000);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'אתמול';
  let s = `בתאריך ${d} ${MONTH_WORDS[mo - 1] || ''}`;
  if (y !== today.y) s += ` ${y}`;
  return s;
}

// פרמטרים מה-URL ומגוף הבקשה (ימות המשיח יכולה לשלוח GET או POST)
export async function readParams(request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  if (request.method === 'POST') {
    const body = await request.text();
    for (const [k, v] of new URLSearchParams(body)) params[k] = v;
  }
  return params;
}

// סכום → הודעה: n-שקלים.שקלים[.ו.n-אגורות.אגורות]
export function amountParts(amount, shekelFile, andFile, agorotFile) {
  const shekels = Math.floor(amount);
  const agorot = Math.round((amount - shekels) * 100);
  const parts = [`n-${shekels}`, shekelFile];
  if (agorot !== 0) parts.push(andFile, `n-${agorot}`, agorotFile);
  return parts;
}

