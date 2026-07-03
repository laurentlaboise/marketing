// WTS collaborative whiteboard island.
// Reads config from window.__WTS_BOARD__ (set by src/views/whiteboard/board.ejs)
// and mounts a tldraw canvas synced over websocket via @tldraw/sync.
// Stage D+E: pinned threaded comments panel + approval workflow strip.
import { createRoot } from 'react-dom/client';
import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { Tldraw, atom, UserRecordType, createUserId, useValue } from 'tldraw';
import { useSync } from '@tldraw/sync';
import { getAssetUrls } from '@tldraw/assets/selfHosted';
import 'tldraw/tldraw.css';

const cfg = window.__WTS_BOARD__ || {};

// Icons, fonts and translations are served same-origin from
// /whiteboard/assets/ (copied there by whiteboard-ui/build.js) so the page
// works under a strict CSP with no external hosts.
const assetUrls = getAssetUrls({ baseUrl: '/whiteboard/assets/' });

// Image uploads (PNG/JPEG/GIF/WebP): stored server-side per board and served
// from a membership-checked same-origin URL, so the same document works for
// both the admin and the client. Members without edit rights get a clear
// rejection instead of a silent failure.
const boardAssets = {
  async upload(asset, file) {
    if (!cfg.canUpload) {
      throw new Error('You can view and comment on this board, but not add images.');
    }
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(cfg.apiBase + '/assets', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': cfg.csrfToken || '' },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.src) {
      throw new Error(data.error || 'Upload failed — please try again.');
    }
    return { src: data.src };
  },
  resolve(asset) {
    return (asset && asset.props && asset.props.src) || null;
  },
};

// ── Same-origin JSON API (comments + approvals) ────────────────────
const api = {
  async get(path) {
    const res = await fetch(cfg.apiBase + path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(cfg.apiBase + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': cfg.csrfToken || '',
      },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  },
};

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}


// A crash inside tldraw must never leave a silent blank page — show what
// broke and offer a reload.
class BoardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="wts-board-splash">
          <p style={{ maxWidth: 420, textAlign: 'center' }}>
            Something went wrong rendering this board:
            <br />
            <code style={{ fontSize: '0.8rem' }}>{String(this.state.error && this.state.error.message)}</code>
          </p>
          <button type="button" onClick={() => location.reload()}>Reload board</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TOP_BAR_HEIGHT = 48;

