# Machine API v1

Bearer-token API for automation (Grok, CI, scripts) — **no browser login**.

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
