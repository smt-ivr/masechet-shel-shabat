// ============================================================
//  session.js — מסך הכניסה (אותה לוגיקה של אסיפה, סיסמה בלבד)
//  כניסה שמורה → האתר נפתח מיד (מסך הכניסה לא מוצג), והכניסה נבדקת מול השרת ברקע.
//  אחרת: הטופס פתוח מיד, ובמקביל בדיקת IP מורשית (כניסה אוטומטית רק אם עוד לא הקלידו).
//  החיבור עצמו בעוגייה מאובטחת בשרת. בדפדפן נשמר רק שם המשתמש לתצוגה (ms_user) – לא טוקנים.
//  בכניסה: טוקנים וסיסמאות ישנים נמחקים מהדפדפן, והשרת מקבל דיווח מה נמצא ונמחק.
// ============================================================

// ===== הכתובות בימות שהאתר עובד איתן – נטענות מהשרת (הגדרות הניהול) אחרי הכניסה =====
window.MS_PATHS = {
    clients_file: 'EnterID/ListAllInformation.ini',
    points_file: 'Points/Split/points_total.ini',
    points_report: 'Points/Split/points_total.ymgr',
    recordings_folder: '1/2/1/Record',
    exam_folder: '2/1',
    archive_folder: '2/1/מבחנים-קודמים',
};
// msPath('exam_folder') → "2/1"   ·   msIvr('exam_folder', 'examination.ini') → "ivr2:/2/1/examination.ini"
window.msPath = (key) => String(window.MS_PATHS[key] || '').replace(/^\/+|\/+$/g, '');
window.msIvr = (key, sub) => 'ivr2:/' + window.msPath(key) + (sub ? '/' + sub : '');

