#!/usr/bin/env node
/**
 * CLI wrapper around src/lib/site-pages-sync.js — imports the static
 * site's English pages into the translations pipeline (site_pages rows +
 * pending translation rows per language).
 *
 * The same import is available in the admin UI (Localization →
 * Translations → "Sync Site Pages"), which works on deployments that
 * ship only wts-admin by fetching the live site. This CLI is the
 * full-checkout equivalent:
 *   node scripts/sync-site-pages.js                 # all pages (local en/)
 *   node scripts/sync-site-pages.js --tier1-only    # money + trust pages
 *   node scripts/sync-site-pages.js --paths prices,contact-us
 *   node scripts/sync-site-pages.js --live          # force live-site fetch
 * On Railway: railway run node scripts/sync-site-pages.js
 */
require('dotenv').config();
const db = require('../database/db');
const sitePagesSync = require('../src/lib/site-pages-sync');

async function main() {
  const args = process.argv.slice(2);
  const pathsIndex = args.indexOf('--paths');
  const result = await sitePagesSync.syncSitePages({
    mode: args.includes('--live') ? 'live' : 'auto',
    tier1Only: args.includes('--tier1-only'),
    paths: pathsIndex !== -1 ? args[pathsIndex + 1].split(',').map((s) => s.trim()).filter(Boolean) : [],
  });

  const { summary, translations } = result;
  console.log(`site_pages (${summary.mode}): ${summary.upserted} upserted, ${summary.empty} skipped (no text), ` +
    `${summary.archived} archived, ${summary.failed} failed`);
  for (const failure of summary.failures) console.log(`  ! ${failure}`);
  console.log(`translations: ${translations.created} created, ${translations.stale} re-opened, ${translations.scanned} pages scanned`);
  await db.close();
}

main().catch((error) => {
  console.error('sync-site-pages failed:', error.message);
  process.exit(1);
});