const styles = `
  .wts-board-app { position: fixed; inset: 0; display: flex; flex-direction: column; height: 100dvh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .wts-board-topbar { height: ${TOP_BAR_HEIGHT}px; flex: 0 0 ${TOP_BAR_HEIGHT}px; background: #122a3f; color: #fff; display: flex; align-items: center; gap: 0.75rem; padding: 0 0.9rem; }
  .wts-board-topbar a.wts-back { color: #e2e8f0; text-decoration: none; font-size: 0.84rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; padding: 0.25rem 0.7rem; white-space: nowrap; }
  .wts-board-title { font-size: 0.95rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .wts-board-presence { font-size: 0.78rem; color: #cbd5e1; white-space: nowrap; display: flex; align-items: center; gap: 0.35rem; }
  .wts-board-presence .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; display: inline-block; }
  .wts-board-presence .dot.off { background: #f59e0b; }
  .wts-comments-toggle { background: rgba(255,255,255,0.1); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; padding: 0.25rem 0.7rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .wts-comments-toggle.open { background: #d62b83; border-color: #d62b83; color: #fff; }
  .wts-board-main { flex: 1; display: flex; min-height: 0; }
  .wts-board-canvas { flex: 1; position: relative; min-height: 0; min-width: 0; }
  .wts-board-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 999px; padding: 0.3rem 1rem; font-size: 0.82rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.12); pointer-events: none; }
  .wts-board-splash { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.9rem; background: #f8fafc; color: #64748b; font-size: 0.95rem; }
  .wts-board-splash button { background: #d62b83; color: #fff; border: none; border-radius: 8px; padding: 0.5rem 1.3rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit; }

  .wts-approval-strip { flex: 0 0 auto; display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.9rem; background: #fff; border-bottom: 1px solid #e2e8f0; font-size: 0.82rem; flex-wrap: wrap; }
  .wts-approval-chip { display: inline-flex; align-items: center; gap: 0.35rem; border-radius: 999px; padding: 0.18rem 0.7rem; font-weight: 600; font-size: 0.78rem; white-space: nowrap; }
  .wts-approval-chip.awaiting_review { background: #fef3c7; color: #92400e; }
  .wts-approval-chip.needs_changes { background: #fee2e2; color: #b91c1c; }
  .wts-approval-chip.approved { background: #dcfce7; color: #166534; }
  .wts-approval-note { color: #64748b; font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; }
  .wts-approval-strip .spacer { flex: 1; }
  .wts-approval-btn { border: none; border-radius: 8px; padding: 0.3rem 0.85rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .wts-approval-btn.primary { background: #d62b83; color: #fff; }
  .wts-approval-btn.approve { background: #16a34a; color: #fff; }
  .wts-approval-btn.changes { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }

  .wts-comments-panel { flex: 0 0 320px; width: 320px; background: #fff; border-left: 1px solid #e2e8f0; display: flex; flex-direction: column; min-height: 0; }
  .wts-comments-head { flex: 0 0 auto; padding: 0.7rem 0.9rem 0.5rem; border-bottom: 1px solid #e2e8f0; }
  .wts-comments-head h2 { font-size: 0.9rem; color: #1a1a2e; margin: 0 0 0.5rem; }
  .wts-composer textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.45rem 0.55rem; font-size: 0.82rem; font-family: inherit; resize: vertical; min-height: 52px; }
  .wts-composer .row { display: flex; justify-content: flex-end; margin-top: 0.35rem; }
  .wts-composer button { background: #d62b83; color: #fff; border: none; border-radius: 8px; padding: 0.3rem 0.9rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .wts-composer button:disabled { opacity: 0.5; cursor: default; }
  .wts-comments-list { flex: 1; overflow-y: auto; padding: 0.5rem 0.9rem 1rem; }
  .wts-comments-empty { color: #94a3b8; font-size: 0.82rem; text-align: center; padding: 1.2rem 0; }
  .wts-comment { border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.55rem 0.65rem; margin-top: 0.55rem; background: #fff; }
  .wts-comment.anchored { cursor: pointer; }
  .wts-comment.anchored:hover { border-color: #d62b83; }
  .wts-comment .meta { display: flex; align-items: baseline; gap: 0.4rem; font-size: 0.74rem; color: #94a3b8; }
  .wts-comment .meta .who { color: #1a1a2e; font-weight: 700; font-size: 0.8rem; }
  .wts-comment .body { color: #334155; font-size: 0.84rem; margin-top: 0.25rem; white-space: pre-wrap; word-break: break-word; }
  .wts-comment .actions { display: flex; gap: 0.6rem; margin-top: 0.4rem; }
  .wts-comment .actions button { background: none; border: none; padding: 0; color: #d62b83; font-size: 0.76rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .wts-comment .actions button.resolve { color: #16a34a; }
  .wts-comment .actions button.unresolve { color: #92400e; }
  .wts-reply { border-left: 2px solid #e2e8f0; margin: 0.45rem 0 0 0.35rem; padding-left: 0.55rem; }
  .wts-reply-form { margin-top: 0.45rem; }
  .wts-reply-form textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.35rem 0.5rem; font-size: 0.8rem; font-family: inherit; resize: vertical; min-height: 40px; }
  .wts-reply-form .row { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
  .wts-reply-form button { border: none; border-radius: 7px; padding: 0.25rem 0.7rem; font-size: 0.76rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .wts-reply-form button.send { background: #d62b83; color: #fff; }
  .wts-reply-form button.cancel { background: #f1f5f9; color: #64748b; }
  .wts-resolved-section { margin-top: 1rem; }
  .wts-resolved-section > button { background: none; border: none; padding: 0; color: #64748b; font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: inherit; }
  .wts-comment.resolved { opacity: 0.75; background: #f8fafc; }
`;

// Small badge shown in the top bar once the editor is mounted: how many
// people (including you) are currently on the board.
function PresenceBadge({ editor, online }) {
  const others = useValue(
    'collaborator-count',
    () => (editor ? editor.getCollaboratorsOnCurrentPage().length : 0),
    [editor]
  );
  return (
    <span className="wts-board-presence" title={online ? 'Connected' : 'Reconnecting'}>
      <span className={'dot' + (online ? '' : ' off')} />
      {online ? `${others + 1} online` : 'offline'}
    </span>
  );
}

// ── Approval workflow strip ─────────────────────────────────────────
const STATUS_LABELS = {
  awaiting_review: 'Awaiting review',
  needs_changes: 'Needs changes',
  approved: 'Approved',
};

