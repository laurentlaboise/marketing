# Shopping Experience + Workboard — Improvement Plan

**Status: PROPOSAL — nothing in this document is implemented. For review before any change.**

*v2 (2026-07-25): incorporates external review feedback — single-classifier CTA renderer,
guest CTA hierarchy, cart fulfillment edge cases, deposit sequencing split, `ball_with`
staleness guard, Phase 2 split (2A trust core → 2B kanban), independent `FEATURE_CART` /
`FEATURE_DEPOSITS` flags, revised estimates, tightened D1–D8 recommendations.
v3 (2026-07-25, later): Phase 1 redefined as the portal cart (see §10) — D1–D8 approved
and Phase 0 shipped. v3.1: cart approved ("go") and the Phase 1 core implemented; D12
(bank details for transfer totals) is the one still-open input.*

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
  → multi-part project (e.g. website = template + WordPress + SEO content + photos):
    Add to cart across products → portal cart → ONE total → one payment,
    quote-only parts become one combined quote request from the same basket
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
| **0** | Say what it costs, say what happens | CTA matrix by pricing type, card badges, Success page v2, BCEL prominence + LAK display, WhatsApp handoff, quote-received experience, CTA i18n | Very low — copy + front-end only | 4–6 dev-days |
| **1** | **The Cart** *(revised)* | Portal cart at `/portal/cart`: pick parts across the catalog, pay one total (one Stripe session), mixed-cart quote handoff with prefilled WhatsApp item list, bank-transfer total path, deposits, Cart vs My Services concept split | Medium | 8–12 dev-days (1.6 subs +2) |
| **2** | **The Workboard** | `projects` layer, admin kanban, portal "My Projects", auto-create on payment, updates + notifications, whiteboard/deliverables linking, retire Notion embed | Medium — new schema, flagged | 12–16 dev-days (2A trust core → 2B kanban) |
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
| Guest (any buy product) | **Sign in to buy** — the single primary; quote / WhatsApp as visually smaller secondaries, never two equal primaries | replaces quote-only dead end; price teaser per D4 |

Note the guest change: today a guest on a $4 buy product only sees "Request a Quote"
(`product-loader.js:1820-1824`) — a quote request for a $4 SKU. "Sign in to buy" keeps the
locked-pricing pattern but names the path.

Implementation shape: **one `ctaKind()` classifier**
(`pay_fixed | pay_options | pay_qty | subscribe | book_hours | quote_fixed | quote_open`)
feeding **one renderer + i18n keys** — not seven bespoke HTML branches in `buildCtaHTML`
that drift apart. Hourly is copy-only in Phase 0; its hours stepper ships with Phase 1.

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
shows the LAK amount (`price_lak` already in the API); order of buttons flips (QR first) on
Lao pages (`lo`/`la` dirs). Keep Stripe first elsewhere. *(A "LAK price present" trigger was
considered and rejected: nearly every BCEL-enabled product carries a LAK amount, so it would
flip QR-first on EN/FR/TH pages too and contradict "Stripe first elsewhere.")*

**0.5 WhatsApp handoff everywhere a form is:** quote modal and consult CTAs gain
"Chat on WhatsApp instead" using the number already in the footer (`wa.me/8562055528034`),
pre-filled: `"Hi — I'm interested in <product> (<option>, <qty/billing>). My name is …"`.
Zero backend. This is the single highest-leverage SEA conversion change in the plan —
**non-optional in Phase 0.** Implementation notes: the prefill uses the localized product
name as rendered on the page (FR/TH pages must not send English prefills), the `?text=`
parameter is URL-encoded UTF-8, and a `cta_whatsapp` GA4 event fires from day one — ahead
of the full funnel work in 4.5.

