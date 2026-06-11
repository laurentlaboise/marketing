// Authentication middleware

// Detect requests that expect a JSON response (fetch/XHR/API clients)
// so guards can answer with a status code instead of an HTML redirect.
const wantsJson = (req) => {
  return req.xhr ||
    req.path.startsWith('/api/') ||
    req.originalUrl.startsWith('/api/') ||
    (req.get('accept') || '').includes('application/json');
};

// Ensure user is authenticated
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  if (wantsJson(req)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  req.session.returnTo = req.originalUrl;
  req.session.errorMessage = 'Please log in to access this page';
  res.redirect('/auth/login');
};

// Ensure user is admin
const ensureAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  if (wantsJson(req)) {
    return res.status(req.isAuthenticated() ? 403 : 401).json({
      success: false,
      error: req.isAuthenticated() ? 'Admin privileges required' : 'Authentication required'
    });
  }
  if (!req.isAuthenticated()) {
    req.session.returnTo = req.originalUrl;
    req.session.errorMessage = 'Please log in to access this page';
    return res.redirect('/auth/login');
  }
  req.session.errorMessage = 'Access denied. Admin privileges required.';
  res.redirect('/dashboard');
};

// Ensure user is not authenticated (for login/signup pages)
const ensureGuest = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return next();
  }
  res.redirect('/dashboard');
};

// Log activity. Failures never block the request; they are logged at
// most once per minute so a DB outage doesn't flood the logs.
let lastActivityLogWarn = 0;
const logActivity = (action) => {
  return async (req, res, next) => {
    if (req.user) {
      const db = require('../../database/db');
      try {
        await db.query(
          `INSERT INTO activity_logs (user_id, action, ip_address, user_agent)
           VALUES ($1, $2, $3, $4)`,
          [
            req.user.id,
            action,
            req.ip || req.connection.remoteAddress,
            req.get('user-agent')
          ]
        );
      } catch (error) {
        if (Date.now() - lastActivityLogWarn > 60000) {
          lastActivityLogWarn = Date.now();
          console.warn(`Activity logging failed (action: ${action}):`, error.message);
        }
      }
    }
    next();
  };
};

module.exports = {
  ensureAuthenticated,
  ensureAdmin,
  ensureGuest,
  logActivity
};
