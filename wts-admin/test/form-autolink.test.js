// The article form's client-side auto-linker (hyperlinkContent in
// form.ejs) used to double-wrap terms on a second press and to link plain
// English words ("type", "consensus", Claude Hopkins' "Claude") to AI-tool
// vendor sites. These tests run the REAL function text extracted from the
// template, so the shipped behavior is what's pinned.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function loadLinker() {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../src/views/content/articles/form.ejs'),
    'utf8'
  );
  const start = src.indexOf('function hyperlinkContent(');
  const end = src.indexOf('function autoHyperlinkField(');
  assert.ok(start !== -1 && end > start, 'hyperlinkContent found in form.ejs');
  const body = src.slice(start, end);
  return new Function(
    'escapeRegex',
    `${body}; return hyperlinkContent;`
  )((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

const TERMS = {
  glossary: [
    { term: 'anchor text', definition: 'The clickable words.', link: '/en/resources/glossary/anchor-text-optimization-guide-2026.html', type: 'glossary' },
  ],
  seo_terms: [],
  ai_tools: [
    { term: 'Claude', definition: 'Anthropic assistant', link: '/en/resources/ai-tools/claude/', type: 'ai-tool', caseSensitive: true, properNoun: true },
    { term: 'Type', definition: 'AI docs', link: '/en/resources/ai-tools/type/', type: 'ai-tool', caseSensitive: true, properNoun: true },
  ],
};

test('form linker: links first mentions, second press is a no-op (no nesting, no duplicates)', () => {
  const hyperlinkContent = loadLinker();
  const html = '<h2>Anchor text in headings stays bare</h2><p>Great anchor text sells. More anchor text later.</p>';
  const first = hyperlinkContent(html, TERMS);
  assert.equal(first.count, 1);
  assert.match(first.html, /<h2>Anchor text in headings stays bare<\/h2>/, 'headings are never linked');
  assert.equal((first.html.match(/auto-linked/g) || []).length, 2, 'one anchor (class appears twice per anchor)');

  const second = hyperlinkContent(first.html, TERMS);
  assert.equal(second.count, 0, 'second press links nothing new');
  assert.equal(second.html, first.html, 'and rewrites nothing');
  assert.ok(!/<a[^>]*>[^<]*<a/.test(second.html), 'no nested anchors, ever');
});

test('form linker: AI tools are case-sensitive proper nouns', () => {
  const hyperlinkContent = loadLinker();
  const out = hyperlinkContent(
    '<p>Claude Hopkins wrote ads. Today Claude drafts them. Display type matters.</p>',
    TERMS
  );
  assert.ok(!out.html.includes('Claude</a> Hopkins'), 'Claude Hopkins is a person');
  assert.match(out.html, />Claude<\/a> drafts/, 'the standalone mention links');
  assert.ok(!out.html.includes('/en/resources/ai-tools/type/'), 'lowercase "type" never matches Type');
  assert.equal(out.details['ai-tool'], 1, 'tool links are counted under their own key');
});
