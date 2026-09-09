const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  articlePublicPath,
  articlePublicUrl,
  isIndexableArticleRel,
  insertSitemapLoc,
  sitemapHasLoc,
  assertArticleHead,
} = require('./article-seo');

test('article URLs always end in .html', () => {
  assert.equal(articlePublicPath('logo-design-in-laos'), '/en/articles/logo-design-in-laos.html');
  assert.equal(articlePublicPath('logo-design-in-laos.html'), '/en/articles/logo-design-in-laos.html');
  assert.equal(articlePublicUrl('x', 'th'), 'https://wordsthatsells.website/th/articles/x.html');
});

test('indexable article filter skips shells, stubs, and folder redirects', () => {
  assert.equal(isIndexableArticleRel('en/articles/logo-design-in-laos-the-data-backed-guide-for-2026.html'), true);
  assert.equal(isIndexableArticleRel('en/articles/index.html'), false);
  assert.equal(isIndexableArticleRel('en/articles/example-article.html'), false);
  assert.equal(isIndexableArticleRel('en/articles/logo-design.html'), false);
  assert.equal(isIndexableArticleRel('en/articles/foo/index.html'), false);
});

test('sitemap insert is idempotent', () => {
  const loc = 'https://wordsthatsells.website/en/articles/new-piece.html';
  const base = '<?xml version="1.0"?>\n<urlset>\n</urlset>\n';
  const first = insertSitemapLoc(base, loc, { lastmod: '2026-09-09' });
  assert.equal(first.changed, true);
  assert.equal(sitemapHasLoc(first.xml, loc), true);
  const second = insertSitemapLoc(first.xml, loc);
  assert.equal(second.changed, false);
});

test('assertArticleHead flags homepage x-default', () => {
  const html = `<html><head>
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://wordsthatsells.website/en/articles/demo.html">
    <link rel="alternate" hreflang="x-default" href="https://wordsthatsells.website/en/">
    <script type="application/ld+json">{"@type":"Article"}</script>
  </head></html>`;
  const errors = assertArticleHead(html, { slug: 'demo' });
  assert.ok(errors.some((e) => /x-default/.test(e)));
});
