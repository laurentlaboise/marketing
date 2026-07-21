const express = require('express');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const { isOriginAllowed } = require('../utils/origins');
const { normalizeTiers, normalizePriceOptions } = require('../utils/pricing');
const { translate } = require('../lib/i18n');

// The portal i18n middleware is not mounted on /api/public, so the portal
// signup/login endpoints resolve the locale straight from Accept-Language.
const resolveLocale = (req) =>
  (req.acceptsLanguages ? (req.acceptsLanguages('en', 'th') || 'en') : 'en');

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

// Refresh article_images entries from the Image Library at read time. The
// stored JSONB copies alt/title/cdn_url from pick time and goes stale when
// library metadata is edited (or the file is renamed/converted) later.
// Best-effort: on any failure the stored copies are served unchanged.
async function refreshArticleImages(articles) {
  const ids = [...new Set(
    articles
      .flatMap((a) => (Array.isArray(a.article_images) ? a.article_images : []))
      .map((img) => Number.parseInt(img && img.id, 10))
      .filter(Number.isFinite)
  )];
  if (ids.length === 0) return articles;
  try {
    const r = await db.query(
      'SELECT id, cdn_url, filename, alt_text, title, width, height FROM images WHERE id = ANY($1::int[])',
      [ids]
    );
    const byId = new Map(r.rows.map((row) => [row.id, row]));
    for (const a of articles) {
      if (!Array.isArray(a.article_images)) continue;
      a.article_images = a.article_images.map((img) => {
        const live = img && byId.get(Number.parseInt(img.id, 10));
        if (!live) return img;
        return {
          ...img,
          cdn_url: live.cdn_url,
          filename: live.filename,
          alt_text: live.alt_text || '',
          title: live.title || '',
          width: live.width,
          height: live.height,
        };
      });
    }
  } catch (e) {
    console.error('article_images refresh failed, serving stored copies:', e.message);
  }
  return articles;
}

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
      // Full body as named: text_article is the canonical article body since
      // the admin split; content holds the short listing teaser card.
      full_article_content: article.text_article || article.content,
      teaser_content: article.content,
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

    await refreshArticleImages(articles);

    respond(res, articles);
  } catch (error) {
    console.error('Public API - Articles error:', error);
    respond(res, { error: 'Failed to load articles' }, 500);
  }
});

