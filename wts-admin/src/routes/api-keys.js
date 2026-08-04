// Admin UI for automation API keys (/settings/api-keys).
// Session-authenticated + CSRF-protected (mounted behind ensureAdmin in
// server.js) — so key management needs no master key and no Railway
// visit. Keys minted here are identical to ones minted via POST
// /api/v1/keys: same table, same hashing (src/lib/api-keys.js).
const express = require('express');
const db = require('../../database/db');
const { mintKey } = require('../lib/api-keys');
const { validScopes } = require('./automation-api');

const router = express.Router();

const listKeys = async () => (await db.query(
  `SELECT id, name, key_prefix, scopes, status, expires_at, last_used_at, created_at
   FROM api_keys ORDER BY created_at DESC`
)).rows;

const renderPage = async (res, extras = {}) => {
  res.render('settings/api-keys', {
    title: 'API Keys - WTS Admin',
    currentPage: 'api-keys',
    keys: await listKeys(),
    allScopes: [...validScopes()].sort(),
    newKey: null,
    error: null,
    ...extras,
  });
};

// GET /settings/api-keys — list + create form
router.get('/', async (req, res) => {
  try {
    await renderPage(res);
  } catch (e) {
    console.error('API keys page failed:', e);
    res.status(500).render('error', { title: 'Server Error', message: 'Could not load API keys.', code: 500 });
  }
});

// POST /settings/api-keys/create — mint; re-render so the plaintext is
// shown exactly once (never stored, never in a redirect/session).
router.post('/create', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    // Checkbox groups arrive as a string when one box is ticked
    let scopes = req.body.scopes || [];
    if (!Array.isArray(scopes)) scopes = [scopes];
    const expiresAt = req.body.expires_at ? new Date(req.body.expires_at) : null;

    const valid = validScopes();
    if (!name) return renderPage(res, { error: 'Give the key a name (who or what is it for?).' });
    if (!scopes.length || scopes.some(s => !valid.has(s))) {
      return renderPage(res, { error: 'Pick at least one valid permission.' });
    }
    if (expiresAt && isNaN(expiresAt.getTime())) {
      return renderPage(res, { error: 'Expiry must be a valid date.' });
    }

    const { key, plaintext } = await mintKey({ name, scopes, expiresAt });
    await renderPage(res, { newKey: { ...key, plaintext } });
  } catch (e) {
    console.error('API key create failed:', e);
    renderPage(res, { error: 'Could not create the key: ' + e.message });
  }
});

// POST /settings/api-keys/:id/status — revoke or reactivate
router.post('/:id/status', async (req, res) => {
  try {
    const status = req.body.status === 'active' ? 'active' : 'revoked';
    const { rowCount } = await db.query(
      'UPDATE api_keys SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, req.params.id]
    );
    req.session[rowCount ? 'successMessage' : 'errorMessage'] =
      rowCount ? `Key ${status === 'revoked' ? 'revoked' : 'reactivated'}.` : 'Key not found.';
  } catch (e) {
    req.session.errorMessage = 'Could not update the key.';
  }
  res.redirect('/settings/api-keys');
});

// POST /settings/api-keys/:id/delete — hard delete
router.post('/:id/delete', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM api_keys WHERE id = $1', [req.params.id]);
    req.session[rowCount ? 'successMessage' : 'errorMessage'] =
      rowCount ? 'Key deleted.' : 'Key not found.';
  } catch (e) {
    req.session.errorMessage = 'Could not delete the key.';
  }
  res.redirect('/settings/api-keys');
});

module.exports = router;
