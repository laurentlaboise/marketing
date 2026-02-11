/**
 * Seed Script: Import glossary terms from JSON into the database.
 *
 * Usage: node wts-admin/database/seed-glossary.js
 *
 * This script reads glossary_seed_data.json and inserts all terms
 * into the glossary table. It uses ON CONFLICT to skip duplicates.
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load seed data
const seedDataPath = path.join(__dirname, 'glossary_seed_data.json');
const seedTerms = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));

// Database connection - reuse the same env pattern as the app
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/wts_admin',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function seedGlossary() {
    const client = await pool.connect();
    try {
        console.log(`Seeding ${seedTerms.length} glossary terms...`);
        let inserted = 0;
        let skipped = 0;

        for (const term of seedTerms) {
            try {
                // Check if term already exists
                const existing = await client.query(
                    'SELECT id FROM glossary WHERE LOWER(term) = LOWER($1)',
                    [term.term]
                );

                if (existing.rows.length > 0) {
                    skipped++;
                    continue;
                }

                await client.query(
                    `INSERT INTO glossary (term, definition, category, related_terms, letter, slug, video_url, featured_image, article_link, bullets, example, categories)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        term.term,
                        term.definition,
                        term.category,
                        term.related_terms || [],
                        term.letter,
                        term.slug,
                        term.video_url || null,
                        term.featured_image || null,
                        term.article_link || null,
                        JSON.stringify(term.bullets || []),
                        term.example || null,
                        term.categories || []
                    ]
                );
                inserted++;
            } catch (err) {
                console.error(`  Error inserting "${term.term}":`, err.message);
            }
        }

        console.log(`Done! Inserted: ${inserted}, Skipped (already exist): ${skipped}`);
    } finally {
        client.release();
        await pool.end();
    }
}

seedGlossary().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
