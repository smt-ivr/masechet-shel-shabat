// ============================================================
//  status-manager.js — שינוי סטטוס לקוח בלי להקליד
//  בקובץ הלקוחות בימות הסטטוס הוא מספר (1-4). כאן בוחרים מרשימה עם השמות:
//  • לחיצה על הסטטוס בטבלת הלקוחות → רשימה קטנה → נשמר מיד בימות
//  • סימון כמה לקוחות → סרגל "שינוי סטטוס לנבחרים" → כולם בבת אחת
// ============================================================
const StatusManager = {
    COLORS: ['#0d6efd', '#6f42c1', '#d63384', '#198754', '#fd7e14', '#20c997', '#6c757d'],

    esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

    color(code) {
        const i = (window.MS_STATUSES || []).findIndex((s) => s.code === String(code));
        return i >= 0 ? this.COLORS[i % this.COLORS.length] : '#adb5bd';
    },

    // תגית צבעונית עם השם (והמספר בקטן)
    badge(code) {
        const c = String(code == null ? '' : code).trim();
        if (!c) return '<span style="color:var(--text-muted);">-</span>';
        const name = msStatusName(c);
        const col = this.color(c);
        return `<span class="ms-status-badge" style="display:inline-flex; align-items:center; gap:5px; padding:2px 9px; border-radius:12px; font-size:0.82rem; white-space:nowrap; background:${col}14; color:${col}; border:1px solid ${col}40; cursor:pointer;">${this.esc(name)}${name !== c ? `<small style="opacity:.65;">${this.esc(c)}</small>` : ''}</span>`;
    },

    injectStyle() {
        if (document.getElementById('msStatusStyle')) return;
        const st = document.createElement('style');
        st.id = 'msStatusStyle';
        st.textContent = `
            .ms-status-pop { position: fixed; z-index: 3000; background: #fff; border: 1px solid var(--border-color, #dee2e6); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.18); padding: 6px; min-width: 200px; }
            .ms-status-pop button { display: flex; width: 100%; align-items: center; gap: 8px; background: none; border: none; padding: 8px 10px; border-radius: 7px; font: inherit; font-size: .92rem; cursor: pointer; text-align: right; }
            .ms-status-pop button:hover { background: #f1f4fb; }
            .ms-status-pop button.cur { font-weight: 700; background: #eef3ff; }
            .ms-status-pop .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
            .ms-status-pop .num { margin-right: auto; color: var(--text-muted, #6c757d); font-size: .8rem; }
            .ms-status-pop .ttl { font-size: .78rem; color: var(--text-muted, #6c757d); padding: 4px 10px 6px; border-bottom: 1px solid #eee; margin-bottom: 4px; }
            #msBulkBar { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 1500; background: #1e3a8a; color: #fff; border-radius: 12px; padding: 10px 16px; display: none; align-items: center; gap: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); font-size: .95rem; }
            #msBulkBar .btn { padding: 5px 12px; font-size: .88rem; }
            html.ms-no-clients_edit #msBulkBar { display: none !important; }
            html.ms-no-clients_edit .ms-status-badge { cursor: default !important; }
        `;
        document.head.appendChild(st);
    },

    closePicker() {
        const p = document.getElementById('msStatusPop');
        if (p) p.remove();
        document.removeEventListener('mousedown', this._outside, true);
    },

    // רשימת בחירה ליד האלמנט. zeouts = לקוח אחד או כמה
    openPicker(anchor, zeouts) {
        this.injectStyle();
        this.closePicker();
        const one = zeouts.length === 1 ? (globalClientsMap[zeouts[0]] || {}) : null;
        const cur = one ? String(one.yemotStatus || '') : null;
        const pop = document.createElement('div');
        pop.id = 'msStatusPop';
        pop.className = 'ms-status-pop';
        pop.innerHTML = `<div class="ttl">${one ? `סטטוס עבור ${this.esc(one.firstName || '')} ${this.esc(one.lastName || '')}` : `שינוי סטטוס ל-${zeouts.length} לקוחות`}</div>`
            + (window.MS_STATUSES || []).map((s) => `<button type="button" data-code="${this.esc(s.code)}" class="${s.code === cur ? 'cur' : ''}"><span class="dot" style="background:${this.color(s.code)}"></span>${this.esc(s.name)}<span class="num">${this.esc(s.code)}</span></button>`).join('')
            + `<button type="button" data-code="" class="${cur === '' ? 'cur' : ''}"><span class="dot" style="background:#dee2e6"></span>ללא סטטוס</button>`;
        document.body.appendChild(pop);
        const r = anchor.getBoundingClientRect();
        const top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8);
        const left = Math.max(8, Math.min(r.left + r.width / 2 - pop.offsetWidth / 2, window.innerWidth - pop.offsetWidth - 8));
        pop.style.top = top + 'px';
        pop.style.left = left + 'px';
        pop.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-code]');
            if (!b) return;
            this.closePicker();
            if (b.dataset.code === cur) return;
            this.save(zeouts, b.dataset.code);
        });
        this._outside = (e) => { if (!pop.contains(e.target)) this.closePicker(); };
        setTimeout(() => document.addEventListener('mousedown', this._outside, true), 0);
    },

    selected() {
        return [...document.querySelectorAll('.row-checkbox:checked')].map((cb) => cb.value);
    },

    updateBulkBar() {
        this.injectStyle();
        let bar = document.getElementById('msBulkBar');
        const sel = this.selected();
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'msBulkBar';
            bar.innerHTML = `<i class="fa fa-check-square-o"></i> <span data-n></span>
                <button type="button" class="btn btn-light" data-act="status"><i class="fa fa-tag"></i> שינוי סטטוס לנבחרים</button>
                <button type="button" data-act="clear" style="background:none; border:1px solid #93a8e8; color:#e0e7ff; border-radius:6px; padding:5px 12px; font:inherit; font-size:.88rem; cursor:pointer;">ביטול הסימון</button>`;
            document.body.appendChild(bar);
            bar.addEventListener('click', (e) => {
                const b = e.target.closest('button[data-act]');
                if (!b) return;
                if (b.dataset.act === 'status') this.openPicker(b, this.selected());
                if (b.dataset.act === 'clear') {
                    document.querySelectorAll('.row-checkbox').forEach((cb) => { cb.checked = false; });
                    const all = document.getElementById('selectAllCheckbox');
                    if (all) all.checked = false;
                    this.updateBulkBar();
                }
            });
        }
        const clientsView = document.getElementById('view-clients');
        const visible = sel.length > 0 && (!clientsView || clientsView.classList.contains('active'));
        bar.querySelector('[data-n]').textContent = `${sel.length} לקוחות מסומנים`;
        bar.style.display = visible ? 'flex' : 'none';
    },

    toast(html, ok = true) {
        let t = document.getElementById('msStatusToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'msStatusToast';
            t.style.cssText = 'position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:3100; padding:10px 18px; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.18); font-size:.95rem;';
            document.body.appendChild(t);
        }
        t.style.background = ok ? '#e8f5e9' : '#fdecea';
        t.style.color = ok ? '#1b5e20' : '#b71c1c';
        t.innerHTML = html;
        t.style.display = 'block';
        clearTimeout(this._tt);
        if (ok !== null) this._tt = setTimeout(() => { t.style.display = 'none'; }, 3500);
    },

    // שמירה בימות: קוראים את הקובץ העדכני, מחליפים רק את עמודת הסטטוס, ושומרים
    async save(zeouts, code) {
        const label = code ? msStatusName(code) : 'ללא סטטוס';
        this.toast(`<i class="fa fa-spinner fa-spin"></i> שומר "${this.esc(label)}" ל-${zeouts.length} לקוחות...`, null);
        try {
            const raw = await YemotAPI.fetchRawBaseDataAPI('server');
            if (!raw.contents) throw new Error('קובץ הלקוחות ריק או לא נמצא');
            const want = new Set(zeouts.map(String));
            const done = new Set();
            const lines = raw.contents.split('\n').map((line) => {
                const z = line.split(',')[0].trim();
                if (!want.has(z)) return line;
                const cols = line.replace(/\r$/, '').split(',');
                while (cols.length < 7) cols.push('');
                cols[4] = String(code).replace(/,/g, '');
                done.add(z);
                return cols.join(',') + (line.endsWith('\r') ? '\r' : '');
            });
            if (!done.size) throw new Error('הלקוחות לא נמצאו בקובץ');
            const res = await YemotAPI.uploadBaseData('server', lines.join('\n'));
            if (res && res.responseStatus && res.responseStatus !== 'OK') throw new Error(res.message || 'השמירה נכשלה');
            done.forEach((z) => { if (globalClientsMap[z]) globalClientsMap[z].yemotStatus = String(code); });
            if (typeof populateStatusFilter === 'function') populateStatusFilter();
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
            if (typeof ExamsManager !== 'undefined' && ExamsManager.reRender) ExamsManager.reRender();
            const missing = zeouts.length - done.size;
            this.toast(`<i class="fa fa-check"></i> הסטטוס "${this.esc(label)}" נשמר ל-${done.size} לקוחות${missing ? ` (${missing} לא נמצאו בקובץ)` : ''}`);
        } catch (e) {
            this.toast(`<i class="fa fa-exclamation-triangle"></i> שמירת הסטטוס נכשלה: ${this.esc(e.message)}`, false);
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    StatusManager.injectStyle();
    // מעבר בין מסכים – הסרגל מוצג רק במסך הלקוחות
    document.querySelectorAll('.main-nav-btn').forEach((b) => b.addEventListener('click', () => setTimeout(() => StatusManager.updateBulkBar(), 0)));
    // השמות הגיעו מהשרת – מציירים מחדש
    document.addEventListener('ms-config', () => {
        if (typeof globalClientsArray !== 'undefined' && globalClientsArray.length) {
            if (typeof populateStatusFilter === 'function') populateStatusFilter();
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
            if (typeof ExamsManager !== 'undefined' && ExamsManager.reRender) ExamsManager.reRender();
        }
    });
});
