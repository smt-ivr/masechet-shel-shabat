// פונקציית עזר להצגת השגיאה של ימות בתוך המסך
function displayYemotError(message) {
    const banner = document.getElementById('yemotErrorBanner');
    const msgSpan = document.getElementById('yemotErrorMessage');
    if (banner && msgSpan) {
        msgSpan.textContent = message;
        banner.classList.remove('hidden');
    }
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.classList.add('hidden');
    
    const stats = document.getElementById('statsCardsContainer');
    if (stats) stats.classList.add('hidden');
}

async function authenticateYemot() {
    const yemotBanner = document.getElementById('yemotErrorBanner');
    if(yemotBanner) yemotBanner.classList.add('hidden');
    
    mfaBanner.classList.add('hidden');
    updateSettingsStatus('טוען...', false);
    
    let token = localStorage.getItem('yemotToken');
    const username = localStorage.getItem('yemotUsername');
    const password = localStorage.getItem('yemotPassword');

    if (!token && (!username || !password)) {
        displayYemotError('אנא הזן טוקן או פרטי משתמש בהגדרות כדי להתחבר.');
        updateSettingsStatus('חסרים פרטי התחברות', false);
        return null;
    }

    loadingIndicator.classList.remove('hidden');

    try {
        if (!token && username && password) {
            const loginRes = await YemotAPI.login(username, password);
            if (loginRes.responseStatus === "OK") {
                token = loginRes.token;
                localStorage.setItem('yemotToken', token);
            } else { throw new Error("שם משתמש או סיסמה שגויים."); }
        }

        let mfaRes = await YemotAPI.checkMFA(token, 'isPass');

        if (mfaRes.responseStatus !== "OK") {
            if (username && password) {
                const loginRes = await YemotAPI.login(username, password);
                if (loginRes.responseStatus === "OK") {
                    token = loginRes.token;
                    localStorage.setItem('yemotToken', token);
                    mfaRes = await YemotAPI.checkMFA(token, 'isPass'); 
                    if(mfaRes.responseStatus !== "OK") throw new Error("שגיאה באימות דו-שלבי.");
                } else { throw new Error("פרטי ההתחברות שגויים."); }
            } else { throw new Error("הטוקן שגוי ואין פרטי משתמש להתחברות."); }
        }

        if (mfaRes.isPass) {
            updateSettingsStatus('מחובר (' + (mfaRes.passReason || 'MFA') + ')', true);
            return token;
        }

        mfaRes = await YemotAPI.checkMFA(token, 'try');
        if (mfaRes.isPass) {
            updateSettingsStatus('מחובר (' + (mfaRes.passReason || 'MFA_SKIP') + ')', true);
            return token;
        }

        mfaLink.href = `https://call2all.co.il/ym/mfa.php?mode=SSO&ymapitoken=${token}&callback=https://call2all.co.il`;
        loadingIndicator.classList.add('hidden');
        mfaBanner.classList.remove('hidden');
        updateSettingsStatus('נדרש אימות MFA', false);
        return null;

    } catch (error) {
        displayYemotError(error.message || 'שגיאת התחברות.');
        updateSettingsStatus('שגיאת התחברות', false);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    mfaRefreshBtn.addEventListener('click', () => {
        mfaBanner.classList.add('hidden');
        syncBtn.click();
    });
});