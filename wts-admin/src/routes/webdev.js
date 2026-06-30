const express = require('express');
const https = require('https');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const taxonomy = require('../config/product-taxonomy');

// Pages that actually have a button slot (.form-buttons-section) on the live
// site, so a button targeted here will really render. Derived from the taxonomy
// service pages, which map 1:1 to /en/digital-marketing-services/{value}. The
// editor shows these as a checklist so admins pick a page instead of typing a
// URL. URLs are the canonical, no-trailing-slash form that the front-end slot's
// data-buttons-page attribute uses.
const LINKABLE_PAGES = taxonomy.SERVICE_PAGES.map((s) => ({
  label: s.label,
  url: `/en/digital-marketing-services/${s.value}`,
}));

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

// Active forms built in the Form Builder, offered as a dropdown so a sidebar
// item can be linked to a form (action_type 'form' or 'modal'). Returns [] on
// error so the form still renders.
async function getActiveFormTemplates() {
  try {
    const result = await db.query(
      "SELECT form_type, title FROM form_templates WHERE status = 'active' ORDER BY title ASC"
    );
    return result.rows;
  } catch (e) {
    return [];
  }
}

router.get('/sidebar/new', async (req, res) => {
  res.render('webdev/sidebar/form', {
    title: 'New Sidebar Item - WTS Admin',
    item: null,
    formTemplates: await getActiveFormTemplates(),
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
    const { label, url, icon_class, section, sort_order, is_visible, open_in_new_tab, css_class, page_url, content_html, button_label, action_type, target_form_type } = req.body;

    await db.query(
      `INSERT INTO sidebar_items (label, url, icon_class, section, sort_order, is_visible, open_in_new_tab, css_class, page_url, content_html, button_label, action_type, target_form_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [label, url || null, icon_class || 'fas fa-question-circle', section, parseInt(sort_order) || 0,
       is_visible !== 'false', open_in_new_tab === 'true', css_class || null,
       page_url || null, content_html || null, button_label || 'Help',
       action_type || 'panel', target_form_type || null]
    );
    req.session.successMessage = 'Sidebar item created successfully';
    res.redirect('/webdev/sidebar');
  } catch (error) {
    console.error('Create sidebar item error:', error);
    res.render('webdev/sidebar/form', {
      title: 'New Sidebar Item - WTS Admin',
      item: req.body,
      formTemplates: await getActiveFormTemplates(),
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
      formTemplates: await getActiveFormTemplates(),
      currentPage: 'sidebar'
    });
  } catch (error) {
    res.redirect('/webdev/sidebar');
  }
});

router.post('/sidebar/:id', async (req, res) => {
  try {
    const { label, url, icon_class, section, sort_order, is_visible, open_in_new_tab, css_class, page_url, content_html, button_label, action_type, target_form_type } = req.body;

    await db.query(
      `UPDATE sidebar_items SET label=$1, url=$2, icon_class=$3, section=$4, sort_order=$5,
       is_visible=$6, open_in_new_tab=$7, css_class=$8, page_url=$9, content_html=$10, button_label=$11,
       action_type=$12, target_form_type=$13, updated_at=CURRENT_TIMESTAMP WHERE id=$14`,
      [label, url || null, icon_class || 'fas fa-question-circle', section, parseInt(sort_order) || 0,
       is_visible !== 'false', open_in_new_tab === 'true', css_class || null,
       page_url || null, content_html || null, button_label || 'Help',
       action_type || 'panel', target_form_type || null, req.params.id]
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

// ==================== MENU ITEMS (Top navigation) ====================

// List menu items grouped by location. Top-level items carry their children
// so the admin can see the dropdown structure at a glance.
router.get('/menus', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM menu_items ORDER BY location ASC, parent_id ASC NULLS FIRST, sort_order ASC');
    const byId = {};
    result.rows.forEach(item => { item.children = []; byId[item.id] = item; });

    const locations = {};
    result.rows.forEach(item => {
      if (item.parent_id && byId[item.parent_id]) {
        byId[item.parent_id].children.push(item);
        return;
      }
      if (!locations[item.location]) locations[item.location] = [];
      locations[item.location].push(item);
    });

    res.render('webdev/menus/list', {
      title: 'Menu Management - WTS Admin',
      items: result.rows,
      locations,
      currentPage: 'menus'
    });
  } catch (error) {
    console.error('Menu list error:', error);
    res.render('webdev/menus/list', {
      title: 'Menu Management - WTS Admin',
      items: [],
      locations: {},
      currentPage: 'menus',
      error: 'Failed to load menu items'
    });
  }
});

// Provide the list of possible parents (top-level items only) so the form can
// offer a dropdown picker without allowing two levels of nesting.
async function getMenuParents(excludeId) {
  const result = await db.query(
    `SELECT id, label, location FROM menu_items WHERE parent_id IS NULL ORDER BY location ASC, sort_order ASC`
  );
  return result.rows.filter(r => r.id !== excludeId);
}

router.get('/menus/new', async (req, res) => {
  let parents = [];
  try { parents = await getMenuParents(null); } catch (e) { parents = []; }
  res.render('webdev/menus/form', {
    title: 'New Menu Item - WTS Admin',
    item: null,
    parents,
    footerVariants: await listFooterVariants().catch(() => []),
    presetLocation: req.query.location || '',
    currentPage: 'menus'
  });
});

router.post('/menus', async (req, res) => {
  try {
    const { label, url, icon_class, parent_id, location, sort_order, is_visible, open_in_new_tab, css_class } = req.body;
    await db.query(
      `INSERT INTO menu_items (label, url, icon_class, parent_id, location, sort_order, is_visible, open_in_new_tab, css_class)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [label, url || null, icon_class || null, parent_id || null, location || 'header',
       parseInt(sort_order) || 0, is_visible !== 'false', open_in_new_tab === 'true', css_class || null]
    );
    req.session.successMessage = 'Menu item created successfully';
    res.redirect('/webdev/menus');
  } catch (error) {
    console.error('Create menu item error:', error);
    let parents = [];
    try { parents = await getMenuParents(null); } catch (e) { parents = []; }
    res.render('webdev/menus/form', {
      title: 'New Menu Item - WTS Admin',
      item: req.body,
      parents,
      footerVariants: await listFooterVariants().catch(() => []),
      currentPage: 'menus',
      error: 'Failed to create menu item'
    });
  }
});

router.get('/menus/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/webdev/menus');
    }
    let parents = [];
    try { parents = await getMenuParents(req.params.id); } catch (e) { parents = []; }
    res.render('webdev/menus/form', {
      title: 'Edit Menu Item - WTS Admin',
      item: result.rows[0],
      parents,
      footerVariants: await listFooterVariants().catch(() => []),
      currentPage: 'menus'
    });
  } catch (error) {
    res.redirect('/webdev/menus');
  }
});

