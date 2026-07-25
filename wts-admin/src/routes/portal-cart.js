// Portal cart — pick parts across the catalog, pay one total (plan §5 1.0–1.5).
//
// Mounted at /portal/cart from src/routes/portal.js. Same auth model as the
// rest of the portal: a signed-in customer is req.session.customerId and
// nothing else. saved_services is the cart's storage (pre-purchase only);
// prices are resolved server-side from the products table on every render —
// nothing price-shaped is ever trusted from the client.
//
// Kill-switch: FEATURE_CART=0 disables the routes (nav hides itself via
// res.locals.featureCart, set in portal.js).

const express = require('express');
const crypto = require('crypto');
const db = require('../../database/db');
const {
  normalizeTiers,
  unitPriceForQuantity,
  normalizePriceOptions,
  findPriceOption,
} = require('../utils/pricing');

const router = express.Router();

const PORTAL_BASE = () => (process.env.PORTAL_URL || process.env.APP_ADMIN_URL || 'https://admin.wordsthatsells.website').replace(/\/$/, '');
const WHATSAPP_NUMBER = '8562055528034'; // D6 — same constant as the marketing site

const cartEnabled = () => process.env.FEATURE_CART !== '0';

const requireCustomer = (req, res, next) => {
  if (req.session && req.session.customerId) return next();
  return res.redirect('/portal/login');
};

router.use((req, res, next) => {
  if (!cartEnabled()) return res.redirect('/portal');
  next();
});
router.use(requireCustomer);

// Lazy-load Stripe exactly like src/routes/payments.js.
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const num = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

