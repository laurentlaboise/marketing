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
  server = await startServer(PORT, {
    PAYOUT_METADATA_KEY: PAYOUT_KEY,
    ANTHROPIC_API_KEY: undefined,
    // Whiteboard module on: its migrations run at boot and the collab
    // endpoints (comment language stamping, translation attach) mount.
    FEATURE_WHITEBOARD: '1',
  });
  pool = new Pool({ connectionString: TEST_DB_URL });

  // Reset platform tables so reruns are deterministic.
  await pool.query('TRUNCATE payout_ledger, payout_requests, payout_rates, translations, comp_rates, leads, engagement_logs');
  // The whiteboard module migrates AFTER the HTTP listener is up (its WS
  // handler needs the server handle, and module failure must never block
  // boot), so /health — the readiness signal — can answer before the board
  // tables exist on a fresh database. And boot DDL is serialized across the
  // suite's parallel servers by an advisory lock, so those migrations may
  // queue for several seconds. Wait for them before resetting board state;
  // fail loudly if the module never attached. board_translations has no FK
  // to boards, so it is truncated by name.
  const whiteboardDeadline = Date.now() + 15000;
  for (;;) {
    const reg = await pool.query(
      "SELECT to_regclass('boards') AS boards, to_regclass('board_translations') AS translations"
    );
    if (reg.rows[0].boards && reg.rows[0].translations) break;
    if (Date.now() > whiteboardDeadline) {
      throw new Error('whiteboard tables never appeared — did the module fail to attach?\n' + server.getOutput());
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await pool.query('TRUNCATE boards, board_translations CASCADE');
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

  // Lao verifier (Content Verifier position) — seeded here so the verify,
  // leads, engagement and work-hub tests are each independently runnable.
  await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, assigned_languages, is_vendor, position)
     VALUES ('verifier@test.local', $1, 'Kham', 'Verifier', 'translator', '{la}', TRUE, 'content_verifier')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = $1, role = 'translator', assigned_languages = '{la}', is_vendor = TRUE`,
    [hash]
  );

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
    method: 'POST', headers, body: JSON.stringify({ acknowledge: true }),
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
    method: 'POST', headers, body: JSON.stringify({ acknowledge: true }),
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

// ---------------------------------------------------------------------------
// Workforce: verification pay (write vs check vs rework), leads CRM
// tiers, engagement credits — all in kip, all admin-gated.
// ---------------------------------------------------------------------------

test('edit stats and comp math: chars, tiers, conversion floors, kip rounding', () => {
  const c = require('../src/lib/translation-core');
  const stats = c.computeEditStats(
    { a: 'Original text here', b: 'Untouched', c: 'Old' },
    { a: 'Changed text here!', b: 'Untouched', c: 'Old' }
  );
  assert.equal(stats.editedSegments, 1);
  assert.equal(stats.editedChars, 'Changed text here!'.length);
  assert.equal(c.roundMoney(1234.56, 'LAK'), 1235);
  assert.equal(c.roundMoney(1.23456, 'USD'), 1.2346);
  assert.equal(c.countChars({ x: '<p>ສະບາຍດີ</p>' }), 'ສະບາຍດີ'.length);

  const comp = require('../src/lib/comp-engine');
  const tiers = [{ min: 1, max: 20, rate: 20000 }, { min: 21, max: 50, rate: 28000 }, { min: 51, rate: 35000 }];
  assert.equal(comp.tierRate(tiers, 1), 20000);
  assert.equal(comp.tierRate(tiers, 21), 28000);
  assert.equal(comp.tierRate(tiers, 999), 35000);
  // 3% of 5,000,000 kip = 150,000 (above the 50k floor)
  assert.equal(comp.computeCompAmount(
    { work_type: 'lead_conversion', bonus_percent: 3, bonus_floor: 50000, currency: 'LAK' },
    { saleValue: 5000000 }
  ), 150000);
  // Small sale → floor applies
  assert.equal(comp.computeCompAmount(
    { work_type: 'lead_conversion', bonus_percent: 3, bonus_floor: 50000, currency: 'LAK' },
    { saleValue: 100000 }
  ), 50000);
});

test('verifier flow: AI draft → fix → approve → publish credits verification + edit in kip', async () => {
  // The verifier user is seeded in before().
  const verifier = await pool.query(`SELECT id FROM users WHERE email = 'verifier@test.local'`);
  const verifierId = verifier.rows[0].id;

  // Per-1000-char kip rates for checking and reworking.
  const admin = new Session(server.base);
  await admin.login('admin@test.local');
  const aHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await admin.getCsrfToken('/dashboard'),
  };
  for (const [workType, amount] of [['verification', 30000], ['edit', 15000]]) {
    const rateRes = await admin.fetch('/translations/payouts/rates', {
      method: 'POST', headers: aHeaders,
      body: JSON.stringify({ work_type: workType, rate_type: 'per_1000_chars', rate_amount: amount, currency: 'LAK', target_language: 'la' }),
    });
    assert.equal(rateRes.status, 200);
  }

  // An "AI-drafted" Lao row awaiting review.
  const glossary = await pool.query(
    `INSERT INTO glossary (term, definition, letter) VALUES ('TestTerm Verify', 'A definition to verify.', 'T') RETURNING id`
  );
  const draftText = 'ຄຳນິຍາມທີ່ AI ຂຽນໄວ້ສຳລັບການກວດສອບ ມີເນື້ອຫາຍາວພໍສົມຄວນ';
  const row = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, content_payload, status, ai_model, word_count)
     VALUES ('glossary', $1, 'la', $2, 'requires_review', 'test-model', 5) RETURNING id`,
    [glossary.rows[0].id, JSON.stringify({ term: 'TestTerm Verify (ລາວ)', definition: draftText })]
  );
  const rowId = row.rows[0].id;

  const verifierSession = new Session(server.base);
  await verifierSession.login('verifier@test.local');
  const vHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await verifierSession.getCsrfToken('/translations/workspace'),
  };

  // The row shows in the verify queue.
  const workspace = await verifierSession.fetch('/translations/workspace');
  assert.match(await workspace.text(), /To Verify/);

  // Approve with one segment reworked.
  const fixedText = 'ຄຳນິຍາມສະບັບແກ້ໄຂໂດຍຜູ້ກວດ ອ່ານເປັນທຳມະຊາດກວ່າເກົ່າ';
  const approve = await verifierSession.fetch(`/translations/verify/${rowId}/approve`, {
    method: 'POST', headers: vHeaders,
    body: JSON.stringify({ content_payload: { term: 'TestTerm Verify (ລາວ)', definition: fixedText } }),
  });
  assert.equal(approve.status, 200);
  const approveBody = await approve.json();
  assert.equal(approveBody.editedSegments, 1);

  const verifiedRow = (await pool.query('SELECT * FROM translations WHERE id = $1', [rowId])).rows[0];
  assert.equal(verifiedRow.status, 'verified');
  assert.equal(verifiedRow.verified_by, verifierId);
  assert.ok(verifiedRow.target_char_count > 0);
  assert.ok(verifiedRow.ai_draft_payload, 'draft snapshot kept for edit metering');

  // Admin publishes from 'verified' → verifier gets verification + edit
  // credits (kip); no translation credit for the AI row.
  const publish = await admin.fetch(`/translations/${rowId}/approve`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ acknowledge: true }),
  });
  assert.equal(publish.status, 200);
  const publishBody = await publish.json();
  assert.equal(publishBody.payoutSkipReason, 'ai_translation');
  assert.equal(publishBody.credits.length, 2);

  const credits = await pool.query(
    `SELECT type, amount, currency FROM payout_ledger WHERE translation_id = $1 ORDER BY type`,
    [rowId]
  );
  assert.deepEqual(credits.rows.map((r) => r.type).sort(), ['edit_credit', 'verification_credit']);
  const verification = credits.rows.find((r) => r.type === 'verification_credit');
  assert.equal(verification.currency, 'LAK');
  const expectedVerification = Math.round((30000 * verifiedRow.target_char_count) / 1000);
  assert.equal(Math.round(parseFloat(verification.amount)), expectedVerification);
  const edit = credits.rows.find((r) => r.type === 'edit_credit');
  assert.equal(Math.round(parseFloat(edit.amount)), Math.round((15000 * verifiedRow.edited_chars) / 1000));

  // Re-publishing after a reopen never double-pays.
  await admin.fetch(`/translations/${rowId}/reopen`, { method: 'POST', headers: aHeaders, body: JSON.stringify({}) });
  await pool.query(`UPDATE translations SET status = 'verified' WHERE id = $1`, [rowId]);
  await admin.fetch(`/translations/${rowId}/approve`, { method: 'POST', headers: aHeaders, body: JSON.stringify({ acknowledge: true }) });
  const creditCount = (await pool.query(
    `SELECT COUNT(*)::int AS c FROM payout_ledger WHERE translation_id = $1`, [rowId]
  )).rows[0].c;
  assert.equal(creditCount, 2, 'no duplicate credits on re-publish');
});

