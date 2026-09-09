#!/usr/bin/env node
/**
 * Gate so future articles cannot ship invisible to Google.
 * Checks: live HTML files are indexable, in sitemaps, linked from the
 * listing, have Article schema, and do not point x-default at the homepage.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  articlePublicUrl,
  isIndexableArticleRel,
  assertArticleHead,
  sitemapHasLoc,
} = require('./lib/article-seo');

const ROOT = path.resolve(__dirname, '..');
const EN_ARTICLES = path.join(ROOT, 'en/articles');
const LISTING = path.join(ROOT, 'en/resources/articles/index.html');
const GOOGLE = path.join(ROOT, 'sitemap-google.xml');
const FULL = path.join(ROOT, 'sitemap.xml');
const INTERLINK = path.join(ROOT, 'wts-admin/src/lib/interlink.js');
const LOCALIZE = path.join(ROOT, 'scripts/generate-localized-pages.js');

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.name.endsWith('.html')) out.push(path.relative(path.join(ROOT, 'en'), full).replace(/\\/g, '/'));
  }
  return out;
}

const articleFiles = walk(EN_ARTICLES)
  .map((rel) => `en/${rel}`)
  .filter(isIndexableArticleRel);

test('at least one real article HTML file exists', () => {
  assert.ok(articleFiles.length >= 1, 'en/articles has no indexable article files');
});

test('each indexable article is in both sitemaps, has SOS Article schema, and is linked from the listing', () => {
  const listing = fs.readFileSync(LISTING, 'utf8');
  const googleXml = fs.readFileSync(GOOGLE, 'utf8');
  const fullXml = fs.readFileSync(FULL, 'utf8');
  for (const rel of articleFiles) {
    const slug = path.basename(rel, '.html');
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const url = articlePublicUrl(slug);
    const headErrors = assertArticleHead(html, { slug });
    assert.deepEqual(headErrors, [], `${rel}: ${headErrors.join('; ')}`);
    assert.ok(sitemapHasLoc(googleXml, url), `${rel} missing from sitemap-google.xml`);
    assert.ok(sitemapHasLoc(fullXml, url), `${rel} missing from sitemap.xml`);
    assert.ok(listing.includes(`/en/articles/${slug}.html`), `listing does not link ${slug}.html`);
  }
});

test('article hub SPA stays noindex so Google does not index Loading article...', () => {
  const hub = fs.readFileSync(path.join(EN_ARTICLES, 'index.html'), 'utf8').slice(0, 4000);
  assert.match(hub, /noindex/i);
});

test('interlink and JS share URLs mint .html (keyword identifiers / crawlers)', () => {
  const interlink = fs.readFileSync(INTERLINK, 'utf8');
  assert.match(interlink, /\/en\/articles\/\$\{a\.slug\}\.html/);
  const hubJs = fs.readFileSync(path.join(EN_ARTICLES, 'index.html'), 'utf8');
  assert.match(hubJs, /\/en\/articles\/\$\{article\.slug\}\.html/);
});

test('localize generator includes static article HTML for FR/TH', () => {
  const src = fs.readFileSync(LOCALIZE, 'utf8');
  assert.doesNotMatch(
    src,
    /if \(normalized\.startsWith\('articles\/'\)\) return normalized === 'articles\/index\.html';/,
    'articles were excluded from localization — FR/TH pages would never generate',
  );
});

test('FR and TH /articles/ hubs exist so language crawls are not 404', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'fr/articles/index.html')));
  assert.ok(fs.existsSync(path.join(ROOT, 'th/articles/index.html')));
});
