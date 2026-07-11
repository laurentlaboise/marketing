// Vendor payout gateway: encrypted banking metadata at rest plus a thin
// disbursement abstraction over Wise, Stripe Connect, or manual transfer.
//
// Storage model (users.payout_metadata JSONB):
//   {
//     gateway: 'wise' | 'stripe_connect' | 'manual',
//     method: 'bank_transfer' | 'wallet_qr',  // optional: self-service methods
//     label: 'BCEL •••• 1234',           // masked, display-safe
//     enc: { v, alg, iv, tag, data },    // AES-256-GCM envelope of the details
//     updated_at: ISO string
//   }
// Only `gateway`, `method` and the masked `label` are ever readable without
// the key.
// Bank details are decrypted exclusively inside createTransfer() and are
// never logged or returned to any UI.
const crypto = require('crypto');

const ENVELOPE_ALG = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;

const GATEWAYS = ['wise', 'stripe_connect', 'manual'];

class GatewayNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GatewayNotConfiguredError';
    this.status = 503;
  }
}

// ---------------------------------------------------------------------------
// Envelope encryption
// ---------------------------------------------------------------------------

function isEncryptionConfigured() {
  return /^[0-9a-f]{64}$/i.test(process.env.PAYOUT_METADATA_KEY || '');
}

function getKey() {
  const hex = process.env.PAYOUT_METADATA_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new GatewayNotConfiguredError(
      'Payout metadata encryption is not configured. Set PAYOUT_METADATA_KEY to 64 hex characters (openssl rand -hex 32).'
    );
  }
  return Buffer.from(hex, 'hex');
}

function encryptPayoutDetails(details) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENVELOPE_ALG, key, iv);
  const plaintext = Buffer.from(JSON.stringify(details), 'utf8');
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: ENVELOPE_VERSION,
    alg: ENVELOPE_ALG,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