test('a translator cannot verify their own translation', async () => {
  const glossary = await pool.query(
    `INSERT INTO glossary (term, definition, letter) VALUES ('TestTerm SelfVerify', 'Self check.', 'T') RETURNING id`
  );
  const row = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, content_payload, status, translator_id, word_count)
     VALUES ('glossary', $1, 'la', $2, 'requires_review',
             (SELECT id FROM users WHERE email = 'translator@test.local'), 2)
     RETURNING id`,
    [glossary.rows[0].id, JSON.stringify({ term: 'ຂ້ອຍແປເອງ' })]
  );
  const session = new Session(server.base);
  await session.login('translator@test.local');
  const res = await session.fetch(`/translations/verify/${row.rows[0].id}/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json',
      'x-csrf-token': await session.getCsrfToken('/translations/workspace'),
    },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /own translation/);
});

test('leads: capture → dedupe → qualify → admin approves tier credit → conversion bonus', async () => {
  // Kip work-unit rates (from the Lead Verifier brief).
  await pool.query(`UPDATE comp_rates SET is_active = FALSE WHERE is_active = TRUE`);
  await pool.query(
    `INSERT INTO comp_rates (work_type, rate_amount, currency) VALUES ('lead_entry', 1500, 'LAK')`
  );
  await pool.query(
    `INSERT INTO comp_rates (work_type, rate_amount, currency, tiers)
     VALUES ('lead_qualified', 20000, 'LAK', $1)`,
    [JSON.stringify([{ min: 1, max: 20, rate: 20000 }, { min: 21, max: 50, rate: 28000 }, { min: 51, rate: 35000 }])]
  );
  await pool.query(
    `INSERT INTO comp_rates (work_type, rate_amount, currency, bonus_percent, bonus_floor)
     VALUES ('lead_conversion', 0, 'LAK', 3, 50000)`
  );
  await pool.query(`DELETE FROM leads WHERE phone LIKE '%2055500%'`);

  const worker = new Session(server.base);
  await worker.login('verifier@test.local'); // vendor → work hub access
  const wHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await worker.getCsrfToken('/workforce/my'),
  };

  const capture = await worker.fetch('/workforce/my/leads', {
    method: 'POST', headers: wHeaders,
    body: JSON.stringify({ name: 'Somchai Test', phone: '+856 20 5550 0111', interest: 'SEO package', source: 'social' }),
  });
  assert.equal(capture.status, 200);
  const leadId = (await capture.json()).lead.id;

  // De-dup: same phone (different formatting) never enters twice.
  const duplicate = await worker.fetch('/workforce/my/leads', {
    method: 'POST', headers: wHeaders,
    body: JSON.stringify({ name: 'Somchai Again', phone: '8562055500111' }),
  });
  assert.equal(duplicate.status, 409);

  // Worker qualifies the lead (claim), admin approves → entry + tier-1 credit.
  const qualify = await worker.fetch(`/workforce/my/leads/${leadId}`, {
    method: 'POST', headers: wHeaders, body: JSON.stringify({ claim_status: 'qualified' }),
  });
  assert.equal(qualify.status, 200);

  const admin = new Session(server.base);
  await admin.login('admin@test.local');
  const aHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await admin.getCsrfToken('/dashboard'),
  };
  const approve = await admin.fetch(`/workforce/leads/${leadId}/approve`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({}),
  });
  assert.equal(approve.status, 200);
  const approveBody = await approve.json();
  const paid = approveBody.credits.filter((c) => c.credited);
  assert.deepEqual(paid.map((c) => c.workType).sort(), ['lead_entry', 'lead_qualified']);
  assert.equal(paid.find((c) => c.workType === 'lead_qualified').amount, 20000, 'first qualified lead of the month pays tier 1');

  // Approving again credits nothing (idempotent per milestone).
  const again = await admin.fetch(`/workforce/leads/${leadId}/approve`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({}),
  });
  assert.equal((await again.json()).credits.filter((c) => c.credited).length, 0);

  // Conversion: 3% of 5,000,000 kip = 150,000.
  const convert = await admin.fetch(`/workforce/leads/${leadId}/convert`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ sale_value: 5000000 }),
  });
  assert.equal(convert.status, 200);
  const bonus = (await convert.json()).bonus;
  assert.equal(bonus.credited, true);
  assert.equal(bonus.amount, 150000);
});

test('engagement: worker logs, admin approves per-unit, rejected pays nothing', async () => {
  await pool.query(
    `INSERT INTO comp_rates (work_type, rate_amount, currency) VALUES ('community_response', 3500, 'LAK')`
  );
  const worker = new Session(server.base);
  await worker.login('verifier@test.local');
  const wHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await worker.getCsrfToken('/workforce/my'),
  };
  const logged = [];
  for (let i = 0; i < 2; i += 1) {
    const res = await worker.fetch('/workforce/my/engagement', {
      method: 'POST', headers: wHeaders,
      body: JSON.stringify({ track: 'community_response', reference_url: `https://facebook.com/post/${i}` }),
    });
    assert.equal(res.status, 200);
    logged.push((await res.json()).log.id);
  }

  const admin = new Session(server.base);
  await admin.login('admin@test.local');
  const aHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await admin.getCsrfToken('/dashboard'),
  };
  const approveOne = await admin.fetch('/workforce/engagement/review', {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ ids: [logged[0]], decision: 'approve' }),
  });
  assert.equal((await approveOne.json()).credited, 1);
  const rejectOne = await admin.fetch('/workforce/engagement/review', {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ ids: [logged[1]], decision: 'reject' }),
  });
  assert.equal((await rejectOne.json()).credited, 0);

  const credit = await pool.query(
    `SELECT amount, currency FROM payout_ledger WHERE metadata->>'reference_id' = $1`, [logged[0]]
  );
  assert.equal(credit.rows.length, 1);
  assert.equal(Math.round(parseFloat(credit.rows[0].amount)), 3500);
  const noCredit = await pool.query(
    `SELECT 1 FROM payout_ledger WHERE metadata->>'reference_id' = $1`, [logged[1]]
  );
  assert.equal(noCredit.rows.length, 0, 'rejected work pays nothing');
});

test('a duplicate credit inside one transaction skips without aborting it', async () => {
  // The failure mode: swallowing a unique violation would leave the
  // caller's transaction aborted, rolling back sibling credits while the
  // route reports success. ON CONFLICT DO NOTHING must keep the
  // transaction fully usable.
  const comp = require('../src/lib/comp-engine');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const first = await comp.creditWork({
      userId: translatorId, workType: 'lead_entry', referenceId: 'txn-dup-test',
      description: 'transaction duplicate test', client,
    });
    const second = await comp.creditWork({
      userId: translatorId, workType: 'lead_entry', referenceId: 'txn-dup-test',
      description: 'transaction duplicate test (again)', client,
    });
    // The transaction must still accept statements after the duplicate…
    const alive = await client.query('SELECT 1 AS ok');
    assert.equal(alive.rows[0].ok, 1, 'transaction not aborted by the duplicate');
    await client.query('COMMIT');

    assert.equal(first.credited, true);
    assert.equal(second.credited, false);
    assert.equal(second.reason, 'already_credited');
  } finally {
    client.release();
  }
  // …and exactly one ledger row survives the commit.
  const rows = await pool.query(
    `SELECT COUNT(*)::int AS c FROM payout_ledger WHERE metadata->>'reference_id' = 'txn-dup-test'`
  );
  assert.equal(rows.rows[0].c, 1);
});

