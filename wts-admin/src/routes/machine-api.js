/**
 * Machine API v1 — Bearer-token access for automation (Grok, CI, scripts).
 *
 * Mounted at /api/machine  →  routes live under /v1/*
 * Auth: ADMIN_API_TOKEN via Authorization: Bearer <token>
 * CSRF: exempt (no session cookies)
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../database/db');
const { requireMachineToken } = require('../middleware/machine-auth');
const { seedPricingDefaults } = require('../lib/pricing-seed-data');
const { seedAiTools } = require('../lib/ai-tools-seed');
const { buildArticleListingTeaserHtml } = require('../lib/article-teaser');

const router = express.Router();

const machineLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MACHINE_API_RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Machine API rate limit exceeded' },
});

router.use(machineLimiter);
router.use(requireMachineToken);

function ok(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, error, status = 400) {
  return res.status(status).json({ success: false, error });
}

async function audit(req, action, detail) {
  try {
    // action column is VARCHAR(100)
    const short = `m:${action}`.slice(0, 100);
    await db.query(
      `INSERT INTO activity_logs (user_id, action, details, ip_address, user_agent)
       VALUES (NULL, $1, $2, $3, $4)`,
      [
        short,
        detail ? JSON.stringify({ detail: String(detail).slice(0, 500) }) : null,
        req.ip || null,
        (req.get('user-agent') || 'machine-api').slice(0, 500),
      ]
    );
  } catch (_) {
    /* non-fatal — schema may vary */
  }
}

// ── Health ──────────────────────────────────────────────────────────

router.get('/v1/health', async (req, res) => {
  let dbOk = false;
  try {
    await db.query('SELECT 1');
    dbOk = true;
  } catch (_) {
    dbOk = false;
  }
  return ok(res, {
    service: 'wts-admin-machine-api',
    version: 'v1',
    db: dbOk ? 'ok' : 'error',
    auth: 'bearer',
    timestamp: new Date().toISOString(),
  });
});

// ── Pricing ─────────────────────────────────────────────────────────

router.get('/v1/pricing', async (req, res) => {
  try {
    const plans = await db.query(
      `SELECT id, name, slug, description, type, base_price, billing_cycle, features,
              status, highlight, badge_text, annual_discount_pct, sort_order,
              cta_text, cta_url, icon_class, pay_as_you_go_text, currency, trial_days
       FROM price_models ORDER BY sort_order ASC, name ASC`
    );
    const features = await db.query(
      `SELECT id, category_name, category_icon, feature_key, feature_name,
              feature_description, sort_order, category_sort_order, status
       FROM pricing_features ORDER BY category_sort_order ASC, sort_order ASC`
    );
    return ok(res, { packages: plans.rows, features: features.rows });
  } catch (e) {
    console.error('[machine-api] GET pricing', e);
    return fail(res, 'Failed to load pricing', 500);
  }
});

router.post('/v1/seed/pricing', async (req, res) => {
  try {
    const result = await seedPricingDefaults(db);
    await audit(req, 'seed/pricing', JSON.stringify(result));
    return ok(res, { seeded: result });
  } catch (e) {
    console.error('[machine-api] seed pricing', e);
    return fail(res, 'Seed failed: ' + e.message, 500);
  }
});

/** Upsert curated top AI tools (database/seed/top-100-ai-tools.json) into ai_tools. */
router.post('/v1/seed/ai-tools', async (req, res) => {
  try {
    const replace = !!(req.body && req.body.replace);
    const result = await seedAiTools(db, { replace });
    await audit(req, 'seed/ai-tools', JSON.stringify(result));
    return ok(res, { seeded: result });
  } catch (e) {
    console.error('[machine-api] seed ai-tools', e);
    return fail(res, 'Seed AI tools failed: ' + e.message, 500);
  }
});

/**
 * Upsert a package by slug (body.slug or body.name-derived).
 */
