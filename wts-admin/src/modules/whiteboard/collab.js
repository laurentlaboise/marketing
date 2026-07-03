// Stage D+E: pinned threaded comments + approval workflow (JSON endpoints).
//
// Registered on BOTH the admin router (/business/boards, behind rate limit →
// ensureAuthenticated → ensureAdmin) and the portal router (/portal/boards,
// behind requireCustomer). All state-changing POSTs additionally sit behind
// the global session-token CSRF middleware, so callers must send
// X-CSRF-Token (the board island reads it from window.__WTS_BOARD__).
//
// Role model:
//   admin                          → comment, resolve, request approvals
//   member owner/editor/commenter  → comment, resolve, decide approvals
//   member viewer                  → read-only (403 on mutations)
// Non-members 404 on the portal side so board ids cannot be enumerated.

const db = require('../../../database/db');
const { UUID_RE } = require('./util');
const { broadcast } = require('./sync');
const { sendEmail } = require('../../utils/mailer');

const COMMENTER_ROLES = new Set(['owner', 'editor', 'commenter']);
const MAX_BODY = 2000;
const MAX_NOTE = 2000;

const PORTAL_BASE = () =>
  (process.env.PORTAL_URL || process.env.APP_ADMIN_URL || 'https://admin.wordsthatsells.website')
    .replace(/\/$/, '');

const jsonError = (res, code, error) => res.status(code).json({ error });

// Resolve who is calling and what they may do on this board.
// Returns null after replying (404) when the caller may not see the board.
async function resolveActor(req, res, side) {
  const boardId = req.params.id;
  if (!UUID_RE.test(boardId)) {
    jsonError(res, 404, 'Board not found');
    return null;
  }

  if (side === 'admin') {
    // ensureAdmin already ran; just confirm the board exists.
    const board = (await db.query('SELECT id FROM boards WHERE id = $1', [boardId])).rows[0];
    if (!board) {
      jsonError(res, 404, 'Board not found');
      return null;
    }
    const name = [req.user.first_name, req.user.last_name].filter(Boolean).join(' ')
      || req.user.email || 'WTS Team';
    return {
      boardId,
      type: 'admin',
      id: String(req.user.id),
      name,
      canComment: true
    };
  }

  // Portal side: caller must be a member of the board.
  const member = (await db.query(
    `SELECT m.role, c.name, c.email
     FROM board_members m
     JOIN customers c ON c.id::text = m.principal_id
     WHERE m.board_id = $1 AND m.principal_type = 'customer' AND m.principal_id = $2`,
    [boardId, String(req.session.customerId)]
  )).rows[0];
  if (!member) {
    jsonError(res, 404, 'Board not found');
    return null;
  }
  return {
    boardId,
    type: 'customer',
    id: String(req.session.customerId),
    name: member.name || member.email,
    role: member.role,
    canComment: COMMENTER_ROLES.has(member.role)
  };
}

function validAnchor(anchor) {
  if (anchor === null || anchor === undefined) return null;
  if (typeof anchor !== 'object' || Array.isArray(anchor)) return undefined; // invalid
  if (Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
    return { x: anchor.x, y: anchor.y };
  }
  if (typeof anchor.shapeId === 'string' && anchor.shapeId.length <= 100) {
    return { shapeId: anchor.shapeId };
  }
  return undefined; // invalid
}

