#!/usr/bin/env node
/**
 * Build-time footer injection (SEO-safe).
 *
 * Runs after webpack has copied the static HTML into ./dist. For each page it
 * picks a footer variant from footers.json (by URL-pattern assignment, else the
 * default) and rewrites the three dynamic regions of that page's
 * <footer class="footer"> — .social-links, .footer-grid and .footer-bottom —
 * with the variant's content. The logo / brand block is left untouched.
 *
 * Because it edits the *built* output (not the source) and only the footer
 * region, it is safe by construction:
 *   - a page with no footer, or a variant of "keep"/unknown, is left as-is
 *     (its existing, already-crawlable footer remains);
 *   - any per-file error is logged and skipped rather than aborting the build;
 *   - only a malformed footers.json aborts the build (so a broken config can't
 *     silently ship empty footers).
 *
 * The rendered markup mirrors js/services/footer-loader.js so the build-time
 * footer and the (optional) client-side loader produce the same result.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CONFIG = path.join(ROOT, 'footers.json');

// --source rewrites the committed SOURCE HTML (en/, lo/, th/, fr/) in place, so
// the footer is correct even when GitHub Pages serves the branch source rather
// than the built dist artifact. Default (no flag) rewrites ./dist after webpack.
const SOURCE_MODE = process.argv.includes('--source');
const LANG_DIRS = ['en', 'lo', 'th', 'fr'];
const BASE = SOURCE_MODE ? ROOT : DIST;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// Escape for text content (keeps quotes, turns newlines into <br>).
function multiline(s) {
  return String(s == null ? '' : s)
    .split('\n')
    .map(line => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>');
}
function relAttrs(external) {
  return external ? ' target="_blank" rel="noopener noreferrer"' : '';
}

// ── Region renderers (mirror footer-loader.js output) ──────────

function renderSocial(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.map(s =>
    `<a href="${esc(s.href)}" target="_blank" rel="noopener noreferrer" aria-label="Visit our ${esc(s.label)}"><i class="${esc(s.icon)}"></i></a>`
  ).join('');
}

function renderContactColumn(heading, items) {
  if (!Array.isArray(items) || !items.length) return '';
  const lis = items.map(it => {
    const inner = it.href
      ? `<a href="${esc(it.href)}"${relAttrs(it.external)}>${esc(it.text)}</a>`
      : `<span>${multiline(it.text)}</span>`;
    return `<li class="footer-contact-item"><i class="${esc(it.icon)}"></i>${inner}</li>`;
  }).join('');
  return `<div class="footer-column"><h3 class="footer-heading">${esc(heading || 'Contact Us')}</h3><ul class="footer-list">${lis}</ul></div>`;
}

function renderLinkColumn(col) {
  const lis = (col.links || []).map(l =>
    `<li><a href="${esc(l.href)}"${relAttrs(l.external)}>${esc(l.text)}</a></li>`
  ).join('');
  return `<div class="footer-column"><h3 class="footer-heading">${esc(col.heading)}</h3><ul class="footer-list">${lis}</ul></div>`;
}

function renderGrid(variant) {
  const cols = Array.isArray(variant.columns) ? variant.columns : [];
  if (!cols.length && !(variant.contact && variant.contact.length)) return null;
  const contact = renderContactColumn(variant.contactHeading, variant.contact);
  return contact + cols.map(renderLinkColumn).join('');
}

function renderBottom(variant) {
  const legal = Array.isArray(variant.legal) ? variant.legal : [];
  const hasLegal = legal.length > 0;
  if (!hasLegal && !variant.copyright) return null;
  let out = '';
  if (hasLegal) {
    out += '<div class="footer-legal">' + legal.map(l =>
      `<a href="${esc(l.href)}"${relAttrs(l.external)}>${esc(l.text)}</a>`
    ).join('') + '</div>';
  }
  if (variant.copyright) out += `<p>${multiline(variant.copyright)}</p>`;
  return out;
}

// ── Footer-scoped DOM-lite surgery (no parser dependency) ──────

// Does a start tag carry the given class? Uses a single-quantifier regex (no
// nested unbounded quantifiers) so it can't backtrack pathologically.
function tagHasClass(tag, className) {
  const m = /class\s*=\s*"([^"]*)"/i.exec(tag);
  return !!m && m[1].split(/\s+/).indexOf(className) !== -1;
}

// Find the first <div ...> whose class contains className, scanning by index
// (no HTML-matching regex). Returns { innerStart } or null.
function findOpenDiv(html, className, fromIndex) {
  let i = fromIndex || 0;
  for (;;) {
    const open = html.indexOf('<div', i);
    if (open === -1) return null;
    const tagEnd = html.indexOf('>', open);
    if (tagEnd === -1) return null;
    if (tagHasClass(html.slice(open, tagEnd + 1), className)) return { innerStart: tagEnd + 1 };
    i = tagEnd + 1;
  }
}

// Replace the inner HTML of the first <div class="<className>"> ... </div> in
// `html`, matching div nesting so the correct closing tag is found. Returns the
// new html, or null if the region was not found.
function replaceDivInner(html, className, newInner) {
  const found = findOpenDiv(html, className, 0);
  if (!found) return null;
  const innerStart = found.innerStart;
  // Walk forward tracking <div ...> / </div> depth (starting at depth 1).
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = innerStart;
  let depth = 1, tag, innerEnd = -1;
  while ((tag = tagRe.exec(html)) !== null) {
    if (tag[0][1] === '/') { depth--; if (depth === 0) { innerEnd = tag.index; break; } }
    else { depth++; }
  }
  if (innerEnd === -1) return null;
  return html.slice(0, innerStart) + newInner + html.slice(innerEnd);
}

// Locate the site footer block (<footer class="footer"> … </footer>) by index,
// without a backtracking-prone HTML regex. Returns { start, end, block } or null.
function findFooterBlock(html) {
  let i = 0;
  for (;;) {
    const open = html.indexOf('<footer', i);
    if (open === -1) return null;
    const tagEnd = html.indexOf('>', open);
    if (tagEnd === -1) return null;
    if (tagHasClass(html.slice(open, tagEnd + 1), 'footer')) {
      const close = html.indexOf('</footer>', tagEnd + 1);
      if (close === -1) return null;
      const end = close + '</footer>'.length;
      return { start: open, end, block: html.slice(open, end) };
    }
    i = tagEnd + 1;
  }
}

function injectIntoFooter(footerHtml, variant) {
  let changed = false;
  const apply = (cls, rendered) => {
    if (rendered == null) return;
    const next = replaceDivInner(footerHtml, cls, rendered);
    if (next != null) { footerHtml = next; changed = true; }
  };
  apply('social-links', renderSocial(variant.social));
  apply('footer-grid', renderGrid(variant));
  apply('footer-bottom', renderBottom(variant));
  return changed ? footerHtml : null;
}

// ── Create a footer on pages that have none ────────────────────

// Static brand block (logo + divider + tagline). The logo/brand are not admin-
// managed, so they live here as the shared footer header.
var BRAND_HTML =
  '<img src="https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/SEO_AI_Digital_Marketing_Agency_Laos_Thailand_Asia_logo_with-words_white_colour_SVG.svg" ' +
  'alt="WordsThatSells.website - AI Digital Marketing Agency in Laos" class="footer-logo" width="200" height="50" loading="lazy" decoding="async">' +
  '<div class="footer-brand-divider"></div>' +
  '<p class="footer-brand-text">Laboise eworker Laos enterprise<br>Empowering businesses in Southeast Asia with AI-driven marketing.</p>';

// Build a complete <footer class="footer"> from a variant (used when a page has
// no footer of its own).
function buildWholeFooter(variant) {
  return '<footer class="footer" data-i18n-links>' +
    '<div class="container">' +
      '<div class="footer-top">' +
        '<div class="footer-brand">' + BRAND_HTML +
          '<div class="social-links">' + (renderSocial(variant.social) || '') + '</div>' +
        '</div>' +
        '<div class="footer-grid">' + (renderGrid(variant) || '') + '</div>' +
      '</div>' +
      '<div class="footer-bottom">' + (renderBottom(variant) || '') + '</div>' +
    '</div>' +
  '</footer>';
}

// Resolve the footer stylesheet with the design tokens inlined, so a created
// footer is fully styled even on standalone pages that don't load the site CSS.
var _footerCss = null;
function footerCss() {
  if (_footerCss != null) return _footerCss;
  try {
    const vars = {};
    const varsCss = fs.readFileSync(path.join(ROOT, 'css/base/variables.css'), 'utf8');
    const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let m;
    while ((m = re.exec(varsCss)) !== null) vars[m[1]] = m[2].trim();
    let css = fs.readFileSync(path.join(ROOT, 'css/layout/footer.css'), 'utf8');
    css = css.replace(/var\(--([a-z0-9-]+)\)/gi, (full, name) => (vars[name] != null ? vars[name] : full));
    // footer.css relies on `.container` (defined in layout.css) to center and
    // constrain width. On pages that don't load the site stylesheet, inline a
    // footer-scoped copy so the footer matches the canonical pages instead of
    // rendering full-bleed. Scoped to `.footer .container` so it never touches
    // a standalone page's own `.container`.
    _footerCss = css + '\n.footer .container{width:90%;max-width:1280px;margin:0 auto;}';
  } catch (e) {
    _footerCss = '';
  }
  return _footerCss;
}

// Does the page link a stylesheet that carries footer.css AND actually applies
// on screen? A link is only counted when it's not print-only and not inside a
// <noscript> — e.g. `main.css media="print"` (a broken async-load snippet) or a
// <noscript> fallback does NOT style the footer for a normal visitor, so such a
// page still needs the inline block.
function linksScreenFooterStylesheet(html) {
  const noNoscript = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  const re = /<link\b[^>]*href="[^"]*\/css\/(?:main|layout\/footer)\.css"[^>]*>/gi;
  let m;
  while ((m = re.exec(noNoscript)) !== null) {
    const tag = m[0];
    // A plain (non-print) stylesheet link applies on screen. A `media="print"`
    // link only applies on screen if its onload flips media to all (the correct
    // async-load trick) — the broken variant (onload sets rel, not media) stays
    // print-only and does NOT style the footer on screen.
    if (!/media="print"/i.test(tag)) return true;
    if (/onload="[^"]*media\s*=\s*['"]?all/i.test(tag)) return true;
  }
  return false;
}

// Insert the inlined footer CSS once, before </head> (or </body> as a fallback).
function ensureFooterCss(html) {
  const css = footerCss();
  if (!css) return html;
  const styleTag = '<style id="wts-footer-css">' + css + '</style>';
  const styledOnScreen = linksScreenFooterStylesheet(html);
  // If the block already exists: refresh its contents so footer.css edits
  // re-bake — or strip it if a screen-applied stylesheet already carries
  // footer.css, where the block is redundant.
  const open = html.indexOf('<style id="wts-footer-css">');
  if (open !== -1) {
    const close = html.indexOf('</style>', open);
    if (close === -1) return html;
    const replacement = styledOnScreen ? '' : styleTag;
    return html.slice(0, open) + replacement + html.slice(close + '</style>'.length);
  }
  // Already styled on screen by a linked stylesheet — leave it alone.
  if (styledOnScreen) return html;
  const headClose = html.search(/<\/head>/i);
  if (headClose !== -1) return html.slice(0, headClose) + styleTag + html.slice(headClose);
  // No <head> (stub/fragment pages) — a <style> is valid in the body too, so
  // place it just before the footer it styles.
  const footerOpen = html.search(/<footer[\s>]/i);
  if (footerOpen !== -1) return html.slice(0, footerOpen) + styleTag + html.slice(footerOpen);
  return html;
}

// The footer's social/contact icons are Font Awesome glyphs. Many pages load no
// Font Awesome at all (glossary, legal) or only a Font Awesome kit that doesn't
// render the footer icons (some resource pages), so the icons disappear. Ensure
// every footer-bearing page loads the same cdnjs stylesheet the home page uses
// (proven to render all the footer icons), unless it already loads it.
const FA_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
function ensureFontAwesome(html) {
  if (html.indexOf('font-awesome/6.0.0-beta3/css/all.min.css') !== -1) return html; // already linked
  if (html.indexOf('id="wts-footer-fa"') !== -1) return html; // already injected
  const link = '<link id="wts-footer-fa" rel="stylesheet" href="' + FA_CDN + '" crossorigin="anonymous">';
  const headClose = html.search(/<\/head>/i);
  if (headClose !== -1) return html.slice(0, headClose) + link + html.slice(headClose);
  // No <head> (e.g. stub/fragment pages) — a stylesheet <link> is valid in the
  // body too, so place it just before the footer that needs it.
  const footerOpen = html.search(/<footer[\s>]/i);
  if (footerOpen !== -1) return html.slice(0, footerOpen) + link + html.slice(footerOpen);
  return html; // no head and no footer — nothing to do
}

// Canonical favicon block (mirrors the homepage, all under /favicon/). Pages
// vary: many carry no favicon at all (glossary stubs, checkout — they fall back
// to the root /favicon.ico), and a few (the /en/company/ pages) carry a legacy
// set pointing at /favicon.svg and /apple-touch-icon.png, which don't exist
// (404). Normalize every page to the canonical set: skip pages that already use
// /favicon/, otherwise strip any legacy favicon links and insert the block.
const FAVICON_HTML =
  '<link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">' +
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">' +
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">' +
  '<link rel="icon" type="image/png" sizes="192x192" href="/favicon/android-chrome-192x192.png">' +
  '<link rel="icon" type="image/png" sizes="512x512" href="/favicon/android-chrome-512x512.png">' +
  '<link rel="shortcut icon" href="/favicon/favicon.ico">' +
  '<link rel="manifest" href="/favicon/site.webmanifest">';
// Matches a single favicon <link> tag. rel is restricted to icon variants so it
// never touches other <link>s (stylesheets, preconnect, manifest, etc.). Uses
// [^>]* bounded by the tag's own '>' — no nested quantifiers, so no ReDoS.
const FAVICON_LINK_RE = /[ \t]*<link\b[^>]*\brel="(?:shortcut icon|icon|apple-touch-icon|mask-icon)"[^>]*>\r?\n?/gi;
function ensureFavicon(html) {
  if (html.indexOf('/favicon/') !== -1) return html; // already the canonical set
  const out = html.replace(FAVICON_LINK_RE, ''); // drop any legacy/broken favicon links
  const headClose = out.search(/<\/head>/i);
  if (headClose !== -1) return out.slice(0, headClose) + FAVICON_HTML + out.slice(headClose);
  // No <head> (stub/fragment pages) — icon links are honored in the body too;
  // place them before the footer. (Same-origin /favicon.ico is the fallback.)
  const footerOpen = out.search(/<footer[\s>]/i);
  if (footerOpen !== -1) return out.slice(0, footerOpen) + FAVICON_HTML + out.slice(footerOpen);
  return out;
}

function insertBeforeBodyClose(html, snippet) {
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return html + snippet;
  return html.slice(0, idx) + snippet + html.slice(idx);
}

// ── Variant selection ──────────────────────────────────────────

function urlPathFor(file) {
  let p = '/' + path.relative(BASE, file).split(path.sep).join('/');
  p = p.replace(/index\.html$/, '');        // /en/index.html -> /en/
  p = p.replace(/\.html$/, '');             // /x/page.html   -> /x/page
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1); // normalize trailing slash
  return p || '/';
}

// Normalize an assignment pattern the same way urlPathFor normalizes a page
// path: accept a full URL (strip scheme + host), drop a trailing slash and a
// .html extension, preserving any '/*' suffix. So a pattern pasted as
// "https://wordsthatsells.website/en/resources/guides/" matches "/en/resources/guides".
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

// Returns { variant, explicit } — explicit is true when an assignment matched
// (vs. falling back to the default).
function pickVariant(config, urlPath) {
  for (const a of config.assignments || []) {
    if (!a.match) continue;
    const pat = normalizePattern(a.match);
    if (pat.endsWith('/*')) {
      // '/foo/*' matches the section root '/foo' as well as '/foo/<anything>'.
      const base = pat.slice(0, -2);
      if (urlPath === base || urlPath.startsWith(base + '/')) return { variant: a.variant, explicit: true };
    } else if (pat === urlPath) {
      return { variant: a.variant, explicit: true };
    }
  }
  return { variant: config.default, explicit: false };
}

// Content pages (under a language directory) should always get a footer, even
// without an explicit assignment. Utility/root files (the language-router
// index.html, 404.html, google-verification files) are left alone.
function isContentPage(urlPath) {
  return /^\/(en|lo|th|fr)(\/|$)/.test(urlPath);
}

// ── Walk dist + apply ──────────────────────────────────────────

function* htmlFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.isFile() && entry.name.endsWith('.html') && !/backup|dynamic/i.test(entry.name)) yield full;
  }
}

// The files to process: the language dirs in source mode, else all of dist.
function* targetFiles() {
  if (SOURCE_MODE) {
    for (const d of LANG_DIRS) yield* htmlFiles(path.join(ROOT, d));
  } else {
    yield* htmlFiles(DIST);
  }
}

function main() {
  if (!SOURCE_MODE && !fs.existsSync(DIST)) {
    console.error('[inject-footers] dist/ not found — run the webpack build first. Skipping.');
    return;
  }
  if (!fs.existsSync(CONFIG)) {
    console.error('[inject-footers] footers.json not found — skipping footer injection.');
    return;
  }
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); // throws on malformed → fails build

  const stats = { injected: 0, created: 0, kept: 0, noFooter: 0, errored: 0 };
  const byVariant = {};

  for (const file of targetFiles()) {
    try {
      const urlPath = urlPathFor(file);
      const pick = pickVariant(config, urlPath);
      const variantName = pick.variant;
      if (!variantName || variantName === 'keep' || !config.variants || !config.variants[variantName]) {
        // Even on kept pages, make sure the footer is styled and its icons can
        // load: inject the inline footer CSS if the page has no footer styling
        // (skips pages that link the site stylesheet), refresh an existing
        // block, and guarantee Font Awesome. Keep only means "don't touch the
        // footer's content/links" — styling it is safe.
        const keptHtml = fs.readFileSync(file, 'utf8');
        let keptOut = keptHtml;
        if (keptOut.indexOf('<footer') !== -1) keptOut = ensureFooterCss(keptOut);
        if (keptOut.indexOf('class="social-links"') !== -1) keptOut = ensureFontAwesome(keptOut);
        keptOut = ensureFavicon(keptOut);
        if (keptOut !== keptHtml) fs.writeFileSync(file, keptOut);
        stats.kept++;
        continue;
      }
      const variant = config.variants[variantName];
      const html = fs.readFileSync(file, 'utf8');
      const fm = findFooterBlock(html);

      if (fm) {
        // Page already has a footer: replace its dynamic regions in place.
        const newFooter = injectIntoFooter(fm.block, variant);
        if (newFooter == null) { stats.noFooter++; continue; }
        let out = html.slice(0, fm.start) + newFooter + html.slice(fm.end);
        // Ensure footer styling: injects the inline footer CSS when the page has
        // none (skips pages that link the site stylesheet), and refreshes an
        // existing inline block so footer.css edits re-bake.
        out = ensureFooterCss(out);
        out = ensureFontAwesome(out); // footer has icon glyphs — guarantee Font Awesome
        out = ensureFavicon(out);
        fs.writeFileSync(file, out);
        stats.injected++;
        byVariant[variantName] = (byVariant[variantName] || 0) + 1;
      } else if (pick.explicit || isContentPage(urlPath)) {
        // Content page (or explicitly assigned) with no footer — build one
        // (self-styled so it works even on standalone pages) and insert it.
        const created = buildWholeFooter(variant);
        const withCss = ensureFavicon(ensureFontAwesome(ensureFooterCss(html)));
        fs.writeFileSync(file, insertBeforeBodyClose(withCss, created));
        stats.created++;
        byVariant[variantName] = (byVariant[variantName] || 0) + 1;
      } else {
        // Non-content/root page with no footer — don't add a footer, but still
        // ensure the favicon (it's page-wide, not footer-related).
        const favOut = ensureFavicon(html);
        if (favOut !== html) fs.writeFileSync(file, favOut);
        stats.noFooter++;
      }
    } catch (e) {
      stats.errored++;
      console.error(`[inject-footers] skipped ${path.relative(DIST, file)}: ${e.message}`);
    }
  }

  console.log(`[inject-footers${SOURCE_MODE ? ' --source' : ''}] injected ${stats.injected}, created ${stats.created} (${Object.entries(byVariant).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}), ` +
    `kept ${stats.kept}, no-footer ${stats.noFooter}, errors ${stats.errored}`);
}

main();
