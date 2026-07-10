// Compensation engine for non-translation work units, modelled on the
// position briefs (all amounts editable in comp_rates — "prices not set
// in stone"):
//
//   lead_entry           clean data entry into the CRM (flat per record)
//   lead_directory_call  directory record confirmed/updated by phone
//   lead_qualified       warm, contactable lead — MARGINAL monthly tiers
//                        (lead #21 pays the 21–50 rate while #1–20 kept
//                        theirs; nothing is retroactive)
//   lead_conversion      closed sale — percent of sale value with a
//                        floor, or a flat bounty when rate_amount is set
//                        and bonus_percent is null
//   community_response   Track B: on-brand reply under published content
//   cascade_share        one tracked share in a cascade wave
//
// Every credit lands in payout_ledger (status 'available') and flows
// through the existing payout-request → settle pipeline. Junk pays
// nothing by construction: credits are only written from admin approval
// actions.
const db = require('../../database/db');
const { roundMoney } = require('./translation-core');

const WORK_TYPES = [
  'lead_entry',
  'lead_directory_call',
  'lead_qualified',
  'lead_conversion',
  'community_response',
  'cascade_share',
];

const LEDGER_TYPE_BY_WORK = {
  lead_entry: 'lead_credit',
  lead_directory_call: 'lead_credit',
  lead_qualified: 'lead_credit',
  lead_conversion: 'conversion_bonus',
  community_response: 'engagement_credit',
  cascade_share: 'engagement_credit',
};

// User-specific card beats the global one.
async function resolveCompRate(workType, userId, client = db) {
  const result = await client.query(
    `SELECT * FROM comp_rates
     WHERE is_active = TRUE AND work_type = $1
       AND (user_id = $2 OR user_id IS NULL)
     ORDER BY (user_id IS NOT NULL) DESC, updated_at DESC
     LIMIT 1`,
    [workType, userId]
  );
  return result.rows[0] || null;
}

// Marginal tier lookup: tiers = [{min, max?, rate}], count = which unit
// this is for the user in the period (1-based).
function tierRate(tiers, count) {
  if (!Array.isArray(tiers)) return null;
  for (const tier of tiers) {
    const min = Number(tier.min) || 1;
    const max = tier.max == null ? Infinity : Number(tier.max);
    if (count >= min && count <= max) return Number(tier.rate) || 0;
  }
  return null;
}

// How many of the user's leads reached `status` this calendar month —
// determines the marginal tier for the next one. Attribution mirrors the
// approve flow exactly (assigned_to, else entered_by when unassigned), so
// unassigned-but-entered leads count toward the same worker's tier they
// pay out to. statusTimestampColumn is an internal fixed identifier
// (callers pass literals), never user input.
async function monthlyLeadCount(userId, statusTimestampColumn, client = db) {
  if (!/^[a-z_]+$/.test(statusTimestampColumn)) {
    throw new Error(`Invalid timestamp column: ${statusTimestampColumn}`);
  }
  const result = await client.query(
    `SELECT COUNT(*)::int AS c FROM leads
     WHERE (assigned_to = $1 OR (assigned_to IS NULL AND entered_by = $1))
       AND ${statusTimestampColumn} >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [userId]
  );
  return result.rows[0].c;
}

// Compute the credit amount for one unit of work. `unitIndex` is the
// 1-based position within the period for tiered types; `saleValue` feeds
// conversion bonuses.
function computeCompAmount(rate, { unitIndex = 1, saleValue = null } = {}) {
  const currency = rate.currency || 'LAK';
  if (rate.work_type === 'lead_conversion') {
    const percent = rate.bonus_percent == null ? null : parseFloat(rate.bonus_percent);
    if (percent != null && saleValue != null && Number.isFinite(parseFloat(saleValue))) {
      const raw = (parseFloat(saleValue) * percent) / 100;
      const floor = rate.bonus_floor == null ? 0 : parseFloat(rate.bonus_floor);
      return roundMoney(Math.max(raw, floor), currency);
    }
    // Flat bounty (or percent configured but sale value private → floor).
    const flat = parseFloat(rate.rate_amount) || parseFloat(rate.bonus_floor) || 0;
    return roundMoney(flat, currency);
  }
  const tiered = tierRate(rate.tiers, unitIndex);
  if (tiered != null) return roundMoney(tiered, currency);
  return roundMoney(parseFloat(rate.rate_amount) || 0, currency);
}

// Write one work-unit credit to the ledger. Returns the credit summary or
// null (with a reason) when no active rate is configured — approvals
// still proceed; the admin sees the gap and can backfill after setting
// rates.
async function creditWork({
  userId,
  workType,
  description,
  metadata = {},
  unitIndex = 1,
  saleValue = null,
  referenceId = null,
  client = db,
}) {
  if (!WORK_TYPES.includes(workType)) {
    throw Object.assign(new Error(`Unknown work type: ${workType}`), { status: 400 });
  }
  const rate = await resolveCompRate(workType, userId, client);
  if (!rate) return { credited: false, reason: 'no_rate_configured' };
  const amount = computeCompAmount(rate, { unitIndex, saleValue });
  if (amount <= 0) return { credited: false, reason: 'zero_rate' };

  try {
    await client.query(
      `INSERT INTO payout_ledger (translator_id, amount, currency, type, status, description, metadata)
       VALUES ($1, $2, $3, $4, 'available', $5, $6)`,
      [
        userId,
        amount,
        rate.currency || 'LAK',
        LEDGER_TYPE_BY_WORK[workType],
        description,
        JSON.stringify({ ...metadata, work_type: workType, rate_id: rate.id, unit_index: unitIndex, reference_id: referenceId }),
      ]
    );
  } catch (error) {
    // uq_payout_ledger_work_reference: a concurrent approval already paid
    // this exact work unit — idempotent, not an error.
    if (error.code === '23505') return { credited: false, reason: 'already_credited' };
    throw error;
  }
  return { credited: true, amount, currency: rate.currency || 'LAK', workType, unitIndex };
}

// Idempotency guard for reference-linked credits (a lead or engagement
// row must never pay twice for the same work type).
async function alreadyCreditedFor(referenceId, workType, client = db) {
  const result = await client.query(
    `SELECT 1 FROM payout_ledger
     WHERE metadata->>'reference_id' = $1 AND metadata->>'work_type' = $2
     LIMIT 1`,
    [String(referenceId), workType]
  );
  return result.rows.length > 0;
}

module.exports = {
  WORK_TYPES,
  LEDGER_TYPE_BY_WORK,
  resolveCompRate,
  tierRate,
  monthlyLeadCount,
  computeCompAmount,
  creditWork,
  alreadyCreditedFor,
};
