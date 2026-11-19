// ============================================================
//  word-filter.js — סינון מילים בנתונים שמגיעים מימות ומנדרים
//  המילים נקבעות בהגדרות הניהול (נשמרות במסד בלבד). כל מופע מוחלף ב-***,
//  כך שסינון התוכן של נטפרי לא חוסם את הדף. אפשר לבטל לחיבור מסוים ("הצג טקסט מלא").
//  בשמירה: שורות שלא נערכו מוחזרות לטקסט המקורי, כך שהסינון לא מוחק נתונים.
// ============================================================

export const MASK = '***';

export function parseWords(text) {
  const seen = new Set();
  return String(text || '')
    .split(/[\n,]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// מחזיר פונקציית סינון, או null אם אין מילים
export function makeFilter(text) {
  const words = parseWords(text);
  if (!words.length) return null;
  // מילים ארוכות קודם, כדי שמילה שמכילה מילה אחרת תסונן בשלמותה
  const re = new RegExp(words.sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'giu');
  const maskString = (s) => {
    let count = 0;
    const out = s.replace(re, () => { count++; return MASK; });
    return { text: out, count };
  };
  return { maskString };
}

// סינון כל הטקסטים בתוך JSON (גם אם ימות שולחת עברית כ-א)
export function maskJsonText(filter, raw) {
  let data;
  try { data = JSON.parse(raw); } catch {
    return filter.maskString(raw);
  }
  let count = 0;
  const walk = (v) => {
    if (typeof v === 'string') { const r = filter.maskString(v); count += r.count; return r.text; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v; }
    return v;
  };
  const out = walk(data);
  return { text: count ? JSON.stringify(out) : raw, count };
}

// שמירה של קובץ שהוצג מסונן: כל שורה שזהה לגרסה המסוננת של שורה מקורית – מוחזרת למקור
export function restoreLines(filter, uploaded, original) {
  const map = new Map();
  for (const line of String(original || '').split(/\r?\n/)) {
    const masked = filter.maskString(line).text;
    if (masked !== line && !map.has(masked)) map.set(masked, line);
  }
  let restored = 0;
  const lines = String(uploaded || '').split(/(\r?\n)/);
  for (let i = 0; i < lines.length; i += 2) {
    if (lines[i].includes(MASK) && map.has(lines[i])) { lines[i] = map.get(lines[i]); restored++; }
  }
  return { text: lines.join(''), restored };
}
