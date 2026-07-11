// Async AI translation batch engine (Thai / French / Lao). One batch runs
// at a time per process; the /translations UI polls getJobStatus() for
// progress.
//
// Token discipline:
//  - state hashing: rows whose stored source_hash still matches the
//    English source are skipped outright (diff-only processing)
//  - chunking: long fields are split on paragraph boundaries into
//    ~MAX_CHUNK_CHARS segments and translated sequentially
//  - rate limits: the Anthropic SDK retries 429/5xx with backoff
//    (maxRetries), and each row is isolated so one failure never kills
//    the batch.
//
// Selection model: ALL matching pipeline rows are scanned (skips are one
// cheap source fetch each), and the batch cap counts only rows that
// actually reach the model. A backlog of already-drafted rows can never
// eat the cap — the old LIMIT-then-filter query could return 50 drafted
// rows and report "0 translated, 50 skipped" while fresh work waited
// behind them.
//
// Lao strategy: English stays the canonical source, but when the same
// entity has a trusted (verified/published) Thai translation, it is passed
// to the model as a style/phrasing reference — Thai and Lao are closely
// related, and the verified Thai already carries the human-approved
// register. The prompt instructs the model to follow the English wherever
// the two diverge. Provenance (which Thai revision guided the draft) is
// stored on the row so reviewers can flag stale references.
const db = require('../../database/db');
const core = require('./translation-core');

// ~1500 tokens of English prose per request keeps well under output
// limits even for expansion-heavy targets (Thai).
const MAX_CHUNK_CHARS = 6000;
// Thai reference text longer than this is dropped from pivot prompts.
// Together with the single-chunk gate below (pivot only when the English
// field fits in one request), it bounds the extra input a pivot can cost:
// a reference is sent at most once per field, never once per chunk.
const PIVOT_REF_MAX_CHARS = 12000;
const DEFAULT_AI_LANGUAGES = ['th', 'fr', 'la'];
const DEFAULT_BATCH_LIMIT = 50;
const MAX_BATCH_LIMIT = 500;
// A Thai translation counts as a pivot reference only once a human signed
// it off — 'verified' (verifier approved) or 'published' (admin approved).
const TRUSTED_PIVOT_STATUSES = ['verified', 'published'];

const model = () => process.env.AI_TRANSLATION_MODEL || 'claude-sonnet-5';

let currentJob = null;

// Test seam: tests stub the model call so the suite runs offline. The
// transport receives ({ system, text, targetLanguage }) and returns the
// translated string.
let _transport = null;
function _setTransport(fn) { _transport = fn; }

const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

function getJobStatus() {
  if (!currentJob) return null;
  const { client, ...snapshot } = currentJob;
  return { ...snapshot, errors: snapshot.errors.slice(-20) };
}

// Split text into chunks of at most maxChars, preferring paragraph
// boundaries, then sentence boundaries, then a hard cut. Pure function —
// unit tested directly.
function chunkText(text, maxChars = MAX_CHUNK_CHARS) {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/(\n\s*\n)/); // keep separators
  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.length > 0) chunks.push(current);
    current = '';
  };

  const pushPiece = (piece) => {
    if (current.length + piece.length <= maxChars) {
      current += piece;
      return;
    }
    flush();
    if (piece.length <= maxChars) {
      current = piece;
      return;
    }
    // Single oversized paragraph: split on sentence ends, then hard-cut.
    const sentences = piece.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 <= maxChars) {
        current += (current ? ' ' : '') + sentence;
      } else {
        flush();
        if (sentence.length <= maxChars) {
          current = sentence;
        } else {
          for (let i = 0; i < sentence.length; i += maxChars) {
            const slice = sentence.slice(i, i + maxChars);
            if (slice.length === maxChars) chunks.push(slice);
            else current = slice;
          }
        }
      }
    }
  };

  for (const part of paragraphs) pushPiece(part);
  flush();
  return chunks.filter((c) => c.length > 0);
}