router.put('/v1/pricing/packages/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/(^-|-$)/g, '');
    if (!slug) return fail(res, 'Invalid slug');

    const {
      name,
      description,
      type,
      base_price,
      billing_cycle,
      features,
      status,
      highlight,
      badge_text,
      annual_discount_pct,
      sort_order,
      cta_text,
      cta_url,
      icon_class,
      pay_as_you_go_text,
      currency,
      trial_days,
    } = req.body || {};

    if (!name) return fail(res, 'name is required');

    const existing = await db.query('SELECT id FROM price_models WHERE slug = $1', [slug]);
    const featuresJson = JSON.stringify(features && typeof features === 'object' ? features : {});

    if (existing.rows.length) {
      await db.query(
        `UPDATE price_models SET
           name=$1, description=$2, type=$3, base_price=$4, billing_cycle=$5,
           features=$6, status=$7, highlight=$8, badge_text=$9,
           annual_discount_pct=$10, sort_order=$11, cta_text=$12, cta_url=$13,
           icon_class=$14, pay_as_you_go_text=$15, currency=$16, trial_days=$17,
           updated_at=CURRENT_TIMESTAMP
         WHERE slug=$18`,
        [
          name,
          description || null,
          type || null,
          base_price != null ? base_price : null,
          billing_cycle || 'monthly',
          featuresJson,
          status || 'active',
          !!highlight,
          badge_text || null,
          annual_discount_pct != null ? parseInt(annual_discount_pct, 10) : 20,
          sort_order != null ? parseInt(sort_order, 10) : 0,
          cta_text || 'Choose Plan',
          cta_url || null,
          icon_class || null,
          pay_as_you_go_text || null,
          currency || 'USD',
          trial_days != null ? parseInt(trial_days, 10) : 0,
          slug,
        ]
      );
      await audit(req, 'pricing/packages/update', slug);
      const row = await db.query('SELECT * FROM price_models WHERE slug = $1', [slug]);
      return ok(res, { package: row.rows[0], action: 'updated' });
    }

    await db.query(
      `INSERT INTO price_models (
         name, slug, description, type, base_price, billing_cycle, features, status,
         highlight, badge_text, annual_discount_pct, sort_order,
         cta_text, cta_url, icon_class, pay_as_you_go_text, currency, trial_days
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        name,
        slug,
        description || null,
        type || null,
        base_price != null ? base_price : null,
        billing_cycle || 'monthly',
        featuresJson,
        status || 'active',
        !!highlight,
        badge_text || null,
        annual_discount_pct != null ? parseInt(annual_discount_pct, 10) : 20,
        sort_order != null ? parseInt(sort_order, 10) : 0,
        cta_text || 'Choose Plan',
        cta_url || null,
        icon_class || null,
        pay_as_you_go_text || null,
        currency || 'USD',
        trial_days != null ? parseInt(trial_days, 10) : 0,
      ]
    );
    await audit(req, 'pricing/packages/create', slug);
    const row = await db.query('SELECT * FROM price_models WHERE slug = $1', [slug]);
    return ok(res, { package: row.rows[0], action: 'created' }, 201);
  } catch (e) {
    console.error('[machine-api] upsert package', e);
    return fail(res, 'Failed to upsert package: ' + e.message, 500);
  }
});

router.put('/v1/pricing/features/:key', async (req, res) => {
  try {
    const feature_key = String(req.params.key || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/(^_|_$)/g, '');
    if (!feature_key) return fail(res, 'Invalid feature key');

    const {
      category_name,
      category_icon,
      feature_name,
      feature_description,
      sort_order,
      category_sort_order,
      status,
    } = req.body || {};

    if (!category_name || !feature_name) {
      return fail(res, 'category_name and feature_name are required');
    }

    await db.query(
      `INSERT INTO pricing_features
         (category_name, category_icon, feature_key, feature_name, feature_description,
          sort_order, category_sort_order, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (feature_key) DO UPDATE SET
         category_name = EXCLUDED.category_name,
         category_icon = EXCLUDED.category_icon,
         feature_name = EXCLUDED.feature_name,
         feature_description = EXCLUDED.feature_description,
         sort_order = EXCLUDED.sort_order,
         category_sort_order = EXCLUDED.category_sort_order,
         status = EXCLUDED.status,
         updated_at = CURRENT_TIMESTAMP`,
      [
        category_name,
        category_icon || 'fas fa-cog',
        feature_key,
        feature_name,
        feature_description || null,
        sort_order != null ? parseInt(sort_order, 10) : 0,
        category_sort_order != null ? parseInt(category_sort_order, 10) : 0,
        status || 'active',
      ]
    );
    await audit(req, 'pricing/features/upsert', feature_key);
    const row = await db.query('SELECT * FROM pricing_features WHERE feature_key = $1', [
      feature_key,
    ]);
    return ok(res, { feature: row.rows[0] });
  } catch (e) {
    console.error('[machine-api] upsert feature', e);
    return fail(res, 'Failed to upsert feature: ' + e.message, 500);
  }
});

// ── Products ────────────────────────────────────────────────────────

router.get('/v1/products', async (req, res) => {
  try {
    const { status = 'active', service_page, limit = '100' } = req.query;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const params = [];
    let sql = 'SELECT * FROM products WHERE 1=1';
    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (service_page) {
      params.push(service_page);
      sql += ` AND service_page = $${params.length}`;
    }
    sql += ` ORDER BY name ASC LIMIT ${lim}`;
    const result = await db.query(sql, params);
    return ok(res, { products: result.rows, count: result.rows.length });
  } catch (e) {
    console.error('[machine-api] GET products', e);
    return fail(res, 'Failed to load products', 500);
  }
});

/**
 * Create Stripe Product + Price objects for active catalog products and
 * write stripe_* IDs back to Postgres. Does not charge customers.
 *
 * POST /v1/products/sync-stripe
 * body/query: { dry_run?: bool, limit?: number, only?: uuid|sku|slug }
 */
router.post('/v1/products/sync-stripe', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return fail(res, 'STRIPE_SECRET_KEY not configured on server', 503);
    }
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const dryRun = String(req.body?.dry_run ?? req.query.dry_run ?? '') === '1'
      || req.body?.dry_run === true;
    const limit = Math.min(Math.max(parseInt(req.body?.limit || req.query.limit || '0', 10) || 0, 0), 500);
    const only = String(req.body?.only || req.query.only || '').trim();

    const num = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseFloat(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const cents = (a) => Math.round(a * 100);

    let { rows: products } = await db.query(
      `SELECT id, name, description, sku, slug, currency, status, pricing_type, product_type,
              price, monthly_price, yearly_price, setup_fee, image_url,
              stripe_product_id, stripe_price_id, stripe_price_id_monthly,
              stripe_price_id_yearly, stripe_price_id_setup
       FROM products
       WHERE COALESCE(status, 'active') = 'active'
       ORDER BY sort_order NULLS LAST, name`
    );
    if (only) {
      products = products.filter(
        (p) => p.id === only || p.sku === only || p.slug === only
      );
    }
    if (limit > 0) products = products.slice(0, limit);

    const summary = {
      dry_run: dryRun,
      livemode: process.env.STRIPE_SECRET_KEY.startsWith('sk_live_'),
      considered: products.length,
      created: 0,
      skipped: 0,
      errors: [],
      items: [],
    };

    for (const p of products) {
      const currency = (p.currency || 'USD').toLowerCase();
      const isSub =
        p.pricing_type === 'subscription' || p.product_type === 'subscription';
      const oneTime = num(p.price);
      const monthly = num(p.monthly_price);
      const yearly = num(p.yearly_price);
      const setup = num(p.setup_fee);
      const hasOneTime = !isSub && oneTime;
      const hasSub = isSub && (monthly || yearly);

      if (!hasOneTime && !hasSub) {
        summary.skipped += 1;
        summary.items.push({ id: p.id, name: p.name, action: 'skip_no_price' });
        continue;
      }
      if (!isSub && p.stripe_product_id && p.stripe_price_id) {
        summary.skipped += 1;
        summary.items.push({ id: p.id, name: p.name, action: 'skip_already_linked' });
        continue;
      }
      if (
        isSub &&
        p.stripe_product_id &&
        (p.stripe_price_id_monthly || p.stripe_price_id_yearly)
      ) {
        summary.skipped += 1;
        summary.items.push({ id: p.id, name: p.name, action: 'skip_already_linked' });
        continue;
      }

      try {
        let productId = p.stripe_product_id;
        if (!productId) {
          if (dryRun) {
            productId = 'prod_dry_run';
          } else {
            const created = await stripe.products.create({
              name: p.name,
              description: (p.description || '').slice(0, 500) || undefined,
              images: p.image_url ? [p.image_url] : undefined,
              metadata: {
                wts_product_id: p.id,
                wts_sku: p.sku || '',
                wts_slug: p.slug || '',
                source: 'machine-api-sync-stripe',
              },
            });
            productId = created.id;
          }
        }

        let stripe_price_id = p.stripe_price_id;
        let stripe_price_id_monthly = p.stripe_price_id_monthly;
        let stripe_price_id_yearly = p.stripe_price_id_yearly;
        let stripe_price_id_setup = p.stripe_price_id_setup;

        if (hasOneTime && !stripe_price_id) {
          if (dryRun) {
            stripe_price_id = 'price_dry_run';
          } else {
            const price = await stripe.prices.create({
              product: productId,
              currency,
              unit_amount: cents(oneTime),
              metadata: { wts_product_id: p.id, kind: 'one_time' },
            });
            stripe_price_id = price.id;
          }
        }
        if (hasSub && monthly && !stripe_price_id_monthly) {
          if (dryRun) {
            stripe_price_id_monthly = 'price_dry_monthly';
          } else {
            const price = await stripe.prices.create({
              product: productId,
              currency,
              unit_amount: cents(monthly),
              recurring: { interval: 'month' },
              metadata: { wts_product_id: p.id, kind: 'monthly' },
            });
            stripe_price_id_monthly = price.id;
          }
        }
        if (hasSub && yearly && !stripe_price_id_yearly) {
          if (dryRun) {
            stripe_price_id_yearly = 'price_dry_yearly';
          } else {
            const price = await stripe.prices.create({
              product: productId,
              currency,
              unit_amount: cents(yearly),
              recurring: { interval: 'year' },
              metadata: { wts_product_id: p.id, kind: 'yearly' },
            });
            stripe_price_id_yearly = price.id;
          }
        }
        if (setup && !stripe_price_id_setup) {
          if (dryRun) {
            stripe_price_id_setup = 'price_dry_setup';
          } else {
            const price = await stripe.prices.create({
              product: productId,
              currency,
              unit_amount: cents(setup),
              metadata: { wts_product_id: p.id, kind: 'setup' },
            });
            stripe_price_id_setup = price.id;
          }
        }

        if (!dryRun) {
          await db.query(
            `UPDATE products SET
               stripe_product_id = COALESCE($2, stripe_product_id),
               stripe_price_id = COALESCE($3, stripe_price_id),
               stripe_price_id_monthly = COALESCE($4, stripe_price_id_monthly),
               stripe_price_id_yearly = COALESCE($5, stripe_price_id_yearly),
               stripe_price_id_setup = COALESCE($6, stripe_price_id_setup),
               updated_at = NOW()
             WHERE id = $1`,
            [
              p.id,
              productId,
              stripe_price_id || null,
              stripe_price_id_monthly || null,
              stripe_price_id_yearly || null,
              stripe_price_id_setup || null,
            ]
          );
        }

        summary.created += 1;
        summary.items.push({
          id: p.id,
          name: p.name,
          action: dryRun ? 'would_create' : 'created',
          stripe_product_id: productId,
          stripe_price_id,
          stripe_price_id_monthly,
          stripe_price_id_yearly,
        });
      } catch (e) {
        summary.errors.push({ id: p.id, name: p.name, error: e.message });
      }
    }

    return ok(res, summary);
  } catch (e) {
    console.error('[machine-api] POST products/sync-stripe', e);
    return fail(res, 'Stripe product sync failed: ' + e.message, 500);
  }
});

/**
 * Bulk-update product marketing copy (description, features, slide-in).
 * POST /v1/products/bulk-update-copy
 * body: { updates: [{ slug|id, description?, features?, slide_in_title?, slide_in_subtitle?, slide_in_content?, slide_in_image?, name? }] }
 */
router.post('/v1/products/bulk-update-copy', async (req, res) => {
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) return fail(res, 'updates array required');

    const results = [];
    for (const u of updates.slice(0, 200)) {
      const id = u.id || null;
      const slug = u.slug || null;
      if (!id && !slug) {
        results.push({ ok: false, error: 'id or slug required', input: u });
        continue;
      }
      const fields = [];
      const params = [];
      const add = (col, val) => {
        if (val === undefined) return;
        params.push(val);
        fields.push(`${col} = $${params.length}`);
      };
      if (u.name != null) add('name', String(u.name).trim().slice(0, 255));
      if (u.description != null) add('description', String(u.description).trim().slice(0, 2000));
      if (u.features != null) {
        const feats = Array.isArray(u.features)
          ? u.features.map((f) => String(f).trim()).filter(Boolean)
          : String(u.features).split('\n').map((f) => f.trim()).filter(Boolean);
        add('features', feats);
      }
      if (u.slide_in_title != null) add('slide_in_title', String(u.slide_in_title).trim().slice(0, 500) || null);
      if (u.slide_in_subtitle != null) add('slide_in_subtitle', String(u.slide_in_subtitle).trim().slice(0, 2000) || null);
      if (u.slide_in_content != null) add('slide_in_content', String(u.slide_in_content).trim().slice(0, 10000) || null);
      if (u.slide_in_image != null) add('slide_in_image', String(u.slide_in_image).trim() || null);
      if (u.image_url != null) add('image_url', String(u.image_url).trim() || null);
      if (u.article_url != null) add('article_url', String(u.article_url).trim() || null);
      if (u.article_title != null) add('article_title', String(u.article_title).trim().slice(0, 255) || null);
      const asLines = (val) => {
        if (val == null) return undefined;
        if (Array.isArray(val)) return val.map((x) => String(x).trim()).filter(Boolean);
        return String(val).split('\n').map((x) => x.trim()).filter(Boolean);
      };
      if (u.article_chapters != null) add('article_chapters', asLines(u.article_chapters));
      if (u.article_facts != null) add('article_facts', asLines(u.article_facts));
      if (u.article_sources != null) add('article_sources', asLines(u.article_sources));
      if (!fields.length) {
        results.push({ ok: false, error: 'no fields', slug, id });
        continue;
      }
      params.push(id);
      params.push(slug);
      const sql = `UPDATE products SET ${fields.join(', ')}, updated_at = NOW()
        WHERE ($` + (params.length - 1) + `::uuid IS NOT NULL AND id = $` + (params.length - 1) + `)
           OR ($` + params.length + `::text IS NOT NULL AND slug = $` + params.length + `)
        RETURNING id, name, slug`;
      try {
        const r = await db.query(sql, params);
        if (!r.rows.length) results.push({ ok: false, error: 'not found', slug, id });
        else results.push({ ok: true, product: r.rows[0] });
      } catch (e) {
        results.push({ ok: false, error: e.message, slug, id });
      }
    }
    return ok(res, {
      updated: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    console.error('[machine-api] bulk-update-copy', e);
    return fail(res, e.message, 500);
  }
});

/**
 * Patch price_options (and optional stripe_product_id) on a product by id or slug.
 * POST /v1/products/price-options
 * body: { id|slug, price_options, stripe_product_id?, price? }
 */
router.post('/v1/products/price-options', async (req, res) => {
  try {
    const {
      id,
      slug,
      price_options,
      stripe_product_id,
      price,
      image_url,
      slide_in_title,
      slide_in_subtitle,
      slide_in_image,
      slide_in_content,
      description,
    } = req.body || {};
    if (!id && !slug) return fail(res, 'id or slug required');
    if (!Array.isArray(price_options) || !price_options.length) {
      return fail(res, 'price_options array required');
    }
    const { normalizePriceOptions } = require('../utils/pricing');
    const options = normalizePriceOptions(price_options);
    if (!options.length) return fail(res, 'no valid price_options');

    const fromPrice =
      price != null
        ? parseFloat(price)
        : Math.min.apply(null, options.map((o) => o.price));

    const result = await db.query(
      `UPDATE products SET
         pricing_type = 'options',
         price_options = $1::jsonb,
         price = COALESCE($2, price),
         stripe_product_id = COALESCE($3, stripe_product_id),
         image_url = COALESCE($6, image_url),
         slide_in_title = COALESCE($7, slide_in_title),
         slide_in_subtitle = COALESCE($8, slide_in_subtitle),
         slide_in_image = COALESCE($9, slide_in_image),
         slide_in_content = COALESCE($10, slide_in_content),
         description = COALESCE($11, description),
         updated_at = NOW()
       WHERE ($4::uuid IS NOT NULL AND id = $4)
          OR ($5::text IS NOT NULL AND slug = $5)
       RETURNING id, name, slug, pricing_type, price, stripe_product_id, price_options, image_url, slide_in_image`,
      [
        JSON.stringify(options),
        Number.isFinite(fromPrice) ? fromPrice : null,
        stripe_product_id || null,
        id || null,
        slug || null,
        image_url || null,
        slide_in_title || null,
        slide_in_subtitle || null,
        slide_in_image || null,
        slide_in_content || null,
        description || null,
      ]
    );
    if (!result.rows.length) return fail(res, 'product not found', 404);
    return ok(res, { product: result.rows[0] });
  } catch (e) {
    console.error('[machine-api] price-options', e);
    return fail(res, e.message, 500);
  }
});

/**
 * Bootstrap Logo Design as one product with two price options (AI + Designer).
 * Archives the legacy separate logo products. Creates Stripe Product + Prices.
 *
 * POST /v1/products/bootstrap-logo-options
 */
router.post('/v1/products/bootstrap-logo-options', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return fail(res, 'STRIPE_SECRET_KEY not configured', 503);
    }
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const dryRun = req.body?.dry_run === true || String(req.query.dry_run || '') === '1';

    // Ensure column exists (db init may not have run yet on old containers)
    await db.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='products' AND column_name='price_options'
        ) THEN
          ALTER TABLE products ADD COLUMN price_options JSONB DEFAULT '[]'::jsonb;
        END IF;
      END $$;
    `);

    const legacySlugs = [
      'logo-design-ai-powered-creation',
      'logo-design-graphic-designer-support',
    ];
    const legacy = await db.query(
      `SELECT * FROM products WHERE slug = ANY($1::text[]) OR name ILIKE 'Logo Design%'`,
      [legacySlugs]
    );

    const options = [
      {
        key: 'ai',
        label: 'AI-Powered Creation',
        sku: '19106773',
        price: 49,
        strategy: 'entry_speed',
        features: [
          'AI-assisted logo creation',
          'Fast brand concept development',
          'Clean visual direction',
          'Suitable for startup use',
          'Affordable entry-level branding',
        ],
        description: 'Fast AI-assisted logo concept for startups and SMEs.',
      },
      {
        key: 'designer',
        label: 'Graphic Designer Support',
        sku: '19106774',
        price: 149,
        strategy: 'premium_craft',
        features: [
          'Graphic designer support',
          'Logo refinement',
          'Brand identity guidance',
          'Human creative craft',
          'Suitable for custom brand needs',
        ],
        description: 'Human designer support for refined custom logo work.',
      },
    ];

    // Reuse stripe price IDs from legacy products when present
    for (const row of legacy.rows) {
      if (row.slug === 'logo-design-ai-powered-creation' && row.stripe_price_id) {
        options[0].stripe_price_id = row.stripe_price_id;
      }
      if (row.slug === 'logo-design-graphic-designer-support' && row.stripe_price_id) {
        options[1].stripe_price_id = row.stripe_price_id;
      }
    }

    if (dryRun) {
      return ok(res, {
        dry_run: true,
        would_create: 'Logo Design',
        options,
        archive: legacy.rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
      });
    }

    // Stripe: one product, two prices
    let stripeProductId = null;
    const existingParent = await db.query(
      `SELECT * FROM products WHERE slug = 'logo-design' LIMIT 1`
    );
    if (existingParent.rows[0]?.stripe_product_id) {
      stripeProductId = existingParent.rows[0].stripe_product_id;
    } else {
      const sp = await stripe.products.create({
        name: 'Logo Design',
        description:
          'Professional logo design for SEA businesses — choose AI-powered speed or human designer craft.',
        metadata: { wts_slug: 'logo-design', source: 'bootstrap-logo-options' },
      });
      stripeProductId = sp.id;
    }

    for (const opt of options) {
      if (opt.stripe_price_id) continue;
      const price = await stripe.prices.create({
        product: stripeProductId,
        currency: 'usd',
        unit_amount: Math.round(opt.price * 100),
        metadata: {
          wts_option_key: opt.key,
          wts_sku: opt.sku || '',
          source: 'bootstrap-logo-options',
        },
      });
      opt.stripe_price_id = price.id;
    }

    const features = [
      'Two paths: AI-powered or human designer',
      'Clear SKU and price per option',
      'Fast delivery for SEA startups and SMEs',
    ];
    const description =
      'Logo Design for Words That Sells clients. Choose AI-Powered Creation for speed and value, or Graphic Designer Support for hands-on human craft and refinement.';

    let parentId;
    if (existingParent.rows[0]) {
      parentId = existingParent.rows[0].id;
      await db.query(
        `UPDATE products SET
           name = $2, description = $3, price = $4, currency = 'USD',
           features = $5, status = 'active', service_page = 'content-creation',
           subcategory = 'logo-design', purchase_mode = 'buy', pricing_type = 'options',
           product_type = 'service', sku = 'LOGO',
           stripe_product_id = $6, price_options = $7::jsonb,
           is_featured = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [
          parentId,
          'Logo Design',
          description,
          49,
          features,
          stripeProductId,
          JSON.stringify(options),
        ]
      );
    } else {
      const ins = await db.query(
        `INSERT INTO products (
           name, slug, description, price, currency, features, status,
           service_page, subcategory, purchase_mode, pricing_type, product_type,
           sku, stripe_product_id, price_options, is_featured, icon_class
         ) VALUES (
           $1, 'logo-design', $2, $3, 'USD', $4, 'active',
           'content-creation', 'logo-design', 'buy', 'options', 'service',
           'LOGO', $5, $6::jsonb, TRUE, 'fas fa-pen-nib'
         ) RETURNING id`,
        ['Logo Design', description, 49, features, stripeProductId, JSON.stringify(options)]
      );
      parentId = ins.rows[0].id;
    }

    // Archive legacy separate products
    const archived = [];
    for (const row of legacy.rows) {
      if (row.id === parentId || row.slug === 'logo-design') continue;
      await db.query(
        `UPDATE products SET status = 'archived', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      archived.push({ id: row.id, name: row.name, slug: row.slug });
    }

    return ok(res, {
      product_id: parentId,
      slug: 'logo-design',
      stripe_product_id: stripeProductId,
      options,
      archived,
    });
  } catch (e) {
    console.error('[machine-api] bootstrap-logo-options', e);
    return fail(res, 'bootstrap-logo-options failed: ' + e.message, 500);
  }
});

