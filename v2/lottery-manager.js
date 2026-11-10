// ניהול ההגרלה (פורט נאמן מהאתר הישן)
// ההגרלה היא צד-לקוח בלבד — בוחרת זוכה אקראי מתוך נתוני המבחן שכבר נטענו
// (ExamsManager.lastExamData). אין שום קריאה למערכת הטלפונית (ימות).
const LotteryManager = {
    modalId: 'lotteryModalV2',
    firstDraw: true,

    // מאגר המשתתפים = כל הנבחנים במבחן הפעיל (זהה להתנהגות הישן: מגרילים מבין כולם)
    getPool() {
        return (typeof ExamsManager !== 'undefined' && Array.isArray(ExamsManager.lastExamData))
            ? ExamsManager.lastExamData
            : [];
    },

    ensureModal() {
        if (document.getElementById(this.modalId)) return;
        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = 'modal-overlay hidden';
        modal.style.zIndex = '1600';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 480px;">
                <div class="modal-header">
                    <h2><i class="fa fa-trophy"></i> תוצאות ההגרלה</h2>
                    <button class="close-btn" onclick="LotteryManager.close()"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div id="lotteryResultContentV2" style="text-align:center; padding: 10px 0; min-height: 150px; display:flex; align-items:center; justify-content:center;"></div>
                    <div style="text-align:center; margin-top: 15px;">
                        <button id="drawWinnerBtnV2" class="btn btn-primary" onclick="LotteryManager.draw()">
                            <i class="fa fa-random"></i> ביצוע ההגרלה
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) LotteryManager.close(); });
    },

    open() {
        const pool = this.getPool();
        if (!pool.length) {
            if (typeof showAlert === 'function') showAlert('אין נתוני מבחן זמינים להגרלה.');
            return;
        }
        this.ensureModal();
        this.firstDraw = true;
        const content = document.getElementById('lotteryResultContentV2');
        const btn = document.getElementById('drawWinnerBtnV2');
        content.innerHTML = `<p style="color: var(--text-muted); font-size: 1.1rem;">לחץ על "ביצוע ההגרלה" כדי לבחור זוכה מבין ${pool.length} הנבחנים.</p>`;
        btn.innerHTML = '<i class="fa fa-random"></i> ביצוע ההגרלה';
        document.getElementById(this.modalId).classList.remove('hidden');
    },

    close() {
        const m = document.getElementById(this.modalId);
        if (m) m.classList.add('hidden');
    },

    draw() {
        const pool = this.getPool();
        const content = document.getElementById('lotteryResultContentV2');
        if (!pool.length) {
            content.innerHTML = '<p>אין נתונים זמינים להגרלה. נא לטעון נתונים תחילה.</p>';
            return;
        }

        const winner = pool[Math.floor(Math.random() * pool.length)];
        const zeout = winner.EnterId || '';
        const clientInfo = (typeof globalClientsMap !== 'undefined' && globalClientsMap[zeout]) ? globalClientsMap[zeout] : {};
        const name = clientInfo.firstName ? `${clientInfo.firstName} ${clientInfo.lastName}` : (winner.ValName || 'לא זמין');
        const phone = winner.Phone || 'לא זמין';
        const score = parseInt(winner.QuestionScoreTotal) || 0;
        const passed = score >= 80;
        const statusStyle = passed ? 'color:#2e7d32; font-weight:bold;' : 'color:#c62828; font-weight:bold;';
        const statusText = passed ? 'עבר את הציון 80+' : 'לא עבר את הציון 80';

        content.innerHTML = `
            <div style="font-size: 1.15rem; line-height: 1.9;">
                <div style="font-size:2.6rem; margin-bottom:8px;">🎉</div>
                <p><strong>שם הזוכה:</strong> ${name}</p>
                <p><strong>מספר זהות:</strong> ${zeout || '-'}</p>
                <p><strong>טלפון:</strong> <span dir="ltr">${phone}</span></p>
                <p><strong>ציון:</strong> ${score} <span style="${statusStyle}">(${statusText})</span></p>
            </div>`;

        const btn = document.getElementById('drawWinnerBtnV2');
        if (this.firstDraw) {
            btn.innerHTML = '<i class="fa fa-repeat"></i> איפוס והגרל שוב';
            this.firstDraw = false;
        }
    }
};
