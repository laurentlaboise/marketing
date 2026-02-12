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
        buildHelpPanel(panel);
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
      /* Floating button — desktop: rotated vertical tab on right edge */
      '.help-tab{position:fixed;top:28%;right:0;transform:translateY(-50%) rotate(270deg);transform-origin:bottom right;' +
      'background-color:#d62b83;color:#fff;padding:10px 20px;border-top-left-radius:8px;border-top-right-radius:8px;' +
      'cursor:pointer;z-index:999;font-weight:bold;transition:background-color .3s,opacity .3s,transform .3s;' +
      'opacity:0;transform:translateY(-50%) rotate(270deg) translateX(20px);pointer-events:none;' +
      'display:flex;align-items:center;gap:6px;font-size:.9rem;border:none;font-family:inherit;}' +
      '.help-tab.show{opacity:1;transform:translateY(-50%) rotate(270deg) translateX(0);pointer-events:auto;}' +
      '.help-tab:hover{background-color:#f90784;}' +
      '.help-tab i{font-size:1rem;}' +
      '.help-tab .help-tab-label{}' +

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

      /* Mobile — convert rotated tab to bottom-right pill button */
      '@media(max-width:767px){' +
        '.help-tab{top:auto;bottom:80px;right:16px;' +
        'transform:none !important;transform-origin:center;' +
        'border-radius:50px;padding:12px 18px;font-size:.85rem;' +
        'box-shadow:0 4px 15px rgba(214,43,131,.4);}' +
        '.help-tab.show{transform:none !important;}' +
        '.help-tab .help-tab-label{display:none;}' +
        '.help-tab i{font-size:1.2rem;margin:0;}' +
        '#help-sidebar-panel{width:100%;max-width:none;}' +
        '.help-sidebar-header{padding:.75rem 1rem;}' +
        '.help-sidebar-body{padding:1rem;}' +
      '}' +

      /* No scroll when panel open */
      'body.no-scroll{overflow:hidden;}';

    document.head.appendChild(style);
  }

  // ── Build floating button ──────────────────────────────────

  function buildHelpButton(panel) {
    var btn = document.createElement('button');
    btn.className = 'help-tab';
    btn.id = 'help-sidebar-btn';
    btn.innerHTML = '<i class="' + esc(panel.icon_class || 'fas fa-question-circle') + '"></i> <span class="help-tab-label">' + esc(panel.button_label || 'Help') + '</span>';
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

    btn.addEventListener('click', openHelpPanel);
  }

  // ── Build slide-in panel ──────────────────────────────────

  function buildHelpPanel(panel) {
    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'help-sidebar-overlay';
    document.body.appendChild(overlay);

    // Panel
    var panelEl = document.createElement('div');
    panelEl.id = 'help-sidebar-panel';
    panelEl.innerHTML =
      '<div class="help-sidebar-header">' +
        '<h3><i class="' + esc(panel.icon_class || 'fas fa-question-circle') + '"></i> ' + esc(panel.label) + '</h3>' +
        '<button class="help-sidebar-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="help-sidebar-body">' +
        (panel.content_html || '<p>No content available.</p>') +
      '</div>';
    document.body.appendChild(panelEl);

    // Close handlers
    panelEl.querySelector('.help-sidebar-close').addEventListener('click', closeHelpPanel);
    overlay.addEventListener('click', closeHelpPanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panelEl.classList.contains('is-open')) {
        closeHelpPanel();
      }
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
