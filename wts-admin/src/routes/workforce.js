// Workforce module: the leads CRM (Lead Verifier brief) and the
// engagement / cascade work log (Engagement Associate + Cascade
// Coordinator briefs). Mounted at /workforce behind ensureAuthenticated.
//
// Honesty model, straight from the briefs: workers capture and claim
// work; only ADMIN approval writes money to the ledger, junk pays
// nothing, and every credit is idempotent per work unit — so volume and
// pay stay auditable in one place (payout_ledger).
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../../database/db');
const { ensureSuperAdmin, ensureWorker, isSuperAdmin, logActivity } = require('../middleware/auth');
const core = require('../lib/translation-core');
const comp = require('../lib/comp-engine');

const router = express.Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

const asJson = (res, status, body) => res.status(status).json(body);

const LEAD_SOURCES = ['manual', 'social', 'blog', 'website', 'directory', 'form'];
const LEAD_STATUSES = ['new', 'entered', 'call_verified', 'qualified', 'converted', 'junk'];
const POSITIONS = ['translator', 'content_verifier', 'engagement_associate', 'lead_verifier', 'cascade_coordinator'];
const ENGAGEMENT_TRACKS = ['community_response', 'cascade_share'];

// Digits only — '+856 20 …', '8562 0…' and '020…' variants of the same
// number must collide in the dedupe check.
const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

async function loadLead(req, res) {
  if (!core.isUuid(req.params.id)) {
    asJson(res, 404, { success: false, error: 'Lead not found' });
    return null;
  }
  const found = await db.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
  if (found.rows.length === 0) {
    asJson(res, 404, { success: false, error: 'Lead not found' });
    return null;
  }
  return found.rows[0];
}

// ---------------------------------------------------------------------------
// Worker hub: my leads + engagement log + monthly counters
// ---------------------------------------------------------------------------

router.get('/my', ensureWorker, async (req, res, next) => {
  try {
    const [leads, logs, counters, monthCredits] = await Promise.all([
      db.query(
        `SELECT * FROM leads WHERE assigned_to = $1 AND status <> 'junk'
         ORDER BY (status = 'new') DESC, updated_at DESC LIMIT 100`,
        [req.user.id]
      ),
      db.query(
        `SELECT * FROM engagement_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [req.user.id]
      ),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE qualified_at >= date_trunc('month', CURRENT_TIMESTAMP))::int AS qualified_month,
           COUNT(*) FILTER (WHERE converted_at >= date_trunc('month', CURRENT_TIMESTAMP))::int AS converted_month
         FROM leads WHERE assigned_to = $1`,
        [req.user.id]
      ),
      db.query(
        `SELECT currency, COALESCE(SUM(amount), 0) AS earned
         FROM payout_ledger
         WHERE translator_id = $1 AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
         GROUP BY currency ORDER BY currency`,
        [req.user.id]
      ),
    ]);
    res.render('workforce/my', {
      title: 'My Work Hub - WTS Admin',
      currentPage: 'work-hub',
      leads: leads.rows,
      logs: logs.rows,
      counters: counters.rows[0],
      monthCredits: monthCredits.rows,
      leadSources: LEAD_SOURCES,
      engagementTracks: ENGAGEMENT_TRACKS,
    });
  } catch (error) {
    next(error);
  }
});

