const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for dashboard routes to prevent abuse/DoS
const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
});

// Apply rate limiting and authentication to all dashboard routes
router.use(dashboardLimiter);
router.use(ensureAuthenticated);

// Main dashboard
router.get('/', async (req, res) => {
  try {
    // Get statistics
    const stats = await Promise.all([
      db.query('SELECT COUNT(*) FROM articles'),
      db.query('SELECT COUNT(*) FROM ai_tools'),
      db.query('SELECT COUNT(*) FROM products'),
      db.query('SELECT COUNT(*) FROM glossary'),
      db.query('SELECT COUNT(*) FROM seo_terms'),
      db.query("SELECT COUNT(*) FROM images WHERE status = 'active'").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(*) FROM microsites").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(*) FROM articles WHERE status = 'draft'").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(*) FROM microsites WHERE status = 'active'").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false", [req.user.id]).catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    // Get recent activity
    const recentActivity = await db.query(`
      SELECT al.*, u.first_name, u.last_name, u.email
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 10
    `);

    // Get recent articles
    const recentArticles = await db.query(`
      SELECT id, title, status, created_at
      FROM articles
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Get active microsites
    const activeMicrosites = await db.query(`
      SELECT id, name, primary_domain, status, deploy_platform, last_deployed_at
      FROM microsites
      ORDER BY updated_at DESC
      LIMIT 4
    `).catch(() => ({ rows: [] }));

    res.render('dashboard/index', {
      title: 'Dashboard - WTS Admin',
      stats: {
        articles: parseInt(stats[0].rows[0].count),
        aiTools: parseInt(stats[1].rows[0].count),
        products: parseInt(stats[2].rows[0].count),
        glossary: parseInt(stats[3].rows[0].count),
        seoTerms: parseInt(stats[4].rows[0].count),
        images: parseInt(stats[5].rows[0].count),
        microsites: parseInt(stats[6].rows[0].count),
        drafts: parseInt(stats[7].rows[0].count),
        activeSites: parseInt(stats[8].rows[0].count),
        unreadNotifications: parseInt(stats[9].rows[0].count)
      },
      recentActivity: recentActivity.rows,
      recentArticles: recentArticles.rows,
      activeMicrosites: activeMicrosites.rows,
      currentPage: 'dashboard'
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('dashboard/index', {
      title: 'Dashboard - WTS Admin',
      stats: { articles: 0, aiTools: 0, products: 0, glossary: 0, seoTerms: 0, images: 0, microsites: 0, drafts: 0, activeSites: 0, unreadNotifications: 0 },
      recentActivity: [],
      recentArticles: [],
      activeMicrosites: [],
      currentPage: 'dashboard',
      error: 'Failed to load dashboard data'
    });
  }
});

// Profile page
router.get('/profile', (req, res) => {
  res.render('dashboard/profile', {
    title: 'Profile - WTS Admin',
    currentPage: 'profile'
  });
});

// Update profile
router.post('/profile', async (req, res) => {
  const { firstName, lastName, email } = req.body;

  try {
    await db.query(
      'UPDATE users SET first_name = $1, last_name = $2, email = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [firstName, lastName, email.toLowerCase(), req.user.id]
    );
    req.session.successMessage = 'Profile updated successfully';
    res.redirect('/dashboard/profile');
  } catch (error) {
    console.error('Profile update error:', error);
    req.session.errorMessage = 'Failed to update profile';
    res.redirect('/dashboard/profile');
  }
});

// Settings page
router.get('/settings', (req, res) => {
  res.render('dashboard/settings', {
    title: 'Settings - WTS Admin',
    currentPage: 'settings'
  });
});

module.exports = router;
