// ============================================================
//  netfree-watch.js — זיהוי חסימות נטפרי בכל האתר ודיווח ליומן הניהול
//  נטען ראשון בכל דף (אתר חדש, אתר ישן, דף הניהול, מסך הכניסה).
//  מזהה: תשובה 418 של נטפרי לכל בקשה (fetch / XHR), קבצים של האתר שנחסמו,
//  וספריות חיצוניות שלא נטענו (כנראה נטפרי – מסומן "לא ודאי").
//  מציג למשתמש הודעה ברורה, ומדווח לשרת (גם בלי כניסה למערכת).
// ============================================================
(function () {
    if (window.MsNetFree) return;
    const REPORT = '/masechet/api/client/netfree-block';
    const rawFetch = window.fetch.bind(window);
    const seen = new Set();
    let queue = [];
    let timer = null;

    const p = location.pathname;
    const site = p.startsWith('/masechet/old') ? 'old' : p.startsWith('/masechet/admin') ? 'admin' : 'new';

    // כתובת בלי פרמטרים סודיים
    function cleanUrl(u) {
        try {
            const x = new URL(u, location.href);
            for (const k of [...x.searchParams.keys()]) {
                if (/token|password|apipassword|secret|credential/i.test(k)) x.searchParams.set(k, '***');
            }
            return (x.origin === location.origin ? '' : x.origin) + x.pathname + x.search;
        } catch (e) { return String(u || '').slice(0, 300); }
    }
    // מה בדיוק נחסם: נתיב בימות / פעולה בנדרים / שם הקובץ
    function whatOf(u) {
        try {
            const x = new URL(u, location.href);
            const v = x.searchParams.get('what') || x.searchParams.get('wath') || x.searchParams.get('path') || x.searchParams.get('Action');
            if (v) return v;
            if (x.pathname.startsWith('/masechet/api/')) return x.pathname.replace('/masechet/api/', '');
            return (x.origin === location.origin ? '' : x.hostname) + x.pathname;
        } catch (e) { return ''; }
    }
    function parseBlock(data) {
        let link = String((data && data.blockUrl) || '');
        if (link.startsWith('//')) link = 'https:' + link;
        if (!/^https:\/\/([a-z0-9-]+\.)*netfree\.link\//i.test(link)) link = '';
        let reason = '';
        try { reason = JSON.parse(decodeURIComponent(link.split('#')[1] || '')).block || ''; } catch (e) { /* ignore */ }
        return { link, reason };
    }

    function report(item) {
        if (!item.url || item.url.includes(REPORT)) return;
        const key = item.url;
        if (seen.has(key)) return;
        seen.add(key);
        if (item.confirmed !== false) showBanner(item);
        queue.push(item);
        clearTimeout(timer);
        timer = setTimeout(flush, 1500);
    }
    function flush() {
        if (!queue.length) return;
        const items = queue.splice(0, 10);
        rawFetch(REPORT, {
            method: 'POST', credentials: 'same-origin', keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ site, page: location.pathname + location.hash, items }),
        }).catch(() => { /* ignore */ });
        if (queue.length) timer = setTimeout(flush, 1500);
    }
    window.addEventListener('pagehide', flush);

    // תשובה 418 = נטפרי (השרת שלנו לא מחזיר 418 אף פעם)
    async function from418(res, url, source) {
        let data = null;
        try { data = await res.clone().json(); } catch (e) { /* דף חסימה, לא JSON */ }
        const b = parseBlock(data);
        report({ source, url: cleanUrl(url), what: whatOf(url), reason: b.reason, block_url: b.link, confirmed: true });
    }

    // ===== fetch =====
    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input);
        const res = await rawFetch(input, init);
        if (res.status === 418) from418(res, url, url.includes('/masechet/api/') ? 'api' : 'fetch');
        return res;
    };

    // ===== XMLHttpRequest =====
    const xOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__msUrl = url;
        this.addEventListener('loadend', () => {
            if (this.status !== 418) return;
            let data = null;
            try { data = JSON.parse(this.responseText); } catch (e) { /* ignore */ }
            const b = parseBlock(data);
            report({ source: 'xhr', url: cleanUrl(this.__msUrl), what: whatOf(this.__msUrl), reason: b.reason, block_url: b.link, confirmed: true });
        });
        return xOpen.apply(this, arguments);
    };

    // ===== קבצים שלא נטענו: סקריפטים, עיצוב, תמונות =====
    const TYPES = { SCRIPT: 'script', LINK: 'style', IMG: 'image', IFRAME: 'page' };
    window.addEventListener('error', (e) => {
        const el = e.target;
        if (!el || el === window || !TYPES[el.tagName]) return;
        const url = el.src || el.href;
        if (!url || url.startsWith('data:')) return;
        checkResource(url, TYPES[el.tagName]);
    }, true);

    async function checkResource(url, source) {
        let sameOrigin = false;
        try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch (e) { return; }
        try {
            const res = await rawFetch(url, { cache: 'no-store', credentials: sameOrigin ? 'same-origin' : 'omit', mode: 'cors' });
            if (res.status === 418) return from418(res, url, source);
            // נטען עכשיו בלי בעיה – כנראה תקלת רשת רגעית, לא נטפרי
        } catch (e) {
            // ספרייה חיצונית שלא נטענה ואי אפשר לבדוק את הסיבה – כנראה נטפרי
            if (!sameOrigin) report({ source, url: cleanUrl(url), what: whatOf(url), confirmed: false });
        }
    }

    // ===== גיבוי: הדפדפן יודע על כל קובץ שהתקבל עם 418 (גם לפני שהסקריפט נטען) =====
    try {
        new PerformanceObserver((list) => {
            for (const en of list.getEntries()) {
                if (en.responseStatus === 418) {
                    report({ source: en.initiatorType === 'fetch' ? 'fetch' : en.initiatorType === 'xmlhttprequest' ? 'xhr' : 'resource', url: cleanUrl(en.name), what: whatOf(en.name), confirmed: true });
                }
            }
        }).observe({ type: 'resource', buffered: true });
    } catch (e) { /* דפדפן ישן */ }

    // ===== הודעה למשתמש (עיצוב עצמאי – עובד בכל הדפים) =====
    function showBanner(item) {
        const show = () => {
            let box = document.getElementById('msNetFreeBanner');
            if (!box) {
                box = document.createElement('div');
                box.id = 'msNetFreeBanner';
                box.setAttribute('role', 'alert');
                box.dir = 'rtl';
                box.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483000;max-width:min(640px,calc(100% - 32px));background:#f8d7da;color:#721c24;border:1px solid #f5c6cb;border-radius:8px;padding:12px 16px;box-shadow:0 6px 20px rgba(0,0,0,.15);display:flex;align-items:flex-start;gap:12px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;text-align:right';
                box.innerHTML = '<span style="font-size:1.4rem;line-height:1">⛔</span>'
                    + '<div style="flex:1"><strong>הבקשה נחסמה על ידי נטפרי</strong> <span data-r></span>'
                    + '<div style="font-size:.85rem;margin-top:2px">חלק מהנתונים לא נטענו. אפשר לבקש מנטפרי לאשר את האתר <span dir="ltr">smti.uk/masechet</span>.</div>'
                    + '<div style="font-size:.8rem;opacity:.8;margin-top:2px">נחסם: <span data-w dir="ltr"></span></div>'
                    + '<a data-l target="_blank" rel="noopener" style="margin-top:8px;background:#721c24;color:#fff;display:inline-block;padding:4px 10px;border-radius:4px;font-size:.85rem;text-decoration:none">דיווח לנטפרי על חסימה שגויה</a></div>'
                    + '<button type="button" data-x title="סגירה" style="background:none;border:none;color:inherit;font-size:1.2rem;cursor:pointer;line-height:1">×</button>';
                document.body.appendChild(box);
                box.querySelector('[data-x]').onclick = () => { box.style.display = 'none'; };
            }
            box.querySelector('[data-r]').textContent = item.reason === 'badwords' ? '(סינון מילים)' : (item.reason ? '(' + item.reason + ')' : '');
            box.querySelector('[data-w]').textContent = item.what || item.url;
            box.querySelector('[data-l]').href = item.block_url || 'https://netfree.link/';
            box.style.display = 'flex';
        };
        if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    }

    window.MsNetFree = { report, flush };
})();
