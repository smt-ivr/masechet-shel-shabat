# webhook-nedarim

פונקציית Netlify שמקבלת רישום מימות המשיח ויוצרת כרטיס לקוח בנדרים פלוס
(`Action=SaveClientCard`). מחזירה לימות המשיח הודעת `id_list_message`.

- **כתובת לשלוחה:** `https://smti.uk/masechet/webhook-nedarim`
  (מוגש מה-Worker הראשי `masechet-shel-shabat` – הקוד ב-`worker-webhook.js`)
- גרסה ישנה ב-Netlify (`netlify/functions/create_client.js`):
  `https://webhook-nedarim.netlify.app/.netlify/functions/create_client`

## פרמטרים מימות המשיח

| פרמטר | שדה |
|-------|-----|
| `P000` | שם פרטי |
| `P001` | שם משפחה |
| `EnterId` | תעודת זהות |
| `P051` / `P052` | טלפון 1 / טלפון 2 (`Next` = דילוג) |
| `P050` | קוד קבוצה (1–4) |
| `Date`, `Time`, `HebrewDate`, `Folder`, `Booking` | נכנסים להערה |

## משתני סביבה (Cloudflare → Worker `masechet-shel-shabat`)

- `NEDARIM_MOSAD_ID` – מספר מוסד, מוגדר ב-`wrangler.toml`
- `NEDARIM_API_PASSWORD` – מפתח API של נדרים פלוס, מוגדר כ-**Secret** בממשק של Cloudflare
  (Settings → Variables and Secrets). לא נשמר בקוד.

## פריסה

הפונקציה חלק מה-Worker הראשי, ונפרסת יחד איתו (`npx wrangler deploy` משורש המאגר).
