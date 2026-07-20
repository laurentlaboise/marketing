# Footer rendering (SEO-safe)

> **Important — GitHub Pages serves the committed source HTML for this repo, not
> the webpack `dist` artifact.** So the footer must be baked into the **source**
> files. `npm run inject-footers -- --source` (and the `footer-sync` workflow)
> rewrite `en/**` (and other language dirs) in place; the dist-mode injection in
> `npm run build` remains as a no-op safety net in case Pages is ever switched to
> deploy the Actions build. When the admin **Publishes** (commits `footers.json`),
> the `.github/workflows/footer-sync.yml` workflow re-bakes the footer into the
> source HTML and commits it, so the live site reflects the back-end.



The site footer is rendered into every page's HTML **at build time** so search
engines and no-JS clients get a real, fully-linked footer in the raw HTML.
This replaces the earlier client-side `footer-loader.js` approach (which left
the footer empty in the source HTML and was a crawlability risk).

## How it works

1. **`footers.json`** (repo root) is the build-time source of truth. It defines:
   - `variants` — named footers (e.g. `main`). Each variant holds `social`,
     `contact`, `columns`, `legal` and `copyright`.
   - `assignments` — URL-pattern → variant (`/en/resources/*` → `keep`, etc.).
     `keep` leaves a page's existing footer untouched; exact paths and `/*`
     suffix wildcards are supported.
   - `default` — the variant for any page without a matching assignment.
2. **`npm run build`** runs webpack, then `node scripts/inject-footers.js`.
   The injector walks `dist/**/*.html`, picks each page's variant, and rewrites
   only the three dynamic regions of its `<footer class="footer">` —
   `.social-links`, `.footer-grid`, `.footer-bottom`. The logo/brand block is
   left untouched.

The rendered markup mirrors `js/services/footer-loader.js`, so output matches
the classes/styling the site already uses.

## Why it's safe

- It edits the **built output**, never the source pages.
- It only touches the footer region; the rest of every page is byte-identical
  (verified).
- A page with no footer, or assigned `keep`/an unknown variant, is left as-is —
  its existing, already-crawlable footer remains.
- Per-file errors are logged and skipped; only a malformed `footers.json` fails
  the build (so a broken config can't silently ship empty footers).

Current state: `main` reproduces today's homepage footer exactly and is applied
to all pages except `/en/resources/*` (your article pages), which keep their
existing footer. Verified with a real `npm run build`:
`injected 10 (main:10), kept 89, no-footer 23, errors 0`.

## Editing the footer

- **From the admin (recommended):** edit the footer under **Connections →
  Footer Settings** (social / contact / copyright) and **Menu Manager** (the
  footer link columns), then click **Publish footer to site**. That renders the
  admin data into `footers.json` and commits it to the repo via the GitHub API
  (the same mechanism the admin uses to push images to the CDN). The commit
  triggers the Pages rebuild, so the footer goes live on the next build — the
  standard trade-off for crawlable, server-delivered HTML.
  - Requires `GITHUB_TOKEN` (Contents: read & write) in the admin's Railway env
    — the same token used for image uploads. Without it, Publish reports that
    the token is missing and changes nothing.
  - Publish updates the `main` variant and **preserves** the `assignments` and
    any other variants already in `footers.json`.
- **By hand:** edit `footers.json` directly and redeploy.

### Implementation
- `wts-admin/src/lib/footer-export.js` — builds the `main` variant from the
  admin data (`menu_items` + `site_settings`) and merges it into the existing
  `footers.json`.
- `wts-admin/src/lib/github-content.js` — minimal GitHub Contents API get/put.
- `POST /webdev/footer-settings/publish` — wires the two together.

### Prefilled contact links
Footer Settings includes fields for the WhatsApp prefill message and the
email subject + body; Publish renders them into the `wa.me/<digits>?text=…`
and `mailto:<email>?subject=…&body=…` links. The WhatsApp *display* text is
whatever is typed in the number field (use the international
`+856 20 5552 8034` form — the link always uses digits only either way).

## Footer Manager (named variants + per-page assignments)

**Connections → Footer Manager** (`/webdev/footers`) is the hub:

- **Variants** — create named footers (e.g. *Main*, *Resources*). Each variant's
  content is edited in place:
  - social / contact / copyright via **Footer Settings** (`?variant=<slug>`),
    stored as `footer:<slug>:<field>` (the `main` variant uses the legacy
    `footer_<field>` keys);
  - link columns via **Menu Manager** at location `footer:<slug>` /
    `footer-legal:<slug>` (`main` uses `footer` / `footer-legal`).
- **Page assignments** — URL pattern → variant, evaluated top-to-bottom. Exact
  paths and `/*` suffix wildcards (a `/foo/*` rule also matches the section root
  `/foo`). Patterns may be pasted as full URLs (e.g.
  `https://wordsthatsells.website/en/resources/guides/`) — they're normalized to
  a path automatically. `keep` leaves a page's existing footer untouched;
  unmatched pages use the default variant. If no assignments exist,
  `/en/resources/*` defaults to `keep` so the article pages are never clobbered.
- **Pages with no footer** — if a page is *explicitly assigned* a variant but has
  no `<footer>` of its own (e.g. the standalone resource pages), the build
  **creates** a complete, self-styled footer (the footer CSS is inlined with the
  design tokens resolved, so it renders even on pages that don't load the site
  stylesheet). Pages that only fall through to the default variant are left
  untouched — a footer is only added where you asked for one.
- **Publish** — renders **all** variants + assignments into `footers.json` and
  commits it (triggering the rebuild).

Verified end-to-end: creating a `resources` variant, assigning `/en/resources/*`
to it, editing its content, then publishing produces a `footers.json` that the
build injects so the homepage gets the `main` footer and `/en/resources` pages
get the `resources` footer — with no cross-variant leakage.

## Scripts

- `npm run build` — webpack + footer injection (used by CI / GitHub Pages).
- `npm run build:webpack` — webpack only (no injection).
- `npm run inject-footers` — re-run injection against an existing `dist/`.
