/**
 * When ADMIN_API_TOKEN is unset, machine API must refuse all traffic (503).
 * Separate process so we don't affect the main suite's configured token.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

const PORT = 3206;
let server;

before(async () => {
  server = await startServer(PORT, {
    // Explicitly clear token even if parent env has one
    ADMIN_API_TOKEN: '',
  });
});

after(async () => {
  if (server) await server.stop();
});

test('unconfigured machine API returns 503', async () => {
  const res = await fetch(`${server.base}/api/machine/v1/health`, {
    headers: { Authorization: 'Bearer anything-at-all-here-ok' },
  });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.error || '', /not configured/i);
});
