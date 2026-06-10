const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer, TEST_ENV } = require('./helpers');

const PORT = 3203;
let server;

before(async () => {
  server = await startServer(PORT);
});

after(async () => {
  if (server) await server.stop();
});

const telemetrySign = (body) =>
  crypto.createHmac('sha256', TEST_ENV.TELEMETRY_WEBHOOK_SECRET).update(body).digest('hex');

test('telemetry: unsigned requests are rejected with 401', async () => {
  const res = await fetch(`${server.base}/api/webhooks/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ automation_id: 'a1', executed_at: '2026-01-01T00:00:00Z' }),
  });
  assert.equal(res.status, 401);
});

test('telemetry: wrong signature is rejected with 401', async () => {
  const body = JSON.stringify({ automation_id: 'a1', executed_at: '2026-01-01T00:00:00Z' });
  const res = await fetch(`${server.base}/api/webhooks/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telemetry-signature': 'deadbeef'.repeat(8) },
    body,
  });
  assert.equal(res.status, 401);
});

test('telemetry: valid HMAC signature ingests events', async () => {
  const body = JSON.stringify([
    { automation_id: 'a1', execution_status: 'success', latency_ms: 12, executed_at: '2026-01-01T00:00:00Z' },
    { automation_id: 'a2', executed_at: '2026-01-02T00:00:00Z' },
  ]);
  const res = await fetch(`${server.base}/api/webhooks/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telemetry-signature': telemetrySign(body) },
    body,
  });
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.ingested, 2);
});

test('telemetry: signature is over the exact raw body (tampered body fails)', async () => {
  const signedBody = JSON.stringify({ automation_id: 'a1', executed_at: '2026-01-01T00:00:00Z' });
  const tamperedBody = JSON.stringify({ automation_id: 'HACKED', executed_at: '2026-01-01T00:00:00Z' });
  const res = await fetch(`${server.base}/api/webhooks/telemetry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telemetry-signature': telemetrySign(signedBody) },
    body: tamperedBody,
  });
  assert.equal(res.status, 401);
});

test('stripe webhook: rejects requests with an invalid signature', async () => {
  const res = await fetch(`${server.base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bogus' },
    body: JSON.stringify({ type: 'checkout.session.completed' }),
  });
  assert.equal(res.status, 400);
});

test('stripe webhook: accepts a correctly signed event', async () => {
  const stripe = require('stripe')(TEST_ENV.STRIPE_SECRET_KEY);
  const payload = JSON.stringify({
    id: 'evt_test_1',
    type: 'some.unhandled.event',
    data: { object: {} },
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_ENV.STRIPE_WEBHOOK_SECRET,
  });
  const res = await fetch(`${server.base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.received, true);
});
