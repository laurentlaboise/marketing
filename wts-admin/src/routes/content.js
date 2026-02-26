const express = require('express');
const https = require('https');
const { ensureAuthenticated, logActivity } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const striptags = require('striptags');

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

// Multer config for CSV/XLSX file uploads
const UPLOAD_TEMP_DIR = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

const csvUpload = multer({
  dest: UPLOAD_TEMP_DIR,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(csv)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

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
    articleId: null,
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
      articleId: null,
      currentPage: 'articles',
      error: errors.array()[0].msg
    });
  }

  try {
    const { title, content, excerpt, category, tags, seo_title, seo_description, seo_keywords, status, featured_image, published_url, article_code, featured, published_at, updated_at, time_to_read, article_images, og_title, og_description, og_image, og_type, twitter_card, twitter_title, twitter_description, twitter_image, twitter_site, twitter_creator, canonical_url, robots_meta, schema_markup, citations, content_labels, text_article, audio_files, author_type, author_name, author_job_title, author_url } = req.body;
    const slug = createSlug(title);
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
    const keywordsArray = seo_keywords ? seo_keywords.split(',').map(k => k.trim()).filter(k => k) : [];
    const isFeatured = featured === 'true' || featured === true;
    const timeToRead = time_to_read ? parseInt(time_to_read, 10) : null;
    const publishedAtValue = published_at ? new Date(published_at) : (status === 'published' ? new Date() : null);
    const updatedAtValue = updated_at ? new Date(updated_at) : new Date();
    const articleImagesArray = article_images ? JSON.parse(article_images) : [];
    let schemaMarkupJson = null;
    if (schema_markup && schema_markup.trim()) {
      try { schemaMarkupJson = JSON.parse(schema_markup); } catch(e) { schemaMarkupJson = null; }
    }
    let citationsArray = [];
    if (citations && citations.trim()) {
      try { citationsArray = JSON.parse(citations); } catch(e) { citationsArray = []; }
    }
    let contentLabelsJson = {};
    if (content_labels && content_labels.trim()) {
      try { contentLabelsJson = JSON.parse(content_labels); } catch(e) { contentLabelsJson = {}; }
    }
    let audioFilesJson = {};
    if (audio_files && audio_files.trim()) {
      try { audioFilesJson = JSON.parse(audio_files); } catch(e) { audioFilesJson = {}; }
    }

    // Normalize twitter:creator format (must start with @)
    let normalizedTwitterCreator = twitter_creator ? twitter_creator.trim() : '';
    if (normalizedTwitterCreator && !normalizedTwitterCreator.startsWith('@')) {
      normalizedTwitterCreator = '@' + normalizedTwitterCreator;
    }

    // Normalize twitter:site format
    let normalizedTwitterSite = twitter_site ? twitter_site.trim() : '';
    if (normalizedTwitterSite && !normalizedTwitterSite.startsWith('@')) {
      normalizedTwitterSite = '@' + normalizedTwitterSite;
    }

    // Auto-populate canonical URL from slug if empty
    const resolvedCanonical = canonical_url || `https://wordsthatsells.website/en/articles/${slug}.html`;

    // Compute word count from text_article or content
    const rawText = (text_article || content || '').replace(/<[^>]*>/g, '');
    const wordCount = rawText.split(/\s+/).filter(w => w.length > 0).length || null;

    // Normalize tags to human-readable names
    const normalizedTags = tagsArray.map(t => t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

    await db.query(
      `INSERT INTO articles (title, slug, content, excerpt, category, tags, seo_title, seo_description, seo_keywords, status, featured_image, published_url, article_code, featured, author_id, published_at, updated_at, time_to_read, article_images, og_title, og_description, og_image, og_type, twitter_card, twitter_title, twitter_description, twitter_image, twitter_site, twitter_creator, canonical_url, robots_meta, schema_markup, citations, content_labels, text_article, audio_files, word_count, author_type, author_name, author_job_title, author_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41)`,
      [title, slug, content, excerpt, category, normalizedTags, seo_title, seo_description, keywordsArray, status || 'draft', featured_image, published_url, article_code, isFeatured, req.user.id, publishedAtValue, updatedAtValue, timeToRead, JSON.stringify(articleImagesArray), og_title, og_description, og_image, og_type || 'article', twitter_card || 'summary_large_image', twitter_title, twitter_description, twitter_image, normalizedTwitterSite, normalizedTwitterCreator, resolvedCanonical, robots_meta || 'index, follow', schemaMarkupJson ? JSON.stringify(schemaMarkupJson) : null, JSON.stringify(citationsArray), JSON.stringify(contentLabelsJson), text_article || null, JSON.stringify(audioFilesJson), wordCount, author_type || 'organization', author_name || null, author_job_title || null, author_url || null]
    );

    req.session.successMessage = 'Article created successfully';
    res.redirect('/content/articles');
  } catch (error) {
    console.error('Create article error:', error);
    res.render('content/articles/form', {
      title: 'New Article - WTS Admin',
      article: req.body,
      articleId: null,
      currentPage: 'articles',
      error: 'Failed to create article'
    });
  }
});

