const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const PORT = 3205;
const TOKEN = 'test-machine-token-32chars-minimum!!';
let server;

before(async () => {
  server = await startServer(PORT, {
    ADMIN_API_TOKEN: TOKEN,
    MACHINE_API_RATE_LIMIT_MAX: '1000',
  });
});

after(async () => {
  if (server) await server.stop();
});

const base = () => `${server.base}/api/machine/v1`;

function authHeaders(token = TOKEN) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

test('GET /health without token returns 401', async () => {
  const res = await fetch(`${base()}/health`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('GET /health with wrong token returns 401', async () => {
  const res = await fetch(`${base()}/health`, {
    headers: authHeaders('totally-wrong-token-value-here!!'),
  });
  assert.equal(res.status, 401);
});

test('GET /health with valid Bearer token returns ok', async () => {
  const res = await fetch(`${base()}/health`, { headers: authHeaders() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.service, 'wts-admin-machine-api');
  assert.equal(body.auth, 'bearer');
  assert.equal(body.db, 'ok');
});

test('GET /health accepts X-Admin-Api-Token header', async () => {
  const res = await fetch(`${base()}/health`, {
    headers: { 'X-Admin-Api-Token': TOKEN, Accept: 'application/json' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
});

test('POST /seed/pricing seeds packages and features', async () => {
  const res = await fetch(`${base()}/seed/pricing`, {
    method: 'POST',
    headers: authHeaders(),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.seeded);
  assert.ok(body.seeded.plansUpserted >= 1);
  assert.ok(body.seeded.featuresUpserted >= 1);
});

test('GET /pricing returns packages after seed', async () => {
  const res = await fetch(`${base()}/pricing`, { headers: authHeaders() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.packages));
  assert.ok(body.packages.length >= 1);
  assert.ok(Array.isArray(body.features));
});

test('PUT /pricing/packages/:slug upserts a package', async () => {
  const res = await fetch(`${base()}/pricing/packages/machine-test-plan`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({
      name: 'Machine Test Plan',
      base_price: 99,
      description: 'Created by machine-api test',
      features: { monthly_reporting: true },
      highlight: false,
      sort_order: 99,
    }),
  });
  assert.ok([200, 201].includes(res.status), `status ${res.status}`);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.package.slug, 'machine-test-plan');
  assert.equal(Number(body.package.base_price), 99);
});

test('GET /products without token is still 401', async () => {
  const res = await fetch(`${base()}/products`);
  assert.equal(res.status, 401);
});

test('GET /products with token returns list', async () => {
  const res = await fetch(`${base()}/products?limit=5`, { headers: authHeaders() });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.products));
});

test('unknown route returns 404 JSON', async () => {
  const res = await fetch(`${base()}/does-not-exist`, { headers: authHeaders() });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
});
