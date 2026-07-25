# Shopping Experience + Workboard — Improvement Plan

**Status: PROPOSAL — nothing in this document is implemented. For review before any change.**

Date: 2026-07-25 · Scope: marketing site purchase flow, portal, admin, and the
order-to-delivery "workboard" process. Grounded in the actual code (file paths cited
throughout), building on the purchase-flow report already reviewed.

---

## 1. Where we actually are (verified in code)

The earlier AI report is broadly correct. Verifying it against the repo surfaced five
facts that shape this plan — two of them the report missed:

| # | Fact | Where |
|---|------|-------|
| 1 | Buy CTA is literally `Activate service`; guests see only `Request a Quote` even on buy products. CTA strings are **hardcoded English** inside the shared JS, so French/Thai pages get English buy buttons. | `js/services/product-loader.js:1820-1828` |
| 2 | The order lifecycle **ends at payment**: `['pending','awaiting_payment','completed','expired','cancelled']`. There is no "work started / in review / delivered" anywhere in the data model. Delivery tracking today = a Notion board. | `wts-admin/src/routes/business.js:802` |
| 3 | `workboard.html` is an **orphan page**: an iframe embedding a public Notion board, linked from nowhere on the site. This is the "workboard" to replace. | `workboard.html:46-51` |
| 4 | **(Report missed)** A feature-flagged collaborative **whiteboard module** already exists: boards per customer, comments, client approvals, and **pay-to-unlock final deliverables** through Stripe *and* BCEL with admin bank-confirm. This is proven machinery we can attach the workboard to. | `wts-admin/src/modules/whiteboard/*`, unlock hooks in `payments.js:501-511`, `business.js:865-892` |
| 5 | **(Report missed)** The portal already has a "Workspace" page (reports + client action items + scope hints) and a per-customer `deliverables` + `client_action_items` schema. The workboard should grow from these tables, not start from zero. | `wts-admin/src/routes/portal.js:390-488` |

Other verified constraints:

- Success page is thin: product/amount/status + a "Back to Services" link that always
  points at content-creation (`en/checkout/success.html:56`). No portal link, no next steps.
- Public API returns full prices to guests — the sign-in gate is UI-only (`public-api.js:809+`).
- Portal i18n supports **en + th only** (`wts-admin/src/lib/i18n.js:13`); site lang switcher
  shows Lao as "coming soon". We are a Vientiane-based agency without a Lao-language buy flow.
- `saved_services` ("Add to My Services") stores product + billing period, no option/qty —
  fine as a wishlist, insufficient as a cart as-is.
- BCEL QR codes are **pre-generated static images per amount** (`bcel_options[].qr_url`) —
  this constrains what a multi-item BCEL cart can look like (see §5.3).
- A Stripe sync script exists (`wts-admin/scripts/sync-products-to-stripe.js`) we can extend
  for per-option durable price IDs.

---

## 2. North star — selling the way SEA actually buys

Everything below follows three principles tuned to the Laos/SEA market:

**A. Chat closes, self-serve collects.** In Laos and Thailand, trust is built person-to-person
and deals close in WhatsApp/messenger, not in forms. The site's job is to make the product and
price legible, then offer *both* paths at once: instant self-serve for small SKUs, and a
one-tap chat handoff that carries full product context so the conversation starts warm.
Never force a form where a chat would do.

**B. The QR is the money rail, the card is the fallback.** BCEL OnePay is how local customers
pay. Today it renders as a secondary outline button under a big Stripe CTA. For Lao customers
it should be visually co-equal, show the LAK amount up front, and the bank-transfer + reference
+ human confirmation flow should feel like the *designed* path, not the workaround.

**C. Show the work.** SEA clients follow up constantly ("any update?") because agencies go
quiet after payment. A client-visible workboard with stages, named next actions, and
"the ball is with you / with us" turns that anxiety into trust — and it is the strongest
justification for the portal's existence. It also cuts our own chat load.

Plus one internal principle: **don't fight the architecture.** Dynamic Stripe Checkout
sessions stay the payment backbone (the report's recommendation stands — no per-product
payment links replacing sessions). The workboard grows out of existing tables
(`orders`, `deliverables`, `client_action_items`, whiteboard `boards`), feature-flagged
exactly like `FEATURE_WHITEBOARD`.

