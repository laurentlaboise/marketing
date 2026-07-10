// Localization platform: role isolation, language scoping, sync/hash
// behaviour, publish→ledger crediting and the payout request lifecycle.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { startServer, Session, TEST_DB_URL } = require('./helpers');

const PORT = 3208;
// Any 64 hex chars: enables encrypted banking metadata in the suite.
const PAYOUT_KEY = 'ab'.repeat(32);

let server;
let pool;
let glossaryId;
let laRow;
let thRow;
let translatorId;
let payoutRequestId;

before(async () => {
  server = await startServer(PORT, { PAYOUT_METADATA_KEY: PAYOUT_KEY, ANTHROPIC_API_KEY: undefined });
  pool = new Pool({ connectionString: TEST_DB_URL });

  // Reset platform tables so reruns are deterministic.
  await pool.query('TRUNCATE payout_ledger, payout_requests, payout_rates, translations');
  await pool.query(`DELETE FROM glossary WHERE term LIKE 'TestTerm%'`);
  await pool.query(`DELETE FROM notifications WHERE title IN ('Translation submitted for review', 'Payout requested')`);

  // Lao vendor-translator.
  const hash = await bcrypt.hash('Password123!', 10);
  const translator = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, assigned_languages, is_vendor)
     VALUES ('translator@test.local', $1, 'Noy', 'Vendor', 'translator', '{la}', TRUE)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = $1, role = 'translator', assigned_languages = '{la}', is_vendor = TRUE
     RETURNING id`,
    [hash]
  );
  translatorId = translator.rows[0].id;

  // One translatable entity.
  const glossary = await pool.query(
    `INSERT INTO glossary (term, definition, letter)
     VALUES ('TestTerm SEO', 'Search engine optimization is the practice of improving a website so it ranks higher in organic search results.', 'T')
     RETURNING id`
  );
  glossaryId = glossary.rows[0].id;
});

after(async () => {
  if (pool) await pool.end();
  if (server) await server.stop();
});

// ---------------------------------------------------------------------------
// Unit: hashing, chunking, state machine
// ---------------------------------------------------------------------------

test('sourceHash is stable across key order; countWords strips HTML', () => {
  const core = require('../src/lib/translation-core');
  const a = core.sourceHash({ title: 'Hello', content: '<p>World and more</p>' });
  const b = core.sourceHash({ content: '<p>World and more</p>', title: 'Hello' });
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.notEqual(a, core.sourceHash({ title: 'Hello!', content: '<p>World and more</p>' }));
  assert.equal(core.countWords({ x: '<p>one two</p> three' }), 3);
});

test('chunkText respects the size cap and loses no content', () => {
  const { chunkText } = require('../src/lib/ai-translator');
  const paragraph = 'A sentence that repeats itself for padding. ';
  const text = Array.from({ length: 40 }, (_, i) => paragraph.repeat(8) + `P${i}.`).join('\n\n');
  const chunks = chunkText(text, 2000);
  assert.ok(chunks.length > 1, 'long text should split');
  for (const chunk of chunks) assert.ok(chunk.length <= 2000, 'chunk exceeds cap');
  const rejoined = chunks.join('');
  assert.equal(rejoined.replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
  assert.deepEqual(chunkText('short', 2000), ['short']);
});

test('status machine allows the documented transitions only', () => {
  const core = require('../src/lib/translation-core');
  assert.ok(core.canTransition('pending', 'translating'));
  assert.ok(core.canTransition('requires_review', 'published'));
  assert.ok(core.canTransition('requires_review', 'rejected'));
  assert.ok(core.canTransition('published', 'pending'));
  assert.ok(!core.canTransition('pending', 'published'), 'cannot publish an untranslated row');
  assert.ok(!core.canTransition('published', 'requires_review'));
});

// ---------------------------------------------------------------------------
// Role isolation
// ---------------------------------------------------------------------------

test('translator cannot reach admin surfaces or the superadmin pipeline', async () => {
  const session = new Session(server.base);
  await session.login('translator@test.local');

  for (const route of ['/content/articles', '/business/products', '/webdev/microsites']) {
    const res = await session.fetch(route);
    assert.equal(res.status, 302, `${route} should redirect translators`);
    assert.match(res.headers.get('location'), /\/dashboard/);
  }
  const api = await session.fetch('/api/stats');
  assert.equal(api.status, 403);

  // SuperAdmin-only translation surfaces.
  for (const route of ['/translations', '/translations/vendors', '/translations/payouts']) {
    const res = await session.fetch(route, { headers: { accept: 'application/json' } });
    assert.equal(res.status, 403, `${route} should be forbidden for translators`);
  }
});

test('translator dashboard redirects to the workspace', async () => {
  const session = new Session(server.base);
  await session.login('translator@test.local');
  const res = await session.fetch('/dashboard');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /\/translations\/workspace/);
});

test('plain user cannot reach the workspace', async () => {
  const session = new Session(server.base);
  await session.login('user@test.local');
  const res = await session.fetch('/translations/workspace', { headers: { accept: 'application/json' } });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// Sync + language scoping
// ---------------------------------------------------------------------------

test('sync creates rows per language and is idempotent', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');

  const first = await session.fetch('/translations/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({}),
  });
  assert.equal(first.status, 200);
  const rows = await pool.query(
    'SELECT * FROM translations WHERE entity_type = $1 AND entity_id = $2 ORDER BY target_language',
    ['glossary', glossaryId]
  );
  assert.equal(rows.rows.length, 3, 'one row per target language');
  assert.deepEqual(rows.rows.map((r) => r.target_language).sort(), ['fr', 'la', 'th']);
  assert.ok(rows.rows.every((r) => r.status === 'pending'));
  assert.ok(rows.rows[0].word_count > 0, 'word count captured from source');

  const countBefore = (await pool.query('SELECT COUNT(*)::int AS c FROM translations')).rows[0].c;
  const second = await session.fetch('/translations/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({}),
  });
  assert.equal(second.status, 200);
  const countAfter = (await pool.query('SELECT COUNT(*)::int AS c FROM translations')).rows[0].c;
  assert.equal(countBefore, countAfter, 'second sync must not duplicate rows');

  laRow = rows.rows.find((r) => r.target_language === 'la');
  thRow = rows.rows.find((r) => r.target_language === 'th');
});

test('translator is scoped to assigned languages (la yes, th no)', async () => {
  const session = new Session(server.base);
  await session.login('translator@test.local');

  const mine = await session.fetch(`/translations/workspace/${laRow.id}`);
  assert.equal(mine.status, 200);
  assert.match(await mine.text(), /TestTerm SEO/);

  const notMine = await session.fetch(`/translations/workspace/${thRow.id}`);
  assert.equal(notMine.status, 403);

  const saveDenied = await session.fetch(`/translations/workspace/${thRow.id}/save`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json',
      'x-csrf-token': await session.getCsrfToken('/translations/workspace'),
    },
    body: JSON.stringify({ content_payload: { term: 'x' } }),
  });
  assert.equal(saveDenied.status, 403);
});

// ---------------------------------------------------------------------------
// Draft → submit → approve → ledger
// ---------------------------------------------------------------------------

test('translator saves a draft and submits for review; superadmins are alerted', async () => {
  const session = new Session(server.base);
  await session.login('translator@test.local');
  const token = await session.getCsrfToken('/translations/workspace');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  const save = await session.fetch(`/translations/workspace/${laRow.id}/save`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content_payload: {
        term: 'TestTerm SEO (ລາວ)',
        definition: 'ການເພີ່ມປະສິດທິພາບຂອງເຄື່ອງມືຄົ້ນຫາ ແມ່ນການປັບປຸງເວັບໄຊທ໌.',
      },
    }),
  });
  assert.equal(save.status, 200);
  assert.equal((await save.json()).status, 'translating');

  const invalidField = await session.fetch(`/translations/workspace/${laRow.id}/save`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content_payload: { not_a_field: 'x' } }),
  });
  assert.equal(invalidField.status, 400, 'unknown payload fields are rejected');

  const submit = await session.fetch(`/translations/workspace/${laRow.id}/submit`, {
    method: 'POST', headers, body: JSON.stringify({}),
  });
  assert.equal(submit.status, 200);

  const row = (await pool.query('SELECT * FROM translations WHERE id = $1', [laRow.id])).rows[0];
  assert.equal(row.status, 'requires_review');
  assert.equal(row.translator_id, translatorId, 'row is claimed by the translator');
  assert.ok(row.source_hash, 'source hash stamped on save');

  const notif = await pool.query(
    `SELECT n.* FROM notifications n JOIN users u ON u.id = n.user_id
     WHERE n.title = 'Translation submitted for review' AND u.email = 'admin@test.local'`
  );
  assert.ok(notif.rows.length >= 1, 'superadmin notified of submission');
});

test('translator cannot approve; approval is superadmin-only', async () => {
  const session = new Session(server.base);
  await session.login('translator@test.local');
  const res = await session.fetch(`/translations/${laRow.id}/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json',
      'x-csrf-token': await session.getCsrfToken('/translations/workspace'),
    },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403);
});

