# Localization Platform (RBAC · i18n Pipeline · Vendor Payouts)

> Part 2 — full-site localization (static /th /la /fr generation, language
> switcher, hreflang/sitemap, publish-and-generate) is documented in
> [`../LOCALIZATION_GUIDE.md`](../LOCALIZATION_GUIDE.md).

Multi-sided translation platform on the existing stack (Express 5 + EJS +
Passport sessions + raw `pg`). Three concurrent epics: granular RBAC, a
hybrid AI/human translation pipeline for `/en /th /la /fr`, and an
automated vendor payout ledger. Everything is additive and idempotent;
the client portal i18n (en/th) and the session model are untouched.

## Execution sequence (as shipped, one commit per epic-slice)

1. **DDL** — `database/db.js`: `users.assigned_languages / is_vendor /
   payout_metadata`, `translations`, `payout_rates`, `payout_ledger`,
   `payout_requests` + indexes. All `CREATE TABLE IF NOT EXISTS` /
   `DO $$ ADD COLUMN IF NOT EXISTS` blocks, applied automatically at boot.
2. **RBAC middleware** — `src/middleware/auth.js`: `ensureRole`,
   `ensureSuperAdmin` (accepts `superadmin` *and* legacy `admin`),
   `ensureTranslator`, `ensureLanguageAccess`, `isSuperAdmin`.
   `ensureAdmin` now accepts `superadmin` too, so promoting is never
   required for access and never breaks it.
3. **Core libs** — `src/lib/translation-core.js` (entity sources, sha256
   source hashing, word counts, status machine, rate resolution, the
   transactional publish→ledger hook), `src/lib/ai-translator.js` (async
   batch: chunking ~1500 tokens, hash-skip diffs, SDK retry/backoff),
   `src/lib/payout-gateway.js` (AES-256-GCM envelopes + Wise / Stripe
   Connect / manual skeletons).
4. **Routes + UI** — `src/routes/translations.js` mounted at
   `/translations`; EJS views under `src/views/translations/`; role-aware
   sidebar.
5. **Wiring** — `server.js` mount (per-route RBAC, *not* `ensureAdmin`),
   `/translations` added to the large-body allowlist; public feed
   `GET /api/public/translations/:lang/:entityType` (published rows only);
   static fallbacks for `/th /la /fr` in `_redirects` + `netlify.toml`.
6. **Tests** — `test/translations.test.js`: role isolation, language
   scoping, sync idempotency + stale detection, publish→ledger credit,
   payout request lifecycle, chunk/hash unit tests.

## Roles

| Role | Access |
|---|---|
| `superadmin` / `admin` (synonyms) | Everything: pipeline, review/approve, vendors, rates, ledger, disbursements, all existing admin modules |
| `translator` | `/translations/workspace` + `/translations/earnings` only, restricted to `users.assigned_languages`; can save drafts and submit to `requires_review`; can never publish |
| `user` | No admin surfaces (unchanged) |

Every `/translations` route revalidates role **and** language assignment
server-side (`ensureTranslator` + per-row `rowAccessError`), so a
translator can only ever read/write rows in their languages that are
unclaimed or claimed by them.

## Translation state machine

```
pending → translating → requires_review → published
   ↑           ↑              ↓ (reject)
   └───────────┴────────── rejected
published → translating   (superadmin "reopen" for manual overrides)
published → pending       (sync sweep when the English source changes)
```

- `source_hash` = sha256 of the English source at translation time. The
  AI batch skips rows whose hash is unchanged (diff-only, token-safe).
- **Sync Content** (`POST /translations/sync`) creates missing rows for
  live entities (articles, glossary, seo_terms, guides, products ×
  th/la/fr) and re-opens published rows whose source changed.
- **AI batch** (`POST /translations/ai-batch`) translates unclaimed rows
  (default th + fr) with chunking and rate-limit backoff, landing them in
  `requires_review`. Requires `ANTHROPIC_API_KEY` (model override:
  `AI_TRANSLATION_MODEL`).
- **Vendor workspace** — side-by-side English → target editor. "Submit
  for Review" flips to `requires_review` and notifies every SuperAdmin.
- **Approve** runs `onTranslationPublished`: publish + payout credit in
  one DB transaction. Re-publishing after a reopen never double-credits.

## Payout flow

1. SuperAdmin configures rate cards (`/translations/payouts`): scope =
   (vendor, language) > (vendor) > (language) > global; type `per_word`
   (rate × source words), `per_article`, or `fixed`.
