# Technical Deep-Dive Code Audit Report

**Repository:** `laurentlaboise/marketing` — static marketing site (root) + `wts-admin/` Express/PostgreSQL backend
**Audit date:** 2026-06-12 · **Method:** static analysis, cyclomatic-complexity assessment, dependency-graph tracing, citation-verified against the working tree
**Mandate:** structural and logical findings only; every proposal verified for backward compatibility; **no source files were modified by this audit**

---

## Frontend Audit [Target Bloat: ~30-35% | Orphaned Lines: 627]

> **Verification update:** deep citation-checking during this audit confirmed the two originally flagged orphan scripts (627 lines) **and surfaced two additional orphans** — `js/services/content-creation.js` (558 lines) and `js/modules/cdn.js` (158 lines) — plus 83 lines of Vite scaffold in `src/`. Verified total dead frontend JS: **1,426 of ~3,289 lines (~43%)**, exceeding the initial 30-35% target estimate.

**Script-loading ground truth** (every `src=` attribute across all HTML pages, deduplicated):

| Script | Pages loading it | Status |
|---|---|---|
| `/js/services/page-sidebar.js` | 21 | ✅ Active |
| `/js/main.js` (ES module → imports `firebase.js`, `ui.js`, `faq.js`, `slide.js`) | 11 | ✅ Active |
| `/js/services/product-loader.js` | 4 | ✅ Active |
| `/js/scripts.js` | 1 (`images/index.html`) | ❌ **File does not exist — 404 on load** |
| `js/a_script.js`, `js/b_en_script.js`, `js/services/content-creation.js`, `js/modules/cdn.js` | 0 | ❌ Orphaned |

### Orphaned Entry Scripts [a_script.js: 251 | b_en_script.js: 376]

**Files:** `js/a_script.js` (251 lines), `js/b_en_script.js` (376 lines)
**Evidence:** zero references in any HTML or JS file (verified by repo-wide grep). Both are pre-modularization monoliths whose logic was migrated into `js/modules/` — back-to-top + scroll-reveal + modal logic duplicates `js/modules/ui.js`, the hardcoded FAQ array duplicates `js/modules/faq.js:5-103`, and the slide-panel logic duplicates `js/modules/slide.js`. `js/a_script.js:220` even imports the **Supabase** client (`createClient from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'`) — a remnant of the pre-`wts-admin` backend.

**Analytical walk-through:** (1) enumerate all `<script src>` attributes repo-wide; (2) neither file appears; (3) neither file is `import`ed by `js/main.js` (its full import list is `firebase.js`, `ui.js`, `faq.js`, `slide.js` — `js/main.js:3-6`); (4) therefore removal is a no-op for every rendered page.

**Refactor directive:**

```bash
# Phase 1 safe deletion — zero runtime impact (no page loads these)
git rm js/a_script.js js/b_en_script.js
```

**Why this is better:** −627 lines of maintenance surface and the elimination of a *divergence hazard*: the FAQ content here has already drifted from `faq.js`, so any future editor "fixing" the wrong copy ships nothing. Maintainability win; zero time/space cost.
**Backward compatibility:** ✅ verified — no loader exists for either file.

### Newly Verified Orphans [content-creation.js: 558 | cdn.js: 158 | src/ scaffold: 83]

- `js/services/content-creation.js` (558 lines) — not referenced by any HTML `script` tag (all grep hits for "content-creation" are directory links to `/en/digital-marketing-services/content-creation/`). Decisive evidence it can never have loaded as an external script: **it is not valid JavaScript** — `js/services/content-creation.js:1` literally begins with an HTML `<script>` tag and the file ends with `</script>`. It is a pasted inline-HTML fragment saved as `.js`; loading it via `src=` would throw `SyntaxError: Unexpected token '<'`.
- `js/modules/cdn.js` (158 lines) — not imported by `js/main.js` (see import list above) and not referenced by any HTML.
- `src/main.js` (24), `src/counter.js` (9), `src/style.css` (50) — Vite starter scaffold; `src/main.js:1` imports `./style.css`, but nothing loads `src/main.js`. Live styling is `/css/main.css` (linked at `en/index.html:62`).

