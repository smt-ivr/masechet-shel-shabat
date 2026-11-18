// יתרת כרטיס לפי מספר כרטיס
// https://smti.uk/masechet/nedarim-card/card-balance
// פרמטרים: PrintedNumber, MosadId (רשות – מוסדות מורשים מופרדים במקף)

import { BALANCE_URL, reply, readParams, amountParts } from './common.js';

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
