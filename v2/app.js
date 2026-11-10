// --- משתנים ומצב גלובלי ---
let globalClientsArray = []; 
let globalClientsMap = {};   

window.isLoadingAudio = false;
window.isLoadingPoints = false;
window.isLoadingNedarim = false;
window.isNedarimDisabled = false; 
window.isAudioDisabled = false;
window.isPointsDisabled = false;

if (localStorage.getItem('autoSyncOnLoad') === null) {
    localStorage.setItem('autoSyncOnLoad', 'true');
}

// --- אלמנטים ב-DOM ---
let globalRefreshBtn, searchInput, selectAllCheckbox, loadingIndicator, mainTableContainer, tbody;
let authScreens, mainAppWrapper, globalStartupLoader;
let mfaBanner, mfaLink, mfaRefreshBtn;
let nedarimErrorBanner, nedarimErrorMessage;
let yemotBaseErrorBanner, yemotBaseErrorMessage;
let yemotPointsErrorBanner, yemotPointsErrorMessage;
let yemotAudioErrorBanner, yemotAudioErrorMessage; 
let statsCardsContainer;
let totalClientsEl, missingNedarimEl, nedarimOnlyCountEl, yemotLastUpdateEl;
let customAlertModal, customAlertMessage, closeAlertBtn;
let clientCardModal, audioModal, audioPlayer, audioClientName, closeAudioModalBtn;

