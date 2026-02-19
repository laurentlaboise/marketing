const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');

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

// ==================== AUTOMATIONS ====================

router.get('/automations', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM automations ORDER BY created_at DESC');
    res.render('business/automations/list', {
      title: 'Automations - WTS Admin',
      automations: result.rows,
      currentPage: 'automations'
    });
  } catch (error) {
    res.render('business/automations/list', {
      title: 'Automations - WTS Admin',
      automations: [],
      currentPage: 'automations',
      error: 'Failed to load automations'
    });
  }
});

router.get('/automations/new', async (req, res) => {
  // Load integrations for the left pane
  let integrations = [];
  try {
    const result = await db.query('SELECT * FROM integrations_registry WHERE workspace_id IS NOT NULL ORDER BY platform_name ASC');
    integrations = result.rows;
  } catch (e) { /* table may not exist yet */ }

  res.render('business/automations/compiler', {
    title: 'Automation Compiler - WTS Admin',
    automation: null,
    integrations,
    currentPage: 'automations'
  });
});

router.post('/automations', async (req, res) => {
  try {
    const { name, description, trigger_type, trigger_config, action_type, action_config, status } = req.body;

    await db.query(
      'INSERT INTO automations (name, description, trigger_type, trigger_config, action_type, action_config, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [name, description, trigger_type, trigger_config ? JSON.parse(trigger_config) : null, action_type, action_config ? JSON.parse(action_config) : null, status || 'inactive']
    );
    req.session.successMessage = 'Automation created successfully';
    res.redirect('/business/automations');
  } catch (error) {
    console.error('Create automation error:', error);
    res.render('business/automations/form', {
      title: 'New Automation - WTS Admin',
      automation: req.body,
      currentPage: 'automations',
      error: 'Failed to create automation'
    });
  }
});

router.get('/automations/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM automations WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/automations');
    }
    res.render('business/automations/form', {
      title: 'Edit Automation - WTS Admin',
      automation: result.rows[0],
      currentPage: 'automations'
    });
  } catch (error) {
    res.redirect('/business/automations');
  }
});

router.post('/automations/:id', async (req, res) => {
  try {
    const { name, description, trigger_type, trigger_config, action_type, action_config, status } = req.body;

    await db.query(
      'UPDATE automations SET name = $1, description = $2, trigger_type = $3, trigger_config = $4, action_type = $5, action_config = $6, status = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8',
      [name, description, trigger_type, trigger_config ? JSON.parse(trigger_config) : null, action_type, action_config ? JSON.parse(action_config) : null, status, req.params.id]
    );
    req.session.successMessage = 'Automation updated successfully';
    res.redirect('/business/automations');
  } catch (error) {
    req.session.errorMessage = 'Failed to update automation';
    res.redirect(`/business/automations/${req.params.id}/edit`);
  }
});

router.post('/automations/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM automations WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Automation deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete automation';
  }
  res.redirect('/business/automations');
});

// ==================== PRODUCTS ====================

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

router.get('/products/new', (req, res) => {
  res.render('business/products/form', {
    title: 'New Product - WTS Admin',
    product: null,
    currentPage: 'products'
  });
});

