const express = require('express');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const { isOriginAllowed } = require('../utils/origins');
const { normalizeTiers } = require('../utils/pricing');

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
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const category = req.query.category || '';

    let query = `
      SELECT id, title, slug, excerpt, content, featured_image, category, tags,
             seo_title, seo_description, featured, published_url, published_at, created_at, updated_at,
             og_title, og_description, og_image, og_type,
             twitter_card, twitter_title, twitter_description, twitter_image, twitter_site, twitter_creator,
             canonical_url, robots_meta, schema_markup, article_images, citations,
             time_to_read, seo_keywords, content_labels, text_article, audio_files,
             word_count, author_type, author_name, author_job_title, author_url
      FROM articles
      WHERE status = 'published'
    `;
    const params = [];

    if (category) {
      query += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    query += ` ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

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
      text_article: article.text_article || '',
      published_url: article.published_url || '',
      article_images: article.article_images || [],
      citations: article.citations || [],
      audio_files: article.audio_files || {},
      time_to_read: article.time_to_read || null,
      seo_keywords: article.seo_keywords || [],
      content_labels: article.content_labels || {},
      word_count: article.word_count || null,
      author_type: article.author_type || 'organization',
      author_name: article.author_name || null,
      author_job_title: article.author_job_title || null,
      author_url: article.author_url || null,
      category: article.category || null,
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
      text_article: article.text_article || '',
      time_to_read: article.time_to_read || null,
      article_images: article.article_images || [],
      citations: article.citations || [],
      seo_keywords: article.seo_keywords || [],
      content_labels: article.content_labels || {},
      word_count: article.word_count || null,
      author_type: article.author_type || 'organization',
      author_name: article.author_name || null,
      author_job_title: article.author_job_title || null,
      author_url: article.author_url || null,
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

// Build a normalized pricing object for a product row, including computed
// annual savings so the frontend can render a billing toggle and a
// "Save X%" highlight without duplicating the math.
function buildProductPricing(p) {
  const num = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);
  const type = p.pricing_type === 'subscription' ? 'subscription' : 'one_time';
  const currency = p.currency || 'USD';

  // Volume-discount tiers: unit price drops with quantity.
  if (p.pricing_type === 'tiered') {
    const tiers = normalizeTiers(p.quantity_tiers);
    const fromUnit = tiers.length ? Math.min.apply(null, tiers.map((t) => t.unit_price)) : null;
    return {
      type: 'tiered',
      currency,
      tiers,
      from_unit_price: fromUnit,
      min_qty: tiers.length ? tiers[0].min_qty : 1,
      one_time_price: null,
      monthly_price: null,
      yearly_price: null,
      default_billing: 'monthly',
      allow_billing_toggle: false,
      annual_savings: null,
      annual_discount_pct: null,
      setup_fee: null,
      setup_fee_label: null
    };
  }

  if (type !== 'subscription') {
    return {
      type: 'one_time',
      currency,
      one_time_price: num(p.price),
      monthly_price: null,
      yearly_price: null,
      default_billing: 'monthly',
      allow_billing_toggle: false,
      annual_savings: null,
      annual_discount_pct: null,
      setup_fee: null,
      setup_fee_label: null
    };
  }

  const monthly = num(p.monthly_price);
  const yearly = num(p.yearly_price);

  // Default billing must land on a period that has a price.
  let defaultBilling = p.default_billing === 'yearly' ? 'yearly' : 'monthly';
  if (defaultBilling === 'monthly' && monthly === null && yearly !== null) defaultBilling = 'yearly';
  if (defaultBilling === 'yearly' && yearly === null && monthly !== null) defaultBilling = 'monthly';

  // Savings only make sense when both periods exist and yearly beats annualized monthly.
  let annualSavings = null;
  let discountPct = null;
  if (monthly !== null && monthly > 0 && yearly !== null) {
    const annualized = monthly * 12;
    if (annualized - yearly > 0) {
      annualSavings = Math.round((annualized - yearly) * 100) / 100;
      discountPct = (p.annual_discount_pct !== null && p.annual_discount_pct !== undefined)
        ? p.annual_discount_pct
        : Math.round((annualSavings / annualized) * 100);
    }
  } else if (p.annual_discount_pct !== null && p.annual_discount_pct !== undefined) {
    discountPct = p.annual_discount_pct;
  }

  // Only allow toggling if both periods are actually available.
  const bothAvailable = monthly !== null && yearly !== null;

  // Optional one-time setup fee charged with the first payment.
  const setupFee = num(p.setup_fee);

  return {
    type: 'subscription',
    currency,
    one_time_price: null,
    monthly_price: monthly,
    yearly_price: yearly,
    default_billing: defaultBilling,
    allow_billing_toggle: bothAvailable && p.allow_billing_toggle !== false,
    annual_savings: annualSavings,
    annual_discount_pct: discountPct,
    setup_fee: setupFee,
    setup_fee_label: setupFee !== null ? (p.setup_fee_label || 'Setup fee') : null
  };
}

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
      subcategory: p.subcategory || null,
      purchase_mode: p.purchase_mode || 'consult',
      cta_form_type: p.cta_form_type || null,
      price_unit: p.price_unit || 'fixed',
      industries: p.industries || [],
      sku: p.sku || null,
      pricing: buildProductPricing(p),
      stripe_payment_link: p.stripe_payment_link || null,
      bcel: p.bcel_qr_url ? {
        qr_url: p.bcel_qr_url,
        price_lak: p.price_lak != null ? Math.round(parseFloat(p.price_lak)) : null
      } : null,
      has_stripe: !!(p.stripe_price_id || p.stripe_price_id_monthly || p.stripe_price_id_yearly ||
        p.stripe_payment_link ||
        (p.price && parseFloat(p.price) > 0) ||
        (p.monthly_price && parseFloat(p.monthly_price) > 0) ||
        (p.yearly_price && parseFloat(p.yearly_price) > 0)),
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
      subcategory: p.subcategory || null,
      purchase_mode: p.purchase_mode || 'consult',
      cta_form_type: p.cta_form_type || null,
      price_unit: p.price_unit || 'fixed',
      industries: p.industries || [],
      sku: p.sku || null,
      pricing: buildProductPricing(p),
      stripe_payment_link: p.stripe_payment_link || null,
      bcel: p.bcel_qr_url ? {
        qr_url: p.bcel_qr_url,
        price_lak: p.price_lak != null ? Math.round(parseFloat(p.price_lak)) : null
      } : null,
      has_stripe: !!(p.stripe_price_id || p.stripe_price_id_monthly || p.stripe_price_id_yearly ||
        p.stripe_payment_link ||
        (p.price && parseFloat(p.price) > 0) ||
        (p.monthly_price && parseFloat(p.monthly_price) > 0) ||
        (p.yearly_price && parseFloat(p.yearly_price) > 0)),
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
      css_class: item.css_class,
      page_url: item.page_url || null,
      content_html: item.content_html || null,
      button_label: item.button_label || null
    }));

    respond(res, items);
  } catch (error) {
    console.error('Public API - Sidebar error:', error);
    respond(res, { error: 'Failed to load sidebar items' }, 500);
  }
});

// ==================== PAGE SIDEBARS (floating help button) ====================

// Get sidebar panels for a specific page URL path
router.get('/page-sidebar', async (req, res) => {
  try {
    const path = req.query.path || '';
    if (!path) {
      return respond(res, { error: 'path query parameter is required' }, 400);
    }

    // Find sidebar items whose page_url matches the current path
    // Supports exact match and wildcard patterns (e.g. /en/articles/*)
    const result = await db.query(
      `SELECT id, label, url, icon_class, section, sort_order, open_in_new_tab, css_class,
              page_url, content_html, button_label, action_type, target_form_type
       FROM sidebar_items
       WHERE is_visible = TRUE AND section = 'page-sidebar' AND page_url IS NOT NULL
       ORDER BY sort_order ASC`
    );

    // Filter matches: exact match or wildcard match
    const items = result.rows.filter(item => {
      const pattern = item.page_url;
      if (!pattern) return false;
      if (pattern === path) return true;
      // Wildcard: /en/articles/* matches /en/articles/anything
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -1); // remove the *
        return path.startsWith(prefix);
      }
      // Also match if path ends with trailing slash or .html variant
      if (path.endsWith('/') && pattern === path.slice(0, -1)) return true;
      if (pattern.endsWith('/') && path === pattern.slice(0, -1)) return true;
      return false;
    });

    const panels = items.map(item => ({
      id: item.id,
      label: item.label,
      url: item.url,
      icon_class: item.icon_class || 'fas fa-question-circle',
      button_label: item.button_label || 'Help',
      content_html: item.content_html || '',
      css_class: item.css_class,
      action_type: item.action_type || 'panel',
      target_form_type: item.target_form_type || null,
      open_in_new_tab: item.open_in_new_tab || false
    }));

    respond(res, panels);
  } catch (error) {
    console.error('Public API - Page sidebar error:', error);
    respond(res, { error: 'Failed to load page sidebar' }, 500);
  }
});

// ==================== TOP NAVIGATION MENUS ====================

// Get a nested menu tree for a location (default 'header'). Top-level items
// each carry a `children` array so the frontend can render dropdowns. Mirrors
// the page-matching style used elsewhere but keyed on `location`, not path.
router.get('/menu', async (req, res) => {
  try {
    const location = req.query.location || 'header';

    const result = await db.query(
      `SELECT id, label, url, icon_class, parent_id, location, sort_order, open_in_new_tab, css_class
       FROM menu_items
       WHERE is_visible = TRUE AND location = $1
       ORDER BY sort_order ASC, label ASC`,
      [location]
    );

    const byId = {};
    result.rows.forEach(row => {
      byId[row.id] = {
        id: row.id,
        label: row.label,
        url: row.url,
        icon_class: row.icon_class || null,
        open_in_new_tab: row.open_in_new_tab || false,
        css_class: row.css_class || null,
        children: []
      };
    });

    respond(res, buildMenuTree(result.rows));
  } catch (error) {
    console.error('Public API - Menu error:', error);
    respond(res, { error: 'Failed to load menu' }, 500);
  }
});

// Build a nested tree (top-level items carry a `children` array) from flat rows.
function buildMenuTree(rows) {
  const byId = {};
  rows.forEach(row => {
    byId[row.id] = {
      id: row.id,
      label: row.label,
      url: row.url,
      icon_class: row.icon_class || null,
      open_in_new_tab: row.open_in_new_tab || false,
      css_class: row.css_class || null,
      children: []
    };
  });
  const tree = [];
  rows.forEach(row => {
    const node = byId[row.id];
    if (row.parent_id && byId[row.parent_id]) {
      byId[row.parent_id].children.push(node);
    } else {
      tree.push(node);
    }
  });
  return tree;
}

// ==================== FOOTER (columns + settings) ====================

// Everything the footer needs in one call: the link columns (menu_items
// location 'footer'), the bottom legal links ('footer-legal'), plus the
// admin-editable social / contact / copyright values from site_settings.
// Any region with no data is returned empty/null so the front end can keep the
// existing static markup as a fallback.
router.get('/footer', async (req, res) => {
  try {
    const [columns, legal, settingsRows] = await Promise.all([
      db.query(
        `SELECT id, label, url, icon_class, parent_id, sort_order, open_in_new_tab, css_class
         FROM menu_items WHERE is_visible = TRUE AND location = 'footer'
         ORDER BY sort_order ASC, label ASC`
      ),
      db.query(
        `SELECT id, label, url, icon_class, parent_id, sort_order, open_in_new_tab, css_class
         FROM menu_items WHERE is_visible = TRUE AND location = 'footer-legal'
         ORDER BY sort_order ASC, label ASC`
      ),
      db.query(`SELECT key, value FROM site_settings WHERE key LIKE 'footer_%'`)
    ]);

    const s = {};
    settingsRows.rows.forEach(r => { s[r.key] = r.value || ''; });

    respond(res, {
      columns: buildMenuTree(columns.rows),
      legal: buildMenuTree(legal.rows),
      social: {
        instagram: s.footer_social_instagram || '',
        linkedin: s.footer_social_linkedin || '',
        facebook: s.footer_social_facebook || '',
        twitter: s.footer_social_twitter || '',
        youtube: s.footer_social_youtube || ''
      },
      contact: {
        address: s.footer_contact_address || '',
        maps_url: s.footer_contact_maps_url || '',
        whatsapp: s.footer_contact_whatsapp || '',
        email: s.footer_contact_email || ''
      },
      copyright: s.footer_copyright || ''
    });
  } catch (error) {
    console.error('Public API - Footer error:', error);
    respond(res, { error: 'Failed to load footer' }, 500);
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

// ==================== FORM TEMPLATES ====================

// Get a form template by type (for dynamic rendering on the website)
router.get('/form-template/:type', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT form_type, title, subtitle, fields, submit_button_text, success_message FROM form_templates WHERE form_type = $1 AND status = $2',
      [req.params.type, 'active']
    );
    if (result.rows.length === 0) {
      return respond(res, { error: 'Form template not found' }, 404);
    }
    const tpl = result.rows[0];
    respond(res, {
      form_type: tpl.form_type,
      title: tpl.title,
      subtitle: tpl.subtitle,
      fields: typeof tpl.fields === 'string' ? JSON.parse(tpl.fields) : tpl.fields,
      submit_button_text: tpl.submit_button_text,
      success_message: tpl.success_message
    });
  } catch (error) {
    console.error('Public API - Form template error:', error);
    respond(res, { error: 'Failed to load form template' }, 500);
  }
});

// Get all active form templates (for bulk loading)
router.get('/form-templates', async (req, res) => {
  try {
    const result = await db.query(
      "SELECT form_type, title, subtitle, fields, submit_button_text, success_message FROM form_templates WHERE status = 'active' ORDER BY created_at ASC"
    );
    const templates = result.rows.map(tpl => ({
      form_type: tpl.form_type,
      title: tpl.title,
      subtitle: tpl.subtitle,
      fields: typeof tpl.fields === 'string' ? JSON.parse(tpl.fields) : tpl.fields,
      submit_button_text: tpl.submit_button_text,
      success_message: tpl.success_message
    }));
    respond(res, { templates });
  } catch (error) {
    respond(res, { error: 'Failed to load form templates' }, 500);
  }
});

// ==================== FORM BUTTONS ====================

// Get buttons linked to a specific form type
router.get('/form-buttons/:type', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, form_type, button_label, page_url, style_preset, custom_css, custom_js,
              rel_nofollow, rel_noopener, rel_noreferrer, target_blank, product_slug, product_name, placement
       FROM form_buttons
       WHERE form_type = $1 AND status = 'active'
       ORDER BY sort_order ASC, created_at ASC`,
      [req.params.type]
    );
    respond(res, { buttons: result.rows });
  } catch (error) {
    console.error('Public API - Form buttons error:', error);
    respond(res, { error: 'Failed to load form buttons' }, 500);
  }
});

