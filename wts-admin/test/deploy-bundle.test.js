// Railway roots the admin service at wts-admin/, so nothing outside this
// directory exists in production. Two assets therefore ship as committed
// copies, and these tests fail the build the moment either drifts from the
// site tree it mirrors:
//
//   - public/vendor/article-sidebar.js — served to the article form (the
//     /vendor route 404'd in production before this bundle existed);
//     regenerate with:  cp js/services/article-sidebar.js wts-admin/public/vendor/
//   - config/ai-tool-pages.json — the slugs aiToolPageSet() falls back to
//     when en/resources/ai-tools/ isn't on disk; regenerate with the
//     one-liner in this file's assertion message.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

test('bundled sidebar module is byte-identical to the site-tree module', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js/services/article-sidebar.js'), 'utf8');
  const bundled = fs.readFileSync(path.resolve(__dirname, '../public/vendor/article-sidebar.js'), 'utf8');
  assert.equal(bundled, source,
    'public/vendor/article-sidebar.js is stale — run: cp js/services/article-sidebar.js wts-admin/public/vendor/');
});

test('AI-tool page manifest matches the real static page directories', () => {
  const dir = path.join(ROOT, 'en/resources/ai-tools');
  const actual = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'index.html')))
    .map((d) => d.name)
    .sort();
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config/ai-tool-pages.json'), 'utf8'));
  assert.deepEqual([...manifest].sort(), actual,
    'config/ai-tool-pages.json is stale — regenerate it from en/resources/ai-tools/');
});
