// Shared helpers for the whiteboard module.

const crypto = require('crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The board page needs a relaxed CSP: tldraw uses inline styles, blob
// workers and data-URI images. Set per-response on the two board routes
// only — the global helmet config is untouched (setHeader replaces the
// header helmet already set earlier in the middleware chain).
function relaxedBoardCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src blob:",
    "connect-src 'self' wss: ws:"
  ].join('; ');
}

// Stable presence color for a customer, derived from the customer id so
// the same person is always the same color across sessions.
const PRESENCE_COLORS = [
  '#e8544d', '#4d7ce8', '#3fa96c', '#c9822b',
  '#8a5fd4', '#d65fb0', '#2ba3a0', '#b5533d'
];

function colorForCustomer(customerId) {
  const hash = crypto.createHash('sha256').update(String(customerId)).digest();
  return PRESENCE_COLORS[hash[0] % PRESENCE_COLORS.length];
}

function notFound(res) {
  return res.status(404).render('error', {
    title: 'Not found',
    message: 'This board does not exist.',
    code: 404
  });
}

module.exports = { UUID_RE, relaxedBoardCsp, colorForCustomer, notFound };
