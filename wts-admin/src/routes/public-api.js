const express = require('express');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// CORS is handled globally in server.js — no duplicate middleware here

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
             seo_title, seo_description, featured, published_url, published_at, created_at, updated_at,
             og_title, og_description, og_image, og_type,
             twitter_card, twitter_title, twitter_description, twitter_image, twitter_site, twitter_creator,
             canonical_url, robots_meta, schema_markup, article_images, citations,
             time_to_read, seo_keywords, content_labels
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
      article_images: article.article_images || [],
      citations: article.citations || [],
      time_to_read: article.time_to_read || null,
      seo_keywords: article.seo_keywords || [],
      content_labels: article.content_labels || {},
      created_at: article.created_at,
      updated_at: article.updated_at,
      published_at: article.published_at,
      social_meta: {
        og_title: article.og_title || article.seo_title || article.title,
        og_description: article.og_description || article.seo_description || article.excerpt || '',
        og_image: article.og_image || article.featured_image || '',
        og_type: article.og_type || 'article',
        twitter_card: article.twitter_card || 'summary_large_image',
        twitter_title: article.twitter_title || article.og_title || article.seo_title || article.title,
        twitter_description: article.twitter_description || article.og_description || article.seo_description || article.excerpt || '',
        twitter_image: article.twitter_image || article.og_image || article.featured_image || '',
        twitter_site: article.twitter_site || '',
        twitter_creator: article.twitter_creator || '',
        canonical_url: article.canonical_url || article.published_url || '',
        robots_meta: article.robots_meta || 'index, follow',
        schema_markup: article.schema_markup || null
      }
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
      featured: article.featured || false,
      published_url: article.published_url || '',
      full_article_content: article.content,
      time_to_read: article.time_to_read || null,
      article_images: article.article_images || [],
      citations: article.citations || [],
      seo_keywords: article.seo_keywords || [],
      content_labels: article.content_labels || {},
      created_at: article.created_at,
      updated_at: article.updated_at,
      published_at: article.published_at,
      social_meta: {
        og_title: article.og_title || article.seo_title || article.title,
        og_description: article.og_description || article.seo_description || article.excerpt || '',
        og_image: article.og_image || article.featured_image || '',
        og_type: article.og_type || 'article',
        twitter_card: article.twitter_card || 'summary_large_image',
        twitter_title: article.twitter_title || article.og_title || article.seo_title || article.title,
        twitter_description: article.twitter_description || article.og_description || article.seo_description || article.excerpt || '',
        twitter_image: article.twitter_image || article.og_image || article.featured_image || '',
        twitter_site: article.twitter_site || '',
        twitter_creator: article.twitter_creator || '',
        canonical_url: article.canonical_url || article.published_url || '',
        robots_meta: article.robots_meta || 'index, follow',
        schema_markup: article.schema_markup || null
      }
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
      slug: item.slug || '',
      definition: item.definition,
      category: item.category,
      categories: item.categories || [],
      related_terms: item.related_terms || [],
      letter: item.letter,
      bullets: item.bullets || [],
      example: item.example || '',
      video_url: item.video_url || '',
      featured_image: item.featured_image || '',
      article_link: item.article_link || ''
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
    const terms = result.rows.map(item => ({
      id: item.id,
      term: item.term,
      slug: item.slug || '',
      short_definition: item.short_definition || '',
      definition: item.definition || '',
      category: item.category || '',
      related_terms: item.related_terms || [],
      examples: item.examples || '',
      bullets: item.bullets || [],
      video_url: item.video_url || '',
      featured_image: item.featured_image || '',
      article_link: item.article_link || '',
      glossary_link: item.glossary_link || ''
    }));
    respond(res, terms);
  } catch (error) {
    console.error('Public API - SEO Terms error:', error);
    respond(res, { error: 'Failed to load SEO terms' }, 500);
  }
});

// ==================== PRODUCTS ====================

// Get all active products (optionally filtered by service_page)
router.get('/products', async (req, res) => {
  try {
    const service_page = req.query.service_page || '';
    const category = req.query.category || '';

    let query = `SELECT * FROM products WHERE status = 'active'`;
    const params = [];

    if (service_page) {
      query += ` AND service_page = $${params.length + 1}`;
      params.push(service_page);
    }

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ' ORDER BY sort_order ASC, name ASC';

    const result = await db.query(query, params);

    const products = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price ? parseFloat(p.price) : null,
      currency: p.currency || 'USD',
      category: p.category,
      service_page: p.service_page,
      product_type: p.product_type || 'service',
      features: p.features || [],
      image_url: p.image_url,
      icon_class: p.icon_class || 'fas fa-box',
      animation_class: p.animation_class || 'kinetic-pulse-float',
      is_featured: p.is_featured || false,
      has_stripe: !!(p.stripe_price_id || (p.price && parseFloat(p.price) > 0)),
      slide_in: {
        title: p.slide_in_title || p.name,
        subtitle: p.slide_in_subtitle || '',
        content: p.slide_in_content || '',
        image: p.slide_in_image || p.image_url || '',
        video: p.slide_in_video || ''
      }
    }));

    respond(res, products);
  } catch (error) {
    console.error('Public API - Products error:', error);
    respond(res, { error: 'Failed to load products' }, 500);
  }
});

