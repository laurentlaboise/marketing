/**
 * Drive-backed default pricing packages + feature catalog.
 * Used by scripts/seed-pricing.js and POST /business/pricing/seed-defaults.
 */

const FEATURES = [
  [1, 1, 'Presence', 'fas fa-globe', 'social_foundation', 'Social media foundation', 'Core presence management on priority platforms for the market.'],
  [1, 2, 'Presence', 'fas fa-globe', 'professional_presence', 'Professional online presence', 'Structured online footprint suitable for local SMEs.'],
  [1, 3, 'Presence', 'fas fa-globe', 'foundational_content', 'Foundational content production', 'Baseline content pieces that support brand and SEO.'],
  [2, 1, 'Growth', 'fas fa-rocket', 'paid_social', 'Paid social campaign support', 'Audience, creative, and campaign support for paid social.'],
  [2, 2, 'Growth', 'fas fa-rocket', 'local_seo', 'Local / organic SEO execution', 'Local visibility work including Google Business Profile focus.'],
  [2, 3, 'Growth', 'fas fa-rocket', 'lead_assets', 'Lead magnet / conversion assets', 'Assets designed to capture and qualify enquiries.'],
  [3, 1, 'Systems', 'fas fa-cogs', 'crm_automation', 'CRM & automation orientation', 'CRM setup direction and automation workflows.'],
  [3, 2, 'Systems', 'fas fa-cogs', 'email_workflows', 'Email marketing workflows', 'Lifecycle email sequences and list nurturing.'],
  [3, 3, 'Systems', 'fas fa-cogs', 'priority_delivery', 'Priority delivery coordination', 'Priority scheduling and partner coordination.'],
  [4, 1, 'Reporting', 'fas fa-chart-line', 'monthly_reporting', 'Monthly plain-language reporting', 'Clear monthly progress report for clients and partners.'],
];

const ALL_FEATURE_KEYS = FEATURES.map((f) => f[4]);

function featureMap(includedKeys) {
  const o = {};
  ALL_FEATURE_KEYS.forEach((k) => {
    o[k] = includedKeys.includes(k);
  });
  return o;
}

const PLANS = [
  {
    name: 'Digital Footprint',
    slug: 'digital-footprint',
    description: 'Retail range $299–$349 · best for Lao SMEs starting online',
    type: 'starter',
    base_price: 329,
    billing_cycle: 'monthly',
    highlight: false,
    badge_text: null,
    annual_discount_pct: 20,
    sort_order: 10,
    cta_text: 'Start Footprint',
    cta_url: '/en/company/contact-us/',
    icon_class: 'fas fa-seedling',
    pay_as_you_go_text: '30-day money-back on eligible plans',
    currency: 'USD',
    features: featureMap([
      'social_foundation',
      'professional_presence',
      'foundational_content',
      'monthly_reporting',
    ]),
  },
  {
    name: 'Growth Engine',
    slug: 'growth-engine',
    description: 'Retail range $599–$699 · ads + SEO + lead assets',
    type: 'professional',
    base_price: 649,
    billing_cycle: 'monthly',
    highlight: true,
    badge_text: 'Most popular',
    annual_discount_pct: 20,
    sort_order: 20,
    cta_text: 'Start Growth',
    cta_url: '/en/company/contact-us/',
    icon_class: 'fas fa-rocket',
    pay_as_you_go_text: '30-day money-back on eligible plans',
    currency: 'USD',
    features: featureMap([
      'social_foundation',
      'professional_presence',
      'foundational_content',
      'paid_social',
      'local_seo',
      'lead_assets',
      'monthly_reporting',
    ]),
  },
  {
    name: 'Automation Pro',
    slug: 'automation-pro',
    description: 'Retail range $999–$1,199 · scale & systems',
    type: 'enterprise',
    base_price: 1099,
    billing_cycle: 'monthly',
    highlight: false,
    badge_text: null,
    annual_discount_pct: 20,
    sort_order: 30,
    cta_text: 'Start Automation',
    cta_url: '/en/company/contact-us/',
    icon_class: 'fas fa-cogs',
    pay_as_you_go_text: '30-day money-back on eligible plans',
    currency: 'USD',
    features: featureMap(ALL_FEATURE_KEYS),
  },
  {
    name: 'Standard',
    slug: 'standard',
    description: 'Affiliate entry package · $290/mo · 20% recurring commission ($58)',
    type: 'starter',
    base_price: 290,
    billing_cycle: 'monthly',
    highlight: false,
    badge_text: null,
    annual_discount_pct: 20,
    sort_order: 5,
    cta_text: 'Choose Standard',
    cta_url: '/en/company/affiliate-sales/',
    icon_class: 'fas fa-star',
    pay_as_you_go_text: 'Affiliate commission: 20% recurring',
    currency: 'USD',
    features: featureMap([
      'social_foundation',
      'professional_presence',
      'foundational_content',
      'monthly_reporting',
    ]),
  },
  {
    name: 'Professional',
    slug: 'professional',
    description: 'Affiliate growth package · $790/mo · 25% recurring commission ($197.50)',
    type: 'professional',
    base_price: 790,
    billing_cycle: 'monthly',
    highlight: false,
    badge_text: 'Affiliate pick',
    annual_discount_pct: 20,
    sort_order: 25,
    cta_text: 'Choose Professional',
    cta_url: '/en/company/affiliate-sales/',
    icon_class: 'fas fa-crown',
    pay_as_you_go_text: 'Affiliate commission: 25% recurring',
    currency: 'USD',
    features: featureMap([
      'social_foundation',
      'professional_presence',
      'foundational_content',
      'paid_social',
      'local_seo',
      'lead_assets',
      'monthly_reporting',
    ]),
  },
];