function buildSystemPrompt(targetLanguage, { pivotLanguage = null, termPairs = [] } = {}) {
  const languageName = core.LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  const lines = [
    `You are a professional marketing translator. Translate the user's content from English to ${languageName}.`,
  ];
  if (pivotLanguage) {
    const pivotName = core.LANGUAGE_NAMES[pivotLanguage] || pivotLanguage;
    lines.push(
      `A verified ${pivotName} translation of the same content is provided as a style and phrasing reference — ${pivotName} and ${languageName} are closely related, and the ${pivotName} version already carries the approved register.`
    );
  }
  lines.push('Rules:');
  if (pivotLanguage) {
    const pivotName = core.LANGUAGE_NAMES[pivotLanguage] || pivotLanguage;
    lines.push(
      `- The ENGLISH text is the authoritative source of meaning. If the ${pivotName} reference and the English diverge, follow the English.`,
      `- Never translate the ${pivotName} reference itself; translate the English text, using the reference only for tone, register and phrasing.`
    );
  }
  lines.push(
    '- Preserve ALL HTML tags, attributes, URLs, code, numbers and placeholders exactly as they appear; translate only human-readable text.',
    '- Keep brand names, product names and proper nouns in their original form.',
    '- Match the tone of professional marketing copy in the target language.',
    '- Output ONLY the translation — no explanations, no preamble, no markdown fences.'
  );
  if (termPairs.length > 0) {
    lines.push(
      `Approved ${languageName} terminology — use these exact renderings:`,
      ...termPairs.map((p) => `- "${p.name}" → "${p.translated}"`)
    );
  }
  return lines.join('\n');
}

async function callModel(client, { system, text, targetLanguage }) {
  if (_transport) return _transport({ system, text, targetLanguage });
  const response = await client.messages.create({
    model: model(),
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: text }],
  });
  return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

// Translate one field. When referenceText is set (Lao pivot), the caller
// has already guaranteed the English fits in a single chunk, so the
// reference goes out exactly once; the per-chunk attach below never
// duplicates it in practice. Fields long enough to chunk are drafted
// direct instead — a reference on chunk 1 with unguided chunks 2..N would
// drift register mid-field, and re-sending it N times multiplies cost.
async function translateText(client, text, targetLanguage, { referenceText = null, referenceLanguage = null, termPairs = [] } = {}) {
  const system = buildSystemPrompt(targetLanguage, {
    pivotLanguage: referenceText ? referenceLanguage : null,
    termPairs,
  });
  const chunks = chunkText(text);
  const translated = [];
  for (const chunk of chunks) {
    // Whitespace-only separator chunks pass through untouched.
    if (!chunk.trim()) {
      translated.push(chunk);
      continue;
    }
    const userText = referenceText
      ? [
          'ENGLISH SOURCE (translate this):',
          chunk,
          '',
          `VERIFIED ${(core.LANGUAGE_NAMES[referenceLanguage] || referenceLanguage).toUpperCase()} REFERENCE (style guidance only — do not translate this):`,
          referenceText,
        ].join('\n')
      : chunk;
    translated.push(await callModel(client, { system, text: userText, targetLanguage }));
  }
  return translated.join('');
}

// Approved term renderings (published glossary/SEO term names) that the
// source text actually mentions — fed into the prompt so drafts land using
// the same vocabulary the pre-publish gate checks for. Index is built once
// per language per batch.
async function termPairsFor(termIndex, sourceFields) {
  const srcAll = String(Object.values(sourceFields).join(' '))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return termIndex
    .filter((t) => ['glossary', 'seo'].includes(t.type) && t.matchName !== t.name)
    .filter((t) => srcAll.includes(t.name.toLowerCase()))
    .slice(0, 25)
    .map((t) => ({ name: t.name, translated: t.matchName }));
}

// The trusted Thai row for an entity, or null. Unique(entity, language)
// guarantees at most one.
async function fetchTrustedThai(entityType, entityId) {
  const row = (await db.query(
    `SELECT id, content_payload, source_hash, updated_at, status
     FROM translations
     WHERE entity_type = $1 AND entity_id = $2 AND target_language = 'th'
       AND status = ANY($3)`,
    [entityType, entityId, TRUSTED_PIVOT_STATUSES]
  )).rows[0];
  if (!row || !row.content_payload || Object.keys(row.content_payload).length === 0) return null;
  return row;
}

