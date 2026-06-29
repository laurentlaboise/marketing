const { Pool } = require('pg');
const fs = require('fs');

// TLS configuration for the database connection.
//
// Production requires verified TLS: set PGSSLROOTCERT to the server's CA
// certificate (a file path, or the PEM content itself — Railway exposes it
// in the Postgres service variables) so certificates are actually
// validated. rejectUnauthorized:false (the previous behavior) accepts any
// certificate and allows man-in-the-middle interception of credentials
// and data.
//
// Outside production, PGSSL_INSECURE=true opts into unverified TLS for
// ad-hoc connections to managed databases; plain local connections use no
// TLS at all.
// Resolve the database host from whichever connection style is configured.
function getDbHost() {
  if (process.env.PGHOST) return process.env.PGHOST;
  if (process.env.DATABASE_URL) {
    try {
      return new URL(process.env.DATABASE_URL).hostname;
    } catch (_) {
      return null;
    }
  }
  return null;
}

// Railway's private network (*.railway.internal) reaches Postgres without
// crossing the public internet, and Postgres there presents no TLS
// certificate — so a plaintext connection is the platform-recommended setup
// and forcing TLS fails. Public / proxy hosts (and loopback, per the
// fail-fast contract enforced in boot.test.js) are NOT exempt and still
// require verified TLS in production.
function isTrustedPrivateHost(host) {
  if (!host) return false;
  return host.endsWith('.railway.internal');
}

function getSslConfig() {
  const rootCert = process.env.PGSSLROOTCERT;
  if (rootCert) {
    const ca = rootCert.includes('-----BEGIN CERTIFICATE-----')
      ? rootCert
      : fs.readFileSync(rootCert, 'utf8');
    // PGSSL_VERIFY:
    //   verify-full (default) — validate the CA chain AND that the
    //     certificate matches the host we dialed.
    //   verify-ca — validate the chain against the CA but skip hostname
    //     matching (Postgres sslmode=verify-ca semantics). Needed for
    //     managed databases (e.g. Railway's TCP proxy) whose self-signed
    //     certificates don't carry the proxy hostname in their SANs.
    //     Never falls back automatically — downgrading is an explicit,
    //     visible choice.
    const mode = process.env.PGSSL_VERIFY || 'verify-full';
    if (mode !== 'verify-full' && mode !== 'verify-ca') {
      throw new Error(`Invalid PGSSL_VERIFY value "${mode}". Use "verify-full" (default) or "verify-ca".`);
    }
    const ssl = { ca, rejectUnauthorized: true };
    if (mode === 'verify-ca') {
      ssl.checkServerIdentity = () => undefined;
    }
    return ssl;
  }

  if (process.env.PGSSL_INSECURE === 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PGSSL_INSECURE is not allowed in production. Set PGSSLROOTCERT to the database CA certificate instead.');
    }
    return { rejectUnauthorized: false };
  }

  // Railway private network: connect without TLS. This is the recommended
  // Railway setup — the app and Postgres talk over the private network where
  // no certificate is presented — so it is allowed even in production. Public
  // and loopback hosts fall through to the requirement below.
  if (isTrustedPrivateHost(getDbHost())) {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Database TLS is not configured. Set PGSSLROOTCERT to the CA certificate ' +
      '(file path or PEM content) of your PostgreSQL server so certificates can be verified, ' +
      'or connect over the private network (e.g. *.railway.internal) where TLS is not required.'
    );
  }

  // Local development: plain connection
  return false;
}

