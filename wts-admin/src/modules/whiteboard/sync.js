// WebSocket sync backend for the whiteboard module.
//
// One TLSocketRoom (@tldraw/sync-core) per active board, created lazily on
// the first connection and disposed when the last socket disconnects.
// Persistence is latest-only: the room snapshot is upserted into
// board_snapshots, debounced to at most once per 10s while clients are
// drawing, plus an immediate flush on last-disconnect.
//
// Verified against @tldraw/sync-core 5.2.x:
//   new TLSocketRoom({ initialSnapshot, onDataChange, log })
//   room.handleSocketConnect({ sessionId, socket, isReadonly })
//   room.getCurrentSnapshot() / room.close() / room.isClosed()
// (schema defaults to createTLSchema() inside TLSocketRoom, so the default
// tldraw shape set needs no server-side schema wiring.)

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { TLSocketRoom } = require('@tldraw/sync-core');
const db = require('../../../database/db');

const WS_PATH_RE = /^\/ws\/boards\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const PERSIST_DEBOUNCE_MS = 10 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const MAX_SOCKETS_PER_BOARD = 20;

// boardId → { roomPromise, sockets:Set<ws>, persistTimer }
const rooms = new Map();

function rejectUpgrade(socket, code, message) {
  try {
    socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
  } catch (_) { /* socket may already be gone */ }
  socket.destroy();
}

async function persist(boardId, room) {
  const snapshot = room.getCurrentSnapshot();
  await db.query(
    `INSERT INTO board_snapshots (board_id, snapshot, seq, updated_at)
     VALUES ($1, $2::jsonb, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (board_id) DO UPDATE
       SET snapshot = EXCLUDED.snapshot,
           seq = board_snapshots.seq + 1,
           updated_at = CURRENT_TIMESTAMP`,
    [boardId, JSON.stringify(snapshot)]
  );
  await db.query('UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [boardId]);
}

function schedulePersist(boardId, entry) {
  if (entry.persistTimer) return; // one pending flush at a time → at most every 10s
  entry.persistTimer = setTimeout(async () => {
    entry.persistTimer = null;
    try {
      const room = await entry.roomPromise;
      if (!room.isClosed()) await persist(boardId, room);
    } catch (e) {
      console.error(`Whiteboard persist failed (board ${boardId}):`, e.message);
    }
  }, PERSIST_DEBOUNCE_MS);
  entry.persistTimer.unref();
}

async function createRoom(boardId, entry) {
  const result = await db.query('SELECT snapshot FROM board_snapshots WHERE board_id = $1', [boardId]);
  const initialSnapshot = result.rows.length ? result.rows[0].snapshot : undefined;
  return new TLSocketRoom({
    initialSnapshot,
    onDataChange: () => schedulePersist(boardId, entry),
    log: {
      warn: (...args) => console.warn(`Whiteboard sync (board ${boardId}):`, ...args),
      error: (...args) => console.error(`Whiteboard sync (board ${boardId}):`, ...args)
    }
  });
}

function getEntry(boardId) {
  let entry = rooms.get(boardId);
  if (!entry) {
    entry = { sockets: new Set(), persistTimer: null, roomPromise: null };
    entry.roomPromise = createRoom(boardId, entry);
    // Never leave a permanently-rejected promise in the map.
    entry.roomPromise.catch(() => {
      if (rooms.get(boardId) === entry) rooms.delete(boardId);
    });
    rooms.set(boardId, entry);
  }
  return entry;
}

function attachSync(httpServer, { sessionMiddleware }) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const path = String(req.url || '').split('?')[0];
    const match = path.match(WS_PATH_RE);
    if (!match) return; // not ours — leave it for other upgrade handlers
    const boardId = match[1].toLowerCase();

    // Hydrate req.session from the cookie the browser sent with the
    // upgrade request (documented ws + express-session pattern: the fake
    // res object is never written to).
    sessionMiddleware(req, {}, async () => {
      try {
        const sess = req.session;
        let principal = null;
        if (sess && sess.passport && sess.passport.user) {
          principal = { type: 'admin', id: String(sess.passport.user) };
        } else if (sess && sess.customerId) {
          principal = { type: 'customer', id: String(sess.customerId) };
        }
        if (!principal) return rejectUpgrade(socket, 401, 'Unauthorized');

        const board = (await db.query('SELECT id FROM boards WHERE id = $1', [boardId])).rows[0];
        if (!board) return rejectUpgrade(socket, 404, 'Not Found');

        // Admins are always allowed; customers need a membership (any role).
        let isReadonly = false;
        if (principal.type === 'customer') {
          const member = (await db.query(
            `SELECT role FROM board_members
             WHERE board_id = $1 AND principal_type = 'customer' AND principal_id = $2`,
            [boardId, principal.id]
          )).rows[0];
          if (!member) return rejectUpgrade(socket, 403, 'Forbidden');
          isReadonly = member.role === 'viewer' || member.role === 'commenter';
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, { boardId, isReadonly });
        });
      } catch (e) {
        console.error('Whiteboard upgrade error:', e.message);
        rejectUpgrade(socket, 500, 'Internal Server Error');
      }
    });
  });

  wss.on('connection', async (ws, req, ctx) => {
    const { boardId, isReadonly } = ctx;
    const entry = getEntry(boardId);

    if (entry.sockets.size >= MAX_SOCKETS_PER_BOARD) {
      ws.close(1013, 'Board is full — try again later');
      return;
    }
    entry.sockets.add(ws);

    // Heartbeat bookkeeping
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', (e) => console.error(`Whiteboard socket error (board ${boardId}):`, e.message));

    ws.on('close', async () => {
      entry.sockets.delete(ws);
      if (entry.sockets.size > 0) return;
      // Last socket gone: flush the snapshot, then dispose the room.
      if (entry.persistTimer) {
        clearTimeout(entry.persistTimer);
        entry.persistTimer = null;
      }
      try {
        const room = await entry.roomPromise;
        if (entry.sockets.size > 0) return; // someone reconnected while we awaited
        await persist(boardId, room);
        // Only dispose if the board is still idle and we still own the entry.
        if (entry.sockets.size === 0 && rooms.get(boardId) === entry) {
          rooms.delete(boardId);
          room.close();
        }
      } catch (e) {
        console.error(`Whiteboard room dispose failed (board ${boardId}):`, e.message);
        if (entry.sockets.size === 0 && rooms.get(boardId) === entry) rooms.delete(boardId);
      }
    });

    let room;
    try {
      room = await entry.roomPromise;
    } catch (e) {
      console.error(`Whiteboard room load failed (board ${boardId}):`, e.message);
      entry.sockets.delete(ws);
      ws.close(1011, 'Failed to load board');
      return;
    }
    if (ws.readyState !== ws.OPEN) { // client vanished while the room loaded
      entry.sockets.delete(ws);
      return;
    }

    room.handleSocketConnect({
      sessionId: crypto.randomUUID(),
      socket: ws,
      isReadonly
    });
  });

  // Heartbeat: ping every connected socket; terminate the ones that never
  // answered the previous ping.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) { /* closing */ }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return wss;
}

module.exports = { attachSync };
