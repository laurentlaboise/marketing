const { test } = require('node:test');
const assert = require('node:assert/strict');
const { injectHtml } = require('../src/lib/adsense-inject');

function articlePage(body) {
  return `<!DOCTYPE html><html><head><title>T</title></head><body>
<article>
<header class="article-header"><h1>Title</h1></header>
<div class="article-content">${body}</div>
<div class="cta-box"><a href="/en/company/">x</a></div>
</article>
</body></html>`;
}

test('skips non-article paths', () => {
  const r = injectHtml('<html><head></head><body></body></html>', 'en/company/index.html');
  assert.match(r.status, /EXCLUDED/);
  assert.equal(r.html.includes('adsbygoogle'), false);
});

test('injects units on a long article with anchors', () => {
  const para = `<p>${Array(200).fill('word').join(' ')}</p>`;
  const html = articlePage(para + para + para + para + para);
  const r = injectHtml(html, 'en/articles/ai-video-marketing-southeast-asia.html');
  assert.equal(r.status, 'INJECTED');
  assert.ok(r.injected.includes('article_top'));
  assert.ok(r.injected.includes('article_bottom'));
  assert.ok(r.html.includes('ca-pub-8300153677207733'));
  assert.ok(r.html.includes('wts-adsense:head:start'));
});

test('idempotent on second pass', () => {
  const para = `<p>${Array(200).fill('word').join(' ')}</p>`;
  const first = injectHtml(articlePage(para + para + para + para), 'en/articles/demo.html');
  const second = injectHtml(first.html, 'en/articles/demo.html');
  assert.match(second.status, /SKIPPED/);
});
