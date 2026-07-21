const express = require('express');
const { ensureAuthenticated, logActivity } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const https = require('https');
const {
  IMAGES_DIR,
  UPLOAD_TEMP_DIR,
  CDN_CONFIG,
  buildCdnUrl,
  localPathFor,
  isTempUpload,
  cleanupTempFile,
  assertPathWithin,
  ensureDirs,
} = require('../utils/storage');

/**
 * Ensure a redirect target is a safe local path.
 * Only allow relative paths on this server that start with a single "/"
 * and do not contain a URL scheme.
 */
function isSafeRedirectPath(target) {
  if (typeof target !== 'string') {
    return false;
  }

  // Trim whitespace
  const trimmed = target.trim();

  // Must start with "/" but not with "//" (protocol-relative) and not be empty
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return false;
  }

  // Disallow any ":" before a "/" to prevent schemes like "http:" or "javascript:"
  const firstSlashIndex = trimmed.indexOf('/');
  const firstColonIndex = trimmed.indexOf(':');
  if (firstColonIndex !== -1 && (firstSlashIndex === -1 || firstColonIndex < firstSlashIndex)) {
    return false;
  }

  return true;
}

const router = express.Router();
router.use(ensureAuthenticated);

// AI analysis and optimize-preview get their own budgets below. The shared
// limiter must skip them: slider-driven preview bursts would otherwise exhaust
// it, and its text/plain 429s break the client fetch handlers, which expect
// JSON from these endpoints.
const OWN_LIMITER_PATHS = /^\/(?:[^/]+\/(?:analyze|optimize-preview)|analyze-upload)$/;
// server.js's mount-level /images limiter must apply the same exemption, or its
// 100/15min budget trips before these dedicated limiters ever see a request.
router.OWN_LIMITER_PATHS = OWN_LIMITER_PATHS;
const imagesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => OWN_LIMITER_PATHS.test(req.path),
});
router.use(imagesLimiter);

const json429 = (req, res) => res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
const analyzeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, handler: json429 });
const previewLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, handler: json429 });

// CDN config, image/upload roots and path helpers come from the shared
// storage module (env-configurable roots; see src/utils/storage.js).
ensureDirs();

// Fetch image from CDN to local disk (Railway has ephemeral storage)
function fetchImageFromCdn(image) {
  return new Promise((resolve, reject) => {
    if (!image.cdn_url) return reject(new Error('No CDN URL available'));

    // Parse the CDN URL - may redirect, so we follow up to 3 redirects
    const fetch = (url, redirects) => {
      if (redirects > 3) return reject(new Error('Too many redirects'));
      const mod = url.startsWith('https') ? https : require('http');
      mod.get(url, { headers: { 'User-Agent': 'WTS-Admin' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetch(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`CDN returned ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          // Save to local path
          const localPath = localPathFor(image.file_path);
          const dir = path.dirname(localPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(localPath, buffer);
          resolve(localPath);
        });
        res.on('error', reject);
      }).on('error', reject);
    };
    fetch(image.cdn_url, 0);
  });
}

// Multer config for temp uploads
const upload = multer({
  dest: UPLOAD_TEMP_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WebP, SVG, AVIF) are allowed'));
    }
  },
});

// Helper: create SEO-friendly filename
function slugifyFilename(name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// True when a candidate repo path is already taken on any authority: local
// disk (fast, but wiped on redeploy - Railway), the images table, or the
// GitHub repo itself. Checking only the disk let re-uploads after a redeploy
// silently alias an existing CDN object and 422 on the push.
async function isPathTaken(relPath, excludeImageId) {
  if (fs.existsSync(localPathFor(relPath))) return true;
  const dbHit = excludeImageId
    ? await db.query('SELECT 1 FROM images WHERE file_path = $1 AND id <> $2 LIMIT 1', [relPath, excludeImageId])
    : await db.query('SELECT 1 FROM images WHERE file_path = $1 LIMIT 1', [relPath]);
  if (dbHit.rows.length > 0) return true;
  return Boolean(await getGitHubFileSha(relPath));
}

// Build a filename that doesn't collide with an existing file, suffixing
// -2, -3, ... as needed.
async function uniqueFilename(catDir, base, ext) {
  let candidate = `${base}${ext}`;
  for (let n = 2; ; n++) {
    const relPath = catDir ? `images/${catDir}/${candidate}` : `images/${candidate}`;
    if (!(await isPathTaken(relPath))) return candidate;
    candidate = `${base}-${n}${ext}`;
  }
}

// Count rows in other tables that reference this image by URL/filename.
// Best-effort: tables and columns vary between installs, so a failed query
// just contributes zero instead of breaking the caller.
const REFERENCE_SOURCES = [
  { singular: 'product', plural: 'products', sql: "SELECT COUNT(*)::int AS n FROM products WHERE image_url LIKE $1 OR slide_in_image LIKE $1" },
  // article_images is JSONB - its text cast ends with ]/}, so an ends-with
  // needle can never match. URLs inside it are quote-terminated, so match
  // '/filename"' anywhere instead.
  { singular: 'article', plural: 'articles', jsonb: true, sql: "SELECT COUNT(*)::int AS n FROM articles WHERE article_images::text LIKE $1" },
  { singular: 'glossary entry', plural: 'glossary entries', sql: "SELECT COUNT(*)::int AS n FROM glossary WHERE featured_image LIKE $1" },
  { singular: 'SEO term', plural: 'SEO terms', sql: "SELECT COUNT(*)::int AS n FROM seo_terms WHERE featured_image LIKE $1" },
];

async function countImageReferences(image) {
  const parts = [];
  let total = 0;
  for (const src of REFERENCE_SOURCES) {
    const needle = src.jsonb ? `%/${image.filename}"%` : `%/${image.filename}`;
    try {
      const r = await db.query(src.sql, [needle]);
      const n = r.rows[0] ? r.rows[0].n : 0;
      if (n > 0) parts.push(`${n} ${n === 1 ? src.singular : src.plural}`);
      total += n;
    } catch (e) { /* table or column absent on this install */ }
  }
  return { total, parts };
}

function describeReferences(refs) {
  return refs.parts.join(', ');
}

// Helper: get category subdirectory
function getCategoryDir(category) {
  const dirs = {
    hero: 'hero',
    portfolio: 'portfolio',
    logos: 'logos',
    articles: 'articles',
    og: 'og',
    icons: 'icons',
    general: '',
  };
  return dirs[category] || '';
}

// Helper: format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ==================== GITHUB API ====================

// Get the SHA of an existing file in the repo (needed to update/replace it)
function getGitHubFileSha(repoPath) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return Promise.resolve(null);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}/contents/${repoPath}?ref=${CDN_CONFIG.branch}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'WTS-Admin-ImageLibrary',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data).sha);
          } catch (e) { resolve(null); }
        } else {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Purge jsDelivr's cache for a path so a freshly pushed/updated file is served
// immediately. jsDelivr caches @branch refs aggressively, so without this an
// updated image keeps serving the stale bytes (the classic "I re-uploaded but
// the site still shows the old image"). Fire-and-forget: never fail an upload
// over a purge miss.
function purgeJsDelivr(repoPath) {
  const clean = String(repoPath).replace(/^\/+/, '');
  const encoded = clean.split('/').map((s) => encodeURIComponent(s)).join('/');
  const purgePath = `/gh/${CDN_CONFIG.user}/${CDN_CONFIG.repo}@${CDN_CONFIG.branch}/${encoded}`;
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'purge.jsdelivr.net',
      path: purgePath,
      method: 'GET',
      headers: { 'User-Agent': 'WTS-Admin-ImageLibrary' },
      timeout: 8000,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// One PUT attempt against the GitHub Contents API.
function putToGitHubOnce(repoPath, body, token) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}/contents/${repoPath}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'WTS-Admin-ImageLibrary',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', (err) => resolve({ networkError: err.message }));
    req.write(body);
    req.end();
  });
}

// Push a file to the GitHub repo so it's available on the CDN.
// Pass sha to update an existing file (required by GitHub API for replacements).
// Retries transient failures (network, 5xx, 403 rate-limit) with backoff; bad
// credentials / not-found / validation errors fail fast since they won't
// self-heal. On success, purges jsDelivr so the new bytes are served at once.
async function pushToGitHub(repoPath, fileBuffer, commitMessage, sha) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GITHUB_TOKEN not set - image will not be pushed to repo/CDN');
    return { pushed: false, reason: 'no_token' };
  }

  const payload = {
    message: commitMessage,
    content: fileBuffer.toString('base64'),
    branch: CDN_CONFIG.branch,
  };
  if (sha) payload.sha = sha;
  const body = JSON.stringify(payload);

  const maxAttempts = 3;
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await putToGitHubOnce(repoPath, body, token);

    if (res.networkError) {
      console.error('GitHub API request error:', res.networkError);
      last = { pushed: false, reason: 'network_error', details: res.networkError };
    } else if (res.statusCode === 201 || res.statusCode === 200) {
      const purged = await purgeJsDelivr(repoPath);
      return { pushed: true, purged };
    } else {
      console.error('GitHub API error:', res.statusCode, String(res.data).substring(0, 500));
      last = { pushed: false, reason: `github_${res.statusCode}`, details: String(res.data).substring(0, 200) };
    }

    const transient = res.networkError || res.statusCode >= 500 || res.statusCode === 403;
    if (!transient || attempt === maxAttempts) break;
    await sleep(attempt * 1000); // 1s, then 2s
  }
  return last;
}