router.post('/menus/:id', async (req, res) => {
  try {
    const { label, url, icon_class, parent_id, location, sort_order, is_visible, open_in_new_tab, css_class } = req.body;
    // Guard against an item being made its own parent.
    const parent = (parent_id && parent_id !== req.params.id) ? parent_id : null;
    await db.query(
      `UPDATE menu_items SET label=$1, url=$2, icon_class=$3, parent_id=$4, location=$5,
       sort_order=$6, is_visible=$7, open_in_new_tab=$8, css_class=$9,
       updated_at=CURRENT_TIMESTAMP WHERE id=$10`,
      [label, url || null, icon_class || null, parent, location || 'header',
       parseInt(sort_order) || 0, is_visible !== 'false', open_in_new_tab === 'true', css_class || null,
       req.params.id]
    );
    req.session.successMessage = 'Menu item updated successfully';
    res.redirect('/webdev/menus');
  } catch (error) {
    req.session.errorMessage = 'Failed to update menu item';
    res.redirect(`/webdev/menus/${req.params.id}/edit`);
  }
});

router.post('/menus/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Menu item deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete menu item';
  }
  res.redirect('/webdev/menus');
});

// ==================== FOOTER MANAGER (variants + settings) ====================

// Non-link footer content lives in site_settings; the link columns live in
// menu_items. Both are namespaced per variant: 'main' uses the legacy
// 'footer_<field>' keys and 'footer'/'footer-legal' locations; other variants
// use 'footer:<slug>:<field>' and 'footer:<slug>'/'footer-legal:<slug>'.
const FOOTER_SETTING_FIELDS = [
  'social_instagram', 'social_linkedin', 'social_facebook', 'social_twitter', 'social_youtube',
  'contact_address', 'contact_maps_url',
  'contact_whatsapp', 'contact_whatsapp_text',
  'contact_email', 'contact_email_subject', 'contact_email_body',
  'copyright'
];

