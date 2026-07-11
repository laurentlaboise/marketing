# WTS Client Portal — how it works (help reference)

## Signing in
- Passwordless by default: the customer requests a magic link by email. Links are single-use and expire after 15 minutes.
- Optional password sign-in works only after the customer sets a password in Profile. Social sign-in (Google/Facebook) buttons appear when enabled.
- Login endpoints are rate-limited (about 8 attempts per 15 minutes) — if locked out, wait a few minutes and retry.
- Sessions last up to 30 days. If an account is not active, all sign-in methods are blocked and the customer must contact the team.

## Dashboard & Orders (/portal/)
- Home page shows order history, stats, recent files, saved services, and two quick-request forms: "Request new content" and "Ask a question" (messages up to 4,000 characters). The team replies by email within one business day.
- Order statuses:
  - pending — card checkout was started but not finished.
  - awaiting_payment — a BCEL OnePay QR order; the customer transfers by bank and MUST include the WTS-XXXXXXXX reference in the transfer note; the team matches it manually, so completion is not instant.
  - completed — paid; downloads for digital products unlock.
  - expired — the card checkout session expired without payment.
  - cancelled — cancelled by the team.
- Payment methods: card via Stripe, or BCEL OnePay bank transfer (Laos).
- Orders placed with the same email before the account existed are linked automatically at login.

## Billing (/portal/billing)
- View-only money summary: totals paid per currency (USD and LAK can both appear), awaiting-transfer count, active subscriptions, and payment history.
- "Total paid" counts only completed orders. "Active subscriptions" are completed orders of subscription products.
- There is NO self-serve subscription cancel and no self-serve invoice download — both go through the dashboard request form ("Ask a question").
- Some amounts can show as "—" (legitimate for certain card checkouts).

## Files (/portal/files)
- Lists deliverables the WTS team shared with this customer (reports, designs, final assets). Some entries are stored files ("Download"), others are external links ("Open").
- Customers cannot upload files here — to send something to the team, use the dashboard request form.
- Downloads are private to the signed-in customer.

## Partner programs (/portal/programs)
- Three programs: affiliate, dropship, white label. Applying is self-serve; approval is by a human on the WTS team.
- Enrollment statuses: pending (submitted, awaiting decision), active (approved), rejected (declined — the customer may re-apply, which sets it back to pending), suspended (paused by staff; not self-serve reversible).
- The optional application note is capped at 1,000 characters. Staff notes on a decision are shown on the page.

## Profile (/portal/profile)
- Edit name, company, phone; email cannot be changed (contact the team for that).
- Set or change an optional password (minimum 8 characters; both fields must match). Setting a password never disables magic-link login.
- Portal language: English or Thai.

## This chat (/portal/chat)
- Messages up to 2,000 characters; about 20 messages per 15 minutes; the conversation remembers roughly the last 12 turns.