2. Approving a vendor's translation credits `payout_ledger`
   (`status='available'`). AI rows and non-vendor users credit nothing.
3. Vendor stores banking details (`/translations/earnings`) — encrypted
   with AES-256-GCM into `users.payout_metadata`; only the gateway name
   and a masked label (`•••• 1234`) are ever readable or displayed.
4. Vendor requests a payout of their available balance (min-payout
   enforced from the rate card). The request snapshots the encrypted
   envelope so later edits can't redirect in-flight money.
5. SuperAdmin settles the request: **Send** via gateway (Wise / Stripe
   Connect skeletons in `src/lib/payout-gateway.js`) or **Mark Paid**
   (manual transfer, e.g. BCEL). Ledger entries flip to `paid`
   atomically; **Cancel** returns them to `available`.

## Environment variables

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the AI translation batch |
| `AI_TRANSLATION_MODEL` | Optional model override (default `claude-sonnet-5`) |
| `PAYOUT_METADATA_KEY` | 64 hex chars (`openssl rand -hex 32`) — AES-256-GCM key for vendor banking metadata. Without it, banking details cannot be saved |
| `WISE_API_TOKEN`, `WISE_PROFILE_ID`, `WISE_API_BASE` | Wise disbursement (optional; sandbox via `WISE_API_BASE`) |
| `STRIPE_SECRET_KEY` | Already used for checkout; also powers Stripe Connect transfers |

## One-time migration notes

Nothing is required for existing deployments — the DDL applies itself at
boot and `admin` keeps working everywhere. Optional steps:

```bash
# 1. (Optional, cosmetic) rename admin → superadmin
node scripts/setup-translation-platform.js promote-superadmins

# 2. Create the translator account (set ALLOW_SIGNUP=true briefly, or use
#    OAUTH_ALLOWED_EMAILS), then grant role + languages + vendor flag:
node scripts/setup-translation-platform.js make-translator somphone@example.la la --vendor
#    (Also available in the UI: /translations/vendors)

# 3. Configure a payout rate (global or per-language):
node scripts/setup-translation-platform.js set-rate per_word 0.05 la

# 4. In the admin UI: Localization → Translations → "Sync Content",
#    then "Run AI Batch" (th/fr) — Lao rows are picked up by the vendor
#    in their workspace.
```

Note: `ADMIN_EMAILS` still promotes to `admin` (a full-access synonym)
and no longer touches accounts already promoted to `superadmin`.

## Static routing

`/_redirects` + `netlify.toml`: `/th/* /la/* /fr/*` serve the English
page via a temporary 302 until localized files exist — generated files
take precedence automatically (`force = false`). Per-language article SPA
rewrites are staged in `_redirects` comments, to be enabled when the
localized article apps are generated. Published translations are
consumable at `GET /api/public/translations/:lang/:entityType` for the
static build pipeline.

## Board conversation auto-translation (whiteboard)

The client-portal review board is cross-language: everyone writes in
their own language and everyone reads in their own language.

- Every board comment and approval note stores the author's language
  (`source_lang` — the portal locale for customers, `en` for staff) and
  the text exactly as typed. The original is always the source of truth.
- `src/lib/snippet-translator.js` translates each message once per target
  language in the background (fire-and-forget after the write) and caches
  it in `board_translations`, keyed by source hash — edited text
  re-translates, unchanged text is never paid for twice. Distinct from
  `ai-translator.js` (long-form batches): snippets default to the fast
  model tier (`AI_SNIPPET_MODEL`, default `claude-haiku-4-5-20251001`).
- The collab endpoints attach the viewer's cached rendering next to the
  original (`translation: { lang, body }`); the board UI shows it with a
  "Translated from … · Show original" toggle. Until the cache fills (a
  second or two) the original renders with a "translating…" hint.
- Without `ANTHROPIC_API_KEY` the feature degrades silently: everyone
  sees originals, nothing breaks (`autoTranslate: false` in responses).
- Approval decisions store `decided_rendering` — which rendering
  (original or translation, and its exact text) the customer had on
  screen when they clicked Approve/Request changes — so a disputed
  machine translation can always be traced to what was actually decided.
- Board UI chrome ships from `src/locales/{en,th}.json` under
  `boards.island` (the island renders client-side; strings are passed via
  `__WTS_BOARD__`). The Thai strings were machine-drafted and should get
  a native pass — same caveat as the Lao site chrome.
