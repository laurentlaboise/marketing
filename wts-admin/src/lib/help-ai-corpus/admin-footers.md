# Footer Manager & Menu Manager (/webdev) — area reference

The live site's footers are managed as named variants and published into the static site build.

## Footer Manager (/webdev/footers)
- Variants: "main" is the default and cannot be deleted. Create a variant, then optionally seed it by copying Main into it. The slug "keep" is reserved.
- Assignments map URL patterns to variants: exact paths or trailing /* wildcards, evaluated in order. Full URLs are normalized to paths. Assigning the special variant "keep" leaves that page's footer untouched.
- An EMPTY variant renders nothing — an assigned page keeps its old footer, which looks like "publish did nothing". The hub flags empty variants.
- Footer settings per variant (/webdev/footer-settings?variant=slug): five social URLs, contact address, Google Maps link, WhatsApp number (+ pre-filled text), contact email (+ subject/body), copyright line. WhatsApp/email are entered as plain values and published as wa.me / mailto: links.

## Link columns and the legal bar (Menu Manager, /webdev/menus)
- Footer link columns live at menu location "footer" (variant copies use footer:slug). Two levels max: parent items are column headings.
- The bottom legal-links bar is the menu location "footer-legal" (variant copies use footer-legal:slug). There is no separate legal-pages editor — legal page TEXT is translated in the Translations platform like any other page.

## Publishing
- Publish (on the footer settings page) renders all variants + assignments to footers.json and commits it to GitHub; a workflow re-bakes footers into the site HTML.
- Publish requires a configured GITHUB_TOKEN on the server — "GITHUB_TOKEN is not configured" means the server env is missing it.
- Go-live is not instant: the site rebuild takes a few minutes after publish.
