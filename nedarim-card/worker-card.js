// כרטיס נדרים – שלוחות ימות המשיח לבדיקת יתרה ופרטי כרטיס
// מוגש ב-Worker הראשי:
//   https://smti.uk/masechet/nedarim-card/balance  – יתרה לפי מספר כרטיס (במקום get_balance)
//   https://smti.uk/masechet/nedarim-card/details  – פרטי כרטיס וזכיות לפי ת"ז (במקום get_card_details)
// הקבצים f-xxx הם הקלטות שצריכות להיות בשלוחה בימות המשיח.

const BALANCE_URL = 'https://www.matara.pro/NedarimPlus/Mechubad/Manage.aspx?Action=GetCardTlushim';
const REPORTS_URL = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx';

const reply = (msg) =>
  new Response(`id_list_message=${msg}&`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

// נקודה ומקף שוברים את השרשור של ימות המשיח – מוחלפים ברווח
const tts = (text) => 't-' + String(text).replace(/[.\-&]/g, ' ').replace(/\s+/g, ' ').trim();

// פרמטרים מה-URL ומגוף הבקשה (ימות המשיח יכולה לשלוח GET או POST)
async function readParams(request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  if (request.method === 'POST') {
    const body = await request.text();
    for (const [k, v] of new URLSearchParams(body)) params[k] = v;
  }
  return params;
}

// סכום → הודעה: n-שקלים.שקלים[.ו.n-אגורות.אגורות]
function amountParts(amount, shekelFile, andFile, agorotFile) {
  const shekels = Math.floor(amount);
  const agorot = Math.round((amount - shekels) * 100);
  const parts = [`n-${shekels}`, shekelFile];
  if (agorot !== 0) parts.push(andFile, `n-${agorot}`, agorotFile);
  return parts;
}

// ===== יתרה לפי מספר כרטיס =====
export async function handleBalance(request) {
  try {
    const p = await readParams(request);
    const cardNumber = p.PrintedNumber || '';
    const allowedMosadIds = p.MosadId || ''; // למשל: "45689-57964"

    if (!cardNumber) return reply('f-001');

    const res = await fetch(BALANCE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ MagneticCard: cardNumber }).toString(),
    });
    const data = await res.json();

    if (data.Result === 'Error') {
      if (data.Message === 'מספר כרטיס קצר מידי.') return reply('f-002.f-003');
      if (data.Message === 'טעות בהקלדת מספר כרטיס.') return reply('f-004.f-003');
      return reply('f-005.f-006'); // שגיאה בבדיקת הכרטיס + פנו להנהלה
    }

    if (allowedMosadIds) {
      const allowed = allowedMosadIds.split('-').map((id) => id.trim());
      if (!allowed.includes(String(data.Manpik_MosadId))) return reply('f-007');
    }

    const amount = data.Total && data.Total.length ? parseFloat(data.Total[0].Amount) || 0 : 0;
    return reply(['f-008', ...amountParts(amount, 'f-009', 'f-010', 'f-011')].join('.'));
  } catch (err) {
    console.error('nedarim-card/balance error:', err);
    return reply('f-012.f-013');
  }
}

// ===== פרטי כרטיס וזכיות לפי ת"ז =====
export async function handleDetails(request) {
  try {
    const p = await readParams(request);
    const rawId = p.ApiEnterID || '';
    const idNumber = rawId.includes('-') ? rawId.split('-').pop() : rawId;
    const mosadId = p.MosadId || '';
    const apiPassword = p.ApiPassword || '';

    if (!idNumber) return reply('f-100');

    const auth = `MosadId=${encodeURIComponent(mosadId)}&ApiPassword=${encodeURIComponent(apiPassword)}`;

    // מציאת הלקוח לפי ת"ז
    const clientsData = await (await fetch(`${REPORTS_URL}?Action=GetClient_Table&${auth}`)).json();
    if (clientsData.Result !== 'OK' || !clientsData.data) return reply('f-101');

    const client = clientsData.data.find((c) => c.Zeout === idNumber);
    if (!client) return reply('f-102');

    // נתוני הכרטיס והזכיות
    const card = await (
      await fetch(`${REPORTS_URL}?Action=GetClientCard&${auth}&ClientId=${encodeURIComponent(client.ClientId)}`)
    ).json();
    if (card.Result !== 'OK') return reply('f-103');

    const parts = ['f-105']; // "שלום"
    const fullName = `${card.FirstName || ''} ${card.FamilyName || ''}`.trim();
    if (fullName) parts.push(tts(fullName));

    const activeCards = (card.Cards || []).filter((c) => !c.RemovedDate || c.RemovedDate.trim() === '');

    if (activeCards.length === 0) {
      parts.push('f-106'); // "לא נמצא כרטיס מגנטי"
      return reply(parts.join('.'));
    }

    if (activeCards.length === 1) {
      parts.push('f-107', `d-${activeCards[0].CardNumber.slice(-4)}`);
    } else {
      parts.push('f-118');
      activeCards.forEach((c, i) => {
        parts.push(`d-${c.CardNumber.slice(-4)}`);
        if (i < activeCards.length - 1) parts.push('f-110');
      });
    }

    const balance = parseFloat(String(card.TotalFreeAmount || '').replace('₪', '').trim()) || 0;
    parts.push('f-108', ...amountParts(balance, 'f-109', 'f-110', 'f-111'));

    const tlushim = card.Tlushim || [];
    if (tlushim.length) {
      parts.push('f-112'); // "להלן פירוט הזכיות שלכם, מהחדש לישן"
      const toDate = (d) => {
        const [day, month, year] = d.split('/');
        return new Date(`20${year}-${month}-${day}`);
      };
      tlushim.sort((a, b) => toDate(b.Date) - toDate(a.Date));

      tlushim.forEach((t, i) => {
        if (i > 0) parts.push('f-114'); // "הזכיה הקודמת"
        parts.push('f-113'); // "זכיה"
        if (t.Comments) parts.push(tts(t.Comments));
        parts.push('f-115', `n-${t.Amount}`, 'f-109'); // "על סכום" X "שקלים"
        const [day, month, year] = t.Date.split('/');
        parts.push('f-116', `date-${day}/${month}/20${year}`); // "הוטען לכם בתאריך"
      });
    }

    parts.push('f-117'); // "עד כאן נתוני הכרטיס"
    return reply(parts.join('.'));
  } catch (err) {
    console.error('nedarim-card/details error:', err);
    return reply('f-104');
  }
}
