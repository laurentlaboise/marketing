const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');

const router = express.Router();
router.use(ensureAuthenticated);

// API response helper
const respond = (res, data, status = 200) => {
  res.status(status).json({ success: status < 400, ...data });
};

// ==================== DASHBOARD STATS ====================

router.get('/stats', async (req, res) => {
  try {
    const stats = await Promise.all([
      db.query('SELECT COUNT(*) FROM articles'),
      db.query('SELECT COUNT(*) FROM ai_tools'),
      db.query('SELECT COUNT(*) FROM social_posts'),
      db.query('SELECT COUNT(*) FROM products'),
      db.query('SELECT COUNT(*) FROM glossary'),
      db.query('SELECT COUNT(*) FROM seo_terms'),
      db.query('SELECT COUNT(*) FROM affiliate_solutions'),
      db.query('SELECT COUNT(*) FROM agencies')
    ]);

    respond(res, {
      stats: {
        articles: parseInt(stats[0].rows[0].count),
        aiTools: parseInt(stats[1].rows[0].count),
        socialPosts: parseInt(stats[2].rows[0].count),
        products: parseInt(stats[3].rows[0].count),
        glossary: parseInt(stats[4].rows[0].count),
        seoTerms: parseInt(stats[5].rows[0].count),
        affiliates: parseInt(stats[6].rows[0].count),
        agencies: parseInt(stats[7].rows[0].count)
      }
    });
  } catch (error) {
    respond(res, { error: 'Failed to load stats' }, 500);
  }
});

// ==================== SEARCH ====================

router.get('/search', async (req, res) => {
  const { q, type } = req.query;

  if (!q || q.length < 2) {
    return respond(res, { results: [] });
  }

  try {
    const searchTerm = `%${q}%`;
    let results = [];

    if (!type || type === 'all' || type === 'articles') {
      const articles = await db.query(
        'SELECT id, title, status, \'article\' as type FROM articles WHERE title ILIKE $1 LIMIT 5',
        [searchTerm]
      );
      results = results.concat(articles.rows);
    }

    if (!type || type === 'all' || type === 'ai-tools') {
      const tools = await db.query(
        'SELECT id, name as title, status, \'ai-tool\' as type FROM ai_tools WHERE name ILIKE $1 LIMIT 5',
        [searchTerm]
      );
      results = results.concat(tools.rows);
    }

    if (!type || type === 'all' || type === 'glossary') {
      const glossary = await db.query(
        'SELECT id, term as title, \'active\' as status, \'glossary\' as type FROM glossary WHERE term ILIKE $1 LIMIT 5',
        [searchTerm]
      );
      results = results.concat(glossary.rows);
    }

    if (!type || type === 'all' || type === 'products') {
      const products = await db.query(
        'SELECT id, name as title, status, \'product\' as type FROM products WHERE name ILIKE $1 LIMIT 5',
        [searchTerm]
      );
      results = results.concat(products.rows);
    }

    respond(res, { results });
  } catch (error) {
    respond(res, { error: 'Search failed' }, 500);
  }
});

// ==================== ACTIVITY LOGS ====================

router.get('/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await db.query(`
      SELECT al.*, u.first_name, u.last_name, u.email
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT $1
    `, [limit]);

    respond(res, { activity: result.rows });
  } catch (error) {
    respond(res, { error: 'Failed to load activity' }, 500);
  }
});

// ==================== BULK OPERATIONS ====================

router.post('/bulk/delete', async (req, res) => {
  const { type, ids } = req.body;

  if (!type || !ids || !Array.isArray(ids) || ids.length === 0) {
    return respond(res, { error: 'Invalid request' }, 400);
  }

  const tableMap = {
    articles: 'articles',
    'ai-tools': 'ai_tools',
    glossary: 'glossary',
    'seo-terms': 'seo_terms',
    products: 'products',
    affiliates: 'affiliate_solutions',
    agencies: 'agencies',
    automations: 'automations',
    'social-posts': 'social_posts',
    'social-channels': 'social_channels'
  };

  const table = tableMap[type];
  if (!table) {
    return respond(res, { error: 'Invalid type' }, 400);
  }

  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await db.query(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids);

    respond(res, { deleted: ids.length });
  } catch (error) {
    respond(res, { error: 'Bulk delete failed' }, 500);
  }
});

router.post('/bulk/status', async (req, res) => {
  const { type, ids, status } = req.body;

  if (!type || !ids || !Array.isArray(ids) || ids.length === 0 || !status) {
    return respond(res, { error: 'Invalid request' }, 400);
  }

  const tableMap = {
    articles: 'articles',
    'ai-tools': 'ai_tools',
    products: 'products',
    affiliates: 'affiliate_solutions',
    agencies: 'agencies',
    automations: 'automations',
    'social-posts': 'social_posts',
    'social-channels': 'social_channels'
  };

  const table = tableMap[type];
  if (!table) {
    return respond(res, { error: 'Invalid type' }, 400);
  }

  try {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    await db.query(
      `UPDATE ${table} SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
      [status, ...ids]
    );

    respond(res, { updated: ids.length });
  } catch (error) {
    respond(res, { error: 'Bulk status update failed' }, 500);
  }
});

// ==================== EXPORT ====================

router.get('/export/:type', async (req, res) => {
  const { type } = req.params;

  const tableMap = {
    articles: 'articles',
    'ai-tools': 'ai_tools',
    glossary: 'glossary',
    'seo-terms': 'seo_terms',
    products: 'products',
    affiliates: 'affiliate_solutions',
    agencies: 'agencies'
  };

  const table = tableMap[type];
  if (!table) {
    return respond(res, { error: 'Invalid type' }, 400);
  }

  try {
    const result = await db.query(`SELECT * FROM ${table} ORDER BY created_at DESC`);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-export.json`);
    res.send(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    respond(res, { error: 'Export failed' }, 500);
  }
});

module.exports = router;
