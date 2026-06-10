const express = require('express');
const crypto = require('crypto');
const db = require('../../database/db');

const router = express.Router();

// ==================== POST /api/webhooks/telemetry ====================
// High-throughput ingest endpoint for n8n/Make webhooks.
// Writes directly to the execution_telemetry partitioned table.
// Authenticated via HMAC-SHA256 over the raw request body: the sender
// must set X-Telemetry-Signature to hex(HMAC_SHA256(TELEMETRY_WEBHOOK_SECRET, body)).
// Fails closed: without TELEMETRY_WEBHOOK_SECRET configured, all
// requests are rejected with 503.

if (!process.env.TELEMETRY_WEBHOOK_SECRET) {
  console.warn('TELEMETRY_WEBHOOK_SECRET is not set — /api/webhooks/telemetry will reject all requests with 503');
}

const verifyTelemetrySignature = (req, res, next) => {
  const secret = process.env.TELEMETRY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, error: 'Telemetry ingest is not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.get('x-telemetry-signature') || '';
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ success: false, error: 'Invalid telemetry signature' });
  }

  try {
    req.body = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
  }
  next();
};

router.post('/telemetry', express.raw({ type: '*/*', limit: '1mb' }), verifyTelemetrySignature, async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    if (events.length === 0) {
      return res.status(400).json({ success: false, error: 'No telemetry events provided' });
    }

    // Validate required fields
    const validEvents = events.filter(e => e.automation_id && e.executed_at);
    if (validEvents.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'Each event requires automation_id and executed_at'
      });
    }

    // Batch insert for throughput
    const values = [];
    const params = [];
    let paramIdx = 1;

    validEvents.forEach(event => {
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`
      );
      params.push(
        event.automation_id,
        event.execution_status || 'unknown',
        event.error_log || null,
        event.anomaly_score || null,
        event.latency_ms || null,
        event.executed_at
      );
      paramIdx += 6;
    });

    await db.query(
      `INSERT INTO execution_telemetry
        (automation_id, execution_status, error_log, anomaly_score, latency_ms, executed_at)
       VALUES ${values.join(', ')}`,
      params
    );

    res.status(201).json({
      success: true,
      ingested: validEvents.length,
      skipped: events.length - validEvents.length
    });
  } catch (error) {
    console.error('Telemetry ingest error:', error);
    // Return 200 even on error to prevent webhook retries flooding
    res.status(200).json({
      success: false,
      error: 'Ingest failed, data may be outside partition range',
      detail: error.message
    });
  }
});

module.exports = router;
