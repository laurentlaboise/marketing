// Admin whiteboard routes, mounted at /business/boards.
//
// Mounted behind the same guard pattern server.js uses for business.js
// (rate limit → ensureAuthenticated → ensureAdmin, applied in index.js),
// and behind the global CSRF middleware for all state-changing POSTs.

const express = require('express');
const db = require('../../../database/db');
const i18n = require('../../lib/i18n');
const { UUID_RE, notFound } = require('./util');
const { addCollabRoutes } = require('./collab');
const { addAssetRoutes } = require('./assets');

const MEMBER_ROLES = new Set(['editor', 'commenter', 'viewer']);

// Redirect "back" to wherever the form lives, as long as it is one of ours.
function backTo(req, boardId) {
  const referer = String(req.get('referer') || '');
  try {
    const path = new URL(referer, 'http://x').pathname;
    if (path.startsWith('/business/boards')) return path;
  } catch (_) { /* fall through */ }
  return boardId ? `/business/boards/${boardId}` : '/business/boards';
}

function createAdminRouter() {
  const router = express.Router();

  // ── List + create ─────────────────────────────────────────────

  router.get('/', async (req, res) => {
    try {
      const customerFilter = UUID_RE.test(String(req.query.customer || '')) ? req.query.customer : null;
      const [boards, customers, filterCustomer] = await Promise.all([
        db.query(
          `SELECT b.id, b.title, b.status, b.created_at,
                  COUNT(m.id)::int AS member_count,
                  COALESCE(
                    ARRAY_AGG(DISTINCT COALESCE(c.name, c.email)) FILTER (WHERE c.id IS NOT NULL),
                    '{}'
                  ) AS customer_names,
                  (SELECT a.status FROM board_approvals a
                   WHERE a.board_id = b.id
                   ORDER BY a.created_at DESC LIMIT 1) AS approval_status,
                  (SELECT COUNT(*)::int FROM board_comments bc
                   WHERE bc.board_id = b.id
                     AND bc.parent_id IS NULL
                     AND bc.resolved_at IS NULL) AS unresolved_comments
           FROM boards b
           LEFT JOIN board_members m ON m.board_id = b.id
           LEFT JOIN customers c
             ON m.principal_type = 'customer' AND c.id::text = m.principal_id
           GROUP BY b.id
           HAVING $1::uuid IS NULL OR bool_or(
             m.principal_type = 'customer' AND m.principal_id = $1::text
           )
           ORDER BY b.created_at DESC`,
          [customerFilter]
        ),
        db.query(
          `SELECT id, email, name FROM customers
           WHERE status = 'active'
           ORDER BY COALESCE(name, email)`
        ),
        customerFilter
          ? db.query('SELECT id, email, name FROM customers WHERE id = $1', [customerFilter])
          : Promise.resolve({ rows: [] })
      ]);
      res.render('whiteboard/admin-list', {
        title: 'Boards',
        currentPage: 'boards',
        boards: boards.rows,
        customers: customers.rows,
        filterCustomer: filterCustomer.rows[0] || null
      });
    } catch (e) {
      console.error('Whiteboard admin list error:', e);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load boards.', code: 500 });
    }
  });

  router.post('/', async (req, res) => {
    const title = String(req.body.title || '').trim();
    if (!title || title.length > 200) {
      req.session.errorMessage = 'A board title is required (200 characters max).';
      return res.redirect('/business/boards');
    }
    try {
      const board = (await db.query(
        'INSERT INTO boards (title, created_by) VALUES ($1, $2) RETURNING id',
        [title, String(req.user.id)]
      )).rows[0];
      await db.query(
        `INSERT INTO board_members (board_id, principal_type, principal_id, role)
         VALUES ($1, 'admin', $2, 'owner')`,
        [board.id, String(req.user.id)]
      );
      // Started from a client's page: invite that client in the same step so
      // the board is ready to share the moment it opens.
      const customerId = String(req.body.customer_id || '');
      if (UUID_RE.test(customerId)) {
        const customer = (await db.query(
          "SELECT id, email FROM customers WHERE id = $1 AND status = 'active'",
          [customerId]
        )).rows[0];
        if (customer) {
          await db.query(
            `INSERT INTO board_members (board_id, principal_type, principal_id, role)
             VALUES ($1, 'customer', $2, 'editor')
             ON CONFLICT (board_id, principal_type, principal_id) DO NOTHING`,
            [board.id, String(customer.id)]
          );
          req.session.successMessage = `Board created and shared with ${customer.email}`;
          return res.redirect(`/business/boards/${board.id}`);
        }
      }
      req.session.successMessage = 'Board created successfully';
      res.redirect(`/business/boards/${board.id}`);
    } catch (e) {
      console.error('Whiteboard create error:', e);
      req.session.errorMessage = 'Failed to create the board.';
      res.redirect('/business/boards');
    }
  });

  // ── Board page ────────────────────────────────────────────────

  router.get('/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return notFound(res);
    try {
      const board = (await db.query('SELECT * FROM boards WHERE id = $1', [req.params.id])).rows[0];
      if (!board) return notFound(res);
      res.render('whiteboard/board', {
        title: board.title,
        board,
        wsPath: '/ws/boards/' + board.id,
        user: {
          id: 'admin:' + req.user.id,
          name: req.user.first_name || 'WTS Team',
          color: '#d62b83'
        },
        backUrl: '/business/boards',
        isAdmin: true,
        csrfToken: res.locals.csrfToken,
        apiBase: '/business/boards/' + board.id,
        canComment: true,
        canApprove: true,
        canDecide: false,
        canUpload: true,
        // Staff side renders in English; customer text arrives with a
        // machine translation attached by the collab endpoints.
        viewerLang: 'en',
        boardStrings: i18n.dictionary('en', 'boards.island')
      });
    } catch (e) {
      console.error('Whiteboard board page error:', e);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load the board.', code: 500 });
    }
  });

  // ── Membership management ─────────────────────────────────────

  router.post('/:id/members', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return notFound(res);
    const customerId = String(req.body.customer_id || '');
    const role = MEMBER_ROLES.has(req.body.role) ? req.body.role : 'editor';
    if (!UUID_RE.test(customerId)) {
      req.session.errorMessage = 'Pick a customer to invite.';
      return res.redirect(backTo(req, req.params.id));
    }
    try {
      const board = (await db.query('SELECT id FROM boards WHERE id = $1', [req.params.id])).rows[0];
      const customer = (await db.query('SELECT id, name, email FROM customers WHERE id = $1', [customerId])).rows[0];
      if (!board || !customer) return notFound(res);
      await db.query(
        `INSERT INTO board_members (board_id, principal_type, principal_id, role)
         VALUES ($1, 'customer', $2, $3)
         ON CONFLICT (board_id, principal_type, principal_id)
         DO UPDATE SET role = EXCLUDED.role`,
        [board.id, String(customer.id), role]
      );
      req.session.successMessage = `${customer.name || customer.email} can now access this board as ${role}.`;
      res.redirect(backTo(req, req.params.id));
    } catch (e) {
      console.error('Whiteboard member upsert error:', e);
      req.session.errorMessage = 'Failed to update board access.';
      res.redirect(backTo(req, req.params.id));
    }
  });

  router.post('/:id/members/:mid/delete', async (req, res) => {
    if (!UUID_RE.test(req.params.id) || !UUID_RE.test(req.params.mid)) return notFound(res);
    try {
      await db.query(
        'DELETE FROM board_members WHERE id = $1 AND board_id = $2',
        [req.params.mid, req.params.id]
      );
      req.session.successMessage = 'Board access removed';
      res.redirect(backTo(req, req.params.id));
    } catch (e) {
      console.error('Whiteboard member delete error:', e);
      req.session.errorMessage = 'Failed to remove board access.';
      res.redirect(backTo(req, req.params.id));
    }
  });

  // ── Comments + approvals (stage D+E JSON endpoints) ──────────
  addCollabRoutes(router, 'admin');
  addAssetRoutes(router, 'admin');

  // ── Delete board ──────────────────────────────────────────────

  router.post('/:id/delete', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return notFound(res);
    try {
      await db.query('DELETE FROM boards WHERE id = $1', [req.params.id]);
      req.session.successMessage = 'Board deleted';
    } catch (e) {
      console.error('Whiteboard delete error:', e);
      req.session.errorMessage = 'Failed to delete the board.';
    }
    res.redirect('/business/boards');
  });

  return router;
}

module.exports = createAdminRouter;
