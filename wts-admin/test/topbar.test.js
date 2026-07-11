// Enhanced top bar: grouped global search, notification grouping data,
// and the video call invite button.
//
// Scope note (mirrors the implementation): /api/search and
// /api/call-invite live in src/routes/quick.js, mounted at /api BEFORE
// the ensureAdmin-guarded /api mount (server.js), so every authenticated
// role can reach them. Search is role-scoped server-side: admins get all
// four groups; workers get ONLY the Translations rows they are involved
// in (translator/verifier) or can claim (unclaimed requires_review in an
// assigned language). Every other /api path falls through to the admin
// router and stays admin-only.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { startServer, Session, TEST_DB_URL } = require('./helpers');

const PORT = 3212;
const MARKER = 'zqtopbarzq'; // unique fixture token, matched case-insensitively
const WORKER_EMAIL = 'worker-topbar@test.local';
let server;
let pool;
let workerId;

async function cleanupFixtures() {
  // translations reference the fixture article by entity_id, so remove
  // them first via the marker-titled articles.
  await pool.query(
    `DELETE FROM translations WHERE entity_id IN (SELECT id FROM articles WHERE title ILIKE $1)`,
    [`%${MARKER}%`]
  );
  await pool.query(`DELETE FROM articles WHERE title ILIKE $1`, [`%${MARKER}%`]);
  await pool.query(`DELETE FROM glossary WHERE term ILIKE $1`, [`%${MARKER}%`]);
  await pool.query(`DELETE FROM form_submissions WHERE name ILIKE $1`, [`%${MARKER}%`]);
  await pool.query(`DELETE FROM leads WHERE name ILIKE $1`, [`%${MARKER}%`]);
}