// ── Affiliate solutions ─────────────────────────────────────────────

router.get('/v1/affiliate-solutions', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM affiliate_solutions ORDER BY name ASC`
    );
    return ok(res, { solutions: result.rows });
  } catch (e) {
    return fail(res, 'Failed to load affiliate solutions', 500);
  }
});

router.put('/v1/affiliate-solutions/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name || '').trim();
    if (!name) return fail(res, 'name is required');

    const {
      description,
      commission_rate,
      cookie_duration,
      payout_threshold,
      affiliate_url,
      category,
      status,
    } = req.body || {};

    const existing = await db.query(
      'SELECT id FROM affiliate_solutions WHERE name = $1',
      [name]
    );

    if (existing.rows.length) {
      await db.query(
        `UPDATE affiliate_solutions SET
           description=$1, commission_rate=$2, cookie_duration=$3, payout_threshold=$4,
           affiliate_url=$5, category=$6, status=$7, updated_at=CURRENT_TIMESTAMP
         WHERE name=$8`,
        [
          description || null,
          commission_rate || null,
          cookie_duration || null,
          payout_threshold != null ? payout_threshold : null,
          affiliate_url || null,
          category || null,
          status || 'active',
          name,
        ]
      );
      await audit(req, 'affiliate-solutions/update', name);
    } else {
      await db.query(
        `INSERT INTO affiliate_solutions
           (name, description, commission_rate, cookie_duration, payout_threshold, affiliate_url, category, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          name,
          description || null,
          commission_rate || null,
          cookie_duration || null,
          payout_threshold != null ? payout_threshold : null,
          affiliate_url || null,
          category || null,
          status || 'active',
        ]
      );
      await audit(req, 'affiliate-solutions/create', name);
    }

    const row = await db.query('SELECT * FROM affiliate_solutions WHERE name = $1', [name]);
    return ok(res, { solution: row.rows[0] });
  } catch (e) {
    console.error('[machine-api] upsert affiliate solution', e);
    return fail(res, 'Failed to upsert affiliate solution: ' + e.message, 500);
  }
});