// Remove a file from the GitHub repo via the Contents DELETE API so it leaves
// the CDN. Requires the file's current sha (fetch with getGitHubFileSha).
// Retries transient failures; treats a 404 as already-gone. Purges jsDelivr on
// success. (Pushing an empty file does NOT delete it - it leaves a 0-byte blob,
// so a real DELETE is required.)
async function deleteFromGitHub(repoPath, sha, commitMessage) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { deleted: false, reason: 'no_token' };
  if (!sha) return { deleted: false, reason: 'no_sha' };

  const encodedPath = String(repoPath).replace(/^\/+/, '').split('/').map((s) => encodeURIComponent(s)).join('/');
  const body = JSON.stringify({ message: commitMessage, sha, branch: CDN_CONFIG.branch });

  const attempt = () => new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}/contents/${encodedPath}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'WTS-Admin-ImageLibrary',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', (err) => resolve({ networkError: err.message }));
    req.write(body);
    req.end();
  });

  const maxAttempts = 3;
  let last = null;
  for (let i = 1; i <= maxAttempts; i++) {
    const res = await attempt();
    if (res.networkError) {
      last = { deleted: false, reason: 'network_error', details: res.networkError };
    } else if (res.statusCode === 200) {
      await purgeJsDelivr(repoPath);
      return { deleted: true };
    } else if (res.statusCode === 404) {
      return { deleted: true, reason: 'already_absent' };
    } else {
      console.error('GitHub delete error:', res.statusCode, String(res.data).substring(0, 300));
      last = { deleted: false, reason: `github_${res.statusCode}` };
    }
    const transient = res.networkError || res.statusCode >= 500 || res.statusCode === 403;
    if (!transient || i === maxAttempts) break;
    await sleep(i * 1000);
  }
  return last;
}

// Minimal authenticated GitHub API JSON request (used by the Git Data API
// batch push below; the single-file paths keep their dedicated helpers).
function githubJsonRequest(method, apiPath, body) {
  const token = process.env.GITHUB_TOKEN;
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'WTS-Admin-ImageLibrary',
        'Accept': 'application/vnd.github.v3+json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { /* leave null */ }
        resolve({ statusCode: res.statusCode, body: parsed, raw: data.slice(0, 200) });
      });
    });
    req.on('error', (err) => resolve({ statusCode: 0, body: null, raw: err.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ statusCode: 0, body: null, raw: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// Push many files to the repo in ONE commit via the Git Data API (blobs ->
// tree -> commit -> ref update). The Contents API makes one commit per file,
// and every commit to main triggers a full site build - a 50-file batch
// upload used to mean 50 sequential deploys.
// files: [{ relPath, localPath }]. Returns { pushed, reason, details }.
async function pushManyToGitHub(files, commitMessage) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GITHUB_TOKEN not set - images will not be pushed to repo/CDN');
    return { pushed: false, reason: 'no_token' };
  }
  const base = `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}`;
  const fail = (step, r) => {
    console.error(`Batch push failed at ${step}:`, r.statusCode, r.raw);
    return { pushed: false, reason: r.statusCode ? `github_${r.statusCode}` : 'network_error', details: r.raw };
  };

  // Blobs are content-addressed - upload once, reuse across ref-race retries.
  const treeEntries = [];
  for (const f of files) {
    const blob = await githubJsonRequest('POST', `${base}/git/blobs`, {
      content: fs.readFileSync(f.localPath).toString('base64'),
      encoding: 'base64',
    });
    if (blob.statusCode !== 201 || !blob.body || !blob.body.sha) return fail('blob', blob);
    treeEntries.push({ path: f.relPath, mode: '100644', type: 'blob', sha: blob.body.sha });
  }

  // The ref update can race a concurrent single-file push; retry the
  // read-tree-commit-update sequence once on a non-fast-forward 422.
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ref = await githubJsonRequest('GET', `${base}/git/ref/heads/${CDN_CONFIG.branch}`);
    if (ref.statusCode !== 200 || !ref.body || !ref.body.object) return fail('ref', ref);
    const headSha = ref.body.object.sha;

    const headCommit = await githubJsonRequest('GET', `${base}/git/commits/${headSha}`);
    if (headCommit.statusCode !== 200 || !headCommit.body || !headCommit.body.tree) return fail('head-commit', headCommit);

    const tree = await githubJsonRequest('POST', `${base}/git/trees`, {
      base_tree: headCommit.body.tree.sha,
      tree: treeEntries,
    });
    if (tree.statusCode !== 201 || !tree.body || !tree.body.sha) return fail('tree', tree);

    const commit = await githubJsonRequest('POST', `${base}/git/commits`, {
      message: commitMessage,
      tree: tree.body.sha,
      parents: [headSha],
    });
    if (commit.statusCode !== 201 || !commit.body || !commit.body.sha) return fail('commit', commit);

    const update = await githubJsonRequest('PATCH', `${base}/git/refs/heads/${CDN_CONFIG.branch}`, { sha: commit.body.sha });
    if (update.statusCode === 200) {
      for (const f of files) await purgeJsDelivr(f.relPath);
      return { pushed: true };
    }
    last = update;
    if (update.statusCode !== 422 || attempt === 2) break;
    await sleep(1000);
  }
  return fail('ref-update', last);
}

// Turn a pushToGitHub() failure reason into an actionable warning for the UI.
function describePushFailure(reason) {
  switch (reason) {
    case 'no_token':
      return 'GITHUB_TOKEN not configured - image is stored locally only and will not appear on CDN.';
    case 'github_401':
      return 'GitHub rejected the token (401). The GITHUB_TOKEN is invalid or expired - generate a new token with "contents: write" permission on the repo and update it in the Railway environment variables.';
    case 'github_403':
      return 'GitHub denied the request (403). The GITHUB_TOKEN lacks write access to the repo (or hit a rate limit) - ensure it has "contents: write" permission.';
    case 'github_404':
      return 'GitHub returned 404 - check the repo/branch in CDN_CONFIG and that the token can see the repository.';
    case 'network_error':
      return 'Could not reach GitHub (network error) - image is stored locally only.';
    default:
      return `Failed to push to GitHub (${reason}) - image may not appear on CDN.`;
  }
}

// Verify the GITHUB_TOKEN actually works (and can write), so the UI can warn
// about a present-but-invalid/expired/read-only token instead of only checking
// that the env var exists. Cached briefly to avoid an API call on every page
// load / rapid navigation.
let _ghStatusCache = { at: 0, value: null };
function verifyGitHubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return Promise.resolve({ configured: false, ok: false, reason: 'no_token' });

  const now = Date.now();
  if (_ghStatusCache.value && now - _ghStatusCache.at < 60000) {
    return Promise.resolve(_ghStatusCache.value);
  }

  return new Promise((resolve) => {
    const finish = (value) => { _ghStatusCache = { at: now, value }; resolve(value); };
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'WTS-Admin-ImageLibrary',
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          let canPush = null;
          try {
            const json = JSON.parse(data);
            if (json.permissions) canPush = !!json.permissions.push;
          } catch (e) { /* ignore parse error, treat as unknown */ }
          if (canPush === false) finish({ configured: true, ok: false, reason: 'no_write', canPush });
          else finish({ configured: true, ok: true, reason: 'ok', canPush });
        } else {
          finish({ configured: true, ok: false, reason: `github_${res.statusCode}` });
        }
      });
    });
    req.on('error', () => finish({ configured: true, ok: false, reason: 'network_error' }));
    req.on('timeout', () => { req.destroy(); finish({ configured: true, ok: false, reason: 'network_error' }); });
    req.end();
  });
}

// Human-readable summary of a verifyGitHubToken() result for the UI banner.
function describeGitHubStatus(status) {
  if (status.ok) return 'GitHub CDN publishing is connected and ready.';
  if (status.reason === 'no_token') {
    return 'GITHUB_TOKEN is not set. Uploads are stored locally only and will not appear on the CDN (and are lost on the next Railway redeploy). Add GITHUB_TOKEN to your Railway environment variables.';
  }
  if (status.reason === 'no_write') {
    return 'The GITHUB_TOKEN can read the repo but lacks write access. Give it "contents: write" permission so uploads can publish to the CDN.';
  }
  return describePushFailure(status.reason);
}

// ==================== IMAGE FOLDERS ====================

// Helper: slugify folder name
function slugifyFolder(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper: build flat list of folders with depth for indent
async function getFolderTree() {
  const result = await db.query('SELECT * FROM image_folders ORDER BY name ASC');
  const folders = result.rows;
  const map = {};
  folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
  const roots = [];
  folders.forEach(f => {
    if (f.parent_id && map[f.parent_id]) {
      map[f.parent_id].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });
  // Flatten tree with depth
  const flat = [];
  function walk(nodes, depth) {
    nodes.forEach(n => {
      flat.push({ ...n, depth });
      walk(n.children, depth + 1);
    });
  }
  walk(roots, 0);
  return flat;
}

// Helper: get image count per folder
async function getFolderImageCounts() {
  const result = await db.query(
    "SELECT folder_id, COUNT(*) as count FROM images WHERE folder_id IS NOT NULL AND status = 'active' GROUP BY folder_id"
  );
  const counts = {};
  result.rows.forEach(r => { counts[r.folder_id] = parseInt(r.count); });
  return counts;
}

// Create folder
router.post('/folders', async (req, res) => {
  try {
    const { name, parent_id, description } = req.body;
    if (!name || !name.trim()) {
      req.session.errorMessage = 'Folder name is required';
      return res.redirect('/images' + (req.body.return_to ? '?folder=' + req.body.return_to : ''));
    }

    const slug = slugifyFolder(name.trim());
    await db.query(
      'INSERT INTO image_folders (name, slug, parent_id, description) VALUES ($1, $2, $3, $4)',
      [name.trim(), slug, parent_id || null, description || null]
    );

    req.session.successMessage = `Folder "${name.trim()}" created`;
    res.redirect('/images' + (parent_id ? '?folder=' + parent_id : ''));
  } catch (error) {
    console.error('Create folder error:', error);
    req.session.errorMessage = 'Failed to create folder: ' + error.message;
    res.redirect('/images');
  }
});

// Rename folder
router.post('/folders/:id/rename', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      req.session.errorMessage = 'Folder name is required';
      return res.redirect('/images');
    }

    const slug = slugifyFolder(name.trim());
    await db.query(
      'UPDATE image_folders SET name = $1, slug = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [name.trim(), slug, req.params.id]
    );

    req.session.successMessage = `Folder renamed to "${name.trim()}"`;
    res.redirect('/images?folder=' + req.params.id);
  } catch (error) {
    console.error('Rename folder error:', error);
    req.session.errorMessage = 'Failed to rename folder';
    res.redirect('/images');
  }
});