// ── Cart resolution ─────────────────────────────────────────────
//
// Turns saved_services rows into classified, priced lines:
//   payable — buy products, INCLUDING subscriptions: everything pays as one
//             total in one Stripe session (mode=subscription when recurring
//             lines are present; Stripe allows one-time lines alongside, as
//             long as every recurring line shares one billing interval)
//   quote   — consult products, and buy products without a valid price
// A payable options-product without a chosen option is kept in `payable`
// with needs_choice=true so the view can render its picker; checkout
// refuses until every payable line is resolved.
async function resolveCart(customerId) {
  const rows = (await db.query(
    `SELECT s.product_id, s.billing_period, s.option_key, s.quantity AS line_qty,
            s.quote_requested_at,
            p.name, p.slug, p.service_page, p.purchase_mode, p.pricing_type,
            p.product_type, p.price, p.price_unit, p.currency, p.sku,
            p.price_options, p.quantity_tiers, p.monthly_price, p.yearly_price,
            p.default_billing, p.setup_fee, p.setup_fee_label
     FROM saved_services s
     JOIN products p ON p.id = s.product_id AND p.status = 'active'
     WHERE s.customer_id = $1
     ORDER BY s.created_at`,
    [customerId]
  )).rows;

  const payable = [];
  const quote = [];

  for (const r of rows) {
    const base = {
      product_id: r.product_id,
      name: r.name,
      slug: r.slug,
      service_page: r.service_page,
      currency: r.currency || 'USD',
      sku: r.sku || null,
      option_key: r.option_key || null,
      quote_requested_at: r.quote_requested_at || null,
      price_unit: r.price_unit || 'fixed',
    };
    const isSubscription = r.pricing_type === 'subscription' || r.product_type === 'subscription';

    if ((r.purchase_mode || 'consult') !== 'buy') {
      quote.push({ ...base, kind: 'quote' });
      continue;
    }
    if (isSubscription) {
      const monthly = num(r.monthly_price);
      const yearly = num(r.yearly_price);
      if (monthly == null && yearly == null) { quote.push({ ...base, kind: 'quote' }); continue; }
      let period = (r.billing_period === 'yearly' || r.billing_period === 'monthly')
        ? r.billing_period
        : (r.default_billing === 'yearly' ? 'yearly' : 'monthly');
      if (period === 'monthly' && monthly == null) period = 'yearly';
      if (period === 'yearly' && yearly == null) period = 'monthly';
      const recurring = period === 'yearly' ? yearly : monthly;
      const setupFee = num(r.setup_fee) || 0;
      payable.push({
        ...base,
        kind: 'subscription',
        billing_period: period,
        has_both: monthly != null && yearly != null,
        monthly_price: monthly,
        yearly_price: yearly,
        interval: period === 'yearly' ? 'year' : 'month',
        recurring_price: recurring,
        setup_fee: setupFee,
        setup_fee_label: r.setup_fee_label || null,
        quantity: 1,
        unit_price: recurring,
        // First payment: the period price plus the one-time setup fee.
        amount: Math.round((recurring + setupFee) * 100) / 100,
      });
      continue;
    }
    if (r.pricing_type === 'options') {
      const options = normalizePriceOptions(r.price_options);
      const chosen = findPriceOption(r.price_options, r.option_key);
      if (!options.length) { quote.push({ ...base, kind: 'quote' }); continue; }
      payable.push({
        ...base,
        kind: 'options',
        options: options.map((o) => ({ key: o.key, label: o.label, price: num(o.price) })),
        needs_choice: !chosen,
        option_label: chosen ? chosen.label : null,
        quantity: 1,
        unit_price: chosen ? num(chosen.price) : null,
        amount: chosen ? num(chosen.price) : null,
        option_sku: chosen ? (chosen.sku || null) : null,
      });
      continue;
    }
    if (r.pricing_type === 'tiered') {
      const tiers = normalizeTiers(r.quantity_tiers);
      if (!tiers.length) { quote.push({ ...base, kind: 'quote' }); continue; }
      const minQty = tiers[0].min_qty || 1;
      const qty = Math.max(minQty, parseInt(r.line_qty, 10) || minQty);
      const unit = unitPriceForQuantity(tiers, qty);
      if (!(unit > 0)) { quote.push({ ...base, kind: 'quote' }); continue; }
      payable.push({
        ...base,
        kind: 'tiered',
        min_qty: minQty,
        quantity: qty,
        unit_price: unit,
        amount: Math.round(unit * qty * 100) / 100,
      });
      continue;
    }
    // One-time (incl. per-hour/per-item rates — quantity applies when set)
    const unit = num(r.price);
    if (!(unit > 0)) { quote.push({ ...base, kind: 'quote' }); continue; }
    const qty = Math.max(1, parseInt(r.line_qty, 10) || 1);
    const useQty = r.price_unit === 'hour' || r.price_unit === 'item' ? qty : 1;
    payable.push({
      ...base,
      kind: 'one_time',
      quantity: useQty,
      unit_price: unit,
      amount: Math.round(unit * useQty * 100) / 100,
    });
  }

  const resolved = payable.filter((l) => !l.needs_choice && l.amount != null);
  const currencies = [...new Set(resolved.map((l) => l.currency))];
  const total = currencies.length === 1
    ? Math.round(resolved.reduce((s, l) => s + l.amount, 0) * 100) / 100
    : null;
  // Recurring summary ("then $X/mo") + the one-interval constraint Stripe
  // puts on a mixed session: >1 distinct interval blocks checkout until the
  // customer aligns billing periods with the per-line selector.
  const subLines = resolved.filter((l) => l.kind === 'subscription');
  const intervals = [...new Set(subLines.map((l) => l.interval))];
  const recurring = intervals.map((iv) => ({
    interval: iv,
    sum: Math.round(subLines.filter((l) => l.interval === iv).reduce((s, l) => s + l.recurring_price, 0) * 100) / 100,
  }));

  return {
    payable,
    quote,
    resolved,
    currencies,
    total,
    currency: currencies.length === 1 ? currencies[0] : null,
    itemCount: rows.length,
    intervals,
    recurring,
  };
}