// Get single article by slug
router.get('/articles/:slug', async (req, res) => {
  try {
    // Accept both /articles/my-slug and /articles/my-slug.html (SPA path leftovers)
    const slug = String(req.params.slug || '').trim().replace(/\.html?$/i, '');
    // Renamed articles keep answering on their old URL: previous_slugs holds
    // every former slug, and the response's canonical slug lets the SPA
    // rewrite the address bar. Exact slug match wins over history.
    const result = await db.query(
      `SELECT * FROM articles
       WHERE (slug = $1 OR $1 = ANY(COALESCE(previous_slugs, '{}'))) AND status = 'published'
       ORDER BY (slug = $1) DESC LIMIT 1`,
      [slug]
    );

    if (result.rows.length === 0) {
      return respond(res, { error: 'Article not found' }, 404);
    }

    const article = result.rows[0];
    await refreshArticleImages([article]);
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
      // Full body as named: text_article is the canonical article body since
      // the admin split; content holds the short listing teaser card.
      full_article_content: article.text_article || article.content,
      teaser_content: article.content,
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

// Get all glossary terms (joins Image Library SEO fields when featured_image matches)
router.get('/glossary', async (req, res) => {
  try {
    const letter = req.query.letter || '';

    // Lateral join picks gallery row whose CDN URL / filename matches glossary.featured_image
    let query = `
      SELECT g.*,
        img.alt_text AS image_alt,
        img.title AS image_title,
        img.description AS image_description,
        img.width AS image_width,
        img.height AS image_height,
        img.filename AS image_filename,
        img.cdn_url AS image_cdn_url
      FROM glossary g
      LEFT JOIN LATERAL (
        SELECT alt_text, title, description, width, height, filename, cdn_url
        FROM images
        WHERE status = 'active'
          AND g.featured_image IS NOT NULL
          AND g.featured_image <> ''
          AND (
            cdn_url = g.featured_image
            OR g.featured_image LIKE '%' || filename
            OR (original_filename IS NOT NULL AND g.featured_image LIKE '%' || original_filename)
          )
        ORDER BY CASE WHEN cdn_url = g.featured_image THEN 0 ELSE 1 END
        LIMIT 1
      ) img ON TRUE`;
    const params = [];

    if (letter) {
      query += ' WHERE g.letter = $1';
      params.push(letter.toUpperCase());
    }

    query += ' ORDER BY g.term ASC';

    const result = await db.query(query, params);

    // Transform for frontend
    const terms = result.rows.map(item => {
      const featured = item.featured_image || item.image_cdn_url || '';
      const fallbackAlt = item.term
        ? `${item.term} — SEO glossary illustration for Southeast Asia marketers`
        : 'SEO glossary illustration';
      return {
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
        featured_image: featured,
        article_link: item.article_link || '',
        // Connected Image Library SEO (bots + UI)
        image_seo: featured ? {
          url: featured,
          alt: (item.image_alt && String(item.image_alt).trim()) || fallbackAlt,
          title: (item.image_title && String(item.image_title).trim()) || item.term || '',
          description: item.image_description || '',
          width: item.image_width || null,
          height: item.image_height || null,
          filename: item.image_filename || null,
        } : null,
      };
    });

    respond(res, terms);
  } catch (error) {
    console.error('Public API - Glossary error:', error);
    // Fallback without join if images table/columns missing
    try {
      let query = 'SELECT * FROM glossary';
      const params = [];
      if (letter) {
        query += ' WHERE letter = $1';
        params.push(letter.toUpperCase());
      }
      query += ' ORDER BY term ASC';
      const result = await db.query(query, params);
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
        article_link: item.article_link || '',
        image_seo: item.featured_image ? {
          url: item.featured_image,
          alt: `${item.term} — SEO glossary illustration for Southeast Asia marketers`,
          title: item.term || '',
          description: '',
          width: null,
          height: null,
          filename: null,
        } : null,
      }));
      respond(res, terms);
    } catch (e2) {
      respond(res, { error: 'Failed to load glossary' }, 500);
    }
  }
});

// ==================== IMAGE SEO (public, for static site + bots) ====================
// Exposes Image Library alt/title/dimensions so front-end pages can render
// crawlable SEO image attributes connected to admin gallery metadata.

