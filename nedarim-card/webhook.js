// Webhook לרישום מימות המשיח → כרטיס לקוח בנדרים פלוס
// https://smti.uk/masechet/nedarim-card/webhook
//
// משתני סביבה ב-Cloudflare (Worker: masechet-shel-shabat):
//   NEDARIM_MOSAD_ID      – מספר מוסד (מוגדר ב-wrangler.toml)
//   NEDARIM_API_PASSWORD  – מפתח API של נדרים פלוס (Secret, מוגדר בממשק של Cloudflare)

const NEDARIM_URL = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx';

const GROUPS = {
  '1': 'תלמוד תורה',
  '2': 'ישיבה קטנה',
  '3': 'ישיבה גדולה',
  '4': 'אברכים ונשואים',
};

// תשובה בפורמט שימות המשיח יודעת להשמיע
// ניקוי תווים ששוברים את מחרוזת ההשמעה (נקודה, מקף, = , & , גרשיים, פסיק)
const clean = (str) => String(str ?? '').replace(/[.\-=&"',]/g, ' ').replace(/\s+/g, ' ').trim();

const yemot = (text) =>
  new Response(`id_list_message=t-${clean(text)}&`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

async function readParams(request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';
    if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
      const form = await request.formData();
      for (const [k, v] of form) params[k] = String(v);
    }
  }
  return params;
}

export async function handleWebhook(request, env) {
  try {
    const mosadId = env.NEDARIM_MOSAD_ID;
    const apiPassword = env.NEDARIM_API_PASSWORD;
    if (!mosadId || !apiPassword) {
      console.error('Missing NEDARIM_MOSAD_ID / NEDARIM_API_PASSWORD');
      return yemot('שגיאת הגדרות בשרת');
    }

    const p = await readParams(request);

    // בלי שם ות"ז אין מה לרשום (מונע יצירת לקוחות ריקים)
    if (!p.EnterId && !p.P000 && !p.P001) {
      return yemot('לא התקבלו פרטי רישום');
    }

    const rawPhone2 = p.P052 || '';
    const phone2 = rawPhone2 && rawPhone2.toLowerCase() !== 'next' ? rawPhone2 : '';
    const groupCode = p.P050 || '';
    const groupName = GROUPS[groupCode] || '';

    const comments =
      `נוצר באופן אוטומטי דרך מערכת מסכת של שבת, באמצעות S.M.T, ` +
      `בתאריך ${p.HebrewDate || ''} (${p.Date || ''}) בשעה ${p.Time || ''}, ` +
      `שלוחה: ${p.Folder || ''}, מזהה הרשמה: ${p.Booking || ''}, קטגוריה: ${groupCode}`;

    const q = new URLSearchParams();
    q.append('Action', 'SaveClientCard');
    q.append('MosadId', mosadId);
    q.append('ApiPassword', apiPassword);
    q.append('FamilyName', p.P001 || '');
    q.append('FirstName', p.P000 || '');
    q.append('Zeout', p.EnterId || '');
    q.append('Phone1', p.P051 || '');
    if (phone2) q.append('Phone2', phone2);
    if (groupName) q.append('Groupe', groupName);
    q.append('Comments', comments);

    const res = await fetch(`${NEDARIM_URL}?${q.toString()}`);
    const data = await res.json();

    if (data.Result === 'OK') return yemot('הרישום בוצע בהצלחה');

    const msg = data.Message || 'תקלה ברישום';
    if (msg.includes('כבר רשום')) return yemot('הלקוח כבר רשום במערכת');
    console.error('Nedarim error:', msg);
    return yemot(`אירעה שגיאה: ${msg}`);
  } catch (err) {
    console.error('Webhook error:', err);
    return yemot('שגיאת תקשורת');
  }
}