function decryptPayoutDetails(envelope) {
  if (!envelope || envelope.alg !== ENVELOPE_ALG || !envelope.iv || !envelope.tag || !envelope.data) {
    throw new Error('Invalid payout metadata envelope');
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(ENVELOPE_ALG, key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

// Display-safe label derived from the most identifying detail on file.
function maskLabel(details) {
  const source =
    details.account_number || details.iban || details.stripe_account_id ||
    details.email || details.account_holder || '';
  const tail = String(source).replace(/\s+/g, '').slice(-4);
  return tail ? `•••• ${tail}` : 'on file';
}

// Build the JSONB value stored on users.payout_metadata.
function buildStoredMetadata(gateway, details) {
  if (!GATEWAYS.includes(gateway)) {
    throw Object.assign(new Error(`Unknown gateway: ${gateway}`), { status: 400 });
  }
  return {
    gateway,
    label: maskLabel(details),
    enc: encryptPayoutDetails(details),
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Self-service payout methods (worker-facing earnings page)
// ---------------------------------------------------------------------------

// Vendors manage these themselves: a local bank account or a wallet/QR id.
// Both disburse through the manual/local-transfer path — gateway stays
// 'manual' so createTransfer() never calls an external API for them; the
// finance team settles against the decrypted details at payout time.
const SELF_SERVICE_METHODS = ['bank_transfer', 'wallet_qr'];

// Masked label: institution name (display-safe by design, like the
// 'BCEL •••• 1234' example above) + the last four characters of the
// identifying detail. Never includes the holder name or the full number.
function selfServiceLabel(method, details) {
  const institution = String((method === 'wallet_qr' ? details.provider : details.bank_name) || '').trim();
  const source = method === 'wallet_qr' ? details.wallet_id : details.account_number;
  const tail = String(source || '').replace(/[^0-9a-z]/gi, '').slice(-4);
  const mask = tail ? `•••• ${tail}` : 'on file';
  return institution ? `${institution} ${mask}` : mask;
}

// Build the stored JSONB value for a self-service method. Same envelope
// shape as buildStoredMetadata, plus the `method` discriminator.
function buildSelfServiceMetadata(method, details) {
  if (!SELF_SERVICE_METHODS.includes(method)) {
    throw Object.assign(new Error('Unknown payout method type'), { status: 400 });
  }
  return {
    gateway: 'manual',
    method,
    label: selfServiceLabel(method, details),
    enc: encryptPayoutDetails({ method, ...details }),
    updated_at: new Date().toISOString(),
  };
}

// What any UI is allowed to see about stored banking metadata.
function describeStored(metadata) {
  if (!metadata || !metadata.enc) {
    return { configured: false, gateway: null, method: null, label: null };
  }
  return {
    configured: true,
    gateway: metadata.gateway || null,
    method: metadata.method || null,
    label: metadata.label || 'on file',
  };
}

// ---------------------------------------------------------------------------
// Disbursement
// ---------------------------------------------------------------------------

// Execute a payout_requests row against the vendor's stored (snapshotted)
// banking metadata. Returns { reference, manual } — reference is the
// gateway-side transfer id. Callers persist it on the request row.
async function createTransfer({ request, metadataSnapshot }) {
  const gateway = (metadataSnapshot && metadataSnapshot.gateway) || request.gateway || 'manual';
  const amount = parseFloat(request.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Invalid payout amount'), { status: 400 });
  }

  if (gateway === 'manual') {
    return { reference: null, manual: true };
  }

  if (!metadataSnapshot || !metadataSnapshot.enc) {
    throw new GatewayNotConfiguredError('No banking metadata on file for this vendor.');
  }
  const details = decryptPayoutDetails(metadataSnapshot.enc);

  if (gateway === 'wise') {
    return createWiseTransfer(request, details);
  }
  if (gateway === 'stripe_connect') {
    return createStripeConnectTransfer(request, details);
  }
  throw new GatewayNotConfiguredError(`Unsupported gateway: ${gateway}`);
}

// Wise (TransferWise) flow: recipient account → quote → transfer → fund
// from balance. customerTransactionId is the payout request id, which
// makes retries idempotent on Wise's side.
async function createWiseTransfer(request, details) {
  const token = process.env.WISE_API_TOKEN;
  const profileId = process.env.WISE_PROFILE_ID;
  if (!token || !profileId) {
    throw new GatewayNotConfiguredError('Wise is not configured. Set WISE_API_TOKEN and WISE_PROFILE_ID.');
  }
  const base = process.env.WISE_API_BASE || 'https://api.transferwise.com';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const targetCurrency = details.currency || request.currency || 'USD';

  const wisePost = async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // Deliberately terse: gateway error bodies can echo account details.
      throw new Error(`Wise ${path} failed with status ${response.status}`);
    }
    return response.json();
  };

  const recipient = await wisePost('/v1/accounts', {
    profile: Number(profileId),
    currency: targetCurrency,
    type: details.recipient_type || 'iban',
    accountHolderName: details.account_holder,
    details: details.wise_details || {
      legalType: 'PRIVATE',
      IBAN: details.iban,
      accountNumber: details.account_number,
    },
  });

  const quote = await wisePost('/v3/quotes', {
    profile: Number(profileId),
    sourceCurrency: request.currency || 'USD',
    targetCurrency,
    sourceAmount: parseFloat(request.amount),
  });

  const transfer = await wisePost('/v1/transfers', {
    targetAccount: recipient.id,
    quoteUuid: quote.id,
    customerTransactionId: request.id,
    details: { reference: 'WTS translation payout' },
  });

  await wisePost(`/v3/profiles/${profileId}/transfers/${transfer.id}/payments`, {
    type: 'BALANCE',
  });

  return { reference: String(transfer.id), manual: false };
}

// Stripe Connect: direct transfer to the vendor's connected account.
async function createStripeConnectTransfer(request, details) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new GatewayNotConfiguredError('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }
  const accountId = details.stripe_account_id;
  if (!accountId || !/^acct_/.test(accountId)) {
    throw Object.assign(new Error('Vendor has no Stripe Connect account id on file'), { status: 400 });
  }
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const transfer = await stripe.transfers.create({
    amount: Math.round(parseFloat(request.amount) * 100),
    currency: (request.currency || 'USD').toLowerCase(),
    destination: accountId,
    description: 'WTS translation payout',
    metadata: { payout_request_id: request.id },
  });
  return { reference: transfer.id, manual: false };
}

module.exports = {
  GATEWAYS,
  SELF_SERVICE_METHODS,
  GatewayNotConfiguredError,
  isEncryptionConfigured,
  encryptPayoutDetails,
  decryptPayoutDetails,
  buildStoredMetadata,
  buildSelfServiceMetadata,
  describeStored,
  createTransfer,
};
