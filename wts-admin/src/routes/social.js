const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const db = require('../../database/db');
const RateLimit = require('express-rate-limit');

const router = express.Router();
router.use(ensureAuthenticated);

const socialRateLimiter = RateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});
router.use(socialRateLimiter);

// Platform definitions with metadata
const PLATFORMS = [
  { id: 'Facebook', icon: 'fab fa-facebook', color: '#1877f2', charLimit: 63206, hashtagLimit: 30 },
  { id: 'Instagram', icon: 'fab fa-instagram', color: '#e4405f', charLimit: 2200, hashtagLimit: 30 },
  { id: 'Twitter/X', icon: 'fab fa-x-twitter', color: '#000000', charLimit: 280, hashtagLimit: 5 },
  { id: 'LinkedIn', icon: 'fab fa-linkedin', color: '#0a66c2', charLimit: 3000, hashtagLimit: 10 },
  { id: 'TikTok', icon: 'fab fa-tiktok', color: '#000000', charLimit: 2200, hashtagLimit: 20 },
  { id: 'YouTube', icon: 'fab fa-youtube', color: '#ff0000', charLimit: 5000, hashtagLimit: 15 },
  { id: 'Pinterest', icon: 'fab fa-pinterest', color: '#e60023', charLimit: 500, hashtagLimit: 20 },
  { id: 'Google Business', icon: 'fab fa-google', color: '#4285f4', charLimit: 1500, hashtagLimit: 0 },
  { id: 'Threads', icon: 'fas fa-at', color: '#000000', charLimit: 500, hashtagLimit: 10 },
  { id: 'Snapchat', icon: 'fab fa-snapchat', color: '#fffc00', charLimit: 250, hashtagLimit: 0 },
];

const CONTENT_TYPES = [
  { id: 'text', label: 'Text Post', icon: 'fas fa-align-left' },
  { id: 'image', label: 'Image Post', icon: 'fas fa-image' },
  { id: 'video', label: 'Video Post', icon: 'fas fa-video' },
  { id: 'carousel', label: 'Carousel', icon: 'fas fa-images' },
  { id: 'story', label: 'Story', icon: 'fas fa-mobile-alt' },
  { id: 'reel', label: 'Reel/Short', icon: 'fas fa-film' },
  { id: 'article', label: 'Article/Blog', icon: 'fas fa-newspaper' },
  { id: 'poll', label: 'Poll', icon: 'fas fa-poll' },
  { id: 'live', label: 'Live Stream', icon: 'fas fa-broadcast-tower' },
  { id: 'link', label: 'Link Share', icon: 'fas fa-link' },
];

const CAMPAIGN_OBJECTIVES = [
  'Brand Awareness', 'Reach', 'Traffic', 'Engagement', 'Lead Generation',
  'Conversions', 'App Installs', 'Video Views', 'Store Visits', 'Community Growth',
];

const LABEL_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Gray', value: '#6b7280' },
];

// ==================== CAMPAIGNS ====================

router.get('/campaigns', async (req, res) => {
  try {
    const status = req.query.status || '';
    let query = `
      SELECT sc.*,
        (SELECT COUNT(*) FROM social_posts sp WHERE sp.campaign_id = sc.id) as post_count
      FROM social_campaigns sc
    `;
    const params = [];
    if (status) {
      query += ' WHERE sc.status = $1';
      params.push(status);
    }
    query += ' ORDER BY sc.created_at DESC';

    const result = await db.query(query, params);
    res.render('social/campaigns/list', {
      title: 'Campaigns - WTS Admin',
      campaigns: result.rows,
      currentPage: 'social-campaigns',
      filter: { status },
    });
  } catch (error) {
    console.error('Campaigns list error:', error);
    res.render('social/campaigns/list', {
      title: 'Campaigns - WTS Admin',
      campaigns: [],
      currentPage: 'social-campaigns',
      filter: { status: '' },
      error: 'Failed to load campaigns',
    });
  }
});

router.get('/campaigns/new', (req, res) => {
  res.render('social/campaigns/form', {
    title: 'New Campaign - WTS Admin',
    campaign: null,
    currentPage: 'social-campaigns',
    objectives: CAMPAIGN_OBJECTIVES,
    labelColors: LABEL_COLORS,
    platforms: PLATFORMS,
  });
});

