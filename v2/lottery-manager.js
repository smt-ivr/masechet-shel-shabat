// ============================================================
//  lottery-manager.js — הגרלות (נבנה מחדש)
//  • כל הגרלה משויכת למבחן: המבחן הפעיל או מבחן קודם. אפשר כמה הגרלות לכל מבחן
//    (לאברכים, לבחורים וכו') – לפי סטטוס, ציון מינימלי וכמות זוכים.
//  • ההגרלה מתבצעת כאן מתוך נתוני המבחן; התוצאות נשמרות בשרת (עריכה ומחיקה).
//  • אחרי השמירה: טעינת הזכייה לכל הזוכים בבת אחת בנדרים פלוס, עם תוצאה מפורטת לכל זוכה.
// ============================================================
const LotteryManager = {
    API: '/masechet/api/lotteries',
    ctx: null,          // { key, name, data } – המבחן שעליו עובדים
    list: [],
    showAll: false,
    draft: null,        // הגרלה חדשה לפני שמירה
    current: null,      // הגרלה שמורה שפתוחה
    editing: false,
    stores: null,
    winnersByExam: {},  // key → { zeout: [שמות הגרלות] } – לסימון 🏆 בטבלת המבחן

    // ===== עזרים =====
    esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    money(n) { const v = Number(n) || 0; return '₪' + v.toLocaleString('he-IL', { maximumFractionDigits: 2 }); },
    can(p) { return !document.documentElement.classList.contains('ms-no-' + p); },
    rand(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; },
    statusBadge(code) { return typeof StatusManager !== 'undefined' ? StatusManager.badge(code) : this.esc(msStatusName(code) || '-'); },
    async api(method, path = '', body) {
        const res = await fetch(this.API + path, {
            method, credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* ignore */ }
        if (!res.ok || (data && data.ok === false)) {
            const err = new Error((data && (data.error?.message || data.message)) || `שגיאה ${res.status}`);
            err.code = data && data.error && data.error.code;
            err.status = res.status;
            throw err;
        }
        return data && data.data !== undefined ? data.data : data;
    },
    toDMY(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; },
    toISO(dmy) { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; },

    // מי שהמבחן מוצג כרגע (פעיל או קודם)
    examContext() {
        if (typeof ExamsManager !== 'undefined' && ExamsManager.history) {
            const h = ExamsManager.history;
            return { key: this.normKey(h.path), name: h.name, data: h.data || [] };
        }
        return { key: 'current', name: 'המבחן הפעיל', data: (typeof ExamsManager !== 'undefined' && ExamsManager.lastExamData) || [] };
    },
    normKey(p) { const s = String(p || '').trim(); return !s || s === 'current' ? 'current' : s.replace(/^(\/*ivr2:)+/i, '').replace(/^\/+|\/+$/g, ''); },

    // מאגר המשתתפים: נבחן אחד לכל ת"ז (הציון הגבוה), עם כל הפרטים מהלקוחות ומנדרים
    participants(data) {
        const by = {};
        (data || []).forEach((row) => {
            const z = String(row.EnterId || '').trim();
            if (!z) return;
            const score = parseInt(row.QuestionScoreTotal, 10) || 0;
            if (by[z] && by[z].score >= score) return;
            const c = (typeof globalClientsMap !== 'undefined' && globalClientsMap[z]) || {};
            by[z] = {
                zeout: z,
                name: c.firstName ? `${c.firstName} ${c.lastName || ''}`.trim() : (row.ValName || 'לא קיים במערכת'),
                status_code: c.yemotStatus || '',
                phone: c.phone1 || '',
                phone2: c.phone2 || '',
                exam_phone: row.Phone || '',
                score,
                points: row.PointsAdd || '',
                exam_date: [row.Date, row.Time].filter(Boolean).join(' '),
                city: c.city || '',
                hasNedarim: !!c.hasNedarim,
                ytra: c.ytra || '',
                inClients: !!c.firstName,
            };
        });
        return Object.values(by);
    },

    // ===== סגנון =====
    injectStyle() {
        if (document.getElementById('lotStyle')) return;
        const st = document.createElement('style');
        st.id = 'lotStyle';
        st.textContent = `
        #lotModal .modal-content { width: 1100px; max-width: 96vw; height: 92vh; display: flex; flex-direction: column; }
        #lotModal .modal-body { flex: 1; overflow: auto; background: #f6f8fb; padding: 18px; }
        .lot-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .lot-toolbar .spacer { flex: 1; }
        .lot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
        .lot-card { background: #fff; border: 1px solid var(--border-color, #e3e8ef); border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: box-shadow .15s, transform .15s; }
        .lot-card:hover { box-shadow: 0 6px 18px rgba(30,58,138,.12); transform: translateY(-1px); }
        .lot-card h4 { margin: 0 0 6px; font-size: 1.05rem; color: var(--primary-color, #1e3a8a); display: flex; align-items: center; gap: 8px; }
        .lot-meta { font-size: .84rem; color: var(--text-muted, #6c757d); line-height: 1.7; }
        .lot-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 12px; font-size: .8rem; background: #eef2f8; color: #334; margin: 2px 0 2px 4px; white-space: nowrap; }
        .lot-chip.ok { background: #e6f4ea; color: #1b5e20; } .lot-chip.err { background: #fdecea; color: #b71c1c; } .lot-chip.warn { background: #fff4d6; color: #8a5a00; }
        .lot-progress { height: 6px; background: #eef2f8; border-radius: 4px; overflow: hidden; margin-top: 8px; }
        .lot-progress > div { height: 100%; background: #2e7d32; }
        .lot-empty { text-align: center; padding: 50px 20px; color: var(--text-muted, #6c757d); background: #fff; border: 1px dashed #cfd6e0; border-radius: 12px; }
        .lot-two { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
        @media (max-width: 860px) { .lot-two { grid-template-columns: 1fr; } }
        .lot-panel { background: #fff; border: 1px solid var(--border-color, #e3e8ef); border-radius: 12px; padding: 16px; }
        .lot-panel h5 { margin: 0 0 12px; font-size: .98rem; color: var(--primary-color, #1e3a8a); }
        .lot-field { margin-bottom: 12px; }
        .lot-field label { display: block; font-size: .85rem; color: #445; margin-bottom: 4px; font-weight: 500; }
        .lot-field input[type=text], .lot-field input[type=number], .lot-field input[type=date], .lot-field select, .lot-field textarea { width: 100%; padding: 7px 9px; border: 1px solid var(--border-color, #d5dbe3); border-radius: 7px; font: inherit; font-size: .92rem; box-sizing: border-box; }
        .lot-seg { display: flex; border: 1px solid #d5dbe3; border-radius: 8px; overflow: hidden; }
        .lot-seg button { flex: 1; background: #fff; border: none; border-left: 1px solid #d5dbe3; padding: 7px 4px; font: inherit; font-size: .86rem; cursor: pointer; }
        .lot-seg button:last-child { border-left: none; }
        .lot-seg button.on { background: var(--primary-color, #1e3a8a); color: #fff; }
        .lot-toggle { display: flex; flex-wrap: wrap; gap: 6px; }
        .lot-toggle button { border: 1px solid #d5dbe3; background: #fff; border-radius: 16px; padding: 4px 11px; font: inherit; font-size: .84rem; cursor: pointer; }
        .lot-toggle button.on { background: #e8efff; border-color: #6b8cff; color: #1e3a8a; font-weight: 600; }
        .lot-check { display: flex; align-items: center; gap: 7px; font-size: .88rem; margin: 6px 0; cursor: pointer; }
        .lot-pool { font-size: 1.05rem; padding: 10px 12px; background: #eef4ff; border-radius: 9px; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .lot-pool b { font-size: 1.4rem; color: var(--primary-color, #1e3a8a); }
        .lot-stage { min-height: 150px; border-radius: 14px; background: linear-gradient(160deg, #1e3a8a, #172554); color: #fff; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; padding: 20px; margin-bottom: 14px; }
        .lot-stage .big { font-size: 2rem; font-weight: 800; letter-spacing: .5px; min-height: 2.6rem; }
        .lot-stage .sub { color: #bfd2ff; margin-top: 6px; font-size: .95rem; }
        .lot-stage.spin .big { animation: lotPulse .25s infinite alternate; }
        @keyframes lotPulse { from { opacity: .55; transform: scale(.98); } to { opacity: 1; transform: scale(1.02); } }
        .lot-winners { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
        .lot-win { background: #fff; border: 2px solid #ffd54f; border-radius: 14px; padding: 14px 16px; position: relative; animation: lotIn .45s ease; }
        @keyframes lotIn { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
        .lot-win .rank { position: absolute; top: -12px; right: 14px; background: #ffb300; color: #fff; border-radius: 12px; padding: 1px 10px; font-weight: 700; font-size: .85rem; }
        .lot-win h4 { margin: 4px 0 8px; font-size: 1.25rem; color: #1e2a44; }
        .lot-kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: .9rem; }
        .lot-kv span:nth-child(odd) { color: var(--text-muted, #6c757d); white-space: nowrap; }
        .lot-win .acts { display: flex; gap: 6px; margin-top: 10px; }
        .lot-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; font-size: .88rem; }
        .lot-table th { background: #eef2f8; padding: 9px 8px; text-align: right; font-weight: 600; white-space: nowrap; }
        .lot-table td { padding: 8px; border-top: 1px solid #eef1f5; vertical-align: middle; }
        .lot-stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
        .lot-stat { flex: 1; min-width: 130px; background: #fff; border: 1px solid #e3e8ef; border-radius: 10px; padding: 10px 14px; }
        .lot-stat b { display: block; font-size: 1.4rem; color: var(--primary-color, #1e3a8a); }
        .lot-stat span { font-size: .82rem; color: var(--text-muted, #6c757d); }
        .lot-back { background: none; border: none; color: var(--primary-color, #1e3a8a); cursor: pointer; font: inherit; padding: 0; }
        .lot-dlg { position: fixed; inset: 0; background: rgba(15,23,42,.55); z-index: 2600; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .lot-dlg > div { background: #fff; border-radius: 14px; width: min(720px, 100%); max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 24px 70px rgba(0,0,0,.3); }
        .lot-dlg header { padding: 14px 18px; border-bottom: 1px solid #eef1f5; font-weight: 700; font-size: 1.05rem; display: flex; justify-content: space-between; align-items: center; }
        .lot-dlg main { padding: 16px 18px; overflow: auto; }
        .lot-dlg footer { padding: 12px 18px; border-top: 1px solid #eef1f5; display: flex; gap: 8px; justify-content: flex-end; }
        html.ms-no-exams_manage .lot-need-manage { display: none !important; }
        html.ms-no-nedarim_charge .lot-need-charge { display: none !important; }
        `;
        document.head.appendChild(st);
    },

    ensureModal() {
        this.injectStyle();
        if (document.getElementById('lotModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="lotModal" class="modal-overlay hidden" style="z-index: 1600;">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fa fa-trophy" style="color:#ffb300;"></i> הגרלות <span id="lotExamName" style="font-weight:400; color:var(--text-muted); font-size:1rem;"></span></h2>
                    <button class="close-btn" onclick="LotteryManager.close()"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" id="lotBody"></div>
            </div>
        </div>`);
    },

    // ===== פתיחה =====
    async open(ctx) {
        this.ensureModal();
        this.ctx = ctx || this.examContext();
        this.showAll = false;
        document.getElementById('lotExamName').textContent = '· ' + this.ctx.name;
        document.getElementById('lotModal').classList.remove('hidden');
        await this.showList();
    },
    close() {
        if (this.draft && this.draft.winners.length && !confirm('תוצאות ההגרלה עוד לא נשמרו. לסגור בכל זאת?')) return;
        this.draft = null;
        document.getElementById('lotModal').classList.add('hidden');
        if (typeof ExamsManager !== 'undefined') ExamsManager.refreshView && ExamsManager.refreshView();
    },
    body(html) { document.getElementById('lotBody').innerHTML = html; document.getElementById('lotBody').scrollTop = 0; },

    // ===== רשימת ההגרלות של המבחן =====
    async showList() {
        this.draft = null; this.current = null; this.editing = false;
        this.body('<div class="lot-empty"><i class="fa fa-spinner fa-spin" style="font-size:2rem;"></i><p>טוען הגרלות...</p></div>');
        try {
            const r = await this.api('GET', this.showAll ? '' : '?exam=' + encodeURIComponent(this.ctx.key));
            this.list = r.lotteries || [];
            if (!this.showAll) this.cacheWinners(this.ctx.key);
        } catch (e) {
            return this.body(`<div class="lot-empty" style="color:#b71c1c;"><i class="fa fa-exclamation-triangle" style="font-size:2rem;"></i><p>${this.esc(e.message)}</p></div>`);
        }
        const pool = this.participants(this.ctx.data);
        const cards = this.list.map((l) => {
            const pct = l.winners ? Math.round((l.loaded / l.winners) * 100) : 0;
            const sts = (l.statuses || []).length ? l.statuses.map((s) => `<span class="lot-chip">${this.esc(msStatusName(s))}</span>`).join('') : '<span class="lot-chip">כל הסטטוסים</span>';
            return `<div class="lot-card" onclick="LotteryManager.openLottery(${l.id})">
                <h4><i class="fa fa-trophy" style="color:#ffb300;"></i> ${this.esc(l.title)}</h4>
                ${this.showAll ? `<div class="lot-meta"><i class="fa fa-folder-o"></i> ${this.esc(l.exam_name || (l.exam_key === 'current' ? 'המבחן הפעיל' : l.exam_key))}</div>` : ''}
                <div>${sts}${l.min_score ? `<span class="lot-chip">ציון ${l.min_score}+</span>` : ''}</div>
                <div class="lot-meta">${l.winners} זוכים · ${l.pool_size} משתתפים · ${l.prize_amount ? this.money(l.prize_amount) + ' לזוכה' : 'ללא סכום'}<br>
                    ${this.esc(l.created_at)} · ${this.esc(l.created_by_name || '')}</div>
                <div style="margin-top:6px;">${l.loaded ? `<span class="lot-chip ok"><i class="fa fa-check"></i> נטען ל-${l.loaded} מתוך ${l.winners}</span>` : (l.prize_amount ? '<span class="lot-chip warn">טרם נטען בנדרים</span>' : '')}${l.failed ? `<span class="lot-chip err">${l.failed} נכשלו</span>` : ''}</div>
                ${l.prize_amount ? `<div class="lot-progress"><div style="width:${pct}%"></div></div>` : ''}
            </div>`;
        }).join('');
        this.body(`
            <div class="lot-toolbar">
                <button class="btn btn-primary lot-need-manage" ${pool.length ? '' : 'disabled title="אין נבחנים במבחן הזה"'} onclick="LotteryManager.newLottery()"><i class="fa fa-plus"></i> הגרלה חדשה</button>
                <span class="lot-meta">${pool.length ? `${pool.length} נבחנים במבחן` : 'אין נתוני נבחנים למבחן הזה'}</span>
                <span class="spacer"></span>
                <label class="lot-check" style="margin:0;"><input type="checkbox" ${this.showAll ? 'checked' : ''} onchange="LotteryManager.showAll=this.checked; LotteryManager.showList()"> הצגת ההגרלות של כל המבחנים</label>
            </div>
            ${this.list.length ? `<div class="lot-grid">${cards}</div>` : `<div class="lot-empty"><i class="fa fa-trophy" style="font-size:3rem; color:#e0c36a;"></i><h4 style="margin:12px 0 6px;">עוד לא בוצעו הגרלות ${this.showAll ? '' : 'במבחן הזה'}</h4><p>לחצו על "הגרלה חדשה" – לכל קבוצה (אברכים, בחורים וכו') אפשר הגרלה נפרדת</p></div>`}`);
    },

    cacheWinners(key) {
        // הזוכים בכל ההגרלות של המבחן – לסימון 🏆 בטבלה ולמניעת זכייה כפולה
        Promise.all(this.list.filter((l) => l.exam_key === key).map((l) => this.api('GET', '/' + l.id).then((r) => r.lottery).catch(() => null)))
            .then((ls) => {
                const map = {};
                ls.filter(Boolean).forEach((l) => l.winners.forEach((w) => { (map[w.zeout] = map[w.zeout] || []).push(l.title); }));
                this.winnersByExam[key] = map;
                if (typeof ExamsManager !== 'undefined' && ExamsManager.refreshView) ExamsManager.refreshView();
            });
    },

    // ===== הגרלה חדשה =====
    newLottery() {
        this.draft = {
            title: '', titleTouched: false, statuses: [], min_score: 80, count: 1, exclude_previous: true, only_nedarim: false,
            prize_amount: '', prize_expiration: '', prize_limited_id: '', prize_comment: '', notes: '', winners: [],
        };
        this.renderDraft();
        this.loadStores();
    },

    async loadStores() {
        if (this.stores || !this.can('nedarim_charge')) return;
        try {
            const res = await NedarimAPI.fetchLimitedStoresList('server', 'server');
            this.stores = Array.isArray(res) ? res : [];
            const sel = document.getElementById('lotStores');
            if (sel) sel.innerHTML = this.storeOptions(this.draft ? this.draft.prize_limited_id : '');
        } catch (e) { this.stores = []; }
    },
    storeOptions(cur) {
        return '<option value="">ללא הגבלה</option>' + (this.stores || []).map((s) => `<option value="${this.esc(s.ID)}" ${String(s.ID) === String(cur) ? 'selected' : ''}>${this.esc(s.ListName)}</option>`).join('');
    },

    eligible() {
        const d = this.draft;
        const prev = d.exclude_previous ? (this.winnersByExam[this.ctx.key] || {}) : {};
        const taken = new Set(d.winners.map((w) => w.zeout));
        return this.participants(this.ctx.data).filter((p) =>
            (!d.statuses.length || d.statuses.includes(p.status_code || '__none'))
            && p.score >= d.min_score
            && (!d.only_nedarim || p.hasNedarim)
            && !prev[p.zeout]
            && !taken.has(p.zeout));
    },

    renderDraft() {
        const d = this.draft;
        const pool = this.eligible();
        const statusBtns = [...(window.MS_STATUSES || []).map((s) => [s.code, s.name]), ['__none', 'ללא סטטוס']]
            .map(([c, n]) => `<button type="button" class="${d.statuses.includes(c) ? 'on' : ''}" onclick="LotteryManager.toggleStatus('${this.esc(c)}')">${this.esc(n)}</button>`).join('');
        const seg = [[0, 'כולם'], [80, '80+'], [90, '90+'], [100, '100']]
            .map(([v, t]) => `<button type="button" class="${d.min_score === v ? 'on' : ''}" onclick="LotteryManager.set('min_score', ${v})">${t}</button>`).join('');
        this.body(`
            <div class="lot-toolbar"><button class="lot-back" onclick="LotteryManager.backFromDraft()"><i class="fa fa-arrow-right"></i> חזרה לרשימת ההגרלות</button></div>
            <div class="lot-two">
                <div class="lot-panel">
                    <h5><i class="fa fa-sliders"></i> הגדרות ההגרלה</h5>
                    <div class="lot-field"><label>שם ההגרלה</label><input type="text" id="lotTitle" maxlength="120" value="${this.esc(d.title)}" placeholder="למשל: הגרלת אברכים" oninput="LotteryManager.draft.title=this.value; LotteryManager.draft.titleTouched=true;"></div>
                    <div class="lot-field"><label>מי משתתף (סטטוס)</label><div class="lot-toggle">${statusBtns}</div><div class="lot-meta" style="margin-top:4px;">${d.statuses.length ? '' : 'לא נבחר – כל הסטטוסים'}</div></div>
                    <div class="lot-field"><label>ציון מינימלי</label><div class="lot-seg">${seg}</div></div>
                    <div class="lot-field"><label>כמות זוכים</label><input type="number" min="1" max="200" value="${d.count}" onchange="LotteryManager.set('count', Math.max(1, Math.min(200, parseInt(this.value)||1)))"></div>
                    <label class="lot-check"><input type="checkbox" ${d.exclude_previous ? 'checked' : ''} onchange="LotteryManager.set('exclude_previous', this.checked)"> בלי מי שכבר זכה בהגרלה אחרת במבחן הזה</label>
                    <label class="lot-check"><input type="checkbox" ${d.only_nedarim ? 'checked' : ''} onchange="LotteryManager.set('only_nedarim', this.checked)"> רק מי שיש לו חשבון בנדרים פלוס</label>
                    <h5 style="margin-top:16px;"><i class="fa fa-gift"></i> הפרס (לטעינה בנדרים)</h5>
                    <div class="lot-field"><label>סכום לכל זוכה (₪)</label><input type="number" min="0" step="1" value="${this.esc(d.prize_amount)}" placeholder="למשל 100" oninput="LotteryManager.draft.prize_amount=this.value"></div>
                    <div class="lot-field"><label>תוקף הטעינה (לא חובה)</label><input type="date" value="${this.esc(this.toISO(d.prize_expiration))}" onchange="LotteryManager.draft.prize_expiration=LotteryManager.toDMY(this.value)"></div>
                    <div class="lot-field lot-need-charge"><label>הגבלה לקבוצת חנויות</label><select id="lotStores" onchange="LotteryManager.draft.prize_limited_id=this.value">${this.storeOptions(d.prize_limited_id)}</select></div>
                    <div class="lot-field"><label>הערה בטעינה (לא חובה)</label><input type="text" maxlength="200" value="${this.esc(d.prize_comment)}" placeholder="ברירת מחדל: זכייה בהגרלה: שם ההגרלה" oninput="LotteryManager.draft.prize_comment=this.value"></div>
                </div>
                <div>
                    <div class="lot-pool"><i class="fa fa-users"></i> משתתפים בהגרלה: <b id="lotPoolN">${pool.length + d.winners.length}</b>
                        <button class="btn btn-sm btn-secondary" style="margin-right:auto;" onclick="LotteryManager.showPool()"><i class="fa fa-list"></i> רשימת המשתתפים</button></div>
                    <div class="lot-stage" id="lotStage">
                        ${d.winners.length ? `<div class="big">🎉 ${d.winners.length === 1 ? 'יש זוכה!' : `${d.winners.length} זוכים`}</div><div class="sub">אפשר להגריל מחדש זוכה מסוים, או לשמור את התוצאות</div>`
                            : `<div class="big">🎲</div><div class="sub">${pool.length ? `מוכנים להגריל ${d.count > 1 ? d.count + ' זוכים' : 'זוכה'} מבין ${pool.length} משתתפים` : 'אין משתתפים שמתאימים להגדרות'}</div>`}
                    </div>
                    <div style="display:flex; gap:8px; justify-content:center; margin-bottom:14px;">
                        <button class="btn btn-primary" id="lotDrawBtn" style="font-size:1.05rem; padding:9px 26px;" ${pool.length || d.winners.length ? '' : 'disabled'} onclick="LotteryManager.draw()"><i class="fa fa-random"></i> ${d.winners.length ? 'הגרלה מחדש של כולם' : 'ביצוע ההגרלה'}</button>
                        ${d.winners.length ? `<button class="btn btn-success" onclick="LotteryManager.saveDraft()" style="font-size:1.05rem; padding:9px 26px;"><i class="fa fa-save"></i> שמירת תוצאות ההגרלה</button>` : ''}
                    </div>
                    <div class="lot-winners">${d.winners.map((w, i) => this.winnerCard(w, i, true)).join('')}</div>
                </div>
            </div>`);
    },

    winnerCard(w, i, draft) {
        const p = w;
        return `<div class="lot-win">
            <span class="rank">🏆 זוכה ${i + 1}</span>
            <h4>${this.esc(p.name)}</h4>
            <div class="lot-kv">
                <span>מספר זהות</span><span><a href="#" onclick="openClientCard('${this.esc(p.zeout)}'); return false;" style="font-weight:600;">${this.esc(p.zeout)}</a>${p.inClients === false ? ' <span class="lot-chip warn">לא בקובץ הלקוחות</span>' : ''}</span>
                <span>סטטוס</span><span>${this.statusBadge(p.status_code)}</span>
                <span>טלפון</span><span dir="ltr" style="text-align:right;">${this.esc(p.phone || '-')}${p.phone2 ? ' · ' + this.esc(p.phone2) : ''}</span>
                <span>נבחן מטלפון</span><span dir="ltr" style="text-align:right;">${this.esc(p.exam_phone || '-')}</span>
                <span>ציון</span><span><b style="color:${p.score >= 80 ? '#2e7d32' : '#c62828'};">${this.esc(p.score)}</b>${p.points ? ` · ${this.esc(p.points)} נקודות` : ''}</span>
                <span>מועד המבחן</span><span>${this.esc(p.exam_date || '-')}</span>
                <span>נדרים פלוס</span><span>${p.hasNedarim ? `<span class="lot-chip ok"><i class="fa fa-check"></i> יש חשבון</span> יתרה: <span dir="ltr">${this.esc(p.ytra)}</span>` : (window.isLoadingNedarim ? '<i class="fa fa-spinner fa-spin"></i>' : '<span class="lot-chip err">אין חשבון – לא ניתן לטעון</span>')}</span>
                ${p.city ? `<span>עיר</span><span>${this.esc(p.city)}</span>` : ''}
            </div>
            ${draft ? `<div class="acts"><button class="btn btn-sm btn-secondary" onclick="LotteryManager.redrawOne(${i})"><i class="fa fa-refresh"></i> הגרלה מחדש לזוכה הזה</button><button class="btn btn-sm btn-secondary" onclick="LotteryManager.removeDraftWinner(${i})"><i class="fa fa-times"></i> הסרה</button></div>` : ''}
        </div>`;
    },

    set(k, v) { this.draft[k] = v; if (['statuses', 'min_score', 'exclude_previous', 'only_nedarim'].includes(k) && this.draft.winners.length && !confirm('שינוי ההגדרות ימחק את הזוכים שהוגרלו. להמשיך?')) return this.renderDraft(); if (['statuses', 'min_score', 'exclude_previous', 'only_nedarim'].includes(k)) this.draft.winners = []; this.renderDraft(); },
    toggleStatus(code) {
        const d = this.draft;
        const next = d.statuses.includes(code) ? d.statuses.filter((c) => c !== code) : [...d.statuses, code];
        if (!d.titleTouched) {
            const names = next.map((c) => (c === '__none' ? 'ללא סטטוס' : msStatusName(c)));
            d.title = names.length ? 'הגרלת ' + names.join(' ו') : '';
        }
        this.set('statuses', next);
    },
    backFromDraft() {
        if (this.draft && this.draft.winners.length && !confirm('תוצאות ההגרלה עוד לא נשמרו. לחזור בכל זאת?')) return;
        this.showList();
    },

    showPool() {
        const pool = this.eligible().sort((a, b) => a.name.localeCompare(b.name, 'he'));
        this.dialog('משתתפים בהגרלה (' + pool.length + ')', `<table class="lot-table"><thead><tr><th>#</th><th>שם</th><th>ת"ז</th><th>סטטוס</th><th>ציון</th><th>נדרים</th></tr></thead><tbody>
            ${pool.map((p, i) => `<tr><td>${i + 1}</td><td>${this.esc(p.name)}</td><td>${this.esc(p.zeout)}</td><td>${this.statusBadge(p.status_code)}</td><td>${p.score}</td><td>${p.hasNedarim ? '✓' : '<span style="color:#b71c1c;">✗</span>'}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center; color:#888;">אין משתתפים</td></tr>'}
            </tbody></table>`, [['סגירה', 'btn-secondary', () => true]]);
    },

    // אנימציה: שמות מתחלפים ואז הזוכה
    async animate(names, finalText, sub) {
        const stage = document.getElementById('lotStage');
        if (!stage) return;
        stage.classList.add('spin');
        const start = Date.now();
        let delay = 45;
        while (Date.now() - start < 1800) {
            stage.innerHTML = `<div class="big">${this.esc(names[this.rand(names.length)])}</div><div class="sub">מגרילים...</div>`;
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 1.08, 160);
        }
        stage.classList.remove('spin');
        stage.innerHTML = `<div class="big">🎉 ${this.esc(finalText)}</div><div class="sub">${this.esc(sub || '')}</div>`;
    },

    async draw() {
        const d = this.draft;
        d.winners = [];
        const pool = this.eligible();
        if (!pool.length) return this.renderDraft();
        const n = Math.min(d.count, pool.length);
        const bag = pool.slice();
        const picked = [];
        for (let i = 0; i < n; i++) picked.push(bag.splice(this.rand(bag.length), 1)[0]);
        document.getElementById('lotDrawBtn').disabled = true;
        await this.animate(pool.map((p) => p.name), n === 1 ? picked[0].name : `${n} זוכים!`, n < d.count ? `היו רק ${pool.length} משתתפים מתאימים` : '');
        d.winners = picked;
        this.renderDraft();
    },
    async redrawOne(i) {
        const pool = this.eligible();
        if (!pool.length) return alert('אין משתתפים נוספים להגרלה');
        const w = pool[this.rand(pool.length)];
        this.draft.winners[i] = w;
        await this.animate(pool.map((p) => p.name), w.name, `זוכה ${i + 1} הוחלף`);
        this.renderDraft();
    },
    removeDraftWinner(i) { this.draft.winners.splice(i, 1); this.renderDraft(); },

    async saveDraft() {
        const d = this.draft;
        if (!d.title.trim()) { document.getElementById('lotTitle').focus(); return alert('תנו שם להגרלה (למשל: הגרלת אברכים)'); }
        try {
            const r = await this.api('POST', '', {
                exam_key: this.ctx.key, exam_name: this.ctx.name, title: d.title.trim(), statuses: d.statuses, min_score: d.min_score,
                exclude_previous: d.exclude_previous, pool_size: this.participants(this.ctx.data).filter((p) => (!d.statuses.length || d.statuses.includes(p.status_code || '__none')) && p.score >= d.min_score).length,
                prize_amount: Number(d.prize_amount) || 0, prize_expiration: d.prize_expiration, prize_limited_id: d.prize_limited_id, prize_comment: d.prize_comment,
                winners: d.winners.map((w, i) => ({ ...w, position: i + 1 })),
            });
            this.draft = null;
            this.current = r.lottery;
            this.renderLottery(true);
            this.cacheWinners(this.ctx.key);
        } catch (e) { alert('השמירה נכשלה: ' + e.message); }
    },

    // ===== הגרלה שמורה =====
    async openLottery(id) {
        this.body('<div class="lot-empty"><i class="fa fa-spinner fa-spin" style="font-size:2rem;"></i></div>');
        try { this.current = (await this.api('GET', '/' + id)).lottery; this.editing = false; this.renderLottery(); } catch (e) { alert(e.message); this.showList(); }
    },

    amountOf(w) { const l = this.current; return w.prize_amount !== null && w.prize_amount !== undefined && w.prize_amount !== '' ? Number(w.prize_amount) : Number(l.prize_amount) || 0; },
    loadChip(w) {
        if (w.load_status === 'ok') return `<span class="lot-chip ok"><i class="fa fa-check"></i> נטען</span><div class="lot-meta">${this.esc(w.loaded_at || '')}${w.tlush_id ? ' · טעינה ' + this.esc(w.tlush_id) : ''}</div>`;
        if (w.load_status === 'error') return `<span class="lot-chip err"><i class="fa fa-times"></i> נכשל</span><div class="lot-meta" style="color:#b71c1c;">${this.esc(w.load_message || '')}</div>`;
        if (w.load_status === 'cancelled') return `<span class="lot-chip warn">הטעינה בוטלה</span><div class="lot-meta">${this.esc(w.loaded_at || '')}</div>`;
        return '<span class="lot-chip">ממתין לטעינה</span>';
    },

    renderLottery(justSaved) {
        const l = this.current;
        const ed = this.editing;
        const pending = l.winners.filter((w) => w.load_status !== 'ok');
        const loaded = l.winners.filter((w) => w.load_status === 'ok');
        const total = l.winners.reduce((s, w) => s + this.amountOf(w), 0);
        const loadedSum = loaded.reduce((s, w) => s + this.amountOf(w), 0);
        const c = (z) => (typeof globalClientsMap !== 'undefined' && globalClientsMap[z]) || {};
        const rows = l.winners.map((w, i) => {
            const cl = c(w.zeout);
            return `<tr>
                <td style="font-weight:700; color:#b8860b;">${i + 1}</td>
                <td><b>${this.esc(w.name)}</b><div class="lot-meta"><a href="#" onclick="openClientCard('${this.esc(w.zeout)}'); return false;">${this.esc(w.zeout)}</a>${w.city ? ' · ' + this.esc(w.city) : ''}</div></td>
                <td>${this.statusBadge(cl.yemotStatus !== undefined ? cl.yemotStatus : w.status_code)}</td>
                <td dir="ltr" style="text-align:right;">${this.esc(cl.phone1 || w.phone || '-')}${(cl.phone2 || w.phone2) ? `<div class="lot-meta">${this.esc(cl.phone2 || w.phone2)}</div>` : ''}<div class="lot-meta" title="נבחן מטלפון">☎ ${this.esc(w.exam_phone || '-')}</div></td>
                <td><b>${this.esc(w.score ?? '-')}</b>${w.points ? `<div class="lot-meta">${this.esc(w.points)} נק'</div>` : ''}<div class="lot-meta">${this.esc(w.exam_date || '')}</div></td>
                <td>${cl.hasNedarim ? `<span class="lot-chip ok">יש חשבון</span><div class="lot-meta" dir="ltr" style="text-align:right;">${this.esc(cl.ytra)}</div>` : (window.isLoadingNedarim ? '<i class="fa fa-spinner fa-spin"></i>' : '<span class="lot-chip err">אין חשבון</span>')}</td>
                <td>${ed && w.load_status !== 'ok' ? `<input type="number" min="0" style="width:80px; padding:4px;" value="${w.prize_amount ?? ''}" placeholder="${l.prize_amount}" onchange="LotteryManager.current.winners[${i}].prize_amount=this.value===''?null:Number(this.value)">` : this.money(this.amountOf(w))}</td>
                <td>${this.loadChip(w)}</td>
                <td style="white-space:nowrap;">
                    ${!ed && w.load_status !== 'ok' && this.amountOf(w) > 0 ? `<button class="btn btn-sm btn-secondary lot-need-charge" onclick="LotteryManager.confirmLoad([${w.id}])" title="טעינה לזוכה הזה"><i class="fa fa-credit-card"></i></button>` : ''}
                    ${!ed && w.load_status === 'ok' && w.tlush_id ? `<button class="btn btn-sm btn-secondary lot-need-charge" onclick="LotteryManager.unload(${w.id})" title="ביטול הטעינה בנדרים"><i class="fa fa-undo"></i></button>` : ''}
                    ${ed && w.load_status !== 'ok' ? `<button class="btn btn-sm btn-secondary" onclick="LotteryManager.removeWinner(${i})" title="הסרת הזוכה"><i class="fa fa-trash"></i></button>` : ''}
                </td></tr>`;
        }).join('');
        const sts = (l.statuses || []).length ? l.statuses.map((s) => `<span class="lot-chip">${this.esc(s === '__none' ? 'ללא סטטוס' : msStatusName(s))}</span>`).join('') : '<span class="lot-chip">כל הסטטוסים</span>';
        this.body(`
            <div class="lot-toolbar">
                <button class="lot-back" onclick="LotteryManager.showList()"><i class="fa fa-arrow-right"></i> כל ההגרלות</button>
                <span class="spacer"></span>
                ${ed ? `<button class="btn btn-success" onclick="LotteryManager.saveEdit()"><i class="fa fa-save"></i> שמירת השינויים</button><button class="btn btn-secondary" onclick="LotteryManager.openLottery(${l.id})">ביטול</button>`
                    : `<button class="btn btn-secondary" onclick="LotteryManager.print()"><i class="fa fa-print"></i> הדפסה</button>
                       <button class="btn btn-secondary lot-need-manage" onclick="LotteryManager.editing=true; LotteryManager.renderLottery()"><i class="fa fa-pencil"></i> עריכה</button>
                       <button class="btn btn-secondary lot-need-manage" style="color:#b71c1c;" onclick="LotteryManager.remove()"><i class="fa fa-trash"></i> מחיקה</button>`}
            </div>
            ${justSaved ? '<div class="lot-pool" style="background:#e6f4ea; color:#1b5e20;"><i class="fa fa-check-circle"></i> תוצאות ההגרלה נשמרו בשרת</div>' : ''}
            <div class="lot-panel" style="margin-bottom:14px;">
                ${ed ? `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap:10px;">
                    <div class="lot-field"><label>שם ההגרלה</label><input type="text" id="lotEdTitle" value="${this.esc(l.title)}"></div>
                    <div class="lot-field"><label>סכום לכל זוכה (₪)</label><input type="number" min="0" id="lotEdAmount" value="${this.esc(l.prize_amount)}"></div>
                    <div class="lot-field"><label>תוקף הטעינה</label><input type="date" id="lotEdExp" value="${this.esc(this.toISO(l.prize_expiration))}"></div>
                    <div class="lot-field lot-need-charge"><label>קבוצת חנויות</label><select id="lotEdStores">${this.storeOptions(l.prize_limited_id)}</select></div>
                    <div class="lot-field"><label>הערה בטעינה</label><input type="text" id="lotEdComment" value="${this.esc(l.prize_comment || '')}"></div>
                    <div class="lot-field" style="grid-column:1/-1;"><label>הערות</label><textarea id="lotEdNotes" rows="2">${this.esc(l.notes || '')}</textarea></div>
                  </div>
                  <button class="btn btn-sm btn-secondary" onclick="LotteryManager.addWinner()"><i class="fa fa-plus"></i> הוספת זוכה</button>`
                : `<h3 style="margin:0 0 6px; color:var(--primary-color);"><i class="fa fa-trophy" style="color:#ffb300;"></i> ${this.esc(l.title)}</h3>
                   <div class="lot-meta"><i class="fa fa-folder-o"></i> ${this.esc(l.exam_name || (l.exam_key === 'current' ? 'המבחן הפעיל' : l.exam_key))} · הוגרל ${this.esc(l.created_at)} על ידי ${this.esc(l.created_by_name || '')}${l.updated_at ? ` · עודכן ${this.esc(l.updated_at)}` : ''}</div>
                   <div style="margin-top:6px;">${sts}${l.min_score ? `<span class="lot-chip">ציון ${l.min_score}+</span>` : '<span class="lot-chip">כל הציונים</span>'}<span class="lot-chip">${l.pool_size} משתתפים</span>${l.prize_expiration ? `<span class="lot-chip">תוקף ${this.esc(l.prize_expiration)}</span>` : ''}</div>
                   ${l.notes ? `<div class="lot-meta" style="margin-top:6px; white-space:pre-line;">${this.esc(l.notes)}</div>` : ''}`}
            </div>
            <div class="lot-stats">
                <div class="lot-stat"><b>${l.winners.length}</b><span>זוכים</span></div>
                <div class="lot-stat"><b>${this.money(total)}</b><span>סך הכול לטעינה</span></div>
                <div class="lot-stat"><b style="color:#2e7d32;">${loaded.length}</b><span>נטענו (${this.money(loadedSum)})</span></div>
                <div class="lot-stat"><b style="color:${pending.length ? '#b26a00' : '#2e7d32'};">${pending.length}</b><span>ממתינים לטעינה</span></div>
            </div>
            ${!ed && pending.length && total > 0 ? `<div class="lot-need-charge" style="text-align:center; margin-bottom:14px;"><button class="btn btn-success" style="font-size:1.05rem; padding:10px 28px;" onclick="LotteryManager.confirmLoad()"><i class="fa fa-credit-card"></i> טעינת הזכייה ל-${pending.length} זוכים בנדרים פלוס</button></div>` : ''}
            <div style="overflow:auto;"><table class="lot-table"><thead><tr><th>#</th><th>זוכה</th><th>סטטוס</th><th>טלפון</th><th>ציון</th><th>נדרים פלוס</th><th>סכום</th><th>טעינה</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="9" style="text-align:center; color:#888;">אין זוכים</td></tr>'}</tbody></table></div>`);
        if (ed) this.loadStores();
    },

    removeWinner(i) { this.current.winners.splice(i, 1); this.renderLottery(); },

    // הוספת זוכה: הגרלה נוספת מהמבחן (אם הנתונים טעונים) או לפי מספר זהות
    addWinner() {
        const l = this.current;
        const ctxData = l.exam_key === this.ctx.key ? this.ctx.data : [];
        const taken = new Set(l.winners.map((w) => w.zeout));
        const prev = this.winnersByExam[l.exam_key] || {};
        const pool = this.participants(ctxData).filter((p) => !taken.has(p.zeout) && !prev[p.zeout]
            && (!(l.statuses || []).length || l.statuses.includes(p.status_code || '__none')) && p.score >= (l.min_score || 0));
        this.dialog('הוספת זוכה', `
            ${pool.length ? `<button class="btn btn-primary" id="lotAddDraw" style="width:100%; margin-bottom:12px;"><i class="fa fa-random"></i> הגרלת זוכה נוסף מבין ${pool.length} משתתפים מתאימים</button>
              <div class="lot-meta" style="text-align:center; margin-bottom:12px;">או</div>` : '<div class="lot-meta" style="margin-bottom:10px;">כדי להגריל זוכה נוסף יש לפתוח את ההגרלה מתוך המבחן שלה</div>'}
            <div class="lot-field"><label>הוספה לפי מספר זהות</label><input type="text" id="lotAddZ" inputmode="numeric" placeholder="מספר זהות"></div>
            <div id="lotAddMsg" class="lot-meta"></div>`, [
            ['הוספה', 'btn-success', () => {
                const z = (document.getElementById('lotAddZ').value || '').replace(/\D/g, '');
                if (!z) { document.getElementById('lotAddMsg').textContent = 'הזינו מספר זהות'; return false; }
                if (taken.has(z)) { document.getElementById('lotAddMsg').textContent = 'הוא כבר ברשימת הזוכים'; return false; }
                const fromExam = this.participants(ctxData).find((p) => p.zeout === z);
                const cl = (typeof globalClientsMap !== 'undefined' && globalClientsMap[z]) || {};
                l.winners.push(fromExam || { zeout: z, name: cl.firstName ? `${cl.firstName} ${cl.lastName || ''}`.trim() : 'לא קיים במערכת', status_code: cl.yemotStatus || '', phone: cl.phone1 || '', phone2: cl.phone2 || '', city: cl.city || '', score: null, load_status: 'none' });
                this.renderLottery();
                return true;
            }],
            ['ביטול', 'btn-secondary', () => true],
        ]);
        const b = document.getElementById('lotAddDraw');
        if (b) b.onclick = () => { const w = pool[this.rand(pool.length)]; l.winners.push({ ...w, load_status: 'none' }); this.closeDialog(); this.renderLottery(); };
    },

    async saveEdit(force) {
        const l = this.current;
        const title = document.getElementById('lotEdTitle').value.trim();
        if (!title) return alert('חסר שם להגרלה');
        try {
            const r = await this.api('PUT', '/' + l.id, {
                title, prize_amount: Number(document.getElementById('lotEdAmount').value) || 0,
                prize_expiration: this.toDMY(document.getElementById('lotEdExp').value),
                prize_limited_id: (document.getElementById('lotEdStores') || {}).value || '',
                prize_comment: document.getElementById('lotEdComment').value, notes: document.getElementById('lotEdNotes').value,
                statuses: l.statuses, min_score: l.min_score, exclude_previous: l.exclude_previous, pool_size: l.pool_size, exam_name: l.exam_name,
                winners: l.winners.map((w, i) => ({ ...w, position: i + 1 })), force: !!force,
            });
            this.current = r.lottery; this.editing = false; this.renderLottery();
            this.cacheWinners(l.exam_key);
        } catch (e) { alert('השמירה נכשלה: ' + e.message); }
    },

    async remove() {
        const l = this.current;
        const loaded = l.winners.filter((w) => w.load_status === 'ok').length;
        if (!confirm(`למחוק את "${l.title}"?${loaded ? `\n\nשימו לב: ל-${loaded} זוכים כבר נטענה הזכייה בנדרים – המחיקה לא מבטלת את הטעינה.` : ''}`)) return;
        try { await this.api('DELETE', '/' + l.id + (loaded ? '?force=1' : '')); this.cacheWinners(l.exam_key); this.showList(); } catch (e) { alert(e.message); }
    },

    // ===== טעינה בנדרים =====
    confirmLoad(ids) {
        const l = this.current;
        const list = l.winners.filter((w) => w.load_status !== 'ok' && (!ids || ids.includes(w.id)));
        const c = (z) => (typeof globalClientsMap !== 'undefined' && globalClientsMap[z]) || {};
        const total = list.reduce((s, w) => s + this.amountOf(w), 0);
        const noAcc = list.filter((w) => !window.isLoadingNedarim && !c(w.zeout).hasNedarim);
        this.dialog('טעינת הזכייה בנדרים פלוס', `
            <div class="lot-stats"><div class="lot-stat"><b>${list.length}</b><span>זוכים</span></div><div class="lot-stat"><b>${this.money(total)}</b><span>סך הכול</span></div></div>
            ${noAcc.length ? `<div class="lot-pool" style="background:#fff4d6; color:#8a5a00;"><i class="fa fa-exclamation-triangle"></i> ל-${noAcc.length} זוכים אין חשבון בנדרים – הטעינה שלהם תיכשל</div>` : ''}
            <table class="lot-table"><thead><tr><th>זוכה</th><th>ת"ז</th><th>חשבון</th><th>סכום</th></tr></thead><tbody>
            ${list.map((w) => `<tr><td>${this.esc(w.name)}</td><td>${this.esc(w.zeout)}</td><td>${c(w.zeout).hasNedarim ? '✓' : '<span style="color:#b71c1c;">✗</span>'}</td><td>${this.money(this.amountOf(w))}</td></tr>`).join('')}
            </tbody></table>
            <div class="lot-meta" style="margin-top:10px;">הערה בטעינה: ${this.esc(l.prize_comment || `זכייה בהגרלה: ${l.title}${l.exam_name ? ' – ' + l.exam_name : ''}`)}${l.prize_expiration ? ` · תוקף ${this.esc(l.prize_expiration)}` : ''}</div>`, [
            ['<i class="fa fa-credit-card"></i> אישור וטעינה', 'btn-success', () => { const ids = list.map((w) => w.id); setTimeout(() => this.runLoad(ids), 0); return true; }],
            ['ביטול', 'btn-secondary', () => true],
        ]);
    },

    async runLoad(ids) {
        this.dialog('טוען בנדרים פלוס...', `<div style="text-align:center; padding:30px;"><i class="fa fa-spinner fa-spin" style="font-size:2.4rem; color:var(--primary-color);"></i><p style="margin-top:12px;">טוען ל-${ids.length} זוכים, נא לא לסגור את החלון</p></div>`, []);
        try {
            const r = await this.api('POST', `/${this.current.id}/load`, { winner_ids: ids });
            this.current = r.lottery;
            this.renderLottery();
            const s = r.summary;
            this.dialog(s.failed ? 'הטעינה הסתיימה עם שגיאות' : 'הטעינה הושלמה בהצלחה', `
                <div class="lot-stats"><div class="lot-stat"><b style="color:#2e7d32;">${s.ok}</b><span>נטענו (${this.money(s.total)})</span></div><div class="lot-stat"><b style="color:${s.failed ? '#b71c1c' : '#2e7d32'};">${s.failed}</b><span>נכשלו</span></div></div>
                <table class="lot-table"><thead><tr><th></th><th>זוכה</th><th>סכום</th><th>תוצאה</th></tr></thead><tbody>
                ${r.results.map((x) => `<tr><td>${x.status === 'ok' ? '<i class="fa fa-check" style="color:#2e7d32;"></i>' : '<i class="fa fa-times" style="color:#b71c1c;"></i>'}</td><td>${this.esc(x.name)}<div class="lot-meta">${this.esc(x.zeout)}</div></td><td>${this.money(x.amount)}</td><td>${this.esc(x.message)}${x.tlush_id ? `<div class="lot-meta">מספר טעינה: ${this.esc(x.tlush_id)}</div>` : ''}</td></tr>`).join('')}
                </tbody></table>`, [['סגירה', 'btn-primary', () => true]]);
            if (typeof window.refreshApplicationData === 'function' && s.ok) { /* היתרות יתעדכנו ברענון הבא */ }
        } catch (e) {
            this.closeDialog();
            alert('הטעינה נכשלה: ' + e.message);
        }
    },

    async unload(wid) {
        const w = this.current.winners.find((x) => x.id === wid);
        if (!confirm(`לבטל את הטעינה של ${this.money(this.amountOf(w))} ל${w.name}?`)) return;
        try { this.current = (await this.api('POST', `/${this.current.id}/winners/${wid}/unload`)).lottery; this.renderLottery(); } catch (e) { alert(e.message); }
    },

    print() {
        const l = this.current;
        const win = window.open('', '_blank');
        if (!win) return;
        const rows = l.winners.map((w, i) => `<tr><td>${i + 1}</td><td>${this.esc(w.name)}</td><td>${this.esc(w.zeout)}</td><td>${this.esc(msStatusName(w.status_code))}</td><td dir="ltr">${this.esc(w.phone || '')}</td><td>${this.esc(w.score ?? '')}</td><td>${this.money(this.amountOf(w))}</td><td>${w.load_status === 'ok' ? 'נטען' : w.load_status === 'error' ? 'נכשל' : w.load_status === 'cancelled' ? 'בוטל' : 'ממתין'}</td></tr>`).join('');
        win.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${this.esc(l.title)}</title>
            <style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#222}h1{margin:0 0 4px}p{color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:7px;text-align:right}th{background:#f1f4f9}</style></head>
            <body><h1>🏆 ${this.esc(l.title)}</h1><p>${this.esc(l.exam_name || '')} · ${this.esc(l.created_at)} · ${l.pool_size} משתתפים</p>
            <table><thead><tr><th>#</th><th>שם</th><th>ת"ז</th><th>סטטוס</th><th>טלפון</th><th>ציון</th><th>סכום</th><th>טעינה</th></tr></thead><tbody>${rows}</tbody></table>
            <script>window.onload=function(){window.print()}<\/script></body></html>`);
        win.document.close();
    },

    // ===== חלון קטן =====
    dialog(title, html, buttons) {
        this.closeDialog();
        const d = document.createElement('div');
        d.className = 'lot-dlg';
        d.id = 'lotDlg';
        d.innerHTML = `<div><header>${title}<button class="close-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;" data-x>×</button></header><main>${html}</main>${buttons.length ? `<footer>${buttons.map((b, i) => `<button class="btn ${b[1]}" data-b="${i}">${b[0]}</button>`).join('')}</footer>` : ''}</div>`;
        document.body.appendChild(d);
        d.querySelector('[data-x]').onclick = () => this.closeDialog();
        d.querySelectorAll('[data-b]').forEach((el) => { el.onclick = () => { if (buttons[el.dataset.b][2]() !== false) this.closeDialog(); }; });
    },
    closeDialog() { const d = document.getElementById('lotDlg'); if (d) d.remove(); },
};
