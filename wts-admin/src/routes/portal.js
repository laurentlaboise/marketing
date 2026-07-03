const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
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

// Fresh session id on privilege change (session-fixation hygiene), and a
// 30-day cookie so customers stay signed in on each device they use.
// (The admin's own sessions keep the global 24h default — this override
// only applies to sessions minted here.)
// Pass { persist: false } for a browser-session cookie instead (e.g. a
// "remember me" checkbox left unticked); the default keeps the 30 days.
const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
async function establishCustomerSession(req, customer, opts = {}) {
  const persist = opts.persist !== false;
  await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
  req.session.customerId = customer.id;
  req.session.customerEmail = customer.email;
  req.session.cookie.maxAge = persist ? CUSTOMER_SESSION_MS : null;
  await db.query('UPDATE customers SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [customer.id]);
  await linkOrdersByEmail(customer.id, customer.email);
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
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  // Password sign-in — only possible once the customer set a password in
  // their profile. A wrong/unset password never reveals which it was.
  if (password) {
    try {
      if (email) {
        const result = await db.query('SELECT * FROM customers WHERE email = $1', [email]);
        const customer = result.rows[0];
        if (customer && customer.status === 'active' && customer.password_hash &&
            await bcrypt.compare(password, customer.password_hash)) {
          await establishCustomerSession(req, customer);
          return res.redirect('/portal');
        }
      }
    } catch (e) {
      console.error('Portal password login error:', e);
    }
    return res.status(401).render('portal/login', {
      title: 'Sign in - Words That Sells', sent: false, email: email || '',
      error: 'Email or password incorrect — or this account has no password yet. Leave the password empty and we’ll email you a sign-in link instead.'
    });
  }

  // Magic-link flow. Always render the same "check your email" page — never
  // reveal whether an address exists (no account enumeration).
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

    await establishCustomerSession(req, customer);
    res.redirect('/portal');
  } catch (e) {
    console.error('Portal auth error:', e);
    res.status(500).render('portal/login', { title: 'Sign in - Words That Sells', sent: false, email: '', error: 'Something went wrong signing you in. Please request a new link.' });
  }
});

// ── Dashboard ───────────────────────────────────────────────────

