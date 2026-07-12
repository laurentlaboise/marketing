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
 * POST /v1/images/seo-upsert
 * Body: { filename?|cdn_url?|id?, alt_text?, title?, description?, width?, height? }
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
      width,
      height,
      new_filename,
      new_cdn_url,
      also_match,
    } = req.body || {};

    if (!id && !filename && !cdn_url && !also_match) {
      return fail(res, 'id, filename, cdn_url, or also_match is required');
    }

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
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'seo',ARRAY[]::text[],$11,'active')
           RETURNING id, filename, cdn_url`,
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
       RETURNING id, filename, cdn_url, alt_text, title`,
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
    });
  } catch (e) {
    console.error('[machine-api] images seo-upsert', e);
    return fail(res, 'Image SEO upsert failed: ' + e.message, 500);
  }
});

/**
 * POST /v1/images/seo-bulk
 * Body: { items: [{ filename|cdn_url, alt_text?, title?, description? }] }
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
        await db.query(
          `UPDATE images SET
             alt_text = COALESCE(NULLIF($1, ''), alt_text),
             title = COALESCE(NULLIF($2, ''), title),
             description = COALESCE(NULLIF($3, ''), description),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [it.alt_text || '', it.title || '', it.description || '', row.rows[0].id]
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

// ── 404 for unknown v1 routes ───────────────────────────────────────

router.use('/v1', (req, res) => {
  fail(res, `Unknown machine API route: ${req.method} ${req.path}`, 404);
});

module.exports = router;
