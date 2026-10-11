// Paper QR → portal cart.
//
// A printed catalog QR hits GET /q/:token on this same host as the portal
// session cookie. The token is a live product slug or SKU. Guests keep the
// token on the session through login; a signed-in customer is dropped on
// /portal/cart with that line already in saved_services (the existing cart).
// Prices are never taken from the QR — the cart still resolves them from
// the products table.

const TOKEN_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function cartEnabled() {
  return process.env.FEATURE_CART !== '0';
}

function normalizeQrToken(raw) {
  const t = String(raw || '').trim();
  if (!TOKEN_RE.test(t)) return null;
  return t;
}

async function findProductByQrToken(db, token) {
  const t = normalizeQrToken(token);
  if (!t) return null;
  const result = await db.query(
    `SELECT id, slug, sku, name, purchase_mode
       FROM products
      WHERE status = 'active'
        AND (
          lower(slug) = lower($1)
          OR sku = $1
          OR lower(sku) = lower($1)
        )
      LIMIT 1`,
    [t]
  );
  return result.rows[0] || null;
}

async function addProductToCart(db, customerId, productId) {
  await db.query(
    `INSERT INTO saved_services (customer_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (customer_id, product_id) DO NOTHING`,
    [customerId, productId]
  );
}

function stashQrProduct(req, product) {
  req.session.qrAddToken = product.slug;
  req.session.qrAddName = product.name;
}

function captureQrStash(session) {
  if (!session) return { qrAddToken: null, qrAddName: null };
  return {
    qrAddToken: session.qrAddToken || null,
    qrAddName: session.qrAddName || null,
  };
}

function restoreQrStash(session, stash) {
  if (!session || !stash) return;
  if (stash.qrAddToken) session.qrAddToken = stash.qrAddToken;
  if (stash.qrAddName) session.qrAddName = stash.qrAddName;
}

function clearQrStash(session) {
  if (!session) return;
  delete session.qrAddToken;
  delete session.qrAddName;
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// After a customer session exists: put the stashed product in the cart
// and return the redirect path. No stash → portal home.
async function consumeQrAndRedirect(req, db) {
  const token = req.session && req.session.qrAddToken;
  if (!token || !req.session.customerId || !cartEnabled()) {
    clearQrStash(req.session);
    return '/portal';
  }
  const product = await findProductByQrToken(db, token);
  clearQrStash(req.session);
  if (!product) {
    await saveSession(req);
    return '/portal/cart?unknown=1';
  }
  await addProductToCart(db, req.session.customerId, product.id);
  await saveSession(req);
  return '/portal/cart?added=1';
}

module.exports = {
  TOKEN_RE,
  cartEnabled,
  normalizeQrToken,
  findProductByQrToken,
  addProductToCart,
  stashQrProduct,
  captureQrStash,
  restoreQrStash,
  clearQrStash,
  saveSession,
  consumeQrAndRedirect,
};