// Start a batch. Returns the job snapshot immediately; work continues in
// the background. Throws {status} errors for the route layer.
//
// onlyId: single-row mode ("Re-translate with AI" on the review page) —
// same engine, same job registry, candidates narrowed to one row and
// force defaulted on (redrafting is the point).
async function startBatch({
  languages, entityTypes, limit, force = false, startedBy,
  laoPivot = true, laoPivotStrict = false, onlyId = null,
} = {}) {
  if (!_transport && !isConfigured()) {
    throw Object.assign(
      new Error('AI translation is not configured. Set ANTHROPIC_API_KEY.'),
      { status: 503 }
    );
  }
  if (currentJob && currentJob.status === 'running') {
    throw Object.assign(new Error('A translation batch is already running'), { status: 409 });
  }

  const langs = (Array.isArray(languages) && languages.length ? languages : DEFAULT_AI_LANGUAGES)
    .filter((l) => core.TARGET_LANGUAGES.includes(l));
  if (!onlyId && langs.length === 0) {
    throw Object.assign(new Error('No valid target languages'), { status: 400 });
  }
  const types = (Array.isArray(entityTypes) && entityTypes.length ? entityTypes : core.ENTITY_TYPES)
    .filter((t) => core.ENTITY_TYPES.includes(t));
  const rowLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_BATCH_LIMIT, 1), MAX_BATCH_LIMIT);

  // Candidates: unclaimed rows in the pipeline. Human-claimed rows
  // (translator_id set) are never touched — vendors own those. Published
  // rows re-enter via the sync sweep flipping them to pending. No LIMIT
  // here: the cap below counts model work, not scanned rows.
  const candidates = onlyId
    ? await db.query(
        `SELECT id, entity_type, entity_id, target_language, status, content_payload, source_hash
         FROM translations
         WHERE id = $1 AND translator_id IS NULL
           AND status IN ('pending', 'translating', 'requires_review', 'rejected')`,
        [onlyId]
      )
    : await db.query(
        `SELECT id, entity_type, entity_id, target_language, status, content_payload, source_hash
         FROM translations
         WHERE target_language = ANY($1)
           AND entity_type = ANY($2)
           AND translator_id IS NULL
           AND status IN ('pending', 'translating', 'requires_review')
         ORDER BY updated_at ASC`,
        [langs, types]
      );
  if (onlyId && candidates.rows.length === 0) {
    throw Object.assign(
      new Error('This row cannot be AI-drafted: it is either assigned to a human translator or not in a redraftable status.'),
      { status: 409 }
    );
  }

  currentJob = {
    id: `ai-batch-${Date.now()}`,
    kind: onlyId ? 'single' : 'batch',
    status: 'running',
    params: {
      languages: langs, entityTypes: types, limit: rowLimit,
      force: onlyId ? true : force, laoPivot, laoPivotStrict, onlyId,
    },
    startedBy: startedBy || null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    model: _transport ? 'test-stub' : model(),
    total: candidates.rows.length,
    processed: 0,
    translated: 0,
    skipped: 0,
    failed: 0,
    pivoted: 0,
    skipReasons: { unchanged: 0, no_source: 0, claimed: 0, awaiting_thai: 0 },
    capped: false,
    remaining: 0,
    current: null,
    errors: [],
  };

  runBatch(candidates.rows).catch((error) => {
    console.error('AI batch crashed:', error.message);
    if (currentJob) {
      currentJob.status = 'failed';
      currentJob.finishedAt = new Date().toISOString();
      currentJob.errors.push({ error: error.message });
    }
  });

  return getJobStatus();
}

function skip(job, reason) {
  job.skipped += 1;
  job.skipReasons[reason] = (job.skipReasons[reason] || 0) + 1;
}

