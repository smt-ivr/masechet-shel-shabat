window.prikTlush = async function(tlushId, btnEl) {
    if (!confirm('האם אתה בטוח שברצונך לפרוק טעינה זו?')) return;
    
    const mosadId = localStorage.getItem('nedarimMosadId');
    const password = localStorage.getItem('nedarimPassword');
    
    if (!mosadId || !password) {
        if (typeof showAlert === 'function') showAlert('חסרים פרטי התחברות לנדרים כארד');
        return;
    }

    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> פורק...';
    btnEl.disabled = true;

    try {
        const res = await NedarimAPI.prikatTlush(mosadId, password, tlushId);
        if (res.Result === "OK") {
            const zeout = clientCardModal.dataset.zeout;
            await openClientCard(zeout);
            document.querySelector('.tab-btn[data-tab="zchuyot"]').click();
        } else {
            if (typeof showAlert === 'function') showAlert(res.Message || "שגיאה בפריקת טעינה");
            btnEl.innerHTML = originalText;
            btnEl.disabled = false;
        }
    } catch (err) {
        if (typeof showAlert === 'function') showAlert("שגיאת תקשורת בניסיון לפרוק טעינה");
        btnEl.innerHTML = originalText;
        btnEl.disabled = false;
    }
};

async function loadLimitedStoresIntoSelect() {
    const selectEl = document.getElementById('newTlushLimitedId');
    if (!selectEl) return;
    
    selectEl.innerHTML = '<option value="">ללא הגבלה (ברירת מחדל)</option>';
    
    const mosadId = localStorage.getItem('nedarimMosadId');
    const password = localStorage.getItem('nedarimPassword');
    if (!mosadId || !password) return;

    try {
        const res = await NedarimAPI.fetchLimitedStoresList(mosadId, password);
        if (Array.isArray(res) && res.length > 0) {
            res.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.ID;
                opt.textContent = `${item.ListName} (מזהה: ${item.ID})`;
                selectEl.appendChild(opt);
            });
            if (res.length > 0) {
                selectEl.selectedIndex = 1; 
            }
        }
    } catch (err) {
        console.warn("שגיאה בטעינת קבוצות חנויות מוגבלות:", err);
    }
}

function isValidDateFormat(dateStr) {
    if (!dateStr) return true; 
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!regex.test(dateStr)) return false;
    
    const parts = dateStr.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (year < 2000 || year > 2100) return false;
    
    return true;
}

function smartImport(sourceId, targetId, isYemotPhone = false) {
    let sourceVal = document.getElementById(sourceId).value.trim();
    if (isYemotPhone) sourceVal = sourceVal.replace(/[^0-9]/g, '');
    if (sourceVal !== "") {
        document.getElementById(targetId).value = sourceVal;
        document.getElementById(targetId).dispatchEvent(new Event('input'));
    }
}

function resetPulse() {
    document.getElementById('saveYemotBtn').classList.remove('pulse-primary');
    document.getElementById('saveNedarimBtn').classList.remove('pulse-primary', 'pulse-success');
}

function setNedarimLoadingState(isLoading) {
    const forceDisable = window.isNedarimDisabled || false;
    const disabledState = isLoading || forceDisable;
    
    const nedarimInputs = ['nedarimFirstName', 'nedarimFamilyName', 'nedarimAddress', 'nedarimCity', 'nedarimPhone1', 'nedarimPhone2', 'nedarimEmail', 'nedarimGroupe', 'nedarimComments', 'nedarimClientId'];
    nedarimInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disabledState;
    });
    const saveBtn = document.getElementById('saveNedarimBtn');
    if (saveBtn) saveBtn.disabled = disabledState;
    const importBtn = document.getElementById('importFromYemotBtn');
    if (importBtn) importBtn.disabled = disabledState;
}

window.copyToClipboard = function(text, btnElement) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if(btnElement) {
            const origClass = btnElement.className;
            btnElement.className = 'fa fa-check cc-icon-btn';
            btnElement.style.color = '#4ade80';
            setTimeout(() => {
                btnElement.className = origClass;
                btnElement.style.color = '';
            }, 1500);
        }
    }).catch(err => console.error('Failed to copy text: ', err));
};

function updateTabBadge(tabId, iconClass, title, count) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) {
        const badgeStyle = "display: inline-block; min-width: 22px; text-align: center; background: rgba(0,0,0,0.08); padding: 2px 6px; border-radius: 12px; font-size: 0.75rem; margin-right: 5px; font-weight: bold; color: var(--primary-color);";
        btn.style.position = '';
        btn.style.overflow = '';

        if (count === null || count === undefined) {
            btn.innerHTML = `<i class="fa ${iconClass}"></i> ${title} <span style="${badgeStyle} visibility: hidden; opacity: 0;">0</span>`;
        } else if (count === -1) {
            btn.innerHTML = `<i class="fa ${iconClass}"></i> ${title}`;
        } else {
            btn.innerHTML = `<i class="fa ${iconClass}"></i> ${title} <span style="${badgeStyle} visibility: visible; opacity: 1;">${count}</span>`;
        }
    }
}