function footerSettingPrefix(slug) {
  return (slug === 'main') ? 'footer_' : `footer:${slug}:`;
}
function footerColumnLocation(slug) {
  return (slug === 'main') ? 'footer' : `footer:${slug}`;
}
function footerLegalLocation(slug) {
  return (slug === 'main') ? 'footer-legal' : `footer-legal:${slug}`;
}
function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

async function listFooterVariants() {
  const r = await db.query(`SELECT slug, name, is_default FROM footer_variants ORDER BY sort_order ASC, slug ASC`);
  return r.rows;
}

// Read a variant's settings, exposed to the form under the legacy 'footer_<field>'
// input names regardless of the variant's storage prefix.
async function getFooterSettings(slug) {
  const prefix = footerSettingPrefix(slug);
  const r = await db.query(`SELECT key, value FROM site_settings WHERE key LIKE 'footer%'`);
  const settings = {};
  FOOTER_SETTING_FIELDS.forEach(f => { settings['footer_' + f] = ''; });
  r.rows.forEach(row => {
    if (row.key.startsWith(prefix)) {
      const field = row.key.slice(prefix.length);
      if (FOOTER_SETTING_FIELDS.includes(field)) settings['footer_' + field] = row.value || '';
    }
  });
  return settings;
}

router.get('/footer-settings', async (req, res) => {
  const variant = slugify(req.query.variant) || 'main';
  let settings = {};
  let variants = [];
  try { settings = await getFooterSettings(variant); } catch (e) { settings = {}; }
  try { variants = await listFooterVariants(); } catch (e) { variants = []; }
  const current = variants.find(v => v.slug === variant) || { slug: variant, name: variant };
  res.render('webdev/footer-settings/form', {
    title: 'Footer Settings - WTS Admin',
    settings,
    variant,
    variantName: current.name,
    variants,
    currentPage: 'footers'
  });
});

router.post('/footer-settings', async (req, res) => {
  const variant = slugify(req.body.variant) || 'main';
  const prefix = footerSettingPrefix(variant);
  try {
    for (const field of FOOTER_SETTING_FIELDS) {
      const value = (req.body['footer_' + field] || '').trim();
      await db.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [prefix + field, value || null]
      );
    }
    req.session.successMessage = 'Footer settings saved successfully';
  } catch (error) {
    console.error('Save footer settings error:', error);
    req.session.errorMessage = 'Failed to save footer settings';
  }
  res.redirect('/webdev/footer-settings?variant=' + encodeURIComponent(variant));
});

// ---- Footer Manager hub: variants + page assignments ----

router.get('/footers', async (req, res) => {
  try {
    const variants = await listFooterVariants();
    const assignments = (await db.query(
      `SELECT id, pattern, variant_slug, sort_order FROM footer_assignments ORDER BY sort_order ASC, created_at ASC`
    )).rows;
    res.render('webdev/footers/list', {
      title: 'Footer Manager - WTS Admin',
      variants, assignments,
      currentPage: 'footers'
    });
  } catch (error) {
    console.error('Footer manager error:', error);
    req.session.errorMessage = 'Failed to load footers';
    res.redirect('/webdev/menus');
  }
});

