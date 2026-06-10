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
const proxyApiRoutes = require('./src/routes/proxy-api');
const webhooksApiRoutes = require('./src/routes/webhooks-api');

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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://ka-f.fontawesome.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://ka-f.fontawesome.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://connect.facebook.net", "https://kit.fontawesome.com", "https://ka-f.fontawesome.com", "https://cdn.jsdelivr.net"],
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
  message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // limit auth attempts
  message: 'Too many authentication attempts, please try again later.'
});
app.use('/auth/login', authLimiter);
app.use('/auth/signup', authLimiter);

// Body parsing - increased limit for large content
// Exclude webhook paths from JSON parsing — they verify signatures over
// the raw body (Stripe signature / telemetry HMAC) before parsing.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook' || req.originalUrl === '/api/webhooks/telemetry') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

app.use(session(sessionConfig));

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

  // Attach unread notification count for authenticated users
  res.locals.unreadCount = 0;
  if (req.user && req.user.id) {
    try {
      const result = await db.query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE',
        [req.user.id]
      );
      res.locals.unreadCount = parseInt(result.rows[0].count) || 0;
    } catch (e) { /* ignore */ }
  }

  next();
});


// Public API routes (no authentication required)
app.use('/api/public', publicApiRoutes);

// Payment routes (no authentication - public facing)
app.use('/api/payments', paymentsRoutes);

// Webhook ingest routes (no authentication - external webhook sources)
app.use('/api/webhooks', webhooksApiRoutes);

// Routes
// Admin surfaces require an authenticated session with role === 'admin'.
// /dashboard stays reachable by any authenticated user (it renders a
// restricted view for non-admins) so ensureAdmin has a safe redirect target.
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/content', ensureAuthenticated, ensureAdmin, contentRoutes);
app.use('/business', ensureAuthenticated, ensureAdmin, businessRoutes);
app.use('/api', ensureAuthenticated, ensureAdmin, apiRoutes);
app.use('/api/proxy', ensureAuthenticated, ensureAdmin, proxyApiRoutes);
app.use('/images', ensureAuthenticated, ensureAdmin, imagesRoutes);
app.use('/webdev', ensureAuthenticated, ensureAdmin, webdevRoutes);

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

// Health check for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    code: 404
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).render('error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message,
    code: 500
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await db.initialize();
    console.log('Database connected successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`WTS Admin server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    // Start server anyway for health checks
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`WTS Admin server running on port ${PORT} (database connection pending)`);
    });
  }
}

startServer();
