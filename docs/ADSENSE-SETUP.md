# AdSense Setup — wordsthatsells.website

The monetization layer is fully injected into the site's long-form content pages
(articles, glossary, AI-tools directory). One manual step remains that only the
account owner can do: **create the five ad units in the AdSense dashboard and
paste their slot IDs into the config file.** Until then every injected unit
hides itself automatically (no broken grey boxes render).

- Publisher account: `pub-8300153677207733` (already active)
- `ads.txt`: already live at https://wordsthatsells.website/ads.txt and correct — do not change it.
- Config file: [`config/adsense.config.js`](../config/adsense.config.js)

---

## 1. Create these five ad units

In [AdSense](https://adsense.google.com) → **Ads** (left sidebar) → **By ad unit** tab:

| # | Ad unit name | Type to pick in the UI | Settings | Paste slot ID into config key |
|---|---|---|---|---|
| 1 | `WTS Article Top` | **Display ads** | Shape: **Horizontal**, Responsive | `ARTICLE_TOP` |
| 2 | `WTS In-Article` | **In-article ads** | Keep Google-optimized styling defaults | `IN_ARTICLE` |
| 3 | `WTS Article Sidebar` | **Display ads** | Shape: **Square** or **Vertical**, Responsive (renders ~300×250 in the sidebar) | `ARTICLE_SIDEBAR` |
| 4 | `WTS Multiplex Bottom` | **Multiplex ads** | Responsive | `MULTIPLEX_BOTTOM` |
| 5 | `WTS Resource Top` | **Display ads** | Shape: **Horizontal**, Responsive | `RESOURCE_TOP` |

After creating each unit AdSense shows a code snippet containing
`data-ad-slot="1234567890"`. You only need that **10-digit number**.

## 2. Paste the slot IDs

Open `config/adsense.config.js` and replace each `REPLACE_ME_*` placeholder:

```js
const SLOTS = {
  ARTICLE_TOP: '1234567890',      // ← from "WTS Article Top"
  IN_ARTICLE: '2345678901',       // ← from "WTS In-Article"
  ARTICLE_SIDEBAR: '3456789012',  // ← from "WTS Article Sidebar"
  MULTIPLEX_BOTTOM: '4567890123', // ← from "WTS Multiplex Bottom"
  RESOURCE_TOP: '5678901234',     // ← from "WTS Resource Top"
};
```

Then refresh the already-injected pages so they pick up the real IDs:

```bash
node scripts/inject-adsense.js --strip   # remove markup carrying placeholder IDs
npm run inject:ads                       # re-inject with the real slot IDs
```

Commit and deploy.

## 3. Consent (required even though the site operates from Laos)

Google requires a certified CMP for visitors from the EEA, UK, and Switzerland:

1. AdSense → **Privacy & messaging** → **GDPR** (European regulations message).
2. Click **Create message**, pick your site, keep Google's certified CMP defaults
   ("Consent, Do not consent, Manage options"), publish.
3. Optionally repeat under **US states regulations** for a CCPA message.

No code change is needed — the message is served by the AdSense script already
in each page's `<head>`.

## 4. Keep Auto ads OFF

AdSense → **Ads** → **By site** → wordsthatsells.website → ensure **Auto ads is
off**. This integration uses manual placements only; Auto ads would double-place
units, break the CLS reservations, and can inject ads into the main marketing
site, which must stay ad-free.

---

## Where ads appear (placement map)

| Placement | Pages | Position | Ad unit |
|---|---|---|---|
| `article_top` | `/{lang}/articles/*` | After the article header/meta, before the first section | WTS Article Top |
| `article_inarticle_n` | articles | Every ~800 words at paragraph boundaries (max 3) | WTS In-Article |
| `article_sidebar` | articles (two-column layout only) | Below the sticky sidebar card; hidden on mobile | WTS Article Sidebar |
| `article_bottom` | articles | After the FAQ block, before the CTA box | WTS Multiplex Bottom |
| `glossary_top` | `/{lang}/resources/glossary/*` | After the key-concepts nav + hero image, before the definition body | WTS Resource Top |
| `glossary_mid` | glossary ≥900 words | Midpoint paragraph boundary (two units past 1,800 words) | WTS In-Article |
| `glossary_bottom` | glossary | After the definition/video content, before related terms + CTA | WTS Multiplex Bottom |
| `tool_top` | `/{lang}/resources/ai-tools/{slug}/` | After the "What is …" intro section, before the feature cards | WTS Resource Top |
| `tool_mid` | tools ≥600 words | After the pros/cons columns | WTS In-Article |
| `tool_related` | tools | After the related-tools grid, end of main content | WTS Multiplex Bottom |

Every unit sits in a grey labelled `.ad-container` ("advertisement" in small
caps) with a reserved min-height, so ads are visually distinct from content and
loading causes zero layout shift. Below-the-fold units initialize lazily via
IntersectionObserver (200px margin); only the first unit per page loads eagerly.

## Publishing rule (how future pages get ads)

Future content receives ads **automatically** only when **both** are true:

1. It lives under one of the three monetizable path patterns:
   - `/{lang}/articles/*.html`
   - `/{lang}/resources/glossary/*.html`
   - `/{lang}/resources/ai-tools/{slug}/index.html`
   (`lang` ∈ en, th, la, fr, lo)
2. Its extracted main content exceeds **400 words** (Thai/Lao text is counted
   script-aware at ≈4 characters per word).

Content published anywhere else — homepage, `/company/**`,
`/digital-marketing-services/**`, legal pages, anything `noindex` — is **never**
monetized unless `PATH_PATTERNS` in `config/adsense.config.js` is extended
deliberately. Category `index.html` listing pages are always skipped.

To monetize newly published pages, run:

```bash
npm run inject:ads:dry   # optional: preview classification first
npm run inject:ads       # idempotent — already-injected pages are skipped
```

Recommended hook: run `npm run inject:ads` as the last step of `npm run build`
(after `inject-footers`/`inject-faqs`) or as a Railway pre-deploy command, so
every deploy monetizes new eligible pages automatically.

To remove all ad markup site-wide: `node scripts/inject-adsense.js --strip`
(or set `ADS_ENABLED = false` in the config and strip).

## Known coverage gaps (by design)

- **English AI-tool pages are currently all excluded**: the longest is 394
  words of main content, under the 400-word thin-content floor. French and Thai
  tool pages are wordier and ~half qualify. To monetize the English directory,
  either enrich those pages past 400 words (better for SEO anyway) or lower
  `RULES.MIN_WORD_COUNT` in the config — not recommended below ~350 for
  AdSense thin-content policy reasons.
- Older-generation articles (`ai-in-southeast-asia…`, `south-korea…`) render
  their sidebar with JavaScript, so they get no `article_sidebar` unit.
- `la`/`lo` languages have no content pages yet; the patterns already cover
  them for the future.

---

## Verification checklist (after pasting slot IDs + deploy)

1. ☐ https://wordsthatsells.website/ads.txt loads and contains
   `google.com, pub-8300153677207733, DIRECT, f08c47fec0942fa0`
2. ☐ All five `SLOTS` values in `config/adsense.config.js` are real 10-digit
   IDs (no `REPLACE_ME` remains) and `--strip` + `inject:ads` was re-run
3. ☐ Deploy to Railway completed
4. ☐ AdSense → **Ad review center** shows impressions within 24–48h
5. ☐ Open one page per template with DevTools console — no
   `adsbygoogle.push() error` messages; each `<ins>` gains
   `data-ad-status="filled"` (or `unfilled` on low-demand geos, which is normal):
   - an article under `/en/articles/`
   - a glossary page under `/th/resources/glossary/`
   - a tool page under `/fr/resources/ai-tools/`
6. ☐ Core Web Vitals spot check (PageSpeed Insights) on the same three URLs:
   CLS should stay at its pre-ads value (containers reserve space) and LCP
   unchanged (loader is async, after CSS, hero preload untouched)
