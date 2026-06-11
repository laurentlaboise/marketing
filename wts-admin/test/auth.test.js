const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Session } = require('./helpers');

const PORT = 3201;
let server;

before(async () => {
  server = await startServer(PORT);
});

after(async () => {
  if (server) await server.stop();
});

test('login page renders with a CSRF token', async () => {
  const session = new Session(server.base);
  const token = await session.getCsrfToken('/auth/login');
  assert.equal(token.length, 64);
});

test('login without CSRF token is rejected with 403', async () => {
  const session = new Session(server.base);
  await session.fetch('/auth/login'); // establish session
  const res = await session.fetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'admin@test.local', password: 'Password123!' }).toString(),
  });
  assert.equal(res.status, 403);
});

test('login with valid credentials and CSRF token redirects to dashboard', async () => {
  const session = new Session(server.base);
  const res = await session.login('admin@test.local');
  assert.equal(res.status, 302);
});

test('login with wrong password re-renders the form with an error', async () => {
  const session = new Session(server.base);
  const token = await session.getCsrfToken('/auth/login');
  const res = await session.fetch('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'admin@test.local', password: 'wrong-password', _csrf: token }).toString(),
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Invalid email or password/);
});

test('signup is disabled by default', async () => {
  const session = new Session(server.base);
  const getRes = await session.fetch('/auth/signup');
  assert.equal(getRes.status, 302);
  assert.match(getRes.headers.get('location'), /signup_disabled/);

  const token = await session.getCsrfToken('/auth/login');
  const postRes = await session.fetch('/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email: 'evil@test.local', password: 'longpassword',
      firstName: 'E', lastName: 'V', _csrf: token,
    }).toString(),
  });
  assert.equal(postRes.status, 302);
  assert.match(postRes.headers.get('location'), /signup_disabled/);
});

test('unauthenticated requests are redirected to login (HTML) or get 401 (API)', async () => {
  const anon = new Session(server.base);
  const htmlRes = await anon.fetch('/content/articles');
  assert.equal(htmlRes.status, 302);
  assert.match(htmlRes.headers.get('location'), /\/auth\/login/);

  const apiRes = await anon.fetch('/api/stats');
  assert.equal(apiRes.status, 401);
});

test('role "user" cannot reach any admin surface', async () => {
  const session = new Session(server.base);
  await session.login('user@test.local');

  for (const route of ['/content/articles', '/business/products', '/webdev/microsites', '/images/']) {
    const res = await session.fetch(route);
    assert.equal(res.status, 302, `${route} should redirect non-admins`);
    assert.match(res.headers.get('location'), /\/dashboard/, `${route} should redirect to /dashboard`);
  }

  for (const route of ['/api/stats', '/api/export/articles', '/api/activity']) {
    const res = await session.fetch(route);
    assert.equal(res.status, 403, `${route} should return 403 for non-admins`);
  }

  const token = await session.getCsrfToken('/dashboard');
  const bulkRes = await session.fetch('/api/bulk/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ type: 'articles', ids: ['00000000-0000-0000-0000-000000000000'] }),
  });
  assert.equal(bulkRes.status, 403);
});

test('role "user" dashboard shows the restricted notice, not stats', async () => {
  const session = new Session(server.base);
  await session.login('user@test.local');
  const res = await session.fetch('/dashboard');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /does not have admin access/);
});

test('admin can reach admin surfaces and mutate with a CSRF token', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');

  for (const route of ['/content/articles', '/business/products', '/api/stats']) {
    const res = await session.fetch(route);
    assert.equal(res.status, 200, `${route} should be 200 for admin`);
  }

  const token = await session.getCsrfToken('/dashboard');
  const withToken = await session.fetch('/api/bulk/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ type: 'articles', ids: ['00000000-0000-0000-0000-000000000000'] }),
  });
  assert.equal(withToken.status, 200);

  const withoutToken = await session.fetch('/api/bulk/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'articles', ids: ['00000000-0000-0000-0000-000000000000'] }),
  });
  assert.equal(withoutToken.status, 403);
});

test('export of a non-allow-listed table returns 400', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const res = await session.fetch('/api/export/users');
  assert.equal(res.status, 400);
});
