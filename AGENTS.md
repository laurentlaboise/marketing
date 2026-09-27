# AGENTS.md — WordsThatSells (marketing)

This is the primary repo of the **Labware WTS** Cloud Agent environment. It is
the WordsThatSells site (`wordsthatsells.website`) — static HTML/JS with an
AdSense + Google Search Console footprint, a large article/SEO surface, and the
`wts-admin/` Express + PostgreSQL admin backend.

## Cursor Cloud specific instructions

### Who leads & how to escalate
- **Laurent Laboise leads.** When a call is ambiguous, defer to Laurent rather than guessing.
- **T1 (draft / propose): OK to proceed.** Drafting copy, articles, code, configs, and local changes needs no sign-off.
- **T2 (send / publish / deploy): needs an explicit "yes".** Anything that goes live or leaves the box — publishing pages, pushing to production, deploying, sending email/messages, opening non-setup PRs — waits for Laurent's approval.
- **T3 (money / legal / delete): needs typed confirmation.** Payments, pricing, Stripe, contracts/legal text, and destructive/irreversible actions (deleting data, repos, or resources) proceed only after Laurent types an explicit confirmation.

### WTS AdSense rules (hard constraints)
- **Auto ads are OFF.** Do not enable Auto ads / page-level auto ad code.
- **Manual ad units only**, placed via the existing injection pipeline.
- **Never invent ad slot IDs.** Use only slot IDs that already exist in the repo/config. If a needed slot does not exist, stop and ask — do not fabricate one.

### Crew / capacity reality
- The **hot crew is ~8–12 live seats**. Plan concurrent live work around that.
- The **68-agent list in `ai-team` is the Labware *product* registry**, not 68 live Cursor agents. Do not spin up or assume 68 concurrent agents.

### Repos & scope
- **Do not clone extra/random repos.** Only the four approved repos below are in scope. Ask before adding any new repo.

## Environment layout

Sibling Labware repos are cloned under `~/repos` (marketing is symlinked in):

| Repo | Path | Stack | Notes |
| --- | --- | --- | --- |
| marketing (this repo, **primary**) | `/workspace` (= `~/repos/marketing`) | Static HTML/JS + webpack/Tailwind build; `wts-admin/` Express + Postgres | WTS site, AdSense, GSC, articles |
| ai-team | `~/repos/ai-team` | Vite / React / TS | 68-agent Labware registry (product) |
| labware.icu | `~/repos/labware.icu` | Node (zero-dep build/serve scripts) | Public Labware landing |
| digitalcards | `~/repos/digitalcards` | Nest API (root) + Next app in `digital-card-platform/` | TapCard / NFC cards |

## Toolchain
- **Node 20 LTS is the pinned project toolchain**, installed via `nvm`. Run `nvm use 20` before project work. (The Cursor runtime also exposes its own node at `/exec-daemon/node`, which appears first on `PATH`; it satisfies every repo's `engines: >=20`, but use `nvm use 20` for production parity.)
- `git`, `python3`, `ripgrep` (`rg`), and `jq` are available.
- `.cursor/install.sh` is idempotent: it provisions the toolchain, clones/refreshes the repos, and installs dependencies. It **never** writes secrets or `.env` files — runtime secrets come from Cursor Secrets.

## Common commands
- marketing site build: `npm run build` (bundles CSS, runs webpack, injects footers/FAQs/ads/pixel). Note: the inject steps rewrite tracked HTML in place; don't commit those unless that's the intent.
- `wts-admin` backend: needs a PostgreSQL and `SESSION_SECRET`; `cd wts-admin && npm start` (see `wts-admin/.env.example`). DB URL/secrets via Cursor Secrets, never committed.
- ai-team: `cd ~/repos/ai-team && npm run dev` (Vite on 5173).
- labware.icu: `cd ~/repos/labware.icu && npm run dev` (serves `public/` on 4173).
- digitalcards: Nest API `cd ~/repos/digitalcards && npm run start:dev`; Next app `cd ~/repos/digitalcards/digital-card-platform && npm run dev`.
