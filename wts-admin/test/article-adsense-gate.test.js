const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MIN_PUBLISH_WORDS, countArticleWords, publishBlockedReason } = require('../src/lib/article-adsense-gate');

test('countArticleWords strips tags', () => {
  assert.equal(countArticleWords('<p>one two three</p>'), 3);
});

test('drafts are never blocked', () => {
  assert.equal(publishBlockedReason('draft', '<p>tiny</p>', 3), null);
});

test('published under 800 words is blocked', () => {
  const reason = publishBlockedReason('published', '<p>tiny</p>', 3);
  assert.match(reason, /800/);
  assert.match(reason, /3/);
});

test('published at floor is allowed', () => {
  const words = Array(MIN_PUBLISH_WORDS).fill('word').join(' ');
  assert.equal(publishBlockedReason('published', `<p>${words}</p>`, MIN_PUBLISH_WORDS), null);
});