test('approve publishes and credits the vendor ledger per configured rate', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  // Global per-word rate.
  const rate = await session.fetch('/translations/payouts/rates', {
    method: 'POST', headers,
    body: JSON.stringify({ rate_type: 'per_word', rate_amount: 0.05, min_payout: 0 }),
  });
  assert.equal(rate.status, 200);

  const approve = await session.fetch(`/translations/${laRow.id}/approve`, {
    method: 'POST', headers, body: JSON.stringify({}),
  });
  assert.equal(approve.status, 200);
  const body = await approve.json();
  assert.equal(body.translation.status, 'published');
  assert.ok(body.payout, 'payout credited');

  const row = (await pool.query('SELECT * FROM translations WHERE id = $1', [laRow.id])).rows[0];
  assert.equal(row.status, 'published');
  const expected = Math.round(row.word_count * 0.05 * 10000) / 10000;
  assert.equal(parseFloat(row.payout_amount), expected);

  const ledger = await pool.query('SELECT * FROM payout_ledger WHERE translation_id = $1', [laRow.id]);
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.rows[0].status, 'available');
  assert.equal(parseFloat(ledger.rows[0].amount), expected);
  assert.equal(ledger.rows[0].translator_id, translatorId);

  // Publishing twice from a terminal state must fail cleanly.
  const again = await session.fetch(`/translations/${laRow.id}/approve`, {
    method: 'POST', headers, body: JSON.stringify({}),
  });
  assert.equal(again.status, 409);
});

