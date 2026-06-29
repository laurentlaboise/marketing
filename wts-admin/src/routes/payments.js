const express = require('express');
const db = require('../../database/db');
const { normalizeTiers, unitPriceForQuantity } = require('../utils/pricing');

const router = express.Router();

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

    const { product_id, billing_period, quantity } = req.body;
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
    const currency = (product.currency || 'USD').toLowerCase();
    const baseUrl = process.env.APP_URL || 'https://wordsthatsells.website';

    const productData = {
      name: product.name,
      description: product.description || undefined,
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
        product_type: product.product_type
      }
    };

    // `orderAmount` is recorded on the order row (null when a Stripe Price ID is used).
    let orderAmount = null;

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
      sessionConfig.metadata.quantity = String(qty);
      sessionConfig.metadata.unit_price = String(unitPrice);
      sessionConfig.line_items = [{
        price_data: {
          currency,
          product_data: productData,
          unit_amount: Math.round(unitPrice * 100)
        },
        quantity: qty
      }];
    } else {
      // One-time purchase
      const amount = num(product.price);
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

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Create order record
    await db.query(
      `INSERT INTO orders (product_id, customer_email, amount, currency, stripe_session_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [product.id, 'pending@checkout.com', orderAmount, product.currency || 'USD', session.id, 'pending']
    );

    res.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
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
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      await db.query(
        `UPDATE orders SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE stripe_session_id = $1`,
        [session.id]
      );
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