router.post('/campaigns', async (req, res) => {
  try {
    const {
      name, description, objective, status, labels, color,
      budget, budget_currency, start_date, end_date,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_languages, targeting_interests,
    } = req.body;

    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const targeting = {
      age_min: targeting_age_min || null, age_max: targeting_age_max || null,
      gender: targeting_gender || 'all',
      locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [],
      languages: targeting_languages ? targeting_languages.split(',').map(l => l.trim()).filter(Boolean) : [],
      interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [],
    };

    await db.query(
      `INSERT INTO social_campaigns (name, description, objective, status, labels, color, budget, budget_currency, start_date, end_date, utm_source, utm_medium, utm_campaign, utm_term, utm_content, targeting, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [name, description, objective, status || 'draft', labelsArray, color || '#667eea',
       budget || null, budget_currency || 'USD', start_date || null, end_date || null,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       JSON.stringify(targeting), req.user.id]
    );
    req.session.successMessage = 'Campaign created successfully';
    res.redirect('/social/campaigns');
  } catch (error) {
    console.error('Create campaign error:', error);
    req.session.errorMessage = 'Failed to create campaign';
    res.redirect('/social/campaigns/new');
  }
});

router.get('/campaigns/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_campaigns WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/campaigns');
    res.render('social/campaigns/form', {
      title: 'Edit Campaign - WTS Admin',
      campaign: result.rows[0],
      currentPage: 'social-campaigns',
      objectives: CAMPAIGN_OBJECTIVES,
      labelColors: LABEL_COLORS,
      platforms: PLATFORMS,
    });
  } catch (error) {
    res.redirect('/social/campaigns');
  }
});

router.post('/campaigns/:id', async (req, res) => {
  try {
    const {
      name, description, objective, status, labels, color,
      budget, budget_currency, start_date, end_date,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_languages, targeting_interests,
    } = req.body;

    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const targeting = {
      age_min: targeting_age_min || null, age_max: targeting_age_max || null,
      gender: targeting_gender || 'all',
      locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [],
      languages: targeting_languages ? targeting_languages.split(',').map(l => l.trim()).filter(Boolean) : [],
      interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [],
    };

    await db.query(
      `UPDATE social_campaigns SET name=$1, description=$2, objective=$3, status=$4, labels=$5, color=$6, budget=$7, budget_currency=$8, start_date=$9, end_date=$10, utm_source=$11, utm_medium=$12, utm_campaign=$13, utm_term=$14, utm_content=$15, targeting=$16, updated_at=CURRENT_TIMESTAMP WHERE id=$17`,
      [name, description, objective, status, labelsArray, color || '#667eea',
       budget || null, budget_currency || 'USD', start_date || null, end_date || null,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       JSON.stringify(targeting), req.params.id]
    );
    req.session.successMessage = 'Campaign updated';
    res.redirect('/social/campaigns');
  } catch (error) {
    req.session.errorMessage = 'Failed to update campaign';
    res.redirect('/social/campaigns/' + req.params.id + '/edit');
  }
});

router.post('/campaigns/:id/duplicate', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_campaigns WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/campaigns');
    const c = result.rows[0];
    await db.query(
      `INSERT INTO social_campaigns (name, description, objective, status, labels, color, budget, budget_currency, targeting, utm_source, utm_medium, utm_campaign, utm_term, utm_content, author_id)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [c.name + ' (Copy)', c.description, c.objective, c.labels, c.color, c.budget, c.budget_currency, JSON.stringify(c.targeting || {}), c.utm_source, c.utm_medium, c.utm_campaign, c.utm_term, c.utm_content, req.user.id]
    );
    req.session.successMessage = 'Campaign duplicated';
    res.redirect('/social/campaigns');
  } catch (error) {
    req.session.errorMessage = 'Failed to duplicate campaign';
    res.redirect('/social/campaigns');
  }
});

