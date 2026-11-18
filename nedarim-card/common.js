// פונקציות משותפות לשלוחות כרטיס נדרים

export const BALANCE_URL = 'https://www.matara.pro/NedarimPlus/Mechubad/Manage.aspx?Action=GetCardTlushim';
export const REPORTS_URL = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx';

export const reply = (msg) =>
  new Response(`id_list_message=${msg}&`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

// נקודה ומקף שוברים את השרשור של ימות המשיח – מוחלפים ברווח
export const tts = (text) => 't-' + String(text).replace(/[.\-&]/g, ' ').replace(/\s+/g, ' ').trim();

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

