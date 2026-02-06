const express = require('express');
const { ensureAuthenticated, logActivity } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');

const router = express.Router();
router.use(ensureAuthenticated);

const contentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each authenticated IP/user to 100 requests per windowMs
});

router.use(contentLimiter);

// Helper to create slug
const createSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// ==================== ARTICLES ====================

// List articles
router.get('/articles', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';

    let query = 'SELECT * FROM articles';
    let countQuery = 'SELECT COUNT(*) FROM articles';
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push(`(title ILIKE $${params.length + 1} OR content ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [articles, count] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params)
    ]);

    const totalPages = Math.ceil(count.rows[0].count / limit);

    res.render('content/articles/list', {
      title: 'Articles - WTS Admin',
      articles: articles.rows,
      currentPage: 'articles',
      pagination: { page, totalPages, search, status }
    });
  } catch (error) {
    console.error('Articles list error:', error);
    res.render('content/articles/list', {
      title: 'Articles - WTS Admin',
      articles: [],
      currentPage: 'articles',
      error: 'Failed to load articles'
    });
  }
});

// New article form
router.get('/articles/new', (req, res) => {
  res.render('content/articles/form', {
    title: 'New Article - WTS Admin',
    article: null,
    currentPage: 'articles'
  });
});

// Create article
router.post('/articles', [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').trim().notEmpty().withMessage('Content is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('content/articles/form', {
      title: 'New Article - WTS Admin',
      article: req.body,
      currentPage: 'articles',
      error: errors.array()[0].msg
    });
  }

  try {
    const { title, content, excerpt, category, tags, seo_title, seo_description, seo_keywords, status, featured_image, featured } = req.body;
    const slug = createSlug(title);
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
    const keywordsArray = seo_keywords ? seo_keywords.split(',').map(k => k.trim()).filter(k => k) : [];
    const isFeatured = featured === 'true' || featured === true;

    await db.query(
      `INSERT INTO articles (title, slug, content, excerpt, category, tags, seo_title, seo_description, seo_keywords, status, featured_image, featured, author_id, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [title, slug, content, excerpt, category, tagsArray, seo_title, seo_description, keywordsArray, status || 'draft', featured_image, isFeatured, req.user.id, status === 'published' ? new Date() : null]
    );

    req.session.successMessage = 'Article created successfully';
    res.redirect('/content/articles');
  } catch (error) {
    console.error('Create article error:', error);
    res.render('content/articles/form', {
      title: 'New Article - WTS Admin',
      article: req.body,
      currentPage: 'articles',
      error: 'Failed to create article'
    });
  }
});

// Edit article form
router.get('/articles/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM articles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Article not found';
      return res.redirect('/content/articles');
    }
    res.render('content/articles/form', {
      title: 'Edit Article - WTS Admin',
      article: result.rows[0],
      currentPage: 'articles'
    });
  } catch (error) {
    console.error('Edit article error:', error);
    res.redirect('/content/articles');
  }
});

// Update article
router.post('/articles/:id', async (req, res) => {
  try {
    const { title, content, excerpt, category, tags, seo_title, seo_description, seo_keywords, status, featured_image, featured } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      req.session.errorMessage = 'Title is required';
      return res.redirect(`/content/articles/${req.params.id}/edit`);
    }
    if (!content || !content.trim()) {
      req.session.errorMessage = 'Content is required';
      return res.redirect(`/content/articles/${req.params.id}/edit`);
    }

    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
    const keywordsArray = seo_keywords ? seo_keywords.split(',').map(k => k.trim()).filter(k => k) : [];
    const isFeatured = featured === 'true' || featured === true;

    const result = await db.query(
      `UPDATE articles SET title = $1, content = $2, excerpt = $3, category = $4, tags = $5, seo_title = $6, seo_description = $7, seo_keywords = $8, status = $9::VARCHAR, featured_image = $10, featured = $11, updated_at = CURRENT_TIMESTAMP, published_at = CASE WHEN $9::VARCHAR = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END
       WHERE id = $12 RETURNING id`,
      [title, content, excerpt, category, tagsArray, seo_title, seo_description, keywordsArray, status, featured_image, isFeatured, req.params.id]
    );

    if (result.rowCount === 0) {
      req.session.errorMessage = 'Article not found';
      return res.redirect('/content/articles');
    }

    req.session.successMessage = 'Article updated successfully';
    res.redirect('/content/articles');
  } catch (error) {
    console.error('Update article error:', error.message, error.stack);
    req.session.errorMessage = `Failed to update article: ${error.message}`;
    res.redirect(`/content/articles/${req.params.id}/edit`);
  }
});

