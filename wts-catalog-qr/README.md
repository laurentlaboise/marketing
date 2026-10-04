# wts-catalog-qr

Paper catalog QR → 5-question wizard → multi-item cart → **existing** WordsThatSells portal checkout.

This is a standalone Vite + React + TypeScript front door. It sits next to `wts-admin/` (there is no `apps/` workspace in this monorepo). It does **not** implement Stripe or BCEL. Payments stay on `admin.wordsthatsells.website/portal/cart`.

## Run

```bash
cd wts-catalog-qr
npm install
npm run dev
```

Build check:

```bash
npm run build
```

Static preview of the build: `npm run preview`.

## Env vars

Copy `.env.example` to `.env` if you need to override defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_PORTAL_API` | prod: admin public API; `npm run dev`: `/portal-api` proxy | Public products + signup/me/my-services |
| `VITE_PORTAL_ORIGIN` | `https://admin.wordsthatsells.website` | Portal cart / chat / login |
| `VITE_DEMO` | `0` | `1` forces `catalog-seed.json` and skips the live API |
| `VITE_PUBLIC_ORIGIN` | (page origin) | Origin encoded into printed QR URLs |
| `VITE_WHATSAPP` | `8562055528034` | Help fallback (same number as portal-cart) |

No secrets belong in this folder. There are no Stripe keys.

## Pages

| Path | Role |
| --- | --- |
| `/` | Explainer, start wizard, enter a printed code |
| `/q/:slug` | Paper QR landing (slug, **not** SKU) |
| `/wizard` | Industry / goal / website / budget / languages → ranked products |
| `/cart` | Qty + options, Buy vs Quote buckets, portal CTA |
| `/print-qrs` | SVG/PNG QR per slug → `{origin}/q/{slug}` |
| `/help` | Portal chat or WhatsApp |

## Price spine

Demo mode uses `src/data/catalog-seed.json` (31 printed v2.1 products) only when:

- `VITE_DEMO=1`, or
- `GET {VITE_PORTAL_API}/products` fails

When the API is up, printed rows are **matched** onto live products (SKU first, including option SKUs, then slug) so the cart shows portal prices. Printed slugs stay the QR identity (`seo3`, `wpdivi`). Live portal slugs are often longer (`seo-article-copywriting-package`, `wordpress-divi-services`).

`npm run dev` proxies `/portal-api` → `https://admin.wordsthatsells.website/api/public` so localhost can read the live catalog without a CORS change. A production static host still needs the catalog origin on `ALLOWED_ORIGINS` (or `VITE_DEMO=1`).

`/api/public/qr/:id` is a **BCEL payment image**. Do not reuse it for catalog deep links.

## Catalog gap — do not print every QR yet

The seed marks **6 of 31** printed SKUs `live_in_portal` (card-ready): `BLOG3`, `CANVAM`, `RSS`, `STOCK10`, `STOCKSEO`, `WPDIVI`.

Many other printed codes exist live as **options on a consolidated product** (COPY*, SEO*, WPHOME/WPMOD, CANVAY, LOGO*). A few still have no live row (`XLSEO`, `XLSEOY`; GBP SKU in the seed is a placeholder). Reconcile slugs/SKUs in a separate marketing PR before a print run of the full catalog. `/print-qrs` defaults to the card-ready subset.

## How paper QR reaches portal payment

```
paper QR  →  /q/{slug}  →  local cart (localStorage)
                         →  Continue to portal checkout
```

Existing wts-admin machinery (verified, not reimplemented):

- `GET /api/public/products` and `GET /api/public/products/:slug`
- `POST /api/public/portal-signup` → `upsertCustomer` + magic link
- `GET /api/public/portal-me` / `POST /api/public/my-services` (session cookie + Origin allow-list)
- Session cart at `/portal/cart` (`FEATURE_CART`, `src/routes/portal-cart.js`)
- Stripe embedded + BCEL in `payments.js` / portal-cart checkout

**v1 stub:** this app opens `/portal/login?next=/portal/cart?catalog_seed=…` (base64url JSON of slugs, live ids, qty, option keys). If the visitor already has a portal session **and** this origin is on `ALLOWED_ORIGINS`, it also tries `POST /api/public/my-services` with `live_id`.

**Needs a marketing / wts-admin follow-up** (not done here, to keep the change inside this folder):

1. Honor `?next=` on `/portal/login` and magic-link `/portal/auth`.
2. After session, parse `catalog_seed` and insert `saved_services` by live id / slug / option SKU.
3. Add the catalog origin (and Vite `http://localhost:5173`) to `DEFAULT_ORIGINS` / `ALLOWED_ORIGINS`.

Until that lands, the CTA is a clear path into the portal, not an automatic seed.

## Out of scope

- Intake PDF → portal forms
- Reconciling the live DB catalog
- Production deploy
