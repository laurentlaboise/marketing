const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const db = require('../../database/db');
const { sendMagicLink } = require('../utils/mailer');
const { portalOAuthEnabled } = require('../utils/portal-oauth');
const { isDisposableEmail } = require('../lib/disposable-emails');

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
  // Session regeneration wipes everything, including the locale a visitor
  // picked before signing in — capture it first, then restore/persist it.
  const preLoginLocale = req.session.locale;
  await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
  req.session.customerId = customer.id;
  req.session.customerEmail = customer.email;
  req.session.locale = customer.preferred_language || preLoginLocale || undefined;
  req.session.cookie.maxAge = persist ? CUSTOMER_SESSION_MS : null;
  await db.query('UPDATE customers SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [customer.id]);
  if (!customer.preferred_language && preLoginLocale) {
    // First sign-in with a pre-login language choice: make it the account
    // preference. Non-fatal — login must never fail over this.
    try {
      await db.query('UPDATE customers SET preferred_language = $1 WHERE id = $2', [preLoginLocale, customer.id]);
    } catch (e) {
      console.warn('Portal: failed to persist language preference:', e.message);
    }
  }
  await linkOrdersByEmail(customer.id, customer.email);
  // Persist before the caller redirects: express-session's end-of-response
  // auto-save is fire-and-forget, so without this the browser can follow
  // the redirect and hit requireCustomer before the store write lands —
  // bouncing a freshly signed-in customer back to the login page.
  await new Promise((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
}

// Mint a single-use magic-link token and email it. The one token path for
// self-serve login, admin invites and public portal signups alike.
async function issueLoginLink(customer, locale = 'en') {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    'INSERT INTO customer_login_tokens (customer_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [customer.id, hashToken(token), new Date(Date.now() + TOKEN_TTL_MS)]
  );
  return sendMagicLink(customer.email, `${PORTAL_BASE()}/portal/auth?token=${token}`, locale);
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
  message: (req) => req.t('login.rateLimited')
});

// ── Login ───────────────────────────────────────────────────────

// Social buttons render only for providers whose portal strategy is
// registered (env credentials present) — never dead decoration.
const socialFlags = () => ({
  googleEnabled: portalOAuthEnabled('google'),
  facebookEnabled: portalOAuthEnabled('facebook'),
});

router.get('/login', (req, res) => {
  if (req.session.customerId) return res.redirect('/portal');
  // Bot timing base: humans read the form before submitting; the POST
  // treats a near-instant magic-link submit as automation.
  req.session.portalFormAt = Date.now();
  res.render('portal/login', { title: req.t('login.title'), sent: false, email: '', ...socialFlags() });
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
      title: req.t('login.title'), sent: false, email: email || '',
      error: req.t('login.errorInvalidCreds'), ...socialFlags()
    });
  }

  // Magic-link flow. Always render the same "check your email" page — never
  // reveal whether an address exists (no account enumeration).
  if (!email) {
    return res.render('portal/login', { title: req.t('login.title'), sent: true, email: String(req.body.email || '').slice(0, 100) });
  }
  // Bot filters get the same neutral page — a filled honeypot, a submit
  // faster than any human reads a form, or a throwaway inbox creates no
  // account and sends no email, and the response never says so. This is
  // the account-creation path, so it carries the friction; password
  // sign-in above can't create anything.
  const tooFast = typeof req.session.portalFormAt === 'number' &&
    Date.now() - req.session.portalFormAt < 1500;
  if (req.body.website || tooFast || isDisposableEmail(email)) {
    return res.render('portal/login', { title: req.t('login.title'), sent: true, email });
  }
  try {
    const customer = await upsertCustomer(email, null);
    await issueLoginLink(customer, req.locale);
  } catch (e) {
    console.error('Portal login error:', e);
    // Fall through to the neutral response.
  }
  res.render('portal/login', { title: req.t('login.title'), sent: true, email });
});

