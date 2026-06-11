const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runServerExpectingExit, startServer } = require('./helpers');

test('boot fails fast when SESSION_SECRET is missing', async () => {
  const { code, output } = await runServerExpectingExit({ SESSION_SECRET: undefined });
  assert.notEqual(code, 0);
  assert.match(output, /SESSION_SECRET environment variable is required/);
});

test('production boot fails fast without database TLS configuration', async () => {
  const { code, output } = await runServerExpectingExit({
    NODE_ENV: 'production',
    PGSSLROOTCERT: undefined,
    PGSSL_INSECURE: undefined,
  });
  assert.notEqual(code, 0);
  assert.match(output, /Database TLS is not configured/);
});

test('telemetry endpoint fails closed when its secret is missing', async () => {
  const server = await startServer(3204, { TELEMETRY_WEBHOOK_SECRET: undefined });
  try {
    const res = await fetch(`${server.base}/api/webhooks/telemetry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ automation_id: 'a1', executed_at: '2026-01-01T00:00:00Z' }),
    });
    assert.equal(res.status, 503);
    assert.match(server.getOutput(), /TELEMETRY_WEBHOOK_SECRET is not set/);
  } finally {
    await server.stop();
  }
});
