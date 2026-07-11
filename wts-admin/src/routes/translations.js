// Localization platform routes. Mounted at /translations behind
// ensureAuthenticated; every route below carries its own role guard:
//   SuperAdmin  — pipeline overview, review/approve/reject, AI batch,
//                 vendor & rate management, payout requests
//   Translator  — locked workspace (assigned languages only) + earnings
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../database/db');
const {
  ensureSuperAdmin,
  ensureTranslator,
  ensureWorker,
  isSuperAdmin,
  logActivity,
} = require('../middleware/auth');
const core = require('../lib/translation-core');
const aiTranslator = require('../lib/ai-translator');
const gateway = require('../lib/payout-gateway');

const router = express.Router();

// General budget for the interactive surfaces. The AI-batch status poll
// is excluded — it fires on an interval while a batch runs and gets its
// own generous limiter below, so it can never starve navigation.
router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/ai-batch/status',
}));

// Status poll: a cheap in-memory read, polled by the pipeline page while
// a batch runs. 900/15min sustains one poll every second.
const statusPollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 900,
  standardHeaders: true,
  legacyHeaders: false,
});

const asJson = (res, status, body) => res.status(status).json(body);

// Load a translation row + its English source, or answer 404.
async function loadTranslation(req, res) {
  if (!core.isUuid(req.params.id)) {
    asJson(res, 404, { success: false, error: 'Translation not found' });
    return null;
  }
  const result = await db.query('SELECT * FROM translations WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    asJson(res, 404, { success: false, error: 'Translation not found' });
    return null;
  }
  return result.rows[0];
}