// Delete article
router.post('/articles/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM articles WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Article deleted successfully';
  } catch (error) {
    console.error('Delete article error:', error);
    req.session.errorMessage = 'Failed to delete article';
  }
  res.redirect('/content/articles');
});

// ==================== SEO TERMS ====================

router.get('/seo-terms', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM seo_terms ORDER BY term ASC');
    res.render('content/seo-terms/list', {
      title: 'SEO Terms - WTS Admin',
      terms: result.rows,
      currentPage: 'seo-terms'
    });
  } catch (error) {
    res.render('content/seo-terms/list', {
      title: 'SEO Terms - WTS Admin',
      terms: [],
      currentPage: 'seo-terms',
      error: 'Failed to load SEO terms'
    });
  }
});

router.get('/seo-terms/new', (req, res) => {
  res.render('content/seo-terms/form', {
    title: 'New SEO Term - WTS Admin',
    term: null,
    currentPage: 'seo-terms'
  });
});

router.post('/seo-terms', async (req, res) => {
  try {
    const { term, definition, category, related_terms, examples } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];

    await db.query(
      'INSERT INTO seo_terms (term, definition, category, related_terms, examples) VALUES ($1, $2, $3, $4, $5)',
      [term, definition, category, relatedArray, examples]
    );
    req.session.successMessage = 'SEO term created successfully';
    res.redirect('/content/seo-terms');
  } catch (error) {
    console.error('Create SEO term error:', error);
    res.render('content/seo-terms/form', {
      title: 'New SEO Term - WTS Admin',
      term: req.body,
      currentPage: 'seo-terms',
      error: 'Failed to create SEO term'
    });
  }
});

router.get('/seo-terms/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM seo_terms WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/content/seo-terms');
    }
    res.render('content/seo-terms/form', {
      title: 'Edit SEO Term - WTS Admin',
      term: result.rows[0],
      currentPage: 'seo-terms'
    });
  } catch (error) {
    res.redirect('/content/seo-terms');
  }
});

router.post('/seo-terms/:id', async (req, res) => {
  try {
    const { term, definition, category, related_terms, examples } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];

    await db.query(
      'UPDATE seo_terms SET term = $1, definition = $2, category = $3, related_terms = $4, examples = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
      [term, definition, category, relatedArray, examples, req.params.id]
    );
    req.session.successMessage = 'SEO term updated successfully';
    res.redirect('/content/seo-terms');
  } catch (error) {
    req.session.errorMessage = 'Failed to update SEO term';
    res.redirect(`/content/seo-terms/${req.params.id}/edit`);
  }
});

router.post('/seo-terms/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM seo_terms WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'SEO term deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete SEO term';
  }
  res.redirect('/content/seo-terms');
});

// ==================== AI TOOLS ====================

router.get('/ai-tools', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_tools ORDER BY name ASC');
    res.render('content/ai-tools/list', {
      title: 'AI Tools - WTS Admin',
      tools: result.rows,
      currentPage: 'ai-tools'
    });
  } catch (error) {
    res.render('content/ai-tools/list', {
      title: 'AI Tools - WTS Admin',
      tools: [],
      currentPage: 'ai-tools',
      error: 'Failed to load AI tools'
    });
  }
});

router.get('/ai-tools/new', (req, res) => {
  res.render('content/ai-tools/form', {
    title: 'New AI Tool - WTS Admin',
    tool: null,
    currentPage: 'ai-tools'
  });
});

router.post('/ai-tools', async (req, res) => {
  try {
    const { name, description, category, website_url, pricing_model, features, pros, cons, rating, logo_url, status } = req.body;
    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const prosArray = pros ? pros.split('\n').map(p => p.trim()).filter(p => p) : [];
    const consArray = cons ? cons.split('\n').map(c => c.trim()).filter(c => c) : [];

    await db.query(
      'INSERT INTO ai_tools (name, description, category, website_url, pricing_model, features, pros, cons, rating, logo_url, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [name, description, category, website_url, pricing_model, featuresArray, prosArray, consArray, rating || null, logo_url, status || 'active']
    );
    req.session.successMessage = 'AI tool created successfully';
    res.redirect('/content/ai-tools');
  } catch (error) {
    console.error('Create AI tool error:', error);
    res.render('content/ai-tools/form', {
      title: 'New AI Tool - WTS Admin',
      tool: req.body,
      currentPage: 'ai-tools',
      error: 'Failed to create AI tool'
    });
  }
});

