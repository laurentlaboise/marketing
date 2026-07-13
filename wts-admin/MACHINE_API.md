# Machine API v1

Bearer-token API for automation (Grok, CI, scripts) — **no browser login**.

## Local helper script

From the `wts-admin` directory:

```bash
export ADMIN_API_TOKEN='…'   # from Railway → marketing service → Variables

chmod +x scripts/machine-api.sh   # once

./scripts/machine-api.sh health
./scripts/machine-api.sh seed-pricing
./scripts/machine-api.sh pricing
./scripts/machine-api.sh products
./scripts/machine-api.sh products web-development
./scripts/machine-api.sh affiliates
./scripts/machine-api.sh footer
./scripts/machine-api.sh menus footer
./scripts/machine-api.sh article logo-design-in-laos-the-data-backed-guide-for-2026
./scripts/machine-api.sh put-article logo-design-in-laos-the-data-backed-guide-for-2026 @scripts/payloads/logo-design-article.json
./scripts/machine-api.sh put-package growth-engine '{"name":"Growth Engine","base_price":649,"highlight":true}'
./scripts/machine-api.sh patch-footer '{"footer_social_youtube":"https://www.youtube.com/@wordsthatsells928"}'
./scripts/machine-api.sh help
```

Optional base override (local admin):

```bash
export ADMIN_API_BASE=http://localhost:3000/api/machine
```

## Setup (Railway)

1. Generate a token:
   ```bash
   openssl rand -hex 32
   ```
2. In Railway → Admin service → **Variables**:
   ```
   ADMIN_API_TOKEN=<paste token>
   ```
3. Redeploy the admin service.

Optional:
```
MACHINE_API_RATE_LIMIT_MAX=300   # default; per IP per 15 minutes
```

## Auth

```http
Authorization: Bearer <ADMIN_API_TOKEN>
```

Alternate header (same token):
```http
X-Admin-Api-Token: <ADMIN_API_TOKEN>
```

If `ADMIN_API_TOKEN` is missing or shorter than 16 characters, all routes return **503**.

## Base URL

```
https://admin.wordsthatsells.website/api/machine/v1
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Auth + DB check |
| GET | `/glossary` | List glossary terms (id, term, slug, image) |
| POST | `/glossary/bulk-upsert` | Upsert glossary terms from `{ "terms": [ ... ] }` |
| GET | `/pricing` | Packages + feature catalog |
| POST | `/seed/pricing` | Upsert Drive-backed packages, features, affiliate solutions |
| PUT | `/pricing/packages/:slug` | Upsert one package |
| PUT | `/pricing/features/:key` | Upsert one feature |
| GET | `/products` | List products (`?service_page=&status=&limit=`) |
| GET | `/affiliate-solutions` | List affiliate products |
| PUT | `/affiliate-solutions/:name` | Upsert affiliate product (URL-encode name) |
| GET | `/footer-settings` | Footer-related `site_settings` |
| PATCH | `/footer-settings` | Patch `footer_*` / `social_*` keys |
| GET | `/menus` | List menu items (`?location=footer`) |
| PATCH | `/menus/:id` | Update menu item URL/label/etc. |
| GET | `/articles/:idOrSlug` | Fetch one article by UUID or slug, any status (old slugs keep resolving after a rename) |
| POST | `/articles` | Create a minimal article (title required; slug optional, deduplicated) — then PUT the full payload |
| PUT | `/articles/:idOrSlug` | Update article fields; `?force=true` skips the stale-write guard |

## Articles

The article CMS has **two writers** — the admin UI and this API — and a few
rules keep them from stepping on each other:

- **`content` is generated, not authored.** It's the listing teaser card,
  rebuilt server-side from `content_labels` (chapters / facts / sources) +
  title/category/image on **every save from either writer**. Sending
  `content` in a PUT only matters when `content_labels` is empty.
  The article body readers see is **`text_article`**.
- **Stale-write guard.** Send `base_updated_at` = the `updated_at` you last
  read (GET the article first). If someone saved a newer version since
  (usually the admin UI), the PUT returns **409** with
  `current_updated_at` instead of overwriting it. Re-fetch, merge, retry —
  or repeat with `?force=true` to overwrite deliberately.
  `scripts/machine-api.sh put-article` injects `base_updated_at`
  automatically. PUTs without `base_updated_at` behave as before (no guard).
- **Slug renames.** `body.slug` renames the public URL. The old slug is kept
  in `previous_slugs`, so the public site and this API keep answering on the
  old URL (the article page rewrites the address bar to the new slug).

### Fetch an article

```bash
curl -sS https://admin.wordsthatsells.website/api/machine/v1/articles/logo-design-in-laos-the-data-backed-guide-for-2026 \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

### Safe update (recommended)

```bash
# 1. read the row, note .article.updated_at
# 2. include it as base_updated_at
curl -sS -X PUT https://admin.wordsthatsells.website/api/machine/v1/articles/logo-design-in-laos-the-data-backed-guide-for-2026 \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "base_updated_at": "2026-07-13T05:18:42.000Z",
    "seo_title": "New SEO title",
    "content_labels": { "chapters": ["First section", "Second section"] }
  }'
# → 409 if the article changed since base_updated_at
```

Or let the helper script do the read-merge-put dance:

```bash
./scripts/machine-api.sh put-article <id-or-slug> @scripts/payloads/logo-design-article.json         # guarded
./scripts/machine-api.sh put-article <id-or-slug> @scripts/payloads/logo-design-article.json force   # overwrite
```

### Create an article

`POST /v1/articles` creates the row (title required; slug optional and
deduplicated; status defaults to `draft`), returning `{ id, slug }` — push the
full payload with PUT afterwards. The helper chains both:

```bash
./scripts/machine-api.sh create-article @scripts/payloads/korea-ai-law-article.json
./scripts/machine-api.sh create-article '{"title": "My New Article", "status": "draft", "text_article": "<p>Body…</p>"}'
```

### Rename a slug

```bash
curl -sS -X PUT https://admin.wordsthatsells.website/api/machine/v1/articles/<current-slug-or-uuid> \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug": "new-seo-slug"}'
# old slug 301-behaves via previous_slugs: API lookups + article page keep working
```

## Examples

### Health
```bash
curl -sS https://admin.wordsthatsells.website/api/machine/v1/health \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

### Seed SEA pricing (same as Admin UI button)
```bash
curl -sS -X POST https://admin.wordsthatsells.website/api/machine/v1/seed/pricing \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

### Upsert a package
```bash
curl -sS -X PUT https://admin.wordsthatsells.website/api/machine/v1/pricing/packages/growth-engine \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Growth Engine",
    "base_price": 649,
    "description": "Ads + SEO + lead assets",
    "highlight": true,
    "badge_text": "Most popular",
    "features": { "paid_social": true, "local_seo": true, "monthly_reporting": true }
  }'
```

### Update a footer social URL
```bash
curl -sS -X PATCH https://admin.wordsthatsells.website/api/machine/v1/footer-settings \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"footer_social_youtube":"https://www.youtube.com/@wordsthatsells928"}'
```

## Security notes

- Token is a **shared secret** — never commit it; never expose it to the public site.
- CSRF is **not** required (no session cookies).
- Rate limited separately from browser admin traffic.
- Mutating calls are best-effort logged to `activity_logs` as `m:…` actions.
