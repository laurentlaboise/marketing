// Payment provider abstraction for gated board deliverables.
//
// The review-board routes never talk to a payment provider directly — they
// call this module, so swapping Stripe for another gateway (or adding BCEL
// OnePay online flows later) only touches this file. The webhook that flips
// payment_status lives with the other Stripe webhooks in routes/payments.js
// because Stripe signs one endpoint per account; it calls back into
// assets.unlockBoardAsset() rather than duplicating any provider logic here.

const METADATA_KIND = 'board_asset';

function isConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Creates a hosted-checkout session bound to a single board asset.
// Returns { url, sessionId }. Throws if the provider is not configured —
// callers should check isConfigured() first and show a friendly message.
async function createCheckout({ asset, boardId, boardTitle, customerEmail, baseUrl }) {
  if (!isConfigured()) throw new Error('Payment provider is not configured');
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  const name = asset.title || `Final deliverable — ${boardTitle || 'design board'}`;
  const boardUrl = `${baseUrl}/portal/boards/${boardId}`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(Number(asset.price) * 100),
        product_data: {
          name,
          description: 'High-resolution final file, released for download on payment.'
        }
      }
    }],
    metadata: {
      wts_kind: METADATA_KIND,
      board_asset_id: asset.id,
      board_id: boardId
    },
    success_url: `${boardUrl}?paid=1`,
    cancel_url: boardUrl
  });

  return { url: session.url, sessionId: session.id };
}

module.exports = { isConfigured, createCheckout, METADATA_KIND };