// WhatsApp handoff carrying the basket (plan §5 1.4). Text is built
// server-side so the client walks into the chat with the list written out.
function waCartLink(lines, locale) {
  const items = lines.map((l) => '- ' + l.name +
    (l.option_label ? ' (' + l.option_label + ')' : '') +
    (l.quantity > 1 ? ' × ' + l.quantity : '')).join('\n');
  const intro = locale === 'th'
    ? 'สวัสดี! ต้องการใบเสนอราคาสำหรับรายการเหล่านี้:\n'
    : 'Hello! I would like a quote for these items from my cart:\n';
  return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(intro + items);
}

// ── Routes ──────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const cart = await resolveCart(req.session.customerId);
    res.render('portal/cart', {
      title: req.t('cart.title'),
      cart,
      waQuoteLink: waCartLink(cart.quote, req.locale),
      notice: {
        updated: req.query.updated === '1',
        removed: req.query.removed === '1',
        quoted: req.query.quoted === '1',
        incomplete: req.query.incomplete === '1',
        mixed: req.query.mixed === '1',
        mixedcycle: req.query.mixedcycle === '1',
        payerr: req.query.payerr === '1',
        cancelled: req.query.cancelled === '1',
      },
    });
  } catch (e) {
    console.error('Portal cart error:', e);
    res.status(500).render('portal/error', { title: req.t('errors.serverErrorTitle'), message: req.t('cart.loadError'), code: 500 });
  }
});

// Update a line's option/quantity. Values are validated against the
// product's actual price shape — an option key that doesn't exist or a
// quantity below the tier minimum is corrected, not trusted.
router.post('/items/:productId', async (req, res) => {
  try {
    const product = (await db.query(
      "SELECT id, pricing_type, price_options, quantity_tiers, price_unit, monthly_price, yearly_price FROM products WHERE id = $1 AND status = 'active'",
      [req.params.productId]
    )).rows[0];
    if (!product) return res.redirect('/portal/cart');

    let optionKey = null;
    if (product.pricing_type === 'options') {
      const chosen = findPriceOption(product.price_options, String(req.body.option_key || ''));
      optionKey = chosen ? chosen.key : null;
    }
    let quantity = null;
    const qtyNum = parseInt(req.body.quantity, 10);
    if (product.pricing_type === 'tiered') {
      const tiers = normalizeTiers(product.quantity_tiers);
      const minQty = tiers.length ? (tiers[0].min_qty || 1) : 1;
      quantity = Math.min(9999, Math.max(minQty, Number.isFinite(qtyNum) ? qtyNum : minQty));
    } else if (product.price_unit === 'hour' || product.price_unit === 'item') {
      quantity = Math.min(9999, Math.max(1, Number.isFinite(qtyNum) ? qtyNum : 1));
    }
    // Billing-cycle choice for subscription lines — only periods the product
    // actually prices are accepted (this is also how a customer aligns
    // cycles when the mixed-interval notice appears).
    let billing = null;
    if (req.body.billing_period === 'monthly' && product.monthly_price != null) billing = 'monthly';
    if (req.body.billing_period === 'yearly' && product.yearly_price != null) billing = 'yearly';

    await db.query(
      `UPDATE saved_services
         SET option_key = COALESCE($1, option_key),
             quantity = COALESCE($2, quantity),
             billing_period = COALESCE($3, billing_period)
       WHERE customer_id = $4 AND product_id = $5`,
      [optionKey, quantity, billing, req.session.customerId, req.params.productId]
    );
    res.redirect('/portal/cart?updated=1');
  } catch (e) {
    console.error('Cart item update error:', e);
    res.redirect('/portal/cart');
  }
});

