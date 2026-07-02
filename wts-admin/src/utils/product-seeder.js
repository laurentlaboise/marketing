// Catalog seeding — the one insert path for products arriving from outside
// the editor (Import screen paste and the boot-time auto-seed).
//
// The curated catalog lives in database/seed/products-all.json. On boot,
// seedCatalogIfSparse() populates a near-empty database (fewer than
// SPARSE_THRESHOLD products) so a fresh deploy comes up with the full
// catalog and no manual import step. It never runs against a populated
// catalog, so deliberate admin deletions are never resurrected by a deploy.

const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const taxonomy = require('../config/product-taxonomy');
const { parseSeedProducts } = require('./product-import-parser');

const SEED_FILE = path.join(__dirname, '../../database/seed/products-all.json');
const SPARSE_THRESHOLD = 10;

const IMPORT_ICON_BY_PAGE = {
  'content-creation': 'fas fa-pen-nib',
  'social-media-management': 'fas fa-hashtag',
  'web-development': 'fas fa-code',
  'business-tools': 'fas fa-briefcase',
};

// Insert one parsed catalog entry (parseProductListings / parseSeedProducts
// shape). Caller decides existence checks.
async function insertSeedProduct(p) {
  const monthly = p.monthly_price;
  const yearly = p.yearly_price;
  const defaultBilling = monthly != null ? 'monthly' : (yearly != null ? 'yearly' : 'monthly');
  const allowToggle = monthly != null && yearly != null;
  await db.query(
    `INSERT INTO products (
      name, slug, description, price, currency, features, status,
      service_page, subcategory, icon_class, animation_class, sort_order,
      product_type, slide_in_subtitle,
      pricing_type, monthly_price, yearly_price, default_billing, allow_billing_toggle,
      purchase_mode, price_unit, industries, sku, stripe_payment_link,
      slide_in_title, slide_in_content, quantity_tiers
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
    [
      p.name, p.slug, p.description || null, p.price, p.currency || 'USD', p.features || [],
      p.status === 'active' ? 'active' : 'draft',
      p.service_page || null, p.subcategory || null,
      p.icon_class || IMPORT_ICON_BY_PAGE[p.service_page] || 'fas fa-box', 'kinetic-pulse-float', p.sort_order || 0,
      p.product_type || (p.pricing_type === 'subscription' ? 'subscription' : 'service'), p.slide_in_subtitle || null,
      p.pricing_type, monthly, yearly, defaultBilling, allowToggle,
      taxonomy.PURCHASE_MODE_VALUES.includes(p.purchase_mode) ? p.purchase_mode : 'consult',
      p.price_unit || 'fixed',
      (Array.isArray(p.industries) ? p.industries : []).filter((v) => taxonomy.INDUSTRY_VALUES.includes(v)),
      p.sku || null, p.stripe_payment_link || null,
      p.slide_in_title || null, p.slide_in_content || null, JSON.stringify(p.quantity_tiers || [])
    ]
  );
}

// A product "exists" if its slug or (case-insensitive) name is already taken —
// covers hand-entered products whose slugs differ from the seed's.
async function seedEntryExists(p) {
  const r = await db.query(
    'SELECT 1 FROM products WHERE slug = $1 OR LOWER(name) = LOWER($2) LIMIT 1',
    [p.slug, p.name]
  );
  return r.rows.length > 0;
}

async function seedCatalogIfSparse() {
  if (!fs.existsSync(SEED_FILE)) return { seeded: false, reason: 'no seed file' };

  const count = parseInt((await db.query('SELECT COUNT(*) FROM products')).rows[0].count, 10);
  if (count >= SPARSE_THRESHOLD) {
    return { seeded: false, reason: `catalog already populated (${count} products)` };
  }

  const { products } = parseSeedProducts(fs.readFileSync(SEED_FILE, 'utf8'));
  let created = 0, skipped = 0, failed = 0;
  for (const p of products) {
    try {
      if (p.warnings.length || !p.service_page || !p.subcategory) { failed++; continue; }
      if (await seedEntryExists(p)) { skipped++; continue; }
      await insertSeedProduct(p);
      created++;
    } catch (e) {
      failed++;
      console.error(`Seed insert failed for "${p.name}":`, e.message);
    }
  }
  console.log(`Catalog seed: ${created} created, ${skipped} skipped (already present), ${failed} failed of ${products.length}`);
  return { seeded: true, created, skipped, failed, total: products.length };
}

module.exports = { insertSeedProduct, seedCatalogIfSparse, seedEntryExists };
