# מסכת של שבת

מערכת ניהול מבחנים ולקוחות (CRM) של "מסכת של שבת", פרוסה כ-Cloudflare Worker.

## מבנה

- `old/` – הגרסה הישנה של האתר (מוגשת ב-`/masechet`)
- `v2/` – הגרסה החדשה (מוגשת ב-`/masechet/v2`)
- `worker.js` – ה-Worker שמגיש את כל הקבצים לפי הנתיב
- `wrangler.toml` – הגדרות הפריסה ל-Cloudflare
- `nedarim-card/` – שלוחות יתרה ופרטי כרטיס נדרים
- `webhook-nedarim/` – Webhook רישום מימות המשיח → נדרים פלוס

## נתיבים

| כתובת | מה מוגש |
|-------|---------|
| `/masechet` | הגרסה הישנה (`old/index.html`) |
| `/masechet/smt.html` | דף משני ישן |
| `/masechet/v2` | הגרסה החדשה (`v2/index.html`) |
| `/masechet/nedarim-card/balance` | יתרת כרטיס נדרים לימות המשיח (`nedarim-card/`) |
| `/masechet/nedarim-card/details` | פרטי כרטיס וזכיות לפי ת"ז (`nedarim-card/`) |
| `/masechet/webhook-nedarim` | Webhook רישום מימות המשיח לנדרים פלוס (`webhook-nedarim/`) |

נתיב `/masechet` ו-`/masechet/v2` ללא `/` בסוף מופנים אוטומטית לנתיב עם `/`
כדי שהקישורים היחסיים (CSS/JS/תמונות) ייטענו נכון.

## פריסה

```bash
npx wrangler deploy
```

לאחר הפריסה מחברים את הדומיין (למשל `smti.uk/masechet*`) ל-Worker
דרך Cloudflare → Workers Routes.

## הערות

- הנתונים נמשכים בזמן אמת מ-API חיצוני (ימות המשיח + נדרים כארד);
  הרשאות החיבור נשמרות ב-`localStorage` בדפדפן.
- ההפניה השבורה ל-`raffle-manager.js` (קובץ שלא היה קיים בשרת) הוסרה מ-`v2/index.html`.
