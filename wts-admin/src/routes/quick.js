// Quick-access API endpoints shared by EVERY signed-in role.
//
// The Enhanced Top Bar ships two endpoints that must work for workers
// (translators / vendors) as well as admins: grouped global search and
// the video-call invite (the whole point of the call button is workers
// reaching their coordinators). The rest of /api stays admin-only, so
// these two handlers live here instead of src/routes/api.js: server.js
// mounts this router at /api BEFORE the ensureAdmin-guarded /api mount
// (same precedent as /api/assistant). Auth is attached per-route — an
// /api request that matches nothing here falls through untouched to the
// admin router, which keeps answering 401/403 exactly as before.
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ensureAuthenticated, isSuperAdmin } = require('../middleware/auth');
const db = require('../../database/db');
const { notifySuperAdmins } = require('../lib/translation-core');

const router = express.Router();

// API response helper (same shape as src/routes/api.js).
const respond = (res, data, status = 200) => {
  res.status(status).json({ success: status < 400, ...data });
};

// Escape LIKE/ILIKE wildcards so user input matches literally.
// Single character class, linear by construction.
const likePattern = (s) => '%' + s.replace(/[\\%_]/g, (m) => '\\' + m) + '%';

// ==================== SEARCH ====================

// Global top-bar search, role-scoped inside the handler:
//   admin / superadmin — all four groups (Content, Translations, Form
//     Submissions, Leads), LIMIT 5 each: the pre-split behavior.
//   everyone else (workers) — ONLY a Translations group, restricted to
//     rows they are involved in (assigned as translator or verifier) or
//     can claim (requires_review in an assigned language, unclaimed).
//
// Response shape: { groups: [{ label, items: [{ title, meta, href }] }] }
// — one group per domain, empty groups omitted.
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // debounced type-ahead; 60/15min per IP mirrors existing limiter sizing
  standardHeaders: true,
  legacyHeaders: false,
});

// Edit-page hrefs for the admin content group (same map the old client used).
const CONTENT_HREFS = {
  article: (id) => `/content/articles/${id}/edit`,
  'ai-tool': (id) => `/content/ai-tools/${id}/edit`,
  glossary: (id) => `/content/glossary/${id}/edit`,
  product: (id) => `/business/products/${id}/edit`,
};

// Entity-title UNION shared by both role branches: resolves translation
// rows to searchable titles the way translations.js withEntityTitles
// does, one branch per entity type (site pages excluded — path fragments
// are not useful search titles). $1 is the ILIKE pattern.
const TRANSLATION_TITLE_UNION = `
  SELECT t.id, a.title AS title, t.entity_type, t.target_language, t.status,
         t.translator_id, t.verifier_id, t.updated_at
    FROM translations t JOIN articles a ON t.entity_type = 'article' AND a.id = t.entity_id
   WHERE a.title ILIKE $1
  UNION ALL
  SELECT t.id, g.term, t.entity_type, t.target_language, t.status,
         t.translator_id, t.verifier_id, t.updated_at
    FROM translations t JOIN glossary g ON t.entity_type = 'glossary' AND g.id = t.entity_id
   WHERE g.term ILIKE $1
  UNION ALL
  SELECT t.id, s.term, t.entity_type, t.target_language, t.status,
         t.translator_id, t.verifier_id, t.updated_at
    FROM translations t JOIN seo_terms s ON t.entity_type = 'seo_term' AND s.id = t.entity_id
   WHERE s.term ILIKE $1
  UNION ALL
  SELECT t.id, gu.title, t.entity_type, t.target_language, t.status,
         t.translator_id, t.verifier_id, t.updated_at
    FROM translations t JOIN guides gu ON t.entity_type = 'guide' AND gu.id = t.entity_id
   WHERE gu.title ILIKE $1
  UNION ALL
  SELECT t.id, p.name, t.entity_type, t.target_language, t.status,
         t.translator_id, t.verifier_id, t.updated_at
    FROM translations t JOIN products p ON t.entity_type = 'product' AND p.id = t.entity_id
   WHERE p.name ILIKE $1
`;