// ── Footer (read site_settings keys used by public footer) ──────────

router.get('/v1/footer-settings', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT key, value FROM site_settings
       WHERE key LIKE 'footer_%' OR key LIKE 'social_%'
       ORDER BY key`
    );
    const settings = {};
    result.rows.forEach((r) => {
      settings[r.key] = r.value;
    });
    return ok(res, { settings });
  } catch (e) {
    return fail(res, 'Failed to load footer settings', 500);
  }
});

router.patch('/v1/footer-settings', async (req, res) => {
  try {
    const body = req.body || {};
    const keys = Object.keys(body).filter(
      (k) => k.startsWith('footer_') || k.startsWith('social_')
    );
    if (!keys.length) {
      return fail(res, 'Provide one or more footer_* or social_* keys');
    }

    let updated = 0;
    for (const key of keys) {
      const value = body[key] == null ? '' : String(body[key]);
      await db.query(
        `INSERT INTO site_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
      updated += 1;
    }
    await audit(req, 'footer-settings/patch', keys.join(','));
    return ok(res, { updated, keys });
  } catch (e) {
    // site_settings may not have updated_at
    if (e.message && e.message.includes('updated_at')) {
      try {
        const body = req.body || {};
        const keys = Object.keys(body).filter(
          (k) => k.startsWith('footer_') || k.startsWith('social_')
        );
        for (const key of keys) {
          const value = body[key] == null ? '' : String(body[key]);
          await db.query(
            `INSERT INTO site_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, value]
          );
        }
        return ok(res, { updated: keys.length, keys });
      } catch (e2) {
        return fail(res, 'Failed to update footer settings: ' + e2.message, 500);
      }
    }
    return fail(res, 'Failed to update footer settings: ' + e.message, 500);
  }
});

// ── Menus (read) ────────────────────────────────────────────────────

router.get('/v1/menus', async (req, res) => {
  try {
    const location = req.query.location || null;
    let result;
    if (location) {
      result = await db.query(
        `SELECT * FROM menu_items WHERE location = $1 ORDER BY sort_order ASC`,
        [location]
      );
    } else {
      result = await db.query(`SELECT * FROM menu_items ORDER BY location, sort_order ASC`);
    }
    return ok(res, { items: result.rows });
  } catch (e) {
    return fail(res, 'Failed to load menus', 500);
  }
});

router.patch('/v1/menus/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { label, url, sort_order, is_visible, open_in_new_tab, location } = req.body || {};

    const existing = await db.query('SELECT * FROM menu_items WHERE id = $1', [id]);
    if (!existing.rows.length) return fail(res, 'Menu item not found', 404);

    const cur = existing.rows[0];
    await db.query(
      `UPDATE menu_items SET
         label = $1, url = $2, sort_order = $3, is_visible = $4,
         open_in_new_tab = $5, location = $6
       WHERE id = $7`,
      [
        label != null ? label : cur.label,
        url != null ? url : cur.url,
        sort_order != null ? parseInt(sort_order, 10) : cur.sort_order,
        is_visible != null ? !!is_visible : cur.is_visible,
        open_in_new_tab != null ? !!open_in_new_tab : cur.open_in_new_tab,
        location != null ? location : cur.location,
        id,
      ]
    );
    await audit(req, 'menus/patch', id);
    const row = await db.query('SELECT * FROM menu_items WHERE id = $1', [id]);
    return ok(res, { item: row.rows[0] });
  } catch (e) {
    return fail(res, 'Failed to update menu item: ' + e.message, 500);
  }
});

// ── Glossary bulk upsert ────────────────────────────────────────────

/**
 * POST /v1/glossary/bulk-upsert
 * Body: { terms: [ { term, definition, category, categories, related_terms,
 *   bullets, example, video_url, featured_image, article_link, slug? } ] }
 * Upserts by case-insensitive term match.
 */
router.post('/v1/glossary/bulk-upsert', async (req, res) => {
  try {
    const terms = Array.isArray(req.body?.terms) ? req.body.terms : null;
    if (!terms || !terms.length) return fail(res, 'Body must include non-empty terms[]');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const raw of terms) {
      try {
        const term = String(raw.term || '').trim();
        const definition = String(raw.definition || '').trim();
        if (!term || !definition) {
          skipped++;
          continue;
        }
        const letter = term.charAt(0).toUpperCase();
        const slug =
          String(raw.slug || term)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'term';
        const category = raw.category || null;
        const related = Array.isArray(raw.related_terms)
          ? raw.related_terms
          : String(raw.related_terms || '')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
        const categories = Array.isArray(raw.categories)
          ? raw.categories
          : String(raw.categories || '')
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean);
        let bullets = raw.bullets;
        if (typeof bullets === 'string') {
          bullets = bullets.split(/[;\n]/).map((b) => b.trim()).filter(Boolean);
        }
        if (!Array.isArray(bullets)) bullets = [];

        const existing = await db.query(
          'SELECT id FROM glossary WHERE LOWER(term) = LOWER($1) LIMIT 1',
          [term]
        );

        if (existing.rows.length) {
          await db.query(
            `UPDATE glossary SET
               term = $1, definition = $2, category = $3, related_terms = $4,
               letter = $5, slug = $6, video_url = $7, featured_image = $8,
               article_link = $9, bullets = $10, example = $11, categories = $12,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $13`,
            [
              term,
              definition,
              category,
              related,
              letter,
              slug,
              raw.video_url || null,
              raw.featured_image || null,
              raw.article_link || null,
              JSON.stringify(bullets),
              raw.example || null,
              categories,
              existing.rows[0].id,
            ]
          );
          updated++;
        } else {
          await db.query(
            `INSERT INTO glossary
               (term, definition, category, related_terms, letter, slug,
                video_url, featured_image, article_link, bullets, example, categories)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              term,
              definition,
              category,
              related,
              letter,
              slug,
              raw.video_url || null,
              raw.featured_image || null,
              raw.article_link || null,
              JSON.stringify(bullets),
              raw.example || null,
              categories,
            ]
          );
          inserted++;
        }
      } catch (rowErr) {
        errors.push({ term: raw?.term, error: rowErr.message });
      }
    }

    await audit(req, 'glossary/bulk-upsert', `i=${inserted} u=${updated} s=${skipped} e=${errors.length}`);
    return ok(res, { inserted, updated, skipped, errors: errors.slice(0, 20), total: terms.length });
  } catch (e) {
    console.error('[machine-api] glossary bulk-upsert', e);
    return fail(res, 'Glossary bulk upsert failed: ' + e.message, 500);
  }
});