// ── Magic-link verification ─────────────────────────────────────

router.get('/auth', loginLimiter, async (req, res) => {
  const token = String(req.query.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).render('portal/login', { title: req.t('login.title'), sent: false, email: '', error: req.t('login.errorLinkInvalid') });
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
      return res.status(400).render('portal/login', { title: req.t('login.title'), sent: false, email: '', error: req.t('login.errorLinkExpired') });
    }
    const customerId = result.rows[0].customer_id;
    const customer = (await db.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];
    if (!customer || customer.status !== 'active') {
      return res.status(403).render('portal/login', { title: req.t('login.title'), sent: false, email: '', error: req.t('login.errorInactive') });
    }

    await establishCustomerSession(req, customer);
    res.redirect('/portal');
  } catch (e) {
    console.error('Portal auth error:', e);
    res.status(500).render('portal/login', { title: req.t('login.title'), sent: false, email: '', error: req.t('login.errorGeneric') });
  }
});

// ── Social sign-in (optional, beside the magic link) ────────────
//
// { session:false } throughout: portal identity is req.session.customerId,
// never a passport user — a client can never surface inside the admin.
// The provider proves mailbox/account ownership (its own bot defenses
// included); account rules stay here: disposable domains are refused and
// deactivated customers stay out.

const PORTAL_OAUTH_PROVIDERS = ['google', 'facebook'];
const OAUTH_SCOPES = { google: ['profile', 'email'], facebook: ['email', 'public_profile'] };

router.get('/auth/:provider', loginLimiter, (req, res, next) => {
  const provider = req.params.provider;
  if (!PORTAL_OAUTH_PROVIDERS.includes(provider) || !portalOAuthEnabled(provider)) {
    return res.redirect('/portal/login');
  }
  passport.authenticate(`portal-${provider}`, { session: false, scope: OAUTH_SCOPES[provider] })(req, res, next);
});

router.get('/auth/:provider/callback', loginLimiter, (req, res, next) => {
  const provider = req.params.provider;
  if (!PORTAL_OAUTH_PROVIDERS.includes(provider) || !portalOAuthEnabled(provider)) {
    return res.redirect('/portal/login');
  }
  passport.authenticate(`portal-${provider}`, { session: false }, async (err, identity) => {
    const fail = (msg) => res.status(401).render('portal/login', {
      title: req.t('login.title'), sent: false, email: '', error: msg, ...socialFlags(),
    });
    if (err) {
      console.error(`Portal ${provider} OAuth error:`, err.message || err);
      return fail(req.t('login.errorSocial'));
    }
    if (!identity || !identity.email) return fail(req.t('login.errorSocialEmail'));
    if (isDisposableEmail(identity.email)) return fail(req.t('login.errorSocial'));
    try {
      const customer = await upsertCustomer(identity.email, identity.name);
      if (customer.status !== 'active') return fail(req.t('login.errorInactive'));
      await establishCustomerSession(req, customer);
      return res.redirect('/portal');
    } catch (e) {
      console.error(`Portal ${provider} sign-in failed:`, e);
      return fail(req.t('login.errorGeneric'));
    }
  })(req, res, next);
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
      title: req.t('dashboard.title'),
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
    res.status(500).render('portal/error', { title: req.t('errors.serverErrorTitle'), message: req.t('dashboard.loadError'), code: 500 });
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
      title: req.t('billing.title'),
      orders: rows,
      totals,
      awaitingCount: awaiting.length,
      subscriptions: rows.filter((o) => o.pricing_type === 'subscription' && o.status === 'completed')
    });
  } catch (e) {
    console.error('Portal billing error:', e);
    res.status(500).render('portal/error', { title: req.t('errors.serverErrorTitle'), message: req.t('billing.loadError'), code: 500 });
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
      title: req.t('files.title'),
      files: files.rows
    });
  } catch (e) {
    console.error('Portal files error:', e);
    res.status(500).render('portal/error', { title: req.t('errors.serverErrorTitle'), message: req.t('files.loadError'), code: 500 });
  }
});