const MsSession = (() => {
    const API = '/masechet/api/';
    const USER_KEY = 'ms_user';
    const CLEAN_FLAG = 'msBrowserCleanupReported';
    // מפתחות ישנים שבהם נשמרו טוקנים וסיסמאות (באתר החדש ובאתר הישן)
    const LEGACY_KEYS = [
        'yemotToken', 'yemotUsername', 'yemotPassword', 'nedarimMosadId', 'nedarimPassword',
        'msAdminToken', 'ymgr_apiToken', 'ymgr_systemNumber', 'ymgr_password',
    ];

    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    };

    let user = null;
    let resolveReady;
    const readyPromise = new Promise((r) => { resolveReady = r; });
    const rawFetch = window.fetch.bind(window);
    const $ = (id) => document.getElementById(id);

    // timeoutMs — הבדיקות ברקע לא נתקעות לעולם
    async function call(method, path, body, timeoutMs = 15000) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let res;
        try {
            res = await rawFetch(API + path, {
                method, credentials: 'same-origin', signal: ctrl.signal,
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (e) {
            throw new Error(e.name === 'AbortError' ? 'השרת לא ענה בזמן, נסו שוב' : 'אין חיבור לשרת');
        } finally {
            clearTimeout(timer);
        }
        const data = await res.json().catch(() => null);
        if (!data || !data.ok) {
            const e = new Error(data && data.error ? data.error.message : 'אין חיבור לשרת');
            e.status = res.status;
            throw e;
        }
        return data.data;
    }

    function clearSession() { store.del(USER_KEY); }
    // נשמר רק מה שצריך כדי לצייר את הפס העליון מיד (שם, הרשאות, מצב ההודעה) – לא טוקנים
    function savedAnnouncement() {
        try { return (JSON.parse(store.get(USER_KEY) || 'null') || {}).announcement || null; } catch (e) { return null; }
    }
    function saveSession(u) {
        const ann = (u && u.announcement) || savedAnnouncement();
        store.set(USER_KEY, JSON.stringify(Object.assign({}, u, ann ? { announcement: ann } : {})));
    }

    // ===== ניקוי הדפדפן =====
    async function cleanBrowser() {
        store.del('completionAnnouncementDismissed'); // הסגירה נשמרת עכשיו בחשבון
        store.del('autoSyncOnLoad'); // הנתונים נטענים תמיד אחרי הכניסה
        const found = LEGACY_KEYS.filter((k) => store.get(k) !== null);
        found.forEach((k) => store.del(k));
        // מדווחים תמיד כשנמצא משהו, ופעם אחת לכל דפדפן גם כשהוא נקי
        if (!found.length && store.get(CLEAN_FLAG) === '1') return;
        try {
            await call('POST', 'client/browser-cleanup', { found }, 8000);
            store.set(CLEAN_FLAG, '1');
        } catch (e) { /* ננסה בכניסה הבאה */ }
    }

    // ===== פס עליון: שם, ניהול, יציאה (בעיצוב הקיים של האתר) =====
    function renderTopBar() {
        // הכפתורים כתובים ב-HTML; כאן רק מעדכנים (בלי להוסיף/להזיז אלמנטים)
        if (typeof window.msRenderTopBar === 'function') window.msRenderTopBar(Object.assign({}, user, { announcement: savedAnnouncement() }));
        const out = $('logoutBtn');
        if (out) out.onclick = user.method === 'ip' ? openPasswordLogin : logout;
    }

    function showSite() {
        const overlay = $('auth-overlay');
        if (overlay) overlay.style.display = 'none';
        document.documentElement.classList.remove('ms-auth-pending');
        document.body.classList.remove('ms-locked');
    }

    // חזרה למסך הכניסה (כניסה שפגה באמצע העבודה)
    let loginAgainShown = false;
    function showLoginAgain(message) {
        if (loginAgainShown) return;
        loginAgainShown = true;
        clearSession();
        const flicker = $('noFlickerStyle');
        if (flicker) flicker.remove();
        document.documentElement.classList.add('ms-auth-pending');
        document.body.classList.add('ms-locked');
        const overlay = $('auth-overlay');
        overlay.style.display = '';
        $('lgCancel').classList.add('hidden');
        $('authMessage').innerHTML = `<i class="fa fa-lock"></i>${message}`;
        resetButton();
        $('passwordInput').value = '';
        $('passwordInput').focus();
        // אחרי כניסה מחדש – טוענים את האתר מחדש כדי שהנתונים יעלו נקי
        reloadAfterLogin = true;
        // קודם בודקים IP מורשה – אם המחשב מורשה, נכנסים שוב אוטומטית
        call('POST', 'auth/login', {}, 8000)
            .then((r) => { if (r.authorized && !$('passwordInput').value) finish(r.user); })
            .catch(() => {});
    }

    // מסך הכניסה מעל האתר, כשכבר מחוברים (לפי IP) – כניסה בסיסמה, עם אפשרות ביטול
    function openPasswordLogin() {
        const overlay = $('auth-overlay');
        const flicker = $('noFlickerStyle');
        if (flicker) flicker.remove();
        overlay.style.display = '';
        document.body.classList.add('ms-locked');
        $('authMessage').innerHTML = `<i class="fa fa-lock"></i>מחוברים לפי כתובת IP כ"${user.name}". הזינו סיסמה כדי להתחבר בסיסמה`;
        $('loginError').classList.add('hidden');
        $('lgCancel').classList.remove('hidden');
        resetButton();
        $('passwordInput').value = '';
        $('passwordInput').focus();
        reloadAfterLogin = true;
    }
    function closePasswordLogin() {
        $('auth-overlay').style.display = 'none';
        document.body.classList.remove('ms-locked');
        $('lgCancel').classList.add('hidden');
        reloadAfterLogin = false;
    }

    let reloadAfterLogin = false;
    let done = false;

    async function finish(u) {
        user = u;
        saveSession(u);
        applyPermissions();
        if (reloadAfterLogin) return location.reload();
        if (done) { renderTopBar(); return; }
        done = true;
        renderTopBar();
        showSite();
        await loadPaths();
        resolveReady(u);
        cleanBrowser();
        loadAnnouncement();
        loadMessages();
        setInterval(loadMessages, 90000); // הודעות חדשות נבדקות כל דקה וחצי
    }

    async function loadPaths() {
        try { Object.assign(window.MS_PATHS, (await call('GET', 'config', null, 8000)).paths || {}); } catch (e) { /* ברירת המחדל */ }
    }

    // ===== הודעות מהמנהל =====
    let messages = [];
    const shownToasts = new Set();
    const shownPopups = new Set();
    const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    async function loadMessages() {
        let r;
        try { r = await call('GET', 'messages', null, 8000); } catch (e) { return; }
        messages = r.messages || [];
        const badge = $('msMsgBadge');
        if (badge) {
            badge.textContent = r.unread > 9 ? '9+' : String(r.unread);
            badge.style.display = r.unread ? '' : 'none';
        }
        const unseen = messages.filter((m) => !m.seen_at && !m.read_at).map((m) => m.id);
        if (unseen.length) call('POST', 'messages/seen', { ids: unseen }, 8000).catch(() => {});
        // הודעה חשובה שלא נקראה – קופצת
        const important = messages.find((m) => m.important && !m.read_at && !shownPopups.has(m.id));
        if (important) showImportant(important);
        // הודעה רגילה חדשה – הודעה קטנה בפינה
        const fresh = messages.filter((m) => !m.important && !m.read_at && !m.seen_at && !shownToasts.has(m.id));
        if (fresh.length) showToast(fresh);
        if (typeof SettingsManager !== 'undefined' && SettingsManager.renderMessages) SettingsManager.renderMessages();
    }

    async function markRead(id) {
        try { await call('POST', `messages/${id}/read`, null, 8000); } catch (e) { /* ננסה שוב בפעם הבאה */ }
        await loadMessages();
    }

    function showImportant(m) {
        shownPopups.add(m.id);
        let box = $('msImportantMsg');
        if (!box) {
            box = document.createElement('div');
            box.id = 'msImportantMsg';
            box.className = 'modal-overlay';
            box.style.zIndex = '9500';
            document.body.appendChild(box);
        }
        box.innerHTML = `
            <div class="modal-content" style="max-width: 520px; width: 95%;" role="alertdialog" aria-labelledby="msImpTitle">
                <div class="modal-header" style="background: #fff3cd; border-bottom: 1px solid #ffeeba;">
                    <h2 id="msImpTitle" style="font-size: 1.2rem; color: #856404;"><i class="fa fa-exclamation-circle"></i> ${escHtml(m.title)}</h2>
                </div>
                <div class="modal-body" style="padding: 22px 24px; white-space: pre-line; font-size: 1rem; line-height: 1.7;">${escHtml(m.body)}</div>
                <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; background: #f8f9fa; border-top: 1px solid var(--border-light);">
                    <span style="color: var(--text-muted); font-size: 0.85rem;">${escHtml(m.created_by_name || '')} · ${escHtml(m.created_at)}</span>
                    <button type="button" class="btn btn-primary" id="msImpRead" style="padding: 8px 24px;"><i class="fa fa-check"></i> קראתי</button>
                </div>
            </div>`;
        box.classList.remove('hidden');
        $('msImpRead').onclick = async () => {
            $('msImpRead').disabled = true;
            box.classList.add('hidden');
            await markRead(m.id);
        };
    }

    function showToast(list) {
        list.forEach((m) => shownToasts.add(m.id));
        let box = $('msMsgToast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'msMsgToast';
            box.setAttribute('role', 'status');
            box.style.cssText = 'position: fixed; top: 84px; left: 16px; z-index: 8995; max-width: min(380px, calc(100% - 32px)); background: #fff; color: var(--text-main); border: 1px solid var(--border-light); border-right: 4px solid var(--primary-color); border-radius: 8px; padding: 12px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.14); display: flex; gap: 10px; align-items: flex-start;';
            document.body.appendChild(box);
        }
        const m = list[0];
        box.innerHTML = `
            <i class="fa fa-envelope" style="color: var(--primary-color); margin-top: 3px;"></i>
            <div style="flex: 1; min-width: 0;">
                <strong>${list.length > 1 ? `${list.length} הודעות חדשות` : 'הודעה חדשה'}</strong>
                <div style="font-size: 0.9rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escHtml(m.title)}</div>
                <button type="button" class="btn btn-primary btn-sm" id="msToastOpen" style="margin-top: 8px;"><i class="fa fa-envelope-open"></i> הצג</button>
            </div>
            <button type="button" id="msToastClose" title="סגירה" style="background: none; border: none; color: var(--text-muted); cursor: pointer;"><i class="fa fa-times"></i></button>`;
        box.style.display = 'flex';
        $('msToastClose').onclick = () => { box.style.display = 'none'; };
        $('msToastOpen').onclick = () => { box.style.display = 'none'; const b = $('openSettingsBtn'); if (b) b.click(); };
    }

    // ===== הרשאות: מה שאין למשתמש הרשאה אליו מוסתר באתר (והשרת חוסם ממילא) =====
    const ALL_PERMS = ['clients_view', 'clients_edit', 'nedarim_charge', 'exams_view', 'exams_manage', 'old_site', 'admin'];
    function applyPermissions() {
        const have = new Set((user && user.permissions) || []);
        const root = document.documentElement;
        ALL_PERMS.forEach((p) => root.classList.toggle('ms-no-' + p, !have.has(p)));
        // בלי צפייה במבחנים – פותחים את לשונית הלקוחות
        if (!have.has('exams_view') && have.has('clients_view')) {
            const tab = document.querySelector('.main-nav-btn[data-target="view-clients"]');
            if (tab && !tab.classList.contains('active')) tab.click();
        }
    }
    const can = (p) => !!(user && user.permissions && user.permissions.includes(p));

    // ===== הודעה בראש האתר – מהשרת; סגירה נשמרת בחשבון המשתמש =====
    async function loadAnnouncement() {
        try {
            const r = await call('GET', 'announcement', null, 8000);
            setAnnouncement(r);
        } catch (e) { /* ההודעה נשארת מוסתרת */ }
    }
    // ההודעה תופסת תמיד את אותו מקום – מסתירים רק את התוכן, כך שהפס העליון לא משנה גובה
    function setAnnouncement(r) {
        const box = $('completionAnnouncement');
        if (!box) return;
        const text = box.querySelector('.completion-announcement span');
        if (text && r.text) text.textContent = r.text;
        box.style.visibility = r.show ? 'visible' : 'hidden';
        if (user) saveSession(Object.assign({}, user, { announcement: { show: !!r.show, text: r.text || '' } }));
    }
    window.dismissCompletionAnnouncement = async function () {
        const box = $('completionAnnouncement');
        if (box) box.style.visibility = 'hidden';
        if (user) saveSession(Object.assign({}, user, { announcement: { show: false, text: (savedAnnouncement() || {}).text || '' } }));
        try { await call('POST', 'announcement/dismiss', null, 8000); } catch (e) { /* ignore */ }
    };
    window.showCompletionAnnouncement = async function () {
        try { setAnnouncement(await call('POST', 'announcement/restore', null, 8000)); } catch (e) { /* ignore */ }
    };

    function resetButton() {
        const btn = $('loginBtn');
        btn.disabled = false;
        btn.innerHTML = '<span>כניסה</span><i class="fa fa-arrow-left"></i>';
    }

    async function logout() {
        try { await call('POST', 'auth/logout', null, 8000); } catch (e) { /* ignore */ }
        clearSession();
        location.reload();
    }

    // ===== כניסה עם Google =====
    // הכפתור הרשמי של Google; אחרי בחירת חשבון השרת בודק שיש משתמש פעיל עם אותו מייל
    async function setupGoogle(showError) {
        let clientId;
        try { clientId = (await call('GET', 'auth/options', null, 8000)).google_client_id; } catch (e) { return; }
        if (!clientId) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client?hl=he';
            s.async = true;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        }).catch(() => null);
        if (!window.google || !google.accounts || !google.accounts.id) return;
        google.accounts.id.initialize({
            client_id: clientId,
            ux_mode: 'popup',
            callback: async (resp) => {
                $('loginError').classList.add('hidden');
                try { finish((await call('POST', 'auth/google', { credential: resp.credential })).user); }
                catch (e) { showError(e.message); }
            },
        });
        const slot = $('googleSlot');
        google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'he', width: Math.min(360, slot.clientWidth || 320) });
        slot.classList.remove('hidden');
        $('googleOr').classList.remove('hidden');
    }

    function setupLogin() {
        const pass = $('passwordInput'), btn = $('loginBtn'), msg = $('authMessage');
        const showError = (text) => { $('loginErrorText').textContent = text; $('loginError').classList.remove('hidden'); };
        $('lgCancel').onclick = closePasswordLogin;

        // הצגת סיסמה + Caps Lock
        $('lgEye').onclick = () => {
            const show = pass.type === 'password';
            pass.type = show ? 'text' : 'password';
            $('lgEye').innerHTML = `<i class="fa ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            pass.focus();
        };
        const caps = (e) => { if (e.getModifierState) $('lgCaps').classList.toggle('hidden', !e.getModifierState('CapsLock')); };
        pass.addEventListener('keydown', caps);
        pass.addEventListener('keyup', caps);

        // כניסה בסיסמה
        $('loginForm').onsubmit = async (e) => {
            e.preventDefault();
            $('loginError').classList.add('hidden');
            if (!pass.value) return showError('יש להזין סיסמה');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i><span>מאמת...</span>';
            try {
                const r = await call('POST', 'auth/login', { password: pass.value });
                finish(r.user);
            } catch (er) {
                showError(er.message);
                resetButton();
                pass.select();
            }
        };

        // כניסה שמורה בזיכרון — האתר נפתח מיד, והכניסה נבדקת מול השרת ברקע.
        // אם היא כבר לא תקפה – חוזרים למסך הכניסה.
        let saved = null;
        try { saved = JSON.parse(store.get(USER_KEY) || 'null'); } catch (e) { /* ignore */ }
        if (saved) {
            finish(saved);
            call('GET', 'auth/me', null, 8000)
                .then((r) => { applyFilterMode(r.unfiltered); finish(r.user); })
                .catch((e) => { if (e.status === 401) showLoginAgain('הכניסה פגה — הזינו סיסמה'); });
            setupGoogle(showError);
            return;
        }

        // אין כניסה שמורה: הטופס פתוח מיד, ובדיקת ה-IP רצה במקביל.
        // כניסה אוטומטית לפי IP — רק אם עוד לא התחילו להקליד.
        document.body.classList.add('ms-locked');
        pass.focus();
        const typing = () => pass.value || !btn.querySelector('.fa-arrow-left');
        (async () => {
            // חיבור קיים בעוגייה (למשל אחרי ניקוי הזיכרון בדפדפן)
            try { const me = await call('GET', 'auth/me', null, 8000); applyFilterMode(me.unfiltered); return finish(me.user); } catch (e) { /* לא מחובר */ }
            try {
                const r = await call('POST', 'auth/login', {}, 8000);
                if (r.authorized && !typing()) return finish(r.user);
                if (!done) msg.innerHTML = '<i class="fa fa-lock"></i>כתובת ה-IP אינה מורשית — הזינו סיסמה';
            } catch (e) {
                if (!done) msg.innerHTML = '<i class="fa fa-lock"></i>הזינו סיסמה';
            }
        })();

        setupGoogle(showError);
    }

    // כניסה שפגה באמצע העבודה → חוזרים למסך הכניסה
    window.fetch = async (input, init) => {
        const res = await rawFetch(input, init);
        const url = typeof input === 'string' ? input : input && input.url;
        if (res.status === 401 && done && url && url.includes('/masechet/api/') && !url.includes('/masechet/api/auth/')) {
            showLoginAgain('הכניסה פגה — הזינו סיסמה');
        }
        if (res.status === 418 && url && url.includes('/masechet/api/')) checkNetFree(res.clone(), url);
        const filtered = parseInt(res.headers.get('X-MS-Filtered') || '0', 10);
        if (filtered > 0) noteFiltered(filtered);
        return res;
    };

    // ===== סינון מילים בשרת: הודעה כשסוננו מילים, ואפשרות להציג טקסט מלא (מחשב בלי נטפרי) =====
    let filteredTotal = 0;
    let unfilteredMode = false;
    function filterBox() {
        let box = $('msFilterBanner');
        if (!box) {
            box = document.createElement('div');
            box.id = 'msFilterBanner';
            box.setAttribute('role', 'status');
            box.style.cssText = 'position: fixed; bottom: 16px; right: 16px; z-index: 8990; max-width: min(420px, calc(100% - 32px)); border-radius: 8px; padding: 10px 14px; box-shadow: 0 6px 20px rgba(0,0,0,.12); display: none; align-items: flex-start; gap: 10px; font-size: 0.9rem; line-height: 1.5;';
            document.body.appendChild(box);
        }
        return box;
    }
    function noteFiltered(n) {
        if (unfilteredMode) return;
        filteredTotal += n;
        const box = filterBox();
        box.style.background = '#e8f0fe'; box.style.color = '#1a3d7c'; box.style.border = '1px solid #c6d8fb';
        box.innerHTML = `
            <i class="fa fa-filter" style="margin-top: 3px;"></i>
            <div style="flex: 1;">
                <strong>סוננו ${filteredTotal} מילים לא ראויות מהנתונים</strong>
                <div style="font-size: 0.82rem;">המילים מוחלפות ב-*** כדי שהדף לא ייחסם בנטפרי.</div>
                <button type="button" class="btn btn-secondary btn-sm" id="msFilterShowAll" style="margin-top: 6px;"><i class="fa fa-eye"></i> הצג טקסט מלא (למחשב בלי נטפרי)</button>
            </div>
            <button type="button" id="msFilterClose" title="סגירה" style="background: none; border: none; color: inherit; cursor: pointer;"><i class="fa fa-times"></i></button>`;
        box.style.display = 'flex';
        $('msFilterClose').onclick = () => { box.style.display = 'none'; };
        $('msFilterShowAll').onclick = () => setFilterMode(true);
    }
    function showUnfilteredNotice() {
        const box = filterBox();
        box.style.background = '#fff3cd'; box.style.color = '#856404'; box.style.border = '1px solid #ffeeba';
        box.innerHTML = `
            <i class="fa fa-eye" style="margin-top: 3px;"></i>
            <div style="flex: 1;">
                <strong>מוצג טקסט מלא, בלי סינון מילים</strong>
                <div style="font-size: 0.82rem;">במחשב עם נטפרי חלק מהנתונים עלולים להיחסם.</div>
                <button type="button" class="btn btn-secondary btn-sm" id="msFilterBack" style="margin-top: 6px;"><i class="fa fa-filter"></i> חזרה לטקסט מסונן</button>
            </div>`;
        box.style.display = 'flex';
        $('msFilterBack').onclick = () => setFilterMode(false);
    }
    async function setFilterMode(on) {
        try { await call('POST', 'filter/mode', { unfiltered: on }, 8000); } catch (e) { return; }
        location.reload();
    }
    function applyFilterMode(on) {
        unfilteredMode = !!on;
        if (unfilteredMode) showUnfilteredNotice();
    }

    // ===== חסימת נטפרי: הודעה ברורה במקום שגיאה כללית, ודיווח ליומן =====
    const netfreeSeen = new Set();
    async function checkNetFree(res, url) {
        let data = null;
        try { data = await res.json(); } catch (e) { return; }
        if (!data || !data.blockByNetFree) return;
        let link = String(data.blockUrl || '');
        if (link.startsWith('//')) link = 'https:' + link;
        if (!/^https:\/\/([a-z0-9-]+\.)*netfree\.link\//i.test(link)) link = 'https://netfree.link/';
        let reason = '';
        try { reason = JSON.parse(decodeURIComponent(link.split('#')[1] || '')).block || ''; } catch (e) { /* ignore */ }
        const path = new URL(url, location.origin).pathname.replace('/masechet/api/', '');
        let what = '';
        try { const u = new URL(url, location.origin); what = u.searchParams.get('what') || u.searchParams.get('wath') || u.searchParams.get('path') || u.searchParams.get('Action') || ''; } catch (e) { /* ignore */ }
        showNetFreeBanner(link, reason, what || path);
        const key = path + '|' + what;
        if (netfreeSeen.has(key)) return;
        netfreeSeen.add(key);
        try { await call('POST', 'client/netfree-block', { action: path, target: what, reason }, 8000); } catch (e) { /* ignore */ }
    }

    function showNetFreeBanner(link, reason, what) {
        let box = $('msNetFreeBanner');
        if (!box) {
            box = document.createElement('div');
            box.id = 'msNetFreeBanner';
            box.setAttribute('role', 'alert');
            box.style.cssText = 'position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 9000; max-width: min(640px, calc(100% - 32px)); background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 8px; padding: 12px 16px; box-shadow: 0 6px 20px rgba(0,0,0,.15); display: flex; align-items: flex-start; gap: 12px; font-size: 0.95rem; line-height: 1.5;';
            box.innerHTML = `
                <i class="fa fa-ban" style="font-size: 1.4rem; margin-top: 2px;"></i>
                <div style="flex: 1;">
                    <strong>הבקשה נחסמה על ידי נטפרי</strong> <span id="msNetFreeReason"></span>
                    <div style="font-size: 0.85rem; margin-top: 2px;">חלק מהנתונים לא נטענו. אפשר לבקש מנטפרי לאשר את האתר <span dir="ltr">smti.uk/masechet</span>.</div>
                    <div style="font-size: 0.8rem; opacity: .8; margin-top: 2px;">נחסם: <span id="msNetFreeWhat" dir="ltr"></span></div>
                    <a id="msNetFreeLink" target="_blank" rel="noopener" class="btn btn-sm" style="margin-top: 8px; background: #721c24; color: #fff; display: inline-block;"><i class="fa fa-external-link"></i> דיווח לנטפרי על חסימה שגויה</a>
                </div>
                <button type="button" id="msNetFreeClose" title="סגירה" style="background: none; border: none; color: inherit; font-size: 1.1rem; cursor: pointer;"><i class="fa fa-times"></i></button>`;
            document.body.appendChild(box);
            $('msNetFreeClose').onclick = () => { box.style.display = 'none'; };
        }
        $('msNetFreeReason').textContent = reason === 'badwords' ? '(סינון מילים)' : (reason ? `(${reason})` : '');
        $('msNetFreeWhat').textContent = what;
        $('msNetFreeLink').href = link;
        box.style.display = 'flex';
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLogin);
    else setupLogin();

    return {
        ready: () => readyPromise,
        user: () => user,
        can,
        isUnfiltered: () => unfilteredMode,
        messages: () => messages,
        markRead,
        escHtml,
        setFilterMode,
        logout,
    };
})();
