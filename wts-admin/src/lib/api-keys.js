// Shared automation-API key logic: minting and hashing live here so the
// public /api/v1/keys endpoints and the admin UI (/settings/api-keys)
// produce identical, mutually-verifiable keys. Only a salted PBKDF2
// digest is ever stored — the plaintext exists once, in the mint result.
const crypto = require('crypto');
const db = require('../../database/db');

const KEY_PREFIX_LEN = 12; // 'wts_' + 8 hex chars, used to narrow the row lookup
const PBKDF2_ITERATIONS = 100000;

const hashApiKey = (plaintext, saltHex) =>
  crypto.pbkdf2Sync(plaintext, Buffer.from(saltHex, 'hex'), PBKDF2_ITERATIONS, 32, 'sha512').toString('hex');

async function mintKey({ name, scopes, expiresAt = null }) {
  const plaintext = 'wts_' + crypto.randomBytes(32).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const { rows } = await db.query(
    `INSERT INTO api_keys (name, key_hash, key_salt, key_prefix, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_prefix, scopes, status, expires_at, created_at`,
    [String(name).trim(), hashApiKey(plaintext, salt), salt, plaintext.slice(0, KEY_PREFIX_LEN), scopes, expiresAt]
  );
  return { key: rows[0], plaintext };
}

module.exports = { KEY_PREFIX_LEN, PBKDF2_ITERATIONS, hashApiKey, mintKey };
