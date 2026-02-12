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

router.get('/automations/new', (req, res) => {
  res.render('business/automations/form', {
    title: 'New Automation - WTS Admin',
    automation: null,
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

// ==================== SIDEBAR ITEMS ====================

router.get('/sidebar', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM sidebar_items ORDER BY section ASC, sort_order ASC');
    const sections = {};
    result.rows.forEach(item => {
      if (!sections[item.section]) sections[item.section] = [];
      sections[item.section].push(item);
    });
    res.render('business/sidebar/list', {
      title: 'Sidebar Management - WTS Admin',
      items: result.rows,
      sections,
      currentPage: 'sidebar'
    });
  } catch (error) {
    res.render('business/sidebar/list', {
      title: 'Sidebar Management - WTS Admin',
      items: [],
      sections: {},
      currentPage: 'sidebar',
      error: 'Failed to load sidebar items'
    });
  }
});

router.get('/sidebar/new', (req, res) => {
  res.render('business/sidebar/form', {
    title: 'New Sidebar Item - WTS Admin',
    item: null,
    currentPage: 'sidebar'
  });
});

// Verify that a page_url will match correctly (AJAX endpoint)
// IMPORTANT: Must be defined before /sidebar/:id routes to avoid :id capturing "verify-link"
router.get('/sidebar/verify-link', async (req, res) => {
  try {
    const inputPath = (req.query.path || '').trim();
    if (!inputPath) {
      return res.json({ error: 'No path provided' });
    }

    // Normalize exactly the same way page-sidebar.js does on the client
    let normalized = inputPath;
    if (normalized.endsWith('.html')) normalized = normalized.slice(0, -5);
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);

    // Fetch all page-sidebar items to run the matching logic
    const result = await db.query(
      `SELECT id, label, page_url, button_label, is_visible, section
       FROM sidebar_items
       WHERE section = 'page-sidebar' AND page_url IS NOT NULL
       ORDER BY sort_order ASC`
    );

    const matches = [];
    const conflicts = [];

    result.rows.forEach(item => {
      const pattern = item.page_url;
      if (!pattern) return;

      let isMatch = false;
      let matchType = '';

      if (pattern === normalized) {
        isMatch = true;
        matchType = 'exact';
      } else if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -1);
        if (normalized.startsWith(prefix)) {
          isMatch = true;
          matchType = 'wildcard';
        }
      } else if (normalized.endsWith('/') && pattern === normalized.slice(0, -1)) {
        isMatch = true;
        matchType = 'trailing-slash';
      } else if (pattern.endsWith('/') && normalized === pattern.slice(0, -1)) {
        isMatch = true;
        matchType = 'trailing-slash';
      }

      if (isMatch) {
        const entry = {
          id: item.id,
          label: item.label,
          page_url: item.page_url,
          button_label: item.button_label,
          is_visible: item.is_visible,
          match_type: matchType
        };
        if (item.is_visible) {
          matches.push(entry);
        } else {
          conflicts.push(entry);
        }
      }
    });

    // Also check if the current item being edited is excluded (pass its id)
    const excludeId = req.query.exclude || null;

    res.json({
      input: inputPath,
      normalized,
      matches: matches.filter(m => m.id !== excludeId),
      hidden_matches: conflicts.filter(m => m.id !== excludeId),
      total_sidebar_items: result.rows.length
    });
  } catch (error) {
    console.error('Sidebar verify-link error:', error);
    res.json({ error: 'Verification failed' });
  }
});