// Delete folder (images inside get unassigned)
router.post('/folders/:id/delete', async (req, res) => {
  try {
    // Unassign images in this folder first
    await db.query('UPDATE images SET folder_id = NULL WHERE folder_id = $1', [req.params.id]);
    // Also unassign images in child folders (CASCADE will delete child folders)
    const children = await db.query('SELECT id FROM image_folders WHERE parent_id = $1', [req.params.id]);
    for (const child of children.rows) {
      await db.query('UPDATE images SET folder_id = NULL WHERE folder_id = $1', [child.id]);
    }
    await db.query('DELETE FROM image_folders WHERE id = $1', [req.params.id]);

    req.session.successMessage = 'Folder deleted. Images have been unassigned.';
    res.redirect('/images');
  } catch (error) {
    console.error('Delete folder error:', error);
    req.session.errorMessage = 'Failed to delete folder';
    res.redirect('/images');
  }
});

// Move images to folder (bulk action)
router.post('/move-to-folder', async (req, res) => {
  try {
    const { image_ids, folder_id } = req.body;
    if (!image_ids) {
      req.session.errorMessage = 'No images selected';
      return res.redirect('/images');
    }

    const ids = Array.isArray(image_ids) ? image_ids : [image_ids];
    const targetFolder = folder_id || null;

    for (const id of ids) {
      await db.query('UPDATE images SET folder_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [targetFolder, id]);
    }

    const folderName = targetFolder
      ? (await db.query('SELECT name FROM image_folders WHERE id = $1', [targetFolder])).rows[0]?.name || 'folder'
      : 'root';
    req.session.successMessage = `${ids.length} image${ids.length !== 1 ? 's' : ''} moved to ${folderName}`;
    res.redirect('/images' + (targetFolder ? '?folder=' + targetFolder : ''));
  } catch (error) {
    console.error('Move to folder error:', error);
    req.session.errorMessage = 'Failed to move images';
    res.redirect('/images');
  }
});

// API: get folders as JSON (for modals)
router.get('/folders/json', async (req, res) => {
  try {
    const folders = await getFolderTree();
    res.json({ folders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

// ==================== IMAGE LIBRARY ====================

// List all images
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 24;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const folderId = req.query.folder || '';
    const view = req.query.view || 'grid';

    let query = 'SELECT * FROM images';
    let countQuery = 'SELECT COUNT(*) FROM images';
    const params = [];
    const conditions = [];

    if (search) {
      // Include description and tags so images are findable by the metadata
      // the AI writes, not just by filename.
      conditions.push(`(filename ILIKE $${params.length + 1} OR alt_text ILIKE $${params.length + 1} OR title ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1} OR array_to_string(tags, ' ') ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (category) {
      conditions.push(`category = $${params.length + 1}`);
      params.push(category);
    }

    if (folderId === 'unfiled') {
      conditions.push('folder_id IS NULL');
    } else if (folderId) {
      conditions.push(`folder_id = $${params.length + 1}`);
      params.push(folderId);
    }

    const statusFilter = req.query.status === 'archived' ? 'archived' : 'active';
    conditions.push(`status = $${params.length + 1}`);
    params.push(statusFilter);

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [images, count, folders, folderCounts] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params),
      getFolderTree(),
      getFolderImageCounts(),
    ]);

    // Get current folder info if browsing a folder
    let currentFolder = null;
    if (folderId && folderId !== 'unfiled') {
      const folderResult = await db.query('SELECT * FROM image_folders WHERE id = $1', [folderId]);
      if (folderResult.rows.length > 0) currentFolder = folderResult.rows[0];
    }

    // Count unfiled images
    const unfiledResult = await db.query("SELECT COUNT(*) FROM images WHERE folder_id IS NULL AND status = 'active'");
    const unfiledCount = parseInt(unfiledResult.rows[0].count);

    const totalPages = Math.ceil(count.rows[0].count / limit);

    res.render('images/library', {
      title: 'Image Library - WTS Admin',
      images: images.rows.map(img => ({
        ...img,
        file_size_formatted: formatFileSize(img.file_size || 0),
      })),
      currentPage: 'images',
      view,
      folders,
      folderCounts,
      currentFolder,
      activeFolder: folderId,
      unfiledCount,
      statusFilter,
      pagination: { page, totalPages, search, category, folder: folderId, status: statusFilter },
    });
  } catch (error) {
    console.error('Image library error:', error);
    res.render('images/library', {
      title: 'Image Library - WTS Admin',
      images: [],
      currentPage: 'images',
      view: 'grid',
      folders: [],
      folderCounts: {},
      currentFolder: null,
      activeFolder: '',
      unfiledCount: 0,
      statusFilter: 'active',
      pagination: { page: 1, totalPages: 0, search: '', category: '', folder: '', status: 'active' },
      error: 'Failed to load image library',
    });
  }
});

// Scan filesystem and sync untracked images to DB
router.post('/sync', async (req, res) => {
  try {
    let synced = 0;

    // Recursively scan images directory
    function scanDir(dir, relPath) {
      const files = [];
      if (!fs.existsSync(dir)) return files;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          files.push(...scanDir(path.join(dir, entry.name), path.join(relPath, entry.name)));
        } else if (/\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(entry.name)) {
          files.push({
            name: entry.name,
            fullPath: path.join(dir, entry.name),
            relPath: path.join(relPath, entry.name),
          });
        }
      }
      return files;
    }

    const imageFiles = scanDir(IMAGES_DIR, 'images');

    let updated = 0;
    for (const file of imageFiles) {
      // Check if already tracked
      const existing = await db.query('SELECT id, cdn_url FROM images WHERE file_path = $1', [file.relPath]);
      if (existing.rows.length > 0) {
        // Update CDN URL if it has unencoded spaces or is missing
        const correctCdnUrl = buildCdnUrl(file.relPath);
        if (existing.rows[0].cdn_url !== correctCdnUrl) {
          await db.query('UPDATE images SET cdn_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [correctCdnUrl, existing.rows[0].id]);
          updated++;
        }
        continue;
      }

      const stats = fs.statSync(file.fullPath);
      let width = null;
      let height = null;
      let mime = 'image/' + path.extname(file.name).slice(1).toLowerCase();
      if (mime === 'image/svg') mime = 'image/svg+xml';
      if (mime === 'image/jpg') mime = 'image/jpeg';

      // Try to get dimensions (skip for SVG)
      if (!/\.svg$/i.test(file.name)) {
        try {
          const meta = await sharp(file.fullPath).metadata();
          width = meta.width;
          height = meta.height;
        } catch (e) {
          // ignore dimension errors
        }
      }

      const cdnUrl = buildCdnUrl(file.relPath);

      // Determine category from subdirectory
      const parts = file.relPath.split(path.sep);
      let category = 'general';
      if (parts.length > 2) {
        category = parts[1]; // images/{category}/file
      }

      await db.query(
        `INSERT INTO images (original_filename, filename, file_path, file_size, mime_type, width, height, cdn_url, category, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [file.name, file.name, file.relPath, stats.size, mime, width, height, cdnUrl, category, req.user.id]
      );
      synced++;
    }

    req.session.successMessage = `Synced ${synced} new image${synced !== 1 ? 's' : ''}, updated ${updated} CDN URL${updated !== 1 ? 's' : ''}`;
    res.redirect('/images');
  } catch (error) {
    console.error('Image sync error:', error);
    req.session.errorMessage = 'Failed to sync images: ' + error.message;
    res.redirect('/images');
  }
});

// JSON health check for the GitHub/CDN publishing path (verifies the token
// actually works, not just that it's set). Handy for an on-demand "test
// connection" check without doing a throwaway upload.
router.get('/github-status', async (req, res) => {
  const status = await verifyGitHubToken();
  res.json({ ...status, message: describeGitHubStatus(status) });
});

// Upload form
router.get('/upload', async (req, res) => {
  const folders = await getFolderTree();
  const githubStatus = await verifyGitHubToken();
  res.render('images/upload', {
    title: 'Upload Image - WTS Admin',
    currentPage: 'images',
    githubConfigured: githubStatus.ok,
    githubMessage: describeGitHubStatus(githubStatus),
    folders,
    preselectedFolder: req.query.folder || '',
  });
});

// Multi-upload form
router.get('/upload-multiple', async (req, res) => {
  const folders = await getFolderTree();
  const githubStatus = await verifyGitHubToken();
  res.render('images/upload-multiple', {
    title: 'Upload Multiple Images - WTS Admin',
    currentPage: 'images',
    githubConfigured: githubStatus.ok,
    githubMessage: describeGitHubStatus(githubStatus),
    folders,
    preselectedFolder: req.query.folder || '',
  });
});

// Handle multi-upload
router.post('/upload-multiple', upload.array('images', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      req.session.errorMessage = 'No image files selected';
      return res.redirect('/images/upload-multiple');
    }

    const { category, optimize, folder_id } = req.body;
    const catDir = getCategoryDir(category || 'general');
    const shouldOptimize = optimize === 'on';
    let uploaded = 0;
    let failed = 0;
    let totalSize = 0;
    let notPushed = 0;
    const errors = [];
    const pushReasons = new Set();
    const pendingPushes = [];

    for (const file of req.files) {
      try {
        const seoFilename = slugifyFilename(file.originalname);
        const isSvg = /\.svg$/i.test(file.originalname);

        let finalFilename, finalPath, fileSize, width, height, mimeType;

        if (isSvg || !shouldOptimize) {
          const ext = path.extname(file.originalname).toLowerCase();
          const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          finalFilename = await uniqueFilename(catDir, seoFilename, ext);
          finalPath = path.join(destDir, finalFilename);
          fs.copyFileSync(file.path, finalPath);
          fileSize = fs.statSync(finalPath).size;
          mimeType = file.mimetype;

          if (!isSvg) {
            try {
              const meta = await sharp(finalPath).metadata();
              width = meta.width;
              height = meta.height;
            } catch (e) { /* ignore */ }
          }
        } else {
          const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          finalFilename = await uniqueFilename(catDir, seoFilename, '.webp');
          finalPath = path.join(destDir, finalFilename);

          const meta = await sharp(file.path).metadata();
          const animated = (meta.pages || 1) > 1;

          let resizeOpts = {};
          if (meta.width > 2400 || meta.height > 2400) {
            resizeOpts = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true };
          }

          // animated:true keeps GIF frames when converting to WebP
          await sharp(file.path, { animated })
            .rotate()
            .resize(resizeOpts)
            .webp({ quality: 82 })
            .toFile(finalPath);

          const optimizedMeta = await sharp(finalPath).metadata();
          width = optimizedMeta.width;
          height = optimizedMeta.height;
          fileSize = fs.statSync(finalPath).size;
          mimeType = 'image/webp';
        }

        cleanupTempFile(file.path);

        const relPath = catDir ? `images/${catDir}/${finalFilename}` : `images/${finalFilename}`;
        const cdnUrl = buildCdnUrl(relPath);

        // Queue for one batched repo commit after the loop - a commit per
        // file meant a full site deploy per file.
        pendingPushes.push({ relPath, localPath: finalPath });

        // Save to database
        await db.query(
          `INSERT INTO images (original_filename, filename, file_path, file_size, mime_type, width, height, alt_text, title, description, category, tags, cdn_url, folder_id, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [file.originalname, finalFilename, relPath, fileSize, mimeType, width, height, '', '', '', category || 'general', [], cdnUrl, folder_id || null, req.user.id]
        );

        uploaded++;
        totalSize += fileSize;
      } catch (fileErr) {
        console.error('Failed to upload %s:', file.originalname, fileErr);
        cleanupTempFile(file.path);
        failed++;
        errors.push(file.originalname);
      }
    }

    // One commit for the whole batch; on failure fall back to per-file
    // Contents API pushes so behavior degrades to the previous working path.
    if (pendingPushes.length > 0) {
      const batchResult = await pushManyToGitHub(
        pendingPushes,
        `Upload ${pendingPushes.length} image${pendingPushes.length !== 1 ? 's' : ''} (batch)`
      );
      if (!batchResult.pushed) {
        for (const p of pendingPushes) {
          const ghResult = await pushToGitHub(p.relPath, fs.readFileSync(p.localPath), `Upload image: ${path.basename(p.relPath)}`);
          if (!ghResult.pushed) {
            notPushed++;
            if (ghResult.reason) pushReasons.add(ghResult.reason);
          }
        }
      }
    }

    const sizeFormatted = totalSize > 1024 * 1024
      ? (totalSize / (1024 * 1024)).toFixed(1) + ' MB'
      : (totalSize / 1024).toFixed(1) + ' KB';

    let msg = `${uploaded} image${uploaded !== 1 ? 's' : ''} uploaded (${sizeFormatted})`;
    if (shouldOptimize) msg += ', optimized to WebP';
    if (failed > 0) msg += `. ${failed} failed: ${errors.join(', ')}`;
    if (notPushed > 0) {
      msg += `. Warning: ${notPushed} not pushed to CDN - ${describePushFailure([...pushReasons][0])}`;
    }
    req.session.successMessage = msg;
    res.redirect('/images' + (folder_id ? '?folder=' + folder_id : ''));
  } catch (error) {
    console.error('Multi-upload error:', error);
    if (req.files) req.files.forEach(f => cleanupTempFile(f.path));
    req.session.errorMessage = 'Upload failed: ' + error.message;
    res.redirect('/images/upload-multiple');
  }
});

// Handle upload
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      req.session.errorMessage = 'No image file selected';
      return res.redirect('/images/upload');
    }

    const { alt_text, title, description, category, tags, optimize, folder_id } = req.body;
    const catDir = getCategoryDir(category || 'general');
    const seoFilename = slugifyFilename(req.file.originalname);
    const isSvg = /\.svg$/i.test(req.file.originalname);

    let finalFilename, finalPath, fileSize, width, height, mimeType;

    if (isSvg || optimize !== 'on') {
      // Save as-is (SVGs cannot be processed by sharp)
      const ext = path.extname(req.file.originalname).toLowerCase();
      const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      finalFilename = await uniqueFilename(catDir, seoFilename, ext);
      finalPath = path.join(destDir, finalFilename);
      fs.copyFileSync(req.file.path, finalPath);
      const stats = fs.statSync(finalPath);
      fileSize = stats.size;
      mimeType = req.file.mimetype;

      if (!isSvg) {
        try {
          const meta = await sharp(finalPath).metadata();
          width = meta.width;
          height = meta.height;
        } catch (e) { /* ignore */ }
      }
    } else {
      // Optimize: convert to WebP
      const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      finalFilename = await uniqueFilename(catDir, seoFilename, '.webp');
      finalPath = path.join(destDir, finalFilename);

      const meta = await sharp(req.file.path).metadata();
      const animated = (meta.pages || 1) > 1;

      // Resize if larger than 2400px on either dimension
      let resizeOpts = {};
      if (meta.width > 2400 || meta.height > 2400) {
        resizeOpts = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true };
      }

      // animated:true keeps GIF frames when converting to WebP
      await sharp(req.file.path, { animated })
        .rotate()
        .resize(resizeOpts)
        .webp({ quality: 82 })
        .toFile(finalPath);

      const optimizedMeta = await sharp(finalPath).metadata();
      width = optimizedMeta.width;
      height = optimizedMeta.height;
      fileSize = fs.statSync(finalPath).size;
      mimeType = 'image/webp';
    }

    // Clean up temp file (validated path)
    cleanupTempFile(req.file.path);

    // Build paths
    const relPath = catDir ? `images/${catDir}/${finalFilename}` : `images/${finalFilename}`;
    const cdnUrl = buildCdnUrl(relPath);
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    // Push to GitHub so the image is available on the CDN
    const fileBuffer = fs.readFileSync(finalPath);
    const ghResult = await pushToGitHub(relPath, fileBuffer, `Upload image: ${finalFilename}`);

    // Save to database
    const result = await db.query(
      `INSERT INTO images (original_filename, filename, file_path, file_size, mime_type, width, height, alt_text, title, description, category, tags, cdn_url, folder_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [req.file.originalname, finalFilename, relPath, fileSize, mimeType, width, height, alt_text || '', title || '', description || '', category || 'general', tagsArray, cdnUrl, folder_id || null, req.user.id]
    );

    let msg = `Image uploaded successfully${optimize === 'on' && !isSvg ? ' (optimized to WebP)' : ''}`;
    if (ghResult.pushed) {
      msg += ' and pushed to GitHub CDN';
    } else {
      msg += '. Warning: ' + describePushFailure(ghResult.reason);
    }
    req.session.successMessage = msg;
    res.redirect('/images/' + result.rows[0].id);
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temp file on error (validated path)
    if (req.file) cleanupTempFile(req.file.path);
    req.session.errorMessage = 'Upload failed: ' + error.message;
    res.redirect('/images/upload');
  }
});

// ==================== IMAGE OPTIMIZATION ====================

// Optimize existing image (convert format, resize, adjust quality)
router.post('/:id/optimize', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = result.rows[0];
    const { format, quality, max_width, max_height, fit } = req.body;
    const qualityInt = Math.min(100, Math.max(1, parseInt(quality) || 82));
    const maxW = parseInt(max_width) || 0;
    const maxH = parseInt(max_height) || 0;
    const fitMode = ['cover', 'contain', 'fill', 'inside', 'outside'].includes(fit) ? fit : 'inside';

    // Read source file (fetch from CDN if not on disk - Railway ephemeral storage)
    let sourcePath = localPathFor(image.file_path);
    if (!fs.existsSync(sourcePath)) {
      try {
        sourcePath = await fetchImageFromCdn(image);
      } catch (cdnErr) {
        return res.status(404).json({ error: 'Image file not found on disk and could not be fetched from CDN' });
      }
    }

    const isSvg = image.mime_type === 'image/svg+xml';
    if (isSvg) {
      return res.status(400).json({ error: 'SVG files cannot be optimized. They are already vector-based.' });
    }

    const originalSize = fs.statSync(sourcePath).size;
    const targetFormat = format || 'webp';

    // Animated sources keep their frames only in WebP - any other target
    // would silently flatten them to the first frame.
    const meta = await sharp(sourcePath).metadata();
    const isAnimated = (meta.pages || 1) > 1;
    if (isAnimated && targetFormat !== 'webp') {
      return res.status(400).json({ error: 'This is an animated image - convert it to WebP to keep the animation (other formats keep only the first frame).' });
    }

    // .rotate() with no args applies EXIF orientation so the output isn't sideways
    let sharpInstance = sharp(sourcePath, { animated: isAnimated }).rotate();

    // Resize if requested
    const resizeOpts = {};
    if (maxW > 0 || maxH > 0) {
      if (maxW > 0) resizeOpts.width = maxW;
      if (maxH > 0) resizeOpts.height = maxH;
      resizeOpts.fit = fitMode;
      resizeOpts.withoutEnlargement = true;
    }
    if (Object.keys(resizeOpts).length > 0) {
      sharpInstance = sharpInstance.resize(resizeOpts);
    }

    // Determine output format and extension
    let newExt, newMime;
    switch (targetFormat) {
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality: qualityInt });
        newExt = '.webp'; newMime = 'image/webp';
        break;
      case 'avif':
        sharpInstance = sharpInstance.avif({ quality: qualityInt });
        newExt = '.avif'; newMime = 'image/avif';
        break;
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ quality: qualityInt, mozjpeg: true });
        newExt = '.jpg'; newMime = 'image/jpeg';
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality: qualityInt, compressionLevel: 9 });
        newExt = '.png'; newMime = 'image/png';
        break;
      default:
        return res.status(400).json({ error: 'Unsupported format: ' + targetFormat });
    }

    // Build new filename/path
    const baseName = path.basename(image.filename, path.extname(image.filename));
    const newFilename = baseName + newExt;
    const dir = path.dirname(image.file_path);
    const newRelPath = path.join(dir, newFilename);
    const newFullPath = localPathFor(newRelPath);

    // Process and save
    const destDir = path.dirname(newFullPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    await sharpInstance.toFile(newFullPath);

    // Get new metadata
    const newMeta = await sharp(newFullPath).metadata();
    const newSize = fs.statSync(newFullPath).size;

    // Push to GitHub CDN. A same-format optimize overwrites an existing repo
    // file, and the Contents API 422s an update without the current blob sha -
    // fetch it first (resolves null for brand-new paths).
    const newCdnUrl = buildCdnUrl(newRelPath);
    const fileBuffer = fs.readFileSync(newFullPath);
    const existingSha = await getGitHubFileSha(newRelPath);
    const ghResult = await pushToGitHub(newRelPath, fileBuffer, `Optimize image: ${newFilename}`, existingSha);

    const pathChanged = image.file_path !== newRelPath;
    if (pathChanged && !ghResult.pushed) {
      // Never strand the image: drop the unpublished converted file and keep
      // the old format, path, and URL untouched.
      try { fs.unlinkSync(newFullPath); } catch (e) { /* ignore */ }
      return res.status(502).json({
        error: 'Conversion aborted - the converted file could not be published to the CDN, so the image keeps its current format and URL. ' + describePushFailure(ghResult.reason),
      });
    }

    // Only after a confirmed publish do we retire the old file
    if (pathChanged) {
      const oldFullPath = localPathFor(image.file_path);
      if (fs.existsSync(oldFullPath)) {
        try { fs.unlinkSync(oldFullPath); } catch (e) { /* ignore */ }
      }
      try {
        const oldSha = await getGitHubFileSha(image.file_path);
        if (oldSha) {
          await deleteFromGitHub(image.file_path, oldSha, `Remove old image: ${image.filename}`);
        }
      } catch (e) { /* ignore cleanup errors */ }
    }

    // Update database
    await db.query(
      `UPDATE images SET filename = $1, file_path = $2, file_size = $3, mime_type = $4, width = $5, height = $6, cdn_url = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8`,
      [newFilename, newRelPath, newSize, newMime, newMeta.width, newMeta.height, newCdnUrl, req.params.id]
    );

    const savings = originalSize - newSize;
    const pct = originalSize > 0 ? Math.round((savings / originalSize) * 100) : 0;

    res.json({
      success: true,
      original_size: originalSize,
      new_size: newSize,
      savings,
      savings_pct: pct,
      new_filename: newFilename,
      new_format: targetFormat,
      new_width: newMeta.width,
      new_height: newMeta.height,
      cdn_pushed: ghResult.pushed || false,
      cdn_error: ghResult.pushed ? null : describePushFailure(ghResult.reason),
      cdn_url: newCdnUrl,
    });
  } catch (error) {
    console.error('Image optimization error:', error);
    res.status(500).json({ error: 'Optimization failed: ' + error.message });
  }
});

