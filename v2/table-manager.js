// שמירת מצב הסינונים הפעילים בזיכרון
window.activeFilters = { status: '', nedarim: '', balance: '', points: '' };

function updateDashboardStats() {
    document.getElementById('totalClientsCount').textContent = globalClientsArray.length;
    const missingEl = document.getElementById('missingNedarimCount');
    
    // אם נדרים עדיין נטען, משאירים את הספינר
    if (window.isLoadingNedarim) return; 
    
    if (window.isNedarimDisabled) {
        missingEl.innerHTML = '<span style="font-size:1rem; color:#888;">-</span>';
    } else {
        missingEl.textContent = globalClientsArray.filter(c => !c.hasNedarim).length;
    }
}

function toggleFilterMenu(menuId, event) {
    event.stopPropagation();
    
    // מניעת פתיחת תפריטי סינון כאשר הנתונים בשגיאה או עדיין בטעינה
    if ((window.isNedarimDisabled || window.isLoadingNedarim) && (menuId === 'nedarimMenu' || menuId === 'balanceMenu')) return;
    if ((window.isPointsDisabled || window.isLoadingPoints) && menuId === 'pointsMenu') return;
    
    document.querySelectorAll('.filter-dropdown').forEach(m => {
        if (m.id !== menuId) m.classList.add('hidden');
    });
    document.getElementById(menuId).classList.toggle('hidden');
}

document.addEventListener('click', () => {
    document.querySelectorAll('.filter-dropdown').forEach(m => m.classList.add('hidden'));
});

function setFilter(filterType, value, element) {
    window.activeFilters[filterType] = value;
    const parentMenu = element.closest('.filter-dropdown');
    parentMenu.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');

    const th = parentMenu.closest('th');
    const icon = th.querySelector('.filter-icon');
    if (value !== '') icon.classList.add('active');
    else icon.classList.remove('active');

    applyFiltersAndRender();
}

function populateStatusFilter() {
    const menu = document.getElementById('statusMenu');
    const statuses = new Set();
    globalClientsArray.forEach(c => {
        if (c.yemotStatus) statuses.add(c.yemotStatus);
    });
    let html = `<div class="filter-option ${window.activeFilters.status === '' ? 'selected' : ''}" onclick="setFilter('status', '', this)">הכל</div>`;
    Array.from(statuses).sort().forEach(s => {
        html += `<div class="filter-option ${window.activeFilters.status === s ? 'selected' : ''}" onclick="setFilter('status', '${s}', this)">${s}</div>`;
    });
    menu.innerHTML = html;
}

function applyFiltersAndRender() {
    const term = document.getElementById('searchInput').value.toLowerCase().trim();
    const statusVal = window.activeFilters.status;
    const nedarimVal = window.activeFilters.nedarim;
    const balanceVal = window.activeFilters.balance;
    const pointsVal = window.activeFilters.points;

    const filtered = globalClientsArray.filter(c => {
        let matchSearch = true;
        if (term) {
            matchSearch = c.firstName.toLowerCase().includes(term) || 
                          c.lastName.toLowerCase().includes(term) ||
                          c.zeout.includes(term) || 
                          c.phone1.includes(term) || 
                          c.phone2.includes(term);
        }
        let matchStatus = true;
        if (statusVal) matchStatus = c.yemotStatus === statusVal;

        let matchNedarim = true;
        if (!window.isNedarimDisabled && !window.isLoadingNedarim) {
            if (nedarimVal === 'yes') matchNedarim = c.hasNedarim;
            if (nedarimVal === 'no') matchNedarim = !c.hasNedarim;
        } else if (nedarimVal !== '') matchNedarim = false; 

        let matchBalance = true;
        if (!window.isNedarimDisabled && !window.isLoadingNedarim && balanceVal) {
            const numVal = parseFloat(c.ytra.replace(/[^0-9.-]+/g, '')) || 0;
            if (balanceVal === 'zero') matchBalance = numVal === 0;
            if (balanceVal === 'positive') matchBalance = numVal > 0;
            if (balanceVal === 'negative') matchBalance = numVal < 0;
        } else if ((window.isNedarimDisabled || window.isLoadingNedarim) && balanceVal !== '') matchBalance = false;

        let matchPoints = true;
        if (!window.isPointsDisabled && !window.isLoadingPoints) {
            if (pointsVal === 'none') matchPoints = (c.points === null || c.points === '-');
            if (pointsVal === 'has') matchPoints = (c.points !== null && c.points !== '-');
        } else if (pointsVal !== '') matchPoints = false;

        return matchSearch && matchStatus && matchNedarim && matchBalance && matchPoints;
    });

    renderTable(filtered);
    
    const summaryContainer = document.getElementById('activeFiltersSummary');
    const isFiltered = (term !== '' || statusVal !== '' || nedarimVal !== '' || balanceVal !== '' || pointsVal !== '');
    
    if (isFiltered) {
        document.getElementById('showingCountText').textContent = `מציג ${filtered.length} מתוך ${globalClientsArray.length}`;
        summaryContainer.classList.remove('hidden');
    } else {
        summaryContainer.classList.add('hidden');
    }
}

