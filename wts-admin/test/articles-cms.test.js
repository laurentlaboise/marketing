// Article CMS pipeline: the teaser/body split, slug renames with
// previous_slugs redirects, and the machine-API stale-write guard.
// These are the invariants that keep the two article writers (admin UI and
// machine API) from silently clobbering or drifting away from each other.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { startServer, TEST_DB_URL } = require('./helpers');

const PORT = 3222;
const TOKEN = 'test-machine-token-32chars-minimum!!';
let server;
let pool;

const SLUG = 'testcms-logo-guide';
const RENAMED_SLUG = 'testcms-logo-guide-renamed-for-seo';

before(async () => {
  server = await startServer(PORT, {
    ADMIN_API_TOKEN: TOKEN,
    MACHINE_API_RATE_LIMIT_MAX: '1000',
  });
  pool = new Pool({ connectionString: TEST_DB_URL });
  await pool.query(`DELETE FROM articles WHERE slug LIKE 'testcms-%'`);
  await pool.query(
    `INSERT INTO articles (title, slug, content, text_article, excerpt, status, category, published_at, updated_at)
     VALUES ('TestCms Logo Guide', $1, '<p>manual teaser</p>', '<h2>1. First Section</h2><p>Body text.</p><h2>2. Second Section</h2><p>More body.</p>',
             'A test article.', 'published', 'branding', NOW(), NOW() - INTERVAL '1 hour')`,
    [SLUG]
  );
});

after(async () => {
  if (pool) {
    await pool.query(`DELETE FROM articles WHERE slug LIKE 'testcms-%'`);
    await pool.end();
  }
  if (server) await server.stop();
});

const machine = () => `${server.base}/api/machine/v1`;
const pub = () => `${server.base}/api/public`;

function authHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

test('public API: full_article_content carries the body, teaser_content the teaser', async () => {
  const res = await fetch(`${pub()}/articles/${SLUG}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.full_article_content, /First Section/, 'full_article_content is the article body');
  assert.equal(body.teaser_content, '<p>manual teaser</p>', 'teaser_content is the content column');
});

test('machine PUT with content_labels regenerates the teaser card', async () => {
  const res = await fetch(`${machine()}/articles/${SLUG}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      content: '<p>this handwritten teaser must lose to the regenerated card</p>',
      content_labels: {
        description: 'Short hook.',
        chapters: ['First Section', 'Second Section'],
        facts: ['One fact'],
        cta_text: 'Read it',
      },
    }),
  });
  assert.equal(res.status, 200);
  const saved = (await pool.query('SELECT content FROM articles WHERE slug = $1', [SLUG])).rows[0];
  assert.match(saved.content, /data-teaser-source="content_labels"/, 'teaser was regenerated from labels');
  assert.match(saved.content, /First Section/, 'regenerated teaser lists the chapters');
  assert.ok(!saved.content.includes('handwritten teaser'), 'the provided content was superseded');
});

test('machine PUT with a stale base_updated_at is rejected with 409, force overrides', async () => {
  const row = (await pool.query('SELECT updated_at FROM articles WHERE slug = $1', [SLUG])).rows[0];
  const stale = new Date(new Date(row.updated_at).getTime() - 3600 * 1000).toISOString();

  const guarded = await fetch(`${machine()}/articles/${SLUG}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ base_updated_at: stale, seo_title: 'Must not land' }),
  });
  assert.equal(guarded.status, 409);
  const conflict = await guarded.json();
  assert.equal(conflict.success, false);
  assert.ok(conflict.current_updated_at, '409 reports the row timestamp to re-fetch from');

  const kept = (await pool.query('SELECT seo_title FROM articles WHERE slug = $1', [SLUG])).rows[0];
  assert.notEqual(kept.seo_title, 'Must not land');

  const forced = await fetch(`${machine()}/articles/${SLUG}?force=true`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ base_updated_at: stale, seo_title: 'Forced through' }),
  });
  assert.equal(forced.status, 200);
  const after1 = (await pool.query('SELECT seo_title FROM articles WHERE slug = $1', [SLUG])).rows[0];
  assert.equal(after1.seo_title, 'Forced through');
});

test('machine PUT with a fresh base_updated_at passes the guard', async () => {
  const get = await fetch(`${machine()}/articles/${SLUG}`, { headers: authHeaders() });
  const current = (await get.json()).article;
  const res = await fetch(`${machine()}/articles/${SLUG}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ base_updated_at: current.updated_at, seo_title: 'Fresh write' }),
  });
  assert.equal(res.status, 200);
  const saved = (await pool.query('SELECT seo_title FROM articles WHERE slug = $1', [SLUG])).rows[0];
  assert.equal(saved.seo_title, 'Fresh write');
});