test('work hub access: vendors in, plain users out; kip earnings request works', async () => {
  const anonUser = new Session(server.base);
  await anonUser.login('user@test.local');
  const denied = await anonUser.fetch('/workforce/my', { headers: { accept: 'application/json' } });
  assert.equal(denied.status, 403);

  const worker = new Session(server.base);
  await worker.login('verifier@test.local');
  const hub = await worker.fetch('/workforce/my');
  assert.equal(hub.status, 200);
  assert.match(await hub.text(), /My Work Hub/);

  // The verifier's kip credits bundle into a LAK payout request.
  const wHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await worker.getCsrfToken('/translations/earnings'),
  };
  const request = await worker.fetch('/translations/earnings/request', {
    method: 'POST', headers: wHeaders, body: JSON.stringify({}),
  });
  assert.equal(request.status, 200);
  const body = await request.json();
  assert.ok(body.requests.every((r) => r.currency === 'LAK'), 'verifier balance is kip-only');
  assert.ok(parseFloat(body.requests[0].amount) > 0);
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

// ---------------------------------------------------------------------------
// Part 2: site pages as translatable entities + public feeds for the
// static-site generator and the localized article shell
// ---------------------------------------------------------------------------

test('site page entity: sync → vendor translate → publish → public feed with path', async () => {
  await pool.query(`DELETE FROM site_pages WHERE path = '/test-page/'`);
  const page = await pool.query(
    `INSERT INTO site_pages (path, title, segments, segment_count, word_count, tier)
     VALUES ('/test-page/', 'Test Page', $1, 2, 9, 1) RETURNING id`,
    [JSON.stringify({ s_aabbccdd11: 'Hello world from the test page.', s_eeff00112233: 'A second translatable block.' })]
  );
  const pageId = page.rows[0].id;

  const admin = new Session(server.base);
  await admin.login('admin@test.local');
  const aHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await admin.getCsrfToken('/dashboard'),
  };
  const sync = await admin.fetch('/translations/sync', {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ entity_types: ['page'] }),
  });
  assert.equal(sync.status, 200);

  const rows = await pool.query(
    `SELECT * FROM translations WHERE entity_type = 'page' AND entity_id = $1 ORDER BY target_language`,
    [pageId]
  );
  assert.equal(rows.rows.length, 3, 'page rows created for fr/la/th');
  const laPage = rows.rows.find((r) => r.target_language === 'la');

  const translator = new Session(server.base);
  await translator.login('translator@test.local');
  const tHeaders = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await translator.getCsrfToken('/translations/workspace'),
  };

  // Segment keys are validated by pattern for dynamic entities.
  const badSave = await translator.fetch(`/translations/workspace/${laPage.id}/save`, {
    method: 'POST', headers: tHeaders,
    body: JSON.stringify({ content_payload: { not_a_segment: 'x' } }),
  });
  assert.equal(badSave.status, 400);

  const save = await translator.fetch(`/translations/workspace/${laPage.id}/save`, {
    method: 'POST', headers: tHeaders,
    body: JSON.stringify({ content_payload: { s_aabbccdd11: 'ສະບາຍດີຈາກໜ້າທົດສອບ.' } }),
  });
  assert.equal(save.status, 200);

  // The workspace editor renders the page segments side-by-side.
  const editor = await translator.fetch(`/translations/workspace/${laPage.id}`);
  assert.equal(editor.status, 200);
  const editorHtml = await editor.text();
  assert.match(editorHtml, /Hello world from the test page\./);
  assert.match(editorHtml, /Segment 1/);

  const submit = await translator.fetch(`/translations/workspace/${laPage.id}/submit`, {
    method: 'POST', headers: tHeaders, body: JSON.stringify({}),
  });
  assert.equal(submit.status, 200);

  const approve = await admin.fetch(`/translations/${laPage.id}/approve`, {
    method: 'POST', headers: aHeaders, body: JSON.stringify({ acknowledge: true }),
  });
  assert.equal(approve.status, 200);
  const approveBody = await approve.json();
  assert.equal(approveBody.translation.status, 'published');
  // Dispatch is best-effort and unconfigured here (no GITHUB_TOKEN).
  assert.equal(approveBody.regeneration.dispatched, false);

  // The generator consumes this feed: published page rows joined to paths.
  const anon = new Session(server.base);
  const feed = await anon.fetch('/api/public/translations/la/page');
  assert.equal(feed.status, 200);
  const feedBody = await feed.json();
  const entry = feedBody.translations.find((t) => t.path === '/test-page/');
  assert.ok(entry, 'published page translation exposed with its site path');
  assert.equal(entry.content_payload.s_aabbccdd11, 'ສະບາຍດີຈາກໜ້າທົດສອບ.');

  // Unpublished languages stay unexposed.
  const thFeed = await (await anon.fetch('/api/public/translations/th/page')).json();
  assert.ok(!thFeed.translations.some((t) => t.path === '/test-page/'));
});

