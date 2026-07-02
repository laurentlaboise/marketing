const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const taxonomy = require('../config/product-taxonomy');
const slugify = require('../utils/slugify');
const { parseProductListings, parseSeedProducts } = require('../utils/product-import-parser');
const { normalizeTiers } = require('../utils/pricing');
const { upsertCustomer, linkOrdersByEmail, issueLoginLink } = require('./portal');

const router = express.Router();

const businessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

router.use(ensureAuthenticated);
router.use(businessLimiter);

// ==================== AFFILIATE SOLUTIONS ====================

router.get('/affiliates', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM affiliate_solutions ORDER BY name ASC');
    res.render('business/affiliates/list', {
      title: 'Affiliate Solutions - WTS Admin',
      affiliates: result.rows,
      currentPage: 'affiliates'
    });
  } catch (error) {
    res.render('business/affiliates/list', {
      title: 'Affiliate Solutions - WTS Admin',
      affiliates: [],
      currentPage: 'affiliates',
      error: 'Failed to load affiliate solutions'
    });
  }
});

router.get('/affiliates/new', (req, res) => {
  res.render('business/affiliates/form', {
    title: 'New Affiliate Solution - WTS Admin',
    affiliate: null,
    currentPage: 'affiliates'
  });
});

router.post('/affiliates', async (req, res) => {
  try {
    const { name, description, commission_rate, cookie_duration, payout_threshold, affiliate_url, category, status } = req.body;

    await db.query(
      'INSERT INTO affiliate_solutions (name, description, commission_rate, cookie_duration, payout_threshold, affiliate_url, category, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [name, description, commission_rate, cookie_duration, payout_threshold || null, affiliate_url, category, status || 'active']
    );
    req.session.successMessage = 'Affiliate solution created successfully';
    res.redirect('/business/affiliates');
  } catch (error) {
    console.error('Create affiliate error:', error);
    res.render('business/affiliates/form', {
      title: 'New Affiliate Solution - WTS Admin',
      affiliate: req.body,
      currentPage: 'affiliates',
      error: 'Failed to create affiliate solution'
    });
  }
});

router.get('/affiliates/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM affiliate_solutions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/affiliates');
    }
    res.render('business/affiliates/form', {
      title: 'Edit Affiliate Solution - WTS Admin',
      affiliate: result.rows[0],
      currentPage: 'affiliates'
    });
  } catch (error) {
    res.redirect('/business/affiliates');
  }
});

router.post('/affiliates/:id', async (req, res) => {
  try {
    const { name, description, commission_rate, cookie_duration, payout_threshold, affiliate_url, category, status } = req.body;

    await db.query(
      'UPDATE affiliate_solutions SET name = $1, description = $2, commission_rate = $3, cookie_duration = $4, payout_threshold = $5, affiliate_url = $6, category = $7, status = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9',
      [name, description, commission_rate, cookie_duration, payout_threshold || null, affiliate_url, category, status, req.params.id]
    );
    req.session.successMessage = 'Affiliate solution updated successfully';
    res.redirect('/business/affiliates');
  } catch (error) {
    req.session.errorMessage = 'Failed to update affiliate solution';
    res.redirect(`/business/affiliates/${req.params.id}/edit`);
  }
});

router.post('/affiliates/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM affiliate_solutions WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Affiliate solution deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete affiliate solution';
  }
  res.redirect('/business/affiliates');
});

// ==================== AGENCIES ====================

router.get('/agencies', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM agencies ORDER BY name ASC');
    res.render('business/agencies/list', {
      title: 'Agency Management - WTS Admin',
      agencies: result.rows,
      currentPage: 'agencies'
    });
  } catch (error) {
    res.render('business/agencies/list', {
      title: 'Agency Management - WTS Admin',
      agencies: [],
      currentPage: 'agencies',
      error: 'Failed to load agencies'
    });
  }
});

router.get('/agencies/new', (req, res) => {
  res.render('business/agencies/form', {
    title: 'New Agency - WTS Admin',
    agency: null,
    currentPage: 'agencies'
  });
});

router.post('/agencies', async (req, res) => {
  try {
    const { name, description, services, contact_email, contact_phone, website_url, logo_url, location, status } = req.body;
    const servicesArray = services ? services.split('\n').map(s => s.trim()).filter(s => s) : [];

    await db.query(
      'INSERT INTO agencies (name, description, services, contact_email, contact_phone, website_url, logo_url, location, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [name, description, servicesArray, contact_email, contact_phone, website_url, logo_url, location, status || 'active']
    );
    req.session.successMessage = 'Agency created successfully';
    res.redirect('/business/agencies');
  } catch (error) {
    console.error('Create agency error:', error);
    res.render('business/agencies/form', {
      title: 'New Agency - WTS Admin',
      agency: req.body,
      currentPage: 'agencies',
      error: 'Failed to create agency'
    });
  }
});

router.get('/agencies/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM agencies WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/agencies');
    }
    res.render('business/agencies/form', {
      title: 'Edit Agency - WTS Admin',
      agency: result.rows[0],
      currentPage: 'agencies'
    });
  } catch (error) {
    res.redirect('/business/agencies');
  }
});

router.post('/agencies/:id', async (req, res) => {
  try {
    const { name, description, services, contact_email, contact_phone, website_url, logo_url, location, status } = req.body;
    const servicesArray = services ? services.split('\n').map(s => s.trim()).filter(s => s) : [];

    await db.query(
      'UPDATE agencies SET name = $1, description = $2, services = $3, contact_email = $4, contact_phone = $5, website_url = $6, logo_url = $7, location = $8, status = $9, updated_at = CURRENT_TIMESTAMP WHERE id = $10',
      [name, description, servicesArray, contact_email, contact_phone, website_url, logo_url, location, status, req.params.id]
    );
    req.session.successMessage = 'Agency updated successfully';
    res.redirect('/business/agencies');
  } catch (error) {
    req.session.errorMessage = 'Failed to update agency';
    res.redirect(`/business/agencies/${req.params.id}/edit`);
  }
});

