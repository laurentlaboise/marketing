/**
 * Central AdSense configuration for wordsthatsells.website.
 *
 * Single source of truth consumed by scripts/inject-adsense.js.
 * The owner only ever edits two things here:
 *   1. ADS_ENABLED  — global kill switch (re-run `npm run inject:ads` after flipping;
 *      use `node scripts/inject-adsense.js --strip` to remove all ad markup).
 *   2. SLOTS        — paste the real data-ad-slot IDs from the AdSense dashboard
 *      over the REPLACE_ME_* placeholders (see docs/ADSENSE-SETUP.md), then re-run
 *      `npm run inject:ads` so already-injected pages pick up the new IDs.
 *
 * Publisher ID follows the same env-var override convention as the ads.txt setup:
 * ADSENSE_PUBLISHER_ID wins over the hard-coded default.
 */

const PUBLISHER_ID = process.env.ADSENSE_PUBLISHER_ID || 'pub-8300153677207733';

const ADS_ENABLED = true;

/**
 * Named ad units → data-ad-slot IDs.
 * One AdSense unit can serve several page positions (see PLACEMENTS below).
 * Until the owner creates the units in the AdSense UI these stay REPLACE_ME_*;
 * js/ads.js hides any unit whose slot still starts with "REPLACE_ME" so
 * placeholder markup never renders a broken grey box in production.
 */
const SLOTS = {
  ARTICLE_TOP: '8924528663',         // "WTS Article Top"      — display, horizontal
  IN_ARTICLE: '6647663773',           // "WTS In-Article"       — in-article native (all mid-content positions)
  ARTICLE_SIDEBAR: '2420378223', // "WTS Article Sidebar"  — display, 300×250 / responsive vertical
  MULTIPLEX_BOTTOM: '9503113164', // "WTS Multiplex Bottom" — multiplex (shared bottom, all templates)
  RESOURCE_TOP: '2228806539',       // "WTS Resource Top"     — display, horizontal (glossary + tools top)
};

/**
 * Page-position definitions. `slot` references a SLOTS key; `format` picks the
 * <ins> attribute set rendered from partials/ad-unit.html; `lazy` units are
 * initialised by js/ads.js only when within 200px of the viewport.
 * min-height classes (CLS reservation): horizontal 100px, in-article 280px,
 * sidebar 250px, multiplex 280px.
 */
const PLACEMENTS = {
  article_top:      { slot: 'ARTICLE_TOP',      format: 'horizontal', lazy: false },
  article_inarticle:{ slot: 'IN_ARTICLE',       format: 'inarticle',  lazy: true },
  article_sidebar:  { slot: 'ARTICLE_SIDEBAR',  format: 'sidebar',    lazy: true },
  article_bottom:   { slot: 'MULTIPLEX_BOTTOM', format: 'multiplex',  lazy: true },
  glossary_top:     { slot: 'RESOURCE_TOP',     format: 'horizontal', lazy: false },
  glossary_mid:     { slot: 'IN_ARTICLE',       format: 'inarticle',  lazy: true },
  glossary_bottom:  { slot: 'MULTIPLEX_BOTTOM', format: 'multiplex',  lazy: true },
  tool_top:         { slot: 'RESOURCE_TOP',     format: 'horizontal', lazy: false },
  tool_mid:         { slot: 'IN_ARTICLE',       format: 'inarticle',  lazy: true },
  tool_related:     { slot: 'MULTIPLEX_BOTTOM', format: 'multiplex',  lazy: true },
};

/**
 * Monetizable path patterns (relative to repo root). PRIMARY classifier —
 * layout signatures are only secondary confirmation. Content anywhere else is
 * never monetized unless this list is extended deliberately.
 * la/lo are included so future Lao content is covered automatically.
 */
const LANGS = ['en', 'th', 'la', 'fr', 'lo'];
const PATH_PATTERNS = {
  article: new RegExp(`^(${LANGS.join('|')})/articles/[^/]+\\.html$`),
  glossary: new RegExp(`^(${LANGS.join('|')})/resources/glossary/[^/]+\\.html$`),
  tool: new RegExp(`^(${LANGS.join('|')})/resources/ai-tools/[^/]+/index\\.html$`),
};

/** Density / policy thresholds (words of extracted main content). */
const RULES = {
  MIN_WORD_COUNT: 400,        // hard floor — thin-content pages get no ads at all
  ARTICLE_PUBLISH_MIN: 800,   // CMS + baker refuse to publish/bake below this (AdSense inventory)
  IN_ARTICLE_INTERVAL: 800,   // one fluid unit per ~800 words of article body
  MAX_IN_ARTICLE: 3,          // cap on mid-article units per page
  GLOSSARY_MID_MIN: 900,      // glossary pages need ≥900 words for a mid unit
  GLOSSARY_TWO_MID_MIN: 1800, // …and ≥1800 words for a second one
  TOOL_MID_MIN: 600,          // tool pages need ≥600 words for the mid unit
};

module.exports = { PUBLISHER_ID, ADS_ENABLED, SLOTS, PLACEMENTS, PATH_PATTERNS, LANGS, RULES };