test('Sync Site Pages imports the website pages into the pipeline', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const headers = {
    'content-type': 'application/json', accept: 'application/json',
    'x-csrf-token': await session.getCsrfToken('/dashboard'),
  };

  // The test process runs inside the full repo checkout, so the sync uses
  // the real en/ tree via the filesystem path — the same code path a
  // full-checkout deployment uses; live deployments fetch the site instead.
  const res = await session.fetch('/translations/sync-pages', {
    method: 'POST', headers, body: JSON.stringify({}),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.summary.mode, 'filesystem');
  // ~26 real pages today; the ~80 glossary term files are content-prompt
  // stubs with no extractable text (their real content is the glossary DB
  // entity) and must be skipped, not imported.
  assert.ok(body.summary.upserted >= 20, `imports the real pages (got ${body.summary.upserted})`);
  assert.ok(body.summary.empty >= 50, `skips the stub pages (got ${body.summary.empty} empty)`);
  assert.equal(body.summary.failed, 0);

  // Key surfaces are registered with their segments…
  const pages = await pool.query(
    `SELECT path, segment_count FROM site_pages WHERE status = 'active' AND path = ANY($1) ORDER BY path`,
    [['/', '/digital-marketing-services/prices/', '/company/contact-us/']]
  );
  assert.equal(pages.rows.length, 3, 'homepage, prices and contact are registered');
  assert.ok(pages.rows.every((p) => p.segment_count > 0));

  // …and each got pending translation rows for every target language.
  const homepageRows = await pool.query(
    `SELECT t.target_language FROM translations t
     JOIN site_pages p ON p.id = t.entity_id
     WHERE t.entity_type = 'page' AND p.path = '/' ORDER BY t.target_language`
  );
  assert.deepEqual(homepageRows.rows.map((r) => r.target_language), ['fr', 'la', 'th']);

  // Idempotent: a second run creates no duplicate pages or rows.
  const before = (await pool.query(`SELECT COUNT(*)::int AS c FROM site_pages WHERE status = 'active'`)).rows[0].c;
  const again = await session.fetch('/translations/sync-pages', {
    method: 'POST', headers, body: JSON.stringify({}),
  });
  assert.equal(again.status, 200);
  const after = (await pool.query(`SELECT COUNT(*)::int AS c FROM site_pages WHERE status = 'active'`)).rows[0].c;
  assert.equal(before, after, 'second import must not duplicate pages');

  // The pipeline list shows pages by their site path, and translators are
  // still locked out of the import.
  const list = await session.fetch('/translations?entity_type=page&per_page=200');
  assert.match(await list.text(), /\/digital-marketing-services\/prices\//);
  const translator = new Session(server.base);
  await translator.login('translator@test.local');
  const denied = await translator.fetch('/translations/sync-pages', {
    method: 'POST',
    headers: { ...headers, 'x-csrf-token': await translator.getCsrfToken('/translations/workspace') },
    body: JSON.stringify({}),
  });
  assert.equal(denied.status, 403);
});

test('article translation is served by slug for the localized shell', async () => {
  await pool.query(`DELETE FROM articles WHERE slug = 'test-localized-article'`);
  const article = await pool.query(
    `INSERT INTO articles (title, slug, content, status)
     VALUES ('Localized Article', 'test-localized-article', '<p>English body</p>', 'published')
     RETURNING id`
  );
  await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, content_payload, status, published_at, word_count)
     VALUES ('article', $1, 'th', $2, 'published', CURRENT_TIMESTAMP, 2)
     ON CONFLICT (entity_type, entity_id, target_language) DO UPDATE
       SET content_payload = $2, status = 'published'`,
    [article.rows[0].id, JSON.stringify({ title: 'บทความทดสอบ', content: '<p>เนื้อหาภาษาไทย</p>' })]
  );

  const anon = new Session(server.base);
  const found = await anon.fetch('/api/public/translations/th/article/test-localized-article');
  assert.equal(found.status, 200);
  const body = await found.json();
  assert.equal(body.translation.slug, 'test-localized-article');
  assert.equal(body.translation.content_payload.title, 'บทความทดสอบ');

  const missing = await anon.fetch('/api/public/translations/la/article/test-localized-article');
  assert.equal(missing.status, 404, 'no published Lao translation → 404');

  const badLang = await anon.fetch('/api/public/translations/xx/article/test-localized-article');
  assert.equal(badLang.status, 400);
});

// ---------------------------------------------------------------------------
// Whiteboard: cross-language conversation (snippet auto-translation)
// ---------------------------------------------------------------------------

test('snippet translations cache per language and re-translate on edit', async () => {
  const snippets = require('../src/lib/snippet-translator');
  process.env.ANTHROPIC_API_KEY = 'test-key'; // gate open in THIS process
  let calls = 0;
  snippets._setTransport((text, from, to) => { calls++; return `[${to}] ${text}`; });

  try {
    const board = await pool.query(`INSERT INTO boards (title) VALUES ('TR cache board') RETURNING id`);
    const boardId = board.rows[0].id;
    const c = await pool.query(
      `INSERT INTO board_comments (board_id, author_type, author_id, author_name, body, source_lang)
       VALUES ($1, 'customer', 'c1', 'Somchai', 'สวัสดีครับ', 'th') RETURNING id`,
      [boardId]
    );
    const cid = c.rows[0].id;

    await snippets.ensureSnippetTranslations({ entityType: 'board_comment', entityId: cid, text: 'สวัสดีครับ', sourceLang: 'th' });
    assert.equal(calls, 1, 'translates into the one other conversation language');
    await snippets.ensureSnippetTranslations({ entityType: 'board_comment', entityId: cid, text: 'สวัสดีครับ', sourceLang: 'th' });
    assert.equal(calls, 1, 'unchanged text is never translated twice');

    const rows = (await pool.query('SELECT lang, body FROM board_translations WHERE entity_id = $1', [cid])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].lang, 'en');
    assert.equal(rows[0].body, '[en] สวัสดีครับ');

    // pickTranslation: cross-language viewer gets it; same-language viewer
    // and stale-source lookups get null (an edited comment must never show
    // the previous text's translation).
    const map = await snippets.translationsFor([{ entityType: 'board_comment', entityId: cid }]);
    assert.equal(snippets.pickTranslation(map, 'board_comment', cid, 'th', 'สวัสดีครับ', 'en'), '[en] สวัสดีครับ');
    assert.equal(snippets.pickTranslation(map, 'board_comment', cid, 'th', 'สวัสดีครับ', 'th'), null);
    assert.equal(snippets.pickTranslation(map, 'board_comment', cid, 'th', 'edited text', 'en'), null);

    // Edited source → one more model call, translation replaced in place.
    await snippets.ensureSnippetTranslations({ entityType: 'board_comment', entityId: cid, text: 'ขอบคุณมาก', sourceLang: 'th' });
    assert.equal(calls, 2);
    const after2 = (await pool.query(`SELECT body FROM board_translations WHERE entity_id = $1 AND lang = 'en'`, [cid])).rows;
    assert.equal(after2.length, 1);
    assert.equal(after2[0].body, '[en] ขอบคุณมาก');

    // Without an API key the feature degrades to a silent no-op.
    delete process.env.ANTHROPIC_API_KEY;
    const res = await snippets.ensureSnippetTranslations({ entityType: 'board_comment', entityId: cid, text: 'อีกครั้ง', sourceLang: 'th' });
    assert.equal(res.translated, 0);
    assert.equal(calls, 2);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    snippets._setTransport(null);
  }
});

test('board comments stamp the author language and attach viewer translations', async () => {
  const snippets = require('../src/lib/snippet-translator');
  const session = new Session(server.base);
  await session.login('admin@test.local');

  const board = await pool.query(`INSERT INTO boards (title) VALUES ('Bilingual board') RETURNING id`);
  const boardId = board.rows[0].id;

  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  // Staff write → stamped English at the route layer.
  const created = await session.fetch(`/business/boards/${boardId}/comments`, {
    method: 'POST', headers, body: JSON.stringify({ body: 'Please review the header design.' }),
  });
  assert.equal(created.status, 201);
  const adminComment = (await created.json()).comment;
  assert.equal(adminComment.source_lang, 'en');

  // A Thai customer comment with a cached English translation, seeded
  // directly: the spawned server runs WITHOUT an API key, so its own
  // translation queue is off (autoTranslate:false) and the attach path is
  // exercised against the seeded cache.
  const thc = await pool.query(
    `INSERT INTO board_comments (board_id, author_type, author_id, author_name, body, source_lang)
     VALUES ($1, 'customer', 'c9', 'Malee', 'ช่วยแก้สีพื้นหลังหน่อยค่ะ', 'th') RETURNING id`,
    [boardId]
  );
  const thId = thc.rows[0].id;
  await pool.query(
    `INSERT INTO board_translations (entity_type, entity_id, lang, body, source_hash, model)
     VALUES ('board_comment', $1, 'en', 'Please fix the background color.', $2, 'seed')`,
    [thId, snippets.sourceHash('ช่วยแก้สีพื้นหลังหน่อยค่ะ')]
  );

  const list = await session.fetch(`/business/boards/${boardId}/comments`, { headers: { accept: 'application/json' } });
  assert.equal(list.status, 200);
  const data = await list.json();
  assert.equal(data.viewerLang, 'en');
  assert.equal(data.autoTranslate, false, 'no API key in the server env → feature reports off');

  const mine = data.comments.find((c) => c.id === adminComment.id);
  assert.equal(mine.translation, null, 'same-language comments carry no translation');
  const th = data.comments.find((c) => c.id === thId);
  assert.ok(th.translation, 'cross-language comment arrives with the viewer rendering');
  assert.equal(th.translation.lang, 'en');
  assert.equal(th.translation.body, 'Please fix the background color.');
  assert.equal(th.body, 'ช่วยแก้สีพื้นหลังหน่อยค่ะ', 'original text always ships alongside');
});

test('approval notes stamp language, attach translations, and the board ships its strings', async () => {
  const snippets = require('../src/lib/snippet-translator');
  const session = new Session(server.base);
  await session.login('admin@test.local');

  const board = await pool.query(`INSERT INTO boards (title) VALUES ('Approval board') RETURNING id`);
  const boardId = board.rows[0].id;

  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  const requested = await session.fetch(`/business/boards/${boardId}/approvals`, {
    method: 'POST', headers, body: JSON.stringify({ note: 'Please approve version 2.' }),
  });
  assert.equal(requested.status, 201);
  const approval = (await requested.json()).approval;
  assert.equal(approval.request_note_lang, 'en');

  // Simulate the customer's Thai decision landing (decide is a portal
  // session flow) + a cached English rendering of it for staff.
  await pool.query(
    `UPDATE board_approvals SET status = 'needs_changes', reviewer_note = $1, reviewer_note_lang = 'th',
       decided_rendering = '{"mode":"translated","lang":"th","body_shown":"โปรดอนุมัติเวอร์ชัน 2"}'::jsonb
     WHERE id = $2`,
    ['ขอปรับสีโลโก้ให้เข้มขึ้น', approval.id]
  );
  await pool.query(
    `INSERT INTO board_translations (entity_type, entity_id, lang, body, source_hash, model)
     VALUES ('board_approval_reviewer_note', $1, 'en', 'Please make the logo color darker.', $2, 'seed')`,
    [approval.id, snippets.sourceHash('ขอปรับสีโลโก้ให้เข้มขึ้น')]
  );

  const got = await session.fetch(`/business/boards/${boardId}/approvals`, { headers: { accept: 'application/json' } });
  const gotData = await got.json();
  assert.equal(gotData.approval.reviewer_note, 'ขอปรับสีโลโก้ให้เข้มขึ้น');
  assert.equal(gotData.approval.reviewer_note_translation.body, 'Please make the logo color darker.');
  assert.equal(gotData.approval.decided_rendering.mode, 'translated');

  // The board page bootstraps the island with locale strings — no raw keys.
  const page = await session.fetch(`/business/boards/${boardId}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('__WTS_BOARD__'));
  assert.ok(html.includes('"viewerLang":"en"'));
  assert.ok(html.includes('Request approval'), 'island strings shipped');
  assert.ok(!html.includes('boards.island.'), 'no raw locale keys leak into the page');
});