router.post('/agencies/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM agencies WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Agency deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete agency';
  }
  res.redirect('/business/agencies');
});


// ==================== PRODUCTS ====================

// Normalize flexible-pricing form fields into clean DB values.
// Subscription products must keep at least one billing period; otherwise we
// fall back to one-time pricing so the product still has a usable price.
function normalizePricing(body) {
  const toNum = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const toInt = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  };

  let pricingType = 'one_time';
  if (body.pricing_type === 'subscription') pricingType = 'subscription';
  else if (body.pricing_type === 'tiered') pricingType = 'tiered';
  const monthly = toNum(body.monthly_price);
  const yearly = toNum(body.yearly_price);

  // Volume-discount tiers come from parallel form arrays tier_min_qty[] /
  // tier_unit_price[]. A tiered product with no valid tiers falls back to
  // one-time so it can never end up unsellable/blank.
  let quantityTiers = [];
  if (pricingType === 'tiered') {
    const mins = Array.isArray(body.tier_min_qty) ? body.tier_min_qty : (body.tier_min_qty != null ? [body.tier_min_qty] : []);
    const prices = Array.isArray(body.tier_unit_price) ? body.tier_unit_price : (body.tier_unit_price != null ? [body.tier_unit_price] : []);
    quantityTiers = normalizeTiers(mins.map((m, i) => ({ min_qty: m, unit_price: prices[i] })));
    if (quantityTiers.length === 0) pricingType = 'one_time';
  }

  // A subscription with no monthly or yearly price isn't sellable — treat as one-time.
  if (pricingType === 'subscription' && monthly === null && yearly === null) {
    pricingType = 'one_time';
  }

  let defaultBilling = body.default_billing === 'yearly' ? 'yearly' : 'monthly';
  // Keep the default billing on a period that actually has a price.
  if (pricingType === 'subscription') {
    if (defaultBilling === 'monthly' && monthly === null) defaultBilling = 'yearly';
    if (defaultBilling === 'yearly' && yearly === null) defaultBilling = 'monthly';
  }

  // Checkbox: present (or "true") => allow toggling between monthly/yearly.
  const allowToggle = body.allow_billing_toggle === undefined
    ? true
    : (Array.isArray(body.allow_billing_toggle)
        ? body.allow_billing_toggle.includes('true')
        : (body.allow_billing_toggle === 'true' || body.allow_billing_toggle === 'on'));

  // LAK has no decimals; accept whole kip only.
  const toKip = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Math.round(parseFloat(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Only a real http(s) URL may be stored for the QR image — it is rendered
  // into an <img src> in the admin and on the public site.
  const toHttpUrl = (v) => {
    if (!v || !String(v).trim()) return null;
    try {
      const u = new URL(String(v).trim());
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch (e) { /* not a URL */ }
    return null;
  };

  // Assemble the BCEL QR price points (see return value below).
  const toArr = (v) => Array.isArray(v) ? v : (v !== undefined && v !== null ? [v] : []);
  const bcelLabels = toArr(body.bcel_label);
  const bcelLaks = toArr(body.bcel_lak);
  const bcelOptions = toArr(body.bcel_qr)
    .map((qr, i) => ({
      label: (bcelLabels[i] || '').toString().trim().slice(0, 80),
      lak: toKip(bcelLaks[i]),
      qr_url: toHttpUrl(qr)
    }))
    .filter((o) => o.qr_url);

  // Optional one-time setup fee charged with the first subscription payment
  // (e.g. custom design). Only meaningful on subscriptions; the label is only
  // kept when there's a fee to label.
  const setupFee = pricingType === 'subscription' ? toNum(body.setup_fee) : null;
  const setupFeeLabel = (setupFee !== null && body.setup_fee_label && body.setup_fee_label.trim())
    ? body.setup_fee_label.trim().slice(0, 120)
    : null;

  return {
    pricing_type: pricingType,
    monthly_price: pricingType === 'subscription' ? monthly : null,
    yearly_price: pricingType === 'subscription' ? yearly : null,
    annual_discount_pct: pricingType === 'subscription' ? toInt(body.annual_discount_pct) : null,
    default_billing: defaultBilling,
    allow_billing_toggle: allowToggle,
    quantity_tiers: quantityTiers,
    setup_fee: setupFee,
    setup_fee_label: setupFeeLabel,
    // BCEL OnePay (Laos): manual QR price points from parallel form arrays
    // bcel_label[] / bcel_lak[] / bcel_qr[]. Rows without a valid http(s) QR
    // URL are dropped. Legacy single-QR columns mirror the first row.
    bcel_options: bcelOptions,
    bcel_qr_url: bcelOptions.length ? bcelOptions[0].qr_url : null,
    price_lak: bcelOptions.length ? bcelOptions[0].lak : null
  };
}

// Keep only recognized industry tags. Accepts a single value or an array
// (express.urlencoded parses repeated checkbox names as arrays).
function normalizeIndustries(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((v) => String(v).trim())
    .filter((v) => taxonomy.INDUSTRY_VALUES.includes(v));
}

// Server-side validation gate. Returns an array of human-readable errors;
// empty means valid. Enforces the metadata standard so a bulk load can't
// create products with no category, no subcategory, or an unsellable price.
function validateProduct(body) {
  const errors = [];
  const name = (body.name || '').trim();
  if (name.length < 3 || name.length > 80) errors.push('Name must be 3–80 characters.');

  const desc = (body.description || '').trim();
  if (desc.length < 20) errors.push('Description should be at least 20 characters.');
  if (desc.length > 2000) errors.push('Description is too long (max 2000 characters).');

  const sp = body.service_page || '';
  if (!taxonomy.SERVICE_PAGE_VALUES.includes(sp)) {
    errors.push('Select a valid Service Page.');
  } else if (!taxonomy.isValidSubcategory(sp, body.subcategory)) {
    errors.push('Select a Subcategory that belongs to the chosen Service Page.');
  }

  const mode = body.purchase_mode || 'consult';
  if (!taxonomy.PURCHASE_MODE_VALUES.includes(mode)) errors.push('Invalid purchase mode.');

  // Self-serve "Buy now" products must have something to charge.
  if (mode === 'buy') {
    const isSub = body.pricing_type === 'subscription';
    const isTiered = body.pricing_type === 'tiered';
    const hasOneTime = parseFloat(body.price) > 0;
    const hasSub = parseFloat(body.monthly_price) > 0 || parseFloat(body.yearly_price) > 0;
    const tierPrices = Array.isArray(body.tier_unit_price) ? body.tier_unit_price : (body.tier_unit_price != null ? [body.tier_unit_price] : []);
    const hasTier = tierPrices.some((v) => parseFloat(v) > 0);
    const ok = isSub ? hasSub : (isTiered ? hasTier : hasOneTime);
    if (!ok) {
      errors.push('Buy-now products need a price (a one-time price, monthly/yearly for subscriptions, or at least one quantity tier).');
    }
  }
  return errors;
}

router.get('/products', async (req, res) => {
  try {
    const { service_page, status } = req.query;
    let query = 'SELECT * FROM products';
    const params = [];
    const conditions = [];

    if (service_page) {
      conditions.push(`service_page = $${params.length + 1}`);
      params.push(service_page);
    }
    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY sort_order ASC, name ASC';

    const result = await db.query(query, params);
    res.render('business/products/list', {
      title: 'Products - WTS Admin',
      products: result.rows,
      currentPage: 'products',
      filter_service_page: service_page || '',
      filter_status: status || ''
    });
  } catch (error) {
    res.render('business/products/list', {
      title: 'Products - WTS Admin',
      products: [],
      currentPage: 'products',
      filter_service_page: '',
      filter_status: '',
      error: 'Failed to load products'
    });
  }
});

// Active form templates offered in the product editor's "Request-a-Quote form"
// dropdown. Each product can point its consult CTA at one of these; the front
// end falls back to the generic 'consultation' form when none is set.
async function getActiveFormTemplates() {
  try {
    const r = await db.query(
      "SELECT form_type, title FROM form_templates WHERE status = 'active' ORDER BY title ASC"
    );
    return r.rows;
  } catch (e) {
    return [];
  }
}

router.get('/products/new', async (req, res) => {
  res.render('business/products/form', {
    title: 'New Product - WTS Admin',
    product: null,
    currentPage: 'products',
    taxonomy,
    formTemplates: await getActiveFormTemplates()
  });
});

// Quick Add — a trimmed-down create form (the six essentials); POSTs to the
// existing POST /products handler. Registered before the /products/:id routes.
router.get('/products/quick', async (req, res) => {
  res.render('business/products/quick', {
    title: 'Quick Add Product - WTS Admin',
    currentPage: 'products',
    taxonomy
  });
});

// ---- Bulk import (must be registered before the /products/:id routes) ----

const IMPORT_ICON_BY_PAGE = {
  'content-creation': 'fas fa-pen-nib',
  'social-media-management': 'fas fa-hashtag',
  'web-development': 'fas fa-code',
  'business-tools': 'fas fa-briefcase',
};

router.get('/products/import', (req, res) => {
  res.render('business/products/import', {
    title: 'Import Products - WTS Admin',
    currentPage: 'products',
    results: null
  });
});

// Parse the product-listings document and create each entry as a draft.
// Idempotent: existing slugs are skipped, so re-running is safe. Each row is
// inserted independently so one bad entry can't abort the whole batch.
router.post('/products/import', async (req, res) => {
  let parsed;
  try {
    const text = req.body.text || '';
    // Curated seed JSON (database/seed/*.json) or the original listings doc.
    parsed = text.trim().startsWith('[') ? parseSeedProducts(text) : parseProductListings(text);
  } catch (e) {
    return res.render('business/products/import', {
      title: 'Import Products - WTS Admin',
      currentPage: 'products',
      results: null,
      error: 'Could not parse the document: ' + e.message
    });
  }

  const items = [];
  let created = 0, skipped = 0, failed = 0;
  for (const p of parsed.products) {
    try {
      if (!p.name) { failed++; items.push({ name: '(unnamed)', status: 'error', message: 'Missing name', warnings: [] }); continue; }
      const existing = await db.query('SELECT id FROM products WHERE slug = $1', [p.slug]);
      if (existing.rows.length) {
        skipped++;
        items.push({ name: p.name, status: 'skipped', message: 'A product with this slug already exists', warnings: p.warnings });
        continue;
      }
      const monthly = p.monthly_price;
      const yearly = p.yearly_price;
      const defaultBilling = monthly != null ? 'monthly' : (yearly != null ? 'yearly' : 'monthly');
      const allowToggle = monthly != null && yearly != null;
      await db.query(
        `INSERT INTO products (
          name, slug, description, price, currency, features, status,
          service_page, subcategory, icon_class, animation_class, sort_order,
          product_type, slide_in_subtitle,
          pricing_type, monthly_price, yearly_price, default_billing, allow_billing_toggle,
          purchase_mode, price_unit, industries, sku, stripe_payment_link,
          slide_in_title, slide_in_content, quantity_tiers
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
        [
          p.name, p.slug, p.description || null, p.price, p.currency || 'USD', p.features || [], 'draft',
          p.service_page || null, p.subcategory || null,
          p.icon_class || IMPORT_ICON_BY_PAGE[p.service_page] || 'fas fa-box', 'kinetic-pulse-float', p.sort_order || 0,
          p.product_type || (p.pricing_type === 'subscription' ? 'subscription' : 'service'), p.slide_in_subtitle || null,
          p.pricing_type, monthly, yearly, defaultBilling, allowToggle,
          taxonomy.PURCHASE_MODE_VALUES.includes(p.purchase_mode) ? p.purchase_mode : 'consult',
          p.price_unit || 'fixed', normalizeIndustries(p.industries), p.sku || null, p.stripe_payment_link || null,
          p.slide_in_title || null, p.slide_in_content || null, JSON.stringify(p.quantity_tiers || [])
        ]
      );
      created++;
      items.push({ name: p.name, status: 'created', message: `${p.service_page || '?'} / ${p.subcategory || '?'}`, warnings: p.warnings });
    } catch (e) {
      failed++;
      items.push({ name: p.name, status: 'error', message: e.message, warnings: p.warnings || [] });
    }
  }

  req.session.successMessage = `Import complete: ${created} created, ${skipped} skipped, ${failed} failed.`;
  res.render('business/products/import', {
    title: 'Import Products - WTS Admin',
    currentPage: 'products',
    results: { items, created, skipped, failed, total: parsed.products.length }
  });
});

router.post('/products', async (req, res) => {
  try {
    const {
      name, slug, description, price, currency, category, features, image_url, status,
      service_page, icon_class, animation_class, sort_order, product_type, download_url,
      slide_in_title, slide_in_subtitle, slide_in_content, slide_in_image, slide_in_video,
      stripe_product_id, stripe_price_id, is_featured,
      pricing_type, monthly_price, yearly_price, annual_discount_pct, default_billing,
      allow_billing_toggle, stripe_price_id_monthly, stripe_price_id_yearly,
      subcategory, purchase_mode, price_unit, industries, sku, stripe_payment_link,
      cta_form_type, stripe_price_id_setup
    } = req.body;

    const errors = validateProduct(req.body);
    if (errors.length) {
      req.body.industries = normalizeIndustries(industries);
      return res.render('business/products/form', {
        title: 'New Product - WTS Admin',
        product: req.body,
        currentPage: 'products',
        taxonomy,
        formTemplates: await getActiveFormTemplates(),
        error: errors.join(' ')
      });
    }

    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const productSlug = slug && slug.trim() ? slugify(slug) : slugify(name);
    // Pass the whole body so normalizePricing can also read the tier arrays.
    const pricing = normalizePricing(req.body);
    const mode = taxonomy.PURCHASE_MODE_VALUES.includes(purchase_mode) ? purchase_mode : 'consult';
    const unit = taxonomy.PRICE_UNIT_VALUES.includes(price_unit) ? price_unit : 'fixed';

    await db.query(
      `INSERT INTO products (
        name, slug, description, price, currency, category, features, image_url, status,
        service_page, icon_class, animation_class, sort_order, product_type, download_url,
        slide_in_title, slide_in_subtitle, slide_in_content, slide_in_image, slide_in_video,
        stripe_product_id, stripe_price_id, is_featured,
        pricing_type, monthly_price, yearly_price, annual_discount_pct, default_billing,
        allow_billing_toggle, stripe_price_id_monthly, stripe_price_id_yearly,
        subcategory, purchase_mode, price_unit, industries, sku, stripe_payment_link,
        cta_form_type, quantity_tiers, setup_fee, setup_fee_label, stripe_price_id_setup,
        bcel_qr_url, price_lak, bcel_options
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45)`,
      [
        name, productSlug, description, price || null, currency || 'USD', category, featuresArray, image_url, status || 'active',
        service_page || null, icon_class || 'fas fa-box', animation_class || 'kinetic-pulse-float',
        parseInt(sort_order) || 0, product_type || 'service', download_url || null,
        slide_in_title || null, slide_in_subtitle || null, slide_in_content || null,
        slide_in_image || null, slide_in_video || null,
        stripe_product_id || null, stripe_price_id || null, is_featured === 'true',
        pricing.pricing_type, pricing.monthly_price, pricing.yearly_price, pricing.annual_discount_pct,
        pricing.default_billing, pricing.allow_billing_toggle,
        stripe_price_id_monthly || null, stripe_price_id_yearly || null,
        subcategory || null, mode, unit, normalizeIndustries(industries), sku || null, stripe_payment_link || null,
        (cta_form_type && cta_form_type.trim()) ? cta_form_type.trim() : null,
        JSON.stringify(pricing.quantity_tiers || []),
        pricing.setup_fee, pricing.setup_fee_label, stripe_price_id_setup || null,
        pricing.bcel_qr_url, pricing.price_lak, JSON.stringify(pricing.bcel_options || [])
      ]
    );
    req.session.successMessage = 'Product created successfully';
    res.redirect('/business/products');
  } catch (error) {
    console.error('Create product error:', error);
    req.body.industries = normalizeIndustries(req.body.industries);
    res.render('business/products/form', {
      title: 'New Product - WTS Admin',
      product: req.body,
      currentPage: 'products',
      taxonomy,
      formTemplates: await getActiveFormTemplates(),
      error: 'Failed to create product'
    });
  }
});

router.get('/products/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/products');
    }
    res.render('business/products/form', {
      title: 'Edit Product - WTS Admin',
      product: result.rows[0],
      currentPage: 'products',
      taxonomy,
      formTemplates: await getActiveFormTemplates()
    });
  } catch (error) {
    res.redirect('/business/products');
  }
});

router.post('/products/:id', async (req, res) => {
  try {
    const {
      name, slug, description, price, currency, category, features, image_url, status,
      service_page, icon_class, animation_class, sort_order, product_type, download_url,
      slide_in_title, slide_in_subtitle, slide_in_content, slide_in_image, slide_in_video,
      stripe_product_id, stripe_price_id, is_featured,
      pricing_type, monthly_price, yearly_price, annual_discount_pct, default_billing,
      allow_billing_toggle, stripe_price_id_monthly, stripe_price_id_yearly,
      subcategory, purchase_mode, price_unit, industries, sku, stripe_payment_link,
      cta_form_type, stripe_price_id_setup
    } = req.body;

    const errors = validateProduct(req.body);
    if (errors.length) {
      req.body.id = req.params.id;
      req.body.industries = normalizeIndustries(industries);
      return res.render('business/products/form', {
        title: 'Edit Product - WTS Admin',
        product: req.body,
        currentPage: 'products',
        taxonomy,
        formTemplates: await getActiveFormTemplates(),
        error: errors.join(' ')
      });
    }

    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const productSlug = slug && slug.trim() ? slugify(slug) : slugify(name);
    // Pass the whole body so normalizePricing can also read the tier arrays.
    const pricing = normalizePricing(req.body);
    const mode = taxonomy.PURCHASE_MODE_VALUES.includes(purchase_mode) ? purchase_mode : 'consult';
    const unit = taxonomy.PRICE_UNIT_VALUES.includes(price_unit) ? price_unit : 'fixed';

    await db.query(
      `UPDATE products SET
        name=$1, slug=$2, description=$3, price=$4, currency=$5, category=$6, features=$7,
        image_url=$8, status=$9, service_page=$10, icon_class=$11, animation_class=$12,
        sort_order=$13, product_type=$14, download_url=$15, slide_in_title=$16,
        slide_in_subtitle=$17, slide_in_content=$18, slide_in_image=$19, slide_in_video=$20,
        stripe_product_id=$21, stripe_price_id=$22, is_featured=$23,
        pricing_type=$24, monthly_price=$25, yearly_price=$26, annual_discount_pct=$27,
        default_billing=$28, allow_billing_toggle=$29,
        stripe_price_id_monthly=$30, stripe_price_id_yearly=$31,
        subcategory=$32, purchase_mode=$33, price_unit=$34, industries=$35, sku=$36,
        stripe_payment_link=$37, cta_form_type=$38, quantity_tiers=$39,
        setup_fee=$40, setup_fee_label=$41, stripe_price_id_setup=$42,
        bcel_qr_url=$43, price_lak=$44, bcel_options=$45, updated_at=CURRENT_TIMESTAMP
      WHERE id=$46`,
      [
        name, productSlug, description, price || null, currency, category, featuresArray,
        image_url, status, service_page || null, icon_class || 'fas fa-box',
        animation_class || 'kinetic-pulse-float', parseInt(sort_order) || 0,
        product_type || 'service', download_url || null,
        slide_in_title || null, slide_in_subtitle || null, slide_in_content || null,
        slide_in_image || null, slide_in_video || null,
        stripe_product_id || null, stripe_price_id || null, is_featured === 'true',
        pricing.pricing_type, pricing.monthly_price, pricing.yearly_price, pricing.annual_discount_pct,
        pricing.default_billing, pricing.allow_billing_toggle,
        stripe_price_id_monthly || null, stripe_price_id_yearly || null,
        subcategory || null, mode, unit, normalizeIndustries(industries), sku || null,
        stripe_payment_link || null,
        (cta_form_type && cta_form_type.trim()) ? cta_form_type.trim() : null,
        JSON.stringify(pricing.quantity_tiers || []),
        pricing.setup_fee, pricing.setup_fee_label, stripe_price_id_setup || null,
        pricing.bcel_qr_url, pricing.price_lak, JSON.stringify(pricing.bcel_options || []),
        req.params.id
      ]
    );
    req.session.successMessage = 'Product updated successfully';
    res.redirect('/business/products');
  } catch (error) {
    req.session.errorMessage = 'Failed to update product';
    res.redirect(`/business/products/${req.params.id}/edit`);
  }
});

router.post('/products/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Product deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete product';
  }
  res.redirect('/business/products');
});

// Clone a product to speed up entering a catalog of similar items. The copy
// starts as a draft with a fresh name/slug and never inherits Stripe IDs —
// pointing two products at one Stripe price would be a billing hazard.
router.post('/products/:id/duplicate', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Product not found';
      return res.redirect('/business/products');
    }
    const src = { ...result.rows[0] };
    const originalName = src.name;
    delete src.id;
    delete src.created_at;
    delete src.updated_at;
    src.name = `${originalName} (Copy)`;
    src.slug = slugify(`${originalName}-copy-${Date.now().toString(36)}`);
    src.status = 'draft';
    src.is_featured = false;
    src.stripe_product_id = null;
    src.stripe_price_id = null;
    src.stripe_price_id_monthly = null;
    src.stripe_price_id_yearly = null;
    src.stripe_price_id_setup = null;
    src.stripe_payment_link = null;

    const cols = Object.keys(src);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
    const values = cols.map((c) => src[c]);
    const insert = await db.query(
      `INSERT INTO products (${cols.join(',')}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    req.session.successMessage = 'Product duplicated as a draft. Review and publish when ready.';
    res.redirect(`/business/products/${insert.rows[0].id}/edit`);
  } catch (error) {
    console.error('Duplicate product error:', error);
    req.session.errorMessage = 'Failed to duplicate product';
    res.redirect('/business/products');
  }
});

// ==================== ORDERS ====================

// Orders inbox — built for the manual BCEL OnePay workflow: awaiting_payment
// orders show the transfer reference to match against the bank statement,
// then get marked paid (or cancelled) here. Stripe orders appear read-only
// alongside for one view of everything sold.
const ORDER_STATUSES = ['pending', 'awaiting_payment', 'completed', 'expired', 'cancelled'];

router.get('/orders', async (req, res) => {
  const { status, method } = req.query;
  try {
    const conditions = [];
    const params = [];
    if (status && ORDER_STATUSES.includes(status)) {
      conditions.push(`o.status = $${params.length + 1}`);
      params.push(status);
    }
    if (method === 'stripe' || method === 'bcel_qr') {
      conditions.push(`o.payment_method = $${params.length + 1}`);
      params.push(method);
    }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const result = await db.query(
      `SELECT o.*, p.name AS product_name, p.slug AS product_slug
       FROM orders o LEFT JOIN products p ON o.product_id = p.id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT 200`,
      params
    );
    res.render('business/orders/list', {
      title: 'Orders - WTS Admin',
      orders: result.rows,
      currentPage: 'orders',
      filter_status: status || '',
      filter_method: method || ''
    });
  } catch (error) {
    console.error('Orders list error:', error);
    res.render('business/orders/list', {
      title: 'Orders - WTS Admin',
      orders: [],
      currentPage: 'orders',
      filter_status: status || '',
      filter_method: method || '',
      error: 'Failed to load orders'
    });
  }
});

router.post('/orders/:id/status', async (req, res) => {
  const next = req.body.status;
  if (!ORDER_STATUSES.includes(next)) {
    req.session.errorMessage = 'Invalid order status';
    return res.redirect('/business/orders');
  }
  try {
    await db.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [next, req.params.id]
    );
    req.session.successMessage = next === 'completed'
      ? 'Order marked as paid'
      : `Order marked as ${next.replace('_', ' ')}`;
  } catch (error) {
    console.error('Order status update error:', error);
    req.session.errorMessage = 'Failed to update order';
  }
  // Preserve the active filters on redirect.
  const qs = new URLSearchParams();
  if (req.body.filter_status) qs.set('status', req.body.filter_status);
  if (req.body.filter_method) qs.set('method', req.body.filter_method);
  res.redirect('/business/orders' + (qs.toString() ? '?' + qs.toString() : ''));
});

// ==================== CUSTOMERS (portal accounts) ====================

const normalizeCustomerEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 255 ? email : null;
};

router.get('/customers', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const params = [];
    let where = '';
    if (q) {
      where = `WHERE c.email ILIKE $1 OR c.name ILIKE $1`;
      params.push(`%${q}%`);
    }
    const [list, stats] = await Promise.all([
      db.query(
        `SELECT c.*,
                COUNT(o.id) AS order_count,
                COUNT(o.id) FILTER (WHERE o.status = 'awaiting_payment') AS awaiting_count,
                COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'completed'), 0) AS total_spent,
                (SELECT COUNT(*) FROM saved_services s WHERE s.customer_id = c.id) AS saved_count
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
         ${where}
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT 200`,
        params
      ),
      db.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days') AS new_30d,
           COUNT(*) FILTER (WHERE last_login_at IS NOT NULL) AS signed_in,
           (SELECT COUNT(DISTINCT customer_id) FROM orders WHERE customer_id IS NOT NULL) AS with_orders
         FROM customers`
      )
    ]);
    res.render('business/customers/list', {
      title: 'Clients - WTS Admin',
      customers: list.rows,
      stats: stats.rows[0],
      currentPage: 'customers',
      q
    });
  } catch (error) {
    console.error('Customers list error:', error);
    res.render('business/customers/list', {
      title: 'Clients - WTS Admin',
      customers: [],
      stats: { total: 0, new_30d: 0, signed_in: 0, with_orders: 0 },
      currentPage: 'customers',
      q,
      error: 'Failed to load clients'
    });
  }
});

// Manually add a client (e.g. onboarding someone you met) and optionally
// send them a portal sign-in invite straight away.
router.post('/customers', async (req, res) => {
  const email = normalizeCustomerEmail(req.body.email);
  if (!email) {
    req.session.errorMessage = 'A valid email is required';
    return res.redirect('/business/customers');
  }
  try {
    const customer = await upsertCustomer(email, (req.body.name || '').trim().slice(0, 255) || null);
    await linkOrdersByEmail(customer.id, email);
    if (req.body.send_invite === 'true') {
      const sent = await issueLoginLink(customer);
      req.session.successMessage = sent.sent
        ? `Client added — sign-in link emailed to ${email}`
        : `Client added, but the invite email could not be sent (check Brevo configuration)`;
    } else {
      req.session.successMessage = 'Client added';
    }
    res.redirect(`/business/customers/${customer.id}`);
  } catch (error) {
    console.error('Create customer error:', error);
    req.session.errorMessage = 'Failed to add client';
    res.redirect('/business/customers');
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const customer = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer.rows.length) {
      req.session.errorMessage = 'Client not found';
      return res.redirect('/business/customers');
    }
    const [orders, saved] = await Promise.all([
      db.query(
        `SELECT o.*, p.name AS product_name
         FROM orders o LEFT JOIN products p ON o.product_id = p.id
         WHERE o.customer_id = $1
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [req.params.id]
      ),
      db.query(
        `SELECT s.billing_period, s.created_at, p.name, p.slug
         FROM saved_services s JOIN products p ON p.id = s.product_id
         WHERE s.customer_id = $1
         ORDER BY s.created_at DESC`,
        [req.params.id]
      ).catch(() => ({ rows: [] }))
    ]);
    res.render('business/customers/detail', {
      title: `${customer.rows[0].email} - WTS Admin`,
      customer: customer.rows[0],
      orders: orders.rows,
      savedServices: saved.rows,
      currentPage: 'customers'
    });
  } catch (error) {
    console.error('Customer detail error:', error);
    req.session.errorMessage = 'Failed to load client';
    res.redirect('/business/customers');
  }
});

