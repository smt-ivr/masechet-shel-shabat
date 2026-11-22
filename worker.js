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
import v2Session from './v2/session.js';
import v2MessagesUi from './v2/messages-ui.js';
import v2LoginCss from './v2/login.css';
import v2SettingsManager from './v2/settings-manager.js';

// ----- API של האתר -----
import { handleApi } from './api/router.js';
import { hasPagePermission } from './api/auth.js';
import { ensureSchema } from './api/schema.js';
import { getConfig } from './api/settings.js';
import { getPaths } from './api/yemot-paths.js';
import adminPage from './api/admin.html';

// ----- כרטיס נדרים: שלוחות ימות המשיח -----
import { handleWebhook } from './nedarim-card/webhook.js';
import { handleBalance } from './nedarim-card/card-balance.js';
import { handleDetails } from './nedarim-card/personal-area.js';

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
  '/masechet/session.js':           [v2Session,          JS],
  '/masechet/messages-ui.js':       [v2MessagesUi,       JS],
  '/masechet/login.css':            [v2LoginCss,         CSS],
  '/masechet/settings-manager.js':  [v2SettingsManager,  JS],

  // ---- האתר הישן: מוגש תחת /masechet/old/ ----
  '/masechet/old/':            [oldIndex,   HTML],
  '/masechet/old/index.html':  [oldIndex,   HTML],
  '/masechet/old/smt.html':    [oldSmtHtml, HTML],
  '/masechet/old/smt.png':     [oldSmtPng,  PNG],
  '/masechet/old/favicon.ico': [oldFavicon, ICO],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const redirect = (to) => Response.redirect(url.origin + to, 301);

    // API של האתר (כניסה, ניהול, ופניות לימות / נדרים דרך השרת)
    if (path.startsWith('/masechet/api/')) {
      return handleApi(request, env, path.slice('/masechet/api/'.length));
    }
    if (path === '/masechet/admin' || path === '/masechet/admin/') {
      return new Response(adminPage, {
        headers: { 'Content-Type': HTML, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      });
    }

    // כרטיס נדרים – שלוחות ימות המשיח
    const NC = '/masechet/nedarim-card/';
    if (path === NC + 'webhook')       return handleWebhook(request, env); // רישום לנדרים פלוס
    if (path === NC + 'personal-area') return handleDetails(request);      // אזור אישי לפי ת"ז
    if (path === NC + 'card-balance')  return handleBalance(request);      // יתרה לפי מספר כרטיס

    // נרמול נתיבים ללא "/" בסוף (כדי שקישורים יחסיים יעבדו)
    if (path === '/masechet')     return redirect('/masechet/');
    if (path === '/masechet/old') return redirect('/masechet/old/');

    // תאימות לאחור: קישורים ישנים ל-/masechet/v2/... → האתר החדש ב-/masechet/...
    if (path === '/masechet/v2' || path === '/masechet/v2/') return redirect('/masechet/');
    if (path.startsWith('/masechet/v2/')) {
      return redirect('/masechet/' + path.slice('/masechet/v2/'.length));
    }

    // האתר הישן – רק למשתמש מחובר עם ההרשאה "אתר ישן" (הכניסה דרך האתר החדש)
    if (path.startsWith('/masechet/old/') && ROUTES[path]) {
      await ensureSchema(env);
      if (!(await hasPagePermission(request, env, 'old_site'))) return Response.redirect(url.origin + '/masechet/', 302);
    }

    const hit = ROUTES[path];
    // האתר הישן: הכתובות בימות (ברירות המחדל שלו) נלקחות מהגדרות הניהול
    if (hit && hit[0] === oldIndex) {
      const p = getPaths((await getConfig(env)).yemot_paths);
      const q = (v) => `'ivr2:/${String(v).replace(/'/g, "\\'")}'`;
      const html = oldIndex
        .replace(/const DEFAULT_YMGR_PATH = '[^']*';/, `const DEFAULT_YMGR_PATH = ${q(p.exam_folder + '/ExaminationLogOK.ymgr')};`)
        .replace(/const DEFAULT_BROWSE_PATH = '[^']*';/, `const DEFAULT_BROWSE_PATH = ${q(p.archive_folder)};`)
        .replace(/const DEFAULT_POINTS_REPORT_PATH = '[^']*';/, `const DEFAULT_POINTS_REPORT_PATH = ${q(p.points_report)};`)
        // הודעות מהמנהל גם באתר הישן (כפתור צף)
        .replace(/<\/body>/i, '<script src="/masechet/messages-ui.js"></script><script>MsMessages.init({ site: "old", floating: true });</script></body>');
      return new Response(html, { status: 200, headers: { 'Content-Type': HTML, 'Cache-Control': 'no-store' } });
    }
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
