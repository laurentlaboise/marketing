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

// Platform roles:
//   superadmin / admin — unrestricted control plane ('admin' is the legacy
//     name; the two are synonyms everywhere so promoting is never required
//     for access and never breaks it)
//   translator — vendor role, scoped to /translations for assigned languages
//   user — authenticated but no admin surface access
const SUPER_ROLES = ['superadmin', 'admin'];
const isSuperAdmin = (user) => !!user && SUPER_ROLES.includes(user.role);

// Generic role guard: ensureRole('translator', 'superadmin', 'admin')
const ensureRole = (...allowed) => (req, res, next) => {
  if (!req.isAuthenticated()) {
    if (wantsJson(req)) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    req.session.returnTo = req.originalUrl;
    req.session.errorMessage = 'Please log in to access this page';
    return res.redirect('/auth/login');
  }
  if (!allowed.includes(req.user.role)) {
    if (wantsJson(req)) {
      return res.status(403).json({ success: false, error: 'Insufficient role' });
    }
    req.session.errorMessage = 'Access denied.';
    return res.redirect('/dashboard');
  }
  next();
};

const ensureSuperAdmin = ensureRole(...SUPER_ROLES);
const ensureTranslator = ensureRole('translator', ...SUPER_ROLES);

// Language scoping for translators. SuperAdmins pass through; translators
// must have the request's target language in users.assigned_languages.
// Reads the language from route params, body, or query. Routes addressing
// a translation row by id enforce the same rule against the row itself via
// translation-core.assertRowAccess — this guard covers list/create paths
// where the language arrives with the request.
const ensureLanguageAccess = (req, res, next) => {
  if (isSuperAdmin(req.user)) return next();
  const assigned = req.user.assigned_languages || [];
  const lang = (req.params && req.params.lang) ||
    (req.body && req.body.target_language) ||
    (req.query && req.query.lang);
  if (!lang || !assigned.includes(lang)) {
    if (wantsJson(req)) {
      return res.status(403).json({ success: false, error: 'Language not assigned to your account' });
    }
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'This language is not assigned to your account.',
      code: 403
    });
  }
  next();
};

// Ensure user is admin (superadmin included — see SUPER_ROLES)
const ensureAdmin = (req, res, next) => {
  if (req.isAuthenticated() && isSuperAdmin(req.user)) {
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
  logActivity,
  ensureRole,
  ensureSuperAdmin,
  ensureTranslator,
  ensureLanguageAccess,
  isSuperAdmin
};
