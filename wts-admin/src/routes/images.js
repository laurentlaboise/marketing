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

// Root directory for uploaded files handled by this router.
const UPLOAD_ROOT = path.join(__dirname, '../../../uploads');

/**
 * Validate that a redirect path is a safe, application-local path.
 *
 * Rules:
 * - Must be a string.
 * - Must start with a single "/" (application-relative).
 * - Must not start with "//" (protocol-relative external URL).
 * - Must not contain a URL scheme like "http:" or "https:" at the start.
 */
function isSafeRedirectPath(p) {
  if (typeof p !== 'string') {
    return false;
  }

  // Trim whitespace to avoid hiding unsafe prefixes
  const trimmed = p.trim();

  // Must start with "/" (app-relative)
  if (!trimmed.startsWith('/')) {
    return false;
  }

  // Reject protocol-relative URLs (e.g., "//evil.com")
  if (trimmed.startsWith('//')) {
    return false;
  }

  // Reject explicit URL schemes (e.g., "http://", "https://")
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return false;
  }

  return true;
}

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

const imagesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
router.use(imagesLimiter);

// CDN configuration
const CDN_CONFIG = {
  baseUrl: 'https://cdn.jsdelivr.net/gh',
  user: 'laurentlaboise',
  repo: 'marketing',
  branch: 'main',
};

function buildCdnUrl(filePath) {
  const clean = filePath.replace(/^\/+/, '');
  // Encode each path segment to handle spaces and special chars in filenames
  const encoded = clean.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `${CDN_CONFIG.baseUrl}/${CDN_CONFIG.user}/${CDN_CONFIG.repo}@${CDN_CONFIG.branch}/${encoded}`;
}

// Image directory in the main marketing repo
const IMAGES_DIR = path.resolve(__dirname, '../../../images');
const UPLOAD_TEMP_DIR = path.resolve(__dirname, '../../uploads/temp');

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
          const localPath = path.resolve(__dirname, '../../../', image.file_path);
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

// Validate a resolved path stays within an allowed parent directory (prevents path traversal)
function assertPathWithin(filePath, parentDir) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(parentDir + path.sep) && resolved !== parentDir) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