document.addEventListener('DOMContentLoaded', () => {
    globalRefreshBtn = document.getElementById('globalRefreshBtn');
    searchInput = document.getElementById('searchInput');
    selectAllCheckbox = document.getElementById('selectAllCheckbox');
    loadingIndicator = document.getElementById('loadingIndicator');
    mainTableContainer = document.getElementById('mainTableContainer');
    tbody = document.querySelector('#customersTable tbody');
    
    authScreens = document.getElementById('authScreens');
    mainAppWrapper = document.getElementById('mainAppWrapper');
    globalStartupLoader = document.getElementById('globalStartupLoader');

    mfaBanner = document.getElementById('mfaBanner');
    mfaLink = document.getElementById('mfaLink');
    mfaRefreshBtn = document.getElementById('mfaRefreshBtn');
    
    nedarimErrorBanner = document.getElementById('nedarimErrorBanner');
    nedarimErrorMessage = document.getElementById('nedarimErrorMessage');
    
    yemotBaseErrorBanner = document.getElementById('yemotBaseErrorBanner');
    yemotBaseErrorMessage = document.getElementById('yemotBaseErrorMessage');
    yemotPointsErrorBanner = document.getElementById('yemotPointsErrorBanner');
    yemotPointsErrorMessage = document.getElementById('yemotPointsErrorMessage');
    yemotAudioErrorBanner = document.getElementById('yemotAudioErrorBanner');
    yemotAudioErrorMessage = document.getElementById('yemotAudioErrorMessage');
    
    statsCardsContainer = document.getElementById('statsCardsContainer');
    totalClientsEl = document.getElementById('totalClientsCount');
    missingNedarimEl = document.getElementById('missingNedarimCount');
    nedarimOnlyCountEl = document.getElementById('nedarimOnlyCount');
    yemotLastUpdateEl = document.getElementById('yemotLastUpdate');

    customAlertModal = document.getElementById('customAlertModal');
    customAlertMessage = document.getElementById('customAlertMessage');
    closeAlertBtn = document.getElementById('closeAlertBtn');
    
    clientCardModal = document.getElementById('clientCardModal');
    
    audioModal = document.getElementById('audioModal');
    audioPlayer = document.getElementById('audioPlayer');
    audioClientName = document.getElementById('audioClientName');
    closeAudioModalBtn = document.getElementById('closeAudioModalBtn');

    let pendingClientZeout = null;

    function processEarlyUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        let hasParams = false;

        let msg = urlParams.get('msg');
        if (msg) {
            msg = msg.replace(/\\n/g, '\n');
            if (customAlertMessage) customAlertMessage.style.whiteSpace = 'pre-wrap';
            if (typeof showAlert === 'function') showAlert(msg);
            hasParams = true;
        }

        const tab = urlParams.get('tab');
        if (tab) {
            const navBtn = document.querySelector(`.main-nav-btn[data-target="${tab}"]`);
            if (navBtn) navBtn.click();
            hasParams = true;
        }

        const clientZeout = urlParams.get('client');
        if (clientZeout) {
            pendingClientZeout = clientZeout;
            hasParams = true;
        }

        if (hasParams) {
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    }

    async function initApplication() {
        authScreens.classList.remove('hidden');
        globalStartupLoader.classList.remove('hidden');
        
        // נסתיר את מסך הטעינה הידנית אם הוא קיים
        const manualScreen = document.getElementById('manualLoadScreen');
        if (manualScreen) manualScreen.classList.add('hidden');
        
        mainAppWrapper.classList.add('hidden');
        
        const token = await authenticateYemot();
        globalStartupLoader.classList.add('hidden');
        
        if (!token) return; 
        
        authScreens.classList.add('hidden');
        mainAppWrapper.classList.remove('hidden');
        await fetchAndRenderData(token);
    }

    async function fetchAndRenderData(token) {
        yemotBaseErrorBanner.classList.add('hidden');
        yemotPointsErrorBanner.classList.add('hidden');
        yemotAudioErrorBanner.classList.add('hidden');
        nedarimErrorBanner.classList.add('hidden');
        
        statsCardsContainer.classList.remove('hidden');
        
        const spinnerHtml = '<i class="fa fa-spinner fa-spin"></i>';
        totalClientsEl.innerHTML = spinnerHtml;
        missingNedarimEl.innerHTML = spinnerHtml;
        nedarimOnlyCountEl.innerHTML = spinnerHtml;
        yemotLastUpdateEl.innerHTML = spinnerHtml;

        const mosadId = localStorage.getItem('nedarimMosadId');
        const password = localStorage.getItem('nedarimPassword');

        loadingIndicator.classList.remove('hidden');
        tbody.innerHTML = ''; 
        
        window.isNedarimDisabled = false;
        window.isAudioDisabled = false;
        window.isPointsDisabled = false;
        
        window.isLoadingAudio = true;
        window.isLoadingPoints = true;
        window.isLoadingNedarim = true;

        if (typeof ExamsManager !== 'undefined') ExamsManager.showLoading();

        try {
            let yemotData;
            try {
                yemotData = await YemotAPI.fetchBaseData(token);
            } catch (error) {
                loadingIndicator.classList.add('hidden');
                yemotBaseErrorMessage.textContent = error.message;
                yemotBaseErrorBanner.classList.remove('hidden');
                statsCardsContainer.classList.add('hidden');
                mainTableContainer.classList.add('hidden');
                if (typeof ExamsManager !== 'undefined') ExamsManager.render({error: true, message: error.message});
                return; 
            }
            
            globalClientsArray = [];
            globalClientsMap = {};
            
            yemotData.clients.forEach(yClient => {
                const mergedObj = {
                    index: yClient.index,
                    zeout: yClient.zeout,
                    firstName: yClient.firstName,
                    lastName: yClient.lastName,
                    phone1: yClient.phone1,
                    phone2: yClient.phone2, 
                    yemotStatus: yClient.status,
                    hasNedarim: false,
                    nedarimClientId: null,
                    city: '',
                    ytra: '0.00 ₪',
                    audioPath: null,
                    points: null
                };
                globalClientsArray.push(mergedObj);
                globalClientsMap[yClient.zeout] = mergedObj;
            });

            yemotLastUpdateEl.textContent = yemotData.lastUpdate;
            
            loadingIndicator.classList.add('hidden');
            mainTableContainer.classList.remove('hidden');
            
            if (typeof populateStatusFilter === 'function') populateStatusFilter();
            if (typeof updateDashboardStats === 'function') updateDashboardStats(); 
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender(); 
            
            YemotAPI.fetchRecordingsList(token).then(recRes => {
                window.isLoadingAudio = false;
                window.isAudioDisabled = recRes.error;
                
                if (recRes.error) {
                    yemotAudioErrorMessage.textContent = recRes.message || "שגיאה לא ידועה";
                    yemotAudioErrorBanner.classList.remove('hidden');
                } else {
                    const recordingsMap = recRes.data || {};
                    globalClientsArray.forEach(c => c.audioPath = recordingsMap[c.zeout] || null);
                }
                if (typeof updateDynamicColumn === 'function') updateDynamicColumn('audio');
            }).catch(e => {
                window.isLoadingAudio = false;
                window.isAudioDisabled = true;
                if (typeof updateDynamicColumn === 'function') updateDynamicColumn('audio');
            });

            YemotAPI.fetchPointsData(token).then(pointsRes => {
                window.isLoadingPoints = false;
                window.isPointsDisabled = pointsRes.error;
                
                if (pointsRes.error) {
                    yemotPointsErrorMessage.textContent = pointsRes.message || "שגיאה לא ידועה";
                    yemotPointsErrorBanner.classList.remove('hidden');
                } else {
                    const pointsMap = pointsRes.data || {};
                    globalClientsArray.forEach(c => c.points = pointsMap[c.zeout] !== undefined ? pointsMap[c.zeout] : null);
                }
                
                const pointsThContent = document.querySelector('.th-content[onclick*="pointsMenu"]');
                if (window.isPointsDisabled && pointsThContent) {
                    pointsThContent.style.opacity = '0.4'; pointsThContent.style.cursor = 'not-allowed';
                } else if(pointsThContent) {
                    pointsThContent.style.opacity = '1'; pointsThContent.style.cursor = 'pointer';
                }
                
                if (typeof updateDynamicColumn === 'function') updateDynamicColumn('points');
            }).catch(e => {
                window.isLoadingPoints = false;
                window.isPointsDisabled = true;
                if (typeof updateDynamicColumn === 'function') updateDynamicColumn('points');
            });
            
            if (mosadId && password) {
                NedarimAPI.fetchClientList(mosadId, password).then(nRes => {
                    window.isLoadingNedarim = false;
                    
                    if (nRes && nRes.Result === 'OK' && nRes.data) {
                        const nedarimMap = {};
                        nRes.data.forEach(nClient => { 
                            if(nClient && nClient.Zeout) nedarimMap[nClient.Zeout] = nClient; 
                        });
                        
                        let nedarimMatchedIds = new Set(); 
                        
                        globalClientsArray.forEach(c => {
                            const nClient = nedarimMap[c.zeout];
                            if (nClient) {
                                c.hasNedarim = true;
                                c.nedarimClientId = nClient.ClientId;
                                c.city = nClient.City || '';
                                c.ytra = nClient.Ytra || '0.00 ₪';
                                nedarimMatchedIds.add(c.zeout);
                            }
                        });

                        let nedarimOnlyCount = 0;
                        Object.keys(nedarimMap).forEach(key => {
                            if (key && !nedarimMatchedIds.has(key)) nedarimOnlyCount++;
                        });
                        nedarimOnlyCountEl.textContent = nedarimOnlyCount;
                        
                    } else {
                        window.isNedarimDisabled = true;
                        if(nedarimErrorMessage) nedarimErrorMessage.textContent = (nRes && nRes.Message) ? nRes.Message : 'שגיאת אימות או פרטים שגויים';
                        nedarimErrorBanner.classList.remove('hidden');
                    }
                    finalizeNedarimUI();
                }).catch(e => { 
                    window.isLoadingNedarim = false;
                    window.isNedarimDisabled = true;
                    if(nedarimErrorMessage) nedarimErrorMessage.textContent = 'שגיאת תקשורת מול מערכת נדרים כארד';
                    nedarimErrorBanner.classList.remove('hidden');
                    finalizeNedarimUI();
                });
            } else {
                window.isLoadingNedarim = false;
                window.isNedarimDisabled = true; 
                finalizeNedarimUI();
            }

            function finalizeNedarimUI() {
                const nedarimThContent = document.querySelector('.th-content[onclick*="nedarimMenu"]');
                const balanceThContent = document.querySelector('.th-content[onclick*="balanceMenu"]');
                if (window.isNedarimDisabled) {
                    if(nedarimThContent) { nedarimThContent.style.opacity = '0.4'; nedarimThContent.style.cursor = 'not-allowed'; }
                    if(balanceThContent) { balanceThContent.style.opacity = '0.4'; balanceThContent.style.cursor = 'not-allowed'; }
                    nedarimOnlyCountEl.innerHTML = '<span style="font-size:1rem; color:#888;">-</span>';
                } else {
                    if(nedarimThContent) { nedarimThContent.style.opacity = '1'; nedarimThContent.style.cursor = 'pointer'; }
                    if(balanceThContent) { balanceThContent.style.opacity = '1'; balanceThContent.style.cursor = 'pointer'; }
                }
                if (typeof updateDashboardStats === 'function') updateDashboardStats();
                if (typeof updateDynamicColumn === 'function') updateDynamicColumn('nedarim');
            }

            try {
                const examData = await YemotAPI.fetchExamData(token);
                if (typeof ExamsManager !== 'undefined') ExamsManager.render(examData);
            } catch (e) {
                console.error("שגיאה בטעינת נתוני מבחנים", e);
            }

            if (pendingClientZeout) {
                if (globalClientsMap && globalClientsMap[pendingClientZeout]) {
                    if (typeof openClientCard === 'function') openClientCard(pendingClientZeout);
                }
                pendingClientZeout = null;
            }

        } catch (error) {
            console.error(error);
            loadingIndicator.classList.add('hidden');
        }
    }

    window.refreshApplicationData = async () => {
        const token = localStorage.getItem('yemotToken');
        if (token) {
            const icon = globalRefreshBtn.querySelector('i');
            if (icon) icon.classList.add('fa-spin');
            await fetchAndRenderData(token);
            if (icon) icon.classList.remove('fa-spin');
        } else {
            initApplication();
        }
    };

    globalRefreshBtn.addEventListener('click', window.refreshApplicationData);

    const navButtons = document.querySelectorAll('.main-nav-btn');
    const appViews = document.querySelectorAll('.app-view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            appViews.forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.classList.add('active');
        });
    });

    processEarlyUrlParams();

    // לוגיקת הפעלת המערכת בהתאם לבחירת המשתמש על טעינה אוטומטית
    if (localStorage.getItem('autoSyncOnLoad') !== 'false') {
        initApplication();
    } else {
        // המשתמש בחר להשבית טעינה אוטומטית - נציג לו את חלון הפעלת הטעינה הידנית
        globalStartupLoader.classList.add('hidden');
        
        const manualScreen = document.createElement('div');
        manualScreen.id = 'manualLoadScreen';
        manualScreen.className = 'text-center';
        manualScreen.style.cssText = 'padding: 100px 20px; color: var(--text-main); display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%;';
        manualScreen.innerHTML = `
            <div style="background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid var(--border-light); max-width: 500px; width: 100%;">
                <i class="fa fa-pause-circle-o" style="font-size: 5rem; color: #adb5bd; margin-bottom: 20px;"></i>
                <h2 style="color: var(--primary-color); margin-bottom: 15px; font-weight: 500;">טעינת נתונים אוטומטית מושבתת</h2>
                <p style="font-size: 1.1rem; color: var(--text-muted); margin-bottom: 30px;">הגדרת במערכת שלא למשוך נתונים באופן אוטומטי בעת פתיחת הדף.</p>
                <button id="btnManualLoadStart" class="btn btn-primary" style="font-size: 1.15rem; padding: 12px 35px; border-radius: 30px; box-shadow: 0 4px 10px rgba(3, 27, 79, 0.2);">
                    <i class="fa fa-cloud-download"></i> לחץ לטעינת נתונים מהשרת
                </button>
            </div>
        `;
        authScreens.appendChild(manualScreen);
        
        document.getElementById('btnManualLoadStart').addEventListener('click', () => {
            initApplication();
        });
    }
});