// Preview optimization (returns estimated size without saving)
router.post('/:id/optimize-preview', previewLimiter, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = result.rows[0];
    const { format, quality, max_width, max_height, fit } = req.body;
    const qualityInt = Math.min(100, Math.max(1, parseInt(quality) || 82));
    const maxW = parseInt(max_width) || 0;
    const maxH = parseInt(max_height) || 0;
    const fitMode = ['cover', 'contain', 'fill', 'inside', 'outside'].includes(fit) ? fit : 'inside';

    let sourcePath = localPathFor(image.file_path);
    if (!fs.existsSync(sourcePath)) {
      try {
        sourcePath = await fetchImageFromCdn(image);
      } catch (cdnErr) {
        return res.status(404).json({ error: 'Image file not found on disk and could not be fetched from CDN' });
      }
    }

    if (image.mime_type === 'image/svg+xml') {
      return res.json({ original_size: image.file_size, estimated_size: image.file_size, savings_pct: 0, error: 'SVG' });
    }

    const originalSize = fs.statSync(sourcePath).size;
    const previewMeta = await sharp(sourcePath).metadata();
    const isAnimated = (previewMeta.pages || 1) > 1;
    if (isAnimated && (format || 'webp') !== 'webp') {
      // Mirror the SVG sentinel: the client quietly skips the preview
      return res.json({ original_size: originalSize, estimated_size: originalSize, savings_pct: 0, error: 'ANIMATED' });
    }
    // .rotate() with no args applies EXIF orientation so the output isn't sideways
    let sharpInstance = sharp(sourcePath, { animated: isAnimated }).rotate();

    const resizeOpts = {};
    if (maxW > 0) resizeOpts.width = maxW;
    if (maxH > 0) resizeOpts.height = maxH;
    if (Object.keys(resizeOpts).length > 0) {
      resizeOpts.fit = fitMode;
      resizeOpts.withoutEnlargement = true;
      sharpInstance = sharpInstance.resize(resizeOpts);
    }

    const targetFormat = format || 'webp';
    switch (targetFormat) {
      case 'webp': sharpInstance = sharpInstance.webp({ quality: qualityInt }); break;
      case 'avif': sharpInstance = sharpInstance.avif({ quality: qualityInt }); break;
      case 'jpeg': sharpInstance = sharpInstance.jpeg({ quality: qualityInt, mozjpeg: true }); break;
      case 'png': sharpInstance = sharpInstance.png({ quality: qualityInt, compressionLevel: 9 }); break;
    }

    // Process to buffer to get estimated size (don't save to disk)
    const outputBuffer = await sharpInstance.toBuffer();
    const estimatedSize = outputBuffer.length;
    const savings = originalSize - estimatedSize;
    const pct = originalSize > 0 ? Math.round((savings / originalSize) * 100) : 0;

    res.json({
      original_size: originalSize,
      estimated_size: estimatedSize,
      savings,
      savings_pct: pct,
    });
  } catch (error) {
    res.status(500).json({ error: 'Preview failed: ' + error.message });
  }
});

