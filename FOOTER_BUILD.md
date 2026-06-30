# Build-time footer (SEO-safe)

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

- Today: edit `footers.json` and redeploy (the build re-injects).
- **Stage 2 (planned):** manage variants and per-page assignments in the admin,
  with a **Publish** button that regenerates `footers.json` and commits it via
  the GitHub API (the same mechanism the admin already uses to push images to
  the CDN). That commit triggers the Pages rebuild, so edits go live on the next
  build — the standard trade-off for crawlable, server-delivered HTML.

## Scripts

- `npm run build` — webpack + footer injection (used by CI / GitHub Pages).
- `npm run build:webpack` — webpack only (no injection).
- `npm run inject-footers` — re-run injection against an existing `dist/`.
