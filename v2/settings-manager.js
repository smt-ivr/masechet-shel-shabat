const SettingsManager = {
    modalId: 'settingsModal',

    init() {
        this.injectHTML();
        this.bindEvents();
    },

    injectHTML() {
        if (document.getElementById(this.modalId)) return;
        const box = 'background: #fff; padding: 15px 20px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border-light); box-shadow: 0 2px 5px rgba(0,0,0,0.02);';
        const html = `
        <div id="${this.modalId}" class="modal-overlay hidden" style="z-index: 3000;">
            <div class="modal-content" style="max-width: 700px; width: 95%;">
                <div class="modal-header" style="background: #f8f9fa; border-bottom: 1px solid var(--border-light);">
                    <h2 style="font-size: 1.3rem;"><i class="fa fa-user-circle" style="color: var(--primary-color);"></i> פרטי חיבור</h2>
                    <button id="closeSettingsBtn" class="close-btn"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding: 25px;">

                    <div style="${box} display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <div style="display: flex; flex-direction: column; gap: 5px;">
                            <strong style="font-size: 0.95rem; color: var(--text-main);">מצב החיבור:</strong>
                            <span id="settingsYemotStatusBadge" class="badge badge-secondary" style="font-size: 0.85rem; padding: 6px 12px; align-self: flex-start;"><i class="fa fa-spinner fa-spin"></i> בודק סטטוס...</span>
                            <span id="settingsNedarimStatusBadge" class="badge badge-secondary" style="font-size: 0.85rem; padding: 6px 12px; align-self: flex-start;"></span>
                        </div>
                        <button id="refreshStatusBtn" class="btn btn-secondary btn-sm" style="height: 35px;"><i class="fa fa-refresh"></i> רענן בדיקת חיבור</button>
                    </div>

                    <div style="${box}">
                        <strong style="font-size: 0.95rem; color: var(--text-main);">המשתמש שלך:</strong>
                        <div id="infoUserName" style="margin-top: 6px; font-size: 1rem;"></div>
                        <div id="infoUserMethod" style="margin-top: 4px; color: var(--text-muted); font-size: 0.9rem;"></div>
                        <div id="infoUserPerms" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;"></div>
                    </div>

                    <div style="${box}">
                        <strong style="font-size: 0.95rem; color: var(--text-main);"><i class="fa fa-envelope"></i> הודעות:</strong>
                        <div id="infoMessages" style="margin-top: 8px; max-height: 260px; overflow: auto;"></div>
                    </div>

                    <div style="${box} display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <div>
                            <strong style="font-size: 0.95rem; color: var(--text-main);">סינון מילים:</strong>
                            <div id="infoFilterMode" style="margin-top: 4px; color: var(--text-muted); font-size: 0.9rem;"></div>
                        </div>
                        <button id="infoFilterToggle" class="btn btn-secondary btn-sm" style="height: 35px;"></button>
                    </div>

                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 12px; background: #f8f9fa; border-top: 1px solid var(--border-light);">
                    <button id="cancelSettingsBtn" class="btn btn-primary" style="padding: 8px 24px; font-size: 1rem;">סגור</button>
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
        document.getElementById('refreshStatusBtn').addEventListener('click', () => this.checkStatusLive());
    },

    PERM_NAMES: {
        clients_view: 'צפייה בלקוחות', clients_edit: 'עריכת לקוחות', nedarim_charge: 'טעינות וכרטיסים',
        exams_view: 'צפייה במבחנים', exams_manage: 'ניהול מבחנים', old_site: 'אתר ישן', admin: 'ניהול המערכת',
    },

    renderUser() {
        const u = typeof MsSession !== 'undefined' ? MsSession.user() : null;
        if (!u) return;
        document.getElementById('infoUserName').innerHTML = '<i class="fa fa-user-circle"></i> ';
        document.getElementById('infoUserName').append(u.name);
        const method = { password: 'נכנסת עם סיסמה', ip: 'נכנסת לפי כתובת IP מורשית', google: 'נכנסת עם Google' }[u.method] || '';
        document.getElementById('infoUserMethod').textContent = method;
        const perms = document.getElementById('infoUserPerms');
        perms.innerHTML = '';
        (u.is_admin ? ['admin'] : (u.permissions || [])).forEach((p) => {
            const tag = document.createElement('span');
            tag.className = 'badge badge-secondary';
            tag.style.cssText = 'font-size: 0.8rem; padding: 4px 10px; background: #eef2f8; color: var(--primary-color);';
            tag.textContent = this.PERM_NAMES[p] || p;
            perms.append(tag);
        });
    },

    renderFilterMode() {
        if (typeof MsSession === 'undefined') return;
        const off = MsSession.isUnfiltered();
        document.getElementById('infoFilterMode').textContent = off
            ? 'מוצג טקסט מלא בחיבור הזה (למחשב בלי נטפרי)'
            : 'פעיל – מילים לא ראויות מוחלפות ב-*** (מתאים לנטפרי)';
        const btn = document.getElementById('infoFilterToggle');
        btn.innerHTML = off ? '<i class="fa fa-filter"></i> חזרה לטקסט מסונן' : '<i class="fa fa-eye"></i> הצג טקסט מלא';
        btn.onclick = () => MsSession.setFilterMode(!off);
    },

    renderMessages() {
        const el = document.getElementById('infoMessages');
        if (!el || typeof MsSession === 'undefined') return;
        const esc = MsSession.escHtml;
        const list = MsSession.messages();
        if (!list.length) { el.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem;">אין הודעות</div>'; return; }
        const openIds = new Set([...el.querySelectorAll('details[open]')].map((d) => d.dataset.id)); // נשארות פתוחות אחרי רענון
        el.innerHTML = list.map((m) => `
            <details style="border: 1px solid var(--border-light); border-radius: 6px; padding: 8px 12px; margin-bottom: 6px; background: ${m.read_at ? '#fff' : '#f4f8ff'};" data-id="${m.id}" ${!m.read_at ? 'data-unread="1"' : ''} ${openIds.has(String(m.id)) ? 'open' : ''}>
                <summary style="cursor: pointer; display: flex; justify-content: space-between; gap: 10px; align-items: center;">
                    <span style="${m.read_at ? '' : 'font-weight: 600;'}">${m.important ? '<i class="fa fa-exclamation-circle" style="color: #dc3545;"></i> ' : ''}${esc(m.title)}</span>
                    <span style="color: var(--text-muted); font-size: 0.8rem; white-space: nowrap;">${esc(m.created_at)}</span>
                </summary>
                <div style="white-space: pre-line; margin-top: 8px; font-size: 0.95rem; line-height: 1.6;">${esc(m.body)}</div>
                <div style="margin-top: 6px; color: var(--text-muted); font-size: 0.8rem;">${esc(m.created_by_name || '')}${m.read_at ? ' · נקראה ' + esc(m.read_at) : ''}</div>
            </details>`).join('');
        // פתיחת הודעה = קריאה
        el.querySelectorAll('details[data-unread]').forEach((d) => d.addEventListener('toggle', () => {
            if (d.open && d.dataset.unread) { delete d.dataset.unread; MsSession.markRead(Number(d.dataset.id)); }
        }, { once: true }));
    },

    openModal() {
        const toast = document.getElementById('msMsgToast');
        if (toast) toast.style.display = 'none'; // ההודעות מוצגות כאן
        this.renderUser();
        this.renderMessages();
        this.renderFilterMode();
        document.getElementById(this.modalId).classList.remove('hidden');
        // בדיקת חיבור חיה בעת פתיחת החלון
        this.checkStatusLive();
    },

    closeModal() {
        document.getElementById(this.modalId).classList.add('hidden');
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