router.post('/footers/variants', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const slug = slugify(req.body.slug || name);
    if (!slug || slug === 'keep') {
      req.session.errorMessage = 'Invalid variant name.';
      return res.redirect('/webdev/footers');
    }
    await db.query(
      `INSERT INTO footer_variants (slug, name, is_default, sort_order)
       VALUES ($1, $2, FALSE, (SELECT COALESCE(MAX(sort_order),0)+1 FROM footer_variants))
       ON CONFLICT (slug) DO NOTHING`,
      [slug, name || slug]
    );
    req.session.successMessage = 'Variant created.';
  } catch (error) {
    console.error('Create footer variant error:', error);
    req.session.errorMessage = 'Failed to create variant.';
  }
  res.redirect('/webdev/footers');
});

// Seed a (non-main) variant's content from Main, so a freshly-created variant
// starts as a working copy the user can customize — instead of being empty
// (an empty variant renders nothing, so the build leaves the page's existing
// footer in place, which looks like "the change didn't take"). Copies the
// footer settings, the column items and the legal-bar items, preserving the
// parent/child (heading → links) structure. Idempotent: replaces any existing
// content at the destination locations.
router.post('/footers/variants/:slug/seed-from-main', async (req, res) => {
  const slug = slugify(req.params.slug);
  try {
    if (!slug || slug === 'main') {
      req.session.errorMessage = 'Pick a non-main variant to copy into.';
      return res.redirect('/webdev/footers');
    }
    // 1) Settings: footer_<field>  ->  footer:<slug>:<field>
    const srcPrefix = footerSettingPrefix('main');
    const dstPrefix = footerSettingPrefix(slug);
    for (const field of FOOTER_SETTING_FIELDS) {
      const r = await db.query(`SELECT value FROM site_settings WHERE key = $1`, [srcPrefix + field]);
      const value = r.rows[0] ? r.rows[0].value : null;
      await db.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [dstPrefix + field, value]
      );
    }
    // 2) Menu items: footer/footer-legal  ->  footer:<slug>/footer-legal:<slug>
    const locPairs = [
      [footerColumnLocation('main'), footerColumnLocation(slug)],
      [footerLegalLocation('main'), footerLegalLocation(slug)],
    ];
    for (const [srcLoc, dstLoc] of locPairs) {
      await db.query(`DELETE FROM menu_items WHERE location = $1`, [dstLoc]); // avoid duplicates
      const src = (await db.query(
        `SELECT * FROM menu_items WHERE location = $1 ORDER BY parent_id NULLS FIRST, sort_order ASC`,
        [srcLoc]
      )).rows;
      const idMap = {};
      // Parents (column headings) first, so children can point at the new ids.
      for (const it of src.filter(r => r.parent_id == null)) {
        const ins = await db.query(
          `INSERT INTO menu_items (label, url, icon_class, parent_id, location, sort_order, is_visible, open_in_new_tab, css_class)
           VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8) RETURNING id`,
          [it.label, it.url, it.icon_class, dstLoc, it.sort_order, it.is_visible, it.open_in_new_tab, it.css_class]
        );
        idMap[it.id] = ins.rows[0].id;
      }
      for (const it of src.filter(r => r.parent_id != null)) {
        await db.query(
          `INSERT INTO menu_items (label, url, icon_class, parent_id, location, sort_order, is_visible, open_in_new_tab, css_class)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [it.label, it.url, it.icon_class, idMap[it.parent_id] || null, dstLoc, it.sort_order, it.is_visible, it.open_in_new_tab, it.css_class]
        );
      }
    }
    req.session.successMessage = `Copied the Main footer into "${slug}". Edit it under Content / Columns, then Publish.`;
  } catch (error) {
    console.error('Seed footer variant error:', error);
    req.session.errorMessage = 'Failed to copy from Main.';
  }
  res.redirect('/webdev/footers');
});

router.post('/footers/variants/:slug/delete', async (req, res) => {
  const slug = slugify(req.params.slug);
  try {
    if (slug === 'main') {
      req.session.errorMessage = 'The Main variant cannot be deleted.';
      return res.redirect('/webdev/footers');
    }
    // Remove the variant and all of its namespaced content + assignments.
    await db.query(`DELETE FROM menu_items WHERE location IN ($1, $2)`,
      [footerColumnLocation(slug), footerLegalLocation(slug)]);
    await db.query(`DELETE FROM site_settings WHERE key LIKE $1`, [footerSettingPrefix(slug) + '%']);
    await db.query(`DELETE FROM footer_assignments WHERE variant_slug = $1`, [slug]);
    await db.query(`DELETE FROM footer_variants WHERE slug = $1`, [slug]);
    req.session.successMessage = 'Variant deleted.';
  } catch (error) {
    console.error('Delete footer variant error:', error);
    req.session.errorMessage = 'Failed to delete variant.';
  }
  res.redirect('/webdev/footers');
});

router.post('/footers/assignments', async (req, res) => {
  try {
    const pattern = (req.body.pattern || '').trim();
    const variant_slug = (req.body.variant_slug || '').trim();
    if (!pattern || !variant_slug) {
      req.session.errorMessage = 'Pattern and variant are required.';
      return res.redirect('/webdev/footers');
    }
    await db.query(
      `INSERT INTO footer_assignments (pattern, variant_slug, sort_order)
       VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order),0)+1 FROM footer_assignments))`,
      [pattern, variant_slug]
    );
    req.session.successMessage = 'Assignment added.';
  } catch (error) {
    console.error('Create footer assignment error:', error);
    req.session.errorMessage = 'Failed to add assignment.';
  }
  res.redirect('/webdev/footers');
});

router.post('/footers/assignments/:id/delete', async (req, res) => {
  try {
    await db.query(`DELETE FROM footer_assignments WHERE id = $1`, [req.params.id]);
    req.session.successMessage = 'Assignment removed.';
  } catch (error) {
    req.session.errorMessage = 'Failed to remove assignment.';
  }
  res.redirect('/webdev/footers');
});

// Publish the footer to the live site: render the admin footer into the
// build-time footers.json and commit it to the repo. The commit triggers the
// GitHub Pages rebuild, which injects the footer into the static HTML.
router.post('/footer-settings/publish', async (req, res) => {
  try {
    const { buildAllConfig } = require('../lib/footer-export');
    const { getFile, putFile } = require('../lib/github-content');

    // The variant + assignment tables are the full source of truth.
    const config = await buildAllConfig();
    const json = JSON.stringify(config, null, 2) + '\n';

    const current = await getFile('footers.json');
    const result = await putFile('footers.json', json, 'Update footer via admin', current ? current.sha : null);

    if (result.ok) {
      req.session.successMessage = 'Footer published. The site will rebuild and update shortly.';
    } else if (result.reason === 'no_token') {
      req.session.errorMessage = 'Footer not published: GITHUB_TOKEN is not configured on the server.';
    } else if (result.reason === 'auth') {
      req.session.errorMessage = 'Footer not published: the GitHub token is invalid or lacks write access.';
    } else {
      req.session.errorMessage = 'Footer not published: ' + (result.reason || 'unknown error') + '.';
    }
  } catch (error) {
    console.error('Publish footer error:', error);
    req.session.errorMessage = 'Failed to publish footer.';
  }
  res.redirect('/webdev/footer-settings');
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

router.get('/form-templates/new', async (req, res) => {
  let products = [];
  try { products = await getLinkableProducts(); } catch (e) { products = []; }
  res.render('webdev/form-templates/form', {
    title: 'Create Form Template - WTS Admin',
    currentPage: 'form-templates',
    template: null,
    buttons: [],
    linkablePages: LINKABLE_PAGES,
    linkableProducts: products
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

    const inserted = await db.query(
      `INSERT INTO form_templates (form_type, title, subtitle, fields, submit_button_text, success_message, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [form_type.trim(), title.trim(), subtitle || null, JSON.stringify(fields),
       submit_button_text || 'Submit', success_message || null, status || 'active']
    );
    // Land on the edit page so the admin can immediately add the CTA buttons
    // that place this form on the website.
    req.session.successMessage = 'Form template created. Now add the buttons that open it on the website.';
    res.redirect(`/webdev/form-templates/${inserted.rows[0].id}/edit`);
  } catch (error) {
    console.error('Create form template error:', error);
    req.session.errorMessage = 'Failed to create form template. ' + (error.detail || error.message);
    res.redirect('/webdev/form-templates/new');
  }
});