// Row-level guard for translators (language assignment + claim ownership).
function deniedForRow(req, res, row) {
  const reason = core.rowAccessError(req.user, row);
  if (reason) {
    asJson(res, 403, { success: false, error: reason });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SuperAdmin: pipeline overview
// ---------------------------------------------------------------------------

router.get('/', ensureSuperAdmin, async (req, res, next) => {
  try {
    const { status, lang, entity_type: entityType } = req.query;
    const where = [];
    const params = [];
    if (status && core.STATUSES.includes(status)) {
      params.push(status);
      where.push(`t.status = $${params.length}`);
    }
    if (lang && core.TARGET_LANGUAGES.includes(lang)) {
      params.push(lang);
      where.push(`t.target_language = $${params.length}`);
    }
    if (entityType && core.ENTITY_TYPES.includes(entityType)) {
      params.push(entityType);
      where.push(`t.entity_type = $${params.length}`);
    }

    const rows = await db.query(
      `SELECT t.*, u.first_name AS translator_first_name, u.last_name AS translator_last_name,
              sp.path AS page_path
       FROM translations t
       LEFT JOIN users u ON u.id = t.translator_id
       LEFT JOIN site_pages sp ON t.entity_type = 'page' AND sp.id = t.entity_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY t.updated_at DESC
       LIMIT 200`,
      params
    );

    const counts = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM translations GROUP BY status`
    );
    const translators = await db.query(
      `SELECT id, first_name, last_name, email, assigned_languages
       FROM users WHERE role = 'translator' ORDER BY first_name`
    );

    res.render('translations/list', {
      title: 'Translations - WTS Admin',
      currentPage: 'translations',
      items: rows.rows,
      counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
      translators: translators.rows,
      filters: { status: status || '', lang: lang || '', entity_type: entityType || '' },
      languages: core.TARGET_LANGUAGES,
      languageNames: core.LANGUAGE_NAMES,
      entityTypes: core.ENTITY_TYPES,
      statuses: core.STATUSES,
      aiJob: aiTranslator.getJobStatus(),
      aiConfigured: aiTranslator.isConfigured(),
    });
  } catch (error) {
    next(error);
  }
});

// Import the static site's English pages (site_pages + their translation
// rows). Works on any deployment: reads the local en/ tree in a full
// checkout, otherwise fetches the live site via its sitemap. Idempotent —
// re-running refreshes segments and re-opens published rows whose English
// source changed.
router.post('/sync-pages', ensureSuperAdmin, logActivity('translations_sync_pages'), async (req, res) => {
  try {
    const sitePagesSync = require('../lib/site-pages-sync');
    const result = await sitePagesSync.syncSitePages({
      tier1Only: req.body.tier1_only === true || req.body.tier1_only === 'true',
    });
    asJson(res, 200, { success: true, ...result });
  } catch (error) {
    console.error('Site page sync failed:', error.message);
    asJson(res, error.status || 500, { success: false, error: `Site page sync failed: ${error.message}` });
  }
});

// Sweep entities into the translations table (create missing rows, flag
// published rows whose English source changed). Idempotent.
router.post('/sync', ensureSuperAdmin, logActivity('translations_sync'), async (req, res) => {
  try {
    const summary = await core.syncTranslationRows({
      entityTypes: Array.isArray(req.body.entity_types) && req.body.entity_types.length
        ? req.body.entity_types : undefined,
      languages: Array.isArray(req.body.languages) && req.body.languages.length
        ? req.body.languages : undefined,
    });
    asJson(res, 200, { success: true, summary });
  } catch (error) {
    console.error('Translation sync failed:', error.message);
    asJson(res, 500, { success: false, error: 'Sync failed' });
  }
});

// ---------------------------------------------------------------------------
// SuperAdmin: AI batch
// ---------------------------------------------------------------------------

router.post('/ai-batch', ensureSuperAdmin, logActivity('translations_ai_batch'), async (req, res) => {
  try {
    const job = await aiTranslator.startBatch({
      languages: req.body.languages,
      entityTypes: req.body.entity_types,
      limit: req.body.limit,
      force: req.body.force === true || req.body.force === 'true',
      startedBy: req.user.id,
    });
    asJson(res, 202, { success: true, job });
  } catch (error) {
    asJson(res, error.status || 500, { success: false, error: error.message });
  }
});

router.get('/ai-batch/status', statusPollLimiter, ensureSuperAdmin, (req, res) => {
  asJson(res, 200, { success: true, job: aiTranslator.getJobStatus(), configured: aiTranslator.isConfigured() });
});

// ---------------------------------------------------------------------------
// SuperAdmin: review, assign, approve / reject / reopen
// ---------------------------------------------------------------------------

router.get('/review/:id', ensureSuperAdmin, async (req, res, next) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    const source = await core.fetchEntitySource(row.entity_type, row.entity_id);
    const translator = row.translator_id
      ? (await db.query('SELECT id, first_name, last_name, email, is_vendor FROM users WHERE id = $1', [row.translator_id])).rows[0]
      : null;
    const verifier = row.verified_by
      ? (await db.query('SELECT id, first_name, last_name, email, is_vendor FROM users WHERE id = $1', [row.verified_by])).rows[0]
      : null;
    const payoutPreview = row.translator_id ? await core.calculatePayout(row) : null;
    const ledgerEntry = (await db.query(
      `SELECT * FROM payout_ledger WHERE translation_id = $1 AND type = 'translation_credit' LIMIT 1`,
      [row.id]
    )).rows[0] || null;

    res.render('translations/review', {
      title: 'Review Translation - WTS Admin',
      currentPage: 'translations',
      item: row,
      source,
      translator,
      verifier,
      payoutPreview,
      ledgerEntry,
      languageNames: core.LANGUAGE_NAMES,
      entityConfig: core.ENTITY_SOURCES[row.entity_type],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/assign', ensureSuperAdmin, logActivity('translation_assign'), async (req, res) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    const translatorId = req.body.translator_id || null;

    if (translatorId) {
      if (!core.isUuid(translatorId)) {
        return asJson(res, 400, { success: false, error: 'Invalid translator id' });
      }
      const translator = (await db.query(
        `SELECT id, role, assigned_languages FROM users WHERE id = $1`,
        [translatorId]
      )).rows[0];
      if (!translator || translator.role !== 'translator') {
        return asJson(res, 400, { success: false, error: 'User is not a translator' });
      }
      if (!(translator.assigned_languages || []).includes(row.target_language)) {
        return asJson(res, 400, {
          success: false,
          error: `Translator is not assigned language "${row.target_language}"`,
        });
      }
    }

    await db.query(
      `UPDATE translations SET translator_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [translatorId, row.id]
    );
    if (translatorId) {
      await core.notifyUser(
        translatorId,
        'New translation assignment',
        `You were assigned a ${row.entity_type} translation (${core.LANGUAGE_NAMES[row.target_language] || row.target_language}).`,
        '/translations/workspace'
      );
    }
    asJson(res, 200, { success: true });
  } catch (error) {
    console.error('Assign failed:', error.message);
    asJson(res, 500, { success: false, error: 'Assign failed' });
  }
});

// Publish-and-generate: after a static-surface translation (page /
// glossary / article) publishes, ask GitHub Actions to regenerate the
// localized mirrors + sitemap (.github/workflows/localize-site.yml).
// Best-effort: a missing GITHUB_TOKEN or API failure never blocks the
// approve — the next successful dispatch or manual run regenerates all
// published rows anyway (the generator is idempotent).
async function triggerSiteRegeneration(translation) {
  if (!['page', 'glossary', 'article'].includes(translation.entity_type)) return null;
  try {
    const { dispatchWorkflow } = require('../lib/github-content');
    const result = await dispatchWorkflow('localize-site.yml', {
      reason: `publish ${translation.entity_type} ${translation.entity_id} → ${translation.target_language}`,
    });
    if (!result.ok) console.warn('Site regeneration dispatch skipped:', result.reason);
    return result;
  } catch (error) {
    console.warn('Site regeneration dispatch failed:', error.message);
    return { ok: false, reason: error.message };
  }
}

// requires_review → published. Runs the transactional publish + vendor
// ledger credit hook (translation-core.onTranslationPublished).
router.post('/:id/approve', ensureSuperAdmin, logActivity('translation_approve'), async (req, res) => {
  try {
    if (!core.isUuid(req.params.id)) {
      return asJson(res, 404, { success: false, error: 'Translation not found' });
    }
    const { translation, payout, payoutSkipReason, credits } = await core.onTranslationPublished(
      req.params.id,
      req.user.id
    );
    if (translation.translator_id) {
      await core.notifyUser(
        translation.translator_id,
        'Translation published',
        payout
          ? `Your translation was published — ${payout.currency} ${payout.amount.toFixed(2)} credited to your ledger.`
          : 'Your translation was published.',
        '/translations/earnings'
      );
    }
    const regeneration = await triggerSiteRegeneration(translation);
    asJson(res, 200, {
      success: true,
      translation,
      payout,
      payoutSkipReason,
      credits,
      regeneration: regeneration ? { dispatched: regeneration.ok, reason: regeneration.ok ? undefined : regeneration.reason } : null,
    });
  } catch (error) {
    if (error.status) {
      return asJson(res, error.status, { success: false, error: error.message });
    }
    console.error('Approve failed:', error.message);
    asJson(res, 500, { success: false, error: 'Approve failed' });
  }
});

router.post('/:id/reject', ensureSuperAdmin, logActivity('translation_reject'), async (req, res) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    if (!core.canTransition(row.status, 'rejected')) {
      return asJson(res, 409, { success: false, error: `Cannot reject from status "${row.status}"` });
    }
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 2000) : null;
    await db.query(
      `UPDATE translations
       SET status = 'rejected', review_note = $1, reviewed_by = $2,
           reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [note, req.user.id, row.id]
    );
    await core.notifyUser(
      row.translator_id,
      'Translation needs changes',
      note ? `Reviewer note: ${note}` : 'Your submission was returned for changes.',
      '/translations/workspace'
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    console.error('Reject failed:', error.message);
    asJson(res, 500, { success: false, error: 'Reject failed' });
  }
});

// published → translating: manual-override door for post-publish fixes.
// Re-publishing later does NOT double-credit (the hook checks the ledger).
router.post('/:id/reopen', ensureSuperAdmin, logActivity('translation_reopen'), async (req, res) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    if (!core.canTransition(row.status, 'translating')) {
      return asJson(res, 409, { success: false, error: `Cannot reopen from status "${row.status}"` });
    }
    await db.query(
      `UPDATE translations SET status = 'translating', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [row.id]
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    console.error('Reopen failed:', error.message);
    asJson(res, 500, { success: false, error: 'Reopen failed' });
  }
});

