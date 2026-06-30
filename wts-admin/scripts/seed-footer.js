#!/usr/bin/env node
/**
 * Seed the admin-managed footer with the values currently hard-coded in the
 * static site, so the dynamic footer renders identically out of the box.
 *
 * Seeds three things:
 *   1. site_settings  — social URLs, contact details, copyright (ON CONFLICT DO
 *      NOTHING, so it never overwrites edits an admin has already made).
 *   2. menu_items location 'footer'       — the Services/Solutions/Resources columns.
 *   3. menu_items location 'footer-legal' — the bottom About/Contact/Legal bar.
 *
 * The menu columns are only seeded when no footer menu items exist yet, so
 * re-running never creates duplicates.
 *
 * Usage:
 *   node scripts/seed-footer.js            (or: railway run node scripts/seed-footer.js)
 */
require('dotenv').config();
const db = require('../database/db');

const SETTINGS = {
  footer_social_instagram: 'https://www.instagram.com/wordsthatsells.website.laos/',
  footer_social_linkedin: 'https://www.linkedin.com/company/wordsthatsells',
  footer_social_facebook: 'https://www.facebook.com/wordsthatsells/',
  footer_social_twitter: 'https://x.com/wordsthatsells/',
  footer_social_youtube: 'https://www.youtube.com/@wordsthatsells942',
  footer_contact_address: '20 Rue Samsenthai, Vientiane,\nVientiane Province',
  footer_contact_maps_url: 'https://www.google.com/maps/search/?api=1&query=Words+That+Sells+20+Rue+Samsenthai+Vientiane+Laos',
  footer_contact_whatsapp: '+856 20 5552 8034',
  footer_contact_whatsapp_text: "Hello! I'm interested in your services.",
  footer_contact_email: 'info@wordsthatsells.website',
  footer_contact_email_subject: 'Inquiry About Your Services',
  footer_contact_email_body: "Hello,\n\nI saw your website and I'm interested in learning more.\n\nThank you!",
  footer_copyright: '© 2025 Laboise eworker Laos enterprise. All rights reserved.\nTax ID: 275618471000 | Reg ID: 08/04 – 000001253'
};

// Footer link columns. `t` marks links that open in a new tab (matching the
// current static markup).
const COLUMNS = [
  { heading: 'Services', links: [
    { label: 'Digital Marketing', url: '/digital-marketing-services', t: true },
    { label: 'Content Creation', url: '/digital-marketing-services/content-creation' },
    { label: 'Social Media', url: '/digital-marketing-services/social-media-management' },
    { label: 'Web Development', url: '/digital-marketing-services/web-development' },
    { label: 'Business Tools', url: '/digital-marketing-services/business-tools' }
  ] },
  { heading: 'Solutions', links: [
    { label: 'Pricing', url: '/digital-marketing-services/prices' },
    { label: 'Affiliates', url: '/company/affiliate-sales' },
    { label: 'Agencies', url: '/company/digital-agencies' },
    { label: 'Automation', url: '/resources/ai-tools', t: true }
  ] },
  { heading: 'Resources', links: [
    { label: 'Articles', url: '/resources/articles', t: true },
    { label: 'Glossary', url: '/resources/glossary', t: true },
    { label: 'Ai Tools', url: '/resources/ai-tools', t: true },
    { label: 'E-Guides', url: '/resources/guides', t: true }
  ] }
];

const LEGAL = [
  { label: 'About Us', url: '/company/about-us' },
  { label: 'Contact Us', url: '/company/contact-us' },
  { label: 'Legal', url: '/company/legal' }
];

async function seedSettings() {
  let created = 0;
  for (const [key, value] of Object.entries(SETTINGS)) {
    const r = await db.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
    if (r.rowCount) created++;
  }
  console.log(`Settings: ${created} created, ${Object.keys(SETTINGS).length - created} already present.`);
}

async function insertColumn(heading, links, sortBase) {
  const parent = await db.query(
    `INSERT INTO menu_items (label, location, sort_order, is_visible)
     VALUES ($1, 'footer', $2, TRUE) RETURNING id`,
    [heading, sortBase]
  );
  const parentId = parent.rows[0].id;
  let i = 0;
  for (const link of links) {
    await db.query(
      `INSERT INTO menu_items (label, url, parent_id, location, sort_order, is_visible, open_in_new_tab)
       VALUES ($1, $2, $3, 'footer', $4, TRUE, $5)`,
      [link.label, link.url, parentId, i++, !!link.t]
    );
  }
}

async function seedMenus() {
  const existing = await db.query(
    `SELECT COUNT(*)::int AS n FROM menu_items WHERE location IN ('footer', 'footer-legal')`
  );
  if (existing.rows[0].n > 0) {
    console.log(`Footer menus: ${existing.rows[0].n} item(s) already exist — skipping (delete them to re-seed).`);
    return;
  }
  let sort = 0;
  for (const col of COLUMNS) {
    await insertColumn(col.heading, col.links, sort++);
  }
  let i = 0;
  for (const item of LEGAL) {
    await db.query(
      `INSERT INTO menu_items (label, url, location, sort_order, is_visible)
       VALUES ($1, $2, 'footer-legal', $3, TRUE)`,
      [item.label, item.url, i++]
    );
  }
  console.log(`Footer menus: seeded ${COLUMNS.length} columns + ${LEGAL.length} legal links.`);
}

async function seedAssignments() {
  const existing = await db.query(`SELECT COUNT(*)::int AS n FROM footer_assignments`);
  if (existing.rows[0].n > 0) {
    console.log(`Assignments: ${existing.rows[0].n} already present — skipping.`);
    return;
  }
  const rows = [
    { pattern: '/en/resources', variant: 'keep' },
    { pattern: '/en/resources/*', variant: 'keep' },
  ];
  let i = 0;
  for (const a of rows) {
    await db.query(
      `INSERT INTO footer_assignments (pattern, variant_slug, sort_order) VALUES ($1, $2, $3)`,
      [a.pattern, a.variant, i++]
    );
  }
  console.log(`Assignments: seeded ${rows.length} (resources → keep).`);
}

async function main() {
  await seedSettings();
  await seedMenus();
  await seedAssignments();
  console.log('\nDone.');
  await db.close();
}

main().catch((err) => {
  console.error('Failed to seed footer:', err.message);
  process.exit(1);
});
