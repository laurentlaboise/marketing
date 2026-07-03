// AI Marketing Strategist — the portal chat's brain.
//
// Answers a signed-in customer's questions with their own account context
// (orders, saved services, shared files) plus a summary of what Words That
// Sells offers. Runs only when ANTHROPIC_API_KEY is set; the portal shows a
// "not available yet" state otherwise, so deploys never depend on it.

const db = require('../../database/db');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const MAX_REPLY_TOKENS = 1024;

const isConfigured = () => !!process.env.ANTHROPIC_API_KEY;

let _client;
function client() {
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic();
  }
  return _client;
}

// Everything the strategist may know about THIS customer — and nothing about
// any other. Kept compact: names, statuses and amounts, not whole rows.
async function buildCustomerContext(customerId) {
  const [customer, orders, saved, files, catalog] = await Promise.all([
    db.query('SELECT email, name, company, phone, created_at FROM customers WHERE id = $1', [customerId]),
    db.query(
      `SELECT o.status, o.amount, o.currency, o.payment_method, o.created_at, p.name AS product_name
       FROM orders o LEFT JOIN products p ON o.product_id = p.id
       WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT 25`,
      [customerId]
    ),
    db.query(
      `SELECT p.name, s.billing_period FROM saved_services s
       JOIN products p ON p.id = s.product_id WHERE s.customer_id = $1`,
      [customerId]
    ).catch(() => ({ rows: [] })),
    db.query(
      `SELECT title, description, created_at FROM deliverables
       WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 15`,
      [customerId]
    ).catch(() => ({ rows: [] })),
    db.query(
      `SELECT service_page, COUNT(*) AS n FROM products WHERE status = 'active' GROUP BY service_page`
    ).catch(() => ({ rows: [] }))
  ]);
  const c = customer.rows[0] || {};
  const fmt = (d) => new Date(d).toISOString().slice(0, 10);
  return [
    `Customer: ${c.name || 'unknown name'} <${c.email}>${c.company ? ', ' + c.company : ''}, client since ${c.created_at ? fmt(c.created_at) : 'n/a'}.`,
    orders.rows.length
      ? 'Orders:\n' + orders.rows.map((o) =>
          `- ${o.product_name || 'order'} · ${o.amount != null ? o.amount + ' ' + (o.currency || 'USD') : 'n/a'} · ${o.payment_method === 'bcel_qr' ? 'BCEL' : 'card'} · ${o.status} · ${fmt(o.created_at)}`
        ).join('\n')
      : 'Orders: none yet.',
    saved.rows.length
      ? 'Services in their plan: ' + saved.rows.map((s) => s.name + (s.billing_period ? ` (${s.billing_period})` : '')).join(', ') + '.'
      : 'Services in their plan: none yet.',
    files.rows.length
      ? 'Files shared with them:\n' + files.rows.map((f) => `- ${f.title}${f.description ? ' — ' + f.description : ''} (${fmt(f.created_at)})`).join('\n')
      : 'Files shared with them: none yet.',
    catalog.rows.length
      ? 'WTS catalog: active services across ' + catalog.rows.map((r) => `${r.service_page} (${r.n})`).join(', ') + '.'
      : ''
  ].filter(Boolean).join('\n\n');
}

const SYSTEM_PROMPT = `You are the AI Marketing Strategist for Words That Sells (wordsthatsells.website), an AI-powered digital marketing agency based in Vientiane, Laos, serving businesses across Laos and Southeast Asia. You chat with signed-in clients inside their private portal.

You are given this client's account context (their orders, services, and files). Use it to answer questions about their account and to give practical, SEA-aware marketing advice: SEO, content, social media, web development, and business tools.

Rules:
- Only discuss this client's own data — never mention other clients or internal systems.
- You cannot change orders, issue refunds, or upload files. For anything that needs the team, tell them to use "Request new content" or "Ask a question" on their dashboard, and the team will reply by email within one business day.
- Payments: card via Stripe, or BCEL OnePay bank transfer in Laos (they include a WTS- reference in the transfer note).
- Be warm and concise; short paragraphs; no markdown headings. Answer in the language the client writes in when you can.
- If you don't know something, say so plainly rather than guessing.`;

// One chat turn. history: [{role, content}] — the route keeps it in the
// session and caps its length; we cap again defensively here.
async function chatReply(customerId, history, userMessage) {
  const context = await buildCustomerContext(customerId);
  const messages = history.slice(-12).concat([{ role: 'user', content: userMessage }]);
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_REPLY_TOKENS,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Account context:\n' + context }
    ],
    messages
  });
  if (response.stop_reason === 'refusal') {
    return "I can't help with that one — but I'm happy to talk about your marketing, services, or orders.";
  }
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text || "Sorry — I couldn't come up with a reply. Please try rephrasing.";
}

module.exports = { isConfigured, chatReply, buildCustomerContext };
