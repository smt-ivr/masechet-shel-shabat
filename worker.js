// Cloudflare Worker – "מסכת של שבת"
// נתיב הבסיס: /masechet
//   /masechet            → האתר החדש (v2)  ← הראשי
//   /masechet/old        → האתר הישן        ← נגיש בכפתור
// הקבצים מיובאים כמודולים (טקסט / בינארי) לפי ההגדרות ב-wrangler.toml.

// ----- האתר החדש (v2) -----
import v2Index from './v2/index.html';
import v2Style from './v2/style.css';
import v2SmtPng from './v2/smt.png';
import v2ApiYemot from './v2/api-yemot.js';
import v2ApiNedarim from './v2/api-nedarim.js';
import v2ExamsManager from './v2/exams-manager.js';
import v2LotteryManager from './v2/lottery-manager.js';
import v2CloseExamManager from './v2/close-exam-manager.js';
import v2QuestionsManager from './v2/questions-manager.js';
import v2HistoryManager from './v2/history-manager.js';
import v2App from './v2/app.js';
import v2ModalsAndUi from './v2/modals-and-ui.js';
import v2Auth from './v2/auth.js';
import v2TableManager from './v2/table-manager.js';
import v2ClientCard from './v2/client-card.js';
import v2ServerSync from './v2/server-sync.js';
import v2SettingsManager from './v2/settings-manager.js';

// ----- האתר הישן -----
import oldIndex from './old/index.html';
import oldSmtHtml from './old/smt.html';
import oldSmtPng from './old/smt.png';
import oldFavicon from './old/favicon.ico';

const HTML = 'text/html; charset=utf-8';
const CSS  = 'text/css; charset=utf-8';
const JS   = 'application/javascript; charset=utf-8';
const PNG  = 'image/png';
const ICO  = 'image/x-icon';

// מיפוי נתיב → [תוכן, סוג-תוכן]
const ROUTES = {
  // ---- האתר החדש (v2): מוגש ישירות תחת /masechet/ ----
  '/masechet/':                     [v2Index,            HTML],
  '/masechet/index.html':           [v2Index,            HTML],
  '/masechet/style.css':            [v2Style,            CSS],
  '/masechet/smt.png':              [v2SmtPng,           PNG],
  '/masechet/api-yemot.js':         [v2ApiYemot,         JS],
  '/masechet/api-nedarim.js':       [v2ApiNedarim,       JS],
  '/masechet/exams-manager.js':     [v2ExamsManager,     JS],
  '/masechet/lottery-manager.js':   [v2LotteryManager,   JS],
  '/masechet/close-exam-manager.js':[v2CloseExamManager, JS],
  '/masechet/questions-manager.js': [v2QuestionsManager, JS],
  '/masechet/history-manager.js':   [v2HistoryManager,   JS],
  '/masechet/app.js':               [v2App,              JS],
  '/masechet/modals-and-ui.js':     [v2ModalsAndUi,      JS],
  '/masechet/auth.js':              [v2Auth,             JS],
  '/masechet/table-manager.js':     [v2TableManager,     JS],
  '/masechet/client-card.js':       [v2ClientCard,       JS],
  '/masechet/server-sync.js':       [v2ServerSync,       JS],
  '/masechet/settings-manager.js':  [v2SettingsManager,  JS],

  // ---- האתר הישן: מוגש תחת /masechet/old/ ----
  '/masechet/old/':            [oldIndex,   HTML],
  '/masechet/old/index.html':  [oldIndex,   HTML],
  '/masechet/old/smt.html':    [oldSmtHtml, HTML],
  '/masechet/old/smt.png':     [oldSmtPng,  PNG],
  '/masechet/old/favicon.ico': [oldFavicon, ICO],
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const redirect = (to) => Response.redirect(url.origin + to, 301);

    // נרמול נתיבים ללא "/" בסוף (כדי שקישורים יחסיים יעבדו)
    if (path === '/masechet')     return redirect('/masechet/');
    if (path === '/masechet/old') return redirect('/masechet/old/');

    // תאימות לאחור: קישורים ישנים ל-/masechet/v2/... → האתר החדש ב-/masechet/...
    if (path === '/masechet/v2' || path === '/masechet/v2/') return redirect('/masechet/');
    if (path.startsWith('/masechet/v2/')) {
      return redirect('/masechet/' + path.slice('/masechet/v2/'.length));
    }

    const hit = ROUTES[path];
    if (hit) {
      return new Response(hit[0], {
        status: 200,
        headers: { 'Content-Type': hit[1] },
      });
    }

    return new Response('404 - Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
