// WTS collaborative whiteboard island.
// Reads config from window.__WTS_BOARD__ (set by src/views/whiteboard/board.ejs)
// and mounts a tldraw canvas synced over websocket via @tldraw/sync.
import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { Tldraw, atom, UserRecordType, createUserId, useValue } from 'tldraw';
import { useSync } from '@tldraw/sync';
import { getAssetUrls } from '@tldraw/assets/selfHosted';
import 'tldraw/tldraw.css';

const cfg = window.__WTS_BOARD__ || {};

// Icons, fonts and translations are served same-origin from
// /whiteboard/assets/ (copied there by whiteboard-ui/build.js) so the page
// works under a strict CSP with no external hosts.
const assetUrls = getAssetUrls({ baseUrl: '/whiteboard/assets/' });

// Image/file uploads are out of scope for this module: reject uploads,
// resolve whatever src a record already carries.
const noopAssets = {
  upload() {
    return Promise.reject(new Error('File uploads are not available on this board.'));
  },
  resolve(asset) {
    return (asset && asset.props && asset.props.src) || null;
  },
};

const TOP_BAR_HEIGHT = 48;

const styles = `
  .wts-board-app { position: fixed; inset: 0; display: flex; flex-direction: column; height: 100dvh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .wts-board-topbar { height: ${TOP_BAR_HEIGHT}px; flex: 0 0 ${TOP_BAR_HEIGHT}px; background: #122a3f; color: #fff; display: flex; align-items: center; gap: 0.75rem; padding: 0 0.9rem; }
  .wts-board-topbar a.wts-back { color: #e2e8f0; text-decoration: none; font-size: 0.84rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.35); border-radius: 8px; padding: 0.25rem 0.7rem; white-space: nowrap; }
  .wts-board-title { font-size: 0.95rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .wts-board-presence { font-size: 0.78rem; color: #cbd5e1; white-space: nowrap; display: flex; align-items: center; gap: 0.35rem; }
  .wts-board-presence .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; display: inline-block; }
  .wts-board-presence .dot.off { background: #f59e0b; }
  .wts-board-canvas { flex: 1; position: relative; min-height: 0; }
  .wts-board-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 999px; padding: 0.3rem 1rem; font-size: 0.82rem; font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.12); pointer-events: none; }
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

  const storeWithStatus = useSync({ uri, assets: noopAssets, users });
  const [editor, setEditor] = useState(null);

  const synced = storeWithStatus.status === 'synced-remote';
  const online = synced && storeWithStatus.connectionStatus === 'online';
  const showBanner = !online;

  return (
    <div className="wts-board-app">
      <style>{styles}</style>
      <div className="wts-board-topbar">
        <a className="wts-back" href={cfg.backUrl || '/'}>
          &larr; Back
        </a>
        <span className="wts-board-title">{cfg.boardTitle || 'Whiteboard'}</span>
        <PresenceBadge editor={synced ? editor : null} online={online} />
      </div>
      <div className="wts-board-canvas">
        {showBanner && <div className="wts-board-banner">Reconnecting&hellip;</div>}
        {synced ? (
          // Connected: render the shared store. Keyed so switching from the
          // local placeholder store below remounts cleanly.
          <Tldraw key="synced" store={storeWithStatus.store} assetUrls={assetUrls} onMount={setEditor} />
        ) : (
          // Still connecting (or the socket dropped before first sync): show a
          // local scratch canvas so the UI stays usable, with the banner above.
          <Tldraw key="local" assetUrls={assetUrls} onMount={setEditor} />
        )}
      </div>
    </div>
  );
}

const rootEl = document.getElementById('wts-board-root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
