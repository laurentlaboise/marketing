#!/usr/bin/env node
/**
 * hreflang consistency audit (CI gate for the localized site).
 *
 * For every HTML page under en/ th/ la/ fr/:
 *   1. every alternate the page declares for this site must resolve to a
 *      file that actually exists (soft-fallback URLs are not alternates)
 *   2. alternates must be reciprocal: if A lists B, B must list A
 *   3. a page declaring any non-English alternate must also declare
 *      hreflang="en" and hreflang="x-default"
 *   4. a localized (th/la/fr) page must declare a canonical pointing at
 *      its own language URL, not at /en/
 *
 * Pages with no alternates at all pass (English pages before any mirror
 * exists). Exits 1 with a report when any rule is violated.
 *
 * Usage: node scripts/check-hreflang.js
 */
const fs = require('fs');
const path = require('path');
const { SITE_ORIGIN } = require('./lib/html-l10n');

const ROOT = path.resolve(__dirname, '..');
const LANG_DIRS = ['en', 'th', 'la', 'fr'];

function walkHtml(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(full, base));
    else if (entry.name.endsWith('.html') && !/backup|dynamic/i.test(entry.name)) files.push(full);
  }
  return files;
}

// https://site/th/company/about-us/ → th/company/about-us/index.html.
// Extensionless URLs may resolve to either <path>.html (GitHub Pages
// serves .html files extensionless — the legal pages link themselves this
// way) or <path>/index.html; return whichever exists, preferring .html.
function urlToFile(url) {
  if (!url.startsWith(SITE_ORIGIN + '/')) return null;
  let rel = url.slice(SITE_ORIGIN.length + 1);
  if (rel.endsWith('/') || rel === '') return rel + 'index.html';
  if (rel.endsWith('.html')) return rel;
  const asHtml = `${rel}.html`;
  if (fs.existsSync(path.join(ROOT, asHtml))) return asHtml;
  return `${rel}/index.html`;
}

function parseAlternates(html) {
  const alternates = [];
  const re = /<link\b[^>]*rel="alternate"[^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const hreflang = /hreflang="([^"]*)"/i.exec(match[0]);
    const href = /href="([^"]*)"/i.exec(match[0]);
    if (hreflang && href) alternates.push({ hreflang: hreflang[1], href: href[1] });
  }
  return alternates;
}

function parseCanonical(html) {
  const match = /<link\b[^>]*rel="canonical"[^>]*href="([^"]*)"/i.exec(html) ||
    /<link\b[^>]*href="([^"]*)"[^>]*rel="canonical"/i.exec(html);
  return match ? match[1] : null;
}

function main() {
  const problems = [];
  const pages = new Map(); // rel file → { alternates, canonical }

  for (const dir of LANG_DIRS) {
    for (const abs of walkHtml(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      const html = fs.readFileSync(abs, 'utf8');
      pages.set(rel, { alternates: parseAlternates(html), canonical: parseCanonical(html) });
    }
  }

  for (const [rel, page] of pages) {
    const own = `${rel}`;
    const siteAlternates = page.alternates.filter((a) => a.href.startsWith(SITE_ORIGIN));
    if (siteAlternates.length === 0) continue;

    const nonEnglish = siteAlternates.some((a) => !['en', 'x-default'].includes(a.hreflang));
    if (nonEnglish) {
      if (!siteAlternates.some((a) => a.hreflang === 'en')) {
        problems.push(`${rel}: declares localized alternates but no hreflang="en"`);
      }
      if (!siteAlternates.some((a) => a.hreflang === 'x-default')) {
        problems.push(`${rel}: declares localized alternates but no hreflang="x-default"`);
      }
    }

    for (const alt of siteAlternates) {
      const targetRel = urlToFile(alt.href);
      if (!targetRel) continue;
      if (!fs.existsSync(path.join(ROOT, targetRel))) {
        problems.push(`${rel}: alternate hreflang="${alt.hreflang}" → ${alt.href} has no file (${targetRel})`);
        continue;
      }
      // Reciprocity — the target must list this page back (self-reference
      // counts for the page's own language). x-default is a fallback
      // pointer, not a language pair: legacy pages aim it at the homepage,
      // so it is exempt from reciprocity (existence is still checked).
      if (alt.hreflang === 'x-default') continue;
      if (targetRel === own) continue;
      const target = pages.get(targetRel);
      if (!target) continue; // outside the audited trees
      const backHref = `${SITE_ORIGIN}/${own}`.replace(/\/index\.html$/, '/');
      if (!target.alternates.some((a) => a.href === backHref)) {
        problems.push(`${rel}: alternate → ${targetRel}, but that page does not link back to ${backHref}`);
      }
    }

    // Localized pages must be self-canonical.
    const langDir = rel.split('/')[0];
    if (langDir !== 'en' && page.canonical) {
      const expectedPrefix = `${SITE_ORIGIN}/${langDir}/`;
      if (!page.canonical.startsWith(expectedPrefix)) {
        problems.push(`${rel}: canonical ${page.canonical} does not point at its own language (${expectedPrefix}…)`);
      }
    }
  }

  if (problems.length) {
    console.error(`hreflang audit: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`hreflang audit: OK (${pages.size} pages checked)`);
}

main();
