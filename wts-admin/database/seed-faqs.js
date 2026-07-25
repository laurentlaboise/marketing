#!/usr/bin/env node
/**
 * Seed Script: Import the FAQ platform's initial content from
 * faq_seed_data.json (categories, Q&As, page placements).
 *
 * Usage: node wts-admin/database/seed-faqs.js
 *        (or: railway run node database/seed-faqs.js)
 *
 * Insert-if-absent only — re-running never overwrites admin edits:
 *   - categories and FAQs are matched by slug and skipped when present;
 *   - placements use ON CONFLICT (page_path, faq_id) DO NOTHING.
 * The JSON's placement pool value 'all' expands to every published seed
 * FAQ not already pinned on that page.
 *
 * The schema itself is created by the app's db.initialize() at boot —
 * run the server (or setup-db) once before seeding a fresh database.
 */
const { Pool } = require('pg');
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
const seed = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));

// Database connection - reuse the same env pattern as the app
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/wts_admin',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function seedFaqs() {
    const client = await pool.connect();
    try {
        const stats = { categories: 0, faqs: 0, placements: 0, skipped: 0 };

        console.log(`Seeding ${seed.categories.length} categories...`);
        const categoryIds = {};
        for (const [i, cat] of seed.categories.entries()) {
            const existing = await client.query('SELECT id FROM faq_categories WHERE slug = $1', [cat.slug]);
            if (existing.rows.length > 0) {
                categoryIds[cat.slug] = existing.rows[0].id;
                stats.skipped++;
                continue;
            }
            const inserted = await client.query(
                `INSERT INTO faq_categories (slug, name, description, sort_order)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [cat.slug, cat.name, cat.description || null, (i + 1) * 10]
            );
            categoryIds[cat.slug] = inserted.rows[0].id;
            stats.categories++;
        }

        console.log(`Seeding ${seed.faqs.length} FAQs...`);
        const faqIds = {};
        for (const faq of seed.faqs) {
            const existing = await client.query('SELECT id FROM faqs WHERE slug = $1', [faq.slug]);
            if (existing.rows.length > 0) {
                faqIds[faq.slug] = existing.rows[0].id;
                stats.skipped++;
                continue;
            }
            const inserted = await client.query(
                `INSERT INTO faqs (slug, question, answer_html, category_id, status, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [faq.slug, faq.question, faq.answer_html,
                 categoryIds[faq.category] || null, faq.status || 'draft', faq.sort_order || 0]
            );
            faqIds[faq.slug] = inserted.rows[0].id;
            stats.faqs++;
        }

        const publishedSlugs = seed.faqs.filter((f) => (f.status || 'draft') === 'published').map((f) => f.slug);

        console.log(`Seeding placements for ${Object.keys(seed.placements).length} pages...`);
        for (const [pagePath, spec] of Object.entries(seed.placements)) {
            const pinned = spec.pinned || [];
            const pool_ = spec.pool === 'all'
                ? publishedSlugs.filter((s) => !pinned.includes(s))
                : (spec.pool || []);

            for (const [i, slug] of pinned.entries()) {
                if (!faqIds[slug]) { console.warn(`  Unknown pinned slug "${slug}" on ${pagePath}`); continue; }
                const r = await client.query(
                    `INSERT INTO faq_placements (page_path, faq_id, pinned, sort_order)
                     VALUES ($1, $2, TRUE, $3)
                     ON CONFLICT (page_path, faq_id) DO NOTHING`,
                    [pagePath, faqIds[slug], (i + 1) * 10]
                );
                stats.placements += r.rowCount;
            }
            for (const slug of pool_) {
                if (!faqIds[slug]) { console.warn(`  Unknown pool slug "${slug}" on ${pagePath}`); continue; }
                const r = await client.query(
                    `INSERT INTO faq_placements (page_path, faq_id, pinned, sort_order)
                     VALUES ($1, $2, FALSE, 0)
                     ON CONFLICT (page_path, faq_id) DO NOTHING`,
                    [pagePath, faqIds[slug]]
                );
                stats.placements += r.rowCount;
            }
        }

        // Published translations harvested from the static mirrors (the
        // fr/th FAQ content that already shipped on the site). Insert-if-
        // absent: ON CONFLICT keeps any row the platform already owns.
        const translationEntries = Object.entries(seed.translations || {});
        console.log(`Seeding translations for ${translationEntries.length} FAQs...`);
        for (const [slug, langs] of translationEntries) {
            if (!faqIds[slug]) { console.warn(`  Unknown translation slug "${slug}"`); continue; }
            const en = seed.faqs.find((f) => f.slug === slug);
            const hash = sourceHash({ question: en.question, answer_html: en.answer_html });
            for (const [lang, payload] of Object.entries(langs)) {
                const r = await client.query(
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
                stats.translations = (stats.translations || 0) + r.rowCount;
            }
        }

        console.log(`Done! Categories: ${stats.categories}, FAQs: ${stats.faqs}, placements: ${stats.placements}, translations: ${stats.translations || 0}, skipped existing: ${stats.skipped}`);
    } finally {
        client.release();
        await pool.end();
    }
}

seedFaqs().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
