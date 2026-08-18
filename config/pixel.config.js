/**
 * Central Meta Pixel configuration for wordsthatsells.website.
 *
 * Single source of truth consumed by scripts/inject-pixel.js.
 * The owner only ever edits two things here:
 *   1. PIXEL_ENABLED — global kill switch (re-run `npm run inject:pixel` after
 *      flipping; use `node scripts/inject-pixel.js --strip` to remove markup).
 *   2. PIXEL_ID      — the live Meta Pixel ID. Never reuse the old lao.one
 *      pixel 1561858714366577.
 *
 * META_PIXEL_ID wins over the hard-coded default (same env-var convention as
 * ADSENSE_PUBLISHER_ID).
 */

const PIXEL_ID = process.env.META_PIXEL_ID || '870830501505334';

const PIXEL_ENABLED = true;

/** Retired lao.one pixel — must never be injected. */
const LEGACY_PIXEL_ID = '1561858714366577';

const LANGS = ['en', 'th', 'fr', 'la', 'lo'];
const LANG = LANGS.join('|');

/**
 * Public pages that receive the official PageView snippet.
 * Homepage + language roots, shop, services, articles, resources
 * (glossary, AI tools, guides, resource-hosted articles).
 */
const INCLUDE_PATTERNS = [
  new RegExp(`^index\\.html$`),
  new RegExp(`^(?:${LANG})/index\\.html$`),
  new RegExp(`^(?:(?:${LANG})/)?shop/.+\\.html$`),
  new RegExp(`^(?:(?:${LANG})/)?digital-marketing-services/.+\\.html$`),
  new RegExp(`^(?:(?:${LANG})/)?articles/.+\\.html$`),
  new RegExp(`^(?:(?:${LANG})/)?resources/.+\\.html$`),
];

/**
 * Hard exclusions — never inject, even if a path also matches INCLUDE.
 * noindex / 404 detection is a content check in the injector, not a path.
 */
const EXCLUDE_PATTERNS = [
  /^wts-admin(\/|$)/,
  /^forms(\/|$)/,
  /(^|\/)checkout(\/|$)/,
  /(^|\/)payment(s)?(\/|$)/,
  /(^|\/)404\.html$/,
];

/** Top-level trees walked for HTML. Admin, forms, and build output are skipped. */
const WALK_ROOTS = [
  ...LANGS,
  'shop',
  'articles',
  'resources',
  'digital-marketing-services',
];

const SKIP_DIRS = ['wts-admin', 'forms', 'node_modules', '.git', 'dist', 'checkout'];

module.exports = {
  PIXEL_ID,
  PIXEL_ENABLED,
  LEGACY_PIXEL_ID,
  LANGS,
  INCLUDE_PATTERNS,
  EXCLUDE_PATTERNS,
  WALK_ROOTS,
  SKIP_DIRS,
};
