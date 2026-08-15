#!/usr/bin/env node
/**
 * Generate static redirect HTML for legacy URLs (pre-/en/ structure).
 *
 * GitHub Pages cannot emit HTTP 301s. A real file that returns 200 with
 * meta-refresh + canonical + JS replace is the standard GH Pages pattern
 * and is treated by Google similarly to a permanent redirect.
 *
 * Netlify/Cloudflare: same map is mirrored in _redirects (301).
 *
 * Usage: node scripts/generate-legacy-redirects.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

/** Exact path (no trailing slash) → destination path (absolute site path). */
const EXACT = {
  // /fr /th /en without a slash are expected GH Pages 301s to /fr/ /th/ /en/.
  // Do not map live locales to /en/ — that is a Netlify-only footgun.
  '/la': '/en/', // Lao tree not published yet
  '/lo': '/en/', // old ISO code; GSC noindex on /lo and /lo/

  // Legacy campaign / brand landing pages
  '/digital-business-services-lao-asia': '/en/',
  '/digitizing-business-services-lao-asia': '/en/',
  '/seo-digital-marketing': '/en/digital-marketing-services/',

  // Unprefixed mirrors of current /en trees
  '/digital-marketing-services': '/en/digital-marketing-services/',
  '/digital-marketing-services/business-tools': '/en/digital-marketing-services/business-tools/',
  '/digital-marketing-services/content-creation': '/en/digital-marketing-services/content-creation/',
  '/digital-marketing-services/prices': '/en/digital-marketing-services/prices/',
  '/digital-marketing-services/social-media-management': '/en/digital-marketing-services/social-media-management/',
  '/digital-marketing-services/web-development': '/en/digital-marketing-services/web-development/',

  '/company': '/en/company/',
  '/company/about-us': '/en/company/about-us/',
  '/company/affiliate-sales': '/en/company/affiliate-sales/',
  '/company/contact-us': '/en/company/contact-us/',
  '/company/digital-agencies': '/en/company/digital-agencies/',
  '/company/legal': '/en/company/legal/',

  '/resources': '/en/resources/',
  '/resources/ai-tools': '/en/resources/ai-tools/',
  '/resources/articles': '/en/resources/articles/',
  '/resources/glossary': '/en/resources/glossary/',
  '/resources/guides': '/en/resources/guides/',

  '/articles': '/en/articles/',
  '/checkout': '/en/checkout/',

  // Do NOT stub /search — GSC lists /search?q={search_term_string} as a
  // schema SearchAction template. A 404 is correct; keep it out of sitemaps.

  // Retired /en/blog and /en/shop (never shipped; GSC still requests them)
  '/blog': '/en/resources/articles/',
  '/shop': '/en/digital-marketing-services/prices/',
  '/en/blog': '/en/resources/articles/',
  '/en/shop': '/en/digital-marketing-services/prices/',

  // Old /seo-digital-marketing/ campaign children
  '/seo-digital-marketing/business-tools': '/en/digital-marketing-services/business-tools/',
  '/seo-digital-marketing/content-creation': '/en/digital-marketing-services/content-creation/',
  '/seo-digital-marketing/prices': '/en/digital-marketing-services/prices/',
  '/seo-digital-marketing/social-media-management': '/en/digital-marketing-services/social-media-management/',
  '/seo-digital-marketing/web-development': '/en/digital-marketing-services/web-development/',

  // Exact GSC 404s (15 Aug 2026) — only still-missing nested paths.
  // Prefer the live /th/ or /fr/ equivalent when that page 200s.
  '/fr/digital-marketing-services/business-tools/automation': '/fr/digital-marketing-services/business-tools/',
  '/fr/digital-marketing-services/web-development/landing-page': '/fr/digital-marketing-services/web-development/',
  '/fr/digital-marketing-services/web-development/website-design': '/fr/digital-marketing-services/web-development/',
  '/en/digital-marketing-services/social-media-management/campaigns': '/en/digital-marketing-services/social-media-management/',
  '/lo/digital-marketing-services/web-development/landing-page/mobile-apps': '/en/digital-marketing-services/web-development/',
  '/lo/digital-marketing-services/social-media-management/profile-activation': '/en/digital-marketing-services/social-media-management/',
  '/lo/resources/articles/ai-content-marketing-trends': '/en/resources/articles/',
  '/th/resources/articles/ai-content-marketing-trends': '/th/resources/articles/',
  '/th/digital-marketing-services/social-media-management/profile-activation': '/th/digital-marketing-services/social-media-management/',
};

/** /lo/{section} → /en/{section} (old ISO code; published Lao lives at /la/). */
const LO_SECTIONS = [
  '/digital-marketing-services',
  '/digital-marketing-services/business-tools',
  '/digital-marketing-services/content-creation',
  '/digital-marketing-services/prices',
  '/digital-marketing-services/social-media-management',
  '/digital-marketing-services/web-development',
  '/company',
  '/company/about-us',
  '/company/affiliate-sales',
  '/company/contact-us',
  '/company/digital-agencies',
  '/company/legal',
  '/resources',
  '/resources/ai-tools',
  '/resources/articles',
  '/resources/glossary',
  '/resources/guides',
  '/articles',
  '/blog',
  '/shop',
];

