// FAQ platform: public API (language overlay, placements, published-only),
// admin CRUD auth-gating, and answer-HTML sanitization on write.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { startServer, Session, TEST_DB_URL } = require('./helpers');

// Some tests require server libs in-process (translation-core, faq-export);
// their shared database/db pool resolves DATABASE_URL at first require, so
// pin it to the test database before anything can pull that module in.
process.env.DATABASE_URL = TEST_DB_URL;

const PORT = 3230;
let server;
let pool;
let catId;
let faqIds = {};

const SLUGS = ['testfaq-alpha', 'testfaq-bravo', 'testfaq-draft'];

before(async () => {
  server = await startServer(PORT);
  pool = new Pool({ connectionString: TEST_DB_URL });

  await pool.query(`DELETE FROM faq_placements WHERE page_path LIKE '/en/testfaq-%'`);
  await pool.query(`DELETE FROM translations WHERE entity_type IN ('faq','faq_category')
                    AND entity_id IN (SELECT id FROM faqs WHERE slug LIKE 'testfaq-%')`);
  await pool.query(`DELETE FROM faqs WHERE slug LIKE 'testfaq-%'`);
  await pool.query(`DELETE FROM faq_categories WHERE slug LIKE 'testfaq-%'`);

  const cat = await pool.query(
    `INSERT INTO faq_categories (slug, name, description) VALUES ('testfaq-cat', 'Test Cat', 'd') RETURNING id`
  );
  catId = cat.rows[0].id;

  for (const [i, slug] of SLUGS.entries()) {
    const status = slug === 'testfaq-draft' ? 'draft' : 'published';
    const r = await pool.query(
      `INSERT INTO faqs (slug, question, answer_html, category_id, status, sort_order)
       VALUES ($1, $2, '<p>Answer</p>', $3, $4, $5) RETURNING id`,
      [slug, `Question ${slug}?`, catId, status, (i + 1) * 10]
    );
    faqIds[slug] = r.rows[0].id;
  }

  // French translation published for alpha only — bravo must fall back to EN.
  await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, content_payload, status, published_at)
     VALUES ('faq', $1, 'fr', $2, 'published', CURRENT_TIMESTAMP)`,
    [faqIds['testfaq-alpha'], JSON.stringify({ question: 'Question FR?', answer_html: '<p>Réponse</p>' })]
  );

  // Placements: alpha pinned, bravo pool, draft pinned (must never appear).
  await pool.query(
    `INSERT INTO faq_placements (page_path, faq_id, pinned, sort_order) VALUES
     ('/en/testfaq-page/', $1, TRUE, 10),
     ('/en/testfaq-page/', $2, FALSE, 0),
     ('/en/testfaq-page/', $3, TRUE, 20)`,
    [faqIds['testfaq-alpha'], faqIds['testfaq-bravo'], faqIds['testfaq-draft']]
  );
});

after(async () => {
  if (pool) {
    await pool.query(`DELETE FROM faq_placements WHERE page_path LIKE '/en/testfaq-%'`);
    await pool.query(`DELETE FROM translations WHERE entity_type IN ('faq','faq_category')
                      AND entity_id IN (SELECT id FROM faqs WHERE slug LIKE 'testfaq-%')`);
    await pool.query(`DELETE FROM faqs WHERE slug LIKE 'testfaq-%'`);
    await pool.query(`DELETE FROM faq_categories WHERE slug LIKE 'testfaq-%'`);
    await pool.end();
  }
  if (server) await server.stop();
});

test('GET /api/public/faqs returns published FAQs only, without auth', async () => {
  const res = await fetch(`${server.base}/api/public/faqs`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  const slugs = body.map((f) => f.slug);
  assert.ok(slugs.includes('testfaq-alpha'));
  assert.ok(slugs.includes('testfaq-bravo'));
  assert.ok(!slugs.includes('testfaq-draft'));
});

test('lang=fr overlays published translations and tags fallbacks as en', async () => {
  const res = await fetch(`${server.base}/api/public/faqs?lang=fr`);
  const body = await res.json();
  const alpha = body.find((f) => f.slug === 'testfaq-alpha');
  const bravo = body.find((f) => f.slug === 'testfaq-bravo');
  assert.equal(alpha.question, 'Question FR?');
  assert.equal(alpha.lang, 'fr');
  assert.equal(bravo.question, 'Question testfaq-bravo?');
  assert.equal(bravo.lang, 'en');
});

test('page filter returns placement metadata, pinned first, draft excluded', async () => {
  const res = await fetch(`${server.base}/api/public/faqs?page=${encodeURIComponent('/en/testfaq-page/')}`);
  const body = await res.json();
  assert.equal(body.length, 2);
  assert.equal(body[0].slug, 'testfaq-alpha');
  assert.equal(body[0].pinned, true);
  assert.equal(body[1].slug, 'testfaq-bravo');
  assert.equal(body[1].pinned, false);
});

test('GET /api/public/faqs/placements maps pages to pinned/pool slugs', async () => {
  const res = await fetch(`${server.base}/api/public/faqs/placements`);
  const body = await res.json();
  const page = body['/en/testfaq-page/'];
  assert.ok(page);
  assert.deepEqual(page.pinned, ['testfaq-alpha']);
  assert.deepEqual(page.pool, ['testfaq-bravo']);
});

test('GET /api/public/faqs/categories lists active categories', async () => {
  const res = await fetch(`${server.base}/api/public/faqs/categories`);
  const body = await res.json();
  const cat = body.find((c) => c.slug === 'testfaq-cat');
  assert.ok(cat);
  assert.equal(cat.name, 'Test Cat');
});

test('admin FAQ list requires authentication', async () => {
  const res = await fetch(`${server.base}/content/faqs`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') || '', /\/auth\/login/);
});

test('admin create sanitizes answer HTML to the allowlist', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const csrf = await session.getCsrfToken('/content/faqs/new');

  const res = await session.fetch('/content/faqs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      _csrf: csrf,
      question: 'Testfaq sanitize probe?',
      answer_html: '<p onclick="x()">Hi <script>alert(1)</script>'
        + '<a href="javascript:alert(1)">bad</a> <a href="/en/company/">good</a></p>',
      status: 'draft',
    }),
    redirect: 'manual',
  });
  assert.equal(res.status, 302);

  const row = await pool.query(`SELECT slug, answer_html FROM faqs WHERE question = 'Testfaq sanitize probe?'`);
  assert.equal(row.rows.length, 1);
  const html = row.rows[0].answer_html;
  assert.ok(!html.includes('<script'), 'script tag must be stripped');
  assert.ok(!html.includes('onclick'), 'event handler attribute must be stripped');
  assert.ok(!html.includes('javascript:'), 'javascript: href must be stripped');
  assert.ok(html.includes('<a href="/en/company/">good</a>'), 'safe internal link must survive');
  await pool.query(`DELETE FROM faqs WHERE question = 'Testfaq sanitize probe?'`);
});

test('translation platform registers faq entity types', () => {
  const core = require('../src/lib/translation-core');
  assert.ok(core.ENTITY_SOURCES.faq, 'faq entity registered');
  assert.ok(core.ENTITY_SOURCES.faq_category, 'faq_category entity registered');
  assert.deepEqual(core.ENTITY_SOURCES.faq.fields, ['question', 'answer_html']);
});

test('faq-export builds per-language payloads and expanded placements', async () => {
  const { buildFaqsJson } = require('../src/lib/faq-export');
  const snapshot = await buildFaqsJson();

  const alpha = snapshot.faqs.find((f) => f.slug === 'testfaq-alpha');
  assert.ok(alpha, 'published FAQ exported');
  assert.equal(alpha.question.en, 'Question testfaq-alpha?');
  assert.equal(alpha.question.fr, 'Question FR?');
  assert.ok(!snapshot.faqs.find((f) => f.slug === 'testfaq-draft'), 'draft excluded');

  const page = snapshot.placements['/en/testfaq-page/'];
  assert.deepEqual(page.pinned, ['testfaq-alpha']);
  assert.deepEqual(page.pool, ['testfaq-bravo']);
});

// Separate from the fixture-cleanup after(): closes the in-process shared
// db pool (used by the lib tests above) regardless of test order.
after(async () => {
  await require('../database/db').close();
});
