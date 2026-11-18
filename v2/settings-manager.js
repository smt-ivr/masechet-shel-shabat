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
                            <strong style="font-size: 0.95rem; color: var(--text-main);">מצב חיבור:</strong>
                            <span id="settingsYemotStatusBadge" class="badge badge-secondary" style="font-size: 0.85rem; padding: 6px 12px; align-self: flex-start;"><i class="fa fa-spinner fa-spin"></i> בודק סטטוס...</span>
                            <span id="settingsNedarimStatusBadge" class="badge badge-secondary" style="font-size: 0.85rem; padding: 6px 12px; align-self: flex-start;"></span>
                        </div>
                        <button id="refreshStatusBtn" class="btn btn-secondary btn-sm" style="height: 35px;"><i class="fa fa-refresh"></i> רענן בדיקת חיבור</button>
                    </div>
                    
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 15px; background: #eaf1ff; padding: 15px 20px; border-radius: 8px; border: 1px solid #cce0ff; transition: all 0.2s;">
                        <input type="checkbox" id="autoSyncCheck" style="transform: scale(1.4); cursor: pointer;">
                        <strong style="color: var(--primary-color); font-size: 1.05rem;">טען נתונים אוטומטית בפתיחת הדף</strong>
                    </label>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: #fffbea; padding: 12px 20px; border-radius: 8px; border: 1px solid #ffe8a1;">
                        <strong style="font-size: 0.95rem; color: #8a6d00;">הודעת "הפיתוח הושלם" בראש העמוד</strong>
                        <button id="restoreAnnouncementBtn" class="btn btn-secondary btn-sm" style="height: 35px;"><i class="fa fa-eye"></i> הצג שוב</button>
                    </div>

                    <div style="background: #f4f8ff; padding: 15px 20px; border-radius: 8px; border: 1px solid #d6e4ff; color: var(--text-main); font-size: 0.95rem; line-height: 1.6;">
                        <i class="fa fa-lock" style="color: var(--primary-color);"></i>
                        פרטי החיבור לימות המשיח ולנדרים פלוס שמורים בשרת, ומנוהלים על ידי מנהל המערכת בדף הניהול.
                        הם לא נשמרים בדפדפן.
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
        const restoreBtn = document.getElementById('restoreAnnouncementBtn');
        if (restoreBtn) restoreBtn.addEventListener('click', () => {
            if (typeof window.showCompletionAnnouncement === 'function') window.showCompletionAnnouncement();
            if (typeof showAlert === 'function') showAlert('הודעת "הפיתוח הושלם" תוצג שוב בראש העמוד.');
        });
    },

    openModal() {
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
        localStorage.setItem('autoSyncOnLoad', document.getElementById('autoSyncCheck').checked);
        this.closeModal();
        if (typeof showAlert === 'function') showAlert('ההגדרות נשמרו בהצלחה!');
    },

    // בדיקה בשרת: האם הטוקנים של ימות ונדרים שבמסד תקינים
    async checkStatusLive() {
        const icon = document.querySelector('#refreshStatusBtn i');
        const paint = (el, label, st) => {
            if (!el) return;
            if (!st) {
                el.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${label}: בודק...`;
                el.style.color = '#856404'; el.style.backgroundColor = '#fff3cd';
                return;
            }
            el.innerHTML = `<i class="fa ${st.ok ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i> ${label}: ${st.message}`;
            el.style.color = '#fff'; el.style.backgroundColor = st.ok ? '#28a745' : '#dc3545';
        };
        const ym = document.getElementById('settingsYemotStatusBadge');
        const nd = document.getElementById('settingsNedarimStatusBadge');
        paint(ym, 'ימות המשיח'); paint(nd, 'נדרים פלוס');
        if (icon) icon.classList.add('fa-spin');
        try {
            const res = await fetch('/masechet/api/status', { credentials: 'same-origin' });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error && data.error.message);
            paint(ym, 'ימות המשיח', data.data.yemot);
            paint(nd, 'נדרים פלוס', data.data.nedarim);
        } catch (err) {
            paint(ym, 'ימות המשיח', { ok: false, message: 'שגיאת תקשורת בבדיקה' });
            paint(nd, 'נדרים פלוס', { ok: false, message: 'שגיאת תקשורת בבדיקה' });
        }
        if (icon) icon.classList.remove('fa-spin');
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