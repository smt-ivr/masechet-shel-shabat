// ============================================================
//  session.js — מסך הכניסה (אותה לוגיקה של אסיפה, סיסמה בלבד)
//  כניסה שמורה → האתר נפתח מיד (מסך הכניסה לא מוצג), והכניסה נבדקת מול השרת ברקע.
//  אחרת: הטופס פתוח מיד, ובמקביל בדיקת IP מורשית (כניסה אוטומטית רק אם עוד לא הקלידו).
//  החיבור עצמו בעוגייה מאובטחת בשרת. בדפדפן נשמר רק שם המשתמש לתצוגה (ms_user) – לא טוקנים.
//  בכניסה: טוקנים וסיסמאות ישנים נמחקים מהדפדפן, והשרת מקבל דיווח מה נמצא ונמחק.
// ============================================================

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
    function saveSession(u) { store.set(USER_KEY, JSON.stringify(u)); }

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
        const el = $('topBarUserDisplay');
        if (el) {
            el.innerHTML = '';
            const icon = document.createElement('i');
            icon.className = 'fa fa-user-circle';
            const strong = document.createElement('strong');
            strong.textContent = user.name;
            el.append(icon, ' ', strong);
        }
        const anchor = $('openSettingsBtn');
        if (!anchor) return;
        const admin = $('adminPanelBtn');
        if (user.is_admin && !admin) {
            const a = document.createElement('a');
            a.id = 'adminPanelBtn';
            a.href = '/masechet/admin';
            a.target = '_blank';
            a.rel = 'noopener';
            a.className = 'btn btn-secondary';
            a.title = 'ניהול משתמשים, הגדרות ויומנים';
            a.innerHTML = '<i class="fa fa-users"></i> ניהול';
            anchor.parentNode.insertBefore(a, anchor);
        } else if (!user.is_admin && admin) {
            admin.remove();
        }
        // כניסה לפי IP: במקום "יציאה" (שהייתה מחזירה מיד לאותו משתמש) – "התחברות עם סיסמה"
        let b = $('logoutBtn');
        if (!b) {
            b = document.createElement('button');
            b.id = 'logoutBtn';
            b.type = 'button';
            b.className = 'btn btn-secondary';
            anchor.parentNode.insertBefore(b, anchor.nextSibling);
        }
        if (user.method === 'ip') {
            b.title = 'נכנסתם לפי כתובת IP. לחצו כדי להתחבר עם סיסמה';
            b.innerHTML = '<i class="fa fa-key"></i> התחברות עם סיסמה';
            b.onclick = openPasswordLogin;
        } else {
            b.title = 'יציאה מהמערכת';
            b.innerHTML = '<i class="fa fa-sign-out"></i> יציאה';
            b.onclick = logout;
        }
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
        showSite();
        renderTopBar();
        resolveReady(u);
        cleanBrowser();
        loadAnnouncement();
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
    function setAnnouncement(r) {
        const box = $('completionAnnouncement');
        if (!box) return;
        const text = box.querySelector('.completion-announcement span');
        if (text && r.text) text.textContent = r.text;
        box.style.display = r.show ? 'flex' : 'none';
    }
    window.dismissCompletionAnnouncement = async function () {
        const box = $('completionAnnouncement');
        if (box) box.style.display = 'none';
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
                .then((r) => finish(r.user))
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
            try { return finish((await call('GET', 'auth/me', null, 8000)).user); } catch (e) { /* לא מחובר */ }
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
        return res;
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLogin);
    else setupLogin();

    return {
        ready: () => readyPromise,
        user: () => user,
        can,
        logout,
    };
})();
