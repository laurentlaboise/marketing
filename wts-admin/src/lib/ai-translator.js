// Async AI translation batch engine (Thai / French by default; Lao is
// routed to human vendors). One batch runs at a time per process; the
// /translations UI polls getJobStatus() for progress.
//
// Token discipline:
//  - state hashing: rows whose stored source_hash still matches the
//    English source are skipped outright (diff-only processing)
//  - chunking: long fields are split on paragraph boundaries into
//    ~MAX_CHUNK_CHARS segments and translated sequentially
//  - rate limits: the Anthropic SDK retries 429/5xx with backoff
//    (maxRetries), and each row is isolated so one failure never kills
//    the batch.
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../../database/db');
const core = require('./translation-core');

// ~1500 tokens of English prose per request keeps well under output
// limits even for expansion-heavy targets (Thai).
const MAX_CHUNK_CHARS = 6000;
const DEFAULT_AI_LANGUAGES = ['th', 'fr'];
const DEFAULT_BATCH_LIMIT = 50;

const model = () => process.env.AI_TRANSLATION_MODEL || 'claude-sonnet-5';

let currentJob = null;

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

function buildSystemPrompt(targetLanguage) {
  const languageName = core.LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  return [
    `You are a professional marketing translator. Translate the user's content from English to ${languageName}.`,
    'Rules:',
    '- Preserve ALL HTML tags, attributes, URLs, code, numbers and placeholders exactly as they appear; translate only human-readable text.',
    '- Keep brand names, product names and proper nouns in their original form.',
    '- Match the tone of professional marketing copy in the target language.',
    '- Output ONLY the translation — no explanations, no preamble, no markdown fences.',
  ].join('\n');
}

async function translateText(client, text, targetLanguage) {
  const chunks = chunkText(text);
  const translated = [];
  for (const chunk of chunks) {
    // Whitespace-only separator chunks pass through untouched.
    if (!chunk.trim()) {
      translated.push(chunk);
      continue;
    }
    const response = await client.messages.create({
      model: model(),
      max_tokens: 8192,
      system: buildSystemPrompt(targetLanguage),
      messages: [{ role: 'user', content: chunk }],
    });
    translated.push(response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
  }
  return translated.join('');
}

// Start a batch. Returns the job snapshot immediately; work continues in
// the background. Throws {status} errors for the route layer.
async function startBatch({ languages, entityTypes, limit, force = false, startedBy } = {}) {
  if (!isConfigured()) {
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
  if (langs.length === 0) {
    throw Object.assign(new Error('No valid target languages'), { status: 400 });
  }
  const types = (Array.isArray(entityTypes) && entityTypes.length ? entityTypes : core.ENTITY_TYPES)
    .filter((t) => core.ENTITY_TYPES.includes(t));
  const rowLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_BATCH_LIMIT, 1), 500);

  // Candidates: unclaimed rows in the pipeline. Human-claimed rows
  // (translator_id set) are never touched — vendors own those. Published
  // rows re-enter via the sync sweep flipping them to pending.
  const candidates = await db.query(
    `SELECT * FROM translations
     WHERE target_language = ANY($1)
       AND entity_type = ANY($2)
       AND translator_id IS NULL
       AND status IN ('pending', 'translating', 'requires_review')
     ORDER BY updated_at ASC
     LIMIT $3`,
    [langs, types, rowLimit]
  );

  currentJob = {
    id: `ai-batch-${Date.now()}`,
    status: 'running',
    params: { languages: langs, entityTypes: types, limit: rowLimit, force },
    startedBy: startedBy || null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    model: model(),
    total: candidates.rows.length,
    processed: 0,
    translated: 0,
    skipped: 0,
    failed: 0,
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

async function runBatch(rows) {
  const job = currentJob;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 });

  for (const row of rows) {
    job.current = `${row.entity_type} ${row.entity_id} → ${row.target_language}`;
    try {
      const source = await core.fetchEntitySource(row.entity_type, row.entity_id);
      if (!source || Object.keys(source.fields).length === 0) {
        job.skipped += 1;
        continue;
      }

      // Diff-only: identical source hash with content already present
      // means there is nothing new to translate.
      const hasContent = row.content_payload && Object.keys(row.content_payload).length > 0;
      if (!job.params.force && hasContent && row.source_hash === source.hash) {
        job.skipped += 1;
        continue;
      }

      // Claim the row; abort quietly if a human claimed it meanwhile.
      const claimed = await db.query(
        `UPDATE translations SET status = 'translating', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND translator_id IS NULL RETURNING id`,
        [row.id]
      );
      if (claimed.rows.length === 0) {
        job.skipped += 1;
        continue;
      }

      const payload = {};
      for (const [field, value] of Object.entries(source.fields)) {
        payload[field] = await translateText(anthropic, value, row.target_language);
      }

      await db.query(
        `UPDATE translations
         SET content_payload = $1, source_hash = $2, word_count = $3, ai_model = $4,
             status = 'requires_review', updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [JSON.stringify(payload), source.hash, source.wordCount, model(), row.id]
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

  await core.notifySuperAdmins(
    'AI translation batch finished',
    `${job.translated} translated, ${job.skipped} skipped, ${job.failed} failed (${job.params.languages.join(', ')})`,
    '/translations?status=requires_review'
  );
}

module.exports = {
  isConfigured,
  getJobStatus,
  startBatch,
  chunkText,
  MAX_CHUNK_CHARS,
  DEFAULT_AI_LANGUAGES,
};