function ApprovalStrip({ approval, onChanged }) {
  const [busy, setBusy] = useState(false);

  const request = async () => {
    const note = window.prompt('Add a note for your client (optional):', '');
    if (note === null) return; // cancelled
    setBusy(true);
    try {
      await api.post('/approvals', { note: note.trim() || undefined });
      onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision) => {
    const note = window.prompt(
      decision === 'approved'
        ? 'Add a note with your approval (optional):'
        : 'What should change? (optional)',
      ''
    );
    if (note === null) return; // cancelled
    setBusy(true);
    try {
      await api.post(`/approvals/${approval.id}/decide`, {
        decision,
        note: note.trim() || undefined,
      });
      onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!approval && !cfg.canApprove) return null;

  const status = approval && approval.status;
  const note = approval && (status === 'awaiting_review' ? approval.request_note : approval.reviewer_note);
  const awaiting = status === 'awaiting_review';

  return (
    <div className="wts-approval-strip">
      {approval ? (
        <>
          <span className={'wts-approval-chip ' + status}>
            {STATUS_LABELS[status] || status}
            {status === 'approved' && approval.reviewer_note ? ' with note' : ''}
          </span>
          {note && <span className="wts-approval-note" title={note}>&ldquo;{note}&rdquo;</span>}
        </>
      ) : (
        <span className="wts-approval-note">No approval requested yet.</span>
      )}
      <span className="spacer" />
      {cfg.canApprove && (
        <button
          type="button"
          className="wts-approval-btn primary"
          disabled={busy}
          onClick={request}
        >
          {awaiting ? 'Update request' : status ? 'Request again' : 'Request approval'}
        </button>
      )}
      {!cfg.canApprove && awaiting && cfg.canDecide && (
        <>
          <button type="button" className="wts-approval-btn approve" disabled={busy} onClick={() => decide('approved')}>
            Approve
          </button>
          <button type="button" className="wts-approval-btn changes" disabled={busy} onClick={() => decide('needs_changes')}>
            Request changes
          </button>
        </>
      )}
    </div>
  );
}

// ── Comments panel ──────────────────────────────────────────────────
function ReplyForm({ parentId, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.post('/comments', { body, parentId });
      setText('');
      onDone(true);
    } catch (e) {
      alert(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="wts-reply-form" onClick={(e) => e.stopPropagation()}>
      <textarea
        value={text}
        maxLength={2000}
        placeholder="Write a reply&hellip;"
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="row">
        <button type="button" className="cancel" onClick={() => onDone(false)}>Cancel</button>
        <button type="button" className="send" disabled={busy || !text.trim()} onClick={send}>Reply</button>
      </div>
    </div>
  );
}

function Comment({ comment, replies, editor, onRefresh, resolvedView }) {
  const [replying, setReplying] = useState(false);
  const anchored = comment.anchor && Number.isFinite(comment.anchor.x) && Number.isFinite(comment.anchor.y);

  const jump = () => {
    if (!editor) return;
    const a = comment.anchor || {};
    if (Number.isFinite(a.x) && Number.isFinite(a.y)) {
      // Verified: editor.centerOnPoint(point: VecLike, opts?: TLCameraMoveOptions)
      editor.centerOnPoint({ x: a.x, y: a.y }, { animation: { duration: 300 } });
    } else if (a.shapeId) {
      const bounds = editor.getShapePageBounds(a.shapeId);
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 300 } });
    }
  };

  const setResolved = async (resolved) => {
    try {
      await api.post(`/comments/${comment.id}/${resolved ? 'resolve' : 'unresolve'}`);
      onRefresh();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div
      className={'wts-comment' + (anchored ? ' anchored' : '') + (resolvedView ? ' resolved' : '')}
      onClick={anchored ? jump : undefined}
      title={anchored ? 'Click to jump to this spot on the board' : undefined}
    >
      <div className="meta">
        <span className="who">{comment.author_name || 'Unknown'}</span>
        <span>{timeAgo(comment.created_at)}</span>
      </div>
      <div className="body">{comment.body}</div>
      {replies.map((r) => (
        <div className="wts-reply" key={r.id}>
          <div className="meta">
            <span className="who">{r.author_name || 'Unknown'}</span>
            <span>{timeAgo(r.created_at)}</span>
          </div>
          <div className="body">{r.body}</div>
        </div>
      ))}
      {cfg.canComment && (
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          {!resolvedView && (
            <button type="button" onClick={() => setReplying((v) => !v)}>Reply</button>
          )}
          {resolvedView ? (
            <button type="button" className="unresolve" onClick={() => setResolved(false)}>Unresolve</button>
          ) : (
            <button type="button" className="resolve" onClick={() => setResolved(true)}>&#10003; Resolve</button>
          )}
        </div>
      )}
      {replying && (
        <ReplyForm
          parentId={comment.id}
          onDone={(sent) => {
            setReplying(false);
            if (sent) onRefresh();
          }}
        />
      )}
    </div>
  );
}

function CommentsPanel({ comments, editor, onRefresh }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesFor = (id) => comments.filter((c) => c.parent_id === id);
  const newestFirst = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  const unresolved = topLevel.filter((c) => !c.resolved_at).sort(newestFirst);
  const resolved = topLevel.filter((c) => c.resolved_at).sort(newestFirst);

  const post = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      // Pin new top-level comments at the current viewport centre.
      // Verified: editor.getViewportPageBounds(): Box, Box has get center(): Vec
      let anchor = null;
      if (editor) {
        const c = editor.getViewportPageBounds().center;
        anchor = { x: c.x, y: c.y };
      }
      await api.post('/comments', { body, anchor });
      setText('');
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wts-comments-panel">
      <div className="wts-comments-head">
        <h2>Comments</h2>
        {cfg.canComment ? (
          <div className="wts-composer">
            <textarea
              value={text}
              maxLength={2000}
              placeholder="Comment on the current view&hellip;"
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row">
              <button type="button" disabled={busy || !text.trim()} onClick={post}>Comment</button>
            </div>
          </div>
        ) : (
          <p style={{ color: '#94a3b8', fontSize: '0.78rem' }}>You have view-only access on this board.</p>
        )}
      </div>
      <div className="wts-comments-list">
        {unresolved.length === 0 && (
          <div className="wts-comments-empty">No open comments.</div>
        )}
        {unresolved.map((c) => (
          <Comment key={c.id} comment={c} replies={repliesFor(c.id)} editor={editor} onRefresh={onRefresh} resolvedView={false} />
        ))}
        {resolved.length > 0 && (
          <div className="wts-resolved-section">
            <button type="button" onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? '▾' : '▸'} Resolved ({resolved.length})
            </button>
            {showResolved &&
              resolved.map((c) => (
                <Comment key={c.id} comment={c} replies={repliesFor(c.id)} editor={editor} onRefresh={onRefresh} resolvedView />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const user = cfg.user || {};
  const uri =
    (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + (cfg.wsPath || '');

  // Static identity for this session — the server told us who we are.
  const users = useMemo(() => {
    const record = UserRecordType.create({
      id: createUserId(String(user.id || 'anonymous')),
      name: user.name || 'Guest',
      color: user.color || '#d62b83',
    });
    return { currentUser: atom('wts-current-user', record) };
  }, []);

  // ── Comments + approval state ──
  const [comments, setComments] = useState([]);
  const [approval, setApproval] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const refreshComments = useCallback(() => {
    api.get('/comments').then((d) => setComments(d.comments || [])).catch(() => {});
  }, []);
  const refreshApproval = useCallback(() => {
    api.get('/approvals').then((d) => setApproval(d.approval || null)).catch(() => {});
  }, []);
  useEffect(() => {
    refreshComments();
    refreshApproval();
  }, [refreshComments, refreshApproval]);

  // Server pushes { type: 'wts-refresh', kind } over the sync socket after
  // any comment/approval mutation (TLSocketRoom.sendCustomMessage →
  // useSync's onCustomMessageReceived, verified in @tldraw/sync typings).
  const onCustomMessageReceived = useCallback(
    (data) => {
      if (!data || data.type !== 'wts-refresh') return;
      if (data.kind === 'comments') refreshComments();
      else if (data.kind === 'approval') refreshApproval();
    },
    [refreshComments, refreshApproval]
  );

  const storeWithStatus = useSync({ uri, assets: boardAssets, users, onCustomMessageReceived });
  const [editor, setEditor] = useState(null);

  const onMount = useCallback((ed) => {
    setEditor(ed);
    window.__ed = ed; // test/debug hook used by the E2E scripts
  }, []);

  const synced = storeWithStatus.status === 'synced-remote';
  const failed = storeWithStatus.status === 'error';
  const online = synced && storeWithStatus.connectionStatus === 'online';

  // If connecting takes suspiciously long, say so — a WebSocket blocked by a
  // network or proxy otherwise looks like a blank page.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (synced || failed) return undefined;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [synced, failed]);

  // tldraw's license gate: on non-localhost domains without a valid
  // TLDRAW_LICENSE_KEY it silently hides the whole editor 5s after mount
  // (renders a hidden div[data-testid="tl-license-expired"]). Detect that
  // and explain, instead of leaving clients staring at a blank canvas.
  const [lockedOut, setLockedOut] = useState(false);
  useEffect(() => {
    if (!synced) return undefined;
    const iv = setInterval(() => {
      if (document.querySelector('[data-testid="tl-license-expired"]')) {
        setLockedOut(true);
        clearInterval(iv);
      }
    }, 1000);
    const stop = setTimeout(() => clearInterval(iv), 20000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [synced]);

  const unresolvedCount = comments.filter((c) => !c.parent_id && !c.resolved_at).length;

  const togglePanel = () => {
    setPanelOpen((open) => {
      if (!open) {
        // Re-fetch when the panel opens so it is never stale.
        refreshComments();
        refreshApproval();
      }
      return !open;
    });
  };

  return (
    <div className="wts-board-app">
      <style>{styles}</style>
      <div className="wts-board-topbar">
        <a className="wts-back" href={cfg.backUrl || '/'}>
          &larr; Back
        </a>
        <span className="wts-board-title">{cfg.boardTitle || 'Whiteboard'}</span>
        <button
          type="button"
          className={'wts-comments-toggle' + (panelOpen ? ' open' : '')}
          onClick={togglePanel}
        >
          Comments ({unresolvedCount})
        </button>
        <PresenceBadge editor={synced ? editor : null} online={online} />
      </div>
      <ApprovalStrip
        approval={approval}
        onChanged={() => {
          refreshApproval();
        }}
      />
      <div className="wts-board-main">
        <div className="wts-board-canvas">
          {synced && !online && <div className="wts-board-banner">Reconnecting&hellip;</div>}
          {lockedOut && (
            <div className="wts-board-splash" style={{ zIndex: 1001 }}>
              <p style={{ maxWidth: 440, textAlign: 'center' }}>
                {cfg.isAdmin
                  ? 'The board engine (tldraw) hid the canvas because no production license key is set. Add TLDRAW_LICENSE_KEY in Railway (get a key at tldraw.dev/pricing), or ask us to switch to the license-free engine.'
                  : 'This board is temporarily unavailable while we finish setting it up. Please check back soon — your work is saved.'}
              </p>
              <button type="button" onClick={() => location.reload()}>Reload</button>
            </div>
          )}
          {synced ? (
            // One editor for the life of the page. The sync layer reconnects on
            // its own (connectionStatus flips offline/online) without unmounting
            // — an unmount mid-font-load crashes tldraw's FontManager, and a
            // throwaway scratch canvas would silently discard early drawings.
            <BoardErrorBoundary>
              <Tldraw store={storeWithStatus.store} assetUrls={assetUrls} onMount={onMount} licenseKey={cfg.tldrawLicenseKey || undefined} />
            </BoardErrorBoundary>
          ) : (
            <div className="wts-board-splash">
              {failed ? (
                <>
                  <p style={{ maxWidth: 420, textAlign: 'center' }}>
                    Couldn&rsquo;t connect to this board
                    {storeWithStatus.error ? <><br /><code style={{ fontSize: '0.8rem' }}>{String(storeWithStatus.error.message || storeWithStatus.error)}</code></> : null}.
                  </p>
                  <button type="button" onClick={() => location.reload()}>Try again</button>
                </>
              ) : (
                <>
                  <p>Connecting to your board&hellip;</p>
                  {slow && (
                    <p style={{ fontSize: '0.8rem', maxWidth: 380, textAlign: 'center' }}>
                      Still connecting — your network may be blocking live connections
                      (WebSocket). Try a different network or refresh the page.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {panelOpen && (
          <CommentsPanel comments={comments} editor={editor} onRefresh={refreshComments} />
        )}
      </div>
    </div>
  );
}

const rootEl = document.getElementById('wts-board-root');
if (rootEl) {
  window.__WTS_BOARD_MOUNTED = true; // tells the server-rendered shell we made it
  createRoot(rootEl).render(<App />);
}