// Safely remove a temp upload file after validating its path
function cleanupTempFile(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (resolved.startsWith(UPLOAD_TEMP_DIR + path.sep) && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
}

// Multer config for temp uploads
const upload = multer({
  dest: path.join(__dirname, '../../uploads/temp'),
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
        'Authorization': `token ${token}`,
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

// Push a file to the GitHub repo so it's available on the CDN
// Pass sha to update an existing file (required by GitHub API for replacements)
async function pushToGitHub(repoPath, fileBuffer, commitMessage, sha) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GITHUB_TOKEN not set - image will not be pushed to repo/CDN');
    return { pushed: false, reason: 'no_token' };
  }

  const content = fileBuffer.toString('base64');

  const payload = {
    message: commitMessage,
    content,
    branch: CDN_CONFIG.branch,
  };
  if (sha) payload.sha = sha;

  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}/contents/${repoPath}`,
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'WTS-Admin-ImageLibrary',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          resolve({ pushed: true });
        } else {
          console.error('GitHub API error:', res.statusCode, data.substring(0, 500));
          resolve({ pushed: false, reason: `github_${res.statusCode}`, details: data.substring(0, 200) });
        }
      });
    });

    req.on('error', (err) => {
      console.error('GitHub API request error:', err.message);
      resolve({ pushed: false, reason: 'network_error', details: err.message });
    });

    req.write(body);
    req.end();
  });
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
      conditions.push(`(filename ILIKE $${params.length + 1} OR alt_text ILIKE $${params.length + 1} OR title ILIKE $${params.length + 1})`);
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

    conditions.push("status = 'active'");

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
      pagination: { page, totalPages, search, category, folder: folderId },
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
      pagination: { page: 1, totalPages: 0, search: '', category: '', folder: '' },
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

// Upload form
router.get('/upload', async (req, res) => {
  const folders = await getFolderTree();
  res.render('images/upload', {
    title: 'Upload Image - WTS Admin',
    currentPage: 'images',
    githubConfigured: !!process.env.GITHUB_TOKEN,
    folders,
    preselectedFolder: req.query.folder || '',
  });
});

// Multi-upload form
router.get('/upload-multiple', async (req, res) => {
  const folders = await getFolderTree();
  res.render('images/upload-multiple', {
    title: 'Upload Multiple Images - WTS Admin',
    currentPage: 'images',
    githubConfigured: !!process.env.GITHUB_TOKEN,
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
    const errors = [];

    for (const file of req.files) {
      try {
        const seoFilename = slugifyFilename(file.originalname);
        const isSvg = /\.svg$/i.test(file.originalname);

        let finalFilename, finalPath, fileSize, width, height, mimeType;

        if (isSvg || !shouldOptimize) {
          const ext = path.extname(file.originalname).toLowerCase();
          finalFilename = seoFilename + ext;
          const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
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
          finalFilename = seoFilename + '.webp';
          const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          finalPath = path.join(destDir, finalFilename);

          const sharpInstance = sharp(file.path);
          const meta = await sharpInstance.metadata();

          let resizeOpts = {};
          if (meta.width > 2400 || meta.height > 2400) {
            resizeOpts = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true };
          }

          await sharpInstance
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

        // Push to GitHub CDN
        const fileBuffer = fs.readFileSync(finalPath);
        await pushToGitHub(relPath, fileBuffer, `Upload image: ${finalFilename}`);

        // Save to database
        await db.query(
          `INSERT INTO images (original_filename, filename, file_path, file_size, mime_type, width, height, alt_text, title, description, category, tags, cdn_url, folder_id, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [file.originalname, finalFilename, relPath, fileSize, mimeType, width, height, '', '', '', category || 'general', [], cdnUrl, folder_id || null, req.user.id]
        );

        uploaded++;
        totalSize += fileSize;
      } catch (fileErr) {
        console.error(`Failed to upload ${file.originalname}:`, fileErr);
        cleanupTempFile(file.path);
        failed++;
        errors.push(file.originalname);
      }
    }

    const sizeFormatted = totalSize > 1024 * 1024
      ? (totalSize / (1024 * 1024)).toFixed(1) + ' MB'
      : (totalSize / 1024).toFixed(1) + ' KB';

    let msg = `${uploaded} image${uploaded !== 1 ? 's' : ''} uploaded (${sizeFormatted})`;
    if (shouldOptimize) msg += ', optimized to WebP';
    if (failed > 0) msg += `. ${failed} failed: ${errors.join(', ')}`;
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
      finalFilename = seoFilename + ext;
      const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
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
      finalFilename = seoFilename + '.webp';
      const destDir = catDir ? path.join(IMAGES_DIR, catDir) : IMAGES_DIR;
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      finalPath = path.join(destDir, finalFilename);

      const sharpInstance = sharp(req.file.path);
      const meta = await sharpInstance.metadata();

      // Resize if larger than 2400px on either dimension
      let resizeOpts = {};
      if (meta.width > 2400 || meta.height > 2400) {
        resizeOpts = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true };
      }

      await sharpInstance
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
    } else if (ghResult.reason === 'no_token') {
      msg += '. Warning: GITHUB_TOKEN not configured - image is stored locally only and will not appear on CDN.';
    } else {
      msg += `. Warning: Failed to push to GitHub (${ghResult.reason}) - image may not appear on CDN.`;
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
    let sourcePath = path.resolve(__dirname, '../../../', image.file_path);
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
    let sharpInstance = sharp(sourcePath);
    const meta = await sharpInstance.metadata();

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
    const targetFormat = format || 'webp';
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
    const newFullPath = assertPathWithin(path.resolve(__dirname, '../../../', newRelPath), IMAGES_DIR);

    // Process and save
    const destDir = path.dirname(newFullPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    await sharpInstance.toFile(newFullPath);

    // Get new metadata
    const newMeta = await sharp(newFullPath).metadata();
    const newSize = fs.statSync(newFullPath).size;

    // If format changed, delete old file (if different path)
    const oldFullPath = path.resolve(__dirname, '../../../', image.file_path);
    if (oldFullPath !== newFullPath && fs.existsSync(oldFullPath)) {
      fs.unlinkSync(oldFullPath);
    }

    // Push to GitHub CDN
    const newCdnUrl = buildCdnUrl(newRelPath);
    const fileBuffer = fs.readFileSync(newFullPath);
    const ghResult = await pushToGitHub(newRelPath, fileBuffer, `Optimize image: ${newFilename}`);

    // If file changed names, also delete old file from GitHub
    if (image.file_path !== newRelPath) {
      try {
        const oldSha = await getGitHubFileSha(image.file_path);
        if (oldSha) {
          await pushToGitHub(image.file_path, Buffer.from(''), `Remove old image: ${image.filename}`, oldSha);
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
      cdn_url: newCdnUrl,
    });
  } catch (error) {
    console.error('Image optimization error:', error);
    res.status(500).json({ error: 'Optimization failed: ' + error.message });
  }
});

