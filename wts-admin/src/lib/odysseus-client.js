// Odysseus client — thin HTTP wrapper around a self-hosted Odysseus AI
// workspace (https://github.com/pewdiepie-archdaemon/odysseus).
//
// Odysseus runs as a SEPARATE service (AGPL-3.0); we only talk to it over
// HTTP, we never import or vendor its code. This module is the single place
// that knows Odysseus's API shapes, so the rest of the app deals in one
// call: ask(sessionKey, message) -> reply string.
//
// Auth is a bearer API token (Settings → API Tokens in Odysseus, scope
// "chat") minted for a dedicated low-privilege service user — never an
// admin token. The token value is never logged.
//
// Env:
//   ODYSSEUS_BASE_URL     e.g. http://127.0.0.1:7860 (loopback or private net only)
//   ODYSSEUS_API_TOKEN    ody_... bearer token (secret)
//   ODYSSEUS_ENDPOINT_ID  model-endpoint id registered in Odysseus (Settings → Models)
//   ODYSSEUS_MODEL        optional model name; Odysseus picks the endpoint's
//                         first chat model when omitted
//   HELP_AI_TIMEOUT_MS    per-request timeout (default 25000; health uses 2500)

const BASE_URL = () => (process.env.ODYSSEUS_BASE_URL || '').replace(/\/+$/, '');
const TIMEOUT_MS = () => Number(process.env.HELP_AI_TIMEOUT_MS) || 25000;

const isConfigured = () =>
  !!(process.env.ODYSSEUS_BASE_URL && process.env.ODYSSEUS_API_TOKEN && process.env.ODYSSEUS_ENDPOINT_ID);

// Odysseus chat sessions we created, keyed by an opaque per-conversation key
// (the WTS session id + surface). Odysseus keeps the message history, so one
// Odysseus session per WTS conversation gives multi-turn context without
// re-sending history. In-memory: a restart just means new sessions.
const sessionCache = new Map();
const SESSION_CACHE_MAX = 5000;

function cacheSet(key, value) {
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order).
    const oldest = sessionCache.keys().next().value;
    sessionCache.delete(oldest);
  }
  sessionCache.set(key, value);
}

async function request(path, { method = 'GET', body, form, timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || TIMEOUT_MS());
  timer.unref();
  const headers = { Authorization: `Bearer ${process.env.ODYSSEUS_API_TOKEN}` };
  let payload;
  if (form) {
    payload = new URLSearchParams(form);
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  try {
    const res = await fetch(`${BASE_URL()}${path}`, {
      method,
      headers,
      body: payload,
      signal: controller.signal
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON error body */ }
    if (!res.ok) {
      const err = new Error(`Odysseus ${method} ${path} -> ${res.status}`);
      err.status = res.status;
      err.detail = data && (data.detail || data.error);
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Cheap readiness probe — used to fail fast (and fail closed) before a chat
// call, and by /health-style diagnostics. Never throws.
async function health() {
  if (!BASE_URL()) return false;
  try {
    const data = await request('/api/health', { timeoutMs: 2500 });
    return !!data && data.status === 'healthy';
  } catch (_) {
    return false;
  }
}

// Create a chat session and pre-load it: a system message carrying the
// role-scoped instructions, plus (after a lost-session recreate) a replay of
// the recent turns the WTS session still remembers. inject_messages appends
// to session history WITHOUT triggering an LLM call, so the instructions
// cost no extra round-trip and are sent once per session instead of once
// per message.
async function createSession(name, systemContext, replayHistory) {
  const form = {
    name: name.slice(0, 80),
    endpoint_id: process.env.ODYSSEUS_ENDPOINT_ID || ''
  };
  if (process.env.ODYSSEUS_MODEL) form.model = process.env.ODYSSEUS_MODEL;
  const data = await request('/api/session', { method: 'POST', form });
  if (!data || !data.id) throw new Error('Odysseus session create returned no id');
  const preload = [];
  if (systemContext) preload.push({ role: 'system', content: systemContext });
  for (const m of replayHistory || []) {
    if (m && (m.role === 'user' || m.role === 'assistant') && m.content) {
      preload.push({ role: m.role, content: String(m.content).slice(0, 4000) });
    }
  }
  if (preload.length) {
    await request(`/api/session/${encodeURIComponent(data.id)}/inject_messages`, {
      method: 'POST',
      body: { messages: preload }
    });
  }
  return data.id;
}

// One chat turn. `sessionKey` identifies the conversation (stable across a
// WTS login session); `name` labels the session inside Odysseus for
// operability ("wts-portal", "wts-admin"). Odysseus keeps the conversation
// history, so callers send only the new message (plus small per-turn
// context). If Odysseus lost the session (restart, cleanup), we create a
// fresh one — re-seeded with `systemContext` and `replayHistory` — and
// retry once.
async function ask(sessionKey, name, message, { systemContext, replayHistory } = {}) {
  let sid = sessionCache.get(sessionKey);
  if (!sid) {
    sid = await createSession(name, systemContext, replayHistory);
    cacheSet(sessionKey, sid);
  }
  try {
    const data = await request('/api/chat', {
      method: 'POST',
      body: { message, session: sid }
    });
    return (data && data.response || '').trim();
  } catch (e) {
    if (e.status === 404) {
      sessionCache.delete(sessionKey);
      const fresh = await createSession(name, systemContext, replayHistory);
      cacheSet(sessionKey, fresh);
      const data = await request('/api/chat', {
        method: 'POST',
        body: { message, session: fresh }
      });
      return (data && data.response || '').trim();
    }
    throw e;
  }
}

module.exports = { isConfigured, health, ask };
