// ============================================================
//  session.js — כניסה למערכת (מסך כניסה, כמו באסיפה)
//  • כניסה עם שם משתמש וסיסמה, כניסה אוטומטית לפי IP מורשה, או עם Google
//  • החיבור נשמר בעוגייה מאובטחת בשרת – הדפדפן לא שומר טוקנים
//  • ניקוי: טוקנים וסיסמאות שנשמרו בדפדפן בעבר נמחקים, והשרת מקבל דיווח מה נמצא ונמחק
//  • כפתור "ניהול" למנהל בלבד, וכפתור יציאה
// ============================================================

const MsSession = (() => {
    const API = '/masechet/api/';

    // מפתחות ישנים שבהם נשמרו טוקנים וסיסמאות (באתר החדש ובאתר הישן)
    const LEGACY_KEYS = [
        'yemotToken', 'yemotUsername', 'yemotPassword', 'nedarimMosadId', 'nedarimPassword',
        'msAdminToken', 'ymgr_apiToken', 'ymgr_systemNumber', 'ymgr_password',
    ];
    const CLEAN_FLAG = 'msBrowserCleanupReported';

    let user = null;
    let resolveReady;
    const readyPromise = new Promise((r) => { resolveReady = r; });

    // fetch מקורי – לפני העטיפה שמזהה ניתוק
    const rawFetch = window.fetch.bind(window);

    async function call(method, path, body) {
        let res;
        try {
            res = await rawFetch(API + path, {
                method,
                credentials: 'same-origin',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (e) {
            throw new Error('אין חיבור לשרת');
        }
        const data = await res.json().catch(() => null);
        if (!data || !data.ok) {
            const err = new Error(data && data.error ? data.error.message : 'אין חיבור לשרת');
            err.status = res.status;
            throw err;
        }
        return data.data;
    }

    // ===== מסך הכניסה =====
    function buildLoginScreen() {
        if (document.getElementById('msLoginScreen')) return;
        const html = `
        <div id="msLoginScreen" class="ms-login hidden" role="dialog" aria-modal="true" aria-labelledby="msLoginTitle">
            <div class="ms-login-card">
                <div class="ms-login-brand">
                    <img src="smt.png" alt="" class="ms-login-logo">
                    <div>
                        <h1 id="msLoginTitle">מסכת של שבת</h1>
                        <p>כניסה למערכת הניהול</p>
                    </div>
                </div>
                <form id="msLoginForm" autocomplete="on" novalidate>
                    <label class="ms-field">
                        <span>שם משתמש</span>
                        <input id="msUsername" name="username" autocomplete="username" required>
                    </label>
                    <label class="ms-field">
                        <span>סיסמה</span>
                        <div class="ms-pass">
                            <input id="msPassword" name="password" type="password" autocomplete="current-password" required>
                            <button type="button" id="msEye" class="ms-eye" aria-label="הצגת סיסמה"><i class="fa fa-eye"></i></button>
                        </div>
                        <small id="msCaps" class="ms-caps hidden"><i class="fa fa-exclamation-triangle"></i> Caps Lock פעיל</small>
                    </label>
                    <div id="msLoginError" class="ms-error hidden" role="alert"></div>
                    <button type="submit" id="msLoginBtn" class="ms-submit">כניסה <i class="fa fa-arrow-left"></i></button>
                </form>
                <div id="msGoogleWrap" class="ms-google hidden">
                    <div class="ms-or"><span>או</span></div>
                    <div id="msGoogleBtn"></div>
                </div>
                <p id="msLoginStatus" class="ms-status"><i class="fa fa-spinner fa-spin"></i> בודק הרשאת כניסה…</p>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);

        const $ = (id) => document.getElementById(id);
        $('msEye').onclick = () => {
            const p = $('msPassword');
            const show = p.type === 'password';
            p.type = show ? 'text' : 'password';
            $('msEye').innerHTML = `<i class="fa ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            p.focus();
        };
        const caps = (e) => { if (e.getModifierState) $('msCaps').classList.toggle('hidden', !e.getModifierState('CapsLock')); };
        $('msPassword').addEventListener('keyup', caps);
        $('msPassword').addEventListener('keydown', caps);

        $('msLoginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = $('msUsername').value.trim();
            const password = $('msPassword').value;
            if (!username || !password) return showError('יש להזין שם משתמש וסיסמה');
            setBusy(true);
            try {
                const r = await call('POST', 'auth/login', { username, password });
                await onLoggedIn(r.user);
            } catch (err) {
                showError(err.message);
                $('msPassword').select();
            }
            setBusy(false);
        });
    }

    function showError(text) {
        const el = document.getElementById('msLoginError');
        el.textContent = text;
        el.classList.toggle('hidden', !text);
    }

    function setBusy(busy) {
        const btn = document.getElementById('msLoginBtn');
        btn.disabled = busy;
        btn.innerHTML = busy ? '<i class="fa fa-spinner fa-spin"></i> נכנס…' : 'כניסה <i class="fa fa-arrow-left"></i>';
    }

    function showLogin(message) {
        buildLoginScreen();
        document.getElementById('msLoginScreen').classList.remove('hidden');
        document.body.classList.add('ms-locked');
        const status = document.getElementById('msLoginStatus');
        status.textContent = message || '';
        status.classList.toggle('hidden', !message);
        setTimeout(() => document.getElementById('msUsername').focus(), 50);
    }

    function hideLogin() {
        const el = document.getElementById('msLoginScreen');
        if (el) el.classList.add('hidden');
        document.body.classList.remove('ms-locked');
    }

    // ===== Google =====
    async function setupGoogle() {
        let opts;
        try { opts = await call('GET', 'auth/options'); } catch { return; }
        if (!opts.google_client_id) return;
        await new Promise((resolve) => {
            if (window.google && window.google.accounts) return resolve();
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
        if (!window.google || !window.google.accounts) return;
        window.google.accounts.id.initialize({
            client_id: opts.google_client_id,
            callback: async (resp) => {
                setBusy(true);
                try {
                    const r = await call('POST', 'auth/google', { credential: resp.credential });
                    await onLoggedIn(r.user);
                } catch (err) {
                    showError(err.message);
                }
                setBusy(false);
            },
        });
        window.google.accounts.id.renderButton(document.getElementById('msGoogleBtn'), {
            theme: 'outline', size: 'large', text: 'continue_with', locale: 'he', width: 300,
        });
        document.getElementById('msGoogleWrap').classList.remove('hidden');
    }

    // ===== ניקוי הדפדפן =====
    async function cleanBrowser() {
        const found = [];
        try {
            for (const k of LEGACY_KEYS) {
                if (localStorage.getItem(k) !== null) {
                    found.push(k);
                    localStorage.removeItem(k);
                }
            }
        } catch (e) { return; }
        let reported = false;
        try { reported = localStorage.getItem(CLEAN_FLAG) === '1'; } catch (e) { /* ignore */ }
        // מדווחים תמיד כשנמצא משהו, ופעם אחת לכל דפדפן גם כשהוא נקי
        if (!found.length && reported) return;
        try {
            await call('POST', 'client/browser-cleanup', { found });
            localStorage.setItem(CLEAN_FLAG, '1');
        } catch (e) { /* ננסה בכניסה הבאה */ }
    }

    // ===== פס עליון: שם, ניהול, יציאה =====
    function renderTopBar() {
        const el = document.getElementById('topBarUserDisplay');
        if (el) {
            el.innerHTML = '';
            const icon = document.createElement('i');
            icon.className = 'fa fa-user-circle';
            const strong = document.createElement('strong');
            strong.textContent = user.name;
            el.append(icon, ' ', strong);
        }
        const anchor = document.getElementById('openSettingsBtn');
        if (!anchor) return;

        if (user.is_admin && !document.getElementById('adminPanelBtn')) {
            const a = document.createElement('a');
            a.id = 'adminPanelBtn';
            a.href = '/masechet/admin';
            a.target = '_blank';
            a.rel = 'noopener';
            a.className = 'btn btn-secondary';
            a.title = 'ניהול משתמשים, הגדרות ויומנים';
            a.innerHTML = '<i class="fa fa-users"></i> ניהול';
            anchor.parentNode.insertBefore(a, anchor);
        }
        if (!document.getElementById('logoutBtn')) {
            const b = document.createElement('button');
            b.id = 'logoutBtn';
            b.type = 'button';
            b.className = 'btn btn-secondary';
            b.title = 'יציאה מהמערכת';
            b.innerHTML = '<i class="fa fa-sign-out"></i> יציאה';
            b.onclick = logout;
            anchor.parentNode.insertBefore(b, anchor.nextSibling);
        }
    }

    async function onLoggedIn(u) {
        user = u;
        try { sessionStorage.removeItem('msLoggedOut'); } catch (e) { /* ignore */ }
        hideLogin();
        await cleanBrowser();
        renderTopBar();
        resolveReady(user);
    }

    async function logout() {
        try { await call('POST', 'auth/logout'); } catch (e) { /* ignore */ }
        // אחרי יציאה מפורשת לא נכנסים שוב אוטומטית לפי IP (עד שסוגרים את הלשונית)
        try { sessionStorage.setItem('msLoggedOut', '1'); } catch (e) { /* ignore */ }
        location.reload();
    }

    // חיבור שפג באמצע העבודה → חוזרים למסך הכניסה
    window.fetch = async (input, init) => {
        const res = await rawFetch(input, init);
        const url = typeof input === 'string' ? input : input && input.url;
        if (res.status === 401 && url && url.includes('/masechet/api/') && !url.includes('/masechet/api/auth/')) {
            showLogin('פג תוקף הכניסה. יש להיכנס מחדש.');
        }
        return res;
    };

    async function start() {
        // 1. חיבור קיים
        try {
            const r = await call('GET', 'auth/me');
            return onLoggedIn(r.user);
        } catch (e) { /* לא מחובר */ }

        // 2. מסך כניסה, ובמקביל בדיקת IP מורשה
        showLogin('בודק הרשאת כניסה…');
        setupGoogle();
        let skipIp = false;
        try { skipIp = sessionStorage.getItem('msLoggedOut') === '1'; } catch (e) { /* ignore */ }
        if (!skipIp) try {
            const r = await call('POST', 'auth/login', {});
            const typed = document.getElementById('msUsername').value || document.getElementById('msPassword').value;
            if (r.authorized && !typed) return onLoggedIn(r.user);
        } catch (e) { /* ממשיכים לטופס */ }
        const status = document.getElementById('msLoginStatus');
        if (status) status.classList.add('hidden');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    return {
        ready: () => readyPromise,
        user: () => user,
        logout,
    };
})();
