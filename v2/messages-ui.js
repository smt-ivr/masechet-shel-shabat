// ============================================================
//  messages-ui.js — הודעות מהמנהל (משותף לאתר החדש ולאתר הישן)
//  • הודעה חשובה קופצת; "קראתי" נפתח אחרי ההשהיה שהמנהל קבע (ספירה לאחור)
//  • הודעה רגילה חדשה – הודעה קטנה בפינה
//  • רשימת הודעות עם התשובות, ואפשרות לענות
//  • השרת רושם "נמסרה" ברגע שההודעה נשלחת למשתמש, ו"נקראה" כשמאשרים
//  העיצוב כאן חל רק על חלונות ההודעות (קידומת msm-) – לא על האתר
// ============================================================
(function () {
  if (window.MsMessages) return;
  const API = '/masechet/api/';
  let site = 'new';
  let messages = [];
  let badgeEl = null;
  let floatingBtn = null;
  const popupShown = new Set();
  const toastShown = new Set();

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);

  async function call(method, path, body) {
    const res = await fetch(API + path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!data || !data.ok) throw new Error(data && data.error ? data.error.message : 'שגיאת תקשורת');
    return data.data;
  }

  function injectStyle() {
    if ($('msm-style')) return;
    const css = `
      .msm, .msm * { box-sizing: border-box; font-family: 'Rubik', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; }
      .msm { direction: rtl; text-align: right; color: #1d2433; }
      .msm-overlay { position: fixed; inset: 0; z-index: 9600; background: rgba(3,27,79,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
      .msm-card { background: #fff; border-radius: 12px; width: min(540px, 100%); max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 70px rgba(0,0,0,.3); overflow: hidden; }
      .msm-head { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-weight: 700; font-size: 1.1rem; }
      .msm-head.imp { background: #fff3cd; color: #856404; border-bottom: 1px solid #ffeeba; }
      .msm-head.reg { background: #031b4f; color: #fff; }
      .msm-x { background: none; border: none; color: inherit; font-size: 1.2rem; cursor: pointer; padding: 0 4px; }
      .msm-body { padding: 16px 18px; overflow: auto; }
      .msm-text { white-space: pre-line; line-height: 1.7; font-size: 1rem; }
      .msm-meta { color: #6c757d; font-size: .82rem; margin-top: 6px; }
      .msm-foot { padding: 12px 18px; border-top: 1px solid #e9ecef; background: #f8f9fb; display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
      .msm-btn { border: 1px solid #031b4f; background: #031b4f; color: #fff; border-radius: 6px; padding: 8px 18px; font-size: .95rem; cursor: pointer; }
      .msm-btn.sec { background: #fff; color: #031b4f; }
      .msm-btn:disabled { opacity: .55; cursor: not-allowed; }
      .msm-reply { display: flex; gap: 6px; margin-top: 10px; }
      .msm-reply textarea { flex: 1; min-height: 38px; max-height: 120px; resize: vertical; padding: 8px 10px; border: 1px solid #ced4da; border-radius: 6px; font-size: .95rem; }
      .msm-thread { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
      .msm-bubble { padding: 7px 11px; border-radius: 10px; font-size: .92rem; white-space: pre-line; max-width: 90%; }
      .msm-bubble.user { background: #fff7e6; align-self: flex-start; }
      .msm-bubble.admin { background: #eef2f8; align-self: flex-end; }
      .msm-bubble small { display: block; color: #6c757d; font-size: .75rem; margin-bottom: 2px; }
      .msm-item { border: 1px solid #e0e2e8; border-radius: 8px; margin-bottom: 8px; background: #fff; }
      .msm-item.unread { background: #f4f8ff; border-color: #c6d8fb; }
      .msm-item summary { cursor: pointer; padding: 10px 12px; display: flex; justify-content: space-between; gap: 10px; align-items: center; list-style: none; }
      .msm-item summary::-webkit-details-marker { display: none; }
      .msm-item.unread summary b { font-weight: 700; }
      .msm-item .msm-inner { padding: 0 12px 12px; }
      .msm-toast { position: fixed; top: 84px; left: 16px; z-index: 9550; width: min(360px, calc(100% - 32px)); background: #fff; border: 1px solid #e0e2e8; border-right: 4px solid #031b4f; border-radius: 8px; padding: 12px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.14); display: flex; gap: 10px; align-items: flex-start; }
      .msm-float { position: fixed; bottom: 18px; left: 18px; z-index: 9500; width: 52px; height: 52px; border-radius: 50%; border: none; background: #031b4f; color: #fff; font-size: 1.3rem; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
      .msm-badge { position: absolute; top: -6px; left: -6px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 10px; background: #dc3545; color: #fff; font-size: 11px; font-weight: 700; line-height: 19px; text-align: center; }
      .msm-empty { color: #6c757d; text-align: center; padding: 20px; }`;
    const st = document.createElement('style');
    st.id = 'msm-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function threadHtml(m) {
    if (!m.replies || !m.replies.length) return '';
    return `<div class="msm-thread">${m.replies.map((r) => `
      <div class="msm-bubble ${r.sender === 'admin' ? 'admin' : 'user'}">
        <small>${r.sender === 'admin' ? 'מנהל' + (r.author ? ': ' + esc(r.author) : '') : 'אני'} · ${esc(r.created_at)}</small>${esc(r.body)}
      </div>`).join('')}</div>`;
  }

  function replyBox(m) {
    return `<div class="msm-reply"><textarea data-reply-for="${m.id}" placeholder="כתבו תשובה…" maxlength="2000"></textarea>
      <button type="button" class="msm-btn sec" data-send-reply="${m.id}">↩ שלח</button></div>`;
  }

  // כפתור "קראתי" עם ספירה לאחור לפי ההשהיה שהמנהל קבע
  function readButton(m, onDone) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msm-btn';
    let left = Math.max(0, parseInt(m.read_delay, 10) || 0);
    const paint = () => {
      btn.disabled = left > 0;
      btn.innerHTML = left > 0 ? `⏱ קראתי (${left})` : '✓ קראתי';
    };
    paint();
    if (left > 0) {
      const t = setInterval(() => { left--; paint(); if (left <= 0) clearInterval(t); }, 1000);
    }
    btn.onclick = async () => { btn.disabled = true; await markRead(m.id); onDone && onDone(); };
    return btn;
  }

  async function markRead(id) {
    try { await call('POST', `messages/${id}/read`); } catch (e) { /* ננסה שוב */ }
    await load(true);
  }

  async function sendReply(id, textarea, btn) {
    const body = textarea.value.trim();
    if (!body) { textarea.focus(); return; }
    btn.disabled = true;
    try {
      await call('POST', `messages/${id}/reply`, { body });
      textarea.value = '';
      await load(true);
      if ($('msm-list')) renderList(id);
      // התשובה מופיעה מיד גם בחלון הקופץ
      const m = messages.find((x) => x.id === id);
      document.querySelectorAll(`.msm-overlay[data-msg-id="${id}"] .msm-thread-wrap`).forEach((w) => { if (m) w.innerHTML = threadHtml(m); });
    } catch (e) { alert(e.message); }
    btn.disabled = false;
  }

  function bindReplies(root) {
    root.querySelectorAll('[data-send-reply]').forEach((b) => {
      b.onclick = () => sendReply(Number(b.dataset.sendReply), root.querySelector(`[data-reply-for="${b.dataset.sendReply}"]`), b);
    });
  }

  // ===== הודעה חשובה – קופצת =====
  function showImportant(m) {
    popupShown.add(m.id);
    const ov = document.createElement('div');
    ov.className = 'msm msm-overlay';
    ov.dataset.msgId = String(m.id);
    ov.setAttribute('role', 'alertdialog');
    ov.innerHTML = `
      <div class="msm-card">
        <div class="msm-head imp"><span>⚠ ${esc(m.title)}</span></div>
        <div class="msm-body">
          <div class="msm-text">${esc(m.body)}</div>
          <div class="msm-meta">${esc(m.created_by_name || '')} · ${esc(m.created_at)}</div>
          <div class="msm-thread-wrap">${threadHtml(m)}</div>
          ${replyBox(m)}
        </div>
        <div class="msm-foot"><span class="msm-meta" style="margin:0">יש לאשר שקראתם את ההודעה</span><span class="msm-read"></span></div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('.msm-read').appendChild(readButton(m, () => ov.remove()));
    bindReplies(ov);
  }

  // ===== הודעה רגילה חדשה – בפינה =====
  function showToast(list) {
    list.forEach((m) => toastShown.add(m.id));
    let t = $('msm-toast');
    if (!t) { t = document.createElement('div'); t.id = 'msm-toast'; t.className = 'msm msm-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    const m = list[0];
    t.innerHTML = `
      <span style="color:#031b4f; font-size:1.2rem; line-height:1">✉</span>
      <div style="flex:1; min-width:0">
        <b>${list.length > 1 ? `${list.length} הודעות חדשות` : 'הודעה חדשה'}</b>
        <div style="font-size:.9rem; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${esc(m.title)}</div>
        <button type="button" class="msm-btn" style="margin-top:8px; padding:5px 14px; font-size:.85rem" id="msm-toast-open">הצג</button>
      </div>
      <button type="button" class="msm-x" style="color:#6c757d; font-size:1rem" id="msm-toast-x" aria-label="סגירה">✕</button>`;
    t.style.display = 'flex';
    $('msm-toast-x').onclick = () => { t.style.display = 'none'; };
    $('msm-toast-open').onclick = () => { t.style.display = 'none'; openList(m.id); };
  }

  // ===== רשימת ההודעות =====
  function openList(focusId) {
    const t = $('msm-toast'); if (t) t.style.display = 'none';
    let ov = $('msm-list');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'msm-list';
      ov.className = 'msm msm-overlay';
      ov.innerHTML = `<div class="msm-card" style="width:min(620px,100%)">
        <div class="msm-head reg"><span>✉ הודעות</span><button type="button" class="msm-x" aria-label="סגירה">✕</button></div>
        <div class="msm-body" id="msm-list-body"></div></div>`;
      document.body.appendChild(ov);
      ov.querySelector('.msm-x').onclick = () => ov.remove();
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    }
    renderList(focusId);
  }

  function renderList(focusId) {
    const body = $('msm-list-body');
    if (!body) return;
    const openIds = new Set([...body.querySelectorAll('details[open]')].map((d) => d.dataset.id));
    if (focusId) openIds.add(String(focusId));
    if (!messages.length) { body.innerHTML = '<div class="msm-empty">אין הודעות</div>'; return; }
    body.innerHTML = messages.map((m) => `
      <details class="msm-item ${m.read_at ? '' : 'unread'}" data-id="${m.id}" ${openIds.has(String(m.id)) ? 'open' : ''}>
        <summary><b>${m.important ? '<span style="color:#dc3545">⚠</span> ' : ''}${esc(m.title)}</b>
          <span class="msm-meta" style="margin:0; white-space:nowrap">${esc(m.created_at)}</span></summary>
        <div class="msm-inner">
          <div class="msm-text">${esc(m.body)}</div>
          <div class="msm-meta">${esc(m.created_by_name || '')}${m.read_at ? ' · נקראה ' + esc(m.read_at) : ''}</div>
          ${threadHtml(m)}
          ${replyBox(m)}
          ${!m.read_at && m.read_delay > 0 ? '<div class="msm-read-slot" style="margin-top:10px"></div>' : ''}
        </div>
      </details>`).join('');
    bindReplies(body);
    body.querySelectorAll('details').forEach((d) => {
      const m = messages.find((x) => String(x.id) === d.dataset.id);
      if (!m || m.read_at) return;
      const handle = () => {
        if (!d.open) return;
        if (m.read_delay > 0) {
          const slot = d.querySelector('.msm-read-slot');
          if (slot && !slot.firstChild) slot.appendChild(readButton(m));
        } else {
          markRead(m.id); // פתיחה = קריאה
        }
      };
      d.addEventListener('toggle', handle);
      if (d.open) handle();
    });
  }

  function paintBadge(n) {
    const txt = n > 9 ? '9+' : String(n);
    if (badgeEl) { badgeEl.textContent = txt; badgeEl.style.display = n ? '' : 'none'; }
    if (floatingBtn) {
      const b = floatingBtn.querySelector('.msm-badge');
      b.textContent = txt; b.style.display = n ? '' : 'none';
    }
  }

  let loading = false;
  let lastSig = '';
  async function load(force) {
    if (loading && force !== true) return;
    loading = true;
    let r;
    try { r = await call('GET', `messages?site=${site}`); } catch (e) { return; } finally { loading = false; }
    // רק אם משהו השתנה – כדי לא להפריע למי שכותב תשובה
    const sig = JSON.stringify([r.unread, (r.messages || []).map((m) => [m.id, m.read_at, m.title, m.body, m.important, m.read_delay, (m.replies || []).length])]);
    if (sig === lastSig && force !== true) return;
    lastSig = sig;
    messages = r.messages || [];
    paintBadge(r.unread || 0);
    const imp = messages.find((m) => m.important && !m.read_at && !popupShown.has(m.id));
    if (imp) showImportant(imp);
    const fresh = messages.filter((m) => !m.important && !m.read_at && m.is_new && !toastShown.has(m.id));
    if (fresh.length) showToast(fresh);
    renderList();
    if (window.MsMessages.onChange) window.MsMessages.onChange(messages, r.unread || 0);
  }

  window.MsMessages = {
    // opts: { site: 'new'|'old', badge: אלמנט למספר שלא נקראו, floating: כפתור צף (לאתר הישן) }
    init(opts = {}) {
      site = opts.site === 'old' ? 'old' : 'new';
      badgeEl = opts.badge || null;
      injectStyle();
      if (opts.floating) {
        floatingBtn = document.createElement('button');
        floatingBtn.type = 'button';
        floatingBtn.className = 'msm msm-float';
        floatingBtn.title = 'הודעות';
        floatingBtn.innerHTML = '✉<span class="msm-badge" style="display:none"></span>';
        floatingBtn.onclick = () => openList();
        document.body.appendChild(floatingBtn);
      }
      load(true);
      // הודעות חדשות נבדקות כל 5 שניות, רק כשהדף פתוח לפני המשתמש
      setInterval(() => { if (!document.hidden) load(); }, 5000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    },
    open: openList,
    messages: () => messages,
    reload: () => load(true),
  };
})();
