const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../../database/db');
const { sendMagicLink } = require('../utils/mailer');

const router = express.Router();

// ── Customer portal ─────────────────────────────────────────────
//
// Passwordless magic-link auth, completely separate from the admin's
// passport session: a signed-in customer is req.session.customerId and
// nothing else — no passport user is ever set here, and admin guards
// (ensureAuthenticated/ensureAdmin) never accept a customer session.

const PORTAL_BASE = () => (process.env.PORTAL_URL || process.env.APP_ADMIN_URL || 'https://admin.wordsthatsells.website').replace(/\/$/, '');
const TOKEN_TTL_MS = 15 * 60 * 1000;

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

const normalizeEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  // Pragmatic shape check; real verification is the emailed link itself.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 255 ? email : null;
};

// Find-or-create the account for an email. Used by login and by checkout
// flows (Stripe webhook / BCEL email capture) so a purchase creates the
// account automatically.
async function upsertCustomer(email, name) {
  const result = await db.query(
    `INSERT INTO customers (email, name)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET name = COALESCE(customers.name, EXCLUDED.name), updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [email, name || null]
  );
  return result.rows[0];
}

// Attach any orders placed with this email before the account existed.
async function linkOrdersByEmail(customerId, email) {
  await db.query(
    'UPDATE orders SET customer_id = $1 WHERE customer_id IS NULL AND LOWER(customer_email) = $2',
    [customerId, email]
  );
}

// Mint a single-use magic-link token and email it. The one token path for
// self-serve login, admin invites and public portal signups alike.
async function issueLoginLink(customer) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    'INSERT INTO customer_login_tokens (customer_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [customer.id, hashToken(token), new Date(Date.now() + TOKEN_TTL_MS)]
  );
  return sendMagicLink(customer.email, `${PORTAL_BASE()}/portal/auth?token=${token}`);
}

const requireCustomer = (req, res, next) => {
  if (req.session && req.session.customerId) return next();
  return res.redirect('/portal/login');
};

// Tight limit on the endpoints that send email / mint sessions.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PORTAL_RATE_LIMIT_MAX) || 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many sign-in attempts, please try again later.'
});

// ── Login ───────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.customerId) return res.redirect('/portal');
  res.render('portal/login', { title: 'Sign in - Words That Sells', sent: false, email: '' });
});

router.post('/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  // Always render the same "check your email" page — never reveal whether
  // an address exists (no account enumeration).
  if (!email) {
    return res.render('portal/login', { title: 'Sign in - Words That Sells', sent: true, email: String(req.body.email || '').slice(0, 100) });
  }
  try {
    const customer = await upsertCustomer(email, null);
    await issueLoginLink(customer);
  } catch (e) {
    console.error('Portal login error:', e);
    // Fall through to the neutral response.
  }
  res.render('portal/login', { title: 'Sign in - Words That Sells', sent: true, email });
});

// ── Magic-link verification ─────────────────────────────────────

router.get('/auth', loginLimiter, async (req, res) => {
  const token = String(req.query.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).render('portal/login', { title: 'Sign in - Words That Sells', sent: false, email: '', error: 'That sign-in link is not valid. Request a new one below.' });
  }
  try {
    // Single-use: claim the token atomically so a link can never mint two sessions.
    const result = await db.query(
      `UPDATE customer_login_tokens
         SET used_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       RETURNING customer_id`,
      [hashToken(token)]
    );
    if (result.rows.length === 0) {
      return res.status(400).render('portal/login', { title: 'Sign in - Words That Sells', sent: false, email: '', error: 'That sign-in link has expired or was already used. Request a new one below.' });
    }
    const customerId = result.rows[0].customer_id;
    const customer = (await db.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];
    if (!customer || customer.status !== 'active') {
      return res.status(403).render('portal/login', { title: 'Sign in - Words That Sells', sent: false, email: '', error: 'This account is not active. Contact us if you think this is a mistake.' });
    }

    // Fresh session id on privilege change (session-fixation hygiene).
    await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
    req.session.customerId = customer.id;
    req.session.customerEmail = customer.email;

    await db.query('UPDATE customers SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [customer.id]);
    await linkOrdersByEmail(customer.id, customer.email);
    res.redirect('/portal');
  } catch (e) {
    console.error('Portal auth error:', e);
    res.status(500).render('portal/login', { title: 'Sign in - Words That Sells', sent: false, email: '', error: 'Something went wrong signing you in. Please request a new link.' });
  }
});

// ── My Orders (dashboard) ───────────────────────────────────────

router.get('/', requireCustomer, async (req, res) => {
  try {
    const [customer, orders] = await Promise.all([
      db.query('SELECT * FROM customers WHERE id = $1', [req.session.customerId]),
      db.query(
        `SELECT o.*, p.name AS product_name, p.download_url, p.product_type
         FROM orders o LEFT JOIN products p ON o.product_id = p.id
         WHERE o.customer_id = $1
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [req.session.customerId]
      )
    ]);
    if (!customer.rows.length) {
      req.session.destroy(() => {});
      return res.redirect('/portal/login');
    }
    res.render('portal/orders', {
      title: 'My Orders - Words That Sells',
      customer: customer.rows[0],
      orders: orders.rows
    });
  } catch (e) {
    console.error('Portal orders error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to load your orders. Please try again.', code: 500 });
  }
});

router.post('/logout', requireCustomer, (req, res) => {
  req.session.destroy(() => res.redirect('/portal/login'));
});

module.exports = router;
module.exports.upsertCustomer = upsertCustomer;
module.exports.linkOrdersByEmail = linkOrdersByEmail;
module.exports.issueLoginLink = issueLoginLink;
