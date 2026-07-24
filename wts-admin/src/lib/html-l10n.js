// HTML localization engine (dependency-free, string-offset based).
//
// Shared by:
//   - scripts/generate-localized-pages.js   (root: writes /th /la /fr)
//   - wts-admin/scripts/sync-site-pages.js  (admin: extracts page segments
//     into the site_pages table so Part 1's translations pipeline can
//     route them to AI or human vendors)
//
// Segments are the translatable text blocks of a page. A segment's key is
// a short sha1 of its normalized English text, so:
//   - identical strings share one translation (automatic dedup),
//   - extraction and application are deterministic on both sides,
//   - when the English text changes, the old key simply stops matching
//     and the block safely stays English until re-translated.
//
// All transforms are offset-based string surgery — untouched bytes stay
// byte-identical (indentation, attribute order, entities are preserved).
const crypto = require('crypto');

const SITE_ORIGIN = 'https://wordsthatsells.website';

// Language registry: dir = URL prefix, hreflang = ISO code (Lao: dir /la,
// code lo), fonts = extra font families needed beyond Poppins.
const LANGUAGES = {
  en: { dir: 'en', hreflang: 'en', name: 'English' },
  th: { dir: 'th', hreflang: 'th', name: 'Thai', font: 'Noto Sans Thai', fontQuery: 'Noto+Sans+Thai:wght@400;600;700' },
  la: { dir: 'la', hreflang: 'lo', name: 'Lao', font: 'Noto Sans Lao', fontQuery: 'Noto+Sans+Lao:wght@400;600;700' },
  fr: { dir: 'fr', hreflang: 'fr', name: 'French' },
};
const TARGET_DIRS = ['th', 'la', 'fr'];

// Block-level text carriers that become translation segments.
// Include a/button/option/label so CTAs, form options, and nav chips
// are not left English when they sit outside a <p>/<h*> wrapper.
const SEGMENT_TAGS = [
  'title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote',
  'figcaption', 'summary', 'dt', 'dd', 'a', 'button', 'option', 'label', 'span',
];

// Segments are never extracted from these regions. The footer and the
// shared quote modal are chrome (localized via src/locales/site/*.json);
// raw-text containers can't carry translated markup.
// Note: do NOT exclude <select> — its <option> labels must be localizable.
const RAW_TAGS = ['script', 'style', 'svg', 'noscript', 'template', 'pre', 'code', 'textarea'];

// A segment candidate containing any of these is a container, not a text
// block — its inner blocks are extracted instead (prevents overlap).
const BLOCK_CONTENT_RE = /<(?:address|article|aside|blockquote|details|div|dl|dt|dd|fieldset|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|ul)\b/i;

const VOID_OR_SELF_CLOSED_RE = /\/>$/;

// ---------------------------------------------------------------------------
// Low-level scanning
// ---------------------------------------------------------------------------

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');
const normalizeText = (s) => String(s).replace(/\s+/g, ' ').trim();

function segmentKey(text) {
  return 's_' + crypto.createHash('sha1').update(normalizeText(text), 'utf8').digest('hex').slice(0, 12);
}

// Find every element range for a tag, handling same-tag nesting via a
// stack. Returns { openStart, innerStart, innerEnd, closeEnd, attrs }.
// Tolerant of imbalance: strays are dropped instead of throwing.
function findElementRanges(html, tagName) {
  const ranges = [];
  const tokenRe = new RegExp(`<(/?)${tagName}(?=[\\s/>])((?:"[^"]*"|'[^']*'|[^>"'])*)>`, 'gi');
  const stack = [];
  let match;
  while ((match = tokenRe.exec(html)) !== null) {
    const isClose = match[1] === '/';
    if (isClose) {
      const open = stack.pop();
      if (open) {
        ranges.push({
          openStart: open.openStart,
          innerStart: open.innerStart,
          innerEnd: match.index,
          closeEnd: match.index + match[0].length,
          attrs: open.attrs,
        });
      }
    } else if (!VOID_OR_SELF_CLOSED_RE.test(match[0])) {
      stack.push({ openStart: match.index, innerStart: match.index + match[0].length, attrs: match[2] || '' });
    }
  }
  return ranges.sort((a, b) => a.openStart - b.openStart);
}