// Preview optimization (returns estimated size without saving)
router.post('/:id/optimize-preview', async (req, res) => {
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

    let sourcePath = path.resolve(__dirname, '../../../', image.file_path);
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
    let sharpInstance = sharp(sourcePath);

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

    for (const id of ids) {
      try {
        const result = await db.query('SELECT * FROM images WHERE id = $1', [id]);
        if (result.rows.length === 0) continue;
        const image = result.rows[0];

        if (image.mime_type === 'image/svg+xml') continue;

        let sourcePath = path.resolve(__dirname, '../../../', image.file_path);
        if (!fs.existsSync(sourcePath)) {
          try { sourcePath = await fetchImageFromCdn(image); } catch (e) { continue; }
        }

        const originalSize = fs.statSync(sourcePath).size;
        let sharpInstance = sharp(sourcePath);
        const meta = await sharpInstance.metadata();

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
        const newFullPath = assertPathWithin(path.resolve(__dirname, '../../../', newRelPath), IMAGES_DIR);

        const destDir = path.dirname(newFullPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        await sharpInstance.toFile(newFullPath);

        const newMeta = await sharp(newFullPath).metadata();
        const newSize = fs.statSync(newFullPath).size;

        // Delete old file if name changed
        const oldFullPath = path.resolve(__dirname, '../../../', image.file_path);
        if (oldFullPath !== newFullPath && fs.existsSync(oldFullPath)) {
          fs.unlinkSync(oldFullPath);
        }

        // Push to CDN
        const newCdnUrl = buildCdnUrl(newRelPath);
        const fileBuffer = fs.readFileSync(newFullPath);
        await pushToGitHub(newRelPath, fileBuffer, `Bulk optimize: ${newFilename}`);

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

    req.session.successMessage = `${optimizedCount} image${optimizedCount !== 1 ? 's' : ''} optimized to ${targetFormat.toUpperCase()}. Total savings: ${savedFormatted}`;
    const redirectTarget = isSafeRedirectPath(req.body.return_to) ? req.body.return_to : '/images';
    res.redirect(redirectTarget);
  } catch (error) {
    console.error('Bulk optimize error:', error);
    req.session.errorMessage = 'Bulk optimization failed: ' + error.message;
    res.redirect('/images');
  }
});

// ==================== AI IMAGE ANALYSIS ====================

// Helper: call Anthropic Claude Vision API to analyze an image
async function analyzeImageWithAI(imageBuffer, mimeType, filename) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Add it to your environment variables.');
  }

  // Convert image to base64
  const base64Image = imageBuffer.toString('base64');

  // Map MIME types for Anthropic API
  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  let mediaType = mimeType;
  if (!supportedTypes.includes(mediaType)) {
    // For SVG/AVIF, convert to PNG via sharp first
    const converted = await sharp(imageBuffer).png().toBuffer();
    return analyzeImageWithAI(converted, 'image/png', filename);
  }

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
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
            text: `Analyze this image for SEO optimization on a digital marketing agency website (WordsThatSells.website). The filename is: "${filename}"

Return ONLY valid JSON (no markdown, no code fences) with these exact fields:
{
  "alt_text": "Concise descriptive alt text for accessibility and SEO, 60-125 characters. Describe what the image shows naturally with relevant keywords.",
  "title": "A clear, keyword-rich title for the image, suitable as a tooltip and for AI crawlers.",
  "description": "A detailed 1-2 sentence description for Schema.org ImageObject markup. Mention the context, subject matter, and relevance to digital marketing services.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Tags should be lowercase, relevant for categorization. Include 4-8 tags.
Focus on: what the image depicts, its purpose on a marketing website, and relevant SEO keywords.`
          }
        ]
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const options = {
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
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || 'Anthropic API error'));
            return;
          }

          // Extract text content from response
          const textBlock = response.content && response.content.find(b => b.type === 'text');
          if (!textBlock || !textBlock.text) {
            reject(new Error('No text response from AI'));
            return;
          }

          // Parse JSON from the response (strip any markdown fences if present)
          let jsonText = textBlock.text.trim();
          jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
          const result = JSON.parse(jsonText);
          resolve(result);
        } catch (e) {
          reject(new Error('Failed to parse AI response: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(new Error('API request failed: ' + e.message)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('API request timed out')); });
    req.write(requestBody);
    req.end();
  });
}

