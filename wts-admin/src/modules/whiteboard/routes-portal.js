// Customer-facing whiteboard routes, mounted at /portal/boards.
//
// Same auth model as src/routes/portal.js: a signed-in customer is
// req.session.customerId and nothing else. Customers only ever see boards
// they are a member of; anything else 404s so board ids cannot be
// enumerated across accounts.

const express = require('express');
const db = require('../../../database/db');
const { UUID_RE, colorForCustomer, notFound } = require('./util');
const { addCollabRoutes } = require('./collab');
const { addAssetRoutes } = require('./assets');

const COMMENTER_ROLES = new Set(['owner', 'editor', 'commenter']);

// Replicates the requireCustomer guard from src/routes/portal.js.
const requireCustomer = (req, res, next) => {
  if (req.session && req.session.customerId) return next();
  return res.redirect('/portal/login');
};

function createPortalRouter() {
  const router = express.Router();

  router.use(requireCustomer);

  router.get('/', async (req, res) => {
    try {
      const boards = await db.query(
        `SELECT b.id, b.title, b.updated_at, m.role,
                (SELECT a.status FROM board_approvals a
                 WHERE a.board_id = b.id
                 ORDER BY a.created_at DESC LIMIT 1) AS approval_status,
                (SELECT COUNT(*)::int FROM board_comments bc
                 WHERE bc.board_id = b.id
                   AND bc.parent_id IS NULL
                   AND bc.resolved_at IS NULL) AS unresolved_comments
         FROM boards b
         JOIN board_members m ON m.board_id = b.id
         WHERE m.principal_type = 'customer' AND m.principal_id = $1
         ORDER BY b.updated_at DESC`,
        [String(req.session.customerId)]
      );
      res.render('whiteboard/portal-list', {
        title: 'My Boards - Words That Sells',
        boards: boards.rows
      });
    } catch (e) {
      console.error('Whiteboard portal list error:', e);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load your boards.', code: 500 });
    }
  });

  router.get('/:id', async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return notFound(res);
    try {
      const result = await db.query(
        `SELECT b.*, m.role AS member_role
         FROM boards b
         JOIN board_members m ON m.board_id = b.id
         WHERE b.id = $1 AND m.principal_type = 'customer' AND m.principal_id = $2`,
        [req.params.id, String(req.session.customerId)]
      );
      const board = result.rows[0];
      if (!board) return notFound(res);

      const customer = (await db.query(
        'SELECT id, name, email FROM customers WHERE id = $1',
        [req.session.customerId]
      )).rows[0];
      if (!customer) {
        req.session.destroy(() => {});
        return res.redirect('/portal/login');
      }

      res.render('whiteboard/board', {
        title: board.title,
        board,
        wsPath: '/ws/boards/' + board.id,
        user: {
          id: 'customer:' + customer.id,
          name: customer.name || customer.email,
          color: colorForCustomer(customer.id)
        },
        backUrl: '/portal/boards',
        isAdmin: false,
        csrfToken: res.locals.csrfToken,
        apiBase: '/portal/boards/' + board.id,
        canComment: COMMENTER_ROLES.has(board.member_role),
        canApprove: false,
        canDecide: COMMENTER_ROLES.has(board.member_role),
        canUpload: ['owner', 'editor'].includes(board.member_role)
      });
    } catch (e) {
      console.error('Whiteboard portal board error:', e);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load the board.', code: 500 });
    }
  });

  // ── Comments + approvals (stage D+E JSON endpoints) ──────────
  addCollabRoutes(router, 'portal');
  addAssetRoutes(router, 'portal');

  return router;
}

module.exports = createPortalRouter;
