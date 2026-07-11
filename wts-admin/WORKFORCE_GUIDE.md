# Workforce Platform (Verification Pay · Leads CRM · Engagement)

Part 3 of the localization platform — the operational layer for the four
position briefs (Content Verifier, Content & Engagement Associate, Lead
Verifier, Cascade Coordinator). Everything pays into the same
`payout_ledger` and settles through the existing payout-request pipeline.
All amounts below are the briefs' figures, seeded as **editable defaults**
("prices not set in stone").

## Write vs check vs rework — the three translation rates

Lao and Thai have no word breaks, so pay is metered **per 1,000
characters** of target text (counted automatically, tags stripped).

| Work | Who | Meter | Seed default (kip) |
|---|---|---|---|
| `translation` | the human translator | target chars / words / flat | 45,000 / 1,000 chars (lo) |
| `verification` | the native verifier | target chars read | 30,000 / 1,000 chars |
| `edit` | the verifier, on top | chars of segments they changed | 15,000 / 1,000 chars |

Flow: AI (or a human) drafts → row sits in `requires_review` → a verifier
opens it in **My Workspace → To Verify** (never their own translation),
fixes light issues directly, and either **Approves** (→ `verified`) or
**Returns** it for a full re-do. The draft is snapshotted at claim time,
so edit pay is measured against what the verifier actually changed — the
admin review page shows chars read, segments reworked, and who did what.

Publishing (single or **Publish all verified**) writes every credit in
one transaction: `translation_credit` to the translator (AI rows credit
nothing), `verification_credit` + `edit_credit` to the verifier. Each
credit happens at most once per row — reopen → re-publish never
double-pays. Admins can still publish straight from `requires_review`
for languages without a verifier.

## Leads CRM (`/workforce/leads`, worker hub `/workforce/my`)

The CRM is the single system of record: a lead only exists once entered
and de-duplicated (digits-only phone match), and only entered records can
pay. Status ladder — `new → entered → call_verified → qualified →
converted`, with `junk` paying nothing.

| Work unit | Seed default |
|---|---|
| Clean data entry | 1,500 kip |
| Directory record verified by call | 5,000 kip |
| Qualified lead (marginal monthly tiers) | 1–20: 20,000 · 21–50: 28,000 · 51+: 35,000 kip |
| Conversion bonus | 3% of sale, floor 50,000 kip — or flat when no % set |

Workers capture and claim milestones from their hub; **admin approval is
what credits money** ("Approve & credit" pays every reached, unpaid
milestone; idempotent). Tiers are marginal: lead #21 pays the 21–50 rate,
earlier leads keep theirs. Form submissions import into the CRM with one
click (Leads CRM → Import Submissions). The 15,000-record directory
backlog: create the records (CSV → leads with source `directory`), assign
batches to workers, they claim `call_verified`, you approve.

## Engagement & cascades (`/workforce/engagement`)

Track B (community responses) and the cascade model (1 → 3 → 9 → 27 in
staggered waves) log one row per unit with the URL as proof: track,
group, wave 1–3. Admin approves (single or all) → per-unit credit
(seed: 3,500 kip/response, 5,000 kip/share — the cascade brief reserves
numbers, so the share rate is a placeholder). Rejected rows pay nothing.

## Teams & positions

**Team & Vendors** assigns each worker a position from the briefs
(`content_verifier`, `engagement_associate`, `lead_verifier`,
`cascade_coordinator`, `translator`) and a manager (e.g. associates under
a Cascade Coordinator). Any payable vendor (`is_vendor`) gets the worker
sidebar: My Work Hub, My Workspace (translators), My Earnings.

## Money

- Kip credits and USD credits live side by side; balances, earnings and
  payout requests are grouped **per currency** (kip displays without
  decimals). Requests snapshot banking details as before.
- Retainers/stipends (the briefs' monthly base tiers) are recorded as
  manual ledger adjustments for now — the overflow/per-unit meters above
  are what's automated. Configure bases per person once volumes settle.

## Setup

```bash
# Seed the briefs' rates (idempotent — never overwrites your edits):
railway run node scripts/setup-workforce.js seed-rates

# Then per worker, in Team & Vendors:
#   role translator (for translate/verify) or user + payable vendor,
#   assigned languages, position, manager.
```

Rates live in **Localization → Payout Ledger**: translation rate cards
(work × language × vendor) and work-unit rates (leads, community,
cascades, with tier JSON and bonus fields).

## Front-end language behaviour

- `/` routes by saved choice (`wts_lang` cookie) → browser language → English.
- Every page shows the EN / ไทย / ລາວ / FR switcher (header pill + footer).
- Visitors whose browser language differs from the page language get a
  dismissible "view this in …" banner — a suggestion, never a forced
  redirect, so SEO is unaffected.