**Backward compatibility:** ✅ all three groups verified unreachable from any rendered page.

### Broken Script Reference [Pages affected: 1]

`images/index.html` requests `src="/js/scripts.js"` — the file does not exist anywhere in the repo (it is the *gulp-era* bundle name; see `gulpfile.js` paths). Every load of that internal page logs a 404.
**Fix:** remove the tag, or point it at the intended bundle.
**Backward compatibility:** ✅ removing a 404'ing tag cannot change behavior.

### Build-System Redundancy [Active: webpack | Legacy: gulpfile.js (454 lines)]

`package.json:6` defines the only build entry: `"build": "webpack --mode=production"`. No npm script invokes `gulpfile.js` (454 lines), whose configured paths (`js/scripts.js`, `css/styles.css`) reference files that no longer exist. Meanwhile the deployed site (GitHub Pages-style: `CNAME` + root-served HTML linking `/css/main.css` and `/js/main.js` directly) appears to serve the **repo root**, not webpack's `dist/` output — meaning even the webpack pipeline may be vestigial. **Owner verification needed before pruning either.**

### Vestigial Tailwind Toolchain [npm dep: unused | CDN: 2 internal pages]

Precise status (this nuance matters — a naive "unused" claim would be wrong):

- `tailwindcss` devDependency + `tailwind.config.js` + the `tailwindcss` plugin in `postcss.config.js` produce CSS **no live page consumes**: `en/` pages link only `/css/main.css` (`en/index.html:62-63`), and utility-looking classes like `.text-center`/flex usage are **hand-written custom CSS** at `css/layout/layout.css:23-35`.
- Tailwind *does* appear on two internal admin pages via the Play CDN (`images/index.html:57`: `<script src="https://cdn.tailwindcss.com"></script>`) — itself an anti-pattern for anything production-facing (runtime JIT compiler, ~100KB+ script, no purging).

**Refactor directive:** remove `tailwindcss` from `package.json` devDependencies, delete `tailwind.config.js`, and drop the plugin line from `postcss.config.js`; keep the CDN usage decision separate.
**Backward compatibility:** ✅ no shipped stylesheet is generated from Tailwind; `npm run build` output for live pages is unchanged.

### Repository Asset Bloat [~24.6MB unreferenced at root]

| File | Size |
|---|---|
| `Content & Socials For a Artisan Bakery.svg` | 9.0MB |
| `Event Promotion For a Community Non-Profit.svg` | 8.6MB |
| `Brand Identity  For a Tech Start-up.svg` | 7.0MB |
| `SEO and AI Marketing in Laos A Comprehensive Strategic Guide for 2025.jpg` | 652KB |

None is referenced by any HTML/CSS/JS. They inflate every clone and CI checkout. Move to external storage (or the image CDN pipeline the backend already operates) and delete from the repo. Note: history rewriting (BFG/filter-repo) is the only way to reclaim clone size — flag as a separate, owner-approved operation.

### Runtime Pattern Findings [Scroll listeners: 3 active | Passive: 2/3]

- `js/services/page-sidebar.js:117` uses `{ passive: true }` ✅; `js/modules/ui.js` back-to-top handler should adopt the same flag where it attaches its scroll listener.
- The repeated `IntersectionObserver` reveal pattern is correctly centralized in `js/modules/ui.js` for module pages; duplicates exist only in the orphaned files (resolved by their deletion).
- Frontend `fetch()` timeout hardening is covered in the Integrations section (mandated `AbortController` pattern).

---

## Backend Subsystem (wts-admin) [Hotspots: 5 Files | Baseline Duplication: ~6-8%]

Source footprint: **8,187 lines** across routes/middleware/utils/db. Hotspot ranking by line count and assessed cyclomatic complexity:

| File | Lines | Dominant complexity driver |
|---|---|---|
| `src/routes/images.js` | 1,681 | GitHub API callbacks + recursive redirect fetcher (4-level nesting) |
| `src/routes/content.js` | 1,126 | Article create handler destructures **37 fields** in one statement (`content.js:139`) |
| `database/db.js` | 982 | 400+ lines of conditional DDL |
| `src/routes/webdev.js` | 878 | Correlated subqueries + inline platform metadata |
| `src/routes/public-api.js` | 835 | Repetitive row-transform mappers |

