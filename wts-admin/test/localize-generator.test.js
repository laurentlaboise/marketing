// End-to-end fixture run of the static-site localization generator
// (scripts/generate-localized-pages.js at the repo root). No database —
// translations come from an offline --payloads file, so this exercises
// exactly what the localize-site workflow does with API data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'generate-localized-pages.js');
const l10n = require(path.join(REPO_ROOT, 'scripts', 'lib', 'html-l10n.js'));

const FIXTURE_PAGE = `<!DOCTYPE html>
<html lang="en" id="top">
<head>
    <meta charset="UTF-8">
    <title>Fixture Page | WordsThatSells</title>
    <meta name="description" content="A fixture page for the localization generator.">
    <link rel="canonical" href="https://wordsthatsells.website/en/">
    <link rel="alternate" hreflang="en" href="https://wordsthatsells.website/en/">
    <link rel="alternate" hreflang="x-default" href="https://wordsthatsells.website/en/">
    <meta property="og:url" content="https://wordsthatsells.website/en/">
    <script type="application/ld+json">
    {"@type":"WebPage","@id":"https://wordsthatsells.website/en/","inLanguage":"en"}
    </script>
</head>
<body>
    <h1>Grow your business with AI marketing</h1>
    <p>We build websites that convert visitors into customers.</p>
    <a href="/en/company/about-us/" class="btn">Read More</a>
    <a href="https://wordsthatsells.website/en/digital-marketing-services/">Digital Marketing</a>
    <footer class="footer">
        <div class="footer-grid"><div class="footer-column"><h3 class="footer-heading">Solutions</h3></div></div>
        <div class="footer-bottom"><p>© WordsThatSells</p></div>
    </footer>
</body>
</html>
`;

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wts-l10n-'));
  const src = path.join(dir, 'en');
  fs.mkdirSync(path.join(src, 'company', 'about-us'), { recursive: true });
  fs.writeFileSync(path.join(src, 'index.html'), FIXTURE_PAGE);
  fs.writeFileSync(
    path.join(src, 'company', 'about-us', 'index.html'),
    FIXTURE_PAGE.replace('Fixture Page', 'About Fixture')
  );
  return { dir, src };
}

function runGenerator(args) {
  return execFileSync(process.execPath, [GENERATOR, ...args], { encoding: 'utf8' });
}

test('segment extraction is deterministic and excludes chrome regions', () => {
  const segments = l10n.extractSegments(FIXTURE_PAGE);
  const texts = Object.values(segments);
  assert.ok(texts.includes('Grow your business with AI marketing'));
  assert.ok(texts.includes('We build websites that convert visitors into customers.'));
  assert.ok(texts.includes('Fixture Page | WordsThatSells'), 'title extracted');
  assert.ok(texts.includes('A fixture page for the localization generator.'), 'meta description extracted');
  assert.ok(!texts.some((t) => t.includes('Solutions')), 'footer is chrome, not a segment');
  assert.deepEqual(l10n.extractSegments(FIXTURE_PAGE), segments, 'stable across runs');
});

test('generator writes a fully localized mirror from a payloads file', () => {
  const { dir, src } = makeFixture();
  const segments = l10n.extractSegments(FIXTURE_PAGE);
  const h1Key = Object.keys(segments).find((k) => segments[k].startsWith('Grow your business'));
  const pKey = Object.keys(segments).find((k) => segments[k].startsWith('We build websites'));

  const payloadsFile = path.join(dir, 'payloads.json');
  fs.writeFileSync(payloadsFile, JSON.stringify({
    th: { '/': { [h1Key]: 'ขยายธุรกิจของคุณด้วยการตลาด AI', [pKey]: 'เราสร้างเว็บไซต์ที่เปลี่ยนผู้เยี่ยมชมให้เป็นลูกค้า' } },
  }));

  const out = runGenerator(['--src', src, '--out', dir, '--payloads', payloadsFile, '--langs', 'th']);
  assert.match(out, /1 written/);

  const generated = fs.readFileSync(path.join(dir, 'th', 'index.html'), 'utf8');
  assert.match(generated, /<html lang="th"/, 'lang attribute set');
  assert.ok(generated.includes('ขยายธุรกิจของคุณด้วยการตลาด AI'), 'h1 segment applied');
  assert.ok(generated.includes('เราสร้างเว็บไซต์ที่เปลี่ยนผู้เยี่ยมชมให้เป็นลูกค้า'), 'paragraph segment applied');
  assert.ok(generated.includes('href="/th/company/about-us/"'), 'root-relative link rewritten');
  // Exact-match the rewritten absolute link by parsing hrefs and comparing
  // with strict equality — CodeQL's url-substring-sanitization heuristic
  // flags any includes()/indexOf() carrying a URL literal, equality never.
  const hrefs = [...generated.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.some((h) => h === 'https://wordsthatsells.website/th/digital-marketing-services/'), 'absolute link rewritten to the th URL');
  assert.ok(hrefs.every((h) => h !== 'https://wordsthatsells.website/en/digital-marketing-services/'), 'English absolute link no longer present');
  assert.ok(generated.includes('<link rel="canonical" href="https://wordsthatsells.website/th/">'), 'self-canonical');
  assert.ok(generated.includes('hreflang="th" href="https://wordsthatsells.website/th/"'), 'th alternate present');
  assert.ok(generated.includes('hreflang="x-default" href="https://wordsthatsells.website/en/"'), 'x-default alternate');
  assert.ok(!generated.includes('hreflang="lo"'), 'unwritten languages are not listed as alternates');
  assert.ok(generated.includes('"inLanguage":"th"'), 'JSON-LD inLanguage updated');
  assert.ok(generated.includes('Noto+Sans+Thai'), 'Thai font injected');
  assert.ok(generated.includes('/css/i18n.css'), 'i18n stylesheet injected');
  assert.ok(generated.includes('อ่านเพิ่มเติม'), 'chrome string (Read More) localized');
  assert.ok(generated.includes('โซลูชัน'), 'footer chrome heading localized');
  assert.ok(generated.includes('content="https://wordsthatsells.website/th/"'), 'og:url localized');

  // No payload and no --include-untranslated → the page must not exist.
  assert.ok(!fs.existsSync(path.join(dir, 'th', 'company', 'about-us', 'index.html')),
    'untranslated pages are not materialized by default');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('generator --include-untranslated produces chrome-only mirrors (SPA shells)', () => {
  const { dir, src } = makeFixture();
  const emptyPayloads = path.join(dir, 'empty.json');
  fs.writeFileSync(emptyPayloads, '{}');
  const out = runGenerator(['--src', src, '--out', dir, '--payloads', emptyPayloads, '--langs', 'fr', '--include-untranslated', '--paths', 'about-us']);
  assert.match(out, /1 written/);
  const generated = fs.readFileSync(path.join(dir, 'fr', 'company', 'about-us', 'index.html'), 'utf8');
  assert.match(generated, /<html lang="fr"/);
  assert.ok(generated.includes('En savoir plus'), 'French chrome applied');
  assert.ok(generated.includes('We build websites'), 'body stays English until translated');
  assert.ok(!generated.includes('Noto+Sans'), 'no Thai/Lao fonts on French pages');
  fs.rmSync(dir, { recursive: true, force: true });
});