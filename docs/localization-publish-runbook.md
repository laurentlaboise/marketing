# Localization publish runbook — how the first Thai pages go live

**Written:** 2026-07-12 · **Companion to:** [localization-gaps.md](./localization-gaps.md)

Answers the question that blocks everything else: *what exactly has to happen for
`/th/...` to stop being a 404?* Every claim below is read out of the code, with
file:line so it can be re-checked when the platform changes.

---

## 1. The publish path (as built)

### Status machine
`wts-admin/src/lib/translation-core.js:72-89`

```
pending → translating → requires_review → published
                              ↓               ↑
                           verified ──────────┘
```

Only `status = 'published'` is ever exposed publicly
(`wts-admin/src/routes/public-api.js:1381`). Nothing else leaks: drafts,
AI output and verified-but-unpublished rows are invisible to the site.
**This is why the generator writes zero files — it is behaving correctly.**

### Who may publish

| Route | Guard | Effect |
|---|---|---|
| `POST /translations/:id/approve` | `ensureSuperAdmin` | one row → `published` (`translations.js:662`) |
| `POST /translations/publish-verified` | `ensureSuperAdmin` | bulk: all `verified` rows, **max 100 per call** (`translations.js:1743-1749`) |

Both guards are **session-cookie SuperAdmin**. `src/routes/machine-api.js` — the
token-authenticated surface — exposes pricing, glossary, menus and footers, but
**has no translation endpoints at all**. There is therefore **no headless publish
path**: publishing requires Laurent (or another SuperAdmin) signed into the admin
UI. That is the blocking constraint, and it is a deliberate one — publishing is
the financial gate (it credits vendor ledgers, `translations.js:706`).

### The AI batch cannot publish (safe to run)

`POST /translations/ai-batch` drafts with a model and writes the row back as
`status = 'requires_review'` (`ai-translator.js:448`) — never `published`, never
`verified`. It only picks up rows that are `pending`/`translating`/
`requires_review` **and unclaimed by a human vendor** (`ai-translator.js:259`).

So the AI batch is exactly the "draft only, human reviews before it ships" path
the brief asked for. Running it is reversible and publishes nothing.

---

## 2. Steps to publish the first Thai pages

All in the admin UI at <https://admin.wordsthatsells.website/translations>, as SuperAdmin.

1. **Import the English pages.** *Sync pages* → `POST /translations/sync-pages`
   (`translations.js:205`). Reads the `en/` tree (or the live sitemap) into
   `site_pages` and creates the `translations` rows. Idempotent — safe to re-run.
   Tick **tier-1 only** to limit it to the money pages.
2. **Create the missing rows.** *Sync* → `POST /translations/sync`
   (`translations.js:220`). Also idempotent.
3. **Draft Thai with AI.** *AI batch* → languages `th`, entity types `page`,
   start with `limit = 5` on the money pages. Preview counts first via
   *AI batch → preview*. Output lands in **requires_review**, published nothing.
4. **Review each row** at `/translations/review/:id`. This is the human gate —
   nobody but a Thai reader should wave these through.
5. **Publish.** *Approve* on the row. The pre-publish gate may answer `409` with
   `requiresAcknowledgement` + a list of warnings (empty/untranslated fields,
   markup drift, unused approved glossary terms, missing vendor rate cards);
   read them, then re-submit with acknowledgement to confirm.

Recommended first batch (from the gaps doc): `/en/` home,
`/en/digital-marketing-services/`, `/en/prices/`, `/en/contact/`.

### Then the site regenerates itself

Approve dispatches the `localize-site.yml` GitHub workflow
(`translations.js:720` → `src/lib/github-content.js`). That workflow already:

1. runs `generate-localized-pages.js --api $WTS_ADMIN_URL --update-en-hreflang`,
2. runs `inject-footers.js --source`,
3. regenerates the sitemap, runs the hreflang audit, and commits.

**No manual generator run is needed.** It needs the repo variable
`WTS_ADMIN_URL` to be set (Settings → Secrets and variables → Actions →
Variables) — if it is missing the workflow fails fast with a clear error, and
publishing still succeeds (the dispatch is best-effort, `translations.js:594`).
The generator is idempotent, so a missed dispatch self-heals on the next run.

---

## 3. What this PR changed, and why it had to

The language switcher was **not** actually safe. The "coming soon" spans in the
110 `en/*.html` files were a hand-edit; `scripts/inject-footers.js` still baked
crawlable `<a href="/th/…">` links for all four languages, unconditionally. Since
`inject-footers.js` runs in `npm run build` **and as step 2 of `localize-site.yml`
above**, the very first Thai publish would have re-linked `/th/`, `/la/` and
`/fr/` on *every* page — including the ~106 with no Thai translation — putting
the 404s straight back, at exactly the moment Google was invited to re-crawl.

The switcher is now derived from **files on disk**: a language is linked only
where its mirror really exists, otherwise it renders the inert `lang-soon` span.
This is the same rule the generator already uses for hreflang clusters
(`generate-localized-pages.js:160-167`), so the two surfaces now agree — and the
restore in task 4 of the brief happens **automatically**, per page, as each
translation is published. There is nothing left to hand-edit back.

---

## 4. Watch items (not fixed here)

- **`LIMIT 500` on the published-translations feed** (`public-api.js:1383`) is not
  paginated. Pages are ~110, so this is fine today; if published glossary +
  article rows for one language ever exceed 500, the generator silently sees a
  truncated set. Worth pagination before the glossary backlog lands.
- **`publish-verified` caps at 100 rows per call** (`translations.js:1747`) and
  reports `published: n` without saying more remain — re-run until it returns 0.
