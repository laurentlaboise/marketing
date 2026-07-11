#!/usr/bin/env node
/**
 * Build-time sticky-header injection (SEO-safe). Clone of inject-footers.js.
 *
 * Runs after webpack has copied the static HTML into ./dist. For each page it
 * picks a header variant from headers.json (by URL-pattern assignment, else
 * the default) and injects a <header id="wts-site-header"> block immediately
 * after the opening <body ...> tag.
 *
 * Safe by construction, mirroring the footer injector:
 *   - idempotent: an existing #wts-site-header block is replaced wholesale in
 *     place, so a re-run is byte-identical;
 *   - redirect stubs ('Moved permanently'), pages whose <head> carries a
 *     robots noindex, and wts-admin/node_modules trees are skipped;
 *   - any per-file error is logged and skipped rather than aborting the build;
 *   - only a malformed headers.json aborts the build.
 *
 * Pages that do not link /css/main.css get an inline <style id="wts-header-css">
 * fallback (design tokens inlined), mirroring ensureFooterCss.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CONFIG = path.join(ROOT, 'headers.json');

// --source rewrites the committed SOURCE HTML (en/, th/, la/, fr/) in place, so
// the header is correct even when GitHub Pages serves the branch source rather
// than the built dist artifact. Default (no flag) rewrites ./dist after webpack.
const SOURCE_MODE = process.argv.includes('--source');
const LANG_DIRS = ['en', 'th', 'la', 'fr'];
const BASE = SOURCE_MODE ? ROOT : DIST;

// Localized header labels: headers.json content is English; on th/la/fr pages
// the rendered block is passed through the site chrome strings
// (src/locales/site/<lang>.json) so link texts match the page language.
// Missing locale files degrade to English, never abort.
const l10n = require('./lib/html-l10n');
const _chromePairs = {};
function chromePairsFor(lang) {
  if (_chromePairs[lang] !== undefined) return _chromePairs[lang];
  try {
    const load = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/locales/site', `${l}.json`), 'utf8'));
    _chromePairs[lang] = l10n.buildChromeDict(load('en'), load(lang));
  } catch (e) {
    _chromePairs[lang] = [];
  }
  return _chromePairs[lang];
}
function langOfPath(urlPath) {
  const m = /^\/(en|th|la|fr)(\/|$)/.exec(urlPath);
  return m ? m[1] : null;
}
function translateHeaderHtml(headerHtml, lang) {
  if (!lang || lang === 'en') return headerHtml;
  const pairs = chromePairsFor(lang);
  if (!pairs.length) return headerHtml;
  return l10n.applyChromeStrings(headerHtml, pairs).html;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function relAttrs(external) {
  return external ? ' target="_blank" rel="noopener noreferrer"' : '';
}

// ── Header renderer ────────────────────────────────────────────

// Guarded GA4 cta_click handler (site-wide taxonomy). Raw && inside a
// double-quoted attribute matches the handlers already shipped on the
// home page and glossary CTAs (a bare && is not an HTML character
// reference, so it parses literally).
function trackAttr(track) {
  if (!track || !track.cta_id) return '';
  const js = `typeof gtag==='function'&&gtag('event','cta_click',{cta_id:'${track.cta_id}',page_type:'${track.page_type}',destination:'${track.destination}'})`;
  return ` onclick="${js}"`;
}

function renderBrand(brand) {
  const b = brand || {};
  const logo = esc(b.logo);
  const fallback = 'https://wordsthatsells.website' + (b.logo || '');
  return `<a class="wts-header-brand" href="${esc(b.href || '/en/')}" aria-label="${esc(b.alt || 'Home')}">` +
    `<img src="${logo}" alt="${esc(b.alt || '')}" width="${b.width || 160}" height="${b.height || 40}" decoding="async" ` +
    `onerror="this.onerror=null;this.src='${esc(fallback)}'"></a>`;
}

function renderLinks(variant) {
  const links = (variant.links || []).map(l =>
    `<a class="wts-nav-link" href="${esc(l.href)}"${relAttrs(l.external)}>${esc(l.text)}</a>`
  ).join('');
  const cta = variant.cta
    ? `<a class="wts-nav-portal" href="${esc(variant.cta.href)}"${relAttrs(variant.cta.external)}${trackAttr(variant.cta.track)}>${esc(variant.cta.text)}</a>`
    : '';
  return links + cta;
}

// The whole sticky header block. The hidden checkbox + label pair is the
// pure-CSS mobile hamburger (styled in css/layout/site-header.css); the
// checkbox precedes the menu so the ~ sibling combinator can toggle it.
function buildHeader(variant, variantName) {
  return `<header id="wts-site-header" data-header-variant="${esc(variantName)}">` +
    '<nav class="wts-header-nav" aria-label="Primary">' +
    renderBrand(variant.brand) +
    '<input type="checkbox" id="wts-nav-toggle" class="wts-nav-toggle">' +
    '<label class="wts-nav-burger" for="wts-nav-toggle" aria-label="Menu">' +
    '<span class="wts-nav-burger-bar"></span><span class="wts-nav-burger-bar"></span><span class="wts-nav-burger-bar"></span>' +
    '</label>' +
    '<div class="wts-nav-menu">' + renderLinks(variant) + '</div>' +
    '</nav>' +
    '</header>';
}

// ── Header block replacement (idempotent) ──────────────────────

// Locate an existing injected block (<header id="wts-site-header" ...>…</header>)
// by index. The injected block never contains a nested <header>, so the first
// closing tag after it is ours. Returns { start, end } or null.
function findHeaderBlock(html) {
  const open = html.indexOf('<header id="wts-site-header"');
  if (open === -1) return null;
  const close = html.indexOf('</header>', open);
  if (close === -1) return null;
  return { start: open, end: close + '</header>'.length };
}

// Inject (or refresh) the header: replace an existing block wholesale in
// place, else insert immediately after the opening <body ...> tag. Returns
// the new html, or null when the page has no <body>.
function injectHeader(html, rendered) {
  const existing = findHeaderBlock(html);
  if (existing) {
    return html.slice(0, existing.start) + rendered + html.slice(existing.end);
  }
  const bodyMatch = /<body\b[^>]*>/i.exec(html);
  if (!bodyMatch) return null;
  const at = bodyMatch.index + bodyMatch[0].length;
  return html.slice(0, at) + '\n' + rendered + html.slice(at);
}

// ── Skip rules ─────────────────────────────────────────────────

// Redirect stubs are tiny "Moved permanently" placeholder pages — a sticky
// header on a page that immediately redirects is dead weight for crawlers.
function isRedirectStub(html) {
  return html.indexOf('Moved permanently') !== -1;
}

// Pages whose <head> carries a robots noindex (checkout results, article
// drafts, unpublished locales) are utility surfaces — leave them alone.
function hasNoindex(html) {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);
  const re = /<meta\b[^>]*name=["']robots["'][^>]*>/gi;
  let m;
  while ((m = re.exec(head)) !== null) {
    if (/noindex/i.test(m[0])) return true;
  }
  return false;
}

// ── Inline CSS fallback (mirror ensureFooterCss) ───────────────

// Resolve the header stylesheet with the design tokens inlined, so the header
// is fully styled even on standalone pages that don't load the site CSS.
var _headerCss = null;
function headerCss() {
  if (_headerCss != null) return _headerCss;
  try {
    const vars = {};
    const varsCss = fs.readFileSync(path.join(ROOT, 'css/base/variables.css'), 'utf8');
    const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let m;
    while ((m = re.exec(varsCss)) !== null) vars[m[1]] = m[2].trim();
    let css = fs.readFileSync(path.join(ROOT, 'css/layout/site-header.css'), 'utf8');
    // Strip comments so the inline block stays small and stable.
    css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{2,}/g, '\n').trim();
    _headerCss = css.replace(/var\(--([a-z0-9-]+)\)/gi, (full, name) => (vars[name] != null ? vars[name] : full));
  } catch (e) {
    _headerCss = '';
  }
  return _headerCss;
}

// Does the page link a stylesheet that carries site-header.css AND actually
// applies on screen? Same rules as the footer injector: print-only links and
// <noscript> fallbacks don't count.
function linksScreenHeaderStylesheet(html) {
  const noNoscript = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  const re = /<link\b[^>]*href="[^"]*\/css\/(?:main|layout\/site-header)\.css"[^>]*>/gi;
  let m;
  while ((m = re.exec(noNoscript)) !== null) {
    const tag = m[0];
    if (!/media="print"/i.test(tag)) return true;
    if (/onload="[^"]*media\s*=\s*['"]?all/i.test(tag)) return true;
  }
  return false;
}

// Insert the inlined header CSS once, before </head> (or before the header
// itself as a fallback). Refreshes an existing block; strips it when a
// screen-applied stylesheet already carries site-header.css.
function ensureHeaderCss(html) {
  const css = headerCss();
  if (!css) return html;
  const styleTag = '<style id="wts-header-css">' + css + '</style>';
  const styledOnScreen = linksScreenHeaderStylesheet(html);
  const open = html.indexOf('<style id="wts-header-css">');
  if (open !== -1) {
    const close = html.indexOf('</style>', open);
    if (close === -1) return html;
    const replacement = styledOnScreen ? '' : styleTag;
    return html.slice(0, open) + replacement + html.slice(close + '</style>'.length);
  }
  if (styledOnScreen) return html;
  const headClose = html.search(/<\/head>/i);
  if (headClose !== -1) return html.slice(0, headClose) + styleTag + html.slice(headClose);
  // No <head> (stub/fragment pages) — a <style> is valid in the body too.
  const headerOpen = html.indexOf('<header id="wts-site-header"');
  if (headerOpen !== -1) return html.slice(0, headerOpen) + styleTag + html.slice(headerOpen);
  return html;
}

// ── Variant selection (identical rules to inject-footers.js) ───

function urlPathFor(file) {
  let p = '/' + path.relative(BASE, file).split(path.sep).join('/');
  p = p.replace(/index\.html$/, '');        // /en/index.html -> /en/
  p = p.replace(/\.html$/, '');             // /x/page.html   -> /x/page
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1); // normalize trailing slash
  return p || '/';
}

function normalizePattern(pat) {
  let p = String(pat || '').trim();
  p = p.replace(/^https?:\/\/[^/]+/i, '');     // full URL → path
  if (!p.startsWith('/')) p = '/' + p;
  let wildcard = false;
  if (p.endsWith('/*')) { wildcard = true; p = p.slice(0, -2); }
  p = p.replace(/index\.html$/, '');
  p = p.replace(/\.html$/, '');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (!p) p = '/';
  return wildcard ? p + '/*' : p;
}

function pickVariant(config, urlPath) {
  for (const a of config.assignments || []) {
    if (!a.match) continue;
    const pat = normalizePattern(a.match);
    if (pat.endsWith('/*')) {
      const base = pat.slice(0, -2);
      if (urlPath === base || urlPath.startsWith(base + '/')) return { variant: a.variant, explicit: true };
    } else if (pat === urlPath) {
      return { variant: a.variant, explicit: true };
    }
  }
  return { variant: config.default, explicit: false };
}

// Content pages (under a language directory) get the header; utility/root
// files (the language-router index.html, 404.html, verification files) don't.
function isContentPage(urlPath) {
  return /^\/(en|th|la|fr)(\/|$)/.test(urlPath);
}

// ── Walk + apply ───────────────────────────────────────────────

// Same walk as the footer injector, plus explicit wts-admin/node_modules
// exclusion (defensive for dist mode; the --source walk only enters LANG_DIRS).
const SKIP_DIRS = new Set(['node_modules', 'wts-admin', '.git']);
function* htmlFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* htmlFiles(full);
    } else if (entry.isFile() && entry.name.endsWith('.html') && !/backup|dynamic/i.test(entry.name)) {
      yield full;
    }
  }
}

function* targetFiles() {
  if (SOURCE_MODE) {
    for (const d of LANG_DIRS) yield* htmlFiles(path.join(ROOT, d));
  } else {
    yield* htmlFiles(DIST);
  }
}

function main() {
  if (!SOURCE_MODE && !fs.existsSync(DIST)) {
    console.error('[inject-headers] dist/ not found — run the webpack build first. Skipping.');
    return;
  }
  if (!fs.existsSync(CONFIG)) {
    console.error('[inject-headers] headers.json not found — skipping header injection.');
    return;
  }
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); // throws on malformed → fails build

  const stats = { injected: 0, skippedStub: 0, skippedNoindex: 0, skippedOther: 0, errored: 0 };
  const byVariant = {};

  for (const file of targetFiles()) {
    try {
      const urlPath = urlPathFor(file);
      const pick = pickVariant(config, urlPath);
      const variantName = pick.variant;
      if (!variantName || variantName === 'keep' || !config.variants || !config.variants[variantName]) {
        stats.skippedOther++;
        continue;
      }
      if (!pick.explicit && !isContentPage(urlPath)) { stats.skippedOther++; continue; }

      const html = fs.readFileSync(file, 'utf8');
      if (isRedirectStub(html)) { stats.skippedStub++; continue; }
      if (hasNoindex(html)) { stats.skippedNoindex++; continue; }

      const variant = config.variants[variantName];
      const rendered = translateHeaderHtml(buildHeader(variant, variantName), langOfPath(urlPath));
      let out = injectHeader(html, rendered);
      if (out == null) { stats.skippedOther++; continue; } // no <body> — fragment/stub
      out = ensureHeaderCss(out);
      if (out !== html) fs.writeFileSync(file, out);
      stats.injected++;
      byVariant[variantName] = (byVariant[variantName] || 0) + 1;
    } catch (e) {
      stats.errored++;
      console.error(`[inject-headers] skipped ${path.relative(BASE, file)}: ${e.message}`);
    }
  }

  console.log(`[inject-headers${SOURCE_MODE ? ' --source' : ''}] injected ${stats.injected} (${Object.entries(byVariant).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}), ` +
    `skipped ${stats.skippedStub} redirect-stubs, ${stats.skippedNoindex} noindex, ${stats.skippedOther} other, errors ${stats.errored}`);
}

if (require.main === module) main();

module.exports = { buildHeader, injectHeader, findHeaderBlock, hasNoindex, isRedirectStub };