router.get('/v1/glossary', async (req, res) => {
  try {
    const result = await db.query('SELECT id, term, slug, category, featured_image, updated_at FROM glossary ORDER BY term ASC');
    return ok(res, { count: result.rows.length, terms: result.rows });
  } catch (e) {
    return fail(res, 'Failed to list glossary: ' + e.message, 500);
  }
});

// ── Form templates (admin Form Builder) ─────────────────────────────

/**
 * POST /v1/form-templates/upsert
 * Body: { form_type, title, subtitle?, fields[], submit_button_text?, success_message?, status? }
 * Creates/updates a row in form_templates so it appears in Web Dev → Form Builder.
 */
router.post('/v1/form-templates/upsert', async (req, res) => {
  try {
    const {
      form_type,
      title,
      subtitle,
      fields,
      submit_button_text,
      success_message,
      status,
    } = req.body || {};
    if (!form_type || !title) return fail(res, 'form_type and title are required');
    if (!Array.isArray(fields) || !fields.length) return fail(res, 'fields[] is required');
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(String(form_type).trim())) {
      return fail(res, 'form_type must be lowercase slug (a-z, 0-9, hyphens)');
    }

    const ft = String(form_type).trim();
    const existing = await db.query('SELECT id FROM form_templates WHERE form_type = $1 LIMIT 1', [ft]);
    const fieldsJson = JSON.stringify(fields);
    const subBtn = submit_button_text || 'Send message';
    const success = success_message || 'Thank you! We received your message.';
    const st = status || 'active';

    if (existing.rows.length) {
      await db.query(
        `UPDATE form_templates SET title=$1, subtitle=$2, fields=$3,
         submit_button_text=$4, success_message=$5, status=$6, updated_at=CURRENT_TIMESTAMP
         WHERE form_type=$7`,
        [title.trim(), subtitle || null, fieldsJson, subBtn, success, st, ft]
      );
      await audit(req, 'form-templates/update', ft);
      return ok(res, { action: 'updated', form_type: ft, id: existing.rows[0].id });
    }

    const inserted = await db.query(
      `INSERT INTO form_templates (form_type, title, subtitle, fields, submit_button_text, success_message, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ft, title.trim(), subtitle || null, fieldsJson, subBtn, success, st]
    );
    await audit(req, 'form-templates/create', ft);
    return ok(res, { action: 'created', form_type: ft, id: inserted.rows[0].id });
  } catch (e) {
    console.error('[machine-api] form-templates upsert', e);
    return fail(res, 'Form template upsert failed: ' + e.message, 500);
  }
});

// ── Image Library SEO metadata ──────────────────────────────────────


/**
 * Normalize image library tags: lowercase slug-style, unique, max 12.
 * Accepts array or comma-separated string (same shape as admin UI).
 */
function normalizeImageTags(raw) {
  if (raw == null || raw === '') return undefined;
  let list;
  if (Array.isArray(raw)) {
    list = raw.map((t) => String(t).trim()).filter(Boolean);
  } else {
    list = String(raw)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  const out = [];
  const seen = new Set();
  for (const t of list) {
    const tag = t
      .toLowerCase()
      .replace(/[_/]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * POST /v1/images/seo-upsert
 * Body: { filename?|cdn_url?|id?, alt_text?, title?, description?, tags?, category?, width?, height? }
 * Updates Image Library SEO fields so public pages can join them for bots.
 */
router.post('/v1/images/seo-upsert', async (req, res) => {
  try {
    const {
      id,
      filename,
      cdn_url,
      alt_text,
      title,
      description,
      tags,
      category,
      width,
      height,
      new_filename,
      new_cdn_url,
      also_match,
    } = req.body || {};

    if (!id && !filename && !cdn_url && !also_match) {
      return fail(res, 'id, filename, cdn_url, or also_match is required');
    }

    const tagsNorm = tags !== undefined ? normalizeImageTags(tags) : undefined;
    const categoryNorm =
      category !== undefined
        ? String(category || '')
            .trim()
            .toLowerCase()
            .slice(0, 80) || null
        : undefined;

    let row;
    if (id) {
      row = await db.query('SELECT id, filename, cdn_url FROM images WHERE id = $1 LIMIT 1', [id]);
    } else {
      const keys = [filename, cdn_url, also_match].filter(Boolean).map(String);
      row = await db.query(
        `SELECT id, filename, cdn_url FROM images
         WHERE status = 'active' AND (
           filename = ANY($1::text[])
           OR original_filename = ANY($1::text[])
           OR cdn_url = ANY($1::text[])
           OR EXISTS (
             SELECT 1 FROM unnest($1::text[]) k
             WHERE cdn_url LIKE '%' || k OR filename ILIKE k
           )
         )
         ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
        [keys]
      );
    }

    if (!row.rows.length) {
      // Register a new library row if we have a new filename + cdn (file already on GH Pages)
      if (new_filename && new_cdn_url) {
        const inserted = await db.query(
          `INSERT INTO images (
             original_filename, filename, file_path, file_size, mime_type,
             width, height, alt_text, title, description, category, tags, cdn_url, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active')
           RETURNING id, filename, cdn_url, tags, category`,
          [
            new_filename,
            new_filename,
            'images/' + new_filename,
            0,
            'image/webp',
            width ? Number(width) : 1200,
            height ? Number(height) : 628,
            alt_text || '',
            title || '',
            description || '',
            categoryNorm || 'product',
            tagsNorm || [],
            new_cdn_url,
          ]
        );
        await audit(req, 'images/seo-create', new_filename);
        return ok(res, { action: 'created', ...inserted.rows[0] });
      }
      return fail(res, 'Image not found in Image Library', 404);
    }

    const imgId = row.rows[0].id;
    const sets = [];
    const params = [];
    const add = (col, val) => {
      if (val === undefined) return;
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    add('alt_text', alt_text !== undefined ? String(alt_text) : undefined);
    add('title', title !== undefined ? String(title) : undefined);
    add('description', description !== undefined ? String(description) : undefined);
    add('tags', tagsNorm);
    add('category', categoryNorm);
    if (width !== undefined && width !== null && width !== '') add('width', Number(width) || null);
    if (height !== undefined && height !== null && height !== '') add('height', Number(height) || null);
    if (new_filename) {
      add('filename', String(new_filename));
      add('file_path', 'images/' + String(new_filename));
    }
    if (new_cdn_url) add('cdn_url', String(new_cdn_url));

    if (!sets.length) return fail(res, 'No SEO fields to update');

    params.push(imgId);
    const updated = await db.query(
      `UPDATE images SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${params.length}
       RETURNING id, filename, cdn_url, alt_text, title, tags, category`,
      params
    );
    await audit(req, 'images/seo-upsert', updated.rows[0].filename || imgId);
    return ok(res, {
      action: 'updated',
      id: updated.rows[0].id,
      filename: updated.rows[0].filename,
      cdn_url: updated.rows[0].cdn_url,
      alt_text: updated.rows[0].alt_text,
      title: updated.rows[0].title,
      tags: updated.rows[0].tags,
      category: updated.rows[0].category,
    });
  } catch (e) {
    console.error('[machine-api] images seo-upsert', e);
    return fail(res, 'Image SEO upsert failed: ' + e.message, 500);
  }
});

