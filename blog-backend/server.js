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

// ============================================================
// AUTO-CREATE GUIDES TABLE ON STARTUP
// ============================================================
const initializeDatabase = async () => {
      try {
                // Create guides table if it doesn't exist
                await pool.query(`
                            CREATE TABLE IF NOT EXISTS guides (
                                            id SERIAL PRIMARY KEY,
                                                            title VARCHAR(255) NOT NULL,
                                                                            slug VARCHAR(255) UNIQUE NOT NULL,
                                                                                            description TEXT,
                                                                                                            sidebar_content TEXT,
                                                                                                                            featured_image_url VARCHAR(500),
                                                                                                                                            categories TEXT[],
                                                                                                                                                            table_of_contents JSONB,
                                                                                                                                                                            estimated_read_time_minutes INTEGER,
                                                                                                                                                                                            difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('Beginner', 'Intermediate', 'Advanced')),
                                                                                                                                                                                                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                                                                                                                                                                                                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                                                                                                                                                                                                                                            is_published BOOLEAN DEFAULT FALSE,
                                                                                                                                                                                                                                                            full_guide_content TEXT
                                                                                                                                                                                                                                                                        );
                                                                                                                                                                                                                                                                                `);

                // Create indexes
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_guides_slug ON guides(slug);`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_guides_published ON guides(is_published);`);
                await pool.query(`CREATE INDEX IF NOT EXISTS idx_guides_categories ON guides USING GIN(categories);`);

                console.log('✅ Database initialized: guides table ready');
      } catch (error) {
                console.error('❌ Database initialization error:', error.message);
      }
};

// Note: Database initialization now runs AFTER server starts
// This prevents blocking the server startup if DB is slow/unavailable
// ============================================================
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
    const { title, description, sidebar_content, full_article_content, featured_image_url, categories, content } = req.body;

    // Handle both old (content) and new (sidebar_content/full_article_content) field names for backwards compatibility
    const sidebarContentValue = sidebar_content || content;
    const fullArticleContentValue = full_article_content || content;

    // Validation
    if (!title || !description || !sidebarContentValue) {
      return res.status(400).json({ error: 'Title, description, and sidebar content are required' });
    }

    const slug = titleToSlug(title);
    const categoriesArray = Array.isArray(categories) ? categories : [];

    const result = await pool.query(
      `INSERT INTO articles (title, slug, description, sidebar_content, full_article_content, featured_image_url, categories, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, slug, description, sidebarContentValue, fullArticleContentValue, featured_image_url || null, categoriesArray, true]
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
    const { title, description, sidebar_content, full_article_content, featured_image_url, categories, is_published, content } = req.body;

    // Handle both old (content) and new (sidebar_content/full_article_content) field names for backwards compatibility
    const sidebarContentValue = sidebar_content || content;
    const fullArticleContentValue = full_article_content || content;

    const result = await pool.query(
      `UPDATE articles
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           sidebar_content = COALESCE($3, sidebar_content),
           full_article_content = COALESCE($4, full_article_content),
           featured_image_url = COALESCE($5, featured_image_url),
           categories = COALESCE($6, categories),
           is_published = COALESCE($7, is_published),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [title, description, sidebarContentValue, fullArticleContentValue, featured_image_url, categories, is_published, id]
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

// ============================================================
// GUIDES API ROUTES
// ============================================================

// GET all published guides
app.get('/api/guides', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, slug, description, sidebar_content, featured_image_url, 
                    categories, table_of_contents, estimated_read_time_minutes, 
                    difficulty_level, created_at, updated_at, is_published
             FROM guides 
             WHERE is_published = true 
             ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching guides:', error);
        res.status(500).json({ error: 'Failed to fetch guides' });
    }
});

// GET single guide by slug
app.get('/api/guides/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await pool.query(
            `SELECT * FROM guides WHERE slug = $1 AND is_published = true`,
            [slug]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Guide not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching guide:', error);
        res.status(500).json({ error: 'Failed to fetch guide' });
    }
});

// GET guides by category
app.get('/api/guides/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const result = await pool.query(
            `SELECT id, title, slug, description, sidebar_content, featured_image_url, 
                    categories, table_of_contents, estimated_read_time_minutes, 
                    difficulty_level, created_at, updated_at
             FROM guides 
             WHERE is_published = true AND $1 = ANY(categories)
             ORDER BY created_at DESC`,
            [category]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching guides by category:', error);
        res.status(500).json({ error: 'Failed to fetch guides' });
    }
});