test('slug rename records the old slug and every reader keeps answering on it', async () => {
  const res = await fetch(`${machine()}/articles/${SLUG}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ slug: RENAMED_SLUG }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.article.slug, RENAMED_SLUG);

  const row = (await pool.query('SELECT previous_slugs FROM articles WHERE slug = $1', [RENAMED_SLUG])).rows[0];
  assert.ok(row.previous_slugs.includes(SLUG), 'old slug recorded in previous_slugs');

  // Public API answers on the old slug with the canonical slug in the payload
  const oldUrl = await fetch(`${pub()}/articles/${SLUG}`);
  assert.equal(oldUrl.status, 200);
  const viaOld = await oldUrl.json();
  assert.equal(viaOld.slug, RENAMED_SLUG, 'response carries the new slug so the SPA can canonicalize');

  // Machine API GET + PUT also resolve the old slug (stale automation keeps working)
  const mOld = await fetch(`${machine()}/articles/${SLUG}`, { headers: authHeaders() });
  assert.equal(mOld.status, 200);
  assert.equal((await mOld.json()).article.slug, RENAMED_SLUG);

  const mPut = await fetch(`${machine()}/articles/${SLUG}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ seo_title: 'Written via the old slug' }),
  });
  assert.equal(mPut.status, 200);
  const saved = (await pool.query('SELECT seo_title FROM articles WHERE slug = $1', [RENAMED_SLUG])).rows[0];
  assert.equal(saved.seo_title, 'Written via the old slug');
});

test('machine POST creates a draft with a deduplicated slug, PUT fills it', async () => {
  const created = await fetch(`${machine()}/articles`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title: 'TestCms Logo Guide' }), // same title as the seeded article
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.ok(body.article.id, 'returns the new id');
  assert.notEqual(body.article.slug, SLUG, 'slug deduplicates against existing rows');
  assert.match(body.article.slug, /^testcms-logo-guide-\d+$/);
  assert.equal(body.article.status, 'draft');

  const filled = await fetch(`${machine()}/articles/${body.article.id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      text_article: '<h2>Only Section</h2><p>Body.</p>',
      content_labels: { description: 'Hook', chapters: ['Only Section'] },
      status: 'published',
    }),
  });
  assert.equal(filled.status, 200);
  const row = (await pool.query('SELECT content, text_article, status FROM articles WHERE id = $1', [body.article.id])).rows[0];
  assert.equal(row.status, 'published');
  assert.match(row.text_article, /Only Section/);
  assert.match(row.content, /data-teaser-source="content_labels"/, 'teaser regenerated on the fill PUT');
});

test('renaming back reuses the slug without clashing with its own history', async () => {
  const res = await fetch(`${machine()}/articles/${RENAMED_SLUG}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ slug: SLUG }),
  });
  assert.equal(res.status, 200);
  const row = (await pool.query('SELECT slug, previous_slugs FROM articles WHERE slug = $1', [SLUG])).rows[0];
  assert.equal(row.slug, SLUG);
  assert.ok(row.previous_slugs.includes(RENAMED_SLUG), 'the interim slug joined the history');
  assert.ok(!row.previous_slugs.includes(SLUG), 'a slug never lists itself as its own redirect');
});
