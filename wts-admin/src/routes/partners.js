// Partner-program administration: the approval queue for affiliate /
// dropship / white-label applications from the client portal. Mounted
// behind ensureAdmin in server.js — customers apply self-serve, a human
// approves here, and only 'active' enrollments ever unlock earning
// capability. Decisions email the applicant (best-effort, branded shell,
// their portal language) and are stamped for audit.
const express = require('express');
const db = require('../../database/db');
const { logActivity } = require('../middleware/auth');
const { translate } = require('../lib/i18n');

const router = express.Router();

const asJson = (res, status, body) => res.status(status).json(body);

const PROGRAMS = ['affiliate', 'dropship', 'white_label'];
const PROGRAM_LABELS = { affiliate: 'Affiliate Program', dropship: 'Digital Dropshipping', white_label: 'White Label' };
// action → resulting status. Rejected applicants can re-apply from the
// portal; suspended ones cannot (reactivate is the admin's call).
const DECISIONS = { approve: 'active', reject: 'rejected', suspend: 'suspended', reactivate: 'active' };

router.get('/', async (req, res, next) => {
  try {
    const rows = (await db.query(
      `SELECT e.*, c.email, c.name, c.company, c.created_at AS customer_since,
              u.first_name AS decided_by_name
       FROM partner_enrollments e
       JOIN customers c ON c.id = e.customer_id
       LEFT JOIN users u ON u.id = e.decided_by
       ORDER BY (e.status = 'pending') DESC, e.updated_at DESC`
    )).rows;
    const counts = { pending: 0, active: 0, rejected: 0, suspended: 0 };
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    res.render('partners/list', {
      title: 'Partner Programs - WTS Admin',
      currentPage: 'partners',
      enrollments: rows,
      counts,
      programLabels: PROGRAM_LABELS,
      programs: PROGRAMS,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/decision', logActivity('partner_decision'), async (req, res) => {
  try {
    const action = String(req.body.action || '');
    const nextStatus = DECISIONS[action];
    if (!nextStatus) return asJson(res, 400, { success: false, error: 'Unknown action' });
    const adminNote = String(req.body.note || '').trim().slice(0, 500) || null;

    const updated = (await db.query(
      `UPDATE partner_enrollments e
       SET status = $1, admin_note = COALESCE($2, e.admin_note),
           decided_by = $3, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       FROM customers c
       WHERE e.id = $4 AND c.id = e.customer_id
       RETURNING e.program, e.status, c.email, c.preferred_language`,
      [nextStatus, adminNote, req.user.id, req.params.id]
    )).rows[0];
    if (!updated) return asJson(res, 404, { success: false, error: 'Enrollment not found' });

    // Best-effort decision email in the applicant's portal language —
    // reactivations reuse the approval copy.
    const emailKind = action === 'reject' ? 'rejected' : (action === 'suspend' ? 'suspended' : 'approved');
    try {
      const { sendEmail, emailShell } = require('../utils/mailer');
      const locale = updated.preferred_language || 'en';
      const vars = {
        program: PROGRAM_LABELS[updated.program] || updated.program,
        brand: translate(locale, 'emails.shell.brand'),
      };
      const portalUrl = `${(process.env.PORTAL_URL || process.env.APP_ADMIN_URL || 'https://admin.wordsthatsells.website').replace(/\/$/, '')}/portal/programs`;
      await sendEmail({
        to: updated.email,
        subject: translate(locale, `emails.partner.${emailKind}Subject`, vars),
        html: emailShell(translate(locale, `emails.partner.${emailKind}Title`, vars), `
      <p style="color:#334155;font-size:0.95rem;line-height:1.6;">${translate(locale, `emails.partner.${emailKind}Body`, vars)}</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${portalUrl}" style="background:#d62b83;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block;">${translate(locale, 'emails.partner.cta', vars)}</a>
      </p>`, locale),
        text: `${translate(locale, `emails.partner.${emailKind}Body`, vars)} ${portalUrl}`,
      });
    } catch (e) {
      console.warn('Partner decision email failed (decision still applied):', e.message);
    }

    asJson(res, 200, { success: true, status: updated.status });
  } catch (error) {
    console.error('Partner decision failed:', error.message);
    asJson(res, 500, { success: false, error: 'Decision failed' });
  }
});

module.exports = router;
