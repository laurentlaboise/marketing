#!/usr/bin/env node
/**
 * Meta Pixel injector: include/exclude path rules, official loader,
 * PageView-only snippet, and idempotency.
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
  hasNoindex,
  is404Page,
  hasPixel,
  processFile,
  HEAD_START,
} = require('./inject-pixel.js');
const { PIXEL_ID, LEGACY_PIXEL_ID } = require('../config/pixel.config.js');

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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wts-pixel-'));
  const files = {
    'en/index.html': PAGE({ title: 'Home' }),
    'en/shop/index.html': PAGE({ title: 'Shop' }),
    'en/digital-marketing-services/index.html': PAGE({ title: 'Services' }),
    'en/articles/guide.html': PAGE({ title: 'Article' }),
    'en/resources/glossary/seo.html': PAGE({ title: 'Glossary' }),
    'en/resources/ai-tools/jasper/index.html': PAGE({ title: 'AI tool' }),
    'th/index.html': PAGE({ title: 'หน้าแรก' }),
    'fr/index.html': PAGE({ title: 'Accueil' }),
    'la/index.html': PAGE({ title: 'Lao home' }),
    'lo/index.html': PAGE({ title: 'Lo home' }),
    'en/checkout/success.html': PAGE({ title: 'Checkout' }),
    'forms/ideas.html': PAGE({ title: 'Form' }),
    'wts-admin/index.html': PAGE({ title: 'Admin' }),
    '404.html': PAGE({ title: '404 Not Found' }),
    'en/articles/secret.html': PAGE({ title: 'Noindex', noindex: true }),
    'en/resources/glossary/already.html': PAGE({
      title: 'Already',
      extraHead: headBlock(PIXEL_ID) + '\n',
    }),
    'en/company/index.html': PAGE({ title: 'Company' }),
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

test('include list covers homepage, shop, services, articles, resources, language roots', () => {
  const included = [
    'en/index.html',
    'en/shop/index.html',
    'en/digital-marketing-services/index.html',
    'en/articles/guide.html',
    'en/resources/glossary/seo.html',
    'en/resources/ai-tools/jasper/index.html',
    'th/index.html',
    'fr/index.html',
    'la/index.html',
    'lo/index.html',
  ];
  for (const rel of included) {
    assert.equal(classifyPath(rel), null, rel);
  }
});

test('exclude list covers admin, forms, checkout, payment, 404 paths, and company', () => {
  assert.match(classifyPath('wts-admin/index.html'), /path rule|not in include/);
  assert.match(classifyPath('forms/ideas.html'), /path rule|not in include/);
  assert.match(classifyPath('en/checkout/success.html'), /path rule/);
  assert.match(classifyPath('checkout/index.html'), /path rule/);
  assert.match(classifyPath('en/payment/card.html'), /path rule/);
  assert.match(classifyPath('404.html'), /path rule/);
  assert.match(classifyPath('en/company/index.html'), /not in include/);
});

test('official snippet keeps the fbq loader, init, PageView, and noscript img', () => {
  const snippet = officialSnippet(PIXEL_ID);
  assert.match(snippet, /!function\(f,b,e,v,n,t,s\)/);
  assert.match(snippet, /n\.callMethod\.apply\(n,arguments\):n\.queue\.push\(arguments\)/);
  assert.match(snippet, /https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(snippet, new RegExp(`fbq\\('init', '${PIXEL_ID}'\\)`));
  assert.match(snippet, /fbq\('track', 'PageView'\)/);
  assert.match(
    snippet,
    new RegExp(`facebook\\.com/tr\\?id=${PIXEL_ID}&ev=PageView&noscript=1`)
  );
  assert.doesNotMatch(snippet, /fbq\('track', '(?!PageView)[^']+'/);
  assert.doesNotMatch(snippet, new RegExp(LEGACY_PIXEL_ID));
  assert.equal(PIXEL_ID, '870830501505334');
});

test('noindex and 404 content checks', () => {
  assert.equal(hasNoindex(PAGE({ noindex: true })), true);
  assert.equal(hasNoindex(PAGE()), false);
  assert.equal(is404Page('404.html', PAGE()), true);
  assert.equal(is404Page('en/index.html', PAGE({ title: 'Home' })), false);
  assert.equal(is404Page('en/oops.html', PAGE({ title: '404 Not Found' })), true);
});

test('injects into a public page and is idempotent on re-run', () => {
  const rel = 'en/index.html';
  const first = processFile(rel, { root: tmp, dryRun: false, strip: false });
  assert.equal(first.status, 'INJECTED');
  const html = fs.readFileSync(path.join(tmp, rel), 'utf8');
  assert.ok(html.includes(HEAD_START));
  assert.ok(html.includes(`fbq('init', '${PIXEL_ID}')`));
  assert.ok(html.includes(`id=${PIXEL_ID}&ev=PageView&noscript=1`));
  assert.ok(!html.includes(LEGACY_PIXEL_ID));
  const count = html.split(HEAD_START).length - 1;
  assert.equal(count, 1);

  const second = processFile(rel, { root: tmp, dryRun: false, strip: false });
  assert.equal(second.status, 'SKIPPED: already injected (idempotent)');
  const again = fs.readFileSync(path.join(tmp, rel), 'utf8');
  assert.equal(again.split(HEAD_START).length - 1, 1);
  assert.equal(again, html);
});

test('skips noindex, checkout, and pages that already have a pixel', () => {
  assert.equal(
    processFile('en/articles/secret.html', { root: tmp, dryRun: false, strip: false }).status,
    'EXCLUDED: noindex'
  );
  assert.match(
    processFile('en/checkout/success.html', { root: tmp, dryRun: false, strip: false }).status,
    /EXCLUDED: path rule/
  );
  assert.equal(
    processFile('en/resources/glossary/already.html', { root: tmp, dryRun: false, strip: false }).status,
    'SKIPPED: already injected (idempotent)'
  );
  assert.equal(hasPixel(fs.readFileSync(path.join(tmp, 'en/resources/glossary/already.html'), 'utf8')), true);
});