/**
 * POST /v1/images/seo-bulk
 * Body: { items: [{ filename|cdn_url, alt_text?, title?, description?, tags?, category? }] }
 */
router.post('/v1/images/seo-bulk', async (req, res) => {
  try {
    const items = (req.body && req.body.items) || [];
    if (!Array.isArray(items) || !items.length) return fail(res, 'items[] required');

    let updated = 0;
    let skipped = 0;
    const errors = [];
    for (const it of items) {
      try {
        const filename = it.filename || '';
        const cdn_url = it.cdn_url || '';
        if (!filename && !cdn_url) {
          skipped += 1;
          continue;
        }
        const row = await db.query(
          `SELECT id FROM images
           WHERE ($1 <> '' AND (filename = $1 OR original_filename = $1))
              OR ($2 <> '' AND (cdn_url = $2 OR cdn_url LIKE '%' || $2 OR $2 LIKE '%' || filename))
           ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
          [filename, cdn_url]
        );
        if (!row.rows.length) {
          skipped += 1;
          continue;
        }
        const tagsNorm = it.tags !== undefined ? normalizeImageTags(it.tags) : undefined;
        const categoryNorm =
          it.category !== undefined
            ? String(it.category || '')
                .trim()
                .toLowerCase()
                .slice(0, 80) || null
            : undefined;
        await db.query(
          `UPDATE images SET
             alt_text = COALESCE(NULLIF($1, ''), alt_text),
             title = COALESCE(NULLIF($2, ''), title),
             description = COALESCE(NULLIF($3, ''), description),
             tags = COALESCE($4::text[], tags),
             category = COALESCE(NULLIF($5, ''), category),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $6`,
          [
            it.alt_text || '',
            it.title || '',
            it.description || '',
            tagsNorm || null,
            categoryNorm || '',
            row.rows[0].id,
          ]
        );
        updated += 1;
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }
    await audit(req, 'images/seo-bulk', `u=${updated} s=${skipped}`);
    return ok(res, { updated, skipped, errors: errors.slice(0, 20) });
  } catch (e) {
    console.error('[machine-api] images seo-bulk', e);
    return fail(res, 'Image SEO bulk failed: ' + e.message, 500);
  }
});


/**
 * POST /v1/images/archive
 * Soft-delete Image Library rows (status=archived), same as Admin UI archive.
 * Body: { items: [{ id?|filename?|cdn_url? }], permanent?: false }
 * permanent=true hard-deletes DB row only (does not remove CDN blobs).
 */
router.post('/v1/images/archive', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return fail(res, 'items[] required');
    const permanent = req.body?.permanent === true || req.body?.permanent === '1';
    let archived = 0;
    let deleted = 0;
    let skipped = 0;
    const errors = [];
    const results = [];

    for (const it of items.slice(0, 500)) {
      try {
        const id = it.id || null;
        const filename = it.filename ? String(it.filename) : '';
        const cdn_url = it.cdn_url ? String(it.cdn_url) : '';
        let row;
        if (id) {
          row = await db.query(
            `SELECT id, filename, cdn_url, status FROM images WHERE id = $1 LIMIT 1`,
            [id]
          );
        } else if (filename || cdn_url) {
          row = await db.query(
            `SELECT id, filename, cdn_url, status FROM images
             WHERE ($1 <> '' AND (filename = $1 OR original_filename = $1 OR filename ILIKE $1))
                OR ($2 <> '' AND (cdn_url = $2 OR cdn_url LIKE '%' || $2))
             ORDER BY updated_at DESC NULLS LAST
             LIMIT 1`,
            [filename, cdn_url]
          );
        } else {
          skipped += 1;
          results.push({ ok: false, error: 'id, filename, or cdn_url required' });
          continue;
        }
        if (!row.rows.length) {
          skipped += 1;
          results.push({ ok: false, error: 'not found', filename, cdn_url });
          continue;
        }
        const img = row.rows[0];
        if (permanent) {
          await db.query('DELETE FROM images WHERE id = $1', [img.id]);
          deleted += 1;
          results.push({ ok: true, action: 'deleted', id: img.id, filename: img.filename });
        } else {
          if (img.status === 'archived') {
            skipped += 1;
            results.push({ ok: true, action: 'already_archived', id: img.id, filename: img.filename });
            continue;
          }
          await db.query(
            `UPDATE images SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [img.id]
          );
          archived += 1;
          results.push({ ok: true, action: 'archived', id: img.id, filename: img.filename });
        }
      } catch (e) {
        errors.push(String(e.message || e));
        results.push({ ok: false, error: String(e.message || e) });
      }
    }
    await audit(req, 'images/archive', `a=${archived} d=${deleted} s=${skipped}`);
    return ok(res, {
      archived,
      deleted,
      skipped,
      errors: errors.slice(0, 20),
      results: results.slice(0, 100),
    });
  } catch (e) {
    console.error('[machine-api] images archive', e);
    return fail(res, 'Image archive failed: ' + e.message, 500);
  }
});

// ── WhatsApp Cloud API (terminal bridge) ────────────────────────────

