const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const webdevLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
router.use(webdevLimiter);
router.use(ensureAuthenticated);

// Deployment platforms metadata
const PLATFORMS = {
  railway: { name: 'Railway', icon: 'fa-train', color: '#0B0D0E' },
  vercel: { name: 'Vercel', icon: 'fa-triangle-exclamation', color: '#000' },
  netlify: { name: 'Netlify', icon: 'fa-network-wired', color: '#00C7B7' },
  cloudflare: { name: 'Cloudflare Pages', icon: 'fa-cloud', color: '#F38020' },
  github: { name: 'GitHub Pages', icon: 'fa-github', color: '#24292e' },
  custom: { name: 'Custom/Self-hosted', icon: 'fa-server', color: '#667eea' },
};

const PURPOSES = [
  { value: 'landing', label: 'Landing Page' },
  { value: 'lead-gen', label: 'Lead Generation' },
  { value: 'sales', label: 'Sales Page' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'resource', label: 'Resource Center' },
  { value: 'blog', label: 'Blog / Content Hub' },
  { value: 'docs', label: 'Documentation' },
  { value: 'app', label: 'Web Application' },
];

const TEMPLATES = [
  { value: 'blank', label: 'Blank', icon: 'fa-file', desc: 'Start from scratch' },
  { value: 'landing', label: 'Landing Page', icon: 'fa-rocket', desc: 'Hero, features, CTA' },
  { value: 'sales', label: 'Sales Page', icon: 'fa-dollar-sign', desc: 'Long-form sales copy' },
  { value: 'lead-gen', label: 'Lead Capture', icon: 'fa-magnet', desc: 'Form-focused page' },
  { value: 'portfolio', label: 'Portfolio', icon: 'fa-briefcase', desc: 'Project showcase' },
  { value: 'docs', label: 'Documentation', icon: 'fa-book', desc: 'Technical docs site' },
];

// Helper to create URL-safe slugs
function createSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ==========================================
// MICROSITES
// ==========================================

// List all microsites
router.get('/microsites', async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT m.*,
        (SELECT COUNT(*) FROM microsite_domains WHERE microsite_id = m.id) as domain_count,
        (SELECT COUNT(*) FROM microsite_deployments WHERE microsite_id = m.id) as deployment_count,
        (SELECT status FROM microsite_deployments WHERE microsite_id = m.id ORDER BY created_at DESC LIMIT 1) as last_deploy_status
      FROM microsites m WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      query += ` AND m.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (m.name ILIKE $${params.length} OR m.primary_domain ILIKE $${params.length} OR m.description ILIKE $${params.length})`;
    }
    query += ' ORDER BY m.updated_at DESC';

    const result = await db.query(query, params);

    res.render('webdev/microsites/list', {
      title: 'Microsites - WTS Admin',
      currentPage: 'microsites',
      microsites: result.rows,
      platforms: PLATFORMS,
      filter: { status: status || 'all', search: search || '' },
    });
  } catch (error) {
    console.error('Microsites list error:', error);
    res.render('webdev/microsites/list', {
      title: 'Microsites - WTS Admin',
      currentPage: 'microsites',
      microsites: [],
      platforms: PLATFORMS,
      filter: { status: 'all', search: '' },
    });
  }
});

// New microsite form
router.get('/microsites/new', (req, res) => {
  res.render('webdev/microsites/form', {
    title: 'Create Microsite - WTS Admin',
    currentPage: 'microsites',
    microsite: null,
    platforms: PLATFORMS,
    purposes: PURPOSES,
    templates: TEMPLATES,
  });
});

