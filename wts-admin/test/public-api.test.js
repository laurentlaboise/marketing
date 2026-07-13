const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const PORT = 3202;
let server;

before(async () => {
  server = await startServer(PORT);
});

after(async () => {
  if (server) await server.stop();
});

test('GET /api/public/articles returns a JSON array without auth', async () => {
  const res = await fetch(`${server.base}/api/public/articles`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

test('hostile pagination values are clamped, not executed', async () => {
  for (const qs of ['?limit=999999999&page=-5', '?limit=1;DROP TABLE users&page=0', '?page=2;--']) {
    const res = await fetch(`${server.base}/api/public/articles${encodeURI(qs)}`);
    assert.equal(res.status, 200, `articles${qs} should still 200`);
    assert.ok(Array.isArray(await res.json()));
  }
});

test('GET /api/public/glossary and /pricing respond without auth', async () => {
  const glossary = await fetch(`${server.base}/api/public/glossary`);
  assert.equal(glossary.status, 200);
  const pricing = await fetch(`${server.base}/api/public/pricing`);
  assert.equal(pricing.status, 200);
  const body = await pricing.json();
  assert.ok(Array.isArray(body.subscriptions));
});

test('GET /api/public/products?featured=1 returns only featured products', async () => {
  const all = await fetch(`${server.base}/api/public/products`);
  assert.equal(all.status, 200);
  const allBody = await all.json();
  assert.ok(Array.isArray(allBody));

  const featured = await fetch(`${server.base}/api/public/products?featured=1`);
  assert.equal(featured.status, 200);
  const featuredBody = await featured.json();
  assert.ok(Array.isArray(featuredBody));
  for (const p of featuredBody) {
    assert.equal(p.is_featured, true, `${p.slug} returned by featured=1 but not featured`);
  }
  const expected = allBody.filter((p) => p.is_featured).map((p) => p.slug).sort();
  assert.deepEqual(featuredBody.map((p) => p.slug).sort(), expected);
});

test('POST /api/public/submissions accepts same-site and non-browser posts', async () => {
  const res = await fetch(`${server.base}/api/public/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ form_type: 'newsletter', name: 'Test', email: 'test@example.com' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
});

test('POST /api/public/submissions rejects foreign browser origins', async () => {
  const res = await fetch(`${server.base}/api/public/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ form_type: 'newsletter', name: 'Test', email: 'test@example.com' }),
  });
  assert.equal(res.status, 403);
});

test('POST /api/public/submissions allows allow-listed origins', async () => {
  const res = await fetch(`${server.base}/api/public/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://wordsthatsells.website' },
    body: JSON.stringify({ form_type: 'newsletter', name: 'Test', email: 'test2@example.com' }),
  });
  assert.equal(res.status, 200);
});

test('POST /api/public/submissions validates form_type', async () => {
  const res = await fetch(`${server.base}/api/public/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ form_type: 'not-a-real-type', name: 'T', email: 't@example.com' }),
  });
  assert.equal(res.status, 400);
});