### Top 3 Performance Bottlenecks [DB round-trips: 10→1 | Correlated subqueries: 3N→0 | Payload: full-content lists]

#### Bottleneck #1 — Dashboard statistics: 10 sequential-pool COUNT round-trips → single-pass CTE
**Citation:** `wts-admin/src/routes/dashboard.js:36-47`

```javascript
// CURRENT — 10 independent queries; Promise.all parallelizes latency but still
// consumes 10 pool connections / 10 network round-trips / 10 planner invocations
const stats = await Promise.all([
  db.query('SELECT COUNT(*) FROM articles'),
  db.query('SELECT COUNT(*) FROM ai_tools'),
  db.query('SELECT COUNT(*) FROM products'),
  db.query('SELECT COUNT(*) FROM glossary'),
  db.query('SELECT COUNT(*) FROM seo_terms'),
  db.query("SELECT COUNT(*) FROM images WHERE status = 'active'").catch(() => ({ rows: [{ count: 0 }] })),
  db.query("SELECT COUNT(*) FROM microsites").catch(() => ({ rows: [{ count: 0 }] })),
  db.query("SELECT COUNT(*) FROM articles WHERE status = 'draft'").catch(() => ({ rows: [{ count: 0 }] })),
  db.query("SELECT COUNT(*) FROM microsites WHERE status = 'active'").catch(() => ({ rows: [{ count: 0 }] })),
  db.query("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false", [req.user.id]).catch(() => ({ rows: [{ count: 0 }] }))
]);
```

**Proposed refactor — loop mechanism eliminated; one combined execution block:**

```sql
-- Single-pass CTE with conditional aggregate filtering.
-- Index leverage: each FILTER predicate scans its base table once;
-- articles' filtered counts ride idx_articles_status_published_at (db.js schema)
-- as index-only scans, and the notifications branch is a keyed lookup on
-- (user_id, read) rather than a separate round-trip. Net: 10 planner/executor
-- invocations and 10 pool checkouts collapse to exactly 1.
WITH counts AS (
  SELECT
    (SELECT COUNT(*) FROM articles)                                          AS articles,
    (SELECT COUNT(*) FILTER (WHERE status = 'draft') FROM articles)          AS drafts,
    (SELECT COUNT(*) FROM ai_tools)                                          AS ai_tools,
    (SELECT COUNT(*) FROM products)                                          AS products,
    (SELECT COUNT(*) FROM glossary)                                          AS glossary,
    (SELECT COUNT(*) FROM seo_terms)                                         AS seo_terms,
    (SELECT COUNT(*) FILTER (WHERE status = 'active') FROM images)           AS images,
    (SELECT COUNT(*) FROM microsites)                                        AS microsites,
    (SELECT COUNT(*) FILTER (WHERE status = 'active') FROM microsites)       AS active_sites,
    (SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false) AS unread_notifications
)
SELECT
  articles::int, drafts::int, ai_tools::int, products::int, glossary::int,
  seo_terms::int, images::int, microsites::int, active_sites::int,
  unread_notifications::int
FROM counts;
```

```javascript
// dashboard.js — one combined execution block replaces the 10-element array
const { rows: [stats] } = await db.query(DASHBOARD_STATS_CTE, [req.user.id]);
// stats.articles, stats.drafts, ... are already integers (::int casts) —
// removes the parseInt(rows[0].count) post-processing as well
```

**Why this is better:** time — round-trips drop 10→1 (O(k) network/pool overhead → O(1)); the duplicate scans of `articles` and `microsites` (counted twice each in the current code) collapse into single scans with `FILTER`. Space — one result row instead of 10 result sets. Maintainability — adding a stat is one CTE line, not a new query + array-index bookkeeping (the current positional `stats[7]`-style indexing is itself a defect magnet). The `::int` casts remove pg's string-typed `COUNT` footgun.
**Backward compatibility:** ✅ read-only query; identical values rendered to the same EJS template. The per-query `.catch(() => 0)` guards (for not-yet-migrated tables) must be preserved by wrapping the single call in the equivalent try/catch fallback.

