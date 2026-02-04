const { Pool } = require('pg');

// Database connection configuration
function getConnectionConfig() {
  // Railway provides DATABASE_URL or individual PG* variables
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  }

  // Fallback to individual environment variables
  if (process.env.PGHOST) {
    return {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || '5432'),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  }

  // Local development fallback
  return {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'wts_admin'
  };
}

const pool = new Pool(getConnectionConfig());

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Database operations
const db = {
  // Query helper
  query: async (text, params) => {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      if (process.env.NODE_ENV !== 'production') {
        console.log('Query executed:', { text: text.substring(0, 50), duration, rows: result.rowCount });
      }
      return result;
    } catch (error) {
      console.error('Database query error:', error.message);
      throw error;
    }
  },

  // Get a client from the pool
  getClient: async () => {
    return await pool.connect();
  },

  // Initialize database tables
  initialize: async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255),
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          role VARCHAR(50) DEFAULT 'user',
          avatar_url TEXT,
          provider VARCHAR(50) DEFAULT 'local',
          provider_id VARCHAR(255),
          email_verified BOOLEAN DEFAULT FALSE,
          verification_token VARCHAR(255),
          reset_token VARCHAR(255),
          reset_token_expires TIMESTAMP,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // User sessions table (for connect-pg-simple)
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          sid VARCHAR NOT NULL PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS IDX_session_expire ON user_sessions (expire)
      `);

      // Articles table
      await client.query(`
        CREATE TABLE IF NOT EXISTS articles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(500) NOT NULL,
          slug VARCHAR(500) UNIQUE NOT NULL,
          content TEXT,
          excerpt TEXT,
          featured_image TEXT,
          category VARCHAR(100),
          tags TEXT[],
          seo_title VARCHAR(255),
          seo_description TEXT,
          seo_keywords TEXT[],
          status VARCHAR(50) DEFAULT 'draft',
          author_id UUID REFERENCES users(id),
          published_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // SEO Terms table
      await client.query(`
        CREATE TABLE IF NOT EXISTS seo_terms (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          term VARCHAR(255) NOT NULL,
          definition TEXT,
          category VARCHAR(100),
          related_terms TEXT[],
          examples TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // AI Tools table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_tools (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(100),
          website_url TEXT,
          pricing_model VARCHAR(100),
          features TEXT[],
          pros TEXT[],
          cons TEXT[],
          rating DECIMAL(3,2),
          logo_url TEXT,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Glossary table
      await client.query(`
        CREATE TABLE IF NOT EXISTS glossary (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          term VARCHAR(255) NOT NULL,
          definition TEXT NOT NULL,
          category VARCHAR(100),
          related_terms TEXT[],
          letter CHAR(1),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Affiliate Solutions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS affiliate_solutions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          commission_rate VARCHAR(100),
          cookie_duration VARCHAR(100),
          payout_threshold DECIMAL(10,2),
          affiliate_url TEXT,
          category VARCHAR(100),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Agencies table
      await client.query(`
        CREATE TABLE IF NOT EXISTS agencies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          services TEXT[],
          contact_email VARCHAR(255),
          contact_phone VARCHAR(50),
          website_url TEXT,
          logo_url TEXT,
          location VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Automations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS automations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          trigger_type VARCHAR(100),
          trigger_config JSONB,
          action_type VARCHAR(100),
          action_config JSONB,
          status VARCHAR(50) DEFAULT 'inactive',
          last_run TIMESTAMP,
          run_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Products table
      await client.query(`
        CREATE TABLE IF NOT EXISTS products (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          price DECIMAL(10,2),
          currency VARCHAR(10) DEFAULT 'USD',
          category VARCHAR(100),
          features TEXT[],
          image_url TEXT,
          status VARCHAR(50) DEFAULT 'active',
          stripe_product_id VARCHAR(255),
          stripe_price_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Price Models table
      await client.query(`
        CREATE TABLE IF NOT EXISTS price_models (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          type VARCHAR(50),
          base_price DECIMAL(10,2),
          billing_cycle VARCHAR(50),
          features JSONB,
          limits JSONB,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Social Posts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS social_posts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          media_urls TEXT[],
          platforms TEXT[],
          scheduled_at TIMESTAMP,
          published_at TIMESTAMP,
          status VARCHAR(50) DEFAULT 'draft',
          author_id UUID REFERENCES users(id),
          engagement_data JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Social Channels table
      await client.query(`
        CREATE TABLE IF NOT EXISTS social_channels (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          platform VARCHAR(100) NOT NULL,
          account_name VARCHAR(255),
          account_id VARCHAR(255),
          access_token TEXT,
          refresh_token TEXT,
          token_expires TIMESTAMP,
          followers_count INTEGER,
          status VARCHAR(50) DEFAULT 'active',
          settings JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Activity Logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id),
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(100),
          entity_id UUID,
          details JSONB,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Guides (E-Guides) table
      await client.query(`
        CREATE TABLE IF NOT EXISTS guides (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(500) NOT NULL,
          slug VARCHAR(500) UNIQUE NOT NULL,
          short_description TEXT,
          long_content TEXT,
          category VARCHAR(100),
          icon VARCHAR(100),
          image_url TEXT,
          pdf_url TEXT,
          video_url TEXT,
          status VARCHAR(50) DEFAULT 'draft',
          author_id UUID REFERENCES users(id),
          published_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query('COMMIT');
      console.log('Database tables initialized successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Database initialization error:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Close pool
  close: async () => {
    await pool.end();
  }
};

module.exports = db;