**0.6 Quote-received experience:** after submit (`public-api.js:1571` → `form_submissions`),
show a reference-style confirmation ("Got it — quote request #… · we reply within N business
hours") instead of a bare thank-you, mirroring the BCEL reference pattern buyers already trust.

**0.7 CTA i18n:** move the CTA/label strings in `product-loader.js` into a small
`document.documentElement.lang`-keyed map (en/fr/th now, lo ready) so non-English pages stop
showing English buy buttons. (Full Lao rollout is Phase 4.)

### Phase 1 — The Cart: pick parts, pay one total in the portal *(revised 2026-07-25)*

**The scenario this is built for:** a client building a website doesn't buy one product —
they assemble a project from parts: a Divi template + WordPress setup + SEO articles +
stock photos. Some of those parts are self-serve buys, some need a quote. The cart lets
them **pick and choose across the whole catalog**, see one running total, and **pay that
total inside their portal** — with the parts that need a conversation turning into one
combined quote request instead of blocking the payment.

**1.0 Concept split — Cart vs My Services.** Today `saved_services` doubles as wishlist
and "my stuff", which is why it can't check out. Split the concepts:
- **Cart** = pre-purchase. The existing `saved_services` table becomes its storage
  (gaining `option_key`, `quantity`), so the guest-localStorage → account migration that
  already exists (`product-loader.js` `migrateLocalSaved`) keeps working unchanged.
- **My Services** = owned. Derived from completed orders (Phase 3.2 provisioning), shown
  on the dashboard as what the client actually has — not what they once bookmarked.
- Buttons relabel accordingly: panel "Add to My Services" → **Add to cart** (localized:
  Ajouter au panier / เพิ่มลงตะกร้า / ເພີ່ມໃສ່ກະຕ່າ); paying removes the purchased lines
  from the cart.

**1.1 Add-to-cart surfaces (marketing site, light JS).** Every product panel keeps its
add button (now "Add to cart"), including consult products — quote-first parts belong in
the same project basket. The floating account pill and panel show a cart count badge
linking to `/portal/cart`. Guests keep the existing localStorage path; sign-in migrates.

**1.2 Portal cart page — `/portal/cart` (EJS in wts-admin, `requireCustomer`).** The heart
of the feature, same-origin with the API so auth is just the session cookie:
- Lines grouped in two sections: **Ready to pay** (buy products, with option/qty pickers
  inline — a line missing its option shows a "choose" prompt) and **Needs a quote**
  (consult products).
- Live totals per line and one **subtotal for the payable section**, server-computed from
  the products table on every render — prices are never trusted from the client and never
  snapshotted stale.
- Primary CTA: **Pay $X now** (payable section). Secondary: **Request one quote for the
  rest (N items)**. Tertiary: remove line / keep for later.
- Empty state and "add more" link to the service pages (full in-portal catalog remains
  Phase 3).

**1.3 Pay the total — one Stripe session.** `POST /portal/cart/checkout`:
- Validates every payable line (`purchase_mode='buy'`, same currency, option resolved via
  `findPriceOption`, qty via tiers), reusing the exact pricing branches of today's
  single-product flow (`payments.js:115-241`).
- Creates **one Stripe Checkout session with N `line_items`** and one order row per item
  sharing a `cart_id` (new nullable column on `orders`) — billing and fulfillment stay
  per-product; the billing page groups rows by `cart_id`.
- **v1 payable scope: one-time items only.** Subscriptions stay single-product checkout
  (v1.5 below lifts this).
- Success returns **into the portal** (`/portal/cart/success?cart_id=…`): same
  "what happens next" pattern as the Phase 0 pages, plus the order references and — once
  Phase 2 lands — the link to the project it created.
- **Fulfillment edge cases (unchanged from v2, still binding):** (a) webhook retries must
  be idempotent — project auto-creation guards on "no project exists for this
  `cart_id`/`order_id`" before insert, same guard on the admin BCEL confirm path; (b)
  refunding one line cancels that order row (and its project component) only, never the
  whole cart; (c) checkout stays disabled until every payable line has option/qty resolved.

**1.4 The quote side of a mixed cart.** "Request one quote for the rest" submits a single
`form_submissions` entry listing every quote line (product, option, qty) tagged
`source: 'portal-cart'` — one coherent project enquiry instead of N fragments — and offers
the WhatsApp handoff with the **item list prefilled into the message**. In SEA terms this
is the feature: the client walks into the chat with their basket already written out.
Quote lines stay in the cart (badge: "quote requested") until closed or converted.

**1.5 BCEL / bank transfer for the cart total.** Static per-amount QRs can't express an
arbitrary total, so the portal path is a **combined transfer order**: one order row set
`awaiting_payment` with a WTS-reference, showing the exact LAK total, the account details
(`BCEL_ACCOUNT_NOTE` env already exists) and/or an open-amount merchant QR if the bank
provides one (D12). Admin confirms in the existing `/business/payments` panel — the same
reference-match flow BCEL buyers already use per-product. Stripe-only until the account
details/QR are provided.

**1.6 (v1.5) Subscriptions in the cart.** Stripe Checkout `mode='subscription'` supports
one-time line items alongside recurring ones **if all recurring items share one billing
interval**. So a cart with one-or-more same-interval subscriptions + any one-time items
can still be a single session. Ship after 1.3 stabilizes; mixed-interval carts prompt the
client to check out the odd subscription separately.

**1.7 Deposits for fixed-price consult products** (unchanged from v2, now naturally
riding on the cart): `deposit_pct` per product; a quote-section line with a deposit-enabled
product shows **Reserve with 30% deposit** which joins the payable section as a
`metadata.wts_kind='deposit'` line. Balance collection wires up with Phase 2's project
view. Phase 1 ships mechanics only — no promised project view before Phase 2.

**1.8 Hourly products** keep the "Book hours" framing from Phase 0; the hours stepper
lands with the cart's qty picker (same control).

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
the order row and the customer page. Deposit paid (1.7) → project too.
**Cart orders create ONE project, not N.** A paid cart (shared `cart_id`) is one client
intent — "build my website" — so it becomes a single project titled from its dominant
service page ("Web Development project — 4 items"), with each order line listed as a
project component in the scope/checklist. Four disconnected projects for template + WP +
SEO + photos would misrepresent the work and quadruple the client's board noise.
Single-item orders keep the one-order-one-project rule. Idempotency guard is on `cart_id`
for cart orders, `order_id` for singles.

**2.3 Admin: `/business/workboard`** — kanban, columns = stages, cards = projects showing
client, product, days-in-stage (stale = amber), ball-with, next action. Drag-drop with a
plain `<select>` fallback; filters by owner/service page/stale. Same auth chain as other
admin surfaces (`ensureAuthenticated, ensureAdmin`).
**Build order:** 2A ships the trust core first — stages, `ball_with`, updates feed, portal
progress, auto-create, and an admin **list** view with filters; 2B adds the drag-drop
kanban. If capacity is tight, 2B slips and 2A doesn't.
**Staleness guard (protect the killer feature):** a stage change prompts for — and
default-requires — an updated `next_action` + `ball_with` before saving. A board whose
cards move while next-actions go stale reads as neglect and costs more trust than having
no board at all. Card → project detail: updates feed,
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
  4 service pages (`product-taxonomy.js`), with **Add to cart** CTAs feeding the Phase 1
  cart (plus direct pay for single items). Entry points: cart empty state and "add more"
  link, nav item under Work, billing empty state, post-payment success page.
- **3.2 Post-pay provisioning:** ownership derives from completed orders (the dashboard's
  "My Services" renders owned products from `orders`, not from bookmarks), and paying a
  cart clears its purchased lines — the cart table (`saved_services`) stays pre-purchase
  only, per the 1.0 concept split.
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
   funnel data shows sign-in as the #1 drop-off — call that revisit "Phase 1.5". When it
   comes, the engineering is already done (checkout provisions the portal account via the
   webhook, `payments.js:487-495`); what's open is purely the price-visibility product
   decision (D4), since a guest can't buy a price they can't see.
3. **No third-party cart/e-commerce platform** — the Express + Stripe stack already handles
   the hard parts; a platform migration is months of risk for a 36-SKU catalog.
4. **No fulfillment states inside `ORDER_STATUSES`** — money and work stay separate state
   machines (§5 2.1).
5. **No client-facing Notion** — everything a client sees lives in the portal, in their
   language, behind their login.

---

## 7. Decisions needed from you (D1–D14)

*(D1–D8 were approved 2026-07-25 — see §10. D9–D14 are the cart pivot's open calls.)*

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | CTA matrix wording (§5 0.1) — approve/adjust, incl. response-time promise "N business hours" | Honest SLA only: 4 business hours if ops can truly hit it, else promise 1 business day — under-promise beats a broken promise |
| D2 | Deposits on fixed-price consult: yes/no, default % | Yes, 30% — **opt-in per product** (start with Landing Page Sprint + site packages), not global |
| D3 | BCEL cart: is there an open-amount merchant QR we can use for cart totals? | Assume **no** until verified in the bank app; cart v1 ships Stripe-only either way, BCEL stays per-product — don't block Phase 1 on bank ops |
| D4 | Price gating: keep soft gate (teaser "from $X" for guests?) or hard-gate the API | Keep soft gate; guest teaser only on buy + fixed products ≤ $50, never on consult packages — and record this as an **explicit amendment** to the 2026-07-13 locked guest pattern |
| D5 | Workboard stage names (client-facing, will be translated) | received / kickoff / in progress / review / delivered / closed |
| D6 | WhatsApp number for product CTAs | footer number +856 20 5552 8034 — **verify it is the active sales / WhatsApp Business number** (vs any ads number) before launch |
| D7 | Notion: retire fully, or internal-only | Internal-only allowed; client-facing portal-only |
| D8 | Lao locale priority: Phase 4 as planned, or pull forward | Phase 4, unless Lao-market push is imminent |
| D9 | Cart vs My Services concept split (§5 1.0): cart = pre-purchase (`saved_services` + option/qty), My Services = owned (derived from orders) | Yes — one list can't be both a wishlist and a checkout; the split is what makes "pay one total" possible |
| D10 | Mixed cart: consult items join the basket and become ONE combined quote request (form or WhatsApp with the item list prefilled) instead of blocking payment | Yes — this is the "build my website from parts" scenario working end-to-end |
| D11 | Cart naming: "Cart" / "Add to cart" (localized) vs a softer "My plan" | "Cart" — universally understood, matches the shopping mental model |
| D12 | Bank-transfer cart totals: provide the BCEL account details (and/or an open-amount merchant QR) to display beside the WTS reference | Needed from you — until then the cart total is Stripe-only and BCEL stays per-product (supersedes D3's open question) |
| D13 | Subscriptions in the cart (v1.5): allowed when all recurring lines share one billing interval; odd intervals check out separately | Accept the one-interval limit — it covers almost every real cart |
| D14 | A paid cart becomes ONE project on the workboard (components as a checklist), not N separate projects | Yes — matches the client's intent ("build my website") and keeps the board readable |
| D15 | BCEL QR hosting: admins upload the QR screenshot in the product form and the site serves it from its own URL (`/api/public/qr/:id`), instead of pasting externally hosted image links | Done — uploads auto-append a BCEL price point; external URLs still accepted for existing rows |
| D16 | Stripe cancel landing: abandoning Stripe Checkout returns to the portal cart with a "nothing was charged, your cart is saved" notice, not a dead end | Done — cart is the recovery point; one tap retries the same payment |
| D17 | Cart payment UX: Stripe Embedded Checkout in a right-hand slide-in panel on the cart (same drawer pattern as other sidebars) instead of navigating away; closing the panel cancels with the cart intact. Root cause of the "Pay does nothing" stall was CSP `form-action 'self'` cancelling the browser's redirect to Stripe — fixed, and the no-JS fallback keeps the hosted redirect. Needs `STRIPE_PUBLISHABLE_KEY` in the deploy env; without it the panel falls back to the hosted page | Done — payment errors now show inside the panel instead of failing silently |

---

## 8. Rollout & risk

- **Flags:** `FEATURE_WORKBOARD` mirrors the proven `FEATURE_WHITEBOARD` pattern (off →
  module never loads, no tables, no nav). `FEATURE_CART` and `FEATURE_DEPOSITS` gate the two
  risky checkout additions independently, so a buggy cart can never block the Phase 0
  CTA/i18n wins (deposits are additionally off per-product: `deposit_pct` null = no deposit
  CTA). Front-end phases ship behind small, reviewable PRs
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

---

## 10. Decision log

**2026-07-25 (evening) — Flow pivot per Laurent: the site sells the basket, the portal takes the payment.**

Direction: clients browse the marketing site, pick products and quantities, and the cart
in the client portal is the ONLY place money moves — one payment for everything, never a
per-product jump to a payment page, and no individual payments for multiple purchases.
The portal AI should also suggest and load products into the cart.

Implemented:
- *Marketing site (`product-loader.js`)* — every buy product's primary CTA is now
  **Add to cart** (guests included; their localStorage cart migrates at sign-in). The
  per-product "Pay now → Stripe" jump is gone. New hours picker for hourly products
  (`bindHoursSelector`) so quantity rides into the cart line. "Due today" became "Total"
  (nothing charges on the site). Sub-note explains: pay one total from the portal.
  *Kept:* the BCEL QR in-panel modal as a small secondary on BCEL products — Laos's only
  self-serve rail until D12 provides cart transfer totals.
- *Portal cart (`portal-cart.js`, `cart.ejs`)* — **subscriptions join the single
  payment**: recurring lines enter "Ready to pay" with a per-line billing-cycle selector,
  checkout builds ONE Stripe session (`mode=subscription` when recurring lines exist;
  one-time lines + setup fees ride the first invoice). Stripe's one-interval-per-session
  rule surfaces as a "align your billing cycles" notice with the selector as the fix.
  Total box shows "Then $X/mo until cancelled". The old
  "subscriptions check out individually" section is gone.
- *Portal AI (`strategist.js`, `portal.js /chat`, `chat.ejs`)* — the strategist knows the
  full active catalog and marks recommendations with a machine-readable SUGGEST line; the
  chat strips it, resolves ids against the live catalog, and renders **tap-to-add cart
  cards** (AI proposes, client taps, normal cart endpoint adds). Odysseus backend remains
  text-only.

**2026-07-25 (later still) — Cart approved ("go"); Phase 1 core implemented on this branch.**

D9–D14 locked with the recommended defaults: concept split (D9), mixed cart with combined
quote (D10), named "Cart" (D11), **totals Stripe-only until bank details arrive** (D12
still open — send the BCEL account details / open-amount QR to enable transfer totals),
one-interval subscription rule accepted for v1.5 (D13), cart → one project (D14, lands
with Phase 2 — `orders.cart_id` is already stamped).

*Implemented (Phase 1 core):*
- `database/db.js` — `saved_services.option_key/quantity/quote_requested_at`,
  `orders.cart_id` (+ partial index), all additive `IF NOT EXISTS`.
- `src/routes/portal-cart.js` (new) — `/portal/cart`: server-priced line resolution
  (options/tiers/one-time/hourly), payable + subscription + quote buckets, option/qty
  update + remove, **checkout: one Stripe session with N line items → one order row per
  line sharing `cart_id`**, in-portal success page, combined quote request
  (`form_submissions`, kind `cart_quote`) + WhatsApp link with the basket prefilled,
  `FEATURE_CART=0` kill-switch.
- `src/routes/portal.js` — cart mount + per-render `featureCart`/`cartCount` locals.
- `src/routes/payments.js` — webhook clears purchased cart lines (idempotent).
- `src/routes/public-api.js` — my-services accepts/returns `option_key`/`quantity`.
- `views/portal/cart.ejs`, `cart-success.ejs`, nav item with count badge,
  `locales/en.json` + `th.json` (43 cart keys each).
- `js/services/product-loader.js` — "Add to My Services" → **Add to cart** (4 langs),
  chosen option/qty ride along into the cart line, consult products get the add button
  (signed-in), account pill shows a live cart-count "View cart" link, added-toast.

*Deferred, per plan:* deposits (1.7), subscriptions-in-cart (1.6), BCEL/transfer totals
(1.5 — blocked on D12), in-portal catalog (Phase 3).

**2026-07-25 (later) — Cart pivot requested; Phase 1 redefined (D9–D14 were open at this point).**

Laurent's direction: clients assembling a project (e.g. a website = Divi template +
WordPress + SEO content + images) should pick and choose across the catalog and **pay one
total inside the client portal**. Phase 1 was rewritten from "mini-cart checkboxes on My
Services" into a full portal cart (§5 1.0–1.8): Cart vs My Services concept split, add-to-
cart on every product, `/portal/cart` with a payable section and a quote section, one
Stripe session for the total, combined quote request with WhatsApp item-list prefill for
the consult lines, bank-transfer path for totals, and cart → ONE workboard project
(§5 2.2, D14). No implementation yet — this entry records the plan change only.

**2026-07-25 — Plan approved ("ok go"); Phase 0 implemented on this branch (merged in PR #331).**

| # | Decision |
|---|----------|
| D1 | SLA promise ships as **"within 1 business day"** (under-promise). It is a single string per surface (`slaPromise` in `product-loader.js`, plus the checkout pages) — flip to "4 business hours" once ops confirms it is consistently hittable. |
| D2 | Deposits 30%, opt-in per product — lands with Phase 1. |
| D3 | Cart v1 is Stripe-only; BCEL stays per-product until an open-amount merchant QR is verified in the bank app — Phase 1. |
| D4 | Soft gate kept; guest teaser implemented for buy + fixed one-time ≤ $50 (`GUEST_TEASER_MAX`). This formally amends the 2026-07-13 locked guest pattern. |
| D5 | Workboard stages approved as written — Phase 2. |
| D6 | WhatsApp CTAs use the footer number +856 20 5552 8034 (single `WHATSAPP_NUMBER` constant) — **verify it is the active sales line before announcing**. |
| D7 | Notion stays internal-only; the `workboard.html` redirect lands with Phase 2.6. |
| D8 | Lao locale remains Phase 4; the Phase 0 string map already carries `lo` keys. |

### Phase 0 — implemented (this PR)

- `js/services/product-loader.js` — `ctaKind()` classifier + one CTA renderer; localized
  string map (en/fr/th live, lo ready) via `tr()`; "Activate service" replaced by per-type
  labels with live amounts (option picker, quantity selector and billing toggle keep the
  label in sync); guest hierarchy (Sign in to buy primary; quote + WhatsApp secondaries);
  Self-serve/Quote card badges; ≤ $50 guest price teaser; BCEL OnePay as a co-equal solid
  button with the LAK amount (QR-first on Lao pages); WhatsApp handoff on consult CTAs,
  guest CTAs and the quote modal, all firing `cta_whatsapp` GA4 events; quote-received
  confirmation carries the SLA promise + WhatsApp follow-up link.
- `wts-admin/src/routes/payments.js` — `order-status` additionally returns `reference`
  (WTS-XXXXXXXX, same shape as BCEL) and `service_page`. Additive, backwards-compatible.
- `en|fr|th/checkout/success.html` — reference row, "what happens next" steps, Open-portal
  + WhatsApp buttons (reference prefilled), service-page-aware back link, and a standard
  GA4 `purchase` event (`transaction_id` = order reference, so GA4 deduplicates repeat page
  loads). Also fixed a live bug: the Thai page's Product label contained a leaked
  translation-prompt string shown to every Thai buyer.
- `en|fr|th/checkout/cancel.html` — reassurance, WhatsApp / alternative-payment path
  (BCEL, bank transfer), back link now goes to the services hub.

### Phase 0 — conscious deferrals

- Quote/login modal internals stay English for now (full modal i18n rides with the Lao
  pass in Phase 4).
- Quote requests have no server-issued reference id yet (needs a `/submissions` response
  change — bundled into Phase 1 backend work).
- Hourly products got the "Book hours · $X/hr" label + hint only; the hours stepper ships
  with Phase 1 as decided.