router.post('/sidebar', async (req, res) => {
  try {
    const { label, url, icon_class, section, sort_order, is_visible, open_in_new_tab, css_class, page_url, content_html, button_label } = req.body;

    await db.query(
      `INSERT INTO sidebar_items (label, url, icon_class, section, sort_order, is_visible, open_in_new_tab, css_class, page_url, content_html, button_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [label, url || null, icon_class || 'fas fa-question-circle', section, parseInt(sort_order) || 0,
       is_visible !== 'false', open_in_new_tab === 'true', css_class || null,
       page_url || null, content_html || null, button_label || 'Help']
    );
    req.session.successMessage = 'Sidebar item created successfully';
    res.redirect('/business/sidebar');
  } catch (error) {
    console.error('Create sidebar item error:', error);
    res.render('business/sidebar/form', {
      title: 'New Sidebar Item - WTS Admin',
      item: req.body,
      currentPage: 'sidebar',
      error: 'Failed to create sidebar item'
    });
  }
});

router.get('/sidebar/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM sidebar_items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/sidebar');
    }
    res.render('business/sidebar/form', {
      title: 'Edit Sidebar Item - WTS Admin',
      item: result.rows[0],
      currentPage: 'sidebar'
    });
  } catch (error) {
    res.redirect('/business/sidebar');
  }
});

router.post('/sidebar/:id', async (req, res) => {
  try {
    const { label, url, icon_class, section, sort_order, is_visible, open_in_new_tab, css_class, page_url, content_html, button_label } = req.body;

    await db.query(
      `UPDATE sidebar_items SET label=$1, url=$2, icon_class=$3, section=$4, sort_order=$5,
       is_visible=$6, open_in_new_tab=$7, css_class=$8, page_url=$9, content_html=$10, button_label=$11,
       updated_at=CURRENT_TIMESTAMP WHERE id=$12`,
      [label, url || null, icon_class || 'fas fa-question-circle', section, parseInt(sort_order) || 0,
       is_visible !== 'false', open_in_new_tab === 'true', css_class || null,
       page_url || null, content_html || null, button_label || 'Help', req.params.id]
    );
    req.session.successMessage = 'Sidebar item updated successfully';
    res.redirect('/business/sidebar');
  } catch (error) {
    req.session.errorMessage = 'Failed to update sidebar item';
    res.redirect(`/business/sidebar/${req.params.id}/edit`);
  }
});

router.post('/sidebar/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM sidebar_items WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Sidebar item deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete sidebar item';
  }
  res.redirect('/business/sidebar');
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

// ==================== FORM TEMPLATES (Form Builder) ====================

router.get('/form-templates', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM form_templates ORDER BY created_at DESC');
    // Load button counts per form_type
    const btnResult = await db.query(
      `SELECT form_type, COUNT(*)::int AS button_count FROM form_buttons GROUP BY form_type`
    );
    const buttonCounts = {};
    btnResult.rows.forEach(r => { buttonCounts[r.form_type] = r.button_count; });
    res.render('business/form-templates/list', {
      title: 'Form Templates - WTS Admin',
      currentPage: 'form-templates',
      templates: result.rows,
      buttonCounts
    });
  } catch (error) {
    console.error('Form templates list error:', error);
    req.session.errorMessage = 'Failed to load form templates';
    res.redirect('/business');
  }
});

router.get('/form-templates/new', (req, res) => {
  res.render('business/form-templates/form', {
    title: 'Create Form Template - WTS Admin',
    currentPage: 'form-templates',
    template: null,
    buttons: []
  });
});

router.post('/form-templates', async (req, res) => {
  try {
    const { form_type, title, subtitle, submit_button_text, success_message, status } = req.body;

    // Parse fields from the dynamic form builder
    const fields = [];
    const fieldNames = Array.isArray(req.body['field_name']) ? req.body['field_name'] : (req.body['field_name'] ? [req.body['field_name']] : []);
    const fieldLabels = Array.isArray(req.body['field_label']) ? req.body['field_label'] : (req.body['field_label'] ? [req.body['field_label']] : []);
    const fieldTypes = Array.isArray(req.body['field_type']) ? req.body['field_type'] : (req.body['field_type'] ? [req.body['field_type']] : []);
    const fieldPlaceholders = Array.isArray(req.body['field_placeholder']) ? req.body['field_placeholder'] : (req.body['field_placeholder'] ? [req.body['field_placeholder']] : []);
    const fieldRequired = Array.isArray(req.body['field_required']) ? req.body['field_required'] : (req.body['field_required'] ? [req.body['field_required']] : []);
    const fieldOptions = Array.isArray(req.body['field_options']) ? req.body['field_options'] : (req.body['field_options'] ? [req.body['field_options']] : []);

    for (let i = 0; i < fieldNames.length; i++) {
      if (!fieldNames[i]) continue;
      const field = {
        name: fieldNames[i].trim(),
        label: (fieldLabels[i] || '').trim(),
        type: fieldTypes[i] || 'text',
        placeholder: (fieldPlaceholders[i] || '').trim(),
        required: fieldRequired[i] === 'true'
      };
      if (field.type === 'select' && fieldOptions[i]) {
        field.options = fieldOptions[i].split(',').map(o => o.trim()).filter(Boolean);
      }
      fields.push(field);
    }

    await db.query(
      `INSERT INTO form_templates (form_type, title, subtitle, fields, submit_button_text, success_message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [form_type.trim(), title.trim(), subtitle || null, JSON.stringify(fields),
       submit_button_text || 'Submit', success_message || null, status || 'active']
    );
    req.session.successMessage = 'Form template created successfully';
    res.redirect('/business/form-templates');
  } catch (error) {
    console.error('Create form template error:', error);
    req.session.errorMessage = 'Failed to create form template. ' + (error.detail || error.message);
    res.redirect('/business/form-templates/new');
  }
});

router.get('/form-templates/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM form_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/form-templates');
    }
    const template = result.rows[0];
    const btnResult = await db.query(
      'SELECT * FROM form_buttons WHERE form_type = $1 ORDER BY sort_order ASC, created_at ASC',
      [template.form_type]
    );
    res.render('business/form-templates/form', {
      title: 'Edit Form Template - WTS Admin',
      currentPage: 'form-templates',
      template,
      buttons: btnResult.rows
    });
  } catch (error) {
    res.redirect('/business/form-templates');
  }
});