async function runBatch(rows) {
  const job = currentJob;
  let anthropic = null;
  if (!_transport) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 });
  }
  // One approved-terminology index per target language per run.
  const termIndexes = new Map();
  const termIndexFor = async (lang) => {
    if (!termIndexes.has(lang)) {
      try {
        const interlink = require('./interlink');
        termIndexes.set(lang, await interlink.buildTermIndex(lang));
      } catch (e) {
        console.warn('AI batch: term index unavailable:', e.message);
        termIndexes.set(lang, []);
      }
    }
    return termIndexes.get(lang);
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // The cap counts model work (translated + failed), never skips — a
    // backlog of drafted rows must not exhaust a run.
    if (job.translated + job.failed >= job.params.limit) {
      job.capped = true;
      job.remaining = rows.length - i;
      break;
    }
    job.current = `${row.entity_type} ${row.entity_id} → ${row.target_language}`;
    try {
      const source = await core.fetchEntitySource(row.entity_type, row.entity_id);
      if (!source || Object.keys(source.fields).length === 0) {
        skip(job, 'no_source');
        continue;
      }

      // Diff-only: identical source hash with content already present
      // means there is nothing new to translate.
      const hasContent = row.content_payload && Object.keys(row.content_payload).length > 0;
      if (!job.params.force && hasContent && row.source_hash === source.hash) {
        skip(job, 'unchanged');
        continue;
      }

      // Lao pivot: locate the trusted Thai rendering before claiming, so
      // strict mode can leave the row untouched for a later run.
      let pivotRef = null;
      const usePivot = row.target_language === 'la' && job.params.laoPivot;
      if (usePivot) {
        pivotRef = await fetchTrustedThai(row.entity_type, row.entity_id);
        if (!pivotRef && job.params.laoPivotStrict) {
          skip(job, 'awaiting_thai');
          continue;
        }
      }

      // Claim the row; abort quietly if a human claimed it meanwhile.
      const claimed = await db.query(
        `UPDATE translations SET status = 'translating', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND translator_id IS NULL RETURNING id`,
        [row.id]
      );
      if (claimed.rows.length === 0) {
        skip(job, 'claimed');
        continue;
      }

      const termPairs = await termPairsFor(await termIndexFor(row.target_language), source.fields);
      const payload = {};
      const fieldStrategies = {};
      let pivotedFields = 0;
      for (const [field, value] of Object.entries(source.fields)) {
        const thaiText = pivotRef ? String(pivotRef.content_payload[field] || '').trim() : '';
        // Pivot only single-chunk fields: the reference must ride along
        // exactly once, and a field styled by the reference on chunk 1 but
        // not on later chunks would drift register mid-field.
        const canPivot = thaiText.length > 0 && thaiText.length <= PIVOT_REF_MAX_CHARS
          && String(value).length <= MAX_CHUNK_CHARS;
        payload[field] = await translateText(anthropic, value, row.target_language, {
          referenceText: canPivot ? thaiText : null,
          referenceLanguage: canPivot ? 'th' : null,
          termPairs,
        });
        if (pivotRef) fieldStrategies[field] = canPivot ? 'pivot' : 'direct';
        if (canPivot) pivotedFields += 1;
      }

      // Provenance: how this draft was produced, and which Thai revision
      // guided it — reviewers flag drafts whose reference has since moved.
      const strategy = pivotedFields > 0 ? 'th_pivot' : 'direct';
      const pivotMeta = pivotedFields > 0
        ? {
            language: 'th',
            translation_id: pivotRef.id,
            source_hash: pivotRef.source_hash,
            // Hash of the Thai TEXT itself — updated_at moves on any touch
            // (publish, interlink sweep); staleness must mean "the words
            // this draft leaned on have changed".
            content_hash: core.sourceHash(pivotRef.content_payload),
            updated_at: pivotRef.updated_at,
            fields: fieldStrategies,
          }
        : null;
      if (pivotedFields > 0) job.pivoted += 1;

      // Meter the billable target characters at draft time (Lao/Thai have
      // no word breaks, so verification and edit payouts are per-character).
      // Storing it here — rather than backfilling at publish — means the
      // count is visible in the pipeline the moment the AI finishes and is
      // the exact figure a verifier's per-1,000-character rate applies to.
      const targetChars = core.countChars(payload);

      // A fresh draft resets verification artifacts: the snapshot the
      // verifier diffed against and any measured edits describe text that
      // no longer exists. The verifier assignment itself (verifier_id)
      // survives — the new draft still needs checking.
      await db.query(
        `UPDATE translations
         SET content_payload = $1, source_hash = $2, word_count = $3,
             target_char_count = $4, ai_model = $5,
             ai_source_strategy = $6, ai_pivot_ref = $7,
             ai_draft_payload = NULL, edited_chars = NULL, edited_segments = NULL,
             verified_by = NULL, verified_at = NULL,
             status = 'requires_review', updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [
          JSON.stringify(payload), source.hash, source.wordCount, targetChars,
          _transport ? 'test-stub' : model(), strategy,
          pivotMeta ? JSON.stringify(pivotMeta) : null, row.id,
        ]
      );
      job.translated += 1;
    } catch (error) {
      job.failed += 1;
      job.errors.push({
        translationId: row.id,
        entity: `${row.entity_type} ${row.entity_id} → ${row.target_language}`,
        error: error.message,
      });
      // Leave the row in 'translating'; the next batch re-picks it up.
    } finally {
      job.processed += 1;
    }
  }

  job.current = null;
  job.status = 'completed';
  job.finishedAt = new Date().toISOString();

  // Single-row redrafts are interactive — the admin who clicked is
  // watching the poller; only real batches notify.
  if (job.kind === 'single') return;

  const reasons = Object.entries(job.skipReasons)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${r.replace(/_/g, ' ')}`)
    .join(', ');
  await core.notifySuperAdmins(
    'AI translation batch finished',
    `${job.translated} translated (${job.pivoted} via Thai reference), ${job.skipped} skipped${reasons ? ` (${reasons})` : ''}, ${job.failed} failed (${job.params.languages.join(', ')})` +
      (job.capped ? ` — batch cap reached, ~${job.remaining} rows left; run again to continue.` : ''),
    '/translations?status=requires_review'
  );
}

module.exports = {
  isConfigured,
  getJobStatus,
  startBatch,
  chunkText,
  buildSystemPrompt,
  MAX_CHUNK_CHARS,
  PIVOT_REF_MAX_CHARS,
  DEFAULT_AI_LANGUAGES,
  TRUSTED_PIVOT_STATUSES,
  _setTransport,
};
