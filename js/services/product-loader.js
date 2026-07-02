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
      var html = '<span class="product-price" style="' + style + '">' + fmtMoney(amount, pr.currency) +
        '<span style="font-size:0.85em;font-weight:500;color:var(--color-slate-500,#64748b);">' + suffix + '</span></span>';
      if (pr.annual_discount_pct) {
        html += '<span class="product-savings" style="display:block;font-size:0.8rem;color:#16a34a;font-weight:600;">Save ' +
          pr.annual_discount_pct + '% yearly</span>';
      }
      if (pr.setup_fee != null && pr.setup_fee > 0) {
        html += '<span class="product-setup-fee" style="display:block;font-size:0.78rem;color:var(--color-slate-500,#64748b);">+ ' +
          fmtMoney(pr.setup_fee, pr.currency) + ' ' + esc(pr.setup_fee_label || 'setup fee') + ' (one-time)</span>';
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
      return '<span class="product-price" style="' + style + '">' + fmtMoney(pr.one_time_price, pr.currency) + '</span>';
    }
    return '';
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
        pricing: getPricing(product),
        purchase_mode: product.purchase_mode || 'consult',
        cta_form_type: product.cta_form_type || null,
        stripe_payment_link: product.stripe_payment_link || null,
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
  }

  // Live total + active-tier highlight for volume pricing. Also syncs the chosen
  // quantity onto the CTA buttons so Buy Now / Request a Quote carry it.
  function bindQuantitySelector(data) {
    if (!elContent) return;
    var pr = data.pricing || getPricing(data);
    if (pr.type !== 'tiered' || !Array.isArray(pr.tiers) || !pr.tiers.length) return;

    var input = elContent.querySelector('.qty-input');
    var totalEl = elContent.querySelector('.qty-total');
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
      if (totalEl) {
        totalEl.innerHTML = q + ' × ' + fmtMoney(unit, pr.currency) + '/ea = ' + fmtMoney(total, pr.currency);
      }
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
  }

  function onRequestQuote(e) {
    e.preventDefault();
    openQuote(this.getAttribute('data-product-name') || '', this.getAttribute('data-cta-form-type') || '', this.getAttribute('data-quantity') || '');
  }

  // Open the on-page enquiry modal pre-filled with the product, or fall back
  // to the contact page if this page has no modal. formType lets each product
  // route its CTA to a specific admin form; it defaults to 'consultation'.
  // quantity (optional) is appended to the message for volume-priced products.
  function openQuote(productName, formType, quantity) {
    var ft = formType || 'consultation';
    var msg = productName ? 'I would like a quote / consultation about: ' + productName : '';
    if (quantity && msg) msg += ' (quantity: ' + quantity + ')';
    // Prefer the shared modal API (loads the chosen admin form on demand).
    // Falls back to direct DOM handling if it isn't available.
    if (window.WTSQuote && typeof window.WTSQuote.open === 'function') {
      closePanel();
      window.WTSQuote.open(ft, {
        service: productName,
        message: msg
      });
      return;
    }

    var overlay = document.getElementById('quote-modal-overlay');
    if (overlay) {
      closePanel();

      // Tag the enquiry with the chosen form type so it lands in Submissions
      // correctly (the form handlers read this dataset / hidden input).
      overlay.dataset.formType = ft;
      // .modal-overlay defaults to display:none with no .active rule, so show
      // it explicitly with flex (matches firebase.js / ui.js).
      overlay.style.display = 'flex';
      overlay.classList.add('active');
      document.body.classList.add('no-scroll');

      var title = overlay.querySelector('.modal-title');
      if (title) title.textContent = 'Request a Quote';

      // The mounted form may be the static #quote-form or an admin template
      // form — handle whichever is present.
      var form = overlay.querySelector('form');
      if (form) {
        var ftInput = form.querySelector('input[name="form_type"]');
        if (!ftInput) {
          ftInput = document.createElement('input');
          ftInput.type = 'hidden';
          ftInput.name = 'form_type';
          form.appendChild(ftInput);
        }
        ftInput.value = ft;
        form.dataset.formType = ft;

        var msgEl = form.querySelector('[name="message"]');
        if (msgEl && msg && !msgEl.value) {
          msgEl.value = msg;
        }
        var svc = form.querySelector('input[name="service"]');
        if (svc && productName) svc.value = productName;
      }
      return;
    }
    window.location.href = '/en/company/contact-us/?service=' + encodeURIComponent(productName);
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

  // ── Slide-in pricing block (one-time or subscription toggle) ──

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

      html += '<p class="billing-price" style="font-size:1.3rem;font-weight:700;color:var(--accent-color,#d62b83);margin-bottom:0.25rem;"></p>';
      html += '<p class="billing-savings" style="font-size:0.9rem;color:#16a34a;font-weight:600;margin-bottom:1rem;min-height:1.2em;"></p>';

      // Optional one-time setup fee (e.g. custom design) — included by
      // default, customer can untick it before checkout.
      if (pr.setup_fee != null && pr.setup_fee > 0) {
        html += '<label class="setup-fee-option" style="display:inline-flex;align-items:center;gap:0.5rem;font-size:0.92rem;margin-bottom:1rem;cursor:pointer;color:var(--color-slate-700,#334155);">' +
          '<input type="checkbox" class="setup-fee-checkbox" checked style="width:auto;margin:0;accent-color:var(--accent-color,#d62b83);">' +
          'Add ' + esc(pr.setup_fee_label || 'setup fee') + ' — ' + fmtMoney(pr.setup_fee, pr.currency) + ' one-time' +
          '</label>';
      }

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

      html += '<div style="display:flex;align-items:center;justify-content:center;gap:0.6rem;margin-bottom:0.5rem;">' +
        '<label style="font-weight:600;">Quantity</label>' +
        '<input type="number" class="qty-input" min="' + minQty + '" step="1" value="' + minQty + '" ' +
        'style="width:90px;padding:0.45rem 0.6rem;border:1px solid var(--color-border,#d1d5db);border-radius:8px;text-align:center;font-size:1rem;"></div>';
      html += '<p class="qty-total" style="font-size:1.3rem;font-weight:700;color:var(--accent-color,#d62b83);margin-bottom:1rem;"></p>';

      html += buildCtaHTML(data, null);
      html += '</div>';
      return html;
    }

    // One-time
    if (pr.one_time_price != null) {
      html += '<p style="font-size:1.3rem;font-weight:700;color:var(--accent-color,#d62b83);margin-bottom:1rem;">' +
        fmtMoney(pr.one_time_price, pr.currency) +
        (pr.unit && pr.unit !== 'fixed' ? '<span style="font-size:0.6em;font-weight:500;color:var(--color-slate-500,#64748b);">' + esc(unitSuffix(pr.unit)) + '</span>' : '') +
        '</p>';
    }
    html += buildCtaHTML(data, null);
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
      var buy = '<button class="btn btn-accent-magenta product-cta btn-buy-now"' + idAttr + nameAttr + formAttr + billingAttr +
        (data.stripe_payment_link ? ' data-stripe-link="' + esc(data.stripe_payment_link) + '"' : '') +
        ctaStyle + '><i class="fas fa-bolt"></i> Buy Now</button>';
      var save = '<div style="margin-top:0.6rem;"><button class="btn-add-service"' + idAttr + nameAttr +
        ' style="background:none;border:1px solid var(--color-border,#e2e8f0);padding:0.45rem 1.1rem;border-radius:8px;cursor:pointer;color:var(--color-slate-500,#64748b);font-size:0.95rem;">' +
        (isSaved(data.id) ? '<i class="fas fa-check"></i> Added to My Services' : '<i class="fas fa-plus"></i> Add to My Services') +
        '</button></div>';
      return buy + save;
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
  }

  // Update the displayed price, savings line, active toggle state and the
  // add-service button's billing attribute for the chosen period.
  function applyBilling(block, pr, billing) {
    var priceEl = block.querySelector('.billing-price');
    var savingsEl = block.querySelector('.billing-savings');
    var addBtn = block.querySelector('.btn-add-service');
    var ctaBtn = block.querySelector('.product-cta');

    var isYearly = billing === 'yearly';
    var amount = isYearly ? pr.yearly_price : pr.monthly_price;
    var suffix = isYearly ? '/year' : '/month';

    if (priceEl) {
      priceEl.innerHTML = fmtMoney(amount, pr.currency) +
        '<span style="font-size:0.65em;font-weight:500;color:var(--color-slate-500,#64748b);">' + suffix + '</span>';
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
    if (ctaBtn) ctaBtn.setAttribute('data-billing-period', billing);

    // Active button styling
    var options = block.querySelectorAll('.billing-option');
    for (var i = 0; i < options.length; i++) {
      var active = options[i].getAttribute('data-billing') === billing;
      options[i].style.background = active ? 'var(--accent-color,#d62b83)' : 'none';
      options[i].style.color = active ? '#fff' : 'inherit';
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
