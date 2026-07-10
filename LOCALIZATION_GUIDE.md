# Website Localization (/en /th /la /fr) — Part 2

Full-site localization built on the Part 1 platform
(`wts-admin/TRANSLATION_PLATFORM.md`: RBAC, translation workspace, payout
ledger). Part 2 turns published translations into real static pages: the
`translations` table (AI for Thai/French, human vendors for Lao) feeds a
generator that materializes `/th` `/la` `/fr` mirrors of every `/en` page,
at which point the existing soft fallbacks stop applying automatically.

URL prefixes vs language codes: directories are `/th` `/la` `/fr`; the Lao
HTML/hreflang code is `lo` (`<html lang="lo">`, `hreflang="lo"`).

## The pipeline

```
en/**.html ──sync-site-pages──▶ site_pages.segments (keyed English blocks)
                                      │  Part 1 sync (entity_type='page')
                                      ▼
                    translations rows: pending → AI batch (th/fr)
                                       or vendor workspace (la)
                                      │  SuperAdmin approve → published
                                      │  (+ payout credit, Part 1)
                                      ▼
              GET /api/public/translations/:lang/page  (published only)
                                      │
        scripts/generate-localized-pages.js  (localize-site.yml workflow)
                                      ▼
      th/** la/** fr/**  +  reciprocal hreflang on en/**  +  sitemap.xml
```

A page is only materialized once it has a **published** translation
(Lao is vendor-reviewed by workflow: the AI batch defaults to th/fr).
Until then `/th|/la|/fr/...` serves English via:

- **GitHub Pages** (primary host): `404.html` redirects unknown localized
  paths to the `/en` equivalent, and loads the right articles SPA shell
  for `/{lang}/articles/:slug`.
- **Netlify** (if used): non-forced `302` rules in `_redirects` /
  `netlify.toml` — real files always win.

## What ships on every generated page

Handled by `scripts/lib/html-l10n.js` (dependency-free, offset-based —
untouched markup stays byte-identical):

- published segment translations applied; untranslated segments stay
  English (progressive)
- chrome strings (nav/footer/modals/forms/buttons) from
  `src/locales/site/{en,th,la,fr}.json` — the Lao file is marked
  `needs-vendor-review`, update it as the vendor signs off
- every `/en/` link (root-relative and absolute) rewritten to the language
- `<html lang>`, self-canonical, localized `og:url`, JSON-LD `inLanguage`
- hreflang cluster listing **only languages whose files exist** +
  `x-default` → English; `--update-en-hreflang` keeps the English sources
  reciprocal
- Noto Sans Thai / Noto Sans Lao font links + `css/i18n.css` (th/la only;
  no letter-spacing / uppercase on Thai-Lao, line-height ≥ 1.65)

The language switcher (`js/modules/lang-switcher.js`, wired into
`js/main.js`) renders on every page under a language prefix — floating
pill + footer row, `aria-current` on the active language, path-preserving
links, and writes the `wts_lang` cookie that the root redirect honours
(cookie → `Accept-Language` → `/en/`).

## Commands

```bash
npm run localize -- --api https://admin.wordsthatsells.website   # generate mirrors
npm run localize -- --dry-run                                    # inspect only
npm run sitemap                                                  # multi-language sitemap.xml
npm run audit:hreflang                                           # CI gate: reciprocity + files exist
```

`scripts/generate-localized-pages.js` flags: `--langs th,la,fr`,
`--paths <substr,...>`, `--payloads file.json` (offline map, used by
tests), `--include-untranslated` (chrome-only mirrors — used for the
`/xx/articles/` SPA shells), `--update-en-hreflang`, `--dry-run`.

## Publish & Generate (SuperAdmin flow)

Approving a `page` / `glossary` / `article` translation in the admin
(`requires_review → published`) does three things:

1. Part 1 hook: publish + vendor payout credit (one transaction).
2. Best-effort `workflow_dispatch` of `.github/workflows/localize-site.yml`
   via the existing GitHub token plumbing (`src/lib/github-content.js`).
3. The workflow regenerates all published pages from the public API,
   localizes footers (`inject-footers.js --source`, now `la`-aware and
   label-translating), refreshes `sitemap.xml`, runs the hreflang audit,
   and commits — which triggers the normal Pages deploy.

Configuration:

- Railway (wts-admin): `GITHUB_TOKEN` — already used for image/footer
  publishing; the same token fires the workflow dispatch.
- GitHub repo variable `WTS_ADMIN_URL` = `https://admin.wordsthatsells.website`
  (Settings → Secrets and variables → Actions → Variables).

Dispatch failures never block an approval — the generator is idempotent,
so any later run (or a manual Actions run) catches everything up.

## Seeding the first pages (migration notes)

```bash
# 1. Register the website pages as translatable entities:
#    Admin UI → Localization → Translations → "Sync Site Pages"
#    (works on any deployment — reads the local en/ tree in a full
#    checkout, otherwise fetches the live site via its sitemap).
#    CLI equivalent from a full checkout:
railway run node wts-admin/scripts/sync-site-pages.js --tier1-only
#    (or a subset: --paths /,prices,contact-us · or --live to force
#    fetching the deployed site)

# 2. Thai + French: admin UI → Localization → Translations → Run AI Batch
#    (requires ANTHROPIC_API_KEY). Segments land in requires_review.

# 3. Lao: the vendor translates the queued rows in their workspace
#    (side-by-side, segments in page order) and submits for review.

# 4. Approve in the admin → payout credited → localize-site.yml runs →
#    /th /la /fr pages appear on the next Pages deploy.

# 5. Once /xx/articles/index.html shells exist (chrome-only generation:
#    npm run localize -- --include-untranslated --paths articles/index.html
#    ), enable the per-language SPA rewrites staged as comments in
#    _redirects. GitHub Pages needs no change (404.html handles it).
```

## QA checklist (per language rollout)

- [ ] `npm run audit:hreflang` green
- [ ] `npm run sitemap` regenerated and committed
- [ ] Thai/Lao pages: tone marks not clipped in buttons/badges, no
      letter-spacing/uppercase artifacts (see `css/i18n.css`)
- [ ] Language switcher shows on header + footer, correct `aria-current`
- [ ] French: check text-length overflow on buttons/cards
- [ ] Spot-check payout ledger credits for vendor-translated pages
