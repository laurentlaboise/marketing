#!/usr/bin/env node
/**
 * Unify site-wide fonts + CSS loading for SEO / performance.
 *
 * - One typeface: Poppins (400/600/700 only) — removes Inter and extra weights
 * - One stylesheet entry: /css/main.css (bundled; no @import waterfall)
 * - Non-blocking Google Fonts + Font Awesome (media=print onload)
 * - Strips duplicate font/icon links
 *
 * Usage: node scripts/normalize-site-css.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POPPINS_HREF =
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap';
const FA_HREF =
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
const MAIN_CSS = '/css/main.css';

const STANDARD_LINKS = `    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="${MAIN_CSS}">
    <link rel="stylesheet" href="${POPPINS_HREF}" media="print" onload="this.media='all'">
    <link rel="stylesheet" href="${FA_HREF}" media="print" onload="this.media='all'">
    <noscript>
      <link rel="stylesheet" href="${POPPINS_HREF}">
      <link rel="stylesheet" href="${FA_HREF}">
    </noscript>
`;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'wts-admin') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Remove Inter and point stacks at Poppins. */
function replaceFontFamilies(html) {
  let t = html;
  // Quoted Inter → Poppins
  t = t.replace(/(['"])Inter\1/g, "$1Poppins$1");
  // CSS: Inter, sans-serif / Inter)
  t = t.replace(/\bInter\b(?=\s*[,)])/g, 'Poppins');
  // CSS vars that still name Inter as body
  t = t.replace(
    /--font-family-body\s*:\s*[^;]+;/g,
    "--font-family-body: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;"
  );
  t = t.replace(
    /--font-family-heading\s*:\s*[^;]+;/g,
    "--font-family-heading: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;"
  );
  t = t.replace(
    /--font-family-sans\s*:\s*[^;]+;/g,
    "--font-family-sans: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;"
  );
  return t;
}

/** Any Google Fonts CSS URL → single Poppins URL. */
function replaceGoogleFontUrls(html) {
  return html.replace(
    /https:\/\/fonts\.googleapis\.com\/css2\?[^"'>\s]+/g,
    POPPINS_HREF
  );
}

/** Drop redundant/old font & FA <link> tags (we re-inject a standard block). */
function stripFontAndFaLinks(html) {
  let t = html;
  // stylesheet / preload links to google fonts
  t = t.replace(
    /\s*<link\b[^>]*(?:href|href)=["']https:\/\/fonts\.googleapis\.com\/css2\?[^"']*["'][^>]*\/?>/gi,
    ''
  );
  // preconnect fonts.googleapis / fonts.gstatic (re-added in standard block)
  t = t.replace(
    /\s*<link\b[^>]*href=["']https:\/\/fonts\.googleapis\.com["'][^>]*\/?>/gi,
    ''
  );
  t = t.replace(
    /\s*<link\b[^>]*href=["']https:\/\/fonts\.gstatic\.com["'][^>]*\/?>/gi,
    ''
  );
  // Font Awesome from cdnjs (any version) — except footer inject id=wts-footer-fa kept if alone
  t = t.replace(
    /\s*<link\b(?![^>]*id=["']wts-footer-fa["'])[^>]*font-awesome[^>]*\/?>/gi,
    ''
  );
  // main.css — remove then re-add once in standard block (avoid dupes)
  t = t.replace(
    /\s*<link\b[^>]*href=["']\/css\/main\.css["'][^>]*\/?>/gi,
    ''
  );
  // Empty noscript that only held fonts/FA
  t = t.replace(
    /\s*<noscript>\s*(?:<link\b[^>]*\/?>\s*)*<\/noscript>/gi,
    ''
  );
  return t;
}

function injectStandardHead(html) {
  // Prefer insert after viewport (mobile SEO) then charset, then <head>
  if (/<\/head>/i.test(html)) {
    // If we already injected once, skip
    if (
      html.includes(`href="${MAIN_CSS}"`) &&
      html.includes(POPPINS_HREF) &&
      html.includes('media="print" onload="this.media=\'all\'"')
    ) {
      return html;
    }
    if (/<meta\s+name=["']viewport["'][^>]*>/i.test(html)) {
      return html.replace(
        /(<meta\s+name=["']viewport["'][^>]*>)/i,
        `$1\n${STANDARD_LINKS}`
      );
    }
    if (/<meta\s+charset[^>]*>/i.test(html)) {
      return html.replace(/(<meta\s+charset[^>]*>)/i, `$1\n${STANDARD_LINKS}`);
    }
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${STANDARD_LINKS}`);
  }
  return html;
}

function ensureSingleMainCss(html) {
  // Collapse multiple main.css
  let first = true;
  return html.replace(
    /<link\b[^>]*href=["']\/css\/main\.css["'][^>]*\/?>/gi,
    (m) => {
      if (first) {
        first = false;
        return m;
      }
      return '';
    }
  );
}

function processHtml(file) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  // Skip pure fragment / non-pages (e.g. draft text files misnamed — keep safe)
  if (!/<html[\s>]/i.test(html) && !/<head[\s>]/i.test(html)) {
    // Still fix font names in footer-only fragments
    html = replaceFontFamilies(html);
    html = replaceGoogleFontUrls(html);
    if (html !== before) fs.writeFileSync(file, html);
    return html !== before ? 'fragment' : null;
  }

  html = replaceFontFamilies(html);
  html = replaceGoogleFontUrls(html);
  html = stripFontAndFaLinks(html);
  html = injectStandardHead(html);
  html = ensureSingleMainCss(html);
  // Clean excessive blank lines in head region a bit
  html = html.replace(/\n{3,}/g, '\n\n');

  if (html !== before) {
    fs.writeFileSync(file, html);
    return 'updated';
  }
  return null;
}

function processCssPartials() {
  const files = [];
  function w(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) w(p);
      else if (ent.name.endsWith('.css') && ent.name !== 'main.css') files.push(p);
    }
  }
  w(path.join(ROOT, 'css'));
  let n = 0;
  for (const f of files) {
    let t = fs.readFileSync(f, 'utf8');
    const o = t;
    t = t.replace(/(['"])Inter\1/g, '$1Poppins$1');
    t = t.replace(/\bInter\b(?=\s*[,)])/g, 'Poppins');
    if (t !== o) {
      fs.writeFileSync(f, t);
      n += 1;
    }
  }
  return n;
}

const htmlFiles = walk(path.join(ROOT, 'en')).concat(
  walk(path.join(ROOT)).filter((f) => path.basename(f) === 'index.html' && !f.includes(`${path.sep}en${path.sep}`))
);
// Deduplicate
const unique = [...new Set(htmlFiles)];

const stats = { updated: 0, fragment: 0, skipped: 0 };
for (const f of unique) {
  // Only site HTML (en + root index)
  if (!f.includes(`${path.sep}en${path.sep}`) && path.basename(path.dirname(f)) !== path.basename(ROOT) && path.basename(f) !== 'index.html') {
    // allow root index.html
  }
  try {
    const r = processHtml(f);
    if (r === 'updated') stats.updated += 1;
    else if (r === 'fragment') stats.fragment += 1;
    else stats.skipped += 1;
  } catch (e) {
    console.warn('fail', f, e.message);
  }
}

const cssN = processCssPartials();
console.log(
  `[normalize-site-css] html updated=${stats.updated} fragments=${stats.fragment} skipped=${stats.skipped} css_partials=${cssN}`
);
console.log(`[normalize-site-css] Poppins: ${POPPINS_HREF}`);
console.log(`[normalize-site-css] CSS:    ${MAIN_CSS}`);
