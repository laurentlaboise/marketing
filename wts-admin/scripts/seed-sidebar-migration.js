#!/usr/bin/env node
/**
 * Seed the admin-managed replacements for the previously hard-coded floating
 * "quote / Affiliate Application" tab.
 *
 * Background: the static site used to hard-code a `<div id="quote-tab">` on every
 * page that opened the contact/quote modal. That markup has been removed in
 * favour of the dynamic sticky form-button system (admin "Show on = Sticky side
 * tab"), which `js/modules/firebase.js` renders on page load. This script seeds
 * the equivalent sticky buttons so the tab keeps appearing after the migration.
 *
 * It is idempotent — re-running it never creates duplicates and never overwrites
 * an admin's edits.
 *
 * Usage:
 *   node scripts/seed-sidebar-migration.js
 *
 * On Railway:
 *   railway run node scripts/seed-sidebar-migration.js
 */
require('dotenv').config();
const db = require('../database/db');

// Each entry reproduces one of the old hard-coded tabs as a sticky form button.
// `page_url` uses the same matcher as the front end: '*' = site-wide, exact
// paths (trailing-slash tolerant) and '/*' suffix wildcards are supported.
const STICKY_BUTTONS = [
  {
    form_type: 'general-inquiry',
    button_label: 'Leave a Message',
    page_url: '*',
  },
  {
    form_type: 'affiliate',
    button_label: 'Affiliate Application',
    page_url: '/en/company/affiliate-sales/',
  },
];

async function templateExists(formType) {
  const r = await db.query('SELECT 1 FROM form_templates WHERE form_type = $1', [formType]);
  return r.rows.length > 0;
}

async function stickyButtonExists(formType, pageUrl) {
  const r = await db.query(
    `SELECT 1 FROM form_buttons WHERE form_type = $1 AND placement = 'sticky' AND COALESCE(page_url, '') = $2`,
    [formType, pageUrl]
  );
  return r.rows.length > 0;
}

async function main() {
  let created = 0;
  let skipped = 0;

  for (const btn of STICKY_BUTTONS) {
    if (!(await templateExists(btn.form_type))) {
      console.warn(`! Skipping "${btn.button_label}" — form template '${btn.form_type}' does not exist yet.`);
      skipped++;
      continue;
    }
    if (await stickyButtonExists(btn.form_type, btn.page_url)) {
      console.log(`= "${btn.button_label}" (${btn.form_type} @ ${btn.page_url}) already present — skipping.`);
      skipped++;
      continue;
    }
    await db.query(
      `INSERT INTO form_buttons (form_type, button_label, page_url, placement, style_preset, status)
       VALUES ($1, $2, $3, 'sticky', 'primary', 'active')`,
      [btn.form_type, btn.button_label, btn.page_url]
    );
    console.log(`+ Created sticky tab "${btn.button_label}" (${btn.form_type} @ ${btn.page_url}).`);
    created++;
  }

  console.log(`\nDone. ${created} created, ${skipped} skipped.`);
  await db.close();
}

main().catch((err) => {
  console.error('Failed to seed sidebar migration:', err.message);
  process.exit(1);
});