// ---------------------------------------------------------------------------
// Pipeline batching (pagination) + assign-to-verifier (push side)
// ---------------------------------------------------------------------------

// Minimal drafted row straight into the pipeline (bypasses sync/AI so the
// pagination + assignment routes can be exercised deterministically).
async function seedTranslation(overrides = {}) {
  const o = {
    entity_type: 'glossary', target_language: 'la', status: 'requires_review',
    payload: { definition: 'ຄຳ ນິຍາມ ທົດ ສອບ' }, translatorId: null, charCount: 40, ...overrides,
  };
  const row = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload, translator_id, target_char_count, ai_model)
     VALUES ($1, gen_random_uuid(), $2, $3, $4::jsonb, $5, $6, $7) RETURNING id`,
    [o.entity_type, o.target_language, o.status, JSON.stringify(o.payload), o.translatorId, o.charCount, o.aiModel || null]
  );
  return row.rows[0].id;
}

test('pipeline list batches results and clamps the page to the filtered total', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');

  // Isolate from other tests' rows by asserting against a filtered view I
  // fully own: fr + requires_review. requires_review rows never carry
  // payout_ledger entries (credits happen only at publish), so clearing
  // and re-seeding them is FK-safe regardless of test order.
  const scope = `lang=fr&status=requires_review`;
  await pool.query(`DELETE FROM translations WHERE target_language = 'fr' AND status = 'requires_review'`);
  for (let i = 0; i < 55; i++) await seedTranslation({ target_language: 'fr', aiModel: 'claude-test' });

  // Page 1 at 50/page: 55 in the filtered set across 2 pages, batch 1 is 1–50.
  const p1 = await (await session.fetch(`/translations?${scope}&per_page=50&page=1`)).text();
  assert.ok(/of\s*<strong>55<\/strong>/.test(p1), 'shows the filtered total');
  assert.ok(/Showing\s*<strong>1<\/strong>[\s\S]*?<strong>50<\/strong>/.test(p1), 'first batch is 1–50');
  assert.ok(/Page\s*1\s*\/\s*2/.test(p1), 'two pages at 50/page');

  // An out-of-range page clamps to the last real page instead of empty.
  const pOver = await (await session.fetch(`/translations?${scope}&per_page=50&page=99`)).text();
  assert.ok(/Page\s*2\s*\/\s*2/.test(pOver), 'over-range page clamps to the last');
  assert.ok(/Showing\s*<strong>51<\/strong>[\s\S]*?<strong>55<\/strong>/.test(pOver), 'last batch is 51–55');

  // A larger batch size collapses it to a single page.
  const big = await (await session.fetch(`/translations?${scope}&per_page=200`)).text();
  assert.ok(/Page\s*1\s*\/\s*1/.test(big), '200/page fits all 55 on one page');

  await pool.query(`DELETE FROM translations WHERE target_language = 'fr' AND status = 'requires_review'`);
});

test('assign-verifier routes a drafted row to a verifier with the right guards', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };
  const verifierId = (await pool.query(`SELECT id FROM users WHERE email = 'verifier@test.local'`)).rows[0].id;
  const seeded = [];
  const seed = async (o) => { const id = await seedTranslation(o); seeded.push(id); return id; };

  // AI draft (no translator) → any same-language verifier may take it.
  const aiRow = await seed({ aiModel: 'claude-test' });
  const ok = await session.fetch(`/translations/${aiRow}/assign-verifier`, {
    method: 'POST', headers, body: JSON.stringify({ verifier_id: verifierId }),
  });
  assert.equal(ok.status, 200);
  const after = (await pool.query('SELECT verifier_id FROM translations WHERE id = $1', [aiRow])).rows[0];
  assert.equal(String(after.verifier_id), String(verifierId));

  // Self-verification is refused: the row's own translator can't verify it.
  const humanRow = await seed({ translatorId: verifierId });
  const selfRes = await session.fetch(`/translations/${humanRow}/assign-verifier`, {
    method: 'POST', headers, body: JSON.stringify({ verifier_id: verifierId }),
  });
  assert.equal(selfRes.status, 400);
  assert.match((await selfRes.json()).error, /own work/i);

  // Wrong language: the verifier is assigned {la}, this row is Thai.
  const thRow = await seed({ target_language: 'th' });
  const langRes = await session.fetch(`/translations/${thRow}/assign-verifier`, {
    method: 'POST', headers, body: JSON.stringify({ verifier_id: verifierId }),
  });
  assert.equal(langRes.status, 400);

  // Only a drafted (requires_review) row can be routed to a verifier.
  const publishedRow = await seed({ status: 'published' });
  const stateRes = await session.fetch(`/translations/${publishedRow}/assign-verifier`, {
    method: 'POST', headers, body: JSON.stringify({ verifier_id: verifierId }),
  });
  assert.equal(stateRes.status, 409);

  await pool.query('DELETE FROM translations WHERE id = ANY($1)', [seeded]);
});

// ---------------------------------------------------------------------------
// Glossary/SEO interlinking (internal-link SEO inside the translation flow)
// ---------------------------------------------------------------------------

test('injectTermLinks links first mentions only, in eligible text, longest term first', () => {
  const { injectTermLinks } = require('../src/lib/interlink');
  const terms = [
    { matchName: 'technical SEO', href: '/en/resources/glossary/technical-seo.html', type: 'glossary', definition: 'Deep "stuff"' },
    { matchName: 'SEO', href: '/en/resources/glossary/seo.html', type: 'seo', definition: '' },
  ].sort((a, b) => b.matchName.length - a.matchName.length);

  const html = '<h2>SEO basics</h2><p>Learn technical SEO today. SEO is not SEOULITE. ' +
    '<a href="/x">SEO inside a link</a> stays untouched.</p>';
  const out = injectTermLinks(html, terms, { lang: 'en' });

  assert.equal(out.count, 2);
  // Longest first: "technical SEO" got its own link…
  assert.ok(out.html.includes('href="/en/resources/glossary/technical-seo.html"'));
  // …and the standalone "SEO" after it got the short link (word-bounded:
  // SEOULITE untouched; heading + existing anchor untouched).
  assert.ok(/today\. <a [^>]*seo\.html[^>]*>SEO<\/a> is not SEOULITE/.test(out.html));
  assert.ok(out.html.includes('<h2>SEO basics</h2>'), 'headings are never linked');
  assert.ok(out.html.includes('>SEO inside a link</a> stays'), 'existing anchors are never re-linked');
  // Attribute context is escaped (the definition carries a double quote).
  assert.ok(out.html.includes('title="Deep &quot;stuff&quot;"'));

  // Idempotent: a second pass finds everything already inside anchors.
  const again = injectTermLinks(out.html, terms, { lang: 'en' });
  assert.equal(again.count, 0);
});

test('injectTermLinks matches Thai/Lao by substring and respects the cap', () => {
  const { injectTermLinks } = require('../src/lib/interlink');
  const terms = [
    { matchName: 'ການຕະຫຼາດ', href: '/la/resources/glossary/marketing.html', type: 'glossary', definition: '' },
    { matchName: 'ເອສອີໂອ', href: '/la/resources/glossary/seo.html', type: 'seo', definition: '' },
  ];
  const text = 'ພວກເຮົາເຮັດການຕະຫຼາດດິຈິຕອນ ແລະ ເອສອີໂອ ໃນລາວ';
  const out = injectTermLinks(text, terms, { lang: 'la' });
  assert.equal(out.count, 2, 'no-word-break scripts match by substring');
  assert.ok(out.html.includes('href="/la/resources/glossary/marketing.html"'));

  const capped = injectTermLinks(text, terms, { lang: 'la', maxLinks: 1 });
  assert.equal(capped.count, 1, 'the link budget is a hard cap');
});

test('interlink route links a Lao draft using published term names and localized URLs', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };
  const cleanup = { translations: [], glossary: [] };

  // A glossary term with a slug + its PUBLISHED Lao name.
  const g = await pool.query(
    `INSERT INTO glossary (term, definition, letter, slug)
     VALUES ('TestTerm Backlink', 'A link from one page to another.', 'T', 'testterm-backlink')
     RETURNING id`
  );
  cleanup.glossary.push(g.rows[0].id);
  const publishedName = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload)
     VALUES ('glossary', $1, 'la', 'published', '{"term":"ແບັກລິ້ງ"}'::jsonb) RETURNING id`,
    [g.rows[0].id]
  );
  cleanup.translations.push(publishedName.rows[0].id);

  // A drafted Lao article translation that mentions the term.
  const draft = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload, target_char_count)
     VALUES ('article', gen_random_uuid(), 'la', 'requires_review',
             '{"title":"ຫົວຂໍ້","content":"<p>ການສ້າງ ແບັກລິ້ງ ຊ່ວຍ SEO ຂອງທ່ານ</p>"}'::jsonb, 34)
     RETURNING id`
  );
  cleanup.translations.push(draft.rows[0].id);

  const res = await session.fetch(`/translations/${draft.rows[0].id}/interlink`, { method: 'POST', headers, body: '{}' });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.count, 1);
  assert.equal(data.linked[0].term, 'ແບັກລິ້ງ');

  const after = (await pool.query('SELECT content_payload, target_char_count FROM translations WHERE id = $1', [draft.rows[0].id])).rows[0];
  assert.ok(after.content_payload.content.includes('href="/la/resources/glossary/testterm-backlink.html"'),
    'link points at the LOCALIZED term page');
  assert.ok(after.content_payload.content.includes('class="auto-linked auto-linked-glossary"'));
  assert.equal(after.content_payload.title, 'ຫົວຂໍ້', 'short fields are never touched');
  // countChars strips tags: adding links must not change what anyone is paid.
  const core = require('../src/lib/translation-core');
  assert.equal(Number(after.target_char_count), core.countChars({ title: 'ຫົວຂໍ້', content: 'ການສ້າງ ແບັກລິ້ງ ຊ່ວຍ SEO ຂອງທ່ານ' }));

  // The term's own page never links to itself: interlink the glossary
  // row's own (drafted) translation and expect zero.
  const selfDraft = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload)
     VALUES ('glossary', $1, 'la', 'requires_review', '{"term":"ແບັກລິ້ງ","definition":"ຄຳອະທິບາຍ ແບັກລິ້ງ"}'::jsonb)
     ON CONFLICT (entity_type, entity_id, target_language) DO NOTHING
     RETURNING id`,
    [g.rows[0].id]
  );
  if (selfDraft.rows.length) {
    cleanup.translations.push(selfDraft.rows[0].id);
    const selfRes = await session.fetch(`/translations/${selfDraft.rows[0].id}/interlink`, { method: 'POST', headers, body: '{}' });
    const selfData = await selfRes.json();
    assert.equal(selfData.count, 0, 'a term page must not link to itself');
  }

  await pool.query('DELETE FROM translations WHERE id = ANY($1)', [cleanup.translations]);
  await pool.query('DELETE FROM glossary WHERE id = ANY($1)', [cleanup.glossary]);
});

