# Product Images Pipeline

How a product gets real art on the portal card and slide-in — and why setting
`products.image_url` alone is never enough.

## The one rule

**A URL goes into the database only after the file behind it returns HTTP 200.**

The portal (`admin.wordsthatsells.website`) renders whatever
`GET /api/public/products` returns: `image_url` for the card,
`slide_in_image || image_url` for the slide-in detail
(`wts-admin/src/routes/public-api.js`). Neither the admin UI nor the Machine
API validates that these URLs resolve — a URL pointing at a file that was
never deployed silently degrades to the empty placeholder on the sell path.
That is exactly the incident this pipeline exists to prevent: in July 2026,
~54 locally generated `*-featured.webp` files had DB URLs (or Image Library
rows) created for them while the binaries were never committed, so every
product except Logo Design showed the placeholder.

## Where product images live

| What | Where |
|---|---|
| Binary (source of truth) | this repo, `images/products/{slug}-featured.webp` (+ optional `{slug}-card.webp`) |
| Served at | `https://wordsthatsells.website/images/products/<file>` (GitHub Pages, deployed from `main` by `.github/workflows/main.yml` — webpack copies `images/` into `dist/`) |
| CDN mirror | `https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/products/<file>` |
| DB fields | `products.image_url`, `products.slide_in_image` (both point at the `-featured` asset) |
| Image Library | `images` table row with `file_path = images/products/<file>` and the jsDelivr `cdn_url` — metadata only, it does **not** host binaries |

Railway's filesystem is ephemeral; the admin's Image Library upload flow
pushes binaries to this repo via the GitHub Contents API for the same reason.
Files that only exist on a laptop or in the DB do not exist as far as the
website is concerned.

## Adding or changing a product image

1. **File in repo.** Export webp (lowercase-hyphenated, ~1200×628 for
   featured), name it `{slug}-featured.webp` (and optionally
   `{slug}-card.webp`), put it in `images/products/`, open a PR.
2. **Deploy.** Merge to `main`; the Pages workflow deploys. Verify:
   `curl -sI https://wordsthatsells.website/images/products/{slug}-featured.webp` → 200.
3. **Wire the DB.** From `wts-admin/`, with `ADMIN_API_TOKEN` set:
   ```bash
   node scripts/sync-product-images.js            # dry-run: shows the plan
   node scripts/sync-product-images.js --apply    # verifies 200, then writes
   ```
   The script fills `image_url` + `slide_in_image` for every active product
   whose asset is live, skips products whose current URL already resolves,
   and re-verifies through `/api/public/products` after writing.
4. **Image Library (Laurent rule).** Product images should also be
   registered in the Image Library — but only once the file is live. Add
   `--library` to step 3 to upsert the rows automatically
   (`POST /api/machine/v1/images/seo-upsert` with the jsDelivr `cdn_url`).
   Never create library rows for files that are not yet deployed.

## Slug ↔ filename exceptions

Most products use `{slug}-featured.webp`. These three differ (the asset is
named at the price-variant level; the map lives in
`wts-admin/scripts/sync-product-images.js` → `SLUG_TO_FILE`):

| Product slug | Asset basename |
|---|---|
| `document-translation` | `ai-document-translation` |
| `website-copywriting` | `website-copywriting-1000-characters` |
| `seo-article-copywriting-package` | `3-seo-article-copywriting-package` |

`virtual-card-pro` predates this pipeline and points at
`images/virtual-business-cards.webp` via jsDelivr; it resolves, so the sync
script leaves it alone (use `--force` to standardize it).

## Guardrails

- **CI**: `.github/workflows/product-image-check.yml` runs
  `scripts/check-product-images.js` — it fetches the live catalog and fails
  if any repo-hosted `image_url` / slide-in URL references a file missing
  from the repo (weekly runs also HTTP-check the live URLs).
- **Sync script**: refuses to write any URL it hasn't just seen return 200.

## Variant assets

`images/products/` also carries `-featured`/`-card` art for price-variant
slugs that are not standalone active products (e.g.
`website-copywriting-5000-characters`, `6-seo-article-copywriting-package`,
`human-document-translation`, `website-seo-translation-package`). They deploy
with everything else and are ready to wire if those variants become products.
