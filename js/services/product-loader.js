/**
 * Product Loader — Fetches products from the WTS Admin API
 * and renders them into service-grid sections on each service page.
 *
 * How it works:
 * 1. Finds .service-grid[data-service-page] on the page
 * 2. Fetches active products for that service_page from the admin API
 * 3. If products exist → replaces static cards with dynamic ones
 * 4. If API is down or empty → keeps the original static cards as fallback
 * 5. Generates slide-in detail panels for each product
 * 6. Wires up "Buy Now" buttons to Stripe checkout
 */
(function () {
  'use strict';

  var API_BASE = 'https://admin.wordsthatsells.website/api/public';
  var PAYMENTS_BASE = 'https://admin.wordsthatsells.website/api/payments';

  // ── Initializer ──────────────────────────────────────────────

  function init() {
    var grid = document.querySelector('.service-grid[data-service-page]');
    if (!grid) return;

    var servicePage = grid.getAttribute('data-service-page');
    if (!servicePage) return;

    console.log('[ProductLoader] Initializing for service_page="' + servicePage + '"');
    loadProducts(servicePage, grid);
  }

  // ── Load products from admin API ─────────────────────────────

  function loadProducts(servicePage, grid) {
    // Preserve the original static HTML so we can restore it on failure
    var staticHTML = grid.innerHTML;

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

        // API returned products — render them
        renderCards(products, grid);
        renderDetailStorage(products);
        bindLearnMoreButtons();
        bindBuyButtons();
      })
      .catch(function (err) {
        console.warn('[ProductLoader] API error — keeping static cards:', err.message);
        // If the grid was somehow cleared, restore it
        if (!grid.innerHTML.trim()) {
          grid.innerHTML = staticHTML;
        }
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

      var buyHTML = '';
      if (product.has_stripe && product.price) {
        buyHTML =
          '<button class="btn btn-accent-magenta btn-buy-now" data-product-id="' +
          esc(String(product.id)) + '" style="margin-left:0.5rem;">Buy Now</button>';
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
          buyHTML +
        '</div>';

      container.appendChild(card);
    });

    // Trigger reveal animations for newly added cards
    triggerRevealAnimations(container);
  }

  // ── Render hidden detail-storage divs for the slide-in panel ─

  function renderDetailStorage(products) {
    var storage = document.querySelector('.service-details-storage');
    if (!storage) {
      storage = document.createElement('div');
      storage.className = 'service-details-storage';
      storage.style.display = 'none';
      document.body.appendChild(storage);
    }

    // Remove previously-generated dynamic entries (keep hand-coded static ones)
    var old = storage.querySelectorAll('[data-dynamic]');
    for (var k = 0; k < old.length; k++) old[k].remove();

    products.forEach(function (product) {
      var slug = product.slug || product.id;
      var detailId = 'details-' + slug;

      // Don't overwrite a hand-coded static entry
      if (document.getElementById(detailId)) return;

      var si = product.slide_in || {};
      var title = si.title || product.name;
      var imgUrl = si.image || product.image_url ||
        'https://placehold.co/800x400/667eea/ffffff?text=' + encodeURIComponent(product.name);

      var inner = '';

      if (si.subtitle) {
        inner += '<p class="service-description" style="font-size:var(--font-size-lg);">' + esc(si.subtitle) + '</p>';
      }
      if (si.video) {
        inner +=
          '<div class="feature-visual" style="margin-bottom:var(--spacing-2xl);">' +
          '<iframe width="100%" height="400" src="' + esc(si.video) + '" title="' + esc(title) +
          '" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" ' +
          'allowfullscreen style="border-radius:var(--border-radius-lg);"></iframe></div>';
      }
      if (si.content) {
        inner += '<div class="feature-content">' + si.content + '</div>';
      }
      if (product.features && product.features.length) {
        inner +=
          '<div class="feature-content" style="margin-top:var(--spacing-xl);">' +
          '<h3 class="service-title">Features</h3><ul>' +
          product.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') +
          '</ul></div>';
      }
      if (product.has_stripe && product.price) {
        inner +=
          '<div style="margin-top:2rem;text-align:center;">' +
          '<button class="btn btn-accent-magenta btn-buy-now" data-product-id="' + esc(String(product.id)) +
          '" style="font-size:1.1rem;padding:0.8rem 2rem;">Purchase — $' +
          product.price.toFixed(2) + ' ' + esc(product.currency || 'USD') + '</button></div>';
      }

      var div = document.createElement('div');
      div.id = detailId;
      div.setAttribute('data-dynamic', 'true');
      div.setAttribute('data-title', title);
      div.setAttribute('data-img', imgUrl);
      div.innerHTML =
        '<section class="service-section section-alt"><div class="container"><div class="section-header">' +
        '<center><div class="heading-accent-line"></div></center>' +
        '<h2>' + esc(title) + '</h2>' + inner +
        '</div></div></section>';

      storage.appendChild(div);
    });
  }

  // ── Bind "Learn More" buttons to the slide-in panel ──────────

  function bindLearnMoreButtons() {
    var btns = document.querySelectorAll('.btn-learn-more[data-service]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', onLearnMore);
    }
  }

  function onLearnMore() {
    var key = this.getAttribute('data-service');
    var detail = document.getElementById('details-' + key);
    if (!detail) return;

    var title = detail.getAttribute('data-title') || 'Service Details';
    var rawImg = detail.getAttribute('data-img') || '';
    var content = detail.innerHTML;

    var elTitle   = document.getElementById('slide-in-title');
    var elImage   = document.getElementById('slide-in-image');
    var elContent = document.getElementById('slide-in-content');
    var elPanel   = document.getElementById('details-slide-in');
    var elOverlay = document.getElementById('details-overlay');

    if (elTitle)   elTitle.textContent = title;
    if (elImage) {
      var safeUrl = sanitizeUrl(rawImg);
      if (safeUrl) { elImage.src = safeUrl; } else { elImage.removeAttribute('src'); }
      elImage.alt = title;
    }
    if (elContent) elContent.innerHTML = content;
    if (elPanel)   elPanel.classList.add('active');
    if (elOverlay) elOverlay.classList.add('active');

    // Re-bind buy buttons that may now be inside the panel
    bindBuyButtons();
  }

  // ── Bind "Buy Now" buttons to Stripe checkout ────────────────

  function bindBuyButtons() {
    var btns = document.querySelectorAll('.btn-buy-now[data-product-id]');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.bound) continue;
      btns[i].dataset.bound = '1';
      btns[i].addEventListener('click', onBuyNow);
    }
  }

  function onBuyNow(e) {
    e.preventDefault();
    e.stopPropagation();

    var btn = this;
    var productId = btn.getAttribute('data-product-id');
    var originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';

    fetch(PAYMENTS_BASE + '/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'No checkout URL returned');
        }
      })
      .catch(function (err) {
        console.error('[ProductLoader] Checkout error:', err);
        alert('Unable to process payment. Please try again later.');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      });
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
        console.warn('[ProductLoader] Sidebar API error — keeping static sidebar:', err.message);
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
      // Fallback: just reveal everything immediately
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

  // ── Boot ─────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      loadSidebar();
    });
  } else {
    init();
    loadSidebar();
  }

})();