// JSON add — used by the AI strategist's suggestion cards in /portal/chat
// (CSRF via the X-CSRF-Token header, same as the chat POST itself).
router.post('/items/:productId/add', express.json(), async (req, res) => {
  try {
    const product = (await db.query(
      "SELECT id FROM products WHERE id = $1 AND status = 'active'",
      [req.params.productId]
    )).rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });
    await db.query(
      `INSERT INTO saved_services (customer_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (customer_id, product_id) DO NOTHING`,
      [req.session.customerId, req.params.productId]
    );
    const count = (await db.query(
      'SELECT COUNT(*)::int AS n FROM saved_services WHERE customer_id = $1',
      [req.session.customerId]
    )).rows[0].n;
    res.json({ ok: true, cartCount: count });
  } catch (e) {
    console.error('Cart JSON add error:', e);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

router.post('/items/:productId/remove', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM saved_services WHERE customer_id = $1 AND product_id = $2',
      [req.session.customerId, req.params.productId]
    );
    res.redirect('/portal/cart?removed=1');
  } catch (e) {
    console.error('Cart item remove error:', e);
    res.redirect('/portal/cart');
  }
});

// Pay the total: one Stripe Checkout session with every resolved payable
// line, one order row per line sharing a cart_id (plan §5 1.3).
router.post('/checkout', async (req, res) => {
  try {
    const cart = await resolveCart(req.session.customerId);
    if (!cart.resolved.length || cart.payable.some((l) => l.needs_choice)) {
      return res.redirect('/portal/cart?incomplete=1');
    }
    if (cart.currencies.length !== 1) {
      return res.redirect('/portal/cart?mixed=1');
    }
    // Stripe allows recurring + one-time lines in ONE session only when all
    // recurring lines share a billing interval; the cart view's per-line
    // cycle selector is how the customer aligns them.
    if (cart.intervals.length > 1) {
      return res.redirect('/portal/cart?mixedcycle=1');
    }
    const stripe = getStripe();
    if (!stripe) return res.redirect('/portal/cart?payerr=1');

    const customer = (await db.query(
      'SELECT id, email, name FROM customers WHERE id = $1', [req.session.customerId]
    )).rows[0];
    if (!customer) {
      req.session.destroy(() => {});
      return res.redirect('/portal/login');
    }

    const currency = cart.currency.toLowerCase();
    const cartId = crypto.randomUUID();
    const base = PORTAL_BASE();

    const hasSubs = cart.resolved.some((l) => l.kind === 'subscription');
    const lineItems = cart.resolved.map((l) => {
      const name = l.option_label ? `${l.name} — ${l.option_label}` : l.name;
      if (l.kind === 'subscription') {
        return {
          price_data: {
            currency,
            product_data: { name },
            recurring: { interval: l.interval },
            unit_amount: Math.round(l.recurring_price * 100),
          },
          quantity: 1,
        };
      }
      return {
        price_data: {
          currency,
          product_data: { name },
          unit_amount: Math.round(l.unit_price * 100),
        },
        quantity: l.quantity,
      };
    });
    // Subscription setup fees ride the first invoice as one-time lines,
    // mirroring the single-product flow in routes/payments.js.
    for (const l of cart.resolved) {
      if (l.kind === 'subscription' && l.setup_fee > 0) {
        lineItems.push({
          price_data: {
            currency,
            product_data: { name: `${l.name} — ${l.setup_fee_label || 'Setup fee'} (one-time)` },
            unit_amount: Math.round(l.setup_fee * 100),
          },
          quantity: 1,
        });
      }
    }

    const sessionConfig = {
      payment_method_types: ['card'],
      mode: hasSubs ? 'subscription' : 'payment',
      customer_email: customer.email,
      line_items: lineItems,
      success_url: `${base}/portal/cart/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/portal/cart?cancelled=1`,
      metadata: {
        wts_kind: 'cart',
        cart_id: cartId,
        item_count: String(cart.resolved.length),
      },
    };
    if (req.session.locale === 'th') sessionConfig.locale = 'th';

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // One order row per line — billing and fulfillment stay per-product;
    // the shared cart_id groups them (and becomes ONE project in Phase 2).
    for (const l of cart.resolved) {
      await db.query(
        `INSERT INTO orders (product_id, customer_id, customer_email, amount, currency,
                             stripe_session_id, status, sku, quantity, unit_price,
                             payment_method, cart_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, 'stripe', $10, $11)`,
        [
          l.product_id, customer.id, customer.email, l.amount, l.currency,
          session.id, l.option_sku || l.sku, l.quantity, l.unit_price,
          cartId,
          JSON.stringify({
            source: 'portal-cart',
            option_key: l.option_key,
            option_label: l.option_label || null,
            ...(l.kind === 'subscription'
              ? { billing_period: l.billing_period, setup_fee: l.setup_fee || 0 }
              : {}),
          }),
        ]
      );
    }

    res.redirect(303, session.url);
  } catch (e) {
    // Stripe errors carry type/code — log them so a misconfigured key or a
    // rejected session config is diagnosable straight from the deploy logs.
    console.error('Cart checkout error:', e.type || e.name || '', e.code || '', e.message);
    res.redirect('/portal/cart?payerr=1');
  }
});

