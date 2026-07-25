# FAQ Backend Migration — Audit & Implementation Plan

Audit of the current FAQ implementation and a production-ready plan to move
FAQ content into the existing wts-admin backend: editor-managed, multilingual,
crawlable, schema-consistent, with the accordion UX and the "Ask another
question" interaction preserved.

---

## 1. Assumptions

- GitHub Pages serves the **committed source HTML** (same constraint that
  shaped the footer bake and the `/th /la /fr` localization mirrors), so
  anything that must be crawlable/translatable has to be baked into the
  source files, not fetched at runtime.
- wts-admin (Express + Postgres on Railway) is the system of record for
  editor-managed content, with two proven publish→site patterns already in
  production:
  - **Footer**: admin publishes → commits `footers.json` → `footer-sync.yml`
    runs `scripts/inject-footers.js --source` → bakes HTML into every page.
  - **Translations**: `en/**` synced to `site_pages.segments` →
    `translations` rows (AI batch th/fr, vendor la) → publish →
    `localize-site.yml` → `scripts/generate-localized-pages.js` regenerates
    the language mirrors. Nightly self-heal run.
- The FAQ plan below reuses both patterns rather than inventing a new
  delivery mechanism.

---

## 2. Current problems (audit findings)

### 2.1 Four independent FAQ implementations, three copies of the data

| Where | Data | Rendering |
|---|---|---|
| `js/modules/faq.js` (used via `js/main.js`) | 104 hardcoded English Q&As | Keeps server-rendered items if present; "Ask another question" injects random items client-side |
| `{en,fr,th}/resources/index.html` inline `<script>` | Separate hardcoded 10-item English array | Fully client-rendered into an **empty** `#faq-list`, shuffled on every load |
| `en/digital-marketing-services/index.html` (`svc-faq`) | Static HTML `<details>` | Server-rendered, own JSON-LD — the healthiest pattern, but disconnected from the rest |
| `js/a_script.js`, `js/b_en_script.js` | Full duplicated arrays | **Dead code** — no HTML references either file |

Editing or translating a question means finding it in up to three places.

### 2.2 Translation failures (root causes, confirmed in code)

1. **The injected FAQs bypass the translation pipeline entirely.**
   `js/modules/faq.js:5-109` is an English-only array injected verbatim on
   every language. On `/fr/` the button label is translated
   ("Poser une autre question", `fr/index.html:467`) but every question it
   adds is English.
2. **Pages with an empty `#faq-list` are 100 % untranslated *and*
   uncrawlable.** All four service subpages
   (`*/digital-marketing-services/{web-development,social-media-management,content-creation,business-tools}/index.html`)
   ship `<div id="faq-list"></div>` with no children — the entire FAQ is
   client-rendered English on every language. Because
   `sync-site-pages` extracts segments from **static** HTML, these FAQs
   never even enter the `translations` queue: there is nothing for a
   translator to translate. Same for the `resources/` pages.
3. **FAQPage JSON-LD is not localized.** `fr/index.html:168-209` and
   `th/index.html` carry the *English* questions/answers in JSON-LD while
   the visible accordion is French/Thai. `scripts/lib/html-l10n.js`
   translates visible segments and rewrites `inLanguage`, but does not
   rewrite FAQPage `mainEntity`. Structured data that doesn't match the
   visible content risks being ignored (or worse, flagged) by Google.
4. **Static homepage FAQs are the only healthy path.** The 6 `<details>`
   blocks in `en/index.html:441-465` are synced, translated, and correctly
   French in `fr/index.html:439-463` — proof the pipeline works when
   content is static HTML. The whole fix is to route *all* FAQ content
   through that path.

### 2.3 SEO weaknesses

- Client-only FAQs (service + resources pages) are invisible to crawlers
  and to the `Ask another question` content is invisible too (acceptable —
  see §4).
- JSON-LD ↔ visible content mismatches: language mismatch on `/fr` `/th`
  (above), and on `en/index.html` the JSON-LD lists 5 questions while the
  page renders 6 (the privacy/legal one — the one that contains internal
  links — is missing from schema).
- Random order on the client-rendered pages means every crawl sees a
  different 5-question subset in a different order — no stable content for
  indexing, and no internal links since the hardcoded answers are
  plain text (the static homepage privacy answer is the only one with
  `<a href>` links).
- The 104-question pool exists nowhere in crawlable form; ~95 % of the
  written FAQ content is invisible to search engines.

### 2.4 Maintainability

- Content lives in JS string literals — editors must edit code, cannot
  reorder/target per page, and cannot add links without HTML-in-JS.