router.get('/images/seo', async (req, res) => {
  try {
    const url = (req.query.url || req.query.cdn_url || '').trim();
    const filename = (req.query.filename || '').trim();

    if (url || filename) {
      // Deterministic lookup only: exact cdn_url, exact repo file_path (also
      // derived from a site URL's pathname), or exact filename. The previous
      // suffix LIKE matching could hand a build-time consumer a colliding
      // image's metadata. Multiple matches are reported as ambiguous with
      // image:null instead of silently picking one.
      let pathCandidate = '';
      if (url) {
        try {
          const u = new URL(url, 'https://wordsthatsells.website');
          pathCandidate = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        } catch (e) {
          pathCandidate = url.replace(/^\/+/, '');
        }
      }
      const result = await db.query(
        `SELECT filename, original_filename, file_path, cdn_url, alt_text, title, description, width, height, mime_type
         FROM images
         WHERE status = 'active'
           AND (
             ($1 <> '' AND cdn_url = $1)
             OR ($3 <> '' AND file_path = $3)
             OR ($2 <> '' AND (LOWER(filename) = LOWER($2) OR LOWER(original_filename) = LOWER($2)))
           )
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 5`,
        [url, filename, pathCandidate]
      );
      const rows = result.rows.map((r) => ({
        filename: r.filename,
        original_filename: r.original_filename,
        file_path: r.file_path,
        cdn_url: r.cdn_url,
        alt_text: r.alt_text || '',
        title: r.title || '',
        description: r.description || '',
        width: r.width,
        height: r.height,
        mime_type: r.mime_type,
      }));
      const ambiguous = rows.length > 1;
      return respond(res, { count: rows.length, ambiguous, images: rows, image: ambiguous ? null : (rows[0] || null) });
    }

    // Full map (capped) for static generators
    const result = await db.query(
      `SELECT filename, original_filename, cdn_url, alt_text, title, description, width, height, mime_type
       FROM images
       WHERE status = 'active' AND cdn_url IS NOT NULL AND cdn_url <> ''
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 2000`
    );
    const images = result.rows.map((r) => ({
      filename: r.filename,
      original_filename: r.original_filename,
      cdn_url: r.cdn_url,
      alt_text: r.alt_text || '',
      title: r.title || '',
      description: r.description || '',
      width: r.width,
      height: r.height,
      mime_type: r.mime_type,
    }));
    respond(res, { count: images.length, images });
  } catch (error) {
    console.error('Public API - Images SEO error:', error);
    respond(res, { error: 'Failed to load image SEO metadata' }, 500);
  }
});

// ==================== AI TOOLS ====================

function slugifyToolName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'tool';
}

function transformAiTool(tool) {
  const slug = tool.slug || slugifyToolName(tool.name);
  return {
    id: tool.id,
    name: tool.name,
    slug,
    detail_url: `/en/resources/ai-tools/${slug}/`,
    category: tool.category,
    description: tool.description,
    pricing: tool.pricing_model || 'Unknown',
    logo: tool.logo_url,
    website_link: tool.website_url,
    website_url: tool.website_url,
    app_store_link: tool.app_store_url || null,
    play_store_link: tool.play_store_url || null,
    app_store_url: tool.app_store_url || null,
    play_store_url: tool.play_store_url || null,
    key_features: Array.isArray(tool.features) ? tool.features : [],
    features: Array.isArray(tool.features) ? tool.features : [],
    pros: Array.isArray(tool.pros) ? tool.pros : [],
    cons: Array.isArray(tool.cons) ? tool.cons : [],
    rating: tool.rating
  };
}

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

    // Highest rated first (top tools), then name
    query += ' ORDER BY rating DESC NULLS LAST, name ASC';

    const result = await db.query(query, params);
    respond(res, result.rows.map(transformAiTool));
  } catch (error) {
    console.error('Public API - AI Tools error:', error);
    respond(res, { error: 'Failed to load AI tools' }, 500);
  }
});