router.get('/v1/whatsapp/status', async (req, res) => {
  const token = !!process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const verify = !!process.env.WHATSAPP_VERIFY_TOKEN;
  let tableOk = false;
  let inboxCount = 0;
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS n FROM whatsapp_messages WHERE direction = 'in'`
    );
    tableOk = true;
    inboxCount = r.rows[0].n;
  } catch (e) {
    tableOk = false;
  }
  return ok(res, {
    configured: token && !!phoneId && verify,
    tokenPresent: token,
    phoneNumberIdPresent: !!phoneId,
    verifyTokenPresent: verify,
    tableOk,
    inboxCount,
    webhookUrl: 'https://admin.wordsthatsells.website/api/webhooks/whatsapp',
  });
});

router.get('/v1/whatsapp/inbox', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10) || 30, 1), 100);
    const since = req.query.since || null;
    const params = [];
    let sql = `SELECT id, direction, wa_message_id, from_phone, to_phone, contact_name,
                      message_type, body, status, created_at
               FROM whatsapp_messages WHERE direction = 'in'`;
    if (since) {
      params.push(since);
      sql += ` AND created_at > $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    const r = await db.query(sql, params);
    return ok(res, { messages: r.rows });
  } catch (e) {
    console.error('[machine-api] whatsapp inbox', e);
    return fail(res, 'Inbox failed: ' + e.message, 500);
  }
});

