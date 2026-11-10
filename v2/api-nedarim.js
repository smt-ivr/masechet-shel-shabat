const NedarimAPI = {
    async fetchClientList(mosadId, password) {
        const url = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?Action=GetClient_Table&MosadId=${mosadId}&ApiPassword=${password}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת הסליקה (רשימת לקוחות)');
        return await res.json();
    },

    async fetchClientCard(mosadId, password, clientId) {
        const url = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?Action=GetClientCard&MosadId=${mosadId}&ApiPassword=${password}&ClientId=${clientId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת הסליקה (כרטיס לקוח)');
        return await res.json();
    },

    async saveClient(mosadId, password, clientData, clientId = null) {
        const params = new URLSearchParams({
            Action: 'SaveClientCard',
            MosadId: mosadId,
            ApiPassword: password,
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

        const url = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת נדרים לשמירת הלקוח');
        return await res.json();
    },

    async addClientCard(mosadId, password, clientId, magneticCard) {
        const params = new URLSearchParams({
            Action: 'SetClientMagneticCard',
            MosadId: mosadId,
            ApiPassword: password,
            ClientId: clientId,
            MagneticCard: magneticCard,
            Remove: 0
        });

        const url = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בהוספת כרטיס');
        return await res.json();
    },

    async addTlush(mosadId, password, clientId, amount, expiration, limitedId, comments) {
        const params = new URLSearchParams({
            Action: 'AddTlush',
            MosadId: mosadId,
            ApiPassword: password,
            ClientId: clientId,
            Amount: amount
        });
        if (expiration) params.append('Expiration', expiration);
        if (limitedId) params.append('LimitedId', limitedId);
        if (comments) params.append('Comments', comments);

        const url = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בהוספת טעינה');
        return await res.json();
    },

    async prikatTlush(mosadId, password, tlushId) {
        const params = new URLSearchParams({
            Action: 'PrikatTlush',
            MosadId: mosadId,
            ApiPassword: password,
            TlushId: tlushId
        });

        const url = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בפריקת טעינה');
        return await res.json();
    },

    async fetchLimitedStoresList(mosadId, password) {
        const url = `https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx?Action=GetLimitedStoresList&MosadId=${mosadId}&ApiPassword=${password}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת הסליקה (רשימת קבוצות חנויות)');
        return await res.json();
    }
};