// ---------------------------------------------------------------------------
// Article interlinking (one click per article + sitewide pass)
// ---------------------------------------------------------------------------

test('article interlink links glossary terms and other articles, never itself', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  const g = await pool.query(
    `INSERT INTO glossary (term, definition, letter, slug)
     VALUES ('TestTerm Anchor Text', 'The clickable words of a link.', 'T', 'testterm-anchor-text')
     RETURNING id`
  );
  const other = await pool.query(
    `INSERT INTO articles (title, slug, content, excerpt, status)
     VALUES ('TestTerm Local SEO Playbook | WordsThatSells', 'testterm-local-seo-playbook',
             '<p>Standalone piece.</p>', 'How Lao SMEs win locally.', 'published')
     RETURNING id`
  );
  const mine = await pool.query(
    `INSERT INTO articles (title, slug, content, excerpt, status)
     VALUES ('TestTerm Interlinking Guide', 'testterm-interlinking-guide',
             '<p>Good TestTerm Anchor Text improves clarity. Read the TestTerm Local SEO Playbook next. This TestTerm Interlinking Guide repeats its own name.</p>',
             null, 'published')
     RETURNING id`
  );

  try {
    const res = await session.fetch(`/content/articles/${mine.rows[0].id}/interlink`, { method: 'POST', headers, body: '{}' });
    assert.equal(res.status, 200);
    const data = await res.json();
    const linkedTerms = data.linked.map((l) => l.term);
    assert.ok(linkedTerms.includes('TestTerm Anchor Text'), 'glossary term linked');
    assert.ok(linkedTerms.includes('TestTerm Local SEO Playbook'), 'other article linked via cleaned title (brand suffix stripped)');
    assert.ok(!linkedTerms.includes('TestTerm Interlinking Guide'), 'an article never links to itself');

    const saved = (await pool.query('SELECT content FROM articles WHERE id = $1', [mine.rows[0].id])).rows[0];
    assert.ok(saved.content.includes('href="/en/resources/glossary/testterm-anchor-text.html"'));
    assert.ok(saved.content.includes('href="/en/articles/testterm-local-seo-playbook"'));

    // Sitewide pass right after: everything already linked → no new links
    // on this article (idempotent), and the endpoint reports its coverage.
    const bulk = await session.fetch('/content/articles/interlink-all', { method: 'POST', headers, body: '{}' });
    assert.equal(bulk.status, 200);
    const bulkData = await bulk.json();
    assert.ok(bulkData.articles >= 2, 'bulk pass sweeps the published set');
    const after = (await pool.query('SELECT content FROM articles WHERE id = $1', [mine.rows[0].id])).rows[0];
    const anchors = (after.content.match(/auto-linked/g) || []).length;
    assert.equal(anchors, saved.content.match(/auto-linked/g).length, 'bulk re-run adds nothing to an already-linked article');
  } finally {
    await pool.query(`DELETE FROM articles WHERE slug LIKE 'testterm-%'`);
    await pool.query('DELETE FROM glossary WHERE id = $1', [g.rows[0].id]);
  }
});

