// Staff Help AI endpoint — POST /api/help-ai
//
// Mounted in server.js BEFORE the admin /api router (which would otherwise
// swallow it behind ensureAdmin) so translators and other staff roles can
// use the guide too. Session-authenticated, so the global CSRF middleware
// applies; admin pages send the token automatically via main.js's fetch
// wrapper.
//
// Fails closed: any Odysseus problem (down, slow, misconfigured) becomes a
// friendly 5xx JSON message and nothing else on the page is affected.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ensureAuthenticated } = require('../middleware/auth');
const helpAi = require('../lib/help-ai');

const router = express.Router();

const helpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.HELP_AI_RATE_LIMIT_MAX) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many help requests — please wait a few minutes and try again.' }
});

// Staff accounts only. `user`-role accounts have no admin surfaces to be
// coached on, and the guide's corpus describes staff workflows.
const STAFF_ROLES = new Set(['superadmin', 'admin', 'translator']);

router.post('/', ensureAuthenticated, helpLimiter, async (req, res) => {
  if (!helpAi.adminEnabled()) {
    return res.status(503).json({ success: false, error: 'The AI Guide is not available right now.' });
  }
  const role = (req.user && req.user.role) || '';
  if (!STAFF_ROLES.has(role) && !(req.user && req.user.is_vendor)) {
    return res.status(403).json({ success: false, error: 'The AI Guide is only available to staff accounts.' });
  }
  const message = String((req.body || {}).message || '').trim().slice(0, 2000);
  if (!message) {
    return res.status(400).json({ success: false, error: 'Please type a question first.' });
  }
  try {
    const reply = await helpAi.adminReply({
      sessionID: req.sessionID,
      role: role || (req.user.is_vendor ? 'vendor' : 'staff'),
      message,
      pagePath: (req.body || {}).pagePath
    });
    res.json({ success: true, reply });
  } catch (e) {
    // e.message never contains the bearer token (odysseus-client redacts by
    // construction: errors carry only method, path, and status).
    console.error('Help AI error:', e.status || '', e.message);
    res.status(502).json({
      success: false,
      error: 'The AI Guide could not answer just now. Please try again in a moment — everything else keeps working.'
    });
  }
});

module.exports = router;
