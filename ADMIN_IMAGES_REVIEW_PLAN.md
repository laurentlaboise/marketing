# Admin Image Function — Co-Agent Review & Improvement Plan

**Date:** 2026-07-20 · **Scope:** `wts-admin` dashboard, focused on `/images/` (https://admin.wordsthatsells.website/images/)
**Method:** Dedicated multi-perspective co-agent panel — 5 reviewer roles (admin **user**, **encoder**, **designer**, AI-feature specialist, whole-dashboard analyst), every technical finding adversarially verified by 3 independent lenses (correctness / reproduction / severity), then cross-checked by a completeness critic. 57 agents total; 45 findings confirmed, 0 refuted, 8 additional gaps found by the critic.

---

## 1. Executive summary — why the AI button "isn't improving the images"

**The AI Auto-fill button is working as coded, but it can never do what its labeling implies.** It sits under a card titled **"SEO Optimization"** (`detail.ejs:282-285`), directly beside a separate **"Optimize Image"** card — but the AI button only *writes text* (alt text, title, description, tags) into four form fields via a Claude Vision call (`images.js:1314-1455`). It never touches pixels, file size, or format. The only thing that changes the image file is the other card's `/images/:id/optimize` endpoint (WebP/AVIF compression — which *reduces* size, it does not "improve quality"). No label, help text, or success message explains this split.

Three verified factors reinforce the impression that the button "does nothing":

1. **Expectation gap (root cause).** Two unrelated actions share the word "Optimization"; the AI button's object ("text metadata") is never named.
2. **Large uploads genuinely fail.** The original file is sent to the Anthropic API as raw base64 with **no resize** (`images.js:1321`). Multer accepts 20 MB, but the API rejects images over ~5 MB / 8000 px — so exactly the "I uploaded some images and pressed the button" path can end in a raw API error string in the status box. The in-progress status box is also nearly invisible (~1.4:1 contrast, `--primary-light` token misuse).
3. **Even when it succeeds, nothing observable improves.** The metadata dead-ends in the admin Postgres DB. The purpose-built public endpoint `GET /api/public/images/seo` has **zero consumers** on the static site; the image sitemap is generated from page HTML, not the DB; article images carry stale pick-time copies of alt text. The UI promises "Schema.org markup" and "discoverability in Google, Bing, ChatGPT" — no pipeline delivers it.

The hardcoded model id `claude-sonnet-4-5-20250929` is legacy but still active — **not** the cause.

**Beyond the AI button, the panel confirmed serious data-integrity bugs** in the image function: Rename produces dead CDN URLs (never pushed to GitHub — *critical*), same-format Optimize always fails its CDN push while showing "Optimized!", format-changing Optimize 404s live site pages, Replace breaks its own "URL stays the same" promise, EXIF orientation is dropped (sideways phone photos — a literal "worse quality" outcome), and animated GIFs are silently flattened.

---

## 2. How the review was run (the co-agent panel)

| Role | Mandate |
|------|---------|
| **User** | Walk every image workflow as a non-technical admin; find expectation mismatches, lost work, broken promises |
| **Encoder** | Full correctness/robustness review of `images.js` (1,960 lines), storage, GitHub sync, sharp pipelines, SQL, auth/CSRF |
| **AI-feature specialist** | End-to-end trace of AI Auto-fill: API limits, model id, JSON parsing, timeouts, error surfacing, expectation gap |
| **Designer** | UI/a11y/responsive review of all four image views + shared partials + stylesheet |
| **Dashboard analyst** | Whole-admin sweep: route map, navigation, cross-cutting inconsistencies, reuse opportunities |
| **Verifiers (×3 per technical finding)** | Adversarial refutation: correctness, reproduction, severity |
| **Completeness critic** | "What did the panel miss?" — found 8 gaps, checked contradictions, issued the root-cause verdict |

---

## 3. Findings by theme

### A. The AI Auto-fill feature (the complaint)
- Expectation gap: writes text only; labeling implies image improvement (High).
- No downscale before API call → large uploads fail with raw API errors (Medium-High).
- Multi-upload page (`upload-multiple.ejs`) has **no AI button and no SEO fields at all** — every batch-uploaded image lands with empty alt text (Medium). This is the most likely "I uploaded some images" path.
- Fragile free-text JSON parsing (no forced tool-use), 1024 `max_tokens` with no `stop_reason` check → "Failed to parse AI response" on truncation (Medium).
- 30 s socket timeout can abort legitimate vision calls on multi-MB payloads (Medium).
- Shared 100-req/15-min limiter counted every optimize-preview slider tweak and library navigation; once exhausted the AI button died with `Unexpected token…` because the 429 was text/plain (critic gap). *Fixed in this PR: analyze and optimize-preview now bypass the shared limiter and have dedicated limiters that return JSON 429s.*
- On Railway's ephemeral disk, analyzing a previously uploaded image depends on a fragile jsDelivr re-fetch; bytes are never validated as an image (Medium).
- AI results overwrite existing fields with no undo, and are easily lost before Save (no unsaved-changes guard; the Optimize success message even invites a reload) (Medium).
- Errors show raw Anthropic internals a non-developer cannot act on; the "analyzing…" box is ~1.4:1 contrast (High).

### B. Data integrity (image files vs GitHub/CDN vs DB)
- **Rename never pushes to GitHub** → dead `cdn_url`, broken thumbnails, unrecoverable after redeploy; also silently overwrites an existing file with the target name (Critical).
- **Same-format optimize always fails its GitHub push** (PUT without blob `sha` → 422) while the UI shows a green "Optimized!" (High).
- Format-changing optimize deletes the old file from the repo → hardcoded URLs across the live site 404; deletion happens even when the new file's push failed (High/Medium).
- Replace promises "CDN URL stays the same" while default-on WebP conversion moves the file (High).
- Duplicate-name guard checks only the wiped-on-redeploy local disk (High).
- All sharp pipelines omit `.rotate()` → EXIF orientation dropped, portrait photos come out sideways (High). Animated GIFs flattened to one frame (Medium).
- `bulk-optimize` swallows every CDN failure and always reports success (Medium).
- No cross-entity reference integrity: rename/optimize/replace/destroy never check `products.image_url`, `glossary.featured_image`, `articles.article_images` (critic gap).
- Machine API `seo-upsert`/`seo-bulk` fabricate rows (size 0, fake 1200×628, unfilterable `seo` category) and fuzzy-match by filename suffix — can overwrite the wrong image's SEO fields (critic gap).
- `POST /images/sync` derives categories from directory names outside the UI taxonomy; opening + saving such an image silently reclassifies it to `general` (critic gap).

### C. SEO publishing pipeline (the critic's biggest catch)
- AI metadata never reaches the public site: `/api/public/images/seo` has no consumers; sitemap built from HTML; article alt text is a stale copy.
- `sitemap-images.xml` is regenerated nightly but **never committed** (`localize-site.yml` stages only `th la fr en sitemap.xml`) — Google is fed a frozen image sitemap referenced by `robots.txt` and `sitemap-index.xml`.
- Every image operation is one commit to `main` → full Pages rebuild per file (a 50-file batch ≈ 50 sequential deploys); "View on Web" 404s for minutes after upload.

### D. Interface & accessibility (designer)
- Naming collision "AI Auto-fill" vs "Optimize" (High) — the root-cause fix lives here.
- `--primary-light` used as a background tint is mid-blue → progress boxes, bulk-action bar, active folder ~1.4:1 contrast (High).
- All three dropzones keyboard-inoperable (`display:none` file inputs); hover-only selection checkboxes and folder actions (High/Medium).
- Four competing feedback patterns; ~10 copies of inline-styled status divs, no `aria-live` (Medium).
- Archive promises restorability; no restore UI exists (High). Empty state always says "Upload your first image" even when a filter caused it (Low). Pagination renders every page number (Low). Category badges unstyled (Medium). Library search ignores tags/description — you can't find images by the tags the AI just wrote (Low, but ironic).

### E. Dashboard-wide (beyond images)
- `res.redirect('back')` is dead in Express 5 → form-button flows 404 (High). Error-path redirects to nonexistent `GET /webdev` (Medium).
- Notification bell rendered for all roles but admin-only server-side → permanent unopenable badge for staff (High).
- `req.flash` used but connect-flash not installed → payment confirm/reject feedback vanishes (Medium).
- **Three hand-rolled raw `https.request` Anthropic clients** (images, content, webdev) while four SDK-based lib wrappers with retries already exist; inconsistent models/env knobs; only webdev uses forced tool-use (Medium, architecturally High).
- Image-library picker built for articles but not reused by product/guide/glossary forms (Medium). Silent `LIMIT` truncation on some list pages (Medium). Per-IP rate-limit keying on authenticated surfaces (Low). Stub Settings page, orphaned Notifications page (Low).

---

## 4. The improvement plan

Phases are ordered by user-visible value per unit of risk. Each item lists acceptance criteria (AC).

### Phase 0 — Quick wins (hours, no schema changes)

> **Status: implemented in this PR.** All six items below landed (relabeled cards/microcopy, `--primary-tint`, pre-API downscale, `.rotate()` in every pipeline, dedicated JSON-429 limiters for analyze/preview, Referer-based redirect helper, honest CDN warning).
1. **Split the two "optimizations" in the UI.** Card → "SEO Metadata (text)"; button → "AI: write alt text & tags"; caption: *"Analyzes the image and fills in the text fields below. It does not modify, compress, or improve the image file — use Compress & Convert for that."* Rename the pixel card to "Compress & Convert". AC: a first-time user can predict each button's effect from its label.
2. **Add a real tint token.** `--primary-tint: #eaf4fb`; point the five background usages at it. AC: all status boxes ≥ 4.5:1 contrast.
3. **Downscale before the API call.** In `analyzeImageWithAI`, run `sharp(buffer).rotate().resize({width:1568, height:1568, fit:'inside', withoutEnlargement:true}).jpeg({quality:80})` before base64. AC: a 20 MB upload analyzes successfully; vision cost drops (see §5.5).
4. **`.rotate()` in every sharp pipeline** (upload, optimize, preview, bulk, replace). AC: portrait phone photo survives optimize upright.
5. **Fix `res.redirect('back')` and `/webdev` error redirects; carve `/images/:id/analyze` + `optimize-preview` out of the shared rate limiter** (or key per-user with a higher cap and JSON 429 handler). AC: no 404 after form-button save; slider tweaking can't kill the AI button.
6. **Honest CDN status.** When `cdn_pushed:false`, show a visible warning, not a green "Optimized!". AC: user can tell local-only success from published success.

### Phase 1 — AI feature correctness ("make the button trustworthy")

> **Status: implemented in this PR** (items 1-4, 6, 7 fully; item 5 partially — `ANTHROPIC_MODEL` env with a current-alias default landed for the images route; the app-wide shared client remains Phase 4). Forced strict tool-use replaces free-text JSON parsing; one automatic retry on transient failures; human-actionable error messages with raw detail in a collapsible; 120 s timeout; CDN-rehydrated bytes validated; AI fills only empty fields by default with an overwrite toggle, field flash, and a `beforeunload` unsaved-changes guard.
1. **Forced tool-use structured output** (as `webdev` already does) instead of free-text JSON + fence stripping; check `stop_reason`; raise `max_tokens` to 2048. AC: zero "Failed to parse AI response" in normal operation.
2. **One retry loop** on truncation/parse/5xx (single retry, exponential backoff). AC: transient failures self-heal.
3. **Humanize errors.** Map API errors to actionable copy ("Image too large — it was auto-resized and retried", "AI service unavailable, try again"), keep raw detail in a collapsible. AC: no raw Anthropic internals in the status box.
4. **Timeout to 120 s** (with the downscale from Phase 0 this is rarely hit).
5. **Model + knobs via env** (`ANTHROPIC_MODEL`, default a current alias), shared across the app (see Phase 4).
6. **Validate CDN re-hydrated bytes** are an image (sharp metadata probe) before base64.
7. **Non-destructive fill + unsaved guard.** AI results fill only empty fields by default (toggle to overwrite), fields flash on change, `beforeunload` guard while dirty. AC: generated metadata can't be silently lost or clobbered.

### Phase 2 — Data integrity (files, GitHub, DB agree)
1. **Rename:** fetch bytes (local or old CDN URL), push new path, delete old path (with sha), purge jsDelivr, collision-check target against DB + GitHub, then update DB — mirroring what optimize already does. AC: rename → thumbnail and copied URL work; no silent overwrite.
2. **Same-format optimize:** call `getGitHubFileSha()` and pass sha on update. AC: no more guaranteed-422 pushes. *(Done in this PR — pulled forward so the new honest-CDN warning doesn't fire on every same-format optimize.)*
3. **Ordering:** never delete the old file until the new file's push is confirmed. AC: no CDN-vanished images.
4. **Duplicate-name guard against DB (+ UNIQUE index on `images.file_path`)**, not ephemeral disk.
5. **Replace:** honor "URL stays the same" — re-encode into the existing format by default; explicit opt-in + "URL will change" warning otherwise.
6. **Animated GIF:** `sharp(buffer, {animated:true})` for WebP conversion, or skip conversion with a notice.
7. **Reference-integrity check before destructive ops:** query `products.image_url`, `glossary.featured_image`, `articles.article_images` for the file path; show "used in N places" warning with links; block or cascade-update on confirm. AC: renaming a product image can't silently dead-link the sell path.
8. **Bulk-optimize honesty:** collect per-image CDN failures into the summary message.
9. **Machine API hardening:** exact-match keys (or unique suffix guard), stop fabricating dimensions/`seo` category, align category taxonomy between sync, machine API, and the UI dropdown.
10. **Archive:** add Archived filter + Restore action (or change the copy).

### Phase 3 — Make the SEO actually ship (close the loop to the site)
1. **Consume `/api/public/images/seo` at build time:** a build step fetches the metadata map and injects alt/title into generated pages, ImageObject JSON-LD, and the image sitemap. Precondition: make the endpoint's lookup deterministic — exact `image_id` or canonical `cdn_url` match, rejecting ambiguous results — since its current LIKE/filename matching can return a colliding image's metadata to a build-time consumer. AC: metadata edited in admin is observable in deployed HTML, and a lookup never resolves to a different image than intended.
2. **Commit `sitemap-images.xml`** in `localize-site.yml` (add it to the `git add` line). AC: nightly sitemap actually updates.
3. **Refresh article image alt text at render/build** from the DB instead of stale pick-time copies.
4. **Batch the GitHub pushes:** queue file operations and commit via the Git Trees API (one commit per batch); add a path filter or `[skip ci]` strategy so a 50-file upload is 1 deploy, not 50. AC: batch upload = one commit, one deploy.
5. **"View on Web" honesty:** show deploy-pending state (check jsDelivr first, Pages after).

### Phase 4 — Interface & architecture coherence
1. **One shared Anthropic client lib** (SDK, retries, env-config model, forced tool-use) replacing the three hand-rolled clients; images, content, webdev migrate to it. This fixes the AI button's fragility class-wide.
2. **One feedback component** (EJS partial + `aria-live="polite"`), replacing the ~10 inline status divs and 4 patterns.
3. **Keyboard a11y:** visually-hidden (not `display:none`) file inputs; dropzones `tabindex="0" role="button"` with Enter/Space; focus-visible selection checkboxes; folder actions reachable without hover.
4. **Batch upload parity:** per-image metadata drawer + AI assist (see §5 multi-loop) on `upload-multiple.ejs`.
5. **Reusable image-picker partial** for product/guide/glossary forms (extracted from the article form).
6. **Library search over tags + description**; filter-aware empty states; windowed pagination; styled category badges.
7. Dashboard hygiene: role-aware notification bell, install or remove `connect-flash`, per-user rate-limit keying, real pagination for truncated lists, prune stub/orphan nav entries.

### Phase 5 — Verification loop (definition of done)
- Playwright smoke pass over: upload → AI fill → save → rename → optimize → replace → archive → restore, asserting DB/CDN/GitHub agreement after each step.
- Re-run the co-agent panel (same workflow, cached prompts) after Phases 0-2 and diff the findings list — the review itself is a loop; exit when critical/high count is zero.

---

## 5. AI pipeline design — loops, multi-loops, vertical memory, tagging, token efficiency

This section is the requested technique blueprint: highest quality at the lowest token burn.

### 5.1 Single-image loop (generate → validate → repair)

```text
downscale(1568px) → vision call (forced tool-use, schema) → validate
  ├─ alt_text 60–125 chars? title non-empty? 4–8 lowercase tags? description 1–2 sentences?
  ├─ pass → present to user (fill-empty-only by default)
  └─ fail → ONE repair call: send only the failed fields + validation errors
            (text-only, no image re-send → ~50× cheaper than a full retry)
```
Never more than one repair iteration; a second failure surfaces to the user. Bounded loops, no runaway burn.

### 5.2 Multi-loop for the library (batch/backfill)
Nightly or on-demand "SEO sweep" over the whole library, structured as three passes so each pass is cheap and resumable:
1. **Discover (0 AI tokens):** SQL for images with empty/short alt text, missing tags, or `content_hash` changed since last analysis.
2. **Generate (the only paying pass):** submit the worklist via the **Message Batches API** (50 % discount, no latency pressure); one item per image, downscaled.
3. **Verify + publish (cheap):** validate outputs (code, 0 tokens); optionally a single Haiku call per *batch* (not per image) to sanity-scan tag vocabulary drift; write to DB with `status='ai_generated'` for human review in a library filter.

The two loops nest: the batch loop invokes the single-image loop's validator, and only failed items re-enter pass 2 on the next sweep — a converging multi-loop, not an endless one.

### 5.3 Vertical memory (layered, persistent — pay for context once)

| Layer | Contents | Storage | Token effect |
|-------|----------|---------|--------------|
| L0 Brand | Site identity, audience, tone, target keywords ("digital marketing agency, Laos/SEA…") | Static system prompt | **Prompt-cached** — written once, ~90 % discount on every call |
| L1 Category | Per-category guidance (hero vs logo vs article images want different alt-text styles) + top 30 canonical tags | `image_categories` table → appended to system prompt | Cached with L0 |
| L2 Image | `content_hash`, last analysis, model used, validation verdict, human edits | `images` table columns | **Memoization:** unchanged hash ⇒ 0 tokens (skip the call entirely) |
| L3 Feedback | Diffs between AI output and human-edited final values | `image_ai_feedback` table | Periodically distilled (one small job) into L1 guidance — the system learns without fine-tuning |

"Vertical" = each call reads down the stack (L0→L2) for grounded context, and human corrections flow back up (L3→L1). The content-hash memo at L2 is the single biggest burn reduction: re-clicking the button on an unchanged image costs nothing.

### 5.4 Tagging system
- **Controlled vocabulary:** seed `tags` reference table from existing usage; the AI prompt receives the top canonical tags (L1) and must prefer them, inventing new ones only when nothing fits (new ones land as `proposed` for admin approval).
- **Search integration:** library search extends to `tags @> / ILIKE` and description (fixes the confirmed finding).
- **Tag-driven reuse:** the shared image-picker filters by tag; sitemap/schema generation groups by tag.
- **Category taxonomy unification** (UI dropdown = sync route = machine API) so tagging isn't undermined by phantom categories.

### 5.5 Token & cost budget

| Technique | Effect |
|-----------|--------|
| Downscale to ≤1568 px before vision | Largest single saving — vision tokens scale with pixels; also fixes the 5 MB failures. ~1600 tokens/image vs 6000+ |
| Prompt caching (L0+L1 system prompt) | ~90 % off the static prefix on every call |
| Content-hash memoization | Repeat analyses: 0 tokens |
| Batch API for sweeps | 50 % off all backfill work |
| Model routing | Sonnet (current alias) for full analysis; Haiku for tag-only refresh and batch sanity scans |
| Text-only repair loop | Failed validations never re-send the image |
| Forced tool-use output | No parse-failure retries (today's silent double-spend) |

Order-of-magnitude: full-library backfill of ~330 images ≈ one batch run at roughly the cost of a dozen of today's unresized single calls.

---

## 6. Appendix — full confirmed findings (45)

| # | Severity | Lens | Finding | Location | Effort |
|---|----------|------|---------|----------|--------|
| 1 | Critical | User | Rename File produces a dead CDN URL: the renamed file is never pushed to GitHub, so thumbnails break and copied URLs 404 | `wts-admin/src/routes/images.js:1629` | M |
| 2 | High | Dashboard | res.redirect('back') is dead in Express 5 — form-button add/update/delete lands admins on a 404 | `wts-admin/src/routes/webdev.js:1503` | S |
| 3 | High | Dashboard | Notification bell is admin-only server-side but rendered for every role — workers see a badge they can never open | `wts-admin/src/routes/api.js:177` | M |
| 4 | High | Designer | "AI Auto-fill" vs "Optimize" naming collision — users expect the AI button to improve image quality | `wts-admin/src/views/images/detail.ejs:283` | S |
| 5 | High | Designer | --primary-light token is a mid-blue, making AI progress boxes, bulk-action bar, and active folder item ~1.4:1 contrast | `wts-admin/public/css/style.css:9` | S |
| 6 | High | Designer | All three upload dropzones are keyboard-inoperable (file inputs are display:none, dropzones are click-only divs) | `wts-admin/src/views/images/upload.ejs:41` | M |
| 7 | High | Encoder | Rename never syncs to GitHub/CDN — cdn_url points at a nonexistent file and the image becomes unrecoverable after redeploy | `wts-admin/src/routes/images.js:1627` | M |
| 8 | High | Encoder | Same-format optimize always fails its CDN push (GitHub PUT without sha → 422) while DB/UI claim success | `wts-admin/src/routes/images.js:1109` | S |
| 9 | High | Encoder | All sharp pipelines drop EXIF orientation without applying it — portrait phone photos come out sideways after 'optimization' | `wts-admin/src/routes/images.js:963` | S |
| 10 | High | Encoder | Duplicate-name guard checks only the ephemeral local disk — after a redeploy, uploads collide with existing CDN files (422 push, two DB rows aliasing one file) | `wts-admin/src/routes/images.js:130` | M |
| 11 | High | User | "AI Auto-fill" under the "SEO Optimization" heading never improves the image itself, and no label, help text, or success message says so | `wts-admin/src/views/images/detail.ejs:284` | S |
| 12 | High | User | Optimize with a format change silently 404s the live website: the old file is deleted from the repo while site HTML hardcodes the old URL | `wts-admin/src/routes/images.js:1112` | M |
| 13 | High | User | Replace Image promises "The CDN URL stays the same" but the default-checked Optimize converts to a new URL and the live site keeps showing the old image | `wts-admin/src/views/images/detail.ejs:129` | M |
| 14 | High | User | Archive claims the image "can be restored" but there is no way to see or restore archived images anywhere in the UI | `wts-admin/src/routes/images.js:1819` | M |
| 15 | Medium | AI feature | Expectation gap: 'AI Auto-fill' only writes SEO text metadata, never improves image quality — the owner's exact complaint | `wts-admin/src/routes/images.js:1444` | S |
| 16 | Medium | AI feature | Original image sent as unresized base64; multer accepts 20MB but the Anthropic API rejects images over ~5MB/8000px, surfacing a raw API error | `wts-admin/src/routes/images.js:1321` | S |
| 17 | Medium | AI feature | Multi-upload page has no AI Auto-fill (or any SEO fields) — feature inconsistency on the most likely 'uploaded some images' path | `wts-admin/src/views/images/upload-multiple.ejs:73` | M |
| 18 | Medium | AI feature | Analyze for previously uploaded images depends on fragile CDN re-hydration (Railway ephemeral disk): missing cdn_url 404s and fetched bytes are never validated as an image | `wts-admin/src/routes/images.js:1427` | M |
| 19 | Medium | AI feature | Fragile free-text JSON parsing of the model reply — no structured output, only start/end fence stripping | `wts-admin/src/routes/images.js:1399` | M |
| 20 | Medium | AI feature | 30s socket timeout can abort legitimate vision requests, especially with multi-MB unresized payloads | `wts-admin/src/routes/images.js:1411` | S |
| 21 | Medium | Dashboard | req.flash used but connect-flash is not installed — payment confirm/reject feedback silently vanishes | `wts-admin/src/routes/business.js:886` | S |
| 22 | Medium | Dashboard | Hand-rolled Anthropic HTTP client duplicated in three routes while the SDK and four lib wrappers already exist | `wts-admin/src/routes/webdev.js:1120` | L |
| 23 | Medium | Dashboard | Image-library picker built once for articles, not reused by product/guide/glossary forms | `wts-admin/src/views/business/products/form.ejs:424` | M |
| 24 | Medium | Dashboard | List pages silently truncate at hardcoded LIMITs while other sections paginate | `wts-admin/src/routes/business.js:913` | M |
| 25 | Medium | Dashboard | Error-path redirects target GET /webdev, which has no route and 404s | `wts-admin/src/routes/webdev.js:1585` | S |
| 26 | Medium | Designer | Hover-only controls: grid selection checkboxes invisible on keyboard focus; folder rename/delete unreachable by keyboard | `wts-admin/public/css/style.css:2954` | S |
| 27 | Medium | Designer | Four competing feedback patterns; the inline status box is duplicated ~10 times with a hardcoded Bootstrap palette and no aria-live | `wts-admin/src/views/images/detail.ejs:587` | M |
| 28 | Medium | Designer | Category badges are unstyled — .status-badge has no rules for hero/portfolio/logos/articles/og/icons/general | `wts-admin/src/views/images/library.ejs:221` | S |
| 29 | Medium | Designer | AI Auto-fill silently overwrites existing SEO fields with no undo, and the resulting unsaved state is easy to lose | `wts-admin/src/views/images/detail.ejs:577` | M |
| 30 | Medium | Encoder | Format-change optimize deletes the old file from GitHub even when the new file's push failed — image vanishes from the CDN | `wts-admin/src/routes/images.js:1112` | S |
| 31 | Medium | Encoder | AI analyze sends the full-size original to the Anthropic API with no size/dimension guard — large uploads always fail analysis | `wts-admin/src/routes/images.js:1321` | S |
| 32 | Medium | Encoder | Animated GIFs are silently flattened to a single frame by the default 'Optimize to WebP' path | `wts-admin/src/routes/images.js:954` | S |
| 33 | Medium | Encoder | bulk-optimize swallows every CDN failure, never removes superseded old-format files from GitHub, and always reports success | `wts-admin/src/routes/images.js:1282` | M |
| 34 | Medium | User | Batch upload has no AI Auto-fill and no per-image metadata — every image lands with empty alt text and a warning badge | `wts-admin/src/routes/images.js:880` | L |
| 35 | Medium | User | AI Auto-fill sends the full-size original to the API with no downscaling, so large uploads fail with a raw API error | `wts-admin/src/routes/images.js:1321` | S |
| 36 | Medium | User | AI-generated metadata is easily lost before saving: no unsaved-changes guard, and the Optimize success message invites a page reload that wipes it | `wts-admin/src/views/images/detail.ejs:687` | S |
| 37 | Low | AI feature | Hardcoded legacy model id 'claude-sonnet-4-5-20250929' — currently valid, but a retirement will surface a raw 404 to the admin | `wts-admin/src/routes/images.js:1333` | S |
| 38 | Low | Dashboard | Rate limiters key per-IP on admin surfaces despite the codebase's own shared-NAT finding | `wts-admin/server.js:290` | S |
| 39 | Low | Dashboard | Profile email change has no validation, uniqueness handling, or re-verification | `wts-admin/src/routes/dashboard.js:126` | S |
| 40 | Low | Dashboard | Navigation dead ends: stub Settings page pinned in nav, orphaned Notifications page, stale sidebar keys | `wts-admin/src/views/dashboard/settings.ejs:20` | S |
| 41 | Low | Designer | Empty state always says "Upload your first image" even when emptiness is caused by a search/category/folder filter | `wts-admin/src/views/images/library.ejs:288` | S |
| 42 | Low | Designer | Pagination renders every page number; overflows on mobile for large libraries | `wts-admin/src/views/images/library.ejs:274` | S |
| 43 | Low | Encoder | 'Prefer first-party CDN' save fabricates 1200x628 dimensions for images with unknown size | `wts-admin/src/routes/images.js:1574` | S |
| 44 | Low | Encoder | Reupload without optimize replaces bytes in-place but keeps the old extension — content/extension/MIME mismatch served from the CDN | `wts-admin/src/routes/images.js:1673` | S |
| 45 | Low | User | Library search ignores tags and description, so images can't be found by the tags the AI just wrote | `wts-admin/src/routes/images.js:597` | S |

### Critic gaps (8) — not in the panel table above
1. AI SEO metadata has no pipeline to the static site (`/api/public/images/seo` unconsumed).
2. `sitemap-images.xml` regenerated nightly but never committed (`localize-site.yml`).
3. Machine API `seo-upsert`/`seo-bulk`: fabricated rows, fuzzy matching can hit the wrong image.
4. No cross-entity reference integrity for products/glossary/articles on destructive image ops.
5. Rename silently overwrites an existing target file (collision, data loss).
6. Rate-limiter starvation + `max_tokens` truncation + double-upload on `analyze-upload` — three unexamined AI-button failure modes. *(Limiter starvation fixed in this PR; truncation and double-upload remain open for Phase 1.)*
7. One-commit-per-file → full Pages rebuild per image; "View on Web" 404s until deploy lands.
8. `POST /images/sync` category drift (`products` etc.) silently reclassified to `general` on save.
