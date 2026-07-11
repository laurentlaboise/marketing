// Feature 2 — My Earnings: self-service payout methods (bank transfer /
// wallet QR, encrypted at rest) and the gated payout request (method on
// file + LAK minimum threshold).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { startServer, Session, TEST_DB_URL } = require('./helpers');

const PORT = 3213;
const NOKEY_PORT = 3215;
// Any 64 hex chars: enables encrypted banking metadata on the main server.
const PAYOUT_KEY = 'ab'.repeat(32);

const VENDOR_EMAIL = 'earnings-vendor@test.local';
const BANK_ACCOUNT_NUMBER = '0101-2233-4455-667'; // digits-only: 010122334455667
const BANK_ACCOUNT_DIGITS = BANK_ACCOUNT_NUMBER.replace(/[^0-9]/g, '');
const WALLET_ID = 'LAOQR-8867-9921-KX';

let server;
let pool;
let vendorId;

const jsonHeaders = async (session) => ({
  'content-type': 'application/json',
  accept: 'application/json',
  'x-csrf-token': await session.getCsrfToken('/translations/earnings'),
});

const vendorLogin = async () => {
  const session = new Session(server.base);
  await session.login(VENDOR_EMAIL);
  return session;
};

const seedCredit = (amount, currency, description) => pool.query(
  `INSERT INTO payout_ledger (translator_id, amount, currency, type, status, description)
   VALUES ($1, $2, $3, 'verification_credit', 'available', $4)`,
  [vendorId, amount, currency, description]
);

