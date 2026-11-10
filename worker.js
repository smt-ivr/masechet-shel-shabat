// Cloudflare Worker – "מסכת של שבת"
// מגיש שתי גרסאות של האתר תחת נתיב הבסיס /masechet:
//   /masechet          → הגרסה הישנה (old/)
//   /masechet/v2       → הגרסה החדשה (v2/)
// הקבצים מיובאים כמודולים (טקסט / בינארי) לפי ההגדרות ב-wrangler.toml.

// ----- הגרסה הישנה -----
import oldIndex from './old/index.html';
import oldSmtHtml from './old/smt.html';
import oldSmtPng from './old/smt.png';
import oldFavicon from './old/favicon.ico';

// ----- גרסה V2 -----
import v2Index from './v2/index.html';
import v2Style from './v2/style.css';
import v2SmtPng from './v2/smt.png';
import v2ApiYemot from './v2/api-yemot.js';
import v2ApiNedarim from './v2/api-nedarim.js';
import v2ExamsManager from './v2/exams-manager.js';
import v2QuestionsManager from './v2/questions-manager.js';
import v2HistoryManager from './v2/history-manager.js';
import v2App from './v2/app.js';
import v2ModalsAndUi from './v2/modals-and-ui.js';
import v2Auth from './v2/auth.js';
import v2TableManager from './v2/table-manager.js';
import v2ClientCard from './v2/client-card.js';
import v2ServerSync from './v2/server-sync.js';
import v2SettingsManager from './v2/settings-manager.js';

const HTML = 'text/html; charset=utf-8';
const CSS  = 'text/css; charset=utf-8';
const JS   = 'application/javascript; charset=utf-8';
const PNG  = 'image/png';
const ICO  = 'image/x-icon';

// מיפוי נתיב → [תוכן, סוג-תוכן]
const ROUTES = {
  // ---- הגרסה הישנה: /masechet ----
  '/masechet/':              [oldIndex,   HTML],
  '/masechet/index.html':    [oldIndex,   HTML],
  '/masechet/smt.html':      [oldSmtHtml, HTML],
  '/masechet/smt.png':       [oldSmtPng,  PNG],
  '/masechet/favicon.ico':   [oldFavicon, ICO],

  // ---- גרסה V2: /masechet/v2 ----
  '/masechet/v2/':                     [v2Index,            HTML],
  '/masechet/v2/index.html':           [v2Index,            HTML],
  '/masechet/v2/style.css':            [v2Style,            CSS],
  '/masechet/v2/smt.png':              [v2SmtPng,           PNG],
  '/masechet/v2/api-yemot.js':         [v2ApiYemot,         JS],
  '/masechet/v2/api-nedarim.js':       [v2ApiNedarim,       JS],
  '/masechet/v2/exams-manager.js':     [v2ExamsManager,     JS],
  '/masechet/v2/questions-manager.js': [v2QuestionsManager, JS],
  '/masechet/v2/history-manager.js':   [v2HistoryManager,   JS],
  '/masechet/v2/app.js':               [v2App,              JS],
  '/masechet/v2/modals-and-ui.js':     [v2ModalsAndUi,      JS],
  '/masechet/v2/auth.js':              [v2Auth,             JS],
  '/masechet/v2/table-manager.js':     [v2TableManager,     JS],
  '/masechet/v2/client-card.js':       [v2ClientCard,       JS],
  '/masechet/v2/server-sync.js':       [v2ServerSync,       JS],
  '/masechet/v2/settings-manager.js':  [v2SettingsManager,  JS],
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // נרמול נתיבים ללא "/" בסוף → הפניה לנתיב עם "/" (כדי שקישורים יחסיים יעבדו)
    if (path === '/masechet')    return Response.redirect(url.origin + '/masechet/', 301);
    if (path === '/masechet/v2') return Response.redirect(url.origin + '/masechet/v2/', 301);

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
