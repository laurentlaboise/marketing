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
          published_url TEXT,
          category VARCHAR(100),
          tags TEXT[],
          seo_title VARCHAR(255),
          seo_description TEXT,
          seo_keywords TEXT[],
          status VARCHAR(50) DEFAULT 'draft',
          featured BOOLEAN DEFAULT FALSE,
          author_id UUID REFERENCES users(id),
          published_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add featured column if it doesn't exist (for existing tables)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='featured') THEN
            ALTER TABLE articles ADD COLUMN featured BOOLEAN DEFAULT FALSE;
          END IF;
        END $$;
      `);

      // Add published_url column if it doesn't exist (for existing tables)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='published_url') THEN
            ALTER TABLE articles ADD COLUMN published_url TEXT;
          END IF;
        END $$;
      `);

      // Add time_to_read column if it doesn't exist (for existing tables)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='time_to_read') THEN
            ALTER TABLE articles ADD COLUMN time_to_read INTEGER;
          END IF;
        END $$;
      `);

      // Add article_code column if it doesn't exist (for existing tables)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='article_code') THEN
            ALTER TABLE articles ADD COLUMN article_code TEXT;
          END IF;
        END $$;
      `);

      // Add article_images column if it doesn't exist (for existing tables)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='article_images') THEN
            ALTER TABLE articles ADD COLUMN article_images JSONB DEFAULT '[]'::jsonb;
          END IF;
        END $$;
      `);

      // Add social preview / Open Graph / Twitter Card columns to articles
      await client.query(`
        DO $$
        BEGIN
          -- Open Graph fields
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='og_title') THEN
            ALTER TABLE articles ADD COLUMN og_title VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='og_description') THEN
            ALTER TABLE articles ADD COLUMN og_description TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='og_image') THEN
            ALTER TABLE articles ADD COLUMN og_image TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='og_type') THEN
            ALTER TABLE articles ADD COLUMN og_type VARCHAR(50) DEFAULT 'article';
          END IF;
          -- Twitter Card fields
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='twitter_card') THEN
            ALTER TABLE articles ADD COLUMN twitter_card VARCHAR(50) DEFAULT 'summary_large_image';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='twitter_title') THEN
            ALTER TABLE articles ADD COLUMN twitter_title VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='twitter_description') THEN
            ALTER TABLE articles ADD COLUMN twitter_description VARCHAR(500);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='twitter_image') THEN
            ALTER TABLE articles ADD COLUMN twitter_image TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='twitter_site') THEN
            ALTER TABLE articles ADD COLUMN twitter_site VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='twitter_creator') THEN
            ALTER TABLE articles ADD COLUMN twitter_creator VARCHAR(100);
          END IF;
          -- Additional SEO/social fields
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='canonical_url') THEN
            ALTER TABLE articles ADD COLUMN canonical_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='robots_meta') THEN
            ALTER TABLE articles ADD COLUMN robots_meta VARCHAR(255) DEFAULT 'index, follow';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='schema_markup') THEN
            ALTER TABLE articles ADD COLUMN schema_markup JSONB;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='citations') THEN
            ALTER TABLE articles ADD COLUMN citations JSONB DEFAULT '[]'::jsonb;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='content_labels') THEN
            ALTER TABLE articles ADD COLUMN content_labels JSONB DEFAULT '{}'::jsonb;
          END IF;
        END $$;
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

      // Add new seo_terms columns
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='seo_terms' AND column_name='slug') THEN
            ALTER TABLE seo_terms ADD COLUMN slug VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='seo_terms' AND column_name='short_definition') THEN
            ALTER TABLE seo_terms ADD COLUMN short_definition TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='seo_terms' AND column_name='bullets') THEN
            ALTER TABLE seo_terms ADD COLUMN bullets JSONB DEFAULT '[]'::jsonb;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='seo_terms' AND column_name='video_url') THEN
            ALTER TABLE seo_terms ADD COLUMN video_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='seo_terms' AND column_name='featured_image') THEN
            ALTER TABLE seo_terms ADD COLUMN featured_image TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='seo_terms' AND column_name='article_link') THEN
            ALTER TABLE seo_terms ADD COLUMN article_link TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='seo_terms' AND column_name='glossary_link') THEN
            ALTER TABLE seo_terms ADD COLUMN glossary_link TEXT;
          END IF;
        END $$;
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

      // Add new glossary columns
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='glossary' AND column_name='slug') THEN
            ALTER TABLE glossary ADD COLUMN slug VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='glossary' AND column_name='video_url') THEN
            ALTER TABLE glossary ADD COLUMN video_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='glossary' AND column_name='featured_image') THEN
            ALTER TABLE glossary ADD COLUMN featured_image TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='glossary' AND column_name='article_link') THEN
            ALTER TABLE glossary ADD COLUMN article_link TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='glossary' AND column_name='bullets') THEN
            ALTER TABLE glossary ADD COLUMN bullets JSONB DEFAULT '[]'::jsonb;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='glossary' AND column_name='example') THEN
            ALTER TABLE glossary ADD COLUMN example TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='glossary' AND column_name='categories') THEN
            ALTER TABLE glossary ADD COLUMN categories TEXT[];
          END IF;
        END $$;
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

      // Social Campaigns table
      await client.query(`
        CREATE TABLE IF NOT EXISTS social_campaigns (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          objective VARCHAR(100),
          status VARCHAR(50) DEFAULT 'draft',
          labels TEXT[],
          color VARCHAR(20) DEFAULT '#667eea',
          budget DECIMAL(10,2),
          budget_currency VARCHAR(10) DEFAULT 'USD',
          start_date DATE,
          end_date DATE,
          targeting JSONB DEFAULT '{}',
          utm_source VARCHAR(255),
          utm_medium VARCHAR(255),
          utm_campaign VARCHAR(255),
          utm_term VARCHAR(255),
          utm_content VARCHAR(255),
          author_id UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Hashtag Sets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS hashtag_sets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          hashtags TEXT[] NOT NULL DEFAULT '{}',
          category VARCHAR(100),
          platforms TEXT[],
          usage_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add new columns to social_posts if missing
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='campaign_id') THEN
            ALTER TABLE social_posts ADD COLUMN campaign_id UUID REFERENCES social_campaigns(id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='content_type') THEN
            ALTER TABLE social_posts ADD COLUMN content_type VARCHAR(50) DEFAULT 'text';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='hashtags') THEN
            ALTER TABLE social_posts ADD COLUMN hashtags TEXT[];
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='targeting') THEN
            ALTER TABLE social_posts ADD COLUMN targeting JSONB DEFAULT '{}';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='utm_params') THEN
            ALTER TABLE social_posts ADD COLUMN utm_params JSONB DEFAULT '{}';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='labels') THEN
            ALTER TABLE social_posts ADD COLUMN labels TEXT[];
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='approval_status') THEN
            ALTER TABLE social_posts ADD COLUMN approval_status VARCHAR(50) DEFAULT 'none';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='notes') THEN
            ALTER TABLE social_posts ADD COLUMN notes TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='link_url') THEN
            ALTER TABLE social_posts ADD COLUMN link_url TEXT;
          END IF;
        END $$;
      `);

      // Microsites table
      await client.query(`
        CREATE TABLE IF NOT EXISTS microsites (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          description TEXT,
          purpose VARCHAR(100) DEFAULT 'landing',
          status VARCHAR(50) DEFAULT 'draft',
          primary_domain VARCHAR(255),
          github_repo VARCHAR(255),
          github_branch VARCHAR(100) DEFAULT 'main',
          deploy_platform VARCHAR(50),
          deploy_url TEXT,
          deploy_webhook TEXT,
          env_vars JSONB DEFAULT '{}',
          seo_title VARCHAR(255),
          seo_description TEXT,
          seo_keywords TEXT[],
          og_title VARCHAR(255),
          og_description TEXT,
          og_image TEXT,
          schema_markup JSONB,
          robots_txt TEXT,
          sitemap_url TEXT,
          analytics_id VARCHAR(100),
          template VARCHAR(100),
          settings JSONB DEFAULT '{}',
          ssl_status VARCHAR(50) DEFAULT 'unknown',
          last_deployed_at TIMESTAMP,
          author_id UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Microsite Domains table
      await client.query(`
        CREATE TABLE IF NOT EXISTS microsite_domains (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          microsite_id UUID REFERENCES microsites(id) ON DELETE CASCADE,
          domain VARCHAR(255) NOT NULL,
          type VARCHAR(50) DEFAULT 'primary',
          ssl_status VARCHAR(50) DEFAULT 'pending',
          dns_verified BOOLEAN DEFAULT FALSE,
          expires_at DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Microsite Deployments table
      await client.query(`
        CREATE TABLE IF NOT EXISTS microsite_deployments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          microsite_id UUID REFERENCES microsites(id) ON DELETE CASCADE,
          status VARCHAR(50) DEFAULT 'pending',
          trigger VARCHAR(50) DEFAULT 'manual',
          commit_sha VARCHAR(100),
          commit_message TEXT,
          build_log TEXT,
          duration_seconds INTEGER,
          deployed_by UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Notifications table
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id),
          type VARCHAR(50) DEFAULT 'info',
          title VARCHAR(255) NOT NULL,
          message TEXT,
          link TEXT,
          read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

      // Images table
      await client.query(`
        CREATE TABLE IF NOT EXISTS images (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          original_filename VARCHAR(500) NOT NULL,
          filename VARCHAR(500) NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          mime_type VARCHAR(100),
          width INTEGER,
          height INTEGER,
          alt_text TEXT,
          title VARCHAR(500),
          description TEXT,
          category VARCHAR(100) DEFAULT 'general',
          tags TEXT[],
          cdn_url TEXT,
          status VARCHAR(50) DEFAULT 'active',
          uploaded_by UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