router.post('/v1/whatsapp/send', async (req, res) => {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return fail(res, 'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured on Railway', 503);
    }
    const toRaw = String(req.body?.to || '').replace(/[^\d+]/g, '');
    let to = toRaw.replace(/^\+/, '');
    if (!to) return fail(res, 'Body field "to" (phone) required');
    const text = String(req.body?.text || '').trim();
    if (!text) return fail(res, 'Body field "text" required');

    const ver = process.env.WHATSAPP_API_VERSION || 'v21.0';
    const url = `https://graph.facebook.com/${ver}/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body: text.slice(0, 4096) },
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return fail(res, data?.error?.message || `WhatsApp API HTTP ${resp.status}`, 502);
    }

    const waId = data?.messages?.[0]?.id || null;
    await db.query(
      `INSERT INTO whatsapp_messages
        (direction, wa_message_id, from_phone, to_phone, message_type, body, raw, status)
       VALUES ('out', $1, $2, $3, 'text', $4, $5, 'sent')`,
      [waId, phoneId, to, text, JSON.stringify(data)]
    );
    await audit(req, 'whatsapp/send', `to=${to}`);
    return ok(res, { to, wa_message_id: waId, api: data });
  } catch (e) {
    console.error('[machine-api] whatsapp send', e);
    return fail(res, 'Send failed: ' + e.message, 500);
  }
});

// ── Articles (CMS publish for automation) ───────────────────────────

/**
 * GET /v1/articles/:idOrSlug
 * Fetch one article by UUID or slug (any status).
 */
router.get('/v1/articles/:idOrSlug', async (req, res) => {
  try {
    const key = String(req.params.idOrSlug || '').trim().replace(/\.html?$/i, '');
    if (!key) return fail(res, 'id or slug required');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    // Renamed slugs keep resolving via previous_slugs (exact slug wins)
    const result = await db.query(
      isUuid
        ? 'SELECT * FROM articles WHERE id = $1 LIMIT 1'
        : `SELECT * FROM articles WHERE slug = $1 OR $1 = ANY(COALESCE(previous_slugs, '{}'))
           ORDER BY (slug = $1) DESC LIMIT 1`,
      [key]
    );
    if (!result.rows.length) return fail(res, 'Article not found', 404);
    return ok(res, { article: result.rows[0] });
  } catch (e) {
    console.error('[machine-api] GET articles', e);
    return fail(res, 'Failed to load article: ' + e.message, 500);
  }
});

/**
 * POST /v1/articles
 * Create a minimal article row (title required; slug derived or explicit,
 * deduplicated; status defaults to draft). Returns 201 with
 * { success: true, article: { id, slug, status } } — push the full payload
 * with PUT /v1/articles/:id afterwards. The helper script's
 * `create-article` command chains both calls.
 */
router.post('/v1/articles', async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return fail(res, 'title is required');
    const status = String(body.status || 'draft').toLowerCase();
    if (!['draft', 'published', 'archived'].includes(status)) {
      return fail(res, 'status must be draft|published|archived');
    }

    const requested = String(body.slug || title).toLowerCase();
    const slugBase = requested.split(/[^a-z0-9]+/).filter(Boolean).join('-').slice(0, 200) || 'article';

    // Retry on unique-violation: a concurrent create with the same title can
    // land between the dedup check and the insert.
    let result;
    for (let attempt = 1; ; attempt++) {
      let slug = slugBase;
      for (let n = 2; (await db.query(
        `SELECT 1 FROM articles WHERE slug = $1 OR $1 = ANY(COALESCE(previous_slugs, '{}')) LIMIT 1`, [slug]
      )).rows.length; n++) {
        slug = `${slugBase}-${n}`;
      }
      try {
        result = await db.query(
          `INSERT INTO articles (title, slug, status, published_at)
           VALUES ($1, $2, $3::VARCHAR, CASE WHEN $3::VARCHAR = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END)
           RETURNING id, slug, status`,
          [title.slice(0, 500), slug, status]
        );
        break;
      } catch (e) {
        if (e.code === '23505' && attempt < 3) continue;
        throw e;
      }
    }
    await audit(req, 'articles/create', result.rows[0].slug);
    return ok(res, { article: result.rows[0] }, 201);
  } catch (e) {
    console.error('[machine-api] POST articles', e);
    return fail(res, 'Failed to create article: ' + e.message, 500);
  }
});

/**
 * PUT /v1/articles/:idOrSlug
 * Upsert article fields used by the public article SPA + admin form.
 * Optional body.slug renames the public URL slug (must be unique).
 */
router.put('/v1/articles/:idOrSlug', async (req, res) => {
  try {
    const key = String(req.params.idOrSlug || '').trim().replace(/\.html?$/i, '');
    if (!key) return fail(res, 'id or slug required');
    const body = req.body || {};
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

    // Full row: conflict guard + teaser regen need current values, and a
    // renamed slug keeps resolving via previous_slugs (exact slug wins).
    const existing = await db.query(
      isUuid
        ? 'SELECT * FROM articles WHERE id = $1 LIMIT 1'
        : `SELECT * FROM articles WHERE slug = $1 OR $1 = ANY(COALESCE(previous_slugs, '{}'))
           ORDER BY (slug = $1) DESC LIMIT 1`,
      [key]
    );
    if (!existing.rows.length) return fail(res, 'Article not found', 404);
    const row = existing.rows[0];
    const id = row.id;
    let slug = row.slug;

    // Optimistic-concurrency guard: a payload that was written against an
    // older copy of the row must not silently clobber newer admin-UI edits.
    // Clients send base_updated_at = the updated_at they last read; skip the
    // check deliberately with ?force=true (or body.force) to overwrite.
    const force = req.query.force === 'true' || body.force === true;
    if (body.base_updated_at != null && !force) {
      const base = new Date(body.base_updated_at);
      if (Number.isNaN(base.getTime())) return fail(res, 'Invalid base_updated_at timestamp');
      const current = row.updated_at ? new Date(row.updated_at) : null;
      if (current && current.getTime() - base.getTime() > 1000) {
        return res.status(409).json({
          success: false,
          error: 'Article changed since base_updated_at — someone (admin UI?) saved a newer version. GET the article, merge, and retry; or repeat with ?force=true to overwrite.',
          current_updated_at: current.toISOString(),
          base_updated_at: base.toISOString(),
        });
      }
    }

    const str = (v, max) => {
      if (v == null) return undefined;
      const s = String(v);
      return max ? s.slice(0, max) : s;
    };
    const asArray = (v) => {
      if (v == null) return undefined;
      if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
      return String(v).split(',').map((x) => x.trim()).filter(Boolean);
    };
    const asJson = (v, fallback) => {
      if (v === undefined) return undefined;
      if (v === null) return fallback;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (_) { return fallback; }
      }
      return v;
    };

    const fields = [];
    const params = [];
    const add = (col, val, cast) => {
      if (val === undefined) return;
      params.push(val);
      fields.push(`${col} = $${params.length}${cast || ''}`);
    };

    // Optional slug rename (public URL)
    if (body.slug != null && String(body.slug).trim()) {
      const nextSlug = String(body.slug)
        .trim()
        .toLowerCase()
        .replace(/\.html?$/i, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!nextSlug) return fail(res, 'Invalid slug');
      if (nextSlug !== slug) {
        const clash = await db.query(
          'SELECT id FROM articles WHERE slug = $1 AND id <> $2 LIMIT 1',
          [nextSlug, id]
        );
        if (clash.rows.length) return fail(res, `Slug already in use: ${nextSlug}`, 409);
        add('slug', nextSlug);
        // Record the old slug so the public API keeps answering the old URL
        const prior = Array.isArray(row.previous_slugs) ? row.previous_slugs : [];
        add('previous_slugs', [...new Set([...prior, slug])].filter((s) => s && s !== nextSlug));
        slug = nextSlug;
      }
    }

    // The teaser (content) is derived from Content Labels, exactly like the
    // admin form save: whenever a teaser input arrives in this payload,
    // regenerate it from the merged (payload over current row) values so the
    // two write paths can't drift. Empty labels → provided content stands.
    let contentOverride;
    const teaserInputTouched = ['title', 'featured_image', 'author_name', 'time_to_read', 'published_url', 'category']
      .some((k) => body[k] != null) || body.content_labels !== undefined || (body.slug != null && String(body.slug).trim());
    if (teaserInputTouched) {
      contentOverride = buildArticleListingTeaserHtml({
        title: body.title != null ? String(body.title) : row.title,
        featured_image: body.featured_image != null ? String(body.featured_image) : row.featured_image,
        author_name: body.author_name != null ? String(body.author_name) : row.author_name,
        time_to_read: body.time_to_read != null ? (parseInt(body.time_to_read, 10) || null) : row.time_to_read,
        published_url: body.published_url != null ? String(body.published_url) : row.published_url,
        slug,
        category: body.category != null ? String(body.category) : row.category,
        content_labels: body.content_labels !== undefined ? asJson(body.content_labels, {}) : row.content_labels,
      }) || undefined;
    }

    if (body.title != null) add('title', str(body.title, 500));
    if (contentOverride != null) add('content', contentOverride);
    else if (body.content != null) add('content', str(body.content));
    if (body.excerpt != null) add('excerpt', str(body.excerpt, 5000));
    if (body.category != null) add('category', str(body.category, 100) || null);
    if (body.tags != null) {
      const tags = asArray(body.tags) || [];
      const normalized = tags.map((t) => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
      add('tags', normalized);
    }
    if (body.seo_title != null) add('seo_title', str(body.seo_title, 500) || null);
    if (body.seo_description != null) add('seo_description', str(body.seo_description, 2000) || null);
    if (body.seo_keywords != null) add('seo_keywords', asArray(body.seo_keywords) || []);
    if (body.status != null) {
      const st = String(body.status).toLowerCase();
      if (!['draft', 'published', 'archived'].includes(st)) return fail(res, 'status must be draft|published|archived');
      add('status', st);
    }
    if (body.featured_image != null) add('featured_image', str(body.featured_image, 2000) || null);
    if (body.published_url != null) add('published_url', str(body.published_url, 2000) || null);
    if (body.article_code != null) add('article_code', str(body.article_code));
    if (body.featured != null) add('featured', body.featured === true || body.featured === 'true');
    if (body.time_to_read != null) {
      const n = parseInt(body.time_to_read, 10);
      add('time_to_read', Number.isFinite(n) ? n : null);
    }
    if (body.text_article != null) add('text_article', str(body.text_article));
    if (body.author_type != null) add('author_type', str(body.author_type, 50) || 'organization');
    if (body.author_name != null) add('author_name', str(body.author_name, 255) || null);
    if (body.author_job_title != null) add('author_job_title', str(body.author_job_title, 255) || null);
    if (body.author_url != null) add('author_url', str(body.author_url, 2000) || null);

    if (body.og_title != null) add('og_title', str(body.og_title, 500) || null);
    if (body.og_description != null) add('og_description', str(body.og_description, 2000) || null);
    if (body.og_image != null) add('og_image', str(body.og_image, 2000) || null);
    if (body.og_type != null) add('og_type', str(body.og_type, 50) || 'article');
    if (body.twitter_card != null) add('twitter_card', str(body.twitter_card, 50) || 'summary_large_image');
    if (body.twitter_title != null) add('twitter_title', str(body.twitter_title, 500) || null);
    if (body.twitter_description != null) add('twitter_description', str(body.twitter_description, 2000) || null);
    if (body.twitter_image != null) add('twitter_image', str(body.twitter_image, 2000) || null);
    if (body.twitter_site != null) {
      let s = str(body.twitter_site, 100) || '';
      if (s && !s.startsWith('@')) s = '@' + s;
      add('twitter_site', s || null);
    }
    if (body.twitter_creator != null) {
      let s = str(body.twitter_creator, 100) || '';
      if (s && !s.startsWith('@')) s = '@' + s;
      add('twitter_creator', s || null);
    }
    if (body.canonical_url != null) {
      add('canonical_url', str(body.canonical_url, 2000) || `https://wordsthatsells.website/en/articles/${slug}.html`);
    }
    if (body.robots_meta != null) add('robots_meta', str(body.robots_meta, 100) || 'index, follow');

    if (body.article_images !== undefined) {
      add('article_images', JSON.stringify(asJson(body.article_images, [])), '::jsonb');
    }
    if (body.citations !== undefined) {
      add('citations', JSON.stringify(asJson(body.citations, [])), '::jsonb');
    }
    if (body.content_labels !== undefined) {
      add('content_labels', JSON.stringify(asJson(body.content_labels, {})), '::jsonb');
    }
    if (body.schema_markup !== undefined) {
      const sm = asJson(body.schema_markup, null);
      add('schema_markup', sm == null ? null : JSON.stringify(sm), sm == null ? '' : '::jsonb');
    }
    if (body.audio_files !== undefined) {
      add('audio_files', JSON.stringify(asJson(body.audio_files, {})), '::jsonb');
    }
    if (body.published_at != null) {
      const d = new Date(body.published_at);
      if (!Number.isNaN(d.getTime())) add('published_at', d.toISOString());
    }
    if (body.updated_at != null) {
      const d = new Date(body.updated_at);
      if (!Number.isNaN(d.getTime())) add('updated_at', d.toISOString());
    } else {
      add('updated_at', new Date().toISOString());
    }

    // Word count from text_article or content when either is set
    const textSrc = body.text_article != null ? body.text_article : body.content;
    if (textSrc != null) {
      const raw = String(textSrc).replace(/<[^>]*>/g, ' ');
      const wc = raw.split(/\s+/).filter((w) => w.length > 0).length || null;
      add('word_count', wc);
    }

    // Auto-set published_at when publishing first time
    if (body.status === 'published' && body.published_at == null) {
      fields.push(`published_at = COALESCE(published_at, CURRENT_TIMESTAMP)`);
    }

    if (!fields.length) return fail(res, 'No fields to update');

    params.push(id);
    const sql = `UPDATE articles SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id, slug, title, status, updated_at, published_at, author_type, author_name, word_count, time_to_read`;
    const result = await db.query(sql, params);
    await audit(req, 'articles/update', `${slug} status=${result.rows[0]?.status}`);
    return ok(res, { article: result.rows[0] });
  } catch (e) {
    console.error('[machine-api] PUT articles', e);
    return fail(res, 'Failed to update article: ' + e.message, 500);
  }
});

// ── 404 for unknown v1 routes ───────────────────────────────────────

router.use('/v1', (req, res) => {
  fail(res, `Unknown machine API route: ${req.method} ${req.path}`, 404);
});

module.exports = router;
