const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');

const router = express.Router();
router.use(ensureAuthenticated);

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
    const result = await db.query('SELECT * FROM products ORDER BY name ASC');
    res.render('business/products/list', {
      title: 'Products - WTS Admin',
      products: result.rows,
      currentPage: 'products'
    });
  } catch (error) {
    res.render('business/products/list', {
      title: 'Products - WTS Admin',
      products: [],
      currentPage: 'products',
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
    const { name, description, price, currency, category, features, image_url, status } = req.body;
    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];

    await db.query(
      'INSERT INTO products (name, description, price, currency, category, features, image_url, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [name, description, price || null, currency || 'USD', category, featuresArray, image_url, status || 'active']
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
    const { name, description, price, currency, category, features, image_url, status } = req.body;
    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];

    await db.query(
      'UPDATE products SET name = $1, description = $2, price = $3, currency = $4, category = $5, features = $6, image_url = $7, status = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9',
      [name, description, price || null, currency, category, featuresArray, image_url, status, req.params.id]
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

// ==================== PRICE MODELS ====================

router.get('/pricing', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM price_models ORDER BY name ASC');
    res.render('business/pricing/list', {
      title: 'Price Models - WTS Admin',
      models: result.rows,
      currentPage: 'pricing'
    });
  } catch (error) {
    res.render('business/pricing/list', {
      title: 'Price Models - WTS Admin',
      models: [],
      currentPage: 'pricing',
      error: 'Failed to load price models'
    });
  }
});

router.get('/pricing/new', (req, res) => {
  res.render('business/pricing/form', {
    title: 'New Price Model - WTS Admin',
    model: null,
    currentPage: 'pricing'
  });
});

router.post('/pricing', async (req, res) => {
  try {
    const { name, description, type, base_price, billing_cycle, features, limits, status } = req.body;

    await db.query(
      'INSERT INTO price_models (name, description, type, base_price, billing_cycle, features, limits, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [name, description, type, base_price || null, billing_cycle, features ? JSON.parse(features) : null, limits ? JSON.parse(limits) : null, status || 'active']
    );
    req.session.successMessage = 'Price model created successfully';
    res.redirect('/business/pricing');
  } catch (error) {
    console.error('Create price model error:', error);
    res.render('business/pricing/form', {
      title: 'New Price Model - WTS Admin',
      model: req.body,
      currentPage: 'pricing',
      error: 'Failed to create price model'
    });
  }
});

router.get('/pricing/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM price_models WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/business/pricing');
    }
    res.render('business/pricing/form', {
      title: 'Edit Price Model - WTS Admin',
      model: result.rows[0],
      currentPage: 'pricing'
    });
  } catch (error) {
    res.redirect('/business/pricing');
  }
});

router.post('/pricing/:id', async (req, res) => {
  try {
    const { name, description, type, base_price, billing_cycle, features, limits, status } = req.body;

    await db.query(
      'UPDATE price_models SET name = $1, description = $2, type = $3, base_price = $4, billing_cycle = $5, features = $6, limits = $7, status = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9',
      [name, description, type, base_price || null, billing_cycle, features ? JSON.parse(features) : null, limits ? JSON.parse(limits) : null, status, req.params.id]
    );
    req.session.successMessage = 'Price model updated successfully';
    res.redirect('/business/pricing');
  } catch (error) {
    req.session.errorMessage = 'Failed to update price model';
    res.redirect(`/business/pricing/${req.params.id}/edit`);
  }
});

router.post('/pricing/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM price_models WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Price model deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete price model';
  }
  res.redirect('/business/pricing');
});

module.exports = router;