// Email the client a fresh portal sign-in link.
router.post('/customers/:id/send-login', async (req, res) => {
  try {
    const customer = await db.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer.rows.length) {
      req.session.errorMessage = 'Client not found';
      return res.redirect('/business/customers');
    }
    if (customer.rows[0].status !== 'active') {
      req.session.errorMessage = 'This account is disabled — enable it before sending a sign-in link';
      return res.redirect(`/business/customers/${req.params.id}`);
    }
    const sent = await issueLoginLink(customer.rows[0]);
    req.session.successMessage = sent.sent
      ? `Sign-in link emailed to ${customer.rows[0].email}`
      : 'Could not send the email — check the Brevo configuration (BREVO_API_KEY / BREVO_FROM_EMAIL)';
  } catch (error) {
    console.error('Send login link error:', error);
    req.session.errorMessage = 'Failed to send sign-in link';
  }
  res.redirect(`/business/customers/${req.params.id}`);
});

// Enable / disable the account. Disabled customers cannot sign in (the
// portal checks status === 'active') but their history is kept.
router.post('/customers/:id/status', async (req, res) => {
  const next = req.body.status === 'disabled' ? 'disabled' : 'active';
  try {
    await db.query(
      'UPDATE customers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [next, req.params.id]
    );
    req.session.successMessage = next === 'disabled' ? 'Account disabled — the client can no longer sign in' : 'Account enabled';
  } catch (error) {
    console.error('Customer status error:', error);
    req.session.errorMessage = 'Failed to update account';
  }
  res.redirect(`/business/customers/${req.params.id}`);
});