router.post('/form-templates/:id', async (req, res) => {
  try {
    const { form_type, title, subtitle, submit_button_text, success_message, status } = req.body;

    // Parse fields
    const fields = [];
    const fieldNames = Array.isArray(req.body['field_name']) ? req.body['field_name'] : (req.body['field_name'] ? [req.body['field_name']] : []);
    const fieldLabels = Array.isArray(req.body['field_label']) ? req.body['field_label'] : (req.body['field_label'] ? [req.body['field_label']] : []);
    const fieldTypes = Array.isArray(req.body['field_type']) ? req.body['field_type'] : (req.body['field_type'] ? [req.body['field_type']] : []);
    const fieldPlaceholders = Array.isArray(req.body['field_placeholder']) ? req.body['field_placeholder'] : (req.body['field_placeholder'] ? [req.body['field_placeholder']] : []);
    const fieldRequired = Array.isArray(req.body['field_required']) ? req.body['field_required'] : (req.body['field_required'] ? [req.body['field_required']] : []);
    const fieldOptions = Array.isArray(req.body['field_options']) ? req.body['field_options'] : (req.body['field_options'] ? [req.body['field_options']] : []);

    for (let i = 0; i < fieldNames.length; i++) {
      if (!fieldNames[i]) continue;
      const field = {
        name: fieldNames[i].trim(),
        label: (fieldLabels[i] || '').trim(),
        type: fieldTypes[i] || 'text',
        placeholder: (fieldPlaceholders[i] || '').trim(),
        required: fieldRequired[i] === 'true'
      };
      if (field.type === 'select' && fieldOptions[i]) {
        field.options = fieldOptions[i].split(',').map(o => o.trim()).filter(Boolean);
      }
      fields.push(field);
    }

    await db.query(
      `UPDATE form_templates SET form_type=$1, title=$2, subtitle=$3, fields=$4,
       submit_button_text=$5, success_message=$6, status=$7, updated_at=CURRENT_TIMESTAMP
       WHERE id=$8`,
      [form_type.trim(), title.trim(), subtitle || null, JSON.stringify(fields),
       submit_button_text || 'Submit', success_message || null, status || 'active', req.params.id]
    );
    req.session.successMessage = 'Form template updated successfully';
    res.redirect('/business/form-templates');
  } catch (error) {
    console.error('Update form template error:', error);
    req.session.errorMessage = 'Failed to update form template. ' + (error.detail || error.message);
    res.redirect(`/business/form-templates/${req.params.id}/edit`);
  }
});

router.post('/form-templates/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM form_templates WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Form template deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete form template';
  }
  res.redirect('/business/form-templates');
});

// ==================== FORM BUTTONS (Linked Buttons) ====================

