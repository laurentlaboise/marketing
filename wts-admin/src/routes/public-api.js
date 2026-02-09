const express = require('express');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const router = express.Router();

// CORS for public API - allow requests from the main website
router.use(cors({
  origin: [
    'https://wordsthatsells.website',
    'https://www.wordsthatsells.website',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET'],
  credentials: false
}));

// Rate limiting for public API
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

router.use(publicLimiter);

// API response helper
const respond = (res, data, status = 200) => {
  res.status(status).json(data);
};

// ==================== ARTICLES ====================

// Get all published articles
router.get('/articles', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const category = req.query.category || '';

    let query = `
      SELECT id, title, slug, excerpt, content, featured_image, category, tags,
             seo_title, seo_description, featured, published_at, created_at, updated_at
      FROM articles
      WHERE status = 'published'
    `;
    const params = [];

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ` ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const result = await db.query(query, params);

    // Transform data for frontend compatibility
    const articles = result.rows.map(article => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      description: article.excerpt || article.seo_description || '',
      content: article.content,
      featured_image_url: article.featured_image,
      categories: article.category ? [article.category] : [],
      tags: article.tags || [],
      is_published: true,
      featured: article.featured || false,
      sidebar_content: article.excerpt || article.content?.substring(0, 500) || '',
      full_article_content: article.content,
      published_url: article.published_url || '',
      created_at: article.created_at,
      updated_at: article.updated_at,
      published_at: article.published_at
    }));

    respond(res, articles);
  } catch (error) {
    console.error('Public API - Articles error:', error);
    respond(res, { error: 'Failed to load articles' }, 500);
  }
});

// Get single article by slug
router.get('/articles/:slug', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM articles WHERE slug = $1 AND status = 'published'`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return respond(res, { error: 'Article not found' }, 404);
    }

    const article = result.rows[0];
    respond(res, {
      id: article.id,
      title: article.title,
      slug: article.slug,
      description: article.excerpt || article.seo_description || '',
      content: article.content,
      featured_image_url: article.featured_image,
      categories: article.category ? [article.category] : [],
      tags: article.tags || [],
      is_published: true,
      created_at: article.created_at,
      updated_at: article.updated_at
    });
  } catch (error) {
    console.error('Public API - Single article error:', error);
    respond(res, { error: 'Failed to load article' }, 500);
  }
});

// ==================== GLOSSARY ====================

// Get all glossary terms
router.get('/glossary', async (req, res) => {
  try {
    const letter = req.query.letter || '';

    let query = 'SELECT * FROM glossary';
    const params = [];

    if (letter) {
      query += ' WHERE letter = $1';
      params.push(letter.toUpperCase());
    }

    query += ' ORDER BY term ASC';

    const result = await db.query(query, params);

    // Transform for frontend
    const terms = result.rows.map(item => ({
      id: item.id,
      term: item.term,
      definition: item.definition,
      category: item.category,
      related_terms: item.related_terms || [],
      letter: item.letter
    }));

    respond(res, terms);
  } catch (error) {
    console.error('Public API - Glossary error:', error);
    respond(res, { error: 'Failed to load glossary' }, 500);
  }
});

// ==================== AI TOOLS ====================

// Get all active AI tools
router.get('/ai-tools', async (req, res) => {
  try {
    const category = req.query.category || '';

    let query = `SELECT * FROM ai_tools WHERE status = 'active'`;
    const params = [];

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ' ORDER BY name ASC';

    const result = await db.query(query, params);

    // Transform for frontend compatibility
    const tools = result.rows.map(tool => ({
      name: tool.name,
      category: tool.category,
      description: tool.description,
      pricing: tool.pricing_model || 'Unknown',
      logo: tool.logo_url,
      website_link: tool.website_url,
      app_store_link: null,
      play_store_link: null,
      key_features: tool.features || [],
      pros: tool.pros || [],
      cons: tool.cons || [],
      rating: tool.rating
    }));

    respond(res, tools);
  } catch (error) {
    console.error('Public API - AI Tools error:', error);
    respond(res, { error: 'Failed to load AI tools' }, 500);
  }
});

// Get AI tool categories
router.get('/ai-tools/categories', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT category FROM ai_tools WHERE status = 'active' AND category IS NOT NULL ORDER BY category`
    );
    respond(res, result.rows.map(r => r.category));
  } catch (error) {
    console.error('Public API - AI Tool categories error:', error);
    respond(res, { error: 'Failed to load categories' }, 500);
  }
});

// ==================== E-GUIDES ====================

// Get all published guides
router.get('/guides', async (req, res) => {
  try {
    const category = req.query.category || '';

    let query = `SELECT * FROM guides WHERE status = 'published'`;
    const params = [];

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ' ORDER BY published_at DESC NULLS LAST, created_at DESC';

    const result = await db.query(query, params);

    // Transform for frontend compatibility
    const guides = result.rows.map(guide => ({
      id: guide.id,
      title: guide.title,
      slug: guide.slug,
      category: guide.category,
      icon: guide.icon || 'fas fa-book',
      image: guide.image_url,
      short_description: guide.short_description,
      long_content: guide.long_content,
      pdf_link: guide.pdf_url || '#',
      blog_link: `/en/resources/guides/${guide.slug}`,
      video_link: guide.video_url || '#'
    }));

    respond(res, guides);
  } catch (error) {
    console.error('Public API - Guides error:', error);
    respond(res, { error: 'Failed to load guides' }, 500);
  }
});

// Get single guide by slug
router.get('/guides/:slug', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM guides WHERE slug = $1 AND status = 'published'`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return respond(res, { error: 'Guide not found' }, 404);
    }

    const guide = result.rows[0];
    respond(res, {
      id: guide.id,
      title: guide.title,
      slug: guide.slug,
      category: guide.category,
      icon: guide.icon || 'fas fa-book',
      image: guide.image_url,
      short_description: guide.short_description,
      long_content: guide.long_content,
      pdf_link: guide.pdf_url || '#',
      video_link: guide.video_url || '#'
    });
  } catch (error) {
    console.error('Public API - Single guide error:', error);
    respond(res, { error: 'Failed to load guide' }, 500);
  }
});

// Get guide categories
router.get('/guides/categories', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT category FROM guides WHERE status = 'published' AND category IS NOT NULL ORDER BY category`
    );
    respond(res, result.rows.map(r => r.category));
  } catch (error) {
    console.error('Public API - Guide categories error:', error);
    respond(res, { error: 'Failed to load categories' }, 500);
  }
});

// ==================== SEO TERMS ====================

// Get all SEO terms
router.get('/seo-terms', async (req, res) => {
  try {
    const category = req.query.category || '';

    let query = 'SELECT * FROM seo_terms';
    const params = [];

    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }

    query += ' ORDER BY term ASC';

    const result = await db.query(query, params);
    respond(res, result.rows);
  } catch (error) {
    console.error('Public API - SEO Terms error:', error);
    respond(res, { error: 'Failed to load SEO terms' }, 500);
  }
});

// Health check
router.get('/health', (req, res) => {
  respond(res, { status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
