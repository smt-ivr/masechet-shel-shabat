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

// החיבור לימות המשיח ולנדרים נעשה בשרת, עם הטוקנים שבמסד.
// הדפדפן לא שומר טוקן או סיסמה – רק ממתינים שהמשתמש יהיה מחובר למערכת.
async function authenticateYemot() {
    const yemotBanner = document.getElementById('yemotErrorBanner');
    if (yemotBanner) yemotBanner.classList.add('hidden');
    if (typeof mfaBanner !== 'undefined' && mfaBanner) mfaBanner.classList.add('hidden');

    await MsSession.ready();
    if (typeof window.updateSettingsStatus === 'function') window.updateSettingsStatus('מחובר דרך השרת', true);
    return 'server';
}