router.post('/products', async (req, res) => {
  try {
    const {
      name, slug, description, price, currency, category, features, image_url, status,
      service_page, icon_class, animation_class, sort_order, product_type, download_url,
      slide_in_title, slide_in_subtitle, slide_in_content, slide_in_image, slide_in_video,
      stripe_product_id, stripe_price_id, is_featured
    } = req.body;

    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const productSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await db.query(
      `INSERT INTO products (
        name, slug, description, price, currency, category, features, image_url, status,
        service_page, icon_class, animation_class, sort_order, product_type, download_url,
        slide_in_title, slide_in_subtitle, slide_in_content, slide_in_image, slide_in_video,
        stripe_product_id, stripe_price_id, is_featured
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [
        name, productSlug, description, price || null, currency || 'USD', category, featuresArray, image_url, status || 'active',
        service_page || null, icon_class || 'fas fa-box', animation_class || 'kinetic-pulse-float',
        parseInt(sort_order) || 0, product_type || 'service', download_url || null,
        slide_in_title || null, slide_in_subtitle || null, slide_in_content || null,
        slide_in_image || null, slide_in_video || null,
        stripe_product_id || null, stripe_price_id || null, is_featured === 'true'
      ]
    );
    req.session.successMessage = 'Product created successfully';
    res.redirect('/business/products');
  } catch (error) {
    console.error('Create product error:', error);
    res.render('business/products/form', {
      title: 'New Product - WTS Admin',
      product: req.body,
      currentPage: 'products',
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
      currentPage: 'products'
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
      stripe_product_id, stripe_price_id, is_featured
    } = req.body;

    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const productSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await db.query(
      `UPDATE products SET
        name=$1, slug=$2, description=$3, price=$4, currency=$5, category=$6, features=$7,
        image_url=$8, status=$9, service_page=$10, icon_class=$11, animation_class=$12,
        sort_order=$13, product_type=$14, download_url=$15, slide_in_title=$16,
        slide_in_subtitle=$17, slide_in_content=$18, slide_in_image=$19, slide_in_video=$20,
        stripe_product_id=$21, stripe_price_id=$22, is_featured=$23, updated_at=CURRENT_TIMESTAMP
      WHERE id=$24`,
      [
        name, productSlug, description, price || null, currency, category, featuresArray,
        image_url, status, service_page || null, icon_class || 'fas fa-box',
        animation_class || 'kinetic-pulse-float', parseInt(sort_order) || 0,
        product_type || 'service', download_url || null,
        slide_in_title || null, slide_in_subtitle || null, slide_in_content || null,
        slide_in_image || null, slide_in_video || null,
        stripe_product_id || null, stripe_price_id || null, is_featured === 'true',
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

// ==================== ORDERS (read-only for admin) ====================

router.get('/orders', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.*, p.name as product_name FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       ORDER BY o.created_at DESC`
    );
    res.render('business/orders/list', {
      title: 'Orders - WTS Admin',
      orders: result.rows,
      currentPage: 'orders'
    });
  } catch (error) {
    res.render('business/orders/list', {
      title: 'Orders - WTS Admin',
      orders: [],
      currentPage: 'orders',
      error: 'Failed to load orders'
    });
  }
});

// ==================== PRICE MODELS (Subscription Packages) ====================

router.get('/pricing', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM price_models ORDER BY sort_order ASC, name ASC');
    res.render('business/pricing/list', {
      title: 'Pricing Packages - WTS Admin',
      models: result.rows,
      currentPage: 'pricing'
    });
  } catch (error) {
    res.render('business/pricing/list', {
      title: 'Pricing Packages - WTS Admin',
      models: [],
      currentPage: 'pricing',
      error: 'Failed to load pricing packages'
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

router.get('/pricing-features', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM pricing_features ORDER BY category_sort_order ASC, sort_order ASC');
    const categories = {};
    result.rows.forEach(f => {
      if (!categories[f.category_name]) categories[f.category_name] = [];
      categories[f.category_name].push(f);
    });
    res.render('business/pricing/features-list', {
      title: 'Pricing Features Catalog - WTS Admin',
      features: result.rows,
      categories,
      currentPage: 'pricing-features'
    });
  } catch (error) {
    res.render('business/pricing/features-list', {
      title: 'Pricing Features Catalog - WTS Admin',
      features: [],
      categories: {},
      currentPage: 'pricing-features',
      error: 'Failed to load pricing features'
    });
  }
});

router.get('/pricing-features/new', (req, res) => {
  res.render('business/pricing/features-form', {
    title: 'New Pricing Feature - WTS Admin',
    feature: null,
    currentPage: 'pricing-features'
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
    res.redirect('/business/pricing-features');
  } catch (error) {
    console.error('Create pricing feature error:', error);
    res.render('business/pricing/features-form', {
      title: 'New Pricing Feature - WTS Admin',
      feature: req.body,
      currentPage: 'pricing-features',
      error: 'Failed to create pricing feature. ' + (error.detail || error.message)
    });
  }
});

router.get('/pricing-features/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM pricing_features WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/pricing-features');
    }
    res.render('business/pricing/features-form', {
      title: 'Edit Pricing Feature - WTS Admin',
      feature: result.rows[0],
      currentPage: 'pricing-features'
    });
  } catch (error) {
    res.redirect('/business/pricing-features');
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
    res.redirect('/business/pricing-features');
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
  res.redirect('/business/pricing-features');
});

module.exports = router;
