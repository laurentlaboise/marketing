// Customer-facing whiteboard routes, mounted at /portal/boards.
//
// Same auth model as src/routes/portal.js: a signed-in customer is
// req.session.customerId and nothing else. Customers only ever see boards
// they are a member of; anything else 404s so board ids cannot be
// enumerated across accounts.

const express = require('express');
const db = require('../../../database/db');
const { UUID_RE, relaxedBoardCsp, colorForCustomer, notFound } = require('./util');

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
        `SELECT b.id, b.title, b.updated_at, m.role
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

      res.setHeader('Content-Security-Policy', relaxedBoardCsp(res.locals.cspNonce));
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
        isAdmin: false
      });
    } catch (e) {
      console.error('Whiteboard portal board error:', e);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load the board.', code: 500 });
    }
  });

  return router;
}

module.exports = createPortalRouter;
