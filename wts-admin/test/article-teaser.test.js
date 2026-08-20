// The listing/side-menu teaser card (src/lib/article-teaser.js). The card
// carries no CTA button any more — each surface links to the article itself —
// so these pin both halves of that: the builder never emits one, and teasers
// saved before the change lose theirs on the way out.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildArticleListingTeaserHtml, stripTeaserCtaButtons } = require('../src/lib/article-teaser');

const LABELS = {
  description: 'A hook & a promise',
  chapters: ['First section', 'Second section'],
  facts: ['50ms judgments'],
  sources: [{ name: 'Lindgaard 2006', url: 'https://doi.org/x' }, 'Plain source'],
  faqs_count: 6,
  cta_text: 'Read full article',
};

test('the generated teaser has no CTA button, whatever cta_text says', () => {
  const html = buildArticleListingTeaserHtml({
    title: 'Logo Design in Laos',
    featured_image: 'https://x.test/img.webp',
    author_name: 'Words That Sells',
    time_to_read: 12,
    published_url: 'https://wordsthatsells.website/en/articles/logo-design.html',
    slug: 'logo-design',
    category: 'branding',
    content_labels: LABELS,
  });
  assert.match(html, /data-teaser-source="content_labels"/);
  assert.match(html, /First section/, 'chapters still render');
  assert.match(html, /class="sidebar-source-badge"|sidebar-source-badge|Lindgaard 2006/, 'source badges still render');
  assert.ok(!html.includes('→'), 'no arrow CTA');
  assert.ok(!html.includes('Read full article'), 'the cta_text label is not rendered');
  assert.ok(!html.includes('/en/articles/logo-design.html'), 'no button linking off the card');
});

test('stripTeaserCtaButtons drops a legacy CTA button, keeps badges and links', () => {
  const legacy = [
    '<article class="preview-card">',
    '<p>Body copy with an <a href="https://example.org/x">inline link</a>.</p>',
    '<a href="https://example.org/s" style="display:inline-block;background:#eef2ff;color:#1e3a8a;padding:4px 10px;border-radius:999px;">Source badge</a>',
    '<a href="https://wordsthatsells.website/en/articles/other" style="display:inline-block;background:#1f85c9;color:#fff;padding:10px 18px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">test →</a>',
    '</article>',
  ].join('');
  const stripped = stripTeaserCtaButtons(legacy);
  assert.ok(!stripped.includes('test →'), 'the CTA button is gone');
  assert.ok(!stripped.includes('/en/articles/other'), 'and its href with it');
  assert.match(stripped, /Source badge/, 'source badges survive');
  assert.match(stripped, /inline link/, 'inline body links survive');
});

test('stripTeaserCtaButtons also drops class-based and icon-arrow CTAs', () => {
  assert.equal(
    stripTeaserCtaButtons('<p>x</p><a class="btn" href="/a" style="display:inline-block;">Read full article →</a>'),
    '<p>x</p>'
  );
  assert.equal(
    stripTeaserCtaButtons('<p>x</p><a href="#article-container" class="sidebar-cta-btn">Read full article <i class="fas fa-arrow-right"></i></a>'),
    '<p>x</p>'
  );
});

test('stripTeaserCtaButtons passes through empty and non-string input', () => {
  assert.equal(stripTeaserCtaButtons(''), '');
  assert.equal(stripTeaserCtaButtons(null), null);
  assert.equal(stripTeaserCtaButtons(undefined), undefined);
});
