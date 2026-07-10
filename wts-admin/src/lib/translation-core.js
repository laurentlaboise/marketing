// Localization platform core: entity source extraction, content hashing,
// the translation status machine, payout calculation and the
// publish→ledger hook. Shared by the /translations routes, the AI batch
// engine and the tests.
const crypto = require('crypto');
const striptags = require('striptags');
const db = require('../../database/db');

const SOURCE_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = ['en', 'th', 'la', 'fr'];
const TARGET_LANGUAGES = SUPPORTED_LANGUAGES.filter((l) => l !== SOURCE_LANGUAGE);
const LANGUAGE_NAMES = { en: 'English', th: 'Thai', la: 'Lao', fr: 'French' };

// Which admin entities are translatable, and which of their columns make
// up the translatable payload. The English row in the entity table is
// always the source of truth; content_payload mirrors these field names.
// `filter` bounds the sync sweep to content that is actually live.
const ENTITY_SOURCES = {
  article: {
    table: 'articles',
    label: 'Article',
    titleField: 'title',
    fields: ['title', 'excerpt', 'content', 'seo_title', 'seo_description'],
    filter: "status = 'published'",
  },
  glossary: {
    table: 'glossary',
    label: 'Glossary term',
    titleField: 'term',
    fields: ['term', 'definition', 'example'],
    filter: null,
  },
  seo_term: {
    table: 'seo_terms',
    label: 'SEO term',
    titleField: 'term',
    fields: ['term', 'definition', 'short_definition', 'examples'],
    filter: null,
  },
  guide: {
    table: 'guides',
    label: 'E-Guide',
    titleField: 'title',
    fields: ['title', 'short_description', 'long_content'],
    filter: "status = 'published'",
  },
  product: {
    table: 'products',
    label: 'Product',
    titleField: 'name',
    fields: ['name', 'description', 'slide_in_title', 'slide_in_subtitle', 'slide_in_content'],
    filter: "status = 'active'",
  },
  // Static site pages (see site_pages DDL). `dynamic`: the translatable
  // fields are not fixed columns but the keys of the segments JSON —
  // one field per extracted text block, keyed s_<sha1-prefix> by
  // scripts/lib/html-l10n.js at the repo root.
  page: {
    table: 'site_pages',
    label: 'Site page',
    titleField: 'path',
    fields: ['segments'],
    dynamic: true,
    filter: "status = 'active'",
  },
};

const DYNAMIC_FIELD_KEY_RE = /^s_[0-9a-f]{8,16}$/;

const ENTITY_TYPES = Object.keys(ENTITY_SOURCES);

const STATUSES = ['pending', 'translating', 'requires_review', 'published', 'rejected'];

// Status machine. published → pending/translating covers source-change
// re-opens (sync) and superadmin-initiated manual overrides.
const TRANSITIONS = {
  pending: ['translating', 'requires_review'],
  translating: ['requires_review', 'pending'],
  requires_review: ['published', 'rejected', 'translating'],
  rejected: ['translating', 'requires_review'],
  published: ['pending', 'translating'],
};

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

const isUuid = (v) =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---------------------------------------------------------------------------
// Source extraction & hashing
// ---------------------------------------------------------------------------

// Pick the translatable fields out of an entity row, dropping empties so
// the hash doesn't churn on NULL↔'' differences. Dynamic entities (pages)
// carry their fields inside a JSON column instead of fixed columns.
function extractSourceFields(entityType, row) {
  const config = ENTITY_SOURCES[entityType];
  if (!config) throw new Error(`Unknown entity type: ${entityType}`);
  const fields = {};
  if (config.dynamic) {
    const dynamic = row[config.fields[0]];
    if (dynamic && typeof dynamic === 'object' && !Array.isArray(dynamic)) {
      for (const [key, value] of Object.entries(dynamic)) {
        if (typeof value === 'string' && value.trim() !== '' && DYNAMIC_FIELD_KEY_RE.test(key)) {
          fields[key] = value;
        }
      }
    }
    return fields;
  }
  for (const field of config.fields) {
    const value = row[field];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      fields[field] = String(value);
    }
  }
  return fields;
}

