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
  await pool.query('TRUNCATE payout_ledger, payout_requests, payout_rates, translations, comp_rates, leads, engagement_logs');
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
    method: 'POST', headers: aHeaders, body: JSON.stringify({}),
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
  await admin.fetch(`/translations/${rowId}/approve`, { method: 'POST', headers: aHeaders, body: JSON.stringify({}) });
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
    method: 'POST', headers: aHeaders, body: JSON.stringify({}),
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
  const list = await session.fetch('/translations?entity_type=page');
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