// Analyze existing image (from detail page)
router.post('/:id/analyze', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = result.rows[0];

    // Read image from disk (fetch from CDN if not on disk - Railway ephemeral storage)
    const imagePath = path.join(__dirname, '../../../', image.file_path);
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
    res.status(500).json({ error: error.message || 'Failed to analyze image' });
  }
});

// Analyze image during upload (before saving) - accepts file via multipart
router.post('/analyze-upload', upload.single('image'), async (req, res) => {
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
      if (!resolvedPath.startsWith(UPLOAD_ROOT)) {
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
      if (resolvedPath.startsWith(UPLOAD_ROOT) && fs.existsSync(resolvedPath)) {
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
      if (resolvedPath.startsWith(UPLOAD_ROOT) && fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
    }
    res.status(500).json({ error: error.message || 'Failed to analyze image' });
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

    res.render('images/detail', {
      title: (image.title || image.filename) + ' - Image Library',
      image,
      currentPage: 'images',
      folders,
      currentFolderName,
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
    const { alt_text, title, description, category, tags, folder_id } = req.body;
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    await db.query(
      `UPDATE images SET alt_text = $1, title = $2, description = $3, category = $4, tags = $5, folder_id = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [alt_text || '', title || '', description || '', category || 'general', tagsArray, folder_id || null, req.params.id]
    );

    req.session.successMessage = 'Image metadata updated';
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
    const oldFullPath = path.resolve(__dirname, '../../../', image.file_path);
    const ext = path.extname(image.filename);
    const slugged = slugifyFilename(new_filename + ext);
    const newFilename = slugged + ext;

    // Build new paths
    const dir = path.dirname(image.file_path);
    const newRelPath = path.join(dir, newFilename);
    const newFullPath = path.resolve(__dirname, '../../../', newRelPath);

    // Rename on filesystem
    if (fs.existsSync(oldFullPath)) {
      fs.renameSync(oldFullPath, newFullPath);
    }

    const newCdnUrl = buildCdnUrl(newRelPath);

    await db.query(
      `UPDATE images SET filename = $1, file_path = $2, cdn_url = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [newFilename, newRelPath, newCdnUrl, req.params.id]
    );

    req.session.successMessage = `Image renamed to ${newFilename}`;
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
    const fullPath = assertPathWithin(path.resolve(__dirname, '../../../', image.file_path), IMAGES_DIR);
    assertPathWithin(req.file.path, UPLOAD_TEMP_DIR);
    const destDir = path.dirname(fullPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (isSvg || !optimize) {
      // Save as-is
      fs.copyFileSync(req.file.path, fullPath);
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
      // If the existing file is WebP, optimize to WebP
      // If it's a different format, convert to WebP and update the filename/path
      const isWebp = ext.toLowerCase() === '.webp';

      if (isWebp) {
        // Replace in-place as WebP
        const sharpInstance = sharp(req.file.path);
        const meta = await sharpInstance.metadata();
        let resizeOpts = {};
        if (meta.width > 2400 || meta.height > 2400) {
          resizeOpts = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true };
        }
        await sharpInstance.resize(resizeOpts).webp({ quality: 82 }).toFile(fullPath);
        const optimizedMeta = await sharp(fullPath).metadata();
        width = optimizedMeta.width;
        height = optimizedMeta.height;
        fileSize = fs.statSync(fullPath).size;
        mimeType = 'image/webp';
      } else {
        // Convert to WebP - update filename and path
        const baseName = path.basename(image.filename, ext);
        const newFilename = baseName + '.webp';
        const dir = path.dirname(image.file_path);
        const newRelPath = path.join(dir, newFilename);
        const newFullPath = assertPathWithin(path.resolve(__dirname, '../../../', newRelPath), IMAGES_DIR);

        const sharpInstance = sharp(req.file.path);
        const meta = await sharpInstance.metadata();
        let resizeOpts = {};
        if (meta.width > 2400 || meta.height > 2400) {
          resizeOpts = { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true };
        }
        await sharpInstance.resize(resizeOpts).webp({ quality: 82 }).toFile(newFullPath);
        const optimizedMeta = await sharp(newFullPath).metadata();
        width = optimizedMeta.width;
        height = optimizedMeta.height;
        fileSize = fs.statSync(newFullPath).size;
        mimeType = 'image/webp';

        // Update DB with new filename/path
        const newCdnUrl = buildCdnUrl(newRelPath);
        await db.query(
          `UPDATE images SET filename = $1, file_path = $2, cdn_url = $3 WHERE id = $4`,
          [newFilename, newRelPath, newCdnUrl, req.params.id]
        );

        // Push new file to GitHub
        const fileBuffer = fs.readFileSync(newFullPath);
        const ghResult = await pushToGitHub(newRelPath, fileBuffer, `Re-upload image: ${newFilename}`);

        // Clean up temp file (validated path)
        cleanupTempFile(req.file.path);

        // Update file metadata in DB
        await db.query(
          `UPDATE images SET file_size = $1, mime_type = $2, width = $3, height = $4, original_filename = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
          [fileSize, mimeType, width, height, req.file.originalname, req.params.id]
        );

        let msg = 'Image replaced successfully (converted to WebP)';
        if (ghResult.pushed) msg += ' and pushed to CDN';
        else if (ghResult.reason === 'no_token') msg += '. Warning: not pushed to CDN (no GITHUB_TOKEN)';
        req.session.successMessage = msg;
        return res.redirect('/images/' + req.params.id);
      }
    }

    // Clean up temp file (validated path)
    cleanupTempFile(req.file.path);

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
    else if (ghResult.reason === 'no_token') msg += '. Warning: not pushed to CDN (no GITHUB_TOKEN)';
    else msg += `. Warning: CDN push failed (${ghResult.reason})`;
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
    const fullPath = path.resolve(__dirname, '../../../', image.file_path);

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

// Delete image
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

    req.session.successMessage = `Image "${image.filename}" archived`;
    res.redirect('/images');
  } catch (error) {
    console.error('Delete image error:', error);
    req.session.errorMessage = 'Failed to delete image';
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