// Bulk optimize multiple images
// Bulk AI: write missing SEO text for selected images. Fills only fields
// that are empty (existing text is never overwritten here) and tolerates
// per-image failures. Capped per invocation to bound cost and request time;
// its own tight limiter since each image is a paid vision call.
const bulkAnalyzeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, handler: json429 });
const BULK_ANALYZE_CAP = 10;
router.post('/bulk-analyze', bulkAnalyzeLimiter, async (req, res) => {
  try {
    const { image_ids } = req.body;
    if (!image_ids) {
      req.session.errorMessage = 'No images selected';
      return res.redirect('/images');
    }
    const allIds = Array.isArray(image_ids) ? image_ids : [image_ids];
    const ids = allIds.slice(0, BULK_ANALYZE_CAP);

    let filled = 0;
    let skippedComplete = 0;
    let failedCount = 0;
    let firstError = null;

    for (const id of ids) {
      try {
        const result = await db.query('SELECT * FROM images WHERE id = $1', [id]);
        if (result.rows.length === 0) continue;
        const image = result.rows[0];

        const missing = {
          alt_text: !(image.alt_text || '').trim(),
          title: !(image.title || '').trim(),
          description: !(image.description || '').trim(),
          tags: !(image.tags && image.tags.length),
        };
        if (!missing.alt_text && !missing.title && !missing.description && !missing.tags) {
          skippedComplete++;
          continue;
        }

        const imagePath = localPathFor(image.file_path);
        if (!fs.existsSync(imagePath)) {
          if (!image.cdn_url) throw new Error('file missing and no CDN URL');
          await fetchImageFromCdn(image);
        }
        const imageBuffer = fs.readFileSync(imagePath);
        const analysis = await analyzeImageWithAI(imageBuffer, image.mime_type, image.filename);

        await db.query(
          `UPDATE images SET
             alt_text = CASE WHEN $1 THEN $2 ELSE alt_text END,
             title = CASE WHEN $3 THEN $4 ELSE title END,
             description = CASE WHEN $5 THEN $6 ELSE description END,
             tags = CASE WHEN $7 THEN $8::text[] ELSE tags END,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $9`,
          [missing.alt_text, analysis.alt_text || '',
           missing.title, analysis.title || '',
           missing.description, analysis.description || '',
           missing.tags, Array.isArray(analysis.tags) ? analysis.tags : [],
           id]
        );
        filled++;
      } catch (err) {
        console.error('Bulk analyze error for image %s:', id, err.message);
        failedCount++;
        if (!firstError) firstError = err.message;
      }
    }

    let msg = `AI wrote SEO text for ${filled} image${filled !== 1 ? 's' : ''}`;
    if (skippedComplete > 0) msg += `. ${skippedComplete} already had every field filled`;
    if (allIds.length > BULK_ANALYZE_CAP) msg += `. Only the first ${BULK_ANALYZE_CAP} selected images were processed - run it again for the rest`;
    if (failedCount > 0) msg += `. ${failedCount} failed: ${firstError}`;
    req.session.successMessage = msg;
    const redirectTarget = isSafeRedirectPath(req.body.return_to) ? req.body.return_to : '/images';
    res.redirect(redirectTarget);
  } catch (error) {
    console.error('Bulk analyze error:', error);
    req.session.errorMessage = 'Bulk AI failed: ' + error.message;
    res.redirect('/images');
  }
});

