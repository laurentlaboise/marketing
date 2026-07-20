const crypto = require('crypto');

// Session-bound CSRF protection with DERIVED tokens.
//
// The token is HMAC-SHA256(sessionID, SESSION_SECRET) rather than a random
// value stored in the session. It is exposed to views via
// res.locals.csrfToken (hidden form inputs + a <meta> tag client JS sends
// back as X-CSRF-Token); mutating requests must echo it, everything else
// is rejected with 403.
//
// Why derived instead of stored: the stored variant wrote the token into
// the session on first render, and under parallel load that save could
// lose the race against an immediately following mutating request from
// the same client — which then minted a DIFFERENT token and rejected a
// legitimately fresh one (seen as a rare CI-only 403 in the suite). A
// derived token is recomputable on every request, so validation never
// depends on a session write landing. Security is equivalent: the token
// is bound to the HttpOnly session id, the HMAC is one-way under the
// server secret, and the login-time session regeneration rotates it.
//
// The session must still EXIST by the time a form posts (the sid cookie
// carries the binding), so anonymous sessions are initialized with a
// one-time marker exactly where the old code stored its token — cookie
// behavior is unchanged. Authenticated sessions already persist.
//
// Exempt paths are endpoints that do not rely on session cookies for
// authentication, so cross-site request forgery does not apply to them:
//  - /api/public/*    public read API + origin-checked form submissions
//  - /api/payments/*  public checkout endpoints; the webhook is
//                     authenticated by its Stripe signature
//  - /api/webhooks/*  authenticated by HMAC signature
const EXEMPT_PREFIXES = [
  '/api/public',
  '/api/payments',
  '/api/webhooks',
  '/api/machine', // Bearer-token machine API (no session cookies)
];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const wantsJson = (req) => {
  return req.xhr ||
    req.originalUrl.startsWith('/api/') ||
    (req.get('accept') || '').includes('application/json') ||
    (req.get('content-type') || '').includes('application/json');
};

const deriveToken = (req) =>
  crypto.createHmac('sha256', String(process.env.SESSION_SECRET))
    .update(String(req.sessionID))
    .digest('hex');

const tokensMatch = (expected, provided) => {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const csrfProtection = (req, res, next) => {
  if (!req.session) return next();

  // Skip exempt paths entirely — initializing a session there would
  // persist a row for every anonymous public-API/webhook request.
  const url = req.originalUrl.split('?')[0];
  if (url === '/health' ||
      EXEMPT_PREFIXES.some(prefix => url === prefix || url.startsWith(prefix + '/'))) {
    return next();
  }

  // Keep anonymous sessions alive across the render→submit gap: the sid
  // is the token's binding, and saveUninitialized:false would otherwise
  // drop it. Authenticated sessions are already persistent, and the
  // token comparison below never depends on this write landing.
  if (!req.session.csrfInit) {
    req.session.csrfInit = true;
  }
  res.locals.csrfToken = deriveToken(req);

  if (SAFE_METHODS.has(req.method)) return next();

  // Multipart bodies are parsed by multer after this middleware runs, so
  // multipart forms carry the token in the action query string or a header.
  const provided =
    (req.body && req.body._csrf) ||
    req.get('x-csrf-token') ||
    (req.query && req.query._csrf);

  if (tokensMatch(res.locals.csrfToken, provided)) {
    return next();
  }

  // A PROVIDED token that no longer matches, on an unauthenticated
  // request, is almost always an EXPIRED session: the page was rendered
  // under the old sid and the browser now carries a fresh one. Say so —
  // a bare "invalid CSRF token" sends a worker who left an editor open
  // overnight into a retry loop with no way out. A request with no token
  // at all stays a plain 403 (that is a missing token, not expiry). This
  // middleware runs after passport.session, so req.isAuthenticated is
  // available here.
  const sessionExpired = Boolean(provided) &&
    typeof req.isAuthenticated === 'function' && !req.isAuthenticated();
  if (sessionExpired) {
    if (wantsJson(req)) {
      return res.status(401).json({
        success: false,
        error: 'Your session has expired. Open the login page in a new tab, sign in, then retry — your unsaved text is still in this page.',
        sessionExpired: true,
      });
    }
    req.session.returnTo = req.get('referer') || '/dashboard';
    req.session.errorMessage = 'Your session expired — please log in again.';
    return res.redirect('/auth/login');
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
