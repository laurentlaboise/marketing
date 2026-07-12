/**
 * Seed / upsert top AI tools into ai_tools.
 * Data: database/seed/top-100-ai-tools.json
 */
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '../../database/seed/top-100-ai-tools.json');

function loadSeed() {
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const tools = Array.isArray(raw) ? raw : raw.tools || [];
  if (!tools.length) throw new Error('AI tools seed file is empty');
  return tools;
}

/**
 * @param {import('../db')|any} db - object with query(text, params)
 * @param {{ replace?: boolean }} [opts]
 */
async function seedAiTools(db, opts = {}) {
  const tools = loadSeed();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Ensure optional columns for provenance + mobile stores
  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_tools' AND column_name = 'source'
      ) THEN
        ALTER TABLE ai_tools ADD COLUMN source VARCHAR(120);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_tools' AND column_name = 'app_store_url'
      ) THEN
        ALTER TABLE ai_tools ADD COLUMN app_store_url TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_tools' AND column_name = 'play_store_url'
      ) THEN
        ALTER TABLE ai_tools ADD COLUMN play_store_url TEXT;
      END IF;
    END $$;
  `);

  if (opts.replace) {
    await db.query(
      `DELETE FROM ai_tools WHERE source = $1`,
      ['wts-top100-curated-ai-directories-2026']
    );
  }

  for (const t of tools) {
    const name = String(t.name || '').trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const features = Array.isArray(t.features) ? t.features : [];
    const pros = Array.isArray(t.pros) ? t.pros : [];
    const cons = Array.isArray(t.cons) ? t.cons : [];
    const source = t.source || 'wts-top100-curated-ai-directories-2026';

    const existing = await db.query(
      'SELECT id FROM ai_tools WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [name]
    );

    const appStore = t.app_store_url || t.app_store_link || null;
    const playStore = t.play_store_url || t.play_store_link || null;

    if (existing.rows.length) {
      await db.query(
        `UPDATE ai_tools SET
          description = $1,
          category = $2,
          website_url = $3,
          pricing_model = $4,
          features = $5,
          pros = $6,
          cons = $7,
          rating = $8,
          logo_url = $9,
          status = $10,
          source = $11,
          app_store_url = $12,
          play_store_url = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $14`,
        [
          t.description || null,
          t.category || null,
          t.website_url || null,
          t.pricing_model || null,
          features,
          pros,
          cons,
          t.rating != null ? t.rating : null,
          t.logo_url || null,
          t.status || 'active',
          source,
          appStore,
          playStore,
          existing.rows[0].id
        ]
      );
      updated += 1;
    } else {
      await db.query(
        `INSERT INTO ai_tools
          (name, description, category, website_url, pricing_model, features, pros, cons, rating, logo_url, status, source, app_store_url, play_store_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          name,
          t.description || null,
          t.category || null,
          t.website_url || null,
          t.pricing_model || null,
          features,
          pros,
          cons,
          t.rating != null ? t.rating : null,
          t.logo_url || null,
          t.status || 'active',
          source,
          appStore,
          playStore
        ]
      );
      inserted += 1;
    }
  }

  const countRes = await db.query(`SELECT COUNT(*)::int AS n FROM ai_tools WHERE status = 'active'`);
  return {
    seedCount: tools.length,
    inserted,
    updated,
    skipped,
    activeTotal: countRes.rows[0].n
  };
}

module.exports = { seedAiTools, loadSeed, SEED_PATH };
