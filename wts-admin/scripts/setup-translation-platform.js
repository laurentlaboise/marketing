#!/usr/bin/env node
/**
 * One-time setup / migration helper for the localization platform.
 *
 * Usage:
 *   node scripts/setup-translation-platform.js promote-superadmins
 *       Renames role 'admin' → 'superadmin' for every admin account.
 *       Purely cosmetic: the middleware treats the two as synonyms, so
 *       this is safe to run (or skip) at any time.
 *
 *   node scripts/setup-translation-platform.js make-translator <email> <lang[,lang]> [--vendor]
 *       Grants the translator role, assigns languages (th, la, fr) and,
 *       with --vendor, marks the account payable (published work credits
 *       the payout ledger).
 *       e.g. node scripts/setup-translation-platform.js make-translator \
 *              somphone@example.la la --vendor
 *
 *   node scripts/setup-translation-platform.js set-rate <per_word|per_article|fixed> <amount> [lang]
 *       Creates/replaces the global (or per-language) payout rate card.
 *       e.g. node scripts/setup-translation-platform.js set-rate per_word 0.05 la
 *
 * On Railway prefix with `railway run`.
 */
require('dotenv').config();
const db = require('../database/db');

const TARGET_LANGUAGES = ['th', 'la', 'fr'];

async function promoteSuperAdmins() {
  const result = await db.query(
    `UPDATE users SET role = 'superadmin', updated_at = CURRENT_TIMESTAMP
     WHERE role = 'admin' RETURNING email`
  );
  console.log(result.rows.length
    ? `Promoted to superadmin: ${result.rows.map((r) => r.email).join(', ')}`
    : 'No admin accounts to promote (already superadmin or none exist).');
}

async function makeTranslator(email, langArg, vendorFlag) {
  if (!email || !langArg) {
    console.error('Usage: setup-translation-platform.js make-translator <email> <lang[,lang]> [--vendor]');
    process.exit(1);
  }
  const languages = langArg.split(',').map((l) => l.trim()).filter((l) => TARGET_LANGUAGES.includes(l));
  if (languages.length === 0) {
    console.error(`No valid languages in "${langArg}". Valid: ${TARGET_LANGUAGES.join(', ')}`);
    process.exit(1);
  }
  const isVendor = vendorFlag === '--vendor';
  const result = await db.query(
    `UPDATE users
     SET role = 'translator', assigned_languages = $1, is_vendor = $2, updated_at = CURRENT_TIMESTAMP
     WHERE lower(email) = $3 AND role NOT IN ('admin', 'superadmin')
     RETURNING id, email, role, assigned_languages, is_vendor`,
    [languages, isVendor, email.toLowerCase()]
  );
  if (result.rows.length === 0) {
    console.error(`No non-admin user found with email ${email}. Create the account first (ALLOW_SIGNUP or OAuth), then re-run.`);
    process.exit(1);
  }
  console.log('Translator configured:', result.rows[0]);
}

async function setRate(rateType, amountArg, lang) {
  const amount = parseFloat(amountArg);
  if (!['per_word', 'per_article', 'fixed'].includes(rateType) || !Number.isFinite(amount) || amount < 0) {
    console.error('Usage: setup-translation-platform.js set-rate <per_word|per_article|fixed> <amount> [lang]');
    process.exit(1);
  }
  const language = lang && TARGET_LANGUAGES.includes(lang) ? lang : null;
  await db.query(
    `UPDATE payout_rates SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE is_active = TRUE AND translator_id IS NULL AND target_language IS NOT DISTINCT FROM $1`,
    [language]
  );
  const result = await db.query(
    `INSERT INTO payout_rates (translator_id, target_language, rate_type, rate_amount)
     VALUES (NULL, $1, $2, $3) RETURNING *`,
    [language, rateType, amount]
  );
  console.log('Rate card active:', result.rows[0]);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'promote-superadmins') await promoteSuperAdmins();
    else if (command === 'make-translator') await makeTranslator(args[0], args[1], args[2]);
    else if (command === 'set-rate') await setRate(args[0], args[1], args[2]);
    else {
      console.error('Unknown command. See the header of this file for usage.');
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