// Add a button to a form template
router.post('/form-buttons', async (req, res) => {
  try {
    const {
      form_type, button_label, page_url, style_preset, custom_css, custom_js,
      rel_nofollow, rel_noopener, rel_noreferrer, target_blank, sort_order
    } = req.body;

    if (!form_type || !button_label) {
      req.session.errorMessage = 'Form type and button label are required.';
      return res.redirect('back');
    }

    await db.query(
      `INSERT INTO form_buttons (form_type, button_label, page_url, style_preset, custom_css, custom_js,
        rel_nofollow, rel_noopener, rel_noreferrer, target_blank, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        form_type.trim(),
        button_label.trim(),
        page_url || null,
        style_preset || 'primary',
        custom_css || null,
        custom_js || null,
        rel_nofollow === 'on' || rel_nofollow === 'true',
        rel_noopener !== 'off' && rel_noopener !== 'false',
        rel_noreferrer === 'on' || rel_noreferrer === 'true',
        target_blank === 'on' || target_blank === 'true',
        parseInt(sort_order) || 0
      ]
    );
    req.session.successMessage = 'Button added successfully';
  } catch (error) {
    console.error('Add form button error:', error);
    req.session.errorMessage = 'Failed to add button. ' + (error.detail || error.message);
  }
  res.redirect('back');
});

// Update a button
router.post('/form-buttons/:id', async (req, res) => {
  try {
    const {
      button_label, page_url, style_preset, custom_css, custom_js,
      rel_nofollow, rel_noopener, rel_noreferrer, target_blank, sort_order, status
    } = req.body;

    await db.query(
      `UPDATE form_buttons SET
        button_label=$1, page_url=$2, style_preset=$3, custom_css=$4, custom_js=$5,
        rel_nofollow=$6, rel_noopener=$7, rel_noreferrer=$8, target_blank=$9,
        sort_order=$10, status=$11, updated_at=CURRENT_TIMESTAMP
       WHERE id=$12`,
      [
        (button_label || '').trim(),
        page_url || null,
        style_preset || 'primary',
        custom_css || null,
        custom_js || null,
        rel_nofollow === 'on' || rel_nofollow === 'true',
        rel_noopener !== 'off' && rel_noopener !== 'false',
        rel_noreferrer === 'on' || rel_noreferrer === 'true',
        target_blank === 'on' || target_blank === 'true',
        parseInt(sort_order) || 0,
        status || 'active',
        req.params.id
      ]
    );
    req.session.successMessage = 'Button updated successfully';
  } catch (error) {
    console.error('Update form button error:', error);
    req.session.errorMessage = 'Failed to update button';
  }
  res.redirect('back');
});

// Delete a button
router.post('/form-buttons/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM form_buttons WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Button deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete button';
  }
  res.redirect('back');
});

// ==================== FORM SUBMISSIONS ====================

// List all form submissions (with optional type filter)
router.get('/submissions', async (req, res) => {
  try {
    const typeFilter = req.query.type || '';
    let query = 'SELECT * FROM form_submissions';
    const params = [];

    if (typeFilter) {
      query += ' WHERE form_type = $1';
      params.push(typeFilter);
    }
    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await db.query(query, params);
    res.render('business/submissions/list', {
      title: 'Form Submissions - WTS Admin',
      currentPage: 'submissions',
      submissions: result.rows,
      activeFilter: typeFilter,
      successMessage: req.session.successMessage,
      errorMessage: req.session.errorMessage
    });
    req.session.successMessage = null;
    req.session.errorMessage = null;
  } catch (error) {
    console.error('Submissions list error:', error);
    req.session.errorMessage = 'Failed to load submissions';
    res.redirect('/business');
  }
});

// Update submission status
router.post('/submissions/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['new', 'reviewed', 'contacted', 'closed'];
    if (!allowed.includes(status)) {
      req.session.errorMessage = 'Invalid status';
      return res.redirect('/business/submissions');
    }
    await db.query(
      'UPDATE form_submissions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, req.params.id]
    );
    req.session.successMessage = 'Status updated';
  } catch (error) {
    req.session.errorMessage = 'Failed to update status';
  }
  res.redirect('/business/submissions');
});

// Delete submission
router.post('/submissions/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM form_submissions WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Submission deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete submission';
  }
  res.redirect('/business/submissions');
});

module.exports = router;