---

## 3. The two journeys we are building

### Buyer journey (target)

```
Guest on service page
  → card shows value + "Self-serve" or "Quote" badge (+ teaser "from $X" — decision D4)
  → slide-in: full detail, clear CTA per pricing type, WhatsApp handoff button
  → small SKU: sign in (magic link) → Pay now (Stripe) or BCEL QR (LAK shown)
  → bigger scope: Request quote (form OR WhatsApp) → quote → optional 30% deposit online
  → Success page v2: order reference, 3 "what happens next" steps, Open portal,
    "we reply within N business hours", WhatsApp link
  → auto-created project appears on their portal workboard the same minute
```

### Delivery journey (target — this is the new workboard)

```
Payment confirmed (Stripe webhook / admin BCEL confirm)
  → project auto-created from the product's template (stages + kickoff checklist)
  → client sees: stage progress bar, next action, ball-with badge, files, updates feed
  → team drives: /business/workboard kanban (drag project across stages, post updates)
  → review stage: client approves in portal (reuse whiteboard approval pattern)
  → deliver: files land in the existing deliverables table, linked to the project
  → close: "what's next" upsell prompt + review ask
  → Notion board retired for client-facing work
```

---

## 4. Phased plan (summary table)

| Phase | Name | Contents | Risk | Rough effort |
|-------|------|----------|------|--------------|
| **0** | Say what it costs, say what happens | CTA matrix by pricing type, card badges, Success page v2, BCEL prominence + LAK display, WhatsApp handoff, quote-received experience, CTA i18n | Very low — copy + front-end only | 3–5 dev-days |
| **1** | Checkout that matches the catalog | Mini-cart ("Checkout selected" from My Services), deposits for fixed-price consult, hourly "book hours" framing | Low–medium | 5–8 dev-days |
| **2** | **The Workboard** | `projects` layer, admin kanban, portal "My Projects", auto-create on payment, updates + notifications, whiteboard/deliverables linking, retire Notion embed | Medium — new schema, flagged | 8–12 dev-days |
| **3** | Portal as a storefront | In-portal catalog "Add services", post-pay provisioning, kickoff checklist, billing empty-state cross-links | Low | 4–6 dev-days |
| **4** | Trust & ops hardening | Lao locale, price-privacy decision, per-option Stripe price IDs, payment links for proposals only, funnel analytics | Low, ongoing | continuous |

Phases 0 and 1 are the shopping experience. Phase 2 is the workboard. Each phase ships
independently; nothing blocks on a later phase.

---

## 5. Detailed specifications

### Phase 0 — Say what it costs, say what happens

**0.1 CTA matrix by pricing type** — replaces the one-size-fits-all `Activate service`
(`buildCtaHTML`, `product-loader.js:1797-1850`; pricing shapes already delivered by
`public-api.js:678-805`):

| Product situation | Signed-in CTA | Sub-line under CTA |
|---|---|---|
| One-time fixed (e.g. GBP Setup $39) | **Pay now · $39** | "One-time payment · delivered in X days" |
| Options (e.g. Logo AI vs Designer) | **Continue to payment** → after pick: **Pay now · $99 — AI Logo** | option picker required first |
| Quantity tiers (stock photos) | **Pay now · $12 total** (live total) | "$4/photo · cheaper at 10+" |
| Subscription | **Subscribe · $39/mo** | "$139 due today incl. one-time setup · renews $39/mo" |
| Hourly buy | **Book hours · $25/hr** | qty stepper = hours + "not sure how many? Ask us" |
| Consult with fixed price (Sprint $349) | **Request quote · from $349** | "+ optional *Reserve with 30% deposit* (Phase 1)" |
| Consult, no price | **Request a quote** | "We reply within N business hours" |
| Guest (any buy product) | **Sign in to buy** (opens existing login modal) + **Request a Quote** | replaces quote-only dead end |

Note the guest change: today a guest on a $4 buy product only sees "Request a Quote"
(`product-loader.js:1820-1824`) — a quote request for a $4 SKU. "Sign in to buy" keeps the
locked-pricing pattern but names the path.

**0.2 Card badges (signed-in):** `Self-serve` vs `Quote` chip on service cards
(`renderCards`, `product-loader.js:305`), so Logo vs Landing-Page-Sprint is obvious pre-click.