router.post('/bulk-optimize', async (req, res) => {
  try {
    const { image_ids, format, quality } = req.body;
    if (!image_ids) {
      req.session.errorMessage = 'No images selected';
      return res.redirect('/images');
    }

    const ids = Array.isArray(image_ids) ? image_ids : [image_ids];
    const targetFormat = format || 'webp';
    const qualityInt = Math.min(100, Math.max(1, parseInt(quality) || 82));
    let totalSavings = 0;
    let optimizedCount = 0;
    let skippedAnimated = 0;
    let cdnFailed = 0;
    let cdnFailReason = null;

    for (const id of ids) {
      try {
        const result = await db.query('SELECT * FROM images WHERE id = $1', [id]);
        if (result.rows.length === 0) continue;
        const image = result.rows[0];

        if (image.mime_type === 'image/svg+xml') continue;

        let sourcePath = localPathFor(image.file_path);
        if (!fs.existsSync(sourcePath)) {
          try { sourcePath = await fetchImageFromCdn(image); } catch (e) { continue; }
        }

        const originalSize = fs.statSync(sourcePath).size;
        const meta = await sharp(sourcePath).metadata();
        const isAnimated = (meta.pages || 1) > 1;
        if (isAnimated && targetFormat !== 'webp') {
          // Converting an animated image to this format would flatten it
          skippedAnimated++;
          continue;
        }
        // .rotate() with no args applies EXIF orientation so the output isn't sideways
        let sharpInstance = sharp(sourcePath, { animated: isAnimated }).rotate();

        // Resize large images
        if (meta.width > 2400 || meta.height > 2400) {
          sharpInstance = sharpInstance.resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true });
        }

        let newExt, newMime;
        switch (targetFormat) {
          case 'webp': sharpInstance = sharpInstance.webp({ quality: qualityInt }); newExt = '.webp'; newMime = 'image/webp'; break;
          case 'avif': sharpInstance = sharpInstance.avif({ quality: qualityInt }); newExt = '.avif'; newMime = 'image/avif'; break;
          case 'jpeg': sharpInstance = sharpInstance.jpeg({ quality: qualityInt, mozjpeg: true }); newExt = '.jpg'; newMime = 'image/jpeg'; break;
          case 'png': sharpInstance = sharpInstance.png({ quality: qualityInt, compressionLevel: 9 }); newExt = '.png'; newMime = 'image/png'; break;
          default: continue;
        }

        const baseName = path.basename(image.filename, path.extname(image.filename));
        const newFilename = baseName + newExt;
        const dir = path.dirname(image.file_path);
        const newRelPath = path.join(dir, newFilename);
        const newFullPath = localPathFor(newRelPath);

        const destDir = path.dirname(newFullPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        await sharpInstance.toFile(newFullPath);

        const newMeta = await sharp(newFullPath).metadata();
        const newSize = fs.statSync(newFullPath).size;

        // Push to CDN first (sha needed when overwriting the same path)
        const newCdnUrl = buildCdnUrl(newRelPath);
        const fileBuffer = fs.readFileSync(newFullPath);
        const existingSha = await getGitHubFileSha(newRelPath);
        const ghResult = await pushToGitHub(newRelPath, fileBuffer, `Bulk optimize: ${newFilename}`, existingSha);

        const pathChanged = image.file_path !== newRelPath;
        if (!ghResult.pushed) {
          cdnFailed++;
          cdnFailReason = cdnFailReason || ghResult.reason;
          if (pathChanged) {
            // Keep the old format/URL rather than strand the image
            try { fs.unlinkSync(newFullPath); } catch (e) { /* ignore */ }
            continue;
          }
        }

        // Retire the old file only after a confirmed publish
        if (pathChanged) {
          const oldFullPath = localPathFor(image.file_path);
          if (fs.existsSync(oldFullPath)) {
            try { fs.unlinkSync(oldFullPath); } catch (e) { /* ignore */ }
          }
          try {
            const oldSha = await getGitHubFileSha(image.file_path);
            if (oldSha) await deleteFromGitHub(image.file_path, oldSha, `Remove old image: ${image.filename}`);
          } catch (e) { /* ignore cleanup errors */ }
        }

        // Update DB
        await db.query(
          `UPDATE images SET filename = $1, file_path = $2, file_size = $3, mime_type = $4, width = $5, height = $6, cdn_url = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8`,
          [newFilename, newRelPath, newSize, newMime, newMeta.width, newMeta.height, newCdnUrl, id]
        );

        totalSavings += (originalSize - newSize);
        optimizedCount++;
      } catch (err) {
        console.error('Bulk optimize error for image %s:', id, err);
      }
    }

    const savedFormatted = totalSavings > 1024 * 1024
      ? (totalSavings / (1024 * 1024)).toFixed(1) + ' MB'
      : (totalSavings / 1024).toFixed(1) + ' KB';

    let bulkMsg = `${optimizedCount} image${optimizedCount !== 1 ? 's' : ''} optimized to ${targetFormat.toUpperCase()}. Total savings: ${savedFormatted}`;
    if (skippedAnimated > 0) {
      bulkMsg += `. ${skippedAnimated} animated image${skippedAnimated !== 1 ? 's' : ''} skipped - convert those to WebP to keep the animation`;
    }
    if (cdnFailed > 0) {
      bulkMsg += `. Warning: ${cdnFailed} not pushed to CDN - ${describePushFailure(cdnFailReason)}`;
    }
    req.session.successMessage = bulkMsg;
    const redirectTarget = isSafeRedirectPath(req.body.return_to) ? req.body.return_to : '/images';
    res.redirect(redirectTarget);
  } catch (error) {
    console.error('Bulk optimize error:', error);
    req.session.errorMessage = 'Bulk optimization failed: ' + error.message;
    res.redirect('/images');
  }
});

// ==================== AI IMAGE ANALYSIS ====================

// Model is env-configurable so a retired ID needs a config change, not a
// deploy. claude-sonnet-5 is the current Sonnet-tier alias (same tier as the
// previously hardcoded Sonnet 4.5 snapshot).
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

// Forced tool call: the model must "call" this tool, so the reply arrives as
// a schema-validated tool_use block instead of free text that needs parsing.
const SEO_TOOL = {
  name: 'record_image_seo',
  description: 'Record the SEO metadata for the analyzed image.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['alt_text', 'title', 'description', 'tags'],
    properties: {
      alt_text: {
        type: 'string',
        description: 'Concise descriptive alt text for accessibility and SEO, 60-125 characters. Describe what the image shows naturally with relevant keywords.',
      },
      title: {
        type: 'string',
        description: 'A clear, keyword-rich title for the image, suitable as a tooltip and for AI crawlers.',
      },
      description: {
        type: 'string',
        description: 'A detailed 1-2 sentence description for Schema.org ImageObject markup. Mention the context, subject matter, and relevance to digital marketing services.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '4-8 lowercase tags for categorization.',
      },
    },
  },
};

// Helper: call Anthropic Claude Vision API to analyze an image
async function analyzeImageWithAI(imageBuffer, mimeType, filename) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to your environment variables.');
  }

  // Map MIME types for Anthropic API
  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  let mediaType = mimeType;
  if (!supportedTypes.includes(mediaType)) {
    // For SVG/AVIF, convert to PNG via sharp first
    const converted = await sharp(imageBuffer).png().toBuffer();
    return analyzeImageWithAI(converted, 'image/png', filename);
  }

  // Downscale before sending: the API rejects images over ~5MB / 8000px, and
  // beyond ~1568px on the long edge extra pixels only add cost, not analysis
  // accuracy. WebP keeps transparency, and sharp reads the actual bytes, so a
  // stale DB mime_type doesn't matter. If sharp can't decode, send as-is.
  try {
    imageBuffer = await sharp(imageBuffer)
      .rotate()
      .resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    mediaType = 'image/webp';
  } catch (e) {
    console.error('AI analyze: downscale failed, sending original bytes:', e.message);
  }

  const base64Image = imageBuffer.toString('base64');

  const requestBody = JSON.stringify({
    model: ANTHROPIC_MODEL,
    // Roomy budget: on current models adaptive thinking shares max_tokens
    // with the tool call, so a tight cap could truncate mid-analysis.
    max_tokens: 4096,
    tools: [SEO_TOOL],
    tool_choice: { type: 'tool', name: SEO_TOOL.name },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: `Analyze this image for SEO on a digital marketing agency website (WordsThatSells.website). The filename is: "${filename}"

Focus on: what the image depicts, its purpose on a marketing website, and relevant SEO keywords. Record the metadata with the ${SEO_TOOL.name} tool.`
          }
        ]
      }
    ]
  });

  // One automatic retry for transient failures (network, timeout, rate limit,
  // 5xx, truncation); permanent failures (bad key, refusal) surface at once.
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await requestSeoAnalysis(requestBody, apiKey);
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === 2) break;
      await sleep(2000);
    }
  }
  throw lastErr;
}

// Build a user-facing error: `message` is shown in the status box, `detail`
// keeps the raw cause for the collapsible "technical details", `retryable`
// drives the single automatic retry above.
function aiError(message, detail, retryable) {
  const err = new Error(message);
  err.detail = detail || '';
  err.retryable = !!retryable;
  return err;
}

// One POST /v1/messages attempt; resolves with the validated tool input.
function requestSeoAnalysis(requestBody, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(data);
        } catch (e) {
          return reject(aiError('The AI service returned an unreadable response. Try again.', data.slice(0, 200), true));
        }

        const apiDetail = body.error && body.error.message;
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(aiError('The AI service rejected the credentials. Check ANTHROPIC_API_KEY in the environment settings.', apiDetail));
        }
        if (res.statusCode === 404) {
          return reject(aiError(`The configured AI model "${ANTHROPIC_MODEL}" was not found - it may have been retired. Set ANTHROPIC_MODEL to a current model.`, apiDetail));
        }
        if (res.statusCode === 429) {
          return reject(aiError('The AI service is rate-limited right now. Wait a minute and try again.', apiDetail, true));
        }
        if (res.statusCode === 413) {
          return reject(aiError('The image is too large for the AI service even after resizing.', apiDetail));
        }
        if (res.statusCode >= 500) {
          return reject(aiError('The AI service is temporarily unavailable. Try again shortly.', apiDetail, true));
        }
        if (res.statusCode !== 200 || body.error) {
          return reject(aiError('The AI service rejected the request.', apiDetail || `HTTP ${res.statusCode}`));
        }

        if (body.stop_reason === 'refusal') {
          return reject(aiError('The AI declined to analyze this image.', body.stop_details && body.stop_details.explanation));
        }
        if (body.stop_reason === 'max_tokens') {
          return reject(aiError('The AI response was cut off before it finished. Try again.', 'stop_reason=max_tokens', true));
        }

        const toolBlock = (body.content || []).find(b => b.type === 'tool_use' && b.name === SEO_TOOL.name);
        const input = toolBlock && toolBlock.input;
        if (!input || typeof input.alt_text !== 'string' || typeof input.title !== 'string' ||
            typeof input.description !== 'string' || !Array.isArray(input.tags)) {
          return reject(aiError('The AI returned an unexpected response format. Try again.', 'content types: ' + (body.content || []).map(b => b.type).join(', '), true));
        }
        resolve(input);
      });
    });

    req.on('error', (e) => reject(aiError('Could not reach the AI service. Check the network and try again.', e.message, true)));
    req.setTimeout(120000, () => { req.destroy(); reject(aiError('AI analysis timed out. Try again.', 'timeout after 120s', true)); });
    req.write(requestBody);
    req.end();
  });
}