// הזרקת תוכן חי לעמודות הדינמיות ללא רענון של כל הטבלה
window.updateDynamicColumn = function(columnType) {
    const rows = tbody.querySelectorAll('tr.client-row');
    rows.forEach(tr => {
        const zeout = tr.getAttribute('data-zeout');
        if (!zeout) return;
        const c = globalClientsMap[zeout];
        if (!c) return;

        if (columnType === 'audio') {
            const td = tr.querySelector('.td-audio');
            if (td) {
                if (window.isLoadingAudio) {
                    td.innerHTML = '<i class="fa fa-spinner fa-spin text-muted"></i>';
                } else if (window.isAudioDisabled) {
                    td.innerHTML = '<span style="color:#ccc; font-weight:normal;">-</span>';
                } else if (c.audioPath) {
                    const safeName = `${c.firstName} ${c.lastName}`.replace(/"/g, '&quot;');
                    td.innerHTML = `<button type="button" class="btn play-audio-btn" data-path="${c.audioPath}" data-name="${safeName}"><i class="fa fa-play-circle"></i> השמע</button>`;
                    td.querySelector('.play-audio-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        openAudioModal(c.audioPath, safeName);
                    });
                } else {
                    td.innerHTML = '<span style="color:var(--border-color); font-size:12px;">-</span>';
                }
            }
        }

        if (columnType === 'points') {
            const td = tr.querySelector('.td-points');
            if (td) {
                if (window.isLoadingPoints) {
                    td.innerHTML = '<i class="fa fa-spinner fa-spin text-muted"></i>';
                } else if (window.isPointsDisabled) {
                    td.innerHTML = '<span style="color:#ccc; font-weight:normal;">-</span>';
                } else {
                    td.innerHTML = (c.points !== null ? c.points : '-');
                }
            }
        }

        if (columnType === 'nedarim') {
            const tdBadge = tr.querySelector('.td-nedarim-badge');
            const tdBalance = tr.querySelector('.td-nedarim-balance');
            if (tdBadge) {
                if (window.isLoadingNedarim) {
                    tdBadge.innerHTML = '<i class="fa fa-spinner fa-spin text-muted"></i>';
                } else if (window.isNedarimDisabled) {
                    tdBadge.innerHTML = '<span style="color:#ccc; font-weight:normal;">-</span>';
                } else {
                    tdBadge.innerHTML = (c.hasNedarim ? '<span class="badge badge-success"><i class="fa fa-check"></i> יש</span>' : '<span class="badge badge-danger"><i class="fa fa-times"></i> אין</span>');
                }
            }
            if (tdBalance) {
                if (window.isLoadingNedarim) {
                    tdBalance.innerHTML = '<i class="fa fa-spinner fa-spin text-muted"></i>';
                } else if (window.isNedarimDisabled) {
                    tdBalance.innerHTML = '<span style="color:#ccc; font-weight:normal;">-</span>';
                } else {
                    tdBalance.innerHTML = (c.hasNedarim ? c.ytra : '');
                }
            }
        }
    });
};

function renderTable(dataArray) {
    tbody.innerHTML = '';
    if(dataArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center">לא נמצאו תוצאות</td></tr>';
        return;
    }
    
    // יצירת השלד הבסיסי של השורות מיד לאחר טעינת קובץ ימות המשיח
    dataArray.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'client-row';
        tr.setAttribute('data-zeout', row.zeout);
            
        tr.innerHTML = `
            <td class="checkbox-col text-center"><input type="checkbox" class="row-checkbox" value="${row.zeout}"></td>
            <td class="text-center" style="color:var(--text-muted);">${row.index}</td>
            <td class="text-center">${row.zeout}</td>
            <td class="text-center" title="${row.firstName}">${row.firstName}</td>
            <td class="text-center" title="${row.lastName}">${row.lastName}</td>
            <td class="text-center" dir="ltr">${row.phone1}</td>
            <td class="text-center" dir="ltr">${row.phone2 || '-'}</td>
            <td class="text-center" title="${row.yemotStatus}">${row.yemotStatus}</td>
            <td class="text-center td-audio"></td>
            <td class="text-center td-nedarim-badge"></td>
            <td class="text-center td-nedarim-balance" dir="ltr" style="font-weight:bold; color:var(--primary-color);"></td>
            <td class="text-center td-points" style="font-weight:bold; color:var(--primary-color);"></td>
        `;
        
        tr.querySelector('.checkbox-col').addEventListener('click', e => e.stopPropagation());
        tr.addEventListener('click', () => {
            if (typeof openClientCard === 'function') openClientCard(row.zeout);
        });
        tbody.appendChild(tr);
    });
    
    // הזרקת הנתונים לעמודות הדינמיות בהתאם לסטטוס הטעינה הנוכחי
    if (typeof updateDynamicColumn === 'function') {
        updateDynamicColumn('audio');
        updateDynamicColumn('nedarim');
        updateDynamicColumn('points');
    }
    
    selectAllCheckbox.checked = false;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('input', applyFiltersAndRender);
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        window.activeFilters = { status: '', nedarim: '', balance: '', points: '' };
        document.querySelectorAll('.filter-icon').forEach(icon => icon.classList.remove('active'));
        document.querySelectorAll('.filter-dropdown').forEach(menu => {
            menu.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('selected'));
            const firstOpt = menu.querySelector('.filter-option');
            if (firstOpt) firstOpt.classList.add('selected');
        });
        populateStatusFilter(); 
        applyFiltersAndRender(); 
    });
    
    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
});