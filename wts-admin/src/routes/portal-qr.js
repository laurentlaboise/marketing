// Public paper-QR door. Mounted at /q from server.js so the printed URL
// is https://admin.wordsthatsells.website/q/{slug} — same host as the
// portal session cookie. Does not invent a second cart.

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../database/db');
const {
  cartEnabled,
  findProductByQrToken,
  addProductToCart,
  stashQrProduct,
  clearQrStash,
  saveSession,
} = require('../lib/portal-qr-cart');

const router = express.Router();

const qrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PORTAL_RATE_LIMIT_MAX) || Number(process.env.AUTH_RATE_LIMIT_MAX) || 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/:token', qrLimiter, async (req, res) => {
  if (!cartEnabled()) return res.redirect('/portal');
  try {
    const product = await findProductByQrToken(db, req.params.token);
    if (!product) {
      clearQrStash(req.session);
      await saveSession(req);
      return res.redirect('/portal/login?qr=unknown');
    }

    if (req.session.customerId) {
      await addProductToCart(db, req.session.customerId, product.id);
      clearQrStash(req.session);
      await saveSession(req);
      return res.redirect('/portal/cart?added=1');
    }

    stashQrProduct(req, product);
    await saveSession(req);
    return res.redirect('/portal/login');
  } catch (e) {
    console.error('Portal QR add error:', e);
    return res.redirect('/portal/login?qr=unknown');
  }
});

module.exports = router;
