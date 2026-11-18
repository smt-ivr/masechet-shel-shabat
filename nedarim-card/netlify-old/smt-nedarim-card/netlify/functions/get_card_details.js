// netlify/functions/get_card_details.js

export const handler = async (event, context) => {
  try {
    // 1. קריאת הפרמטרים מימות המשיח
    const params = new URLSearchParams(event.body);
    
    // חילוץ תעודת הזהות 
    const rawId = params.get('ApiEnterID') || "";
    const idNumber = rawId.includes('-') ? rawId.split('-').pop() : rawId;
    
    const mosadId = params.get('MosadId') || "";
    const apiPassword = params.get('ApiPassword') || "";

    if (!idNumber) {
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "text/plain; charset=utf-8" }, 
        // לא הוקש מספר זהות
        body: "id_list_message=f-100&" 
      };
    }

    // ==========================================
    // שלב 2: מציאת מזהה הלקוח (ClientId) לפי ת.ז
    // ==========================================
    const getClientsUrl = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?Action=GetClient_Table&MosadId=${mosadId}&ApiPassword=${apiPassword}`;
    
    const clientsRes = await fetch(getClientsUrl);
    const clientsData = await clientsRes.json();

    if (clientsData.Result !== "OK" || !clientsData.data) {
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "text/plain; charset=utf-8" }, 
        // שגיאה בקבלת נתונים מהמוסד, אנא פנו להנהלה
        body: "id_list_message=f-101&" 
      };
    }

    const client = clientsData.data.find(c => c.Zeout === idNumber);

    if (!client) {
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "text/plain; charset=utf-8" }, 
        // מספר זהות לא קיים במערכת
        body: "id_list_message=f-102&" 
      };
    }

    // ==========================================
    // שלב 3: שליפת נתוני הכרטיס והזכיות
    // ==========================================
    const getCardUrl = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?Action=GetClientCard&MosadId=${mosadId}&ApiPassword=${apiPassword}&ClientId=${client.ClientId}`;

    const cardRes = await fetch(getCardUrl);
    const cardData = await cardRes.json();

    if (cardData.Result !== "OK") {
      return { 
        statusCode: 200, 
        headers: { "Content-Type": "text/plain; charset=utf-8" }, 
        // לא נמצאו נתוני כרטיס עבור לקוח זה
        body: "id_list_message=f-103&" 
      };
    }

    // ==========================================
    // שלב 4: הרכבת ההודעה הקולית (שילוב הקלטות ו-TTS)
    // ==========================================
    let messageParts = [];

    // --- א. פתיח ושם הלקוח ---
    messageParts.push("f-105"); // הקלטה: "שלום"
    
    const fullName = `${cardData.FirstName || ""} ${cardData.FamilyName || ""}`.trim();
    if (fullName) {
      messageParts.push(`t-${fullName}`); // הקראת מחשב: שם הלקוח
    }

    // --- ב. סינון כרטיסים פעילים ---
    // לוקחים רק כרטיסים שהשדה RemovedDate שלהם ריק או לא קיים
    const activeCards = (cardData.Cards || []).filter(c => !c.RemovedDate || c.RemovedDate.trim() === "");

    if (activeCards.length === 0) {
      // מקרה שבו אין כרטיס פעיל כלל - המערכת מודיעה ועוצרת כאן!
      messageParts.push("f-106"); // הקלטה: "לא נמצא כרטיס מגנטי..."
    } else {
      // --- יש כרטיסים פעילים: נמשיך להקריא את מספרי הכרטיסים, היתרה והזכיות ---
      
      if (activeCards.length === 1) {
        // כרטיס פעיל אחד
        const last4 = activeCards[0].CardNumber.slice(-4);
        messageParts.push("f-107"); // הקלטה: "להלן נתוני כרטיס..." (לשון יחיד)
        messageParts.push(`d-${last4}`); 
      } else {
        // יותר מכרטיס פעיל אחד
        messageParts.push("f-118"); // הקלטה: "להלן נתוני כרטיסי..." (לשון רבים)
        activeCards.forEach((card, index) => {
          const last4 = card.CardNumber.slice(-4);
          messageParts.push(`d-${last4}`); 
          
          if (index < activeCards.length - 1) {
            messageParts.push("f-110"); // הקלטה: "ו..."
          }
        });
      }

      // --- ג. עיבוד היתרה (מושמע רק אם יש כרטיס, גם אם היתרה 0) ---
      const balanceStr = cardData.TotalFreeAmount.replace('₪', '').trim();
      const balanceAmount = parseFloat(balanceStr) || 0;
      const shekels = Math.floor(balanceAmount);
      const agorot = Math.round((balanceAmount - shekels) * 100);

      messageParts.push("f-108"); // הקלטה: "יתרתכם העדכנית היא"

      if (shekels === 0 && agorot === 0) {
        messageParts.push("n-0"); 
        messageParts.push("f-109"); // הקלטה: "שקלים"
      } else if (agorot === 0) {
        messageParts.push(`n-${shekels}`); 
        messageParts.push("f-109"); // הקלטה: "שקלים"
      } else {
        messageParts.push(`n-${shekels}`); 
        messageParts.push("f-109"); // הקלטה: "שקלים"
        messageParts.push("f-110"); // הקלטה: "ו..."
        messageParts.push(`n-${agorot}`); 
        messageParts.push("f-111"); // הקלטה: "אגורות"
      }

      // --- ד. פירוט הזכיות (מהחדש לישן) ---
      if (cardData.Tlushim && cardData.Tlushim.length > 0) {
        messageParts.push("f-112"); // הקלטה: "להלן פירוט הזכיות שלכם, מהחדש לישן"

        const sortedTlushim = cardData.Tlushim.sort((a, b) => {
          const [dayA, monthA, yearA] = a.Date.split('/');
          const [dayB, monthB, yearB] = b.Date.split('/');
          return new Date(`20${yearB}-${monthB}-${dayB}`) - new Date(`20${yearA}-${monthA}-${dayA}`);
        });

        sortedTlushim.forEach((tlush, index) => {
          if (index > 0) {
            messageParts.push("f-114"); // הקלטה: "הזכיה הקודמת"
          }

          messageParts.push("f-113"); // הקלטה: "זכיה"
          messageParts.push(`t-${tlush.Comments}`); // הקראת מחשב: פירוט הזכיה
          
          messageParts.push("f-115"); // הקלטה: "על סכום"
          messageParts.push(`n-${tlush.Amount}`); 
          messageParts.push("f-109"); // הקלטה: "שקלים"

          const [day, month, shortYear] = tlush.Date.split('/');
          const fullYear = `20${shortYear}`;
          messageParts.push("f-116"); // הקלטה: "הוטען לכם בתאריך"
          messageParts.push(`date-${day}/${month}/${fullYear}`); 
        });
      }

      // סיום (מושמע רק למי שיש לו כרטיס)
      messageParts.push("f-117"); // הקלטה: "עד כאן נתוני הכרטיס"
    }

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
      body: "id_list_message=f-104&" 
    };
  }
};