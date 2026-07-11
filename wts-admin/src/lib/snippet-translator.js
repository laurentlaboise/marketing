// Auto-translation for short conversational text (board comments, approval
// notes) so a Thai-speaking client and an English-speaking staffer can each
// read and write in their own language.
//
// Deliberately separate from ai-translator.js (long-form marketing content,
// batch jobs, human verification): snippets are translated inline within
// seconds of being written, cached forever by source hash, clearly labelled
// as machine translation in the UI, and NEVER block or fail the write that
// triggered them — a translation outage degrades to "everyone sees the
// original", not to broken comments.
//
// Cache model: one row per (entity_type, entity_id, lang) in
// board_translations. The source hash is stored with the translation, so an
// edited source (e.g. an approval request note replaced in place) simply
// re-translates on the next ensure call; unchanged text is never paid for
// twice.
const crypto = require('crypto');
const db = require('../../database/db');

// Languages the portal conversation can involve today (portal locales).
// Growing this list is the only change needed to translate into more.
const CONVERSATION_LANGS = ['en', 'th'];

const LANGUAGE_NAMES = { en: 'English', th: 'Thai', lo: 'Lao', la: 'Lao', fr: 'French' };

const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

// Snippets are short and conversational — default to the fast tier unless
// overridden. AI_TRANSLATION_MODEL (the long-form model) is NOT inherited
// on purpose: chat latency and cost profiles differ.
const model = () => process.env.AI_SNIPPET_MODEL || 'claude-haiku-4-5-20251001';

const sourceHash = (text) =>
  crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');

let _client = null;
function client() {
  if (!_client) {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Test seam: tests stub the model call so the suite runs offline.
let _transport = null;
function _setTransport(fn) { _transport = fn; }

async function callModel(text, sourceLang, targetLang) {
  if (_transport) return _transport(text, sourceLang, targetLang);
  const from = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const to = LANGUAGE_NAMES[targetLang] || targetLang;
  const response = await client().messages.create({
    model: model(),
    max_tokens: 2048,
    system: [
      `You translate short project-workspace messages from ${from} to ${to}.`,
      'Rules:',
      '- Output ONLY the translation — no explanations, no quotes, no preamble.',
      '- Keep names, brand names, URLs, file names, numbers and emoji unchanged.',
      '- Match the register of the original: casual stays casual, formal stays formal.',
    ].join('\n'),
    messages: [{ role: 'user', content: String(text) }],
  });
  return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
}

// Translate `text` into every target language it isn't already cached for
// (at the current source hash). Serial on purpose — at most one extra
// language today, and bursts stay gentle on the API. Each language failure
// is isolated: the others still land.
async function ensureSnippetTranslations({ entityType, entityId, text, sourceLang, targetLangs = CONVERSATION_LANGS }) {
  const body = String(text == null ? '' : text).trim();
  if (!body || !isConfigured()) return { translated: 0 };

  const hash = sourceHash(body);
  let translated = 0;
  for (const lang of targetLangs) {
    if (lang === sourceLang) continue;
    const existing = (await db.query(
      'SELECT source_hash FROM board_translations WHERE entity_type = $1 AND entity_id = $2 AND lang = $3',
      [entityType, entityId, lang]
    )).rows[0];
    if (existing && existing.source_hash === hash) continue;

    let out;
    try {
      out = await callModel(body, sourceLang, lang);
    } catch (e) {
      console.warn(`[snippet-translator] ${entityType}/${entityId} → ${lang} failed:`, e.message);
      continue;
    }
    if (!out) continue;

    await db.query(
      `INSERT INTO board_translations (entity_type, entity_id, lang, body, source_hash, model)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (entity_type, entity_id, lang)
       DO UPDATE SET body = EXCLUDED.body, source_hash = EXCLUDED.source_hash,
                     model = EXCLUDED.model, created_at = CURRENT_TIMESTAMP`,
      [entityType, entityId, lang, out, hash, _transport ? 'test-stub' : model()]
    );
    translated++;
  }
  return { translated };
}

// Fire-and-forget wrapper for request handlers: the triggering write has
// already committed; translation problems are logged, never surfaced.
function queueSnippetTranslations(opts) {
  ensureSnippetTranslations(opts).catch((e) =>
    console.warn('[snippet-translator] queue failed:', e.message)
  );
}

// Bulk lookup for render time: Map of `${entityType}:${entityId}` →
// { lang → { body, source_hash } } for all requested entities in one query.
async function translationsFor(entities) {
  const ids = entities.map((e) => e.entityId);
  if (!ids.length) return new Map();
  const types = [...new Set(entities.map((e) => e.entityType))];
  const rows = (await db.query(
    `SELECT entity_type, entity_id, lang, body, source_hash FROM board_translations
     WHERE entity_type = ANY($1) AND entity_id = ANY($2::uuid[])`,
    [types, ids]
  )).rows;
  const map = new Map();
  for (const r of rows) {
    const key = `${r.entity_type}:${r.entity_id}`;
    if (!map.has(key)) map.set(key, {});
    map.get(key)[r.lang] = { body: r.body, source_hash: r.source_hash };
  }
  return map;
}

// The translated body to show a viewer, or null when none applies (same
// language, no source_lang recorded, not cached yet, or stale vs. the
// current text). Stale-vs-hash matters: an edited note must never render
// with the previous text's translation.
function pickTranslation(map, entityType, entityId, sourceLang, currentText, viewerLang) {
  if (!sourceLang || !viewerLang || sourceLang === viewerLang) return null;
  const langs = map.get(`${entityType}:${entityId}`);
  const hit = langs && langs[viewerLang];
  if (!hit) return null;
  if (hit.source_hash !== sourceHash(String(currentText == null ? '' : currentText).trim())) return null;
  return hit.body;
}

module.exports = {
  CONVERSATION_LANGS,
  LANGUAGE_NAMES,
  isConfigured,
  sourceHash,
  ensureSnippetTranslations,
  queueSnippetTranslations,
  translationsFor,
  pickTranslation,
  _setTransport,
};