router.post('/campaigns/:id/delete', async (req, res) => {
  try {
    await db.query('UPDATE social_posts SET campaign_id = NULL WHERE campaign_id = $1', [req.params.id]);
    await db.query('DELETE FROM social_campaigns WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Campaign deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete campaign';
  }
  res.redirect('/social/campaigns');
});

// ==================== SOCIAL POSTS ====================

router.get('/posts', async (req, res) => {
  try {
    const status = req.query.status || '';
    const campaign = req.query.campaign || '';
    const contentType = req.query.content_type || '';
    let query = `
      SELECT sp.*, u.first_name, u.last_name, sc.name as campaign_name, sc.color as campaign_color
      FROM social_posts sp
      LEFT JOIN users u ON sp.author_id = u.id
      LEFT JOIN social_campaigns sc ON sp.campaign_id = sc.id
    `;
    const params = [];
    const conditions = [];

    if (status) { conditions.push(`sp.status = $${params.length + 1}`); params.push(status); }
    if (campaign) { conditions.push(`sp.campaign_id = $${params.length + 1}`); params.push(campaign); }
    if (contentType) { conditions.push(`sp.content_type = $${params.length + 1}`); params.push(contentType); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY sp.created_at DESC';

    const [postsResult, campaignsResult] = await Promise.all([
      db.query(query, params),
      db.query("SELECT id, name, color FROM social_campaigns ORDER BY name ASC"),
    ]);

    res.render('social/posts/list', {
      title: 'Social Posts - WTS Admin',
      posts: postsResult.rows,
      campaigns: campaignsResult.rows,
      currentPage: 'social-posts',
      filter: { status, campaign, content_type: contentType },
      contentTypes: CONTENT_TYPES,
    });
  } catch (error) {
    console.error('Posts list error:', error);
    res.render('social/posts/list', {
      title: 'Social Posts - WTS Admin',
      posts: [], campaigns: [],
      currentPage: 'social-posts',
      filter: { status: '', campaign: '', content_type: '' },
      contentTypes: CONTENT_TYPES,
      error: 'Failed to load social posts',
    });
  }
});

router.get('/posts/new', async (req, res) => {
  try {
    const [channels, campaigns, hashtagSets] = await Promise.all([
      db.query("SELECT * FROM social_channels WHERE status = 'active' ORDER BY platform ASC"),
      db.query("SELECT id, name, color, utm_source, utm_medium, utm_campaign, utm_term, utm_content FROM social_campaigns WHERE status != 'completed' ORDER BY name ASC"),
      db.query("SELECT * FROM hashtag_sets ORDER BY name ASC"),
    ]);
    res.render('social/posts/form', {
      title: 'New Social Post - WTS Admin',
      post: null,
      channels: channels.rows,
      campaigns: campaigns.rows,
      hashtagSets: hashtagSets.rows,
      currentPage: 'social-posts',
      platforms: PLATFORMS,
      contentTypes: CONTENT_TYPES,
      preselectedCampaign: req.query.campaign || null,
    });
  } catch (error) {
    res.render('social/posts/form', {
      title: 'New Social Post - WTS Admin',
      post: null, channels: [], campaigns: [], hashtagSets: [],
      currentPage: 'social-posts', platforms: PLATFORMS, contentTypes: CONTENT_TYPES,
      preselectedCampaign: null,
      error: 'Failed to load form data',
    });
  }
});

router.post('/posts', async (req, res) => {
  try {
    const { content, platforms, scheduled_at, status, media_urls, campaign_id, content_type, hashtags, labels, notes, link_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_interests } = req.body;
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    const mediaArray = media_urls ? media_urls.split('\n').map(u => u.trim()).filter(u => u) : [];
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const utmParams = { source: utm_source, medium: utm_medium, campaign: utm_campaign, term: utm_term, content: utm_content };
    const targeting = { age_min: targeting_age_min || null, age_max: targeting_age_max || null, gender: targeting_gender || 'all', locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [], interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [] };

    await db.query(
      `INSERT INTO social_posts (content, platforms, scheduled_at, status, media_urls, author_id, campaign_id, content_type, hashtags, labels, notes, link_url, utm_params, targeting)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [content, platformsArray, scheduled_at || null, status || 'draft', mediaArray, req.user.id, campaign_id || null, content_type || 'text', hashtagsArray, labelsArray, notes, link_url, JSON.stringify(utmParams), JSON.stringify(targeting)]
    );
    req.session.successMessage = 'Post created';
    res.redirect('/social/posts');
  } catch (error) {
    console.error('Create post error:', error);
    req.session.errorMessage = 'Failed to create post: ' + error.message;
    res.redirect('/social/posts/new');
  }
});

router.get('/posts/:id/edit', async (req, res) => {
  try {
    const [postResult, channels, campaigns, hashtagSets] = await Promise.all([
      db.query('SELECT * FROM social_posts WHERE id = $1', [req.params.id]),
      db.query("SELECT * FROM social_channels WHERE status = 'active' ORDER BY platform ASC"),
      db.query("SELECT id, name, color, utm_source, utm_medium, utm_campaign, utm_term, utm_content FROM social_campaigns WHERE status != 'completed' ORDER BY name ASC"),
      db.query("SELECT * FROM hashtag_sets ORDER BY name ASC"),
    ]);
    if (postResult.rows.length === 0) return res.redirect('/social/posts');
    res.render('social/posts/form', {
      title: 'Edit Post - WTS Admin',
      post: postResult.rows[0],
      channels: channels.rows, campaigns: campaigns.rows, hashtagSets: hashtagSets.rows,
      currentPage: 'social-posts', platforms: PLATFORMS, contentTypes: CONTENT_TYPES,
      preselectedCampaign: null,
    });
  } catch (error) {
    res.redirect('/social/posts');
  }
});

router.post('/posts/:id', async (req, res) => {
  try {
    const { content, platforms, scheduled_at, status, media_urls, campaign_id, content_type, hashtags, labels, notes, link_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, targeting_age_min, targeting_age_max, targeting_gender, targeting_locations, targeting_interests } = req.body;
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    const mediaArray = media_urls ? media_urls.split('\n').map(u => u.trim()).filter(u => u) : [];
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const labelsArray = labels ? labels.split(',').map(l => l.trim()).filter(Boolean) : [];
    const utmParams = { source: utm_source, medium: utm_medium, campaign: utm_campaign, term: utm_term, content: utm_content };
    const targeting = { age_min: targeting_age_min || null, age_max: targeting_age_max || null, gender: targeting_gender || 'all', locations: targeting_locations ? targeting_locations.split(',').map(l => l.trim()).filter(Boolean) : [], interests: targeting_interests ? targeting_interests.split(',').map(i => i.trim()).filter(Boolean) : [] };

    await db.query(
      `UPDATE social_posts SET content=$1, platforms=$2, scheduled_at=$3, status=$4::VARCHAR, media_urls=$5, campaign_id=$6, content_type=$7, hashtags=$8, labels=$9, notes=$10, link_url=$11, utm_params=$12, targeting=$13, updated_at=CURRENT_TIMESTAMP,
       published_at = CASE WHEN $4::VARCHAR = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id=$14`,
      [content, platformsArray, scheduled_at || null, status, mediaArray, campaign_id || null, content_type || 'text', hashtagsArray, labelsArray, notes, link_url, JSON.stringify(utmParams), JSON.stringify(targeting), req.params.id]
    );
    req.session.successMessage = 'Post updated';
    res.redirect('/social/posts');
  } catch (error) {
    req.session.errorMessage = 'Failed to update post';
    res.redirect('/social/posts/' + req.params.id + '/edit');
  }
});

router.post('/posts/:id/clone', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_posts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/posts');
    const p = result.rows[0];
    await db.query(
      `INSERT INTO social_posts (content, platforms, status, media_urls, author_id, campaign_id, content_type, hashtags, labels, notes, link_url, utm_params, targeting)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [p.content, p.platforms, p.media_urls, req.user.id, p.campaign_id, p.content_type, p.hashtags, p.labels, p.notes, p.link_url, JSON.stringify(p.utm_params || {}), JSON.stringify(p.targeting || {})]
    );
    req.session.successMessage = 'Post cloned as draft';
    res.redirect('/social/posts');
  } catch (error) {
    req.session.errorMessage = 'Failed to clone post';
    res.redirect('/social/posts');
  }
});

router.post('/posts/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM social_posts WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Post deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete post';
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
      currentPage: 'social-channels',
    });
  } catch (error) {
    res.render('social/channels/list', { title: 'Social Channels - WTS Admin', channels: [], currentPage: 'social-channels', error: 'Failed to load channels' });
  }
});

