/**
 * Machine-to-machine Bearer token auth for /api/machine/v1.
 *
 * Token source: Railway env ADMIN_API_TOKEN (single shared secret).
 * Use: Authorization: Bearer <token>
 *
 * Comparison is constant-time. Empty/missing env rejects all requests (503)
 * so a misconfigured deploy cannot silently open the API.
 */
const crypto = require('crypto');

const HEADER_RE = /^Bearer\s+(.+)$/i;

function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do a compare to reduce length-leak timing signal
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractBearerToken(req) {
  const header = req.get('authorization') || req.get('Authorization') || '';
  const match = header.match(HEADER_RE);
  if (match) return match[1].trim();
  // Optional alternate for tools that prefer a custom header
  const alt = req.get('x-admin-api-token');
  if (alt && typeof alt === 'string') return alt.trim();
  return null;
}

/**
 * Require a valid ADMIN_API_TOKEN Bearer credential.
 * Sets req.machineAuth = { type: 'bearer', via: 'ADMIN_API_TOKEN' }.
 */
function requireMachineToken(req, res, next) {
  const expected = process.env.ADMIN_API_TOKEN;

  if (!expected || typeof expected !== 'string' || expected.length < 16) {
    return res.status(503).json({
      success: false,
      error: 'Machine API is not configured (ADMIN_API_TOKEN missing or too short)',
    });
  }

  const provided = extractBearerToken(req);
  if (!provided || !timingSafeEqualString(provided, expected)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing Bearer token',
    });
  }

  req.machineAuth = { type: 'bearer', via: 'ADMIN_API_TOKEN' };
  return next();
}

module.exports = {
  requireMachineToken,
  extractBearerToken,
  timingSafeEqualString,
};