test('library sweep cross-links every content type and never re-opens paid translations', async () => {
  const core = require('../src/lib/translation-core');
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  // Term A's definition mentions term B, so the sweep must REWRITE term A
  // — which is what makes the published-translation hash refresh
  // observable (a self-mention alone is banned and changes nothing).
  const g = await pool.query(
    `INSERT INTO glossary (term, definition, letter, slug)
     VALUES ('TestTerm Meta Description', 'A TestTerm Meta Description shown in TestTerm SERP Snippet results.', 'T', 'testterm-meta-description')
     RETURNING id`
  );
  const gid = g.rows[0].id;
  const g2 = await pool.query(
    `INSERT INTO glossary (term, definition, letter, slug)
     VALUES ('TestTerm SERP Snippet', 'A TestTerm SERP Snippet is the preview a result shows.', 'T', 'testterm-serp-snippet')
     RETURNING id`
  );
  // Published Lao translation of the term — the paid work that must stay closed.
  const source = await core.fetchEntitySource('glossary', String(gid));
  const tr = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload, source_hash)
     VALUES ('glossary', $1, 'la', 'published', '{"term":"ຄຳອະທິບາຍເມຕາ"}'::jsonb, $2) RETURNING id`,
    [gid, source.hash]
  );
  const seo = await pool.query(
    `INSERT INTO seo_terms (term, definition)
     VALUES ('TestTerm Sweep SERP', 'Write a TestTerm Meta Description that earns the click.')
     RETURNING id`
  );
  const guide = await pool.query(
    `INSERT INTO guides (title, slug, short_description, long_content, status)
     VALUES ('TestTerm Guide', 'testterm-sweep-guide', 'Covers the TestTerm Meta Description basics.', '<p>Long form.</p>', 'published')
     RETURNING id`
  );
  const product = await pool.query(
    `INSERT INTO products (name, description, status)
     VALUES ('TestTerm Product', 'Includes a TestTerm Meta Description audit.', 'active')
     RETURNING id`
  );

  try {
    const res = await session.fetch('/content/interlink-library', { method: 'POST', headers, body: '{}' });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.totals.links >= 3, 'seo_term, guide and product each link the glossary term');

    const termHref = 'href="/en/resources/glossary/testterm-meta-description.html"';
    const seoAfter = (await pool.query('SELECT definition FROM seo_terms WHERE id = $1', [seo.rows[0].id])).rows[0];
    const guideAfter = (await pool.query('SELECT short_description FROM guides WHERE id = $1', [guide.rows[0].id])).rows[0];
    const productAfter = (await pool.query('SELECT description FROM products WHERE id = $1', [product.rows[0].id])).rows[0];
    assert.ok(seoAfter.definition.includes(termHref), 'SEO term definition links the glossary page');
    assert.ok(guideAfter.short_description.includes(termHref), 'guide links the glossary page');
    assert.ok(productAfter.description.includes(termHref), 'product links the glossary page');

    // Term A was rewritten (link to term B injected), never to itself.
    assert.ok(data.byType.glossary.updated >= 1, 'the glossary sweep rewrote at least term A');
    const gAfter = (await pool.query('SELECT definition FROM glossary WHERE id = $1', [gid])).rows[0];
    assert.ok(!gAfter.definition.includes(termHref), 'a term never links to its own page');
    assert.ok(gAfter.definition.includes('href="/en/resources/glossary/testterm-serp-snippet.html"'),
      'term A links term B');
    const g2After = (await pool.query('SELECT definition FROM glossary WHERE id = $1', [g2.rows[0].id])).rows[0];
    assert.ok(!g2After.definition.includes('testterm-serp-snippet.html'), 'term B never links itself either');

    // Money-safety, exercised for real: term A's source text CHANGED, so
    // its hash moved — and the published Lao row must carry the NEW hash
    // (refreshed inside the sweep), or the next sync would flip paid work
    // back to pending.
    const freshSource = await core.fetchEntitySource('glossary', String(gid));
    assert.notEqual(freshSource.hash, source.hash, 'linking changed the source hash');
    const trAfter = (await pool.query('SELECT source_hash FROM translations WHERE id = $1', [tr.rows[0].id])).rows[0];
    assert.equal(trAfter.source_hash, freshSource.hash, 'published translation hash refreshed with the linked source');
  } finally {
    await pool.query('DELETE FROM translations WHERE id = $1', [tr.rows[0].id]);
    await pool.query(`DELETE FROM seo_terms WHERE term = 'TestTerm Sweep SERP'`);
    await pool.query(`DELETE FROM guides WHERE slug = 'testterm-sweep-guide'`);
    await pool.query(`DELETE FROM products WHERE name = 'TestTerm Product'`);
    await pool.query('DELETE FROM glossary WHERE id = ANY($1)', [[gid, g2.rows[0].id]]);
  }
});

// ---------------------------------------------------------------------------
// Assessment-report fixes: titles, paging, seeding, invites, payout guard
// ---------------------------------------------------------------------------

test('pipeline list shows content titles and the workspace pages both queues', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');

  const list = await session.fetch('/translations?entity_type=glossary');
  assert.equal(list.status, 200);
  const html = await list.text();
  assert.ok(html.includes('TestTerm SEO'), 'rows are labelled with the content title, not id fragments');

  // Queue paging params are accepted and clamped (a huge page lands on the
  // last real one instead of an empty screen).
  const ws = await session.fetch('/translations/workspace?tpage=999&vpage=999&per=50');
  assert.equal(ws.status, 200);
  const wsHtml = await ws.text();
  assert.ok(wsHtml.includes('all languages'), 'admins see "all languages", never "none assigned yet"');
  assert.ok(!wsHtml.includes('none assigned yet'));
});

test('seed-defaults endpoint fills rate gaps idempotently', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  const first = await session.fetch('/translations/payouts/seed-defaults', { method: 'POST', headers, body: '{}' });
  assert.equal(first.status, 200);
  const firstData = await first.json();
  assert.ok(firstData.success);

  const verificationLa = await pool.query(
    `SELECT 1 FROM payout_rates WHERE work_type = 'verification' AND target_language = 'la'
       AND translator_id IS NULL AND is_active = TRUE`
  );
  assert.ok(verificationLa.rows.length >= 1, 'global Lao verification rate exists after seeding');
  const cascade = await pool.query(
    `SELECT 1 FROM comp_rates WHERE work_type = 'cascade_share' AND user_id IS NULL AND is_active = TRUE`
  );
  assert.ok(cascade.rows.length >= 1, 'work-unit defaults seeded too');

  const second = await session.fetch('/translations/payouts/seed-defaults', { method: 'POST', headers, body: '{}' });
  const secondData = await second.json();
  assert.equal(secondData.created, 0, 'second run adds nothing — never overwrites');
});

test('vendor invite creates a worker with a set-password link; duplicates are refused', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  try {
    const res = await session.fetch('/translations/vendors/invite', {
      method: 'POST', headers,
      body: JSON.stringify({ email: 'invитee@test.local'.replace('ит', 'it'), first_name: 'Noy', assigned_languages: ['la', 'xx'], position: 'content_verifier' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.inviteLink.includes('/auth/reset-password/'), 'invite link rides the existing reset flow');

    const created = (await pool.query(`SELECT role, is_vendor, assigned_languages, position, reset_token FROM users WHERE email = 'invitee@test.local'`)).rows[0];
    assert.equal(created.role, 'translator', 'invites can never mint admins');
    assert.equal(created.is_vendor, true);
    assert.deepEqual(created.assigned_languages, ['la'], 'unknown languages are dropped');
    assert.equal(created.position, 'content_verifier');
    assert.ok(created.reset_token, 'set-password token stored');

    const dup = await session.fetch('/translations/vendors/invite', {
      method: 'POST', headers, body: JSON.stringify({ email: 'invitee@test.local' }),
    });
    assert.equal(dup.status, 409);

    const bad = await session.fetch('/translations/vendors/invite', {
      method: 'POST', headers, body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(bad.status, 400);
  } finally {
    await pool.query(`DELETE FROM users WHERE email = 'invitee@test.local'`);
  }
});

test('publishing vendor work without a rate requires explicit acknowledgement', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };
  const hash = await require('bcryptjs').hash('Password123!', 10);

  // A French vendor with NO rate card of any kind. Upserted (and kept)
  // like the suite's other seed users: the publish notification below
  // references the account, so it can't be deleted afterwards.
  const vendor = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, role, assigned_languages, is_vendor)
     VALUES ('norate@test.local', $1, 'Claire', 'translator', '{fr}', TRUE)
     ON CONFLICT (email) DO UPDATE
       SET role = 'translator', assigned_languages = '{fr}', is_vendor = TRUE
     RETURNING id`,
    [hash]
  );
  // No leftover per-vendor rate cards from earlier runs.
  await pool.query(`DELETE FROM payout_rates WHERE translator_id = $1`, [vendor.rows[0].id]);
  // Earlier tests may have created blanket (any-language) translation
  // rates that would legitimately cover Claire — park them so "no
  // applicable rate" is actually true, and restore them afterwards.
  const parked = await pool.query(
    `UPDATE payout_rates SET is_active = FALSE
     WHERE translator_id IS NULL
       AND (target_language IS NULL OR target_language = 'fr')
       AND work_type = 'translation' AND is_active = TRUE
     RETURNING id`
  );
  const row = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, status, translator_id, content_payload, target_char_count)
     VALUES ('article', gen_random_uuid(), 'fr', 'requires_review', $1, '{"title":"Essai"}'::jsonb, 5)
     RETURNING id`,
    [vendor.rows[0].id]
  );

  try {
    const blocked = await session.fetch(`/translations/${row.rows[0].id}/approve`, { method: 'POST', headers, body: '{}' });
    assert.equal(blocked.status, 409, 'publish stops when a credit would silently skip');
    const blockedData = await blocked.json();
    assert.ok(blockedData.requiresAcknowledgement);
    assert.match(blockedData.warnings[0], /No translation rate for Claire/);

    const stillDraft = (await pool.query('SELECT status FROM translations WHERE id = $1', [row.rows[0].id])).rows[0];
    assert.equal(stillDraft.status, 'requires_review', 'nothing was published by the refusal');

    const acknowledged = await session.fetch(`/translations/${row.rows[0].id}/approve`, {
      method: 'POST', headers, body: JSON.stringify({ acknowledge_no_payout: true }),
    });
    assert.equal(acknowledged.status, 200);
    const ackData = await acknowledged.json();
    assert.equal(ackData.payout, null, 'published with no credit, exactly as acknowledged');
  } finally {
    await pool.query('DELETE FROM translations WHERE id = $1', [row.rows[0].id]);
    if (parked.rows.length) {
      await pool.query(`UPDATE payout_rates SET is_active = TRUE WHERE id = ANY($1)`, [parked.rows.map((r) => r.id)]);
    }
  }
});

// ---------------------------------------------------------------------------
// Editor quality pack: termbase, pre-publish gate, reason codes, dashboard
// ---------------------------------------------------------------------------

test('termbase and the pre-publish gate enforce approved term names', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };
  const cleanup = { translations: [], glossary: [], articles: [] };

  try {
    // A glossary term with a published Lao name, and an article that
    // mentions the term in its content.
    const g = await pool.query(
      `INSERT INTO glossary (term, definition, letter, slug)
       VALUES ('TestTerm Crawler', 'A bot that reads pages.', 'T', 'testterm-crawler') RETURNING id`
    );
    cleanup.glossary.push(g.rows[0].id);
    const gName = await pool.query(
      `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload)
       VALUES ('glossary', $1, 'la', 'published', '{"term":"ຄຣໍເລີທົດສອບ"}'::jsonb) RETURNING id`,
      [g.rows[0].id]
    );
    cleanup.translations.push(gName.rows[0].id);

    const article = await pool.query(
      `INSERT INTO articles (title, slug, content, excerpt, status)
       VALUES ('TestTerm Gate Article', 'testterm-gate-article',
               '<p>Every TestTerm Crawler visits your site.</p>', 'About the TestTerm Crawler.', 'published')
       RETURNING id`
    );
    cleanup.articles.push(article.rows[0].id);

    // Draft translation: content identical to source (untranslated), excerpt
    // empty, and the approved Lao term name unused.
    const draft = await pool.query(
      `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload, ai_model)
       VALUES ('article', $1, 'la', 'requires_review',
               '{"title":"ບົດຄວາມ","content":"<p>Every TestTerm Crawler visits your site.</p>","excerpt":""}'::jsonb,
               'test-model')
       RETURNING id`,
      [article.rows[0].id]
    );
    cleanup.translations.push(draft.rows[0].id);

    // Termbase endpoint lists the term with its approved name, not yet used.
    const tb = await session.fetch(`/translations/verify/${draft.rows[0].id}/termbase`, { headers: { accept: 'application/json' } });
    assert.equal(tb.status, 200);
    const tbData = await tb.json();
    const entry = tbData.terms.find((t) => t.name === 'TestTerm Crawler');
    assert.ok(entry, 'source mentions the term, so the termbase lists it');
    assert.equal(entry.approved, 'ຄຣໍເລີທົດສອບ');
    assert.equal(entry.present, false, 'approved name not used yet');

    // The gate refuses with the exact problems…
    const blocked = await session.fetch(`/translations/${draft.rows[0].id}/approve`, { method: 'POST', headers, body: '{}' });
    assert.equal(blocked.status, 409);
    const blockedData = await blocked.json();
    assert.ok(blockedData.requiresAcknowledgement);
    const joined = blockedData.warnings.join(' | ');
    assert.match(joined, /"excerpt" is empty/);
    assert.match(joined, /identical to the English source/);
    assert.match(joined, /approved .*name "ຄຣໍເລີທົດສອບ" is not used/);

    // …and publishes once the reviewer explicitly acknowledges.
    const acked = await session.fetch(`/translations/${draft.rows[0].id}/approve`, {
      method: 'POST', headers, body: JSON.stringify({ acknowledge: true }),
    });
    assert.equal(acked.status, 200);
    const status = (await pool.query('SELECT status FROM translations WHERE id = $1', [draft.rows[0].id])).rows[0];
    assert.equal(status.status, 'published');
  } finally {
    await pool.query('DELETE FROM translations WHERE id = ANY($1)', [cleanup.translations]);
    await pool.query('DELETE FROM articles WHERE id = ANY($1)', [cleanup.articles]);
    await pool.query('DELETE FROM glossary WHERE id = ANY($1)', [cleanup.glossary]);
  }
});

test('reject stores the structured reason code and the dashboard strip renders', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');
  const headers = { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': token };

  const row = await pool.query(
    `INSERT INTO translations (entity_type, entity_id, target_language, status, content_payload)
     VALUES ('article', gen_random_uuid(), 'th', 'requires_review', '{"title":"x"}'::jsonb) RETURNING id`
  );
  try {
    const res = await session.fetch(`/translations/${row.rows[0].id}/reject`, {
      method: 'POST', headers, body: JSON.stringify({ note: 'wrong register', reason: 'tone' }),
    });
    assert.equal(res.status, 200);
    const saved = (await pool.query('SELECT review_note FROM translations WHERE id = $1', [row.rows[0].id])).rows[0];
    assert.equal(saved.review_note, '[tone] wrong register', 'reason code prefixes the note for analytics');

    const page = await session.fetch('/translations');
    const html = await page.text();
    assert.ok(html.includes('% <span'), 'per-language progress strip renders');
    assert.ok(html.includes('live ·'), 'per-language counters render');
    assert.ok(html.includes('bulkBar'), 'bulk actions bar ships');
  } finally {
    await pool.query('DELETE FROM translations WHERE id = $1', [row.rows[0].id]);
  }
});
