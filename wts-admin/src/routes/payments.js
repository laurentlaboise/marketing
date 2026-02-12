const express = require('express');
const db = require('../../database/db');
const cors = require('cors');

const router = express.Router();

// CORS for payment API - allow requests from the main website
router.use(cors({
  origin: [
    'https://wordsthatsells.website',
    'https://www.wordsthatsells.website',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST'],
  credentials: false
}));

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

    const { product_id } = req.body;
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

    if (!product.price || parseFloat(product.price) <= 0) {
      return res.status(400).json({ error: 'Product has no valid price' });
    }

    const baseUrl = process.env.APP_URL || 'https://wordsthatsells.website';

    // Build the checkout session configuration
    const sessionConfig = {
      payment_method_types: ['card'],
      mode: product.product_type === 'subscription' ? 'subscription' : 'payment',
      success_url: `${baseUrl}/en/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/en/checkout/cancel`,
      metadata: {
        product_id: product.id,
        product_name: product.name,
        product_type: product.product_type
      }
    };

    // If the product has a Stripe Price ID, use it directly
    if (product.stripe_price_id) {
      sessionConfig.line_items = [{
        price: product.stripe_price_id,
        quantity: 1
      }];
    } else {
      // Create a one-time price inline
      sessionConfig.line_items = [{
        price_data: {
          currency: (product.currency || 'USD').toLowerCase(),
          product_data: {
            name: product.name,
            description: product.description || undefined,
            images: product.image_url ? [product.image_url] : undefined
          },
          unit_amount: Math.round(parseFloat(product.price) * 100) // Convert to cents
        },
        quantity: 1
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Create order record
    await db.query(
      `INSERT INTO orders (product_id, customer_email, amount, currency, stripe_session_id, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [product.id, 'pending@checkout.com', product.price, product.currency || 'USD', session.id, 'pending']
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

  let event;

  if (endpointSecret) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  } else {
    // If no webhook secret, parse the event directly (for development)
    try {
      event = JSON.parse(req.body);
    } catch (err) {
      return res.status(400).send('Invalid JSON');
    }
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
