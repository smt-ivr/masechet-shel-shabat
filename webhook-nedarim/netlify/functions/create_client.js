// netlify/functions/create_client.js

export const handler = async (event, context) => {
  try {
    // קריאת הפרמטרים שמגיעים מימות המשיח
    const params = event.queryStringParameters || {};

    // 1. קריאת הגדרות אבטחה ממשתני הסביבה ב-Netlify
    const mosadId = process.env.NEDARIM_MOSAD_ID;
    const apiPassword = process.env.NEDARIM_API_PASSWORD;

    if (!mosadId || !apiPassword) {
      console.error("Missing Environment Variables");
      return { statusCode: 500, body: "Server Error: Configuration missing" };
    }

    // 2. חילוץ הנתונים מהבקשה
    const firstName = params.P000 || "";       // שם פרטי
    const familyName = params.P001 || "";      // שם משפחה
    const zeout = params.EnterId || "";        // תעודת זהות
    const phone1 = params.P051 || "";          // טלפון 1
    const rawPhone2 = params.P052 || "";       // טלפון 2 (או "Next")
    const groupCode = params.P050 || "";       // קוד קבוצה (1-4)
    
    // נתונים להערה
    const date = params.Date || "";
    const time = params.Time || "";
    const hebrewDate = params.HebrewDate || "";
    const folder = params.Folder || "";
    const bookingId = params.Booking || "";

    // 3. עיבוד לוגי של הנתונים

    // בדיקת טלפון שני - אם כתוב Next נתעלם ממנו
    let phone2 = "";
    if (rawPhone2 && rawPhone2.toLowerCase() !== "next") {
      phone2 = rawPhone2;
    }

    // תרגום קוד קבוצה לטקסט
    let groupName = "";
    switch (groupCode) {
      case "1": groupName = "תלמוד תורה"; break;
      case "2": groupName = "ישיבה קטנה"; break;
      case "3": groupName = "ישיבה גדולה"; break;
      case "4": groupName = "אברכים ונשואים"; break;
      default: groupName = ""; // אם לא נבחר או לא מוכר
    }

    // בניית טקסט ההערה
    const comments = `נוצר באופן אוטומטי דרך מערכת מסכת של שבת, באמצעות S.M.T, בתאריך ${hebrewDate} (${date}) בשעה ${time}, שלוחה: ${folder}, מזהה הרשמה: ${bookingId}, קטגוריה: ${groupCode}`;

    // 4. בניית ה-URL לשליחה לנדרים פלוס
    // אנו משתמשים ב-URLSearchParams כדי שיבצע קידוד (Encoding) אוטומטי לעברית
    const nedarimParams = new URLSearchParams();
    nedarimParams.append("Action", "SaveClientCard");
    nedarimParams.append("MosadId", mosadId);
    nedarimParams.append("ApiPassword", apiPassword);
    nedarimParams.append("FamilyName", familyName);
    nedarimParams.append("FirstName", firstName);
    nedarimParams.append("Zeout", zeout);
    nedarimParams.append("Phone1", phone1);
    if (phone2) nedarimParams.append("Phone2", phone2);
    if (groupName) nedarimParams.append("Groupe", groupName);
    nedarimParams.append("Comments", comments);

    const targetUrl = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?${nedarimParams.toString()}`;

    console.log("Sending request to Nedarim Plus..."); // לצרכי דיבוג בלוגים

    // 5. שליחת הבקשה
    const apiRes = await fetch(targetUrl);
    const apiData = await apiRes.json();

    console.log("Nedarim Response:", apiData);

    // 6. החזרת תשובה לימות המשיח
    // נחזיר תשובה שימות המשיח יודעת לקרוא (למשל השמעה שהרישום הצליח או נכשל)
    if (apiData.Result === "OK") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        // אופציה: להשמיע "הרישום בוצע בהצלחה" (תשנה את f-999 לקובץ שלך)
        body: "id_list_message=t-הרישום בוצע בהצלחה&"
      };
    } else {
      // אם יש שגיאה (למשל ת"ז כפולה)
      const errorMessage = apiData.Message || "תקלה ברישום";
      // נבדוק אם זה בגלל שהלקוח קיים
      if (errorMessage.includes("כבר רשום")) {
         return {
          statusCode: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          body: "id_list_message=t-הלקוח כבר רשום במערכת&"
        };
      }
      
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: `id_list_message=t-אירעה שגיאה: ${errorMessage}&`
      };
    }

  } catch (error) {
    console.error("System Error:", error);
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: "id_list_message=t-שגיאת תקשורת&"
    };
  }
};