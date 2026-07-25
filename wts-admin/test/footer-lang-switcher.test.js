// The footer language selector must only ever LINK a language whose pages
// really exist as files. /th /la /fr are materialized by
// scripts/generate-localized-pages.js from PUBLISHED translations only, so a
// link to an unpublished locale points at a 404 — which is why the crawlable
// links were pulled in the first place. These tests pin the rule from both
// sides: absent mirror → inert span; present mirror → real link, no hand-edit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const { langSwitcherFor, localizeFooterLinks } = require(path.join(REPO_ROOT, 'scripts', 'inject-footers.js'));

// A fixture tree containing only the given page files (relative to the base).
function fixtureTree(files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wts-switcher-'));
  for (const rel of files) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '<!DOCTYPE html><html lang="en"></html>');
  }
  return base;
}

test('unpublished languages render as inert spans, never as links', () => {
  const base = fixtureTree(['en/index.html']);
  const nav = langSwitcherFor(path.join(base, 'en', 'index.html'), base);

  assert.match(nav, /<a href="\/en\/"[^>]*aria-current="true"[^>]*>EN<\/a>/);
  for (const [dir, label] of [['th', 'ไทย'], ['la', 'ລາວ'], ['fr', 'FR']]) {
    assert.match(nav, new RegExp(`<span class="lang-soon"[^>]*>${label}</span>`), `${dir} should be a span`);
    assert.doesNotMatch(nav, new RegExp(`href="/${dir}`), `${dir} must not be linked while it 404s`);
  }
  // No data-lang-dir on spans: the runtime enhancer must not resurrect an href.
  assert.equal(nav.match(/data-lang-dir/g).length, 1);
});

test('a language is linked as soon as its mirror exists on disk', () => {
  const base = fixtureTree([
    'en/digital-marketing-services/index.html',
    'th/digital-marketing-services/index.html',
  ]);
  const nav = langSwitcherFor(path.join(base, 'en', 'digital-marketing-services', 'index.html'), base);

  // Thai is published → real crawlable link, index.html collapsed to a dir URL.
  assert.match(nav, /<a href="\/th\/digital-marketing-services\/" data-lang-dir="th"[^>]*>ไทย<\/a>/);
  // Lao and French are still missing → still spans. Restoring one language
  // must not restore the others.
  assert.match(nav, /<span class="lang-soon"[^>]*>ລາວ<\/span>/);
  assert.match(nav, /<span class="lang-soon"[^>]*>FR<\/span>/);
});

test('a legacy redirect stub is not a mirror: span, never a bouncing link', () => {
  const base = fixtureTree(['en/index.html', 'th/index.html']);
  // Lao "exists" only as a meta-refresh stub that bounces to /en/ — the
  // exact leftover that made the footer offer a Lao button which
  // boomeranged visitors back to the English homepage.
  const stub = path.join(base, 'la', 'index.html');
  fs.mkdirSync(path.dirname(stub), { recursive: true });
  fs.writeFileSync(stub,
    '<!DOCTYPE html><html lang="en"><head><meta http-equiv="refresh" content="0;url=/en/"></head></html>');

  const nav = langSwitcherFor(path.join(base, 'en', 'index.html'), base);
  assert.match(nav, /<a href="\/th\/" data-lang-dir="th"/, 'real Thai mirror stays a link');
  assert.match(nav, /<span class="lang-soon"[^>]*>ລາວ<\/span>/, 'stubbed Lao renders inert');
  assert.doesNotMatch(nav, /href="\/la/, 'no crawlable link to a redirect stub');
});

test('per-page granularity: a language published on one page is not linked on another', () => {
  const base = fixtureTree(['en/index.html', 'en/prices/index.html', 'th/index.html']);

  const home = langSwitcherFor(path.join(base, 'en', 'index.html'), base);
  assert.match(home, /<a href="\/th\/" data-lang-dir="th"/);

  // /th/prices/ was never generated — the prices page must not link to it.
  const prices = langSwitcherFor(path.join(base, 'en', 'prices', 'index.html'), base);
  assert.doesNotMatch(prices, /href="\/th\/prices/);
  assert.match(prices, /<span class="lang-soon"[^>]*>ไทย<\/span>/);
});

// ── localizeFooterLinks: footer nav hrefs follow the page language ──
// The reset-to-English bug was footer content links hardcoded to /en/. These
// pin the fix: on a localized page, a footer /en/ link is rewritten to the
// page's locale when (and only when) that localized page exists on disk.

test('footer /en/ links are localized to the page language when the mirror exists', () => {
  const base = fixtureTree([
    'th/digital-marketing-services/index.html',
    'th/company/legal/privacy-policy.html',
  ]);
  const footer =
    '<a href="https://wordsthatsells.website/en/digital-marketing-services/">Services</a>' +
    '<a href="https://wordsthatsells.website/en/company/legal/privacy-policy.html">Privacy</a>';
  const out = localizeFooterLinks(footer, 'th', base);

  assert.match(out, /href="https:\/\/wordsthatsells\.website\/th\/digital-marketing-services\/"/);
  assert.match(out, /href="https:\/\/wordsthatsells\.website\/th\/company\/legal\/privacy-policy\.html"/);
  assert.doesNotMatch(out, /\/en\//, 'no /en/ link should survive when a Thai mirror exists');
});

test('footer link with no localized mirror keeps the working English URL', () => {
  const base = fixtureTree(['th/index.html']); // no Thai resources page
  const footer = '<a href="https://wordsthatsells.website/en/resources/ai-tools/">Automation</a>';
  const out = localizeFooterLinks(footer, 'th', base);

  // Honest fallback: a real English page beats a crawlable /th/ 404.
  assert.equal(out, footer);
});

test('a redirect-stub mirror is not localized (would boomerang to English)', () => {
  const base = fixtureTree(['th/index.html']);
  const stub = path.join(base, 'th', 'company', 'about-us', 'index.html');
  fs.mkdirSync(path.dirname(stub), { recursive: true });
  fs.writeFileSync(stub,
    '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/en/"></head></html>');
  const footer = '<a href="https://wordsthatsells.website/en/company/about-us/">About</a>';

  assert.equal(localizeFooterLinks(footer, 'th', base), footer);
});

test('root-relative /en/ hrefs are localized too', () => {
  const base = fixtureTree(['la/resources/glossary/index.html']);
  const out = localizeFooterLinks('<a href="/en/resources/glossary/">Glossary</a>', 'la', base);
  assert.match(out, /href="\/la\/resources\/glossary\/"/);
});

test('external links and non-/en paths are never rewritten', () => {
  const base = fixtureTree(['th/index.html']);
  const footer =
    '<a href="https://www.instagram.com/wordsthatsells.website.laos/">IG</a>' +
    '<a href="mailto:info@wordsthatsells.website">Mail</a>' +
    '<a href="/enterprise/plans/">Enterprise</a>' + // /en is not a locale segment here
    '<img src="https://wordsthatsells.website/images/logo.svg">';
  assert.equal(localizeFooterLinks(footer, 'th', base), footer);
});

test('English pages are left completely untouched', () => {
  const base = fixtureTree(['th/index.html']);
  const footer = '<a href="https://wordsthatsells.website/en/digital-marketing-services/">Services</a>';
  assert.equal(localizeFooterLinks(footer, 'en', base), footer);
  assert.equal(localizeFooterLinks(footer, null, base), footer);
});
