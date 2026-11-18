# webhook-nedarim

פונקציית Netlify שמקבלת רישום מימות המשיח ויוצרת כרטיס לקוח בנדרים פלוס
(`Action=SaveClientCard`). מחזירה לימות המשיח הודעת `id_list_message`.

- כתובת: `https://webhook-nedarim.netlify.app/.netlify/functions/create_client`
- פרויקט ב-Netlify: `webhook-nedarim`

## פרמטרים מימות המשיח

| פרמטר | שדה |
|-------|-----|
| `P000` | שם פרטי |
| `P001` | שם משפחה |
| `EnterId` | תעודת זהות |
| `P051` / `P052` | טלפון 1 / טלפון 2 (`Next` = דילוג) |
| `P050` | קוד קבוצה (1–4) |
| `Date`, `Time`, `HebrewDate`, `Folder`, `Booking` | נכנסים להערה |

## משתני סביבה (מוגדרים ב-Netlify, לא בקוד)

- `NEDARIM_MOSAD_ID` – מספר מוסד
- `NEDARIM_API_PASSWORD` – מפתח API של נדרים פלוס (נשלח בפרמטר `ApiPassword`)

> שינוי במשתני סביבה נכנס לתוקף רק אחרי פריסה מחדש.

## פריסה

מתוך התיקייה הזו:

```bash
npx netlify deploy --prod --site webhook-nedarim
```