// Capture a lead (worker): name + phone + stated interest are the
// essentials. De-dup on normalized phone — a duplicate never enters, so
// it can never pay.
router.post('/my/leads', ensureWorker, logActivity('lead_capture'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 255);
    const phone = normalizePhone(req.body.phone);
    if (!name || phone.length < 6) {
      return asJson(res, 400, { success: false, error: 'A real name and phone number are required' });
    }
    const duplicate = await db.query(
      `SELECT id, status FROM leads
       WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1 AND status <> 'junk'
       LIMIT 1`,
      [phone]
    );
    if (duplicate.rows.length) {
      return asJson(res, 409, { success: false, error: 'This phone number is already in the CRM (duplicates are not counted)' });
    }
    const source = LEAD_SOURCES.includes(req.body.source) ? req.body.source : 'manual';
    const inserted = await db.query(
      `INSERT INTO leads (source, name, phone, email, company, category, interest, notes, status, assigned_to, entered_by, entered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'entered', $9, $9, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        source,
        name,
        req.body.phone ? String(req.body.phone).trim().slice(0, 60) : phone,
        req.body.email ? String(req.body.email).trim().slice(0, 255) : null,
        req.body.company ? String(req.body.company).trim().slice(0, 255) : null,
        req.body.category ? String(req.body.category).trim().slice(0, 120) : null,
        req.body.interest ? String(req.body.interest).trim().slice(0, 2000) : null,
        req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null,
        req.user.id,
      ]
    );
    asJson(res, 200, { success: true, lead: inserted.rows[0] });
  } catch (error) {
    console.error('Lead capture failed:', error.message);
    asJson(res, 500, { success: false, error: 'Could not save the lead' });
  }
});

// Work an assigned lead (worker): update fields and claim milestones —
// call_verified for directory confirmations, qualified for warm and
// contactable. Claims set status + timestamps; money only moves when the
// admin approves.
router.post('/my/leads/:id', ensureWorker, async (req, res) => {
  try {
    const lead = await loadLead(req, res);
    if (!lead) return;
    if (!isSuperAdmin(req.user) && lead.assigned_to !== req.user.id) {
      return asJson(res, 403, { success: false, error: 'This lead is assigned to someone else' });
    }
    const claim = req.body.claim_status;
    const allowedClaims = ['entered', 'call_verified', 'qualified'];
    if (claim && !allowedClaims.includes(claim)) {
      return asJson(res, 400, { success: false, error: 'Invalid status claim' });
    }
    if (['converted', 'junk'].includes(lead.status)) {
      return asJson(res, 409, { success: false, error: `Lead is already ${lead.status}` });
    }

    // stampColumn is a fixed lookup (identifiers can't be parameterized);
    // the status value itself is bound as a parameter.
    const stampColumn = { entered: 'entered_at', call_verified: 'call_verified_at', qualified: 'qualified_at' }[claim];
    const params = [
      req.body.name ? String(req.body.name).trim().slice(0, 255) : null,
      req.body.email ? String(req.body.email).trim().slice(0, 255) : null,
      req.body.company ? String(req.body.company).trim().slice(0, 255) : null,
      req.body.category ? String(req.body.category).trim().slice(0, 120) : null,
      req.body.interest ? String(req.body.interest).trim().slice(0, 2000) : null,
      req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null,
      lead.id,
    ];
    let statusClause = '';
    if (claim) {
      params.push(claim);
      statusClause = `status = $8, ${stampColumn} = COALESCE(${stampColumn}, CURRENT_TIMESTAMP),`;
    }
    await db.query(
      `UPDATE leads SET
         name = COALESCE($1, name), email = COALESCE($2, email), company = COALESCE($3, company),
         category = COALESCE($4, category), interest = COALESCE($5, interest), notes = COALESCE($6, notes),
         ${statusClause}
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      params
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    console.error('Lead update failed:', error.message);
    asJson(res, 500, { success: false, error: 'Update failed' });
  }
});

