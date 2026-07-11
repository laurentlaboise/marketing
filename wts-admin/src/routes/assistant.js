// WTS Assistant chat endpoint. Mounted at /api/assistant BEFORE the
// ensureAdmin-guarded /api catch-all in server.js, because the assistant
// serves EVERY signed-in role (translators, verifiers, field workers and
// admins alike) — same precedent as the /translations mount, which carries
// ensureAuthenticated only and does per-route RBAC inside.
//
// Session-cookie authenticated, so the global CSRF middleware applies:
// POSTs must carry the X-CSRF-Token header (the widget reads it from the
// <meta name="csrf-token"> tag like every other admin fetch).
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ensureAuthenticated } = require('../middleware/auth');
const assistant = require('../lib/assistant');

const router = express.Router();

// Tighter than the surrounding /api budget on purpose: each message is a
// model call with real cost. 30 per 15 minutes per IP is comfortable for a
// human conversation and a hard wall for a runaway loop.
router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ASSISTANT_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    success: false,
    error: 'Too many messages — please wait a moment and try again.',
  }),
}));

const asJson = (res, status, body) => res.status(status).json(body);

router.post('/', ensureAuthenticated, async (req, res) => {
  const body = req.body || {};

  // Configured-probe: the widget POSTs { ping: true } on first open so it
  // can show "Assistant not configured on this server" without burning a
  // model call. Kept on the same endpoint (same guards, same limiter).
  if (body.ping === true) {
    if (!assistant.isAvailable()) {
      return asJson(res, 503, { success: false, error: 'Assistant not configured on this server' });
    }
    return asJson(res, 200, { success: true, configured: true });
  }

  // Shape validation first (400 beats 503 for malformed input) — the lib
  // clamps sizes; the route rejects wrong types.
  if (typeof body.message !== 'string' || !body.message.trim()) {
    return asJson(res, 400, { success: false, error: 'message is required' });
  }
  if (body.history !== undefined && !Array.isArray(body.history)) {
    return asJson(res, 400, { success: false, error: 'history must be an array' });
  }
  if (body.page !== undefined && typeof body.page !== 'string') {
    return asJson(res, 400, { success: false, error: 'page must be a string' });
  }

  if (!assistant.isAvailable()) {
    return asJson(res, 503, { success: false, error: 'Assistant not configured on this server' });
  }

  try {
    const reply = await assistant.answer({
      message: body.message,
      page: body.page,
      history: body.history,
      // Role + first name only for tone — never the email address.
      user: { role: req.user.role, first_name: req.user.first_name },
    });
    return asJson(res, 200, { success: true, reply });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    if (status >= 500) console.warn('[assistant] answer failed:', error.message);
    return asJson(res, status, {
      success: false,
      error: status === 502 ? 'Assistant is temporarily unavailable. Please try again.' : error.message,
    });
  }
});

module.exports = router;
