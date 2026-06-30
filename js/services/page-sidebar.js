/**
 * Page Sidebar — Floating help button + slide-in panel
 *
 * Self-contained IIFE that:
 * 1. Fetches page-specific sidebar content from the admin API
 * 2. Creates a floating button on the right side (like the quote/affiliate tab)
 * 3. Opens a slide-in panel with rich HTML content when clicked
 *
 * Include this script on any page via <script src="/js/services/page-sidebar.js"></script>
 */
(function () {
  'use strict';

  var API_BASE = 'https://admin.wordsthatsells.website/api/public';

  function init() {
    var pagePath = window.location.pathname;
    // Normalize: remove trailing slash, .html extension
    if (pagePath.endsWith('.html')) pagePath = pagePath.slice(0, -5);
    if (pagePath.length > 1 && pagePath.endsWith('/')) pagePath = pagePath.slice(0, -1);

    fetch(API_BASE + '/page-sidebar?path=' + encodeURIComponent(pagePath))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (panels) {
        if (!Array.isArray(panels) || panels.length === 0) return;
        // Use first matching panel
        var panel = panels[0];
        injectStyles();
        buildHelpButton(panel);
        // The slide-in panel is built for the "panel" (HTML) and "form" actions;
        // the "link" and "modal" actions navigate / open the shared quote modal.
        var act = panel.action_type || 'panel';
        if (act === 'panel' || act === 'form') {
          buildHelpPanel(panel);
        }
      })
      .catch(function (err) {
        // Silently fail — no sidebar configured for this page
      });
  }

  // ── Inject CSS (only if not already loaded via main.css) ────

  function injectStyles() {
    if (document.getElementById('page-sidebar-styles')) return;

    var style = document.createElement('style');
    style.id = 'page-sidebar-styles';
    style.textContent =
      /* Prevent horizontal overflow from the rotated tab on standalone pages */
      'html{overflow-x:hidden;}' +

      /* Floating button — rotated vertical tab on right edge */
      '.help-tab{position:fixed;top:28%;right:0;transform:translateY(-50%) rotate(270deg);transform-origin:bottom right;' +
      'background-color:#d62b83;color:#fff;padding:10px 20px;border-top-left-radius:8px;border-top-right-radius:8px;' +
      'cursor:pointer;z-index:999;font-weight:bold;transition:background-color .3s,opacity .3s,transform .3s;' +
      'opacity:0;transform:translateY(-50%) rotate(270deg) translateX(20px);pointer-events:none;' +
      'display:flex;align-items:center;gap:6px;font-size:.9rem;border:none;font-family:inherit;}' +
      '.help-tab.show{opacity:1;transform:translateY(-50%) rotate(270deg) translateX(0);pointer-events:auto;}' +
      '.help-tab:hover{background-color:#f90784;}' +
      '.help-tab i{font-size:1rem;}' +

      /* Overlay */
      '#help-sidebar-overlay{position:fixed;inset:0;background:rgba(18,42,63,.6);z-index:1999;' +
      'opacity:0;visibility:hidden;transition:opacity .4s,visibility .4s;}' +
      '#help-sidebar-overlay.is-open{opacity:1;visibility:visible;}' +

      /* Panel */
      '#help-sidebar-panel{position:fixed;top:0;right:0;width:75%;max-width:700px;height:100%;' +
      'background:#fff;z-index:2000;transform:translateX(100%);transition:transform .4s ease-in-out;' +
      'box-shadow:-10px 0 30px rgba(0,0,0,.2);display:flex;flex-direction:column;}' +
      '#help-sidebar-panel.is-open{transform:translateX(0);}' +

      /* Header */
      '.help-sidebar-header{padding:1rem 1.5rem;border-bottom:1px solid #e2e8f0;display:flex;' +
      'justify-content:space-between;align-items:center;background:linear-gradient(135deg,#d62b83 0%,#b01f6b 100%);color:#fff;}' +
      '.help-sidebar-header h3{font-size:1.2rem;margin:0;display:flex;align-items:center;gap:8px;}' +
      '.help-sidebar-close{font-size:1.5rem;color:rgba(255,255,255,.8);background:none;border:none;cursor:pointer;padding:4px;line-height:1;}' +
      '.help-sidebar-close:hover{color:#fff;}' +

      /* Body */
      '.help-sidebar-body{padding:1.5rem;overflow-y:auto;flex-grow:1;line-height:1.7;font-size:.95rem;}' +
      '.help-sidebar-body h2{font-size:1.3rem;margin:1rem 0 .5rem;color:#1a1a2e;}' +
      '.help-sidebar-body h3{font-size:1.1rem;margin:.8rem 0 .4rem;color:#1a1a2e;}' +
      '.help-sidebar-body h4{font-size:1rem;margin:.6rem 0 .3rem;color:#334155;}' +
      '.help-sidebar-body ul,.help-sidebar-body ol{padding-left:1.5rem;margin:.5rem 0;}' +
      '.help-sidebar-body li{margin-bottom:.3rem;}' +
      '.help-sidebar-body img{max-width:100%;border-radius:8px;margin:.75rem 0;}' +
      '.help-sidebar-body a{color:#d62b83;text-decoration:underline;}' +
      '.help-sidebar-body p{margin-bottom:.75rem;}' +

      /* Linked form (action_type "form") */
      '.help-form-subtitle{color:#475569;margin-bottom:1rem;}' +
      '.help-form-row{margin-bottom:.85rem;display:flex;flex-direction:column;gap:.3rem;}' +
      '.help-form-label{font-size:.85rem;font-weight:600;color:#334155;}' +
      '.help-form-field{width:100%;padding:.6rem .75rem;border:1px solid #cbd5e1;border-radius:8px;' +
      'font-size:.95rem;font-family:inherit;background:#fff;color:#1a1a2e;box-sizing:border-box;}' +
      '.help-form-field:focus{outline:none;border-color:#d62b83;box-shadow:0 0 0 3px rgba(214,43,131,.15);}' +
      'textarea.help-form-field{resize:vertical;min-height:90px;}' +
      '.help-form-submit{margin-top:.5rem;width:100%;background:#d62b83;color:#fff;border:none;' +
      'padding:.75rem 1rem;border-radius:8px;font-weight:700;font-size:.95rem;cursor:pointer;' +
      'display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:background-color .3s;}' +
      '.help-form-submit:hover{background:#f90784;}' +
      '.help-form-submit:disabled{opacity:.7;cursor:default;}' +
      '.help-form-success{text-align:center;padding:2rem 1rem;}' +
      '.help-form-success i{font-size:3rem;color:#10b981;margin-bottom:1rem;display:block;}' +
      '.help-form-success h2{margin-bottom:.5rem;}' +
      '.help-form-loading{color:#94a3b8;}' +

      /* Mobile */
      '@media(max-width:767px){#help-sidebar-panel{width:100%;max-width:none;}' +
      '.help-sidebar-header{padding:.75rem 1rem;}.help-sidebar-body{padding:1rem;}}' +

      /* No scroll when panel open */
      'body.no-scroll{overflow:hidden;}';

    document.head.appendChild(style);
  }

  // ── Build floating button ──────────────────────────────────

  function buildHelpButton(panel) {
    var btn = document.createElement('button');
    btn.className = 'help-tab';
    btn.id = 'help-sidebar-btn';
    btn.innerHTML = '<i class="' + esc(panel.icon_class || 'fas fa-question-circle') + '"></i> ' + esc(panel.button_label || 'Help');
    document.body.appendChild(btn);

    // Show after scroll (same pattern as the quote-tab)
    var shown = false;
    function checkScroll() {
      if (window.scrollY > 200 && !shown) {
        shown = true;
        btn.classList.add('show');
      }
    }
    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    // Also show after a short delay even if user hasn't scrolled
    setTimeout(function () {
      if (!shown) { shown = true; btn.classList.add('show'); }
    }, 1500);

    btn.addEventListener('click', function () {
      var action = panel.action_type || 'panel';
      if (action === 'link' && panel.url) {
        if (panel.open_in_new_tab) {
          window.open(panel.url, '_blank', 'noopener');
        } else {
          window.location.href = panel.url;
        }
        return;
      }
      if (action === 'modal') {
        // Open the shared quote/contact modal (rendered by js/modules/firebase.js).
        if (window.WTSQuote && typeof window.WTSQuote.open === 'function') {
          window.WTSQuote.open(panel.target_form_type || '', {});
        } else if (panel.url) {
          window.location.href = panel.url;
        }
        return;
      }
      openHelpPanel();
    });
  }

  // ── Build slide-in panel ──────────────────────────────────

  function buildHelpPanel(panel) {
    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'help-sidebar-overlay';
    document.body.appendChild(overlay);

    // Panel
    var isForm = (panel.action_type || 'panel') === 'form' && panel.target_form_type;
    var bodyHtml = isForm
      ? '<p class="help-form-loading">Loading form…</p>'
      : (panel.content_html || '<p>No content available.</p>');

    var panelEl = document.createElement('div');
    panelEl.id = 'help-sidebar-panel';
    panelEl.innerHTML =
      '<div class="help-sidebar-header">' +
        '<h3><i class="' + esc(panel.icon_class || 'fas fa-question-circle') + '"></i> ' + esc(panel.label) + '</h3>' +
        '<button class="help-sidebar-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="help-sidebar-body">' +
        bodyHtml +
      '</div>';
    document.body.appendChild(panelEl);

    // For the "form" action, fetch the admin-built form template and render it
    // (with submission) directly into the panel body.
    if (isForm) {
      loadFormIntoPanel(panel.target_form_type, panelEl.querySelector('.help-sidebar-body'));
    }

    // Close handlers
    panelEl.querySelector('.help-sidebar-close').addEventListener('click', closeHelpPanel);
    overlay.addEventListener('click', closeHelpPanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panelEl.classList.contains('is-open')) {
        closeHelpPanel();
      }
    });
  }

  // ── Linked form rendering (action_type 'form') ─────────────

  function loadFormIntoPanel(formType, bodyEl) {
    if (!bodyEl) return;
    fetch(API_BASE + '/form-template/' + encodeURIComponent(formType))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (tpl) {
        if (!tpl || !Array.isArray(tpl.fields) || tpl.fields.length === 0) {
          throw new Error('empty template');
        }
        renderForm(tpl, bodyEl);
      })
      .catch(function () {
        bodyEl.innerHTML = '<p>Sorry, this form is unavailable right now.</p>';
      });
  }

  function renderForm(tpl, bodyEl) {
    bodyEl.innerHTML = '';

    if (tpl.subtitle) {
      var sub = document.createElement('p');
      sub.className = 'help-form-subtitle';
      sub.textContent = tpl.subtitle;
      bodyEl.appendChild(sub);
    }

    var form = document.createElement('form');
    form.className = 'help-form';
    form.setAttribute('novalidate', '');

    (tpl.fields || []).forEach(function (field) {
      var el;
      if (field.type === 'textarea') {
        el = document.createElement('textarea');
        el.rows = 4;
      } else if (field.type === 'select') {
        el = document.createElement('select');
        var def = document.createElement('option');
        def.value = '';
        def.textContent = field.placeholder || 'Select…';
        el.appendChild(def);
        (field.options || []).forEach(function (opt) {
          var o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          el.appendChild(o);
        });
      } else {
        el = document.createElement('input');
        el.type = field.type || 'text';
      }
      el.name = field.name;
      el.className = 'help-form-field';
      if (field.placeholder && field.type !== 'select') el.placeholder = field.placeholder;
      if (field.required) el.required = true;

      var row = document.createElement('div');
      row.className = 'help-form-row';
      if (field.label) {
        var lbl = document.createElement('label');
        lbl.className = 'help-form-label';
        lbl.textContent = field.label + (field.required ? ' *' : '');
        row.appendChild(lbl);
      }
      row.appendChild(el);
      form.appendChild(row);
    });

    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'help-form-submit';
    submit.innerHTML = '<i class="fas fa-paper-plane"></i> ' + esc(tpl.submit_button_text || 'Submit');
    form.appendChild(submit);

    bodyEl.appendChild(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(tpl, form, submit, bodyEl);
    });
  }

  function submitForm(tpl, form, submitBtn, bodyEl) {
    var fd = new FormData(form);
    var known = ['name', 'email', 'company', 'phone', 'message'];
    var data = {};
    var metadata = {};
    fd.forEach(function (value, key) {
      var val = (value || '').toString().trim();
      if (!val) return;
      if (known.indexOf(key) !== -1) { data[key] = val; } else { metadata[key] = val; }
    });

    if (!data.name || !data.email) {
      window.alert('Please fill in the required fields.');
      return;
    }

    var payload = {
      form_type: tpl.form_type,
      name: data.name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      message: data.message,
      metadata: Object.keys(metadata).length ? metadata : undefined
    };

    var original = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';

    fetch(API_BASE + '/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'Submission failed.');
        });
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'form_submit', { event_category: 'Forms', event_label: tpl.form_type });
        }
        bodyEl.innerHTML =
          '<div class="help-form-success">' +
            '<i class="fas fa-check-circle"></i>' +
            '<h2>Thank You!</h2>' +
            '<p>' + esc(tpl.success_message || 'Your request has been submitted.') + '</p>' +
          '</div>';
      })
      .catch(function (err) {
        window.alert(err.message || 'There was an error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = original;
      });
  }

  function openHelpPanel() {
    var overlay = document.getElementById('help-sidebar-overlay');
    var panel = document.getElementById('help-sidebar-panel');
    if (overlay) overlay.classList.add('is-open');
    if (panel) panel.classList.add('is-open');
    document.body.classList.add('no-scroll');
  }

  function closeHelpPanel() {
    var overlay = document.getElementById('help-sidebar-overlay');
    var panel = document.getElementById('help-sidebar-panel');
    if (overlay) overlay.classList.remove('is-open');
    if (panel) panel.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
  }

  // ── Helpers ────────────────────────────────────────────────

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  // ── Boot ───────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