before(async () => {
  server = await startServer(PORT);
  pool = new Pool({ connectionString: TEST_DB_URL });

  // Lao vendor-translator — the "worker" for the scoping tests. Same
  // upsert shape translations.test.js uses (dedicated email so the two
  // suites never fight over one account).
  const hash = await bcrypt.hash('Password123!', 10);
  const worker = await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, assigned_languages, is_vendor)
     VALUES ($1, $2, 'Noy', 'Topbar', 'translator', '{la}', TRUE)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = $2, role = 'translator', assigned_languages = '{la}', is_vendor = TRUE
     RETURNING id`,
    [WORKER_EMAIL, hash]
  );
  workerId = worker.rows[0].id;

  await cleanupFixtures(); // a previously interrupted run may have left rows
});

after(async () => {
  if (pool) await pool.end();
  if (server) await server.stop();
});

test('search requires authentication (anonymous gets 401)', async () => {
  const anon = new Session(server.base);
  const res = await anon.fetch(`/api/search?q=${MARKER}`);
  assert.equal(res.status, 401);
});

test('search query shorter than 2 chars returns empty groups', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const res = await session.fetch('/api/search?q=z');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.deepEqual(data.groups, []);
});

test('search clamps overlong queries instead of erroring', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const res = await session.fetch(`/api/search?q=${'z'.repeat(150)}`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.groups));
});

test('search returns grouped results for seeded content, translation, submission and lead', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');

  try {
    const article = await pool.query(
      `INSERT INTO articles (title, slug, status)
       VALUES ($1, $2, 'published') RETURNING id`,
      [`ZqTopbarZq Article Alpha`, `${MARKER}-article-${Date.now()}`]
    );
    const articleId = article.rows[0].id;

    const gloss = await pool.query(
      `INSERT INTO glossary (term, definition)
       VALUES ($1, 'Fixture definition for the top bar search test') RETURNING id`,
      [`ZqTopbarZq Term`]
    );
    const glossId = gloss.rows[0].id;

    const translation = await pool.query(
      `INSERT INTO translations (entity_type, entity_id, target_language, status)
       VALUES ('article', $1, 'th', 'pending') RETURNING id`,
      [articleId]
    );
    const translationId = translation.rows[0].id;

    await pool.query(
      `INSERT INTO form_submissions (form_type, name, email)
       VALUES ('consultation', 'ZqTopbarZq Submitter', $1)`,
      [`${MARKER}@test.local`]
    );

    await pool.query(
      `INSERT INTO leads (name, company, status)
       VALUES ('ZqTopbarZq Lead', 'ZqTopbarZq Co', 'new')`
    );

    const res = await session.fetch(`/api/search?q=${MARKER}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.groups));

    const byLabel = Object.fromEntries(data.groups.map((g) => [g.label, g.items]));

    // Content group: the seeded article and glossary term, linking to
    // their edit pages.
    assert.ok(byLabel['Content'], 'Content group missing');
    assert.ok(byLabel['Content'].length <= 5);
    const articleItem = byLabel['Content'].find((i) => i.title === 'ZqTopbarZq Article Alpha');
    assert.ok(articleItem, 'seeded article missing from Content group');
    assert.equal(articleItem.href, `/content/articles/${articleId}/edit`);
    const glossItem = byLabel['Content'].find((i) => i.title === 'ZqTopbarZq Term');
    assert.ok(glossItem, 'seeded glossary term missing from Content group');
    assert.equal(glossItem.href, `/content/glossary/${glossId}/edit`);

    // Translations group: entity title resolved through the article join,
    // linking to the review page.
    assert.ok(byLabel['Translations'], 'Translations group missing');
    const trItem = byLabel['Translations'].find((i) => i.href === `/translations/review/${translationId}`);
    assert.ok(trItem, 'seeded translation missing from Translations group');
    assert.equal(trItem.title, 'ZqTopbarZq Article Alpha');
    assert.match(trItem.meta, /article → th/);

    // Form submissions group.
    assert.ok(byLabel['Form Submissions'], 'Form Submissions group missing');
    const subItem = byLabel['Form Submissions'].find((i) => i.title === 'ZqTopbarZq Submitter');
    assert.ok(subItem, 'seeded submission missing');
    assert.equal(subItem.href, '/webdev/submissions');

    // Leads group.
    assert.ok(byLabel['Leads'], 'Leads group missing');
    const leadItem = byLabel['Leads'].find((i) => i.title === 'ZqTopbarZq Lead');
    assert.ok(leadItem, 'seeded lead missing');
    assert.equal(leadItem.href, '/workforce/leads');

    // Item shape contract used by the dropdown renderer.
    for (const group of data.groups) {
      for (const item of group.items) {
        assert.equal(typeof item.title, 'string');
        assert.equal(typeof item.meta, 'string');
        assert.match(item.href, /^\//);
      }
    }
  } finally {
    await cleanupFixtures();
  }
});

