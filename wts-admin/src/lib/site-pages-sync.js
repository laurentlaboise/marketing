// Import the static site's English pages into the translations pipeline
// (site_pages rows + pending translation rows per language).
//
// Two sources, picked automatically:
//   filesystem — walks ../en when the admin runs inside a full repo
//     checkout (local dev, CI, `railway run` from a checkout)
//   live site  — the deployed admin ships only the wts-admin directory,
//     so it discovers pages from the production sitemap and fetches each
//     page's HTML over HTTPS
//
// Both paths use the same extractor the page generator applies on the way
// back out (src/lib/html-l10n.js), so segment keys always line up.
const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const core = require('./translation-core');
const l10n = require('./html-l10n');

// Tier 1 = money + trust surfaces (translate these first).
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

// wts-admin/src/lib → repo root /en (exists only in full checkouts).
const defaultSrcDir = () => path.resolve(__dirname, '../../../en');
const hasLocalSite = () => fs.existsSync(defaultSrcDir());

const siteBaseUrl = () => (process.env.SITE_BASE_URL || l10n.SITE_ORIGIN).replace(/\/$/, '');

// Static article exports are 'article' entities (translated via the SPA
// shell overlay); everything else under /en is a page. The article shell
// itself (articles/index.html) is a page, but it is noindex and therefore
// never appears in sitemap-driven live sync — filesystem sync includes it.
function isPageSitePath(sitePath) {
  if (sitePath.startsWith('/articles/')) return sitePath === '/articles/index.html';
  if (sitePath.startsWith('/checkout/')) return true; // Tier 3, still translatable
  return true;
}

function pageTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? l10n.normalizeText(match[1]).slice(0, 500) : null;
}

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

function applyFilters(sitePaths, { tier1Only = false, paths = [] } = {}) {
  return sitePaths.filter((sitePath) => {
    if (!isPageSitePath(sitePath)) return false;
    if (tier1Only && !TIER1_PATHS.has(sitePath)) return false;
    if (paths.length && !paths.some((p) => sitePath.includes(p))) return false;
    return true;
  });
}

async function upsertPage(sitePath, html, summary) {
  const segments = l10n.extractSegments(html);
  const keys = Object.keys(segments);
  if (keys.length === 0) {
    summary.empty += 1;
    return false;
  }
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
  return true;
}

// Archive pages whose source is gone — only on unfiltered full sweeps,
// where the inventory is authoritative.
async function archiveMissing(seenPaths, summary) {
  if (!seenPaths.length) return;
  const archived = await db.query(
    `UPDATE site_pages SET status = 'archived', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active' AND NOT (path = ANY($1)) RETURNING path`,
    [seenPaths]
  );
  summary.archived = archived.rows.length;
}

async function syncFromFilesystem({ srcDir = defaultSrcDir(), tier1Only = false, paths = [] } = {}) {
  if (!fs.existsSync(srcDir)) {
    throw Object.assign(new Error(`English tree not found at ${srcDir}`), { status: 400 });
  }
  const summary = { mode: 'filesystem', scanned: 0, upserted: 0, empty: 0, archived: 0, failed: 0, failures: [] };
  const sitePaths = applyFilters(
    walkHtml(srcDir).map((rel) => l10n.filePathToSitePath(rel)),
    { tier1Only, paths }
  );
  const seen = [];
  for (const sitePath of sitePaths) {
    summary.scanned += 1;
    const rel = sitePath === '/' ? 'index.html'
      : sitePath.endsWith('/') ? `${sitePath.slice(1)}index.html`
      : sitePath.slice(1);
    const html = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    if (await upsertPage(sitePath, html, summary)) seen.push(sitePath);
  }
  if (!tier1Only && paths.length === 0) await archiveMissing(seen, summary);
  return summary;
}

// Discover the page inventory from the production sitemap and pull each
// page over HTTPS. Fetches run with modest concurrency and per-request
// timeouts; individual failures are reported, never fatal.
async function syncFromLiveSite({ baseUrl = siteBaseUrl(), tier1Only = false, paths = [], limit = 300 } = {}) {
  const summary = { mode: 'live', scanned: 0, upserted: 0, empty: 0, archived: 0, failed: 0, failures: [] };

  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  const response = await fetch(sitemapUrl, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw Object.assign(new Error(`Could not fetch ${sitemapUrl} (${response.status})`), { status: 502 });
  }
  const xml = await response.text();

  const sitePaths = new Set(['/']); // homepage is always in scope
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const url = match[1];
    const pathMatch = /^https?:\/\/[^/]+\/en(\/[^\s<]*)$/.exec(url);
    if (pathMatch) sitePaths.add(pathMatch[1]);
  }
  const targets = applyFilters([...sitePaths].sort(), { tier1Only, paths }).slice(0, limit);

  const queue = [...targets];
  const seen = [];
  const worker = async () => {
    for (;;) {
      const sitePath = queue.shift();
      if (sitePath === undefined) return;
      summary.scanned += 1;
      try {
        const pageResponse = await fetch(`${baseUrl}/en${sitePath}`, {
          signal: AbortSignal.timeout(10000),
          headers: { accept: 'text/html' },
        });
        if (!pageResponse.ok) throw new Error(`HTTP ${pageResponse.status}`);
        const html = await pageResponse.text();
        if (await upsertPage(sitePath, html, summary)) seen.push(sitePath);
      } catch (error) {
        summary.failed += 1;
        if (summary.failures.length < 10) summary.failures.push(`${sitePath}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  // The sitemap is the full public inventory, so unfiltered clean sweeps
  // may archive leftovers — but never after partial/failed fetches.
  if (!tier1Only && paths.length === 0 && summary.failed === 0) await archiveMissing(seen, summary);
  return summary;
}

// mode 'auto' uses the local tree when the deployment has one (dev, CI,
// full-checkout runs) and falls back to the live site (Railway ships only
// wts-admin). Afterwards, materialize/refresh the translation rows so the
// pages actually appear in the pipeline for every target language.
async function syncSitePages({ mode = 'auto', tier1Only = false, paths = [] } = {}) {
  let summary;
  if (mode === 'filesystem' || (mode === 'auto' && hasLocalSite())) {
    summary = await syncFromFilesystem({ tier1Only, paths });
  } else {
    summary = await syncFromLiveSite({ tier1Only, paths });
  }
  const translations = await core.syncTranslationRows({ entityTypes: ['page'] });
  return { summary, translations };
}

module.exports = {
  TIER1_PATHS,
  hasLocalSite,
  defaultSrcDir,
  syncFromFilesystem,
  syncFromLiveSite,
  syncSitePages,
};
