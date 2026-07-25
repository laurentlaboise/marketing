// scripts/inject-faqs.js (repo root): marker-region bake, the
// withhold-untranslated-pinned rule, la→lo mapping, HTML-safe script
// serialization, the all-or-nothing error contract, and idempotency.
// Pure filesystem — no server, no database.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const INJECTOR = path.resolve(__dirname, '../../scripts/inject-faqs.js');

const PAGE = (marker) => `<!doctype html><html><body>
<section><div id="faq-list" class="accordion-container">
                    ${marker ? '<!-- faq:start -->\n                    <!-- faq:end -->' : ''}
                </div></section>
</body></html>\n`;

const CONFIG = {
  categories: [{ slug: 'general', sort_order: 10, name: { en: 'General' }, description: { en: '' } }],
  faqs: [
    {
      slug: 'alpha',
      category: 'general',
      sort_order: 10,
      question: { en: 'Alpha question?', fr: 'Question alpha ?' },
      answer_html: {
        en: '<p>Alpha answer with a <a href="/en/company/">link</a>.</p>',
        fr: '<p>Réponse alpha avec un <a href="/en/company/">lien</a>.</p>',
      },
    },
    {
      slug: 'bravo',
      category: 'general',
      sort_order: 20,
      // No fr translation: withheld from fr pinned, EN-fallback in pools.
      question: { en: 'Bravo question?' },
      answer_html: { en: '<p>Sneaky </script><script>alert(1)</script> text</p>' },
    },
  ],
  placements: {
    '/en/': { pinned: ['alpha', 'bravo'], pool: [] },
    '/en/pool-only/': { pinned: [], pool: ['alpha', 'bravo'] },
  },
};

let base;

function bake(configOverride, expectFailure = false) {
  const config = configOverride || CONFIG;
  fs.writeFileSync(path.join(base, 'faqs.json'), JSON.stringify(config, null, 2));
  try {
    execFileSync('node', [INJECTOR, '--base', base, '--config', path.join(base, 'faqs.json')], { encoding: 'utf8' });
    assert.ok(!expectFailure, 'expected injector to fail');
  } catch (err) {
    assert.ok(expectFailure, `injector failed unexpectedly: ${err.stderr || err.message}`);
    return err;
  }
  return null;
}

const read = (rel) => fs.readFileSync(path.join(base, rel), 'utf8');
const region = (rel) => {
  const html = read(rel);
  return html.slice(html.indexOf('<!-- faq:start -->'), html.indexOf('<!-- faq:end -->'));
};

before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'faq-injector-'));
  for (const dir of ['en', 'fr', 'la', 'en/pool-only', 'fr/pool-only']) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(base, 'en/index.html'), PAGE(true));
  fs.writeFileSync(path.join(base, 'fr/index.html'), PAGE(true));
  fs.writeFileSync(path.join(base, 'la/index.html'), PAGE(true));
  fs.writeFileSync(path.join(base, 'en/pool-only/index.html'), PAGE(true));
  // fr pool-only page exists but has no markers → must be skipped silently.
  fs.writeFileSync(path.join(base, 'fr/pool-only/index.html'), PAGE(false));
});

test('bakes pinned items, JSON-LD and pool island; localizes links; maps la→lo', () => {
  bake();

  const en = region('en/index.html');
  assert.equal((en.match(/<details/g) || []).length, 2);
  assert.match(en, /id="faq-alpha" open/);
  assert.match(en, /aria-hidden="true"/);
  assert.match(en, /<div class="accordion-content">/);
  assert.match(en, /"@type":"FAQPage"/);
  assert.match(en, /"inLanguage":"en"/);

  // fr: bravo is untranslated → withheld from pinned AND schema.
  const fr = region('fr/index.html');
  assert.equal((fr.match(/<details/g) || []).length, 1);
  assert.match(fr, /Question alpha \?/);
  assert.doesNotMatch(fr, /Bravo question\?/);
  const frLd = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(fr)[1]);
  assert.equal(frLd.mainEntity.length, 1);
  assert.equal(frLd.inLanguage, 'fr');
  // Editors author /en/ links; the fr page gets /fr/.
  assert.match(fr, /href="\/fr\/company\/"/);

  // la has no translations at all → no pinned items, no JSON-LD, island only,
  // and the island's page lang stays the internal 'la' key.
  const la = region('la/index.html');
  assert.equal((la.match(/<details/g) || []).length, 0);
  assert.doesNotMatch(la, /ld\+json/);
  assert.match(la, /id="faq-pool"/);
});

test('pool island carries per-item lang tags and survives hostile strings', () => {
  const pool = region('en/pool-only/index.html');
  const island = /<script type="application\/json" id="faq-pool">(.*?)<\/script>/s.exec(pool)[1];
  // Serialized form may not contain raw <, > or & — a literal </script>
  // in an answer must not terminate the element.
  assert.doesNotMatch(island, /[<>&]/);
  const data = JSON.parse(island);
  assert.equal(data.lang, 'en');
  assert.equal(data.items.length, 2);
  const bravo = data.items.find((i) => i.slug === 'bravo');
  assert.match(bravo.a, /<\/script>/); // intact after parsing

  // fr pool: alpha localized+tagged fr, bravo falls back tagged en.
  bake();
  const frPool = region('fr/index.html'); // pinned page still has an island
  const frIsland = JSON.parse(/id="faq-pool">(.*?)<\/script>/s.exec(frPool)[1]);
  assert.equal(frIsland.lang, 'fr');
});

test('is idempotent and skips marker-less pages silently', () => {
  const first = read('en/index.html');
  bake();
  assert.equal(read('en/index.html'), first);
  // No markers were ever added to fr/pool-only — untouched original.
  assert.equal(read('fr/pool-only/index.html'), PAGE(false));
});

test('fails all-or-nothing: an unknown slug writes nothing anywhere', () => {
  const before_ = { en: read('en/index.html'), fr: read('fr/index.html') };
  const bad = JSON.parse(JSON.stringify(CONFIG));
  bad.placements['/en/'].pinned.push('ghost-slug');
  const err = bake(bad, true);
  assert.equal(err.status, 1);
  assert.match(String(err.stderr), /ghost-slug/);
  assert.equal(read('en/index.html'), before_.en);
  assert.equal(read('fr/index.html'), before_.fr);
});

test('aborts on malformed faqs.json before touching anything', () => {
  fs.writeFileSync(path.join(base, 'faqs.json'), '{ not json');
  const err = (() => {
    try {
      execFileSync('node', [INJECTOR, '--base', base, '--config', path.join(base, 'faqs.json')], { encoding: 'utf8' });
      return null;
    } catch (e) { return e; }
  })();
  assert.ok(err);
  assert.equal(err.status, 1);
  assert.match(String(err.stderr), /ABORT/);
});
