/**
 * Central GA4 configuration for wordsthatsells.website.
 *
 * Single source of truth consumed by scripts/inject-ga.js.
 * Measurement ID is the live gtag.js property (not a GTM container).
 * GA_MEASUREMENT_ID wins over the hard-coded default.
 */

const MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || 'G-LMRKC1VBBB';

const GA_ENABLED = true;

const LANGS = ['en', 'th', 'fr', 'la', 'lo'];
const LANG = LANGS.join('|');

/**
 * Pages that were missing the shared gtag snippet (tool slugs + glossary
 * terms). Category indexes, homepage, articles, and marketing chrome already
 * include G-LMRKC1VBBB in their templates — do not re-inject there.
 */
const INCLUDE_PATTERNS = [
  new RegExp(`^(?:${LANG})/resources/ai-tools/[^/]+/index\\.html$`),
  new RegExp(`^(?:${LANG})/resources/glossary/[^/]+\\.html$`),
];

const EXCLUDE_PATTERNS = [
  /(^|\/)(articles|glossary|ai-tools)\/index\.html$/,
  /^wts-admin(\/|$)/,
  /^forms(\/|$)/,
  /(^|\/)checkout(\/|$)/,
  /(^|\/)404\.html$/,
];

const WALK_ROOTS = LANGS;

module.exports = {
  MEASUREMENT_ID,
  GA_ENABLED,
  LANGS,
  INCLUDE_PATTERNS,
  EXCLUDE_PATTERNS,
  WALK_ROOTS,
};
