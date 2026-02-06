const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const RateLimit = require('express-rate-limit');

const router = express.Router();

// Apply authentication first
router.use(ensureAuthenticated);

// Apply rate limiting to all routes in this router
const socialRateLimiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each authenticated client to 300 requests per windowMs
});
router.use(socialRateLimiter);

// ==================== SOCIAL POSTS ====================

router.get('/posts', async (req, res) => {
  try {
    const status = req.query.status || '';
    let query = `
      SELECT sp.*, u.first_name, u.last_name
      FROM social_posts sp
      LEFT JOIN users u ON sp.author_id = u.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE sp.status = $1';
      params.push(status);
    }

    query += ' ORDER BY sp.created_at DESC';

    const result = await db.query(query, params);
    res.render('social/posts/list', {
      title: 'Social Posts - WTS Admin',
      posts: result.rows,
      currentPage: 'social-posts',
      filter: { status }
    });
  } catch (error) {
    res.render('social/posts/list', {
      title: 'Social Posts - WTS Admin',
      posts: [],
      currentPage: 'social-posts',
      error: 'Failed to load social posts'
    });
  }
});

router.get('/posts/new', async (req, res) => {
  try {
    const channels = await db.query('SELECT * FROM social_channels WHERE status = $1 ORDER BY platform ASC', ['active']);
    res.render('social/posts/form', {
      title: 'New Social Post - WTS Admin',
      post: null,
      channels: channels.rows,
      currentPage: 'social-posts'
    });
  } catch (error) {
    res.render('social/posts/form', {
      title: 'New Social Post - WTS Admin',
      post: null,
      channels: [],
      currentPage: 'social-posts',
      error: 'Failed to load channels'
    });
  }
});

router.post('/posts', async (req, res) => {
  try {
    const { content, platforms, scheduled_at, status, media_urls } = req.body;
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    const mediaArray = media_urls ? media_urls.split('\n').map(u => u.trim()).filter(u => u) : [];

    await db.query(
      'INSERT INTO social_posts (content, platforms, scheduled_at, status, media_urls, author_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [content, platformsArray, scheduled_at || null, status || 'draft', mediaArray, req.user.id]
    );
    req.session.successMessage = 'Social post created successfully';
    res.redirect('/social/posts');
  } catch (error) {
    console.error('Create post error:', error);
    const channels = await db.query('SELECT * FROM social_channels WHERE status = $1 ORDER BY platform ASC', ['active']);
    res.render('social/posts/form', {
      title: 'New Social Post - WTS Admin',
      post: req.body,
      channels: channels.rows,
      currentPage: 'social-posts',
      error: 'Failed to create social post'
    });
  }
});

router.get('/posts/:id/edit', async (req, res) => {
  try {
    const [postResult, channelsResult] = await Promise.all([
      db.query('SELECT * FROM social_posts WHERE id = $1', [req.params.id]),
      db.query('SELECT * FROM social_channels WHERE status = $1 ORDER BY platform ASC', ['active'])
    ]);

    if (postResult.rows.length === 0) {
      return res.redirect('/social/posts');
    }

    res.render('social/posts/form', {
      title: 'Edit Social Post - WTS Admin',
      post: postResult.rows[0],
      channels: channelsResult.rows,
      currentPage: 'social-posts'
    });
  } catch (error) {
    res.redirect('/social/posts');
  }
});

router.post('/posts/:id', async (req, res) => {
  try {
    const { content, platforms, scheduled_at, status, media_urls } = req.body;
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    const mediaArray = media_urls ? media_urls.split('\n').map(u => u.trim()).filter(u => u) : [];

    await db.query(
      `UPDATE social_posts SET content = $1, platforms = $2, scheduled_at = $3, status = $4::VARCHAR, media_urls = $5, updated_at = CURRENT_TIMESTAMP, published_at = CASE WHEN $4::VARCHAR = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id = $6`,
      [content, platformsArray, scheduled_at || null, status, mediaArray, req.params.id]
    );
    req.session.successMessage = 'Social post updated successfully';
    res.redirect('/social/posts');
  } catch (error) {
    req.session.errorMessage = 'Failed to update social post';
    res.redirect(`/social/posts/${req.params.id}/edit`);
  }
});

router.post('/posts/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM social_posts WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Social post deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete social post';
  }
  res.redirect('/social/posts');
});

// ==================== SOCIAL CHANNELS ====================

router.get('/channels', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_channels ORDER BY platform ASC');
    res.render('social/channels/list', {
      title: 'Social Channels - WTS Admin',
      channels: result.rows,
      currentPage: 'social-channels'
    });
  } catch (error) {
    res.render('social/channels/list', {
      title: 'Social Channels - WTS Admin',
      channels: [],
      currentPage: 'social-channels',
      error: 'Failed to load social channels'
    });
  }
});

router.get('/channels/new', (req, res) => {
  res.render('social/channels/form', {
    title: 'New Social Channel - WTS Admin',
    channel: null,
    currentPage: 'social-channels',
    platformOptions: ['Facebook', 'Twitter/X', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Pinterest', 'Threads']
  });
});

router.post('/channels', async (req, res) => {
  try {
    const { platform, account_name, account_id, status } = req.body;

    await db.query(
      'INSERT INTO social_channels (platform, account_name, account_id, status) VALUES ($1, $2, $3, $4)',
      [platform, account_name, account_id, status || 'active']
    );
    req.session.successMessage = 'Social channel created successfully';
    res.redirect('/social/channels');
  } catch (error) {
    console.error('Create channel error:', error);
    res.render('social/channels/form', {
      title: 'New Social Channel - WTS Admin',
      channel: req.body,
      currentPage: 'social-channels',
      platformOptions: ['Facebook', 'Twitter/X', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Pinterest', 'Threads'],
      error: 'Failed to create social channel'
    });
  }
});

router.get('/channels/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_channels WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/social/channels');
    }
    res.render('social/channels/form', {
      title: 'Edit Social Channel - WTS Admin',
      channel: result.rows[0],
      currentPage: 'social-channels',
      platformOptions: ['Facebook', 'Twitter/X', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Pinterest', 'Threads']
    });
  } catch (error) {
    res.redirect('/social/channels');
  }
});

router.post('/channels/:id', async (req, res) => {
  try {
    const { platform, account_name, account_id, status } = req.body;

    await db.query(
      'UPDATE social_channels SET platform = $1, account_name = $2, account_id = $3, status = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
      [platform, account_name, account_id, status, req.params.id]
    );
    req.session.successMessage = 'Social channel updated successfully';
    res.redirect('/social/channels');
  } catch (error) {
    req.session.errorMessage = 'Failed to update social channel';
    res.redirect(`/social/channels/${req.params.id}/edit`);
  }
});

router.post('/channels/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM social_channels WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Social channel deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete social channel';
  }
  res.redirect('/social/channels');
});

// ==================== CONTENT CALENDAR ====================

router.get('/calendar', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, content, platforms, scheduled_at, status
      FROM social_posts
      WHERE scheduled_at IS NOT NULL
      ORDER BY scheduled_at ASC
    `);
    res.render('social/calendar', {
      title: 'Content Calendar - WTS Admin',
      posts: result.rows,
      currentPage: 'social-calendar'
    });
  } catch (error) {
    res.render('social/calendar', {
      title: 'Content Calendar - WTS Admin',
      posts: [],
      currentPage: 'social-calendar',
      error: 'Failed to load calendar'
    });
  }
});

module.exports = router;
