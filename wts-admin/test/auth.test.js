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

// ---------------------------------------------------------------------------
// Social sign-in wiring + remember-me
// ---------------------------------------------------------------------------

test('social sign-in: hidden and guarded when unconfigured, live links when configured', async () => {
  // This file's server booted WITHOUT OAuth credentials: the login page
  // offers no social buttons (no dead decoration) and the routes bounce
  // back with a friendly message instead of crashing on an unregistered
  // passport strategy.
  const session = new Session(server.base);
  const page = await session.fetch('/auth/login');
  const html = await page.text();
  assert.ok(!html.includes('social-btn'), 'no social buttons render without credentials');
  const bounce = await session.fetch('/auth/google');
  assert.equal(bounce.status, 302);
  assert.match(bounce.headers.get('location'), /error=google_not_configured/);
  const fbBounce = await session.fetch('/auth/facebook');
  assert.match(fbBounce.headers.get('location'), /error=facebook_not_configured/);
  const withError = await session.fetch('/auth/login?error=google_not_configured');
  assert.match(await withError.text(), /not configured on this server/);

  // A server WITH credentials renders the buttons as real links that hand
  // off to the provider's consent screen.
  const oauthServer = await startServer(3209, {
    GOOGLE_CLIENT_ID: 'test-google-id',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    FACEBOOK_APP_ID: 'test-fb-id',
    FACEBOOK_APP_SECRET: 'test-fb-secret',
  });
  try {
    const s2 = new Session(oauthServer.base);
    const page2 = await s2.fetch('/auth/login');
    const html2 = await page2.text();
    assert.ok(html2.includes('href="/auth/google"'), 'Google button is a real link');
    assert.ok(html2.includes('href="/auth/facebook"'), 'Facebook button is a real link');
    const g = await s2.fetch('/auth/google');
    assert.equal(g.status, 302);
    assert.match(g.headers.get('location'), /accounts\.google\.com/, 'Google hand-off starts');
    const f = await s2.fetch('/auth/facebook');
    assert.equal(f.status, 302);
    assert.match(f.headers.get('location'), /facebook\.com/, 'Facebook hand-off starts');
  } finally {
    await oauthServer.stop();
  }
});

test('remember me stretches the session to ~30 days; default stays short', async () => {
  async function sessionExpiry(remember) {
    const s = new Session(server.base);
    const token = await s.getCsrfToken('/auth/login');
    const body = { email: 'admin@test.local', password: 'Password123!', _csrf: token };
    if (remember) body.remember = 'on';
    const res = await s.fetch('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    assert.equal(res.status, 302);
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const sid = cookies.find((c) => /Expires=/i.test(c));
    assert.ok(sid, 'login response sets the session cookie');
    return new Date(sid.match(/Expires=([^;]+)/i)[1]).getTime() - Date.now();
  }
  const day = 24 * 60 * 60 * 1000;
  const shortLived = await sessionExpiry(false);
  assert.ok(shortLived < 2 * day, 'default session stays at the 24h server default');
  const longLived = await sessionExpiry(true);
  assert.ok(longLived > 20 * day, 'remember-me session lives ~30 days');
});

test('sidebar ships the three-zone architecture, icon rail and mobile dock', async () => {
  const session = new Session(server.base);
  await session.login('admin@test.local');
  const html = await (await session.fetch('/dashboard')).text();

  // Zones: pinned Workspace, one Operate accordion, collapsed Utility.
  assert.ok(html.includes('nav-zone-label'), 'zone labels render');
  assert.match(html, />Workspace</);
  assert.match(html, />Operate</);
  for (const group of ['content', 'localization', 'workforce', 'commerce', 'web']) {
    assert.ok(html.includes(`data-accordion="operate" data-group="${group}"`), `${group} section renders`);
  }
  assert.ok(html.includes('data-accordion="utility"'), 'utility drawer renders');

  // Mechanics: desktop icon rail + mobile bottom dock.
  assert.ok(html.includes('id="railToggle"'), 'icon-rail toggle ships');
  assert.ok(html.includes('id="bottomDock"'), 'mobile dock ships');
  assert.ok(html.includes('id="dockMore"'), 'dock More button ships');

  // The active page's section renders open server-side (accordion keeps
  // it as the one open section).
  const articles = await (await session.fetch('/content/articles')).text();
  assert.match(articles, /data-group="content"[\s\S]{0,600}?submenu open/, 'active section renders open');
  assert.ok(!/data-group="commerce"[\s\S]{0,600}?submenu open/.test(articles), 'inactive sections render closed');
});