// Analyze existing image (from detail page)
router.post('/:id/analyze', analyzeLimiter, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = result.rows[0];

    // Read image from disk (fetch from CDN if not on disk - Railway ephemeral storage)
    const imagePath = localPathFor(image.file_path);
    let imageBuffer;
    if (fs.existsSync(imagePath)) {
      imageBuffer = fs.readFileSync(imagePath);
    } else if (image.cdn_url) {
      try {
        await fetchImageFromCdn(image);
        imageBuffer = fs.readFileSync(imagePath);
      } catch (cdnErr) {
        return res.status(404).json({ error: 'Image file not found on disk and could not be fetched from CDN' });
      }
    } else {
      return res.status(404).json({ error: 'Image file not found on disk and no CDN URL available' });
    }

    // CDN re-hydration can hand back an error page or truncated bytes; make
    // sure this is a decodable image before shipping it to the API.
    try {
      await sharp(imageBuffer).metadata();
    } catch (probeErr) {
      return res.status(422).json({
        error: 'The stored image file could not be read - it may be corrupted or missing from the CDN. Try re-uploading the image.',
        detail: probeErr.message,
      });
    }

    const analysis = await analyzeImageWithAI(imageBuffer, image.mime_type, image.filename);

    res.json({
      success: true,
      alt_text: analysis.alt_text || '',
      title: analysis.title || '',
      description: analysis.description || '',
      tags: Array.isArray(analysis.tags) ? analysis.tags.join(', ') : '',
    });
  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze image', detail: error.detail || undefined });
  }
});

// Analyze image during upload (before saving) - accepts file via multipart
router.post('/analyze-upload', analyzeLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    let imageBuffer;
    if (req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.file.path) {
      // Resolve and validate the file path to ensure it is under the upload root
      const resolvedPath = path.resolve(req.file.path);
      if (!isTempUpload(resolvedPath)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Uploaded file not found on disk' });
      }
      imageBuffer = fs.readFileSync(resolvedPath);
    } else {
      return res.status(400).json({ error: 'No image data available' });
    }

    const filename = req.file.originalname;
    const mimeType = req.file.mimetype;

    const analysis = await analyzeImageWithAI(imageBuffer, mimeType, filename);

    // Clean up temp file if multer saved to disk
    if (req.file.path) {
      const resolvedPath = path.resolve(req.file.path);
      if (isTempUpload(resolvedPath) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
    }

    res.json({
      success: true,
      alt_text: analysis.alt_text || '',
      title: analysis.title || '',
      description: analysis.description || '',
      tags: Array.isArray(analysis.tags) ? analysis.tags.join(', ') : '',
    });
  } catch (error) {
    console.error('Upload analysis error:', error);
    // Clean up temp file on error
    if (req.file && req.file.path) {
      const resolvedPath = path.resolve(req.file.path);
      if (isTempUpload(resolvedPath) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
    }
    res.status(500).json({ error: error.message || 'Failed to analyze image', detail: error.detail || undefined });
  }
});

// Image detail / edit
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Image not found';
      return res.redirect('/images');
    }

    const image = result.rows[0];
    image.file_size_formatted = formatFileSize(image.file_size || 0);
    image.web_url = `https://wordsthatsells.website/${image.file_path}`;

    const folders = await getFolderTree();

    // Get current folder name if assigned
    let currentFolderName = null;
    if (image.folder_id) {
      const folderResult = await db.query('SELECT name FROM image_folders WHERE id = $1', [image.folder_id]);
      if (folderResult.rows.length > 0) currentFolderName = folderResult.rows[0].name;
    }

    // Where this image is used, so URL-changing actions can be judged safely
    const references = await countImageReferences(image);

    res.render('images/detail', {
      title: (image.title || image.filename) + ' - Image Library',
      image,
      currentPage: 'images',
      folders,
      currentFolderName,
      references,
    });
  } catch (error) {
    console.error('Image detail error:', error);
    req.session.errorMessage = 'Failed to load image';
    res.redirect('/images');
  }
});

// Update SEO metadata
router.post('/:id', async (req, res) => {
  try {
    const { alt_text, title, description, category, tags, folder_id, prefer_first_party, cdn_url } = req.body;
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    // Optional: promote primary CDN URL to first-party site host so image-search
    // equity accrues to wordsthatsells.website (jsDelivr remains available via GH).
    let firstPartyCdn = null;
    if (prefer_first_party === '1' || prefer_first_party === 'on' || prefer_first_party === true) {
      const row = await db.query('SELECT file_path, filename FROM images WHERE id = $1', [req.params.id]);
      if (row.rows[0]) {
        const rel = (row.rows[0].file_path || ('images/' + row.rows[0].filename) || '')
          .replace(/^\/+/, '');
        const pathPart = rel.startsWith('images/') ? rel : `images/${rel}`;
        firstPartyCdn = `https://wordsthatsells.website/${pathPart}`;
      }
    } else if (typeof cdn_url === 'string' && /^https:\/\/wordsthatsells\.website\/images\//i.test(cdn_url.trim())) {
      firstPartyCdn = cdn_url.trim();
    }

    if (firstPartyCdn) {
      await db.query(
        `UPDATE images SET alt_text = $1, title = $2, description = $3, category = $4, tags = $5, folder_id = $6,
           cdn_url = $7, width = COALESCE(width, 1200), height = COALESCE(height, 628), updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [alt_text || '', title || '', description || '', category || 'general', tagsArray, folder_id || null, firstPartyCdn, req.params.id]
      );
      req.session.successMessage = 'Image metadata updated (first-party CDN URL)';
    } else {
      await db.query(
        `UPDATE images SET alt_text = $1, title = $2, description = $3, category = $4, tags = $5, folder_id = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [alt_text || '', title || '', description || '', category || 'general', tagsArray, folder_id || null, req.params.id]
      );
      req.session.successMessage = 'Image metadata updated';
    }

    res.redirect('/images/' + req.params.id);
  } catch (error) {
    console.error('Update image error:', error);
    req.session.errorMessage = 'Failed to update image';
    res.redirect('/images/' + req.params.id);
  }
});

