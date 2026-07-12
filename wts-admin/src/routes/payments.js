const express = require('express');
const db = require('../../database/db');
const {
  normalizeTiers,
  unitPriceForQuantity,
  normalizePriceOptions,
  findPriceOption,
} = require('../utils/pricing');
const { sendEmail } = require('../utils/mailer');
const { translate } = require('../lib/i18n');
const { upsertCustomer, linkOrdersByEmail } = require('./portal');

const router = express.Router();

const normalizeEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 255 ? email : null;
};

// CORS is handled globally in server.js — no duplicate middleware here

// Lazy-load Stripe to avoid crashes if key is not set
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Create a Stripe checkout session for a product
router.post('/create-checkout-session', express.json(), async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: 'Payment processing is not configured' });
    }

    const { product_id, billing_period, quantity, include_setup_fee, option_key } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: 'product_id is required' });
    }

    // Fetch the product from DB
    const result = await db.query(
      "SELECT * FROM products WHERE id = $1 AND status = 'active'",
      [product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    const num = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

    // A product is a subscription if its pricing_type says so, or (legacy) its product_type does.
    const isSubscription = product.pricing_type === 'subscription' || product.product_type === 'subscription';
    const isOptions = product.pricing_type === 'options';
    const currency = (product.currency || 'USD').toLowerCase();
    const baseUrl = process.env.APP_URL || 'https://wordsthatsells.website';

    // Named options (e.g. Logo Design → AI vs Designer)
    let selectedOption = null;
    if (isOptions) {
      selectedOption = findPriceOption(product.price_options, option_key);
      if (!selectedOption) {
        return res.status(400).json({
          error: 'option_key is required and must match a product price option',
          options: normalizePriceOptions(product.price_options).map((o) => ({
            key: o.key,
            label: o.label,
            price: o.price,
            sku: o.sku,
          })),
        });
      }
    }

    const displayName = selectedOption
      ? `${product.name} — ${selectedOption.label}`
      : product.name;

    const productData = {
      name: displayName,
      description: (selectedOption && selectedOption.description) || product.description || undefined,
      images: product.image_url ? [product.image_url] : undefined
    };

    const sessionConfig = {
      payment_method_types: ['card'],
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: `${baseUrl}/en/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/en/checkout/cancel`,
      metadata: {
        product_id: product.id,
        product_name: product.name,
        product_type: product.product_type,
        ...(selectedOption
          ? {
              option_key: selectedOption.key,
              option_label: selectedOption.label,
              option_strategy: selectedOption.strategy || '',
            }
          : {}),
      }
    };

    // `orderAmount` is recorded on the order row (null when a Stripe Price ID is used).
    let orderAmount = null;
    // SKU, quantity and unit price are stamped onto the order + Stripe metadata
    // so receipts/exports show "SKU × N at $X/ea".
    let orderQuantity = 1;
    let orderUnitPrice = null;

    if (isSubscription) {
      const monthly = num(product.monthly_price);
      const yearly = num(product.yearly_price);

      // Pick the requested period, defaulting to the product's configured default,
      // then fall back to whichever period actually has a price.
      let period = (billing_period === 'yearly' || billing_period === 'monthly')
        ? billing_period
        : (product.default_billing === 'yearly' ? 'yearly' : 'monthly');
      if (period === 'monthly' && monthly === null) period = 'yearly';
      if (period === 'yearly' && yearly === null) period = 'monthly';

      const amount = period === 'yearly' ? yearly : monthly;
      const stripePriceId = period === 'yearly' ? product.stripe_price_id_yearly : product.stripe_price_id_monthly;
      const interval = period === 'yearly' ? 'year' : 'month';
      sessionConfig.metadata.billing_period = period;
      orderUnitPrice = amount;

      if (stripePriceId) {
        sessionConfig.line_items = [{ price: stripePriceId, quantity: 1 }];
      } else {
        if (!(amount > 0)) {
          return res.status(400).json({ error: 'Product has no valid price for the selected billing period' });
        }
        orderAmount = amount;
        sessionConfig.line_items = [{
          price_data: {
            currency,
            product_data: productData,
            recurring: { interval },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }];
      }

      // Optional one-time setup fee (e.g. custom design) billed on the first
      // invoice alongside the subscription. Included by default; the product
      // page lets the customer opt out via include_setup_fee: false.
      const setupFee = num(product.setup_fee);
      const skipSetupFee = include_setup_fee === false || include_setup_fee === 'false';
      if (!skipSetupFee && (setupFee > 0 || product.stripe_price_id_setup)) {
        const feeLabel = product.setup_fee_label || 'Setup fee';
        if (product.stripe_price_id_setup) {
          sessionConfig.line_items.push({ price: product.stripe_price_id_setup, quantity: 1 });
        } else {
          sessionConfig.line_items.push({
            price_data: {
              currency,
              product_data: { name: `${product.name} — ${feeLabel} (one-time)` },
              unit_amount: Math.round(setupFee * 100)
            },
            quantity: 1
          });
        }
        sessionConfig.metadata.setup_fee = setupFee > 0 ? String(setupFee) : 'stripe_price';
        sessionConfig.metadata.setup_fee_label = feeLabel;
        // Keep the recorded order amount in sync when we control both prices.
        if (orderAmount !== null && setupFee > 0) {
          orderAmount = Math.round((orderAmount + setupFee) * 100) / 100;
        }
      }
    } else if (product.pricing_type === 'tiered') {
      // Volume-discount: the unit price depends on the chosen quantity.
      const tiers = normalizeTiers(product.quantity_tiers);
      if (!tiers.length) {
        return res.status(400).json({ error: 'Product has no valid quantity pricing' });
      }
      const minQty = tiers[0].min_qty || 1;
      const qty = Math.max(minQty, parseInt(quantity, 10) || minQty);
      const unitPrice = unitPriceForQuantity(tiers, qty);
      if (!(unitPrice > 0)) {
        return res.status(400).json({ error: 'Product has no valid price for that quantity' });
      }
      orderAmount = Math.round(unitPrice * qty * 100) / 100;
      orderQuantity = qty;
      orderUnitPrice = unitPrice;
      sessionConfig.line_items = [{
        price_data: {
          currency,
          product_data: productData,
          unit_amount: Math.round(unitPrice * 100)
        },
        quantity: qty
      }];
    } else if (isOptions && selectedOption) {
      // Named options: one product, multiple price points / SKUs
      const amount = num(selectedOption.price);
      orderUnitPrice = amount;
      orderQuantity = 1;
      if (selectedOption.stripe_price_id) {
        sessionConfig.line_items = [{ price: selectedOption.stripe_price_id, quantity: 1 }];
      } else {
        if (!(amount > 0)) {
          return res.status(400).json({ error: 'Selected option has no valid price' });
        }
        orderAmount = amount;
        sessionConfig.line_items = [{
          price_data: {
            currency,
            product_data: productData,
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }];
      }
    } else {
      // One-time purchase
      const amount = num(product.price);
      orderUnitPrice = amount;
      if (product.stripe_price_id) {
        sessionConfig.line_items = [{ price: product.stripe_price_id, quantity: 1 }];
      } else {
        if (!(amount > 0)) {
          return res.status(400).json({ error: 'Product has no valid price' });
        }
        orderAmount = amount;
        sessionConfig.line_items = [{
          price_data: {
            currency,
            product_data: productData,
            unit_amount: Math.round(amount * 100) // Convert to cents
          },
          quantity: 1
        }];
      }
    }

    // Stamp SKU + quantity + unit price onto the session metadata (shows on the
    // Stripe dashboard / receipts) and the order row.
    sessionConfig.metadata.sku = (selectedOption && selectedOption.sku) || product.sku || '';
    sessionConfig.metadata.quantity = String(orderQuantity);
    if (orderUnitPrice != null) sessionConfig.metadata.unit_price = String(orderUnitPrice);

    // Stripe supports Thai natively — setting the locale localizes the
    // hosted checkout UI and receipts for free. Only set it for Thai
    // visitors; otherwise leave it unset so Stripe auto-detects.
    if (req.session && req.session.locale === 'th') {
      sessionConfig.locale = 'th';
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Create order record
    await db.query(
      `INSERT INTO orders (product_id, customer_email, amount, currency, stripe_session_id, status, sku, quantity, unit_price, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'stripe')`,
      [product.id, 'pending@checkout.com', orderAmount, product.currency || 'USD', session.id, 'pending',
       product.sku || null, orderQuantity, orderUnitPrice]
    );

    res.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create an order for a BCEL OnePay QR payment (Laos). There is no gateway
// callback for a scanned merchant QR, so the flow is: record the order as
// awaiting_payment, hand the customer a short reference to put in the
// transfer note, and match it manually in the BCEL One statement.
router.post('/bcel-order', express.json(), async (req, res) => {
  try {
    const { product_id, billing_period, quantity, include_setup_fee, customer_email } = req.body;
    if (!product_id) {
      return res.status(400).json({ error: 'product_id is required' });
    }

    const result = await db.query(
      "SELECT * FROM products WHERE id = $1 AND status = 'active'",
      [product_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = result.rows[0];
    // Manual price-point options, falling back to the legacy single QR.
    const bcelOptions = (Array.isArray(product.bcel_options) ? product.bcel_options : [])
      .filter((o) => o && o.qr_url);
    if (!bcelOptions.length && product.bcel_qr_url) {
      bcelOptions.push({ label: '', lak: product.price_lak, qr_url: product.bcel_qr_url });
    }
    if (!bcelOptions.length) {
      return res.status(400).json({ error: 'This product does not accept BCEL OnePay' });
    }

    const num = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

    // Total in the product's own currency, mirroring the Stripe branch.
    let amount = null;
    let orderQuantity = 1;
    let unitPrice = null;
    let period = null;
    const isSubscription = product.pricing_type === 'subscription' || product.product_type === 'subscription';

    if (isSubscription) {
      const monthly = num(product.monthly_price);
      const yearly = num(product.yearly_price);
      period = (billing_period === 'yearly' || billing_period === 'monthly')
        ? billing_period
        : (product.default_billing === 'yearly' ? 'yearly' : 'monthly');
      if (period === 'monthly' && monthly === null) period = 'yearly';
      if (period === 'yearly' && yearly === null) period = 'monthly';
      amount = period === 'yearly' ? yearly : monthly;
      unitPrice = amount;
      const setupFee = num(product.setup_fee);
      const skipSetupFee = include_setup_fee === false || include_setup_fee === 'false';
      if (!skipSetupFee && setupFee > 0 && amount !== null) {
        amount = Math.round((amount + setupFee) * 100) / 100;
      }
    } else if (product.pricing_type === 'tiered') {
      const tiers = normalizeTiers(product.quantity_tiers);
      if (!tiers.length) {
        return res.status(400).json({ error: 'Product has no valid quantity pricing' });
      }
      const minQty = tiers[0].min_qty || 1;
      orderQuantity = Math.max(minQty, parseInt(quantity, 10) || minQty);
      unitPrice = unitPriceForQuantity(tiers, orderQuantity);
      amount = unitPrice > 0 ? Math.round(unitPrice * orderQuantity * 100) / 100 : null;
    } else {
      amount = num(product.price);
      unitPrice = amount;
    }

    const priceLak = num(bcelOptions[0].lak != null ? bcelOptions[0].lak : product.price_lak);
    if (!(amount > 0) && !(priceLak > 0)) {
      return res.status(400).json({ error: 'Product has no valid price' });
    }

    const insert = await db.query(
      `INSERT INTO orders (product_id, customer_email, amount, currency, status, sku, quantity, unit_price, payment_method, metadata)
       VALUES ($1, $2, $3, $4, 'awaiting_payment', $5, $6, $7, 'bcel_qr', $8)
       RETURNING id`,
      [
        product.id,
        (customer_email && String(customer_email).trim()) || 'pending@bcel.qr',
        amount, product.currency || 'USD',
        product.sku || null, orderQuantity, unitPrice,
        JSON.stringify({ billing_period: period, price_lak: priceLak, include_setup_fee: include_setup_fee !== false })
      ]
    );

    // Short, human-typeable reference for the BCEL transfer note.
    const reference = 'WTS-' + insert.rows[0].id.replace(/-/g, '').slice(0, 8).toUpperCase();
    await db.query(
      `UPDATE orders SET metadata = metadata || $1 WHERE id = $2`,
      [JSON.stringify({ reference }), insert.rows[0].id]
    );

    res.json({
      order_id: insert.rows[0].id,
      reference,
      amount,
      currency: product.currency || 'USD',
      price_lak: priceLak,
      qr_url: bcelOptions[0].qr_url,
      options: bcelOptions.map((o) => ({ label: o.label || '', lak: num(o.lak), qr_url: o.qr_url })),
      product_name: product.name
    });
  } catch (error) {
    console.error('BCEL order error:', error);
    res.status(500).json({ error: 'Failed to create BCEL order' });
  }
});

// Attach the buyer's email to a BCEL order (entered in the QR modal).
// Creates the portal account so the order is immediately trackable, and
// sends a confirmation carrying the transfer reference.
router.post('/bcel-order/:id/email', express.json(), async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    const result = await db.query(
      `SELECT o.*, p.name AS product_name FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.id = $1 AND o.payment_method = 'bcel_qr' AND o.status = 'awaiting_payment'`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = result.rows[0];

    const customer = await upsertCustomer(email, null);
    await db.query(
      'UPDATE orders SET customer_email = $1, customer_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [email, customer.id, order.id]
    );
    await linkOrdersByEmail(customer.id, email);

    const reference = (order.metadata && order.metadata.reference) || null;
    const portalUrl = (process.env.PORTAL_URL || process.env.APP_ADMIN_URL || 'https://admin.wordsthatsells.website').replace(/\/$/, '') + '/portal';
    // The upserted customer row carries the language preference; fall back
    // to the visitor's session locale, then English.
    const locale = customer.preferred_language
      || (req.session && req.session.locale)
      || 'en';
    const brand = translate(locale, 'emails.shell.brand');
    // Confirmation is best-effort; the order link must succeed regardless.
    sendEmail({
      to: email,
      subject: reference
        ? translate(locale, 'emails.orderReceived.subjectRef', { reference })
        : translate(locale, 'emails.orderReceived.subject', { brand }),
      html: `<p>${order.product_name
          ? translate(locale, 'emails.orderReceived.thanksProduct', { product: '<strong>' + order.product_name + '</strong>' })
          : translate(locale, 'emails.orderReceived.thanks')}</p>` +
        (reference ? `<p>${translate(locale, 'emails.orderReceived.referenceNote')}</p><p style="font-size:1.2rem;font-weight:bold;letter-spacing:0.05em;">${reference}</p>` : '') +
        `<p>${translate(locale, 'emails.orderReceived.track', { portalLink: `<a href="${portalUrl}">${portalUrl}</a>` })}</p>`,
      text: `${translate(locale, 'emails.orderReceived.thanks')}${reference ? ' ' + translate(locale, 'emails.orderReceived.textReference', { reference }) : ''} ${translate(locale, 'emails.orderReceived.textTrack', { portalUrl })}`
    }).catch((e) => console.warn('BCEL confirmation email failed:', e.message));

    res.json({ ok: true });
  } catch (error) {
    console.error('BCEL order email error:', error);
    res.status(500).json({ error: 'Failed to save email' });
  }
});

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Payment processing is not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Fail closed: without the webhook secret we cannot verify the sender,
  // and unverified events could mark arbitrary orders as completed.
  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set — rejecting webhook. Use `stripe listen` locally to obtain a signing secret.');
    return res.status(503).json({ error: 'Webhook verification is not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;

      // Update order status
      await db.query(
        `UPDATE orders SET
          status = 'completed',
          customer_email = $1,
          customer_name = $2,
          stripe_payment_intent = $3,
          updated_at = CURRENT_TIMESTAMP
         WHERE stripe_session_id = $4`,
        [
          session.customer_details?.email || session.customer_email || 'unknown',
          session.customer_details?.name || '',
          session.payment_intent || '',
          session.id
        ]
      );

      // The purchase creates the portal account: upsert the customer by the
      // checkout email and attach their orders. Best-effort — the webhook
      // must acknowledge regardless.
      try {
        const email = normalizeEmail(session.customer_details?.email || session.customer_email);
        if (email) {
          const customer = await upsertCustomer(email, session.customer_details?.name || null);
          await linkOrdersByEmail(customer.id, email);
        }
      } catch (e) {
        console.warn('Stripe webhook customer link failed:', e.message);
      }

      // Gated board deliverable: the checkout session was created by the
      // review board with the asset id in its metadata — flip the asset to
      // 'unlocked' so the client's Download final button goes live.
      let outcome = 'order completed';
      if (session.metadata && session.metadata.wts_kind === 'board_asset' && process.env.FEATURE_WHITEBOARD === '1') {
        try {
          const { unlockBoardAsset } = require('../modules/whiteboard/assets');
          const unlocked = await unlockBoardAsset(session.metadata.board_asset_id);
          outcome = unlocked ? 'order completed + board asset unlocked' : 'order completed; asset not unlocked (missing or not final)';
          if (!unlocked) console.warn('Stripe webhook: board asset not unlocked (missing or not final):', session.metadata.board_asset_id);
        } catch (e) {
          outcome = 'order completed; unlock failed: ' + e.message;
          console.warn('Stripe webhook board-asset unlock failed:', e.message);
        }
      }
      try {
        await db.query(
          'INSERT INTO payment_webhook_events (event_type, stripe_session_id, outcome) VALUES ($1, $2, $3)',
          [event.type, session.id, outcome.slice(0, 200)]
        );
      } catch (e) { /* trail is best-effort */ }
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      await db.query(
        `UPDATE orders SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE stripe_session_id = $1`,
        [session.id]
      );
      try {
        await db.query(
          'INSERT INTO payment_webhook_events (event_type, stripe_session_id, outcome) VALUES ($1, $2, $3)',
          [event.type, session.id, 'order expired']
        );
      } catch (e) { /* trail is best-effort */ }
      break;
    }

    default:
      // Unhandled event type
      break;
  }

  res.json({ received: true });
});

// Check order status (for success page)
router.get('/order-status/:session_id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.*, p.name as product_name, p.download_url, p.product_type
       FROM orders o
       LEFT JOIN products p ON o.product_id = p.id
       WHERE o.stripe_session_id = $1`,
      [req.params.session_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = result.rows[0];
    const responseData = {
      status: order.status,
      product_name: order.product_name,
      product_type: order.product_type,
      amount: order.amount,
      currency: order.currency
    };

    // Only include download URL if order is completed
    if (order.status === 'completed' && order.download_url) {
      responseData.download_url = order.download_url;

      // Increment download count
      await db.query(
        'UPDATE orders SET download_count = download_count + 1 WHERE id = $1',
        [order.id]
      );
    }

    res.json(responseData);
  } catch (error) {
    console.error('Order status error:', error);
    res.status(500).json({ error: 'Failed to check order status' });
  }
});

module.exports = router;
