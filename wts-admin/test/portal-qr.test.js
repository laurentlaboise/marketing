// Paper QR → existing portal cart: scan /q/{slug|sku}, log in, pay.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');
const { startServer, Session, TEST_DB_URL } = require('./helpers');
const { normalizeQrToken } = require('../src/lib/portal-qr-cart');

const PORT = 3224;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

let server;
let pool;
let product;

async function signIn(email) {
  const customer = (await pool.query(
    `INSERT INTO customers (email, name) VALUES ($1, 'QR Tester')
     ON CONFLICT (email) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [email]
  )).rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO customer_login_tokens (customer_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + interval '10 minutes')`,
    [customer.id, hashToken(token)]
  );
  const session = new Session(server.base);
  const res = await session.fetch(`/portal/auth?token=${token}`);
  assert.equal(res.status, 302, 'magic link signs the customer in');
  return { session, customer, location: res.headers.get('location') };
}

before(async () => {
  server = await startServer(PORT);
  pool = new Pool({ connectionString: TEST_DB_URL });
  await pool.query(`DELETE FROM customers WHERE email LIKE 'portal-qr-test-%'`);
  await pool.query(`DELETE FROM products WHERE sku LIKE 'QRTEST-%'`);
  product = (await pool.query(
    `INSERT INTO products (name, slug, sku, status, purchase_mode, price, currency)
     VALUES ('QR Test Card', 'qr-test-card', 'QRTEST-SKU-1', 'active', 'buy', 10, 'USD')
     RETURNING id, slug, sku, name`
  )).rows[0];
});

after(async () => {
  await pool.query(`DELETE FROM customers WHERE email LIKE 'portal-qr-test-%'`);
  await pool.query(`DELETE FROM products WHERE sku LIKE 'QRTEST-%'`);
  if (pool) await pool.end();
  if (server) await server.stop();
});

test('QR token shape: slug/sku ok, path junk rejected', () => {
  assert.equal(normalizeQrToken('nfc'), 'nfc');
  assert.equal(normalizeQrToken('WTS-LANDING'), 'WTS-LANDING');
  assert.equal(normalizeQrToken('metal-utap-nfc-card'), 'metal-utap-nfc-card');
  assert.equal(normalizeQrToken('../x'), null);
  assert.equal(normalizeQrToken(''), null);
  assert.equal(normalizeQrToken('a'.repeat(81)), null);
});

test('unknown QR bounces to login with qr=unknown', async () => {
  const session = new Session(server.base);
  const res = await session.fetch('/q/not-a-real-product');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/portal/login?qr=unknown');
  const page = await session.fetch('/portal/login?qr=unknown');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /not a live product/i);
});

test('signed-in scan by slug puts the product in the portal cart', async () => {
  const { session, customer } = await signIn(`portal-qr-test-in-${Date.now()}@example.com`);
  const res = await session.fetch(`/q/${product.slug}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/portal/cart?added=1');
  const cart = await session.fetch('/portal/cart?added=1');
  assert.equal(cart.status, 200);
  const html = await cart.text();
  assert.match(html, /QR Test Card/);
  assert.match(html, /Added from your catalog QR/);
  assert.match(html, /Pay 10\.00 USD now/);
  const rows = await pool.query(
    'SELECT product_id FROM saved_services WHERE customer_id = $1',
    [customer.id]
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].product_id, product.id);
});

test('signed-in scan by SKU matches the same product; second scan does not duplicate', async () => {
  const { session, customer } = await signIn(`portal-qr-test-sku-${Date.now()}@example.com`);
  await session.fetch(`/q/${product.sku}`);
  const again = await session.fetch(`/q/${product.slug}`);
  assert.equal(again.headers.get('location'), '/portal/cart?added=1');
  const rows = await pool.query(
    'SELECT COUNT(*)::int AS n FROM saved_services WHERE customer_id = $1 AND product_id = $2',
    [customer.id, product.id]
  );
  assert.equal(rows.rows[0].n, 1);
});

test('guest scan remembers the product through magic-link login', async () => {
  const guest = new Session(server.base);
  const scan = await guest.fetch(`/q/${product.slug}`);
  assert.equal(scan.status, 302);
  assert.equal(scan.headers.get('location'), '/portal/login');
  const login = await guest.fetch('/portal/login');
  assert.match(await login.text(), /QR Test Card/);

  const email = `portal-qr-test-guest-${Date.now()}@example.com`;
  const customer = (await pool.query(
    `INSERT INTO customers (email, name) VALUES ($1, 'QR Guest')
     ON CONFLICT (email) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [email]
  )).rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO customer_login_tokens (customer_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + interval '10 minutes')`,
    [customer.id, hashToken(token)]
  );
  const auth = await guest.fetch(`/portal/auth?token=${token}`);
  assert.equal(auth.status, 302);
  assert.equal(auth.headers.get('location'), '/portal/cart?added=1');
  const rows = await pool.query(
    'SELECT product_id FROM saved_services WHERE customer_id = $1',
    [customer.id]
  );
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].product_id, product.id);
});

test('magic-link add= query works on a fresh browser (email opened elsewhere)', async () => {
  const email = `portal-qr-test-addq-${Date.now()}@example.com`;
  const customer = (await pool.query(
    `INSERT INTO customers (email, name) VALUES ($1, 'QR Fresh')
     ON CONFLICT (email) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [email]
  )).rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO customer_login_tokens (customer_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + interval '10 minutes')`,
    [customer.id, hashToken(token)]
  );
  const fresh = new Session(server.base);
  const auth = await fresh.fetch(`/portal/auth?token=${token}&add=${product.slug}`);
  assert.equal(auth.status, 302);
  assert.equal(auth.headers.get('location'), '/portal/cart?added=1');
  const rows = await pool.query(
    'SELECT product_id FROM saved_services WHERE customer_id = $1',
    [customer.id]
  );
  assert.equal(rows.rowCount, 1);
});