#### Bottleneck #2 — Microsites list: 3 correlated subqueries per row
**Citation:** `wts-admin/src/routes/webdev.js:58-64`

```sql
-- CURRENT — each subquery re-executes for EVERY microsite row (3N inner scans)
SELECT m.*,
  (SELECT COUNT(*) FROM microsite_domains WHERE microsite_id = m.id) as domain_count,
  (SELECT COUNT(*) FROM microsite_deployments WHERE microsite_id = m.id) as deployment_count,
  (SELECT status FROM microsite_deployments WHERE microsite_id = m.id ORDER BY created_at DESC LIMIT 1) as last_deploy_status
FROM microsites m WHERE 1=1
```

**Proposed refactor — set-based, correlated loop eliminated:**

```sql
-- Set-based conversion: pre-aggregate each child table ONCE, then hash-join.
-- Index leverage: the GROUP BY microsite_id aggregates and the
-- DISTINCT ON latest-status scan both ride an index on
-- microsite_deployments(microsite_id, created_at DESC) — one ordered index
-- pass replaces N ORDER BY ... LIMIT 1 re-sorts.
SELECT m.*,
  COALESCE(d.domain_count, 0)::int     AS domain_count,
  COALESCE(dep.deployment_count, 0)::int AS deployment_count,
  dep.last_deploy_status
FROM microsites m
LEFT JOIN (
  SELECT microsite_id, COUNT(*) AS domain_count
  FROM microsite_domains GROUP BY microsite_id
) d ON d.microsite_id = m.id
LEFT JOIN (
  SELECT DISTINCT ON (microsite_id)
         microsite_id,
         COUNT(*) OVER (PARTITION BY microsite_id) AS deployment_count,
         status AS last_deploy_status
  FROM microsite_deployments
  ORDER BY microsite_id, created_at DESC
) dep ON dep.microsite_id = m.id
WHERE 1=1
```

**Why this is better:** time — O(3N) correlated executions become two single-pass aggregations + hash joins (effectively O(N + M)); at 100 microsites that is ~300 inner scans → 3 scans. Maintainability — the latest-status and the count come from one `DISTINCT ON` pass instead of two different access patterns over the same table.
**Backward compatibility:** ✅ identical column names/types (`::int` + `COALESCE` preserve the non-null integers the EJS template receives); the dynamic `status`/`search` predicate appending (`webdev.js:67-74`) attaches to the outer `WHERE` unchanged.

#### Bottleneck #3 — Public list endpoints ship full article HTML
**Citation:** `wts-admin/src/routes/public-api.js:36-46` selects `content` (full HTML) for **every** row of the list endpoint, then maps it into the response **twice** — `content` at `public-api.js:65` *and* `full_article_content` at `public-api.js:72`, plus a third derivative `sidebar_content` substring at line 71. With the default `limit` of 50 (`public-api.js:32`), one list call can ship megabytes, with each article's body duplicated in the JSON. The same shape applies to `GET /glossary` (`public-api.js:179-216`), which returns the entire table with `SELECT *` (`public-api.js:183`) and no limit.

**Proposed refactor — backward-compatible additive `fields` param (no default-behavior change):**

```javascript
// public-api.js — additive opt-in slimming; existing consumers unaffected
const SUMMARY_COLUMNS = `id, title, slug, excerpt, featured_image, category, tags,
       seo_title, seo_description, featured, published_url, published_at,
       created_at, updated_at, time_to_read, seo_keywords, word_count`;

router.get('/articles', async (req, res) => {
  const summaryMode = req.query.fields === 'summary';   // ADDITIVE param
  const columns = summaryMode ? SUMMARY_COLUMNS : FULL_COLUMNS; // FULL = current list
  // ... identical query/transform; in summaryMode, omit content,
  // full_article_content and derive sidebar_content from excerpt only
});
```

