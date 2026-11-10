// סגירת מבחן והעברה לארכיון "מבחנים קודמים" — פורט נאמן מהאתר הישן,
// עם מודל מעוצב במקום דיאלוגים של הדפדפן.
// משתמש אך ורק ב-endpoints הקיימים של ימות: GetIVR2Dir / UpdateExtension / FileAction.
// מבנה הנתיבים של v2: המבחן הפעיל ב-ivr2:/2/1/ , הארכיון ב-ivr2:/2/1/מבחנים-קודמים .
const CloseExamManager = {
    modalId: 'closeExamModal',
    API_GET_DIR:     'https://www.call2all.co.il/ym/api/GetIVR2Dir',
    API_FILE_ACTION: 'https://www.call2all.co.il/ym/api/FileAction',
    API_UPDATE_EXT:  'https://www.call2all.co.il/ym/api/UpdateExtension',

    EXAM_YMGR_ABS:    'ivr2:/2/1/ExaminationLogOK.ymgr',
    EXAM_DIR_ABS:     'ivr2:/2/1',
    ARCHIVE_BASE_REL: '2/1/מבחנים-קודמים',
    ARCHIVE_BASE_ABS: 'ivr2:/2/1/מבחנים-קודמים',

    getToken() { return localStorage.getItem('yemotToken'); },

    // רשימת הקבצים — בדיוק כמו בישן
    buildFileList() {
        const dir = this.EXAM_DIR_ABS;
        const wav = [];
        for (let i = 1; i <= 9; i++) wav.push(`${dir}/00${i}.wav`);
        wav.push(`${dir}/010.wav`);
        return {
            toMove: [...new Set([this.EXAM_YMGR_ABS, ...wav, `${dir}/examination.ini`])],
            iniToCopyName: 'ExaminationLogOK.ini',
            iniToCopySrc: `${dir}/ExaminationLogOK.ini`,
        };
    },

    ensureModal() {
        if (document.getElementById(this.modalId)) return;
        const html = `
        <div id="${this.modalId}" class="modal-overlay hidden" style="z-index: 2600;">
            <div class="modal-content" style="max-width: 560px; width: 95%;">
                <div class="modal-header" style="background:#f8f9fa; border-bottom:1px solid var(--border-light);">
                    <h2 style="font-size:1.25rem;"><i class="fa fa-stop-circle" style="color:#dc3545;"></i> סגירת מבחן והעברה לארכיון</h2>
                    <button class="close-btn" onclick="CloseExamManager.close()"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding: 22px 24px;">
                    <div id="closeExamForm">
                        <p style="margin-bottom:16px; color:var(--text-muted); font-size:0.95rem;">
                            המבחן הנוכחי יועבר לתיקייה חדשה תחת "מבחנים קודמים".
                        </p>
                        <div style="display:flex; gap:14px; align-items:flex-end; margin-bottom:18px;">
                            <div style="flex-shrink:0; text-align:center;">
                                <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">מספר סידורי</label>
                                <div id="closeExamSerial" style="background:var(--primary-color); color:#fff; font-weight:700; font-size:1.3rem; padding:6px 16px; border-radius:8px; min-width:60px;">--</div>
                            </div>
                            <div style="flex:1;">
                                <label style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">שם המבחן / פרשה</label>
                                <input type="text" id="closeExamParsha" placeholder="למשל: שמות (ריק = מבחן-תאריך)" style="width:100%; padding:9px 12px; border:1px solid var(--border-color); border-radius:8px; font-family:inherit; font-size:1rem;">
                            </div>
                        </div>
                        <div style="background:#fdfdfd; border:1px solid var(--border-light); border-radius:8px; padding:14px 16px; margin-bottom:16px;">
                            <strong style="font-size:0.9rem; color:var(--primary-color);"><i class="fa fa-files-o"></i> קבצים שיטופלו:</strong>
                            <div id="closeExamFilePreview" style="margin-top:10px; font-size:0.85rem; color:var(--text-main); max-height:160px; overflow:auto;"></div>
                        </div>
                        <div style="background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:8px; padding:10px 14px; font-size:0.85rem;">
                            <i class="fa fa-exclamation-triangle"></i> שים לב: פעולת "העברה" תסיר את הקבצים מנתיבם הנוכחי.
                        </div>
                    </div>
                    <div id="closeExamResult" style="display:none;"></div>
                </div>
                <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:12px; background:#f8f9fa; border-top:1px solid var(--border-light);">
                    <button id="closeExamCancelBtn" class="btn btn-secondary" style="padding:8px 20px;" onclick="CloseExamManager.close()">ביטול</button>
                    <button id="closeExamConfirmBtn" class="btn btn-primary" style="padding:8px 20px;" onclick="CloseExamManager.execute()"><i class="fa fa-check"></i> אישור וסגירת מבחן</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    close() {
        const m = document.getElementById(this.modalId);
        if (m) m.classList.add('hidden');
    },

    // הצעת מספר סידורי לתיקייה הבאה (כמו בישן: מוצא את המקסימום ומוסיף 1)
    async suggestNextArchiveFolderName() {
        const token = this.getToken();
        const apiUrl = `${this.API_GET_DIR}?token=${token}&path=${encodeURIComponent(this.ARCHIVE_BASE_REL)}&orderBy=name&orderDir=asc`;
        let maxNum = 0;
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) return (maxNum + 1).toString().padStart(2, '0');
            const data = await response.json();
            if (data.responseStatus === 'OK' && Array.isArray(data.dirs)) {
                data.dirs.forEach(dir => {
                    if (dir && typeof dir.name === 'string') {
                        const match = dir.name.match(/^(\d+)/);
                        if (match) {
                            const num = parseInt(match[1], 10);
                            if (!isNaN(num) && num > maxNum) maxNum = num;
                        }
                    }
                });
            }
        } catch (error) {
            console.error('שגיאה במשיכת תיקיות להצעת מספר:', error);
        }
        return (maxNum + 1).toString().padStart(2, '0');
    },

    async run() {
        const token = this.getToken();
        if (!token) { if (typeof showAlert === 'function') showAlert('נדרש טוקן API תקף כדי לסגור את המבחן.'); return; }

        const pool = (typeof ExamsManager !== 'undefined' && Array.isArray(ExamsManager.lastExamData)) ? ExamsManager.lastExamData : [];
        if (!pool.length) { if (typeof showAlert === 'function') showAlert('ניתן לסגור רק מבחן פעיל שנטענו בו נתונים.'); return; }

        this.ensureModal();

        // איפוס תצוגת המודל למצב טופס
        document.getElementById('closeExamForm').style.display = 'block';
        document.getElementById('closeExamResult').style.display = 'none';
        document.getElementById('closeExamResult').innerHTML = '';
        document.getElementById('closeExamParsha').value = '';
        const confirmBtn = document.getElementById('closeExamConfirmBtn');
        const cancelBtn = document.getElementById('closeExamCancelBtn');
        confirmBtn.style.display = '';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fa fa-check"></i> אישור וסגירת מבחן';
        cancelBtn.style.display = '';

        // תצוגת רשימת הקבצים
        const { toMove, iniToCopyName } = this.buildFileList();
        const moveHtml = toMove.map(f => `<div style="padding:2px 0;"><i class="fa fa-arrow-left" style="color:#dc3545; width:16px;"></i> ${f.substring(f.lastIndexOf('/') + 1)} <span style="color:var(--text-muted);">(העברה)</span></div>`).join('');
        const copyHtml = `<div style="padding:2px 0;"><i class="fa fa-copy" style="color:#2e7d32; width:16px;"></i> ${iniToCopyName} <span style="color:var(--text-muted);">(העתקה)</span></div>`;
        document.getElementById('closeExamFilePreview').innerHTML = moveHtml + copyHtml;

        // מספר סידורי
        document.getElementById('closeExamSerial').textContent = '...';
        document.getElementById(this.modalId).classList.remove('hidden');
        const prefix = await this.suggestNextArchiveFolderName();
        document.getElementById('closeExamSerial').textContent = prefix;
        this._suggestedPrefix = prefix;
    },

    async execute() {
        const token = this.getToken();
        const suggestedPrefix = this._suggestedPrefix || '01';
        const todayDate = new Date().toLocaleDateString('fr-CA');
        const rawParsha = (document.getElementById('closeExamParsha').value || '').trim();
        const finalFolderNamePart = rawParsha === '' ? `מבחן-${todayDate}` : rawParsha.replace(/[\\/?%*:|"<>.]/g, '-');
        const sanitizedFolderName = `${suggestedPrefix} ${finalFolderNamePart}`;
        const targetDirectoryPath = `${this.ARCHIVE_BASE_ABS}/${sanitizedFolderName}`;

        const { toMove, iniToCopyName, iniToCopySrc } = this.buildFileList();

        // מצב "בעבודה"
        const confirmBtn = document.getElementById('closeExamConfirmBtn');
        const cancelBtn = document.getElementById('closeExamCancelBtn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> מבצע...';
        cancelBtn.style.display = 'none';

        const resultEl = document.getElementById('closeExamResult');
        document.getElementById('closeExamForm').style.display = 'none';
        resultEl.style.display = 'block';
        resultEl.innerHTML = `<div style="text-align:center; padding:10px 0; color:var(--primary-color);"><i class="fa fa-spinner fa-spin" style="font-size:2rem;"></i><p style="margin-top:10px;">יוצר תיקייה ומעביר קבצים...</p></div>`;

        const rows = [];

        // 1) יצירת התיקייה
        let dirOk = false;
        try {
            const createDirApiUrl = `${this.API_UPDATE_EXT}?token=${token}&path=${encodeURIComponent(targetDirectoryPath)}`;
            const dirResponse = await fetch(createDirApiUrl);
            const d = await dirResponse.json();
            if (dirResponse.ok && !(d.responseStatus && d.responseStatus !== 'OK' && d.responseStatus !== 'Success' && d.ReturnValue !== 'True' && d.success !== true)) {
                dirOk = true;
                rows.push({ name: `תיקייה: ${sanitizedFolderName}`, ok: true, note: 'נוצרה' });
            } else {
                let msg = d.message || d.description || `שגיאה ${dirResponse.status}`;
                if (d.error) msg += ` (${d.error})`;
                rows.push({ name: `תיקייה: ${sanitizedFolderName}`, ok: false, note: msg });
            }
        } catch (error) {
            rows.push({ name: `תיקייה: ${sanitizedFolderName}`, ok: false, note: `שגיאת תקשורת: ${error.message}` });
        }

        if (dirOk) {
            // 2) העברת הקבצים
            for (const sourceFilePath of toMove) {
                const fileName = sourceFilePath.substring(sourceFilePath.lastIndexOf('/') + 1);
                const targetFilePath = `${targetDirectoryPath}/${fileName}`;
                const url = `${this.API_FILE_ACTION}?token=${token}&action=move&what=${encodeURIComponent(sourceFilePath)}&target=${encodeURIComponent(targetFilePath)}`;
                try {
                    const r = await fetch(url);
                    const rd = await r.json();
                    if (r.ok && rd.success === true) rows.push({ name: fileName, ok: true, note: 'הועבר' });
                    else {
                        let m = rd?.message || `שגיאה ${r.status}`;
                        if (rd?.reports?.[0]?.message) m = rd.reports[0].message;
                        rows.push({ name: fileName, ok: false, note: m });
                    }
                } catch (error) {
                    rows.push({ name: fileName, ok: false, note: `שגיאת תקשורת: ${error.message}` });
                }
            }
            // 3) העתקת ExaminationLogOK.ini
            const targetIniPathForCopy = `${targetDirectoryPath}/${iniToCopyName}`;
            const copyUrl = `${this.API_FILE_ACTION}?token=${token}&action=copy&what=${encodeURIComponent(iniToCopySrc)}&target=${encodeURIComponent(targetIniPathForCopy)}`;
            try {
                const r = await fetch(copyUrl);
                const rd = await r.json();
                if (r.ok && rd.success === true) rows.push({ name: iniToCopyName, ok: true, note: 'הועתק' });
                else {
                    let m = rd?.message || `שגיאה ${r.status}`;
                    if (rd?.reports?.[0]?.message) m = rd.reports[0].message;
                    rows.push({ name: iniToCopyName, ok: false, note: m });
                }
            } catch (error) {
                rows.push({ name: iniToCopyName, ok: false, note: `שגיאת תקשורת: ${error.message}` });
            }
        }

        // תצוגת סיכום
        const allOk = rows.every(r => r.ok);
        const headerColor = !dirOk ? '#dc3545' : (allOk ? '#2e7d32' : '#856404');
        const headerIcon = !dirOk ? 'fa-times-circle' : (allOk ? 'fa-check-circle' : 'fa-exclamation-triangle');
        const headerText = !dirOk ? 'הסגירה נכשלה' : (allOk ? 'המבחן נסגר והועבר לארכיון בהצלחה' : 'הסגירה הושלמה עם אזהרות');
        const rowsHtml = rows.map(r => `
            <div style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid var(--border-light); font-size:0.88rem;">
                <i class="fa ${r.ok ? 'fa-check' : 'fa-times'}" style="color:${r.ok ? '#2e7d32' : '#dc3545'}; width:16px;"></i>
                <span style="flex:1;">${r.name}</span>
                <span style="color:var(--text-muted); font-size:0.82rem;">${r.note}</span>
            </div>`).join('');
        resultEl.innerHTML = `
            <div style="text-align:center; margin-bottom:14px;">
                <i class="fa ${headerIcon}" style="color:${headerColor}; font-size:2.4rem;"></i>
                <h3 style="margin-top:8px; color:${headerColor}; font-size:1.1rem;">${headerText}</h3>
            </div>
            <div style="max-height:220px; overflow:auto;">${rowsHtml}</div>`;

        confirmBtn.style.display = 'none';
        cancelBtn.style.display = '';
        cancelBtn.className = 'btn btn-primary';
        cancelBtn.innerHTML = '<i class="fa fa-check"></i> סיום';
        cancelBtn.onclick = () => CloseExamManager.finish();
    },

    finish() {
        this.close();
        // החזרת כפתור הביטול למצבו המקורי
        const cancelBtn = document.getElementById('closeExamCancelBtn');
        if (cancelBtn) { cancelBtn.className = 'btn btn-secondary'; cancelBtn.innerHTML = 'ביטול'; cancelBtn.onclick = () => CloseExamManager.close(); }
        if (typeof window.refreshApplicationData === 'function') window.refreshApplicationData();
    }
};
