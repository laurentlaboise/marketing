const express = require('express');
const { ensureAuthenticated, logActivity } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const db = require('../../database/db');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

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
  return `${CDN_CONFIG.baseUrl}/${CDN_CONFIG.user}/${CDN_CONFIG.repo}@${CDN_CONFIG.branch}/${clean}`;
}

// Image directory in the main marketing repo
const IMAGES_DIR = path.resolve(__dirname, '../../../images');

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

    for (const file of imageFiles) {
      // Check if already tracked
      const existing = await db.query('SELECT id FROM images WHERE file_path = $1', [file.relPath]);
      if (existing.rows.length > 0) continue;

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

    req.session.successMessage = `Synced ${synced} new image${synced !== 1 ? 's' : ''} from filesystem`;
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

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    // Build paths
    const relPath = catDir ? `images/${catDir}/${finalFilename}` : `images/${finalFilename}`;
    const cdnUrl = buildCdnUrl(relPath);
    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

    // Save to database
    const result = await db.query(
      `INSERT INTO images (original_filename, filename, file_path, file_size, mime_type, width, height, alt_text, title, description, category, tags, cdn_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [req.file.originalname, finalFilename, relPath, fileSize, mimeType, width, height, alt_text || '', title || '', description || '', category || 'general', tagsArray, cdnUrl, req.user.id]
    );

    req.session.successMessage = `Image uploaded successfully${optimize === 'on' && !isSvg ? ' (optimized to WebP)' : ''}`;
    res.redirect('/images/' + result.rows[0].id);
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
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

// Download image
router.get('/:id/download', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM images WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).send('Image not found');
    }

    const image = result.rows[0];
    const fullPath = path.resolve(__dirname, '../../../', image.file_path);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).send('File not found on disk');
    }

    res.download(fullPath, image.filename);
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

module.exports = router;