**Why this is better:** space — list payload drops an estimated 60-90% when consumers opt in (body HTML dominates row size), with proportional TTFB/transfer-time gains for the frontend grid loaders (`js/services/product-loader.js:53`, sidebar fetches). Time — Postgres skips dead-column detoasting for the wide `content` column. Maintainability — the duplicate `content`/`full_article_content` fields are documented for eventual deprecation rather than silently doubled.
**Backward compatibility:** ✅ by construction — default response is byte-identical; only callers passing `fields=summary` see the slim shape. Same pattern applies to `/glossary` via an additive `limit`/`fields` pair.

### Duplication Matrix [createSlug ×3 | comma-parse ×10+ | safe-JSON ×12+ | CRUD edit ×25+]

All four families resolve into one proposed shared module plus one middleware factory (DRY consolidation, ~350-400 lines removable):

1. **Slug generation, 3 independent implementations:** `content.js:22-28` (arrow const), `webdev.js:46-48` (function decl), and four inline copies in `business.js:262, 319, 436, 508` (`name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')`). The regexes differ cosmetically (`/^-+|-+$/g` vs `/(^-|-$)/g`) — same observable behavior today, but they can drift independently.
2. **Comma-list parsing, 10+ sites:** e.g. `content.js:141-142` — `tags ? tags.split(',').map(t => t.trim()).filter(t => t) : []` — repeated for tags/keywords across `content.js:141, 142, 303` ff. and `business.js:138, 176, 318`.
3. **Safe JSON parse with fallback, 12+ sites:** the four consecutive blocks at `content.js:148-163` (schema_markup → null, citations → [], content_labels → {}, audio_files → {}) are the canonical instance; the same try/catch idiom recurs in the glossary and webdev handlers.

```javascript
// PROPOSED: wts-admin/src/utils/text.js (new file — single source of truth)
const createSlug = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const parseCommaList = (str) =>
  str ? str.split(',').map((s) => s.trim()).filter(Boolean) : [];

const safeJsonParse = (str, fallback = null) => {
  if (!str || !str.trim()) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
};

module.exports = { createSlug, parseCommaList, safeJsonParse };
```

After extraction, `content.js:148-163` collapses from 16 lines to 4:

```javascript
const schemaMarkupJson  = safeJsonParse(schema_markup, null);
const citationsArray    = safeJsonParse(citations, []);
const contentLabelsJson = safeJsonParse(content_labels, {});
const audioFilesJson    = safeJsonParse(audio_files, {});
```

4. **`GET /:id/edit` fetch-or-redirect pattern, 25+ copies** across articles, AI tools, glossary, guides, products, pricing, microsites (~200 lines): identical `SELECT … WHERE id = $1` → empty-check → redirect → render → catch-redirect scaffolding. Consolidate into a parameterized middleware factory (`loadEntityOr404(table, listPath)`) that attaches `req.entity`; each route keeps only its render call.