// Log one engagement unit (worker): a community response or a cascade
// share, with the URL as proof and wave/group for cascades.
router.post('/my/engagement', ensureWorker, logActivity('engagement_log'), async (req, res) => {
  try {
    const track = req.body.track;
    if (!ENGAGEMENT_TRACKS.includes(track)) {
      return asJson(res, 400, { success: false, error: 'Choose a valid track' });
    }
    const referenceUrl = String(req.body.reference_url || '').trim().slice(0, 800);
    if (!/^https?:\/\//.test(referenceUrl)) {
      return asJson(res, 400, { success: false, error: 'A link to the response/share is required as proof' });
    }
    const wave = parseInt(req.body.wave, 10);
    const inserted = await db.query(
      `INSERT INTO engagement_logs (user_id, track, reference_url, group_name, wave, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.user.id,
        track,
        referenceUrl,
        req.body.group_name ? String(req.body.group_name).trim().slice(0, 255) : null,
        Number.isInteger(wave) && wave >= 1 && wave <= 3 ? wave : null,
        req.body.note ? String(req.body.note).trim().slice(0, 1000) : null,
      ]
    );
    asJson(res, 200, { success: true, log: inserted.rows[0] });
  } catch (error) {
    console.error('Engagement log failed:', error.message);
    asJson(res, 500, { success: false, error: 'Could not save the log' });
  }
});

// ---------------------------------------------------------------------------
// Admin: leads CRM
// ---------------------------------------------------------------------------

router.get('/leads', ensureSuperAdmin, async (req, res, next) => {
  try {
    const status = LEAD_STATUSES.includes(req.query.status) ? req.query.status : null;
    const [leads, counts, workers, pendingSubmissions] = await Promise.all([
      db.query(
        `SELECT l.*, u.first_name, u.last_name, u.email AS worker_email
         FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
         ${status ? 'WHERE l.status = $1' : ''}
         ORDER BY l.updated_at DESC LIMIT 200`,
        status ? [status] : []
      ),
      db.query(`SELECT status, COUNT(*)::int AS count FROM leads GROUP BY status`),
      db.query(
        `SELECT id, first_name, last_name, email FROM users
         WHERE is_vendor = TRUE OR role = 'translator' ORDER BY first_name`
      ),
      db.query(`SELECT COUNT(*)::int AS c FROM form_submissions WHERE status = 'new'`),
    ]);
    res.render('workforce/leads', {
      title: 'Leads CRM - WTS Admin',
      currentPage: 'leads',
      leads: leads.rows,
      counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
      workers: workers.rows,
      pendingSubmissions: pendingSubmissions.rows[0].c,
      statuses: LEAD_STATUSES,
      filters: { status: status || '' },
    });
  } catch (error) {
    next(error);
  }
});

// Pull new form submissions into the CRM as leads (source 'form').
// One transaction + the unique index on form_submission_id: concurrent
// imports can never duplicate a submission.
router.post('/leads/import-submissions', ensureSuperAdmin, logActivity('leads_import_submissions'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const imported = await client.query(
      `INSERT INTO leads (source, name, phone, email, company, interest, status, form_submission_id)
       SELECT 'form', fs.name, fs.phone, fs.email, fs.company, fs.message, 'new', fs.id
       FROM form_submissions fs
       WHERE fs.status = 'new'
         AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.form_submission_id = fs.id)
       ON CONFLICT (form_submission_id) WHERE form_submission_id IS NOT NULL DO NOTHING
       RETURNING id`
    );
    await client.query(
      `UPDATE form_submissions SET status = 'in-crm', updated_at = CURRENT_TIMESTAMP WHERE status = 'new'`
    );
    await client.query('COMMIT');
    asJson(res, 200, { success: true, imported: imported.rows.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Submission import failed:', error.message);
    asJson(res, 500, { success: false, error: 'Import failed' });
  } finally {
    client.release();
  }
});

router.post('/leads/:id/assign', ensureSuperAdmin, async (req, res) => {
  try {
    const lead = await loadLead(req, res);
    if (!lead) return;
    const workerId = req.body.worker_id || null;
    if (workerId && !core.isUuid(workerId)) {
      return asJson(res, 400, { success: false, error: 'Invalid worker id' });
    }
    await db.query(`UPDATE leads SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [workerId, lead.id]);
    if (workerId) {
      await core.notifyUser(workerId, 'Lead assigned to you', `${lead.name || 'A lead'} was assigned to you for verification.`, '/workforce/my');
    }
    asJson(res, 200, { success: true });
  } catch (error) {
    asJson(res, 500, { success: false, error: 'Assign failed' });
  }
});

