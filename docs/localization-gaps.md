# WTS localization — gaps & Claude brief
**Updated:** 2026-07-12  
**Repos:** laurentlaboise/marketing + wts-admin (Railway)

## Goal
Ship real **Thai / Lao / French** mirrors of high-value English pages using the **backend translation platform** (not hand-edited static 404s). When pages are published, run the existing generator so Google gets real hreflang clusters.

## What already works (use it)

| Piece | Location |
|--------|----------|
| Admin Translations workspace | https://admin.wordsthatsells.website/translations |
| Public API (published only) | `GET /api/public/translations/:lang/page` (also `article`, `glossary`, …) |
| Static generator | `npm run localize -- --api https://admin.wordsthatsells.website` |
| Generator code | `scripts/generate-localized-pages.js` + `scripts/lib/html-l10n.js` |
| Chrome strings | `src/locales/site/{th,la,fr}.json` |
| Hreflang audit | `npm run audit:hreflang` |
| Sitemap | Only lists languages that **exist as files** (correct) |

## Critical gap (measured 2026-07-12)

```
Published page translations:  th=0  la=0  fr=0
Published glossary translations: 0 / 0 / 0
Dry-run localize: 0 written, 330 skipped (no published translation)
Disk: no /th /la /fr trees
```

**So:** backend features exist; **nothing is published** yet → generator correctly does not invent fake language pages.

## Why language switcher shows “coming soon”

Grok removed **crawlable links** to `/th|la|fr/...` because those URLs **404** and hurt SEO.  
Until you **publish** translations and run `npm run localize`, the switcher must not claim those URLs exist.

When Claude generates real `/th` (etc.) files, re-enable switcher links with `--update-en-hreflang`.

## Recommended publish order (SEA SEO)

1. **Money pages:** `/en/` home, digital-marketing-services (+ SEO/content/web/social/tools), prices, contact  
2. **Glossary hub** + top 10 guides (SEO, content marketing, backlinks, keywords, on-page, GBP, local SEA terms)  
3. Rest of glossary + articles  

Lang priority for ranking: **th → la → fr**.

## Claude Code mission (copy/paste)

```
Repo: /Users/laurentlaboise/marketing (wts-admin lives in monorepo)

Context: Localization platform is live (Translations workspace + public API +
generate-localized-pages.js). Published translations count is 0 for th/la/fr.
English site is SEO-focused for Southeast Asia. Language switcher currently
shows “coming soon” for th/la/fr to avoid 404s.

Tasks:
1. Inspect wts-admin translation workflow (translations.js, publish status,
   entity_type page/glossary) and document exact steps for Laurent to publish
   a first Thai page from the admin UI (or machine API if exists).
2. If a safe machine-API or seed path exists to create draft/publish page
   translations without inventing unapproved copy, outline it; do NOT invent
   large Thai/Lao content without human review unless using the platform’s AI
   batch with status=draft only.
3. After any published translations appear, run:
     node scripts/generate-localized-pages.js --api https://admin.wordsthatsells.website --langs th --dry-run
   then real write for langs that have payload; run --update-en-hreflang;
     npm run sitemap; npm run audit:hreflang
4. Restore language switcher links ONLY for languages that have real files.
5. Open a PR; do not force-push main. No money/Stripe changes.

Success criteria:
- At least one real /th/… page generated from published API payload, OR
- Clear blocked reason + UI steps if zero publish path without Laurent.
```

## Grok / orchestrator next actions

- [ ] Laurent: publish first Thai pages in Translations workspace (priority list above)
- [ ] Claude: execute mission / open PR for generator + switcher restore
- [ ] Grok: after `/th` exists, re-submit sitemap in GSC + request index on hub  
