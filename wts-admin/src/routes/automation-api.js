/**
 * WTS Automation API v1
 * Drop-in router for the Railway CMS (Express + PostgreSQL)
 *
 * Mounted in server.js:
 *   app.use('/api/v1', require('./src/routes/automation-api'));
 *
 * Required env vars (Railway → Variables):
 *   AUTOMATION_API_KEY   long random secret (generate: openssl rand -hex 32)
 *   UPLOAD_DIR           /data/uploads   (Railway Volume mount path)
 *   PUBLIC_BASE_URL      https://wordsthatsells.website
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../../database/db');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://wordsthatsells.website';
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
  // No volume mounted (local dev without /data). The images endpoint
  // retries the mkdir per request; article endpoints don't need the dir.
  console.warn('[automation-api] UPLOAD_DIR not creatable at boot:', e.message);
}

// ─── 1. AUTH MIDDLEWARE ──────────────────────────────────────────
// Make.com / n8n / Zapier send header:  x-api-key: <AUTOMATION_API_KEY>
router.use((req, res, next) => {
  const provided = req.headers['x-api-key'] || '';
  const expected = process.env.AUTOMATION_API_KEY || '';
  if (!expected) return res.status(500).json({ error: 'AUTOMATION_API_KEY not configured' });

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) return res.status(401).json({ error: 'Invalid API key' });
  next();
});

// server.js skips its global 1 MB JSON parser for /api/v1 so this cap governs.
router.use(express.json({ limit: '25mb' })); // allows base64 image payloads

// ─── 2. HELPERS ──────────────────────────────────────────────────
const slugify = (s) =>
  s.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 96);

async function uniqueSlug(base) {
  let slug = base, i = 2;
  while ((await db.query('SELECT 1 FROM articles WHERE slug = $1', [slug])).rowCount > 0) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

const articleUrl = (slug) => `${PUBLIC_BASE_URL}/en/articles/${slug}.html`;

// ─── 3. HEALTH CHECK ─────────────────────────────────────────────
// GET /api/v1/ping — use as connection test in Make.com
router.get('/ping', (req, res) => res.json({ ok: true, service: 'wts-automation-api', ts: new Date().toISOString() }));

// ─── 4. ARTICLES ─────────────────────────────────────────────────
// ⚠ COLUMN MAPPING (matched to the `articles` schema in database/db.js):
//   API `content`          → articles.text_article   full article body —
//                            articles.content holds the auto-generated
//                            listing teaser in this CMS, not the body
//   API `meta_description` → articles.seo_description
//   API `featured_image`   → articles.featured_image
//   API `status`           → articles.status         'draft' | 'published'
//   API `language`         → accepted but NOT stored: articles has no
//                            language column; localization lives in the
//                            separate `translations` table
const COLUMN_FOR = {
  title: 'title',
  content: 'text_article',
  meta_description: 'seo_description',
  featured_image: 'featured_image',
  status: 'status',
};

// POST /api/v1/articles  → create (default: draft)
router.post('/articles', async (req, res) => {
  try {
    const {
      title,
      content,                       // HTML or markdown, whatever your renderer expects
      meta_description = null,
      featured_image = null,         // URL string (use /images endpoint first if uploading)
      status = 'draft',              // 'draft' | 'published'
      slug: slugInput
    } = req.body;

    if (!title || !content) return res.status(422).json({ error: 'title and content are required' });
    if (!['draft', 'published'].includes(status)) return res.status(422).json({ error: 'status must be draft or published' });

    const slug = await uniqueSlug(slugInput ? slugify(slugInput) : slugify(title));
    const publishedAt = status === 'published' ? new Date() : null;

    const { rows } = await db.query(
      `INSERT INTO articles (title, slug, text_article, seo_description, featured_image, status, canonical_url, created_at, updated_at, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW(),$8)
       RETURNING id, slug, status`,
      [title, slug, content, meta_description, featured_image, status, articleUrl(slug), publishedAt]
    );

    res.status(201).json({
      ...rows[0],
      url: articleUrl(rows[0].slug)
    });
  } catch (err) {
    console.error('[API] create article failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/articles/:id  → update any subset of fields (incl. publish)
router.patch('/articles/:id', async (req, res) => {
  try {
    // ⚠ COLUMN MAPPING: request keys translate through COLUMN_FOR above.
    const sets = [], vals = [];
    let i = 1;

    for (const [key, column] of Object.entries(COLUMN_FOR)) {
      if (req.body[key] !== undefined) {
        sets.push(`${column} = $${i++}`);
        vals.push(req.body[key]);
      }
    }
    if (req.body.status === 'published') sets.push(`published_at = COALESCE(published_at, NOW())`);
    if (sets.length === 0) return res.status(422).json({ error: 'No updatable fields provided' });

    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);

    const { rows, rowCount } = await db.query(
      `UPDATE articles SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, slug, status`,
      vals
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Article not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Article not found' }); // id is a UUID
    console.error('[API] update article failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/articles?status=draft&limit=20  → list (for Make.com lookups/routers)
// (no language filter — articles has no language column)
router.get('/articles', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const conds = [], vals = [];
    let i = 1;
    if (status) { conds.push(`status = $${i++}`); vals.push(status); }
    vals.push(Math.min(parseInt(limit) || 20, 100), parseInt(offset) || 0);

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT id, title, slug, status, created_at, published_at
       FROM articles ${where}
       ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      vals
    );
    res.json({ count: rows.length, articles: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/articles/:id
router.delete('/articles/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM articles WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Article not found' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Article not found' }); // id is a UUID
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. IMAGES ───────────────────────────────────────────────────
// POST /api/v1/images
// Accepts EITHER:
//   { "source_url": "https://...generated-image.png", "filename": "optional-name" }
//   { "base64": "<data>", "filename": "name.png" }
// Server fetches/stores the file on the Railway Volume, returns a public URL
// you feed straight into the article's featured_image or content body.
router.post('/images', async (req, res) => {
  try {
    const { source_url, base64, filename } = req.body;
    if (!source_url && !base64) return res.status(422).json({ error: 'Provide source_url or base64' });

    let buffer, ext = 'png';

    if (source_url) {
      const resp = await fetch(source_url);
      if (!resp.ok) return res.status(422).json({ error: `Could not fetch source_url (${resp.status})` });
      const ct = resp.headers.get('content-type') || '';
      ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'png';
      buffer = Buffer.from(await resp.arrayBuffer());
    } else {
      const clean = base64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(clean, 'base64');
      if (filename && filename.includes('.')) ext = filename.split('.').pop().toLowerCase();
    }

    if (buffer.length > 15 * 1024 * 1024) return res.status(422).json({ error: 'Image exceeds 15MB' });

    const safeName = filename
      ? slugify(filename.replace(/\.\w+$/, ''))
      : crypto.randomBytes(8).toString('hex');
    const finalName = `${Date.now()}-${safeName}.${ext}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, finalName), buffer);

    res.status(201).json({
      url: `${PUBLIC_BASE_URL}/uploads/${finalName}`,
      filename: finalName,
      bytes: buffer.length
    });
  } catch (err) {
    console.error('[API] image upload failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
