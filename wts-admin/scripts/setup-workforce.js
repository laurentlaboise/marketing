#!/usr/bin/env node
/**
 * Seed the workforce compensation defaults from the position briefs.
 * Every figure is a starting point ("prices not set in stone") — adjust
 * in the admin UI (Localization → Payout Ledger) at any time. Idempotent:
 * only fills in rates that don't exist yet, never overwrites edits.
 *
 * Usage:
 *   node scripts/setup-workforce.js seed-rates
 * On Railway: railway run node scripts/setup-workforce.js seed-rates
 *
 * Sources (kip):
 *   Verification overflow    30,000 / 1,000 chars   (Engagement brief, Track A)
 *   Edit (rework)            15,000 / 1,000 chars   (half the write rate — tune to taste)
 *   Lao translation (write)  45,000 / 1,000 chars   (above verification, below agency)
 *   Lead data entry           1,500 / record        (Lead Verifier brief)
 *   Directory call-verified   5,000 / record        (Lead Verifier brief)
 *   Qualified leads          20k → 28k → 35k        (marginal monthly tiers 1–20 / 21–50 / 51+)
 *   Conversion bonus         3% of sale, floor 50k  (or set a flat amount instead)
 *   Community response        3,500 / response      (Track B pure per-response)
 *   Cascade share             5,000 / share         (Cascade brief reserves numbers — placeholder)
 */
require('dotenv').config();
const db = require('../database/db');

const { seedDefaultRates } = require('../src/lib/default-rates');

async function seedRates() {
  const { created, log } = await seedDefaultRates();
  for (const line of log) console.log(line);
  console.log(created ? `\n${created} default rate(s) seeded — adjust in the admin UI.` : '\nAll rates already configured — nothing to do.');
}

async function main() {
  const command = process.argv[2];
  try {
    if (command === 'seed-rates') await seedRates();
    else {
      console.error('Usage: node scripts/setup-workforce.js seed-rates');
      process.exit(1);
    }
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exit(1);
});