**Why this is better:** maintainability — validation/sanitization rule changes become one-line edits; cyclomatic complexity of the article-create handler (`content.js:138-205`, currently the file's worst with 37 destructured inputs and 14+ inline transforms) drops materially. Time/space — neutral (identical operations, fewer expressions).
**Backward compatibility:** ✅ behavior-preserving by definition — extracted functions are verbatim equivalents of the inlined logic; the regex unification must adopt `/^-+|-+$/g` (the superset form already used in `content.js` and `images.js:112-119`'s `slugifyFilename`, which is a 4th copy of the same idea).

### Dead Code & Dependency Hygiene [Dead middleware: 1 | Unused deps: 1 | Misplaced deps: 1]

- **`logActivity` is dead middleware:** defined at `src/middleware/auth.js:56-80` (writes to `activity_logs`), exported at `auth.js:86`, imported by `images.js:2` and `content.js:3` — **zero call sites anywhere** (verified by grep for `logActivity(`). Consequence: the dashboard's "recent activity" feed (`dashboard.js:50-56` reads `activity_logs`) can only ever show rows written by some other path. Either wire it onto mutating routes or delete it — currently it is misleading weight.
- **`dompurify` (wts-admin/package.json:24) is never `require`d** in any server file; the product form instead loads DOMPurify from jsDelivr (`src/views/business/products/form.ejs:349`, SRI-pinned ✅). Remove the npm dep (or, better long-term, serve it locally and drop the CDN runtime dependency — a deliberate choice for the owner).
- **`striptags` in the *root* `package.json` `dependencies`** is used only by the Node build script `generate-seo-articles.js:1` — never by browser code. Move to `devDependencies` to keep the runtime manifest honest. (`uuid`, `csv-parse`, `sharp`, `escape-html` etc. in wts-admin were each verified as genuinely used — `auth.js:4`, `content.js:10`, `images.js`, `email.js:2`.)

### Legacy Async Patterns [Manual https.request Promises: 3 sites]

- `images.js:64-95` `fetchImageFromCdn`: hand-rolled recursive redirect-follower with callback `https.get` inside a `new Promise` — 4 nesting levels, synchronous `fs.writeFileSync` inside the response handler (blocks the event loop for large images).
- `images.js:145-230` GitHub SHA/push helpers: same callback-in-Promise idiom; failures silently resolve `null`.
- `content.js:456-501` Anthropic call: same idiom (has a 60s timeout at `content.js:498` ✅, but no retry).

**Proposed modernization (Node ≥18 global `fetch` — follows redirects natively):**

```javascript
// images.js — replaces fetchImageFromCdn (images.js:64-95)
async function fetchImageFromCdn(image) {
  if (!image.cdn_url) throw new Error('No CDN URL available');
  const res = await fetch(image.cdn_url, {
    headers: { 'User-Agent': 'WTS-Admin' },
    redirect: 'follow',                          // replaces the manual 3-hop recursion
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`CDN returned ${res.status}`);
  const localPath = localPathFor(image.file_path);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, Buffer.from(await res.arrayBuffer()));
  return localPath;
}
```

**Why this is better:** maintainability — 32 lines → 13, nesting depth 4 → 1, and the function gains a timeout it never had; time — `fs.promises` removes two event-loop-blocking sync calls from a request path.
**Backward compatibility:** ✅ same signature (`image` in, local path out, rejects on failure); redirect cap (fetch defaults to 20, current code 3) only *widens* tolerance.

### Error-Response Consistency [Patterns in use: 3]

Three competing idioms — session-message + redirect (`business.js`), direct `res.render(..., { error })` (`content.js:197-203`), and JSON (`api.js`, `public-api.js` via its `respond()` helper). Recommendation: keep the split by *surface* (HTML admin vs JSON API) but route both through two tiny helpers so status codes and logging are uniform. Low-priority; include in Phase 2.

### Verified Strengths [try/catch balance: 175/175 | Parameterized queries: 100%]

To calibrate the findings above: every query observed uses parameter binding (no SQL-injection surface found); try/catch coverage is complete; `db.js` schema migration runs inside BEGIN/COMMIT; index coverage on hot filters already exists (`idx_articles_status_published_at`, category and glossary indexes); `server.js` layers CSP-with-nonce, helmet, origin-checked CORS, stratified body-size limits, and pre-auth rate limiting correctly. This is a structurally sound codebase carrying excess weight — not a broken one.

---

## Integrations [External Platforms: 8 | Sync Webhooks: 2 | Redundant Deploy Configs: 5]

**Inventory (all citation-verified):** Anthropic Messages API (`content.js:456-501`), GitHub Contents API as image-CDN origin (`images.js:145-230`, served via jsDelivr), Stripe Checkout + webhook (`payments.js`), Google & Facebook OAuth (`src/utils/passport-config.js`), SMTP via Nodemailer (`src/utils/email.js`), n8n/Make telemetry webhook (`webhooks-api.js`), GA4 (`en/index.html:65`, async ✅), Airtable embed (2 pages). Secrets handling is uniformly env-var based (`.env.example` complete; webhook secrets fail closed — `payments.js:110-113` ✅).

### Webhook Decoupling — Validate Sync, ACK Fast, Process Deferred [Affected handlers: 2]

Both inbound webhooks verify signatures correctly — Stripe `constructEvent` at `payments.js:117`, HMAC-SHA256 with `crypto.timingSafeEqual` at `webhooks-api.js:34` — but both then run their database work **inside the provider's request window**. Under DB latency, Stripe times out (~10s) and re-delivers, creating duplicate processing pressure; the telemetry handler's mitigation is to swallow ingest failures with a 200 (`webhooks-api.js:97-102`), trading retry-floods for **silent data loss**.

**Proposed architecture — validation isolated synchronously, immediate `200` ACK terminates the provider connection, execution switches to a deferred macro-task via `setImmediate()` (no new infrastructure):**

```javascript
// payments.js — webhook handler restructured (payments.js:99-162)
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: 'Payment processing is not configured' });

  // 1. SYNCHRONOUS validation — unverifiable senders are rejected in-band
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // 2. IMMEDIATE 200 ACK — terminates Stripe's connection & retry loop
  res.json({ received: true });

  // 3. DEFERRED macro-task — DB work runs after the response is flushed
  setImmediate(async () => {
    try {
      await handleStripeEvent(event);   // existing switch body (payments.js:124-159), extracted
    } catch (err) {
      console.error(`Stripe event ${event.id} (${event.type}) failed post-ack:`, err);
      // event.id logged for replay via Stripe dashboard / `stripe events resend`
    }
  });
});
```

**Why this is better:** time — provider-observed latency becomes O(signature check) instead of O(signature + DB transaction); retry storms under DB degradation disappear. Reliability — the telemetry handler can apply the same shape and return an *honest* 201-on-ack while logging failed batches with their payload hash for replay, instead of masking failures as success. Maintainability — event handling moves to a named function unit-testable without HTTP.
**Backward compatibility:** ✅ Stripe's contract requires only a timely 2xx; the response body/status seen by Stripe is unchanged for valid events and *improved* (faster). Order-status polling by the success page is unaffected — the same UPDATE executes milliseconds later. Failure-visibility trade-off (ack-then-fail) is explicitly mitigated by event-ID logging + Stripe's native event-resend tooling.

### Client Fetch Network Isolation [Unguarded fetches: 8 | Pattern: AbortController]

No frontend `fetch()` carries a timeout signal: `js/modules/firebase.js:122, 194, 270, 329` (form template + 3 submission posts), `js/services/product-loader.js:53, 306, 385`, `js/services/page-sidebar.js:22`. A stalled admin API leaves sockets pinned for the browser default (up to 300s), exhausting the per-origin connection pool and freezing every API-dependent widget on the page. Backend-side, the GitHub helpers (`images.js:145-230`) have **no timeout and no retry** — a transient 502 from api.github.com silently loses an image push (`resolve(null)`).

**Proposed deterministic isolation pattern — every external fetch wrapped with an explicit `AbortController` timeout signal:**

```javascript
// js/modules/api-client.js (new shared frontend module)
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);   // deterministic cleanup — no leaked timers on success
  }
}

// call sites change mechanically, e.g. firebase.js:122
const res = await fetchWithTimeout(`${API_BASE}/form-template/${formType}`);
```

```javascript
// images.js — GitHub calls additionally get bounded exponential backoff
async function githubRequest(path, init, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`https://api.github.com${path}`, {
        ...init, signal: AbortSignal.timeout(10_000),
      });
      if (res.status < 500) return res;          // 4xx is deterministic — don't retry
      throw new Error(`GitHub ${res.status}`);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));  // 1s, 2s
    }
  }
}
```

**Why this is better:** time — worst-case hang drops from browser-default minutes to a bounded 8s, and existing `catch`/fallback paths (e.g., `firebase.js:123` `if (!res.ok) return false` falling back to the static form) now actually trigger promptly; reliability — bounded retry converts transient GitHub 5xx from silent data loss into ~95%+ eventual success without unbounded queue growth.
**Backward compatibility:** ✅ `AbortError` rejections flow into the same `catch` branches that already handle network errors; success paths are byte-identical.

### Payload & Caching Surface [List payloads: full-content | Glossary: unbounded]

Covered as Backend Bottleneck #3 (additive `fields=summary` param, glossary `limit`). Complementary integration-side wins, all additive: `Cache-Control`/ETag headers on the public GET endpoints (the data changes on admin edits, not per-request), and a `<link rel="preconnect" href="https://admin.wordsthatsells.website">` hint on pages that call the API at load.

### Hardcoded Endpoint Configuration [Files: 4]

`API_BASE = 'https://admin.wordsthatsells.website/api/public'` is independently declared in `js/modules/firebase.js:4`, `js/services/product-loader.js` (line 16), `js/services/page-sidebar.js` (line 14), and — as a hardcoded `https://admin.wordsthatsells.website/api/payments/order-status/...` fetch — inline in `en/checkout/success.html:47`. Staging or API migration requires editing four files. Proposed: one `window.WTS_CONFIG = { apiBase: ... }` injected in HTML `<head>` (or a single shared `config.js`), with each module falling back to the current literal — `const API_BASE = window.WTS_CONFIG?.apiBase ?? 'https://admin.wordsthatsells.website/api/public';` — making the change risk-free for existing pages. ✅ Backward compatible via the fallback.

