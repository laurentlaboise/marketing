// AI Guide — floating help drawer for the admin back-office.
//
// Loaded by partials/footer.ejs only for signed-in staff with the Help AI
// feature on. Talks to the same-origin proxy POST /api/help-ai (CSP blocks
// direct calls to the Odysseus host by design); main.js's fetch wrapper
// attaches the CSRF token. Transcript is kept in sessionStorage so it
// survives page navigation within the tab.
(function () {
  'use strict';

  var root = document.getElementById('helpAiRoot');
  if (!root) return;
  var ENDPOINT = root.getAttribute('data-endpoint') || '/api/help-ai';
  var STORE_KEY = 'wtsHelpAiTranscript';
  var MAX_STORED = 30;

  // ── styles (styleSrc allows inline <style>; scriptSrc does not need a
  //    nonce here because this file is served from /js/ under 'self') ──
  var css = [
    '#helpAiBtn{position:fixed;right:20px;bottom:20px;z-index:1200;width:52px;height:52px;border-radius:50%;',
    'border:none;cursor:pointer;background:var(--secondary,#d62b83);color:#fff;font-size:1.25rem;',
    'box-shadow:var(--shadow-lg,0 10px 15px -3px rgba(0,0,0,.2));display:flex;align-items:center;justify-content:center;}',
    '#helpAiBtn:hover{filter:brightness(1.08);}',
    '@media (max-width:767px){#helpAiBtn{bottom:84px;}}', // clear the mobile bottom dock
    '#helpAiPanel{position:fixed;right:20px;bottom:84px;z-index:1201;width:min(380px,calc(100vw - 32px));',
    'height:min(560px,calc(100vh - 120px));background:#fff;border:1px solid var(--gray-200,#e2e8f0);border-radius:14px;',
    'box-shadow:var(--shadow-xl,0 20px 25px -5px rgba(0,0,0,.25));display:none;flex-direction:column;overflow:hidden;}',
    '@media (max-width:767px){#helpAiPanel{bottom:148px;}}',
    '#helpAiPanel.open{display:flex;}',
    '.help-ai-head{display:flex;align-items:center;gap:.5rem;padding:.7rem .9rem;border-bottom:1px solid var(--gray-200,#e2e8f0);}',
    '.help-ai-head strong{flex:1;font-size:.95rem;color:var(--gray-900,#111827);}',
    '.help-ai-head button{background:none;border:none;cursor:pointer;color:var(--gray-500,#6b7280);font-size:1rem;padding:.25rem;}',
    '.help-ai-msgs{flex:1;overflow-y:auto;padding:.8rem;display:flex;flex-direction:column;gap:.55rem;}',
    '.help-ai-msg{max-width:88%;border-radius:12px;padding:.5rem .75rem;font-size:.85rem;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}',
    '.help-ai-msg.user{align-self:flex-end;background:var(--secondary,#d62b83);color:#fff;border-bottom-right-radius:4px;}',
    '.help-ai-msg.bot{align-self:flex-start;background:var(--gray-100,#f3f4f6);color:var(--gray-900,#111827);border-bottom-left-radius:4px;}',
    '.help-ai-msg.bot.thinking{color:var(--gray-400,#9ca3af);font-style:italic;}',
    '.help-ai-hello{color:var(--gray-500,#6b7280);font-size:.83rem;text-align:center;padding:1rem .75rem;line-height:1.55;}',
    '.help-ai-compose{border-top:1px solid var(--gray-200,#e2e8f0);padding:.6rem;display:flex;gap:.5rem;}',
    '.help-ai-compose textarea{flex:1;border:1px solid var(--gray-300,#d1d5db);border-radius:9px;padding:.5rem .65rem;',
    'font-family:inherit;font-size:.85rem;resize:none;min-height:44px;line-height:1.4;}',
    '.help-ai-compose button{background:var(--secondary,#d62b83);border:none;color:#fff;border-radius:9px;padding:0 .95rem;',
    'font-size:.85rem;font-weight:600;cursor:pointer;font-family:inherit;}',
    '.help-ai-compose button:disabled{opacity:.5;cursor:default;}'
  ].join('');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── DOM ──
  var btn = document.createElement('button');
  btn.id = 'helpAiBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open AI Guide');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<i class="fas fa-circle-question" aria-hidden="true"></i>';

  var panel = document.createElement('section');
  panel.id = 'helpAiPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI Guide');
  panel.innerHTML =
    '<div class="help-ai-head">' +
    '  <strong><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i> AI Guide</strong>' +
    '  <button type="button" id="helpAiClear" title="Clear conversation" aria-label="Clear conversation"><i class="fas fa-broom" aria-hidden="true"></i></button>' +
    '  <button type="button" id="helpAiClose" aria-label="Close AI Guide"><i class="fas fa-times" aria-hidden="true"></i></button>' +
    '</div>' +
    '<div class="help-ai-msgs" id="helpAiMsgs"></div>' +
    '<form class="help-ai-compose" id="helpAiForm">' +
    '  <textarea id="helpAiInput" maxlength="2000" rows="1" placeholder="Ask how to do something on this screen…" aria-label="Your question"></textarea>' +
    '  <button type="submit" id="helpAiSend">Send</button>' +
    '</form>';

  root.appendChild(btn);
  root.appendChild(panel);

  var msgs = panel.querySelector('#helpAiMsgs');
  var form = panel.querySelector('#helpAiForm');
  var input = panel.querySelector('#helpAiInput');
  var send = panel.querySelector('#helpAiSend');

  // ── transcript persistence (per browser tab) ──
  function loadTranscript() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveTranscript(list) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX_STORED))); } catch (e) { /* storage full/blocked */ }
  }
  var transcript = loadTranscript();

  function hello() {
    var d = document.createElement('div');
    d.className = 'help-ai-hello';
    d.id = 'helpAiHello';
    d.textContent = 'Hi! I can explain how the admin screens work — try "How do I publish a verified translation?" or "Why does my footer change not show?"';
    msgs.appendChild(d);
  }
  function bubble(role, text) {
    var h = document.getElementById('helpAiHello');
    if (h) h.remove();
    var d = document.createElement('div');
    d.className = 'help-ai-msg ' + role;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function renderTranscript() {
    msgs.textContent = '';
    if (!transcript.length) { hello(); return; }
    transcript.forEach(function (m) { bubble(m.role === 'user' ? 'user' : 'bot', m.content); });
  }
  renderTranscript();

  // ── open/close ──
  function setOpen(open) {
    panel.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) { input.focus(); msgs.scrollTop = msgs.scrollHeight; }
  }
  btn.addEventListener('click', function () { setOpen(!panel.classList.contains('open')); });
  panel.querySelector('#helpAiClose').addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
  });
  panel.querySelector('#helpAiClear').addEventListener('click', function () {
    transcript = [];
    saveTranscript(transcript);
    renderTranscript();
    input.focus();
  });

  // ── send ──
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || send.disabled) return;
    bubble('user', text);
    transcript.push({ role: 'user', content: text });
    saveTranscript(transcript);
    input.value = '';
    send.disabled = true;
    var pending = bubble('bot', 'Thinking…');
    pending.className += ' thinking';
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ message: text, pagePath: window.location.pathname })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        var reply = res.ok && res.d.reply
          ? res.d.reply
          : (res.d && res.d.error) || 'Something went wrong — please try again.';
        pending.className = 'help-ai-msg bot';
        pending.textContent = reply;
        if (res.ok && res.d.reply) {
          transcript.push({ role: 'assistant', content: res.d.reply });
          saveTranscript(transcript);
        }
      })
      .catch(function () {
        pending.className = 'help-ai-msg bot';
        pending.textContent = 'Could not reach the AI Guide. Check your connection and try again.';
      })
      .then(function () {
        send.disabled = false;
        msgs.scrollTop = msgs.scrollHeight;
        input.focus();
      });
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
})();
