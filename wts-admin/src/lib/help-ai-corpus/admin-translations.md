# Translations platform — area reference

Source language is English; target languages are Thai (th), Lao (la), French (fr). Translatable content types: article, glossary, seo_term, guide, product, page.

## Row lifecycle (status meanings and allowed moves)
- pending — created by a sync sweep, no draft yet (also where AI-drafted rows return on a full redo, and where published rows go when the English source changes). → translating or requires_review.
- translating — a translator is drafting (the first workspace save claims the row). → requires_review, pending.
- requires_review — submitted or AI-drafted; waiting for admin review or verifier sign-off. → published, rejected, translating, verified.
- verified — a native-speaker verifier approved it. → published, translating, rejected.
- published — live on the site; read-only for translators. Reopening or a source-text change sends it back to translating/pending. Re-publishing never double-pays.
- rejected — returned to its translator for rework (with a coded reason: mistranslation, tone, terminology, markup, incomplete, other). → translating, requires_review.

## Admin pipeline (/translations — superadmin)
- Sync / Sync pages: idempotent sweeps that create missing rows and flag published rows whose English source changed.
- AI batch: drafts up to 500 rows per run; Lao can pivot from a trusted Thai sibling. Status poll has its own rate budget.
- Retranslate (per row): AI redraft — blocked (409) if the row is human-assigned, verified, or published.
- Assign / Assign verifier: translator must have the row's language; the verifier must be a different person than the row's translator.
- Approve (publish): from requires_review or verified. First click may return warnings (missing rate card, empty/untranslated content, markup drift, length anomaly, termbase) that must be acknowledged before it publishes. Publishing writes payout credits.
- Reject: returns the row with a reason; clears section sign-offs.
- Publish verified: bulk-publishes verified rows (up to 100 per call).

## Translator workspace (/translations/workspace)
- Two queues: Translate (own claimed rows + unclaimed pending/rejected in assigned languages) and Verify (other people's requires_review drafts — never your own).
- Save claims the row; Submit sends it to requires_review and is blocked until some draft content is saved. Published rows are read-only.

## Verification (/translations/verify/:id)
- Only requires_review or verified rows open. Lao rows show a read-only Thai reference column, plus an approved-terms side panel.
- Sections are saved and ticked individually; Approve warns if sections are unticked (acknowledge to proceed). Return sends human drafts to rejected and AI drafts to pending.

## Vendors, rates, payouts (superadmin)
- Invite vendor: creates a translator account with a set-password link valid 7 days (the link is shown to the admin even if email fails).
- Rate cards: per_word, per_1000_chars, per_article, or fixed; work types translation / verification / edit; most-specific card wins (worker+language > worker > language > global).
- Payout ledger: credits become available at publish; workers request payouts from earnings (bundled per currency, minimum payout applies); requests move requested → processing → completed, or are cancelled back to available.

## Limits
- Interactive routes: about 600 requests per 15 minutes per user; heavy auto-save flows are sized for this.
- Rejection notes are capped at 1,900 characters.