// Database connection configuration
function getConnectionConfig() {
  // Railway provides DATABASE_URL or individual PG* variables
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: getSslConfig()
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
      ssl: getSslConfig()
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

const pool = new Pool({
  ...getConnectionConfig(),
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Database operations
const db = {
  // Underlying pool (shared with connect-pg-simple so the session store
  // uses the same TLS configuration)
  pool,

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
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='text_article') THEN
            ALTER TABLE articles ADD COLUMN text_article TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='audio_files') THEN
            ALTER TABLE articles ADD COLUMN audio_files JSONB DEFAULT '{}'::jsonb;
          END IF;
          -- SEO fix: word_count for thin content detection
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='word_count') THEN
            ALTER TABLE articles ADD COLUMN word_count INTEGER;
          END IF;
          -- SEO fix: Person author fields
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='author_type') THEN
            ALTER TABLE articles ADD COLUMN author_type VARCHAR(20) DEFAULT 'organization';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='author_name') THEN
            ALTER TABLE articles ADD COLUMN author_name VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='author_job_title') THEN
            ALTER TABLE articles ADD COLUMN author_job_title VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='author_url') THEN
            ALTER TABLE articles ADD COLUMN author_url TEXT;
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
          -- Flexible pricing & billing options
          -- pricing_type: one_time (single purchase, uses the price column) or subscription (uses monthly/yearly prices)
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='pricing_type') THEN
            ALTER TABLE products ADD COLUMN pricing_type VARCHAR(50) DEFAULT 'one_time';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='monthly_price') THEN
            ALTER TABLE products ADD COLUMN monthly_price DECIMAL(10,2);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='yearly_price') THEN
            ALTER TABLE products ADD COLUMN yearly_price DECIMAL(10,2);
          END IF;
          -- Optional manual override for the displayed annual discount; if NULL it is computed from monthly vs yearly price
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='annual_discount_pct') THEN
            ALTER TABLE products ADD COLUMN annual_discount_pct INTEGER;
          END IF;
          -- Which billing period is selected by default on the product page ('monthly' or 'yearly')
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='default_billing') THEN
            ALTER TABLE products ADD COLUMN default_billing VARCHAR(20) DEFAULT 'monthly';
          END IF;
          -- Allow customers to switch between monthly/yearly on the product page
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='allow_billing_toggle') THEN
            ALTER TABLE products ADD COLUMN allow_billing_toggle BOOLEAN DEFAULT TRUE;
          END IF;
          -- Separate Stripe Price IDs for recurring billing periods
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stripe_price_id_monthly') THEN
            ALTER TABLE products ADD COLUMN stripe_price_id_monthly VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stripe_price_id_yearly') THEN
            ALTER TABLE products ADD COLUMN stripe_price_id_yearly VARCHAR(255);
          END IF;
          -- Catalog taxonomy & lead-first commerce model
          -- subcategory: constrained child of service_page (see src/config/product-taxonomy.js)
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='subcategory') THEN
            ALTER TABLE products ADD COLUMN subcategory VARCHAR(120);
          END IF;
          -- purchase_mode: 'consult' (request a quote / book a call) or 'buy' (self-serve checkout)
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='purchase_mode') THEN
            ALTER TABLE products ADD COLUMN purchase_mode VARCHAR(20) DEFAULT 'consult';
          END IF;
          -- price_unit: how a one-time price is quoted ('fixed','hour','item','quantity')
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='price_unit') THEN
            ALTER TABLE products ADD COLUMN price_unit VARCHAR(30) DEFAULT 'fixed';
          END IF;
          -- industries: cross-cutting audience tags (from the "Ideal For" lines)
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='industries') THEN
            ALTER TABLE products ADD COLUMN industries TEXT[];
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='sku') THEN
            ALTER TABLE products ADD COLUMN sku VARCHAR(100);
          END IF;
          -- stripe_payment_link: a Stripe Payment Link (buy.stripe.com/...) for self-serve items
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stripe_payment_link') THEN
            ALTER TABLE products ADD COLUMN stripe_payment_link TEXT;
          END IF;
          -- cta_form_type: which form_template the product's "Request a Quote" CTA
          -- opens. NULL falls back to the generic 'consultation' form. Kept as a
          -- plain column (not an FK) so deleting a form can't block product edits;
          -- the front end falls back if the referenced form is gone/inactive.
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='cta_form_type') THEN
            ALTER TABLE products ADD COLUMN cta_form_type VARCHAR(100);
          END IF;
          -- quantity_tiers: volume-discount pricing for pricing_type='tiered'.
          -- JSONB array of { min_qty, unit_price } sorted ascending by min_qty;
          -- the unit price applies from that quantity up to the next tier.
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='quantity_tiers') THEN
            ALTER TABLE products ADD COLUMN quantity_tiers JSONB DEFAULT '[]'::jsonb;
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

      // Seed the core front-end forms as editable templates so every modal form
      // on the site is controllable from the admin (Message Board → Forms).
      // Idempotent: ON CONFLICT keeps any edits an admin has already made — this
      // only fills in a form that doesn't exist yet, it never overwrites.
      const BASE_FORM_TEMPLATES = [
        {
          form_type: 'general-inquiry',
          title: 'Send Us a Message',
          subtitle: "Have a question? Send us a message and we'll get back to you shortly.",
          submit: 'Send Message',
          success: "Thank you! Your message has been sent — we'll be in touch soon.",
          fields: [
            { name: 'name', label: 'Your Name', type: 'text', placeholder: 'Your Name', required: true },
            { name: 'email', label: 'Your Email', type: 'email', placeholder: 'Your Email', required: true },
            { name: 'company', label: 'Company', type: 'text', placeholder: 'Company (optional)', required: false },
            { name: 'message', label: 'Message', type: 'textarea', placeholder: 'How can we help?', required: true },
          ],
        },
        {
          form_type: 'consultation',
          title: 'Request a Quote',
          subtitle: "Tell us what you need — we'll tailor a plan and quote.",
          submit: 'Request a Quote',
          success: "Thank you! We've received your request and will reply with a tailored quote.",
          fields: [
            { name: 'name', label: 'Your Name', type: 'text', placeholder: 'Your Name', required: true },
            { name: 'email', label: 'Your Email', type: 'email', placeholder: 'Your Email', required: true },
            { name: 'company', label: 'Company', type: 'text', placeholder: 'Company (optional)', required: false },
            { name: 'phone', label: 'Phone', type: 'tel', placeholder: 'Phone (optional)', required: false },
            { name: 'service', label: 'Service of Interest', type: 'text', placeholder: 'Which service?', required: false },
            { name: 'message', label: 'Details', type: 'textarea', placeholder: 'Tell us about your project...', required: false },
          ],
        },
        {
          form_type: 'affiliate',
          title: 'Apply for Affiliate Program',
          subtitle: "Let's discuss how we can help your business grow. Fill out the form below and we'll get back to you shortly.",
          submit: 'Submit Request',
          success: "Thank you for applying! We'll review your application and get back to you.",
          fields: [
            { name: 'name', label: 'Your Name', type: 'text', placeholder: 'Your Name', required: true },
            { name: 'email', label: 'Your Email', type: 'email', placeholder: 'Your Email', required: true },
            { name: 'company', label: 'Company Name', type: 'text', placeholder: 'Company Name', required: false },
            { name: 'service', label: 'Service of Interest', type: 'select', placeholder: 'Select a Service of Interest', required: true,
              options: ['Digital Marketing Strategy', 'SEO Content Creation', 'Social Media Management', 'Web Development', 'Graphic Design', 'App Development', 'AI Marketing Hub'] },
            { name: 'message', label: 'Message', type: 'textarea', placeholder: 'Tell us about your project...', required: false },
          ],
        },
        {
          form_type: 'contact',
          title: 'Contact Us',
          subtitle: "We'd love to hear from you. Send us a message and we'll respond as soon as we can.",
          submit: 'Send',
          success: "Thank you for reaching out — we'll be in touch shortly.",
          fields: [
            { name: 'name', label: 'Your Name', type: 'text', placeholder: 'Your Name', required: true },
            { name: 'email', label: 'Your Email', type: 'email', placeholder: 'Your Email', required: true },
            { name: 'company', label: 'Company', type: 'text', placeholder: 'Company (optional)', required: false },
            { name: 'phone', label: 'Phone', type: 'tel', placeholder: 'Phone (optional)', required: false },
            { name: 'message', label: 'Message', type: 'textarea', placeholder: 'Your message...', required: true },
          ],
        },
      ];
      for (const t of BASE_FORM_TEMPLATES) {
        await client.query(
          `INSERT INTO form_templates (form_type, title, subtitle, fields, submit_button_text, success_message, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'active')
           ON CONFLICT (form_type) DO NOTHING`,
          [t.form_type, t.title, t.subtitle, JSON.stringify(t.fields), t.submit, t.success]
        );
      }

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

      // Optional product association for a button (Stage 2 of button targeting):
      // when set, clicking the button opens the form pre-tagged with this
      // product so the lead is attributed to it. Stored as the product slug
      // (stable) plus a denormalized display name for the front end.
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_buttons' AND column_name='product_slug') THEN
            ALTER TABLE form_buttons ADD COLUMN product_slug VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_buttons' AND column_name='product_name') THEN
            ALTER TABLE form_buttons ADD COLUMN product_name VARCHAR(500);
          END IF;
          -- placement: 'inline' (rendered into a page button slot) or 'sticky'
          -- (rendered as a floating side tab on the right edge of every page).
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_buttons' AND column_name='placement') THEN
            ALTER TABLE form_buttons ADD COLUMN placement VARCHAR(20) DEFAULT 'inline';
          END IF;
        END $$;
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

      // Execution telemetry table (written by POST /api/webhooks/telemetry).
      // Previously this table had no schema here, so every ingest failed.
      await client.query(`
        CREATE TABLE IF NOT EXISTS execution_telemetry (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          automation_id TEXT NOT NULL,
          execution_status VARCHAR(50) DEFAULT 'unknown',
          error_log TEXT,
          anomaly_score NUMERIC,
          latency_ms INTEGER,
          executed_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_execution_telemetry_automation_executed
          ON execution_telemetry (automation_id, executed_at DESC)
      `);

      // Indexes for slug lookups, foreign keys and common sort/filter
      // columns. UNIQUE columns (articles.slug, guides.slug,
      // microsites.slug, users.email) already have implicit indexes.
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_provider ON users (provider, provider_id);
        CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);

        CREATE INDEX IF NOT EXISTS idx_articles_status_published_at ON articles (status, published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
        CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_articles_author_id ON articles (author_id);

        CREATE INDEX IF NOT EXISTS idx_guides_status_published_at ON guides (status, published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_guides_category ON guides (category);
        CREATE INDEX IF NOT EXISTS idx_guides_author_id ON guides (author_id);

        CREATE INDEX IF NOT EXISTS idx_glossary_slug ON glossary (slug);
        CREATE INDEX IF NOT EXISTS idx_glossary_letter ON glossary (letter);
        CREATE INDEX IF NOT EXISTS idx_glossary_term ON glossary (term);

        CREATE INDEX IF NOT EXISTS idx_seo_terms_slug ON seo_terms (slug);
        CREATE INDEX IF NOT EXISTS idx_seo_terms_category ON seo_terms (category);
        CREATE INDEX IF NOT EXISTS idx_seo_terms_term ON seo_terms (term);

        CREATE INDEX IF NOT EXISTS idx_ai_tools_status_category ON ai_tools (status, category);
        CREATE INDEX IF NOT EXISTS idx_ai_tools_name ON ai_tools (name);

        CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug);
        CREATE INDEX IF NOT EXISTS idx_products_status_service_page ON products (status, service_page);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

        CREATE INDEX IF NOT EXISTS idx_price_models_status_sort ON price_models (status, sort_order);
        CREATE INDEX IF NOT EXISTS idx_price_models_slug ON price_models (slug);
        CREATE INDEX IF NOT EXISTS idx_pricing_features_status_sort ON pricing_features (status, category_sort_order, sort_order);

        CREATE INDEX IF NOT EXISTS idx_sidebar_items_section_visible ON sidebar_items (section, is_visible);
        CREATE INDEX IF NOT EXISTS idx_sidebar_items_parent_id ON sidebar_items (parent_id);

        CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders (stripe_session_id);
        CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders (product_id);

        CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);

        CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_form_submissions_form_type ON form_submissions (form_type);
        CREATE INDEX IF NOT EXISTS idx_form_buttons_form_type_status ON form_buttons (form_type, status);

        CREATE INDEX IF NOT EXISTS idx_microsites_status ON microsites (status);
        CREATE INDEX IF NOT EXISTS idx_microsite_domains_microsite_id ON microsite_domains (microsite_id);
        CREATE INDEX IF NOT EXISTS idx_microsite_deployments_microsite_created ON microsite_deployments (microsite_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_images_file_path ON images (file_path);
        CREATE INDEX IF NOT EXISTS idx_images_folder_id ON images (folder_id);
        CREATE INDEX IF NOT EXISTS idx_images_status_created ON images (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_images_category ON images (category);
        CREATE INDEX IF NOT EXISTS idx_image_folders_parent_id ON image_folders (parent_id);
      `);

      await client.query('COMMIT');
      console.log('Database tables initialized successfully');

      // Admin bootstrap: promote any existing users whose email is listed in
      // ADMIN_EMAILS (comma-separated) to the admin role. Idempotent and safe
      // to run on every boot — it only touches accounts that already exist and
      // aren't admin yet. Failures are logged but never block startup, so a bad
      // value can't turn into a deploy-failing crash loop.
      if (process.env.ADMIN_EMAILS) {
        try {
          const emails = process.env.ADMIN_EMAILS
            .split(',')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
          if (emails.length) {
            const promoted = await client.query(
              `UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP
               WHERE lower(email) = ANY($1::text[]) AND role IS DISTINCT FROM 'admin'
               RETURNING email`,
              [emails]
            );
            if (promoted.rows.length) {
              console.log('Admin bootstrap promoted:', promoted.rows.map((r) => r.email).join(', '));
            }
          }
        } catch (e) {
          console.warn('Admin bootstrap (ADMIN_EMAILS) failed:', e.message);
        }
      }
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