// Rename image file
router.post('/:id/rename', async (req, res) => {
  try {
    const { new_filename } = req.body;
    if (!new_filename || !new_filename.trim()) {
      req.session.errorMessage = 'Filename cannot be empty';
      return res.redirect('/images/' + req.params.id);
    }

    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Image not found';
      return res.redirect('/images');
    }

    const image = result.rows[0];
    const ext = path.extname(image.filename);
    const slugged = slugifyFilename(new_filename + ext);
    if (!slugged) {
      req.session.errorMessage = 'Filename must contain letters or numbers';
      return res.redirect('/images/' + req.params.id);
    }
    const newFilename = slugged + ext;
    const dir = path.dirname(image.file_path);
    const newRelPath = path.join(dir, newFilename);

    if (newRelPath === image.file_path) {
      req.session.successMessage = 'Filename unchanged';
      return res.redirect('/images/' + req.params.id);
    }

    // Refuse to clobber another image (checks DB, repo, and local disk)
    if (await isPathTaken(newRelPath, image.id)) {
      req.session.errorMessage = `A file named ${newFilename} already exists - pick another name`;
      return res.redirect('/images/' + req.params.id);
    }

    // Get the bytes; the ephemeral disk may have lost them, so fall back to
    // re-fetching from the CDN.
    const oldFullPath = localPathFor(image.file_path);
    if (!fs.existsSync(oldFullPath)) {
      if (!image.cdn_url) {
        req.session.errorMessage = 'Image file not found on disk and no CDN URL to recover it from';
        return res.redirect('/images/' + req.params.id);
      }
      try {
        await fetchImageFromCdn(image);
      } catch (cdnErr) {
        req.session.errorMessage = 'Image file not found on disk and could not be fetched from CDN: ' + cdnErr.message;
        return res.redirect('/images/' + req.params.id);
      }
    }
    const fileBuffer = fs.readFileSync(oldFullPath);

    // Publish under the new name BEFORE touching anything else - on failure
    // the image stays fully intact under its old name.
    const ghResult = await pushToGitHub(newRelPath, fileBuffer, `Rename image: ${image.filename} -> ${newFilename}`);
    if (!ghResult.pushed) {
      req.session.errorMessage = 'Rename aborted - the new filename could not be published to the CDN, so nothing was changed. ' + describePushFailure(ghResult.reason);
      return res.redirect('/images/' + req.params.id);
    }

    // Retire the old repo file (best-effort; the new file is already live)
    let oldRemoved = false;
    try {
      const oldSha = await getGitHubFileSha(image.file_path);
      if (oldSha) {
        const del = await deleteFromGitHub(image.file_path, oldSha, `Remove old name: ${image.filename}`);
        oldRemoved = Boolean(del && del.deleted);
      }
    } catch (e) { /* a stale old file is harmless */ }

    // Local rename (ephemeral disk; failures don't matter)
    try {
      const newFullPath = localPathFor(newRelPath);
      const destDirLocal = path.dirname(newFullPath);
      if (!fs.existsSync(destDirLocal)) fs.mkdirSync(destDirLocal, { recursive: true });
      fs.renameSync(oldFullPath, newFullPath);
    } catch (e) { /* ignore */ }

    const newCdnUrl = buildCdnUrl(newRelPath);
    await db.query(
      `UPDATE images SET filename = $1, file_path = $2, cdn_url = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [newFilename, newRelPath, newCdnUrl, req.params.id]
    );

    let msg = `Image renamed to ${newFilename} and published to the CDN`;
    if (!oldRemoved) msg += '. Note: the old file could not be removed from the repo';
    const refs = await countImageReferences(image);
    if (refs.total > 0) {
      msg += `. Warning: the old URL is still referenced by ${describeReferences(refs)} - update those to the new URL`;
    }
    req.session.successMessage = msg;
    res.redirect('/images/' + req.params.id);
  } catch (error) {
    console.error('Rename error:', error);
    req.session.errorMessage = 'Failed to rename: ' + error.message;
    res.redirect('/images/' + req.params.id);
  }
});

// Re-upload / replace image file
router.post('/:id/reupload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      req.session.errorMessage = 'No image file selected';
      return res.redirect('/images/' + req.params.id);
    }

    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Image not found';
      return res.redirect('/images');
    }

    const image = result.rows[0];
    const optimize = req.body.optimize === 'on';
    const isSvg = /\.svg$/i.test(req.file.originalname);

    // Keep the same filename and path - just replace the file content
    const ext = path.extname(image.filename);
    let finalPath, fileSize, width, height, mimeType;

    // Determine where the file should go (validate paths to prevent traversal)
    const fullPath = localPathFor(image.file_path);
    // Rebuild the temp path from its basename under the fixed multer root
    // (multer stores flat, random-named files there). This breaks the taint
    // on req.file.path in a way static analysis recognizes; assertPathWithin
    // keeps the runtime guarantee.
    const uploadedPath = path.join(UPLOAD_TEMP_DIR, path.basename(req.file.path));
    assertPathWithin(uploadedPath, UPLOAD_TEMP_DIR);
    const destDir = path.dirname(fullPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (isSvg || !optimize) {
      // Save as-is
      fs.copyFileSync(uploadedPath, fullPath);
      fileSize = fs.statSync(fullPath).size;
      mimeType = req.file.mimetype;

      if (!isSvg) {
        try {
          const meta = await sharp(fullPath).metadata();
          width = meta.width;
          height = meta.height;
        } catch (e) { /* ignore */ }
      }
    } else {
      // Recompress in place, keeping the image's current format and URL -
      // the UI promises "the CDN URL stays the same". GIFs are saved as-is
      // because re-encoding would flatten the animation.
      const fmt = ext.toLowerCase();
      if (fmt === '.gif') {
        fs.copyFileSync(uploadedPath, fullPath);
        fileSize = fs.statSync(fullPath).size;
        mimeType = 'image/gif';
        try {
          const meta = await sharp(fullPath).metadata();
          width = meta.width;
          height = meta.height;
        } catch (e) { /* ignore */ }
      } else {
        const meta = await sharp(uploadedPath).metadata();
        let resizeOpts = {};
        if (meta.width > 2400 || meta.height > 2400) {
          resizeOpts = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true };
        }
        // Only WebP can carry the source's animation; other targets
        // inherently flatten to one frame.
        const animatedSrc = (meta.pages || 1) > 1 && fmt === '.webp';
        let inst = sharp(uploadedPath, { animated: animatedSrc }).rotate().resize(resizeOpts);
        switch (fmt) {
          case '.jpg':
          case '.jpeg':
            inst = inst.jpeg({ quality: 82, mozjpeg: true }); mimeType = 'image/jpeg'; break;
          case '.png':
            inst = inst.png({ compressionLevel: 9 }); mimeType = 'image/png'; break;
          case '.avif':
            inst = inst.avif({ quality: 60 }); mimeType = 'image/avif'; break;
          case '.webp':
          default:
            inst = inst.webp({ quality: 82 }); mimeType = 'image/webp'; break;
        }
        await inst.toFile(fullPath);
        const optimizedMeta = await sharp(fullPath).metadata();
        width = optimizedMeta.width;
        height = optimizedMeta.height;
        fileSize = fs.statSync(fullPath).size;
      }
    }

    // Clean up temp file (validated path)
    cleanupTempFile(uploadedPath);

    // Push to GitHub (get existing SHA first for update)
    const sha = await getGitHubFileSha(image.file_path);
    const fileBuffer = fs.readFileSync(fullPath);
    const ghResult = await pushToGitHub(image.file_path, fileBuffer, `Re-upload image: ${image.filename}`, sha);

    // Update file metadata in DB (keep all SEO fields)
    await db.query(
      `UPDATE images SET file_size = $1, mime_type = $2, width = $3, height = $4, original_filename = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [fileSize, mimeType, width, height, req.file.originalname, req.params.id]
    );

    let msg = 'Image replaced successfully';
    if (ghResult.pushed) msg += ' and pushed to CDN';
    else msg += '. Warning: ' + describePushFailure(ghResult.reason);
    req.session.successMessage = msg;
    res.redirect('/images/' + req.params.id);
  } catch (error) {
    console.error('Re-upload error:', error);
    if (req.file) cleanupTempFile(req.file.path);
    req.session.errorMessage = 'Re-upload failed: ' + error.message;
    res.redirect('/images/' + req.params.id);
  }
});

// Download image
router.get('/:id/download', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).send('Image not found');
    }

    const image = result.rows[0];
    const fullPath = localPathFor(image.file_path);

    // Try local file first, fall back to CDN redirect
    if (fs.existsSync(fullPath)) {
      return res.download(fullPath, image.filename);
    }

    // Local file missing (Railway ephemeral storage) - redirect to CDN
    if (image.cdn_url) {
      return res.redirect(image.cdn_url);
    }

    res.status(404).send('File not found on disk and no CDN URL available');
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Download failed');
  }
});

// Archive image (soft delete: keeps the row and the file, just hides it)
router.post('/:id/delete', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Image not found';
      return res.redirect('/images');
    }

    const image = result.rows[0];

    // Soft delete: mark as archived
    await db.query("UPDATE images SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);

    req.session.successMessage = `Image "${image.filename}" archived - find it under the Archived filter to restore it`;
    res.redirect('/images');
  } catch (error) {
    console.error('Archive image error:', error);
    req.session.errorMessage = 'Failed to archive image';
    res.redirect('/images');
  }
});

// Restore an archived image back into the library
router.post('/:id/restore', async (req, res) => {
  try {
    await db.query("UPDATE images SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    req.session.successMessage = 'Image restored to the library';
  } catch (error) {
    console.error('Restore image error:', error);
    req.session.errorMessage = 'Failed to restore image: ' + error.message;
  }
  res.redirect('/images?status=archived');
});

// Permanently delete image (removes the DB row, the local working copy, and the
// file from the GitHub repo / CDN). This is irreversible, unlike archiving.
router.post('/:id/destroy', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.errorMessage = 'Image not found';
      return res.redirect('/images');
    }

    const image = result.rows[0];

    // Remove the local working copy if it's present.
    try {
      const fullPath = localPathFor(image.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (e) {
      console.error('Local file delete failed:', e.message);
    }

    // Remove from the GitHub repo so it leaves the CDN.
    let ghNote = '';
    const sha = await getGitHubFileSha(image.file_path);
    if (sha) {
      const ghDel = await deleteFromGitHub(image.file_path, sha, `Delete image: ${image.filename}`);
      if (!ghDel.deleted) ghNote = '. Warning: removed from library but not from CDN - ' + describePushFailure(ghDel.reason);
    } else if (process.env.GITHUB_TOKEN) {
      // No sha found (already gone or unreadable) - purge cache just in case.
      await purgeJsDelivr(image.file_path);
    }

    // Remove the database row last, so a failure above doesn't orphan the file.
    await db.query('DELETE FROM images WHERE id = $1', [req.params.id]);

    req.session.successMessage = `Image "${image.filename}" permanently deleted${ghNote}`;
    res.redirect('/images');
  } catch (error) {
    console.error('Permanent delete error:', error);
    req.session.errorMessage = 'Failed to delete image: ' + error.message;
    res.redirect('/images');
  }
});

// API: Get image data as JSON (for copy URL, etc.)
router.get('/:id/json', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const img = result.rows[0];
    res.json({
      id: img.id,
      filename: img.filename,
      cdn_url: img.cdn_url,
      web_url: `https://wordsthatsells.website/${img.file_path}`,
      alt_text: img.alt_text,
      title: img.title,
      width: img.width,
      height: img.height,
      html_tag: `<img src="${img.cdn_url}" alt="${(img.alt_text || '').replace(/"/g, '&quot;')}" width="${img.width || ''}" height="${img.height || ''}" loading="lazy" decoding="async">`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load image data' });
  }
});

// API: List images as JSON for image selector
router.get('/api/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';

    let query = 'SELECT * FROM images';
    let countQuery = 'SELECT COUNT(*) FROM images';
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push(`(filename ILIKE $${params.length + 1} OR alt_text ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (category) {
      conditions.push(`category = $${params.length + 1}`);
      params.push(category);
    }

    conditions.push("status = 'active'");

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [images, count] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params),
    ]);

    const totalPages = Math.ceil(count.rows[0].count / limit);

    res.json({
      images: images.rows.map(img => ({
        id: img.id,
        filename: img.filename,
        cdn_url: img.cdn_url,
        alt_text: img.alt_text,
        title: img.title,
        width: img.width,
        height: img.height,
        category: img.category,
      })),
      pagination: {
        page,
        totalPages,
        total: parseInt(count.rows[0].count),
      }
    });
  } catch (error) {
    console.error('Image list API error:', error);
    res.status(500).json({ error: 'Failed to load images' });
  }
});

module.exports = router;