- No categories, no per-page targeting (every page gets a random slice of
  the same generic pool, so the web-development page can show
  fintech questions).

---

## 3. Recommended architecture

**FAQ as admin-managed content, baked to static HTML at publish** — the
footer pattern for delivery, the translations pattern for languages.

```
wts-admin (Postgres)
  faq_categories ─┬─ faqs (canonical EN, answer_html with internal links)
                  └─ faq_placements (page ⇄ faq, pinned flag, sort order)
        │  translations rows (entity_type='faq' | 'faq_category') —
        │  same AI/vendor/publish flow
        ▼
  Admin UI: CRUD + per-page placement + translation workspace (existing)
        │  Publish → commit faqs.json + fire faq-sync workflow
        ▼
  scripts/inject-faqs.js --source        (new; sibling of inject-footers.js)
    ├─ renders pinned FAQs as <details> into #faq-list of every assigned
    │  page, per language, translated
    ├─ regenerates FAQPage JSON-LD to exactly match the rendered items
    └─ embeds the page's full localized FAQ pool as a
       <script type="application/json" id="faq-pool"> data island
        ▼
  js/modules/faq.js (slimmed)
    ├─ no hardcoded data — reads #faq-pool
    ├─ keeps server-rendered items (already does this)
    └─ "Ask another question" appends random *localized* items from the pool
```

Why this shape:

- **Zero new runtime infrastructure.** The site stays static; no fetch on
  page load, no CORS, no admin uptime dependency for site visitors. The
  admin API being down affects publishing, never rendering.
- **Crawlable and JS-free by construction.** Pinned FAQs are real HTML;
  `<details>/<summary>` opens natively with JavaScript disabled.
- **Translation-correct by construction.** The generator writes the
  translated question/answer *and* the matching JSON-LD in one pass, so
  visible content and schema can never diverge again.
- **Editor control end to end**: create/edit/archive questions, categorize,
  assign to pages, pin/order the crawlable set, add internal links in a
  rich-text answer field — all without touching code.
- A later move to SSR/Next.js would keep the same tables and API untouched;
  only the bake step would be replaced by server rendering.

### Public API additions (wts-admin `src/routes/public-api.js`)

```
GET /api/public/faqs?lang=en|th|la|fr        → published FAQs + categories
GET /api/public/faqs/placements              → page→faq map (pinned, order)
```

Published-only, cached, same conventions as `/api/public/footer` and
`/api/public/translations/:lang/page`. `?lang=` takes the site's internal
directory codes (`la`, not `lo` — see the canonical locale mapping in §5).
The generator consumes these; the
committed `faqs.json` snapshot is the offline fallback (mirrors the
`--payloads` flag of `generate-localized-pages.js`).

---

## 4. SEO considerations

### Randomized order: keep the interaction, stop randomizing the crawlable set

Verdict: **random order for server-rendered content is a net negative;
random *extras* behind a user interaction are harmless.**

