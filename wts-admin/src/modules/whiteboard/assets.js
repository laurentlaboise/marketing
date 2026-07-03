// Board image assets: upload (per-side, role-checked), a membership-checked
// serving route shared by both portals, and the gated-delivery pipeline —
// an admin marks one asset as the final deliverable with a price, the client
// pays through the checkout route, and the download endpoint releases the
// file only once payment_status is 'unlocked'.
//
// Storage is Postgres BYTEA (like deliverables) so images survive Railway's
// ephemeral filesystem. Images only — the review board can't render anything
// else, and general file sharing already lives in the portal's Files section.
//
// Payment provider calls are abstracted behind ./payments-service; nothing
// in this file talks to Stripe directly. The signed webhook that confirms
// payment lives in routes/payments.js and calls unlockBoardAsset() below.

const multer = require('multer');
const db = require('../../../database/db');
const { UUID_RE } = require('./util');
const { resolveActor } = require('./collab');
const payments = require('./payments-service');

const MAX_ASSET_BYTES = 8 * 1024 * 1024; // 8 MB per image
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const UPLOAD_ROLES = new Set(['owner', 'editor']);
const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

// Magic-byte check so a renamed .exe can't ride in as image/png.
function looksLikeImage(buf, mime) {
  if (!buf || buf.length < 12) return false;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/gif') return buf.slice(0, 3).toString('latin1') === 'GIF';
  if (mime === 'image/webp') return buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  return false;
}

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ASSET_BYTES }
});

function portalBaseUrl() {
  return (process.env.PORTAL_URL || process.env.APP_ADMIN_URL || 'https://admin.wordsthatsells.website').replace(/\/$/, '');
}

// Fetch one asset row (metadata only) scoped to the actor's board.
async function assetForActor(actor, assetId) {
  if (!UUID_RE.test(assetId)) return null;
  return (await db.query(
    `SELECT id, board_id, mime, size, is_final, payment_status, price, title
     FROM board_assets WHERE id = $1 AND board_id = $2`,
    [assetId, actor.boardId]
  )).rows[0] || null;
}

// Called by the payment webhook (and the admin's manual unlock) once money
// has actually arrived. Idempotent — re-delivered webhooks are harmless.
async function unlockBoardAsset(assetId) {
  if (!UUID_RE.test(String(assetId || ''))) return false;
  const updated = await db.query(
    `UPDATE board_assets SET payment_status = 'unlocked'
     WHERE id = $1 AND is_final = TRUE RETURNING id`,
    [assetId]
  );
  return updated.rows.length > 0;
}

// Grid fallback for rows that predate the placement columns (or were
// inserted by an old instance mid-deploy): same rule as the boot backfill in
// migrations.js — 4 columns, 520 stride, 480 wide — so every viewer computes
// the identical layout without requiring a write.
function gridFallback(seq) {
  return { x: (seq % 4) * 520, y: Math.floor(seq / 4) * 520, w: 480, h: null, z: seq };
}

function mayArrange(actor) {
  return actor.type === 'admin' || UPLOAD_ROLES.has(actor.role);
}