router.get('/', requireCustomer, async (req, res) => {
  try {
    const [customer, orders, saved, files] = await Promise.all([
      db.query('SELECT * FROM customers WHERE id = $1', [req.session.customerId]),
      db.query(
        `SELECT o.*, p.name AS product_name, p.download_url, p.product_type
         FROM orders o LEFT JOIN products p ON o.product_id = p.id
         WHERE o.customer_id = $1
         ORDER BY o.created_at DESC
         LIMIT 100`,
        [req.session.customerId]
      ),
      db.query(
        `SELECT s.billing_period, p.name, p.slug, p.service_page
         FROM saved_services s JOIN products p ON p.id = s.product_id
         WHERE s.customer_id = $1
         ORDER BY s.created_at DESC`,
        [req.session.customerId]
      ).catch(() => ({ rows: [] })),
      db.query(
        `SELECT id, title, description, external_url, file_name, file_size, created_at,
                COUNT(*) OVER() AS total
         FROM deliverables
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [req.session.customerId]
      ).catch(() => ({ rows: [] }))
    ]);
    if (!customer.rows.length) {
      req.session.destroy(() => {});
      return res.redirect('/portal/login');
    }
    res.render('portal/orders', {
      title: 'My Account - Words That Sells',
      customer: customer.rows[0],
      hasPassword: !!customer.rows[0].password_hash,
      orders: orders.rows,
      savedServices: saved.rows,
      recentFiles: files.rows,
      fileCount: files.rows.length ? parseInt(files.rows[0].total, 10) : 0,
      requestSent: !!(req.query && req.query.sent === '1')
    });
  } catch (e) {
    console.error('Portal orders error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to load your orders. Please try again.', code: 500 });
  }
});

// ── Quick requests ("Request new content" / "Ask a question") ───
//
// Lands in the same form_submissions inbox the public site's forms use,
// so requests show up in the admin's existing submissions screen —
// tagged with the customer so context is never lost.

router.post('/request', requireCustomer, async (req, res) => {
  const kind = req.body.kind === 'content' ? 'content' : (req.body.kind === 'question' ? 'question' : null);
  const message = String(req.body.message || '').trim().slice(0, 4000);
  if (!kind || !message) {
    return res.redirect('/portal/?sent=0');
  }
  try {
    const result = await db.query('SELECT * FROM customers WHERE id = $1', [req.session.customerId]);
    if (!result.rows.length) {
      req.session.destroy(() => {});
      return res.redirect('/portal/login');
    }
    const c = result.rows[0];
    await db.query(
      `INSERT INTO form_submissions (form_type, name, email, company, phone, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'portal_request',
        c.name || c.email,
        c.email,
        c.company || null,
        c.phone || null,
        message,
        JSON.stringify({ kind, customer_id: c.id, source: 'portal' })
      ]
    );
    res.redirect('/portal/?sent=1');
  } catch (e) {
    console.error('Portal request error:', e);
    res.redirect('/portal/?sent=0');
  }
});

// ── Billing ─────────────────────────────────────────────────────
//
// A money-focused view over the same orders data: what was paid, what's
// still awaiting a transfer, and which purchases are subscriptions.

router.get('/billing', requireCustomer, async (req, res) => {
  try {
    const orders = await db.query(
      `SELECT o.*, p.name AS product_name, p.pricing_type, p.monthly_price, p.yearly_price
       FROM orders o LEFT JOIN products p ON o.product_id = p.id
       WHERE o.customer_id = $1
       ORDER BY o.created_at DESC
       LIMIT 200`,
      [req.session.customerId]
    );
    const rows = orders.rows;
    const paid = rows.filter((o) => o.status === 'completed' && o.amount != null);
    const awaiting = rows.filter((o) => o.status === 'awaiting_payment');
    const totals = {};
    paid.forEach((o) => {
      const cur = o.currency || 'USD';
      totals[cur] = (totals[cur] || 0) + parseFloat(o.amount);
    });
    res.render('portal/billing', {
      title: 'Billing - Words That Sells',
      orders: rows,
      totals,
      awaitingCount: awaiting.length,
      subscriptions: rows.filter((o) => o.pricing_type === 'subscription' && o.status === 'completed')
    });
  } catch (e) {
    console.error('Portal billing error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to load your billing history. Please try again.', code: 500 });
  }
});

// ── Files & deliverables ────────────────────────────────────────

router.get('/files', requireCustomer, async (req, res) => {
  try {
    const files = await db.query(
      `SELECT id, title, description, external_url, file_name, file_mime, file_size, created_at
       FROM deliverables
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [req.session.customerId]
    );
    res.render('portal/files', {
      title: 'My Files - Words That Sells',
      files: files.rows
    });
  } catch (e) {
    console.error('Portal files error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to load your files. Please try again.', code: 500 });
  }
});

// Scoped to the signed-in customer — an id belonging to someone else 404s,
// so deliverable ids can never be enumerated across accounts.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/files/:id/download', requireCustomer, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(404).render('error', { title: 'Not found', message: 'This file does not exist.', code: 404 });
    }
    const result = await db.query(
      'SELECT * FROM deliverables WHERE id = $1 AND customer_id = $2',
      [req.params.id, req.session.customerId]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).render('error', { title: 'Not found', message: 'This file does not exist.', code: 404 });

    if (file.external_url) {
      try {
        const url = new URL(file.external_url);
        if (url.protocol === 'http:' || url.protocol === 'https:') return res.redirect(file.external_url);
      } catch (_) { /* fall through to 404 */ }
      return res.status(404).render('error', { title: 'Not found', message: 'This file link is not valid.', code: 404 });
    }

    if (!file.file_data) return res.status(404).render('error', { title: 'Not found', message: 'This file has no content.', code: 404 });
    const safeName = String(file.file_name || 'download').replace(/[^\w.\- ]+/g, '_');
    res.set({
      'Content-Type': file.file_mime || 'application/octet-stream',
      'Content-Length': file.file_data.length,
      'Content-Disposition': `attachment; filename="${safeName}"`
    });
    res.send(file.file_data);
  } catch (e) {
    console.error('Portal file download error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to download the file.', code: 500 });
  }
});

// ── Profile ─────────────────────────────────────────────────────

router.get('/profile', requireCustomer, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM customers WHERE id = $1', [req.session.customerId]);
    if (!result.rows.length) {
      req.session.destroy(() => {});
      return res.redirect('/portal/login');
    }
    res.render('portal/profile', {
      title: 'My Profile - Words That Sells',
      customer: result.rows[0],
      saved: false
    });
  } catch (e) {
    console.error('Portal profile error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to load your profile.', code: 500 });
  }
});

router.post('/profile', requireCustomer, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM customers WHERE id = $1', [req.session.customerId]);
    if (!result.rows.length) {
      req.session.destroy(() => {});
      return res.redirect('/portal/login');
    }
    const customer = result.rows[0];
    const clean = (v, max) => {
      const s = String(v || '').trim().slice(0, max);
      return s || null;
    };
    const name = clean(req.body.name, 255);
    const company = clean(req.body.company, 255);
    const phone = clean(req.body.phone, 50);

    // Optional password change: both fields must match, minimum 8 chars.
    // Leaving them blank keeps the current setting (including "no password").
    const newPassword = typeof req.body.new_password === 'string' ? req.body.new_password : '';
    const confirm = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';
    let passwordHash;
    if (newPassword || confirm) {
      if (newPassword.length < 8) {
        return res.status(400).render('portal/profile', {
          title: 'My Profile - Words That Sells', customer: { ...customer, name, company, phone },
          saved: false, error: 'The password must be at least 8 characters.'
        });
      }
      if (newPassword !== confirm) {
        return res.status(400).render('portal/profile', {
          title: 'My Profile - Words That Sells', customer: { ...customer, name, company, phone },
          saved: false, error: 'The two passwords don’t match.'
        });
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await db.query(
      `UPDATE customers SET
         name = $1, company = $2, phone = $3,
         password_hash = COALESCE($4, password_hash),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, company, phone, passwordHash || null, customer.id]
    );
    res.render('portal/profile', {
      title: 'My Profile - Words That Sells',
      customer: updated.rows[0],
      saved: true,
      passwordChanged: !!passwordHash
    });
  } catch (e) {
    console.error('Portal profile update error:', e);
    res.status(500).render('error', { title: 'Error', message: 'Failed to save your profile.', code: 500 });
  }
});

router.post('/logout', requireCustomer, (req, res) => {
  req.session.destroy(() => res.redirect('/portal/login'));
});

module.exports = router;
module.exports.upsertCustomer = upsertCustomer;
module.exports.linkOrdersByEmail = linkOrdersByEmail;
module.exports.issueLoginLink = issueLoginLink;
module.exports.establishCustomerSession = establishCustomerSession;
