# Site Audit Implementation — Owner Runbook (July 2026)

What shipped from the site audit, and the follow-up actions only you (the owner)
can do. Companion to the implementation branch
`claude/wordsthatells-site-audit-won7a1`.

## What changed (summary)

| Area | Change |
|------|--------|
| Build | `normalize-site-css.js` no longer downgrades Font Awesome to 6.0.0-beta3 |
| Indexation | Broken glossary placeholder (`structured-data-implementation-2026.html`) retired to a redirect stub → `rich-snippets-with-structured-data-2026.html`; dropped from sitemaps |
| Sitemaps | `generate-sitemap.js` now emits all four files (`sitemap.xml`, `sitemap-google.xml`, `sitemap-images.xml`, `sitemap-index.xml`) from one inventory — hand-edit drift is no longer possible. Regenerate with `npm run sitemap` |
| Glossary (80 pages) | End-CTA now links to prices + client portal (was contact-only); x-default hreflang fixed; GA4 added (pages had none); duplicated trailing `</body></html>` corruption collapsed. Re-run anytime: `python3 scripts/patch_glossary_cta.py` (idempotent) |
| Prices page | JSON-LD (Service + OfferCatalog with the three public plans + Breadcrumb) and og:image added |
| OG images | Affiliate + agencies + homepage metadata images moved from jsDelivr to first-party URLs |
| Homepage | Single H1 in hero, primary CTA → prices, secondary → partner programs, proposal modal trigger with no-JS fallback, "Potential Results" reframed as example plays, CTA click tracking |
| Header | Site-wide sticky nav via `headers.json` + `scripts/inject-headers.js` (same pattern as footers). Content changes go in `headers.json`, never in page HTML |
| Pillar pages | `/en/digital-marketing-services/digital-marketing-laos/` and `/en/digital-marketing-services/growth-engine-thailand/` |
| Case studies | `/en/company/case-studies/` — ships **noindexed** with `[OWNER: …]` metric placeholders |
| Forms | Persona question (SME / affiliate / agency / not sure) on the contact form and homepage inquiry modal; the choice is prefixed into the message field so it reaches your existing backend unchanged |

## Actions only you can do

### 1. Google Search Console (do first)
- Confirm the property covers `https://wordsthatsells.website/` and that
  `sitemap-index.xml` is submitted (it now references the three generated children).
- After this branch deploys, use URL Inspection on: the homepage, prices page,
  both new pillar pages, and 2–3 glossary pages. Request indexing.
- Check Coverage/Pages report for the retired URL
  `…/glossary/structured-data-implementation-2026.html` — it should drop out
  ("Page with redirect"/"noindex"). No action needed; just confirm it doesn't
  linger as a soft-404.

### 2. Case-study metrics (unblocks T5)
`en/company/case-studies/index.html` contains `[OWNER: …]` placeholders and
`<!-- OWNER-INPUT REQUIRED -->` markers.
- Fill in only numbers you can defend, with the client's permission to be named
  (or anonymize the client but keep real numbers).
- Then remove the `<meta name="robots" content="noindex, follow">` line and run
  `npm run sitemap` — the page enters the sitemaps automatically.

### 3. Lead magnet decision (T8)
Pillar pages currently end with plain newsletter framing. If you produce a real
asset (e.g. "Lao SME Facebook checklist" PDF), we can switch the newsletter
block to a download-gated capture. Decision + asset needed from you.

### 4. Form Builder: native `persona` field (T11 follow-up)
Persona currently rides inside the message text (`[Persona: …]` prefix) because
the admin API's accepted fields are unknown from the frontend. If the wts-admin
Form Builder can accept a new `persona` field, say so and the forms can send it
as structured data instead.

### 5. Pricing share image (WP5 follow-up)
The prices page reuses the homepage OG image. A dedicated 1200×630 pricing
visual would improve link previews — commission one and drop it in `/images/`,
then update the two `og:image`/`twitter:image` tags on the prices page.

### 6. Thai language MVP (T9 — deferred)
`/th/` remains a redirect stub. The pipeline is ready
(`scripts/generate-localized-pages.js` + the `localize-site.yml` action), but it
needs the wts-admin translations API to be reachable and populated. When your
Thai pipeline is live, run the localize workflow; header/footer injectors are
already l10n-aware.

### 7. GA4 (verify after deploy)
New events to look for in GA4 (property `G-LMRKC1VBBB`): `cta_click` (with
`cta_id`, `page_type`, `destination`), plus the existing `portal_redirect`,
`open_form`, `form_submit`. Glossary pages now report traffic for the first
time — expect a bump in measured pageviews that is measurement, not growth.

### 8. Nice-to-haves spotted during review (no action required)
- Homepage card #8 ("Quote-Request Funnel") reuses the course-creator image
  with a home-contractor alt text — source a matching image when convenient.
- The header wordmark SVG renders small at 40px height; a header-specific
  logo crop would look sharper.
- The sticky header (z-index 10000, needed to clear the glossary share dock
  at 9999) sits above modal backdrops' top strip; raise modal z-indexes above
  10000 if full-bleed overlays are ever wanted.

## Maintenance rules (so the automation keeps working)

- **Footer content** → edit `footers.json`, never page HTML (`inject-footers.js` overwrites).
- **Header/nav content** → edit `headers.json`, never page HTML (`inject-headers.js` overwrites).
- **CSS** → edit partials under `css/{base,components,layout}/` and register new
  files in `css/main.imports.css`; `css/main.css` is generated.
- **Sitemaps** → never hand-edit any `sitemap*.xml`; run `npm run sitemap`.
- **Glossary pages** → never re-run `generate_glossary_articles.py` (destroys
  post-generation SEO work); use the idempotent patchers
  (`patch_glossary_ui.py`, `patch_glossary_cta.py`).