- Googlebot renders JS, but each crawl of a client-randomized page sees a
  different subset/order → unstable content signatures, diluted relevance,
  and impossible JSON-LD parity. Content behind a click ("Ask another
  question") is simply not indexed — which is fine, because the same
  content should be crawlable somewhere stable instead.
- Recommended split:
  - **Pinned set (5–8 per page)**: editor-ordered, server-rendered,
    identical on every load, mirrored 1:1 in FAQPage JSON-LD. This is the
    SEO surface.
  - **Discovery pool**: everything else assigned to the page ships in the
    `#faq-pool` data island; "Ask another question" draws from it
    randomly. The playful randomness the site has today survives here.
  - Optional compromise if some visible shuffle is wanted: keep the *first*
    pinned item fixed (`open` attribute today) and let JS shuffle only the
    *display order* of the remaining pinned items after load. Content and
    schema stay stable; only cosmetic order varies. Recommended default:
    don't shuffle pinned items at all.
- **Long-tail play**: with 100+ answers in one pool, add a dedicated
  crawlable FAQ hub page per language (`/{lang}/resources/faq/`, sections
  by category, all questions server-rendered, one FAQPage JSON-LD). Turns
  the invisible 95 % of the content into an indexable asset and a natural
  internal-linking hub. Phase 2 — the model above already supports it
  (a placement for the hub path with everything pinned).

### Structured data rules the generator enforces

- FAQPage `mainEntity` = exactly the pinned items actually rendered on that
  page — same language, same text (tags stripped for the `Answer.text`),
  same order. Untranslated items never enter a localized page's schema
  because they never render there (fallback policy, §5).
- One FAQPage block per page; `inLanguage` matches `<html lang>`.
- Internal links inside answers are plain `<a href>` in the HTML answer —
  crawlable link equity (Google also accepts limited HTML incl. `<a>` in
  `Answer.text`).
- Everything embedded in a `<script>` element — the FAQPage JSON-LD and the
  `#faq-pool` data island — is serialized with an HTML-safe JSON encoder:
  `<`, `>`, `&` emitted as the JSON escapes `\u003c`, `\u003e`,
  `\u0026`, and U+2028/U+2029 emitted as `\u2028`/`\u2029`.
  Tag-allowlist sanitization of `answer_html` does **not** cover this: a
  literal `</script>` inside answer text would otherwise terminate the
  script element. Regression tests feed hostile strings (`</script>`,
  `<!--`, U+2028) through both serialization paths.
- Note: since 2023 Google shows FAQ rich results mostly for
  government/health sites, but FAQPage remains valid, feeds AI
  Overviews/answer engines, and costs nothing here since it's generated.

### Semantic markup (current pattern, kept and hardened)

```html
<section class="section" aria-labelledby="faq-title">
  <h2 id="faq-title">Frequently Asked Questions</h2>
  <div id="faq-list" class="accordion-container">
    <details class="accordion-item" id="faq-client-onboarding" open>
      <summary class="accordion-summary">
        <h3>What does client onboarding look like?</h3>
        <i class="fas fa-chevron-down icon" aria-hidden="true"></i>
      </summary>
      <div class="accordion-content">
        <p>Onboarding starts with a kickoff call … see our
           <a href="/en/company/contact-us/">contact page</a>.</p>
      </div>
    </details>
    …
  </div>
</section>
```

- `<details>/<summary>` = free keyboard support, no-JS operation, and
  `hidden=until-found` semantics in Chromium (in-page find opens the item).
- `id` on each item (from the FAQ `slug`) → deep-linkable anchors
  (`/en/#faq-client-onboarding`) usable in internal links from articles.
- Answer container becomes a `<div>` so answers can hold multiple
  paragraphs/lists/links (today's single `<p>` limits rich answers).
- Decorative chevron gets `aria-hidden="true"`.

---

## 5. Translation considerations

- **Canonical locale mapping (Lao).** One rule, owned by a single shared
  helper in the injector: internal keys everywhere — API `?lang=`,
  `faqs.json` payload keys, `translations.target_language`,
  placement-derived paths — use the site's directory codes `en|th|la|fr`
  (the existing `generate-localized-pages.js --langs th,la,fr`
  convention). Only HTML-facing output maps `la → lo`: `<html lang>`,
  `hreflang`, `lang` attributes on injected elements, and JSON-LD
  `inLanguage`. A unit test asserts a Lao page resolves `la` payload keys
  and emits `lo` markup — so Lao can never silently fall back to English
  because a `lo` key was looked up in a `la`-keyed snapshot.
- **Reuse the `translations` table as-is** — it is already generic. Two
  entity types:
  - `entity_type='faq'`, `entity_id=faqs.id`,
    `content_payload = {"question": …, "answer_html": …}`;
  - `entity_type='faq_category'`, `entity_id=faq_categories.id`,
    `content_payload = {"name": …, "description": …}` (surfaces in the
    admin UI and on the phase-2 hub page; regular page FAQ sections never
    render category names).
  Both use `source_hash` over the English source (auto re-queues a
  re-translation when an editor edits the English) and the same
  pending → AI batch (th/fr) / vendor workspace (la) → approve → publish
  states, payout ledger included for the Lao vendor.
- **Fallback policy — pinned vs. pool.** A pinned item on a non-English
  page requires a **published** translation: an untranslated pinned item
  is withheld from that language's rendered set *and* its JSON-LD (the
  next translated pinned item takes the slot; the admin placements view
  warns when a language's pinned set runs short). Visible content,
  schema, and `inLanguage` therefore always agree — no mixed-language
  structured data. The discovery pool *may* fall back to English so "Ask
  another question" never runs dry, but a fallback entry carries its real
  locale in the data island and is injected with `lang="en"` on the
  `<details>`; pool items are never part of FAQPage JSON-LD in any
  language.
- **Link localization**: `inject-faqs.js` reuses the existing
  `html-l10n.js` link rewriting so `/en/...` hrefs inside answers become
  `/fr/...` etc. on mirrors — editors always author links against `/en/`.
- **JSON-LD localization** comes free: the generator builds schema from the
  same localized payload it renders.
- The current `#faq-list`-empty pages start working the day they get
  placements: the bake writes real translated HTML into them.

---

## 6. Suggested data structure

Boot-DDL additions to `wts-admin/database/db.js` (same idempotent
`CREATE TABLE IF NOT EXISTS` style):

```sql
CREATE TABLE IF NOT EXISTS faq_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(120) UNIQUE NOT NULL,   -- 'seo', 'onboarding', 'pricing'
  name        VARCHAR(255) NOT NULL,          -- English; translated via translations table
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'active',   -- active | archived
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES faq_categories(id) ON DELETE SET NULL,
  slug        VARCHAR(160) UNIQUE NOT NULL,   -- stable anchor: 'client-onboarding'
  question    TEXT NOT NULL,                  -- canonical English
  answer_html TEXT NOT NULL,                  -- sanitized rich text; <a>,<p>,<ul>,<li>,<strong>,<em>
  status      VARCHAR(20) DEFAULT 'draft',    -- draft | published | archived
  sort_order  INTEGER DEFAULT 0,              -- default order within category
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_faqs_status_cat ON faqs (status, category_id);

-- Which questions appear on which page, and how.
CREATE TABLE IF NOT EXISTS faq_placements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path   VARCHAR(300) NOT NULL,          -- '/en/', '/en/digital-marketing-services/web-development/'
  faq_id      UUID NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  pinned      BOOLEAN DEFAULT FALSE,          -- pinned ⇒ server-rendered + in JSON-LD
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (page_path, faq_id)
);
CREATE INDEX IF NOT EXISTS idx_faq_placements_page ON faq_placements (page_path);
```

Translations: one row per (faq, language) in the existing `translations`
table — no schema change:

```jsonc
// translations.content_payload for entity_type='faq', target_language='fr'
{
  "question": "À quoi ressemble l'intégration des clients ?",
  "answer_html": "<p>L'intégration commence par un appel de lancement … <a href=\"/en/company/contact-us/\">contact</a>.</p>"
}

// translations.content_payload for entity_type='faq_category', target_language='fr'
{
  "name": "Intégration",
  "description": "Questions sur le démarrage d'une collaboration."
}
```

Published snapshot committed to the repo (`faqs.json`, sibling of
`footers.json`) — what `inject-faqs.js` consumes:

```jsonc
{
  "generated_at": "2026-07-25T00:00:00Z",
  "categories": [{ "slug": "onboarding", "name": { "en": "Onboarding", "fr": "Intégration" } }],
  "faqs": [
    {
      "slug": "client-onboarding",
      "category": "onboarding",
      "question":    { "en": "What does client onboarding look like?", "fr": "À quoi ressemble…", "th": "…" },
      "answer_html": { "en": "<p>…</p>", "fr": "<p>…</p>" }
      // keys are internal locale codes (en|th|la|fr). A missing key ⇒ the
      // item is withheld from that language's pinned set/JSON-LD; in the
      // pool it may fall back to EN, tagged with its real locale (§5).
    }
  ],
  "placements": {
    "/en/": { "pinned": ["services-laos", "client-onboarding", "…"], "pool": ["…all other slugs…"] },
    "/en/digital-marketing-services/web-development/": { "pinned": ["…"], "pool": ["…"] }
  }
}
```

(Placements are keyed by the `/en/` path; the generator derives `/th /la
/fr` automatically, exactly like the localization mirrors.)

---

## 7. Example implementation plan

Phased so every step ships working and the current behavior never breaks.

**Phase 0 — cleanup (no behavior change)**
1. Delete dead `js/a_script.js` and `js/b_en_script.js` (verified: no HTML
   references them).
2. Replace the inline FAQ script + array in `{en,fr,th}/resources/index.html`
   with the shared `js/main.js` module path.

**Phase 1 — backend (wts-admin)**
3. Add the three tables to the boot DDL; seed with a one-off script that
   imports the 104 questions from `js/modules/faq.js` + the 10 from the
   resources array (dedup by question text; slugs generated with the
   existing slugify helper) into `faqs` with sensible categories, and
   creates placements matching today's static pages (current homepage
   items → pinned in current order).
4. Admin CRUD following the glossary/articles conventions
   (`src/routes/content.js` + EJS views): list w/ search + category filter,
   create/edit form with a sanitized rich-text answer editor
   (allowlist: `a[href] p ul ol li strong em br`; internal-link picker that
   inserts site URLs), archive/delete, drag sort. A "Placements" tab per
   FAQ (or per page) manages page assignment, pinned flag, order.
5. Public API: `GET /api/public/faqs` (+`?lang=`) and
   `GET /api/public/faqs/placements`, published-only, following
   `public-api.js` conventions.
6. Wire `entity_type='faq'` and `entity_type='faq_category'` into the
   translation workspace list/filters and the AI batch (th/fr) — the
   workspace and payout flow are already generic.

**Phase 2 — bake pipeline (site repo)**
7. `scripts/inject-faqs.js` (modeled on `inject-footers.js`): for each page
   with a placement and each existing language mirror, rewrite the region
   between `<!-- faq:start -->` / `<!-- faq:end -->` markers (added around
   `#faq-list` sections): pinned `<details>` items in the page language,
   matching FAQPage JSON-LD (replacing any hand-written FAQPage block), and
   the `#faq-pool` data island (pool items only, localized). Error
   contract — stricter than the footer injector, because a partial bake
   means inconsistent content *and schema* across languages: a page
   without FAQ markers is simply not targeted (skipped, like footer-less
   pages); malformed `faqs.json` aborts before any write; any error on a
   *targeted* page fails the whole run. The injector stages all output
   and writes only when every targeted page/language succeeded, exiting
   nonzero otherwise so the workflow never commits a partial publication
   (the idempotent next run republishes everything).
8. `faq-sync.yml` workflow: on push touching `faqs.json` or the injector →
   bake into source HTML → commit (clone of `footer-sync.yml`). Admin
   publish commits `faqs.json` via the existing `github-content.js`
   `putFile` and the workflow takes it from there; nightly self-heal can
   piggyback on the localize workflow's schedule.
9. Add the FAQ region markers to the affected source pages and remove the
   English hand-written FAQPage JSON-LD blocks (the injector now owns them).

**Phase 3 — frontend slim-down**
10. `js/modules/faq.js`: delete `allFaqs`; read `#faq-pool` JSON; keep
    `markStaticFaqsUsed()` / keep-server-rendered logic; "Ask another
    question" appends random pool items (already-localized strings, built
    with `createElement` + `textContent`/sanitized HTML rather than
    template `innerHTML`). Hide the button when no pool exists. No-JS
    experience: pinned FAQs fully usable.
