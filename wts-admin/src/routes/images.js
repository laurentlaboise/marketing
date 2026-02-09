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

// ==================== IMAGE LIBRARY ====================

// List all images
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 24;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
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

    // Also scan the filesystem for untracked images
    const totalPages = Math.ceil(count.rows[0].count / limit);

    res.render('images/library', {
      title: 'Image Library - WTS Admin',
      images: images.rows.map(img => ({
        ...img,
        file_size_formatted: formatFileSize(img.file_size || 0),
      })),
      currentPage: 'images',
      view,
      pagination: { page, totalPages, search, category },
    });
  } catch (error) {
    console.error('Image library error:', error);
    res.render('images/library', {
      title: 'Image Library - WTS Admin',
      images: [],
      currentPage: 'images',
      view: 'grid',
      pagination: { page: 1, totalPages: 0, search: '', category: '' },
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
router.get('/upload', (req, res) => {
  res.render('images/upload', {
    title: 'Upload Image - WTS Admin',
    currentPage: 'images',
    githubConfigured: !!process.env.GITHUB_TOKEN,
  });
});

// Handle upload
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      req.session.errorMessage = 'No image file selected';
      return res.redirect('/images/upload');
    }

    const { alt_text, title, description, category, tags, optimize } = req.body;
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
      `INSERT INTO images (original_filename, filename, file_path, file_size, mime_type, width, height, alt_text, title, description, category, tags, cdn_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [req.file.originalname, finalFilename, relPath, fileSize, mimeType, width, height, alt_text || '', title || '', description || '', category || 'general', tagsArray, cdnUrl, req.user.id]
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

    res.render('images/detail', {
      title: (image.title || image.filename) + ' - Image Library',
      image,
      currentPage: 'images',
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
    const { alt_text, title, description, category, tags } = req.body;
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    await db.query(
      `UPDATE images SET alt_text = $1, title = $2, description = $3, category = $4, tags = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [alt_text || '', title || '', description || '', category || 'general', tagsArray, req.params.id]
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
