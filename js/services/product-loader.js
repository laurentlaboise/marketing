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
  var PORTAL_URL = 'https://admin.wordsthatsells.website/portal';
  var SAVED_SERVICES_KEY = 'wts_saved_services';

  // Portal session state: signed-in customers get the full buy/save CTAs;
  // visitors get Request a Quote plus a sign-in unlock. Resolved once at
  // load via a credentialed same-site fetch.
  var customerState = { signedIn: false, email: null };
  // Signed-in customers' saved services live on the server; this mirrors
  // them (product_id → true) for instant isSaved() checks.
  var serverSaved = {};

  function checkCustomerSession() {
    return fetch(API_BASE + '/portal-me', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var wasSignedIn = customerState.signedIn;
        if (d && d.signed_in) {
          customerState.signedIn = true;
          customerState.email = d.email || null;
        }
        if (customerState.signedIn && !wasSignedIn) {
          loadMyServices();
          // Unlock the buy buttons in an already-open panel (e.g. the
          // customer signed in from the emailed link and switched back).
          refreshOpenPanel();
        }
        renderAccountPill();
      })
      .catch(function () { renderAccountPill(); });
  }

  // Re-check the session whenever the tab comes back into focus so signing
  // in (which happens in another tab via the magic link) unlocks this one.
  function watchSessionChanges() {
    var recheck = function () {
      if (!customerState.signedIn && document.visibilityState === 'visible') checkCustomerSession();
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
  }

  function loadMyServices() {
    fetch(API_BASE + '/my-services', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        serverSaved = {};
        ((d && d.services) || []).forEach(function (s) { serverSaved[String(s.product_id)] = true; });
        migrateLocalSaved();
      })
      .catch(function () { /* keep whatever we had */ });
  }

  // One-time migration: services saved to localStorage before the account
  // existed move onto the account, then the local copy is cleared.
  function migrateLocalSaved() {
    var local = getSavedServices();
    var ids = Object.keys(local);
    if (!ids.length) return;
    ids.forEach(function (id) {
      if (serverSaved[id]) return;
      fetch(API_BASE + '/my-services', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: id, billing_period: (local[id] && local[id].billing_period) || null })
      }).then(function (r) { if (r.ok) serverSaved[id] = true; }).catch(function () {});
    });
    try { localStorage.removeItem(SAVED_SERVICES_KEY); } catch (_) {}
  }

  // Floating account pill on service pages: "Sign in" for visitors (opens
  // the email + password sign-in modal), "My account" once signed in.
  function renderAccountPill() {
    var pill = document.getElementById('wts-account-pill');
    if (!pill) {
      if (!document.querySelector('.service-grid[data-service-page]')) return;
      pill = document.createElement('div');
      pill.id = 'wts-account-pill';
      pill.style.cssText = 'position:fixed;bottom:1.1rem;left:1.1rem;z-index:9000;';
      document.body.appendChild(pill);
    }
    var pillStyle = 'display:inline-flex;align-items:center;gap:0.45rem;background:#fff;border:1px solid #e2e8f0;box-shadow:0 4px 14px rgba(15,23,42,0.15);border-radius:999px;padding:0.5rem 1.05rem;font-size:0.85rem;font-weight:600;color:#334155;font-family:inherit;';
    if (customerState.signedIn) {
      pill.innerHTML = '<a href="' + PORTAL_URL + '" rel="noopener" style="' + pillStyle + 'text-decoration:none;">' +
        '<i class="fas fa-circle-check" style="color:#16a34a;"></i> My account</a>';
    } else {
      pill.innerHTML = '<button type="button" style="' + pillStyle + 'cursor:pointer;">' +
        '<i class="fas fa-user" style="color:var(--accent-color,#d62b83);"></i> Sign in</button>';
      pill.firstChild.addEventListener('click', function () { openLoginModal(); });
    }
  }

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
    checkCustomerSession();
    watchSessionChanges();

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

  // ── Pricing helpers ──────────────────────────────────────────

  function fmtMoney(amount, currency) {
    if (amount === null || amount === undefined || isNaN(amount)) return '';
    return Number(amount).toFixed(2) + ' ' + esc(currency || 'USD');
  }

  // Normalize a product into a pricing object. Falls back to the legacy
  // single-price shape when the API hasn't supplied a `pricing` block.
  function getPricing(product) {
    if (product.pricing && typeof product.pricing === 'object') {
      if (product.pricing.unit == null) product.pricing.unit = product.price_unit || 'fixed';
      return product.pricing;
    }
    return {
      type: 'one_time',
      currency: product.currency || 'USD',
      one_time_price: product.price != null ? parseFloat(product.price) : null,
      monthly_price: null,
      yearly_price: null,
      default_billing: 'monthly',
      allow_billing_toggle: false,
      annual_savings: null,
      annual_discount_pct: null,
      setup_fee: null,
      setup_fee_label: null,
      unit: product.price_unit || 'fixed'
    };
  }

  // Compact price line shown on the service card.
  function cardPriceHTML(product) {
    var pr = getPricing(product);
    var style = 'display:block;margin:0.5rem 0;font-weight:600;color:var(--accent-color,#d62b83);';

    if (pr.type === 'subscription') {
      var useYearly = pr.default_billing === 'yearly' && pr.yearly_price != null;
      var amount, suffix;
      if (useYearly) {
        amount = pr.yearly_price; suffix = '/year';
      } else if (pr.monthly_price != null) {
        amount = pr.monthly_price; suffix = '/month';
      } else if (pr.yearly_price != null) {
        amount = pr.yearly_price; suffix = '/year';
      } else {
        return '';
      }
      var hasFee = pr.setup_fee != null && pr.setup_fee > 0;
      var html;
      if (hasFee) {
        // Lead with the all-in first payment so the customer sees the real
        // total, then break it into subscription + one-time fee.
        html = '<span class="product-price" style="' + style + '">' + fmtMoney(amount + pr.setup_fee, pr.currency) +
          '<span style="font-size:0.7em;font-weight:500;color:var(--color-slate-500,#64748b);white-space:nowrap;"> first payment</span></span>' +
          '<span class="product-setup-fee" style="display:block;font-size:0.78rem;color:var(--color-slate-500,#64748b);">' +
          fmtMoney(amount, pr.currency) + suffix + ' + ' + fmtMoney(pr.setup_fee, pr.currency) + ' ' +
          esc(pr.setup_fee_label || 'setup fee') + ' <em style="font-style:normal;white-space:nowrap;">(one-time)</em></span>' +
          '<span style="display:block;font-size:0.78rem;color:var(--color-slate-500,#64748b);">then ' +
          fmtMoney(amount, pr.currency) + suffix + '</span>';
      } else {
        html = '<span class="product-price" style="' + style + '">' + fmtMoney(amount, pr.currency) +
          '<span style="font-size:0.85em;font-weight:500;color:var(--color-slate-500,#64748b);">' + suffix + '</span></span>';
      }
      if (pr.annual_discount_pct) {
        html += '<span class="product-savings" style="display:block;font-size:0.8rem;color:#16a34a;font-weight:600;">Save ' +
          pr.annual_discount_pct + '% yearly</span>';
      }
      return html;
    }

    if (pr.type === 'tiered' && Array.isArray(pr.tiers) && pr.tiers.length) {
      var from = pr.from_unit_price != null ? pr.from_unit_price
        : Math.min.apply(null, pr.tiers.map(function (t) { return t.unit_price; }));
      return '<span class="product-price" style="' + style + '">From ' + fmtMoney(from, pr.currency) +
        '<span style="font-size:0.85em;font-weight:500;color:var(--color-slate-500,#64748b);">/unit</span></span>' +
        '<span style="display:block;font-size:0.8rem;color:#16a34a;font-weight:600;">Buy more, save more</span>';
    }

    if (pr.one_time_price != null) {
      return '<span class="product-price" style="' + style + '">' + fmtMoney(pr.one_time_price, pr.currency) +
        (pr.unit && pr.unit !== 'fixed' ? '<span style="font-size:0.85em;font-weight:500;color:var(--color-slate-500,#64748b);">' + esc(unitSuffix(pr.unit)) + '</span>' : '') +
        '</span>';
    }
    return '';
  }

  // Compact checkmark list of the product's features for the service card.
  // The admin enters these in the "Appearance (Service Card)" section; show
  // up to four with a "+N more" hint pointing at the Learn More panel.
  function cardFeaturesHTML(product) {
    var feats = (Array.isArray(product.features) ? product.features : [])
      .filter(function (f) { return f && String(f).trim(); });
    if (!feats.length) return '';

    var html = '<ul class="product-features" style="list-style:none;padding:0;margin:0.25rem auto 0.5rem;max-width:280px;text-align:left;font-size:0.88rem;color:var(--color-slate-700,#334155);">';
    feats.slice(0, 4).forEach(function (f) {
      html += '<li style="display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.35rem;">' +
        '<i class="fas fa-check" style="color:#16a34a;margin-top:0.25em;flex:none;font-size:0.8em;"></i>' +
        '<span>' + esc(f) + '</span></li>';
    });
    if (feats.length > 4) {
      html += '<li style="color:var(--color-slate-500,#64748b);font-size:0.82rem;padding-left:1.35rem;">+ ' +
        (feats.length - 4) + ' more</li>';
    }
    return html + '</ul>';
  }

  // ── Render product cards ─────────────────────────────────────

  function renderCards(products, container) {
    container.innerHTML = '';

    products.forEach(function (product, i) {
      var delay = i > 0 ? ' reveal-delay-' + Math.min(i, 8) : '';
      var icon = esc(product.icon_class || 'fas fa-box');
      var anim = esc(product.animation_class || 'kinetic-pulse-float');
      var slug = product.slug || product.id;

      var priceHTML = cardPriceHTML(product);
      var featuresHTML = cardFeaturesHTML(product);

      var card = document.createElement('div');
      card.className = 'service-card reveal' + delay;
      // Stable anchor so a product-targeted button (or a deep link) can scroll
      // to this exact card.
      card.id = 'wts-product-' + slug;
      card.setAttribute('data-product-slug', slug);
      card.innerHTML =
        '<div class="icon ' + anim + '"><i class="' + icon + '"></i></div>' +
        '<h3 class="service-title">' + esc(product.name) + '</h3>' +
        '<p class="service-description">' + esc(product.description || '') + '</p>' +
        featuresHTML +
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
        slug: slug,
        name: product.name,
        title: si.title || product.name,
        subtitle: si.subtitle || '',
        content: si.content || '',
        image: si.image || product.image_url || '',
        video: si.video || '',
        features: product.features || [],
        price: product.price ? parseFloat(product.price) : null,
        currency: product.currency || 'USD',
        pricing: getPricing(product),
        purchase_mode: product.purchase_mode || 'consult',
        cta_form_type: product.cta_form_type || null,
        stripe_payment_link: product.stripe_payment_link || null,
        has_stripe: product.has_stripe,
        bcel: (product.bcel && product.bcel.qr_url) ? product.bcel : null
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
    renderDetail(this.getAttribute('data-service'));
  }

  // Rebuild the open panel in place (used when the sign-in state flips so
  // the CTA stack unlocks without the customer refreshing).
  var currentDetailKey = null;
  function refreshOpenPanel() {
    if (elPanel && elPanel.classList.contains('is-open') && currentDetailKey) {
      renderDetail(currentDetailKey);
    }
  }

  function renderDetail(key) {
    var data = detailMap[key];
    if (!data || !elPanel) return;
    currentDetailKey = key;

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

    // Price + billing selector + Add to My Services
    html += buildPricingBlock(data);

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

    // Bind the purchase-mode CTA (Request a Quote / Buy Now)
    bindCtaButtons();

    // Bind the monthly/yearly billing toggle (subscriptions only)
    bindBillingToggle(data);

    // Bind the quantity selector + live total (tiered pricing only)
    bindQuantitySelector(data);

    // Bind named price options (one product, multiple SKUs/prices)
    bindPriceOptions(data);

    // Share service (everyone, signed-in or not)
    bindShareButtons();
  }

  function bindPriceOptions(data) {
    if (!elContent) return;
    var pr = data.pricing || getPricing(data);
    if (pr.type !== 'options' || !pr.options || !pr.options.length) return;
    var block = elContent.querySelector('.product-pricing-block');
    if (!block) return;
    var radios = block.querySelectorAll('.price-option-radio');
    var dynTitle = block.querySelector('.opt-dyn-title');
    var dynDesc = block.querySelector('.opt-dyn-desc');
    var dynPrice = block.querySelector('.opt-dyn-price');
    var byKey = {};
    pr.options.forEach(function (o) { byKey[o.key] = o; });

    function apply(key, radioEl) {
      var opt = byKey[key] || pr.options[0];
      if (!opt) return;
      if (dynTitle) dynTitle.textContent = opt.label;
      if (dynDesc) {
        dynDesc.textContent = opt.description || (opt.strategy ? opt.strategy.replace(/_/g, ' ') : '');
      }
      if (dynPrice) dynPrice.innerHTML = fmtMoney(opt.price, pr.currency);
      var ctas = block.querySelectorAll('.product-cta');
      for (var i = 0; i < ctas.length; i++) {
        ctas[i].setAttribute('data-option-key', opt.key);
      }
      // Highlight selected card
      var labels = block.querySelectorAll('.price-option-label');
      for (var L = 0; L < labels.length; L++) {
        var inp = labels[L].querySelector('.price-option-radio');
        var on = inp && inp.checked;
        labels[L].style.borderColor = on ? '#e11d74' : '#e2e8f0';
        labels[L].style.boxShadow = on ? '0 0 0 3px rgba(225,29,116,0.12)' : 'none';
      }
    }

    for (var r = 0; r < radios.length; r++) {
      radios[r].addEventListener('change', function () {
        if (this.checked) apply(this.value, this);
      });
    }
    var initial = block.querySelector('.price-option-radio:checked');
    apply(initial ? initial.value : pr.options[0].key, initial);
  }

  /** Share the service (not the price) — works signed-in or out */
  function buildShareHTML(data) {
    var pageUrl = (typeof window !== 'undefined' && window.location && window.location.href)
      ? window.location.href.split('#')[0].split('?')[0]
      : 'https://wordsthatsells.website/en/digital-marketing-services/content-creation/';
    var shareUrl = pageUrl + (pageUrl.indexOf('?') >= 0 ? '&' : '?') + 'service=' + encodeURIComponent(data.slug || data.id || '');
    var shareText = (data.name || data.title || 'Words That Sells service') +
      ' — digital services for SEA businesses. ' + shareUrl;
    var encUrl = encodeURIComponent(shareUrl);
    var encText = encodeURIComponent(shareText);
    var btn =
      'display:inline-flex;align-items:center;justify-content:center;width:2.35rem;height:2.35rem;' +
      'border-radius:999px;border:1px solid #e2e8f0;background:#fff;color:#475569;text-decoration:none;font-size:0.95rem;';
    return '<div class="service-share" style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid #e2e8f0;text-align:center;">' +
      '<p style="margin:0 0 0.55rem;font-size:0.8rem;font-weight:600;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;">Share this service</p>' +
      '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">' +
        '<a href="https://www.facebook.com/sharer/sharer.php?u=' + encUrl + '" target="_blank" rel="noopener noreferrer" title="Share on Facebook" style="' + btn + '"><i class="fab fa-facebook-f"></i></a>' +
        '<a href="https://twitter.com/intent/tweet?url=' + encUrl + '&text=' + encodeURIComponent(data.name || 'Words That Sells') + '" target="_blank" rel="noopener noreferrer" title="Share on X" style="' + btn + '"><i class="fab fa-x-twitter"></i></a>' +
        '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + encUrl + '" target="_blank" rel="noopener noreferrer" title="Share on LinkedIn" style="' + btn + '"><i class="fab fa-linkedin-in"></i></a>' +
        '<a href="https://wa.me/?text=' + encText + '" target="_blank" rel="noopener noreferrer" title="Share on WhatsApp" style="' + btn + '"><i class="fab fa-whatsapp"></i></a>' +
        '<button type="button" class="btn-copy-service-link" data-share-url="' + esc(shareUrl) + '" title="Copy link" style="' + btn + 'cursor:pointer;"><i class="fas fa-link"></i></button>' +
      '</div>' +
      '<p class="share-copy-status" style="margin:0.45rem 0 0;font-size:0.75rem;color:#16a34a;min-height:1em;"></p>' +
    '</div>';
  }

  function bindShareButtons() {
    if (!elContent) return;
    var btns = elContent.querySelectorAll('.btn-copy-service-link');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var url = this.getAttribute('data-share-url') || window.location.href;
        var status = elContent.querySelector('.share-copy-status');
        function done(ok) {
          if (status) status.textContent = ok ? 'Link copied — share the service, not the price.' : 'Could not copy — long-press the address bar.';
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { done(true); }).catch(function () { done(false); });
        } else {
          done(false);
        }
      });
    }
  }

  // Live total + active-tier highlight for volume pricing. Also syncs the chosen
  // quantity onto the CTA buttons so Buy Now / Request a Quote carry it.
  function bindQuantitySelector(data) {
    if (!elContent) return;
    var pr = data.pricing || getPricing(data);
    if (pr.type !== 'tiered' || !Array.isArray(pr.tiers) || !pr.tiers.length) return;

    var input = elContent.querySelector('.qty-input');
    var totalEl = elContent.querySelector('.qty-total');
    var lineEl = elContent.querySelector('.qty-line');
    var rows = elContent.querySelectorAll('.qty-tier-row');
    var tiers = pr.tiers.slice().sort(function (a, b) { return a.min_qty - b.min_qty; });
    var minQty = tiers[0].min_qty || 1;

    function unitFor(q) {
      var p = tiers[0].unit_price;
      tiers.forEach(function (t) { if (q >= t.min_qty) p = t.unit_price; });
      return p;
    }

    function update() {
      var q = parseInt(input && input.value, 10);
      if (isNaN(q) || q < minQty) q = minQty;
      var unit = unitFor(q);
      var total = unit * q;
      if (lineEl) lineEl.textContent = q + ' × ' + fmtMoney(unit, pr.currency) + ' each';
      if (totalEl) totalEl.textContent = fmtMoney(total, pr.currency);
      var activeMin = tiers[0].min_qty;
      tiers.forEach(function (t) { if (q >= t.min_qty) activeMin = t.min_qty; });
      for (var i = 0; i < rows.length; i++) {
        rows[i].style.background = parseInt(rows[i].getAttribute('data-min'), 10) === activeMin
          ? 'rgba(214,42,131,0.08)' : '';
      }
      var ctas = elContent.querySelectorAll('.product-cta');
      for (var j = 0; j < ctas.length; j++) ctas[j].setAttribute('data-quantity', q);
    }

    if (input) {
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    }
    update();
  }

  // ── Purchase-mode CTA handlers ───────────────────────────────

  function bindCtaButtons() {
    if (!elContent) return;
    var quoteBtns = elContent.querySelectorAll('.btn-request-quote');
    for (var i = 0; i < quoteBtns.length; i++) {
      if (quoteBtns[i].dataset.bound) continue;
      quoteBtns[i].dataset.bound = '1';
      quoteBtns[i].addEventListener('click', onRequestQuote);
    }
    var buyBtns = elContent.querySelectorAll('.btn-buy-now');
    for (var j = 0; j < buyBtns.length; j++) {
      if (buyBtns[j].dataset.bound) continue;
      buyBtns[j].dataset.bound = '1';
      buyBtns[j].addEventListener('click', onBuyNow);
    }
    var bcelBtns = elContent.querySelectorAll('.btn-bcel-pay');
    for (var k = 0; k < bcelBtns.length; k++) {
      if (bcelBtns[k].dataset.bound) continue;
      bcelBtns[k].dataset.bound = '1';
      bcelBtns[k].addEventListener('click', onBcelPay);
    }
  }

  function onRequestQuote(e) {
    e.preventDefault();
    openQuote(
      this.getAttribute('data-product-name') || '',
      this.getAttribute('data-cta-form-type') || '',
      this.getAttribute('data-quantity') || '',
      this.getAttribute('data-billing-period') || ''
    );
  }

  // ── Request-a-Quote modal ────────────────────────────────────
  // Self-contained two-path popup: (1) quick quote form that lands in the
  // admin Message Board, or (2) create a portal account via magic link and
  // build a services plan. Injected styles so it works on every page.

  var QUOTE_MODAL_CSS =
    '.wts-qm-overlay{position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:10060;display:flex;align-items:center;justify-content:center;padding:1rem;animation:wtsQmFade .18s ease;}' +
    '@keyframes wtsQmFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes wtsQmUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
    '.wts-qm-card{background:#fff;border-radius:18px;max-width:480px;width:100%;max-height:92vh;overflow-y:auto;padding:1.6rem;box-shadow:0 25px 60px rgba(0,0,0,.35);animation:wtsQmUp .22s ease;}' +
    '.wts-qm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;margin-bottom:.25rem;}' +
    '.wts-qm-head h3{margin:0;font-size:1.2rem;color:#1a1a2e;line-height:1.3;}' +
    '.wts-qm-close{background:none;border:none;font-size:1.5rem;color:#94a3b8;cursor:pointer;line-height:1;padding:0 0 .25rem .25rem;flex:none;}' +
    '.wts-qm-close:hover{color:#334155;}' +
    '.wts-qm-product{font-size:.9rem;color:#64748b;margin:0 0 1.1rem;}' +
    '.wts-qm-product strong{color:#334155;}' +
    '.wts-qm-choices{display:grid;grid-template-columns:1fr 1fr;gap:.7rem;}' +
    '@media (max-width:440px){.wts-qm-choices{grid-template-columns:1fr;}}' +
    '.wts-qm-choice{border:1.5px solid #e2e8f0;border-radius:14px;background:#fff;padding:1.1rem .9rem;text-align:left;cursor:pointer;font-family:inherit;transition:border-color .15s,box-shadow .15s,transform .15s;}' +
    '.wts-qm-choice:hover{border-color:var(--accent-color,#d62b83);box-shadow:0 6px 18px rgba(214,43,131,.12);transform:translateY(-1px);}' +
    '.wts-qm-choice .qm-ico{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1rem;margin-bottom:.6rem;}' +
    '.wts-qm-choice h4{margin:0 0 .3rem;font-size:.98rem;color:#1a1a2e;}' +
    '.wts-qm-choice p{margin:0;font-size:.8rem;color:#64748b;line-height:1.5;}' +
    '.wts-qm-label{display:block;font-size:.83rem;font-weight:600;color:#334155;margin:0 0 .3rem;}' +
    '.wts-qm-input,.wts-qm-textarea{width:100%;box-sizing:border-box;padding:.65rem .8rem;border:1px solid #cbd5e1;border-radius:10px;font-size:.95rem;font-family:inherit;color:#1a1a2e;background:#fff;margin-bottom:.85rem;}' +
    '.wts-qm-input:focus,.wts-qm-textarea:focus{outline:2px solid var(--accent-color,#d62b83);outline-offset:-1px;border-color:transparent;}' +
    '.wts-qm-textarea{resize:vertical;min-height:84px;}' +
    '.wts-qm-submit{width:100%;border:none;border-radius:10px;padding:.8rem;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;background:var(--accent-color,#d62b83);color:#fff;transition:background .15s;}' +
    '.wts-qm-submit:hover{background:#b91c6f;}' +
    '.wts-qm-submit:disabled{opacity:.65;cursor:default;}' +
    '.wts-qm-back{background:none;border:none;color:#64748b;font-size:.85rem;cursor:pointer;font-family:inherit;padding:0;margin-bottom:.9rem;}' +
    '.wts-qm-back:hover{color:var(--accent-color,#d62b83);}' +
    '.wts-qm-error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:.6rem .85rem;font-size:.85rem;margin-bottom:.85rem;display:none;}' +
    '.wts-qm-success{text-align:center;padding:1rem 0 .5rem;}' +
    '.wts-qm-success .qm-check{width:56px;height:56px;border-radius:50%;background:#dcfce7;color:#16a34a;font-size:1.6rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;}' +
    '.wts-qm-success h4{margin:0 0 .5rem;font-size:1.1rem;color:#1a1a2e;}' +
    '.wts-qm-success p{margin:0 0 1.25rem;font-size:.9rem;color:#64748b;line-height:1.6;}' +
    '.wts-qm-hint{font-size:.78rem;color:#94a3b8;margin:.6rem 0 0;line-height:1.5;text-align:center;}';

  function ensureQuoteStyles() {
    if (document.getElementById('wts-quote-modal-styles')) return;
    var st = document.createElement('style');
    st.id = 'wts-quote-modal-styles';
    st.textContent = QUOTE_MODAL_CSS;
    document.head.appendChild(st);
  }

  function closeQuoteModal() {
    var overlay = document.getElementById('wts-qm-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', quoteEscHandler);
  }
  function quoteEscHandler(e) { if (e.key === 'Escape') closeQuoteModal(); }

  // quantity/billing (optional) travel into the message + metadata so the
  // submission tells you exactly what was being looked at. start='account'
  // opens directly on the create-account step (the sign-in-to-buy unlock).
  function openQuote(productName, formType, quantity, billing, start) {
    ensureQuoteStyles();
    closeQuoteModal();
    closePanel();

    var ft = formType || 'consultation';
    var overlay = document.createElement('div');
    overlay.id = 'wts-qm-overlay';
    overlay.className = 'wts-qm-overlay';
    overlay.innerHTML =
      '<div class="wts-qm-card" role="dialog" aria-label="Request a quote">' +
        '<div class="wts-qm-head"><h3 id="wts-qm-title">Request a Quote</h3>' +
        '<button type="button" class="wts-qm-close" aria-label="Close">&times;</button></div>' +
        (productName ? '<p class="wts-qm-product">For <strong>' + esc(productName) + '</strong>' +
          (quantity ? ' · quantity ' + esc(String(quantity)) : '') + '</p>' : '') +
        '<div id="wts-qm-body"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var body = overlay.querySelector('#wts-qm-body');
    var titleEl = overlay.querySelector('#wts-qm-title');
    overlay.querySelector('.wts-qm-close').addEventListener('click', closeQuoteModal);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeQuoteModal(); });
    document.addEventListener('keydown', quoteEscHandler);

    function showChoice() {
      titleEl.textContent = 'Request a Quote';
      body.innerHTML =
        '<div class="wts-qm-choices">' +
          '<button type="button" class="wts-qm-choice" id="wts-qm-pick-quick">' +
            '<span class="qm-ico" style="background:#fdf2f8;color:var(--accent-color,#d62b83);"><i class="fas fa-paper-plane"></i></span>' +
            '<h4>Quick quote</h4>' +
            '<p>Leave your details — we reply with a tailored quotation within one business day.</p>' +
          '</button>' +
          '<button type="button" class="wts-qm-choice" id="wts-qm-pick-account">' +
            '<span class="qm-ico" style="background:#eff6ff;color:#2563eb;"><i class="fas fa-user-plus"></i></span>' +
            '<h4>Create a free account</h4>' +
            '<p>Sign in with just your email — build your services plan, request quotes and track orders.</p>' +
          '</button>' +
        '</div>' +
        '<p class="wts-qm-hint">No pressure, no spam — both options are free.</p>';
      body.querySelector('#wts-qm-pick-quick').addEventListener('click', showQuickForm);
      body.querySelector('#wts-qm-pick-account').addEventListener('click', showAccountForm);
    }

    function showSuccess(heading, text) {
      titleEl.textContent = 'All set';
      body.innerHTML =
        '<div class="wts-qm-success">' +
          '<div class="qm-check"><i class="fas fa-check"></i></div>' +
          '<h4>' + heading + '</h4>' +
          '<p>' + text + '</p>' +
          '<button type="button" class="wts-qm-submit" id="wts-qm-done">Done</button>' +
        '</div>';
      body.querySelector('#wts-qm-done').addEventListener('click', closeQuoteModal);
    }

    function showQuickForm() {
      titleEl.textContent = 'Get your quotation';
      var defaultMsg = productName ? 'I would like a quote for: ' + productName +
        (quantity ? ' (quantity: ' + quantity + ')' : '') +
        (billing ? ' — ' + billing + ' billing' : '') : '';
      body.innerHTML =
        '<button type="button" class="wts-qm-back"><i class="fas fa-arrow-left"></i> Back</button>' +
        '<div class="wts-qm-error" id="wts-qm-err"></div>' +
        '<label class="wts-qm-label" for="wts-qm-name">Your name *</label>' +
        '<input class="wts-qm-input" id="wts-qm-name" type="text" maxlength="120" autocomplete="name" required>' +
        '<label class="wts-qm-label" for="wts-qm-mail">Email *</label>' +
        '<input class="wts-qm-input" id="wts-qm-mail" type="email" maxlength="255" autocomplete="email" required>' +
        '<label class="wts-qm-label" for="wts-qm-phone">Phone / WhatsApp <span style="font-weight:400;color:#94a3b8;">(optional)</span></label>' +
        '<input class="wts-qm-input" id="wts-qm-phone" type="tel" maxlength="40" autocomplete="tel">' +
        '<label class="wts-qm-label" for="wts-qm-msg">What do you need?</label>' +
        '<textarea class="wts-qm-textarea" id="wts-qm-msg" maxlength="2000">' + esc(defaultMsg) + '</textarea>' +
        '<button type="button" class="wts-qm-submit" id="wts-qm-send"><i class="fas fa-paper-plane"></i> Send my request</button>';
      body.querySelector('.wts-qm-back').addEventListener('click', showChoice);

      var sendBtn = body.querySelector('#wts-qm-send');
      sendBtn.addEventListener('click', function () {
        var errEl = body.querySelector('#wts-qm-err');
        var name = body.querySelector('#wts-qm-name').value.trim();
        var email = body.querySelector('#wts-qm-mail').value.trim();
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errEl.textContent = 'Please enter your name and a valid email address.';
          errEl.style.display = 'block';
          return;
        }
        errEl.style.display = 'none';
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
        fetch(API_BASE + '/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_type: ft,
            name: name,
            email: email,
            phone: body.querySelector('#wts-qm-phone').value.trim() || null,
            message: body.querySelector('#wts-qm-msg').value.trim() || null,
            metadata: { product: productName || null, quantity: quantity || null, billing_period: billing || null, source: 'quote-modal' }
          })
        })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function () {
            showSuccess('Request received!',
              'Thanks ' + esc(name.split(' ')[0]) + ' — we’ll get back to you at <strong>' + esc(email) + '</strong> with your quotation within one business day.');
          })
          .catch(function () {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send my request';
            errEl.textContent = 'Something went wrong sending your request. Please try again.';
            errEl.style.display = 'block';
          });
      });
    }

    function showAccountForm() {
      titleEl.textContent = 'Create your free account';
      body.innerHTML =
        '<button type="button" class="wts-qm-back"><i class="fas fa-arrow-left"></i> Back</button>' +
        '<p style="font-size:.88rem;color:#64748b;line-height:1.6;margin:0 0 1rem;">No password needed. We’ll email you a sign-in link — then you can save services to your plan, request quotes and track your orders in one place.</p>' +
        '<div class="wts-qm-error" id="wts-qm-err"></div>' +
        '<label class="wts-qm-label" for="wts-qm-acc-mail">Email address *</label>' +
        '<input class="wts-qm-input" id="wts-qm-acc-mail" type="email" maxlength="255" autocomplete="email" required placeholder="you@example.com">' +
        '<button type="button" class="wts-qm-submit" id="wts-qm-signup"><i class="fas fa-envelope"></i> Email me a sign-in link</button>' +
        '<p class="wts-qm-hint">The link works once and expires in 15 minutes.</p>';
      body.querySelector('.wts-qm-back').addEventListener('click', showChoice);

      var signupBtn = body.querySelector('#wts-qm-signup');
      signupBtn.addEventListener('click', function () {
        var errEl = body.querySelector('#wts-qm-err');
        var email = body.querySelector('#wts-qm-acc-mail').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errEl.textContent = 'Please enter a valid email address.';
          errEl.style.display = 'block';
          return;
        }
        errEl.style.display = 'none';
        signupBtn.disabled = true;
        signupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
        fetch(API_BASE + '/portal-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function () {
            showSuccess('Check your email',
              'A sign-in link is on its way to <strong>' + esc(email) + '</strong>. Click it to open your account — then come back and refresh this page to unlock online checkout.');
          })
          .catch(function () {
            signupBtn.disabled = false;
            signupBtn.innerHTML = '<i class="fas fa-envelope"></i> Email me a sign-in link';
            errEl.textContent = 'Something went wrong. Please try again.';
            errEl.style.display = 'block';
          });
      });
    }

    if (start === 'account') { showAccountForm(); } else { showChoice(); }
  }

  // ── Sign-in modal (email + password) ─────────────────────────
  // Direct portal login for returning customers, opened from the floating
  // account pill. Centered card on desktop, bottom sheet on small screens.
  // Same injected-styles technique as the quote modal above.

  var LOGIN_MODAL_CSS =
    '.wts-lm-overlay{position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:10070;display:flex;align-items:center;justify-content:center;padding:1rem;animation:wtsLmFade .18s ease;}' +
    '@keyframes wtsLmFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes wtsLmUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}' +
    '@keyframes wtsLmSheet{from{transform:translateY(100%)}to{transform:none}}' +
    '.wts-lm-card{background:#fff;border-radius:18px;max-width:420px;width:100%;max-height:92vh;overflow-y:auto;padding:1.6rem;box-shadow:0 25px 60px rgba(0,0,0,.35);animation:wtsLmUp .22s ease;}' +
    '@media (max-width:640px){' +
      '.wts-lm-overlay{align-items:flex-end;padding:0;}' +
      '.wts-lm-card{max-width:none;border-radius:18px 18px 0 0;max-height:88vh;padding:1.4rem 1.25rem calc(1.6rem + env(safe-area-inset-bottom,0px));animation:wtsLmSheet .28s ease;}' +
    '}' +
    '.wts-lm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;}' +
    '.wts-lm-head h3{margin:0;font-size:1.25rem;color:#1a1a2e;line-height:1.3;}' +
    '.wts-lm-close{background:none;border:none;font-size:1.5rem;color:#94a3b8;cursor:pointer;line-height:1;padding:0 0 .25rem .25rem;flex:none;}' +
    '.wts-lm-close:hover{color:#334155;}' +
    '.wts-lm-sub{font-size:.9rem;color:#64748b;margin:.25rem 0 1.1rem;}' +
    '.wts-lm-label{display:block;font-size:.83rem;font-weight:600;color:#334155;margin:0 0 .3rem;}' +
    '.wts-lm-input{width:100%;box-sizing:border-box;padding:.65rem .8rem;border:1px solid #cbd5e1;border-radius:10px;font-size:.95rem;font-family:inherit;color:#1a1a2e;background:#fff;margin-bottom:.85rem;}' +
    '.wts-lm-input:focus{outline:2px solid var(--accent-color,#d62b83);outline-offset:-1px;border-color:transparent;}' +
    '.wts-lm-field{position:relative;margin-bottom:.85rem;}' +
    '.wts-lm-field .wts-lm-input{margin-bottom:0;padding-right:3.6rem;}' +
    '.wts-lm-toggle{position:absolute;right:.4rem;top:50%;transform:translateY(-50%);background:none;border:none;color:#64748b;font-size:.8rem;font-weight:600;font-family:inherit;cursor:pointer;padding:.35rem .5rem;}' +
    '.wts-lm-toggle:hover{color:var(--accent-color,#d62b83);}' +
    '.wts-lm-check{display:flex;align-items:center;gap:.5rem;font-size:.88rem;color:#334155;margin:0 0 1rem;cursor:pointer;}' +
    '.wts-lm-check input{width:auto;margin:0;flex:none;accent-color:var(--accent-color,#d62b83);}' +
    '.wts-lm-submit{width:100%;border:none;border-radius:10px;padding:.8rem;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;background:var(--accent-color,#d62b83);color:#fff;transition:background .15s;}' +
    '.wts-lm-submit:hover{background:#b91c6f;}' +
    '.wts-lm-submit:disabled{opacity:.65;cursor:default;}' +
    '.wts-lm-error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:.6rem .85rem;font-size:.85rem;margin-bottom:.85rem;display:none;}' +
    '.wts-lm-links{display:flex;flex-direction:column;gap:.45rem;align-items:center;margin-top:1rem;}' +
    '.wts-lm-link{background:none;border:none;color:#64748b;font-size:.85rem;cursor:pointer;font-family:inherit;padding:0;text-decoration:underline;text-underline-offset:3px;}' +
    '.wts-lm-link:hover{color:var(--accent-color,#d62b83);}' +
    '.wts-lm-success{text-align:center;padding:1rem 0 .5rem;}' +
    '.wts-lm-success .lm-check{width:56px;height:56px;border-radius:50%;background:#dcfce7;color:#16a34a;font-size:1.6rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;}' +
    '.wts-lm-success h4{margin:0 0 .5rem;font-size:1.1rem;color:#1a1a2e;}' +
    '.wts-lm-success p{margin:0 0 1.25rem;font-size:.9rem;color:#64748b;line-height:1.6;}' +
    '.wts-lm-hint{font-size:.78rem;color:#94a3b8;margin:.6rem 0 0;line-height:1.5;text-align:center;}';

  function ensureLoginStyles() {
    if (document.getElementById('wts-login-modal-styles')) return;
    var st = document.createElement('style');
    st.id = 'wts-login-modal-styles';
    st.textContent = LOGIN_MODAL_CSS;
    document.head.appendChild(st);
  }

  function closeLoginModal() {
    var overlay = document.getElementById('wts-lm-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', loginEscHandler);
  }
  function loginEscHandler(e) { if (e.key === 'Escape') closeLoginModal(); }

  // Brief bottom-center confirmation pill; fades out after ~3s.
  var TOAST_CSS =
    '.wts-toast{position:fixed;left:50%;bottom:1.6rem;transform:translateX(-50%);z-index:10090;background:#1a1a2e;color:#fff;padding:.7rem 1.3rem;border-radius:999px;font-size:.9rem;font-weight:600;font-family:inherit;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:min(92vw,420px);text-align:center;opacity:0;transition:opacity .25s ease;}' +
    '.wts-toast.is-visible{opacity:1;}';

  function ensureToastStyles() {
    if (document.getElementById('wts-toast-styles')) return;
    var st = document.createElement('style');
    st.id = 'wts-toast-styles';
    st.textContent = TOAST_CSS;
    document.head.appendChild(st);
  }

  function showToast(message) {
    ensureToastStyles();
    var old = document.getElementById('wts-toast');
    if (old) old.remove();
    var toast = document.createElement('div');
    toast.id = 'wts-toast';
    toast.className = 'wts-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('is-visible'); }, 20);
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  function openLoginModal() {
    ensureLoginStyles();
    closeLoginModal();
    closeQuoteModal();

    var overlay = document.createElement('div');
    overlay.id = 'wts-lm-overlay';
    overlay.className = 'wts-lm-overlay';
    overlay.innerHTML =
      '<div class="wts-lm-card" role="dialog" aria-modal="true" aria-label="Sign in">' +
        '<div class="wts-lm-head"><h3 id="wts-lm-title">Welcome back</h3>' +
        '<button type="button" class="wts-lm-close" aria-label="Close">&times;</button></div>' +
        '<div id="wts-lm-body"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var body = overlay.querySelector('#wts-lm-body');
    var titleEl = overlay.querySelector('#wts-lm-title');
    overlay.querySelector('.wts-lm-close').addEventListener('click', closeLoginModal);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeLoginModal(); });
    document.addEventListener('keydown', loginEscHandler);

    // The typed email survives the password ↔ email-link swap.
    var lastEmail = '';

    function showError(errEl, msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    function showPasswordForm() {
      titleEl.textContent = 'Welcome back';
      // A real <form> + submit event so browser autofill and password
      // managers recognize and fill the credentials.
      body.innerHTML =
        '<p class="wts-lm-sub">Sign in to your client portal.</p>' +
        '<div class="wts-lm-error" id="wts-lm-err"></div>' +
        '<form id="wts-lm-form" novalidate>' +
          '<label class="wts-lm-label" for="wts-lm-email">Email address</label>' +
          '<input class="wts-lm-input" id="wts-lm-email" name="email" type="email" maxlength="255" autocomplete="email" placeholder="you@example.com" required>' +
          '<label class="wts-lm-label" for="wts-lm-pass">Password</label>' +
          '<div class="wts-lm-field">' +
            '<input class="wts-lm-input" id="wts-lm-pass" name="password" type="password" autocomplete="current-password" required>' +
            '<button type="button" class="wts-lm-toggle" aria-label="Show password">Show</button>' +
          '</div>' +
          '<label class="wts-lm-check"><input type="checkbox" id="wts-lm-remember" checked> Stay signed in</label>' +
          '<button type="submit" class="wts-lm-submit" id="wts-lm-go">Sign In</button>' +
        '</form>' +
        '<div class="wts-lm-links">' +
          '<button type="button" class="wts-lm-link" id="wts-lm-magic">Email me a sign-in link instead</button>' +
          '<button type="button" class="wts-lm-link" id="wts-lm-create">New here? Create an account</button>' +
        '</div>';

      var form = body.querySelector('#wts-lm-form');
      var emailInput = body.querySelector('#wts-lm-email');
      var passInput = body.querySelector('#wts-lm-pass');
      var rememberBox = body.querySelector('#wts-lm-remember');
      var toggleBtn = body.querySelector('.wts-lm-toggle');
      var submitBtn = body.querySelector('#wts-lm-go');
      var errEl = body.querySelector('#wts-lm-err');

      if (lastEmail) emailInput.value = lastEmail;
      emailInput.addEventListener('input', function () { lastEmail = emailInput.value; });

      toggleBtn.addEventListener('click', function () {
        var showing = passInput.type === 'text';
        passInput.type = showing ? 'password' : 'text';
        toggleBtn.textContent = showing ? 'Show' : 'Hide';
        toggleBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      });

      body.querySelector('#wts-lm-magic').addEventListener('click', showLinkForm);
      body.querySelector('#wts-lm-create').addEventListener('click', function () {
        closeLoginModal();
        openQuote('', '', '', '', 'account');
      });

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var email = emailInput.value.trim();
        var password = passInput.value;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
          showError(errEl, 'Please enter your email address and password.');
          return;
        }
        errEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…';
        fetch(API_BASE + '/portal-login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, remember: !!(rememberBox && rememberBox.checked) })
        })
          .then(function (r) {
            return r.json()
              .catch(function () { return {}; })
              .then(function (d) { return { ok: r.ok, data: d }; });
          })
          .then(function (res) {
            if (res.ok && res.data && res.data.signed_in) {
              closeLoginModal();
              showToast('You’re in. Welcome back to your portal.');
              checkCustomerSession();
              return;
            }
            // 401 / 429: surface the server's message; never clear the fields.
            throw new Error((res.data && res.data.error) || '');
          })
          .catch(function (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            showError(errEl, (err && err.message) || 'Something went wrong. Please try again.');
          });
      });
    }

    // One-field fallback: the same magic-link request the account-creation
    // step uses (POST /portal-signup), with the neutral confirmation.
    function showLinkForm() {
      titleEl.textContent = 'Email me a sign-in link';
      body.innerHTML =
        '<p class="wts-lm-sub">No password needed. We’ll email you a one-time sign-in link for your portal.</p>' +
        '<div class="wts-lm-error" id="wts-lm-err"></div>' +
        '<form id="wts-lm-magic-form" novalidate>' +
          '<label class="wts-lm-label" for="wts-lm-magic-mail">Email address</label>' +
          '<input class="wts-lm-input" id="wts-lm-magic-mail" name="email" type="email" maxlength="255" autocomplete="email" placeholder="you@example.com" required>' +
          '<button type="submit" class="wts-lm-submit" id="wts-lm-magic-send"><i class="fas fa-envelope"></i> Email me a sign-in link</button>' +
        '</form>' +
        '<p class="wts-lm-hint">The link works once and expires in 15 minutes.</p>' +
        '<div class="wts-lm-links"><button type="button" class="wts-lm-link" id="wts-lm-back">Back to password sign-in</button></div>';

      var magicForm = body.querySelector('#wts-lm-magic-form');
      var mailInput = body.querySelector('#wts-lm-magic-mail');
      var sendBtn = body.querySelector('#wts-lm-magic-send');
      var errEl = body.querySelector('#wts-lm-err');

      if (lastEmail) mailInput.value = lastEmail;
      mailInput.addEventListener('input', function () { lastEmail = mailInput.value; });
      body.querySelector('#wts-lm-back').addEventListener('click', showPasswordForm);

      magicForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var email = mailInput.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showError(errEl, 'Please enter a valid email address.');
          return;
        }
        errEl.style.display = 'none';
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
        fetch(API_BASE + '/portal-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function () {
            body.innerHTML =
              '<div class="wts-lm-success">' +
                '<div class="lm-check"><i class="fas fa-check"></i></div>' +
                '<h4>Check your email</h4>' +
                '<p>A sign-in link is on its way to <strong>' + esc(email) + '</strong>. Click it to open your portal — the link works once and expires in 15 minutes.</p>' +
                '<button type="button" class="wts-lm-submit" id="wts-lm-done">Done</button>' +
              '</div>' +
              '<div class="wts-lm-links"><button type="button" class="wts-lm-link" id="wts-lm-back2">Back to password sign-in</button></div>';
            body.querySelector('#wts-lm-done').addEventListener('click', closeLoginModal);
            body.querySelector('#wts-lm-back2').addEventListener('click', showPasswordForm);
          })
          .catch(function () {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-envelope"></i> Email me a sign-in link';
            showError(errEl, 'Something went wrong. Please try again.');
          });
      });
    }

    showPasswordForm();
  }

  function onBuyNow(e) {
    e.preventDefault();
    var btn = this;

    // A ready-made Stripe Payment Link is the simplest path.
    var link = btn.getAttribute('data-stripe-link');
    if (link) { window.location.href = link; return; }

    var productId = btn.getAttribute('data-product-id');
    var billing = btn.getAttribute('data-billing-period');
    if (!productId) { openQuote(btn.getAttribute('data-product-name') || '', btn.getAttribute('data-cta-form-type') || ''); return; }

    var original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redirecting…';

    var payBase = API_BASE.replace('/api/public', '/api/payments');
    var body = { product_id: productId };
    if (billing) body.billing_period = billing;
    var qty = btn.getAttribute('data-quantity');
    if (qty) body.quantity = parseInt(qty, 10);
    var optionKey = btn.getAttribute('data-option-key');
    if (!optionKey) {
      var pricingBlockOpt = btn.closest ? btn.closest('.product-pricing-block') : null;
      var selectedOpt = pricingBlockOpt
        ? pricingBlockOpt.querySelector('input[name="price-option-' + productId + '"]:checked')
        : null;
      if (selectedOpt) optionKey = selectedOpt.value;
    }
    if (optionKey) body.option_key = optionKey;

    // Pass the setup-fee opt-out along when the pricing block offers one.
    var pricingBlock = btn.closest ? btn.closest('.product-pricing-block') : null;
    var feeBox = pricingBlock ? pricingBlock.querySelector('.setup-fee-checkbox') : null;
    if (feeBox) body.include_setup_fee = feeBox.checked;

    fetch(payBase + '/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.url) {
          window.location.href = d.url;
        } else {
          btn.disabled = false;
          btn.innerHTML = original;
          openQuote(btn.getAttribute('data-product-name') || '', btn.getAttribute('data-cta-form-type') || '');
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.innerHTML = original;
        openQuote(btn.getAttribute('data-product-name') || '', btn.getAttribute('data-cta-form-type') || '');
      });
  }

  // ── BCEL OnePay (Laos) QR payment ────────────────────────────

  // Whole kip, thousands-separated — LAK has no decimal subunit.
  function fmtKip(amount) {
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' LAK';
  }

  function onBcelPay(e) {
    e.preventDefault();
    var btn = this;
    // Resolve product data from the open panel's detail map entry.
    var productId = btn.getAttribute('data-product-id');
    var data = null;
    for (var key in detailMap) {
      if (String(detailMap[key].id) === String(productId)) { data = detailMap[key]; break; }
    }
    if (!data || !data.bcel) return;

    var original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…';

    var body = { product_id: productId };
    var billing = btn.getAttribute('data-billing-period');
    if (billing) body.billing_period = billing;
    var qty = btn.getAttribute('data-quantity');
    if (qty) body.quantity = parseInt(qty, 10);
    var pricingBlock = btn.closest ? btn.closest('.product-pricing-block') : null;
    var feeBox = pricingBlock ? pricingBlock.querySelector('.setup-fee-checkbox') : null;
    if (feeBox) body.include_setup_fee = feeBox.checked;

    var payBase = API_BASE.replace('/api/public', '/api/payments');
    fetch(payBase + '/bcel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btn.disabled = false;
        btn.innerHTML = original;
        // Show the QR even if the order record failed — the customer can
        // still pay; we just lose the pre-created reference.
        openBcelModal(data, (d && d.reference) ? d : null);
      })
      .catch(function () {
        btn.disabled = false;
        btn.innerHTML = original;
        openBcelModal(data, null);
      });
  }

  function openBcelModal(data, order) {
    closeBcelModal();

    // Manual price points: one QR per amount (e.g. "Yearly + design",
    // "Yearly", "Monthly"). Fall back to the single legacy QR.
    var options = (order && order.options && order.options.length) ? order.options
      : (data.bcel.options && data.bcel.options.length) ? data.bcel.options
      : [{ label: '', lak: data.bcel.price_lak, qr_url: data.bcel.qr_url }];
    options = options.filter(function (o) { return o && sanitizeUrl(o.qr_url); });
    if (!options.length) return;

    var usdAmount = order && order.amount != null ? order.amount : null;
    var usdCurrency = order ? order.currency : data.currency;

    var chipsHTML = '';
    if (options.length > 1) {
      chipsHTML = '<div id="bcel-option-chips" style="display:flex;flex-wrap:wrap;gap:0.4rem;justify-content:center;margin:0.75rem 0 0.25rem;">';
      options.forEach(function (o, i) {
        chipsHTML += '<button type="button" class="bcel-opt" data-idx="' + i + '" ' +
          'style="border:1.5px solid #c8102e;border-radius:999px;padding:0.35rem 0.9rem;font-size:0.85rem;font-weight:600;cursor:pointer;background:none;color:#c8102e;">' +
          esc(o.label || (o.lak != null ? fmtKip(o.lak) : 'Option ' + (i + 1))) + '</button>';
      });
      chipsHTML += '</div><p style="font-size:0.78rem;color:#94a3b8;margin:0.15rem 0 0;">Choose the option you are buying</p>';
    }

    var overlay = document.createElement('div');
    overlay.id = 'bcel-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.65);z-index:10050;display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML =
      '<div role="dialog" aria-label="Pay with BCEL OnePay" style="background:#fff;border-radius:16px;max-width:400px;width:100%;max-height:92vh;overflow-y:auto;padding:1.5rem;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.35);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">' +
          '<h3 style="margin:0;font-size:1.15rem;color:#1a1a2e;"><i class="fas fa-qrcode" style="color:#c8102e;"></i> Pay with <span style="color:#c8102e;font-weight:800;">BCEL OnePay</span></h3>' +
          '<button type="button" id="bcel-modal-close" aria-label="Close" style="background:none;border:none;font-size:1.5rem;color:#64748b;cursor:pointer;line-height:1;">&times;</button>' +
        '</div>' +
        '<p style="font-size:0.92rem;color:#334155;margin:0;">' + esc(data.name) + '</p>' +
        chipsHTML +
        '<p id="bcel-amount" style="font-size:1.5rem;font-weight:700;color:#c8102e;margin:0.25rem 0 0;"></p>' +
        '<p id="bcel-amount-sub" style="font-size:0.82rem;color:#64748b;margin:0.15rem 0 0;"></p>' +
        '<img id="bcel-qr-img" alt="BCEL OnePay QR code" style="width:230px;max-width:80%;margin:1rem auto;display:block;border:1px solid #e2e8f0;border-radius:12px;">' +
        (order && order.reference
          ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:0.6rem 0.9rem;margin-bottom:0.9rem;">' +
              '<p style="font-size:0.82rem;color:#991b1b;margin:0;">Payment reference — include it in the transfer note:</p>' +
              '<p style="font-size:1.15rem;font-weight:700;letter-spacing:0.05em;color:#c8102e;margin:0.15rem 0 0;">' + esc(order.reference) + '</p>' +
            '</div>'
          : '') +
        '<ol style="text-align:left;font-size:0.85rem;color:#475569;margin:0 0 1rem;padding-left:1.3rem;">' +
          '<li>Open the <strong>BCEL One</strong> app and tap Scan.</li>' +
          '<li>Scan this QR and confirm the amount' + (order && order.reference ? ' with the reference in the note' : '') + '.</li>' +
          '<li>Keep your payment slip — we confirm every order by email.</li>' +
        '</ol>' +
        (order && order.order_id
          ? '<div style="border-top:1px solid #e2e8f0;padding-top:0.9rem;margin-bottom:0.9rem;text-align:left;">' +
              '<label for="bcel-email" style="display:block;font-size:0.82rem;font-weight:600;color:#334155;margin-bottom:0.3rem;">Your email — for confirmation and order tracking</label>' +
              '<input type="email" id="bcel-email" maxlength="255" placeholder="you@example.com" autocomplete="email" ' +
                'style="width:100%;padding:0.6rem 0.75rem;border:1px solid #cbd5e1;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">' +
              '<p id="bcel-email-note" style="font-size:0.75rem;color:#94a3b8;margin:0.3rem 0 0;">We’ll email your reference and a link to track this order.</p>' +
            '</div>'
          : '') +
        '<button type="button" id="bcel-modal-done" class="btn btn-accent-magenta" style="width:100%;padding:0.7rem;">Done</button>' +
      '</div>';

    document.body.appendChild(overlay);

    var amountEl = document.getElementById('bcel-amount');
    var amountSubEl = document.getElementById('bcel-amount-sub');
    var qrImg = document.getElementById('bcel-qr-img');
    var chips = overlay.querySelectorAll('.bcel-opt');

    function selectOption(idx) {
      var o = options[idx];
      qrImg.src = sanitizeUrl(o.qr_url);
      if (o.lak != null && o.lak > 0) {
        amountEl.textContent = fmtKip(o.lak);
        amountSubEl.textContent = usdAmount != null ? '≈ ' + fmtMoney(usdAmount, usdCurrency) : '';
      } else if (usdAmount != null) {
        amountEl.textContent = fmtMoney(usdAmount, usdCurrency);
        amountSubEl.textContent = 'Transfer the LAK equivalent at today’s rate.';
      } else {
        amountEl.textContent = '';
        amountSubEl.textContent = '';
      }
      for (var i = 0; i < chips.length; i++) {
        var active = parseInt(chips[i].getAttribute('data-idx'), 10) === idx;
        chips[i].style.background = active ? '#c8102e' : 'none';
        chips[i].style.color = active ? '#fff' : '#c8102e';
      }
    }
    for (var c = 0; c < chips.length; c++) {
      chips[c].addEventListener('click', function () {
        selectOption(parseInt(this.getAttribute('data-idx'), 10));
      });
    }
    selectOption(0);

    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeBcelModal(); });
    document.getElementById('bcel-modal-close').addEventListener('click', closeBcelModal);

    // Done: if the customer left an email, attach it to the order (creates
    // their portal account + sends the reference by email), then close.
    document.getElementById('bcel-modal-done').addEventListener('click', function () {
      var emailInput = document.getElementById('bcel-email');
      var email = emailInput ? emailInput.value.trim() : '';
      if (order && order.order_id && email) {
        var doneBtn = this;
        doneBtn.disabled = true;
        doneBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
        var payBase = API_BASE.replace('/api/public', '/api/payments');
        fetch(payBase + '/bcel-order/' + encodeURIComponent(order.order_id) + '/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        }).catch(function () { /* best-effort */ })
          .finally(function () { closeBcelModal(); });
      } else {
        closeBcelModal();
      }
    });
    document.addEventListener('keydown', bcelEscHandler);
  }

  function bcelEscHandler(e) {
    if (e.key === 'Escape') closeBcelModal();
  }

  function closeBcelModal() {
    var overlay = document.getElementById('bcel-modal-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', bcelEscHandler);
  }

  // ── Slide-in pricing block (one-time or subscription toggle) ──

  // Shared style for the itemized order-summary box used by every pricing
  // type, so subscription, one-time and quantity products all read the same.
  var BREAKDOWN_BOX_STYLE = 'max-width:380px;margin:0 auto 0.75rem;border:1px solid var(--color-border,#e2e8f0);border-radius:12px;padding:1rem 1.15rem;text-align:left;font-size:0.95rem;background:var(--color-slate-50,#f8fafc);';
  var BREAKDOWN_DIVIDER = '<div style="border-top:1px dashed var(--color-border,#cbd5e1);margin:0.8rem 0 0.6rem;"></div>';

  // "Due today" is only honest when the CTA actually charges; quote-based
  // products get "Estimated total" instead.
  function totalLabel(data) {
    return data.purchase_mode === 'buy' ? 'Due today' : 'Estimated total';
  }

  // `value` is optional — omit it when a bound updater fills the amount in.
  function breakdownTotalRow(label, cls, value) {
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.75rem;">' +
      '<span style="font-weight:700;color:var(--text-primary,#1a1a2e);">' + esc(label) + '</span>' +
      '<strong class="' + cls + '" style="font-size:1.3rem;color:var(--accent-color,#d62b83);white-space:nowrap;">' + (value || '') + '</strong>' +
      '</div>';
  }

  function buildPricingBlock(data) {
    var pr = data.pricing || getPricing(data);
    var html = '<div class="product-pricing-block" style="text-align:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--color-border,#e2e8f0);">';

    if (pr.type === 'subscription') {
      var hasMonthly = pr.monthly_price != null;
      var hasYearly = pr.yearly_price != null;
      var showToggle = pr.allow_billing_toggle && hasMonthly && hasYearly;
      var initial = pr.default_billing === 'yearly' && hasYearly ? 'yearly'
        : (hasMonthly ? 'monthly' : 'yearly');

      if (showToggle) {
        html += '<div class="billing-toggle" role="group" aria-label="Billing period" ' +
          'style="display:inline-flex;border:1px solid var(--color-border,#e2e8f0);border-radius:999px;padding:0.25rem;margin-bottom:1rem;gap:0.25rem;">' +
          '<button type="button" class="billing-option" data-billing="monthly" ' +
          'style="border:none;background:none;cursor:pointer;padding:0.4rem 1.1rem;border-radius:999px;font-weight:600;font-size:0.95rem;">Monthly</button>' +
          '<button type="button" class="billing-option" data-billing="yearly" ' +
          'style="border:none;background:none;cursor:pointer;padding:0.4rem 1.1rem;border-radius:999px;font-weight:600;font-size:0.95rem;">Yearly' +
          (pr.annual_discount_pct ? ' <span style="font-size:0.75rem;color:#16a34a;">-' + pr.annual_discount_pct + '%</span>' : '') +
          '</button></div>';
      }

      var hasSetupFee = pr.setup_fee != null && pr.setup_fee > 0;

      // Itemized order summary for every subscription: subscription row,
      // optional one-time fee row (checkbox to untick), and the total —
      // one calm grey box that hands the eye to the CTA below it.
      html += '<div class="price-breakdown" style="' + BREAKDOWN_BOX_STYLE + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;">' +
          '<span class="pb-sub-label" style="color:var(--color-slate-700,#334155);"></span>' +
          '<strong class="pb-sub-amount" style="white-space:nowrap;"></strong>' +
        '</div>';
      if (hasSetupFee) {
        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;margin-top:0.55rem;">' +
          '<label style="display:inline-flex;align-items:flex-start;gap:0.5rem;cursor:pointer;color:var(--color-slate-700,#334155);">' +
            '<input type="checkbox" class="setup-fee-checkbox" checked style="width:auto;margin:0.2em 0 0;flex:none;accent-color:var(--accent-color,#d62b83);">' +
            '<span>' + esc(pr.setup_fee_label || 'Setup fee') + ' <span style="font-size:0.82em;color:var(--color-slate-500,#64748b);white-space:nowrap;">(one-time)</span></span>' +
          '</label>' +
          '<strong class="pb-fee-amount" style="white-space:nowrap;">' + fmtMoney(pr.setup_fee, pr.currency) + '</strong>' +
        '</div>';
      }
      html += BREAKDOWN_DIVIDER +
        breakdownTotalRow(totalLabel(data), 'pb-total-amount') +
        '<p class="pb-renew-note" style="font-size:0.8rem;color:var(--color-slate-500,#64748b);margin:0.45rem 0 0;"></p>' +
      '</div>';
      html += '<p class="billing-savings" style="font-size:0.9rem;color:#16a34a;font-weight:600;margin-bottom:1rem;min-height:1.2em;"></p>';

      html += buildCtaHTML(data, initial);
      html += '</div>';
      return html;
    }

    // Volume / quantity pricing: tier table + quantity selector + live total.
    if (pr.type === 'tiered' && Array.isArray(pr.tiers) && pr.tiers.length) {
      var tiers = pr.tiers.slice().sort(function (a, b) { return a.min_qty - b.min_qty; });
      var minQty = tiers[0].min_qty || 1;

      html += '<div class="qty-tier-table" style="max-width:340px;margin:0 auto 1rem;border:1px solid var(--color-border,#e2e8f0);border-radius:10px;overflow:hidden;font-size:0.92rem;">';
      tiers.forEach(function (t, i) {
        var next = tiers[i + 1];
        var label = next ? (t.min_qty + '–' + (next.min_qty - 1)) : (t.min_qty + '+');
        html += '<div class="qty-tier-row" data-min="' + t.min_qty + '" data-unit="' + t.unit_price + '" ' +
          'style="display:flex;justify-content:space-between;padding:0.5rem 0.85rem;' + (i ? 'border-top:1px solid var(--color-border,#e2e8f0);' : '') + '">' +
          '<span>' + label + ' units</span><strong>' + fmtMoney(t.unit_price, pr.currency) + '/ea</strong></div>';
      });
      html += '</div>';

      html += '<div style="display:flex;align-items:center;justify-content:center;gap:0.6rem;margin-bottom:0.75rem;">' +
        '<label style="font-weight:600;">Quantity</label>' +
        '<input type="number" class="qty-input" min="' + minQty + '" step="1" value="' + minQty + '" ' +
        'style="width:90px;padding:0.45rem 0.6rem;border:1px solid var(--color-border,#d1d5db);border-radius:8px;text-align:center;font-size:1rem;"></div>';

      html += '<div class="price-breakdown" style="' + BREAKDOWN_BOX_STYLE + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;">' +
          '<span style="color:var(--color-slate-700,#334155);">Your quantity</span>' +
          '<strong class="qty-line" style="white-space:nowrap;"></strong>' +
        '</div>' +
        BREAKDOWN_DIVIDER +
        breakdownTotalRow(totalLabel(data), 'qty-total') +
      '</div>';

      html += buildCtaHTML(data, null);
      html += '</div>';
      return html;
    }

    // Named options (one product, multiple price points) — clean cards, dynamic summary on top
    if (pr.type === 'options' && pr.options && pr.options.length) {
      var first = pr.options[0];
      html += '<div class="opt-dynamic-summary" style="text-align:left;background:linear-gradient(135deg,#fdf2f8 0%,#f8fafc 100%);border:1px solid #fbcfe8;border-radius:12px;padding:0.9rem 1rem;margin:0 0 1rem;">' +
        '<div style="font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#e11d74;margin-bottom:0.25rem;">Selected path</div>' +
        '<div class="opt-dyn-title" style="font-size:1.05rem;font-weight:700;color:#0f172a;">' + esc(first.label) + '</div>' +
        '<p class="opt-dyn-desc" style="margin:0.35rem 0 0;font-size:0.9rem;line-height:1.5;color:#475569;">' +
          esc(first.description || first.strategy && first.strategy.replace(/_/g, ' ') || '') +
        '</p>' +
        '<div class="opt-dyn-price" style="margin-top:0.55rem;font-size:1.25rem;font-weight:800;color:#e11d74;">' +
          fmtMoney(first.price, pr.currency) +
        '</div>' +
      '</div>';
      html += '<p style="font-size:0.85rem;color:var(--color-slate-600,#475569);margin:0 0 0.6rem;text-align:left;">Choose how you want it done</p>';
      html += '<div class="price-options" role="radiogroup" aria-label="Service options" style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem;">';
      pr.options.forEach(function (opt, idx) {
        var id = 'opt-' + String(data.id).slice(0, 8) + '-' + esc(opt.key);
        var checked = idx === 0 ? ' checked' : '';
        html += '<label for="' + id + '" class="price-option-label" style="display:flex;gap:0.7rem;align-items:center;border:1.5px solid #e2e8f0;border-radius:12px;padding:0.75rem 0.9rem;cursor:pointer;background:#fff;transition:border-color .15s,box-shadow .15s;">' +
          '<input type="radio" id="' + id + '" name="price-option-' + esc(String(data.id)) + '" value="' + esc(opt.key) + '" class="price-option-radio"' + checked +
          ' style="width:1.05rem;height:1.05rem;accent-color:#e11d74;flex:none;"' +
          ' data-price="' + esc(String(opt.price)) + '"' +
          ' data-label="' + esc(opt.label) + '"' +
          ' data-description="' + esc(opt.description || '') + '">' +
          '<span style="flex:1;min-width:0;text-align:left;">' +
            '<strong style="display:block;color:#0f172a;font-size:0.98rem;">' + esc(opt.label) + '</strong>' +
          '</span>' +
          '<strong style="color:#e11d74;white-space:nowrap;font-size:1rem;">' + fmtMoney(opt.price, pr.currency) + '</strong>' +
        '</label>';
      });
      html += '</div>';
      html += buildCtaHTML(data, null);
      html += buildShareHTML(data);
      html += '</div>';
      return html;
    }

    // One-time
    if (pr.one_time_price != null) {
      if (data.purchase_mode === 'buy' && (!pr.unit || pr.unit === 'fixed')) {
        // Same order-summary treatment as subscriptions, so the checkout
        // amount is stated explicitly.
        html += '<div class="price-breakdown" style="' + BREAKDOWN_BOX_STYLE + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;">' +
            '<span style="color:var(--color-slate-700,#334155);">One-time payment</span>' +
            '<strong style="white-space:nowrap;">' + fmtMoney(pr.one_time_price, pr.currency) + '</strong>' +
          '</div>' +
          BREAKDOWN_DIVIDER +
          breakdownTotalRow('Due today', 'pb-onetime-total', fmtMoney(pr.one_time_price, pr.currency)) +
        '</div>';
      } else {
        // Per-hour / per-unit rates and quote-first products keep the simple
        // headline price; a "Due today" total would be misleading.
        html += '<p style="font-size:1.3rem;font-weight:700;color:var(--accent-color,#d62b83);margin-bottom:1rem;">' +
          fmtMoney(pr.one_time_price, pr.currency) +
          (pr.unit && pr.unit !== 'fixed' ? '<span style="font-size:0.6em;font-weight:500;color:var(--color-slate-500,#64748b);">' + esc(unitSuffix(pr.unit)) + '</span>' : '') +
          '</p>';
      }
    }
    html += buildCtaHTML(data, null);
    html += buildShareHTML(data);
    html += '</div>';
    return html;
  }

  function unitSuffix(unit) {
    if (unit === 'hour') return ' / hour';
    if (unit === 'quantity') return ' / unit';
    if (unit === 'item') return ' / item';
    return '';
  }

  // Render the call-to-action based on how the product is sold:
  //   consult (default) → "Request a Quote" (opens the enquiry form)
  //   buy               → "Buy Now" (Stripe), with a secondary "save to plan"
  function buildCtaHTML(data, billing) {
    var billingAttr = billing ? ' data-billing-period="' + esc(billing) + '"' : '';
    var idAttr = ' data-product-id="' + esc(String(data.id)) + '"';
    var nameAttr = ' data-product-name="' + esc(data.name) + '"';
    // Which form the enquiry CTA opens (admin-configurable per product).
    var formAttr = data.cta_form_type ? ' data-cta-form-type="' + esc(data.cta_form_type) + '"' : '';
    var ctaStyle = ' style="font-size:1.1rem;padding:0.8rem 2rem;"';

    if (data.purchase_mode === 'buy') {
      // Payment-method logos: Stripe wordmark + card brands, and the BCEL
      // OnePay badge when QR payment is available.
      var logos = '<div style="margin-top:0.8rem;display:flex;gap:0.6rem;justify-content:center;align-items:center;color:#94a3b8;" aria-label="Accepted payment methods">' +
        '<i class="fab fa-stripe" style="font-size:1.9rem;" title="Payments by Stripe"></i>' +
        '<i class="fab fa-cc-visa" style="font-size:1.35rem;" title="Visa"></i>' +
        '<i class="fab fa-cc-mastercard" style="font-size:1.35rem;" title="Mastercard"></i>' +
        (data.bcel
          ? '<span title="BCEL OnePay (Laos)" style="font-weight:800;color:#c8102e;font-size:0.72rem;letter-spacing:0.02em;border:1.5px solid #c8102e;border-radius:4px;padding:0.12rem 0.4rem;white-space:nowrap;">BCEL <span style="font-weight:600;">OnePay</span></span>'
          : '') +
        '</div>';

      // Signed-out visitors: Request a Quote only. The quote modal's second
      // option covers account creation, and the floating pill lets returning
      // customers sign in — no separate sign-in button in the CTA stack.
      if (!customerState.signedIn) {
        return '<button class="btn btn-accent-magenta product-cta btn-request-quote"' + idAttr + nameAttr + formAttr + billingAttr +
          ctaStyle + '><i class="fas fa-comments"></i> Request a Quote</button>' +
          logos;
      }

      var buy = '<button class="btn btn-accent-magenta product-cta btn-buy-now"' + idAttr + nameAttr + formAttr + billingAttr +
        (data.stripe_payment_link ? ' data-stripe-link="' + esc(data.stripe_payment_link) + '"' : '') +
        ctaStyle + '><i class="fas fa-bolt"></i> Activate service</button>';
      // BCEL OnePay (Laos): a second payment path that opens the merchant QR.
      if (data.bcel) {
        buy += '<div style="margin-top:0.6rem;"><button class="btn-bcel-pay product-cta"' + idAttr + nameAttr + billingAttr +
          ' style="background:#fff;border:1.5px solid #c8102e;color:#c8102e;padding:0.6rem 1.5rem;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;">' +
          '<i class="fas fa-qrcode"></i> Pay with <strong style="letter-spacing:0.01em;">BCEL OnePay</strong></button></div>';
      }
      var save = '<div style="margin-top:0.6rem;"><button class="btn-add-service"' + idAttr + nameAttr +
        ' style="background:none;border:1px solid var(--color-border,#e2e8f0);padding:0.45rem 1.1rem;border-radius:8px;cursor:pointer;color:var(--color-slate-500,#64748b);font-size:0.95rem;">' +
        (isSaved(data.id) ? '<i class="fas fa-check"></i> Added to My Services' : '<i class="fas fa-plus"></i> Add to My Services') +
        '</button></div>';
      var signedIn = '<p style="font-size:0.78rem;color:var(--color-slate-500,#64748b);margin-top:0.6rem;">' +
        '<i class="fas fa-circle-check" style="color:#16a34a;"></i> Signed in' +
        (customerState.email ? ' as ' + esc(customerState.email) : '') +
        ' · <a href="' + PORTAL_URL + '" style="color:var(--accent-color,#d62b83);text-decoration:none;font-weight:600;" rel="noopener">My account</a></p>';
      return buy + save + logos + signedIn;
    }

    // consult (default for most services)
    return '<button class="btn btn-accent-magenta product-cta btn-request-quote"' + idAttr + nameAttr + formAttr + billingAttr +
      ctaStyle + '><i class="fas fa-comments"></i> Request a Quote</button>' +
      '<p style="font-size:0.82rem;color:var(--color-slate-500,#64748b);margin-top:0.6rem;">Tell us what you need — we\'ll tailor a plan and quote.</p>';
  }

  function bindBillingToggle(data) {
    if (!elContent) return;
    var pr = data.pricing || getPricing(data);
    if (pr.type !== 'subscription') return;

    var block = elContent.querySelector('.product-pricing-block');
    if (!block) return;

    var hasMonthly = pr.monthly_price != null;
    var initial = pr.default_billing === 'yearly' && pr.yearly_price != null ? 'yearly'
      : (hasMonthly ? 'monthly' : 'yearly');

    applyBilling(block, pr, initial);

    var options = block.querySelectorAll('.billing-option');
    for (var i = 0; i < options.length; i++) {
      options[i].addEventListener('click', function () {
        applyBilling(block, pr, this.getAttribute('data-billing'));
      });
    }

    // Un/ticking the setup fee recomputes the "Due today" total for the
    // currently selected billing period.
    var feeBox = block.querySelector('.setup-fee-checkbox');
    if (feeBox) {
      feeBox.addEventListener('change', function () {
        var cta = block.querySelector('.product-cta');
        applyBilling(block, pr, (cta && cta.getAttribute('data-billing-period')) || initial);
      });
    }
  }

  // Update the displayed price, savings line, active toggle state and the
  // add-service button's billing attribute for the chosen period.
  function applyBilling(block, pr, billing) {
    var savingsEl = block.querySelector('.billing-savings');
    var addBtn = block.querySelector('.btn-add-service');

    var isYearly = billing === 'yearly';
    var amount = isYearly ? pr.yearly_price : pr.monthly_price;
    var suffix = isYearly ? '/year' : '/month';

    // Itemized breakdown: subscription row, optional fee row and the total.
    var subLabelEl = block.querySelector('.pb-sub-label');
    var subAmountEl = block.querySelector('.pb-sub-amount');
    var totalEl = block.querySelector('.pb-total-amount');
    var renewEl = block.querySelector('.pb-renew-note');
    if (subAmountEl && totalEl) {
      if (subLabelEl) subLabelEl.textContent = (isYearly ? 'Yearly' : 'Monthly') + ' subscription';
      subAmountEl.innerHTML = fmtMoney(amount, pr.currency) +
        '<span style="font-size:0.8em;font-weight:500;color:var(--color-slate-500,#64748b);">' + suffix + '</span>';

      var feeBox = block.querySelector('.setup-fee-checkbox');
      var feeIncluded = !feeBox || feeBox.checked;
      var fee = (feeIncluded && pr.setup_fee > 0) ? pr.setup_fee : 0;
      totalEl.textContent = fmtMoney((amount || 0) + fee, pr.currency);

      if (renewEl) {
        var note = 'Renews at ' + fmtMoney(amount, pr.currency) + suffix + '.';
        if (fee > 0) {
          note += ' The ' + (pr.setup_fee_label || 'setup fee') + ' is charged only once.';
        }
        renewEl.textContent = note;
      }
    }
    if (savingsEl) {
      if (isYearly && pr.annual_savings) {
        savingsEl.innerHTML = '<i class="fas fa-piggy-bank"></i> Save ' + fmtMoney(pr.annual_savings, pr.currency) +
          (pr.annual_discount_pct ? ' (' + pr.annual_discount_pct + '%)' : '') + ' with annual billing';
      } else if (!isYearly && pr.annual_discount_pct) {
        savingsEl.innerHTML = 'Switch to annual and save ' + pr.annual_discount_pct + '%';
      } else {
        savingsEl.innerHTML = '';
      }
    }
    if (addBtn) addBtn.setAttribute('data-billing-period', billing);
    // Every CTA (Buy Now, BCEL OnePay, Request a Quote) carries the period.
    var ctas = block.querySelectorAll('.product-cta');
    for (var c = 0; c < ctas.length; c++) ctas[c].setAttribute('data-billing-period', billing);

    // Active button styling
    var options = block.querySelectorAll('.billing-option');
    for (var i = 0; i < options.length; i++) {
      var active = options[i].getAttribute('data-billing') === billing;
      options[i].style.background = active ? 'var(--accent-color,#d62b83)' : 'none';
      options[i].style.color = active ? '#fff' : 'inherit';
      // The "-39%" chip is green on white but unreadable on the active pink
      // background — switch it to translucent white there.
      var chip = options[i].querySelector('span');
      if (chip) chip.style.color = active ? 'rgba(255,255,255,0.9)' : '#16a34a';
    }
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
    var billingPeriod = btn.getAttribute('data-billing-period') || null;

    // Signed-in: the plan lives on the account so it follows the customer
    // across devices and shows up in the portal + admin.
    if (customerState.signedIn) {
      var adding = !serverSaved[String(productId)];
      btn.disabled = true;
      fetch(API_BASE + '/my-services' + (adding ? '' : '/remove'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adding
          ? { product_id: productId, billing_period: billingPeriod }
          : { product_id: productId })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          if (adding) serverSaved[String(productId)] = true;
          else delete serverSaved[String(productId)];
          btn.innerHTML = adding
            ? '<i class="fas fa-check"></i> Added to My Services'
            : '<i class="fas fa-plus"></i> Add to My Services';
        })
        .catch(function () { /* leave the button as it was */ })
        .then(function () { btn.disabled = false; });
      return;
    }

    if (isSaved(productId)) {
      removeService(productId);
      btn.innerHTML = '<i class="fas fa-plus"></i> Add to My Services';
      console.log('[ProductLoader] Removed service:', productName);
    } else {
      saveService(productId, productName, billingPeriod);
      btn.innerHTML = '<i class="fas fa-check"></i> Added to My Services';
      console.log('[ProductLoader] Added service:', productName, billingPeriod || '');
    }
  }

  // ── Saved-services helpers (localStorage until backend ready) ──

  function getSavedServices() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_SERVICES_KEY)) || {};
    } catch (_) { return {}; }
  }

  function isSaved(productId) {
    if (customerState.signedIn) return !!serverSaved[String(productId)];
    return !!getSavedServices()[String(productId)];
  }

  function saveService(productId, productName, billingPeriod) {
    var saved = getSavedServices();
    saved[String(productId)] = {
      name: productName,
      billing_period: billingPeriod || null,
      added_at: new Date().toISOString()
    };
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

  // Does a button's page_url target string match this page path?
  // Supports: '*' (site-wide), comma/newline lists, exact paths (trailing-slash
  // tolerant) and '/*' / '*' suffix wildcards.
  function buttonMatchesPage(target, pagePath) {
    if (!target) return false;
    var patterns = String(target).split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p === '*') return true;
      if (p === pagePath) return true;
      if (p.endsWith('/') && p.slice(0, -1) === pagePath) return true;
      if (pagePath.endsWith('/') && pagePath.slice(0, -1) === p) return true;
      if (p.endsWith('*')) {
        var prefix = p.slice(0, -1); // handles both '/*' and '*' suffixes
        if (pagePath.indexOf(prefix) === 0) return true;
      }
    }
    return false;
  }

  function loadFormButtons() {
    // Render into the page's dedicated slot(s) and any drop-in placeholder.
    var sections = document.querySelectorAll('.form-buttons-section[data-buttons-page], [data-wts-buttons]');
    if (!sections.length) return;

    fetch(API_BASE + '/form-buttons')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // Only inline buttons go into page slots; sticky buttons are rendered
        // as floating side tabs by the site-wide loader (firebase.js).
        var buttons = (data.buttons || []).filter(function (btn) { return btn.placement !== 'sticky'; });
        for (var s = 0; s < sections.length; s++) {
          var section = sections[s];
          // A slot may declare its page path; a generic placeholder uses the
          // current page's path.
          var pagePath = section.getAttribute('data-buttons-page') || window.location.pathname;
          var matched = buttons.filter(function (btn) { return buttonMatchesPage(btn.page_url, pagePath); });
          if (matched.length) renderFormButtons(matched, section);
        }
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

      // A button can be tied to a specific product so the enquiry is attributed
      // to it (and we can scroll to its card when present).
      var productAttr = '';
      if (btn.product_slug) productAttr += ' data-product-slug="' + esc(btn.product_slug) + '"';
      if (btn.product_name) productAttr += ' data-product-name="' + esc(btn.product_name) + '"';

      // Render as a button that triggers the form modal with the appropriate form_type
      html += '<button type="button" class="' + cssClass + '" data-form-type="' + esc(btn.form_type) + '"' +
        productAttr + customStyle + relAttr + targetAttr + onclickAttr + '>' +
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

  // Briefly highlight a product card so the visitor's eye lands on it.
  function ensureFlashStyle() {
    if (document.getElementById('wts-product-flash-style')) return;
    var st = document.createElement('style');
    st.id = 'wts-product-flash-style';
    st.textContent =
      '@keyframes wtsProductFlash{0%,100%{box-shadow:0 0 0 0 rgba(214,42,131,0);}' +
      '15%{box-shadow:0 0 0 4px rgba(214,42,131,0.55);}}' +
      '.wts-product-flash{animation:wtsProductFlash 1s ease-in-out 2;border-radius:12px;}';
    document.head.appendChild(st);
  }

  function flashProductCard(slug) {
    var card = document.getElementById('wts-product-' + slug);
    if (!card) return false;
    ensureFlashStyle();
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { card.scrollIntoView(); }
    card.classList.add('wts-product-flash');
    setTimeout(function () { card.classList.remove('wts-product-flash'); }, 2000);
    return true;
  }

  function onFormButtonClick(e) {
    e.preventDefault();
    var formType = this.getAttribute('data-form-type');
    var productName = this.getAttribute('data-product-name') || '';
    var productSlug = this.getAttribute('data-product-slug') || '';

    // If the targeted product's card is on this page, scroll to it as a cue.
    if (productSlug) flashProductCard(productSlug);

    // Pre-tag the enquiry with the product so the submission is attributed to it.
    var prefill = {};
    if (productName) {
      prefill.service = productName;
      prefill.message = 'I\'m interested in ' + productName + '.';
    }

    // Prefer the shared modal API so the button loads its own form template.
    if (window.WTSQuote && typeof window.WTSQuote.open === 'function') {
      window.WTSQuote.open(formType, prefill);
      return;
    }

    var overlay = document.getElementById('quote-modal-overlay');
    if (overlay) {
      // Tag the enquiry with the button's configured form_type so the
      // submission lands under the right form in the admin (the handlers read
      // this dataset / hidden input).
      overlay.dataset.formType = formType;
      overlay.classList.add('active');
      document.body.classList.add('no-scroll');

      var form = overlay.querySelector('form');
      if (form) {
        var ft = form.querySelector('input[name="form_type"]');
        if (!ft) {
          ft = document.createElement('input');
          ft.type = 'hidden';
          ft.name = 'form_type';
          form.appendChild(ft);
        }
        ft.value = formType;
        form.dataset.formType = formType;

        // Carry the product into the legacy form too, so the lead is tagged.
        if (productName) {
          var svc = form.querySelector('[name="service"]');
          if (svc && !svc.value) svc.value = productName;
        }
      }
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