router.get('/search', ensureAuthenticated, searchLimiter, async (req, res) => {
  const raw = (typeof req.query.q === 'string') ? req.query.q : '';
  // Clamp before anything else: 100 chars is plenty for a title probe and
  // keeps the ILIKE scans cheap.
  const searchQuery = raw.slice(0, 100).trim();
  if (searchQuery.length < 2) {
    return respond(res, { groups: [] });
  }

  try {
    const term = likePattern(searchQuery);

    // ---- Worker scope: my work, and work I could claim — nothing else.
    // A worker never sees Content / Form Submissions / Leads, and never a
    // translation they have no stake in.
    if (!isSuperAdmin(req.user)) {
      const assigned = req.user.assigned_languages || [];
      const mine = await db.query(
        `SELECT id::text, title, entity_type, target_language, status
           FROM (${TRANSLATION_TITLE_UNION}) x
          WHERE x.translator_id = $2 OR x.verifier_id = $2
             OR (x.status = 'requires_review' AND x.target_language = ANY($3) AND x.verifier_id IS NULL)
          ORDER BY updated_at DESC NULLS LAST LIMIT 8`,
        [term, req.user.id, assigned]
      );

      const groups = [];
      if (mine.rows.length > 0) {
        groups.push({
          label: 'Translations',
          items: mine.rows.map((r) => ({
            title: r.title,
            meta: `${r.entity_type} → ${r.target_language} · ${r.status}`,
            // requires_review rows open in the verify editor, everything
            // else in the translate workspace editor — the same links the
            // workspace queues render (views/translations/workspace-list).
            href: r.status === 'requires_review'
              ? `/translations/verify/${r.id}`
              : `/translations/workspace/${r.id}`,
          })),
        });
      }
      return respond(res, { groups });
    }

    // ---- Admin scope: one query per group, all parameterized; each
    // capped at 5 rows.
    const [content, translations, submissions, leads] = await Promise.all([
      // Content: same four sources the legacy flat search covered.
      db.query(
        `SELECT id::text, title, kind, status FROM (
           SELECT id, title, 'article'::text AS kind, status, updated_at FROM articles WHERE title ILIKE $1
           UNION ALL
           SELECT id, name, 'ai-tool', status, updated_at FROM ai_tools WHERE name ILIKE $1
           UNION ALL
           SELECT id, term, 'glossary', 'active', updated_at FROM glossary WHERE term ILIKE $1
           UNION ALL
           SELECT id, name, 'product', status, updated_at FROM products WHERE name ILIKE $1
         ) c ORDER BY updated_at DESC NULLS LAST LIMIT 5`,
        [term]
      ),
      db.query(
        `SELECT id::text, title, entity_type, target_language, status
           FROM (${TRANSLATION_TITLE_UNION}) x
          ORDER BY updated_at DESC NULLS LAST LIMIT 5`,
        [term]
      ),
      // Form submissions (table behind /webdev/submissions).
      db.query(
        `SELECT id::text, name, email, form_type, status FROM form_submissions
          WHERE name ILIKE $1 OR email ILIKE $1 OR company ILIKE $1
          ORDER BY created_at DESC LIMIT 5`,
        [term]
      ),
      // Workforce leads.
      db.query(
        `SELECT id::text, name, company, email, phone, status FROM leads
          WHERE name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1
          ORDER BY created_at DESC LIMIT 5`,
        [term]
      ),
    ]);

    const groups = [];

    if (content.rows.length > 0) {
      groups.push({
        label: 'Content',
        items: content.rows.map((r) => ({
          title: r.title,
          meta: `${r.kind} · ${r.status || 'draft'}`,
          href: CONTENT_HREFS[r.kind] ? CONTENT_HREFS[r.kind](r.id) : '#',
        })),
      });
    }

    if (translations.rows.length > 0) {
      groups.push({
        label: 'Translations',
        items: translations.rows.map((r) => ({
          title: r.title,
          meta: `${r.entity_type} → ${r.target_language} · ${r.status}`,
          href: `/translations/review/${r.id}`,
        })),
      });
    }

    if (submissions.rows.length > 0) {
      groups.push({
        label: 'Form Submissions',
        items: submissions.rows.map((r) => ({
          title: r.name || r.email || 'Submission',
          meta: [r.form_type, r.email, r.status].filter(Boolean).join(' · '),
          href: '/webdev/submissions',
        })),
      });
    }

    if (leads.rows.length > 0) {
      groups.push({
        label: 'Leads',
        items: leads.rows.map((r) => ({
          title: r.name || r.company || r.email || r.phone || 'Lead',
          meta: [r.company, r.status].filter(Boolean).join(' · '),
          href: '/workforce/leads',
        })),
      });
    }

    respond(res, { groups });
  } catch (error) {
    respond(res, { error: 'Search failed' }, 500);
  }
});

// ==================== VIDEO CALL INVITE ====================

// Start an ad-hoc Jitsi call and notify super admins with the join link.
// Deliberately open to every authenticated role — workers use it to call
// their coordinators. The room name is unguessable (12 hex chars ≈ 48
// bits); media, device permissions and lobby behavior are Jitsi's own UI.
const callInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/call-invite', ensureAuthenticated, callInviteLimiter, async (req, res) => {
  try {
    const room = `wts-call-${crypto.randomBytes(6).toString('hex')}`;
    const roomUrl = `https://meet.jit.si/${room}`;
    const caller = [req.user.first_name, req.user.last_name].filter(Boolean).join(' ') || req.user.email;
    // notifySuperAdmins never throws (it logs and swallows DB errors) —
    // an unnotified call is still a usable call. The message names the
    // caller so coordinators know who is waiting in the room.
    await notifySuperAdmins(
      `${caller} started a video call`,
      `${caller} invites you to join the call: ${roomUrl}`,
      roomUrl
    );
    respond(res, { roomUrl });
  } catch (error) {
    respond(res, { error: 'Failed to start call' }, 500);
  }
});

module.exports = router;
