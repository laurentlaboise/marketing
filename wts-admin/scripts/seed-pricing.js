#!/usr/bin/env node
/**
 * Seed subscription packages + pricing features + affiliate solutions.
 * Usage: node scripts/seed-pricing.js
 *        railway run node scripts/seed-pricing.js
 */
require('dotenv').config();
const db = require('../database/db');
const { seedPricingDefaults } = require('../src/lib/pricing-seed-data');

async function main() {
  try {
    const result = await seedPricingDefaults(db);
    console.log('Seed complete:', result);
    const plans = await db.query(
      `SELECT name, base_price, slug, status FROM price_models WHERE status='active' ORDER BY sort_order`
    );
    console.log('Active plans:', plans.rows);
    process.exit(0);
  } catch (e) {
    console.error('seed-pricing failed:', e);
    process.exit(1);
  }
}

main();
