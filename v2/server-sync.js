const SERVER_URL = 'https://masechet.m7008410.workers.dev/'; 

document.addEventListener('DOMContentLoaded', () => {
    runServerSync();
});

// פונקציה ראשית לסנכרון מול השרת
async function runServerSync(secretPass = null) {
    try {
        let fetchOptions = {
            method: 'GET',
            headers: {}
        };

        if (secretPass) {
            fetchOptions.method = 'POST';
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify({ pass: secretPass });
        }

        const response = await fetch(SERVER_URL, fetchOptions);
        if (!response.ok) throw new Error('שגיאה בתקשורת מול שרת ההרשאות');
        
        const data = await response.json();

        if (data.error) {
            return false; 
        }

        if (!data.isAuthorized) {
            blockApplication("הגישה לאתר נחסמה.");
            return true;
        }

        updateUserDisplay(data.username);

        if (data.canReceiveConfig && data.config) {
            checkAndPromptConfigUpdate(data.config);
        }
        
        return true;

    } catch (error) {
        console.error("Server sync error:", error);
        updateUserDisplay("- (שגיאה)");
        return false;
    }
}

function blockApplication(message) {
    document.querySelector('.top-bar').style.display = 'none';
    document.querySelector('main').style.display = 'none';
    
    const blockScreen = document.createElement('div');
    blockScreen.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: #f8d7da; color: #721c24; display: flex; 
        flex-direction: column; justify-content: center; align-items: center;
        z-index: 9999; text-align: center; font-family: 'Rubik', sans-serif;
    `;
    blockScreen.innerHTML = `
        <i class="fa fa-ban" style="font-size: 5rem; margin-bottom: 20px;"></i>
        <h1 style="margin-bottom: 10px;">גישה נדחתה</h1>
        <p style="font-size: 1.2rem;">${message}</p>
    `;
    document.body.appendChild(blockScreen);
}

function updateUserDisplay(username) {
    const userDisplayEl = document.getElementById('topBarUserDisplay');
    if (!userDisplayEl) return;

    userDisplayEl.innerHTML = `
        <i class="fa fa-user-circle"></i> משתמש: 
        <strong id="secretAuthTrigger" style="cursor: pointer;" title="להזנת קוד מנהל">${username}</strong>
    `;
    
    if (!document.getElementById('secretAuthModal')) {
        const modalHtml = `
            <div id="secretAuthModal" class="modal-overlay hidden" style="z-index: 9999;">
                <div class="modal-content" style="max-width: 320px;">
                    <div class="modal-header" style="padding: 12px 15px; background: #f8f9fa;">
                        <h3 style="margin: 0; font-size: 1.1rem; color: var(--primary-color); display: flex; align-items: center; gap: 8px;">
                            <i class="fa fa-lock"></i> אימות מנהל
                        </h3>
                        <button id="closeSecretModalBtn" class="close-btn"><i class="fa fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 10px;">הזן קוד לקבלת עדכונים מהשרת:</p>
                        <input type="password" id="secretAuthInput" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; text-align: center; letter-spacing: 2px;" autocomplete="off">
                    </div>
                    <div class="modal-footer" style="padding: 12px 15px; display: flex; justify-content: flex-end; gap: 10px; background: #f8f9fa;">
                        <button id="cancelSecretModalBtn" class="btn btn-secondary">ביטול</button>
                        <button id="submitSecretModalBtn" class="btn btn-primary" style="min-width: 90px;"><i class="fa fa-check"></i> אישור</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById('secretAuthModal');
        const trigger = document.getElementById('secretAuthTrigger');
        const input = document.getElementById('secretAuthInput');
        const submitBtn = document.getElementById('submitSecretModalBtn');
        const cancelBtn = document.getElementById('cancelSecretModalBtn');
        const closeBtn = document.getElementById('closeSecretModalBtn');

        const closeModal = () => {
            modal.classList.add('hidden');
            input.value = ''; 
        };

        trigger.addEventListener('click', () => {
            modal.classList.remove('hidden');
            setTimeout(() => input.focus(), 100);
        });

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(); 
        });

        const handleSubmit = async () => {
            const pass = input.value.trim();
            if (!pass) return;

            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> בודק...';
            submitBtn.disabled = true;
            input.disabled = true;
            cancelBtn.disabled = true;

            await runServerSync(pass);
            
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
            input.disabled = false;
            cancelBtn.disabled = false;
            closeModal();
        };

        submitBtn.addEventListener('click', handleSubmit);
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSubmit();
        });
    } else {
        document.getElementById('secretAuthTrigger').addEventListener('click', () => {
            document.getElementById('secretAuthModal').classList.remove('hidden');
            setTimeout(() => document.getElementById('secretAuthInput').focus(), 100);
        });
    }
}

