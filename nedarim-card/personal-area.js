// אזור אישי – שמיעת כרטיסים, יתרה וזכיות לפי מספר זהות
// https://smti.uk/masechet/nedarim-card/personal-area
// פרמטרים: ApiEnterID (ת"ז), MosadId, ApiPassword
//
// מבנה ההשמעה (בסגנון שלוחת shar):
//   עמוד פתיחה  – שלום + שם, כרטיסים, יתרה, כמה זכיות יש. 8 = דילוג, * = יציאה
//   עמודי זכיות – 5 זכיות בכל עמוד, מהחדשה לישנה. סיום עמוד בלי הקשה ממשיך לבא
//   סוף         – "עד כאן נתוני הכרטיס"

import {
  REPORTS_URL, reply, exit, tts, clean, readPage, isExit, lastParam, sayDay, readParams, amountParts,
} from './common.js';

const ITEMS_PER_PAGE = 5;
const PARAM = 'pa_';

export async function handleDetails(request) {
  try {
    const p = await readParams(request);

    // ניווט בין העמודים
    const { page: lastPage, val: lastVal } = lastParam(p, PARAM);
    let page = 0;
    if (lastPage >= 0) {
      if (isExit(lastVal)) return exit();
      page = lastPage + 1; // 8 או סיום ההשמעה – לעמוד הבא
    }

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

    const activeCards = (card.Cards || []).filter((c) => !c.RemovedDate || c.RemovedDate.trim() === '');

    // זכיות מהחדשה לישנה
    const toDate = (d) => {
      const [day, month, year] = String(d || '').split('/');
      return new Date(`${year && year.length === 2 ? '20' + year : year}-${month}-${day}`);
    };
    const tlushim = [...(card.Tlushim || [])].sort((a, b) => toDate(b.Date) - toDate(a.Date));

    // ===== עמוד פתיחה =====
    if (page === 0) {
      const parts = ['f-105']; // "שלום"
      const fullName = clean(`${card.FirstName || ''} ${card.FamilyName || ''}`);
      if (fullName) parts.push(`t-${fullName}`);

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

      if (tlushim.length === 0) {
        parts.push('f-117'); // "עד כאן נתוני הכרטיס"
        return reply(parts.join('.'));
      }

      const count = tlushim.length === 1 ? 'יש לכם זכיה אחת' : `יש לכם ${tlushim.length} זכיות`;
      parts.push(`t-${count}`, 'f-112'); // "להלן פירוט הזכיות שלכם, מהחדש לישן"
      parts.push('t-לדילוג הקישו 8, ליציאה הקישו כוכבית');
      return readPage(parts.join('.'), `${PARAM}0`);
    }

    // ===== עמודי זכיות =====
    const start = (page - 1) * ITEMS_PER_PAGE;
    const chunk = tlushim.slice(start, start + ITEMS_PER_PAGE);

    if (chunk.length === 0) return reply('f-117'); // "עד כאן נתוני הכרטיס"

    const parts = [];
    chunk.forEach((t, i) => {
      if (start + i > 0) parts.push('f-114'); // "הזכיה הקודמת"
      parts.push('f-113'); // "זכיה"
      if (t.Comments) parts.push(tts(t.Comments));
      parts.push('f-115', `n-${t.Amount}`, 'f-109'); // "על סכום" X "שקלים"
      parts.push(`t-הוטען לכם ${sayDay(t.Date)}`);
    });

    // אם זה העמוד האחרון – מסיימים בלי לחכות
    if (start + ITEMS_PER_PAGE >= tlushim.length) {
      parts.push('f-117');
      return reply(parts.join('.'));
    }
    return readPage(parts.join('.'), `${PARAM}${page}`);
  } catch (err) {
    console.error('nedarim-card/personal-area error:', err);
    return reply('f-104');
  }
}