// ==================== AI FORM FIELD GENERATOR ====================
//
// Mirrors the AI pattern already used in the image library (src/routes/images.js:
// analyzeImageWithAI): same ANTHROPIC_API_KEY, same raw https.request to
// api.anthropic.com, same 30s timeout and "AI drafts -> human reviews -> human
// saves" flow. The upgrade here is structured output via forced tool use, so
// Claude returns a guaranteed-shaped object instead of free-text JSON we have to
// fence-strip and hope parses. Registered before the "/:id" routes so the literal
// path is not swallowed by the ":id" param.

// The only field types the builder UI (and the front-end renderer) understand.
const ALLOWED_FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'select'];

// Model for form generation. Field generation is simple + structured, so the
// fast/cheap Haiku tier is plenty. Swap to 'claude-sonnet-4-5-20250929' to match
// the image library's pin if you'd rather keep every AI call on one model.
const AI_FORM_MODEL = 'claude-haiku-4-5';

// Stricter limiter than the page limiter — these calls cost money per request.
const aiFormLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: { error: 'Too many AI requests. Please wait a minute and try again.' },
});

// Coerce a single AI-proposed field into a safe builder field. Returns null for
// anything we cannot make sense of so the caller can drop it.
function sanitizeAiField(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Field name: lowercase token, letters/numbers/underscore only (used as the
  // submission key). Fall back to the label if name is missing.
  let name = typeof raw.name === 'string' ? raw.name : '';
  if (!name && typeof raw.label === 'string') name = raw.label;
  name = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!name) return null;

  const type = ALLOWED_FIELD_TYPES.includes(raw.type) ? raw.type : 'text';

  const field = {
    name,
    label: typeof raw.label === 'string' ? raw.label.trim() : '',
    type,
    placeholder: typeof raw.placeholder === 'string' ? raw.placeholder.trim() : '',
    required: raw.required === true || raw.required === 'true',
  };

  if (type === 'select') {
    const opts = Array.isArray(raw.options) ? raw.options : [];
    field.options = opts
      .filter(o => typeof o === 'string' && o.trim())
      .map(o => o.trim())
      .slice(0, 25);
  }

  return field;
}

