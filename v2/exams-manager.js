const ExamsManager = {
    lastExamData: null,

    showLoading() {
        const container = document.getElementById('view-exams');
        if (container) {
            container.innerHTML = `
                <div class="text-center" style="padding: 100px 20px; color: var(--primary-color);">
                    <i class="fa fa-spinner fa-spin" style="font-size: 4rem; margin-bottom: 20px;"></i>
                    <h2 style="font-weight: 500;">טוען נתוני מבחנים...</h2>
                    <p style="color: var(--text-muted); margin-top: 10px;">מושך נתונים מעודכנים משרת המערכת הטלפונית</p>
                </div>
            `;
        }
    },

    reRender() {
        if (this.lastExamData) {
            this.render({ error: false, noExam: false, data: this.lastExamData }, true, false, false, '');
        }
    },

    updateClientInTable(zeout) {
        const table = document.getElementById('examsDataTable');
        if (!table) return;
        
        const clientInfo = globalClientsMap[zeout];
        if (!clientInfo) return;

        const fullName = clientInfo.firstName ? `${clientInfo.firstName} ${clientInfo.lastName}` : 'לא קיים במערכת';
        const status = clientInfo.yemotStatus || '-';

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(tr => {
            const zeoutCell = tr.children[1]; 
            if (zeoutCell && zeoutCell.textContent.trim() === String(zeout)) {
                if (tr.children[2]) {
                    tr.children[2].textContent = fullName;
                    tr.children[2].title = fullName;
                }
                if (tr.children[3]) {
                    tr.children[3].textContent = status;
                }
            }
        });
    },

    render(result, isReRender = false, clientsLoading = false, isHistory = false, historyTitle = '') {
        const container = document.getElementById('view-exams');
        if (!container) return;

        // שומרים את הנתונים למטמון רק אם זה מבחן פעיל (לא היסטוריה) ולא רענון מקומי
        if (!isReRender && !isHistory) {
            this.lastExamData = (result && result.data) ? result.data : [];
        }

        let isError = result && result.error;
        let noExam = result && result.noExam;
        let examData = isHistory ? ((result && result.data) ? result.data : []) : this.lastExamData;
        let errorMsg = isError ? result.message : '';

        let totalExams = examData.length;
        if (totalExams === 0 && !isError) noExam = true;

        let passedCount = 0; 
        let failedCount = 0; 

        let tbodyHtml = '';

        if (totalExams > 0) {
            examData.forEach((exam, index) => {
                const score = parseInt(exam.QuestionScoreTotal) || 0;
                if (score >= 80) passedCount++;
                else failedCount++;

                const zeout = exam.EnterId || '';
                const points = exam.PointsAdd || '-';
                const phone = exam.Phone || '-';
                
                let fullName, status, idClickHtml;

                if (clientsLoading) {
                    fullName = '<i class="fa fa-spinner fa-spin" style="color:var(--text-muted);"></i>';
                    status = '<i class="fa fa-spinner fa-spin" style="color:var(--text-muted);"></i>';
                    idClickHtml = zeout || '-';
                } else {
                    const clientInfo = globalClientsMap[zeout] || {};
                    fullName = clientInfo.firstName ? `${clientInfo.firstName} ${clientInfo.lastName}` : (exam.ValName || 'לא קיים במערכת');
                    status = clientInfo.yemotStatus || '-';
                    idClickHtml = zeout ? `<a href="#" onclick="openClientCard('${zeout}'); return false;" style="color: var(--primary-color); font-weight: 600; text-decoration: underline; cursor: pointer;">${zeout}</a>` : '-';
                }

                let questionsHtml = '';
                for (let i = 1; i <= 10; i++) {
                    const ans = exam[`Q${i}Answer`] || '-';
                    const qScore = parseInt(exam[`Q${i}Score`]) || 0;
                    
                    const iconHtml = qScore > 0 
                        ? '<i class="fa fa-check" style="color: #28a745; font-size: 0.95rem;"></i>' 
                        : '<i class="fa fa-times" style="color: #dc3545; font-size: 0.95rem;"></i>';
                    
                    questionsHtml += `
                        <td class="text-center" dir="ltr" style="vertical-align: middle;">
                            <span style="font-size: 0.75rem; color: var(--text-muted);">ענה: ${ans}</span><br>
                            ${iconHtml}
                        </td>`;
                }

                const totalBg = score >= 80 ? '#e8f5e9' : '#ffebee';

                tbodyHtml += `
                    <tr>
                        <td class="text-center" style="color:var(--text-muted);">${index + 1}</td>
                        <td class="text-center">${idClickHtml}</td>
                        <td class="text-center" title="${clientsLoading ? 'בטעינה...' : fullName}" style="font-weight: 500; white-space: nowrap; max-width: 130px; overflow: hidden; text-overflow: ellipsis;">${fullName}</td>
                        <td class="text-center" style="font-size: 0.9rem; white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">${status}</td>
                        <td class="text-center" dir="ltr" style="font-size: 0.9rem;">${phone}</td>
                        <td class="text-center" style="color: var(--text-muted); font-size: 0.85rem;">${exam.Date}</td>
                        <td class="text-center" style="color: var(--text-muted); font-size: 0.85rem;">${exam.Time}</td>
                        ${questionsHtml}
                        <td class="text-center" style="background-color: ${totalBg}; font-weight: bold;">${score}</td>
                        <td class="text-center" style="font-weight:bold;">${points}</td>
                    </tr>
                `;
            });
        } else if (noExam) {
            tbodyHtml = `<tr><td colspan="19" class="text-center" style="padding: 60px; border: none; color: var(--text-muted); font-size: 1.2rem;"><i class="fa fa-info-circle" style="font-size: 2.5rem; margin-bottom: 10px; display: block; color: #ced4da;"></i> אין קובץ מבחן להצגה</td></tr>`;
        } else if (isError) {
            tbodyHtml = `<tr><td colspan="19" class="text-center" style="padding: 60px; border: none; color: #dc3545; font-size: 1.2rem;"><i class="fa fa-exclamation-triangle" style="font-size: 2.5rem; margin-bottom: 10px; display: block;"></i> שגיאה בטעינת המבחן: ${errorMsg}</td></tr>`;
        }

        const disableActiveButtons = (noExam || isError || totalExams === 0) ? 'disabled' : '';
        const hasDataToDisplay = !noExam && !isError && totalExams > 0;

        const statsHtml = hasDataToDisplay ? `
            <div class="stats-cards" style="flex-shrink: 0;">
                <div class="stat-card">
                    <span class="stat-title">סה"כ נבחנים</span>
                    <strong class="stat-value" style="color: var(--primary-color);">${totalExams}</strong>
                </div>
                <div class="stat-card warning">
                    <span class="stat-title" style="color: #2e7d32;">עברו (80+)</span>
                    <strong class="stat-value" style="color: #2e7d32;">${passedCount}</strong>
                </div>
                <div class="stat-card bordered">
                    <span class="stat-title" style="color: #c62828;">לא עברו</span>
                    <strong class="stat-value" style="color: #c62828;">${failedCount}</strong>
                </div>
            </div>
        ` : `<div class="stats-cards" style="flex-shrink: 0;"></div>`;

        const theadHtml = hasDataToDisplay ? `
            <thead>
                <tr>
                    <th class="text-center">#</th>
                    <th class="text-center">מספר זהות</th>
                    <th class="text-center">שם הלקוח</th>
                    <th class="text-center">סטטוס</th>
                    <th class="text-center">טלפון ביצוע מבחן</th>
                    <th class="text-center">תאריך</th>
                    <th class="text-center">שעה</th>
                    <th class="text-center">שאלה 1</th>
                    <th class="text-center">שאלה 2</th>
                    <th class="text-center">שאלה 3</th>
                    <th class="text-center">שאלה 4</th>
                    <th class="text-center">שאלה 5</th>
                    <th class="text-center">שאלה  6</th>
                    <th class="text-center">שאלה  7</th>
                    <th class="text-center">שאלה 8</th>
                    <th class="text-center">שאלה 9</th>
                    <th class="text-center">שאלה 10</th>
                    <th class="text-center">ציון כולל</th>
                    <th class="text-center">נקודות</th>
                </tr>
            </thead>
        ` : '';

        // התאמת הכפתורים בסרגל העליון למצב הרגיל ולמצב היסטוריה
        const actionsHtml = isHistory ? `
            <div class="actions-wrapper" style="margin-right: auto; gap: 12px; align-items: center;">
                <div style="background: #fff3cd; color: #856404; padding: 6px 15px; border-radius: 20px; border: 1px solid #ffeeba; font-weight: 500; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fa fa-history"></i> מציג מבחן קודם: ${historyTitle}
                </div>
                <button class="btn btn-primary btn-sm" onclick="ExamsManager.reRender()"><i class="fa fa-arrow-right"></i> חזור למבחן הפעיל</button>
            </div>
        ` : `
            <div class="actions-wrapper" style="margin-right: auto; gap: 8px;">
                <button class="btn btn-secondary btn-sm" disabled title="פיצ'ר בפיתוח"><i class="fa fa-pencil"></i> עריכת קובץ (בפיתוח)</button>
                <button class="btn btn-primary btn-sm" ${disableActiveButtons} onclick="if(typeof LotteryManager!=='undefined') LotteryManager.open()"><i class="fa fa-trophy"></i> ביצוע הגרלה</button>
                <button class="btn btn-primary btn-sm" ${disableActiveButtons} onclick="if(typeof CloseExamManager!=='undefined') CloseExamManager.run()"><i class="fa fa-stop-circle"></i> סגירת מבחן</button>
                
                <span style="border-left: 1px solid var(--border-color); height: 24px; margin: 0 4px;"></span>
                
                <button class="btn btn-secondary btn-sm" id="btnManageQuestions" onclick="if(typeof QuestionsManager !== 'undefined') QuestionsManager.openModal()"><i class="fa fa-list-alt"></i> ניהול שאלות</button>
                <button class="btn btn-secondary btn-sm" onclick="if(typeof HistoryManager !== 'undefined') HistoryManager.openModal()"><i class="fa fa-history"></i> מבחנים קודמים</button>
            </div>
        `;

        const fullHtml = `
            <style>
                #examsDataTable th { padding: 14px 6px !important; font-size: 0.85rem; white-space: nowrap; }
                #examsDataTable td { padding: 6px 4px !important; font-size: 0.9rem; }
                .actions-wrapper .btn:disabled { opacity: 0.5; cursor: not-allowed; }
            </style>
            
            <div class="dashboard-top-controls" style="margin-bottom: 15px; padding: 10px 20px; display: flex; align-items: center;">
                ${statsHtml}
                ${actionsHtml}
            </div>

            <div class="table-container" style="max-height: calc(100vh - 180px);">
                <table id="examsDataTable">
                    ${theadHtml}
                    <tbody>
                        ${tbodyHtml}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = fullHtml;
    }
};