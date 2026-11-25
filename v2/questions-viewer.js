// ============================================================
//  questions-viewer.js — שמיעת השאלות של מבחן קודם (צפייה בלבד)
//  לכל שאלה: הקלטה, התשובה הנכונה, וכמה נבחנים ענו נכון
// ============================================================
const QuestionsViewer = {
    esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

    ensure() {
        if (document.getElementById('qvModal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="qvModal" class="modal-overlay hidden" style="z-index: 2000;">
            <div class="modal-content" style="width: 720px; max-width: 95vw; max-height: 92vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h2 style="font-size:1.2rem;"><i class="fa fa-volume-up"></i> שאלות המבחן <span id="qvName" style="font-weight:400; color:var(--text-muted); font-size:1rem;"></span></h2>
                    <button class="close-btn" onclick="QuestionsViewer.close()"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" id="qvBody" style="background:#fafafa; padding:18px; overflow-y:auto; flex:1;"></div>
            </div>
        </div>`);
    },

    close() {
        document.querySelectorAll('#qvModal audio').forEach((a) => a.pause());
        document.getElementById('qvModal').classList.add('hidden');
    },

    async open(folderPath, name) {
        this.ensure();
        const rel = String(folderPath || '').replace(/^(\/*ivr2:)+/i, '').replace(/^\/+|\/+$/g, '');
        const ivr = 'ivr2:/' + rel;
        document.getElementById('qvName').textContent = '· ' + (name || rel);
        const body = document.getElementById('qvBody');
        body.innerHTML = '<div style="text-align:center; padding:50px; color:var(--primary-color);"><i class="fa fa-spinner fa-spin" style="font-size:2.5rem;"></i><p>טוען שאלות...</p></div>';
        document.getElementById('qvModal').classList.remove('hidden');
        try {
            const [ans, dir] = await Promise.all([
                fetch(`/masechet/api/yemot/GetTextFile?what=${encodeURIComponent(ivr + '/examination.ini')}`).then((r) => r.json()).catch(() => ({})),
                fetch(`/masechet/api/yemot/GetIVR2Dir?path=${encodeURIComponent(ivr)}`).then((r) => r.json()),
            ]);
            if (dir.responseStatus && dir.responseStatus !== 'OK') throw new Error(dir.message || 'שגיאה במשיכת התיקייה');
            const answers = {};
            String(ans.contents || '').split('\n').forEach((line) => {
                const m = line.trim().match(/^(\d{3})=(\d)$/);
                if (m) answers[m[1]] = m[2];
            });
            const audio = {};
            (dir.files || []).forEach((f) => { const m = String(f.name || '').match(/^(\d{3})\.(wav|mp3)$/i); if (m) audio[m[1]] = f.name; });
            const nums = [...new Set([...Object.keys(answers), ...Object.keys(audio)])].sort();
            if (!nums.length) {
                body.innerHTML = '<div style="text-align:center; padding:50px 20px; color:var(--text-muted); background:#fff; border:1px dashed #ccc; border-radius:8px;"><i class="fa fa-microphone-slash" style="font-size:3rem;"></i><h4 style="margin-top:12px;">לא נמצאו שאלות בתיקיית המבחן הזה</h4></div>';
                return;
            }
            // כמה ענו נכון – מתוך נתוני המבחן המוצג
            const data = (typeof ExamsManager !== 'undefined' && ExamsManager.history && ExamsManager.history.data) || [];
            body.innerHTML = nums.map((q) => {
                const i = parseInt(q, 10);
                let right = 0;
                data.forEach((row) => { if ((parseInt(row[`Q${i}Score`], 10) || 0) > 0) right++; });
                const pct = data.length ? Math.round((right / data.length) * 100) : null;
                return `<div class="data-card" style="display:flex; align-items:center; gap:14px; padding:10px 14px; margin-bottom:8px; flex-wrap:wrap;">
                    <b style="color:var(--primary-color); min-width:62px;">שאלה ${i}</b>
                    ${audio[q] ? `<audio controls preload="none" controlsList="nodownload" style="height:34px; max-width:260px;" src="/masechet/api/yemot/DownloadFile?path=${encodeURIComponent(ivr + '/' + audio[q])}"></audio>` : '<span style="color:var(--text-muted); font-size:.85rem;"><i class="fa fa-microphone-slash"></i> אין הקלטה</span>'}
                    <span style="margin-right:auto; font-size:.9rem;">תשובה נכונה: <b style="font-size:1.05rem;">${this.esc(answers[q] || '-')}</b></span>
                    ${pct !== null ? `<span title="${right} מתוך ${data.length}" style="font-size:.85rem; padding:2px 9px; border-radius:12px; background:${pct >= 70 ? '#e6f4ea' : pct >= 40 ? '#fff4d6' : '#fdecea'};">${pct}% ענו נכון</span>` : ''}
                </div>`;
            }).join('');
        } catch (e) {
            body.innerHTML = `<div style="text-align:center; padding:40px; color:#dc3545;"><i class="fa fa-exclamation-triangle" style="font-size:2rem;"></i><p>${this.esc(e.message)}</p></div>`;
        }
    },
};