// sha256 over the canonical (key-sorted) JSON of the source fields. Stored
// on the translation row at translation time so the AI batch loop can skip
// anything whose English source hasn't changed since (diff-only, token-safe).
function sourceHash(sourceFields) {
  const canonical = JSON.stringify(
    Object.keys(sourceFields).sort().reduce((acc, k) => {
      acc[k] = sourceFields[k];
      return acc;
    }, {})
  );
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// Source-side word count (payout basis — industry standard is to price on
// source words). Tags stripped so HTML markup doesn't inflate payouts.
function countWords(sourceFields) {
  let count = 0;
  for (const value of Object.values(sourceFields)) {
    count += striptags(String(value)).split(/\s+/).filter(Boolean).length;
  }
  return count;
}

async function fetchEntitySource(entityType, entityId, client = db) {
  const config = ENTITY_SOURCES[entityType];
  if (!config) return null;
  if (!isUuid(entityId)) return null;
  const result = await client.query(
    `SELECT id, ${config.titleField} AS source_title, ${config.fields.join(', ')} FROM ${config.table} WHERE id = $1`,
    [entityId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const fields = extractSourceFields(entityType, row);
  return {
    entityType,
    entityId,
    title: row.source_title,
    fields,
    hash: sourceHash(fields),
    wordCount: countWords(fields),
  };
}

// ---------------------------------------------------------------------------
// Sync: create missing translation rows, flag stale published ones
// ---------------------------------------------------------------------------

// Idempotent sweep. For every live entity × target language:
//  - no row yet → INSERT (status pending)
//  - published row whose stored source_hash no longer matches the English
//    source → flip back to pending so the pipeline re-translates the diff.
// Never touches rows that are mid-flight (translating / requires_review):
// the AI loop and reviewers see the fresh hash themselves.
async function syncTranslationRows({ entityTypes = ENTITY_TYPES, languages = TARGET_LANGUAGES } = {}) {
  const summary = { scanned: 0, created: 0, stale: 0 };
  const types = entityTypes.filter((t) => ENTITY_SOURCES[t]);
  const langs = languages.filter((l) => TARGET_LANGUAGES.includes(l));

  for (const entityType of types) {
    const config = ENTITY_SOURCES[entityType];
    const where = config.filter ? `WHERE ${config.filter}` : '';
    const entities = await db.query(
      `SELECT id, ${config.fields.join(', ')} FROM ${config.table} ${where}`
    );
    for (const row of entities.rows) {
      const fields = extractSourceFields(entityType, row);
      if (Object.keys(fields).length === 0) continue; // nothing translatable
      const hash = sourceHash(fields);
      const wordCount = countWords(fields);
      summary.scanned += 1;

      for (const lang of langs) {
        const inserted = await db.query(
          `INSERT INTO translations (entity_type, entity_id, target_language, status, word_count)
           VALUES ($1, $2, $3, 'pending', $4)
           ON CONFLICT (entity_type, entity_id, target_language) DO NOTHING
           RETURNING id`,
          [entityType, row.id, lang, wordCount]
        );
        if (inserted.rows.length > 0) {
          summary.created += 1;
          continue;
        }
        const reopened = await db.query(
          `UPDATE translations
           SET status = 'pending', word_count = $4, updated_at = CURRENT_TIMESTAMP
           WHERE entity_type = $1 AND entity_id = $2 AND target_language = $3
             AND status = 'published'
             AND source_hash IS NOT NULL AND source_hash <> $5
           RETURNING id`,
          [entityType, row.id, lang, wordCount, hash]
        );
        summary.stale += reopened.rows.length;
      }
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Row-level access for translators
// ---------------------------------------------------------------------------

// A translator may work on a row when its language is assigned to them and
// the row is unclaimed or claimed by them. Returns null when OK, otherwise
// a human-readable denial reason.
function rowAccessError(user, row) {
  if (!user) return 'Authentication required';
  if (['admin', 'superadmin'].includes(user.role)) return null;
  if (user.role !== 'translator') return 'Insufficient role';
  const assigned = user.assigned_languages || [];
  if (!assigned.includes(row.target_language)) {
    return 'Language not assigned to your account';
  }
  if (row.translator_id && row.translator_id !== user.id) {
    return 'This translation is assigned to another translator';
  }
  return null;
}

// Validate a submitted content payload against the entity's field list.
// Unknown keys are rejected outright so the payload can never smuggle
// columns the renderer doesn't expect. Dynamic entities accept segment
// keys (s_<sha1-prefix>) instead of a fixed column list.
function sanitizePayload(entityType, payload) {
  const config = ENTITY_SOURCES[entityType];
  if (!config || typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { error: 'Invalid payload' };
  }
  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    const validKey = config.dynamic ? DYNAMIC_FIELD_KEY_RE.test(key) : config.fields.includes(key);
    if (!validKey) {
      return { error: `Unknown field: ${key}` };
    }
    if (typeof value !== 'string') {
      return { error: `Field ${key} must be a string` };
    }
    clean[key] = value;
  }
  return { payload: clean };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

// Resolve the most specific active rate card for (translator, language):
// (translator, language) > (translator, any) > (any, language) > (any, any).
async function resolveRate(translatorId, targetLanguage, client = db) {
  const result = await client.query(
    `SELECT * FROM payout_rates
     WHERE is_active = TRUE
       AND (translator_id = $1 OR translator_id IS NULL)
       AND (target_language = $2 OR target_language IS NULL)
     ORDER BY (translator_id IS NOT NULL) DESC,
              (target_language IS NOT NULL) DESC,
              updated_at DESC
     LIMIT 1`,
    [translatorId, targetLanguage]
  );
  return result.rows[0] || null;
}

// Payout for a translation under a rate card. per_word pays on the stored
// source word count; per_article and fixed pay the flat rate per published
// translation (fixed exists for contract vendors — same math, different
// reporting semantics).
function computePayoutAmount(rate, translation) {
  const rateAmount = parseFloat(rate.rate_amount);
  if (!Number.isFinite(rateAmount) || rateAmount <= 0) return 0;
  if (rate.rate_type === 'per_word') {
    const words = parseInt(translation.word_count, 10) || 0;
    return Math.round(rateAmount * words * 10000) / 10000;
  }
  return rateAmount; // per_article | fixed
}

async function calculatePayout(translation, client = db) {
  if (!translation.translator_id) return null;
  const rate = await resolveRate(translation.translator_id, translation.target_language, client);
  if (!rate) return null;
  const amount = computePayoutAmount(rate, translation);
  return {
    amount,
    currency: rate.currency || 'USD',
    rateType: rate.rate_type,
    rateAmount: parseFloat(rate.rate_amount),
    rateId: rate.id,
  };
}

// The approval-to-payout hook. Runs the requires_review → published
// transition and the vendor ledger credit in ONE transaction so a payout
// can never be credited without the publish (or vice versa).
//
// Credits only when the translation is claimed by a human vendor
// (users.is_vendor). AI-only rows (translator_id NULL) publish without a
// ledger entry. A translation row is credited at most once across its
// lifetime — a reopen → re-publish cycle does not double-pay.
async function onTranslationPublished(translationId, reviewerId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const found = await client.query('SELECT * FROM translations WHERE id = $1 FOR UPDATE', [translationId]);
    if (found.rows.length === 0) {
      throw Object.assign(new Error('Translation not found'), { status: 404 });
    }
    const translation = found.rows[0];
    if (!canTransition(translation.status, 'published')) {
      throw Object.assign(
        new Error(`Cannot publish from status "${translation.status}"`),
        { status: 409 }
      );
    }

    let payout = null;
    let payoutSkipReason = null;

    if (translation.translator_id) {
      const vendor = await client.query(
        'SELECT id, is_vendor FROM users WHERE id = $1',
        [translation.translator_id]
      );
      if (vendor.rows.length && vendor.rows[0].is_vendor) {
        const alreadyCredited = await client.query(
          `SELECT 1 FROM payout_ledger WHERE translation_id = $1 AND type = 'translation_credit' LIMIT 1`,
          [translationId]
        );
        if (alreadyCredited.rows.length > 0) {
          payoutSkipReason = 'already_credited';
        } else {
          payout = await calculatePayout(translation, client);
          if (!payout) payoutSkipReason = 'no_rate_configured';
          else if (payout.amount <= 0) {
            payoutSkipReason = 'zero_rate';
            payout = null;
          }
        }
      } else {
        payoutSkipReason = 'not_a_vendor';
      }
    } else {
      payoutSkipReason = 'ai_translation';
    }

    const updated = await client.query(
      `UPDATE translations
       SET status = 'published', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP,
           published_at = CURRENT_TIMESTAMP, payout_amount = $2, payout_currency = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [reviewerId, payout ? payout.amount : null, payout ? payout.currency : 'USD', translationId]
    );

    if (payout) {
      await client.query(
        `INSERT INTO payout_ledger
           (translator_id, translation_id, amount, currency, type, status, description, metadata)
         VALUES ($1, $2, $3, $4, 'translation_credit', 'available', $5, $6)`,
        [
          translation.translator_id,
          translationId,
          payout.amount,
          payout.currency,
          `Published ${translation.entity_type} ${translation.entity_id} → ${translation.target_language}`,
          JSON.stringify({
            word_count: translation.word_count,
            rate_type: payout.rateType,
            rate_amount: payout.rateAmount,
            rate_id: payout.rateId,
            entity_type: translation.entity_type,
            entity_id: translation.entity_id,
            target_language: translation.target_language,
          }),
        ]
      );
    }

    await client.query('COMMIT');
    return { translation: updated.rows[0], payout, payoutSkipReason };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Notifications (best effort — failures never block the workflow)
// ---------------------------------------------------------------------------

async function notifySuperAdmins(title, message, link) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       SELECT id, 'info', $1, $2, $3 FROM users WHERE role IN ('admin', 'superadmin')`,
      [title, message, link]
    );
  } catch (error) {
    console.warn('notifySuperAdmins failed:', error.message);
  }
}

async function notifyUser(userId, title, message, link) {
  if (!userId) return;
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, 'info', $2, $3, $4)`,
      [userId, title, message, link]
    );
  } catch (error) {
    console.warn('notifyUser failed:', error.message);
  }
}

module.exports = {
  SOURCE_LANGUAGE,
  SUPPORTED_LANGUAGES,
  TARGET_LANGUAGES,
  LANGUAGE_NAMES,
  ENTITY_SOURCES,
  ENTITY_TYPES,
  STATUSES,
  TRANSITIONS,
  canTransition,
  isUuid,
  extractSourceFields,
  sourceHash,
  countWords,
  fetchEntitySource,
  syncTranslationRows,
  rowAccessError,
  sanitizePayload,
  resolveRate,
  computePayoutAmount,
  calculatePayout,
  onTranslationPublished,
  notifySuperAdmins,
  notifyUser,
};