before(async () => {
  server = await startServer(PORT, {
    PAYOUT_METADATA_KEY: PAYOUT_KEY,
    ANTHROPIC_API_KEY: undefined,
  });
  pool = new Pool({ connectionString: TEST_DB_URL });

  // Dedicated vendor translator; payout_metadata reset so reruns start
  // from "no method on file". Only this user's rows are touched — the
  // payout tables are shared with the other suites.
  const hash = await bcrypt.hash('Password123!', 10);
  const vendor = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, assigned_languages, is_vendor)
     VALUES ($1, $2, 'Kaysone', 'Earnings', 'translator', '{la}', TRUE)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = $2, role = 'translator', assigned_languages = '{la}',
           is_vendor = TRUE, payout_metadata = NULL
     RETURNING id`,
    [VENDOR_EMAIL, hash]
  );
  vendorId = vendor.rows[0].id;
  await pool.query('DELETE FROM payout_ledger WHERE translator_id = $1', [vendorId]);
  await pool.query('DELETE FROM payout_requests WHERE translator_id = $1', [vendorId]);

  // Deterministic rate resolution: a vendor-specific rate card with no
  // rate-card minimum, so only the platform LAK threshold gates requests
  // here (resolveRate prefers translator-specific rows over globals).
  await pool.query('DELETE FROM payout_rates WHERE translator_id = $1', [vendorId]);
  await pool.query(
    `INSERT INTO payout_rates (translator_id, work_type, rate_type, rate_amount, currency, min_payout, is_active)
     VALUES ($1, 'translation', 'per_word', 0, 'LAK', 0, TRUE)`,
    [vendorId]
  );
});

after(async () => {
  if (pool) await pool.end();
  if (server) await server.stop();
});

// ---------------------------------------------------------------------------
// Page state before any method or balance exists
// ---------------------------------------------------------------------------

test('earnings page shows no method on file, the LAK minimum, and a disabled request button', async () => {
  const session = await vendorLogin();
  const res = await session.fetch('/translations/earnings');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /No payout method on file yet/);
  assert.match(html, /Minimum payout: LAK 200,000/);
  assert.match(html, /id="requestBtn"\s+disabled/, 'request button starts disabled');
  assert.match(html, /No available balance to request yet/);
  assert.match(html, /id="methodForm"/, 'self-service form renders when encryption is configured');
});

// ---------------------------------------------------------------------------
// Gate 1: no payout method on file
// ---------------------------------------------------------------------------

test('payout request is blocked without a payout method on file', async () => {
  await seedCredit(120000, 'LAK', 'earnings-test seed (below threshold)');

  const session = await vendorLogin();
  const res = await session.fetch('/translations/earnings/request', {
    method: 'POST', headers: await jsonHeaders(session), body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /payout method/i);

  // The page mirrors the server-side gate with a reason next to the button.
  const page = await session.fetch('/translations/earnings');
  const html = await page.text();
  assert.match(html, /id="requestBtn"\s+disabled/);
  assert.match(html, /Add a payout method below to enable payout requests/);

  const requests = await pool.query('SELECT 1 FROM payout_requests WHERE translator_id = $1', [vendorId]);
  assert.equal(requests.rows.length, 0, 'no request row created');
});

// ---------------------------------------------------------------------------
// Method storage: encryption, masking, validation
// ---------------------------------------------------------------------------

test('bank transfer method saves encrypted with only a masked label readable', async () => {
  const session = await vendorLogin();
  const res = await session.fetch('/translations/earnings/payout-method', {
    method: 'POST', headers: await jsonHeaders(session),
    body: JSON.stringify({
      method: 'bank_transfer',
      bank_name: 'BCEL',
      account_name: 'Kaysone Earnings',
      account_number: BANK_ACCOUNT_NUMBER,
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.payout.configured, true);
  assert.equal(body.payout.method, 'bank_transfer');
  assert.equal(body.payout.gateway, 'manual', 'self-service methods disburse via the manual path');
  assert.match(body.payout.label, /5667/, 'label keeps only the last four digits');
  const echoed = JSON.stringify(body);
  assert.ok(!echoed.includes(BANK_ACCOUNT_NUMBER), 'full account number never returned');
  assert.ok(!echoed.includes(BANK_ACCOUNT_DIGITS), 'digits-only account number never returned');

  const stored = (await pool.query('SELECT payout_metadata FROM users WHERE id = $1', [vendorId])).rows[0].payout_metadata;
  const raw = JSON.stringify(stored);
  assert.ok(!raw.includes(BANK_ACCOUNT_NUMBER), 'account number is not stored in plaintext');
  assert.ok(!raw.includes(BANK_ACCOUNT_DIGITS), 'normalized account number is not stored in plaintext');
  assert.ok(!raw.includes('Kaysone'), 'holder name is not stored in plaintext');
  assert.equal(stored.gateway, 'manual');
  assert.equal(stored.method, 'bank_transfer');
  assert.ok(stored.enc && stored.enc.iv && stored.enc.tag && stored.enc.data, 'AES-GCM envelope present');

  // Round-trip with the key proves the envelope is real encryption.
  process.env.PAYOUT_METADATA_KEY = PAYOUT_KEY;
  const gatewayLib = require('../src/lib/payout-gateway');
  const details = gatewayLib.decryptPayoutDetails(stored.enc);
  assert.equal(details.account_number, BANK_ACCOUNT_NUMBER);
  assert.equal(details.account_name, 'Kaysone Earnings');
  assert.equal(details.method, 'bank_transfer');

  // The masked current method renders on the page.
  const page = await session.fetch('/translations/earnings');
  const html = await page.text();
  assert.match(html, /Bank transfer/);
  assert.match(html, /5667/);
  assert.ok(!html.includes(BANK_ACCOUNT_DIGITS), 'page never shows the raw account number');
});

test('validation rejects bad input without echoing the submitted values', async () => {
  const session = await vendorLogin();
  const headers = await jsonHeaders(session);

  const badNumber = await session.fetch('/translations/earnings/payout-method', {
    method: 'POST', headers,
    body: JSON.stringify({
      method: 'bank_transfer', bank_name: 'BCEL', account_name: 'Kaysone Earnings',
      account_number: 'ACCT!!77xx99zz',
    }),
  });
  assert.equal(badNumber.status, 400);
  const badNumberText = await badNumber.text();
  assert.match(badNumberText, /[Aa]ccount number/);
  assert.ok(!badNumberText.includes('ACCT!!77xx99zz'), 'rejected value is not repeated back');

  const badMethod = await session.fetch('/translations/earnings/payout-method', {
    method: 'POST', headers, body: JSON.stringify({ method: 'giftcard' }),
  });
  assert.equal(badMethod.status, 400);
  assert.match((await badMethod.json()).error, /method/i);

  const shortWallet = await session.fetch('/translations/earnings/payout-method', {
    method: 'POST', headers,
    body: JSON.stringify({ method: 'wallet_qr', provider: 'OnePay', wallet_id: 'zq1' }),
  });
  assert.equal(shortWallet.status, 400);
  const shortWalletText = await shortWallet.text();
  assert.match(shortWalletText, /[Ww]allet/);
  assert.ok(!shortWalletText.includes('zq1'), 'rejected wallet id is not repeated back');

  // Failed saves never clobber the stored method.
  const stored = (await pool.query('SELECT payout_metadata FROM users WHERE id = $1', [vendorId])).rows[0].payout_metadata;
  assert.equal(stored.method, 'bank_transfer');
});

// ---------------------------------------------------------------------------
// Gate 2: LAK minimum threshold (env PAYOUT_MIN_AMOUNT_LAK, default 200000)
// ---------------------------------------------------------------------------

test('payout request below the LAK threshold is blocked with a clear error', async () => {
  const session = await vendorLogin();
  const res = await session.fetch('/translations/earnings/request', {
    method: 'POST', headers: await jsonHeaders(session), body: JSON.stringify({}),
  });
  assert.equal(res.status, 400, 'LAK 120,000 available is below the 200,000 floor');
  const body = await res.json();
  assert.match(body.error, /minimum payout/i);
  assert.match(body.error, /200,000/);

  const entries = await pool.query(
    `SELECT status FROM payout_ledger WHERE translator_id = $1`, [vendorId]
  );
  assert.ok(entries.rows.every((e) => e.status === 'available'), 'credits stay available on a blocked request');
});

test('payout request at the threshold bundles the LAK credits into one requested row', async () => {
  await seedCredit(80000, 'LAK', 'earnings-test top-up (reaches threshold)');

  const session = await vendorLogin();
  const beforeHtml = await (await session.fetch('/translations/earnings')).text();
  assert.ok(!/id="requestBtn"\s+disabled/.test(beforeHtml), 'button enabled: method on file and threshold met');

  const res = await session.fetch('/translations/earnings/request', {
    method: 'POST', headers: await jsonHeaders(session), body: JSON.stringify({}),
  });
  assert.equal(res.status, 200, 'exactly at the threshold is allowed');
  const body = await res.json();
  assert.equal(body.request.status, 'requested');
  assert.equal(body.request.currency, 'LAK');
  assert.equal(parseFloat(body.request.amount), 200000);
  assert.equal(body.request.gateway, 'manual', 'gateway taken from the stored self-service method');
  assert.ok(body.request.bank_metadata_snapshot, 'encrypted envelope snapshotted onto the request');
  assert.ok(
    !JSON.stringify(body.request.bank_metadata_snapshot).includes(BANK_ACCOUNT_DIGITS),
    'snapshot holds the envelope, never plaintext'
  );

  const entries = await pool.query(
    `SELECT status, payout_request_id FROM payout_ledger WHERE translator_id = $1`, [vendorId]
  );
  assert.equal(entries.rows.length, 2);
  assert.ok(entries.rows.every((e) => e.status === 'requested' && e.payout_request_id === body.request.id));

  // Ledger History still renders, now showing the bundled 'requested' state.
  const page = await session.fetch('/translations/earnings');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Ledger History/);
  assert.match(html, /requested/);
  assert.match(html, /My Payout Requests/);
});

test('non-LAK balances are not gated by the LAK threshold', async () => {
  await seedCredit(5, 'USD', 'earnings-test USD credit');

  const session = await vendorLogin();
  const res = await session.fetch('/translations/earnings/request', {
    method: 'POST', headers: await jsonHeaders(session), body: JSON.stringify({}),
  });
  assert.equal(res.status, 200, 'USD bucket passes: the floor applies to LAK only');
  const body = await res.json();
  assert.equal(body.request.currency, 'USD');
  assert.equal(parseFloat(body.request.amount), 5);
});

// ---------------------------------------------------------------------------
// Wallet / QR method + removal
// ---------------------------------------------------------------------------

test('wallet / QR method overwrites the bank method via the same endpoint', async () => {
  const session = await vendorLogin();
  const res = await session.fetch('/translations/earnings/payout-method', {
    method: 'POST', headers: await jsonHeaders(session),
    body: JSON.stringify({ method: 'wallet_qr', provider: 'OnePay', wallet_id: WALLET_ID }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.payout.method, 'wallet_qr');
  assert.match(body.payout.label, /OnePay/);
  assert.ok(!JSON.stringify(body).includes(WALLET_ID), 'full wallet id never returned');

  const stored = (await pool.query('SELECT payout_metadata FROM users WHERE id = $1', [vendorId])).rows[0].payout_metadata;
  assert.equal(stored.method, 'wallet_qr');
  assert.ok(!JSON.stringify(stored).includes(WALLET_ID), 'wallet id is not stored in plaintext');

  process.env.PAYOUT_METADATA_KEY = PAYOUT_KEY;
  const gatewayLib = require('../src/lib/payout-gateway');
  const details = gatewayLib.decryptPayoutDetails(stored.enc);
  assert.equal(details.wallet_id, WALLET_ID);
  assert.equal(details.provider, 'OnePay');
});

test('remove method nulls the stored metadata and re-arms the gate', async () => {
  const session = await vendorLogin();
  const res = await session.fetch('/translations/earnings/payout-method/remove', {
    method: 'POST', headers: await jsonHeaders(session), body: JSON.stringify({}),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).payout.configured, false);

  const stored = (await pool.query('SELECT payout_metadata FROM users WHERE id = $1', [vendorId])).rows[0];
  assert.equal(stored.payout_metadata, null);

  const page = await session.fetch('/translations/earnings');
  assert.match(await page.text(), /No payout method on file yet/);
});

// ---------------------------------------------------------------------------
// PAYOUT_METADATA_KEY not configured: 503 endpoint + explanatory page notice
// ---------------------------------------------------------------------------

test('without PAYOUT_METADATA_KEY the save endpoint answers 503 and the page explains', async () => {
  const noKeyServer = await startServer(NOKEY_PORT, {
    PAYOUT_METADATA_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
  });
  try {
    const session = new Session(noKeyServer.base);
    await session.login(VENDOR_EMAIL);

    const page = await session.fetch('/translations/earnings');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Banking details cannot be stored until the administrator configures encryption \(PAYOUT_METADATA_KEY\)/);
    assert.ok(!html.includes('id="methodForm"'), 'the form is replaced by the notice');

    const res = await session.fetch('/translations/earnings/payout-method', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        'x-csrf-token': await session.getCsrfToken('/translations/earnings'),
      },
      body: JSON.stringify({
        method: 'bank_transfer', bank_name: 'BCEL', account_name: 'Kaysone Earnings',
        account_number: BANK_ACCOUNT_NUMBER,
      }),
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /PAYOUT_METADATA_KEY/);
  } finally {
    await noKeyServer.stop();
  }
});