/** SEA Growth Suite affiliate product solutions (admin affiliate_solutions) */
const AFFILIATE_SOLUTIONS = [
  {
    name: 'SME Web Presence Foundation',
    category: 'SEA Growth Suite',
    description:
      '5-page mobile WordPress site, professional copy (Lao/Thai options), branding kit, basic on-page SEO, and simple client training. Ideal first sale for SMEs without a website.',
    commission_rate: '20–25% recurring (plan-based)',
    cookie_duration: '30 days',
    payout_threshold: 100,
    affiliate_url: 'https://wordsthatsells.website/en/company/affiliate-sales/',
    status: 'active',
  },
  {
    name: 'Instant-Lead Landing Page Kit',
    category: 'SEA Growth Suite',
    description:
      'Campaign landing page live in 5–7 business days with mobile design, persuasive copy, and lead capture (email / Messenger / LINE-ready flows).',
    commission_rate: 'One-time project commission',
    cookie_duration: '30 days',
    payout_threshold: 100,
    affiliate_url: 'https://wordsthatsells.website/en/company/affiliate-sales/',
    status: 'active',
  },
  {
    name: 'Local-First SEO Engine',
    category: 'SEA Growth Suite',
    description:
      'Monthly local visibility: Google Business Profile, local keyword focus, on-page fixes, and a clear progress report.',
    commission_rate: '20–25% recurring',
    cookie_duration: '30 days',
    payout_threshold: 100,
    affiliate_url: 'https://wordsthatsells.website/en/company/affiliate-sales/',
    status: 'active',
  },
  {
    name: 'Hyper-Local Social Manager',
    category: 'SEA Growth Suite',
    description:
      'Done-for-you Facebook & LINE-oriented content, scheduling, community engagement, and monthly planning under a scalable system.',
    commission_rate: '20–25% recurring',
    cookie_duration: '30 days',
    payout_threshold: 100,
    affiliate_url: 'https://wordsthatsells.website/en/company/affiliate-sales/',
    status: 'active',
  },
  {
    name: 'Growth-Driver Ad Launcher',
    category: 'SEA Growth Suite',
    description:
      'Paid social setup and optimization: targeting, creative, testing, and ROI-focused reporting for clients ready to scale acquisition.',
    commission_rate: '20–25% recurring',
    cookie_duration: '30 days',
    payout_threshold: 100,
    affiliate_url: 'https://wordsthatsells.website/en/company/affiliate-sales/',
    status: 'active',
  },
  {
    name: 'Brand Credibility Kit',
    category: 'SEA Growth Suite',
    description:
      'Logo, simple brand style guide, and Canva social templates — low-friction entry product that opens the door to larger packages.',
    commission_rate: 'One-time project commission',
    cookie_duration: '30 days',
    payout_threshold: 100,
    affiliate_url: 'https://wordsthatsells.website/en/company/affiliate-sales/',
    status: 'active',
  },
];

