// link-hygiene repairs the two auto-link defects found in production:
// nested double-wrapped anchors and glossary hrefs slugged before the
// static-page reconciliation. The same functions run in the boot migration
// and in generate-seo-articles.js, so these tests pin real payload shapes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  GLOSSARY_SLUG_MAP,
  stripNestedAutoLinks,
  rewriteGlossaryHrefs,
  unwrapExternalAiToolLinks,
  sanitizeAutoLinks,
} = require('../src/lib/link-hygiene');

test('every mapped glossary slug points at a static page that actually exists', () => {
  const dir = path.resolve(__dirname, '../../en/resources/glossary');
  const pages = new Set(fs.readdirSync(dir));
  const targets = Object.values(GLOSSARY_SLUG_MAP);
  for (const t of targets) {
    assert.ok(pages.has(`${t}.html`), `missing static page for ${t}`);
  }
  assert.equal(new Set(targets).size, targets.length, 'no two slugs share a target page');
});

test('stripNestedAutoLinks unwraps the exact double-wrap shape found in production', () => {
  // Verbatim structure from the live logo-design article body.
  const nested =
    '<p>Your <a href="/en/resources/glossary/website.html" class="auto-linked auto-linked-glossary" title="A collection of interconnected web pages" data-type="glossary">' +
    '<a href="/en/resources/glossary/website.html" class="auto-linked auto-linked-glossary" title="A collection of interconnected web pages" data-type="glossary">website</a>' +
    '</a> is your storefront.</p>';
  const out = stripNestedAutoLinks(nested);
  assert.equal((out.match(/<a /g) || []).length, 1, 'one anchor survives');
  assert.match(out, />website<\/a> is your storefront/);
  assert.equal(stripNestedAutoLinks(out), out, 'idempotent on clean content');
});

test('stripNestedAutoLinks leaves normal anchors and non-nested auto-links alone', () => {
  const clean =
    '<p><a href="https://x.test">plain</a> and ' +
    '<a href="/en/y.html" class="auto-linked auto-linked-seo" data-type="seo">term</a> and ' +
    '<a href="https://z.test">another <strong>bold</strong> link</a></p>';
  assert.equal(stripNestedAutoLinks(clean), clean);
});

test('rewriteGlossaryHrefs repairs old slugs in every language mirror and skips unknown ones', () => {
  const html =
    '<a href="/en/resources/glossary/website.html" class="auto-linked">website</a>' +
    '<a href="/la/resources/glossary/anchor-text.html">anchor text</a>' +
    '<a href="/en/resources/glossary/website-seo-fundamentals-2026.html">already right</a>' +
    '<a href="/en/resources/glossary/progressive-web-apps.html">unmapped stays</a>';
  const out = rewriteGlossaryHrefs(html);
  assert.match(out, /href="\/en\/resources\/glossary\/website-seo-fundamentals-2026\.html"[^>]*>website</);
  assert.match(out, /href="\/la\/resources\/glossary\/anchor-text-optimization-guide-2026\.html"/);
  assert.match(out, />already right</);
  assert.match(out, /href="\/en\/resources\/glossary\/progressive-web-apps\.html"/);
});

test('unwrapExternalAiToolLinks removes off-site tool links, keeps internal ones and plain anchors', () => {
  const html =
    '<p>Circles say warm, angles say <a href="https://durable.co" class="auto-linked auto-linked-ai-tool" data-type="ai-tool">Durable</a>. ' +
    'See <a href="/en/resources/ai-tools/claude/" class="auto-linked auto-linked-ai-tool" data-type="ai-tool">Claude</a> and ' +
    '<a href="https://example.org">a hand-written link</a>.</p>';
  const out = unwrapExternalAiToolLinks(html);
  assert.ok(!out.includes('durable.co'), 'external tool link unwrapped');
  assert.match(out, /angles say Durable\./, 'its text survives');
  assert.match(out, /href="\/en\/resources\/ai-tools\/claude\/"/, 'internal tool link kept');
  assert.match(out, /href="https:\/\/example.org">a hand-written link<\/a>/, 'plain anchors untouched');
});

test('sanitizeAutoLinks composes both repairs', () => {
  const messy =
    '<a href="/en/resources/glossary/website.html" class="auto-linked auto-linked-glossary" data-type="glossary">' +
    '<a href="/en/resources/glossary/website.html" class="auto-linked auto-linked-glossary" data-type="glossary">website</a></a>';
  const out = sanitizeAutoLinks(messy);
  assert.equal(out,
    '<a href="/en/resources/glossary/website-seo-fundamentals-2026.html" class="auto-linked auto-linked-glossary" data-type="glossary">website</a>');
});
