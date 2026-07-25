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
      `SELECT id, name, service_page, purchase_mode, pricing_type, price, currency,
              monthly_price, yearly_price
       FROM products WHERE status = 'active' ORDER BY service_page, name LIMIT 60`
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
      ? 'WTS catalog (id | name | area | how it sells | price):\n' + catalog.rows.map((p) => {
          let priceLabel = 'quote';
          if (p.pricing_type === 'subscription' || p.monthly_price != null || p.yearly_price != null) {
            priceLabel = [p.monthly_price != null ? p.monthly_price + '/mo' : null,
                          p.yearly_price != null ? p.yearly_price + '/yr' : null].filter(Boolean).join(' or ') || 'quote';
          } else if (p.price != null) {
            priceLabel = p.price + ' ' + (p.currency || 'USD');
          }
          return `- ${p.id} | ${p.name} | ${p.service_page} | ${p.purchase_mode} | ${priceLabel}`;
        }).join('\n')
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
- If you don't know something, say so plainly rather than guessing.
- The client has a CART in their portal: they collect services there and pay one total (quote-first services become one combined quote request from the same cart). When you recommend specific WTS services from the catalog above and it genuinely fits the conversation, end your reply with EXACTLY one final line of the form SUGGEST:["<id>","<id>"] using ids from the catalog (1-4 ids, most relevant first). The portal turns that line into add-to-cart buttons — never mention the line, the ids, or the mechanism in your prose; just recommend naturally. Omit the line entirely when you are not recommending services.`;

// The model marks recommendations with a trailing SUGGEST:["id",...] line.
// Parse it off the reply and resolve the ids against the live catalog — an
// id the model invented (or a retired product) simply drops out. Returns
// { text, suggestions } where suggestions is [] when nothing was marked.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function extractSuggestions(rawText) {
  const m = rawText.match(/\nSUGGEST:(\[[^\n]*\])\s*$/);
  if (!m) return { text: rawText.trim(), suggestions: [] };
  const text = rawText.slice(0, m.index).trim();
  let ids = [];
  try {
    ids = JSON.parse(m[1]).filter((v) => typeof v === 'string' && UUID_RE.test(v)).slice(0, 4);
  } catch (_) { /* malformed marker → plain reply */ }
  if (!ids.length) return { text, suggestions: [] };
  try {
    const rows = (await db.query(
      `SELECT id, name, purchase_mode, pricing_type, price, currency, monthly_price, yearly_price
       FROM products WHERE id = ANY($1::uuid[]) AND status = 'active'`,
      [ids]
    )).rows;
    const byId = Object.fromEntries(rows.map((p) => [String(p.id), p]));
    const suggestions = ids.filter((id) => byId[id]).map((id) => {
      const p = byId[id];
      let priceLabel = null;
      if (p.pricing_type === 'subscription' || p.monthly_price != null || p.yearly_price != null) {
        priceLabel = p.monthly_price != null
          ? `${p.monthly_price} ${p.currency || 'USD'}/mo`
          : (p.yearly_price != null ? `${p.yearly_price} ${p.currency || 'USD'}/yr` : null);
      } else if (p.price != null) {
        priceLabel = `${p.price} ${p.currency || 'USD'}`;
      }
      return { id: String(p.id), name: p.name, purchase_mode: p.purchase_mode || 'consult', price_label: priceLabel };
    });
    return { text, suggestions };
  } catch (e) {
    console.warn('Strategist suggestion lookup failed:', e.message);
    return { text, suggestions: [] };
  }
}

// One chat turn. history: [{role, content}] — the route keeps it in the
// session and caps its length; we cap again defensively here.
// Returns { text, suggestions } — suggestions are catalog products the
// model recommended, ready for the chat UI's add-to-cart cards.
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
    return { text: "I can't help with that one — but I'm happy to talk about your marketing, services, or orders.", suggestions: [] };
  }
  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!raw) return { text: "Sorry — I couldn't come up with a reply. Please try rephrasing.", suggestions: [] };
  return extractSuggestions(raw);
}

module.exports = { isConfigured, chatReply, buildCustomerContext };