**0.3 Success page v2** (`en|fr|th/checkout/success.html`, data from
`payments.js:545-584` `order-status`):
- Order reference + product + amount (existing), plus **What happens next** — 3 concrete steps
  ("1. Confirmation email — sent. 2. We start and you can track progress in your portal.
  3. First update within N business hours.")
- Primary CTA **Open my portal** (account already auto-created by the webhook,
  `payments.js:487-495`) · secondary WhatsApp link.
- Fix "Back to Services" to return to the buyer's actual service page (carry `service_page`
  through checkout metadata).
- Same treatment for the BCEL modal "Done" state and `cancel.html` ("Nothing was charged —
  prefer to talk it through? WhatsApp us.").

**0.4 BCEL OnePay first-class:** same visual weight as the card button on buy products; button
shows the LAK amount (`price_lak` already in the API); order of buttons flips (QR first) when
the visitor's locale/currency context is Lao — simple heuristic: `lo`/`la` page dirs or a
LAK price present. Keep Stripe first elsewhere.

**0.5 WhatsApp handoff everywhere a form is:** quote modal and consult CTAs gain
"Chat on WhatsApp instead" using the number already in the footer (`wa.me/8562055528034`),
pre-filled: `"Hi — I'm interested in <product> (<option>, <qty/billing>). My name is …"`.
Zero backend. This is the single highest-leverage SEA conversion change in the plan.

**0.6 Quote-received experience:** after submit (`public-api.js:1571` → `form_submissions`),
show a reference-style confirmation ("Got it — quote request #… · we reply within N business
hours") instead of a bare thank-you, mirroring the BCEL reference pattern buyers already trust.

**0.7 CTA i18n:** move the CTA/label strings in `product-loader.js` into a small
`document.documentElement.lang`-keyed map (en/fr/th now, lo ready) so non-English pages stop
showing English buy buttons. (Full Lao rollout is Phase 4.)

### Phase 1 — Checkout that matches the catalog

**1.1 Mini-cart: "Checkout selected (N)" from My Services.** The à-la-carte catalog
(copy + photos + form) currently forces N separate checkouts.
- Portal dashboard + slide-in "My Services" list get checkboxes over the existing
  `saved_services` (`public-api.js:1422-1494`).
- New endpoint `POST /api/payments/create-cart-session`: validates every item is
  `purchase_mode='buy'`, same currency, **one-time only in v1** (no subscriptions in cart —
  Stripe session mode conflict; subscriptions keep single checkout), resolves each to a
  line item via the same branches as today's single-product flow (`payments.js:115-241`),
  creates **one Stripe session with multiple `line_items`**, and one order row per item
  sharing a `cart_id` so portal billing and fulfillment stay per-product.
- Items needing an option/qty prompt for it at cart review (add nullable `option_key`,
  `quantity` to `saved_services`).
- **BCEL cart constraint:** static per-amount QRs can't express an arbitrary cart total.
  v1: BCEL cart checkout renders one combined order + reference with the account/open-amount
  QR and the exact LAK total to type. If no open-amount merchant QR exists, BCEL stays
  per-product and the cart is card-only — decision D3.

**1.2 Deposits for fixed-price consult products.** Standard SEA practice: 30–50% down to
start, balance on delivery.
- New product fields: `deposit_pct` (nullable), enabled per product in the admin form.
- Consult CTA gains secondary button **Reserve with 30% deposit ($105)** → normal checkout
  session flagged `metadata.wts_kind='deposit'`; order records `amount_total_expected`.
- Balance collected later via a balance checkout link from the project (Phase 2) or invoice.
- Keeps "consult" products consultative while letting a ready buyer commit today —
  and a paid deposit auto-creates the project (Phase 2), which is exactly the moment
  clients most need visible progress.

**1.3 Hourly products** get the "Book hours" framing from the CTA matrix: quantity = hours,
estimate note, and "Ask us to estimate" opens quote/WhatsApp. No schema change.

### Phase 2 — The Workboard (core of this plan)

Replaces the Notion iframe with a real order-to-delivery pipeline, client-visible in the
portal, team-managed in the admin. Feature-flagged `FEATURE_WORKBOARD=1`, module layout
copied from `wts-admin/src/modules/whiteboard/` (mount pattern, migrations, i18n, tests).

**2.1 Schema (additive migrations only):**

```sql
projects (
  id uuid PK, customer_id → customers, order_id → orders NULL,   -- NULL = quote-origin
  product_id → products NULL, title text,
  stage text DEFAULT 'received',       -- received|kickoff|in_progress|review|delivered|closed
  status text DEFAULT 'active',        -- active|on_hold|closed
  ball_with text DEFAULT 'team',       -- team|client  ← the trust feature
  next_action text, next_action_due date,
  owner_admin_id NULL, stage_changed_at, created_at, updated_at
)
project_updates ( id, project_id, author_type admin|customer|system,
                  body text, created_at, notify boolean )
-- link existing machinery instead of duplicating it:
ALTER TABLE deliverables        ADD COLUMN project_id uuid NULL;
ALTER TABLE client_action_items ADD COLUMN project_id uuid NULL;
ALTER TABLE boards              ADD COLUMN project_id uuid NULL;  -- whiteboard per project
ALTER TABLE products            ADD COLUMN project_template jsonb NULL;
-- template: { stages?: [...], kickoff_checklist: ["Send brand assets", ...], first_update: "..." }
```

Payment statuses stay untouched — `orders` keeps meaning money, `projects` means work.
(Rejected alternative: extending `ORDER_STATUSES` with fulfillment states — it overloads
one state machine with two lifecycles and breaks existing billing views.)

**2.2 Auto-creation:** in the Stripe webhook (`payments.js:464-519`) and the admin BCEL
confirm (`business.js:865-892`): completed **buy** order → create project from
`project_template` (default template if null), post a system update ("Payment received —
we're on it"), email the portal link. Consult/quote work: admin "Create project" button on
the order row and the customer page. Deposit paid (1.2) → project too.

**2.3 Admin: `/business/workboard`** — kanban, columns = stages, cards = projects showing
client, product, days-in-stage (stale = amber), ball-with, next action. Drag-drop with a
plain `<select>` fallback; filters by owner/service page/stale. Same auth chain as other
admin surfaces (`ensureAuthenticated, ensureAdmin`). Card → project detail: updates feed,
checklist, deliverables upload (existing per-customer upload gains a project picker),
link/create whiteboard board, balance-payment link for deposit projects.

**2.4 Portal: "My Projects"** (evolves the existing Workspace page rather than adding a
ninth nav item): project cards with a 6-step localized progress bar, current stage,
**"Next: <action> — ball is with us / with you"**, latest update, files, and — when stage
= review — an **Approve / Request changes** action (simple project-level approve; full
annotation review stays the whiteboard's job when a board is linked). Existing reports and
action items render inside their project (unlinked ones keep today's layout, so the page
works with zero data migration).

**2.5 Notifications:** email on stage change + non-system updates, in the customer's
`preferred_language` via the existing mailer/i18n (`utils/mailer`, pattern at
`payments.js:417-428`). Digest rule (one email per project per day) to avoid spam.
LINE/WhatsApp notifications: Phase 4 exploration, not now.

**2.6 Retire the Notion embed:** `workboard.html` → redirect to `/portal` (or delete;
it's orphaned). Internal team may keep Notion for non-client ops as long as client-visible
status lives only in the portal — decision D7.

### Phase 3 — Portal as a storefront

- **3.1 `/portal/catalog`** (signed-in): same product data via the public API, grouped by the
  4 service pages (`product-taxonomy.js`), buy CTAs identical to the marketing site (session
  already present). Entry points: nav item under Work, billing empty state, "Add services"
  button on dashboard, post-payment success page.
- **3.2 Post-pay provisioning:** completed order auto-adds the SKU to `saved_services`
  (`ON CONFLICT DO NOTHING`), so "My Services" reflects what the customer actually owns.
- **3.3 Kickoff checklist:** the project template's `kickoff_checklist` materializes as
  `client_action_items` on project creation — the portal immediately asks the client for
  what we need (brand files, access, copy), with `ball_with='client'`. This is the single
  biggest cycle-time saver for a small agency.

### Phase 4 — Trust & ops (ongoing)

- **4.1 Lao locale:** add `lo` to portal `SUPPORTED` (`i18n.js:13`), `locales/lo.json`,
  profile language options (`portal.js:586`), emails, and the Phase-0 CTA string map.
  A Vientiane agency whose buy flow speaks no Lao is leaving trust on the table.
- **4.2 Price privacy decision (D4):** either accept the soft gate as intentional teaser
  (recommended — simpler, SEO-friendly; scraping risk is real but low-stakes for service
  pricing) or gate `/api/public/products` price fields on the portal session cookie
  (CORS is already credentialed same-site). Pick one, document it, stop half-gating.
- **4.3 Stripe catalog hygiene:** extend `scripts/sync-products-to-stripe.js` to mint durable
  Prices per option/tier/period and store `stripe_price_id` on each `price_options` entry —
  cleaner reporting, and payment links become possible per price point.
- **4.4 Payment links for proposals only:** generated per price point (4.3), stored on the
  option, used in quote PDFs/WhatsApp — the site keeps dynamic sessions. Exactly as the
  report recommended.
- **4.5 Funnel analytics:** GA4 events (`panel_open → cta_click → checkout_created → paid`,
  with `payment_method` dimension) emitted from `product-loader.js`, plus a small admin
  funnel widget fed by orders + `payment_webhook_events`.

---

## 6. What we will NOT do (and why)

1. **No static payment link per product replacing checkout sessions** — breaks options/qty/
   subscription logic; the report's own analysis holds.
2. **No guest checkout in v1** — purchase-creates-account via checkout email is working
   and matches the locked guest/signed-in pattern (2026-07-13 decision). Revisit only if
   funnel data shows sign-in as the #1 drop-off.
3. **No third-party cart/e-commerce platform** — the Express + Stripe stack already handles
   the hard parts; a platform migration is months of risk for a 36-SKU catalog.
4. **No fulfillment states inside `ORDER_STATUSES`** — money and work stay separate state
   machines (§5 2.1).
5. **No client-facing Notion** — everything a client sees lives in the portal, in their
   language, behind their login.

---

## 7. Decisions needed from you (D1–D8)

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | CTA matrix wording (§5 0.1) — approve/adjust, incl. response-time promise "N business hours" | N = 4 business hours |
| D2 | Deposits on fixed-price consult: yes/no, default % | Yes, 30% |
| D3 | BCEL cart: is there an open-amount merchant QR we can use for cart totals? | If yes → combined QR + reference; if no → cart is Stripe-only v1 |
| D4 | Price gating: keep soft gate (teaser "from $X" for guests?) or hard-gate the API | Keep soft gate; show "from $X" teaser on cards to feed the funnel |
| D5 | Workboard stage names (client-facing, will be translated) | received / kickoff / in progress / review / delivered / closed |
| D6 | WhatsApp number for product CTAs | footer number +856 20 5552 8034 |
| D7 | Notion: retire fully, or internal-only | Internal-only allowed; client-facing portal-only |
| D8 | Lao locale priority: Phase 4 as planned, or pull forward | Phase 4, unless Lao-market push is imminent |

---

## 8. Rollout & risk

- **Flags:** `FEATURE_WORKBOARD` mirrors the proven `FEATURE_WHITEBOARD` pattern (off →
  module never loads, no tables, no nav). Front-end phases ship behind small, reviewable PRs
  per phase; `product-loader.js` changes are pure-render and fall back exactly like today
  (checkout failure already degrades to the quote modal, `product-loader.js:1388-1401`).
- **Migrations:** additive only; every new column nullable; portal pages render with zero
  project rows (existing Workspace behavior preserved).
- **Testing:** extend `wts-admin/test/portal.test.js` for projects/cart/deposit endpoints;
  Stripe test-mode end-to-end for cart + deposit; BCEL path staged with a test QR.
- **Sequencing safety:** each phase is independently shippable and reversible; no phase
  rewrites an existing flow, they wrap or extend it.

## 9. Success metrics (before → after)

- Slide-in → checkout-created rate, and checkout-created → paid rate (GA4 funnel, 4.5)
- BCEL share of buy orders (expect up after 0.4)
- Quote requests started via WhatsApp vs form (0.5)
- Multi-item orders per cart session (1.1)
- Time from payment → first client-visible update (2.2 target: minutes, automated)
- "Any update?" inbound chat volume per active project (expect down after Phase 2)
- Repeat purchase rate from portal catalog (3.1)