function applyConfig(newConfig) {
    let authChanged = false;

    if (newConfig.clearAll) {
        localStorage.clear();
        localStorage.setItem('autoSyncOnLoad', 'true');
        authChanged = true;
    } else {
        const keys = ['yemotUsername', 'yemotPassword', 'yemotToken', 'nedarimMosadId', 'nedarimPassword'];
        keys.forEach(key => {
            const newVal = newConfig[key];
            if (newVal !== undefined && newVal !== '') {
                if (key === 'yemotUsername' || key === 'yemotPassword') {
                    if (localStorage.getItem(key) !== newVal) authChanged = true;
                }
                
                if (newVal === 'delete') {
                    localStorage.removeItem(key);
                    if (key === 'yemotToken') authChanged = true;
                } else {
                    localStorage.setItem(key, newVal);
                }
            }
        });
    }

    if (authChanged && (!newConfig.yemotToken || newConfig.yemotToken === 'delete')) {
        localStorage.removeItem('yemotToken');
    }

    const ymUserEl = document.getElementById('yemotUsername');
    const ndMosadEl = document.getElementById('nedarimMosadId');
    if(ymUserEl) ymUserEl.value = localStorage.getItem('yemotUsername') || '';
    if(ndMosadEl) ndMosadEl.value = localStorage.getItem('nedarimMosadId') || '';

    // מעלים כל הודעת שגיאה שהייתה קיימת במסך הקודם
    document.querySelectorAll('.loading-banner').forEach(banner => banner.classList.add('hidden'));

    // מסדרים את התצוגה לפני הרענון
    if (localStorage.getItem('yemotToken')) {
        // אם יש טוקן, הרענון לא יעבור דרך מסך הטעינה הראשי אלא ישירות לטבלה. לכן חובה לחשוף אותה.
        const authScreens = document.getElementById('authScreens');
        const mainAppWrapper = document.getElementById('mainAppWrapper');
        const statsCards = document.getElementById('statsCardsContainer');
        const mainTable = document.getElementById('mainTableContainer');
        
        if (authScreens) authScreens.classList.add('hidden');
        if (mainAppWrapper) mainAppWrapper.classList.remove('hidden');
        if (statsCards) statsCards.classList.remove('hidden');
        if (mainTable) mainTable.classList.remove('hidden');
    }

    // קריאה לרענון הפנימי (ללא טעינה מחדש של הדף!)
    if (typeof window.refreshApplicationData === 'function') {
        window.refreshApplicationData();
    }
}

function checkAndPromptConfigUpdate(newConfig) {
    if (newConfig.forceUpdate) {
        applyConfig(newConfig);
        return;
    }

    let needsUpdate = false;
    const keys = ['yemotUsername', 'yemotPassword', 'yemotToken', 'nedarimMosadId', 'nedarimPassword'];
    
    keys.forEach(key => {
        const currentVal = localStorage.getItem(key) || '';
        const newVal = newConfig[key];
        
        if (newVal !== undefined && newVal !== '') {
            if (newVal === 'delete' && currentVal !== '') {
                needsUpdate = true; 
            } else if (newVal !== 'delete' && newVal !== currentVal) {
                needsUpdate = true; 
            }
        }
    });

    if (needsUpdate) {
        const tryShowConfigModal = () => {
            const customAlert = document.getElementById('customAlertModal');
            if (customAlert && !customAlert.classList.contains('hidden')) {
                setTimeout(tryShowConfigModal, 500);
                return;
            }

            if (!document.getElementById('configUpdateModal')) {
                const html = `
                <div id="configUpdateModal" class="modal-overlay hidden" style="z-index: 9998;">
                    <div class="modal-content" style="max-width: 400px; padding: 0; overflow: hidden; border-radius: 8px;">
                        <div class="modal-header" style="background: #f8f9fa; border-bottom: 1px solid var(--border-light); padding: 15px 20px;">
                            <h3 style="margin: 0; font-size: 1.15rem; color: var(--primary-color); display: flex; align-items: center; gap: 8px;">
                                <i class="fa fa-refresh"></i> עדכון הגדרות מערכת
                            </h3>
                            <button id="closeConfigUpdateBtn" class="close-btn"><i class="fa fa-times"></i></button>
                        </div>
                        <div class="modal-body" style="padding: 25px 20px; text-align: center; background: #fff;">
                            <i class="fa fa-cloud-download" style="font-size: 3.5rem; color: var(--primary-color); margin-bottom: 15px; opacity: 0.9;"></i>
                            <p style="margin: 0 0 8px 0; color: var(--text-main); font-size: 1.1rem; font-weight: 500;">
                                התקבלו הגדרות מערכת חדשות.
                            </p>
                            <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted);">
                                האם ברצונך להחיל ולשמור אותן כעת?
                            </p>
                        </div>
                        <div class="modal-footer" style="padding: 15px 20px; display: flex; justify-content: center; background: #f8f9fa; border-top: 1px solid var(--border-light);">
                            <button id="confirmConfigUpdateBtn" class="btn btn-primary" style="padding: 8px 30px; font-weight: 500;">
                                <i class="fa fa-check"></i> אישור ועדכון
                            </button>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
            }

            const modal = document.getElementById('configUpdateModal');
            const confirmBtn = document.getElementById('confirmConfigUpdateBtn');
            const closeBtn = document.getElementById('closeConfigUpdateBtn');

            modal.classList.remove('hidden');

            const closeModal = () => modal.classList.add('hidden');

            closeBtn.onclick = closeModal;

            confirmBtn.onclick = () => {
                applyConfig(newConfig); 
                
                const originalText = confirmBtn.innerHTML;
                confirmBtn.innerHTML = '<i class="fa fa-check"></i> הושלם!';
                confirmBtn.style.backgroundColor = '#28a745';
                confirmBtn.style.borderColor = '#28a745';
                
                setTimeout(() => {
                    closeModal();
                    confirmBtn.innerHTML = originalText;
                    confirmBtn.style.backgroundColor = '';
                    confirmBtn.style.borderColor = '';
                }, 1000);
            };
        };

        tryShowConfigModal();
    }
}