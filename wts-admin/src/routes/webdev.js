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

module.exports = router;
