require('dotenv').config();

// Fail fast on missing secrets — a hardcoded fallback would silently sign
// every session cookie with a publicly-known value.
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required. Generate one with: openssl rand -hex 32');
}

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const contentRoutes = require('./src/routes/content');
const businessRoutes = require('./src/routes/business');
const apiRoutes = require('./src/routes/api');
const publicApiRoutes = require('./src/routes/public-api');
const imagesRoutes = require('./src/routes/images');
const webdevRoutes = require('./src/routes/webdev');
const paymentsRoutes = require('./src/routes/payments');
const webhooksApiRoutes = require('./src/routes/webhooks-api');
const portalRoutes = require('./src/routes/portal');

// Import passport configuration
require('./src/utils/passport-config');

// Import auth guards
const { ensureAuthenticated, ensureAdmin } = require('./src/middleware/auth');

// Import database
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway
app.set('trust proxy', 1);

// Security middleware
// Per-request CSP nonce: inline <script> blocks in views carry
// nonce="<%= cspNonce %>" instead of relying on 'unsafe-inline'.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // styleSrc keeps 'unsafe-inline': views use inline style attributes
      // pervasively; the high-value target (script injection) is nonced.
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://ka-f.fontawesome.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://ka-f.fontawesome.com"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
        "https://accounts.google.com",
        "https://connect.facebook.net",
        "https://kit.fontawesome.com",
        "https://ka-f.fontawesome.com",
        "https://cdn.jsdelivr.net"
      ],
      workerSrc: ["'self'", "blob:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://www.facebook.com", "https://ka-f.fontawesome.com", "https://checkout.stripe.com", "https://cdn.jsdelivr.net", "wss:", "ws:"],
      frameSrc: ["https://accounts.google.com", "https://www.facebook.com", "https://checkout.stripe.com", "https://js.stripe.com"]
    }
  }
}));

const { getAllowedOrigins } = require('./src/utils/origins');
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
  // Machine API has its own higher budget (automation / CI)
  skip: (req) => (req.originalUrl || '').startsWith('/api/machine'),
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10, // limit auth attempts (env-tunable for tests)
  message: 'Too many authentication attempts, please try again later.'
});
app.use('/auth/login', authLimiter);
app.use('/auth/signup', authLimiter);

// Body parsing.
// Webhook paths are excluded from JSON parsing — they verify signatures
// over the raw body (Stripe signature / telemetry HMAC) before parsing.
// Only the admin content editors legitimately submit large payloads
// (full article HTML); everything else — including all public endpoints —
// gets a 1 MB cap so the body parser is not a DoS lever.
const LARGE_BODY_PREFIXES = ['/content', '/webdev', '/business', '/translations'];
const allowsLargeBody = (req) => LARGE_BODY_PREFIXES.some(p => req.originalUrl.startsWith(p));
const jsonLarge = express.json({ limit: '10mb' });
const jsonDefault = express.json({ limit: '1mb' });
const urlencodedLarge = express.urlencoded({ extended: true, limit: '10mb' });
const urlencodedDefault = express.urlencoded({ extended: true, limit: '1mb' });

app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook' || req.originalUrl === '/api/webhooks/telemetry') {
    return next();
  }
  (allowsLargeBody(req) ? jsonLarge : jsonDefault)(req, res, next);
});
app.use((req, res, next) => {
  (allowsLargeBody(req) ? urlencodedLarge : urlencodedDefault)(req, res, next);
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
};

// Use PostgreSQL session store in production.
// Reuses the app pool so the session store gets the same TLS settings
// instead of opening its own unverified connections from the raw URL.
if (process.env.DATABASE_URL) {
  const pgSession = require('connect-pg-simple')(session);
  sessionConfig.store = new pgSession({
    pool: db.pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  });
}

const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);

// Passport initialization (must come after session, before routes)
app.use(passport.initialize());
app.use(passport.session());

// CSRF protection for session-authenticated, state-changing routes
const { csrfProtection } = require('./src/middleware/csrf');
app.use(csrfProtection);