const within = (pos, range) => pos >= range.start && pos < range.end;
const insideAny = (pos, rangeList) => rangeList.some((r) => within(pos, r));

// Regions no segment/chrome operation may touch: raw containers, the
// footer, and the shared quote modal.
function excludedRanges(html) {
  const ranges = [];
  for (const tag of RAW_TAGS) {
    for (const r of findElementRanges(html, tag)) {
      ranges.push({ start: r.openStart, end: r.closeEnd });
    }
  }
  for (const r of findElementRanges(html, 'footer')) {
    ranges.push({ start: r.openStart, end: r.closeEnd });
  }
  // Quote modal used to be fully excluded as "chrome", but that left form
  // labels/options English forever (select options never hit site locale JSON).
  // Modal copy is now segment-localizable like the rest of the page.
  return ranges;
}

// Translatable attribute values: SEO metas and image alt/title text.
const META_CONTENT_NAMES = new Set(['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description']);

function findAttrSegments(html) {
  const found = [];
  const tagRe = /<(meta|img)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const tagStart = match.index;
    const body = match[2];
    const bodyStart = tagStart + match[0].indexOf(body === '' ? '>' : body);
    if (match[1].toLowerCase() === 'meta') {
      const nameMatch = body.match(/(?:name|property)\s*=\s*"([^"]*)"/i);
      if (!nameMatch || !META_CONTENT_NAMES.has(nameMatch[1])) continue;
      const contentMatch = /content\s*=\s*"([^"]*)"/i.exec(body);
      if (!contentMatch || !contentMatch[1].trim()) continue;
      const valueStart = bodyStart + contentMatch.index + contentMatch[0].indexOf(contentMatch[1]);
      found.push({ start: valueStart, end: valueStart + contentMatch[1].length, text: contentMatch[1], kind: `meta:${nameMatch[1]}` });
    } else {
      for (const attr of ['alt', 'title']) {
        const attrMatch = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i').exec(body);
        if (!attrMatch || attrMatch[1].trim().length < 4 || !/[a-zA-Z]/.test(attrMatch[1])) continue;
        const valueStart = bodyStart + attrMatch.index + attrMatch[0].indexOf(attrMatch[1]);
        found.push({ start: valueStart, end: valueStart + attrMatch[1].length, text: attrMatch[1], kind: `img:${attr}` });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Segment extraction & application
// ---------------------------------------------------------------------------

function collectSegmentSites(html) {
  const excluded = excludedRanges(html);
  const sites = [];

  for (const tag of SEGMENT_TAGS) {
    for (const r of findElementRanges(html, tag)) {
      if (insideAny(r.openStart, excluded)) continue;
      const inner = html.slice(r.innerStart, r.innerEnd);
      if (BLOCK_CONTENT_RE.test(inner)) continue; // container — inner blocks carry the text
      const visible = normalizeText(inner.replace(/<[^>]*>/g, ' '));
      if (visible.length < 2 || !/[a-zA-Z]/.test(visible)) continue;
      sites.push({ start: r.innerStart, end: r.innerEnd, text: inner, kind: `el:${tag}` });
    }
  }

  const elementSites = sites.slice();
  for (const attr of findAttrSegments(html)) {
    if (insideAny(attr.start, excluded)) continue;
    // Attribute text inside an extracted element (e.g. an <img alt> within
    // a translated <li>) belongs to that segment — skip to avoid overlap.
    if (elementSites.some((s) => attr.start >= s.start && attr.end <= s.end)) continue;
    sites.push(attr);
  }

  return sites.sort((a, b) => a.start - b.start);
}

// English page → { segKey: englishText }. The admin stores this on
// site_pages.segments; vendors/AI translate value-by-value.
function extractSegments(html) {
  const segments = {};
  for (const site of collectSegmentSites(html)) {
    segments[segmentKey(site.text)] = normalizeText(site.text);
  }
  return segments;
}

// English page + translated payload → localized page. Sites whose key is
// missing from the payload stay English (progressive localization).
function applySegments(html, payload) {
  if (!payload || typeof payload !== 'object') return { html, applied: 0 };
  const ops = [];
  for (const site of collectSegmentSites(html)) {
    const translated = payload[segmentKey(site.text)];
    if (typeof translated !== 'string' || !translated.trim()) continue;
    if (normalizeText(translated) === normalizeText(site.text)) continue;
    const isAttr = !site.kind.startsWith('el:');
    let replacement;
    if (isAttr) {
      replacement = escapeAttr(normalizeText(translated).replace(/"/g, "'"));
    } else {
      const lead = (site.text.match(/^\s*/) || [''])[0];
      const trail = (site.text.match(/\s*$/) || [''])[0];
      replacement = lead + translated.trim() + trail;
    }
    ops.push({ start: site.start, end: site.end, replacement });
  }
  return { html: applyOps(html, ops), applied: ops.length };
}

function applyOps(html, ops) {
  let out = html;
  for (const op of ops.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, op.start) + op.replacement + out.slice(op.end);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chrome strings (site locale JSONs)
// ---------------------------------------------------------------------------

// Flatten two locale JSONs into [englishText, translatedText] pairs,
// longest English first so specific strings win over substrings.
function buildChromeDict(enLocale, targetLocale) {
  const pairs = [];
  const walk = (en, target) => {
    for (const [key, value] of Object.entries(en)) {
      if (key === '$meta' || key === 'languageNames') continue;
      const other = target ? target[key] : undefined;
      if (value && typeof value === 'object') {
        walk(value, other || {});
      } else if (typeof value === 'string' && typeof other === 'string' && value !== other && value.trim()) {
        pairs.push([value, other]);
      }
    }
  };
  walk(enLocale, targetLocale);
  return pairs.sort((a, b) => b[0].length - a[0].length);
}

// Replace chrome strings in element text (">Read More<") and common
// attribute values, everywhere outside raw containers — including the
// footer and modal, which is exactly where most chrome lives.
//
// Also:
//   - free-text exact matches in HTML (e.g. "All rights reserved" mid-sentence)
//   - quoted string literals inside <script> for short chrome CTAs
//     (e.g. const ctaText = 'Get started')
function applyChromeStrings(html, pairs) {
  const scriptRanges = [];
  const rawNonScript = [];
  for (const tag of ['script', 'style', 'svg', 'template']) {
    for (const r of findElementRanges(html, tag)) {
      const range = { start: r.openStart, end: r.closeEnd };
      if (tag === 'script') scriptRanges.push(range);
      else rawNonScript.push(range);
    }
  }
  const rawOnly = [...scriptRanges, ...rawNonScript].sort((a, b) => a.start - b.start);

  const chunks = [];
  let cursor = 0;
  for (const r of rawOnly) {
    if (r.start < cursor) continue; // nested raw region already covered
    const isScript = scriptRanges.some((s) => s.start === r.start && s.end === r.end);
    chunks.push({ text: html.slice(cursor, r.start), translate: true, kind: 'html' });
    chunks.push({ text: html.slice(r.start, r.end), translate: isScript, kind: isScript ? 'script' : 'raw' });
    cursor = r.end;
  }
  chunks.push({ text: html.slice(cursor), translate: true, kind: 'html' });

  const ATTRS = ['placeholder', 'aria-label', 'title', 'value', 'alt', 'content'];
  let replaced = 0;
  const out = chunks.map((chunk) => {
    if (!chunk.translate) return chunk.text;
    let text = chunk.text;

    if (chunk.kind === 'script') {
      // Rewrite chrome UI copy embedded in JS (quoted literals AND template
      // HTML snippets like `...">See price in portal</a>`). Skip short tokens
      // so identifiers stay intact.
      for (const [en, target] of pairs) {
        if (!en || en === target) continue;
        if (en.length < 6) continue;
        if (!text.includes(en)) continue;
        const enEsc = escapeRegExp(en);
        text = text.replace(new RegExp(enEsc, 'g'), () => {
          replaced += 1;
          return target;
        });
      }
      return text;
    }

    for (const [en, target] of pairs) {
      if (!en || en === target) continue;
      const enEsc = escapeRegExp(en);
      text = text.replace(new RegExp(`>(\\s*)${enEsc}(\\s*)<`, 'g'), (m, lead, trail) => {
        replaced += 1;
        return '>' + lead + escapeHtml(target) + trail + '<';
      });
      for (const attr of ATTRS) {
        text = text.replace(new RegExp(`(${attr}=")${enEsc}(")`, 'g'), (m, p1, p2) => {
          replaced += 1;
          return p1 + escapeAttr(target) + p2;
        });
      }
      // Free-text exact match outside tags (footer copyright, mixed sentences).
      // Longest-first pair order prevents short tokens eating longer phrases.
      text = text.replace(new RegExp(enEsc, 'g'), (match, offset) => {
        // Skip matches that sit inside a tag (<...>) — only text nodes.
        const before = text.slice(Math.max(0, offset - 200), offset);
        const lastLt = before.lastIndexOf('<');
        const lastGt = before.lastIndexOf('>');
        if (lastLt > lastGt) return match; // inside a tag
        replaced += 1;
        return escapeHtml(target);
      });
    }
    return text;
  }).join('');
  return { html: out, replaced };
}

// ---------------------------------------------------------------------------
// Links, lang, head metadata
// ---------------------------------------------------------------------------

function rewriteLinks(html, toDir) {
  return html
    // Absolute URLs (footer links, JSON-LD @id/url, breadcrumbs, OG)
    .replace(/(https?:\/\/(?:www\.)?wordsthatsells\.website)\/en\//g, `$1/${toDir}/`)
    .replace(/(https?:\/\/(?:www\.)?wordsthatsells\.website)\/en(["'])/g, `$1/${toDir}$2`)
    // Root-relative attribute URLs
    .replace(/((?:href|src|content|action|data-href)=")\/en\//g, `$1/${toDir}/`)
    .replace(/((?:href|src|content|action|data-href)=")\/en(")/g, `$1/${toDir}$2`);
}

function setHtmlLang(html, hreflang) {
  if (/<html\b[^>]*\blang\s*=/i.test(html)) {
    return html.replace(/(<html\b[^>]*?\blang\s*=\s*")[^"]*(")/i, `$1${hreflang}$2`);
  }
  return html.replace(/<html\b/i, `<html lang="${hreflang}"`);
}

function setInLanguage(html, hreflang) {
  return html.replace(/("inLanguage"\s*:\s*")[^"]*(")/g, `$1${hreflang}$2`);
}

function replaceMetaContent(html, attrName, attrValue, newContent) {
  const tagRe = /<meta\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[0];
    if (!new RegExp(`(?:name|property)\\s*=\\s*"${escapeRegExp(attrValue)}"`, 'i').test(tag)) continue;
    const updated = tag.replace(/(content\s*=\s*")[^"]*(")/i, `$1${escapeAttr(newContent)}$2`);
    return html.slice(0, match.index) + updated + html.slice(match.index + tag.length);
  }
  return html;
}

function replaceLinkHref(html, relValue, newHref) {
  const tagRe = /<link\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[0];
    if (!new RegExp(`rel\\s*=\\s*"${escapeRegExp(relValue)}"`, 'i').test(tag)) continue;
    const updated = tag.replace(/(href\s*=\s*")[^"]*(")/i, `$1${newHref}$2`);
    return html.slice(0, match.index) + updated + html.slice(match.index + tag.length);
  }
  return html;
}

// Full hreflang cluster for a language-relative site path ('/', '/company/about-us/', '/x.html').
function buildAlternates(sitePath) {
  return [
    { hreflang: 'en', href: `${SITE_ORIGIN}/en${sitePath}` },
    { hreflang: 'th', href: `${SITE_ORIGIN}/th${sitePath}` },
    { hreflang: 'lo', href: `${SITE_ORIGIN}/la${sitePath}` },
    { hreflang: 'fr', href: `${SITE_ORIGIN}/fr${sitePath}` },
    { hreflang: 'x-default', href: `${SITE_ORIGIN}/en${sitePath}` },
  ];
}

// Replace any existing alternate set with the given cluster (subset of
// buildAlternates when some languages aren't generated yet).
function setAlternates(html, alternates) {
  let out = html.replace(/[ \t]*<link\b[^>]*rel="alternate"[^>]*hreflang="[^"]*"[^>]*>\s*\n?/gi, '');
  const block = alternates
    .map((a) => `    <link rel="alternate" hreflang="${a.hreflang}" href="${a.href}">`)
    .join('\n');
  const canonicalTag = /([ \t]*)(<link\b[^>]*rel="canonical"[^>]*>)/i.exec(out);
  if (canonicalTag) {
    const insertAt = canonicalTag.index + canonicalTag[0].length;
    return out.slice(0, insertAt) + '\n' + block + out.slice(insertAt);
  }
  return out.replace(/<\/head>/i, `${block}\n</head>`);
}

// Async-loading font links matching the site's existing pattern, plus the
// Thai/Lao typography stylesheet. Injected only for languages that need it.
function fontHeadBlock(lang) {
  const config = LANGUAGES[lang];
  if (!config || !config.fontQuery) return '';
  const fontsHref = `https://fonts.googleapis.com/css2?family=${config.fontQuery}&display=swap`;
  return [
    `    <link rel="stylesheet" href="${fontsHref}" media="print" onload="this.media='all'">`,
    `    <noscript><link rel="stylesheet" href="${fontsHref}"></noscript>`,
    '    <link rel="stylesheet" href="/css/i18n.css">',
  ].join('\n');
}

function injectBeforeHeadEnd(html, block) {
  if (!block) return html;
  return html.replace(/<\/head>/i, `${block}\n</head>`);
}

// ---------------------------------------------------------------------------
// Page-level orchestration
// ---------------------------------------------------------------------------

// relFile: path of the page relative to the language root
// ('index.html', 'company/about-us/index.html') → site path used in URLs.
function filePathToSitePath(relFile) {
  const normalized = relFile.replace(/\\/g, '/');
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) return '/' + normalized.slice(0, -'index.html'.length);
  return '/' + normalized;
}

// English source page → fully localized page for `lang`.
function localizePage(englishHtml, {
  lang,
  relFile,
  segmentsPayload = null,
  chromePairs = [],
  alternates = null,
}) {
  const config = LANGUAGES[lang];
  if (!config) throw new Error(`Unknown language: ${lang}`);
  const sitePath = filePathToSitePath(relFile);
  const pageUrl = `${SITE_ORIGIN}/${config.dir}${sitePath}`;

  let html = englishHtml;
  const segmentResult = applySegments(html, segmentsPayload);
  html = segmentResult.html;
  const chromeResult = applyChromeStrings(html, chromePairs);
  html = chromeResult.html;
  html = rewriteLinks(html, config.dir);
  html = setHtmlLang(html, config.hreflang);
  html = setInLanguage(html, config.hreflang);
  html = replaceLinkHref(html, 'canonical', pageUrl);
  html = replaceMetaContent(html, 'property', 'og:url', pageUrl);
  html = setAlternates(html, alternates || buildAlternates(sitePath));
  html = injectBeforeHeadEnd(html, fontHeadBlock(lang));

  return { html, segmentsApplied: segmentResult.applied, chromeReplaced: chromeResult.replaced, sitePath, pageUrl };
}

module.exports = {
  SITE_ORIGIN,
  LANGUAGES,
  TARGET_DIRS,
  SEGMENT_TAGS,
  segmentKey,
  normalizeText,
  escapeHtml,
  escapeAttr,
  findElementRanges,
  excludedRanges,
  extractSegments,
  applySegments,
  buildChromeDict,
  applyChromeStrings,
  rewriteLinks,
  setHtmlLang,
  setInLanguage,
  replaceMetaContent,
  replaceLinkHref,
  buildAlternates,
  setAlternates,
  fontHeadBlock,
  filePathToSitePath,
  localizePage,
};
