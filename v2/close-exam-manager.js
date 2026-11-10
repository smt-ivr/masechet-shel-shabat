// סגירת מבחן והעברה לארכיון "מבחנים קודמים" — פורט נאמן מהאתר הישן.
// משתמש אך ורק ב-endpoints הקיימים של ימות: GetIVR2Dir / UpdateExtension / FileAction.
// מבנה הנתיבים של v2: המבחן הפעיל ב-ivr2:/2/1/ , הארכיון ב-ivr2:/2/1/מבחנים-קודמים .
const CloseExamManager = {
    API_GET_DIR:     'https://www.call2all.co.il/ym/api/GetIVR2Dir',
    API_FILE_ACTION: 'https://www.call2all.co.il/ym/api/FileAction',
    API_UPDATE_EXT:  'https://www.call2all.co.il/ym/api/UpdateExtension',

    EXAM_YMGR_ABS:    'ivr2:/2/1/ExaminationLogOK.ymgr',
    EXAM_DIR_ABS:     'ivr2:/2/1',
    ARCHIVE_BASE_REL: '2/1/מבחנים-קודמים',
    ARCHIVE_BASE_ABS: 'ivr2:/2/1/מבחנים-קודמים',

    getToken() { return localStorage.getItem('yemotToken'); },

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

        const suggestedPrefix = await this.suggestNextArchiveFolderName();
        const todayDate = new Date().toLocaleDateString('fr-CA');

        const folderNameSuffix = prompt(`המספר הסידורי האוטומטי שנוצר עבור התיקייה הוא: "${suggestedPrefix}".\nאנא הזן את פרשת המבחן (למשל: 'שמות').\nהשאר ריק לשימוש בשם: 'מבחן-${todayDate}'.`, ``);
        if (folderNameSuffix === null) { if (typeof showAlert === 'function') showAlert('סגירת המבחן בוטלה.'); return; }

        const finalFolderNamePart = folderNameSuffix.trim() === "" ? `מבחן-${todayDate}` : folderNameSuffix.trim().replace(/[\\/?%*:|"<>.]/g, '-');
        const sanitizedFolderName = `${suggestedPrefix} ${finalFolderNamePart}`;
        const targetDirectoryPath = `${this.ARCHIVE_BASE_ABS}/${sanitizedFolderName}`;

        // רשימת הקבצים להעברה — בדיוק כמו בישן: קובץ המבחן + 001..010.wav + examination.ini
        const dir = this.EXAM_DIR_ABS;
        const wavFilesPaths = [];
        for (let i = 1; i <= 9; i++) wavFilesPaths.push(`${dir}/00${i}.wav`);
        wavFilesPaths.push(`${dir}/010.wav`);
        const sourceExaminationIniPath = `${dir}/examination.ini`;
        const uniqueFilesToMove = [...new Set([this.EXAM_YMGR_ABS, ...wavFilesPaths, sourceExaminationIniPath])];

        // קובץ להעתקה (לא מועבר) — בדיוק כמו בישן
        const iniFileNameToCopy = 'ExaminationLogOK.ini';
        const sourceIniToCopy = `${dir}/${iniFileNameToCopy}`;

        const fileNamesOnlyForConfirm = uniqueFilesToMove.map(f => '  - ' + f.substring(f.lastIndexOf('/') + 1)).join('\n');
        if (!confirm(`האם אתה בטוח שברצונך לסגור את המבחן ולבצע את הפעולות הבאות?\n\nקבצים להעברה:\n${fileNamesOnlyForConfirm}\n\nקובץ להעתקה:\n  - ${iniFileNameToCopy}\n\nלתיקייה חדשה בשם "${sanitizedFolderName}"\nבנתיב: "${targetDirectoryPath}"\n\nשים לב: פעולת "העברה" תסיר את הקבצים מנתיבם הנוכחי.`)) {
            if (typeof showAlert === 'function') showAlert('תהליך סגירת המבחן בוטל על ידך.');
            return;
        }

        const attemptedMoves = [];
        const attemptedCopies = [];
        let dirCreationSuccess = false;
        let summary = '';

        // 1) יצירת התיקייה
        const createDirApiUrl = `${this.API_UPDATE_EXT}?token=${token}&path=${encodeURIComponent(targetDirectoryPath)}`;
        try {
            const dirResponse = await fetch(createDirApiUrl);
            const dirResponseData = await dirResponse.json();
            if (!dirResponse.ok || (dirResponseData.responseStatus && dirResponseData.responseStatus !== 'OK' && dirResponseData.responseStatus !== 'Success' && dirResponseData.ReturnValue !== 'True' && dirResponseData.success !== true)) {
                let dirErrorMsg = dirResponseData.message || dirResponseData.description || `שגיאה ${dirResponse.status} ביצירת התיקייה.`;
                if (dirResponseData.error) dirErrorMsg += ` (${dirResponseData.error})`;
                throw new Error(dirErrorMsg);
            }
            dirCreationSuccess = true;
        } catch (error) {
            console.error('שגיאה ביצירת התיקייה:', error);
            if (typeof showAlert === 'function') showAlert(`סגירת המבחן נכשלה: שגיאה ביצירת התיקייה "${sanitizedFolderName}": ${error.message}`);
            return;
        }

        // 2) העברת הקבצים
        for (const sourceFilePath of uniqueFilesToMove) {
            const fileName = sourceFilePath.substring(sourceFilePath.lastIndexOf('/') + 1);
            const targetFilePath = `${targetDirectoryPath}/${fileName}`;
            const moveFileApiUrl = `${this.API_FILE_ACTION}?token=${token}&action=move&what=${encodeURIComponent(sourceFilePath)}&target=${encodeURIComponent(targetFilePath)}`;
            try {
                const moveResponse = await fetch(moveFileApiUrl);
                const moveResponseData = await moveResponse.json();
                if (moveResponse.ok && moveResponseData.success === true) {
                    attemptedMoves.push({ name: fileName, success: true });
                } else {
                    let fileErrorMsg = moveResponseData?.message || `שגיאה ${moveResponse.status}`;
                    if (moveResponseData?.reports?.[0]?.message) fileErrorMsg = moveResponseData.reports[0].message;
                    attemptedMoves.push({ name: fileName, success: false, error: fileErrorMsg });
                }
            } catch (error) {
                attemptedMoves.push({ name: fileName, success: false, error: `שגיאת תקשורת: ${error.message}` });
            }
        }

        // 3) העתקת ExaminationLogOK.ini
        const targetIniPathForCopy = `${targetDirectoryPath}/${iniFileNameToCopy}`;
        const copyIniApiUrl = `${this.API_FILE_ACTION}?token=${token}&action=copy&what=${encodeURIComponent(sourceIniToCopy)}&target=${encodeURIComponent(targetIniPathForCopy)}`;
        try {
            const copyResponse = await fetch(copyIniApiUrl);
            const copyResponseData = await copyResponse.json();
            if (copyResponse.ok && copyResponseData.success === true) {
                attemptedCopies.push({ name: iniFileNameToCopy, success: true });
            } else {
                let iniCopyErrorMsg = copyResponseData?.message || `שגיאה ${copyResponse.status}`;
                if (copyResponseData?.reports?.[0]?.message) iniCopyErrorMsg = copyResponseData.reports[0].message;
                attemptedCopies.push({ name: iniFileNameToCopy, success: false, error: iniCopyErrorMsg });
            }
        } catch (error) {
            attemptedCopies.push({ name: iniFileNameToCopy, success: false, error: `שגיאת תקשורת: ${error.message}` });
        }

        // סיכום
        summary = `סיכום סגירת המבחן לתיקייה "${sanitizedFolderName}":\n\nהעברת קבצים:\n`;
        attemptedMoves.forEach(item => { summary += `• ${item.name}: ${item.success ? 'הועבר' : 'נכשל (' + item.error + ')'}\n`; });
        summary += `\nהעתקה:\n`;
        attemptedCopies.forEach(item => { summary += `• ${item.name}: ${item.success ? 'הועתק' : 'נכשל (' + item.error + ')'}\n`; });

        if (typeof showAlert === 'function') showAlert(summary.trim());

        // רענון נתוני המבחן (המבחן הנוכחי התרוקן)
        if (typeof window.refreshApplicationData === 'function') {
            window.refreshApplicationData();
        }
    }
};