test('worker search returns ONLY their scoped Translations group', async () => {
  const session = new Session(server.base);
  await session.login(WORKER_EMAIL);

  try {
    // Two marker-titled articles: an admin search would list both in a
    // Content group — the worker must see neither there.
    const mineArticle = await pool.query(
      `INSERT INTO articles (title, slug, status) VALUES ($1, $2, 'published') RETURNING id`,
      ['ZqTopbarZq Worker Mine', `${MARKER}-worker-mine-${Date.now()}`]
    );
    const otherArticle = await pool.query(
      `INSERT INTO articles (title, slug, status) VALUES ($1, $2, 'published') RETURNING id`,
      ['ZqTopbarZq Worker Other', `${MARKER}-worker-other-${Date.now()}`]
    );

    // Assigned to the worker → linked to the workspace editor.
    const assignedRow = await pool.query(
      `INSERT INTO translations (entity_type, entity_id, target_language, status, translator_id)
       VALUES ('article', $1, 'la', 'translating', $2) RETURNING id`,
      [mineArticle.rows[0].id, workerId]
    );
    // Claimable: unclaimed requires_review in an assigned language →
    // linked to the verify editor.
    const claimableRow = await pool.query(
      `INSERT INTO translations (entity_type, entity_id, target_language, status)
       VALUES ('article', $1, 'la', 'requires_review') RETURNING id`,
      [otherArticle.rows[0].id]
    );
    // Unrelated: no involvement, unassigned language → must not appear.
    const unrelatedRow = await pool.query(
      `INSERT INTO translations (entity_type, entity_id, target_language, status)
       VALUES ('article', $1, 'th', 'pending') RETURNING id`,
      [otherArticle.rows[0].id]
    );

    const res = await session.fetch(`/api/search?q=${MARKER}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // ONLY the scoped Translations group — no Content group despite the
    // two marker-titled articles.
    assert.deepEqual(data.groups.map((g) => g.label), ['Translations']);
    const items = data.groups[0].items;
    assert.ok(items.length <= 8);

    const assignedItem = items.find((i) => i.href === `/translations/workspace/${assignedRow.rows[0].id}`);
    assert.ok(assignedItem, 'assigned translation missing (workspace editor link)');
    assert.equal(assignedItem.title, 'ZqTopbarZq Worker Mine');
    assert.match(assignedItem.meta, /article → la/);

    const claimableItem = items.find((i) => i.href === `/translations/verify/${claimableRow.rows[0].id}`);
    assert.ok(claimableItem, 'claimable requires_review translation missing (verify link)');
    assert.equal(claimableItem.title, 'ZqTopbarZq Worker Other');

    assert.ok(
      !items.some((i) => i.href.includes(unrelatedRow.rows[0].id)),
      'unrelated translation must not appear for the worker'
    );

    // Item shape contract used by the dropdown renderer.
    for (const item of items) {
      assert.equal(typeof item.title, 'string');
      assert.equal(typeof item.meta, 'string');
      assert.match(item.href, /^\//);
    }
  } finally {
    await cleanupFixtures();
  }
});

test('plain role "user" gets 200 with empty groups (nothing leaks)', async () => {
  const session = new Session(server.base);
  await session.login('user@test.local');

  try {
    // Fixtures an admin search WOULD return — the plain user has no
    // translation involvement, so their scoped search returns nothing.
    await pool.query(
      `INSERT INTO articles (title, slug, status) VALUES ($1, $2, 'published')`,
      ['ZqTopbarZq Plain Article', `${MARKER}-plain-${Date.now()}`]
    );
    await pool.query(
      `INSERT INTO leads (name, company, status) VALUES ('ZqTopbarZq Plain Lead', 'ZqTopbarZq Co', 'new')`
    );

    const res = await session.fetch(`/api/search?q=${MARKER}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.deepEqual(data.groups, []);
  } finally {
    await cleanupFixtures();
  }
});

test('fall-through intact: /api/stats stays admin-only while /api/search opens up', async () => {
  const admin = new Session(server.base);
  await admin.login('admin@test.local');
  assert.equal((await admin.fetch('/api/stats')).status, 200, 'admin still reaches /api/stats');

  // Same worker session: 200 on the quick route, 403 on an admin route —
  // proof the quick router passes unmatched /api paths through to the
  // ensureAdmin-guarded mount.
  const worker = new Session(server.base);
  await worker.login(WORKER_EMAIL);
  assert.equal((await worker.fetch(`/api/search?q=${MARKER}`)).status, 200, 'worker reaches /api/search');
  assert.equal((await worker.fetch('/api/stats')).status, 403, 'worker must not reach admin /api routes');

  const user = new Session(server.base);
  await user.login('user@test.local');
  assert.equal((await user.fetch('/api/stats')).status, 403, 'role user must not reach admin /api routes');
});

test('call-invite returns a meet.jit.si room URL and notifies super admins', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const token = await session.getCsrfToken('/dashboard');

  let roomUrl;
  try {
    const res = await session.fetch('/api/call-invite', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.match(data.roomUrl, /^https:\/\/meet\.jit\.si\/wts-call-[0-9a-f]{12}$/);
    roomUrl = data.roomUrl;

    const notif = await pool.query(
      `SELECT n.title, n.message, u.email
         FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE n.link = $1`,
      [roomUrl]
    );
    assert.ok(notif.rows.length >= 1, 'no notification row created for the call');
    assert.ok(
      notif.rows.some((r) => r.email === 'admin@test.local'),
      'seeded admin did not receive the call notification'
    );
    assert.match(notif.rows[0].title, /started a video call/);
    assert.ok(notif.rows[0].message.includes('Admin Test'), 'notification message should name the caller');
    assert.ok(notif.rows[0].message.includes(roomUrl), 'notification message should carry the join link');
  } finally {
    if (roomUrl) {
      await pool.query('DELETE FROM notifications WHERE link = $1', [roomUrl]);
    }
  }
});

test('call-invite works for a worker and names the caller in the notification', async () => {
  const session = new Session(server.base);
  await session.login(WORKER_EMAIL);
  // Worker dashboards redirect to the workspace; grab the CSRF token there.
  const token = await session.getCsrfToken('/translations/workspace');

  let roomUrl;
  try {
    const res = await session.fetch('/api/call-invite', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.match(data.roomUrl, /^https:\/\/meet\.jit\.si\/wts-call-[0-9a-f]{12}$/);
    roomUrl = data.roomUrl;

    const notif = await pool.query(
      `SELECT n.title, n.message, u.email
         FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE n.link = $1`,
      [roomUrl]
    );
    assert.ok(notif.rows.length >= 1, 'no notification row created for the worker call');
    assert.ok(
      notif.rows.some((r) => r.email === 'admin@test.local'),
      'coordinators (admins) should receive the worker call notification'
    );
    assert.match(notif.rows[0].title, /Noy Topbar started a video call/);
    assert.ok(notif.rows[0].message.includes('Noy Topbar'), 'notification message should name the calling worker');
    assert.ok(notif.rows[0].message.includes(roomUrl), 'notification message should carry the join link');
  } finally {
    if (roomUrl) {
      await pool.query('DELETE FROM notifications WHERE link = $1', [roomUrl]);
    }
  }
});

test('call-invite without a CSRF token is rejected with 403', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const res = await session.fetch('/api/call-invite', { method: 'POST' });
  assert.equal(res.status, 403);
});

test('call-invite requires authentication', async () => {
  const anon = new Session(server.base);
  const token = await anon.getCsrfToken('/auth/login');
  const res = await anon.fetch('/api/call-invite', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
  });
  assert.equal(res.status, 401);
});

