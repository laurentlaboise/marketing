# Product Surfaces Audit — hardcoded vs admin API

Date: 2026-07-17 · Audited on `main` after PR #301 and the July catalogue
consolidation (46 → 36 active products, 13 of them `pricing_type=options`).

## Executive answer

**Nothing on the customer-facing site hard-codes the product catalogue any
more.** Every product surface reads the admin database through the public
API. The "products feel hardcoded" symptom came from three real but
different problems: (1) the service *card* renderer had no branch for
option products, so a product with 4 options displayed as a bare single
price with a wrong "/ unit" suffix; (2) the prices-page projects section is
API-driven but renders only `is_featured` products — and all six Top8
project products currently have `is_featured = false`, so the section stays
hidden; (3) catalogue edits were made through the Machine API / SQL rather
than the admin form, which works but leaves no admin-UI trail.

Items (1) is fixed in this PR. (2) and (3) are data/process, not code.

## 1. Surface inventory

| Surface | File(s) | Data source | Hardcoded? | Notes |
|---|---|---|---|---|
| Service grids (content-creation, web-development, business-tools, social-media-management) | `en/digital-marketing-services/*/index.html` + `js/services/product-loader.js` | `GET /api/public/products?service_page=…` | **No** | Grid containers are empty in static HTML (0 static cards on all four pages — verified). Cards render exclusively from the API. |
| Learn More slide-in (option pickers, CTAs, BCEL/Stripe) | `js/services/product-loader.js` (`renderDetail`, `buildPricingBlock`) | same payload | **No** | Options radiogroup fully implemented; prices gated behind portal sign-in (`canShowPrices()`), per the à-la-carte-after-login rule. |
| Prices page — retainers (Digital Footprint, Growth Engine, Automation Pro) | `en/digital-marketing-services/prices/index.html` (`loadPricingData`) | `GET /api/public/pricing` | **No** | Separate SoT by design: `pricing_packages` are retainers, not products. Static HTML fallback exists only for API-down; client filters to the 3 primary slugs and drops $0 rows. |
| Prices page — one-time projects (`#product-menu-packages`) | same file (`renderFeaturedProjects`) | `GET /api/public/products?featured=1` | **No** (stale report) | The flip-card grid is an **empty container**; cards render only from API products with `is_featured=true`, and the whole section stays `hidden` otherwise. The six Top8 products exist in the DB (`landing-page-sprint`, `professional-page`, `multi-page-site-starter`, `lead-form-plus-pipeline`, `seo-content-pack-5`, `lead-magnet-kit`) but are **all `is_featured=false`**, so nothing shows. Fix is a data flip in admin, not code. |
| Portal (logged-in) product view | same loader surfaces; portal session unlocks prices (`checkCustomerSession` → `refreshOpenPanel`) | same payload | **No** | "See price in portal" links deep-link back to these pages after login. |
| Admin products CRUD | `wts-admin/src/views/business/products/{list,form}.ejs`, `wts-admin/src/routes/business.js` | Postgres direct | n/a | The intended write path. Named Options round-trips: form `price_options_json` → `normalizePriceOptions` → `products.price_options` JSONB → `buildProductPricing` → public `pricing.options`. Verified in code. |
| Checkout / payments | slide-in CTAs (Stripe payment links, BCEL QR from `bcel_options`) | product row fields | **No** | No product data duplicated; Stripe objects sync from DB rows via `sync-products-to-stripe.js`. |
| Seeds / docs (`wts-admin/database/seed/*.json`, xlsx) | — | historical | n/a | Not runtime SoT; `seedCatalogIfSparse` only fires on a near-empty table. Easy to confuse with live DB — treat as archives. |

**Static fallback status:** the old "API down → keep static cards" path is
vestigial — there are no static cards left in any grid, so an API failure
now yields an empty grid (loader logs `keeping static cards` but there is
nothing to keep). Acceptable; a friendlier empty-state message is optional
polish, listed under follow-ups.

## 2. Bug verdicts (B1–B7 from the report)

- **B1 — card ignores `options`: REAL, fixed in this PR.**
  `cardPriceHTML()` had branches for `subscription`/`tiered`/`one_time`
  only; the 13 options products fell through to the one-time branch and
  showed a bare minimum price. Cards now render **“From $X · N options”**.
- **B2 — `/ unit` label: REAL, fixed in this PR.** `unitSuffix('quantity')`
  returned “ / unit”, which misreads pack pricing (“13.00 USD / unit” on a
  10-photo pack). `quantity` now renders no suffix; `hour`/`item` keep
  theirs. Fix applies to both card and slide-in (shared helper).
- **B3 — prices Top8 hardcoded: STALE.** Already API-driven on `main`
  (see inventory). Blocked on data: flip `is_featured` on the six project
  products in admin to make the section appear.
- **B4 — dual catalogue: BY DESIGN, now documented.** Retainers live in
  `pricing_packages` (`/api/public/pricing`); everything à la carte lives in
  `products`. Keep it that way; do not merge the two.
- **B5 — Machine API `price-options` 404s: route exists and is registered**
  (`machine-api.js:599`, mounted `/api/machine` in `server.js:249`).
  Unauthenticated probes cannot distinguish a missing route — auth runs
  router-wide **before** route matching, so every `/api/machine/*` path
  returns 401 without a token. Verify on production with the token:
  `./scripts/machine-api.sh raw POST /v1/products/price-options '{}'` —
  expect `400 {"error":"id or slug required"}` (route live), not 404. A
  genuine 404 with a valid token means Railway is running a build older
  than commit `21facc0`; redeploy.
- **B6 — hard delete vs archive: CONFIRMED, archive is the path.**
  `orders.product_id` FK blocks DELETE; set `status='archived'` (public API
  filters on `status='active'`).
- **B7 — images: RESOLVED by PR #301.** All 105 binaries are deployed and
  live; `PRODUCT_IMAGES_PIPELINE.md` documents file→deploy→verify→wire; a
  CI guard fails on DB URLs pointing at missing repo files. After the
  consolidation, 14 products have live `image_url`s (variant art mapped to
  consolidated slugs), 16 empty-image products have exact-match art ready
  to wire (`sync-product-images.js`, mapping table updated in this PR), and
  the 6 Top8 projects have **no art yet** (placeholder until generated).

## 3. Source of truth and write paths

**SoT:** `products` table (+ `pricing_packages` for retainers only).

Write paths, in order of preference:
1. **Admin UI** (`/business/products`) — full validation + Named Options
   editor + review trail. Default for humans.
2. **Machine API** (`/api/machine/v1/products/*`) — same DB, token-gated,
   used by agents/scripts. Validation is thinner (no URL reachability, no
   option-schema review) — keep payloads small and verify via
   `/api/public/products` after writes.
3. **Seed scripts / SQL** — bootstrap only. Direct SQL bypasses
   normalization (`normalizePriceOptions`) and should be a last resort.

## 4. Follow-ups (data/process, no code)

1. In admin, set `is_featured = true` on the six Top8 project products →
   the prices-page projects section appears (no deploy needed).
2. Run `node wts-admin/scripts/sync-product-images.js --apply --library`
   from the repo root (with `ADMIN_API_TOKEN`) to wire the 16 empty-image
   products with exact-match art. The 6 Top8 products stay placeholder until art is generated
   (follow `PRODUCT_IMAGES_PIPELINE.md`).
3. Optional polish: friendly empty-state message in service grids when the
   API is unreachable.
4. Optional: add `is_featured` support to `bulk-update-copy` so agents can
   feature products without the admin form.
