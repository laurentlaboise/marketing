// Client portal: social sign-in wiring, bot filters on the open
// magic-link door, and the partner-program enrollment lifecycle
// (self-serve application → human approval → capability).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Pool } = require('pg');
const { startServer, Session, TEST_DB_URL } = require('./helpers');

const PORT = 3210;
const OAUTH_PORT = 3211;

let server;
let pool;

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Mint a signed-in portal session by exercising the real magic-link flow
// against a token we insert directly.
async function customerSession(email) {
  const customer = (await pool.query(
    `INSERT INTO customers (email, name) VALUES ($1, 'Portal Tester')
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
  assert.match(res.headers.get('location'), /\/portal/);
  return { session, customer };
}

before(async () => {
  server = await startServer(PORT);
  pool = new Pool({ connectionString: TEST_DB_URL });
  await pool.query(`DELETE FROM customers WHERE email LIKE 'portal-test-%'`);
  await pool.query(`DELETE FROM notifications WHERE title = 'Partner application'`);
});

after(async () => {
  await pool.query(`DELETE FROM customers WHERE email LIKE 'portal-test-%'`);
  if (pool) await pool.end();
  if (server) await server.stop();
});

// ---------------------------------------------------------------------------
// Social sign-in
// ---------------------------------------------------------------------------

test('portal workspace page renders for signed-in customer', async () => {
  const { session, customer } = await customerSession(`portal-test-ws-${Date.now()}@example.com`);
  await pool.query(
    `INSERT INTO client_action_items (customer_id, title, notes, status)
     VALUES ($1, 'Approve content calendar', 'Reply in chat when ready', 'open')`,
    [customer.id]
  );
  const res = await session.fetch('/portal/workspace');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Your workspace|พื้นที่ทำงาน/, 'workspace heading present');
  assert.match(html, /Approve content calendar/, 'action item visible');
  assert.match(html, /href="\/portal\/workspace"/, 'nav includes workspace');
});

test('portal social sign-in: hidden when unconfigured, live hand-off when configured', async () => {
  // This server has no OAuth credentials: no buttons, and the routes
  // bounce quietly back to the login page.
  const session = new Session(server.base);
  const page = await session.fetch('/portal/login');
  const html = await page.text();
  assert.ok(!html.includes('/portal/auth/google'), 'no Google button without credentials');
  assert.ok(!html.includes('/portal/auth/facebook'), 'no Facebook button without credentials');
  const bounce = await session.fetch('/portal/auth/google');
  assert.equal(bounce.status, 302);
  assert.match(bounce.headers.get('location'), /\/portal\/login/);

  // With credentials, real links render and hand off to the provider.
  const oauthServer = await startServer(OAUTH_PORT, {
    GOOGLE_CLIENT_ID: 'portal-google-id',
    GOOGLE_CLIENT_SECRET: 'portal-google-secret',
    FACEBOOK_APP_ID: 'portal-fb-id',
    FACEBOOK_APP_SECRET: 'portal-fb-secret',
  });
  try {
    const s2 = new Session(oauthServer.base);
    const page2 = await s2.fetch('/portal/login');
    const html2 = await page2.text();
    assert.ok(html2.includes('href="/portal/auth/google"'), 'Google button is a real link');
    assert.ok(html2.includes('href="/portal/auth/facebook"'), 'Facebook button is a real link');
    const g = await s2.fetch('/portal/auth/google');
    assert.equal(g.status, 302);
    assert.match(g.headers.get('location'), /accounts\.google\.com/, 'hand-off reaches Google');
    assert.match(g.headers.get('location'), /portal%2Fauth%2Fgoogle%2Fcallback|portal\/auth\/google\/callback/,
      'callback returns to the PORTAL, not the admin');
    const f = await s2.fetch('/portal/auth/facebook');
    assert.equal(f.status, 302);
    assert.match(f.headers.get('location'), /facebook\.com/, 'hand-off reaches Facebook');
  } finally {
    await oauthServer.stop();
  }
});

// ---------------------------------------------------------------------------
// Bot filters on the account-creating magic-link path
// ---------------------------------------------------------------------------

test('honeypot, instant submits and throwaway inboxes get the neutral page and create nothing', async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function submitLogin(email, { honeypot = false, patient = true } = {}) {
    const session = new Session(server.base);
    const token = await session.getCsrfToken('/portal/login');
    if (patient) await wait(1600); // humans read the form first
    const body = { email, _csrf: token };
    if (honeypot) body.website = 'https://spam.example';
    const res = await session.fetch('/portal/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /spam/i, 'neutral check-your-email page renders');
  }
  const exists = async (email) =>
    (await pool.query('SELECT 1 FROM customers WHERE email = $1', [email])).rows.length > 0;

  await submitLogin('portal-test-bot1@example.com', { honeypot: true });
  assert.equal(await exists('portal-test-bot1@example.com'), false, 'honeypot creates no account');

  await submitLogin('portal-test-bot2@example.com', { patient: false });
  assert.equal(await exists('portal-test-bot2@example.com'), false, 'instant submit creates no account');

  await submitLogin('portal-test-bot3@mailinator.com');
  assert.equal(await exists('portal-test-bot3@mailinator.com'), false, 'throwaway inbox creates no account');

  await submitLogin('portal-test-human@example.com');
  assert.equal(await exists('portal-test-human@example.com'), true, 'a patient human email creates the account');
});

// ---------------------------------------------------------------------------
// Partner-program enrollment lifecycle
// ---------------------------------------------------------------------------

test('partner enrollment: apply → pending → admin decision → portal reflects it', async () => {
  const { session, customer } = await customerSession('portal-test-partner@example.com');

  // The programs page renders all three offers.
  const page = await session.fetch('/portal/programs');
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const label of ['Affiliate', 'Dropshipping', 'White Label']) {
    assert.ok(html.includes(label), `${label} program card renders`);
  }

  // Apply to the affiliate program.
  const csrf = await session.getCsrfToken('/portal/programs');
  const enroll = await session.fetch('/portal/programs/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ program: 'affiliate', note: 'I run a Lao business page', _csrf: csrf }).toString(),
  });
  assert.equal(enroll.status, 302);
  let row = (await pool.query(
    `SELECT * FROM partner_enrollments WHERE customer_id = $1 AND program = 'affiliate'`,
    [customer.id]
  )).rows[0];
  assert.equal(row.status, 'pending');
  assert.equal(row.note, 'I run a Lao business page');

  // Re-applying while pending changes nothing; unknown programs are ignored.
  await session.fetch('/portal/programs/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ program: 'affiliate', _csrf: csrf }).toString(),
  });
  const count = (await pool.query(
    `SELECT COUNT(*)::int AS c FROM partner_enrollments WHERE customer_id = $1`, [customer.id]
  )).rows[0].c;
  assert.equal(count, 1, 'one enrollment per (customer, program)');
  await session.fetch('/portal/programs/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ program: 'ponzi', _csrf: csrf }).toString(),
  });
  assert.equal((await pool.query(
    `SELECT COUNT(*)::int AS c FROM partner_enrollments WHERE customer_id = $1`, [customer.id]
  )).rows[0].c, 1, 'unknown program creates nothing');

  // Admins are notified and see the queue.
  const notified = (await pool.query(
    `SELECT COUNT(*)::int AS c FROM notifications WHERE title = 'Partner application'`
  )).rows[0].c;
  assert.ok(notified > 0, 'admins are notified of the application');

  const admin = new Session(server.base);
  await admin.login('admin@test.local');
  const queue = await admin.fetch('/partners');
  assert.equal(queue.status, 200);
  assert.match(await queue.text(), /portal-test-partner@example\.com/, 'application shows in the queue');

  // Approve it (with a note) — the portal reflects the active state.
  const aHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await admin.getCsrfToken('/dashboard'),
  };
  const approve = await admin.fetch(`/partners/${row.id}/decision`, {
    method: 'POST', headers: aHeaders,
    body: JSON.stringify({ action: 'approve', note: 'Welcome!' }),
  });
  assert.equal(approve.status, 200);
  row = (await pool.query('SELECT * FROM partner_enrollments WHERE id = $1', [row.id])).rows[0];
  assert.equal(row.status, 'active');
  assert.ok(row.decided_by, 'decision is attributed');
  assert.ok(row.decided_at, 'decision is timestamped');
  assert.match(await (await session.fetch('/portal/programs')).text(), /Active/, 'portal shows the active badge');

  // Suspend → the customer cannot self-serve back to pending.
  await admin.fetch(`/partners/${row.id}/decision`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ action: 'suspend' }),
  });
  await session.fetch('/portal/programs/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ program: 'affiliate', _csrf: csrf }).toString(),
  });
  row = (await pool.query('SELECT status FROM partner_enrollments WHERE id = $1', [row.id])).rows[0];
  assert.equal(row.status, 'suspended', 'suspension is not self-serve reversible');

  // Rejected → re-apply reopens as pending.
  const enroll2 = await session.fetch('/portal/programs/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ program: 'dropship', note: 'try me', _csrf: csrf }).toString(),
  });
  assert.equal(enroll2.status, 302);
  let ds = (await pool.query(
    `SELECT * FROM partner_enrollments WHERE customer_id = $1 AND program = 'dropship'`, [customer.id]
  )).rows[0];
  await admin.fetch(`/partners/${ds.id}/decision`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ action: 'reject', note: 'need more info' }),
  });
  await session.fetch('/portal/programs/enroll', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ program: 'dropship', note: 'here is more info', _csrf: csrf }).toString(),
  });
  ds = (await pool.query('SELECT status, note FROM partner_enrollments WHERE id = $1', [ds.id])).rows[0];
  assert.equal(ds.status, 'pending', 'rejection is re-applyable');
  assert.equal(ds.note, 'here is more info');
});

test('partner queue is admin-only; portal programs need a customer session', async () => {
  // Customer sessions never reach the admin queue.
  const { session } = await customerSession('portal-test-rbac@example.com');
  const denied = await session.fetch('/partners', { headers: { accept: 'application/json' } });
  assert.equal(denied.status, 401, 'customer session is not an admin session');

  // Authenticated non-admins (the always-seeded plain user) cannot
  // reach the queue either.
  const nonAdmin = new Session(server.base);
  await nonAdmin.login('user@test.local');
  const nonAdminDenied = await nonAdmin.fetch('/partners', { headers: { accept: 'application/json' } });
  assert.equal(nonAdminDenied.status, 403);

  // Anonymous visitors are sent to the portal login.
  const anon = new Session(server.base);
  const redirect = await anon.fetch('/portal/programs');
  assert.equal(redirect.status, 302);
  assert.match(redirect.headers.get('location'), /\/portal\/login/);
});
