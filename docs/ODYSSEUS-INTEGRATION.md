# Odysseus × WordsThatSells — Help AI integration

WTS runs an in-product Help AI on two surfaces, backed by a **self-hosted
[Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) AI workspace**
running as a separate service:

| Surface | Who | What it does | Endpoint |
|---|---|---|---|
| Client portal chat (`/portal/chat`) | Signed-in customers | Portal how-to + their own account context + marketing advice | `POST /portal/chat` (existing route, new backend) |
| Admin "AI Guide" drawer (every admin page) | Signed-in staff (admins **and** translator vendors) | Page-aware coach for admin workflows (Translations, Footer Manager, …) | `POST /api/help-ai` |
| Public site widget | Anonymous visitors | **Not built** — deliberately later, after portal+admin bed in | — |

Both surfaces call a **WTS server-side proxy**; browsers never talk to
Odysseus (the admin CSP's `connect-src 'self'` enforces this). If Odysseus
is down, users get a friendly error in the chat bubble and everything else
keeps working.

---

## 1. Architecture

```
Browser (portal page / admin drawer)
   │  same-origin fetch + CSRF token
   ▼
WTS admin app (Express)
   ├─ POST /portal/chat      requireCustomer + 20 msg/15 min limiter
   ├─ POST /api/help-ai      ensureAuthenticated + staff-role gate + 40 msg/15 min limiter
   │        │
   │        ▼
   │  src/lib/help-ai.js         role-scoped prompt composition (per surface)
   │  src/lib/help-ai-corpus/    how-to reference sheets injected server-side
   │        │
   │        ▼
   │  src/lib/odysseus-client.js timeouts, session cache, bearer auth
   │        │  HTTP, loopback/private network only
   ▼        ▼
Odysseus (separate service, 127.0.0.1:7860, AUTH_ENABLED=true)
   └─ its own configured model endpoint (Ollama / OpenAI-compatible / etc.)
```

Key design points:

- **Role-scoped prompts.** The portal prompt allows only the customer's own
  data (reusing `strategist.buildCustomerContext`) plus a portal how-to
  sheet; the admin prompt is a read-only UI coach with per-area reference
  sheets chosen by `pagePath`. Both forbid claiming to perform actions —
  money-touching steps stay human.
- **No Odysseus tools reachable.** The proxy uses Odysseus's *non-streaming*
  `POST /api/chat`, which never runs the agent loop (no shell/browser/MCP —
  see `routes/chat_routes.py:425-530` upstream: it goes context → single
  LLM call). Defense in depth: the API token belongs to a dedicated
  Odysseus service user whose privileges (`can_use_agent`, `can_use_bash`,
  `can_use_browser`, `can_manage_memory`, …) are all switched off.
- **Session model.** One Odysseus chat session per WTS login session per
  surface (cached in memory, keyed `portal:<sid>` / `admin:<sid>`).
  Instructions + corpus + (portal) account snapshot are seeded once per
  session as a `system` message via `POST /api/session/{sid}/inject_messages`
  — no LLM round-trip. If Odysseus loses the session (restart, cleanup),
  the client transparently recreates and re-seeds it, replaying the recent
  turns the WTS session still holds.
- **Fail closed.** Timeouts (25 s default, 2.5 s health), no retries beyond
  one session-recreate, friendly localized errors, feature fully dark when
  env is missing.

### Feature flags / env (wts-admin)

Documented in `wts-admin/.env.example` (never commit a real `.env`):

| Var | Meaning |
|---|---|
| `HELP_AI_ENABLED` | Master switch (`1`/`true`). Off → admin AI Guide hidden, portal uses legacy strategist. |
| `HELP_AI_MODE` | `legacy` (default, Anthropic strategist) or `odysseus` for the **portal** chat backend. Admin AI Guide always uses Odysseus. |
| `ODYSSEUS_BASE_URL` | e.g. `http://127.0.0.1:7860`. Loopback or private tunnel only. |
| `ODYSSEUS_API_TOKEN` | `ody_…` bearer token, scope `chat`, minted for the low-privilege service user. Secret. |
| `ODYSSEUS_ENDPOINT_ID` | Model-endpoint id registered inside Odysseus; help sessions are created against it. |
| `ODYSSEUS_MODEL` | Optional model pin; otherwise the endpoint's first chat model. |
| `HELP_AI_TIMEOUT_MS`, `HELP_AI_RATE_LIMIT_MAX` | Optional tuning. |

Rollout order: deploy with everything off → set the four `ODYSSEUS_*` vars +
`HELP_AI_ENABLED=1` (admin AI Guide goes live, portal untouched) → switch
`HELP_AI_MODE=odysseus` when ready to move the portal chat over. Rollback is
`HELP_AI_MODE=legacy` / `HELP_AI_ENABLED=0`.

---

## 2. Running Odysseus (native, no Docker)

### macOS (the WTS operator machine)

```bash
git clone https://github.com/pewdiepie-archdaemon/odysseus ~/src/odysseus
cd ~/src/odysseus
cp .env.example .env        # then edit: see below
./start-macos.sh            # UI on http://127.0.0.1:7860  (7860, not 7000 — AirPlay holds 7000)
```

`start-macos.sh` installs brew deps, creates `venv/`, runs `setup.py`
(creates the first admin — pre-seed with `ODYSSEUS_ADMIN_PASSWORD` in `.env`
or read the one-time password it prints), starts a local ChromaDB sidecar on
127.0.0.1:8100, and launches `uvicorn app:app` bound to `127.0.0.1:7860`.

`.env` minimums for this integration:

```
AUTH_ENABLED=true
APP_BIND=127.0.0.1
LOCALHOST_BYPASS=false
# pick ONE way to set the first admin password:
ODYSSEUS_ADMIN_PASSWORD=<choose-before-first-boot>
```

Note on branches: upstream's default (and only) branch is `dev` — there is
no `main`. Pin a known-good commit if you want stability
(`git checkout <sha>`); this integration was built and tested against
`2531ba4`.

### Linux (verified in this repo's dev container)

```bash
cd ~/src/odysseus
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python setup.py          # idempotent; honors ODYSSEUS_ADMIN_* from .env
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 7860
```

Degradation is graceful: without ChromaDB, vector RAG/memory quietly
degrade (chat still works); without any LLM backend the app boots but chat
returns errors until a model endpoint is configured. `GET /api/health` is
unauthenticated (use it for monitoring); `/api/ready` requires auth.

### One-time Odysseus configuration for WTS

1. **Log in as admin** → Settings → **Models**: register the model endpoint
   the help AI should use (an Ollama URL, an OpenAI-compatible URL + key,
   etc.). Note its endpoint id — that's `ODYSSEUS_ENDPOINT_ID`.
   Gotcha: a localhost URL **without** `/v1` is treated as native Ollama;
   give OpenAI-compatible local servers an explicit `…/v1` base URL.
2. **Create the service user**: Settings → Users → add non-admin user
   `wts-help`. Edit its privileges: turn OFF agent, bash/shell, browser,
   documents, research, image generation, memory management; optionally set
   a daily message cap and restrict `allowed_models`.
3. **Mint the API token**: as `wts-help` is non-admin it cannot mint its
   own token from the UI in all versions — an admin creates the token via
   the API-tokens panel while signed in as `wts-help`, or (simplest) log in
   as `wts-help` and use `POST /api/tokens` with `name=wts-proxy`,
   `scopes=chat`. Copy the `ody_…` value (shown once) into
   `ODYSSEUS_API_TOKEN`. Never use an admin-owned token: session ownership
   follows the token owner, and a leaked admin token is a full-workspace
   key.
4. (Optional) sanity check from the WTS host:
   `curl -s $ODYSSEUS_BASE_URL/api/health` → `{"status":"healthy"}`.

### Odysseus HTTP API actually used by the proxy

| Call | Purpose |
|---|---|
| `GET /api/health` | liveness (no auth) |
| `POST /api/session` (form: `name`, `endpoint_id`, [`model`]) | create help session |
| `POST /api/session/{sid}/inject_messages` | seed system instructions + replay history (no LLM call) |
| `POST /api/chat` (JSON: `message`, `session`) | one completion; **no agent loop/tools on this path** |

All authenticated with `Authorization: Bearer $ODYSSEUS_API_TOKEN`.
Alternative for simpler integrations: `POST /api/v1/chat` (single-call,
returns `session_id`; built for automation tools) — not used here because
`endpoint_id` selection and system-message seeding need the session flow.

---

## 3. Running the WTS side

```bash
cd wts-admin
npm install
# .env: DATABASE_URL, SESSION_SECRET, plus the Help AI block from .env.example
npm start          # or: npm run dev
npm test           # boots the real server against a test Postgres
```

Local end-to-end smoke (both stacks up):

1. Portal: log into `/portal`, open **AI Strategist** (`/portal/chat`), ask
   "How do I pay a BCEL invoice?" → answer should reference the WTS-
   reference transfer flow from the corpus and the customer's own orders.
2. Admin: any admin page → floating **AI Guide** button (bottom right) →
   ask "How do I publish a verified translation?" while on `/translations`
   → answer should walk approve/acknowledge warnings per the area sheet.
3. Kill Odysseus → both chats answer with a friendly retry message; every
   other page keeps working. Restart Odysseus → chats recover on the next
   message (sessions are recreated and re-seeded automatically).

## 4. Code map (wts-admin)

| File | Role |
|---|---|
| `src/lib/odysseus-client.js` | HTTP client: bearer auth, timeouts, session cache + recreate, no secret logging |
| `src/lib/help-ai.js` | Feature flags, role-scoped prompt composition per surface |
| `src/lib/help-ai-corpus/*.md` | How-to sheets: `portal`, `admin-general`, `admin-translations`, `admin-footers` (statuses and limits verified against the code they describe) |
| `src/routes/help-ai.js` | `POST /api/help-ai` — staff endpoint (own rate limiter, role gate, fail-closed) |
| `src/routes/portal.js` | portal chat GET/POST — backend switch legacy ↔ odysseus |
| `server.js` | mounts `/api/help-ai` ahead of the admin `/api` router; exempts it from the shared `/api` limiter; sets `res.locals.helpAiEnabled` |
| `src/views/partials/footer.ejs` | renders the AI Guide widget for signed-in staff when enabled |
| `public/js/help-widget.js` | the drawer UI (vanilla JS, sessionStorage transcript, CSRF via main.js fetch wrapper) |

Corpus maintenance: the sheets in `src/lib/help-ai-corpus/` are the AI's
source of truth for UI answers. When a workflow changes (new order status,
new translations transition, footer manager changes), update the matching
sheet in the same PR. Keep them compact — they ride along on every help
session (and per-turn for admin area sheets).

## 5. AGPL-3.0 boundary (read before touching this integration)

Odysseus is licensed **AGPL-3.0**. This integration is deliberately
arm's-length and must stay that way:

- Odysseus runs as a **separate service in its own repo/checkout**; it is
  not vendored, copied, or imported into this proprietary codebase. The
  only coupling is HTTP calls from `src/lib/odysseus-client.js`.
- Communicating with an AGPL program over the network does **not** make WTS
  code a derivative work. What WOULD: copying Odysseus source/UI assets
  into `marketing/`, linking/importing its Python modules, or iframing its
  UI into WTS pages. Don't do any of those.
- If WTS ever *modifies* Odysseus itself and lets users interact with that
  modified instance over a network, AGPL §13 requires offering those users
  the modified source. Keeping our instance unmodified (config/env only)
  avoids this obligation entirely; if we ever patch it, publish the fork.
- Never commit Odysseus's `data/` directory, its `.env`, `data/auth.json`,
  `data/app.db`, or `data/.app_key` anywhere — they hold credentials and
  encrypted provider keys (and they live outside this repo anyway).

## 6. Security posture summary

- Odysseus binds loopback, `AUTH_ENABLED=true`, `LOCALHOST_BYPASS=false`;
  reached only by the WTS server process. Remote/production topology
  (Tailscale or private proxy between WTS host and an Odysseus box) is a
  later phase — never expose raw Odysseus to the public internet.
- The WTS proxy holds the only credential, a revocable `chat`-scope token
  owned by a privilege-stripped service user; it is never logged (client
  errors carry method/path/status only) and never reaches the browser.
- Portal customers get zero admin/staff corpus and only their own account
  snapshot; staff get UI coaching only. Both prompts hard-forbid claiming
  to perform actions; payments/refunds/payouts remain human-approved in
  existing WTS flows.
- Both endpoints are session-authenticated, CSRF-protected (global derived
  token middleware), and rate-limited independently of other traffic.
- User-supplied `pagePath` is allowlist-validated (`^/[A-Za-z0-9-_/.]{0,119}$`)
  before it is echoed into any prompt.

## 7. Current status / next steps

Done (this branch): local Odysseus stand-up verified end-to-end (health,
setup, login, token, session, seeded system context, chat round-trip);
proxy + both surfaces + corpus + tests; feature-flagged rollout path.

Next steps, in order:
1. On the operator Mac: run Odysseus via `start-macos.sh`, do §2's one-time
   configuration with a real model (Ollama or an API key), fill the env
   block, flip `HELP_AI_ENABLED=1`, and dogfood the admin AI Guide.
2. Switch `HELP_AI_MODE=odysseus` for the portal after comparing answer
   quality against the legacy strategist.
3. Grow the corpus (business/orders screen, workforce, images) as questions
   come in.
4. Later phase: private remote Odysseus (Tailscale/reverse proxy with auth,
   `SECURE_COOKIES=true`), and only after that, evaluate a public-site FAQ
   widget (marketing corpus only, no account context, aggressive limits).