// ---------------------------------------------------------------------------
// SuperAdmin: vendor & language management
// ---------------------------------------------------------------------------

router.get('/vendors', ensureSuperAdmin, async (req, res, next) => {
  try {
    const users = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.assigned_languages,
              u.is_vendor, u.payout_metadata, u.position, u.manager_id,
              m.first_name AS manager_first_name, m.last_name AS manager_last_name
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       ORDER BY (u.role = 'translator' OR u.is_vendor) DESC, u.created_at DESC`
    );
    const balances = await db.query(
      `SELECT translator_id, currency, SUM(amount) AS available
       FROM payout_ledger WHERE status = 'available' GROUP BY translator_id, currency`
    );
    const balancesByUser = {};
    for (const row of balances.rows) {
      (balancesByUser[row.translator_id] = balancesByUser[row.translator_id] || []).push(row);
    }
    const { POSITIONS } = require('./workforce');
    res.render('translations/vendors', {
      title: 'Team & Vendors - WTS Admin',
      currentPage: 'translation-vendors',
      users: users.rows.map((u) => ({
        ...u,
        payout: gateway.describeStored(u.payout_metadata),
        balances: balancesByUser[u.id] || [],
      })),
      positions: POSITIONS,
      languages: core.TARGET_LANGUAGES,
      languageNames: core.LANGUAGE_NAMES,
    });
  } catch (error) {
    next(error);
  }
});

// Toggle translator role / vendor flag / language assignments for
// non-admin accounts. Deliberately cannot touch admin/superadmin accounts
// or grant admin roles — superadmin promotion stays out of band
// (ADMIN_EMAILS or scripts/promote-superadmins.js).
router.post('/vendors/:id', ensureSuperAdmin, logActivity('translation_vendor_update'), async (req, res) => {
  try {
    if (!core.isUuid(req.params.id)) {
      return asJson(res, 404, { success: false, error: 'User not found' });
    }
    const target = (await db.query('SELECT id, role FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!target) return asJson(res, 404, { success: false, error: 'User not found' });
    if (['admin', 'superadmin'].includes(target.role)) {
      return asJson(res, 400, { success: false, error: 'Admin accounts cannot be managed here' });
    }

    const role = req.body.role;
    if (!['user', 'translator'].includes(role)) {
      return asJson(res, 400, { success: false, error: 'Role must be "user" or "translator"' });
    }
    const languages = Array.isArray(req.body.assigned_languages)
      ? req.body.assigned_languages.filter((l) => core.TARGET_LANGUAGES.includes(l))
      : [];
    const isVendor = req.body.is_vendor === true || req.body.is_vendor === 'true';

    await db.query(
      `UPDATE users SET role = $1, assigned_languages = $2, is_vendor = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [role, languages, isVendor, req.params.id]
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    console.error('Vendor update failed:', error.message);
    asJson(res, 500, { success: false, error: 'Update failed' });
  }
});

// ---------------------------------------------------------------------------
// SuperAdmin: payout ledger, rates & disbursement requests
// ---------------------------------------------------------------------------