// Delete the account. Orders are kept for bookkeeping — they detach from
// the account but retain the customer email on the order row.
router.post('/customers/:id/delete', async (req, res) => {
  try {
    await db.query('UPDATE orders SET customer_id = NULL WHERE customer_id = $1', [req.params.id]);
    await db.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Client account deleted (orders kept for bookkeeping)';
  } catch (error) {
    console.error('Delete customer error:', error);
    req.session.errorMessage = 'Failed to delete client';
  }
  res.redirect('/business/customers');
});

// ==================== PRICE MODELS (Subscription Packages) ====================

router.get('/pricing', async (req, res) => {
  try {
    const [modelsResult, featuresResult] = await Promise.all([
      db.query('SELECT * FROM price_models ORDER BY sort_order ASC, name ASC'),
      db.query('SELECT * FROM pricing_features ORDER BY category_sort_order ASC, sort_order ASC')
    ]);
    const categories = {};
    featuresResult.rows.forEach(f => {
      if (!categories[f.category_name]) categories[f.category_name] = [];
      categories[f.category_name].push(f);
    });
    res.render('business/pricing/list', {
      title: 'Packages - WTS Admin',
      models: modelsResult.rows,
      features: featuresResult.rows,
      categories,
      currentPage: 'pricing'
    });
  } catch (error) {
    res.render('business/pricing/list', {
      title: 'Packages - WTS Admin',
      models: [],
      features: [],
      categories: {},
      currentPage: 'pricing',
      error: 'Failed to load packages'
    });
  }
});

