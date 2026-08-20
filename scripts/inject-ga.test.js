#!/usr/bin/env node
/**
 * GA4 injector: tool slugs + glossary terms only, official gtag snippet,
 * single measurement ID, idempotency.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  officialSnippet,
  headBlock,
  classifyPath,
  hasGa,
  processFile,
  HEAD_START,
} = require('./inject-ga.js');
const { MEASUREMENT_ID } = require('../config/ga.config.js');

const PAGE = (opts = {}) => {
  const robots = opts.noindex
    ? '<meta name="robots" content="noindex, follow">'
    : '<meta name="robots" content="index, follow">';
  const extra = opts.extraHead || '';
  const title = opts.title || 'Public page';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
${robots}
${extra}
</head>
<body><h1>${title}</h1></body>
</html>
`;
};

let tmp;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wts-ga-'));
  const files = {
    'en/resources/ai-tools/chatgpt/index.html': PAGE({ title: 'ChatGPT' }),
    'th/resources/ai-tools/dora-ai/index.html': PAGE({ title: 'Dora AI' }),
    'fr/resources/ai-tools/groq/index.html': PAGE({ title: 'Groq' }),
    'en/resources/glossary/keywords-in-seo-2026-guide.html': PAGE({ title: 'Keyword' }),
    'th/resources/glossary/keywords-in-seo-2026-guide.html': PAGE({ title: 'Keyword TH' }),
    'en/resources/glossary/index.html': PAGE({ title: 'Glossary index' }),
    'en/resources/ai-tools/index.html': PAGE({ title: 'Tools index' }),
    'en/index.html': PAGE({ title: 'Home' }),
    'en/articles/guide.html': PAGE({ title: 'Article' }),
    'en/resources/glossary/already.html': PAGE({
      title: 'Already',
      extraHead: headBlock(MEASUREMENT_ID) + '\n',
    }),
    'en/resources/glossary/secret.html': PAGE({ title: 'Noindex', noindex: true }),
  };
  for (const [rel, html] of Object.entries(files)) {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, html);
  }
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('include list covers tool slugs and glossary terms only', () => {
  assert.equal(classifyPath('en/resources/ai-tools/chatgpt/index.html'), null);
  assert.equal(classifyPath('th/resources/ai-tools/dora-ai/index.html'), null);
  assert.equal(classifyPath('en/resources/glossary/keywords-in-seo-2026-guide.html'), null);
  assert.match(classifyPath('en/resources/glossary/index.html') || '', /path rule|not in include/);
  assert.match(classifyPath('en/resources/ai-tools/index.html') || '', /path rule|not in include/);
  assert.match(classifyPath('en/index.html') || '', /not in include/);
  assert.match(classifyPath('en/articles/guide.html') || '', /not in include/);
});

test('official snippet is the live gtag.js property, not GTM', () => {
  const snip = officialSnippet(MEASUREMENT_ID);
  assert.match(snip, /googletagmanager\.com\/gtag\/js\?id=G-LMRKC1VBBB/);
  assert.match(snip, /gtag\('config', 'G-LMRKC1VBBB'\)/);
  assert.doesNotMatch(snip, /GTM-/);
  assert.doesNotMatch(snip, /AW-/);
  assert.doesNotMatch(snip, /enable_page_level_ads/);
});

test('injects once and stays idempotent', () => {
  const rel = 'en/resources/ai-tools/chatgpt/index.html';
  const first = processFile(rel, { root: tmp, dryRun: false, strip: false });
  assert.equal(first.status, 'INJECTED');
  const html = fs.readFileSync(path.join(tmp, rel), 'utf8');
  assert.equal(hasGa(html), true);
  assert.equal((html.match(/G-LMRKC1VBBB/g) || []).length, 2);
  assert.ok(html.includes(HEAD_START));
  const second = processFile(rel, { root: tmp, dryRun: false, strip: false });
  assert.equal(second.status, 'SKIPPED: already injected (idempotent)');
});

test('skips pages that already have the snippet and noindex pages', () => {
  assert.equal(
    processFile('en/resources/glossary/already.html', { root: tmp, dryRun: false, strip: false }).status,
    'SKIPPED: already injected (idempotent)'
  );
  assert.equal(
    processFile('en/resources/glossary/secret.html', { root: tmp, dryRun: false, strip: false }).status,
    'EXCLUDED: noindex'
  );
});

test('does not inject homepage or glossary index even if discovered', () => {
  assert.match(
    processFile('en/index.html', { root: tmp, dryRun: false, strip: false }).status,
    /EXCLUDED/
  );
  assert.match(
    processFile('en/resources/glossary/index.html', { root: tmp, dryRun: false, strip: false }).status,
    /EXCLUDED/
  );
});
