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
const net = require('net');
const dns = require('dns').promises;
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
// Every consumer (Make.com, n8n, a partner site's CRM hookup, …) sends:
//   x-api-key: <key>
// Two kinds of key are accepted:
//   1. The master key from the AUTOMATION_API_KEY env var — full access,
//      and the only key allowed to manage other keys (/api/v1/keys).
//   2. Issued keys ('wts_…') minted via POST /api/v1/keys, stored as
//      salted PBKDF2 digests with per-entity scopes, revocable any time.
const { KEY_PREFIX_LEN, hashApiKey, mintKey } = require('../lib/api-keys');

// The PBKDF2 cost is paid once per key per process: verified plaintexts
// cache to their row id, and every request still re-reads the row so
// revocation/expiry take effect immediately.
const VERIFIED_KEY_IDS = new Map(); // plaintext → api_keys.id

async function verifyIssuedKey(provided) {
  let id = VERIFIED_KEY_IDS.get(provided);
  if (!id) {
    const { rows } = await db.query(
      'SELECT id, key_hash, key_salt FROM api_keys WHERE key_prefix = $1',
      [provided.slice(0, KEY_PREFIX_LEN)]
    );
    for (const row of rows) {
      const digest = Buffer.from(hashApiKey(provided, row.key_salt));
      const stored = Buffer.from(row.key_hash);
      if (digest.length === stored.length && crypto.timingSafeEqual(digest, stored)) {
        id = row.id;
        break;
      }
    }
    if (!id) return null;
    if (VERIFIED_KEY_IDS.size > 500) VERIFIED_KEY_IDS.clear();
    VERIFIED_KEY_IDS.set(provided, id);
  }
  const { rows } = await db.query(
    'SELECT id, name, scopes, status, expires_at FROM api_keys WHERE id = $1',
    [id]
  );
  const key = rows[0];
  if (!key || key.status !== 'active') return null;
  if (key.expires_at && new Date(key.expires_at) <= new Date()) return null;
  return key;
}

router.use(async (req, res, next) => {
  const provided = String(req.headers['x-api-key'] || '');
  const master = process.env.AUTOMATION_API_KEY || '';
  if (!provided) return res.status(401).json({ error: 'Missing x-api-key header' });

  if (master) {
    const a = Buffer.from(provided);
    const b = Buffer.from(master);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      req.apiKey = { master: true, name: 'master', scopes: ['*'] };
      return next();
    }
  }

  if (provided.startsWith('wts_')) {
    try {
      const key = await verifyIssuedKey(provided);
      if (key) {
        req.apiKey = { master: false, id: key.id, name: key.name, scopes: key.scopes || [] };
        // Best-effort usage stamp; never blocks or fails the request.
        db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]).catch(() => {});
        return next();
      }
    } catch (e) {
      console.error('[automation-api] key lookup failed:', e.message);
    }
  }

  return res.status(401).json({ error: 'Invalid API key' });
});

// server.js skips its global 1 MB JSON parser for /api/v1 so this cap governs.
router.use(express.json({ limit: '25mb' })); // allows base64 image payloads

// ─── 1b. SCOPE ENFORCEMENT ───────────────────────────────────────
// Scope grammar (per api_keys.scopes entry):
//   '*'              everything the API can do
//   '*:read'         read everything, write nothing
//   '<entity>'       read + write one entity ('articles', 'images', 'leads', …)
//   '<entity>:read'  read one entity
// /ping and /entities are open to any valid key; /keys is master-only.
const hasScope = (scopes, entity, write) =>
  scopes.includes('*') ||
  scopes.includes(entity) ||
  (!write && (scopes.includes('*:read') || scopes.includes(`${entity}:read`)));

router.use((req, res, next) => {
  const seg = (req.path.split('/')[1] || '').toLowerCase();
  if (seg === 'ping' || seg === 'entities') return next();
  if (seg === 'keys') {
    if (!req.apiKey.master) {
      return res.status(403).json({ error: 'Key management requires the master AUTOMATION_API_KEY' });
    }
    return next();
  }
  const write = req.method !== 'GET';
  if (!hasScope(req.apiKey.scopes, seg, write)) {
    return res.status(403).json({
      error: `API key '${req.apiKey.name}' does not allow ${write ? 'write' : 'read'} access to '${seg}'`
    });
  }
  next();
});

