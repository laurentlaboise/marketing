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
const { langSwitcherFor } = require(path.join(REPO_ROOT, 'scripts', 'inject-footers.js'));

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

test('per-page granularity: a language published on one page is not linked on another', () => {
  const base = fixtureTree(['en/index.html', 'en/prices/index.html', 'th/index.html']);

  const home = langSwitcherFor(path.join(base, 'en', 'index.html'), base);
  assert.match(home, /<a href="\/th\/" data-lang-dir="th"/);

  // /th/prices/ was never generated — the prices page must not link to it.
  const prices = langSwitcherFor(path.join(base, 'en', 'prices', 'index.html'), base);
  assert.doesNotMatch(prices, /href="\/th\/prices/);
  assert.match(prices, /<span class="lang-soon"[^>]*>ไทย<\/span>/);
});
