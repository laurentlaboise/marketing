// Board image assets: upload (per-side, role-checked) + a neutral serving
// route shared by both portals, because the asset URL is stored inside the
// tldraw document and must work for whoever opens the board.
//
// Storage is Postgres BYTEA (like deliverables) so images survive Railway's
// ephemeral filesystem. Images only — the canvas can't render anything else,
// and general file sharing already lives in the portal's Files section.

const multer = require('multer');
const db = require('../../../database/db');
const { UUID_RE } = require('./util');
const { resolveActor } = require('./collab');

const MAX_ASSET_BYTES = 8 * 1024 * 1024; // 8 MB per image
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const UPLOAD_ROLES = new Set(['owner', 'editor']);

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

// POST /:id/assets — registered on both the admin and portal routers.
// Admins and owner/editor members may upload; commenters/viewers may not.
function addAssetRoutes(router, side) {
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
}

// GET /board-assets/:boardId/:assetId — neutral path used inside the tldraw
// document, viewable by any admin session or any member of the board.
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
        // Immutable: an asset row is never rewritten, so browsers may cache
        // it for the session's lifetime. Private — it's behind membership.
        'Cache-Control': 'private, max-age=31536000, immutable'
      });
      res.send(asset.data);
    } catch (e) {
      console.error('Board asset serve error:', e);
      res.status(500).end();
    }
  });
}

module.exports = { addAssetRoutes, registerAssetServing };