// ─── 2. HELPERS ──────────────────────────────────────────────────
const slugify = (s) =>
  s.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 96);

// Table names only ever come from this file's registries — never user input.
async function uniqueSlugIn(table, base) {
  let slug = base || 'item', i = 2;
  while ((await db.query(`SELECT 1 FROM ${table} WHERE slug = $1`, [slug])).rowCount > 0) {
    slug = `${base}-${i++}`;
  }
  return slug;
}
const uniqueSlug = (base) => uniqueSlugIn('articles', base);

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

// SSRF guard: source_url comes from API consumers, and the fetch runs from
// inside the Railway network — so only public http(s) origins are allowed.
// Redirects are followed manually so every hop is re-validated.
const isPrivateIp = (ip) => {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7)); // v4-mapped
    return false;
  }
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some(Number.isNaN)) return true; // fail closed
  return o[0] === 0 || o[0] === 10 || o[0] === 127 ||
    (o[0] === 100 && o[1] >= 64 && o[1] <= 127) ||  // CGNAT
    (o[0] === 169 && o[1] === 254) ||               // link-local / cloud metadata
    (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
    (o[0] === 192 && o[1] === 168);
};

const badUrl = (message) => Object.assign(new Error(message), { status: 422 });

async function fetchPublicUrl(rawUrl) {
  let current = String(rawUrl);
  for (let hop = 0; hop < 3; hop++) {
    let url;
    try { url = new URL(current); } catch { throw badUrl('source_url is not a valid URL'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badUrl('source_url must be http(s)');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addrs;
    try {
      addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
    } catch {
      throw badUrl('source_url host could not be resolved');
    }
    if (!addrs.length || addrs.some(isPrivateIp)) {
      throw badUrl('source_url resolves to a private or internal address');
    }
    const resp = await fetch(url.href, { redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get('location');
      if (!location) throw badUrl('source_url redirect had no location');
      current = new URL(location, url).href;
      continue;
    }
    return resp;
  }
  throw badUrl('source_url had too many redirects');
}

// Extension whitelist: values only ever come out of this constant map, so
// a crafted filename ("x.png/../../etc") can never reach the fs path.
const SAFE_EXT = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif', avif: 'avif', svg: 'svg' };

router.post('/images', async (req, res) => {
  try {
    const { source_url, base64, filename } = req.body;
    if (!source_url && !base64) return res.status(422).json({ error: 'Provide source_url or base64' });

    let buffer, ext = 'png';

    if (source_url) {
      const resp = await fetchPublicUrl(source_url);
      if (!resp.ok) return res.status(422).json({ error: `Could not fetch source_url (${resp.status})` });
      const ct = resp.headers.get('content-type') || '';
      ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'png';
      buffer = Buffer.from(await resp.arrayBuffer());
    } else {
      const clean = base64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(clean, 'base64');
      if (filename && filename.includes('.')) {
        ext = SAFE_EXT[filename.split('.').pop().toLowerCase()] || 'png';
      }
    }

    if (buffer.length > 15 * 1024 * 1024) return res.status(422).json({ error: 'Image exceeds 15MB' });

    const safeName = filename
      ? slugify(filename.replace(/\.\w+$/, ''))
      : crypto.randomBytes(8).toString('hex');
    const finalName = `${Date.now()}-${safeName}.${ext}`;
    // Containment check on the resolved path: slugify + the extension
    // whitelist already forbid separators, this guarantees it.
    const dest = path.resolve(UPLOAD_DIR, finalName);
    if (!dest.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      return res.status(422).json({ error: 'Invalid filename' });
    }
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(dest, buffer);

    res.status(201).json({
      url: `${PUBLIC_BASE_URL}/uploads/${finalName}`,
      filename: finalName,
      bytes: buffer.length
    });
  } catch (err) {
    if (err.status === 422) return res.status(422).json({ error: err.message });
    console.error('[API] image upload failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. API KEY MANAGEMENT (master key only — gated in 1b) ───────
// Mint a key per integration/partner, hand out the plaintext once, and
// revoke it independently of every other consumer.

const validScopes = () => {
  const names = ['articles', 'images', ...Object.keys(ENTITIES)];
  return new Set(['*', '*:read', ...names, ...names.map(n => `${n}:read`)]);
};

// POST /api/v1/keys  { "name": "partner-site CRM", "scopes": ["leads"], "expires_at": null }
router.post('/keys', async (req, res) => {
  try {
    const { name, scopes = ['*'], expires_at = null } = req.body;
    if (!name || !String(name).trim()) return res.status(422).json({ error: 'name is required' });
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return res.status(422).json({ error: 'scopes must be a non-empty array' });
    }
    const valid = validScopes();
    const bad = scopes.filter(s => !valid.has(s));
    if (bad.length) {
      return res.status(422).json({ error: `Unknown scopes: ${bad.join(', ')}`, valid_scopes: [...valid] });
    }
    if (expires_at && isNaN(Date.parse(expires_at))) {
      return res.status(422).json({ error: 'expires_at must be an ISO date or null' });
    }

    const { key, plaintext } = await mintKey({ name, scopes, expiresAt: expires_at });
    res.status(201).json({
      ...key,
      key: plaintext,
      warning: 'Store this key now — it is shown only once and cannot be recovered.'
    });
  } catch (err) {
    console.error('[API] create key failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/keys — list (never returns secrets, only the display prefix)
router.get('/keys', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, key_prefix, scopes, status, expires_at, last_used_at, created_at
       FROM api_keys ORDER BY created_at DESC`
    );
    res.json({ count: rows.length, keys: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/keys/:id — rename, rescope, expire, or revoke/reactivate
router.patch('/keys/:id', async (req, res) => {
  try {
    const sets = [], vals = [];
    let i = 1;
    if (req.body.name !== undefined) { sets.push(`name = $${i++}`); vals.push(String(req.body.name).trim()); }
    if (req.body.scopes !== undefined) {
      const valid = validScopes();
      const bad = (Array.isArray(req.body.scopes) ? req.body.scopes : [null]).filter(s => !valid.has(s));
      if (bad.length) return res.status(422).json({ error: `Unknown scopes: ${bad.join(', ')}`, valid_scopes: [...valid] });
      sets.push(`scopes = $${i++}`); vals.push(req.body.scopes);
    }
    if (req.body.status !== undefined) {
      if (!['active', 'revoked'].includes(req.body.status)) {
        return res.status(422).json({ error: "status must be 'active' or 'revoked'" });
      }
      sets.push(`status = $${i++}`); vals.push(req.body.status);
    }
    if (req.body.expires_at !== undefined) {
      if (req.body.expires_at !== null && isNaN(Date.parse(req.body.expires_at))) {
        return res.status(422).json({ error: 'expires_at must be an ISO date or null' });
      }
      sets.push(`expires_at = $${i++}`); vals.push(req.body.expires_at);
    }
    if (!sets.length) return res.status(422).json({ error: 'No updatable fields provided' });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);

    const { rows, rowCount } = await db.query(
      `UPDATE api_keys SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, name, key_prefix, scopes, status, expires_at, last_used_at`,
      vals
    );
    if (!rowCount) return res.status(404).json({ error: 'Key not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Key not found' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/keys/:id — hard delete (prefer PATCH status=revoked for audit)
router.delete('/keys/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM api_keys WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Key not found' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Key not found' });
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. GENERIC ENTITY CRUD ──────────────────────────────────────
// One registry entry per automatable entity; the routes below are shared.
//   GET    /api/v1/entities            → discovery (what exists, what's allowed)
//   GET    /api/v1/:entity             → list (?limit ?offset ?q + filters below)
//   GET    /api/v1/:entity/:id         → fetch one
//   POST   /api/v1/:entity             → create             (creatable only)
//   PATCH  /api/v1/:entity/:id         → partial update     (patchable only)
//   DELETE /api/v1/:entity/:id         → delete             (deletable only)
//
// Column whitelists are matched to the live schema in database/db.js.
// Writes to Stripe-backed pricing/products stay on /api/machine (they
// need the Stripe sync there) — products/orders/customers are read-only
// here. Sensitive tables (users' credentials, payments, payouts, session
// stores) are deliberately absent.
const ENTITIES = {
  glossary: {
    table: 'glossary',
    required: ['term', 'definition'],
    writable: ['term', 'definition', 'category', 'categories', 'related_terms', 'letter',
      'slug', 'video_url', 'featured_image', 'article_link', 'bullets', 'example'],
    json: ['bullets'],
    autoSlug: 'term',
    listCols: ['id', 'term', 'slug', 'category', 'letter', 'updated_at'],
    filters: ['category', 'letter'],
    search: ['term'],
    creatable: true, patchable: true, deletable: true,
  },
  'seo-terms': {
    table: 'seo_terms',
    required: ['term'],
    writable: ['term', 'definition', 'short_definition', 'category', 'related_terms',
      'examples', 'slug', 'bullets', 'video_url', 'featured_image', 'article_link', 'glossary_link'],
    json: ['bullets'],
    autoSlug: 'term',
    listCols: ['id', 'term', 'slug', 'category', 'updated_at'],
    filters: ['category'],
    search: ['term'],
    creatable: true, patchable: true, deletable: true,
  },
  'ai-tools': {
    table: 'ai_tools',
    required: ['name'],
    writable: ['name', 'description', 'category', 'website_url', 'pricing_model',
      'features', 'pros', 'cons', 'rating', 'logo_url', 'status', 'app_store_url',
      'play_store_url', 'source', 'slug'],
    autoSlug: 'name',
    listCols: ['id', 'name', 'slug', 'category', 'status', 'rating', 'updated_at'],
    filters: ['category', 'status', 'pricing_model'],
    search: ['name'],
    creatable: true, patchable: true, deletable: true,
  },
  guides: {
    table: 'guides',
    required: ['title'],
    writable: ['title', 'slug', 'short_description', 'long_content', 'category',
      'icon', 'image_url', 'pdf_url', 'video_url', 'status'],
    autoSlug: 'title',
    publishable: true, // status 'published' manages published_at like articles
    listCols: ['id', 'title', 'slug', 'status', 'category', 'published_at', 'updated_at'],
    filters: ['status', 'category'],
    search: ['title'],
    creatable: true, patchable: true, deletable: true,
  },
  faqs: {
    table: 'faqs',
    required: ['question', 'answer_html'],
    writable: ['category_id', 'slug', 'question', 'answer_html', 'status', 'sort_order'],
    autoSlug: 'question', // slug is NOT NULL UNIQUE
    listCols: ['id', 'slug', 'question', 'status', 'category_id', 'sort_order', 'updated_at'],
    filters: ['status', 'category_id'],
    search: ['question'],
    creatable: true, patchable: true, deletable: true,
  },
  'faq-categories': {
    table: 'faq_categories',
    required: ['name'],
    writable: ['slug', 'name', 'description', 'sort_order', 'status'],
    autoSlug: 'name', // slug is NOT NULL UNIQUE
    listCols: ['id', 'slug', 'name', 'status', 'sort_order', 'updated_at'],
    filters: ['status'],
    search: ['name'],
    creatable: true, patchable: true, deletable: true,
  },
  leads: {
    table: 'leads',
    required: ['name'],
    writable: ['source', 'name', 'phone', 'email', 'company', 'category',
      'interest', 'status', 'notes', 'sale_value'],
    listCols: ['id', 'name', 'email', 'phone', 'company', 'source', 'status',
      'category', 'sale_value', 'created_at'],
    filters: ['status', 'source', 'category'],
    search: ['name', 'email', 'company'],
    creatable: true, patchable: true, deletable: true,
  },
  notifications: {
    table: 'notifications',
    required: ['title'],
    writable: ['user_id', 'type', 'title', 'message', 'link', 'read'],
    listCols: ['id', 'user_id', 'type', 'title', 'read', 'created_at'],
    filters: ['read', 'type', 'user_id'],
    search: ['title'],
    touchUpdatedAt: false, // table has no updated_at column
    creatable: true, patchable: true, deletable: true,
  },
  'form-submissions': {
    table: 'form_submissions',
    required: ['form_type', 'name', 'email'],
    writable: ['form_type', 'name', 'email', 'company', 'phone', 'message', 'status', 'metadata'],
    json: ['metadata'],
    listCols: ['id', 'form_type', 'name', 'email', 'company', 'phone', 'status', 'created_at'],
    filters: ['status', 'form_type'],
    search: ['name', 'email', 'company'],
    creatable: true, patchable: true, deletable: false,
  },
  products: {
    table: 'products',
    listCols: ['id', 'name', 'slug', 'category', 'product_type', 'price', 'currency',
      'status', 'service_page', 'sort_order', 'updated_at'],
    filters: ['status', 'category', 'product_type', 'service_page'],
    search: ['name'],
    creatable: false, patchable: false, deletable: false, // Stripe-synced: write via /api/machine
  },
  orders: {
    table: 'orders',
    listCols: ['id', 'customer_email', 'customer_name', 'sku', 'quantity', 'amount',
      'currency', 'status', 'payment_method', 'created_at'],
    filters: ['status', 'payment_method', 'customer_email'],
    search: ['customer_email', 'customer_name'],
    creatable: false, patchable: false, deletable: false, // owned by the payments flow
  },
  customers: {
    table: 'customers',
    // Explicit readCols: never expose password_hash.
    readCols: ['id', 'email', 'name', 'company', 'phone', 'status', 'role',
      'preferred_language', 'last_login_at', 'created_at'],
    listCols: ['id', 'email', 'name', 'company', 'status', 'created_at'],
    filters: ['status', 'email'],
    search: ['email', 'name', 'company'],
    creatable: false, patchable: false, deletable: false,
  },
  users: {
    table: 'users',
    // Read-only lookup so automations can target notifications / see
    // assignees. Credentials and payout data are never selectable.
    readCols: ['id', 'email', 'first_name', 'last_name', 'role', 'created_at'],
    listCols: ['id', 'email', 'first_name', 'last_name', 'role'],
    filters: ['role', 'email'],
    search: ['email', 'first_name', 'last_name'],
    creatable: false, patchable: false, deletable: false,
  },
};

const entityOr404 = (req, res) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) {
    res.status(404).json({ error: `Unknown entity '${req.params.entity}'`, entities: Object.keys(ENTITIES) });
    return null;
  }
  return cfg;
};

// pg maps JS arrays to Postgres arrays natively, but a JS array/object
// bound to a JSONB column must be stringified — hence the json list.
const bindValue = (cfg, col, val) =>
  (cfg.json || []).includes(col) && val !== null && typeof val === 'object'
    ? JSON.stringify(val)
    : val;

// GET /api/v1/entities — discovery for Make.com scenario building
router.get('/entities', (req, res) => {
  res.json({
    entities: Object.fromEntries(Object.entries(ENTITIES).map(([name, cfg]) => [name, {
      creatable: !!cfg.creatable,
      patchable: !!cfg.patchable,
      deletable: !!cfg.deletable,
      required: cfg.required || [],
      writable: cfg.writable || [],
      filters: cfg.filters || [],
      search: cfg.search || [],
    }])),
    special: {
      articles: 'bespoke routes above (content→text_article, meta_description→seo_description mapping)',
      images: 'POST /api/v1/images (source_url or base64 → public /uploads URL)',
    },
  });
});

// GET /api/v1/:entity — list
router.get('/:entity', async (req, res) => {
  const cfg = entityOr404(req, res);
  if (!cfg) return;
  try {
    const conds = [], vals = [];
    let i = 1;
    for (const f of cfg.filters || []) {
      if (req.query[f] !== undefined) { conds.push(`${f} = $${i++}`); vals.push(req.query[f]); }
    }
    if (req.query.q && (cfg.search || []).length) {
      conds.push(`(${cfg.search.map(c => `${c} ILIKE $${i}`).join(' OR ')})`);
      vals.push(`%${req.query.q}%`); i++;
    }
    vals.push(Math.min(parseInt(req.query.limit) || 20, 100), parseInt(req.query.offset) || 0);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT ${cfg.listCols.join(', ')} FROM ${cfg.table} ${where}
       ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      vals
    );
    res.json({ count: rows.length, [req.params.entity.replace(/-/g, '_')]: rows });
  } catch (err) {
    console.error('[API] list entity failed:', req.params.entity, err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/:entity/:id — fetch one
router.get('/:entity/:id', async (req, res) => {
  const cfg = entityOr404(req, res);
  if (!cfg) return;
  try {
    const cols = cfg.readCols ? cfg.readCols.join(', ') : '*';
    const { rows } = await db.query(`SELECT ${cols} FROM ${cfg.table} WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/:entity — create
router.post('/:entity', async (req, res) => {
  const cfg = entityOr404(req, res);
  if (!cfg) return;
  if (!cfg.creatable) return res.status(405).json({ error: `${req.params.entity} is read-only on this API` });
  try {
    for (const field of cfg.required || []) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        return res.status(422).json({ error: `${(cfg.required).join(', ')} required` });
      }
    }
    const cols = [], vals = [], holders = [];
    let i = 1;
    for (const col of cfg.writable) {
      if (col === 'slug') continue; // handled below
      if (req.body[col] !== undefined) {
        cols.push(col);
        holders.push((cfg.json || []).includes(col) ? `$${i++}::jsonb` : `$${i++}`);
        vals.push(bindValue(cfg, col, req.body[col]));
      }
    }
    if (cfg.autoSlug) {
      const base = slugify(String(req.body.slug || req.body[cfg.autoSlug]));
      cols.push('slug'); holders.push(`$${i++}`);
      vals.push(await uniqueSlugIn(cfg.table, base));
    }
    if (cfg.publishable && req.body.status === 'published') {
      cols.push('published_at'); holders.push(`$${i++}`);
      vals.push(new Date());
    }
    const { rows } = await db.query(
      `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${holders.join(', ')}) RETURNING id`,
      vals
    );
    res.status(201).json({ id: rows[0].id, entity: req.params.entity });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate value for a unique field: ' + err.detail });
    console.error('[API] create entity failed:', req.params.entity, err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/v1/:entity/:id — partial update
router.patch('/:entity/:id', async (req, res) => {
  const cfg = entityOr404(req, res);
  if (!cfg) return;
  if (!cfg.patchable) return res.status(405).json({ error: `${req.params.entity} is read-only on this API` });
  try {
    const sets = [], vals = [];
    let i = 1;
    for (const col of cfg.writable) {
      if (req.body[col] !== undefined) {
        sets.push(`${col} = $${i++}${(cfg.json || []).includes(col) ? '::jsonb' : ''}`);
        vals.push(bindValue(cfg, col, req.body[col]));
      }
    }
    if (cfg.publishable && req.body.status === 'published') sets.push(`published_at = COALESCE(published_at, NOW())`);
    if (!sets.length) return res.status(422).json({ error: 'No updatable fields provided' });
    if (cfg.touchUpdatedAt !== false) sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);

    const { rows, rowCount } = await db.query(
      `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
      vals
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ id: rows[0].id, updated: true });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Not found' });
    if (err.code === '23505') return res.status(409).json({ error: 'Duplicate value for a unique field: ' + err.detail });
    console.error('[API] update entity failed:', req.params.entity, err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/:entity/:id
router.delete('/:entity/:id', async (req, res) => {
  const cfg = entityOr404(req, res);
  if (!cfg) return;
  if (!cfg.deletable) return res.status(405).json({ error: `${req.params.entity} cannot be deleted via this API` });
  try {
    const { rowCount } = await db.query(`DELETE FROM ${cfg.table} WHERE id = $1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
// Single source of truth for scope names — the admin API Keys page
// builds its checkbox list from this.
module.exports.validScopes = validScopes;