// Single tool by SEO slug (for detail pages / hydration)
router.get('/ai-tools/by-slug/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug) return respond(res, { error: 'Invalid slug' }, 400);

    let result = await db.query(
      `SELECT * FROM ai_tools WHERE status = 'active' AND slug = $1 LIMIT 1`,
      [slug]
    );

    // Fallback: match generated slug from name if column empty/legacy
    if (!result.rows.length) {
      result = await db.query(`SELECT * FROM ai_tools WHERE status = 'active'`);
      result.rows = result.rows.filter((row) => slugifyToolName(row.name) === slug).slice(0, 1);
    }

    if (!result.rows.length) return respond(res, { error: 'Tool not found' }, 404);
    respond(res, transformAiTool(result.rows[0]));
  } catch (error) {
    console.error('Public API - AI Tool by slug error:', error);
    respond(res, { error: 'Failed to load AI tool' }, 500);
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

  // Named options (one product, multiple price points)
  if (p.pricing_type === 'options') {
    const options = normalizePriceOptions(p.price_options);
    const fromPrice = options.length
      ? Math.min.apply(null, options.map((o) => o.price))
      : num(p.price);
    return {
      type: 'options',
      currency,
      options: options.map((o) => ({
        key: o.key,
        label: o.label,
        sku: o.sku,
        price: o.price,
        strategy: o.strategy,
        features: o.features,
        description: o.description,
        has_stripe: !!o.stripe_price_id,
      })),
      from_price: fromPrice,
      one_time_price: fromPrice,
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

// BCEL OnePay config for a product: the manual price-point list (label +
// kip amount + QR image per amount), falling back to the legacy single-QR
// columns. qr_url/price_lak mirror the first option for older consumers.
function buildBcel(p) {
  const kip = (v) => (v === null || v === undefined || v === '') ? null : Math.round(parseFloat(v));
  let options = Array.isArray(p.bcel_options) ? p.bcel_options : [];
  options = options
    .filter((o) => o && o.qr_url)
    .map((o) => ({ label: o.label || '', lak: kip(o.lak), qr_url: o.qr_url }));
  if (!options.length && p.bcel_qr_url) {
    options = [{ label: '', lak: kip(p.price_lak), qr_url: p.bcel_qr_url }];
  }
  if (!options.length) return null;
  return { qr_url: options[0].qr_url, price_lak: options[0].lak, options };
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

    // Featured subset for marketing surfaces (prices/affiliate pages) —
    // avoids shipping the full catalog when only featured cards render.
    if (String(req.query.featured || '') === '1') {
      query += ' AND is_featured = TRUE';
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
      bcel: buildBcel(p),
      has_stripe: !!(p.stripe_price_id || p.stripe_price_id_monthly || p.stripe_price_id_yearly ||
        (p.pricing_type === 'options' && normalizePriceOptions(p.price_options).some((o) => o.stripe_price_id)) ||
        p.stripe_payment_link ||
        (p.price && parseFloat(p.price) > 0) ||
        (p.monthly_price && parseFloat(p.monthly_price) > 0) ||
        (p.yearly_price && parseFloat(p.yearly_price) > 0)),
      article_url: p.article_url || null,
      article_title: p.article_title || null,
      article_chapters: p.article_chapters || [],
      article_facts: p.article_facts || [],
      article_sources: p.article_sources || [],
      slide_in: {
        title: p.slide_in_title || p.name,
        subtitle: p.slide_in_subtitle || '',
        content: p.slide_in_content || '',
        image: p.slide_in_image || p.image_url || '',
        video: p.slide_in_video || '',
        article_url: p.article_url || '',
        article_title: p.article_title || '',
        chapters: p.article_chapters || [],
        facts: p.article_facts || [],
        sources: p.article_sources || []
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
      bcel: buildBcel(p),
      has_stripe: !!(p.stripe_price_id || p.stripe_price_id_monthly || p.stripe_price_id_yearly ||
        (p.pricing_type === 'options' && normalizePriceOptions(p.price_options).some((o) => o.stripe_price_id)) ||
        p.stripe_payment_link ||
        (p.price && parseFloat(p.price) > 0) ||
        (p.monthly_price && parseFloat(p.monthly_price) > 0) ||
        (p.yearly_price && parseFloat(p.yearly_price) > 0)),
      article_url: p.article_url || null,
      article_title: p.article_title || null,
      article_chapters: p.article_chapters || [],
      article_facts: p.article_facts || [],
      article_sources: p.article_sources || [],
      slide_in: {
        title: p.slide_in_title || p.name,
        subtitle: p.slide_in_subtitle || '',
        content: p.slide_in_content || '',
        image: p.slide_in_image || p.image_url || '',
        video: p.slide_in_video || '',
        article_url: p.article_url || '',
        article_title: p.article_title || '',
        chapters: p.article_chapters || [],
        facts: p.article_facts || [],
        sources: p.article_sources || []
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

    // Group active products by service_page for white-label / à la carte accordion
    let individualServices = [];
    try {
      const productsResult = await db.query(
        `SELECT name, description, price, currency, service_page, category, features, icon_class
         FROM products WHERE status = 'active'
         ORDER BY service_page ASC, name ASC`
      );
      const byPage = {};
      const pageIcons = {
        'content-creation': 'fa-pen',
        'social-media-management': 'fa-share-nodes',
        'web-development': 'fa-code',
        'business-tools': 'fa-robot',
      };
      const pageLabels = {
        'content-creation': 'Content Creation',
        'social-media-management': 'Social Media',
        'web-development': 'Web Development',
        'business-tools': 'Business Tools',
      };
      productsResult.rows.forEach((p) => {
        const key = p.service_page || 'other';
        if (!byPage[key]) {
          byPage[key] = {
            category: pageLabels[key] || key,
            name: pageLabels[key] || key,
            icon: pageIcons[key] || 'fa-cog',
            services: [],
          };
        }
        const priceLabel =
          p.price != null
            ? ` · $${parseFloat(p.price).toFixed(p.price % 1 ? 2 : 0)}${p.currency && p.currency !== 'USD' ? ' ' + p.currency : ''}`
            : '';
        byPage[key].services.push({
          name: p.name,
          serviceTitle: p.name + priceLabel,
          description: p.description || '',
          price: p.price != null ? parseFloat(p.price) : null,
        });
      });
      individualServices = Object.values(byPage);
    } catch (prodErr) {
      console.warn('Public API - products for pricing accordion:', prodErr.message);
    }

    // Affiliate solutions for partner pages / pricing affiliate section
    let affiliateSolutions = [];
    try {
      const aff = await db.query(
        `SELECT name, description, commission_rate, cookie_duration, payout_threshold, affiliate_url, category
         FROM affiliate_solutions WHERE status = 'active' ORDER BY name ASC`
      );
      affiliateSolutions = aff.rows;
    } catch (_) {
      /* table may be empty */
    }

    respond(res, {
      subscriptions,
      featureCategories,
      individualServices,
      affiliateSolutions,
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

// ==================== PORTAL SESSION CHECK ====================

// Lets the public site tailor its buttons to the visitor's portal state.
// admin.wordsthatsells.website and wordsthatsells.website are the same
// registrable site, so the SameSite=Lax session cookie rides along on a
// credentialed fetch; CORS already restricts which origins may read this.
router.get('/portal-me', (req, res) => {
  if (req.session && req.session.customerId) {
    return respond(res, { signed_in: true, email: req.session.customerEmail || null });
  }
  respond(res, { signed_in: false });
});

// ==================== MY SERVICES (signed-in customers) ====================

// These endpoints authenticate by the portal session cookie. /api/public is
// exempt from the synchronizer-token CSRF check, so every mutating route
// here MUST pass the Origin allow-list — that is what blocks cross-site
// browser posts against the session.
const requirePortalSession = (req, res) => {
  if (req.session && req.session.customerId) return true;
  respond(res, { error: 'Sign in required' }, 401);
  return false;
};

router.get('/my-services', async (req, res) => {
  if (!requirePortalSession(req, res)) return;
  try {
    const result = await db.query(
      `SELECT s.product_id, s.billing_period, s.created_at,
              p.name, p.slug, p.service_page
       FROM saved_services s
       JOIN products p ON p.id = s.product_id
       WHERE s.customer_id = $1
       ORDER BY s.created_at DESC`,
      [req.session.customerId]
    );
    respond(res, { services: result.rows });
  } catch (e) {
    console.error('My services list error:', e);
    respond(res, { error: 'Failed to load services' }, 500);
  }
});

router.post('/my-services', async (req, res) => {
  if (!isOriginAllowed(req)) return respond(res, { error: 'Origin not allowed.' }, 403);
  if (!requirePortalSession(req, res)) return;
  try {
    const { product_id, billing_period } = req.body;
    if (!product_id) return respond(res, { error: 'product_id is required' }, 400);
    const product = await db.query(
      "SELECT id FROM products WHERE id = $1 AND status = 'active'", [product_id]
    );
    if (!product.rows.length) return respond(res, { error: 'Product not found' }, 404);
    const period = (billing_period === 'monthly' || billing_period === 'yearly') ? billing_period : null;
    await db.query(
      `INSERT INTO saved_services (customer_id, product_id, billing_period)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, product_id) DO UPDATE SET billing_period = EXCLUDED.billing_period`,
      [req.session.customerId, product_id, period]
    );
    respond(res, { ok: true });
  } catch (e) {
    console.error('My services save error:', e);
    respond(res, { error: 'Failed to save service' }, 500);
  }
});

router.post('/my-services/remove', async (req, res) => {
  if (!isOriginAllowed(req)) return respond(res, { error: 'Origin not allowed.' }, 403);
  if (!requirePortalSession(req, res)) return;
  try {
    if (!req.body.product_id) return respond(res, { error: 'product_id is required' }, 400);
    await db.query(
      'DELETE FROM saved_services WHERE customer_id = $1 AND product_id = $2',
      [req.session.customerId, req.body.product_id]
    );
    respond(res, { ok: true });
  } catch (e) {
    console.error('My services remove error:', e);
    respond(res, { error: 'Failed to remove service' }, 500);
  }
});

// ==================== PORTAL SIGNUP ====================

// Public account creation from the website (e.g. the Request-a-Quote modal's
// "create an account" path): upsert the customer and email a magic sign-in
// link. Response is intentionally neutral — it never reveals whether the
// address already had an account.
const portalSignupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({ error: translate(resolveLocale(req), 'portalApi.signupRateLimited') })
});

router.post('/portal-signup', portalSignupLimiter, async (req, res) => {
  if (!isOriginAllowed(req)) {
    return respond(res, { error: 'Origin not allowed.' }, 403);
  }
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 255) {
    return respond(res, { error: translate(resolveLocale(req), 'portalApi.emailRequired') }, 400);
  }
  try {
    const { upsertCustomer, issueLoginLink } = require('./portal');
    const customer = await upsertCustomer(email, String(req.body.name || '').trim().slice(0, 255) || null);
    await issueLoginLink(customer, resolveLocale(req));
  } catch (e) {
    console.error('Portal signup error:', e);
    // Fall through to the neutral response.
  }
  respond(res, { ok: true });
});

// ==================== PORTAL LOGIN (email + password) ====================

// Direct password sign-in from the public site. Mints the same portal
// session as /portal/login. This route mutates the session and /api/public
// is CSRF-exempt, so the Origin allow-list check is mandatory. The failure
// response is identical for every reason (bad input, unknown email, no
// password set, wrong password) so account existence never leaks.
const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({ error: translate(resolveLocale(req), 'portalApi.loginRateLimited') })
});

const portalLoginFailed = (req) => translate(resolveLocale(req), 'portalApi.loginFailed');

router.post('/portal-login', portalLoginLimiter, async (req, res) => {
  if (!isOriginAllowed(req)) {
    return respond(res, { error: 'Origin not allowed.' }, 403);
  }
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 255 ||
      !password || password.length > 200) {
    return respond(res, { error: portalLoginFailed(req) }, 401);
  }
  try {
    // Required lazily (like portal-signup above) to stay clear of any
    // require cycle between this router and the portal router.
    const bcrypt = require('bcryptjs');
    const { establishCustomerSession } = require('./portal');
    const result = await db.query('SELECT * FROM customers WHERE LOWER(email) = $1', [email]);
    const customer = result.rows[0];
    if (!customer || customer.status !== 'active' || !customer.password_hash ||
        !(await bcrypt.compare(password, customer.password_hash))) {
      return respond(res, { error: portalLoginFailed(req) }, 401);
    }
    await establishCustomerSession(req, customer, { persist: req.body.remember !== false });
    respond(res, { signed_in: true, email: customer.email });
  } catch (e) {
    console.error('Portal password login error:', e);
    respond(res, { error: portalLoginFailed(req) }, 401);
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

    const admins = await db.query("SELECT id FROM users WHERE role IN ('admin', 'superadmin')");
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

// ==================== TRANSLATIONS (localization) ====================

// Single published article translation by slug — used by the /xx/articles/
// SPA shell to overlay localized title/excerpt/content on the English
// article payload. Declared before the generic feed so 'article' + slug
// paths don't get swallowed by :entityType.
router.get('/translations/:lang/article/:slug', async (req, res) => {
  try {
    const core = require('../lib/translation-core');
    const { lang, slug } = req.params;
    if (!core.TARGET_LANGUAGES.includes(lang)) {
      return respond(res, { error: 'Unsupported language' }, 400);
    }
    const result = await db.query(
      `SELECT t.entity_id, t.content_payload, t.word_count, t.published_at, t.updated_at, a.slug
       FROM translations t
       JOIN articles a ON a.id = t.entity_id
       WHERE t.entity_type = 'article' AND t.status = 'published'
         AND t.target_language = $1 AND a.slug = $2
       LIMIT 1`,
      [lang, slug]
    );
    if (result.rows.length === 0) {
      return respond(res, { error: 'No published translation for this article' }, 404);
    }
    respond(res, { language: lang, translation: result.rows[0] });
  } catch (error) {
    console.error('Public API - Article translation error:', error);
    respond(res, { error: 'Failed to fetch translation' }, 500);
  }
});

// Published translations feed for the static site's /th /la /fr builds
// and any client that renders localized content. Only rows that passed
// SuperAdmin review (status = 'published') are ever exposed. Pages join
// their site path and articles their slug so consumers (the page
// generator, the article shell) can map rows without extra lookups.
router.get('/translations/:lang/:entityType', async (req, res) => {
  try {
    const core = require('../lib/translation-core');
    const { lang, entityType } = req.params;
    if (!core.TARGET_LANGUAGES.includes(lang)) {
      return respond(res, { error: 'Unsupported language' }, 400);
    }
    if (!core.ENTITY_TYPES.includes(entityType)) {
      return respond(res, { error: 'Unsupported entity type' }, 400);
    }

    let query;
    if (entityType === 'page') {
      query = `
        SELECT t.entity_id, t.content_payload, t.word_count, t.published_at, t.updated_at, p.path
        FROM translations t
        JOIN site_pages p ON p.id = t.entity_id
        WHERE t.entity_type = 'page' AND t.status = 'published' AND t.target_language = $1
        ORDER BY t.published_at DESC
        LIMIT 500`;
    } else if (entityType === 'article') {
      query = `
        SELECT t.entity_id, t.content_payload, t.word_count, t.published_at, t.updated_at, a.slug
        FROM translations t
        JOIN articles a ON a.id = t.entity_id
        WHERE t.entity_type = 'article' AND t.status = 'published' AND t.target_language = $1
        ORDER BY t.published_at DESC
        LIMIT 500`;
    } else {
      query = `
        SELECT entity_id, content_payload, word_count, published_at, updated_at
        FROM translations
        WHERE entity_type = $2 AND status = 'published' AND target_language = $1
        ORDER BY published_at DESC
        LIMIT 500`;
    }
    const result = await db.query(query, entityType === 'page' || entityType === 'article' ? [lang] : [lang, entityType]);
    respond(res, {
      language: lang,
      entity_type: entityType,
      count: result.rows.length,
      translations: result.rows,
    });
  } catch (error) {
    console.error('Public API - Translations error:', error);
    respond(res, { error: 'Failed to fetch translations' }, 500);
  }
});

// Health check
router.get('/health', (req, res) => {
  respond(res, { status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
