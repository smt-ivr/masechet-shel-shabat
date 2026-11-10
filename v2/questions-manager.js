const QuestionsManager = {
    modalId: 'questionsManagerModal',
    answersMap: {},
    audioMap: {},
    pendingFiles: {},
    maxQ: 0,
    currentEditQ: null,
    newQNumStr: null,
    
    init() {
        this.injectHTML();
        this.bindEvents();
    },

    injectHTML() {
        if (document.getElementById(this.modalId)) return;

        const html = `
        <style>
            .changed-question {
                background-color: #fffdf5 !important;
                border: 2px solid #ffc107 !important;
                box-shadow: 0 0 8px rgba(255, 193, 7, 0.2);
                transition: all 0.3s ease;
            }
        </style>
        
        <div id="${this.modalId}" class="modal-overlay hidden" style="z-index: 2000;">
            <div class="modal-content" style="width: 750px; max-width: 95vw; height: 95vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h2><i class="fa fa-list-ol"></i> ניהול שאלות ותשובות</h2>
                    <button id="closeQuestionsModalBtn" class="close-btn"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" style="background: #fafafa; padding: 20px; overflow-y: auto; flex: 1;">
                    <div id="questionsLoading" class="text-center hidden" style="padding: 15vh 0; color: var(--primary-color);">
                        <i class="fa fa-spinner fa-spin" style="font-size: 4rem; margin-bottom: 20px;"></i>
                        <h4>טוען נתוני שאלות...</h4>
                    </div>
                    <div id="questionsError" class="hidden text-center" style="color: #dc3545; padding: 40px 20px;"></div>
                    
                    <div id="questionsContent" class="hidden">
                        <div id="summaryBar" class="summary-bar" style="margin-bottom: 15px; padding: 10px 15px; background: #eaf1ff; border-color: #cce0ff; color: var(--primary-color);">
                            <span style="font-size: 0.9rem;">
                                <i class="fa fa-info-circle"></i> שינויים בערכים יודגשו בצבע צהוב. הם יישמרו בשרת רק לאחר לחיצה על "שמור שינויים" בתחתית החלון.
                            </span>
                        </div>
                        <div id="questionsListContainer" style="display: flex; flex-direction: column; gap: 10px;">
                            </div>
                        <div style="margin-top: 15px; text-align: left;">
                            <button id="openAddQuestionBtn" class="btn btn-secondary"><i class="fa fa-plus"></i> הוסף שאלה חדשה</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <span id="questionsSaveStatus" style="font-weight: 500; font-size: 0.95rem;"></span>
                    <button id="saveQuestionsBtn" class="btn btn-primary" disabled><i class="fa fa-save"></i> שמור שינויים במערכת</button>
                </div>
            </div>
        </div>

        <div id="replaceAudioModal" class="modal-overlay hidden" style="z-index: 2500; background: rgba(0,0,0,0.6);">
            <div class="modal-content" style="max-width: 400px; height: auto;">
                <div class="modal-header" style="background: #fff3cd; color: #856404; border-bottom-color: #ffeeba;">
                    <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fa fa-exclamation-triangle"></i> העלאת קובץ שמע
                    </h3>
                    <button onclick="document.getElementById('replaceAudioModal').classList.add('hidden')" class="close-btn" style="color:#856404;"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body text-center" style="padding: 25px 20px;">
                    <p style="margin-bottom: 20px; font-size: 0.95rem; color: #333;">
                        בחירת קובץ חדש <strong>תדרוס</strong> את הקובץ הקיים בשרת לאחר השמירה!
                    </p>
                    <input type="file" id="replaceFileInput" accept="audio/*" class="form-control" style="width: 100%; margin-bottom: 20px; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="confirmReplaceFileBtn" class="btn btn-danger"><i class="fa fa-check"></i> אשר בחירה</button>
                        <button onclick="document.getElementById('replaceAudioModal').classList.add('hidden')" class="btn btn-secondary">ביטול</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="addQuestionModal" class="modal-overlay hidden" style="z-index: 2600; background: rgba(0,0,0,0.7);">
            <div class="modal-content" style="max-width: 450px; height: auto;">
                <div class="modal-header">
                    <h3 style="margin: 0; font-size: 1.2rem;"><i class="fa fa-plus-circle"></i> הוספת שאלה חדשה (<span id="newQNumDisplay" style="color:var(--primary-color);"></span>)</h3>
                    <button id="closeAddQuestionBtn" onclick="document.getElementById('addQuestionModal').classList.add('hidden')" class="close-btn"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div class="form-group">
                        <label>תשובה נכונה לשאלה (חובה):</label>
                        <select id="newQAnswer" class="form-control" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                            <option value="" disabled selected>בחר תשובה 1-4</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-top: 15px;">
                        <label>קובץ שמע לשאלה (חובה):</label>
                        <input type="file" id="newQFileInput" accept="audio/*" class="form-control" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
                    </div>
                    <div id="addQError" style="color: #dc3545; margin-top: 10px; font-size: 0.9rem; font-weight:500;" class="hidden"></div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; background: #f8f9fa;">
                    <span id="addQStatus" style="font-size: 0.9rem; font-weight: 500; color:var(--primary-color);"></span>
                    <div style="display:flex; gap:10px;">
                        <button id="cancelNewQuestionBtn" onclick="document.getElementById('addQuestionModal').classList.add('hidden')" class="btn btn-secondary">ביטול</button>
                        <button id="saveNewQuestionBtn" class="btn btn-primary"><i class="fa fa-upload"></i> העלה למערכת</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    bindEvents() {
        document.getElementById('closeQuestionsModalBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('saveQuestionsBtn').addEventListener('click', () => this.saveData());
        document.getElementById('confirmReplaceFileBtn').addEventListener('click', () => this.confirmFileSelection());
        document.getElementById('openAddQuestionBtn').addEventListener('click', () => this.openAddQuestionModal());
        document.getElementById('saveNewQuestionBtn').addEventListener('click', () => this.saveNewQuestion());

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (btn && btn.id === 'btnManageQuestions') {
                this.openModal();
            }
        });
    },

    openModal() {
        document.getElementById(this.modalId).classList.remove('hidden');
        document.getElementById('saveQuestionsBtn').classList.remove('pulse-primary');
        document.getElementById('questionsSaveStatus').innerHTML = '';
        this.fetchData();
    },

    closeModal() {
        document.getElementById(this.modalId).classList.add('hidden');
        this.stopAllAudio();
    },

    stopAllAudio() {
        document.querySelectorAll('.q-audio-player').forEach(a => a.pause());
    },

    async fetchData() {
        const token = localStorage.getItem('yemotToken');
        if (!token) return this.showError('חסר טוקן חיבור לימות המשיח.');

        this.showLoading();
        this.answersMap = {};
        this.audioMap = {};
        this.pendingFiles = {};

        try {
            const answersRes = await fetch(`https://www.call2all.co.il/ym/api/GetTextFile?token=${token}&what=ivr2:/2/1/examination.ini`);
            const answersData = await answersRes.json();
            
            // זיהוי אם המבחן טרם נוצר או שאין בו שאלות (הקובץ לא קיים)
            if (answersData.responseStatus === 'ERROR' && (answersData.message === 'file does not exist' || answersData.message.includes('not exist'))) {
                this.maxQ = 0;
                this.renderEmptyState();
                return;
            }

            if (answersData.responseStatus === 'OK' && answersData.contents) {
                const lines = answersData.contents.split('\n');
                lines.forEach(line => {
                    const match = line.trim().match(/^(\d{3})=(\d)$/);
                    if (match) this.answersMap[match[1]] = match[2];
                });
            }

            // טוען אודיו רק אם הקובץ לא היה חסר
            const audioRes = await fetch(`https://www.call2all.co.il/ym/api/GetIVR2Dir?token=${token}&path=2/1`);
            const audioData = await audioRes.json();
            
            if (audioData.responseStatus === 'OK' && audioData.files) {
                audioData.files.forEach(file => {
                    if (file.fileType === "AUDIO" && file.name) {
                        const match = file.name.match(/^(\d{3})\.wav$/);
                        if (match) this.audioMap[match[1]] = true;
                    }
                });
            }

            this.maxQ = 10;
            const allKeys = [...Object.keys(this.answersMap), ...Object.keys(this.audioMap)].map(Number);
            if (allKeys.length > 0) {
                const highest = Math.max(...allKeys);
                if (highest > this.maxQ) this.maxQ = highest;
            }

            document.getElementById('summaryBar').classList.remove('hidden');
            this.renderQuestionsList();

            document.getElementById('questionsLoading').classList.add('hidden');
            document.getElementById('questionsContent').classList.remove('hidden');
            document.getElementById('saveQuestionsBtn').disabled = false;

        } catch (error) {
            this.showError('שגיאה בתקשורת מול השרת במשיכת השאלות.');
            console.error(error);
        }
    },

    renderEmptyState() {
        const container = document.getElementById('questionsListContainer');
        container.innerHTML = `
            <div class="text-center" style="padding: 60px 20px; color: var(--text-muted); background: #fff; border-radius: 8px; border: 1px dashed #ccc;">
                <i class="fa fa-phone-square" style="font-size: 4rem; margin-bottom: 15px; color: #adb5bd;"></i>
                <h3 style="margin-bottom: 10px; color: #495057;">עדיין אין שאלות במבחן זה</h3>
                <p style="font-size: 1.05rem;">
                    יש להקליט את השאלות ולהגדיר את התשובות הנכונות דרך הטלפון בשלוחת הניהול.<br>
                    ניתן גם להוסיף את השאלה הראשונה כאן באמצעות כפתור "הוסף שאלה חדשה".
                </p>
            </div>
        `;
        document.getElementById('summaryBar').classList.add('hidden'); // מסתיר את שורת ההסבר כשהטבלה ריקה
        document.getElementById('questionsLoading').classList.add('hidden');
        document.getElementById('questionsError').classList.add('hidden');
        document.getElementById('questionsContent').classList.remove('hidden');
        document.getElementById('saveQuestionsBtn').disabled = true;
    },

    renderQuestionsList() {
        const container = document.getElementById('questionsListContainer');
        const token = localStorage.getItem('yemotToken');
        container.innerHTML = '';
        
        let html = '';
        for (let i = 1; i <= this.maxQ; i++) {
            const qNumStr = i.toString().padStart(3, '0');
            const currentAnswer = this.answersMap[qNumStr] || '';
            const hasAudio = this.audioMap[qNumStr];
            
            let audioHtml = hasAudio 
                ? `<audio controls controlsList="nodownload noplaybackrate" class="q-audio-player" preload="none" src="https://www.call2all.co.il/ym/api/DownloadFile?token=${token}&path=ivr2:2/1/${qNumStr}.wav" style="height: 35px; max-width: 210px; outline:none;"></audio>`
                : `<span style="color: var(--text-muted); font-size: 0.85rem;"><i class="fa fa-microphone-slash"></i> לא הוקלט בשרת</span>`;

            html += `
                <div id="q-card-${qNumStr}" class="data-card" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; margin-bottom:0; border: 1px solid var(--border-light);">
                    <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                        <span style="font-weight: bold; color: var(--primary-color); min-width: 60px;">שאלה ${i}</span>
                        <div id="audio-wrapper-${qNumStr}" style="min-width: 220px; display:flex; align-items:center;">${audioHtml}</div>
                        <button id="btn-upload-${qNumStr}" class="btn btn-sm btn-secondary" onclick="QuestionsManager.openReplaceModal('${qNumStr}')" style="margin:0;">
                            <i class="fa fa-upload"></i> החלף שמע
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">תשובה נכונה:</label>
                        <select class="question-answer-select" data-qnum="${qNumStr}" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; width: 65px; text-align: center; font-weight:bold;">
                            ${currentAnswer ? '' : '<option value="" disabled selected>בחר</option>'}
                            <option value="1" ${currentAnswer === '1' ? 'selected' : ''}>1</option>
                            <option value="2" ${currentAnswer === '2' ? 'selected' : ''}>2</option>
                            <option value="3" ${currentAnswer === '3' ? 'selected' : ''}>3</option>
                            <option value="4" ${currentAnswer === '4' ? 'selected' : ''}>4</option>
                        </select>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        this.attachListeners();
    },

    attachListeners() {
        const audios = document.querySelectorAll('.q-audio-player');
        audios.forEach(audio => {
            audio.addEventListener('play', (e) => {
                audios.forEach(other => {
                    if (other !== e.target) {
                        other.pause();
                    }
                });
            });
        });

        document.querySelectorAll('.question-answer-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const qNum = e.target.getAttribute('data-qnum');
                this.answersMap[qNum] = e.target.value;
                document.getElementById('saveQuestionsBtn').classList.add('pulse-primary');
                document.getElementById('questionsSaveStatus').innerHTML = '';
                
                const card = document.getElementById(`q-card-${qNum}`);
                if (card) card.classList.add('changed-question');
            });
        });
    },

    openReplaceModal(qNumStr) {
        this.currentEditQ = qNumStr;
        document.getElementById('replaceFileInput').value = ''; 
        document.getElementById('replaceAudioModal').classList.remove('hidden');
    },

    confirmFileSelection() {
        const fileInput = document.getElementById('replaceFileInput');
        if (fileInput.files && fileInput.files.length > 0) {
            const qNum = this.currentEditQ;
            this.pendingFiles[qNum] = fileInput.files[0];
            document.getElementById('saveQuestionsBtn').classList.add('pulse-primary');
            document.getElementById('questionsSaveStatus').innerHTML = '';
            
            const card = document.getElementById(`q-card-${qNum}`);
            if (card) card.classList.add('changed-question');
            
            const btn = document.getElementById(`btn-upload-${qNum}`);
            if(btn) {
                btn.className = 'btn btn-sm btn-success';
                btn.innerHTML = '<i class="fa fa-refresh"></i> החלף שוב';
            }
            const audioWrapper = document.getElementById(`audio-wrapper-${qNum}`);
            if(audioWrapper) {
                const oldAudio = audioWrapper.querySelector('audio');
                if(oldAudio) oldAudio.pause();
                audioWrapper.innerHTML = `<span style="color: #28a745; font-size: 0.85rem; font-weight: bold;"><i class="fa fa-file-audio-o"></i> קובץ חדש ממתין לשמירה</span>`;
            }
        }
        document.getElementById('replaceAudioModal').classList.add('hidden');
    },

    openAddQuestionModal() {
        const nextQ = this.maxQ + 1;
        this.newQNumStr = nextQ.toString().padStart(3, '0');
        document.getElementById('newQNumDisplay').textContent = this.newQNumStr;
        document.getElementById('newQAnswer').value = "";
        document.getElementById('newQFileInput').value = "";
        document.getElementById('addQError').classList.add('hidden');
        document.getElementById('addQStatus').innerHTML = "";
        
        document.getElementById('addQuestionModal').classList.remove('hidden');
    },

    async saveNewQuestion() {
        const token = localStorage.getItem('yemotToken');
        const answer = document.getElementById('newQAnswer').value;
        const fileInput = document.getElementById('newQFileInput');
        const errorEl = document.getElementById('addQError');
        const statusEl = document.getElementById('addQStatus');
        
        const btnSave = document.getElementById('saveNewQuestionBtn');
        const btnCancel = document.getElementById('cancelNewQuestionBtn');
        const btnClose = document.getElementById('closeAddQuestionBtn');

        if (!answer) {
            errorEl.textContent = "חובה לבחור את התשובה הנכונה לשאלה.";
            errorEl.classList.remove('hidden');
            return;
        }
        if (!fileInput.files || fileInput.files.length === 0) {
            errorEl.textContent = "חובה לבחור קובץ שמע להעלאה.";
            errorEl.classList.remove('hidden');
            return;
        }

        errorEl.classList.add('hidden');
        
        btnSave.disabled = true;
        btnCancel.disabled = true;
        btnClose.style.pointerEvents = 'none';
        
        try {
            statusEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> מעלה קובץ שמע לשרת...';
            const formData = new FormData();
            formData.append('token', token);
            formData.append('path', `ivr2:2/1/${this.newQNumStr}.wav`);
            formData.append('convertAudio', '1');
            formData.append('file', fileInput.files[0]);

            const upRes = await fetch(`https://www.call2all.co.il/ym/api/UploadFile`, { method: 'POST', body: formData });
            const upData = await upRes.json();
            if (upData.responseStatus !== 'OK') throw new Error(upData.message || "שגיאה בהעלאת הקובץ לשרת.");

            statusEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> מעדכן את קובץ התשובות...';
            this.answersMap[this.newQNumStr] = answer;
            
            let newContentArray = [];
            for (let i = 1; i <= this.maxQ + 1; i++) {
                const qNumStr = i.toString().padStart(3, '0');
                const val = this.answersMap[qNumStr];
                if (val && val !== '') {
                    newContentArray.push(`${qNumStr}=${val}`);
                }
            }
            const newContents = newContentArray.join('\r\n') + '\r\n';
            
            const params = new URLSearchParams();
            params.append('token', token);
            params.append('what', 'ivr2:/2/1/examination.ini');
            params.append('contents', newContents);

            const iniRes = await fetch(`https://www.call2all.co.il/ym/api/UploadTextFile`, { method: 'POST', body: params });
            const iniData = await iniRes.json();
            if (iniData.responseStatus !== 'OK') throw new Error(iniData.message || "שגיאה בעדכון קובץ התשובות.");

            statusEl.style.color = "green";
            statusEl.innerHTML = '<i class="fa fa-check"></i> השאלה הוספה למערכת!';
            
            setTimeout(() => {
                document.getElementById('addQuestionModal').classList.add('hidden');
                btnSave.disabled = false;
                btnCancel.disabled = false;
                btnClose.style.pointerEvents = 'auto';
                this.fetchData(); 
            }, 1500);

        } catch(err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
            statusEl.innerHTML = "";
            btnSave.disabled = false;
            btnCancel.disabled = false;
            btnClose.style.pointerEvents = 'auto';
        }
    },

    async saveData() {
        const token = localStorage.getItem('yemotToken');
        if (!token) return;

        const btn = document.getElementById('saveQuestionsBtn');
        const statusEl = document.getElementById('questionsSaveStatus');
        
        btn.disabled = true;
        btn.classList.remove('pulse-primary');
        statusEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> מעדכן שינויים בהשרת...';
        statusEl.style.color = 'var(--text-main)';

        try {
            const fileKeys = Object.keys(this.pendingFiles);
            let uploadPromises = [];
            
            fileKeys.forEach(qNum => {
                const file = this.pendingFiles[qNum];
                const formData = new FormData();
                formData.append('token', token);
                formData.append('path', `ivr2:2/1/${qNum}.wav`);
                formData.append('convertAudio', '1');
                formData.append('file', file);

                const p = fetch(`https://www.call2all.co.il/ym/api/UploadFile`, {
                    method: 'POST',
                    body: formData
                }).then(res => res.json()).then(data => {
                    if(data.responseStatus !== 'OK') throw new Error(data.message || `שגיאה בהחלפת אודיו ${qNum}`);
                });
                uploadPromises.push(p);
            });

            if(uploadPromises.length > 0) {
                await Promise.all(uploadPromises);
            }

            let newContentArray = [];
            for (let i = 1; i <= this.maxQ; i++) {
                const qNumStr = i.toString().padStart(3, '0');
                const val = this.answersMap[qNumStr];
                if (val && val !== '') {
                    newContentArray.push(`${qNumStr}=${val}`);
                }
            }

            const newContents = newContentArray.join('\r\n') + '\r\n';
            const params = new URLSearchParams();
            params.append('token', token);
            params.append('what', 'ivr2:/2/1/examination.ini');
            params.append('contents', newContents);

            const res = await fetch(`https://www.call2all.co.il/ym/api/UploadTextFile`, {
                method: 'POST',
                body: params
            });
            const data = await res.json();

            if (data.responseStatus !== 'OK') {
                throw new Error(data.message || 'שגיאה בעדכון קובץ התשובות.');
            }

            statusEl.style.color = 'green';
            statusEl.innerHTML = '<i class="fa fa-check"></i> כל השינויים נשמרו בהצלחה!';
            
            setTimeout(() => {
                this.fetchData(); 
            }, 1000);

        } catch (error) {
            statusEl.style.color = 'red';
            statusEl.innerHTML = '<i class="fa fa-exclamation-triangle"></i> שגיאה: ' + error.message;
            btn.disabled = false;
        }
    },

    showLoading() {
        document.getElementById('questionsLoading').classList.remove('hidden');
        document.getElementById('questionsError').classList.add('hidden');
        document.getElementById('questionsContent').classList.add('hidden');
        document.getElementById('saveQuestionsBtn').disabled = true;
    },

    showError(msg) {
        const errEl = document.getElementById('questionsError');
        errEl.innerHTML = `<i class="fa fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i><br>${msg}`;
        errEl.classList.remove('hidden');
        document.getElementById('questionsLoading').classList.add('hidden');
        document.getElementById('questionsContent').classList.add('hidden');
        document.getElementById('saveQuestionsBtn').disabled = true;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    QuestionsManager.init();
});