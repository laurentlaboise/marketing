#!/usr/bin/env node
/**
 * Sync the static site's English pages into the translations pipeline.
 *
 * Walks every .html page under ../en, extracts the translatable text segments
 * (scripts/lib/html-l10n.js at the repo root — the exact extractor the
 * page generator applies on the way back out), upserts site_pages rows,
 * and then runs the Part 1 sync so every page × language gets a
 * translations row (entity_type='page'): AI batch picks up th/fr, Lao
 * queues for the human vendor workspace. Published rows whose English
 * source changed are automatically re-opened (source-hash diff).
 *
 * Run wherever both the repo checkout and DATABASE_URL are available:
 *   node scripts/sync-site-pages.js                 # all pages
 *   node scripts/sync-site-pages.js --tier1-only    # money + trust pages first
 *   node scripts/sync-site-pages.js --paths prices,contact-us
 * On Railway: railway run node scripts/sync-site-pages.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const core = require('../src/lib/translation-core');
const l10n = require('../../scripts/lib/html-l10n');

const SITE_ROOT = path.resolve(__dirname, '../..');
const EN_DIR = path.join(SITE_ROOT, 'en');

// Tier 1 = money + trust surfaces (translated first).
const TIER1_PATHS = new Set([
  '/',
  '/digital-marketing-services/',
  '/digital-marketing-services/prices/',
  '/digital-marketing-services/business-tools/',
  '/digital-marketing-services/content-creation/',
  '/digital-marketing-services/social-media-management/',
  '/digital-marketing-services/web-development/',
  '/company/contact-us/',
  '/company/about-us/',
  '/company/affiliate-sales/',
  '/company/digital-agencies/',
  '/company/legal/',
  '/company/legal/privacy-policy.html',
  '/company/legal/terms-and-conditions.html',
  '/company/legal/cookie-policy.html',
  '/company/legal/Software-licence-agreement.html',
  '/company/legal/terms_of_services_and_sales.html',
]);

function walkHtml(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(full, base));
    else if (entry.name.endsWith('.html') && !/backup|dynamic/i.test(entry.name)) {
      files.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return files.sort();
}

// Static article exports are 'article' entities; the SPA shell is a page.
function isPageFile(relFile) {
  if (relFile.startsWith('articles/')) return relFile === 'articles/index.html';
  return true;
}

function pageTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? l10n.normalizeText(match[1]).slice(0, 500) : null;
}

async function main() {
  const args = process.argv.slice(2);
  const tier1Only = args.includes('--tier1-only');
  const pathsIndex = args.indexOf('--paths');
  const pathFilters = pathsIndex !== -1 ? args[pathsIndex + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];

  if (!fs.existsSync(EN_DIR)) {
    console.error(`English tree not found at ${EN_DIR} — run from a full repo checkout.`);
    process.exit(1);
  }

  const pages = walkHtml(EN_DIR).filter(isPageFile).filter((rel) => {
    const sitePath = l10n.filePathToSitePath(rel);
    if (tier1Only && !TIER1_PATHS.has(sitePath)) return false;
    if (pathFilters.length && !pathFilters.some((p) => sitePath.includes(p))) return false;
    return true;
  });

  const summary = { upserted: 0, empty: 0, archived: 0 };
  const seenPaths = [];

  for (const rel of pages) {
    const html = fs.readFileSync(path.join(EN_DIR, rel), 'utf8');
    const segments = l10n.extractSegments(html);
    const keys = Object.keys(segments);
    if (keys.length === 0) {
      summary.empty += 1;
      continue;
    }
    const sitePath = l10n.filePathToSitePath(rel);
    seenPaths.push(sitePath);
    await db.query(
      `INSERT INTO site_pages (path, title, segments, segment_count, word_count, tier, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       ON CONFLICT (path) DO UPDATE SET
         title = EXCLUDED.title,
         segments = EXCLUDED.segments,
         segment_count = EXCLUDED.segment_count,
         word_count = EXCLUDED.word_count,
         tier = EXCLUDED.tier,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP`,
      [
        sitePath,
        pageTitle(html),
        JSON.stringify(segments),
        keys.length,
        core.countWords(segments),
        TIER1_PATHS.has(sitePath) ? 1 : 2,
      ]
    );
    summary.upserted += 1;
    console.log(`[page] ${sitePath} — ${keys.length} segments`);
  }

  // Archive pages whose English file is gone (only on unfiltered runs —
  // a filtered run sees a partial inventory and must not archive the rest).
  if (!tier1Only && pathFilters.length === 0 && seenPaths.length) {
    const archived = await db.query(
      `UPDATE site_pages SET status = 'archived', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active' AND NOT (path = ANY($1)) RETURNING path`,
      [seenPaths]
    );
    summary.archived = archived.rows.length;
  }

  // Materialize/refresh the translation rows (pending th/la/fr per page;
  // published rows with changed sources re-open automatically).
  const syncSummary = await core.syncTranslationRows({ entityTypes: ['page'] });

  console.log(`\nsite_pages: ${summary.upserted} upserted, ${summary.empty} skipped (no text), ${summary.archived} archived`);
  console.log(`translations: ${syncSummary.created} created, ${syncSummary.stale} re-opened, ${syncSummary.scanned} pages scanned`);
  await db.close();
}

main().catch((error) => {
  console.error('sync-site-pages failed:', error.message);
  process.exit(1);
});
