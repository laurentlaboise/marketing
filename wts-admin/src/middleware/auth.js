// Authentication middleware

// Ensure user is authenticated
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
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

// Log activity
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
        console.error('Failed to log activity:', error);
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