### Deployment Configuration Redundancy [Configs: 5 + CNAME]

`vercel.json`, `netlify.toml`, `.htaccess`, `_redirects`, and `_headers` all encode overlapping rewrite/header rules for the same site, alongside a `CNAME` (GitHub Pages signal) and Railway docs for the backend. Five files asserting the same routing on different platforms guarantees they will drift; only one is live. This audit intentionally does **not** prescribe deletion of any of them. **Confirm active platform via hosting dashboard before any pruning to avoid deployment gaps.**

---

## Phased Remediation Roadmap [Gates: 3 | Test Baseline: 551 lines]

### Phase 1 — Safe Deletions [Risk: minimal]
Delete the verified-orphaned frontend files (`js/a_script.js`, `js/b_en_script.js`, `js/services/content-creation.js`, `js/modules/cdn.js`, `src/` scaffold), the broken `/js/scripts.js` tag in `images/index.html`, the Tailwind toolchain entries, `dompurify` from `wts-admin/package.json`, and relocate root `striptags` to devDependencies. Large root assets move out of the repo (owner-approved).
**Verification gate:** Express boot routine logging inside `wts-admin/test/` (`boot.test.js` — server startup + DB init) validates dependency health after each `package.json` pruning; frontend gate is a link/script-reference crawl of the static pages confirming zero new 404s.