router.get('/ai-tools/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_tools WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/content/ai-tools');
    }
    res.render('content/ai-tools/form', {
      title: 'Edit AI Tool - WTS Admin',
      tool: result.rows[0],
      currentPage: 'ai-tools'
    });
  } catch (error) {
    res.redirect('/content/ai-tools');
  }
});

router.post('/ai-tools/:id', async (req, res) => {
  try {
    const { name, description, category, website_url, pricing_model, features, pros, cons, rating, logo_url, status } = req.body;
    const featuresArray = features ? features.split('\n').map(f => f.trim()).filter(f => f) : [];
    const prosArray = pros ? pros.split('\n').map(p => p.trim()).filter(p => p) : [];
    const consArray = cons ? cons.split('\n').map(c => c.trim()).filter(c => c) : [];

    await db.query(
      'UPDATE ai_tools SET name = $1, description = $2, category = $3, website_url = $4, pricing_model = $5, features = $6, pros = $7, cons = $8, rating = $9, logo_url = $10, status = $11, updated_at = CURRENT_TIMESTAMP WHERE id = $12',
      [name, description, category, website_url, pricing_model, featuresArray, prosArray, consArray, rating || null, logo_url, status, req.params.id]
    );
    req.session.successMessage = 'AI tool updated successfully';
    res.redirect('/content/ai-tools');
  } catch (error) {
    req.session.errorMessage = 'Failed to update AI tool';
    res.redirect(`/content/ai-tools/${req.params.id}/edit`);
  }
});

router.post('/ai-tools/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM ai_tools WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'AI tool deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete AI tool';
  }
  res.redirect('/content/ai-tools');
});

// ==================== GLOSSARY ====================

router.get('/glossary', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM glossary ORDER BY term ASC');
    res.render('content/glossary/list', {
      title: 'Glossary - WTS Admin',
      items: result.rows,
      currentPage: 'glossary'
    });
  } catch (error) {
    res.render('content/glossary/list', {
      title: 'Glossary - WTS Admin',
      items: [],
      currentPage: 'glossary',
      error: 'Failed to load glossary'
    });
  }
});

router.get('/glossary/new', (req, res) => {
  res.render('content/glossary/form', {
    title: 'New Glossary Term - WTS Admin',
    item: null,
    currentPage: 'glossary'
  });
});

router.post('/glossary', async (req, res) => {
  try {
    const { term, definition, category, related_terms } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];
    const letter = term.charAt(0).toUpperCase();

    await db.query(
      'INSERT INTO glossary (term, definition, category, related_terms, letter) VALUES ($1, $2, $3, $4, $5)',
      [term, definition, category, relatedArray, letter]
    );
    req.session.successMessage = 'Glossary term created successfully';
    res.redirect('/content/glossary');
  } catch (error) {
    console.error('Create glossary error:', error);
    res.render('content/glossary/form', {
      title: 'New Glossary Term - WTS Admin',
      item: req.body,
      currentPage: 'glossary',
      error: 'Failed to create glossary term'
    });
  }
});

router.get('/glossary/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM glossary WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.redirect('/content/glossary');
    }
    res.render('content/glossary/form', {
      title: 'Edit Glossary Term - WTS Admin',
      item: result.rows[0],
      currentPage: 'glossary'
    });
  } catch (error) {
    res.redirect('/content/glossary');
  }
});

router.post('/glossary/:id', async (req, res) => {
  try {
    const { term, definition, category, related_terms } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];
    const letter = term.charAt(0).toUpperCase();

    await db.query(
      'UPDATE glossary SET term = $1, definition = $2, category = $3, related_terms = $4, letter = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
      [term, definition, category, relatedArray, letter, req.params.id]
    );
    req.session.successMessage = 'Glossary term updated successfully';
    res.redirect('/content/glossary');
  } catch (error) {
    req.session.errorMessage = 'Failed to update glossary term';
    res.redirect(`/content/glossary/${req.params.id}/edit`);
  }
});