router.get('/payouts', ensureSuperAdmin, async (req, res, next) => {
  try {
    const [balances, requests, rates, compRates, recentLedger] = await Promise.all([
      db.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, l.currency,
                COALESCE(SUM(l.amount) FILTER (WHERE l.status = 'available'), 0) AS available,
                COALESCE(SUM(l.amount) FILTER (WHERE l.status = 'requested'), 0) AS requested,
                COALESCE(SUM(l.amount) FILTER (WHERE l.status = 'paid'), 0) AS paid
         FROM users u
         JOIN payout_ledger l ON l.translator_id = u.id
         GROUP BY u.id, u.email, u.first_name, u.last_name, l.currency
         ORDER BY available DESC`
      ),
      db.query(
        `SELECT r.*, u.email, u.first_name, u.last_name
         FROM payout_requests r JOIN users u ON u.id = r.translator_id
         ORDER BY r.created_at DESC LIMIT 100`
      ),
      db.query(
        `SELECT r.*, u.email AS translator_email
         FROM payout_rates r LEFT JOIN users u ON u.id = r.translator_id
         WHERE r.is_active = TRUE
         ORDER BY r.work_type, r.translator_id NULLS LAST, r.target_language NULLS LAST`
      ),
      db.query(
        `SELECT c.*, u.email AS worker_email
         FROM comp_rates c LEFT JOIN users u ON u.id = c.user_id
         WHERE c.is_active = TRUE
         ORDER BY c.work_type, c.user_id NULLS LAST`
      ),
      db.query(
        `SELECT l.*, u.email AS translator_email
         FROM payout_ledger l JOIN users u ON u.id = l.translator_id
         ORDER BY l.created_at DESC LIMIT 50`
      ),
    ]);

    const { WORK_TYPES } = require('../lib/comp-engine');
    res.render('translations/payouts', {
      title: 'Payout Ledger - WTS Admin',
      currentPage: 'translation-payouts',
      balances: balances.rows,
      requests: requests.rows,
      rates: rates.rows,
      compRates: compRates.rows,
      compWorkTypes: WORK_TYPES,
      ledger: recentLedger.rows,
      languages: core.TARGET_LANGUAGES,
      languageNames: core.LANGUAGE_NAMES,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/payouts/rates', ensureSuperAdmin, logActivity('payout_rate_save'), async (req, res) => {
  try {
    const { translator_id: translatorId, target_language: targetLanguage, rate_type: rateType } = req.body;
    const workType = req.body.work_type || 'translation';
    const rateAmount = parseFloat(req.body.rate_amount);
    const minPayout = parseFloat(req.body.min_payout) || 0;
    const currency = /^[A-Z]{3}$/.test(req.body.currency || '') ? req.body.currency : 'USD';

    if (!['per_word', 'per_1000_chars', 'per_article', 'fixed'].includes(rateType)) {
      return asJson(res, 400, { success: false, error: 'rate_type must be per_word, per_1000_chars, per_article or fixed' });
    }
    if (!['translation', 'verification', 'edit'].includes(workType)) {
      return asJson(res, 400, { success: false, error: 'work_type must be translation, verification or edit' });
    }
    if (!Number.isFinite(rateAmount) || rateAmount < 0) {
      return asJson(res, 400, { success: false, error: 'rate_amount must be a non-negative number' });
    }
    if (translatorId && !core.isUuid(translatorId)) {
      return asJson(res, 400, { success: false, error: 'Invalid translator id' });
    }
    if (targetLanguage && !core.TARGET_LANGUAGES.includes(targetLanguage)) {
      return asJson(res, 400, { success: false, error: 'Invalid target language' });
    }

    // One active card per (translator, language, work type) scope.
    await db.query(
      `UPDATE payout_rates SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE is_active = TRUE
         AND work_type = $3
         AND translator_id IS NOT DISTINCT FROM $1
         AND target_language IS NOT DISTINCT FROM $2`,
      [translatorId || null, targetLanguage || null, workType]
    );
    const inserted = await db.query(
      `INSERT INTO payout_rates (translator_id, target_language, work_type, rate_type, rate_amount, currency, min_payout)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [translatorId || null, targetLanguage || null, workType, rateType, rateAmount, currency, minPayout]
    );
    asJson(res, 200, { success: true, rate: inserted.rows[0] });
  } catch (error) {
    console.error('Rate save failed:', error.message);
    asJson(res, 500, { success: false, error: 'Rate save failed' });
  }
});

router.post('/payouts/rates/:id/delete', ensureSuperAdmin, logActivity('payout_rate_delete'), async (req, res) => {
  try {
    if (!core.isUuid(req.params.id)) {
      return asJson(res, 404, { success: false, error: 'Rate not found' });
    }
    await db.query(
      `UPDATE payout_rates SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    asJson(res, 500, { success: false, error: 'Delete failed' });
  }
});

async function loadPayoutRequest(req, res) {
  if (!core.isUuid(req.params.id)) {
    asJson(res, 404, { success: false, error: 'Payout request not found' });
    return null;
  }
  const found = await db.query('SELECT * FROM payout_requests WHERE id = $1', [req.params.id]);
  if (found.rows.length === 0) {
    asJson(res, 404, { success: false, error: 'Payout request not found' });
    return null;
  }
  return found.rows[0];
}

// Manual settle: funds were sent outside the platform (bank transfer,
// BCEL, cash). Marks the request + its ledger entries paid.
router.post('/payouts/:id/complete', ensureSuperAdmin, logActivity('payout_complete'), async (req, res) => {
  const client = await db.getClient();
  try {
    const request = await loadPayoutRequest(req, res);
    if (!request) return;
    const reference = typeof req.body.reference === 'string' ? req.body.reference.slice(0, 200) : null;

    await client.query('BEGIN');
    const settled = await client.query(
      `UPDATE payout_requests
       SET status = 'completed', gateway = COALESCE(gateway, 'manual'), gateway_reference = COALESCE($1, gateway_reference),
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status IN ('requested', 'processing')
       RETURNING id`,
      [reference, request.id]
    );
    if (settled.rows.length === 0) {
      await client.query('ROLLBACK');
      return asJson(res, 409, { success: false, error: `Request is already ${request.status}` });
    }
    await client.query(
      `UPDATE payout_ledger SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE payout_request_id = $1`,
      [request.id]
    );
    await client.query('COMMIT');

    await core.notifyUser(
      request.translator_id,
      'Payout completed',
      `Your payout of ${request.currency} ${parseFloat(request.amount).toFixed(2)} was sent.`,
      '/translations/earnings'
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Payout complete failed:', error.message);
    asJson(res, 500, { success: false, error: 'Payout completion failed' });
  } finally {
    client.release();
  }
});

// Gateway execution: pushes the transfer through Wise / Stripe Connect
// using the banking snapshot taken at request time, then settles.
router.post('/payouts/:id/execute', ensureSuperAdmin, logActivity('payout_execute'), async (req, res) => {
  try {
    const request = await loadPayoutRequest(req, res);
    if (!request) return;
    // Conditional claim — a concurrent execute of the same request loses.
    const claimed = await db.query(
      `UPDATE payout_requests SET status = 'processing' WHERE id = $1 AND status = 'requested' RETURNING id`,
      [request.id]
    );
    if (claimed.rows.length === 0) {
      return asJson(res, 409, { success: false, error: `Request is already ${request.status === 'requested' ? 'being processed' : request.status}` });
    }
    let transfer;
    try {
      transfer = await gateway.createTransfer({
        request,
        metadataSnapshot: request.bank_metadata_snapshot,
      });
    } catch (error) {
      await db.query(`UPDATE payout_requests SET status = 'requested' WHERE id = $1`, [request.id]);
      return asJson(res, error.status || 502, { success: false, error: error.message });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE payout_requests
         SET status = 'completed', gateway_reference = $1, completed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [transfer.reference, request.id]
      );
      await client.query(
        `UPDATE payout_ledger SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE payout_request_id = $1`,
        [request.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    await core.notifyUser(
      request.translator_id,
      'Payout sent',
      `Your payout of ${request.currency} ${parseFloat(request.amount).toFixed(2)} was disbursed.`,
      '/translations/earnings'
    );
    asJson(res, 200, { success: true, reference: transfer.reference });
  } catch (error) {
    console.error('Payout execute failed:', error.message);
    asJson(res, 500, { success: false, error: 'Payout execution failed' });
  }
});

router.post('/payouts/:id/cancel', ensureSuperAdmin, logActivity('payout_cancel'), async (req, res) => {
  const client = await db.getClient();
  try {
    const request = await loadPayoutRequest(req, res);
    if (!request) return;
    await client.query('BEGIN');
    const cancelled = await client.query(
      `UPDATE payout_requests SET status = 'cancelled' WHERE id = $1 AND status = 'requested' RETURNING id`,
      [request.id]
    );
    if (cancelled.rows.length === 0) {
      await client.query('ROLLBACK');
      return asJson(res, 409, { success: false, error: `Request is already ${request.status}` });
    }
    await client.query(
      `UPDATE payout_ledger SET status = 'available', payout_request_id = NULL
       WHERE payout_request_id = $1 AND status = 'requested'`,
      [request.id]
    );
    await client.query('COMMIT');
    asJson(res, 200, { success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Payout cancel failed:', error.message);
    asJson(res, 500, { success: false, error: 'Cancel failed' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Translator workspace (locked: assigned languages only, no other modules)
// ---------------------------------------------------------------------------

router.get('/workspace', ensureTranslator, async (req, res, next) => {
  try {
    const admin = isSuperAdmin(req.user);
    const assigned = req.user.assigned_languages || [];
    if (!admin && assigned.length === 0) {
      return res.render('translations/workspace-list', {
        title: 'Translation Workspace - WTS Admin',
        currentPage: 'workspace',
        items: [],
        verifyItems: [],
        assigned,
        languageNames: core.LANGUAGE_NAMES,
        noLanguages: true,
      });
    }

    // Translate queue: my claimed rows plus unclaimed rows that need a
    // human translation pass (pending / rejected).
    const translateRows = await db.query(
      admin
        ? `SELECT * FROM translations WHERE status <> 'requires_review' ORDER BY updated_at DESC LIMIT 150`
        : `SELECT * FROM translations
           WHERE target_language = ANY($1)
             AND (translator_id = $2 OR (translator_id IS NULL AND status IN ('pending', 'rejected')))
             AND status IN ('pending', 'translating', 'rejected', 'requires_review', 'verified', 'published')
           ORDER BY (status = 'rejected') DESC, (status = 'pending') DESC, updated_at DESC
           LIMIT 150`,
      admin ? [] : [assigned, req.user.id]
    );

    // Verify queue: drafted rows awaiting a native sign-off — someone
    // else's (or AI's) work, unclaimed or claimed by me. "If it's
    // translated by AI, they can check it" — but never their own.
    const verifyRows = await db.query(
      admin
        ? `SELECT * FROM translations WHERE status = 'requires_review' ORDER BY updated_at ASC LIMIT 150`
        : `SELECT * FROM translations
           WHERE target_language = ANY($1)
             AND status = 'requires_review'
             AND (translator_id IS NULL OR translator_id <> $2)
             AND (verifier_id IS NULL OR verifier_id = $2)
             AND content_payload::text <> '{}'
           ORDER BY (verifier_id = $2) DESC, updated_at ASC
           LIMIT 150`,
      admin ? [] : [assigned, req.user.id]
    );

    // Resolve entity titles for display (per type, one query).
    const titles = {};
    const allRows = [...translateRows.rows, ...verifyRows.rows];
    for (const type of core.ENTITY_TYPES) {
      const ids = allRows.filter((r) => r.entity_type === type).map((r) => r.entity_id);
      if (ids.length === 0) continue;
      const config = core.ENTITY_SOURCES[type];
      const found = await db.query(
        `SELECT id, ${config.titleField} AS title FROM ${config.table} WHERE id = ANY($1)`,
        [ids]
      );
      for (const row of found.rows) titles[`${type}:${row.id}`] = row.title;
    }
    const withTitle = (r) => ({ ...r, entity_title: titles[`${r.entity_type}:${r.entity_id}`] || r.entity_id });

    res.render('translations/workspace-list', {
      title: 'Translation Workspace - WTS Admin',
      currentPage: 'workspace',
      items: translateRows.rows.map(withTitle),
      verifyItems: verifyRows.rows.map(withTitle),
      assigned,
      languageNames: core.LANGUAGE_NAMES,
      noLanguages: false,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/workspace/:id', ensureTranslator, async (req, res, next) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    const reason = core.rowAccessError(req.user, row);
    if (reason) {
      return res.status(403).render('error', { title: 'Access Denied', message: reason, code: 403 });
    }
    const source = await core.fetchEntitySource(row.entity_type, row.entity_id);
    if (!source) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'The English source for this translation no longer exists.',
        code: 404,
      });
    }
    res.render('translations/workspace-editor', {
      title: 'Translate - WTS Admin',
      currentPage: 'workspace',
      item: row,
      source,
      languageNames: core.LANGUAGE_NAMES,
      entityConfig: core.ENTITY_SOURCES[row.entity_type],
      readOnly: row.status === 'published',
    });
  } catch (error) {
    next(error);
  }
});

// Draft save. Claims the row for this translator on first write; keeps
// the source hash in sync so publish-time staleness is visible.
router.post('/workspace/:id/save', ensureTranslator, async (req, res) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    if (deniedForRow(req, res, row)) return;
    if (row.status === 'published') {
      return asJson(res, 409, { success: false, error: 'Published translations are read-only. Ask an admin to reopen it.' });
    }

    const { payload, error } = core.sanitizePayload(row.entity_type, req.body.content_payload);
    if (error) return asJson(res, 400, { success: false, error });

    const source = await core.fetchEntitySource(row.entity_type, row.entity_id);
    const nextStatus = ['pending', 'rejected'].includes(row.status) ? 'translating' : row.status;

    await db.query(
      `UPDATE translations
       SET content_payload = $1, translator_id = $2, status = $3,
           source_hash = $4, word_count = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [
        JSON.stringify(payload),
        req.user.role === 'translator' ? req.user.id : (row.translator_id || req.user.id),
        nextStatus,
        source ? source.hash : row.source_hash,
        source ? source.wordCount : row.word_count,
        row.id,
      ]
    );
    asJson(res, 200, { success: true, status: nextStatus });
  } catch (error) {
    console.error('Draft save failed:', error.message);
    asJson(res, 500, { success: false, error: 'Save failed' });
  }
});

// Submit for review → alerts SuperAdmins. Translators cannot publish.
router.post('/workspace/:id/submit', ensureTranslator, logActivity('translation_submit'), async (req, res) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    if (deniedForRow(req, res, row)) return;
    if (!core.canTransition(row.status, 'requires_review')) {
      return asJson(res, 409, { success: false, error: `Cannot submit from status "${row.status}"` });
    }
    const hasContent = row.content_payload && Object.keys(row.content_payload).length > 0;
    if (!hasContent) {
      return asJson(res, 400, { success: false, error: 'Save a draft before submitting for review' });
    }

    await db.query(
      `UPDATE translations
       SET status = 'requires_review', translator_id = COALESCE(translator_id, $1), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.id, row.id]
    );
    await core.notifySuperAdmins(
      'Translation submitted for review',
      `${req.user.first_name || req.user.email} submitted a ${row.entity_type} translation (${core.LANGUAGE_NAMES[row.target_language] || row.target_language}).`,
      `/translations/review/${row.id}`
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    console.error('Submit failed:', error.message);
    asJson(res, 500, { success: false, error: 'Submit failed' });
  }
});

// ---------------------------------------------------------------------------
// Verification workspace (Content Verifier brief: proof · localize ·
// approve). A native speaker signs off drafted rows before publish —
// fixing light issues directly, returning heavy problems upstream.
// Verifiers never review their own translations.
// ---------------------------------------------------------------------------

async function loadVerifyRow(req, res) {
  const row = await loadTranslation(req, res);
  if (!row) return null;
  const reason = core.verifyAccessError(req.user, row);
  if (reason) {
    asJson(res, 403, { success: false, error: reason });
    return null;
  }
  return row;
}

router.get('/verify/:id', ensureTranslator, async (req, res, next) => {
  try {
    const row = await loadTranslation(req, res);
    if (!row) return;
    const reason = core.verifyAccessError(req.user, row);
    if (reason) {
      return res.status(403).render('error', { title: 'Access Denied', message: reason, code: 403 });
    }
    if (!['requires_review', 'verified'].includes(row.status)) {
      return res.status(409).render('error', {
        title: 'Not Ready',
        message: `This item is "${row.status.replace('_', ' ')}" — only drafts awaiting review can be verified.`,
        code: 409,
      });
    }
    const source = await core.fetchEntitySource(row.entity_type, row.entity_id);
    res.render('translations/verify-editor', {
      title: 'Verify - WTS Admin',
      currentPage: 'workspace',
      item: row,
      source,
      languageNames: core.LANGUAGE_NAMES,
      entityConfig: core.ENTITY_SOURCES[row.entity_type],
      readOnly: row.status === 'verified',
      targetChars: core.countChars(row.content_payload),
    });
  } catch (error) {
    next(error);
  }
});

// Claim + save fixes. First write snapshots the draft (ai_draft_payload)
// so edit compensation is measured against what the verifier started
// from, and locks the row to this verifier.
router.post('/verify/:id/save', ensureTranslator, async (req, res) => {
  try {
    const row = await loadVerifyRow(req, res);
    if (!row) return;
    if (row.status !== 'requires_review') {
      return asJson(res, 409, { success: false, error: `Cannot edit from status "${row.status}"` });
    }
    const { payload, error } = core.sanitizePayload(row.entity_type, req.body.content_payload);
    if (error) return asJson(res, 400, { success: false, error });

    const draft = row.ai_draft_payload || row.content_payload || {};
    const stats = core.computeEditStats(draft, payload);
    await db.query(
      `UPDATE translations
       SET content_payload = $1, verifier_id = $2,
           ai_draft_payload = COALESCE(ai_draft_payload, $3),
           target_char_count = $4, edited_chars = $5, edited_segments = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        JSON.stringify(payload),
        req.user.role === 'translator' ? req.user.id : row.verifier_id,
        JSON.stringify(row.content_payload || {}),
        core.countChars(payload),
        stats.editedChars,
        stats.editedSegments,
        row.id,
      ]
    );
    asJson(res, 200, { success: true, editedChars: stats.editedChars, editedSegments: stats.editedSegments });
  } catch (error) {
    console.error('Verify save failed:', error.message);
    asJson(res, 500, { success: false, error: 'Save failed' });
  }
});

