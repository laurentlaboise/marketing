// Collaborative whiteboard module (feature-flagged).
//
// Mounted ONLY when process.env.FEATURE_WHITEBOARD === '1' — server.js
// calls attach() inside startServer(), after db.initialize() and after all
// core routes (including the 404/error handlers) are registered. Flag off →
// this file is never required: no routes, no tables, no WS handler.

const rateLimit = require('express-rate-limit');
const { runMigrations } = require('./migrations');
const createAdminRouter = require('./routes-admin');
const createPortalRouter = require('./routes-portal');
const { attachSync } = require('./sync');
const { ensureAuthenticated, ensureAdmin } = require('../../middleware/auth');

// attach() runs after server.js has already registered its catch-all 404
// and error handlers, so layers appended by app.use() here would sit after
// them and never be reached. Move the freshly-added layers to just before
// the 404 handler (the layer immediately preceding the first error handler,
// i.e. the first 4-arg middleware in the stack).
function mountBeforeNotFound(app, mountFn) {
  const stack = app.router.stack;
  const before = stack.length;
  mountFn();
  const added = stack.splice(before);

  let insertAt = stack.length;
  const errIdx = stack.findIndex((layer) => layer.handle && layer.handle.length === 4);
  if (errIdx !== -1) {
    insertAt = errIdx;
    const prev = stack[errIdx - 1];
    // The 404 handler sits directly before the error handler: an anonymous
    // (req, res) middleware with no route.
    if (prev && !prev.route && prev.handle && prev.handle.length === 2) {
      insertAt = errIdx - 1;
    }
  }
  stack.splice(insertAt, 0, ...added);
}

async function attach(app, httpServer, { sessionMiddleware }) {
  // Module-owned tables (created only when the flag is on).
  await runMigrations();

  // Views (owned by the frontend agent) check this to decide whether to
  // show whiteboard navigation. Flag off → attach never runs → undefined.
  app.locals.featureWhiteboard = true;

  // Same guard pattern server.js uses for the /business mount:
  // rate limit → ensureAuthenticated → ensureAdmin.
  const adminSurfaceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
  });

  mountBeforeNotFound(app, () => {
    app.use('/business/boards', adminSurfaceLimiter, ensureAuthenticated, ensureAdmin, createAdminRouter());
    app.use('/portal/boards', createPortalRouter());
  });

  // WebSocket sync endpoint: /ws/boards/:boardId
  attachSync(httpServer, { sessionMiddleware });
}

module.exports = { attach };