// Call Claude with a forced tool so the response is a structured form spec.
function generateFormSpecWithAI(description, hint) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('ANTHROPIC_API_KEY is not configured. Add it to your environment variables.'));
  }

  const tool = {
    name: 'build_form',
    description: 'Return the fields and copy for a website form based on the description.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, action-oriented form heading.' },
        subtitle: { type: 'string', description: 'One sentence shown under the title. May be empty.' },
        submit_button_text: { type: 'string', description: 'Submit button label, e.g. "Request a Quote".' },
        success_message: { type: 'string', description: 'Friendly confirmation shown after submission.' },
        fields: {
          type: 'array',
          description: 'The form fields, in display order.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Lowercase snake_case key, e.g. full_name, work_email.' },
              label: { type: 'string', description: 'Human-readable field label.' },
              type: { type: 'string', enum: ALLOWED_FIELD_TYPES, description: 'The input type.' },
              placeholder: { type: 'string', description: 'Placeholder/help text. May be empty.' },
              required: { type: 'boolean', description: 'Whether the field is mandatory.' },
              options: { type: 'array', items: { type: 'string' }, description: 'Choices — only for type "select".' },
            },
            required: ['name', 'label', 'type', 'required'],
          },
        },
      },
      required: ['title', 'fields'],
    },
  };

  const systemPrompt =
    'You design lead-capture and contact forms for WordsThatSells.website, a digital ' +
    'marketing agency that works on a consult-first model (clients meet a strategist ' +
    'before buying). Generate concise, conversion-focused forms. Keep them short — ask ' +
    'only for what is genuinely needed. Always use type "email" for email and "tel" for ' +
    'phone. Use "select" with sensible options for choices like budget or industry. ' +
    'Write friendly, professional copy.';

  const userText =
    `Build a form for this request:\n"${description}"` +
    (hint ? `\n\nThe form's internal key/type is "${hint}" — tailor it accordingly.` : '');

  const requestBody = JSON.stringify({
    model: AI_FORM_MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'build_form' },
    messages: [{ role: 'user', content: userText }],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'Anthropic API error'));
            return;
          }
          const toolBlock = (response.content || []).find(b => b.type === 'tool_use' && b.name === 'build_form');
          if (!toolBlock || !toolBlock.input) {
            reject(new Error('AI did not return a structured form.'));
            return;
          }
          resolve(toolBlock.input);
        } catch (e) {
          reject(new Error('Failed to parse AI response: ' + e.message));
        }
      });
    });

    apiReq.on('error', (e) => reject(new Error('API request failed: ' + e.message)));
    apiReq.setTimeout(30000, () => { apiReq.destroy(); reject(new Error('API request timed out')); });
    apiReq.write(requestBody);
    apiReq.end();
  });
}

