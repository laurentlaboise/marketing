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

const PAYOUT_RATE_DEFAULTS = [
  // work_type, target_language, rate_type, rate_amount, currency
  ['translation', 'la', 'per_1000_chars', 45000, 'LAK'],
  ['verification', 'la', 'per_1000_chars', 30000, 'LAK'],
  ['edit', 'la', 'per_1000_chars', 15000, 'LAK'],
  ['verification', 'th', 'per_1000_chars', 30000, 'LAK'],
  ['edit', 'th', 'per_1000_chars', 15000, 'LAK'],
];

const COMP_RATE_DEFAULTS = [
  { work_type: 'lead_entry', rate_amount: 1500 },
  { work_type: 'lead_directory_call', rate_amount: 5000 },
  {
    work_type: 'lead_qualified',
    rate_amount: 20000,
    tiers: [
      { min: 1, max: 20, rate: 20000 },
      { min: 21, max: 50, rate: 28000 },
      { min: 51, rate: 35000 },
    ],
  },
  { work_type: 'lead_conversion', rate_amount: 0, bonus_percent: 3, bonus_floor: 50000 },
  { work_type: 'community_response', rate_amount: 3500 },
  { work_type: 'cascade_share', rate_amount: 5000 },
];

async function seedRates() {
  let created = 0;

  for (const [workType, lang, rateType, amount, currency] of PAYOUT_RATE_DEFAULTS) {
    const exists = await db.query(
      `SELECT 1 FROM payout_rates
       WHERE is_active = TRUE AND work_type = $1 AND translator_id IS NULL
         AND target_language IS NOT DISTINCT FROM $2 LIMIT 1`,
      [workType, lang]
    );
    if (exists.rows.length) continue;
    await db.query(
      `INSERT INTO payout_rates (translator_id, target_language, work_type, rate_type, rate_amount, currency)
       VALUES (NULL, $1, $2, $3, $4, $5)`,
      [lang, workType, rateType, amount, currency]
    );
    created += 1;
    console.log(`payout_rate: ${workType} ${lang} ${rateType} ${currency} ${amount}`);
  }

  for (const rate of COMP_RATE_DEFAULTS) {
    const exists = await db.query(
      `SELECT 1 FROM comp_rates WHERE is_active = TRUE AND work_type = $1 AND user_id IS NULL LIMIT 1`,
      [rate.work_type]
    );
    if (exists.rows.length) continue;
    await db.query(
      `INSERT INTO comp_rates (user_id, work_type, rate_amount, currency, tiers, bonus_percent, bonus_floor)
       VALUES (NULL, $1, $2, 'LAK', $3, $4, $5)`,
      [
        rate.work_type,
        rate.rate_amount,
        rate.tiers ? JSON.stringify(rate.tiers) : null,
        rate.bonus_percent ?? null,
        rate.bonus_floor ?? null,
      ]
    );
    created += 1;
    console.log(`comp_rate: ${rate.work_type} LAK ${rate.rate_amount}${rate.tiers ? ' (tiered)' : ''}${rate.bonus_percent ? ` +${rate.bonus_percent}% floor ${rate.bonus_floor}` : ''}`);
  }

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