router.get('/channels/new', (req, res) => {
  res.render('social/channels/form', { title: 'New Channel - WTS Admin', channel: null, currentPage: 'social-channels', platformOptions: PLATFORMS });
});

router.post('/channels', async (req, res) => {
  try {
    const { platform, account_name, account_id, status } = req.body;
    await db.query('INSERT INTO social_channels (platform, account_name, account_id, status) VALUES ($1,$2,$3,$4)', [platform, account_name, account_id, status || 'active']);
    req.session.successMessage = 'Channel added';
    res.redirect('/social/channels');
  } catch (error) {
    res.render('social/channels/form', { title: 'New Channel - WTS Admin', channel: req.body, currentPage: 'social-channels', platformOptions: PLATFORMS, error: 'Failed to create channel' });
  }
});

router.get('/channels/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM social_channels WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/channels');
    res.render('social/channels/form', { title: 'Edit Channel - WTS Admin', channel: result.rows[0], currentPage: 'social-channels', platformOptions: PLATFORMS });
  } catch (error) {
    res.redirect('/social/channels');
  }
});

router.post('/channels/:id', async (req, res) => {
  try {
    const { platform, account_name, account_id, status } = req.body;
    await db.query('UPDATE social_channels SET platform=$1, account_name=$2, account_id=$3, status=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5', [platform, account_name, account_id, status, req.params.id]);
    req.session.successMessage = 'Channel updated';
    res.redirect('/social/channels');
  } catch (error) {
    req.session.errorMessage = 'Failed to update channel';
    res.redirect('/social/channels/' + req.params.id + '/edit');
  }
});

