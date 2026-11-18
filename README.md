# מסכת של שבת

מערכת ניהול מבחנים ולקוחות (CRM) של "מסכת של שבת", פרוסה כ-Cloudflare Worker.

## מבנה

- `old/` – הגרסה הישנה של האתר (מוגשת ב-`/masechet`)
- `v2/` – הגרסה החדשה (מוגשת ב-`/masechet/v2`)
- `worker.js` – ה-Worker שמגיש את כל הקבצים לפי הנתיב
- `wrangler.toml` – הגדרות הפריסה ל-Cloudflare
- `nedarim-card/` – שלוחות ימות המשיח מול נדרים פלוס (רישום, אזור אישי, יתרת כרטיס)

## נתיבים

| כתובת | מה מוגש |
|-------|---------|
| `/masechet` | הגרסה הישנה (`old/index.html`) |
| `/masechet/smt.html` | דף משני ישן |
| `/masechet/v2` | הגרסה החדשה (`v2/index.html`) |
| `/masechet/nedarim-card/webhook` | שלוחת רישום לנדרים פלוס (`nedarim-card/`) |
| `/masechet/nedarim-card/personal-area` | אזור אישי – זכיות לפי ת"ז (`nedarim-card/`) |
| `/masechet/nedarim-card/card-balance` | יתרה לפי מספר כרטיס (`nedarim-card/`) |

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
