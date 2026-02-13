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

      // Add enhanced product fields for service page integration
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='slug') THEN
            ALTER TABLE products ADD COLUMN slug VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='service_page') THEN
            ALTER TABLE products ADD COLUMN service_page VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='icon_class') THEN
            ALTER TABLE products ADD COLUMN icon_class VARCHAR(100) DEFAULT 'fas fa-box';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='animation_class') THEN
            ALTER TABLE products ADD COLUMN animation_class VARCHAR(100) DEFAULT 'kinetic-pulse-float';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sort_order') THEN
            ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_type') THEN
            ALTER TABLE products ADD COLUMN product_type VARCHAR(50) DEFAULT 'service';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='download_url') THEN
            ALTER TABLE products ADD COLUMN download_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='slide_in_title') THEN
            ALTER TABLE products ADD COLUMN slide_in_title VARCHAR(500);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='slide_in_subtitle') THEN
            ALTER TABLE products ADD COLUMN slide_in_subtitle TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='slide_in_content') THEN
            ALTER TABLE products ADD COLUMN slide_in_content TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='slide_in_image') THEN
            ALTER TABLE products ADD COLUMN slide_in_image TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='slide_in_video') THEN
            ALTER TABLE products ADD COLUMN slide_in_video TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_featured') THEN
            ALTER TABLE products ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
          END IF;
        END $$;
      `);

      // Sidebar Items table (for editable sidebar navigation on public site)
      await client.query(`
        CREATE TABLE IF NOT EXISTS sidebar_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          label VARCHAR(255) NOT NULL,
          url VARCHAR(500),
          icon_class VARCHAR(100) DEFAULT 'fas fa-link',
          parent_id UUID REFERENCES sidebar_items(id) ON DELETE CASCADE,
          section VARCHAR(100) NOT NULL,
          sort_order INTEGER DEFAULT 0,
          is_visible BOOLEAN DEFAULT TRUE,
          open_in_new_tab BOOLEAN DEFAULT FALSE,
          css_class VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add page-specific sidebar fields
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sidebar_items' AND column_name='page_url') THEN
            ALTER TABLE sidebar_items ADD COLUMN page_url VARCHAR(500);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sidebar_items' AND column_name='content_html') THEN
            ALTER TABLE sidebar_items ADD COLUMN content_html TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sidebar_items' AND column_name='button_label') THEN
            ALTER TABLE sidebar_items ADD COLUMN button_label VARCHAR(255) DEFAULT 'Help';
          END IF;
        END $$;
      `);

      // Orders table (for Stripe payment tracking)
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id UUID REFERENCES products(id),
          customer_email VARCHAR(255) NOT NULL,
          customer_name VARCHAR(255),
          amount DECIMAL(10,2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD',
          stripe_session_id VARCHAR(255),
          stripe_payment_intent VARCHAR(255),
          status VARCHAR(50) DEFAULT 'pending',
          download_count INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}',
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

      // Add enhanced pricing columns for subscription packages
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='slug') THEN
            ALTER TABLE price_models ADD COLUMN slug VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='highlight') THEN
            ALTER TABLE price_models ADD COLUMN highlight BOOLEAN DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='badge_text') THEN
            ALTER TABLE price_models ADD COLUMN badge_text VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='annual_discount_pct') THEN
            ALTER TABLE price_models ADD COLUMN annual_discount_pct INTEGER DEFAULT 20;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='sort_order') THEN
            ALTER TABLE price_models ADD COLUMN sort_order INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='cta_text') THEN
            ALTER TABLE price_models ADD COLUMN cta_text VARCHAR(255) DEFAULT 'Choose Plan';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='cta_url') THEN
            ALTER TABLE price_models ADD COLUMN cta_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='icon_class') THEN
            ALTER TABLE price_models ADD COLUMN icon_class VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='upsell_text') THEN
            ALTER TABLE price_models ADD COLUMN upsell_text TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='upsell_target_id') THEN
            ALTER TABLE price_models ADD COLUMN upsell_target_id UUID;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='pay_as_you_go_text') THEN
            ALTER TABLE price_models ADD COLUMN pay_as_you_go_text VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='trial_days') THEN
            ALTER TABLE price_models ADD COLUMN trial_days INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='currency') THEN
            ALTER TABLE price_models ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='stripe_price_id_monthly') THEN
            ALTER TABLE price_models ADD COLUMN stripe_price_id_monthly VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_models' AND column_name='stripe_price_id_yearly') THEN
            ALTER TABLE price_models ADD COLUMN stripe_price_id_yearly VARCHAR(255);
          END IF;
        END $$;
      `);

      // Pricing Features catalog (manages the feature list & categories for comparison)
      await client.query(`
        CREATE TABLE IF NOT EXISTS pricing_features (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          category_name VARCHAR(255) NOT NULL,
          category_icon VARCHAR(100) DEFAULT 'fas fa-cog',
          feature_key VARCHAR(100) NOT NULL UNIQUE,
          feature_name VARCHAR(255) NOT NULL,
          feature_description TEXT,
          sort_order INTEGER DEFAULT 0,
          category_sort_order INTEGER DEFAULT 0,
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

      // Form Submissions table (consultation, free-support, affiliate, white-label)
      await client.query(`
        CREATE TABLE IF NOT EXISTS form_submissions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          form_type VARCHAR(100) NOT NULL,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          company VARCHAR(255),
          phone VARCHAR(50),
          message TEXT,
          status VARCHAR(50) DEFAULT 'new',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Form Templates table (dynamic form builder)
      await client.query(`
        CREATE TABLE IF NOT EXISTS form_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          form_type VARCHAR(100) UNIQUE NOT NULL,
          title VARCHAR(255) NOT NULL,
          subtitle TEXT,
          fields JSONB DEFAULT '[]',
          submit_button_text VARCHAR(100) DEFAULT 'Submit',
          success_message TEXT DEFAULT 'Thank you! Your request has been submitted successfully.',
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Form buttons table (linked buttons for form templates)
      await client.query(`
        CREATE TABLE IF NOT EXISTS form_buttons (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          form_type VARCHAR(100) NOT NULL REFERENCES form_templates(form_type) ON UPDATE CASCADE ON DELETE CASCADE,
          button_label VARCHAR(255) NOT NULL DEFAULT 'Submit',
          page_url VARCHAR(500),
          style_preset VARCHAR(50) DEFAULT 'primary',
          custom_css TEXT,
          custom_js TEXT,
          rel_nofollow BOOLEAN DEFAULT false,
          rel_noopener BOOLEAN DEFAULT true,
          rel_noreferrer BOOLEAN DEFAULT false,
          target_blank BOOLEAN DEFAULT false,
          sort_order INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Image folders table
      await client.query(`
        CREATE TABLE IF NOT EXISTS image_folders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) NOT NULL,
          parent_id UUID REFERENCES image_folders(id) ON DELETE CASCADE,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
          folder_id UUID REFERENCES image_folders(id) ON DELETE SET NULL,
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

      // Add folder_id column to images if it doesn't exist (for existing tables)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='images' AND column_name='folder_id') THEN
            ALTER TABLE images ADD COLUMN folder_id UUID REFERENCES image_folders(id) ON DELETE SET NULL;
          END IF;
        END $$;
      `);

      // AI Providers table (for multi-AI routing)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_providers (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          api_key_env VARCHAR(100),
          model_id VARCHAR(200),
          endpoint_url TEXT,
          cost_per_1m_input DECIMAL(8,4) DEFAULT 0,
          cost_per_1m_output DECIMAL(8,4) DEFAULT 0,
          best_for TEXT[],
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Seed default AI providers if table is empty
      await client.query(`
        INSERT INTO ai_providers (id, name, api_key_env, model_id, endpoint_url, cost_per_1m_input, cost_per_1m_output, best_for)
        SELECT * FROM (VALUES
          ('deepseek', 'DeepSeek V3', 'DEEPSEEK_API_KEY', 'deepseek-chat', 'https://api.deepseek.com/v1/chat/completions', 0.28, 0.42, ARRAY['short_posts', 'bulk']),
          ('claude_haiku', 'Claude Haiku 4.5', 'ANTHROPIC_API_KEY', 'claude-haiku-4-5-20251001', 'https://api.anthropic.com/v1/messages', 1.0, 5.0, ARRAY['long_posts', 'quality']),
          ('claude_sonnet', 'Claude Sonnet 4.5', 'ANTHROPIC_API_KEY', 'claude-sonnet-4-5-20250929', 'https://api.anthropic.com/v1/messages', 3.0, 15.0, ARRAY['campaigns', 'complex']),
          ('gemini', 'Gemini 2.0 Flash-Lite', 'GOOGLE_GEMINI_API_KEY', 'gemini-2.0-flash-lite', 'https://generativelanguage.googleapis.com/v1beta/models', 0.075, 0.30, ARRAY['translations', 'multilingual']),
          ('perplexity', 'Perplexity Sonar', 'PERPLEXITY_API_KEY', 'sonar', 'https://api.perplexity.ai/chat/completions', 1.0, 1.0, ARRAY['trends', 'news'])
        ) AS v(id, name, api_key_env, model_id, endpoint_url, cost_per_1m_input, cost_per_1m_output, best_for)
        WHERE NOT EXISTS (SELECT 1 FROM ai_providers LIMIT 1)
      `);

      // Add content promotion + AI columns to social_posts
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='source_type') THEN
            ALTER TABLE social_posts ADD COLUMN source_type VARCHAR(50);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='source_id') THEN
            ALTER TABLE social_posts ADD COLUMN source_id UUID;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='source_title') THEN
            ALTER TABLE social_posts ADD COLUMN source_title VARCHAR(500);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='source_url') THEN
            ALTER TABLE social_posts ADD COLUMN source_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='ai_provider') THEN
            ALTER TABLE social_posts ADD COLUMN ai_provider VARCHAR(50);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='ai_generated') THEN
            ALTER TABLE social_posts ADD COLUMN ai_generated BOOLEAN DEFAULT false;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='ai_prompt_used') THEN
            ALTER TABLE social_posts ADD COLUMN ai_prompt_used TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='ai_variations') THEN
            ALTER TABLE social_posts ADD COLUMN ai_variations JSONB;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='language') THEN
            ALTER TABLE social_posts ADD COLUMN language VARCHAR(10) DEFAULT 'en';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='bitly_url') THEN
            ALTER TABLE social_posts ADD COLUMN bitly_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_posts' AND column_name='bitly_clicks') THEN
            ALTER TABLE social_posts ADD COLUMN bitly_clicks INTEGER DEFAULT 0;
          END IF;
        END $$;
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