// Approve: requires_review → verified. Accepts a final payload in the
// same call so "approve as-is" and "approve with fixes" are one action.
router.post('/verify/:id/approve', ensureTranslator, logActivity('translation_verify'), async (req, res) => {
  try {
    const row = await loadVerifyRow(req, res);
    if (!row) return;
    if (!core.canTransition(row.status, 'verified')) {
      return asJson(res, 409, { success: false, error: `Cannot verify from status "${row.status}"` });
    }
    let payload = row.content_payload || {};
    if (req.body.content_payload) {
      const checked = core.sanitizePayload(row.entity_type, req.body.content_payload);
      if (checked.error) return asJson(res, 400, { success: false, error: checked.error });
      payload = checked.payload;
    }
    if (Object.keys(payload).length === 0) {
      return asJson(res, 400, { success: false, error: 'Nothing to verify — the draft is empty' });
    }
    const draft = row.ai_draft_payload || row.content_payload || {};
    const stats = core.computeEditStats(draft, payload);
    const verifierId = req.user.role === 'translator' ? req.user.id : (row.verifier_id || req.user.id);

    await db.query(
      `UPDATE translations
       SET content_payload = $1, status = 'verified',
           verifier_id = $2, verified_by = $2, verified_at = CURRENT_TIMESTAMP,
           ai_draft_payload = COALESCE(ai_draft_payload, $3),
           target_char_count = $4, edited_chars = $5, edited_segments = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        JSON.stringify(payload),
        verifierId,
        JSON.stringify(row.content_payload || {}),
        core.countChars(payload),
        stats.editedChars,
        stats.editedSegments,
        row.id,
      ]
    );
    await core.notifySuperAdmins(
      'Translation verified',
      `${req.user.first_name || req.user.email} verified a ${row.entity_type} (${core.LANGUAGE_NAMES[row.target_language] || row.target_language})${stats.editedSegments ? ` with ${stats.editedSegments} segment(s) reworked` : ' as-is'}.`,
      `/translations/review/${row.id}`
    );
    asJson(res, 200, { success: true, editedChars: stats.editedChars, editedSegments: stats.editedSegments });
  } catch (error) {
    console.error('Verify approve failed:', error.message);
    asJson(res, 500, { success: false, error: 'Approve failed' });
  }
});

// Return upstream: the draft needs a full re-do, not a quick fix. Human
// translations go back to their translator (rejected); AI rows re-queue
// as pending for the next batch or a human takeover.
router.post('/verify/:id/return', ensureTranslator, logActivity('translation_verify_return'), async (req, res) => {
  try {
    const row = await loadVerifyRow(req, res);
    if (!row) return;
    if (row.status !== 'requires_review') {
      return asJson(res, 409, { success: false, error: `Cannot return from status "${row.status}"` });
    }
    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 2000) : null;
    const nextStatus = row.translator_id ? 'rejected' : 'pending';
    await db.query(
      `UPDATE translations
       SET status = $1, review_note = $2, verifier_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [nextStatus, note, row.id]
    );
    if (row.translator_id) {
      await core.notifyUser(
        row.translator_id,
        'Translation returned by verifier',
        note ? `Verifier note: ${note}` : 'Your translation needs a rework.',
        '/translations/workspace'
      );
    }
    await core.notifySuperAdmins(
      'Draft returned for re-translation',
      `${req.user.first_name || req.user.email} returned a ${row.entity_type} draft (${core.LANGUAGE_NAMES[row.target_language] || row.target_language})${note ? `: ${note}` : '.'}`,
      '/translations?status=' + nextStatus
    );
    asJson(res, 200, { success: true, status: nextStatus });
  } catch (error) {
    console.error('Verify return failed:', error.message);
    asJson(res, 500, { success: false, error: 'Return failed' });
  }
});

