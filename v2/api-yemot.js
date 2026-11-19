// כל הפניות עוברות דרך השרת (/masechet/api/yemot/...), שמוסיף את הטוקן מהמסד ובודק הרשאות ונתיבים
const YemotAPI = {
    async fetchBaseData(token) {
        const data = await this.fetchRawBaseDataAPI(token);
        
        if (data.responseStatus && data.responseStatus !== "OK") {
            throw new Error(data.message || "קובץ בסיס לא נמצא או שגיאת מערכת");
        }
        
        let updateTime = 'לא ידוע';
        if (data.file && data.file.mtime) {
            updateTime = data.file.mtime;
        }
        return {
            clients: this.parseCSV(data.contents),
            lastUpdate: updateTime
        };
    },

    async fetchRawBaseDataAPI(token) {
        const url = `/masechet/api/yemot/GetTextFile?what=${encodeURIComponent(msIvr('clients_file'))}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('שגיאה בתקשורת מול מערכת ימות (קובץ בסיס)');
        return await res.json();
    },

    async uploadBaseData(token, contents) {
        const params = new URLSearchParams();
        params.append('what', msIvr('clients_file'));
        params.append('contents', contents);

        const url = `/masechet/api/yemot/UploadTextFile`;
        const res = await fetch(url, { method: 'POST', body: params });
        if (!res.ok) throw new Error('שגיאה בהעלאת קובץ למערכת');
        return await res.json();
    },

    async fetchPointsData(token) {
        try {
            const url = `/masechet/api/yemot/GetTextFile?what=${encodeURIComponent(msIvr('points_file'))}`;
            const res = await fetch(url);
            if (!res.ok) return { error: true, data: {} };
            const data = await res.json();
            
            if (data.responseStatus && data.responseStatus !== "OK") {
                return { error: true, message: data.message, data: {} };
            }
            
            const pointsMap = {};
            if (data.contents) {
                const lines = data.contents.split('\n');
                lines.forEach(line => {
                    line = line.trim();
                    if (!line) return;
                    const match = line.match(/list_all_information-(.+)-points_total=(\d+)/);
                    if (match && match[1] && match[2]) {
                        pointsMap[match[1]] = match[2];
                    }
                });
            }
            return { error: false, data: pointsMap };
        } catch (error) {
            console.error('שגיאה במשיכת נתוני הנקודות:', error);
            return { error: true, data: {} };
        }
    },

    async fetchRecordingsList(token) {
        try {
            const url = `/masechet/api/yemot/GetIVR2Dir?path=${encodeURIComponent(msPath('recordings_folder'))}`;
            const res = await fetch(url);
            if (!res.ok) return { error: true, data: {} };
            
            const data = await res.json();
            
            if (data.responseStatus && data.responseStatus !== "OK") {
                 return { error: true, message: data.message, data: {} };
            }
            
            const recordingsMap = {};
            if (data.files) {
                data.files.forEach(file => {
                    if (file.fileType === "AUDIO" && file.name) {
                        const match = file.name.match(/EnterID-(\d+)/);
                        if (match && match[1]) {
                            recordingsMap[match[1]] = file.what || `ivr2:${file.path}`;
                        }
                    }
                });
            }
            return { error: false, data: recordingsMap };
            
        } catch (error) {
            console.error('שגיאה במשיכת רשימת ההקלטות:', error);
            return { error: true, data: {} }; 
        }
    },

    async fetchExamData(token) {
        try {
            const url = `/masechet/api/yemot/RenderYMGRFile?wath=${encodeURIComponent(msIvr('exam_folder', 'ExaminationLogOK.ymgr'))}&convertType=json&notLoadLang=1`;
            const res = await fetch(url);
            if (!res.ok) {
                return { error: true, message: 'שגיאה בתקשורת מול שרת ימות (קובץ מבחנים)', data: [] };
            }
            
            const data = await res.json();
            
            if (data.responseStatus !== "OK") {
                if (data.responseStatus === "Exception" && data.message === "Error retrieving file path information") {
                    return { error: false, noExam: true, data: [] };
                }
                
                return { error: true, message: data.message || "שגיאה במשיכת נתוני מבחנים", data: [] };
            }
            
            return { error: false, noExam: false, data: data.data || [] };
        } catch (error) {
            console.error("fetchExamData error:", error);
            return { error: true, message: error.message, data: [] };
        }
    },

    // --- הפונקציות החדשות לניהול היסטורית מבחנים ---

    async fetchPreviousExamsList(token) {
        try {
            const url = `/masechet/api/yemot/GetIVR2Dir?path=${encodeURIComponent(msPath('archive_folder'))}`;
            const res = await fetch(url);
            if (!res.ok) {
                return { error: true, message: 'שגיאה בתקשורת מול שרת ימות (רשימת מבחנים)', dirs: [] };
            }
            
            const data = await res.json();
            
            if (data.responseStatus !== "OK") {
                // אם התיקייה עדיין לא קיימת
                if (data.message && data.message.includes("does not exist")) {
                    return { error: false, dirs: [] };
                }
                return { error: true, message: data.message || "שגיאה במשיכת רשימת מבחנים", dirs: [] };
            }
            
            return { error: false, dirs: data.dirs || [] };
        } catch (error) {
            console.error("fetchPreviousExamsList error:", error);
            return { error: true, message: error.message, dirs: [] };
        }
    },

    async fetchHistoricalExamData(token, folderPath) {
        try {
            const url = `/masechet/api/yemot/RenderYMGRFile?wath=${encodeURIComponent('ivr2:' + folderPath + '/ExaminationLogOK.ymgr')}&convertType=json&notLoadLang=1`;
            const res = await fetch(url);
            if (!res.ok) {
                return { error: true, message: 'שגיאה בתקשורת מול שרת ימות (קובץ מבחן עבר)', data: [] };
            }
            
            const data = await res.json();
            
            if (data.responseStatus !== "OK") {
                if (data.responseStatus === "Exception" && data.message === "Error retrieving file path information") {
                    return { error: false, noExam: true, data: [] };
                }
                
                return { error: true, message: data.message || "שגיאה במשיכת נתוני המבחן", data: [] };
            }
            
            return { error: false, noExam: false, data: data.data || [] };
        } catch (error) {
            console.error("fetchHistoricalExamData error:", error);
            return { error: true, message: error.message, data: [] };
        }
    },

    parseCSV(csvString) {
        if(!csvString) return [];
        const lines = csvString.split('\n');
        const result = [];
        let rowIndex = 1;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line === ',,,,,,') continue;
            
            const cols = line.split(',');
            const zeout = cols[0] ? cols[0].trim() : '';
            
            if (!zeout) continue; 
            
            if (cols.length >= 5) {
                result.push({
                    index: rowIndex++,
                    zeout: zeout,
                    firstName: cols[2] || '',
                    lastName: cols[3] || '',
                    status: cols[4] || '',
                    phone1: cols[5] || '',
                    phone2: cols[6] || ''
                });
            }
        }
        return result;
    }
};