// Get all active form buttons (bulk)
router.get('/form-buttons', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT fb.id, fb.form_type, fb.button_label, fb.page_url, fb.style_preset,
              fb.custom_css, fb.custom_js, fb.rel_nofollow, fb.rel_noopener,
              fb.rel_noreferrer, fb.target_blank, fb.product_slug, fb.product_name, fb.placement
       FROM form_buttons fb
       JOIN form_templates ft ON ft.form_type = fb.form_type
       WHERE fb.status = 'active' AND ft.status = 'active'
       ORDER BY fb.form_type, fb.sort_order ASC`
    );
    respond(res, { buttons: result.rows });
  } catch (error) {
    respond(res, { error: 'Failed to load form buttons' }, 500);
  }
});

// ==================== FORM SUBMISSIONS ====================

// Stricter rate limit for form submissions (10 per 15 min per IP)
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please try again later.' }
});

router.post('/submissions', formLimiter, async (req, res) => {
  // CSRF does not apply here (no session auth), but block cross-site
  // browser posts from origins outside the allow-list.
  if (!isOriginAllowed(req)) {
    return respond(res, { error: 'Origin not allowed.' }, 403);
  }
  try {
    const { form_type, name, email, company, phone, message, metadata } = req.body;

    // Validate required fields
    if (!form_type || !name || !email) {
      return respond(res, { error: 'form_type, name, and email are required.' }, 400);
    }

    // Accept the built-in site form types, OR any form_type backed by an
    // active admin-defined template (Message Board → Forms). This keeps the
    // admin's custom forms connected to the public submission endpoint instead
    // of silently rejecting them.
    const BASE_TYPES = ['consultation', 'free-support', 'affiliate', 'white-label', 'general-inquiry', 'newsletter'];
    let allowed = BASE_TYPES.includes(form_type);
    if (!allowed) {
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(form_type)) {
        return respond(res, { error: 'Invalid form_type.' }, 400);
      }
      const tpl = await db.query(
        "SELECT 1 FROM form_templates WHERE form_type = $1 AND status = 'active' LIMIT 1",
        [form_type]
      );
      allowed = tpl.rows.length > 0;
    }
    if (!allowed) {
      return respond(res, { error: 'Invalid form_type.' }, 400);
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(res, { error: 'Invalid email address.' }, 400);
    }

    // Insert submission
    const metadataJson = metadata && typeof metadata === 'object' ? JSON.stringify(metadata) : '{}';
    await db.query(
      `INSERT INTO form_submissions (form_type, name, email, company, phone, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [form_type, name.trim(), email.trim(), company || null, phone || null, message || null, metadataJson]
    );

    // Create a notification for all admin users
    const typeLabels = {
      'consultation': 'Consultation Request',
      'free-support': 'Free Support Application',
      'affiliate': 'Affiliate Application',
      'white-label': 'White Label Partnership',
      'general-inquiry': 'General Inquiry',
      'newsletter': 'Newsletter Signup'
    };
    // Fall back to a generic label for admin-defined types not in the map,
    // so the notification builder never throws on an unlabeled form_type.
    const typeLabel = typeLabels[form_type] || 'Form Submission';
    const notifTitle = `New ${typeLabel}`;
    const notifMessage = `${name} (${email})${company ? ' from ' + company : ''} submitted a ${typeLabel.toLowerCase()}.`;

    const admins = await db.query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins.rows) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, link)
         VALUES ($1, 'info', $2, $3, '/webdev/submissions')`,
        [admin.id, notifTitle, notifMessage]
      );
    }

    respond(res, { success: true, message: 'Submission received. We will be in touch.' });
  } catch (error) {
    console.error('Public API - Form submission error:', error);
    respond(res, { error: 'Failed to submit form. Please try again.' }, 500);
  }
});

// Health check
router.get('/health', (req, res) => {
  respond(res, { status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
