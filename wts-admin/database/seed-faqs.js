#!/usr/bin/env node
/**
 * Seed: Import the FAQ platform's initial content from faq_seed_data.json
 * (categories, Q&As, page placements, harvested fr/th translations).
 *
 * Runs two ways:
 *   - Automatically at server boot via seedFaqsIfEmpty() (server.js): a
 *     fresh deploy comes up with the full FAQ set with no manual step,
 *     mirroring the product catalog's seedCatalogIfSparse(). Never runs
 *     once any FAQ exists, so it can't fight admin edits or deliberate
 *     deletions; failures must not block startup.
 *   - Manually: node wts-admin/database/seed-faqs.js
 *     (or: railway run node database/seed-faqs.js) — always runs the
 *     idempotent upsert pass, converging a partially seeded database.
 *
 * Insert-if-absent only — re-running never overwrites admin edits. All
 * inserts are ON CONFLICT DO NOTHING, so concurrent boots (e.g. parallel
 * test servers) converge instead of racing. The JSON's placement pool
 * value 'all' expands to every published seed FAQ not already pinned on
 * that page.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Identical to translation-core.sourceHash: sha256 over the canonical
// (key-sorted) JSON of the English source fields. Seeded translations must
// carry the same hash the sync sweep computes, or the sweep would flip
// them straight back to pending as "stale".
function sourceHash(sourceFields) {
    const canonical = JSON.stringify(
        Object.keys(sourceFields).sort().reduce((acc, k) => {
            acc[k] = sourceFields[k];
            return acc;
        }, {})
    );
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

const seedDataPath = path.join(__dirname, 'faq_seed_data.json');

// Slug-keyed upsert that returns the row id whether it inserted or lost a
// race to a concurrent seeder (ON CONFLICT ... RETURNING yields no row on
// conflict, so fall back to a SELECT).
async function upsertBySlug(queryable, insertSql, params, table, slug) {
    const inserted = await queryable.query(insertSql, params);
    if (inserted.rows.length > 0) return { id: inserted.rows[0].id, created: true };
    const existing = await queryable.query(`SELECT id FROM ${table} WHERE slug = $1`, [slug]);
    return { id: existing.rows[0].id, created: false };
}

// Core pass. `queryable` is anything with .query() — the app's db module
// at boot, or a dedicated client from the CLI wrapper.
async function runSeed(queryable) {
    const seed = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));
    const stats = { categories: 0, faqs: 0, placements: 0, translations: 0, skipped: 0 };

    const categoryIds = {};
    for (const [i, cat] of seed.categories.entries()) {
        const { id, created } = await upsertBySlug(queryable,
            `INSERT INTO faq_categories (slug, name, description, sort_order)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug) DO NOTHING RETURNING id`,
            [cat.slug, cat.name, cat.description || null, (i + 1) * 10],
            'faq_categories', cat.slug);
        categoryIds[cat.slug] = id;
        stats[created ? 'categories' : 'skipped']++;
    }

    const faqIds = {};
    for (const faq of seed.faqs) {
        const { id, created } = await upsertBySlug(queryable,
            `INSERT INTO faqs (slug, question, answer_html, category_id, status, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (slug) DO NOTHING RETURNING id`,
            [faq.slug, faq.question, faq.answer_html,
             categoryIds[faq.category] || null, faq.status || 'draft', faq.sort_order || 0],
            'faqs', faq.slug);
        faqIds[faq.slug] = id;
        stats[created ? 'faqs' : 'skipped']++;
    }

    const publishedSlugs = seed.faqs.filter((f) => (f.status || 'draft') === 'published').map((f) => f.slug);

    for (const [pagePath, spec] of Object.entries(seed.placements)) {
        const pinned = spec.pinned || [];
        const poolSlugs = spec.pool === 'all'
            ? publishedSlugs.filter((s) => !pinned.includes(s))
            : (spec.pool || []);

        for (const [i, slug] of pinned.entries()) {
            if (!faqIds[slug]) { console.warn(`  Unknown pinned slug "${slug}" on ${pagePath}`); continue; }
            const r = await queryable.query(
                `INSERT INTO faq_placements (page_path, faq_id, pinned, sort_order)
                 VALUES ($1, $2, TRUE, $3)
                 ON CONFLICT (page_path, faq_id) DO NOTHING`,
                [pagePath, faqIds[slug], (i + 1) * 10]
            );
            stats.placements += r.rowCount;
        }
        for (const slug of poolSlugs) {
            if (!faqIds[slug]) { console.warn(`  Unknown pool slug "${slug}" on ${pagePath}`); continue; }
            const r = await queryable.query(
                `INSERT INTO faq_placements (page_path, faq_id, pinned, sort_order)
                 VALUES ($1, $2, FALSE, 0)
                 ON CONFLICT (page_path, faq_id) DO NOTHING`,
                [pagePath, faqIds[slug]]
            );
            stats.placements += r.rowCount;
        }
    }

    // Published translations harvested from the static mirrors (the fr/th
    // FAQ content that already shipped on the site). Insert-if-absent:
    // ON CONFLICT keeps any row the platform already owns.
    for (const [slug, langs] of Object.entries(seed.translations || {})) {
        if (!faqIds[slug]) { console.warn(`  Unknown translation slug "${slug}"`); continue; }
        const en = seed.faqs.find((f) => f.slug === slug);
        const hash = sourceHash({ question: en.question, answer_html: en.answer_html });
        for (const [lang, payload] of Object.entries(langs)) {
            const r = await queryable.query(
                `INSERT INTO translations (entity_type, entity_id, target_language, content_payload,
                                           source_hash, status, word_count, published_at)
                 VALUES ('faq', $1, $2, $3, $4, 'published', $5, CURRENT_TIMESTAMP)
                 ON CONFLICT (entity_type, entity_id, target_language) DO NOTHING`,
                [faqIds[slug], lang, JSON.stringify(payload), hash,
                 `${en.question} ${en.answer_html}`
                     .replace(/<[^>]*>/g, ' ')
                     .split(/\s+/)
                     .filter(Boolean).length]
            );
            stats.translations += r.rowCount;
        }
    }

    return stats;
}

// Boot hook: seed only when the FAQ table is empty, so a fresh deploy
// self-populates but admin edits (including deliberate deletions) are
// never fought. Callers must treat failures as non-fatal.
async function seedFaqsIfEmpty() {
    const db = require('./db');
    const count = await db.query('SELECT COUNT(*)::int AS n FROM faqs');
    if (count.rows[0].n > 0) return null;
    const stats = await runSeed(db);
    console.log(`FAQ seed: categories ${stats.categories}, faqs ${stats.faqs}, placements ${stats.placements}, translations ${stats.translations}`);
    return stats;
}

module.exports = { runSeed, seedFaqsIfEmpty };

// CLI mode: standalone pool, full idempotent pass (no empty-table gate) so
// it also converges a partially seeded database.
if (require.main === module) {
    const { Pool } = require('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/wts_admin',
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });
    (async () => {
        const client = await pool.connect();
        try {
            const stats = await runSeed(client);
            console.log(`Done! Categories: ${stats.categories}, FAQs: ${stats.faqs}, placements: ${stats.placements}, translations: ${stats.translations}, skipped existing: ${stats.skipped}`);
        } finally {
            client.release();
            await pool.end();
        }
    })().catch(err => {
        console.error('Seed failed:', err);
        process.exit(1);
    });
}