// Global variables for views
app.use(async (req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.isAuthenticated = req.isAuthenticated ? req.isAuthenticated() : false;
  res.locals.messages = {
    success: req.session.successMessage,
    error: req.session.errorMessage
  };
  delete req.session.successMessage;
  delete req.session.errorMessage;

  // Attach unread notification count for authenticated users.
  // Non-critical: failures degrade to a zero badge, but are logged
  // (rate-limited to one warning per minute) instead of swallowed.
  res.locals.unreadCount = 0;
  if (req.user && req.user.id) {
    try {
      const result = await db.query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE',
        [req.user.id]
      );
      res.locals.unreadCount = parseInt(result.rows[0].count) || 0;
    } catch (e) {
      if (!app.locals.lastNotifCountWarn || Date.now() - app.locals.lastNotifCountWarn > 60000) {
        app.locals.lastNotifCountWarn = Date.now();
        console.warn('Notification count query failed (badge degraded to 0):', e.message);
      }
    }
  }

  next();
});


// Portal i18n: locale resolution + t()/formatting helpers for every
// /portal surface (including the whiteboard portal mounted later).
// Mounted before the routers so req.t is available inside them.
const i18n = require('./src/lib/i18n');
app.use('/portal', i18n.middleware(db));

// Public API routes (no authentication required)
app.use('/api/public', publicApiRoutes);

// Machine API (Bearer ADMIN_API_TOKEN — no session / no CSRF)
// Mounted before session-protected /api routes so automation can manage
// packages, products, menus, and seeds without a browser login.
const machineApiRoutes = require('./src/routes/machine-api');
app.use('/api/machine', machineApiRoutes);

// Payment routes (no authentication - public facing)
app.use('/api/payments', paymentsRoutes);

// Webhook ingest routes (no authentication - external webhook sources)
app.use('/api/webhooks', webhooksApiRoutes);

// Customer portal (passwordless magic-link sessions, fully separate from
// the admin's passport auth — a customer session only ever carries
// req.session.customerId, which no admin guard accepts).
app.use('/portal', portalRoutes);

// On the customer subdomain (my.wordsthatsells.website → same service),
// the portal is the site root.
app.use((req, res, next) => {
  if (req.hostname && req.hostname.startsWith('my.') && req.path === '/') {
    return res.redirect('/portal');
  }
  next();
});

// Routes
// Admin surfaces require an authenticated session with role === 'admin'.
// /dashboard stays reachable by any authenticated user (it renders a
// restricted view for non-admins) so ensureAdmin has a safe redirect target.
// Each admin mount gets its own rate limiter ahead of the auth guards so
// the pre-auth path is limited too; the per-router limiters inside use
// the same 100/15min budget, so legitimate admin traffic is unaffected.
const adminSurfaceLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/content', adminSurfaceLimiter(), ensureAuthenticated, ensureAdmin, contentRoutes);
app.use('/business', adminSurfaceLimiter(), ensureAuthenticated, ensureAdmin, businessRoutes);
// Note: /api/machine is mounted earlier and must not require session admin auth.
// Express still matches /api/* here for other paths only after prior routers
// call next(); machine routes always end the response themselves.
app.use('/api', adminSurfaceLimiter(), ensureAuthenticated, ensureAdmin, apiRoutes);
app.use('/images', adminSurfaceLimiter(), ensureAuthenticated, ensureAdmin, imagesRoutes);
app.use('/webdev', adminSurfaceLimiter(), ensureAuthenticated, ensureAdmin, webdevRoutes);
// Partner-program approval queue (applications come from the client portal).
app.use('/partners', adminSurfaceLimiter(), ensureAuthenticated, ensureAdmin, require('./src/routes/partners'));

// Localization platform. Deliberately NOT behind ensureAdmin: the router
// carries per-route RBAC (ensureSuperAdmin for the pipeline/ledger,
// ensureTranslator + language scoping for the vendor workspace).
//
// Dedicated limiter instead of adminSurfaceLimiter():
//  - the AI-batch status poll is exempt here (it carries its own generous
//    limiter inside the router). Counting polls against the shared
//    100/15min budget let a single open pipeline tab exhaust the bucket
//    and 429 all /translations navigation for the rest of the window.
//  - when the limit does trip, browsers get the styled error page instead
//    of the bare "Too many requests" text on a white page.
const translationsRoutes = require('./src/routes/translations');
const translationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Sized for the per-section verify flow: every section tick and field
  // blur is a small auto-save POST, so one worker on ~10 items can send
  // well over 100 requests in a window. Env-tunable (shared knob with the
  // router-level limiter inside).
  max: Number(process.env.TRANSLATIONS_RATE_LIMIT_MAX) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.split('?')[0] === '/translations/ai-batch/status',
  handler: (req, res) => {
    const wantsJson = req.xhr || (req.get('accept') || '').includes('application/json');
    if (wantsJson) {
      return res.status(429).json({ success: false, error: 'Too many requests, please try again later.' });
    }
    res.status(429).render('error', {
      title: 'Too Many Requests',
      message: 'This session sent too many requests in a short time. Wait a minute and try again.',
      code: 429,
    });
  },
});
app.use('/translations', translationsLimiter, ensureAuthenticated, translationsRoutes);

