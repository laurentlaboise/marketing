// server.js - Main Express server
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const pool = require('./db');

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Helper: Convert title to slug
function titleToSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ==================== ARTICLE ROUTES ====================

// GET all published articles
app.get('/api/articles', async (req, res) => {
  try {
    const category = req.query.category;
    const search = req.query.search;

    let query = 'SELECT * FROM articles WHERE is_published = TRUE';
    let params = [];

    if (category && category !== 'All') {
      query += ` AND $${params.length + 1} = ANY(categories)`;
      params.push(category);
    }

    if (search) {
      query += ` AND (title ILIKE $${params.length + 1} OR description ILIKE $${params.length + 2})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching articles:', err);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// GET single article by slug
app.get('/api/articles/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await pool.query(
      'SELECT * FROM articles WHERE slug = $1 AND is_published = TRUE',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching article:', err);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// POST: Create new article (Admin)
app.post('/api/articles', async (req, res) => {
  try {
    const { title, description, content, featured_image_url, categories } = req.body;

    // Validation
    if (!title || !description || !content) {
      return res.status(400).json({ error: 'Title, description, and content are required' });
    }

    const slug = titleToSlug(title);
    const categoriesArray = Array.isArray(categories) ? categories : [];

    const result = await pool.query(
      `INSERT INTO articles (title, slug, description, content, featured_image_url, categories, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, slug, description, content, featured_image_url || null, categoriesArray, true]
    );

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      article: result.rows[0],
    });
  } catch (err) {
    console.error('Error creating article:', err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Article with this title already exists' });
    }
    res.status(500).json({ error: 'Failed to create article' });
  }
});

// PUT: Update article
app.put('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, content, featured_image_url, categories, is_published } = req.body;

    const result = await pool.query(
      `UPDATE articles
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           content = COALESCE($3, content),
           featured_image_url = COALESCE($4, featured_image_url),
           categories = COALESCE($5, categories),
           is_published = COALESCE($6, is_published),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [title, description, content, featured_image_url, categories, is_published, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({
      success: true,
      message: 'Article updated successfully',
      article: result.rows[0],
    });
  } catch (err) {
    console.error('Error updating article:', err);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// DELETE article
app.delete('/api/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM articles WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({ success: true, message: 'Article deleted successfully' });
  } catch (err) {
    console.error('Error deleting article:', err);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// GET all categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT unnest(categories) as category
       FROM articles
       WHERE is_published = TRUE
       ORDER BY category`
    );

    const categories = result.rows.map(row => row.category);
    res.json(categories);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== ONE-TIME DATABASE SETUP ====================

app.get('/api/setup-database', async (req, res) => {
  try {
    console.log('🔧 Starting one-time database setup...');

    // Check if table already exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'articles'
      )
    `);

    if (checkTable.rows[0].exists) {
      return res.json({
        success: true,
        message: '✅ Articles table already exists! Database is ready.',
        alreadySetup: true
      });
    }

    // Create articles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        featured_image_url VARCHAR(500),
        categories TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_published BOOLEAN DEFAULT FALSE
      )
    `);

    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(is_published)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC)');

    // Create update function
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Create trigger
    await pool.query(`
      DROP TRIGGER IF EXISTS update_articles_updated_at ON articles
    `);
    await pool.query(`
      CREATE TRIGGER update_articles_updated_at
      BEFORE UPDATE ON articles
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);

    console.log('✅ Database setup completed successfully!');

    res.json({
      success: true,
      message: '🎉 Database setup completed! Articles table created with all indexes and triggers.',
      setupComplete: true,
      nextSteps: [
        'Visit /api/articles to verify (should return empty array [])',
        'Open admin panel to start creating articles',
        'This endpoint can be safely removed after setup'
      ]
    });

  } catch (error) {
    console.error('❌ Database setup error:', error);
    res.status(500).json({
      success: false,
      error: 'Database setup failed',
      message: error.message
    });
  }
});

// ==================== ROOT ROUTE ====================

// Root endpoint for testing
app.get('/', (req, res) => {
  res.json({
    message: 'Blog API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      articles: '/api/articles',
      categories: '/api/categories'
    }
  });
});

// ==================== ERROR HANDLING ====================
// IMPORTANT: These handlers must be defined AFTER all routes

// 404 handler - catches all undefined routes
app.use((req, res, next) => {
  console.log(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler - must have 4 parameters (err, req, res, next)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Blog API running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Routes registered:`);
  console.log(`   GET  /`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/articles`);
  console.log(`   GET  /api/articles/:slug`);
  console.log(`   POST /api/articles`);
  console.log(`   PUT  /api/articles/:id`);
  console.log(`   DELETE /api/articles/:id`);
  console.log(`   GET  /api/categories\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});