async function latestApproval(boardId) {
  return (await db.query(
    `SELECT * FROM board_approvals WHERE board_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [boardId]
  )).rows[0] || null;
}

// Fire-and-forget notification to every customer member when a review is
// requested. Mailer failures are logged and never block the response.
function notifyApprovalRequested(boardId, note) {
  (async () => {
    const board = (await db.query('SELECT title FROM boards WHERE id = $1', [boardId])).rows[0];
    const members = (await db.query(
      `SELECT c.email, c.name FROM board_members m
       JOIN customers c ON c.id::text = m.principal_id
       WHERE m.board_id = $1 AND m.principal_type = 'customer'`,
      [boardId]
    )).rows;
    const link = `${PORTAL_BASE()}/portal/boards/${boardId}`;
    const title = (board && board.title) || 'your board';
    for (const m of members) {
      if (!m.email) continue;
      try {
        await sendEmail({
          to: m.email,
          subject: `Your review is requested — ${title}`,
          html: `<p>Hi ${m.name || 'there'},</p>
<p>Your strategist has asked you to review the whiteboard <strong>${title}</strong>.</p>
${note ? `<p>Note: ${String(note).replace(/</g, '&lt;')}</p>` : ''}
<p><a href="${link}">Open the board</a> to approve it or request changes.</p>`,
          text: `Your review is requested on "${title}". Open ${link} to approve it or request changes.${note ? `\nNote: ${note}` : ''}`
        });
      } catch (e) {
        console.warn(`Whiteboard approval email failed (${m.email}):`, e.message);
      }
    }
  })().catch((e) => console.warn('Whiteboard approval notification failed:', e.message));
}

// Registers the comment + approval endpoints on a board router.
// side: 'admin' | 'portal'
function addCollabRoutes(router, side) {
  // ── Comments ─────────────────────────────────────────────────

  router.get('/:id/comments', async (req, res) => {
    try {
      const actor = await resolveActor(req, res, side);
      if (!actor) return;
      const comments = (await db.query(
        'SELECT * FROM board_comments WHERE board_id = $1 ORDER BY created_at ASC',
        [actor.boardId]
      )).rows;
      res.json({ comments });
    } catch (e) {
      console.error('Whiteboard comments list error:', e);
      jsonError(res, 500, 'Failed to load comments');
    }
  });

  router.post('/:id/comments', async (req, res) => {
    try {
      const actor = await resolveActor(req, res, side);
      if (!actor) return;
      if (!actor.canComment) return jsonError(res, 403, 'Your role on this board does not allow commenting');

      const body = String(req.body.body || '').trim();
      if (!body || body.length > MAX_BODY) {
        return jsonError(res, 400, `Comment must be 1–${MAX_BODY} characters`);
      }

      const anchor = validAnchor(req.body.anchor);
      if (anchor === undefined) return jsonError(res, 400, 'Invalid anchor');

      let parentId = null;
      if (req.body.parentId) {
        if (!UUID_RE.test(String(req.body.parentId))) return jsonError(res, 400, 'Invalid parentId');
        const parent = (await db.query(
          'SELECT id, parent_id FROM board_comments WHERE id = $1 AND board_id = $2',
          [String(req.body.parentId), actor.boardId]
        )).rows[0];
        if (!parent) return jsonError(res, 400, 'Parent comment not found on this board');
        // Keep threads one level deep: replying to a reply attaches to the root.
        parentId = parent.parent_id || parent.id;
      }

      const comment = (await db.query(
        `INSERT INTO board_comments (board_id, parent_id, anchor, author_type, author_id, author_name, body)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
         RETURNING *`,
        [actor.boardId, parentId, anchor ? JSON.stringify(anchor) : null,
          actor.type, actor.id, actor.name, body]
      )).rows[0];

      broadcast(actor.boardId, { type: 'wts-refresh', kind: 'comments' });
      res.status(201).json({ comment });
    } catch (e) {
      console.error('Whiteboard comment create error:', e);
      jsonError(res, 500, 'Failed to add the comment');
    }
  });

  const setResolved = (resolved) => async (req, res) => {
    try {
      const actor = await resolveActor(req, res, side);
      if (!actor) return;
      if (!actor.canComment) return jsonError(res, 403, 'Your role on this board does not allow resolving comments');
      if (!UUID_RE.test(req.params.cid)) return jsonError(res, 404, 'Comment not found');

      const comment = (await db.query(
        `UPDATE board_comments
         SET resolved_at = ${resolved ? 'CURRENT_TIMESTAMP' : 'NULL'}
         WHERE id = $1 AND board_id = $2
         RETURNING *`,
        [req.params.cid, actor.boardId]
      )).rows[0];
      if (!comment) return jsonError(res, 404, 'Comment not found');

      broadcast(actor.boardId, { type: 'wts-refresh', kind: 'comments' });
      res.json({ comment });
    } catch (e) {
      console.error('Whiteboard comment resolve error:', e);
      jsonError(res, 500, 'Failed to update the comment');
    }
  };
  router.post('/:id/comments/:cid/resolve', setResolved(true));
  router.post('/:id/comments/:cid/unresolve', setResolved(false));

  // ── Approvals ────────────────────────────────────────────────

  router.get('/:id/approvals', async (req, res) => {
    try {
      const actor = await resolveActor(req, res, side);
      if (!actor) return;
      res.json({ approval: await latestApproval(actor.boardId) });
    } catch (e) {
      console.error('Whiteboard approval fetch error:', e);
      jsonError(res, 500, 'Failed to load the approval status');
    }
  });

  if (side === 'admin') {
    // Create/replace the open approval request.
    router.post('/:id/approvals', async (req, res) => {
      try {
        const actor = await resolveActor(req, res, side);
        if (!actor) return;

        const note = req.body.note ? String(req.body.note).trim().slice(0, MAX_NOTE) : null;
        let dueAt = null;
        if (req.body.dueAt) {
          dueAt = new Date(req.body.dueAt);
          if (Number.isNaN(dueAt.getTime())) return jsonError(res, 400, 'Invalid dueAt');
        }

        // If a request is already awaiting review, replace it in place;
        // otherwise (none yet, or already decided) open a fresh one so the
        // decision history is kept.
        const open = await latestApproval(actor.boardId);
        let approval;
        if (open && open.status === 'awaiting_review') {
          approval = (await db.query(
            `UPDATE board_approvals
             SET requested_by = $1, request_note = $2, due_at = $3,
                 reviewer_note = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING *`,
            [actor.name, note, dueAt, open.id]
          )).rows[0];
        } else {
          approval = (await db.query(
            `INSERT INTO board_approvals (board_id, status, requested_by, request_note, due_at)
             VALUES ($1, 'awaiting_review', $2, $3, $4)
             RETURNING *`,
            [actor.boardId, actor.name, note, dueAt]
          )).rows[0];
        }

        broadcast(actor.boardId, { type: 'wts-refresh', kind: 'approval' });
        notifyApprovalRequested(actor.boardId, note);
        res.status(201).json({ approval });
      } catch (e) {
        console.error('Whiteboard approval request error:', e);
        jsonError(res, 500, 'Failed to request approval');
      }
    });
  }

  if (side === 'portal') {
    // Customer decision on an open approval request.
    router.post('/:id/approvals/:aid/decide', async (req, res) => {
      try {
        const actor = await resolveActor(req, res, side);
        if (!actor) return;
        if (!actor.canComment) return jsonError(res, 403, 'Your role on this board does not allow reviewing');
        if (!UUID_RE.test(req.params.aid)) return jsonError(res, 404, 'Approval request not found');

        const decision = String(req.body.decision || '');
        if (decision !== 'approved' && decision !== 'needs_changes') {
          return jsonError(res, 400, "decision must be 'approved' or 'needs_changes'");
        }
        const note = req.body.note ? String(req.body.note).trim().slice(0, MAX_NOTE) : null;

        const approval = (await db.query(
          `UPDATE board_approvals
           SET status = $1, reviewer_note = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 AND board_id = $4 AND status = 'awaiting_review'
           RETURNING *`,
          [decision, note, req.params.aid, actor.boardId]
        )).rows[0];
        if (!approval) return jsonError(res, 404, 'No open approval request to decide');

        broadcast(actor.boardId, { type: 'wts-refresh', kind: 'approval' });
        res.json({ approval });
      } catch (e) {
        console.error('Whiteboard approval decide error:', e);
        jsonError(res, 500, 'Failed to record your decision');
      }
    });
  }
}

module.exports = { addCollabRoutes, resolveActor };