router.post('/glossary/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM glossary WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'Glossary term deleted successfully';
  } catch (error) {
    req.session.errorMessage = 'Failed to delete glossary term';
  }
  res.redirect('/content/glossary');
});

// ==================== E-GUIDES ====================

router.get('/guides', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';

    let query = 'SELECT * FROM guides';
    let countQuery = 'SELECT COUNT(*) FROM guides';
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push(`(title ILIKE $${params.length + 1} OR short_description ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (status) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [guides, count] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params)
    ]);

    const totalPages = Math.ceil(count.rows[0].count / limit);

    res.render('content/guides/list', {
      title: 'E-Guides - WTS Admin',
      guides: guides.rows,
      currentPage: 'guides',
      pagination: { page, totalPages, search, status }
    });
  } catch (error) {
    console.error('Guides list error:', error);
    res.render('content/guides/list', {
      title: 'E-Guides - WTS Admin',
      guides: [],
      currentPage: 'guides',
      error: 'Failed to load guides'
    });
  }
});

router.get('/guides/new', (req, res) => {
  res.render('content/guides/form', {
    title: 'New E-Guide - WTS Admin',
    guide: null,
    currentPage: 'guides'
  });
});

router.post('/guides', [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('short_description').trim().notEmpty().withMessage('Short description is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('content/guides/form', {
      title: 'New E-Guide - WTS Admin',
      guide: req.body,
      currentPage: 'guides',
      error: errors.array()[0].msg
    });
  }

  try {
    const { title, short_description, long_content, category, icon, image_url, pdf_url, video_url, status } = req.body;
    const slug = createSlug(title);

    await db.query(
      `INSERT INTO guides (title, slug, short_description, long_content, category, icon, image_url, pdf_url, video_url, status, author_id, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [title, slug, short_description, long_content, category, icon, image_url, pdf_url, video_url, status || 'draft', req.user.id, status === 'published' ? new Date() : null]
    );

    req.session.successMessage = 'E-Guide created successfully';
    res.redirect('/content/guides');
  } catch (error) {
    console.error('Create guide error:', error);
    res.render('content/guides/form', {
      title: 'New E-Guide - WTS Admin',
      guide: req.body,
      currentPage: 'guides',
      error: 'Failed to create guide'
    });
  }
});

router.get('/guides/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM guides WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Guide not found';
      return res.redirect('/content/guides');
    }
    res.render('content/guides/form', {
      title: 'Edit E-Guide - WTS Admin',
      guide: result.rows[0],
      currentPage: 'guides'
    });
  } catch (error) {
    console.error('Edit guide error:', error);
    res.redirect('/content/guides');
  }
});

router.post('/guides/:id', async (req, res) => {
  try {
    const { title, short_description, long_content, category, icon, image_url, pdf_url, video_url, status } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      req.session.errorMessage = 'Title is required';
      return res.redirect(`/content/guides/${req.params.id}/edit`);
    }
    if (!short_description || !short_description.trim()) {
      req.session.errorMessage = 'Short description is required';
      return res.redirect(`/content/guides/${req.params.id}/edit`);
    }

    const result = await db.query(
      `UPDATE guides SET title = $1, short_description = $2, long_content = $3, category = $4, icon = $5, image_url = $6, pdf_url = $7, video_url = $8, status = $9, updated_at = CURRENT_TIMESTAMP, published_at = CASE WHEN $9 = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END
       WHERE id = $10 RETURNING id`,
      [title, short_description, long_content, category, icon, image_url, pdf_url, video_url, status, req.params.id]
    );

    if (result.rowCount === 0) {
      req.session.errorMessage = 'Guide not found';
      return res.redirect('/content/guides');
    }

    req.session.successMessage = 'E-Guide updated successfully';
    res.redirect('/content/guides');
  } catch (error) {
    console.error('Update guide error:', error.message, error.stack);
    req.session.errorMessage = `Failed to update guide: ${error.message}`;
    res.redirect(`/content/guides/${req.params.id}/edit`);
  }
});

router.post('/guides/:id/delete', async (req, res) => {
  try {
    await db.query('DELETE FROM guides WHERE id = $1', [req.params.id]);
    req.session.successMessage = 'E-Guide deleted successfully';
  } catch (error) {
    console.error('Delete guide error:', error);
    req.session.errorMessage = 'Failed to delete guide';
  }
  res.redirect('/content/guides');
});

module.exports = router;