// GET guides by difficulty
app.get('/api/guides/difficulty/:level', async (req, res) => {
    try {
        const { level } = req.params;
        const result = await pool.query(
            `SELECT id, title, slug, description, sidebar_content, featured_image_url, 
                    categories, table_of_contents, estimated_read_time_minutes, 
                    difficulty_level, created_at, updated_at
             FROM guides 
             WHERE is_published = true AND difficulty_level = $1
             ORDER BY created_at DESC`,
            [level]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching guides by difficulty:', error);
        res.status(500).json({ error: 'Failed to fetch guides' });
    }
});

// POST create new guide
app.post('/api/guides', async (req, res) => {
    try {
        const {
            title, slug, description, sidebar_content, featured_image_url,
            categories, table_of_contents, estimated_read_time_minutes,
            difficulty_level, is_published, full_guide_content
        } = req.body;
        const result = await pool.query(
            `INSERT INTO guides (
                title, slug, description, sidebar_content, featured_image_url,
                categories, table_of_contents, estimated_read_time_minutes,
                difficulty_level, is_published, full_guide_content
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [title, slug, description, sidebar_content, featured_image_url,
             categories, table_of_contents, estimated_read_time_minutes,
             difficulty_level, is_published || false, full_guide_content]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating guide:', error);
        res.status(500).json({ error: 'Failed to create guide' });
    }
});

// PUT update guide
app.put('/api/guides/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const {
            title, description, sidebar_content, featured_image_url,
            categories, table_of_contents, estimated_read_time_minutes,
            difficulty_level, is_published, full_guide_content
        } = req.body;
        const result = await pool.query(
            `UPDATE guides SET
                title = COALESCE($1, title),
                description = COALESCE($2, description),
                sidebar_content = COALESCE($3, sidebar_content),
                featured_image_url = COALESCE($4, featured_image_url),
                categories = COALESCE($5, categories),
                table_of_contents = COALESCE($6, table_of_contents),
                estimated_read_time_minutes = COALESCE($7, estimated_read_time_minutes),
                difficulty_level = COALESCE($8, difficulty_level),
                is_published = COALESCE($9, is_published),
                full_guide_content = COALESCE($10, full_guide_content),
                updated_at = CURRENT_TIMESTAMP
            WHERE slug = $11
            RETURNING *`,
            [title, description, sidebar_content, featured_image_url,
             categories, table_of_contents, estimated_read_time_minutes,
             difficulty_level, is_published, full_guide_content, slug]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Guide not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating guide:', error);
        res.status(500).json({ error: 'Failed to update guide' });
    }
});

// DELETE guide
app.delete('/api/guides/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await pool.query(
            'DELETE FROM guides WHERE slug = $1 RETURNING id, title',
            [slug]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Guide not found' });
        }
        res.json({ message: 'Guide deleted', deleted: result.rows[0] });
    } catch (error) {
        console.error('Error deleting guide:', error);
        res.status(500).json({ error: 'Failed to delete guide' });
    }
});

// ============================================================
// END GUIDES ROUTES
// ============================================================

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

// ==================== DATABASE MIGRATION ====================

// Migrate content field to sidebar_content and add full_article_content
app.get('/api/migrate-content-fields', async (req, res) => {
  try {
    console.log('🔄 Starting database migration for content fields...');

    // Check if sidebar_content column exists (migration already done)
    const checkColumn = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'articles'
        AND column_name = 'sidebar_content'
      )
    `);

    if (checkColumn.rows[0].exists) {
      return res.json({
        success: true,
        message: '✅ Migration already completed! Fields: sidebar_content, full_article_content',
        alreadyMigrated: true
      });
    }

    // Step 1: Rename content to sidebar_content
    await pool.query(`
      ALTER TABLE articles
      RENAME COLUMN content TO sidebar_content
    `);
    console.log('✅ Renamed content → sidebar_content');

    // Step 2: Add full_article_content column
    await pool.query(`
      ALTER TABLE articles
      ADD COLUMN full_article_content TEXT
    `);
    console.log('✅ Added full_article_content column');

    // Step 3: Copy sidebar_content to full_article_content for existing articles
    await pool.query(`
      UPDATE articles
      SET full_article_content = sidebar_content
      WHERE full_article_content IS NULL
    `);
    console.log('✅ Copied existing content to both fields');

    res.json({
      success: true,
      message: '✅ Migration completed successfully!',
      details: {
        renamed: 'content → sidebar_content',
        added: 'full_article_content',
        note: 'Existing articles have content in both fields'
      }
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
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
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Blog API running on http://0.0.0.0:${PORT}`);
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
  
  // Initialize database AFTER server starts successfully
  // This allows server to respond to health checks even if DB is slow
  console.log('🔄 Initializing database...');
  initializeDatabase().catch(err => {
    console.error('❌ Database initialization failed (server still running):', err.message);
  });
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