11. Accessibility touches: `aria-hidden` chevrons, `<div>` answer
    container, per-item `id` anchors, `aria-labelledby` on the section.

**Phase 4 — verify & extend**
12. QA: `npm run audit:hreflang` still green; Rich Results Test on `/en/`,
    `/fr/`, `/th/` homepages + one service page per language; confirm
    schema text == visible text; Lighthouse a11y pass.
13. Phase-2 option: the `/{lang}/resources/faq/` hub page (all published
    FAQs, grouped by category, fully pinned) for the long-tail play.

---

## 8. Tradeoffs & risks

- **Bake latency vs. runtime freshness.** Edits appear after the workflow
  commits (~1–2 min), not instantly. Correct trade for a static host —
  and identical to how the footer and translations already behave.
- **Commit noise.** Each publish creates bot commits (existing, accepted
  pattern here; concurrency groups prevent races with footer-sync and
  localize-site — reuse one shared group or ordered triggers to avoid two
  workflows rewriting the same files simultaneously).
- **HTML answers need sanitization — in two distinct contexts.** Rich text
  from the admin must go through an allowlist sanitizer server-side at
  save *and* at bake; the frontend must stop building nodes via
  template-string `innerHTML` (today's code interpolates data into
  `innerHTML` — fine for hardcoded strings, not for CMS content). And
  separately, script-context embedding (JSON-LD, `#faq-pool`) needs the
  HTML-safe JSON serialization from §4 — tag sanitization alone does not
  stop a literal `</script>` in text from terminating the element.
- **Untranslated pinned items shrink non-English sets.** Strict
  schema/language parity (§5) means a new question appears on `/en` first
  and on mirrors only once its translation publishes. The admin
  short-set warning plus the existing translation queue keep the gap
  visible and short-lived — the same freshness lag the localized page
  mirrors already accept.
- **Randomness reduced, not removed.** The crawlable pinned set becomes
  stable; only "Ask another question" stays random. If the visible-shuffle
  compromise is adopted instead, JSON-LD stays valid but repeat visitors
  see moving content — measurable UX cost, zero SEO gain; that's why the
  default recommendation is stable pinned + random extras.
- **FAQ rich-result reach is limited post-2023** (Google restricts FAQ
  rich snippets mostly to gov/health), so don't expect visible SERP
  accordions; the value is crawlable content, AI-answer eligibility, link
  equity from answers, and correctness.
- **Seed dedup needs one human pass.** The 104-item pool has near-dupes
  (e.g. two onboarding questions, two RSS questions); the import script
  should flag likely duplicates for editorial review rather than silently
  keeping both.
- **`resources/` pages change appearance**: they currently show 5 random
  FAQs; after migration they show a curated pinned set. This is the
  intended SEO fix but is a visible content change worth signing off.