router.get('/pricing/new', async (req, res) => {
  try {
    const featuresResult = await db.query('SELECT * FROM pricing_features WHERE status = $1 ORDER BY category_sort_order ASC, sort_order ASC', ['active']);
    const plansResult = await db.query('SELECT id, name FROM price_models ORDER BY name ASC');
    res.render('business/pricing/form', {
      title: 'New Pricing Package - WTS Admin',
      model: null,
      allFeatures: featuresResult.rows,
      allPlans: plansResult.rows,
      currentPage: 'pricing'
    });
  } catch (error) {
    res.render('business/pricing/form', {
      title: 'New Pricing Package - WTS Admin',
      model: null,
      allFeatures: [],
      allPlans: [],
      currentPage: 'pricing',
      error: 'Failed to load form data'
    });
  }
});

router.post('/pricing', async (req, res) => {
  try {
    const {
      name, slug, description, type, base_price, billing_cycle, status,
      highlight, badge_text, annual_discount_pct, sort_order,
      cta_text, cta_url, icon_class, upsell_text, upsell_target_id,
      pay_as_you_go_text, trial_days, currency,
      stripe_price_id_monthly, stripe_price_id_yearly
    } = req.body;

    // Build features JSONB from checkbox inputs (feature_<key> = "true")
    // Note: express.urlencoded({ extended: true }) parses duplicate keys as arrays
    // e.g. hidden "false" + checked checkbox "true" → ['false', 'true']
    const features = {};
    Object.keys(req.body).forEach(key => {
      if (key.startsWith('feature_')) {
        const featureKey = key.replace('feature_', '');
        const val = req.body[key];
        features[featureKey] = Array.isArray(val) ? val.includes('true') : val === 'true';
      }
    });

    const isHighlight = Array.isArray(highlight) ? highlight.includes('true') : highlight === 'true';
    const modelSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await db.query(
      `INSERT INTO price_models (
        name, slug, description, type, base_price, billing_cycle, features, status,
        highlight, badge_text, annual_discount_pct, sort_order,
        cta_text, cta_url, icon_class, upsell_text, upsell_target_id,
        pay_as_you_go_text, trial_days, currency,
        stripe_price_id_monthly, stripe_price_id_yearly
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        name, modelSlug, description, type, base_price || null, billing_cycle || 'monthly',
        JSON.stringify(features), status || 'active',
        isHighlight, badge_text || null,
        parseInt(annual_discount_pct) || 20, parseInt(sort_order) || 0,
        cta_text || 'Choose Plan', cta_url || null, icon_class || null,
        upsell_text || null, upsell_target_id || null,
        pay_as_you_go_text || null, parseInt(trial_days) || 0, currency || 'USD',
        stripe_price_id_monthly || null, stripe_price_id_yearly || null
      ]
    );
    req.session.successMessage = 'Pricing package created successfully';
    res.redirect('/business/pricing');
  } catch (error) {
    console.error('Create pricing package error:', error);
    req.session.errorMessage = 'Failed to create pricing package: ' + error.message;
    res.redirect('/business/pricing/new');
  }
});

router.get('/pricing/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM price_models WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/pricing');
    }
    const featuresResult = await db.query('SELECT * FROM pricing_features WHERE status = $1 ORDER BY category_sort_order ASC, sort_order ASC', ['active']);
    const plansResult = await db.query('SELECT id, name FROM price_models WHERE id != $1 ORDER BY name ASC', [req.params.id]);
    res.render('business/pricing/form', {
      title: 'Edit Pricing Package - WTS Admin',
      model: result.rows[0],
      allFeatures: featuresResult.rows,
      allPlans: plansResult.rows,
      currentPage: 'pricing'
    });
  } catch (error) {
    res.redirect('/business/pricing');
  }
});

router.post('/pricing/:id', async (req, res) => {
  try {
    const {
      name, slug, description, type, base_price, billing_cycle, status,
      highlight, badge_text, annual_discount_pct, sort_order,
      cta_text, cta_url, icon_class, upsell_text, upsell_target_id,
      pay_as_you_go_text, trial_days, currency,
      stripe_price_id_monthly, stripe_price_id_yearly
    } = req.body;

    // Build features JSONB from checkbox inputs
    // Note: express.urlencoded({ extended: true }) parses duplicate keys as arrays
    const features = {};
    Object.keys(req.body).forEach(key => {
      if (key.startsWith('feature_')) {
        const featureKey = key.replace('feature_', '');
        const val = req.body[key];
        features[featureKey] = Array.isArray(val) ? val.includes('true') : val === 'true';
      }
    });

    const isHighlight = Array.isArray(highlight) ? highlight.includes('true') : highlight === 'true';
    const modelSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await db.query(
      `UPDATE price_models SET
        name=$1, slug=$2, description=$3, type=$4, base_price=$5, billing_cycle=$6,
        features=$7, status=$8, highlight=$9, badge_text=$10,
        annual_discount_pct=$11, sort_order=$12, cta_text=$13, cta_url=$14,
        icon_class=$15, upsell_text=$16, upsell_target_id=$17,
        pay_as_you_go_text=$18, trial_days=$19, currency=$20,
        stripe_price_id_monthly=$21, stripe_price_id_yearly=$22,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$23`,
      [
        name, modelSlug, description, type, base_price || null, billing_cycle || 'monthly',
        JSON.stringify(features), status, isHighlight, badge_text || null,
        parseInt(annual_discount_pct) || 20, parseInt(sort_order) || 0,
        cta_text || 'Choose Plan', cta_url || null, icon_class || null,
        upsell_text || null, upsell_target_id || null,
        pay_as_you_go_text || null, parseInt(trial_days) || 0, currency || 'USD',
        stripe_price_id_monthly || null, stripe_price_id_yearly || null,
        req.params.id
      ]
    );
    req.session.successMessage = 'Pricing package updated successfully';
    res.redirect('/business/pricing');
  } catch (error) {
    req.session.errorMessage = 'Failed to update pricing package';
    res.redirect(`/business/pricing/${req.params.id}/edit`);
  }
});

router.post('/pricing/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM price_models WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Pricing package deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete pricing package';
  }
  res.redirect('/business/pricing');
});

// ==================== PRICING FEATURES CATALOG ====================

router.get('/pricing-features', (req, res) => {
  res.redirect('/business/pricing?tab=features');
});

router.get('/pricing-features/new', (req, res) => {
  res.render('business/pricing/features-form', {
    title: 'New Pricing Feature - WTS Admin',
    feature: null,
    currentPage: 'pricing'
  });
});

router.post('/pricing-features', async (req, res) => {
  try {
    const { category_name, category_icon, feature_key, feature_name, feature_description, sort_order, category_sort_order, status } = req.body;

    await db.query(
      `INSERT INTO pricing_features (category_name, category_icon, feature_key, feature_name, feature_description, sort_order, category_sort_order, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [category_name, category_icon || 'fas fa-cog', feature_key, feature_name, feature_description || null,
       parseInt(sort_order) || 0, parseInt(category_sort_order) || 0, status || 'active']
    );
    req.session.successMessage = 'Pricing feature created successfully';
    res.redirect('/business/pricing?tab=features');
  } catch (error) {
    console.error('Create pricing feature error:', error);
    res.render('business/pricing/features-form', {
      title: 'New Pricing Feature - WTS Admin',
      feature: req.body,
      currentPage: 'pricing',
      error: 'Failed to create pricing feature. ' + (error.detail || error.message)
    });
  }
});

router.get('/pricing-features/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM pricing_features WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/pricing?tab=features');
    }
    res.render('business/pricing/features-form', {
      title: 'Edit Pricing Feature - WTS Admin',
      feature: result.rows[0],
      currentPage: 'pricing'
    });
  } catch (error) {
    res.redirect('/business/pricing?tab=features');
  }
});

router.post('/pricing-features/:id', async (req, res) => {
  try {
    const { category_name, category_icon, feature_key, feature_name, feature_description, sort_order, category_sort_order, status } = req.body;

    await db.query(
      `UPDATE pricing_features SET category_name=$1, category_icon=$2, feature_key=$3, feature_name=$4,
       feature_description=$5, sort_order=$6, category_sort_order=$7, status=$8, updated_at=CURRENT_TIMESTAMP
       WHERE id=$9`,
      [category_name, category_icon || 'fas fa-cog', feature_key, feature_name, feature_description || null,
       parseInt(sort_order) || 0, parseInt(category_sort_order) || 0, status, req.params.id]
    );
    req.session.successMessage = 'Pricing feature updated successfully';
    res.redirect('/business/pricing?tab=features');
  } catch (error) {
    req.session.errorMessage = 'Failed to update pricing feature';
    res.redirect(`/business/pricing-features/${req.params.id}/edit`);
  }
});

router.post('/pricing-features/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM pricing_features WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Pricing feature deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete pricing feature';
  }
  res.redirect('/business/pricing?tab=features');
});

module.exports = router;
