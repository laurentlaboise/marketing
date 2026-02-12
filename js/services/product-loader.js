/**
 * Product Loader — Fetches products from the WTS Admin API
 * and renders them into service-grid sections on each service page.
 *
 * How it works:
 * 1. Finds .service-grid[data-service-page] on the page
 * 2. Fetches active products for that service_page from the admin API
 * 3. Renders product cards into the grid (static fallback if API is down)
 * 4. Generates detail content for the slide-in panel
 * 5. Handles Learn More → slide-in open/close
 * 6. Handles "+ Add to My Services" toggle in the panel
 */
(function () {
  'use strict';

  var API_BASE = 'https://admin.wordsthatsells.website/api/public';
  var SAVED_SERVICES_KEY = 'wts_saved_services';

  // ── Slide-in DOM references (set once) ─────────────────────
  var elPanel, elOverlay, elTitle, elImage, elContent, elCloseBtn;

  function cacheSlideInElements() {
    elPanel    = document.getElementById('details-slide-in');
    elOverlay  = document.getElementById('details-overlay');
    elTitle    = document.getElementById('slide-in-title');
    elImage    = document.getElementById('slide-in-image');
    elContent  = document.getElementById('slide-in-content');
    elCloseBtn = document.getElementById('slide-in-close');
  }

  // ── Initializer ──────────────────────────────────────────────

  function init() {
    cacheSlideInElements();
    bindCloseHandlers();

    var grid = document.querySelector('.service-grid[data-service-page]');
    if (!grid) return;

    var servicePage = grid.getAttribute('data-service-page');
    if (!servicePage) return;

    console.log('[ProductLoader] Initializing for service_page="' + servicePage + '"');
    loadProducts(servicePage, grid);
  }

  // ── Load products from admin API ─────────────────────────────

  function loadProducts(servicePage, grid) {
    var url = API_BASE + '/products?service_page=' + encodeURIComponent(servicePage);
    console.log('[ProductLoader] Fetching: ' + url);

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (products) {
        console.log('[ProductLoader] Received ' + products.length + ' product(s)');

        if (!Array.isArray(products) || products.length === 0) {
          console.log('[ProductLoader] No products from API — keeping static cards');
          return;
        }

        renderCards(products, grid);
        storeDetailData(products);
        bindLearnMoreButtons();
      })
      .catch(function (err) {
        console.warn('[ProductLoader] API error — keeping static cards:', err.message);
      });
  }

  // ── Render product cards ─────────────────────────────────────

  function renderCards(products, container) {
    container.innerHTML = '';

    products.forEach(function (product, i) {
      var delay = i > 0 ? ' reveal-delay-' + Math.min(i, 8) : '';
      var icon = esc(product.icon_class || 'fas fa-box');
      var anim = esc(product.animation_class || 'kinetic-pulse-float');
      var slug = product.slug || product.id;

      var priceHTML = '';
      if (product.price) {
        priceHTML =
          '<span class="product-price" style="display:block;margin:0.5rem 0;font-weight:600;color:var(--accent-color,#d62b83);">$' +
          product.price.toFixed(2) + ' ' + esc(product.currency || 'USD') +
          '</span>';
      }

      var card = document.createElement('div');
      card.className = 'service-card reveal' + delay;
      card.innerHTML =
        '<div class="icon ' + anim + '"><i class="' + icon + '"></i></div>' +
        '<h3 class="service-title">' + esc(product.name) + '</h3>' +
        '<p class="service-description">' + esc(product.description || '') + '</p>' +
        priceHTML +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-top:auto;">' +
          '<button class="btn btn-premium btn-learn-more" data-service="' + esc(slug) + '">Learn More</button>' +
        '</div>';

      container.appendChild(card);
    });

    triggerRevealAnimations(container);
  }

  // ── Store product detail data for the slide-in panel ─────────
  // Instead of injecting hidden DOM, we keep a simple JS map and
  // build the panel HTML on-the-fly when the user clicks Learn More.

  var detailMap = {};

  function storeDetailData(products) {
    products.forEach(function (product) {
      var slug = product.slug || product.id;
      var si = product.slide_in || {};

      detailMap[slug] = {
        id: product.id,
        name: product.name,
        title: si.title || product.name,
        subtitle: si.subtitle || '',
        content: si.content || '',
        image: si.image || product.image_url || '',
        video: si.video || '',
        features: product.features || [],
        price: product.price ? parseFloat(product.price) : null,
        currency: product.currency || 'USD',
        has_stripe: product.has_stripe
      };
    });
  }

  // ── Bind "Learn More" buttons ────────────────────────────────

  function bindLearnMoreButtons() {
    var btns = document.querySelectorAll('.btn-learn-more[data-service]');
    for (var i = 0; i < btns.length; i++) {
      // Remove any stale listeners by cloning
      var btn = btns[i];
      var fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', onLearnMore);
    }
  }

  function onLearnMore(e) {
    e.preventDefault();
    var key = this.getAttribute('data-service');
    var data = detailMap[key];
    if (!data || !elPanel) return;

    // Build panel content
    var html = '';

    if (data.subtitle) {
      html += '<p style="font-size:1.1rem;color:var(--color-slate-500,#64748b);margin-bottom:1.5rem;">' + esc(data.subtitle) + '</p>';
    }

    if (data.video) {
      html += '<div style="margin-bottom:1.5rem;">' +
        '<iframe width="100%" height="400" src="' + esc(data.video) + '" title="' + esc(data.title) +
        '" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" ' +
        'allowfullscreen style="border-radius:var(--border-radius-lg,12px);"></iframe></div>';
    }

    if (data.content) {
      html += '<div class="feature-content" style="line-height:1.7;">' + data.content + '</div>';
    }

    if (data.features.length) {
      html += '<div style="margin-top:1.5rem;"><h3 style="font-size:1.1rem;font-weight:600;margin-bottom:0.75rem;">Features</h3><ul style="padding-left:1.2rem;">';
      data.features.forEach(function (f) { html += '<li style="margin-bottom:0.4rem;">' + esc(f) + '</li>'; });
      html += '</ul></div>';
    }

    // Price + Add to My Services
    html += '<div style="text-align:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--color-border,#e2e8f0);">';
    if (data.price) {
      html += '<p style="font-size:1.3rem;font-weight:700;color:var(--accent-color,#d62b83);margin-bottom:1rem;">$' +
        data.price.toFixed(2) + ' ' + esc(data.currency) + '</p>';
    }
    html += '<button class="btn btn-accent-magenta btn-add-service" data-product-id="' + esc(String(data.id)) +
      '" data-product-name="' + esc(data.name) + '" style="font-size:1.1rem;padding:0.8rem 2rem;">' +
      (isSaved(data.id) ? '<i class="fas fa-check"></i> Added to My Services' : '<i class="fas fa-plus"></i> Add to My Services') +
      '</button></div>';

    // Set panel content
    if (elTitle) elTitle.textContent = data.title;
    if (elImage) {
      if (data.image) {
        var safeUrl = sanitizeUrl(data.image);
        if (safeUrl) {
          elImage.src = safeUrl;
          elImage.alt = data.title;
          elImage.style.display = '';
        } else {
          elImage.style.display = 'none';
        }
      } else {
        elImage.style.display = 'none';
      }
    }
    if (elContent) elContent.innerHTML = html;

    // Open panel — use is-open to match slide-in.css
    document.body.classList.add('no-scroll');
    elPanel.classList.add('is-open');
    if (elOverlay) elOverlay.classList.add('is-open');

    // Bind the add-service button inside the panel
    bindAddServiceButtons();
  }

  // ── Close panel handlers ─────────────────────────────────────

  function closePanel() {
    if (!elPanel) return;
    document.body.classList.remove('no-scroll');
    elPanel.classList.remove('is-open');
    if (elOverlay) elOverlay.classList.remove('is-open');
  }

  function bindCloseHandlers() {
    if (elCloseBtn) {
      elCloseBtn.addEventListener('click', closePanel);
    }
    if (elOverlay) {
      elOverlay.addEventListener('click', function (e) {
        if (e.target === elOverlay) closePanel();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && elPanel && elPanel.classList.contains('is-open')) {
        closePanel();
      }
    });
  }

  // ── Bind "+ Service" buttons to add-to-profile ─────────────

  function bindAddServiceButtons() {
    var btns = document.querySelectorAll('.btn-add-service[data-product-id]');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.bound) continue;
      btns[i].dataset.bound = '1';
      btns[i].addEventListener('click', onAddService);
    }
  }

  function onAddService(e) {
    e.preventDefault();
    e.stopPropagation();

    var btn = this;
    var productId = btn.getAttribute('data-product-id');
    var productName = btn.getAttribute('data-product-name') || '';

    if (isSaved(productId)) {
      removeService(productId);
      btn.innerHTML = '<i class="fas fa-plus"></i> Add to My Services';
      console.log('[ProductLoader] Removed service:', productName);
    } else {
      saveService(productId, productName);
      btn.innerHTML = '<i class="fas fa-check"></i> Added to My Services';
      console.log('[ProductLoader] Added service:', productName);
    }
  }

  // ── Saved-services helpers (localStorage until backend ready) ──

  function getSavedServices() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_SERVICES_KEY)) || {};
    } catch (_) { return {}; }
  }

  function isSaved(productId) {
    return !!getSavedServices()[String(productId)];
  }

  function saveService(productId, productName) {
    var saved = getSavedServices();
    saved[String(productId)] = { name: productName, added_at: new Date().toISOString() };
    localStorage.setItem(SAVED_SERVICES_KEY, JSON.stringify(saved));
  }

  function removeService(productId) {
    var saved = getSavedServices();
    delete saved[String(productId)];
    localStorage.setItem(SAVED_SERVICES_KEY, JSON.stringify(saved));
  }

  // ── Sidebar loader ───────────────────────────────────────────

  function loadSidebar() {
    var el = document.querySelector('[data-sidebar-section]');
    if (!el) return;

    var section = el.getAttribute('data-sidebar-section');

    fetch(API_BASE + '/sidebar?section=' + encodeURIComponent(section))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (items) {
        if (!Array.isArray(items) || items.length === 0) return;

        var html = items.map(function (item) {
          var target = item.open_in_new_tab ? ' target="_blank" rel="noopener noreferrer"' : '';
          var cls = item.css_class ? ' ' + esc(item.css_class) : '';
          return '<li class="sidebar-item' + cls + '"><a href="' + esc(item.url || '#') + '"' +
            target + '><i class="' + esc(item.icon_class || 'fas fa-link') + '"></i> ' +
            esc(item.label) + '</a></li>';
        }).join('');

        el.innerHTML = '<ul class="sidebar-list">' + html + '</ul>';
      })
      .catch(function (err) {
        console.warn('[ProductLoader] Sidebar API error:', err.message);
      });
  }

  // ── Helpers ──────────────────────────────────────────────────

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  function sanitizeUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s) return null;
    var low = s.toLowerCase();
    if (low.indexOf('javascript:') === 0 || low.indexOf('data:') === 0 || low.indexOf('vbscript:') === 0) return null;
    try {
      var u = new URL(s, window.location.origin);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    } catch (e) { /* invalid */ }
    return null;
  }

  function triggerRevealAnimations(container) {
    if (!('IntersectionObserver' in window)) {
      var els = container.querySelectorAll('.reveal');
      for (var j = 0; j < els.length; j++) els[j].classList.add('visible');
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    var cards = container.querySelectorAll('.reveal');
    for (var j = 0; j < cards.length; j++) observer.observe(cards[j]);
  }

  // ── Form Buttons Loader ─────────────────────────────────────
  // Fetches form buttons from the admin API and renders them into
  // .form-buttons-section[data-buttons-page] containers, filtered
  // by the current page URL path.

  function loadFormButtons() {
    var section = document.querySelector('.form-buttons-section[data-buttons-page]');
    if (!section) return;

    var pagePath = section.getAttribute('data-buttons-page');
    if (!pagePath) return;

    var url = API_BASE + '/form-buttons';
    console.log('[ProductLoader] Fetching form buttons: ' + url);

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var buttons = data.buttons || [];
        console.log('[ProductLoader] Received ' + buttons.length + ' form button(s)');

        // Filter buttons matching this page URL
        var matched = buttons.filter(function (btn) {
          if (!btn.page_url) return false;
          var p = btn.page_url;
          if (p === pagePath) return true;
          // Trailing-slash tolerance
          if (p.endsWith('/') && p.slice(0, -1) === pagePath) return true;
          if (pagePath.endsWith('/') && pagePath.slice(0, -1) === p) return true;
          // Wildcard: /en/digital-marketing-services/* matches all sub-pages
          if (p.endsWith('/*')) {
            var prefix = p.slice(0, -1);
            return pagePath.startsWith(prefix);
          }
          return false;
        });

        if (matched.length === 0) {
          console.log('[ProductLoader] No form buttons matched for ' + pagePath);
          return;
        }

        renderFormButtons(matched, section);
      })
      .catch(function (err) {
        console.warn('[ProductLoader] Form buttons API error:', err.message);
      });
  }

  function renderFormButtons(buttons, container) {
    var html = '<div class="form-buttons-wrapper reveal" style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin-top:2rem;padding:1.5rem 0;">';

    buttons.forEach(function (btn) {
      var label = esc(btn.button_label || 'Submit');
      var preset = btn.style_preset || 'primary';
      var cssClass = 'btn btn-form-' + esc(preset);
      var customStyle = btn.custom_css ? ' style="' + esc(btn.custom_css) + '"' : '';

      // Build rel attribute
      var relParts = [];
      if (btn.rel_nofollow) relParts.push('nofollow');
      if (btn.rel_noopener) relParts.push('noopener');
      if (btn.rel_noreferrer) relParts.push('noreferrer');
      var relAttr = relParts.length ? ' rel="' + relParts.join(' ') + '"' : '';

      var targetAttr = btn.target_blank ? ' target="_blank"' : '';

      // Custom JS as onclick
      var onclickAttr = '';
      if (btn.custom_js) {
        onclickAttr = ' onclick="' + esc(btn.custom_js) + '"';
      }

      // Render as a button that triggers the form modal with the appropriate form_type
      html += '<button type="button" class="' + cssClass + '" data-form-type="' + esc(btn.form_type) + '"' +
        customStyle + relAttr + targetAttr + onclickAttr + '>' +
        label + '</button>';
    });

    html += '</div>';
    container.innerHTML = html;

    // Bind form-button click → open quote modal with matching form_type
    var formBtns = container.querySelectorAll('[data-form-type]');
    for (var i = 0; i < formBtns.length; i++) {
      formBtns[i].addEventListener('click', onFormButtonClick);
    }

    triggerRevealAnimations(container);
  }

  function onFormButtonClick(e) {
    e.preventDefault();
    var formType = this.getAttribute('data-form-type');

    // Try to open the existing quote modal
    var overlay = document.getElementById('quote-modal-overlay');
    if (overlay) {
      overlay.classList.add('active');
      document.body.classList.add('no-scroll');
    }

    // If the modal has a hidden form_type field, set it
    var hiddenField = document.querySelector('#quote-form input[name="form_type"]');
    if (hiddenField) {
      hiddenField.value = formType;
    }

    console.log('[ProductLoader] Form button clicked, form_type=' + formType);
  }

  // ── Boot ─────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      loadSidebar();
      loadFormButtons();
    });
  } else {
    init();
    loadSidebar();
    loadFormButtons();
  }

})();
