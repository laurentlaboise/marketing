// The shared article-sidebar module (js/services/article-sidebar.js) renders
// the sticky "In this guide" card for every article surface: the article
// shell, the static article pages, generate-seo-articles.js (Node-side), and
// the admin publish preview. These tests pin the Node API that the static
// generator builds against.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const lib = require(path.resolve(__dirname, '../../js/services/article-sidebar.js'));

test('injectHeadingIds anchors h2/h3, keeps explicit ids, dedups, decodes entities', () => {
  const { html, headings } = lib.injectHeadingIds(
    '<h2>1. Logo Shapes &amp; Colors</h2><p>x</p><h2 id="kept">Kept</h2><h3>2.1 Sub</h3><h2>1. Logo Shapes &amp; Colors</h2>'
  );
  assert.equal(headings.length, 4);
  assert.equal(headings[0].id, 'logo-shapes-colors', 'numbering stripped, entities decoded');
  assert.equal(headings[1].id, 'kept', 'explicit id preserved');
  assert.equal(headings[2].level, 3);
  assert.equal(headings[3].id, 'logo-shapes-colors-2', 'duplicate heading gets a suffix');
  assert.match(html, /<h2 id="logo-shapes-colors">/);
  assert.match(html, /<h2 id="logo-shapes-colors-2">/);
});

test('resolveChapters fuzzy-matches hand-written labels to numbered headings', () => {
  const headings = [
    { id: 'why-visual-identity-matters-more-in-laos-right-now', text: '1. Why Visual Identity Matters More in Laos Right Now', level: 2 },
    { id: 'the-psychology-of-logo-shapes', text: '2. The Psychology of Logo Shapes — What Neuroscience Actually Shows', level: 2 },
    { id: 'sources', text: 'Sources', level: 2 },
  ];
  const entries = lib.resolveChapters(
    ['Why visual identity matters in Laos now', 'Logo shape psychology (neuroscience)', 'Something entirely unrelated'],
    headings
  );
  assert.equal(entries[0].id, 'why-visual-identity-matters-more-in-laos-right-now');
  assert.equal(entries[1].id, 'the-psychology-of-logo-shapes');
  assert.equal(entries[2].id, null, 'unmatched chapters stay non-clickable');
});

test('buildCardHTML renders chapters as links, escapes text, honors ctaHref', () => {
  const article = {
    title: 'Title <script>alert(1)</script>',
    category: 'branding',
    featured_image_url: 'https://x.test/img.webp',
    time_to_read: 5,
    word_count: 1234,
    published_at: '2026-07-13T00:00:00Z',
    content_labels: {
      description: 'A hook & a promise',
      facts: ['50ms judgments'],
      sources: [{ name: 'Lindgaard 2006', url: 'https://doi.org/x' }, 'Plain source'],
      faqs_count: 2,
      cta_text: 'Read it',
    },
  };
  const html = lib.buildCardHTML(article, [{ text: 'First section', id: 'first-section' }, { text: 'No anchor', id: null }], { ctaHref: '#article-container' });
  assert.match(html, /class="sidebar-chapter-link" href="#first-section"/);
  assert.ok(!html.includes('<script>alert'), 'title is escaped');
  assert.match(html, /A hook &amp; a promise/);
  assert.match(html, /href="https:\/\/doi.org\/x"[^>]*class="sidebar-source-badge"/);
  assert.match(html, /href="#article-container"/);
  assert.match(html, /1,234 words/);
  assert.match(html, /2 FAQs/);
  assert.ok(html.includes('<li>No anchor</li>'), 'unmatched chapter renders as plain text');
});

test('buildCardHTML returns empty string when there is nothing to show', () => {
  assert.equal(lib.buildCardHTML({ title: 'T', content_labels: {} }, []), '');
});

test('source URLs with unsafe schemes render as plain badges, never links', () => {
  const html = lib.buildCardHTML({
    title: 'T',
    content_labels: {
      description: 'd',
      sources: [
        { name: 'Evil', url: 'javascript:alert(1)' },
        { name: 'Data', url: 'data:text/html,x' },
        { name: 'Fine', url: 'https://example.org/x' },
      ],
    },
  }, []);
  assert.ok(!html.includes('javascript:'), 'javascript: URL never reaches an href');
  assert.ok(!html.includes('data:text'), 'data: URL never reaches an href');
  assert.match(html, /<span class="sidebar-source-badge">Evil<\/span>/, 'unsafe source falls back to a span');
  assert.match(html, /href="https:\/\/example.org\/x"/, 'https link stays clickable');
});
