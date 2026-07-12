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

// ==================== WhatsApp Business Cloud API ====================
// Meta webhook: GET verify + POST messages
// https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
// Endpoint (public): https://admin.wordsthatsells.website/api/webhooks/whatsapp

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || '';

  if (!expected) {
    console.warn('WHATSAPP_VERIFY_TOKEN not set — webhook verify will fail');
    return res.status(503).send('WhatsApp webhook not configured');
  }
  if (mode === 'subscribe' && token && token === expected) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/whatsapp', async (req, res) => {
  // Always 200 quickly so Meta does not retry aggressively
  res.sendStatus(200);

  try {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account') return;

    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value || {};
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const contactName = contacts[0]?.profile?.name || null;
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const metadataPhone = value.metadata?.display_phone_number || null;

        for (const msg of messages) {
          const waId = msg.id || null;
          const from = msg.from || null;
          const type = msg.type || 'text';
          let text = null;
          if (type === 'text') text = msg.text?.body || null;
          else if (type === 'button') text = msg.button?.text || null;
          else if (type === 'interactive') {
            text =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              null;
          } else {
            text = `[${type} message]`;
          }

          try {
            await db.query(
              `INSERT INTO whatsapp_messages
                (direction, wa_message_id, from_phone, to_phone, contact_name, message_type, body, raw, status)
               VALUES ('in', $1, $2, $3, $4, $5, $6, $7, 'received')
               ON CONFLICT (wa_message_id) DO NOTHING`,
              [
                waId,
                from,
                metadataPhone,
                contactName,
                type,
                text,
                JSON.stringify(msg),
              ]
            );
          } catch (e) {
            // Unique index may not apply if wa_message_id null — try plain insert once
            if (e.code === '42P10' || e.code === '42703') {
              await db.query(
                `INSERT INTO whatsapp_messages
                  (direction, wa_message_id, from_phone, to_phone, contact_name, message_type, body, raw, status)
                 VALUES ('in', $1, $2, $3, $4, $5, $6, $7, 'received')`,
                [waId, from, metadataPhone, contactName, type, text, JSON.stringify(msg)]
              );
            } else {
              console.error('WhatsApp inbox insert failed:', e.message);
            }
          }
        }

        // Status updates (delivered/read) — optional log
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const st of statuses) {
          if (!st.id) continue;
          try {
            await db.query(
              `UPDATE whatsapp_messages SET status = $1 WHERE wa_message_id = $2`,
              [st.status || 'unknown', st.id]
            );
          } catch (_) {
            /* non-fatal */
          }
        }
      }
    }
  } catch (e) {
    console.error('WhatsApp webhook handler error:', e.message);
  }
});

module.exports = router;