// Post-payment landing inside the portal. Orders may still be 'pending'
// for a moment until the webhook lands — the view says so honestly.
router.get('/success', async (req, res) => {
  const sessionId = String(req.query.session_id || '');
  if (!sessionId || sessionId.length > 255) return res.redirect('/portal');
  try {
    const orders = (await db.query(
      `SELECT o.id, o.amount, o.currency, o.status, o.quantity, o.unit_price, o.metadata,
              p.name AS product_name
       FROM orders o LEFT JOIN products p ON p.id = o.product_id
       WHERE o.stripe_session_id = $1 AND o.customer_id = $2
       ORDER BY o.created_at`,
      [sessionId, req.session.customerId]
    )).rows;
    if (!orders.length) return res.redirect('/portal');
    const total = Math.round(orders.reduce((s, o) => s + (parseFloat(o.amount) || 0), 0) * 100) / 100;
    res.render('portal/cart-success', {
      title: req.t('cart.successTitle'),
      orders,
      total,
      currency: orders[0].currency || 'USD',
      allCompleted: orders.every((o) => o.status === 'completed'),
      reference: 'WTS-' + String(orders[0].id).replace(/-/g, '').slice(0, 8).toUpperCase(),
    });
  } catch (e) {
    console.error('Cart success error:', e);
    res.redirect('/portal');
  }
});

// One combined quote request for every quote-side line (plan §5 1.4) —
// a single coherent project enquiry in the admin's existing submissions
// inbox, not N fragments.
router.post('/quote', async (req, res) => {
  try {
    const cart = await resolveCart(req.session.customerId);
    if (!cart.quote.length) return res.redirect('/portal/cart');
    const customer = (await db.query(
      'SELECT id, email, name, company, phone FROM customers WHERE id = $1',
      [req.session.customerId]
    )).rows[0];
    if (!customer) {
      req.session.destroy(() => {});
      return res.redirect('/portal/login');
    }

    const note = String(req.body.note || '').trim().slice(0, 2000);
    const items = cart.quote.map((l) => ({ product_id: l.product_id, name: l.name }));
    const message =
      'Quote request from the portal cart:\n' +
      items.map((i) => '- ' + i.name).join('\n') +
      (note ? '\n\nClient note: ' + note : '');

    await db.query(
      `INSERT INTO form_submissions (form_type, name, email, company, phone, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'portal_request',
        customer.name || customer.email,
        customer.email,
        customer.company || null,
        customer.phone || null,
        message,
        JSON.stringify({ kind: 'cart_quote', customer_id: customer.id, items, source: 'portal-cart' }),
      ]
    );
    await db.query(
      `UPDATE saved_services SET quote_requested_at = CURRENT_TIMESTAMP
       WHERE customer_id = $1 AND product_id = ANY($2::uuid[])`,
      [customer.id, items.map((i) => i.product_id)]
    );
    res.redirect('/portal/cart?quoted=1');
  } catch (e) {
    console.error('Cart quote error:', e);
    res.redirect('/portal/cart');
  }
});

module.exports = router;