router.post('/channels/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM social_channels WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Channel deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete channel';
  }
  res.redirect('/social/channels');
});

// ==================== HASHTAG SETS ====================

router.get('/hashtags', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hashtag_sets ORDER BY name ASC');
    res.render('social/hashtags/list', { title: 'Hashtag Manager - WTS Admin', hashtagSets: result.rows, currentPage: 'social-hashtags' });
  } catch (error) {
    res.render('social/hashtags/list', { title: 'Hashtag Manager - WTS Admin', hashtagSets: [], currentPage: 'social-hashtags', error: 'Failed to load hashtag sets' });
  }
});

router.get('/hashtags/new', (req, res) => {
  res.render('social/hashtags/form', { title: 'New Hashtag Set - WTS Admin', hashtagSet: null, currentPage: 'social-hashtags', platforms: PLATFORMS });
});

router.post('/hashtags', async (req, res) => {
  try {
    const { name, description, hashtags, category, platforms } = req.body;
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    await db.query('INSERT INTO hashtag_sets (name, description, hashtags, category, platforms) VALUES ($1,$2,$3,$4,$5)', [name, description, hashtagsArray, category, platformsArray]);
    req.session.successMessage = 'Hashtag set created';
    res.redirect('/social/hashtags');
  } catch (error) {
    req.session.errorMessage = 'Failed to create hashtag set';
    res.redirect('/social/hashtags/new');
  }
});

router.get('/hashtags/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM hashtag_sets WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/social/hashtags');
    res.render('social/hashtags/form', { title: 'Edit Hashtag Set - WTS Admin', hashtagSet: result.rows[0], currentPage: 'social-hashtags', platforms: PLATFORMS });
  } catch (error) {
    res.redirect('/social/hashtags');
  }
});

router.post('/hashtags/:id', async (req, res) => {
  try {
    const { name, description, hashtags, category, platforms } = req.body;
    const hashtagsArray = hashtags ? hashtags.split(',').map(h => h.trim().replace(/^#/, '')).filter(Boolean).map(h => '#' + h) : [];
    const platformsArray = Array.isArray(platforms) ? platforms : (platforms ? [platforms] : []);
    await db.query('UPDATE hashtag_sets SET name=$1, description=$2, hashtags=$3, category=$4, platforms=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6', [name, description, hashtagsArray, category, platformsArray, req.params.id]);
    req.session.successMessage = 'Hashtag set updated';
    res.redirect('/social/hashtags');
  } catch (error) {
    req.session.errorMessage = 'Failed to update hashtag set';
    res.redirect('/social/hashtags/' + req.params.id + '/edit');
  }
});

router.post('/hashtags/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM hashtag_sets WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Hashtag set deleted';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete hashtag set';
  }
  res.redirect('/social/hashtags');
});

// ==================== CONTENT CALENDAR ====================

router.get('/calendar', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth();
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    const [postsResult, campaignsResult] = await Promise.all([
      db.query(`
        SELECT sp.id, sp.content, sp.platforms, sp.scheduled_at, sp.status, sp.content_type,
               sc.name as campaign_name, sc.color as campaign_color
        FROM social_posts sp
        LEFT JOIN social_campaigns sc ON sp.campaign_id = sc.id
        WHERE sp.scheduled_at BETWEEN $1 AND $2
        ORDER BY sp.scheduled_at ASC
      `, [startDate.toISOString(), endDate.toISOString()]),
      db.query("SELECT id, name, color FROM social_campaigns ORDER BY name ASC"),
    ]);

    res.render('social/calendar', {
      title: 'Content Calendar - WTS Admin',
      posts: postsResult.rows,
      campaigns: campaignsResult.rows,
      currentPage: 'social-calendar',
      month, year,
      platforms: PLATFORMS,
    });
  } catch (error) {
    res.render('social/calendar', {
      title: 'Content Calendar - WTS Admin',
      posts: [], campaigns: [],
      currentPage: 'social-calendar',
      month: new Date().getMonth(), year: new Date().getFullYear(),
      platforms: PLATFORMS,
      error: 'Failed to load calendar',
    });
  }
});

module.exports = router;