### Phase 2 — Utility Extraction [Risk: low]
Create `src/utils/text.js` (`createSlug`, `parseCommaList`, `safeJsonParse`) and the CRUD `loadEntityOr404` middleware factory; replace inlined copies file-by-file; wire-or-delete `logActivity`.
**Verification gate:** unit-level assertions appended directly within `wts-admin/test/` to protect the new `src/utils/text.js` matrix (slug edge cases incl. the `/(^-|-$)/` vs `/^-+|-+$/` unification, empty/whitespace comma-lists, malformed-JSON fallbacks) **before any extraction occurs in the source code** — explicitly targeting the modules completely unverified by the current 551-line test footprint (`business.js`, `webdev.js`).

### Phase 3 — Query/API Restructuring [Risk: moderate]
Land the dashboard CTE, the microsites set-based rewrite, the additive `fields`/`limit` params on `public-api.js`, the webhook ACK-then-`setImmediate()` decoupling, and the `AbortController` fetch hardening.
**Verification gate:** runtime compliance verified through the backward-compatible additive field params — default responses diffed byte-for-byte against pre-change captures to protect downstream client schemas; `public-api.test.js` and `webhooks.test.js` extended to cover both default and opt-in shapes.

**Roadmap footer — coverage-gap triage against the 551-line baseline:** the existing suite (`auth.test.js` 144, `helpers.js` 194, `webhooks.test.js` 94, `public-api.test.js` 76, `boot.test.js` 43) covers authentication, webhook signatures, and public reads only. **`business.js` (631 lines) and `webdev.js` (878 lines) carry zero test coverage**, as do content CRUD, the glossary CSV import (`content.js` bulk path), image upload/GitHub push, and the Anthropic analysis flow. Phases 2-3 touch exactly these files — the gap list above is the immediate triage order for new assertions before refactors land.

---
*Report generated by static analysis on branch `claude/codebase-optimization-analysis-qgblnl`. All file:line citations verified against the working tree at the audit commit. No application source files were modified.*