for (const section of LO_SECTIONS) {
  const dest = section === '/blog'
    ? '/en/resources/articles/'
    : section === '/shop'
      ? '/en/digital-marketing-services/prices/'
      : `/en${section}/`;
  EXACT[`/lo${section}`] = dest;
}

function redirectHtml(to) {
  const abs = `https://wordsthatsells.website${to}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moved permanently — WordsThatSells</title>
  <meta name="robots" content="noindex, follow">
  <meta name="description" content="This page has moved. You are being redirected to the current URL.">
  <link rel="canonical" href="${abs}">
  <meta http-equiv="refresh" content="0;url=${to}">
  <script>location.replace(${JSON.stringify(to)} + (location.search || '') + (location.hash || ''));</script>
  <style>
    body{font-family:Poppins,system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.25rem;line-height:1.6;color:#1e293b}
    a{color:#2980b9;font-weight:600}
  </style>
</head>
<body>
  <h1>This page has moved</h1>
  <p>The permanent address is:<br>
  <a href="${to}">${abs}</a></p>
  <p>If you are not redirected automatically, use the link above.</p>
</body>
</html>
`;
}

/** Write both /path/index.html and ensure directory exists. */
function writeStub(sitePath, dest) {
  const rel = sitePath.replace(/^\//, '');
  const dir = path.join(ROOT, rel);
  const file = path.join(dir, 'index.html');
  if (DRY) {
    console.log(`would write ${path.relative(ROOT, file)} → ${dest}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  // Never overwrite a real localized tree page that isn't a redirect stub
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    const isOurs = existing.includes('Moved permanently — WordsThatSells')
      || existing.includes('This page has moved');
    const isLangRouter = /Language router|meta http-equiv="refresh"/i.test(existing)
      && existing.length < 8000;
    if (!isOurs && !isLangRouter && existing.length > 1500) {
      console.warn(`[skip] real page exists: ${path.relative(ROOT, file)}`);
      return;
    }
  }
  fs.writeFileSync(file, redirectHtml(dest), 'utf8');
  console.log(`wrote ${path.relative(ROOT, file)} → ${dest}`);
}

function netlifyRules() {
  const lines = [
    '# --- Legacy URL 301s (pre-/en structure + campaign pages) ---',
    '# Generated by scripts/generate-legacy-redirects.js — do not hand-edit this block.',
    '# BEGIN_LEGACY_REDIRECTS',
  ];
  for (const [from, to] of Object.entries(EXACT)) {
    lines.push(`${from}  ${to}  301`);
    lines.push(`${from}/  ${to}  301`);
  }
  lines.push('# END_LEGACY_REDIRECTS', '');
  return lines.join('\n');
}

function patchRedirectsFile() {
  const file = path.join(ROOT, '_redirects');
  let body = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = netlifyRules();
  if (/# --- Legacy URL 301s[\s\S]*?# END_LEGACY_REDIRECTS/.test(body)) {
    body = body.replace(/# --- Legacy URL 301s[\s\S]*?# END_LEGACY_REDIRECTS\n?/, block);
  } else if (/# BEGIN_LEGACY_REDIRECTS[\s\S]*?# END_LEGACY_REDIRECTS/.test(body)) {
    body = body.replace(/# BEGIN_LEGACY_REDIRECTS[\s\S]*?# END_LEGACY_REDIRECTS\n?/, block);
  } else {
    body = body.trimEnd() + '\n\n' + block;
  }
  if (!DRY) fs.writeFileSync(file, body, 'utf8');
  console.log(DRY ? 'would patch _redirects' : 'patched _redirects');
}

/** Write a file-level stub (e.g. old glossary slugs that 404 as .html). */
function writeFileStub(relFile, dest) {
  const file = path.join(ROOT, relFile);
  if (DRY) {
    console.log(`would write ${relFile} → ${dest}`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    const isOurs = existing.includes('Moved permanently — WordsThatSells')
      || existing.includes('This page has moved');
    if (!isOurs && existing.length > 1500) {
      console.warn(`[skip] real page exists: ${relFile}`);
      return;
    }
  }
  fs.writeFileSync(file, redirectHtml(dest), 'utf8');
  console.log(`wrote ${relFile} → ${dest}`);
}

function glossaryOldSlugStubs() {
  let GLOSSARY_SLUG_MAP;
  try {
    ({ GLOSSARY_SLUG_MAP } = require('../wts-admin/src/lib/link-hygiene'));
  } catch (e) {
    console.warn('[legacy-redirects] GLOSSARY_SLUG_MAP unavailable — skip old glossary slugs');
    return 0;
  }
  let n = 0;
  for (const [oldSlug, newSlug] of Object.entries(GLOSSARY_SLUG_MAP)) {
    // Never overwrite the live glossary hub (map has an "index" key).
    if (oldSlug === 'index') continue;
    const dest = `/en/resources/glossary/${newSlug}.html`;
    writeFileStub(`en/resources/glossary/${oldSlug}.html`, dest);
    n += 1;
  }
  return n;
}

function main() {
  for (const [from, to] of Object.entries(EXACT)) {
    writeStub(from, to);
  }
  const glossaryN = glossaryOldSlugStubs();
  patchRedirectsFile();
  console.error(`[legacy-redirects] ${Object.keys(EXACT).length} path groups + ${glossaryN} glossary slugs`);
}

main();
