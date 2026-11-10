const SettingsManager = {
    modalId: 'settingsModal',

    init() {
        this.injectHTML();
        this.bindEvents();
    },

    injectHTML() {
        if (document.getElementById(this.modalId)) return;
        const html = `
        <div id="${this.modalId}" class="modal-overlay hidden" style="z-index: 3000;">
            <div class="modal-content" style="max-width: 700px; width: 95%;">
                <div class="modal-header" style="background: #f8f9fa; border-bottom: 1px solid var(--border-light);">
                    <h2 style="font-size: 1.3rem;"><i class="fa fa-cogs" style="color: var(--primary-color);"></i> הגדרות מערכת</h2>
                    <button id="closeSettingsBtn" class="close-btn"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding: 25px;">
                    
                    <div style="background: #fff; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px; border: 1px solid var(--border-light); box-shadow: 0 2px 5px rgba(0,0,0,0.02); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <strong style="font-size: 0.95rem; color: var(--text-main);">מצב חיבור מערכת טלפונית:</strong>
                            <span id="settingsYemotStatusBadge" class="badge badge-secondary" style="font-size: 0.85rem; padding: 6px 12px; align-self: flex-start;"><i class="fa fa-spinner fa-spin"></i> בודק סטטוס...</span>
                        </div>
                        <button id="refreshStatusBtn" class="btn btn-secondary btn-sm" style="height: 35px;"><i class="fa fa-refresh"></i> רענן בדיקת חיבור</button>
                    </div>
                    
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 25px; background: #eaf1ff; padding: 15px 20px; border-radius: 8px; border: 1px solid #cce0ff; transition: all 0.2s;">
                        <input type="checkbox" id="autoSyncCheck" style="transform: scale(1.4); cursor: pointer;"> 
                        <strong style="color: var(--primary-color); font-size: 1.05rem;">טען נתונים אוטומטית בפתיחת הדף</strong>
                    </label>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div style="background: #fdfdfd; padding: 20px; border: 1px solid var(--border-light); border-radius: 8px;">
                            <h4 style="margin-bottom: 20px; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 8px; display: inline-block;"><i class="fa fa-phone-square"></i> מערכת טלפונית</h4>
                            <div class="form-group">
                                <label>מספר מערכת (Username):</label>
                                <input type="text" id="yemotUsername" placeholder="הכנס מספר מערכת...">
                            </div>
                            <div class="form-group">
                                <label>סיסמה (Password):</label>
                                <input type="password" id="yemotPassword" placeholder="הכנס סיסמת ניהול...">
                            </div>
                            <div class="form-group">
                                <label>Token (אם ריק, ייווצר אוטומטית):</label>
                                <input type="text" id="yemotToken" placeholder="הכנס טוקן חיבור..." dir="ltr" style="text-align: left;">
                            </div>
                        </div>
                        
                        <div style="background: #fdfdfd; padding: 20px; border: 1px solid var(--border-light); border-radius: 8px;">
                            <h4 style="margin-bottom: 20px; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 8px; display: inline-block;"><i class="fa fa-credit-card"></i> נדרים כארד</h4>
                            <div class="form-group">
                                <label>MosadId (מספר מוסד):</label>
                                <input type="text" id="nedarimMosadId" placeholder="הכנס מזהה מוסד...">
                            </div>
                            <div class="form-group">
                                <label>ApiPassword (סיסמת API):</label>
                                <input type="password" id="nedarimPassword" placeholder="הכנס סיסמת סליקה...">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 12px; background: #f8f9fa; border-top: 1px solid var(--border-light);">
                    <button id="cancelSettingsBtn" class="btn btn-secondary" style="padding: 8px 20px; font-size: 1rem;">ביטול</button>
                    <button id="saveSettingsBtn" class="btn btn-primary" style="padding: 8px 20px; font-size: 1rem;"><i class="fa fa-save"></i> שמור הגדרות</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    bindEvents() {
        document.getElementById('openSettingsBtn').addEventListener('click', () => this.openModal());
        document.getElementById('closeSettingsBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelSettingsBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveData());
        document.getElementById('refreshStatusBtn').addEventListener('click', () => this.checkStatusLive());
    },

    openModal() {
        document.getElementById('yemotUsername').value = localStorage.getItem('yemotUsername') || '';
        document.getElementById('yemotPassword').value = localStorage.getItem('yemotPassword') || '';
        document.getElementById('yemotToken').value = localStorage.getItem('yemotToken') || '';
        document.getElementById('nedarimMosadId').value = localStorage.getItem('nedarimMosadId') || '';
        document.getElementById('nedarimPassword').value = localStorage.getItem('nedarimPassword') || '';
        
        const isAutoSync = localStorage.getItem('autoSyncOnLoad') !== 'false';
        document.getElementById('autoSyncCheck').checked = isAutoSync;
        
        document.getElementById(this.modalId).classList.remove('hidden');
        
        // בדיקת חיבור חיה בעת פתיחת החלון
        this.checkStatusLive();
    },

    closeModal() {
        document.getElementById(this.modalId).classList.add('hidden');
    },

    saveData() {
        localStorage.setItem('yemotUsername', document.getElementById('yemotUsername').value.trim());
        localStorage.setItem('yemotPassword', document.getElementById('yemotPassword').value.trim());
        localStorage.setItem('yemotToken', document.getElementById('yemotToken').value.trim());
        localStorage.setItem('nedarimMosadId', document.getElementById('nedarimMosadId').value.trim());
        localStorage.setItem('nedarimPassword', document.getElementById('nedarimPassword').value.trim());
        localStorage.setItem('autoSyncOnLoad', document.getElementById('autoSyncCheck').checked);
        
        this.closeModal();
        
        // הצגת הודעת אישור מעוצבת ורענון אם צריך
        if(typeof showAlert === 'function') {
            showAlert('ההגדרות נשמרו בהצלחה במערכת!');
        }
    },

    async checkStatusLive() {
        const badge = document.getElementById('settingsYemotStatusBadge');
        const icon = document.querySelector('#refreshStatusBtn i');
        
        badge.innerHTML = '<i class="fa fa-spinner fa-spin"></i> בודק סטטוס חיבור מול ימות המשיח...';
        badge.style.color = '#856404';
        badge.style.backgroundColor = '#fff3cd';
        
        if(icon) icon.classList.add('fa-spin');

        try {
            let currentToken = document.getElementById('yemotToken').value.trim() || localStorage.getItem('yemotToken');
            
            if (!currentToken) {
                badge.innerHTML = '<i class="fa fa-times-circle"></i> חסר טוקן חיבור במערכת';
                badge.style.color = '#fff'; badge.style.backgroundColor = '#dc3545';
                if(icon) icon.classList.remove('fa-spin');
                return;
            }
            
            // בדיקה אמיתית מול שרתי ימות המשיח
            if (typeof YemotAPI !== 'undefined' && YemotAPI.checkMFA) {
                const mfaRes = await YemotAPI.checkMFA(currentToken, 'isPass');
                if (mfaRes.responseStatus === "OK" && mfaRes.isPass) {
                    badge.innerHTML = `<i class="fa fa-check-circle"></i> מחובר ותקין (${mfaRes.passReason || 'MFA'})`;
                    badge.style.color = '#fff'; badge.style.backgroundColor = '#28a745';
                } else {
                    badge.innerHTML = '<i class="fa fa-exclamation-triangle"></i> טוקן פג תוקף / נדרש אימות';
                    badge.style.color = '#fff'; badge.style.backgroundColor = '#dc3545';
                }
            } else {
                badge.innerHTML = '<i class="fa fa-info-circle"></i> לא ניתן לבדוק כרגע';
            }
        } catch (err) {
            badge.innerHTML = '<i class="fa fa-times-circle"></i> שגיאת תקשורת בבדיקה';
            badge.style.color = '#fff'; badge.style.backgroundColor = '#dc3545';
        }
        if(icon) icon.classList.remove('fa-spin');
    }
};

// פונקציה גלובלית שמאפשרת למקומות אחרים בקוד (כמו auth.js) לעדכן את התגית בחלון
window.updateSettingsStatus = function(statusText, isSuccess) {
    const badge = document.getElementById('settingsYemotStatusBadge');
    if (badge) {
        badge.innerHTML = isSuccess ? `<i class="fa fa-check-circle"></i> ${statusText}` : `<i class="fa fa-exclamation-triangle"></i> ${statusText}`;
        badge.style.color = isSuccess ? '#155724' : '#721c24';
        badge.style.backgroundColor = isSuccess ? '#d4edda' : '#f8d7da';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    SettingsManager.init();
});