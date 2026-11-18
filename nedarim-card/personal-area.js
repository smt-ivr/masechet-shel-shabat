// אזור אישי – שמיעת כרטיסים, יתרה וזכיות לפי מספר זהות
// https://smti.uk/masechet/nedarim-card/personal-area
// פרמטרים: ApiEnterID (ת"ז), MosadId, ApiPassword

import { REPORTS_URL, reply, tts, readParams, amountParts } from './common.js';

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
