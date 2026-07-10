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

const STATUSES = ['pending', 'translating', 'requires_review', 'verified', 'published', 'rejected'];

// Status machine. published → pending/translating covers source-change
// re-opens (sync) and superadmin-initiated manual overrides. 'verified'
// is the native-speaker sign-off (Content Verifier brief: approved /
// needs-fix handled by direct edits / returned = back to translating);
// admins may still publish straight from requires_review for languages
// without a verifier.
const TRANSITIONS = {
  pending: ['translating', 'requires_review'],
  translating: ['requires_review', 'pending'],
  requires_review: ['published', 'rejected', 'translating', 'verified'],
  verified: ['published', 'translating', 'rejected'],
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

// Character count of a payload (Lao/Thai have no word breaks, so
// character metering is the pay basis — the briefs express verification
// pay per 1,000 characters, "counted automatically (LEN)"). Tags are
// stripped so markup never inflates pay; whitespace runs collapse to one.
function countChars(fields) {
  let count = 0;
  for (const value of Object.values(fields || {})) {
    count += striptags(String(value)).replace(/\s+/g, ' ').trim().length;
  }
  return count;
}

// Edit compensation meter: compare the verifier's final payload with the
// draft they started from. A segment counts as edited when its normalized
// text differs; edited characters are the full character count of each
// edited segment (the verifier read and reworked that block). Transparent
// and cheap — the admin review page shows the ratio, so touching
// everything to inflate pay is visible.
function computeEditStats(draftPayload, finalPayload) {
  const draft = draftPayload && typeof draftPayload === 'object' ? draftPayload : {};
  const final = finalPayload && typeof finalPayload === 'object' ? finalPayload : {};
  let editedChars = 0;
  let editedSegments = 0;
  const normalize = (v) => striptags(String(v == null ? '' : v)).replace(/\s+/g, ' ').trim();
  for (const [key, value] of Object.entries(final)) {
    const finalText = normalize(value);
    if (!finalText) continue;
    if (normalize(draft[key]) !== finalText) {
      editedSegments += 1;
      editedChars += finalText.length;
    }
  }
  return { editedChars, editedSegments };
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

// Verification access: the row's language must be assigned, the row must
// be someone else's (or AI) work — verifiers never sign off their own
// translation — and an already-claimed row belongs to its verifier.
function verifyAccessError(user, row) {
  if (!user) return 'Authentication required';
  if (['admin', 'superadmin'].includes(user.role)) return null;
  if (user.role !== 'translator') return 'Insufficient role';
  const assigned = user.assigned_languages || [];
  if (!assigned.includes(row.target_language)) {
    return 'Language not assigned to your account';
  }
  if (row.translator_id && row.translator_id === user.id) {
    return 'You cannot verify your own translation';
  }
  if (row.verifier_id && row.verifier_id !== user.id) {
    return 'This item is being verified by someone else';
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

// Resolve the most specific active rate card for (worker, language) and
// work type ('translation' | 'verification' | 'edit'):
// (worker, language) > (worker, any) > (any, language) > (any, any).
async function resolveRate(translatorId, targetLanguage, client = db, workType = 'translation') {
  const result = await client.query(
    `SELECT * FROM payout_rates
     WHERE is_active = TRUE
       AND work_type = $3
       AND (translator_id = $1 OR translator_id IS NULL)
       AND (target_language = $2 OR target_language IS NULL)
     ORDER BY (translator_id IS NOT NULL) DESC,
              (target_language IS NOT NULL) DESC,
              updated_at DESC
     LIMIT 1`,
    [translatorId, targetLanguage, workType]
  );
  return result.rows[0] || null;
}

// Kip has no minor unit — round LAK to whole amounts, everything else to
// 4 decimals (the ledger's precision).
function roundMoney(amount, currency) {
  return currency === 'LAK' ? Math.round(amount) : Math.round(amount * 10000) / 10000;
}

// Payout for a unit of work under a rate card. per_word pays on the
// stored source word count; per_1000_chars pays on target characters
// (units.chars); per_article and fixed pay the flat rate per published
// translation (fixed exists for contract vendors — same math, different
// reporting semantics).
function computePayoutAmount(rate, translation, units = {}) {
  const rateAmount = parseFloat(rate.rate_amount);
  if (!Number.isFinite(rateAmount) || rateAmount <= 0) return 0;
  const currency = rate.currency || 'USD';
  if (rate.rate_type === 'per_word') {
    const words = parseInt(translation.word_count, 10) || 0;
    return roundMoney(rateAmount * words, currency);
  }
  if (rate.rate_type === 'per_1000_chars') {
    const chars = Number.isFinite(units.chars) ? units.chars
      : parseInt(translation.target_char_count, 10) || 0;
    return roundMoney((rateAmount * chars) / 1000, currency);
  }
  return roundMoney(rateAmount, currency); // per_article | fixed
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

// The approval-to-payout hook. Runs the (requires_review|verified) →
// published transition and every vendor ledger credit in ONE transaction
// so a payout can never be credited without the publish (or vice versa).
//
// Up to three credits per publish, each at its own rate (the "write vs
// check vs rewrite" split):
//   translation_credit  — the human translator (per word / per 1,000
//                         target chars / flat), AI rows credit nothing
//   verification_credit — the native verifier, per 1,000 target chars
//                         (or flat), for reading and signing off
//   edit_credit         — the verifier again, on the characters of the
//                         segments they actually changed vs the draft
// Verifier credits require verified_by ≠ translator_id (no self-verify
// pay). Every credit type is written at most once per translation row —
// a reopen → re-publish cycle never double-pays.
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

    // Target character count backfill (rows that predate char metering).
    const targetChars = parseInt(translation.target_char_count, 10)
      || countChars(translation.content_payload);

    const isVendor = async (userId) => {
      if (!userId) return false;
      const row = await client.query('SELECT is_vendor FROM users WHERE id = $1', [userId]);
      return Boolean(row.rows.length && row.rows[0].is_vendor);
    };
    const alreadyCredited = async (type) => {
      const row = await client.query(
        `SELECT 1 FROM payout_ledger WHERE translation_id = $1 AND type = $2 LIMIT 1`,
        [translationId, type]
      );
      return row.rows.length > 0;
    };

    const credits = [];
    const baseDescription = `${translation.entity_type} ${translation.entity_id} → ${translation.target_language}`;
    const baseMetadata = {
      entity_type: translation.entity_type,
      entity_id: translation.entity_id,
      target_language: translation.target_language,
      word_count: translation.word_count,
      target_char_count: targetChars,
    };

    // 1. Translator (writing) credit.
    let payout = null;
    let payoutSkipReason = null;
    if (!translation.translator_id) {
      payoutSkipReason = 'ai_translation';
    } else if (!(await isVendor(translation.translator_id))) {
      payoutSkipReason = 'not_a_vendor';
    } else if (await alreadyCredited('translation_credit')) {
      payoutSkipReason = 'already_credited';
    } else {
      const rate = await resolveRate(translation.translator_id, translation.target_language, client, 'translation');
      if (!rate) payoutSkipReason = 'no_rate_configured';
      else {
        const amount = computePayoutAmount(rate, translation, { chars: targetChars });
        if (amount <= 0) payoutSkipReason = 'zero_rate';
        else {
          payout = {
            amount,
            currency: rate.currency || 'USD',
            rateType: rate.rate_type,
            rateAmount: parseFloat(rate.rate_amount),
            rateId: rate.id,
          };
          credits.push({
            userId: translation.translator_id,
            type: 'translation_credit',
            amount,
            currency: payout.currency,
            description: `Translated ${baseDescription}`,
            metadata: { ...baseMetadata, rate_type: rate.rate_type, rate_amount: payout.rateAmount, rate_id: rate.id },
          });
        }
      }
    }

    // 2 + 3. Verifier (checking + rewriting) credits.
    const verifierId = translation.verified_by;
    if (verifierId && verifierId !== translation.translator_id && (await isVendor(verifierId))) {
      if (!(await alreadyCredited('verification_credit'))) {
        const rate = await resolveRate(verifierId, translation.target_language, client, 'verification');
        if (rate) {
          const amount = computePayoutAmount(rate, translation, { chars: targetChars });
          if (amount > 0) {
            credits.push({
              userId: verifierId,
              type: 'verification_credit',
              amount,
              currency: rate.currency || 'USD',
              description: `Verified ${baseDescription} (${targetChars} chars)`,
              metadata: { ...baseMetadata, rate_type: rate.rate_type, rate_amount: parseFloat(rate.rate_amount), rate_id: rate.id },
            });
          }
        }
      }
      const editedChars = parseInt(translation.edited_chars, 10) || 0;
      if (editedChars > 0 && !(await alreadyCredited('edit_credit'))) {
        const rate = await resolveRate(verifierId, translation.target_language, client, 'edit');
        if (rate) {
          const amount = computePayoutAmount(rate, translation, { chars: editedChars });
          if (amount > 0) {
            credits.push({
              userId: verifierId,
              type: 'edit_credit',
              amount,
              currency: rate.currency || 'USD',
              description: `Reworked ${translation.edited_segments || 0} segment(s) of ${baseDescription} (${editedChars} chars)`,
              metadata: { ...baseMetadata, edited_chars: editedChars, edited_segments: translation.edited_segments, rate_type: rate.rate_type, rate_amount: parseFloat(rate.rate_amount), rate_id: rate.id },
            });
          }
        }
      }
    }

    const updated = await client.query(
      `UPDATE translations
       SET status = 'published', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP,
           published_at = CURRENT_TIMESTAMP, payout_amount = $2, payout_currency = $3,
           target_char_count = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [reviewerId, payout ? payout.amount : null, payout ? payout.currency : 'USD', targetChars, translationId]
    );

    for (const credit of credits) {
      await client.query(
        `INSERT INTO payout_ledger
           (translator_id, translation_id, amount, currency, type, status, description, metadata)
         VALUES ($1, $2, $3, $4, $5, 'available', $6, $7)`,
        [credit.userId, translationId, credit.amount, credit.currency, credit.type, credit.description, JSON.stringify(credit.metadata)]
      );
    }

    await client.query('COMMIT');
    return { translation: updated.rows[0], payout, payoutSkipReason, credits };
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
  countChars,
  computeEditStats,
  roundMoney,
  fetchEntitySource,
  syncTranslationRows,
  rowAccessError,
  verifyAccessError,
  sanitizePayload,
  resolveRate,
  computePayoutAmount,
  calculatePayout,
  onTranslationPublished,
  notifySuperAdmins,
  notifyUser,
};