// Workforce module (leads CRM, engagement/cascade log, comp rates, team).
// Per-route RBAC inside: worker hub for vendors, admin surfaces for
// superadmins.
const workforceRoutes = require('./src/routes/workforce');
app.use('/workforce', adminSurfaceLimiter(), ensureAuthenticated, workforceRoutes.router);

// Serve images from the local working copy for admin previews.
// The local copy is env-configurable (IMAGES_DIR, e.g. a Railway volume);
// when a file is missing locally — typical after a redeploy on an
// ephemeral filesystem — redirect to the durable CDN copy instead.
const storage = require('./src/utils/storage');
const fsLocal = require('fs');
app.use('/images-serve', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== 'string' || filePath.includes('..') || !filePath.startsWith('images/')) {
    return res.status(400).send('Invalid path');
  }
  let fullPath;
  try {
    fullPath = storage.localPathFor(filePath);
  } catch (e) {
    return res.status(403).send('Forbidden');
  }
  if (fsLocal.existsSync(fullPath)) {
    return res.sendFile(fullPath);
  }
  return res.redirect(302, storage.buildCdnUrl(filePath));
});

// Home route - redirect to login or dashboard
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/auth/login');
  }
});

// Health check for Railway.
// The server deliberately listens even when the DB is down (the listener
// must bind for the platform to route at all), but /health reports the
// truth: 503 + db:"down" instead of a hollow 200. Railway health checks
// run at deploy time, so a DB outage during a deploy fails that deploy
// rather than shipping an instance that can only serve errors; at
// runtime the status code feeds external monitors.
app.get('/health', async (req, res) => {
  const timestamp = new Date().toISOString();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('db ping timeout')), 2000);
      timer.unref();
      db.query('SELECT 1').then((r) => { clearTimeout(timer); resolve(r); }, (e) => { clearTimeout(timer); reject(e); });
    });
    res.status(200).json({ status: 'ok', db: 'ok', timestamp });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down', timestamp });
  }
});

// 404 handler. Portal paths (req.t is set by the /portal i18n middleware)
// get the portal-owned, localized error page; everything else keeps the
// admin error view.
app.use((req, res) => {
  if (req.t) {
    return res.status(404).render('portal/error', {
      title: req.t('errors.notFoundTitle'),
      message: req.t('errors.pageNotFound'),
      code: 404
    });
  }
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    code: 404
  });
});

// Error handler. Respects the status of client errors raised by
// middleware (413 payload-too-large, 400 invalid JSON, …) instead of
// flattening everything to 500, and answers JSON on API paths.
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const status = Number.isInteger(err.status || err.statusCode) ? (err.status || err.statusCode) : 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Something went wrong.'
    : err.message;
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({ success: false, error: message });
  }
  if (req.t) {
    return res.status(status).render('portal/error', {
      title: req.t('errors.serverErrorTitle'),
      message: status >= 500 ? req.t('errors.serverError') : message,
      code: status
    });
  }
  res.status(status).render('error', {
    title: status >= 500 ? 'Server Error' : 'Request Error',
    message,
    code: status
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await db.initialize();
    console.log('Database connected successfully');

    // Populate a near-empty catalog from database/seed/products-all.json so a
    // fresh deploy comes up with the full product range. Never runs once the
    // catalog is populated; failures must not block startup.
    try {
      const { seedCatalogIfSparse } = require('./src/utils/product-seeder');
      await seedCatalogIfSparse();
    } catch (e) {
      console.error('Catalog seed skipped:', e.message);
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`WTS Admin server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Optional collaborative whiteboard module. Flag off → nothing happens.
    // Placed after db.initialize() (its migrations need the pool) and after
    // listen() (its WS handler needs the http server). Module failure must
    // never block boot.
    if (process.env.FEATURE_WHITEBOARD === '1') {
      try {
        await require('./src/modules/whiteboard').attach(app, server, { sessionMiddleware });
        console.log('Whiteboard module enabled');
      } catch (e) {
        console.error('Whiteboard module failed to load:', e.message);
      }
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    // Start server anyway for health checks
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`WTS Admin server running on port ${PORT} (database connection pending)`);
    });
  }
}

startServer();