// Approve & credit: pays every reached-but-unpaid milestone on this lead
// at the worker's rates — entry, call verification, qualification
// (marginal monthly tier). Idempotent per milestone. Junk/duplicates
// never reach here with credits.
router.post('/leads/:id/approve', ensureSuperAdmin, logActivity('lead_approve'), async (req, res) => {
  const client = await db.getClient();
  try {
    const lead = await loadLead(req, res);
    if (!lead) return;
    const workerId = lead.assigned_to || lead.entered_by;
    if (!workerId) return asJson(res, 400, { success: false, error: 'No worker attached to this lead' });
    if (lead.status === 'junk') return asJson(res, 409, { success: false, error: 'Junk leads pay nothing' });

    const credits = [];
    const label = lead.name || lead.company || lead.phone || lead.id.slice(0, 8);

    // One transaction for the whole approval — the unique ledger index
    // additionally collapses any concurrent double-click into one credit.
    await client.query('BEGIN');
    if (lead.entered_at && !(await comp.alreadyCreditedFor(lead.id, 'lead_entry', client))) {
      credits.push(await comp.creditWork({
        userId: workerId, workType: 'lead_entry', referenceId: lead.id,
        description: `Lead entered: ${label}`, metadata: { lead_id: lead.id }, client,
      }));
    }
    if (lead.call_verified_at && !(await comp.alreadyCreditedFor(lead.id, 'lead_directory_call', client))) {
      credits.push(await comp.creditWork({
        userId: workerId, workType: 'lead_directory_call', referenceId: lead.id,
        description: `Directory record verified by call: ${label}`, metadata: { lead_id: lead.id }, client,
      }));
    }
    if (lead.qualified_at && !(await comp.alreadyCreditedFor(lead.id, 'lead_qualified', client))) {
      const monthCount = await comp.monthlyLeadCount(workerId, 'qualified_at', client);
      credits.push(await comp.creditWork({
        userId: workerId, workType: 'lead_qualified', referenceId: lead.id, unitIndex: Math.max(monthCount, 1),
        description: `Qualified lead #${Math.max(monthCount, 1)} this month: ${label}`, metadata: { lead_id: lead.id }, client,
      }));
    }
    await client.query('COMMIT');
    asJson(res, 200, { success: true, credits: credits.filter(Boolean) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Lead approve failed:', error.message);
    asJson(res, 500, { success: false, error: 'Approve failed' });
  } finally {
    client.release();
  }
});

// Mark converted (+ optional sale value) → conversion bonus on top.
// Junk can never convert (mirrors the approve guard); the status update
// and the bonus credit commit atomically.
router.post('/leads/:id/convert', ensureSuperAdmin, logActivity('lead_convert'), async (req, res) => {
  const client = await db.getClient();
  try {
    const lead = await loadLead(req, res);
    if (!lead) return;
    if (lead.status === 'junk') {
      return asJson(res, 409, { success: false, error: 'Junk leads cannot be converted' });
    }
    const workerId = lead.assigned_to || lead.entered_by;
    // Normalize once: non-numeric input becomes null everywhere (DB write,
    // bonus math, metadata) so the percent-of-sale path never sees NaN.
    const parsedSale = req.body.sale_value != null && req.body.sale_value !== ''
      ? parseFloat(req.body.sale_value) : null;
    const saleValue = Number.isFinite(parsedSale) ? parsedSale : null;

    await client.query('BEGIN');
    await client.query(
      `UPDATE leads SET status = 'converted', sale_value = $1,
         converted_at = COALESCE(converted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [saleValue, lead.id]
    );
    let bonus = null;
    if (workerId && !(await comp.alreadyCreditedFor(lead.id, 'lead_conversion', client))) {
      bonus = await comp.creditWork({
        userId: workerId, workType: 'lead_conversion', referenceId: lead.id, saleValue,
        description: `Conversion bonus: ${lead.name || lead.company || lead.id.slice(0, 8)}`,
        metadata: { lead_id: lead.id, sale_value: saleValue },
        client,
      });
    }
    await client.query('COMMIT');

    if (bonus && bonus.credited) {
      await core.notifyUser(workerId, 'Lead converted — bonus credited',
        `Your lead closed to a sale. Bonus: ${bonus.currency} ${bonus.amount}.`, '/translations/earnings');
    }
    asJson(res, 200, { success: true, bonus });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Lead convert failed:', error.message);
    asJson(res, 500, { success: false, error: 'Convert failed' });
  } finally {
    client.release();
  }
});

router.post('/leads/:id/junk', ensureSuperAdmin, async (req, res) => {
  try {
    const lead = await loadLead(req, res);
    if (!lead) return;
    await db.query(`UPDATE leads SET status = 'junk', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [lead.id]);
    asJson(res, 200, { success: true });
  } catch (error) {
    asJson(res, 500, { success: false, error: 'Update failed' });
  }
});

// ---------------------------------------------------------------------------
// Admin: engagement / cascade approvals
// ---------------------------------------------------------------------------

router.get('/engagement', ensureSuperAdmin, async (req, res, next) => {
  try {
    const [pending, recent] = await Promise.all([
      db.query(
        `SELECT e.*, u.first_name, u.last_name, u.email AS worker_email
         FROM engagement_logs e JOIN users u ON u.id = e.user_id
         WHERE e.status = 'pending' ORDER BY e.created_at ASC LIMIT 200`
      ),
      db.query(
        `SELECT e.*, u.first_name, u.last_name
         FROM engagement_logs e JOIN users u ON u.id = e.user_id
         WHERE e.status <> 'pending' ORDER BY e.reviewed_at DESC LIMIT 50`
      ),
    ]);
    res.render('workforce/engagement', {
      title: 'Engagement & Cascades - WTS Admin',
      currentPage: 'engagement',
      pending: pending.rows,
      recent: recent.rows,
    });
  } catch (error) {
    next(error);
  }
});

// Approve one or many logs → per-unit credit at the worker's rate.
router.post('/engagement/review', ensureSuperAdmin, logActivity('engagement_review'), async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).filter(core.isUuid);
    const decision = req.body.decision === 'approve' ? 'approved' : req.body.decision === 'reject' ? 'rejected' : null;
    if (!ids.length || !decision) {
      return asJson(res, 400, { success: false, error: 'Provide log ids and a decision' });
    }
    let credited = 0;
    const client = await db.getClient();
    try {
      for (const id of ids) {
        // Per-log transaction: the status flip and its credit land (or
        // roll back) together — an approved log can never end up unpaid
        // because a later statement failed.
        await client.query('BEGIN');
        const updated = await client.query(
          `UPDATE engagement_logs SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
           WHERE id = $3 AND status = 'pending' RETURNING *`,
          [decision, req.user.id, id]
        );
        if (!updated.rows.length) {
          await client.query('ROLLBACK');
          continue;
        }
        const log = updated.rows[0];
        if (decision === 'approved' && !(await comp.alreadyCreditedFor(log.id, log.track, client))) {
          const credit = await comp.creditWork({
            userId: log.user_id, workType: log.track, referenceId: log.id,
            description: log.track === 'cascade_share'
              ? `Cascade share (wave ${log.wave || '?'}, ${log.group_name || 'group'})`
              : 'Community response',
            metadata: { engagement_id: log.id, group_name: log.group_name, wave: log.wave },
            client,
          });
          if (credit.credited) credited += 1;
        }
        await client.query('COMMIT');
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    asJson(res, 200, { success: true, reviewed: ids.length, credited });
  } catch (error) {
    console.error('Engagement review failed:', error.message);
    asJson(res, 500, { success: false, error: 'Review failed' });
  }
});

// ---------------------------------------------------------------------------
// Admin: comp rates + team structure
// ---------------------------------------------------------------------------

router.post('/comp-rates', ensureSuperAdmin, logActivity('comp_rate_save'), async (req, res) => {
  try {
    const workType = req.body.work_type;
    if (!comp.WORK_TYPES.includes(workType)) {
      return asJson(res, 400, { success: false, error: 'Invalid work type' });
    }
    const userId = req.body.user_id && core.isUuid(req.body.user_id) ? req.body.user_id : null;
    const currency = /^[A-Z]{3}$/.test(req.body.currency || '') ? req.body.currency : 'LAK';
    const rateAmount = parseFloat(req.body.rate_amount) || 0;
    if (rateAmount < 0) {
      return asJson(res, 400, { success: false, error: 'rate_amount must be non-negative' });
    }
    let tiers = null;
    if (req.body.tiers) {
      tiers = typeof req.body.tiers === 'string' ? JSON.parse(req.body.tiers) : req.body.tiers;
      if (!Array.isArray(tiers)) return asJson(res, 400, { success: false, error: 'tiers must be an array' });
    }
    await db.query(
      `UPDATE comp_rates SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE is_active = TRUE AND work_type = $1 AND user_id IS NOT DISTINCT FROM $2`,
      [workType, userId]
    );
    const inserted = await db.query(
      `INSERT INTO comp_rates (user_id, work_type, rate_amount, currency, tiers, bonus_percent, bonus_floor)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId,
        workType,
        rateAmount,
        currency,
        tiers ? JSON.stringify(tiers) : null,
        req.body.bonus_percent != null && req.body.bonus_percent !== '' ? parseFloat(req.body.bonus_percent) : null,
        req.body.bonus_floor != null && req.body.bonus_floor !== '' ? parseFloat(req.body.bonus_floor) : null,
      ]
    );
    asJson(res, 200, { success: true, rate: inserted.rows[0] });
  } catch (error) {
    console.error('Comp rate save failed:', error.message);
    asJson(res, error instanceof SyntaxError ? 400 : 500, { success: false, error: 'Rate save failed: ' + error.message });
  }
});

// Position + manager assignment (team structure from the briefs). One
// person can hold several positions at once (translator + content
// verifier + engagement associate …) — pay resolves per action, so each
// hat earns its own way. Accepts `positions` (array) or the legacy single
// `position`; the legacy column mirrors the first entry for old readers.
router.post('/team/:id', ensureSuperAdmin, logActivity('team_update'), async (req, res) => {
  try {
    if (!core.isUuid(req.params.id)) return asJson(res, 404, { success: false, error: 'User not found' });
    let positions;
    if (Array.isArray(req.body.positions)) {
      if (req.body.positions.some((p) => !POSITIONS.includes(p))) {
        return asJson(res, 400, { success: false, error: 'Invalid position' });
      }
      positions = [...new Set(req.body.positions)];
    } else {
      const single = req.body.position === '' ? null : req.body.position;
      if (single && !POSITIONS.includes(single)) {
        return asJson(res, 400, { success: false, error: 'Invalid position' });
      }
      positions = single ? [single] : [];
    }
    const managerId = req.body.manager_id && core.isUuid(req.body.manager_id) ? req.body.manager_id : null;
    if (managerId === req.params.id) {
      return asJson(res, 400, { success: false, error: 'A user cannot manage themselves' });
    }
    await db.query(
      `UPDATE users SET positions = $1, position = $2, manager_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [positions, positions[0] || null, managerId, req.params.id]
    );
    asJson(res, 200, { success: true });
  } catch (error) {
    console.error('Team update failed:', error.message);
    asJson(res, 500, { success: false, error: 'Update failed' });
  }
});

module.exports = { router, POSITIONS, LEAD_STATUSES, ENGAGEMENT_TRACKS };