// Scoped to the signed-in customer — an id belonging to someone else 404s,
// so deliverable ids can never be enumerated across accounts.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/files/:id/download', requireCustomer, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(404).render('portal/error', { title: req.t('errors.notFoundTitle'), message: req.t('files.notFound'), code: 404 });
    }
    const result = await db.query(
      'SELECT * FROM deliverables WHERE id = $1 AND customer_id = $2',
      [req.params.id, req.session.customerId]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).render('portal/error', { title: req.t('errors.notFoundTitle'), message: req.t('files.notFound'), code: 404 });

    if (file.external_url) {
      try {
        const url = new URL(file.external_url);
        if (url.protocol === 'http:' || url.protocol === 'https:') return res.redirect(file.external_url);
      } catch (_) { /* fall through to 404 */ }
      return res.status(404).render('portal/error', { title: req.t('errors.notFoundTitle'), message: req.t('files.linkInvalid'), code: 404 });
    }

    if (!file.file_data) return res.status(404).render('portal/error', { title: req.t('errors.notFoundTitle'), message: req.t('files.noContent'), code: 404 });
    const safeName = String(file.file_name || 'download').replace(/[^\w.\- ]+/g, '_');
    res.set({
      'Content-Type': file.file_mime || 'application/octet-stream',
      'Content-Length': file.file_data.length,
      'Content-Disposition': `attachment; filename="${safeName}"`
    });
    res.send(file.file_data);
  } catch (e) {
    console.error('Portal file download error:', e);
    res.status(500).render('portal/error', { title: req.t('errors.serverErrorTitle'), message: req.t('files.downloadError'), code: 500 });
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
      title: req.t('profile.title'),
      customer: result.rows[0],
      saved: false
    });
  } catch (e) {
    console.error('Portal profile error:', e);
    res.status(500).render('portal/error', { title: req.t('errors.serverErrorTitle'), message: req.t('profile.loadError'), code: 500 });
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

    // Language preference: only the two supported values are accepted;
    // anything else (or no select at all) leaves the stored preference alone.
    const language = (req.body.language === 'en' || req.body.language === 'th') ? req.body.language : null;

    // Optional password change: both fields must match, minimum 8 chars.
    // Leaving them blank keeps the current setting (including "no password").
    const newPassword = typeof req.body.new_password === 'string' ? req.body.new_password : '';
    const confirm = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';
    let passwordHash;
    if (newPassword || confirm) {
      if (newPassword.length < 8) {
        return res.status(400).render('portal/profile', {
          title: req.t('profile.title'), customer: { ...customer, name, company, phone },
          saved: false, error: req.t('profile.passwordTooShort')
        });
      }
      if (newPassword !== confirm) {
        return res.status(400).render('portal/profile', {
          title: req.t('profile.title'), customer: { ...customer, name, company, phone },
          saved: false, error: req.t('profile.passwordMismatch')
        });
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await db.query(
      `UPDATE customers SET
         name = $1, company = $2, phone = $3,
         password_hash = COALESCE($4, password_hash),
         preferred_language = COALESCE($5, preferred_language),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, company, phone, passwordHash || null, language, customer.id]
    );
    if (language) req.session.locale = language;
    res.render('portal/profile', {
      title: req.t('profile.title'),
      customer: updated.rows[0],
      saved: true,
      passwordChanged: !!passwordHash
    });
  } catch (e) {
    console.error('Portal profile update error:', e);
    res.status(500).render('portal/error', { title: req.t('errors.serverErrorTitle'), message: req.t('profile.saveError'), code: 500 });
  }
});

// ── AI Marketing Strategist chat ────────────────────────────────

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PORTAL_CHAT_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({ error: req.t('chat.rateLimited') })
});

router.get('/chat', requireCustomer, (req, res) => {
  const strategist = require('../utils/strategist');
  res.render('portal/chat', {
    title: req.t('chat.title'),
    enabled: strategist.isConfigured(),
    history: (req.session.chatHistory || []).slice(-12)
  });
});

router.post('/chat', requireCustomer, chatLimiter, async (req, res) => {
  const strategist = require('../utils/strategist');
  if (!strategist.isConfigured()) {
    return res.status(503).json({ error: req.t('chat.unavailable') });
  }
  const message = String(req.body.message || '').trim().slice(0, 2000);
  if (!message) return res.status(400).json({ error: req.t('chat.emptyMessage') });
  try {
    if (!Array.isArray(req.session.chatHistory)) req.session.chatHistory = [];
    const reply = await strategist.chatReply(req.session.customerId, req.session.chatHistory, message);
    req.session.chatHistory = req.session.chatHistory
      .concat([{ role: 'user', content: message }, { role: 'assistant', content: reply }])
      .slice(-12);
    res.json({ reply });
  } catch (e) {
    console.error('Portal chat error:', e.status || '', e.message);
    res.status(502).json({ error: req.t('chat.upstreamError') });
  }
});

// ── Partner programs (affiliate / dropship / white label) ───────
//
// Enrollment is self-serve but capability is not: applications land in
// 'pending' and a human approves them in the admin (/partners). Account
// creation stays cheap; anything that can earn money is gated on a person
// saying yes — that, not a CAPTCHA, is the real bot barrier.

const PARTNER_PROGRAMS = ['affiliate', 'dropship', 'white_label'];

router.get('/programs', requireCustomer, async (req, res) => {
  try {
    const rows = (await db.query(
      `SELECT program, status, note, admin_note, updated_at
       FROM partner_enrollments WHERE customer_id = $1`,
      [req.session.customerId]
    )).rows;
    res.render('portal/programs', {
      title: req.t('programs.title'),
      programs: PARTNER_PROGRAMS,
      byProgram: Object.fromEntries(rows.map((r) => [r.program, r])),
    });
  } catch (e) {
    console.error('Portal programs error:', e);
    res.status(500).render('portal/error', { title: req.t('errors.title'), message: req.t('errors.generic') });
  }
});

router.post('/programs/enroll', requireCustomer, async (req, res) => {
  const program = String(req.body.program || '');
  if (!PARTNER_PROGRAMS.includes(program)) return res.redirect('/portal/programs');
  const note = String(req.body.note || '').trim().slice(0, 1000) || null;
  try {
    // First application creates 'pending'; re-applying after a rejection
    // reopens it; active/suspended/pending states never self-serve flip.
    await db.query(
      `INSERT INTO partner_enrollments (customer_id, program, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, program) DO UPDATE
         SET note = COALESCE(EXCLUDED.note, partner_enrollments.note),
             status = CASE WHEN partner_enrollments.status = 'rejected' THEN 'pending'
                           ELSE partner_enrollments.status END,
             updated_at = CURRENT_TIMESTAMP`,
      [req.session.customerId, program, note]
    );
    try {
      const core = require('../lib/translation-core');
      await core.notifySuperAdmins(
        'Partner application',
        `${req.session.customerEmail} applied to the ${program.replace('_', ' ')} program.`,
        '/partners'
      );
    } catch (e) {
      console.warn('Partner application notification failed:', e.message);
    }
  } catch (e) {
    console.error('Partner enrollment failed:', e);
  }
  res.redirect('/portal/programs');
});

router.post('/logout', requireCustomer, (req, res) => {
  req.session.destroy(() => res.redirect('/portal/login'));
});

module.exports = router;
module.exports.upsertCustomer = upsertCustomer;
module.exports.linkOrdersByEmail = linkOrdersByEmail;
module.exports.issueLoginLink = issueLoginLink;
module.exports.establishCustomerSession = establishCustomerSession;