router.post('/form-templates/ai-generate', aiFormLimiter, async (req, res) => {
  try {
    const description = (req.body && typeof req.body.description === 'string') ? req.body.description.trim() : '';
    if (description.length < 5) {
      return res.status(400).json({ error: 'Please describe the form you want (at least a few words).' });
    }
    if (description.length > 2000) {
      return res.status(400).json({ error: 'Description is too long. Keep it under 2000 characters.' });
    }
    const hint = (req.body && typeof req.body.form_type === 'string') ? req.body.form_type.trim().slice(0, 60) : '';

    const spec = await generateFormSpecWithAI(description, hint);

    const fields = (Array.isArray(spec.fields) ? spec.fields : [])
      .map(sanitizeAiField)
      .filter(Boolean)
      .slice(0, 25);

    if (fields.length === 0) {
      return res.status(422).json({ error: 'The AI could not produce usable fields. Try rephrasing your description.' });
    }

    res.json({
      success: true,
      title: typeof spec.title === 'string' ? spec.title.trim() : '',
      subtitle: typeof spec.subtitle === 'string' ? spec.subtitle.trim() : '',
      submit_button_text: typeof spec.submit_button_text === 'string' ? spec.submit_button_text.trim() : '',
      success_message: typeof spec.success_message === 'string' ? spec.success_message.trim() : '',
      fields,
    });
  } catch (error) {
    console.error('AI form generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate form' });
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
    let products = [];
    try { products = await getLinkableProducts(); } catch (e) { products = []; }
    res.render('webdev/form-templates/form', {
      title: 'Edit Form Template - WTS Admin',
      currentPage: 'form-templates',
      template,
      buttons: btnResult.rows,
      linkablePages: LINKABLE_PAGES,
      linkableProducts: products
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

// Resolve the admin "Show on" choice into a page_url pattern. A button can
// target all pages ('*'), all service pages, or a list of specific paths /
// wildcards (stored comma-separated). Falls back to a directly-provided
// page_url for backward compatibility.
function resolvePageUrl(body) {
  switch (body.page_scope) {
    case 'all':
    case 'sticky':
      // A sticky side tab shows site-wide; placement (stored separately) is what
      // makes it render as a floating tab rather than into a page slot.
      return '*';
    case 'service-pages':
      return '/en/digital-marketing-services/*';
    case 'specific': {
      // Merge the page checklist (page_select — one value per checked box) with
      // any custom paths typed in the textarea (page_urls), de-duplicated.
      const picks = [];
      if (body.page_select) {
        picks.push(...(Array.isArray(body.page_select) ? body.page_select : [body.page_select]));
      }
      if (body.page_urls || body.page_url) {
        picks.push(...String(body.page_urls || body.page_url).split(/[\n,]+/));
      }
      const seen = new Set();
      const out = [];
      picks.map(s => String(s).trim()).filter(Boolean).forEach(p => {
        if (!seen.has(p)) { seen.add(p); out.push(p); }
      });
      return out.join(',') || null;
    }
    default:
      return body.page_url || null;
  }
}

// Products available to link a button to (Stage 2). Any product with a slug,
// most-recently relevant first within each service page.
async function getLinkableProducts() {
  const r = await db.query(
    `SELECT slug, name, service_page, status
       FROM products
      WHERE slug IS NOT NULL
      ORDER BY service_page NULLS LAST, name ASC`
  );
  return r.rows;
}

// Resolve the stored {page_url, product_slug, product_name} for a button,
// honouring page_scope. For the "product" scope we look the product up so the
// button auto-targets that product's service page and carries its name for
// front-end lead-tagging. Every other scope clears the product association.
async function resolveButtonTarget(body) {
  if (body.page_scope === 'product' && body.product_slug) {
    const r = await db.query(
      'SELECT slug, name, service_page FROM products WHERE slug = $1 LIMIT 1',
      [String(body.product_slug).trim()]
    );
    if (r.rows.length) {
      const p = r.rows[0];
      return {
        page_url: p.service_page ? `/en/digital-marketing-services/${p.service_page}` : null,
        product_slug: p.slug,
        product_name: p.name || null,
      };
    }
  }
  return { page_url: resolvePageUrl(body), product_slug: null, product_name: null };
}

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

    const target = await resolveButtonTarget(req.body);
    const placement = req.body.page_scope === 'sticky' ? 'sticky' : 'inline';
    await db.query(
      `INSERT INTO form_buttons (form_type, button_label, page_url, style_preset, custom_css, custom_js,
        rel_nofollow, rel_noopener, rel_noreferrer, target_blank, sort_order, product_slug, product_name, placement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        form_type.trim(),
        button_label.trim(),
        target.page_url,
        style_preset || 'primary',
        custom_css || null,
        custom_js || null,
        rel_nofollow === 'on' || rel_nofollow === 'true',
        rel_noopener !== 'off' && rel_noopener !== 'false',
        rel_noreferrer === 'on' || rel_noreferrer === 'true',
        target_blank === 'on' || target_blank === 'true',
        parseInt(sort_order) || 0,
        target.product_slug,
        target.product_name,
        placement
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

    const target = await resolveButtonTarget(req.body);
    const placement = req.body.page_scope === 'sticky' ? 'sticky' : 'inline';
    await db.query(
      `UPDATE form_buttons SET
        button_label=$1, page_url=$2, style_preset=$3, custom_css=$4, custom_js=$5,
        rel_nofollow=$6, rel_noopener=$7, rel_noreferrer=$8, target_blank=$9,
        sort_order=$10, status=$11, product_slug=$12, product_name=$13, placement=$14, updated_at=CURRENT_TIMESTAMP
       WHERE id=$15`,
      [
        (button_label || '').trim(),
        target.page_url,
        style_preset || 'primary',
        custom_css || null,
        custom_js || null,
        rel_nofollow === 'on' || rel_nofollow === 'true',
        rel_noopener !== 'off' && rel_noopener !== 'false',
        rel_noreferrer === 'on' || rel_noreferrer === 'true',
        target_blank === 'on' || target_blank === 'true',
        parseInt(sort_order) || 0,
        status || 'active',
        target.product_slug,
        target.product_name,
        placement,
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