// Bulk publish everything verified (optionally per language) — the admin
// doesn't read Lao; the native verifier is the quality gate, publishing
// is the financial gate.
router.post('/publish-verified', ensureSuperAdmin, logActivity('translations_publish_verified'), async (req, res) => {
  try {
    const lang = core.TARGET_LANGUAGES.includes(req.body.lang) ? req.body.lang : null;
    const rows = await db.query(
      `SELECT id FROM translations WHERE status = 'verified' ${lang ? 'AND target_language = $1' : ''} LIMIT 100`,
      lang ? [lang] : []
    );
    let published = 0;
    const errors = [];
    for (const row of rows.rows) {
      try {
        await core.onTranslationPublished(row.id, req.user.id);
        published += 1;
      } catch (error) {
        errors.push({ id: row.id, error: error.message });
      }
    }
    asJson(res, 200, { success: true, published, errors });
  } catch (error) {
    console.error('Bulk publish failed:', error.message);
    asJson(res, 500, { success: false, error: 'Bulk publish failed' });
  }
});

// ---------------------------------------------------------------------------
// Vendor earnings: ledger, banking metadata, payout requests
// ---------------------------------------------------------------------------

router.get('/earnings', ensureWorker, async (req, res, next) => {
  try {
    const [ledger, requests, balances] = await Promise.all([
      db.query(
        `SELECT l.*, t.entity_type, t.target_language
         FROM payout_ledger l LEFT JOIN translations t ON t.id = l.translation_id
         WHERE l.translator_id = $1 ORDER BY l.created_at DESC LIMIT 100`,
        [req.user.id]
      ),
      db.query(
        `SELECT * FROM payout_requests WHERE translator_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.user.id]
      ),
      db.query(
        `SELECT currency,
                COALESCE(SUM(amount) FILTER (WHERE status = 'available'), 0) AS available,
                COALESCE(SUM(amount) FILTER (WHERE status = 'requested'), 0) AS requested,
                COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid
         FROM payout_ledger WHERE translator_id = $1
         GROUP BY currency ORDER BY currency`,
        [req.user.id]
      ),
    ]);
    const rate = await core.resolveRate(req.user.id, (req.user.assigned_languages || [])[0] || null);
    const totalAvailable = balances.rows.reduce((sum, b) => sum + parseFloat(b.available), 0);

    res.render('translations/earnings', {
      title: 'My Earnings - WTS Admin',
      currentPage: 'earnings',
      ledger: ledger.rows,
      requests: requests.rows,
      balances: balances.rows,
      totalAvailable,
      payout: gateway.describeStored(req.user.payout_metadata),
      encryptionConfigured: gateway.isEncryptionConfigured(),
      gateways: gateway.GATEWAYS,
      minPayout: rate ? parseFloat(rate.min_payout) || 0 : 0,
      languageNames: core.LANGUAGE_NAMES,
    });
  } catch (error) {
    next(error);
  }
});

// Store banking details — encrypted envelope only, never plaintext.
router.post('/earnings/banking', ensureWorker, logActivity('payout_banking_update'), async (req, res) => {
  try {
    const gatewayName = req.body.gateway;
    if (!gateway.GATEWAYS.includes(gatewayName)) {
      return asJson(res, 400, { success: false, error: 'Choose a valid payout method' });
    }
    const details = {};
    for (const field of ['account_holder', 'bank_name', 'account_number', 'iban', 'currency', 'stripe_account_id', 'email', 'country', 'notes']) {
      const value = req.body[field];
      if (typeof value === 'string' && value.trim()) details[field] = value.trim().slice(0, 300);
    }
    if (gatewayName !== 'manual' && Object.keys(details).length === 0) {
      return asJson(res, 400, { success: false, error: 'Provide at least one banking detail' });
    }

    const stored = gateway.buildStoredMetadata(gatewayName, details);
    await db.query(
      `UPDATE users SET payout_metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(stored), req.user.id]
    );
    asJson(res, 200, { success: true, payout: gateway.describeStored(stored) });
  } catch (error) {
    if (error.status) return asJson(res, error.status, { success: false, error: error.message });
    console.error('Banking update failed:', error.message);
    asJson(res, 500, { success: false, error: 'Could not save banking details' });
  }
});

// Request disbursement of the full available balance. Entries are
// bundled per currency (kip work-unit credits and USD translation
// credits coexist) — one payout_requests row per currency, each
// snapshotting the banking envelope so later profile edits can't
// redirect an in-flight payout.
router.post('/earnings/request', ensureWorker, logActivity('payout_request'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const entries = await client.query(
      `SELECT id, amount, currency FROM payout_ledger
       WHERE translator_id = $1 AND status = 'available' FOR UPDATE`,
      [req.user.id]
    );
    if (entries.rows.length === 0) {
      await client.query('ROLLBACK');
      return asJson(res, 400, { success: false, error: 'No available balance to request' });
    }

    const byCurrency = {};
    for (const row of entries.rows) {
      const currency = row.currency || 'USD';
      (byCurrency[currency] = byCurrency[currency] || []).push(row);
    }

    const rate = await core.resolveRate(req.user.id, (req.user.assigned_languages || [])[0] || null, client);
    const minPayout = rate ? parseFloat(rate.min_payout) || 0 : 0;
    const metadata = req.user.payout_metadata && req.user.payout_metadata.enc ? req.user.payout_metadata : null;

    const created = [];
    for (const [currency, rows] of Object.entries(byCurrency)) {
      const total = rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      // The minimum applies to the currency the rate card is written in.
      if (rate && (rate.currency || 'USD') === currency && total < minPayout) {
        await client.query('ROLLBACK');
        return asJson(res, 400, {
          success: false,
          error: `Balance ${currency} ${total.toFixed(2)} is below the minimum payout of ${currency} ${minPayout.toFixed(2)}`,
        });
      }
      const request = await client.query(
        `INSERT INTO payout_requests (translator_id, amount, currency, status, gateway, bank_metadata_snapshot)
         VALUES ($1, $2, $3, 'requested', $4, $5) RETURNING *`,
        [req.user.id, total.toFixed(4), currency, metadata ? metadata.gateway : 'manual', metadata ? JSON.stringify(metadata) : null]
      );
      await client.query(
        `UPDATE payout_ledger SET status = 'requested', payout_request_id = $1 WHERE id = ANY($2)`,
        [request.rows[0].id, rows.map((r) => r.id)]
      );
      created.push(request.rows[0]);
    }
    await client.query('COMMIT');

    await core.notifySuperAdmins(
      'Payout requested',
      `${req.user.first_name || req.user.email} requested ${created.map((r) => `${r.currency} ${parseFloat(r.amount).toFixed(2)}`).join(' + ')}.`,
      '/translations/payouts'
    );
    asJson(res, 200, { success: true, requests: created, request: created[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Payout request failed:', error.message);
    asJson(res, 500, { success: false, error: 'Payout request failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
