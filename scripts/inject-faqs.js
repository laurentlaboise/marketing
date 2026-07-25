#!/usr/bin/env node
/**
 * Build-time FAQ injection (SEO-safe, translation-correct).
 *
 * Reads the committed faqs.json (published by wts-admin, or the seed
 * bootstrap) and rewrites the region between <!-- faq:start --> and
 * <!-- faq:end --> markers on every placement page × existing language
 * mirror with, in order:
 *   1. the page's pinned FAQs as <details> accordion items, localized;
 *   2. a matching FAQPage JSON-LD block (only when pinned items exist);
 *   3. a <script type="application/json" id="faq-pool"> data island with
 *      the page's pool items for the "Ask another question" interaction.
 *
 * Language rules (docs/FAQ_BACKEND_MIGRATION_PLAN.md §4-5):
 *   - Internal locale keys are the directory codes en|th|la|fr. Only
 *     HTML-facing output maps la → lo (lang attributes, JSON-LD
 *     inLanguage).
 *   - A pinned item on a non-English page requires a translation payload
 *     (question AND answer); otherwise it is WITHHELD from that page's
 *     rendered set and schema — visible content, JSON-LD and inLanguage
 *     always agree. Pool items may fall back to English; fallback entries
 *     carry lang:"en" in the island and are never part of JSON-LD.
 *   - /en/ hrefs inside answers are rewritten to the page language.
 *
 * Script-context safety: everything embedded in a <script> element is
 * serialized with an HTML-safe JSON encoder (<, >, & and U+2028/U+2029
 * emitted as \uXXXX escapes) so answer text can never terminate the
 * element or inject markup — tag sanitization alone does not cover this.
 *
 * Error contract (stricter than the footer injector, because a partial
 * bake means inconsistent content and schema across languages):
 *   - malformed faqs.json aborts before any write;
 *   - a page file without markers is not targeted → skipped silently;
 *   - any error on a targeted page fails the whole run: output is staged
 *     in memory and written only when every targeted page/language
 *     succeeded, else the process exits nonzero and writes nothing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// --source rewrites the committed SOURCE HTML (GitHub Pages serves it);
// default (no flag) rewrites ./dist after webpack, like inject-footers.
const SOURCE_MODE = process.argv.includes('--source');
const DRY_RUN = process.argv.includes('--dry-run');
// --base <dir> overrides the target tree entirely (used by the tests to
// bake into a fixture directory instead of the repo or dist).
const baseIdx = process.argv.indexOf('--base');
const BASE = baseIdx > -1 && process.argv[baseIdx + 1]
  ? path.resolve(process.argv[baseIdx + 1])
  : (SOURCE_MODE ? ROOT : DIST);

const configIdx = process.argv.indexOf('--config');
const CONFIG = configIdx > -1 && process.argv[configIdx + 1]
  ? path.resolve(process.argv[configIdx + 1])
  : path.join(ROOT, 'faqs.json');

const LANG_DIRS = ['en', 'th', 'la', 'fr'];
// Directory code → HTML-facing lang code. Only Lao differs.
const HTML_LANG = { en: 'en', th: 'th', la: 'lo', fr: 'fr' };

const START = '<!-- faq:start -->';
const END = '<!-- faq:end -->';

// HTML-safe JSON: <, >, & and U+2028/U+2029 as \uXXXX escapes so a literal
// "</script>" (or an HTML comment opener) inside CMS text cannot terminate
// the surrounding <script> element.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const escapeHtml = (t) => String(t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Attribute values additionally need quote escaping — text-context escaping
// alone would let a double quote terminate the attribute.
const escapeAttr = (t) => escapeHtml(t).replace(/"/g, '&quot;');

// The pool data island carries NO HTML strings: answers are decomposed into
// a structured node tree ({ t: tag, href?, c: [child|string...] }) that the
// frontend renders with createElement/textContent only. The browser never
// re-parses CMS text as HTML, which is what makes the client immune to
// markup injection by construction (and keeps CodeQL's DOM-text-to-HTML
// query quiet for the right reason). The grammar is exactly the admin's
// sanitizer allowlist; anything malformed degrades to plain text.
const TREE_TAGS = ['a', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br'];
const TREE_TAG_RE = new RegExp(`<(\\/)?(${TREE_TAGS.join('|')})\\b([^>]*)>`, 'gi');

// &amp; decodes LAST: doing it first would turn pre-escaped sequences like
// "&amp;lt;" into "&lt;" and then double-unescape them into a real "<"
// (CodeQL js/double-escaping).
const decodeEntities = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

const stripToText = (html) => decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function answerTree(html) {
  const root = { c: [] };
  const stack = [root];
  let last = 0;
  let m;
  const re = new RegExp(TREE_TAG_RE.source, 'gi');
  const pushText = (raw) => {
    const text = decodeEntities(raw);
    if (text) stack[stack.length - 1].c.push(text);
  };
  while ((m = re.exec(html))) {
    pushText(html.slice(last, m.index));
    last = re.lastIndex;
    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    if (tag === 'br') {
      if (!closing) stack[stack.length - 1].c.push({ t: 'br' });
      continue;
    }
    if (closing) {
      const node = stack.pop();
      if (!node || node.t !== tag) throw new Error('malformed answer markup');
    } else {
      const node = { t: tag, c: [] };
      if (tag === 'a') {
        const href = /href\s*=\s*"([^"]*)"/i.exec(m[3]);
        // Site-relative (single slash — "//host" is protocol-relative and
        // therefore external) or absolute https only.
        if (href && /^(\/(?!\/)|https:\/\/)/.test(href[1])) node.href = href[1];
      }
      stack[stack.length - 1].c.push(node);
      stack.push(node);
    }
  }
  pushText(html.slice(last));
  if (stack.length !== 1) throw new Error('malformed answer markup');
  return root.c;
}

// Malformed markup must never fail the bake — it degrades to plain text.
const answerTreeSafe = (html) => {
  try {
    return answerTree(html);
  } catch (e) {
    return [stripToText(html)];
  }
};

// Serialize a tree back to allowlisted HTML. Pinned answers pass through
// tree-then-serialize so the static markup and the pool island share one
// normalization pipeline: non-allowlisted attributes and tags can never
// reach the page even if an unsanitized string slips into faqs.json.
function treeToHtml(nodes) {
  return nodes.map((node) => {
    if (typeof node === 'string') return escapeHtml(node);
    if (!node || !TREE_TAGS.includes(node.t)) return '';
    if (node.t === 'br') return '<br>';
    const attrs = node.t === 'a' && node.href ? ` href="${escapeAttr(node.href)}"` : '';
    return `<${node.t}${attrs}>${treeToHtml(node.c || [])}</${node.t}>`;
  }).join('');
}

// Editors author links against /en/; mirrors get language-local hrefs.
// Covers root-relative and absolute-origin forms, same as the l10n pipeline.
function localizeLinks(html, langDir) {
  if (langDir === 'en') return html;
  return String(html)
    .replace(/href="\/en\//g, `href="/${langDir}/`)
    .replace(/href="https:\/\/wordsthatsells\.website\/en\//g, `href="https://wordsthatsells.website/${langDir}/`);
}

// Strip tags for JSON-LD Answer.text? No — Google accepts limited HTML
// (including <a>) in Answer.text, and keeping the links preserves their
// crawlable value inside the schema too.

function resolveItem(faq, langDir) {
  const q = faq.question[langDir];
  const a = faq.answer_html[langDir];
  if (langDir !== 'en' && (!q || !a)) return null; // untranslated
  return {
    slug: faq.slug,
    q: q || faq.question.en,
    // Normalized through the same tree pipeline as the pool island (see
    // treeToHtml) — never the raw answer_html string.
    a: treeToHtml(answerTreeSafe(localizeLinks(a || faq.answer_html.en, langDir))),
    lang: q && a ? langDir : 'en',
  };
}

function detailsHtml(item, first) {
  return [
    `<details class="accordion-item reveal" id="faq-${item.slug}"${first ? ' open' : ''}>`,
    `    <summary class="accordion-summary"><h3>${escapeHtml(item.q)}</h3><i class="fas fa-chevron-down icon" aria-hidden="true"></i></summary>`,
    `    <div class="accordion-content">${item.a}</div>`,
    '</details>',
  ].join('\n                    ');
}

function faqPageJsonLd(items, langDir) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: HTML_LANG[langDir],
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return `<script type="application/ld+json">${jsonForScript(schema)}</script>`;
}

function buildRegion(config, pagePath, langDir) {
  const placement = config.placements[pagePath];
  const bySlug = new Map(config.faqs.map((f) => [f.slug, f]));

  const pinned = [];
  for (const slug of placement.pinned) {
    const faq = bySlug.get(slug);
    if (!faq) throw new Error(`placement references unknown slug "${slug}"`);
    const item = resolveItem(faq, langDir);
    if (item && item.lang === langDir) pinned.push(item); // withhold untranslated on non-en
  }

  const pool = [];
  for (const slug of placement.pool) {
    const faq = bySlug.get(slug);
    if (!faq) throw new Error(`placement references unknown slug "${slug}"`);
    const q = faq.question[langDir];
    const a = faq.answer_html[langDir];
    pool.push({
      slug: faq.slug,
      q: q || faq.question.en,
      tree: answerTreeSafe(localizeLinks(a || faq.answer_html.en, langDir)),
      lang: q && a ? langDir : 'en',
    });
  }

  const parts = [];
  pinned.forEach((item, i) => parts.push(detailsHtml(item, i === 0)));
  if (pinned.length > 0) parts.push(faqPageJsonLd(pinned, langDir));
  parts.push(`<script type="application/json" id="faq-pool">${jsonForScript({ lang: langDir, items: pool })}</script>`);

  return parts.join('\n                    ');
}

function injectFile(filePath, region) {
  const html = fs.readFileSync(filePath, 'utf8');
  const startIdx = html.indexOf(START);
  if (startIdx < 0) return null; // no markers → page not targeted
  if (html.indexOf(START, startIdx + START.length) >= 0) {
    throw new Error('multiple faq:start markers');
  }
  const endIdx = html.indexOf(END, startIdx);
  if (endIdx < 0) throw new Error('faq:start without faq:end');
  const before = html.slice(0, startIdx + START.length);
  const after = html.slice(endIdx);
  return `${before}\n                    ${region}\n                    ${after}`;
}

function main() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    if (!config || typeof config.placements !== 'object' || !Array.isArray(config.faqs)) {
      throw new Error('missing placements/faqs');
    }
  } catch (err) {
    console.error(`[inject-faqs] ABORT: cannot use ${CONFIG}: ${err.message}`);
    process.exit(1);
  }

  const staged = []; // { filePath, content }
  const errors = [];
  let skipped = 0;

  for (const pagePath of Object.keys(config.placements)) {
    for (const langDir of LANG_DIRS) {
      const rel = pagePath.replace(/^\/en\//, `${langDir}/`) + 'index.html';
      const filePath = path.join(BASE, rel);
      if (!fs.existsSync(filePath)) continue; // mirror not materialized yet
      try {
        const region = buildRegion(config, pagePath, langDir);
        const content = injectFile(filePath, region);
        if (content === null) { skipped++; continue; }
        staged.push({ filePath, rel, content });
      } catch (err) {
        errors.push(`${rel}: ${err.message}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`[inject-faqs] FAILED — nothing written (${errors.length} error${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  let changed = 0;
  for (const { filePath, rel, content } of staged) {
    if (fs.readFileSync(filePath, 'utf8') === content) continue;
    changed++;
    if (!DRY_RUN) fs.writeFileSync(filePath, content);
    else console.log(`[inject-faqs] would update ${rel}`);
  }
  console.log(`[inject-faqs] targeted ${staged.length}, changed ${changed}, no-markers ${skipped}${DRY_RUN ? ' (dry run)' : ''}`);
}

main();
