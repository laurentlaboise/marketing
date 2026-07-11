// Multilingual in-app help assistant ("WTS Assistant").
//
// Stateless by design: the browser widget keeps the short conversation in
// sessionStorage and sends it with every request, so nothing is persisted
// server-side and the endpoint needs no database at all. The model answers
// in whatever language the user writes (Lao, Thai, French, English, ...),
// guided by a compact platform map so its help is contextual — numbered
// steps that reference the exact on-screen button labels of the page the
// user is on.
//
// Mirrors src/lib/snippet-translator.js conventions: isConfigured() on
// ANTHROPIC_API_KEY, env-selectable model with a fast-tier fallback, lazy
// SDK client, and a _setTransport() seam so the test suite runs offline.
const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

// Chat help is latency-sensitive and cheap-per-message — default to the
// fast tier. Deliberately its own knob (not AI_TRANSLATION_MODEL /
// AI_SNIPPET_MODEL): assistant traffic has a different cost profile.
const model = () => process.env.AI_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

// Input clamps — the widget enforces the same limits client-side, but the
// server never trusts the client.
const LIMITS = {
  MESSAGE_CHARS: 2000,
  PAGE_CHARS: 300,
  HISTORY_TURNS: 8,
  HISTORY_TURN_CHARS: 1000,
};

let _client = null;
function client() {
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Test seam: tests stub the model call so the suite runs offline.
// fn({ system, messages, model }) -> string reply (or Promise<string>).
let _transport = null;
function _setTransport(fn) { _transport = fn; }

// The route's 503 gate: real key present, or a test transport installed.
const isAvailable = () => isConfigured() || Boolean(_transport);

// Output guard: redact long digit runs (8+ digits, spaces/dashes allowed
// in between) so the model can never echo a bank account / card number
// back into the chat, whatever the prompt said. The regex is linear-safe:
// a single bounded character class between two anchor digits — no nested
// or overlapping quantifiers.
const DIGIT_RUN = /\d[\d\s-]{6,}\d/g;
const redactDigitRuns = (text) => String(text).replace(DIGIT_RUN, '[redacted]');

// Clamp untrusted history into a well-formed Messages array: valid roles
// only, string content, each turn capped, last N turns kept, and a leading
// 'user' turn guaranteed (the API requires the first message to be user;
// consecutive same-role turns it tolerates by combining them).
function clampHistory(history) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.slice(0, LIMITS.HISTORY_TURN_CHARS) }))
    .slice(-LIMITS.HISTORY_TURNS);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

// Compact platform guide. Route map + per-role UI labels give the model
// enough ground truth to produce step-by-step, button-accurate help; the
// numbered rules pin down language mirroring and the no-sensitive-data
// policy. Only the user's role and first name are included — never emails.
function buildSystem({ page, user }) {
  const firstName = user && user.first_name ? String(user.first_name).slice(0, 80) : 'there';
  const role = user && user.role ? String(user.role).slice(0, 40) : 'user';
  const currentPage = String(page == null ? '' : page).slice(0, LIMITS.PAGE_CHARS) || 'unknown';

  return [
    'You are the WTS Assistant, the built-in help guide of the WTS Admin platform',
    '(WordsThatSells) — an internal workspace for marketing content, a translation/',
    'localization pipeline, workforce operations (leads, engagement) and commerce.',
    'You help signed-in staff and vendors find their way around and complete tasks.',
    '',
    `Current user: ${firstName} (role: ${role}).`,
    `Current page: ${currentPage}`,
    '',
    'NAVIGATION MAP (label — path):',
    'Admin surfaces (roles admin/superadmin only):',
    '- Dashboard — /dashboard',
    '- Translations pipeline — /translations (review queue, approve/reject, AI batch)',
    '- Team & Vendors — /translations/vendors (invite vendors, positions, rates)',
    '- Payout Ledger — /translations/payouts (approve and mark payout requests paid)',
    '- Partner Programs — /partners (partner application approval queue)',
    '- Leads CRM — /workforce/leads',
    '- Engagement — /workforce/engagement',
    '- Content — under /content/* (articles, guides, glossary, SEO terms, AI tools)',
    '- Commerce — under /business/* (products, pricing, orders, customers)',
    '',
    'Worker surfaces (translators, verifiers, field workers):',
    '- My Workspace — /translations/workspace: claim, edit and submit translations.',
    '  Each section has a "Section verified" tick that saves automatically as you',
    '  finish it; press "Mark Verified" when the progress bar is full to submit.',
    '- My Work Hub — /workforce/my: assigned leads and engagement logging.',
    '- My Earnings — /translations/earnings: available balance, "Payout Method" card',
    '  (bank transfer details or wallet QR where offered — saved encrypted), and the',
    '  "Request Payout" button; any minimum payout amount is shown under the button.',
    '- Profile & Settings — /dashboard/profile and /dashboard/settings.',
    '',
    'RULES:',
    "1. ALWAYS reply in the language of the user's latest message — mirror it",
    '   exactly, whether Lao, Thai, French, English or any other language.',
    '2. Be concise. For how-to questions give short numbered step-by-step',
    '   instructions and quote the exact on-screen button labels, e.g. "Request',
    '   Payout", "Mark Verified", "Section verified".',
    "3. The user's current page is given above — tailor guidance to it, and only",
    '   point to surfaces the user\'s role can actually open.',
    '4. NEVER ask for, repeat, or store bank account numbers, card numbers, wallet',
    '   IDs or passwords. If the user includes one in a message, warn them not to',
    '   share it in chat and keep helping WITHOUT echoing any part of it.',
    '5. You cannot perform actions, change data, or click anything — you only',
    '   guide the user to do it themselves.',
    "6. If you don't know something, say so briefly and point to the closest",
    '   relevant page instead of guessing.',
  ].join('\n');
}

// Answer one chat turn. Throws Error with .status for the route to map:
// 400 on an empty message, 503 when neither a key nor a transport exists.
async function answer({ message, page, history, user }) {
  const msg = String(message == null ? '' : message).trim().slice(0, LIMITS.MESSAGE_CHARS);
  if (!msg) {
    const err = new Error('message is required');
    err.status = 400;
    throw err;
  }
  if (!isAvailable()) {
    const err = new Error('Assistant not configured on this server');
    err.status = 503;
    throw err;
  }

  const system = buildSystem({ page, user });
  const messages = [...clampHistory(history), { role: 'user', content: msg }];

  let reply;
  if (_transport) {
    reply = await _transport({ system, messages, model: model() });
  } else {
    const response = await client().messages.create({
      model: model(),
      max_tokens: 1024,
      system,
      messages,
    });
    reply = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  }

  return redactDigitRuns(String(reply == null ? '' : reply).trim());
}

module.exports = {
  isConfigured,
  isAvailable,
  answer,
  redactDigitRuns,
  LIMITS,
  _setTransport,
};