// AI analyze article from form data (for new articles not yet saved)
router.post('/articles/ai-analyze-draft', async (req, res) => {
  try {
    const { title, content, excerpt } = req.body;
    if (!title && !content) {
      return res.status(400).json({ error: 'Provide at least a title or content for AI analysis' });
    }

    const analysis = await analyzeArticleWithAI(title || '', content || '', excerpt || '');
    res.json({ success: true, ...analysis });
  } catch (error) {
    console.error('Article AI draft analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze article' });
  }
});

// ==================== ARTICLE CREATOR API ====================

// Fetch all linkable terms (glossary + SEO terms + AI tools) for auto-hyperlinking
router.get('/articles/api/link-terms', async (req, res) => {
  try {
    const [glossary, seoTerms, aiTools] = await Promise.all([
      db.query('SELECT id, term, definition, slug, category FROM glossary ORDER BY LENGTH(term) DESC'),
      db.query('SELECT id, term, short_definition, definition, category, slug, article_link, glossary_link FROM seo_terms ORDER BY LENGTH(term) DESC'),
      db.query("SELECT id, name, description, category, website_url FROM ai_tools WHERE status = 'active' ORDER BY LENGTH(name) DESC")
    ]);

    res.json({
      glossary: glossary.rows.map(g => ({
        id: g.id,
        term: g.term,
        definition: g.definition ? g.definition.substring(0, 200) : '',
        slug: g.slug,
        category: g.category,
        link: g.slug ? ('/en/resources/glossary/' + g.slug + '.html') : '',
        type: 'glossary'
      })),
      seo_terms: seoTerms.rows.map(s => ({
        id: s.id,
        term: s.term,
        definition: (s.short_definition || s.definition || '').substring(0, 200),
        slug: s.slug,
        category: s.category,
        link: s.article_link || s.glossary_link || '',
        type: 'seo'
      })),
      ai_tools: aiTools.rows.map(t => ({
        id: t.id,
        term: t.name,
        definition: (t.description || '').substring(0, 200),
        category: t.category,
        link: t.website_url || '',
        type: 'ai-tool'
      }))
    });
  } catch (error) {
    console.error('Link terms fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch link terms' });
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
    const { title, content, excerpt, category, tags, seo_title, seo_description, seo_keywords, status, featured_image, published_url, article_code, featured, published_at, updated_at, time_to_read, article_images, og_title, og_description, og_image, og_type, twitter_card, twitter_title, twitter_description, twitter_image, twitter_site, twitter_creator, canonical_url, robots_meta, schema_markup, citations, content_labels, text_article, audio_files, author_type, author_name, author_job_title, author_url } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      req.session.errorMessage = 'Title is required';
      return res.redirect(`/content/articles/${req.params.id}/edit`);
    }
    if (!content || !content.trim()) {
      req.session.errorMessage = 'Content is required';
      return res.redirect(`/content/articles/${req.params.id}/edit`);
    }

    const slug = createSlug(title);
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
    const keywordsArray = seo_keywords ? seo_keywords.split(',').map(k => k.trim()).filter(k => k) : [];
    const isFeatured = featured === 'true' || featured === true;
    const timeToRead = time_to_read ? parseInt(time_to_read, 10) : null;
    const updatedAtValue = updated_at ? new Date(updated_at) : new Date();
    const publishedAtValue = published_at ? new Date(published_at) : null;
    const articleImagesArray = article_images ? JSON.parse(article_images) : [];
    let schemaMarkupJson = null;
    if (schema_markup && schema_markup.trim()) {
      try { schemaMarkupJson = JSON.parse(schema_markup); } catch(e) { schemaMarkupJson = null; }
    }
    let citationsArray = [];
    if (citations && citations.trim()) {
      try { citationsArray = JSON.parse(citations); } catch(e) { citationsArray = []; }
    }
    let contentLabelsJson = {};
    if (content_labels && content_labels.trim()) {
      try { contentLabelsJson = JSON.parse(content_labels); } catch(e) { contentLabelsJson = {}; }
    }
    let audioFilesJson = {};
    if (audio_files && audio_files.trim()) {
      try { audioFilesJson = JSON.parse(audio_files); } catch(e) { audioFilesJson = {}; }
    }

    // Normalize twitter:creator format (must start with @)
    let normalizedTwitterCreator = twitter_creator ? twitter_creator.trim() : '';
    if (normalizedTwitterCreator && !normalizedTwitterCreator.startsWith('@')) {
      normalizedTwitterCreator = '@' + normalizedTwitterCreator;
    }

    // Normalize twitter:site format
    let normalizedTwitterSite = twitter_site ? twitter_site.trim() : '';
    if (normalizedTwitterSite && !normalizedTwitterSite.startsWith('@')) {
      normalizedTwitterSite = '@' + normalizedTwitterSite;
    }

    // Auto-populate canonical URL from slug if empty
    const resolvedCanonical = canonical_url || `https://wordsthatsells.website/en/articles/${slug}.html`;

    // Compute word count from text_article or content
    const rawTextSource = text_article || content || '';
    const rawText = striptags(rawTextSource);
    const wordCount = rawText.split(/\s+/).filter(w => w.length > 0).length || null;

    // Normalize tags to human-readable names
    const normalizedTags = tagsArray.map(t => t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));

    const result = await db.query(
      `UPDATE articles
       SET title = $1, content = $2, excerpt = $3, category = $4, tags = $5,
           seo_title = $6, seo_description = $7, seo_keywords = $8,
           status = $9::VARCHAR, featured_image = $10, published_url = $11,
           featured = $12, updated_at = $13,
           published_at = CASE WHEN $14::TIMESTAMP IS NOT NULL THEN $14::TIMESTAMP
                               WHEN $9::VARCHAR = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP
                               ELSE published_at END,
           time_to_read = $15, article_code = $16, article_images = $17::jsonb,
           og_title = $19, og_description = $20, og_image = $21, og_type = $22,
           twitter_card = $23, twitter_title = $24, twitter_description = $25,
           twitter_image = $26, twitter_site = $27, twitter_creator = $28,
           canonical_url = $29, robots_meta = $30, schema_markup = $31,
           citations = $32::jsonb, content_labels = $33::jsonb, text_article = $34,
           audio_files = $35::jsonb, word_count = $36,
           author_type = $37, author_name = $38, author_job_title = $39, author_url = $40
       WHERE id = $18 RETURNING id`,
      [title, content, excerpt, category, normalizedTags, seo_title, seo_description, keywordsArray, status, featured_image, published_url, isFeatured, updatedAtValue, publishedAtValue, timeToRead, article_code, JSON.stringify(articleImagesArray), req.params.id, og_title, og_description, og_image, og_type || 'article', twitter_card || 'summary_large_image', twitter_title, twitter_description, twitter_image, normalizedTwitterSite, normalizedTwitterCreator, resolvedCanonical, robots_meta || 'index, follow', schemaMarkupJson ? JSON.stringify(schemaMarkupJson) : null, JSON.stringify(citationsArray), JSON.stringify(contentLabelsJson), text_article || null, JSON.stringify(audioFilesJson), wordCount, author_type || 'organization', author_name || null, author_job_title || null, author_url || null]
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

// ==================== AI ARTICLE ANALYSIS ====================

// Helper: call Anthropic Claude API to analyze article content
function analyzeArticleWithAI(title, content, excerpt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to your environment variables.');
  }

  // Truncate content to ~8000 chars to stay within token limits
  const truncatedContent = content && content.length > 8000 ? content.substring(0, 8000) + '...' : content;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are an SEO and content marketing expert for WordsThatSells.website, a digital marketing agency. Analyze this article and generate optimized metadata.

Article Title: "${title}"
${excerpt ? `Excerpt: "${excerpt}"` : ''}
Content:
${truncatedContent || '(No content provided)'}

Return ONLY valid JSON (no markdown, no code fences) with these exact fields:
{
  "excerpt": "A compelling 1-2 sentence summary of the article (150-200 chars). Hook the reader.",
  "seo_title": "SEO-optimized page title (50-60 chars). Include primary keyword near the start.",
  "seo_description": "Meta description for search results (150-160 chars). Include a call-to-action.",
  "seo_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "category": "one of: marketing, seo, ai, social-media, content, business",
  "og_title": "Engaging social share title (40-60 chars). Optimized for clicks on Facebook/LinkedIn.",
  "og_description": "Social sharing description (100-200 chars). Compelling and actionable.",
  "twitter_title": "X/Twitter optimized title (max 70 chars). Punchy and attention-grabbing.",
  "twitter_description": "X/Twitter description (max 200 chars). Concise with value proposition.",
  "content_labels": {
    "description": "A short sidebar card description (2-3 sentences) explaining what the reader will gain.",
    "who_should_read": ["Audience type 1", "Audience type 2", "Audience type 3"],
    "key_points": [
      {"title": "Key Point 1", "description": "Brief explanation"},
      {"title": "Key Point 2", "description": "Brief explanation"},
      {"title": "Key Point 3", "description": "Brief explanation"}
    ]
  }
}

Focus on:
- Natural keyword integration for Google, Bing, ChatGPT, Perplexity
- Compelling copy that drives clicks and engagement
- Accurate content representation
- Keywords should be relevant SEO terms for digital marketing
- Tags should be lowercase, 4-6 tags
- Category must be one of the listed options`
      }
    ]
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

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'Anthropic API error'));
            return;
          }

          const textBlock = response.content && response.content.find(b => b.type === 'text');
          if (!textBlock || !textBlock.text) {
            reject(new Error('No text response from AI'));
            return;
          }

          let jsonText = textBlock.text.trim();
          jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
          const result = JSON.parse(jsonText);
          resolve(result);
        } catch (e) {
          reject(new Error('Failed to parse AI response: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(new Error('API request failed: ' + e.message)));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('API request timed out')); });
    req.write(requestBody);
    req.end();
  });
}

// AI analyze article endpoint
router.post('/articles/:id/ai-analyze', async (req, res) => {
  try {
    const result = await db.query('SELECT title, content, excerpt FROM articles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const article = result.rows[0];
    if (!article.title && !article.content) {
      return res.status(400).json({ error: 'Article needs at least a title or content for AI analysis' });
    }

    const analysis = await analyzeArticleWithAI(article.title, article.content, article.excerpt);
    res.json({ success: true, ...analysis });
  } catch (error) {
    console.error('Article AI analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze article' });
  }
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
    const { term, definition, short_definition, category, related_terms, examples, bullets, video_url, featured_image, article_link, glossary_link } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];
    const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let bulletsArray = [];
    if (bullets && bullets.trim()) {
      try { bulletsArray = JSON.parse(bullets); } catch(e) { bulletsArray = bullets.split('\n').map(b => b.trim()).filter(b => b); }
    }

    await db.query(
      `INSERT INTO seo_terms (term, definition, short_definition, category, related_terms, examples, slug, bullets, video_url, featured_image, article_link, glossary_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [term, definition, short_definition || null, category, relatedArray, examples, slug, JSON.stringify(bulletsArray), video_url || null, featured_image || null, article_link || null, glossary_link || null]
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
    const { term, definition, short_definition, category, related_terms, examples, bullets, video_url, featured_image, article_link, glossary_link } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];
    const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let bulletsArray = [];
    if (bullets && bullets.trim()) {
      try { bulletsArray = JSON.parse(bullets); } catch(e) { bulletsArray = bullets.split('\n').map(b => b.trim()).filter(b => b); }
    }

    await db.query(
      `UPDATE seo_terms SET term = $1, definition = $2, short_definition = $3, category = $4, related_terms = $5, examples = $6, slug = $7, bullets = $8, video_url = $9, featured_image = $10, article_link = $11, glossary_link = $12, updated_at = CURRENT_TIMESTAMP WHERE id = $13`,
      [term, definition, short_definition || null, category, relatedArray, examples, slug, JSON.stringify(bulletsArray), video_url || null, featured_image || null, article_link || null, glossary_link || null, req.params.id]
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

// SEO Terms JSON API (for autocomplete in article form)
router.get('/seo-terms/api/list', async (req, res) => {
  try {
    const result = await db.query('SELECT id, term, category, short_definition FROM seo_terms ORDER BY term ASC');
    res.json({ terms: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load SEO terms' });
  }
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
    const { term, definition, category, related_terms, video_url, featured_image, article_link, bullets, example, categories: catList } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];
    const categoriesArray = catList ? catList.split(',').map(c => c.trim()).filter(c => c) : (category ? [category] : []);
    const letter = term.charAt(0).toUpperCase();
    const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let bulletsArray = [];
    if (bullets && bullets.trim()) {
      try { bulletsArray = JSON.parse(bullets); } catch(e) { bulletsArray = bullets.split('\n').filter(b => b.trim()); }
    }

    await db.query(
      `INSERT INTO glossary (term, definition, category, related_terms, letter, slug, video_url, featured_image, article_link, bullets, example, categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [term, definition, category, relatedArray, letter, slug, video_url || null, featured_image || null, article_link || null, JSON.stringify(bulletsArray), example || null, categoriesArray]
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

// Glossary bulk import from CSV (Google Sheets export)
router.post('/glossary/import', csvUpload.single('file'), async (req, res) => {
  let tempFilePath = null;
  try {
    if (!req.file) {
      req.session.errorMessage = 'Please select a CSV file to import';
      return res.redirect('/content/glossary');
    }

    tempFilePath = req.file.path;
    const fileContent = fs.readFileSync(tempFilePath, 'utf-8');

    // Parse CSV with flexible column detection
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });

    if (records.length === 0) {
      req.session.errorMessage = 'The CSV file is empty or has no data rows';
      return res.redirect('/content/glossary');
    }

    // Normalize column headers (case-insensitive matching)
    const normalizeHeader = (header) => header.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const mapRow = (row) => {
      const mapped = {};
      for (const [key, value] of Object.entries(row)) {
        mapped[normalizeHeader(key)] = value;
      }
      return mapped;
    };

    // Fetch existing terms for duplicate checking
    const existingResult = await db.query('SELECT term FROM glossary');
    const existingTerms = new Set(existingResult.rows.map(r => r.term.toLowerCase().trim()));

    let imported = 0;
    let skippedDuplicates = 0;
    let skippedInvalid = 0;

    for (const rawRow of records) {
      const row = mapRow(rawRow);

      // Map columns (support multiple common header names)
      const term = (row.term || row.name || row.title || '').trim();
      const definition = (row.definition || row.description || row.meaning || '').trim();
      const category = (row.category || row.primary_category || '').trim();
      const categories = (row.categories || row.all_categories || row.tags || '').trim();
      const relatedTerms = (row.related_terms || row.related || '').trim();
      const example = (row.example || row.examples || '').trim();
      const videoUrl = (row.video_url || row.video || '').trim();
      const featuredImage = (row.featured_image || row.image || row.image_url || '').trim();
      const articleLink = (row.article_link || row.article || row.article_url || '').trim();
      const bulletsRaw = (row.bullets || row.key_concepts || row.key_points || '').trim();

      // Validate required fields
      if (!term || !definition) {
        skippedInvalid++;
        continue;
      }

      // Check for duplicates
      if (existingTerms.has(term.toLowerCase())) {
        skippedDuplicates++;
        continue;
      }

      // Process fields
      const letter = term.charAt(0).toUpperCase();
      const slug = createSlug(term);
      const relatedArray = relatedTerms ? relatedTerms.split(',').map(t => t.trim()).filter(t => t) : [];
      const categoriesArray = categories ? categories.split(',').map(c => c.trim()).filter(c => c) : (category ? [category] : []);
      let bulletsArray = [];
      if (bulletsRaw) {
        // Support semicolon-separated or newline-separated bullets
        bulletsArray = bulletsRaw.split(/[;\n]/).map(b => b.trim()).filter(b => b);
      }

      await db.query(
        `INSERT INTO glossary (term, definition, category, related_terms, letter, slug, video_url, featured_image, article_link, bullets, example, categories)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [term, definition, category || null, relatedArray, letter, slug, videoUrl || null, featuredImage || null, articleLink || null, JSON.stringify(bulletsArray), example || null, categoriesArray]
      );

      // Track the new term to prevent duplicates within the same import
      existingTerms.add(term.toLowerCase());
      imported++;
    }

    // Build result message
    const parts = [`${imported} term${imported !== 1 ? 's' : ''} imported successfully`];
    if (skippedDuplicates > 0) {
      parts.push(`${skippedDuplicates} duplicate${skippedDuplicates !== 1 ? 's' : ''} skipped`);
    }
    if (skippedInvalid > 0) {
      parts.push(`${skippedInvalid} invalid row${skippedInvalid !== 1 ? 's' : ''} skipped`);
    }
    req.session.successMessage = parts.join(', ');
    res.redirect('/content/glossary');
  } catch (error) {
    console.error('Glossary import error:', error);
    req.session.errorMessage = 'Failed to import glossary: ' + error.message;
    res.redirect('/content/glossary');
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try { fs.unlinkSync(tempFilePath); } catch (e) { console.error('Temp file cleanup error:', e.message); }
    }
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
    const { term, definition, category, related_terms, video_url, featured_image, article_link, bullets, example, categories: catList } = req.body;
    const relatedArray = related_terms ? related_terms.split(',').map(t => t.trim()).filter(t => t) : [];
    const categoriesArray = catList ? catList.split(',').map(c => c.trim()).filter(c => c) : (category ? [category] : []);
    const letter = term.charAt(0).toUpperCase();
    const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let bulletsArray = [];
    if (bullets && bullets.trim()) {
      try { bulletsArray = JSON.parse(bullets); } catch(e) { bulletsArray = bullets.split('\n').filter(b => b.trim()); }
    }

    await db.query(
      `UPDATE glossary SET term = $1, definition = $2, category = $3, related_terms = $4, letter = $5,
       slug = $6, video_url = $7, featured_image = $8, article_link = $9, bullets = $10, example = $11,
       categories = $12, updated_at = CURRENT_TIMESTAMP WHERE id = $13`,
      [term, definition, category, relatedArray, letter, slug, video_url || null, featured_image || null, article_link || null, JSON.stringify(bulletsArray), example || null, categoriesArray, req.params.id]
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
      `UPDATE guides SET title = $1, short_description = $2, long_content = $3, category = $4, icon = $5, image_url = $6, pdf_url = $7, video_url = $8, status = $9::VARCHAR, updated_at = CURRENT_TIMESTAMP, published_at = CASE WHEN $9::VARCHAR = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP ELSE published_at END
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
