const crypto = require('crypto');

// Session-bound synchronizer-token CSRF protection.
//
// A random token is stored in the server-side session and exposed to views
// via res.locals.csrfToken (hidden form inputs + a <meta> tag that client JS
// reads and sends as the X-CSRF-Token header). Mutating requests must echo
// the token back; everything else is rejected with 403.
//
// Exempt paths are endpoints that do not rely on session cookies for
// authentication, so cross-site request forgery does not apply to them:
//  - /api/public/*    public read API + origin-checked form submissions
//  - /api/payments/*  public checkout endpoints; the webhook is
//                     authenticated by its Stripe signature
//  - /api/webhooks/*  authenticated by HMAC signature
const EXEMPT_PREFIXES = ['/api/public', '/api/payments', '/api/webhooks'];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const wantsJson = (req) => {
  return req.xhr ||
    req.originalUrl.startsWith('/api/') ||
    (req.get('accept') || '').includes('application/json') ||
    (req.get('content-type') || '').includes('application/json');
};

const tokensMatch = (expected, provided) => {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const csrfProtection = (req, res, next) => {
  if (!req.session) return next();

  // Skip exempt paths entirely — issuing a token there would persist a
  // session row for every anonymous public-API/webhook request.
  const url = req.originalUrl.split('?')[0];
  if (url === '/health' ||
      EXEMPT_PREFIXES.some(prefix => url === prefix || url.startsWith(prefix + '/'))) {
    return next();
  }

  // Lazily issue a per-session token and expose it to views
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (SAFE_METHODS.has(req.method)) return next();

  // Multipart bodies are parsed by multer after this middleware runs, so
  // multipart forms carry the token in the action query string or a header.
  const provided =
    (req.body && req.body._csrf) ||
    req.get('x-csrf-token') ||
    (req.query && req.query._csrf);

  if (tokensMatch(req.session.csrfToken, provided)) {
    return next();
  }

  if (wantsJson(req)) {
    return res.status(403).json({ success: false, error: 'Invalid or missing CSRF token' });
  }
  return res.status(403).render('error', {
    title: 'Request Blocked',
    message: 'Your session has expired or the form is invalid. Please go back, refresh the page, and try again.',
    code: 403
  });
};

module.exports = { csrfProtection };