test('published translations are exposed on the public API (published only)', async () => {
  const anon = new Session(server.base);
  const res = await anon.fetch('/api/public/translations/la/glossary');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 1);
  assert.equal(body.translations[0].entity_id, glossaryId);
  assert.match(body.translations[0].content_payload.term, /ລາວ/);

  const th = await anon.fetch('/api/public/translations/th/glossary');
  assert.equal((await th.json()).count, 0, 'unreviewed rows are never exposed');

  const bad = await anon.fetch('/api/public/translations/xx/glossary');
  assert.equal(bad.status, 400);
});

// ---------------------------------------------------------------------------
// Stale detection (hash diff)
// ---------------------------------------------------------------------------

test('sync re-opens published rows when the English source changes', async () => {
  await pool.query(
    `UPDATE glossary SET definition = definition || ' Updated with brand-new guidance for 2026.' WHERE id = $1`,
    [glossaryId]
  );
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const res = await session.fetch('/translations/sync', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json',
      'x-csrf-token': await session.getCsrfToken('/dashboard'),
    },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 200);
  const summary = (await res.json()).summary;
  assert.ok(summary.stale >= 1, 'changed source re-opens the published row');

  const row = (await pool.query('SELECT * FROM translations WHERE id = $1', [laRow.id])).rows[0];
  assert.equal(row.status, 'pending');

  // Untouched rows (th, still pending/unhashed) are unaffected.
  const th = (await pool.query('SELECT * FROM translations WHERE id = $1', [thRow.id])).rows[0];
  assert.equal(th.status, 'pending');
});

// ---------------------------------------------------------------------------
// Banking metadata + payout request lifecycle
// ---------------------------------------------------------------------------