// Get single product by slug
router.get('/products/:slug', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM products WHERE slug = $1 AND status = 'active'`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return respond(res, { error: 'Product not found' }, 404);
    }

    const p = result.rows[0];
    respond(res, {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price ? parseFloat(p.price) : null,
      currency: p.currency || 'USD',
      category: p.category,
      service_page: p.service_page,
      product_type: p.product_type || 'service',
      features: p.features || [],
      image_url: p.image_url,
      icon_class: p.icon_class || 'fas fa-box',
      animation_class: p.animation_class || 'kinetic-pulse-float',
      is_featured: p.is_featured || false,
      has_stripe: !!(p.stripe_price_id || (p.price && parseFloat(p.price) > 0)),
      slide_in: {
        title: p.slide_in_title || p.name,
        subtitle: p.slide_in_subtitle || '',
        content: p.slide_in_content || '',
        image: p.slide_in_image || p.image_url || '',
        video: p.slide_in_video || ''
      }
    });
  } catch (error) {
    console.error('Public API - Single product error:', error);
    respond(res, { error: 'Failed to load product' }, 500);
  }
});

// Get product categories for a service page
router.get('/products/categories/:service_page', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT category FROM products WHERE status = 'active' AND service_page = $1 AND category IS NOT NULL ORDER BY category`,
      [req.params.service_page]
    );
    respond(res, result.rows.map(r => r.category));
  } catch (error) {
    console.error('Public API - Product categories error:', error);
    respond(res, { error: 'Failed to load categories' }, 500);
  }
});

// ==================== SIDEBAR ITEMS ====================

// Get sidebar items for a section (or all)
router.get('/sidebar', async (req, res) => {
  try {
    const section = req.query.section || '';

    let query = `SELECT * FROM sidebar_items WHERE is_visible = TRUE`;
    const params = [];

    if (section) {
      query += ` AND (section = $${params.length + 1} OR section = 'global')`;
      params.push(section);
    }

    query += ' ORDER BY section ASC, sort_order ASC';

    const result = await db.query(query, params);

    const items = result.rows.map(item => ({
      id: item.id,
      label: item.label,
      url: item.url,
      icon_class: item.icon_class,
      section: item.section,
      sort_order: item.sort_order,
      open_in_new_tab: item.open_in_new_tab,
      css_class: item.css_class
    }));

    respond(res, items);
  } catch (error) {
    console.error('Public API - Sidebar error:', error);
    respond(res, { error: 'Failed to load sidebar items' }, 500);
  }
});

// ==================== PRICING PACKAGES ====================

// Get all active pricing plans with feature categories (mirrors the pricingData structure)
router.get('/pricing', async (req, res) => {
  try {
    // Fetch active plans
    const plansResult = await db.query(
      `SELECT * FROM price_models WHERE status = 'active' ORDER BY sort_order ASC, name ASC`
    );

    // Fetch active features
    const featuresResult = await db.query(
      `SELECT * FROM pricing_features WHERE status = 'active' ORDER BY category_sort_order ASC, sort_order ASC`
    );

    // Build subscriptions array
    const subscriptions = plansResult.rows.map(plan => {
      const planFeatures = (typeof plan.features === 'string') ? JSON.parse(plan.features) : (plan.features || {});
      return {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description || '',
        price: plan.base_price ? parseFloat(plan.base_price) : 0,
        currency: plan.currency || 'USD',
        billing_cycle: plan.billing_cycle || 'monthly',
        annual_discount_pct: plan.annual_discount_pct != null ? plan.annual_discount_pct : 20,
        highlight: plan.highlight || false,
        badge_text: plan.badge_text || null,
        icon_class: plan.icon_class || null,
        cta_text: plan.cta_text || 'Choose Plan',
        cta_url: plan.cta_url || '#',
        upsell_text: plan.upsell_text || null,
        upsell_target_id: plan.upsell_target_id || null,
        pay_as_you_go_text: plan.pay_as_you_go_text || null,
        trial_days: plan.trial_days || 0,
        features: planFeatures
      };
    });

    // Build featureCategories array (grouped by category)
    const categoryMap = {};
    featuresResult.rows.forEach(f => {
      if (!categoryMap[f.category_name]) {
        categoryMap[f.category_name] = {
          name: f.category_name,
          icon: f.category_icon || 'fas fa-cog',
          features: []
        };
      }
      categoryMap[f.category_name].features.push({
        key: f.feature_key,
        name: f.feature_name,
        description: f.feature_description || ''
      });
    });
    const featureCategories = Object.values(categoryMap);

    respond(res, {
      subscriptions,
      featureCategories
    });
  } catch (error) {
    console.error('Public API - Pricing error:', error);
    respond(res, { error: 'Failed to load pricing data' }, 500);
  }
});

// Health check
router.get('/health', (req, res) => {
  respond(res, { status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
