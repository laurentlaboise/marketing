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
    `<a href="${esc(s.href)}" target="_blank" aria-label="Visit our ${esc(s.label)}"><i class="${esc(s.icon)}"></i></a>`
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
    _footerCss = css;
  } catch (e) {
    _footerCss = '';
  }
  return _footerCss;
}

// Insert the inlined footer CSS once, before </head> (or </body> as a fallback).
function ensureFooterCss(html) {
  if (html.indexOf('id="wts-footer-css"') !== -1) return html;
  if (/href="[^"]*\/css\/layout\/footer\.css"/i.test(html)) return html; // already linked
  const css = footerCss();
  if (!css) return html;
  const styleTag = '<style id="wts-footer-css">' + css + '</style>';
  const headClose = html.search(/<\/head>/i);
  if (headClose !== -1) return html.slice(0, headClose) + styleTag + html.slice(headClose);
  return html; // no head; createFooter prepends the style instead
}

function insertBeforeBodyClose(html, snippet) {
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return html + snippet;
  return html.slice(0, idx) + snippet + html.slice(idx);
}

// ── Variant selection ──────────────────────────────────────────

function urlPathFor(file) {
  let p = '/' + path.relative(DIST, file).split(path.sep).join('/');
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

// ── Walk dist + apply ──────────────────────────────────────────

function* htmlFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) yield full;
  }
}

function main() {
  if (!fs.existsSync(DIST)) {
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

  for (const file of htmlFiles(DIST)) {
    try {
      const urlPath = urlPathFor(file);
      const pick = pickVariant(config, urlPath);
      const variantName = pick.variant;
      if (!variantName || variantName === 'keep' || !config.variants || !config.variants[variantName]) {
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
        fs.writeFileSync(file, html.slice(0, fm.start) + newFooter + html.slice(fm.end));
        stats.injected++;
        byVariant[variantName] = (byVariant[variantName] || 0) + 1;
      } else if (pick.explicit) {
        // Page was explicitly assigned a variant but has no footer — build one
        // (self-styled so it works even on standalone pages) and insert it.
        const created = buildWholeFooter(variant);
        const withCss = ensureFooterCss(html);
        fs.writeFileSync(file, insertBeforeBodyClose(withCss, created));
        stats.created++;
        byVariant[variantName] = (byVariant[variantName] || 0) + 1;
      } else {
        // Default variant and no footer to fill — leave the page untouched.
        stats.noFooter++;
      }
    } catch (e) {
      stats.errored++;
      console.error(`[inject-footers] skipped ${path.relative(DIST, file)}: ${e.message}`);
    }
  }

  console.log(`[inject-footers] injected ${stats.injected}, created ${stats.created} (${Object.entries(byVariant).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}), ` +
    `kept ${stats.kept}, no-footer ${stats.noFooter}, errors ${stats.errored}`);
}

main();
