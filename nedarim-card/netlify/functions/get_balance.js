// netlify/functions/get_balance.js

export const handler = async (event, context) => {
  try {
    // 1. קבלת פרמטרים מימות המשיח
    const params = event.queryStringParameters;
    const cardNumber = params.PrintedNumber || ""; 
    const allowedMosadIdsStr = params.MosadId || ""; // למשל: "45689-57964"

    // בדיקה שהוזן מספר כרטיס
    if (!cardNumber) {
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "text/plain; charset=utf-8" }, 
        body: "id_list_message=f-001&" 
      };
    }

    // 2. הכנת הנתונים לשליחה לשרת של נדרים פלוס
    const formData = new URLSearchParams();
    formData.append('MagneticCard', cardNumber);

    // שליחת הבקשה
    const apiRes = await fetch('https://www.matara.pro/NedarimPlus/Mechubad/Manage.aspx?Action=GetCardTlushim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });

    const data = await apiRes.json();

    // 3. טיפול בשגיאות מצד השרת של נדרים פלוס
    if (data.Result === "Error") {
      if (data.Message === "מספר כרטיס קצר מידי.") {
        return { 
          statusCode: 200, 
          headers: { "Content-Type": "text/plain; charset=utf-8" }, 
          // משמיע: "מספר כרטיס קצר מדי" + "אנא נסו שנית"
          body: "id_list_message=f-002.f-003&" 
        };
      }
      if (data.Message === "טעות בהקלדת מספר כרטיס.") {
        return { 
          statusCode: 200, 
          headers: { "Content-Type": "text/plain; charset=utf-8" }, 
          // משמיע: "טעות בהקלדת מספר כרטיס" + "אנא נסו שנית"
          body: "id_list_message=f-004.f-003&" 
        };
      }
      // שגיאה כללית אחרת
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "text/plain; charset=utf-8" }, 
        // משמיע: "שגיאה בבדיקת הכרטיס" + "אנא פנו להנהלה"
        body: "id_list_message=f-005.f-006&" 
      };
    }

    // 4. בדיקת שייכות למוסד
    if (allowedMosadIdsStr) {
      const allowedIds = allowedMosadIdsStr.split('-').map(id => id.trim());
      const cardMosadId = String(data.Manpik_MosadId);

      if (!allowedIds.includes(cardMosadId)) {
        return { 
          statusCode: 200, 
          headers: { "Content-Type": "text/plain; charset=utf-8" }, 
          // משמיע: "הכרטיס אינו שייך למוסד זה..."
          body: "id_list_message=f-007&" 
        };
      }
    }

    // 5. שליפת היתרה העדכנית
    let amount = 0;
    if (data.Total && data.Total.length > 0) {
      amount = parseFloat(data.Total[0].Amount);
    }

    // 6. חלוקה לשקלים ואגורות
    const shekels = Math.floor(amount);
    const agorot = Math.round((amount - shekels) * 100);

    // מתחילים עם "היתרה העדכנית בכרטיס היא" (008)
    let messageParts = ["f-008"];

    if (shekels === 0 && agorot === 0) {
      // מקרה 1: יתרה 0 בדיוק
      messageParts.push("n-0");
      messageParts.push("f-009"); // "שקלים"
    } else if (agorot === 0) {
      // מקרה 2: שקלים שלמים בלבד
      messageParts.push(`n-${shekels}`);
      messageParts.push("f-009"); // "שקלים"
    } else {
      // מקרה 3: יש אגורות (תמיד נציין את השקלים, גם אם הם 0)
      messageParts.push(`n-${shekels}`);
      messageParts.push("f-009"); // "שקלים"
      messageParts.push("f-010"); // "ו..." (ו' החיבור)
      messageParts.push(`n-${agorot}`);
      messageParts.push("f-011"); // "אגורות"
    }

    // צירוף כל חלקי ההודעה עם נקודה מפרידה
    const finalString = messageParts.join('.') + '&';

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: `id_list_message=${finalString}`
    };

  } catch (error) {
    console.error("System Error:", error);
    return { 
      statusCode: 200, 
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      // משמיע: "אירעה שגיאה פנימית במערכת" + "נסו שוב מאוחר יותר"
      body: "id_list_message=f-012.f-013&" 
    };
  }
};