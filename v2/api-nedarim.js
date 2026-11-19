// כל הפניות עוברות דרך השרת (/masechet/api/nedarim), שמוסיף את מספר המוסד ומפתח ה-API מהמסד
const NedarimAPI = {
    async fetchClientList(mosadId, password) {
        const url = `/masechet/api/nedarim?Action=GetClient_Table`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת הסליקה (רשימת לקוחות)');
        return await res.json();
    },

    async fetchClientCard(mosadId, password, clientId) {
        const url = `/masechet/api/nedarim?Action=GetClientCard&ClientId=${clientId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת הסליקה (כרטיס לקוח)');
        return await res.json();
    },

    async saveClient(mosadId, password, clientData, clientId = null) {
        const params = new URLSearchParams({
            Action: 'SaveClientCard',
            Zeout: clientData.zeout || '',
            FirstName: clientData.firstName || '',
            FamilyName: clientData.lastName || '',
            City: clientData.city || '', 
            Address: clientData.address || '',
            Phone1: clientData.phone1 || '',
            Phone2: clientData.phone2 || '',
            Email: clientData.email || '',
            Groupe: clientData.groupe || '',
            Comments: clientData.comments || ''
        });

        if (clientId) {
            params.append('ClientId', clientId);
        }

        const url = `/masechet/api/nedarim?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת נדרים לשמירת הלקוח');
        return await res.json();
    },

    async addClientCard(mosadId, password, clientId, magneticCard) {
        const params = new URLSearchParams({
            Action: 'SetClientMagneticCard',
            ClientId: clientId,
            MagneticCard: magneticCard,
            Remove: 0
        });

        const url = `/masechet/api/nedarim?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בהוספת כרטיס');
        return await res.json();
    },

    async addTlush(mosadId, password, clientId, amount, expiration, limitedId, comments) {
        const params = new URLSearchParams({
            Action: 'AddTlush',
            ClientId: clientId,
            Amount: amount
        });
        if (expiration) params.append('Expiration', expiration);
        if (limitedId) params.append('LimitedId', limitedId);
        if (comments) params.append('Comments', comments);

        const url = `/masechet/api/nedarim?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בהוספת טעינה');
        return await res.json();
    },

    async prikatTlush(mosadId, password, tlushId) {
        const params = new URLSearchParams({
            Action: 'PrikatTlush',
            TlushId: tlushId
        });

        const url = `/masechet/api/nedarim?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בפריקת טעינה');
        return await res.json();
    },

    async fetchLimitedStoresList(mosadId, password) {
        const url = `/masechet/api/nedarim?Action=GetLimitedStoresList`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת הסליקה (רשימת קבוצות חנויות)');
        return await res.json();
    }
};