// Create microsite
router.post('/microsites', async (req, res) => {
  try {
    const {
      name, description, purpose, primary_domain, github_repo, github_branch,
      deploy_platform, deploy_url, deploy_webhook, seo_title, seo_description,
      seo_keywords, og_title, og_description, og_image, analytics_id, template, status
    } = req.body;

    const slug = createSlug(name);
    const keywordsArray = seo_keywords ? seo_keywords.split(',').map(k => k.trim()).filter(Boolean) : [];

    const result = await db.query(
      `INSERT INTO microsites (name, slug, description, purpose, primary_domain, github_repo, github_branch,
        deploy_platform, deploy_url, deploy_webhook, seo_title, seo_description, seo_keywords,
        og_title, og_description, og_image, analytics_id, template, status, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [name, slug, description, purpose, primary_domain, github_repo, github_branch || 'main',
       deploy_platform, deploy_url, deploy_webhook, seo_title, seo_description, keywordsArray,
       og_title, og_description, og_image, analytics_id, template, status || 'draft', req.user.id]
    );

    // Add primary domain to domains table
    if (primary_domain) {
      await db.query(
        `INSERT INTO microsite_domains (microsite_id, domain, type) VALUES ($1, $2, 'primary')`,
        [result.rows[0].id, primary_domain]
      );
    }

    req.session.successMessage = 'Microsite created successfully';
    res.redirect('/webdev/microsites/' + result.rows[0].id);
  } catch (error) {
    console.error('Create microsite error:', error);
    req.session.errorMessage = 'Failed to create microsite: ' + error.message;
    res.redirect('/webdev/microsites/new');
  }
});

// View microsite detail
router.get('/microsites/:id', async (req, res) => {
  try {
    const microsite = await db.query('SELECT * FROM microsites WHERE id = $1', [req.params.id]);
    if (microsite.rows.length === 0) {
      req.session.errorMessage = 'Microsite not found';
      return res.redirect('/webdev/microsites');
    }

    const domains = await db.query(
      'SELECT * FROM microsite_domains WHERE microsite_id = $1 ORDER BY type ASC, created_at ASC',
      [req.params.id]
    );

    const deployments = await db.query(
      `SELECT d.*, u.first_name, u.last_name
       FROM microsite_deployments d
       LEFT JOIN users u ON d.deployed_by = u.id
       WHERE d.microsite_id = $1
       ORDER BY d.created_at DESC LIMIT 20`,
      [req.params.id]
    );

    const tab = req.query.tab || 'overview';

    res.render('webdev/microsites/detail', {
      title: microsite.rows[0].name + ' - WTS Admin',
      currentPage: 'microsites',
      microsite: microsite.rows[0],
      domains: domains.rows,
      deployments: deployments.rows,
      platforms: PLATFORMS,
      purposes: PURPOSES,
      tab,
    });
  } catch (error) {
    console.error('Microsite detail error:', error);
    req.session.errorMessage = 'Failed to load microsite';
    res.redirect('/webdev/microsites');
  }
});

// Edit microsite form
router.get('/microsites/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM microsites WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Microsite not found';
      return res.redirect('/webdev/microsites');
    }

    res.render('webdev/microsites/form', {
      title: 'Edit ' + result.rows[0].name + ' - WTS Admin',
      currentPage: 'microsites',
      microsite: result.rows[0],
      platforms: PLATFORMS,
      purposes: PURPOSES,
      templates: TEMPLATES,
    });
  } catch (error) {
    console.error('Edit microsite error:', error);
    req.session.errorMessage = 'Failed to load microsite';
    res.redirect('/webdev/microsites');
  }
});

// Update microsite
router.post('/microsites/:id', async (req, res) => {
  try {
    const {
      name, description, purpose, primary_domain, github_repo, github_branch,
      deploy_platform, deploy_url, deploy_webhook, seo_title, seo_description,
      seo_keywords, og_title, og_description, og_image, analytics_id, template,
      robots_txt, sitemap_url, status
    } = req.body;

    const keywordsArray = seo_keywords ? seo_keywords.split(',').map(k => k.trim()).filter(Boolean) : [];

    await db.query(
      `UPDATE microsites SET
        name=$1, description=$2, purpose=$3, primary_domain=$4, github_repo=$5, github_branch=$6,
        deploy_platform=$7, deploy_url=$8, deploy_webhook=$9, seo_title=$10, seo_description=$11,
        seo_keywords=$12, og_title=$13, og_description=$14, og_image=$15, analytics_id=$16,
        template=$17, robots_txt=$18, sitemap_url=$19, status=$20, updated_at=CURRENT_TIMESTAMP
       WHERE id=$21`,
      [name, description, purpose, primary_domain, github_repo, github_branch || 'main',
       deploy_platform, deploy_url, deploy_webhook, seo_title, seo_description, keywordsArray,
       og_title, og_description, og_image, analytics_id, template,
       robots_txt, sitemap_url, status || 'draft', req.params.id]
    );

    req.session.successMessage = 'Microsite updated successfully';
    res.redirect('/webdev/microsites/' + req.params.id);
  } catch (error) {
    console.error('Update microsite error:', error);
    req.session.errorMessage = 'Failed to update microsite: ' + error.message;
    res.redirect('/webdev/microsites/' + req.params.id + '/edit');
  }
});

// Delete microsite
router.post('/microsites/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM microsites WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Microsite deleted successfully';
    res.redirect('/webdev/microsites');
  } catch (error) {
    console.error('Delete microsite error:', error);
    req.session.errorMessage = 'Failed to delete microsite';
    res.redirect('/webdev/microsites');
  }
});

// ==========================================
// DOMAINS
// ==========================================

// Add domain to microsite
router.post('/microsites/:id/domains', async (req, res) => {
  try {
    const { domain, type } = req.body;
    await db.query(
      'INSERT INTO microsite_domains (microsite_id, domain, type) VALUES ($1, $2, $3)',
      [req.params.id, domain, type || 'secondary']
    );
    req.session.successMessage = 'Domain added successfully';
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=domains');
  } catch (error) {
    console.error('Add domain error:', error);
    req.session.errorMessage = 'Failed to add domain';
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=domains');
  }
});

// Remove domain
router.post('/microsites/:id/domains/:domainId/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM microsite_domains WHERE id = $1 AND microsite_id = $2', [req.params.domainId, req.params.id]);
    req.session.successMessage = 'Domain removed';
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=domains');
  } catch (error) {
    console.error('Remove domain error:', error);
    req.session.errorMessage = 'Failed to remove domain';
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=domains');
  }
});

// Toggle DNS verified
router.post('/microsites/:id/domains/:domainId/verify', async (req, res) => {
  try {
    await db.query(
      'UPDATE microsite_domains SET dns_verified = NOT dns_verified WHERE id = $1 AND microsite_id = $2',
      [req.params.domainId, req.params.id]
    );
    req.session.successMessage = 'DNS verification status updated';
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=domains');
  } catch (error) {
    console.error('Verify domain error:', error);
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=domains');
  }
});

// ==========================================
// DEPLOYMENTS
// ==========================================

// Trigger manual deployment (logs it)
router.post('/microsites/:id/deploy', async (req, res) => {
  try {
    const { commit_message } = req.body;
    await db.query(
      `INSERT INTO microsite_deployments (microsite_id, status, trigger, commit_message, deployed_by)
       VALUES ($1, 'success', 'manual', $2, $3)`,
      [req.params.id, commit_message || 'Manual deployment', req.user.id]
    );
    await db.query(
      'UPDATE microsites SET last_deployed_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );
    req.session.successMessage = 'Deployment logged successfully';
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=deployments');
  } catch (error) {
    console.error('Deploy error:', error);
    req.session.errorMessage = 'Failed to log deployment';
    res.redirect('/webdev/microsites/' + req.params.id + '?tab=deployments');
  }
});

// ==========================================
// NOTIFICATIONS API
// ==========================================

// Get notification count (for header badge)
router.get('/notifications/count', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    res.json({ count: 0 });
  }
});

// Get recent notifications
router.get('/notifications', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.render('webdev/notifications', {
      title: 'Notifications - WTS Admin',
      currentPage: 'notifications',
      notifications: result.rows,
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.render('webdev/notifications', {
      title: 'Notifications - WTS Admin',
      currentPage: 'notifications',
      notifications: [],
    });
  }
});

// Mark notification as read
router.post('/notifications/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false });
  }
});

// Mark all as read
router.post('/notifications/read-all', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    req.session.successMessage = 'All notifications marked as read';
    res.redirect('/webdev/notifications');
  } catch (error) {
    res.redirect('/webdev/notifications');
  }
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
    res.render('webdev/sidebar/list', {
      title: 'Sidebar Management - WTS Admin',
      items: result.rows,
      sections,
      currentPage: 'sidebar'
    });
  } catch (error) {
    res.render('webdev/sidebar/list', {
      title: 'Sidebar Management - WTS Admin',
      items: [],
      sections: {},
      currentPage: 'sidebar',
      error: 'Failed to load sidebar items'
    });
  }
});

router.get('/sidebar/new', (req, res) => {
  res.render('webdev/sidebar/form', {
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

    let normalized = inputPath;
    if (normalized.endsWith('.html')) normalized = normalized.slice(0, -5);
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);

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
    res.redirect('/webdev/sidebar');
  } catch (error) {
    console.error('Create sidebar item error:', error);
    res.render('webdev/sidebar/form', {
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
      return res.redirect('/webdev/sidebar');
    }
    res.render('webdev/sidebar/form', {
      title: 'Edit Sidebar Item - WTS Admin',
      item: result.rows[0],
      currentPage: 'sidebar'
    });
  } catch (error) {
    res.redirect('/webdev/sidebar');
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
    res.redirect('/webdev/sidebar');
  } catch (error) {
    req.session.errorMessage = 'Failed to update sidebar item';
    res.redirect(`/webdev/sidebar/${req.params.id}/edit`);
  }
});

router.post('/sidebar/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM sidebar_items WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Sidebar item deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete sidebar item';
  }
  res.redirect('/webdev/sidebar');
});

// ==================== FORM TEMPLATES (Form Builder) ====================

router.get('/form-templates', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM form_templates ORDER BY created_at DESC');
    const btnResult = await db.query(
      `SELECT form_type, COUNT(*)::int AS button_count FROM form_buttons GROUP BY form_type`
    );
    const buttonCounts = {};
    btnResult.rows.forEach(r => { buttonCounts[r.form_type] = r.button_count; });
    res.render('webdev/form-templates/list', {
      title: 'Form Templates - WTS Admin',
      currentPage: 'form-templates',
      templates: result.rows,
      buttonCounts
    });
  } catch (error) {
    console.error('Form templates list error:', error);
    req.session.errorMessage = 'Failed to load form templates';
    res.redirect('/webdev');
  }
});

router.get('/form-templates/new', (req, res) => {
  res.render('webdev/form-templates/form', {
    title: 'Create Form Template - WTS Admin',
    currentPage: 'form-templates',
    template: null,
    buttons: []
  });
});

router.post('/form-templates', async (req, res) => {
  try {
    const { form_type, title, subtitle, submit_button_text, success_message, status } = req.body;

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
    res.redirect('/webdev/form-templates');
  } catch (error) {
    console.error('Create form template error:', error);
    req.session.errorMessage = 'Failed to create form template. ' + (error.detail || error.message);
    res.redirect('/webdev/form-templates/new');
  }
});

router.get('/form-templates/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM form_templates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/webdev/form-templates');
    }
    const template = result.rows[0];
    const btnResult = await db.query(
      'SELECT * FROM form_buttons WHERE form_type = $1 ORDER BY sort_order ASC, created_at ASC',
      [template.form_type]
    );
    res.render('webdev/form-templates/form', {
      title: 'Edit Form Template - WTS Admin',
      currentPage: 'form-templates',
      template,
      buttons: btnResult.rows
    });
  } catch (error) {
    res.redirect('/webdev/form-templates');
  }
});

router.post('/form-templates/:id', async (req, res) => {
  try {
    const { form_type, title, subtitle, submit_button_text, success_message, status } = req.body;

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
    res.redirect('/webdev/form-templates');
  } catch (error) {
    console.error('Update form template error:', error);
    req.session.errorMessage = 'Failed to update form template. ' + (error.detail || error.message);
    res.redirect(`/webdev/form-templates/${req.params.id}/edit`);
  }
});

router.post('/form-templates/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM form_templates WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Form template deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete form template';
  }
  res.redirect('/webdev/form-templates');
});

// ==================== FORM BUTTONS (Linked Buttons) ====================

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
    res.render('webdev/submissions/list', {
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
    res.redirect('/webdev');
  }
});

router.post('/submissions/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['new', 'reviewed', 'contacted', 'closed'];
    if (!allowed.includes(status)) {
      req.session.errorMessage = 'Invalid status';
      return res.redirect('/webdev/submissions');
    }
    await db.query(
      'UPDATE form_submissions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, req.params.id]
    );
    req.session.successMessage = 'Status updated';
  } catch (error) {
    req.session.errorMessage = 'Failed to update status';
  }
  res.redirect('/webdev/submissions');
});

router.post('/submissions/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM form_submissions WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Submission deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete submission';
  }
  res.redirect('/webdev/submissions');
});

module.exports = router;