function addAssetRoutes(router, side) {
  // List the board's images (any member/admin) — filmstrip + canvas nodes.
  router.get('/:id/assets', async (req, res) => {
    const actor = await resolveActor(req, res, side);
    if (!actor) return;
    try {
      const rows = (await db.query(
        `SELECT id, mime, size, created_at, is_final, payment_status, price, title,
                x, y, w, h, z, placed_at
         FROM board_assets WHERE board_id = $1 ORDER BY created_at ASC, id ASC`,
        [actor.boardId]
      )).rows.map((a, seq) => {
        const placed = a.x === null ? gridFallback(seq) : a;
        return {
          id: a.id,
          mime: a.mime,
          size: a.size,
          created_at: a.created_at,
          is_final: a.is_final,
          payment_status: a.payment_status,
          price: a.price === null ? null : Number(a.price),
          title: a.title,
          x: Number(placed.x),
          y: Number(placed.y),
          w: Number(placed.w),
          h: placed.h === null ? null : Number(placed.h),
          z: placed.z == null ? seq : Number(placed.z),
          placed_at: a.placed_at,
          src: '/board-assets/' + actor.boardId + '/' + a.id
        };
      });
      res.json({ assets: rows, can_arrange: mayArrange(actor) });
    } catch (e) {
      console.error('Board asset list error:', e);
      res.status(500).json({ error: 'Failed to load images.' });
    }
  });

  router.post('/:id/assets', (req, res) => {
    assetUpload.single('file')(req, res, async (uploadErr) => {
      try {
        if (uploadErr) {
          const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'That image is over the 8 MB limit.'
            : 'Upload failed — please try again.';
          return res.status(400).json({ error: msg });
        }
        const actor = await resolveActor(req, res, side);
        if (!actor) return;
        const mayUpload = actor.type === 'admin' || UPLOAD_ROLES.has(actor.role);
        if (!mayUpload) return res.status(403).json({ error: 'You can comment on this board, but not add images.' });

        const file = req.file;
        const mime = file && String(file.mimetype || '').toLowerCase();
        if (!file || !file.size) return res.status(400).json({ error: 'No file received.' });
        if (!ALLOWED_MIME.has(mime) || !looksLikeImage(file.buffer, mime)) {
          return res.status(400).json({ error: 'Only PNG, JPEG, GIF and WebP images can be placed on a board.' });
        }

        const row = (await db.query(
          `INSERT INTO board_assets (board_id, mime, size, data, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [actor.boardId, mime, file.size, file.buffer, `${actor.type}:${actor.id}`.slice(0, 80)]
        )).rows[0];

        res.json({ src: `/board-assets/${actor.boardId}/${row.id}` });
      } catch (e) {
        console.error('Board asset upload error:', e);
        res.status(500).json({ error: 'Upload failed — please try again.' });
      }
    });
  });

  // Mark / unmark an asset as the board's final deliverable (admin only).
  // Body: { price, title } to mark, { remove: true } to unmark. A priced
  // final starts locked; a free final (price 0/empty) is unlocked outright.
  router.post('/:id/assets/:assetId/final', async (req, res) => {
    const actor = await resolveActor(req, res, side);
    if (!actor) return;
    if (actor.type !== 'admin') return res.status(403).json({ error: 'Only the WTS team can designate final deliverables.' });
    try {
      const asset = await assetForActor(actor, req.params.assetId);
      if (!asset) return res.status(404).json({ error: 'Image not found.' });

      if (req.body && (req.body.remove === true || req.body.remove === 'true')) {
        await db.query(
          `UPDATE board_assets SET is_final = FALSE, payment_status = 'unlocked', price = NULL
           WHERE id = $1`,
          [asset.id]
        );
        return res.json({ ok: true, is_final: false });
      }

      const price = Number(req.body && req.body.price);
      if (!Number.isFinite(price) || price < 0 || price > 99999999) {
        return res.status(400).json({ error: 'Enter a price of 0 or more (0 releases the file for free).' });
      }
      const title = String((req.body && req.body.title) || '').trim().slice(0, 200) || null;
      const status = price > 0 ? 'locked' : 'unlocked';

      // One final per board: marking this one clears any previous final.
      await db.query(
        `UPDATE board_assets SET is_final = FALSE, payment_status = 'unlocked', price = NULL
         WHERE board_id = $1 AND is_final = TRUE AND id <> $2`,
        [actor.boardId, asset.id]
      );
      await db.query(
        `UPDATE board_assets SET is_final = TRUE, payment_status = $2, price = $3, title = $4
         WHERE id = $1`,
        [asset.id, status, price > 0 ? price : null, title]
      );
      res.json({ ok: true, is_final: true, payment_status: status, price: price > 0 ? price : null });
    } catch (e) {
      console.error('Board asset final-mark error:', e);
      res.status(500).json({ error: 'Could not update the deliverable.' });
    }
  });

  // Manual unlock (admin only) — the escape hatch for bank transfer / BCEL
  // payments confirmed outside Stripe.
  router.post('/:id/assets/:assetId/unlock', async (req, res) => {
    const actor = await resolveActor(req, res, side);
    if (!actor) return;
    if (actor.type !== 'admin') return res.status(403).json({ error: 'Only the WTS team can unlock deliverables.' });
    try {
      const asset = await assetForActor(actor, req.params.assetId);
      if (!asset || !asset.is_final) return res.status(404).json({ error: 'No final deliverable found for that image.' });
      await unlockBoardAsset(asset.id);
      res.json({ ok: true, payment_status: 'unlocked' });
    } catch (e) {
      console.error('Board asset unlock error:', e);
      res.status(500).json({ error: 'Could not unlock the deliverable.' });
    }
  });

  // Move/resize/restack a node on the canvas. Admin and owner/editor
  // members only. Partial update: absent fields keep their value. Server is
  // the last-write-wins authority — placed_at stamps every write.
  router.post('/:id/assets/:assetId/place', async (req, res) => {
    const actor = await resolveActor(req, res, side);
    if (!actor) return;
    if (!mayArrange(actor)) {
      return res.status(403).json({ error: 'Your role on this board does not allow arranging images.' });
    }
    try {
      const asset = await assetForActor(actor, req.params.assetId);
      if (!asset) return res.status(404).json({ error: 'Image not found.' });

      const body = req.body || {};
      const sets = [];
      const params = [];
      const bad = (msg) => res.status(400).json({ error: msg });

      const round2 = (v) => Math.round(Number(v) * 100) / 100;
      const addSet = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

      for (const col of ['x', 'y']) {
        if (body[col] === undefined) continue;
        const v = Number(body[col]);
        if (!Number.isFinite(v) || Math.abs(v) > 1e6) return bad('Position is out of range.');
        addSet(col, round2(v));
      }
      if (body.w !== undefined) {
        const v = Number(body.w);
        if (!Number.isFinite(v) || v < 16 || v > 20000) return bad('Width must be between 16 and 20000.');
        addSet('w', round2(v));
      }
      if (body.h !== undefined) {
        if (body.h === null) {
          addSet('h', null); // reset to natural aspect
        } else {
          const v = Number(body.h);
          if (!Number.isFinite(v) || v < 16 || v > 20000) return bad('Height must be between 16 and 20000.');
          addSet('h', round2(v));
        }
      }
      if (body.z !== undefined) {
        const v = Number(body.z);
        if (!Number.isInteger(v) || v < 0 || v > 100000) return bad('Stacking order is out of range.');
        addSet('z', v);
      }
      if (!sets.length) return bad('Nothing to update.');

      params.push(`${actor.type}:${actor.id}`.slice(0, 80));
      sets.push(`placed_by = $${params.length}`);
      params.push(asset.id);

      const row = (await db.query(
        `UPDATE board_assets SET ${sets.join(', ')}, placed_at = CURRENT_TIMESTAMP
         WHERE id = $${params.length}
         RETURNING id, x, y, w, h, z, placed_at`,
        params
      )).rows[0];
      res.json({
        asset: {
          id: row.id,
          x: Number(row.x),
          y: Number(row.y),
          w: row.w === null ? null : Number(row.w),
          h: row.h === null ? null : Number(row.h),
          z: Number(row.z),
          placed_at: row.placed_at
        }
      });
    } catch (e) {
      console.error('Board asset place error:', e);
      res.status(500).json({ error: 'Could not save the layout.' });
    }
  });

  // Remove an image node from the board. Arrange roles; a final deliverable
  // can only be removed by the WTS team (deleting it retires its gate).
  // Comments anchored to it are kept — they are review history; the client
  // renders them as general comments tagged "(image removed)".
  router.post('/:id/assets/:assetId/delete', async (req, res) => {
    const actor = await resolveActor(req, res, side);
    if (!actor) return;
    if (!mayArrange(actor)) {
      return res.status(403).json({ error: 'Your role on this board does not allow removing images.' });
    }
    try {
      const asset = await assetForActor(actor, req.params.assetId);
      if (!asset) return res.status(404).json({ error: 'Image not found.' });
      if (asset.is_final && actor.type !== 'admin') {
        return res.status(403).json({ error: 'Only the WTS team can remove a final deliverable.' });
      }
      await db.query('DELETE FROM board_assets WHERE id = $1', [asset.id]);
      res.json({ ok: true });
    } catch (e) {
      console.error('Board asset delete error:', e);
      res.status(500).json({ error: 'Could not remove the image.' });
    }
  });

  // Start a checkout session for a locked final deliverable. Any member of
  // the board may pay. The session carries the asset id in its metadata;
  // the signed Stripe webhook in routes/payments.js flips payment_status.
  router.post('/:id/assets/:assetId/checkout', async (req, res) => {
    const actor = await resolveActor(req, res, side);
    if (!actor) return;
    try {
      const asset = await assetForActor(actor, req.params.assetId);
      if (!asset || !asset.is_final) return res.status(404).json({ error: 'No final deliverable found for that image.' });
      if (asset.payment_status === 'unlocked') {
        return res.status(409).json({ error: 'This deliverable is already unlocked — use Download final.' });
      }
      if (!(Number(asset.price) > 0)) {
        return res.status(409).json({ error: 'This deliverable has no price set. Please contact us.' });
      }
      if (!payments.isConfigured()) {
        return res.status(503).json({
          error: 'Online payment is not available right now. Please contact us to pay by bank transfer — we will unlock your download as soon as the payment is confirmed.'
        });
      }

      const board = (await db.query('SELECT title FROM boards WHERE id = $1', [actor.boardId])).rows[0];
      const { url, sessionId } = await payments.createCheckout({
        asset,
        boardId: actor.boardId,
        boardTitle: board && board.title,
        customerEmail: actor.email,
        baseUrl: portalBaseUrl()
      });

      // A pending orders row so the payment shows up in the portal's billing
      // page and the existing webhook marks it completed by session id.
      try {
        await db.query(
          `INSERT INTO orders (customer_email, customer_name, amount, currency, stripe_session_id, status, payment_method, metadata)
           VALUES ($1, $2, $3, 'USD', $4, 'pending', 'stripe', $5)`,
          [
            actor.email || 'unknown@wordsthatsells.website',
            actor.name || null,
            Number(asset.price),
            sessionId,
            JSON.stringify({ kind: 'board_asset', board_asset_id: asset.id, board_id: actor.boardId, title: asset.title || null })
          ]
        );
      } catch (orderErr) {
        console.warn('Board asset checkout: order row insert failed (checkout continues):', orderErr.message);
      }

      res.json({ url });
    } catch (e) {
      console.error('Board asset checkout error:', e);
      res.status(500).json({ error: 'Could not start the payment. Please try again or contact us.' });
    }
  });

  // Gated download of the final deliverable. Admins can always download;
  // clients only once payment_status is 'unlocked'. The bytes are streamed
  // through this authenticated, payment-checked endpoint — the inline
  // /board-assets/ preview route never sends a downloadable attachment.
  router.get('/:id/assets/:assetId/download', async (req, res) => {
    const actor = await resolveActor(req, res, side);
    if (!actor) return;
    try {
      const meta = await assetForActor(actor, req.params.assetId);
      if (!meta || !meta.is_final) return res.status(404).json({ error: 'No final deliverable found for that image.' });
      if (actor.type !== 'admin' && meta.payment_status !== 'unlocked') {
        return res.status(402).json({ error: 'This deliverable is released after payment.' });
      }

      const asset = (await db.query(
        'SELECT mime, data FROM board_assets WHERE id = $1',
        [meta.id]
      )).rows[0];
      if (!asset) return res.status(404).json({ error: 'No final deliverable found for that image.' });

      const ext = EXT_BY_MIME[asset.mime] || 'bin';
      const base = (meta.title || 'final-deliverable').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'final-deliverable';
      res.set({
        'Content-Type': asset.mime,
        'Content-Length': asset.data.length,
        'Content-Disposition': `attachment; filename="${base}.${ext}"`,
        'Cache-Control': 'private, no-store'
      });
      res.send(asset.data);
    } catch (e) {
      console.error('Board asset download error:', e);
      res.status(500).json({ error: 'Download failed — please try again.' });
    }
  });
}

// GET /board-assets/:boardId/:assetId — neutral inline-preview path used by
// the review board's <img> tags, viewable by any admin session or any member
// of the board. Never a direct/storage URL — always session-checked.
function registerAssetServing(app) {
  app.get('/board-assets/:boardId/:assetId', async (req, res) => {
    try {
      const { boardId, assetId } = req.params;
      if (!UUID_RE.test(boardId) || !UUID_RE.test(assetId)) return res.status(404).end();

      const isAdmin = !!(req.session && req.session.passport && req.session.passport.user);
      if (!isAdmin) {
        const customerId = req.session && req.session.customerId;
        if (!customerId) return res.status(404).end();
        const member = (await db.query(
          `SELECT 1 FROM board_members
           WHERE board_id = $1 AND principal_type = 'customer' AND principal_id = $2`,
          [boardId, String(customerId)]
        )).rows[0];
        if (!member) return res.status(404).end();
      }

      const asset = (await db.query(
        'SELECT mime, size, data FROM board_assets WHERE id = $1 AND board_id = $2',
        [assetId, boardId]
      )).rows[0];
      if (!asset) return res.status(404).end();

      res.set({
        'Content-Type': asset.mime,
        'Content-Length': asset.data.length,
        // Inline only — downloads of final deliverables go through the
        // payment-checked /assets/:assetId/download route instead.
        'Content-Disposition': 'inline',
        // Immutable: an asset row's bytes are never rewritten, so browsers
        // may cache for the session's lifetime. Private — it's behind
        // membership.
        'Cache-Control': 'private, max-age=31536000, immutable'
      });
      res.send(asset.data);
    } catch (e) {
      console.error('Board asset serve error:', e);
      res.status(500).end();
    }
  });
}

module.exports = { addAssetRoutes, registerAssetServing, unlockBoardAsset };