test('header renders search box and call button for admins', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const res = await session.fetch('/dashboard');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /id="globalSearch"/);
  assert.match(html, /id="searchResults"/);
  assert.match(html, /placeholder="Search\.\.\."/);
  assert.match(html, /id="startCallBtn"/);
  assert.match(html, /Start a video call — coordinators are notified with the join link/);
  assert.match(html, /id="notificationsBtn"/);
});

test('header shows search box and call button for workers (scoped placeholder)', async () => {
  const session = new Session(server.base);
  await session.login(WORKER_EMAIL);
  // /dashboard redirects translators to their workspace, which renders
  // the same header partial.
  const res = await session.fetch('/translations/workspace');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /id="globalSearch"/);
  assert.match(html, /id="searchResults"/);
  assert.match(html, /placeholder="Search my work\.\.\."/);
  assert.match(html, /id="startCallBtn"/);
  assert.match(html, /id="notificationsBtn"/);
});

test('header shows search box and call button for plain users too', async () => {
  const session = new Session(server.base);
  await session.login('user@test.local');
  const res = await session.fetch('/dashboard');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /id="globalSearch"/);
  assert.match(html, /placeholder="Search my work\.\.\."/);
  assert.match(html, /id="startCallBtn"/);
  assert.match(html, /id="notificationsBtn"/); // bell stays for everyone
});
