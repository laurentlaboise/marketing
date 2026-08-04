# WTS Automation API v1 (`/api/v1`)

Automation surface for Make.com / n8n / Zapier. Unlike the session-authenticated
admin routes, and unlike the Bearer-token `/api/machine` API (which owns the
Stripe-synced pricing/product writes), this API authenticates with a single
header and covers the day-to-day content + CRM entities.

## Auth

Every request:

```
x-api-key: <AUTOMATION_API_KEY>
Content-Type: application/json
```

Railway env vars (service → Variables):

```
AUTOMATION_API_KEY=<run: openssl rand -hex 32>
UPLOAD_DIR=/data/uploads          # Railway Volume mount path
PUBLIC_BASE_URL=https://wordsthatsells.website
```

A Railway Volume mounted at `/data` is required for image uploads to survive
deploys.

Connection test:

```bash
curl https://<host>/api/v1/ping -H "x-api-key: $KEY"
# → {"ok":true,"service":"wts-automation-api",...}
```

## Articles (bespoke routes)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/articles` | Create (default `status: draft`) |
| PATCH | `/api/v1/articles/:id` | Update / publish |
| GET | `/api/v1/articles?status=draft` | List |
| DELETE | `/api/v1/articles/:id` | Delete |

Request fields map onto the real schema: `content` → `text_article` (the full
body — the `content` column holds the auto-generated listing teaser),
`meta_description` → `seo_description`. `language` is accepted but not stored
(localization lives in the `translations` table). Responses include the live
`url` in the site's real format (`/en/articles/<slug>.html`).

## Images

`POST /api/v1/images` with either
`{ "source_url": "https://...", "filename": "optional-name" }` or
`{ "base64": "<data>", "filename": "name.png" }` → stores the file on the
volume and returns `{ url, filename, bytes }`. 15 MB cap per image, 25 MB JSON
body cap.

## Generic entities

Uniform CRUD, one URL pattern:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/entities` | Discovery: every entity + its allowed fields/filters |
| GET | `/api/v1/:entity` | List. `?limit=` (≤100) `?offset=` `?q=` (search) + per-entity filters |
| GET | `/api/v1/:entity/:id` | Fetch one |
| POST | `/api/v1/:entity` | Create (writable fields only) |
| PATCH | `/api/v1/:entity/:id` | Partial update |
| DELETE | `/api/v1/:entity/:id` | Where allowed |

| Entity | Write | Delete | Filters | Notes |
|---|---|---|---|---|
| `glossary` | ✓ | ✓ | category, letter | auto-slug from `term` |
| `seo-terms` | ✓ | ✓ | category | auto-slug from `term` |
| `ai-tools` | ✓ | ✓ | category, status, pricing_model | auto-slug from `name` |
| `guides` | ✓ | ✓ | status, category | draft/publish like articles |
| `faqs` | ✓ | ✓ | status, category_id | auto-slug from `question` |
| `faq-categories` | ✓ | ✓ | status | auto-slug from `name` |
| `leads` | ✓ | ✓ | status, source, category | CRM intake from any trigger |
| `notifications` | ✓ | ✓ | read, type, user_id | dashboard bell; target via `users` lookup |
| `form-submissions` | ✓ | — | status, form_type | poll for `status=new` as a Make trigger |
| `products` | read-only | — | status, category, product_type, service_page | writes stay on `/api/machine` (Stripe sync) |
| `orders` | read-only | — | status, payment_method, customer_email | owned by the payments flow |
| `customers` | read-only | — | status, email | `password_hash` never exposed |
| `users` | read-only | — | role, email | id lookup for notifications/assignment |

Array fields (`tags`, `features`, `related_terms`, …) are JSON arrays in the
request body; JSONB fields (`bullets`, `metadata`) are JSON objects/arrays.
Unique-violation → `409`, unknown/malformed id → `404`, read-only entity
write → `405`, missing required fields → `422`.

## Make.com pattern

1. **Trigger** — schedule / Airtable watch / RSS / `GET /api/v1/form-submissions?status=new`
2. **AI module** — generate title/body/meta
3. **HTTP** `POST /api/v1/images` (image first, parse response)
4. **HTTP** `POST /api/v1/articles` (body: title, content, meta_description, featured_image from step 3, `"status":"draft"`)
5. Review gate, then **HTTP** `PATCH /api/v1/articles/:id` `{"status":"published"}`
6. Optional: `POST /api/v1/notifications` to ping the dashboard bell.

The same HTTP-module shape works for every entity above — swap the path.

## Security notes

- Timing-safe key comparison; key lives only in Railway env vars.
- Rotate by changing the env var.
- The router is exempt from the session CSRF guard and the shared `/api`
  rate-limit bucket (it has no session cookies to forge), and parses its own
  JSON with a 25 MB cap for base64 image payloads.
- Credentials, payments, payouts, and session tables are not reachable from
  this API at all.