async function openClientCard(zeout) {
    const clientData = globalClientsMap[zeout];
    const mosadId = localStorage.getItem('nedarimMosadId');
    const password = localStorage.getItem('nedarimPassword');

    resetPulse(); 
    clientCardModal.dataset.zeout = zeout;
    clientCardModal.dataset.audioPath = clientData.audioPath;

    document.querySelector('.tab-btn[data-tab="personal"]').click();
    
    document.getElementById('crmModalTitle').innerHTML = `<i class="fa fa-address-card-o" style="color:var(--text-muted); margin-left: 8px;"></i> <span style="color:var(--text-muted); font-weight:400;">כרטיס לקוח</span> <span style="margin:0 10px; color:#ddd;">|</span> מספר זהות: ${clientData.zeout}`;
    
    document.getElementById('yemotStatusMsg').textContent = '';
    document.getElementById('yemotFirstName').value = clientData.firstName || '';
    document.getElementById('yemotLastName').value = clientData.lastName || '';
    document.getElementById('yemotPhone1').value = clientData.phone1 || '';
    document.getElementById('yemotPhone2').value = clientData.phone2 || '';
    document.getElementById('yemotStatus').value = clientData.yemotStatus || '';
    
    const pointsTabBtn = document.querySelector('.tab-btn[data-tab="points"]');
    if (window.isPointsDisabled) {
        pointsTabBtn.style.pointerEvents = 'none';
        pointsTabBtn.style.opacity = '0.4';
    } else {
        pointsTabBtn.style.pointerEvents = 'auto';
        pointsTabBtn.style.opacity = '1';
    }
    document.getElementById('crmTotalPoints').textContent = window.isPointsDisabled ? '-' : (clientData.points !== null ? clientData.points : '-');

    const cardAudioBtn = document.getElementById('cardAudioBtn');
    if (window.isAudioDisabled) {
        cardAudioBtn.classList.add('hidden');
    } else {
        if(clientData.audioPath) cardAudioBtn.classList.remove('hidden');
        else cardAudioBtn.classList.add('hidden');
    }

    const nedarimFields = ['FirstName', 'FamilyName', 'Address', 'City', 'Phone1', 'Phone2', 'Email', 'Groupe', 'Comments'];
    nedarimFields.forEach(field => document.getElementById(`nedarim${field}`).value = '');
    
    document.getElementById('crmTotalFreeAmount').textContent = clientData.ytra;
    
    const nContainer = document.getElementById('nedarimContainer');
    const idInput = document.getElementById('nedarimClientId');
    const nStatusMsg = document.getElementById('nedarimStatusMsg');
    const saveNedarimBtn = document.getElementById('saveNedarimBtn');

    const nedarimTabs = ['cards', 'zchuyot', 'transactions', 'siruvim'];
    nedarimTabs.forEach(tab => {
        const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        if (btn) {
            if (window.isNedarimDisabled) {
                btn.style.pointerEvents = 'none'; btn.style.opacity = '0.4';
            } else {
                btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
            }
        }
    });

    updateTabBadge('cards', 'fa-id-badge', 'כרטיסים', null);
    updateTabBadge('zchuyot', 'fa-gift', 'זכיות', null);
    updateTabBadge('transactions', 'fa-shopping-cart', 'עסקאות', null);
    updateTabBadge('siruvim', 'fa-ban', 'סירובים', null);

    nStatusMsg.style.color = 'var(--primary-color)';
    nStatusMsg.innerHTML = '<i class="fa fa-spinner fa-spin"></i> טוען נתוני נדרים כארד...';
    clientCardModal.classList.remove('hidden');
    
    document.getElementById('addCardContainer').classList.add('hidden');
    document.getElementById('newCardInput').value = '';
    document.getElementById('addCardErrorMsg').style.display = 'none';

    document.getElementById('addTlushContainer').classList.add('hidden');
    document.getElementById('newTlushAmount').value = '';
    document.getElementById('newTlushExpiration').value = '';
    const limitedSelect = document.getElementById('newTlushLimitedId');
    if (limitedSelect) limitedSelect.innerHTML = '<option value="">ללא הגבלה (ברירת מחדל)</option>';
    document.getElementById('newTlushComments').value = '';
    document.getElementById('addTlushErrorMsg').style.display = 'none';

    setNedarimLoadingState(true);

    if (window.isNedarimDisabled) {
        nContainer.classList.remove('nedarim-missing-container');
        saveNedarimBtn.className = 'btn';
        saveNedarimBtn.style.backgroundColor = '#e9ecef';
        saveNedarimBtn.style.borderColor = '#ced4da';
        saveNedarimBtn.style.color = '#6c757d';
        saveNedarimBtn.innerHTML = 'מערכת נדרים כארד מושבתת';
        
        idInput.value = clientData.nedarimClientId || ""; 
        idInput.style.color = 'inherit';
        nStatusMsg.innerHTML = '';
        
        document.getElementById('crmTotalFreeAmount').innerHTML = '<span style="color:#ccc;">-</span>';
        document.getElementById('cardsListContainer').innerHTML = '<div class="text-center" style="color:#ccc;">-</div>';
        
        updateTabBadge('cards', 'fa-id-badge', 'כרטיסים', -1);
        updateTabBadge('zchuyot', 'fa-gift', 'זכיות', -1);
        updateTabBadge('transactions', 'fa-shopping-cart', 'עסקאות', -1);
        updateTabBadge('siruvim', 'fa-ban', 'סירובים', -1);

        setNedarimLoadingState(false); 
    } 
    else if (clientData.nedarimClientId && mosadId && password) {
        nContainer.classList.remove('nedarim-missing-container');
        idInput.value = clientData.nedarimClientId;
        idInput.style.color = 'inherit';
        
        saveNedarimBtn.className = 'btn btn-primary';
        saveNedarimBtn.style = '';
        saveNedarimBtn.innerHTML = '<i class="fa fa-save"></i> <span id="saveNedarimText">שמור שינויים בנדרים כארד</span>';

        try {
            const cardData = await NedarimAPI.fetchClientCard(mosadId, password, clientData.nedarimClientId);
            nStatusMsg.textContent = '';
            nedarimFields.forEach(field => {
                const el = document.getElementById(`nedarim${field}`);
                if(el) el.value = cardData[field] || '';
            });
            
            const cards = cardData.Cards || [];
            const activeCards = cards.filter(c => !(c.RemovedDate && c.RemovedDate.trim() !== ''));
            const removedCardsCount = cards.length - activeCards.length;

            document.getElementById('cardsCountTotal').textContent = activeCards.length;
            updateTabBadge('cards', 'fa-id-badge', 'כרטיסים', activeCards.length);
            
            let removedTextEl = document.getElementById('removedCardsText');
            if (!removedTextEl) {
                removedTextEl = document.createElement('div');
                removedTextEl.id = 'removedCardsText';
                removedTextEl.style.fontSize = '0.75rem';
                removedTextEl.style.color = '#888';
                removedTextEl.style.marginTop = '2px';
                document.getElementById('cardsCountTotal').parentNode.appendChild(removedTextEl);
            }
            if (removedCardsCount > 0) {
                removedTextEl.textContent = `ועוד ${removedCardsCount} כרטיסים מחוקים`;
                removedTextEl.style.display = 'block';
            } else {
                removedTextEl.style.display = 'none';
            }

            let cardsHtml = '';
            if (cards.length === 0) {
                cardsHtml = '<div class="text-center" style="padding: 20px; color: var(--text-muted);">אין כרטיסים משויכים</div>';
            } else {
                cards.forEach(c => {
                    const isRemoved = c.RemovedDate && c.RemovedDate.trim() !== '';
                    cardsHtml += `
                        <div class="cc-card ${isRemoved ? 'removed' : ''}">
                            <div class="cc-header">
                                <span>מזהה כרטיס: ${c.CardId || '-'}</span>
                                ${isRemoved ? '<span class="badge" style="background:#dc3545;color:#fff;">מבוטל</span>' : '<span class="badge" style="background:#28a745;color:#fff;">פעיל</span>'}
                            </div>
                            <div class="cc-number" dir="ltr">
                                <span>${c.CardNumber || 'ללא מספר כרטיס'}</span>
                                ${c.CardNumber ? `<i class="fa fa-copy cc-icon-btn" title="העתק" onclick="copyToClipboard('${c.CardNumber}', this)"></i>` : ''}
                            </div>
                            <div class="cc-mag" dir="ltr">
                                <span>${c.MagneticCard || 'ללא פס מגנטי'}</span>
                                ${c.MagneticCard ? `<i class="fa fa-copy cc-icon-btn" title="העתק" onclick="copyToClipboard('${c.MagneticCard}', this)"></i>` : ''}
                            </div>
                            <div class="cc-footer">
                                <span>תאריך חיבור: ${c.AddedDate || '-'}</span>
                                ${isRemoved ? `<span style="color:#ffb3b3;">תאריך ניתוק: ${c.RemovedDate}</span>` : ''}
                            </div>
                        </div>
                    `;
                });
            }
            document.getElementById('cardsListContainer').innerHTML = cardsHtml;

            document.getElementById('crmTotalFreeAmount').textContent = cardData.TotalFreeAmount || '0.00 ₪';
            
            const history = cardData.History || [];
            const regularTransactions = [];
            const cancellations = [];
            let totalCancellations = 0;
            
            history.forEach(h => {
                if (h.Comments && h.Comments.includes("פריקת תלוש")) {
                    cancellations.push(h);
                    totalCancellations += parseFloat(h.Amount) || 0;
                } else {
                    regularTransactions.push(h);
                }
            });

            const tlushim = cardData.Tlushim || [];
            
            let actualZchuyotCount = Math.max(0, tlushim.length - cancellations.length);
            updateTabBadge('zchuyot', 'fa-gift', 'זכיות', actualZchuyotCount);
            document.getElementById('zchuyotCountTotal').textContent = actualZchuyotCount;

            let totalZchuyotAmount = 0;
            let zchuyotHtml = '';
            
            if (tlushim.length === 0) {
                zchuyotHtml = '<div class="text-center" style="padding: 20px; color: var(--text-muted);">אין זכיות פעילות</div>';
            } else {
                tlushim.forEach(t => {
                    const amountVal = parseFloat(t.Amount) || 0;
                    totalZchuyotAmount += amountVal;
                    
                    const freeAmountVal = parseFloat(t.FreeAmount) || 0;
                    const isInactive = freeAmountVal === 0;
                    
                    zchuyotHtml += `
                        <div class="data-card">
                            <div class="data-card-header" style="margin-bottom: 5px; padding-bottom: 5px; border-bottom: none;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span class="data-card-title">${t.Comments || 'זכייה'}</span>
                                    ${isInactive ? '<span class="badge" style="background:#adb5bd; color:#fff; font-size:0.7rem; font-weight:normal;">לא פעיל</span>' : ''}
                                </div>
                                <span style="font-weight:bold; color:var(--primary-color); font-size:1.1rem;" dir="ltr">${t.Amount} ₪</span>
                            </div>
                            <div class="data-card-grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));">
                                <div class="data-field"><span class="data-field-label">מזהה טעינה</span><span class="data-field-val">${t.TlushId}</span></div>
                                <div class="data-field"><span class="data-field-label">תאריך הטענה</span><span class="data-field-val">${t.Date}</span></div>
                                <div class="data-field"><span class="data-field-label">קבוצה (חנויות)</span><span class="data-field-val">${t.LimitedStores || 'הכל'}</span></div>
                                ${t.Expiration ? `<div class="data-field"><span class="data-field-label">תוקף</span><span class="data-field-val">${t.Expiration}</span></div>` : ''}
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #888; margin-top: 10px; border-top: 1px dashed #eee; padding-top: 8px; text-align: right;">
                                <div>יתרה למימוש: <strong dir="ltr" style="color:${freeAmountVal > 0 ? 'var(--primary-color)' : '#888'};">${t.FreeAmount}</strong></div>
                                ${!isInactive ? `<button class="btn btn-sm btn-danger" onclick="window.prikTlush('${t.TlushId}', this)"><i class="fa fa-undo"></i> פריקת טעינה</button>` : ''}
                            </div>
                        </div>
                    `;
                });
            }
            
            let finalZchuyotAmount = totalZchuyotAmount - totalCancellations;
            if(finalZchuyotAmount < 0) finalZchuyotAmount = 0;
            
            document.getElementById('zchuyotListContainer').innerHTML = zchuyotHtml;
            document.getElementById('zchuyotAmountTotal').textContent = finalZchuyotAmount.toFixed(2) + ' ₪';

            let cancellationsHtml = '';
            if (cancellations.length > 0) {
                let itemsHtml = cancellations.map(c => `
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:6px 0; border-bottom:1px solid #eee;">
                        <span style="color:#6c757d; flex:1;">${c.Date}</span>
                        <span style="color:#6c757d; flex:2;">${c.Comments}</span>
                        <span style="color:#dc3545; font-weight:bold; flex:1; text-align:left;" dir="ltr">${c.Amount} ₪</span>
                    </div>
                `).join('');

                cancellationsHtml = `
                    <div style="margin-top: 25px; border-top: 1px solid var(--border-light); padding-top: 15px;">
                        <div onclick="document.getElementById('cancellationsListWrap').classList.toggle('hidden')" style="color: var(--text-muted); font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; text-decoration: underline;">
                            <i class="fa fa-info-circle"></i> ללקוח זה היו ${cancellations.length} ביטולים - לחץ להצגת הפרטים
                        </div>
                        <div id="cancellationsListWrap" class="hidden" style="margin-top: 15px; background:#fdfdfd; padding:10px 15px; border-radius:4px; border:1px solid #eee;">
                            ${itemsHtml}
                        </div>
                    </div>
                `;
            }
            document.getElementById('cancellationsListContainer').innerHTML = cancellationsHtml;

            updateTabBadge('transactions', 'fa-shopping-cart', 'עסקאות', regularTransactions.length);
            
            let transTotal = 0;
            let transHtml = '';
            if (regularTransactions.length === 0) {
                transHtml = '<div class="text-center" style="padding: 20px; color: var(--text-muted);">אין עסקאות</div>';
            } else {
                regularTransactions.forEach(t => {
                    const amountVal = parseFloat(t.Amount) || 0;
                    transTotal += amountVal;
                    transHtml += `
                        <div class="data-card">
                            <div class="data-card-header" style="margin-bottom: 5px; padding-bottom: 5px;">
                                <span class="data-card-title"><i class="fa fa-shopping-bag"></i> ${t.StoreName}</span>
                                <span style="font-weight:bold; color:var(--primary-color);" dir="ltr">${t.Amount} ₪</span>
                            </div>
                            <div class="data-card-grid">
                                <div class="data-field"><span class="data-field-label">תאריך</span><span class="data-field-val">${t.Date}</span></div>
                                <div class="data-field"><span class="data-field-label">מזהה עסקה</span><span class="data-field-val">${t.HistoryId}</span></div>
                                <div class="data-field" style="grid-column: 1 / -1;"><span class="data-field-label">הערות חנות</span><span class="data-field-val" style="font-size:0.8rem; direction:ltr; text-align:right;">${t.Comments}</span></div>
                            </div>
                        </div>
                    `;
                });
            }
            document.getElementById('transactionsListContainer').innerHTML = transHtml;
            document.getElementById('transactionsCountTotal').textContent = regularTransactions.length;
            document.getElementById('transactionsAmountTotal').textContent = transTotal.toFixed(2) + ' ₪';

            const siruvim = cardData.Siruvim || [];
            updateTabBadge('siruvim', 'fa-ban', 'סירובים', siruvim.length);
            
            let siruvimTotal = 0;
            let siruvimHtml = '';
            if (siruvim.length === 0) {
                siruvimHtml = '<div class="text-center" style="padding: 20px; color: var(--text-muted);">אין סירובים</div>';
            } else {
                siruvim.forEach(s => {
                    const amountVal = parseFloat(s.Amount) || 0;
                    siruvimTotal += amountVal;
                    siruvimHtml += `
                        <div class="data-card" style="border-left: 3px solid #ffc107;">
                            <div class="data-card-header" style="margin-bottom: 5px; padding-bottom: 5px;">
                                <span class="data-card-title"><i class="fa fa-ban" style="color:#d39e00;"></i> ${s.StoreName}</span>
                                <span style="font-weight:bold; color:#856404;" dir="ltr">${s.Amount} ₪</span>
                            </div>
                            <div class="data-card-grid">
                                <div class="data-field"><span class="data-field-label">תאריך ושעה</span><span class="data-field-val">${s.Date}</span></div>
                                <div class="data-field" style="grid-column: 1 / -1;"><span class="data-field-label">סיבת סירוב</span><span class="data-field-val" style="color:#dc3545; font-size:0.85rem;">${s.Error}</span></div>
                            </div>
                        </div>
                    `;
                });
            }
            document.getElementById('siruvimListContainer').innerHTML = siruvimHtml;
            document.getElementById('siruvimCountTotal').textContent = siruvim.length;
            document.getElementById('siruvimAmountTotal').textContent = siruvimTotal.toFixed(2) + ' ₪';

        } catch (e) {
            nStatusMsg.textContent = 'שגיאה במשיכת הנתונים המלאים מנדרים כארד.';
            nStatusMsg.style.color = 'red';
        } finally {
            setNedarimLoadingState(false);
        }
    } else {
        nContainer.classList.add('nedarim-missing-container');
        idInput.value = "לא קיים חשבון";
        idInput.style.color = "#dc3545";
        nStatusMsg.textContent = '';
        
        saveNedarimBtn.className = 'btn btn-success';
        saveNedarimBtn.style = '';
        saveNedarimBtn.innerHTML = '<i class="fa fa-user-plus"></i> <span id="saveNedarimText">צור חשבון מהנתונים שהוזנו</span>';
        
        document.getElementById('cardsListContainer').innerHTML = '<div class="text-center">-</div>';
        
        updateTabBadge('cards', 'fa-id-badge', 'כרטיסים', -1);
        updateTabBadge('zchuyot', 'fa-gift', 'זכיות', -1);
        updateTabBadge('transactions', 'fa-shopping-cart', 'עסקאות', -1);
        updateTabBadge('siruvim', 'fa-ban', 'סירובים', -1);

        setNedarimLoadingState(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const nedarimTabs = ['cards', 'zchuyot', 'transactions', 'siruvim'];
            if (window.isNedarimDisabled && nedarimTabs.includes(target.dataset.tab)) return; 
            if (window.isPointsDisabled && target.dataset.tab === 'points') return; 
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            target.classList.add('active');
            
            const tabName = target.dataset.tab;
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });

    document.getElementById('closeClientCardBtn').addEventListener('click', () => {
        clientCardModal.classList.add('hidden');
    });

    document.getElementById('importFromNedarimBtn').addEventListener('click', () => {
        smartImport('nedarimFirstName', 'yemotFirstName');
        smartImport('nedarimFamilyName', 'yemotLastName');
        smartImport('nedarimPhone1', 'yemotPhone1', true);
        smartImport('nedarimPhone2', 'yemotPhone2', true);
        smartImport('nedarimGroupe', 'yemotStatus');
    });

    document.getElementById('importFromYemotBtn').addEventListener('click', () => {
        smartImport('yemotFirstName', 'nedarimFirstName');
        smartImport('yemotLastName', 'nedarimFamilyName');
        smartImport('yemotPhone1', 'nedarimPhone1');
        smartImport('yemotPhone2', 'nedarimPhone2');
        smartImport('yemotStatus', 'nedarimGroupe');
    });

    document.getElementById('cardAudioBtn').addEventListener('click', () => {
        if (window.isAudioDisabled) return;
        const path = clientCardModal.dataset.audioPath;
        const name = `${document.getElementById('yemotFirstName').value} ${document.getElementById('yemotLastName').value}`;
        if(path && path !== "null") openAudioModal(path, name);
    });

    document.getElementById('openAddCardBtn').addEventListener('click', () => {
        document.getElementById('addCardContainer').classList.remove('hidden');
        document.getElementById('newCardInput').focus();
        document.getElementById('addCardErrorMsg').style.display = 'none';
    });

    document.getElementById('cancelAddCardBtn').addEventListener('click', () => {
        document.getElementById('addCardContainer').classList.add('hidden');
        document.getElementById('newCardInput').value = '';
        document.getElementById('addCardErrorMsg').style.display = 'none';
    });

    document.getElementById('saveNewCardBtn').addEventListener('click', async () => {
        const input = document.getElementById('newCardInput').value.trim();
        const errorEl = document.getElementById('addCardErrorMsg');
        errorEl.style.display = 'none';

        if (!input) {
            errorEl.textContent = "יש להזין מספר כרטיס או פס מגנטי";
            errorEl.style.display = 'block';
            return;
        }

        const mosadId = localStorage.getItem('nedarimMosadId');
        const password = localStorage.getItem('nedarimPassword');
        const clientId = document.getElementById('nedarimClientId').value;

        if (!mosadId || !password || !clientId || clientId === "לא קיים חשבון") return;

        const btn = document.getElementById('saveNewCardBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            const res = await NedarimAPI.addClientCard(mosadId, password, clientId, input);
            if (res.Result === "OK" || (res.CardId && res.AddedDate)) {
                document.getElementById('addCardContainer').classList.add('hidden');
                document.getElementById('newCardInput').value = '';
                const zeout = clientCardModal.dataset.zeout;
                await openClientCard(zeout);
                document.querySelector('.tab-btn[data-tab="cards"]').click(); 
            } else {
                errorEl.textContent = res.Message || "שגיאה לא ידועה בהוספת הכרטיס";
                errorEl.style.display = 'block';
            }
        } catch (error) {
            errorEl.textContent = "שגיאת תקשורת בניסיון הוספת הכרטיס";
            errorEl.style.display = 'block';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('openAddTlushBtn').addEventListener('click', () => {
        document.getElementById('addTlushContainer').classList.remove('hidden');
        document.getElementById('newTlushAmount').focus();
        document.getElementById('addTlushErrorMsg').style.display = 'none';
        loadLimitedStoresIntoSelect();
    });

    document.getElementById('cancelAddTlushBtn').addEventListener('click', () => {
        document.getElementById('addTlushContainer').classList.add('hidden');
        document.getElementById('newTlushAmount').value = '';
        document.getElementById('newTlushExpiration').value = '';
        document.getElementById('newTlushComments').value = '';
        document.getElementById('addTlushErrorMsg').style.display = 'none';
    });

    document.getElementById('saveNewTlushBtn').addEventListener('click', async () => {
        const amount = document.getElementById('newTlushAmount').value.trim();
        const expiration = document.getElementById('newTlushExpiration').value.trim();
        const limitedId = document.getElementById('newTlushLimitedId').value;
        const comments = document.getElementById('newTlushComments').value.trim();
        
        const errorEl = document.getElementById('addTlushErrorMsg');
        errorEl.style.display = 'none';

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            errorEl.textContent = "יש להזין סכום תקין לטעינה";
            errorEl.style.display = 'block';
            return;
        }

        if (!isValidDateFormat(expiration)) {
            errorEl.textContent = "תאריך התוקף שגוי. פורמט נדרש: dd/MM/yyyy";
            errorEl.style.display = 'block';
            return;
        }

        const mosadId = localStorage.getItem('nedarimMosadId');
        const password = localStorage.getItem('nedarimPassword');
        const clientId = document.getElementById('nedarimClientId').value;

        if (!mosadId || !password || !clientId || clientId === "לא קיים חשבון") return;

        const btn = document.getElementById('saveNewTlushBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> שומר...';
        btn.disabled = true;

        try {
            const res = await NedarimAPI.addTlush(mosadId, password, clientId, amount, expiration, limitedId, comments);
            if (res.Result === "OK") {
                document.getElementById('cancelAddTlushBtn').click();
                const zeout = clientCardModal.dataset.zeout;
                await openClientCard(zeout);
                document.querySelector('.tab-btn[data-tab="zchuyot"]').click();
            } else {
                errorEl.textContent = res.Message || "שגיאה בביצוע הטעינה";
                errorEl.style.display = 'block';
            }
        } catch (error) {
            errorEl.textContent = "שגיאת תקשורת מול השרת";
            errorEl.style.display = 'block';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    const yemotInputs = ['yemotFirstName', 'yemotLastName', 'yemotPhone1', 'yemotPhone2', 'yemotStatus'];
    yemotInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', function() {
            if (id === 'yemotPhone1' || id === 'yemotPhone2') this.value = this.value.replace(/[^0-9]/g, ''); 
            document.getElementById('saveYemotBtn').classList.add('pulse-primary');
        });
    });

    const nedarimInputs = ['nedarimFirstName', 'nedarimFamilyName', 'nedarimAddress', 'nedarimCity', 'nedarimPhone1', 'nedarimPhone2', 'nedarimEmail', 'nedarimGroupe', 'nedarimComments'];
    nedarimInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            const btn = document.getElementById('saveNedarimBtn');
            if (btn.classList.contains('btn-success')) btn.classList.add('pulse-success');
            else btn.classList.add('pulse-primary');
        });
    });

    document.getElementById('saveYemotBtn').addEventListener('click', async () => {
        const token = localStorage.getItem('yemotToken');
        const msgEl = document.getElementById('yemotStatusMsg');
        const zeout = clientCardModal.dataset.zeout;

        if (!token) { msgEl.textContent = 'חסר טוקן חיבור.'; msgEl.style.color = 'red'; return; }

        msgEl.style.color = 'var(--primary-color)';
        msgEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> שואב קובץ עדכני משרת...';

        try {
            const rawData = await YemotAPI.fetchRawBaseDataAPI(token);
            if (!rawData.contents) throw new Error("הקובץ בשרת ריק או לא נמצא");
            
            msgEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> מעדכן רשומה...';
            
            const lines = rawData.contents.split('\n');
            let updated = false;
            
            const newFirst = document.getElementById('yemotFirstName').value.replace(/,/g, '');
            const newLast = document.getElementById('yemotLastName').value.replace(/,/g, '');
            const newPhone1 = document.getElementById('yemotPhone1').value.replace(/,/g, '');
            const newPhone2 = document.getElementById('yemotPhone2').value.replace(/,/g, '');
            const newStatus = document.getElementById('yemotStatus').value.replace(/,/g, '');

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith(zeout + ',')) {
                    const cols = lines[i].split(',');
                    const origPass = cols[1] || ''; 
                    lines[i] = `${zeout},${origPass},${newFirst},${newLast},${newStatus},${newPhone1},${newPhone2}`;
                    updated = true;
                    break;
                }
            }

            if (!updated) {
                lines.push(`${zeout},,${newFirst},${newLast},${newStatus},${newPhone1},${newPhone2}`);
            }

            const newContents = lines.join('\n');
            msgEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> שולח חזרה לשרת...';

            await YemotAPI.uploadBaseData(token, newContents);

            msgEl.style.color = 'green';
            msgEl.innerHTML = '<i class="fa fa-check"></i> עודכן במערכת הטלפונית בהצלחה';
            document.getElementById('saveYemotBtn').classList.remove('pulse-primary'); 

            if(globalClientsMap[zeout]) {
                globalClientsMap[zeout].firstName = newFirst;
                globalClientsMap[zeout].lastName = newLast;
                globalClientsMap[zeout].phone1 = newPhone1;
                globalClientsMap[zeout].phone2 = newPhone2;
                globalClientsMap[zeout].yemotStatus = newStatus;
                
                if (typeof populateStatusFilter === 'function') populateStatusFilter();
                if (typeof updateDashboardStats === 'function') updateDashboardStats();
                if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
                if (typeof ExamsManager !== 'undefined' && typeof ExamsManager.reRender === 'function') ExamsManager.reRender();
            }

            try {
                const freshYemotData = await YemotAPI.fetchBaseData(token);
                const yemotUpdateEl = document.getElementById('yemotLastUpdate');
                if (yemotUpdateEl && freshYemotData.lastUpdate) {
                    yemotUpdateEl.textContent = freshYemotData.lastUpdate;
                }
            } catch(err) {
                console.warn("שגיאה ברענון תאריך עדכון אחרון", err);
            }

        } catch (error) {
            msgEl.style.color = 'red';
            msgEl.textContent = 'שגיאה: ' + error.message;
        }
    });

    document.getElementById('saveNedarimBtn').addEventListener('click', async () => {
        if (window.isNedarimDisabled) return; 

        const mosadId = localStorage.getItem('nedarimMosadId');
        const password = localStorage.getItem('nedarimPassword');
        const statusMsg = document.getElementById('nedarimStatusMsg');
        const zeout = clientCardModal.dataset.zeout;
        
        let clientId = document.getElementById('nedarimClientId').value;
        if(clientId === "לא קיים חשבון") clientId = null;

        if (!mosadId || !password) {
            statusMsg.textContent = 'חסרים פרטי התחברות לנדרים כארד.';
            statusMsg.style.color = 'red';
            return;
        }

        statusMsg.style.color = 'var(--primary-color)';
        statusMsg.innerHTML = '<i class="fa fa-spinner fa-spin"></i> מעדכן מערכת נדרים כארד...';
        setNedarimLoadingState(true); 

        const clientData = {
            zeout: zeout,
            firstName: document.getElementById('nedarimFirstName').value,
            lastName: document.getElementById('nedarimFamilyName').value,
            phone1: document.getElementById('nedarimPhone1').value,
            phone2: document.getElementById('nedarimPhone2').value,
            city: document.getElementById('nedarimCity').value, 
            address: document.getElementById('nedarimAddress').value,
            email: document.getElementById('nedarimEmail').value,
            groupe: document.getElementById('nedarimGroupe').value,
            comments: document.getElementById('nedarimComments').value
        };

        try {
            const response = await NedarimAPI.saveClient(mosadId, password, clientData, clientId);
            
            if (response.Result === 'OK') {
                statusMsg.style.color = 'green';
                document.getElementById('saveNedarimBtn').classList.remove('pulse-primary', 'pulse-success'); 
                
                if (!clientId) {
                    statusMsg.innerHTML = '<i class="fa fa-check"></i> החשבון נוצר בהצלחה!';
                    document.getElementById('nedarimClientId').value = response.Message;
                    document.getElementById('nedarimClientId').style.color = 'inherit';
                    document.getElementById('nedarimContainer').classList.remove('nedarim-missing-container');
                    
                    const btn = document.getElementById('saveNedarimBtn');
                    btn.className = 'btn btn-primary';
                    btn.innerHTML = '<i class="fa fa-save"></i> <span id="saveNedarimText">שמור שינויים בנדרים כארד</span>';
                    
                    globalClientsMap[zeout].hasNedarim = true;
                    globalClientsMap[zeout].nedarimClientId = response.Message;
                    
                    if (typeof populateStatusFilter === 'function') populateStatusFilter();
                    if (typeof updateDashboardStats === 'function') updateDashboardStats();
                    if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
                    if (typeof ExamsManager !== 'undefined' && typeof ExamsManager.reRender === 'function') ExamsManager.reRender();
                    
                } else { 
                    statusMsg.innerHTML = '<i class="fa fa-check"></i> עודכן בנדרים כארד בהצלחה!';
                }

                setTimeout(() => openClientCard(zeout), 1000);

            } else {
                statusMsg.textContent = 'שגיאה מנדרים כארד: ' + (response.Message || 'לא ידוע');
                statusMsg.style.color = 'red';
                setNedarimLoadingState(false);
            }
        } catch (error) {
            statusMsg.textContent = 'שגיאת תקשורת מול נדרים כארד.';
            statusMsg.style.color = 'red';
            setNedarimLoadingState(false);
        }
    });
});