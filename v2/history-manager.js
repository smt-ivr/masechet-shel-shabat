const HistoryManager = {
    modalId: 'historyManagerModal',

    init() {
        this.injectHTML();
        this.bindEvents();
    },

    injectHTML() {
        if (document.getElementById(this.modalId)) return;
        const html = `
        <div id="${this.modalId}" class="modal-overlay hidden" style="z-index: 2000;">
            <div class="modal-content" style="width: 550px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column;">
                <div class="modal-header" style="background: #f8f9fa;">
                    <h2 style="font-size: 1.25rem;"><i class="fa fa-history" style="color: var(--primary-color);"></i> מבחנים קודמים</h2>
                    <button id="closeHistoryModalBtn" class="close-btn"><i class="fa fa-times"></i></button>
                </div>
                <div class="modal-body" style="background: #fafafa; padding: 20px; overflow-y: auto; flex: 1;">
                    
                    <div id="historyLoading" class="text-center hidden" style="padding: 40px 0; color: var(--primary-color);">
                        <i class="fa fa-spinner fa-spin" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h4>טוען רשימת מבחנים היסטוריים...</h4>
                    </div>
                    
                    <div id="historyError" class="hidden text-center" style="color: #dc3545; padding: 20px;"></div>
                    
                    <div id="historyListContainer" class="data-list hidden"></div>
                    
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    bindEvents() {
        document.getElementById('closeHistoryModalBtn').addEventListener('click', () => this.closeModal());
    },

    openModal() {
        document.getElementById(this.modalId).classList.remove('hidden');
        this.fetchData();
    },

    closeModal() {
        document.getElementById(this.modalId).classList.add('hidden');
    },

    async fetchData() {
        const token = localStorage.getItem('yemotToken');
        if (!token) return this.showError('חסר טוקן חיבור למערכת ימות המשיח.');

        this.showLoading();

        try {
            const res = await YemotAPI.fetchPreviousExamsList(token);
            if (res.error) throw new Error(res.message);

            this.renderList(res.dirs);
        } catch (error) {
            this.showError('שגיאה במשיכת רשימת המבחנים: ' + error.message);
        }
    },

    renderList(dirs) {
        const container = document.getElementById('historyListContainer');
        container.innerHTML = '';

        if (!dirs || dirs.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="padding: 40px 20px; color: var(--text-muted); background: #fff; border: 1px dashed #ccc; border-radius: 8px;">
                    <i class="fa fa-folder-open-o" style="font-size: 3.5rem; margin-bottom: 15px; color: #ced4da;"></i>
                    <h4 style="color: #6c757d;">לא נמצאו מבחנים קודמים במערכת</h4>
                </div>
            `;
        } else {
            // מיון התיקיות בסדר יורד כך שהמבחנים החדשים יותר (מספרים גבוהים) יופיעו למעלה
            dirs.sort((a, b) => b.name.localeCompare(a.name));

            let html = '';
            dirs.forEach(dir => {
                html += `
                    <div class="data-card" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s; margin-bottom: 10px;" 
                         onclick="HistoryManager.loadExam('${dir.path}', '${dir.name.replace(/'/g, "\\'")}')" 
                         onmouseover="this.style.backgroundColor='#f1f4fb'" 
                         onmouseout="this.style.backgroundColor='#fff'">
                        <div style="font-size: 1.1rem; color: var(--primary-color); font-weight: 500;">
                            <i class="fa fa-folder" style="color: #ffc107; margin-left: 8px;"></i> ${dir.name}
                        </div>
                        <button class="btn btn-sm btn-secondary" style="pointer-events: none;"><i class="fa fa-eye"></i> צפה בנתונים</button>
                    </div>
                `;
            });
            container.innerHTML = html;
        }

        document.getElementById('historyLoading').classList.add('hidden');
        document.getElementById('historyError').classList.add('hidden');
        container.classList.remove('hidden');
    },

    async loadExam(folderPath, examName) {
        const token = localStorage.getItem('yemotToken');
        if (!token) return;

        // סוגרים את חלון הרשימה ומפעילים את הספינר המרכזי של ניהול המבחנים
        this.closeModal();
        ExamsManager.showLoading(); 

        try {
            const res = await YemotAPI.fetchHistoricalExamData(token, folderPath);
            
            // קריאה לפונקציית הציור של ExamsManager עם פלאג שזה מבחן היסטורי
            // זה ישאיר את הקובץ החי בזיכרון, אבל יצייר את ההיסטוריה על המסך
            ExamsManager.render(res, false, false, true, examName);
        } catch (error) {
            ExamsManager.render({ error: true, message: error.message });
        }
    },

    showLoading() {
        document.getElementById('historyLoading').classList.remove('hidden');
        document.getElementById('historyError').classList.add('hidden');
        document.getElementById('historyListContainer').classList.add('hidden');
    },

    showError(msg) {
        const errEl = document.getElementById('historyError');
        errEl.innerHTML = `<i class="fa fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i><br>${msg}`;
        errEl.classList.remove('hidden');
        document.getElementById('historyLoading').classList.add('hidden');
        document.getElementById('historyListContainer').classList.add('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    HistoryManager.init();
});