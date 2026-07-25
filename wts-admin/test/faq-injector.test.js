// scripts/inject-faqs.js (repo root): marker-region bake, the
// withhold-untranslated-pinned rule, la→lo mapping, HTML-safe script
// serialization, the all-or-nothing error contract, and idempotency.
// Pure filesystem — no server, no database.
const { test, before, after } = require('node:test');
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
      question: { en: 'Alpha question?', fr: 'Question alpha ?', la: 'ຄຳຖາມ ນຶ່ງ?' },
      answer_html: {
        en: '<p>Alpha answer with a <a href="/en/company/">link</a>.</p>',
        fr: '<p>Réponse alpha avec un <a href="/en/company/">lien</a>.</p>',
        la: '<p>ຄຳຕອບ ນຶ່ງ.</p>',
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

after(() => {
  fs.rmSync(base, { recursive: true, force: true });
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

  // la: alpha is translated, bravo is not → one pinned item, and the
  // la → lo mapping applies ONLY to HTML-facing output: JSON-LD says
  // inLanguage "lo" while the island keeps the internal 'la' key.
  const la = region('la/index.html');
  assert.equal((la.match(/<details/g) || []).length, 1);
  assert.match(la, /ຄຳຖາມ ນຶ່ງ\?/);
  const laLd = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(la)[1]);
  assert.equal(laLd.inLanguage, 'lo');
  const laIsland = JSON.parse(/id="faq-pool">(.*?)<\/script>/s.exec(la)[1]);
  assert.equal(laIsland.lang, 'la');
});

test('pool island is a structured tree with lang tags; hostile strings stay text', () => {
  const pool = region('en/pool-only/index.html');
  const island = /<script type="application\/json" id="faq-pool">(.*?)<\/script>/s.exec(pool)[1];
  // Serialized form may not contain raw <, > or & — a literal </script>
  // in an answer must not terminate the element.
  assert.doesNotMatch(island, /[<>&]/);
  const data = JSON.parse(island);
  assert.equal(data.lang, 'en');
  assert.equal(data.items.length, 2);

  // The island never carries HTML strings — answers are node trees.
  const alpha = data.items.find((i) => i.slug === 'alpha');
  assert.equal(alpha.a, undefined);
  assert.equal(alpha.tree[0].t, 'p');
  const link = alpha.tree[0].c.find((n) => typeof n === 'object' && n.t === 'a');
  assert.equal(link.href, '/en/company/');
  assert.equal(link.c[0], 'link');

  // bravo's answer contains a literal </script> + <script> — the non-
  // allowlisted tags become plain text inside the tree, alert-proof.
  const bravo = data.items.find((i) => i.slug === 'bravo');
  const flat = JSON.stringify(bravo.tree);
  assert.match(flat, /<\/script>/);
  assert.equal(bravo.lang, 'en');

  // fr pool: page lang fr; alpha's tree link is localized to /fr/.
  const frIsland = JSON.parse(/id="faq-pool">(.*?)<\/script>/s.exec(region('fr/index.html'))[1]);
  assert.equal(frIsland.lang, 'fr');
});

test('entity decoding is single-pass: pre-escaped text never double-unescapes', () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.faqs.push({
    slug: 'delta',
    category: 'general',
    sort_order: 40,
    question: { en: 'Delta?' },
    // Author wrote the literal text "5 < 6 & &lt;tag&gt;" — the admin
    // sanitizer stores it entity-escaped like this:
    answer_html: { en: '<p>5 &lt; 6 &amp; &amp;lt;tag&amp;gt;</p>' },
  });
  cfg.placements['/en/pool-only/'].pool.push('delta');
  bake(cfg);
  const island = JSON.parse(/id="faq-pool">(.*?)<\/script>/s.exec(region('en/pool-only/index.html'))[1]);
  const delta = island.items.find((i) => i.slug === 'delta');
  assert.deepEqual(delta.tree, [{ t: 'p', c: ['5 < 6 & &lt;tag&gt;'] }]);
  bake(); // restore baseline config
});

test('malformed answer markup degrades to plain text instead of failing the bake', () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.faqs.push({
    slug: 'charlie',
    category: 'general',
    sort_order: 30,
    question: { en: 'Charlie?' },
    answer_html: { en: '<p>Unclosed <strong>tag soup</p>' },
  });
  cfg.placements['/en/pool-only/'].pool.push('charlie');
  bake(cfg);
  const island = JSON.parse(/id="faq-pool">(.*?)<\/script>/s.exec(region('en/pool-only/index.html'))[1]);
  const charlie = island.items.find((i) => i.slug === 'charlie');
  assert.deepEqual(charlie.tree, ['Unclosed tag soup']);
  bake(); // restore baseline config for the following tests
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
