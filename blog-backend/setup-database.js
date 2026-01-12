// One-time database setup script
// Run this once to create the articles table

const pool = require('./db');

async function setupDatabase() {
  console.log('🔧 Starting database setup...\n');

  try {
    // Create articles table
    console.log('Creating articles table...');
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
    console.log('✅ Articles table created');

    // Create indexes
    console.log('Creating indexes...');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(is_published)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC)');
    console.log('✅ Indexes created');

    // Create update function
    console.log('Creating update function...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    console.log('✅ Update function created');

    // Create trigger
    console.log('Creating trigger...');
    await pool.query(`
      DROP TRIGGER IF EXISTS update_articles_updated_at ON articles
    `);
    await pool.query(`
      CREATE TRIGGER update_articles_updated_at
      BEFORE UPDATE ON articles
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('✅ Trigger created');

    // Verify table exists
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'articles'
    `);

    if (result.rows.length > 0) {
      console.log('\n🎉 Database setup completed successfully!');
      console.log('✅ Articles table is ready');
      console.log('\n📝 You can now start creating articles!\n');
    } else {
      console.log('\n❌ Table verification failed');
    }

  } catch (error) {
    console.error('❌ Error during database setup:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

setupDatabase();