/** White-label agency packages (admin agencies table if used as catalog) */
const AGENCY_PACKAGES = [
  {
    name: 'Digital Footprint (White-Label)',
    category: 'White-Label',
    description:
      'Suggested retail $299–$349/mo. Foundational social + content for agencies reselling under their brand. WTS delivers white-label.',
    commission_rate: 'Partner wholesale (on request)',
    status: 'active',
  },
  {
    name: 'Growth Engine (White-Label)',
    category: 'White-Label',
    description:
      'Suggested retail $599–$699/mo. Ads, SEO, and lead assets for agencies. You keep the client relationship.',
    commission_rate: 'Partner wholesale (on request)',
    status: 'active',
  },
  {
    name: 'Automation Pro (White-Label)',
    category: 'White-Label',
    description:
      'Suggested retail $999–$1,199/mo. CRM/automation and email workflows for mature SME clients sold via agencies.',
    commission_rate: 'Partner wholesale (on request)',
    status: 'active',
  },
];

async function seedPricingDefaults(db) {
  let featuresUpserted = 0;
  for (const [catSort, sort, cat, icon, key, name, desc] of FEATURES) {
    await db.query(
      `INSERT INTO pricing_features
         (category_name, category_icon, feature_key, feature_name, feature_description, sort_order, category_sort_order, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
       ON CONFLICT (feature_key) DO UPDATE SET
         category_name = EXCLUDED.category_name,
         category_icon = EXCLUDED.category_icon,
         feature_name = EXCLUDED.feature_name,
         feature_description = EXCLUDED.feature_description,
         sort_order = EXCLUDED.sort_order,
         category_sort_order = EXCLUDED.category_sort_order,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP`,
      [cat, icon, key, name, desc, sort, catSort]
    );
    featuresUpserted += 1;
  }

  let plansUpserted = 0;
  for (const p of PLANS) {
    const existing = await db.query('SELECT id FROM price_models WHERE slug = $1', [p.slug]);
    if (existing.rows.length) {
      await db.query(
        `UPDATE price_models SET
           name=$1, description=$2, type=$3, base_price=$4, billing_cycle=$5,
           features=$6, status='active', highlight=$7, badge_text=$8,
           annual_discount_pct=$9, sort_order=$10, cta_text=$11, cta_url=$12,
           icon_class=$13, pay_as_you_go_text=$14, currency=$15,
           updated_at=CURRENT_TIMESTAMP
         WHERE slug=$16`,
        [
          p.name,
          p.description,
          p.type,
          p.base_price,
          p.billing_cycle,
          JSON.stringify(p.features),
          p.highlight,
          p.badge_text,
          p.annual_discount_pct,
          p.sort_order,
          p.cta_text,
          p.cta_url,
          p.icon_class,
          p.pay_as_you_go_text,
          p.currency,
          p.slug,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO price_models (
           name, slug, description, type, base_price, billing_cycle, features, status,
           highlight, badge_text, annual_discount_pct, sort_order,
           cta_text, cta_url, icon_class, pay_as_you_go_text, currency
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          p.name,
          p.slug,
          p.description,
          p.type,
          p.base_price,
          p.billing_cycle,
          JSON.stringify(p.features),
          p.highlight,
          p.badge_text,
          p.annual_discount_pct,
          p.sort_order,
          p.cta_text,
          p.cta_url,
          p.icon_class,
          p.pay_as_you_go_text,
          p.currency,
        ]
      );
    }
    plansUpserted += 1;
  }

  let affiliatesUpserted = 0;
  for (const a of AFFILIATE_SOLUTIONS) {
    const existing = await db.query(
      'SELECT id FROM affiliate_solutions WHERE name = $1',
      [a.name]
    );
    if (existing.rows.length) {
      await db.query(
        `UPDATE affiliate_solutions SET
           description=$1, commission_rate=$2, cookie_duration=$3, payout_threshold=$4,
           affiliate_url=$5, category=$6, status=$7, updated_at=CURRENT_TIMESTAMP
         WHERE name=$8`,
        [
          a.description,
          a.commission_rate,
          a.cookie_duration,
          a.payout_threshold,
          a.affiliate_url,
          a.category,
          a.status,
          a.name,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO affiliate_solutions
           (name, description, commission_rate, cookie_duration, payout_threshold, affiliate_url, category, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          a.name,
          a.description,
          a.commission_rate,
          a.cookie_duration,
          a.payout_threshold,
          a.affiliate_url,
          a.category,
          a.status,
        ]
      );
    }
    affiliatesUpserted += 1;
  }

  // Agencies table stores partner orgs (not package tiers). Skip package inserts here.
  const agenciesUpserted = 0;

  return { featuresUpserted, plansUpserted, affiliatesUpserted, agenciesUpserted };
}

module.exports = {
  FEATURES,
  PLANS,
  AFFILIATE_SOLUTIONS,
  AGENCY_PACKAGES,
  seedPricingDefaults,
};