test('banking details are stored encrypted with only a masked label readable', async () => {
  const session = new Session(server.base);
  await session.login('translator@test.local');
  const res = await session.fetch('/translations/earnings/banking', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json',
      'x-csrf-token': await session.getCsrfToken('/translations/earnings'),
    },
    body: JSON.stringify({
      gateway: 'wise',
      account_holder: 'Noy Vendor',
      bank_name: 'BCEL',
      account_number: '001-12-00-9876543210',
      currency: 'LAK',
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.payout.gateway, 'wise');
  assert.match(body.payout.label, /3210/);
  assert.ok(!JSON.stringify(body).includes('9876543210'), 'full account number never returned');

  const stored = (await pool.query('SELECT payout_metadata FROM users WHERE id = $1', [translatorId])).rows[0].payout_metadata;
  const raw = JSON.stringify(stored);
  assert.ok(!raw.includes('9876543210'), 'account number is not stored in plaintext');
  assert.ok(!raw.includes('Noy Vendor'), 'holder name is not stored in plaintext');
  assert.equal(stored.gateway, 'wise');
  assert.ok(stored.enc && stored.enc.iv && stored.enc.tag && stored.enc.data, 'AES-GCM envelope present');

  // Round-trip with the key proves the envelope is real encryption.
  process.env.PAYOUT_METADATA_KEY = PAYOUT_KEY;
  const gatewayLib = require('../src/lib/payout-gateway');
  const details = gatewayLib.decryptPayoutDetails(stored.enc);
  assert.equal(details.account_number, '001-12-00-9876543210');
});

test('payout request bundles available credits; superadmin settles it', async () => {
  const translatorSession = new Session(server.base);
  await translatorSession.login('translator@test.local');
  const tToken = await translatorSession.getCsrfToken('/translations/earnings');
  const tHeaders = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': tToken };

  const request = await translatorSession.fetch('/translations/earnings/request', {
    method: 'POST', headers: tHeaders, body: JSON.stringify({}),
  });
  assert.equal(request.status, 200);
  const requestBody = await request.json();
  payoutRequestId = requestBody.request.id;
  assert.equal(requestBody.request.status, 'requested');
  assert.equal(requestBody.request.gateway, 'wise', 'gateway taken from stored banking metadata');
  assert.ok(requestBody.request.bank_metadata_snapshot, 'banking envelope snapshotted');

  const entries = await pool.query(
    `SELECT * FROM payout_ledger WHERE payout_request_id = $1`, [payoutRequestId]
  );
  assert.ok(entries.rows.length >= 1);
  assert.ok(entries.rows.every((e) => e.status === 'requested'));

  // Second request with nothing available must fail.
  const empty = await translatorSession.fetch('/translations/earnings/request', {
    method: 'POST', headers: tHeaders, body: JSON.stringify({}),
  });
  assert.equal(empty.status, 400);

  // Translator cannot settle payouts.
  const settleDenied = await translatorSession.fetch(`/translations/payouts/${payoutRequestId}/complete`, {
    method: 'POST', headers: tHeaders, body: JSON.stringify({}),
  });
  assert.equal(settleDenied.status, 403);

  const adminSession = new Session(server.base);
  await adminSession.login('admin@test.local');
  const aHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await adminSession.getCsrfToken('/dashboard'),
  };
  const complete = await adminSession.fetch(`/translations/payouts/${payoutRequestId}/complete`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ reference: 'BCEL-2026-0001' }),
  });
  assert.equal(complete.status, 200);

  const settled = (await pool.query('SELECT * FROM payout_requests WHERE id = $1', [payoutRequestId])).rows[0];
  assert.equal(settled.status, 'completed');
  assert.equal(settled.gateway_reference, 'BCEL-2026-0001');
  const paid = await pool.query('SELECT * FROM payout_ledger WHERE payout_request_id = $1', [payoutRequestId]);
  assert.ok(paid.rows.every((e) => e.status === 'paid' && e.paid_at));

  // Settling twice must conflict.
  const again = await adminSession.fetch(`/translations/payouts/${payoutRequestId}/complete`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({}),
  });
  assert.equal(again.status, 409);
});

// ---------------------------------------------------------------------------
// Vendor management guards + AI batch configuration
// ---------------------------------------------------------------------------

test('vendor management can adjust translators but never admin accounts', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const headers = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await session.getCsrfToken('/dashboard'),
  };

  const update = await session.fetch(`/translations/vendors/${translatorId}`, {
    method: 'POST', headers,
    body: JSON.stringify({ role: 'translator', assigned_languages: ['la', 'th'], is_vendor: true }),
  });
  assert.equal(update.status, 200);
  const updated = (await pool.query('SELECT assigned_languages FROM users WHERE id = $1', [translatorId])).rows[0];
  assert.deepEqual([...updated.assigned_languages].sort(), ['la', 'th']);

  // Restore single-language assignment for consistency.
  await pool.query(`UPDATE users SET assigned_languages = '{la}' WHERE id = $1`, [translatorId]);

  const adminId = (await pool.query(`SELECT id FROM users WHERE email = 'admin@test.local'`)).rows[0].id;
  const denied = await session.fetch(`/translations/vendors/${adminId}`, {
    method: 'POST', headers,
    body: JSON.stringify({ role: 'user', assigned_languages: [], is_vendor: false }),
  });
  assert.equal(denied.status, 400, 'admin accounts are not manageable here');

  const badRole = await session.fetch(`/translations/vendors/${translatorId}`, {
    method: 'POST', headers,
    body: JSON.stringify({ role: 'superadmin', assigned_languages: [], is_vendor: false }),
  });
  assert.equal(badRole.status, 400, 'cannot grant admin roles from this endpoint');
  // Undo the role churn from the badRole attempt (it was rejected, so none).
});

test('superadmin surfaces render: pipeline, review, vendors, payouts, workspace', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  for (const route of [
    '/translations',
    '/translations?status=published&lang=la&entity_type=glossary',
    `/translations/review/${laRow.id}`,
    '/translations/vendors',
    '/translations/payouts',
    '/translations/workspace',
    `/translations/workspace/${thRow.id}`, // admins may open any language
  ]) {
    const res = await session.fetch(route);
    assert.equal(res.status, 200, `${route} should render for superadmin`);
  }
});

test('AI batch reports missing configuration cleanly', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const res = await session.fetch('/translations/ai-batch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json',
      'x-csrf-token': await session.getCsrfToken('/dashboard'),
    },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 503, 'no ANTHROPIC_API_KEY in the test env');
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
});
