#!/usr/bin/env node
/**
 * AdSense injection for wordsthatsells.website content pages.
 *
 * Idempotent, marker-based, string-anchored — never re-serializes the DOM, so
 * diffs are limited to exactly the injected blocks. Safe to re-run after every
 * publish (`npm run inject:ads`).
 *
 * Usage:
 *   node scripts/inject-adsense.js --dry-run          # classify + report, write nothing
 *   node scripts/inject-adsense.js                    # inject for real
 *   node scripts/inject-adsense.js --only <rel-path>  # limit to specific file(s), repeatable
 *   node scripts/inject-adsense.js --strip            # remove all injected ad markup
 *   node scripts/inject-adsense.js --verbose          # per-file detail even outside dry runs
 *
 * Classification hierarchy (see config/adsense.config.js):
 *   PRIMARY:   path pattern + extracted main-content word count (400-word floor)
 *   SECONDARY: layout anchors. A page matching a monetizable path that clears
 *              the word floor but exposes NONE of its template's anchors goes
 *              to the UNCLASSIFIED list and receives no injection — never guess.
 *
 * Hard exclusions: category index pages, noindex pages, pages already carrying
 * ad markup, anything outside the path patterns (homepage, /company/**,
 * /digital-marketing-services/**, legal, 404, …).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = require(path.join(ROOT, 'config', 'adsense.config.js'));
const { PUBLISHER_ID, ADS_ENABLED, SLOTS, PLACEMENTS, PATH_PATTERNS, RULES } = CONFIG;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const STRIP = argv.includes('--strip');
const VERBOSE = argv.includes('--verbose') || DRY_RUN;
const ONLY = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--only' && argv[i + 1]) ONLY.push(argv[i + 1].replace(/^\.\//, ''));
}

// ---------------------------------------------------------------------------
// Markers + rendering
// ---------------------------------------------------------------------------
const HEAD_START = '<!-- wts-adsense:head:start -->';
const HEAD_END = '<!-- wts-adsense:head:end -->';

const AD_CSS = [
  '.ad-container{margin:2rem 0;padding:8px 8px 12px;text-align:center;background:#f8f9fa;border-radius:8px;overflow:hidden}',
  '.ad-container .ad-label{display:block;font-variant:small-caps;font-size:.7rem;letter-spacing:.14em;color:#94a3b8;margin-bottom:6px}',
  '.ad-slot--horizontal{min-height:100px}',
  '.ad-slot--inarticle{min-height:280px}',
  '.ad-slot--sidebar{min-height:250px;margin-top:1.25rem}',
  '.ad-slot--multiplex{min-height:280px}',
  // The article sidebar collapses above the article on mobile (order:-1);
  // showing its ad there would stack two ads before the content, so hide it.
  '@media (max-width:960px){.ad-slot--sidebar{display:none}}',
].join('');

function headBlock() {
  return [
    HEAD_START,
    `<style id="wts-ads-css">${AD_CSS}</style>`,
    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${PUBLISHER_ID}" crossorigin="anonymous"></script>`,
    '<script defer src="/js/ads.js"></script>',
    HEAD_END,
  ].join('\n');
}

const FORMAT_ATTRS = {
  horizontal: ' data-ad-format="auto" data-full-width-responsive="true"',
  inarticle: ' data-ad-format="fluid" data-ad-layout="in-article"',
  sidebar: ' data-ad-format="auto"',
  multiplex: ' data-ad-format="autorelaxed"',
};

const PARTIAL = fs.readFileSync(path.join(ROOT, 'partials', 'ad-unit.html'), 'utf8')
  .replace(/^<!--[\s\S]*?-->\s*/, ''); // drop the leading documentation comment

function renderUnit(placement) {
  const def = PLACEMENTS[placement];
  return '\n' + PARTIAL
    .replace(/\{\{PLACEMENT\}\}/g, placement)
    .replace(/\{\{FORMAT_CLASS\}\}/g, def.format)
    .replace(/\{\{LAZY\}\}/g, def.lazy ? '1' : '0')
    .replace(/\{\{CLIENT\}\}/g, PUBLISHER_ID)
    .replace(/\{\{SLOT_ID\}\}/g, SLOTS[def.slot])
    .replace(/\{\{FORMAT_ATTRS\}\}/g, FORMAT_ATTRS[def.format])
    .trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// HTML helpers (string-anchored, depth-aware — no DOM re-serialization)
// ---------------------------------------------------------------------------
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
const TAG_RE = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/** Index just past the close tag matching the open tag that starts at openIdx. */
function findMatchingClose(html, openIdx, tagName) {
  TAG_RE.lastIndex = openIdx;
  let depth = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    if (m[0][1] === '!') continue;
    const tag = (m[1] || '').toLowerCase();
    if (tag !== tagName.toLowerCase()) continue;
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) return TAG_RE.lastIndex;
    } else if (!/\/>$/.test(m[0])) {
      depth++;
    }
  }
  return -1;
}

/** Top-level element segments of an HTML fragment: [{start,end,tag,words}]. */
function topLevelSegments(fragment) {
  const segs = [];
  let depth = 0;
  let segStart = -1;
  let segTag = '';
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(fragment))) {
    if (m[0][1] === '!') continue;
    const tag = (m[1] || '').toLowerCase();
    if (!tag) continue;
    const isClose = m[0][1] === '/';
    const isSelfContained = VOID_TAGS.has(tag) || /\/>$/.test(m[0]);
    if (isClose) {
      if (depth > 0) {
        depth--;
        if (depth === 0 && segStart >= 0) {
          segs.push(makeSeg(fragment, segStart, TAG_RE.lastIndex, segTag));
          segStart = -1;
        }
      }
    } else if (isSelfContained) {
      if (depth === 0) segs.push(makeSeg(fragment, m.index, TAG_RE.lastIndex, tag));
    } else {
      if (depth === 0) { segStart = m.index; segTag = tag; }
      depth++;
    }
  }
  return segs;
}

function makeSeg(fragment, start, end, tag) {
  return {
    start, end, tag,
    words: countWords(stripTags(fragment.slice(start, end))),
    head: fragment.slice(start, Math.min(end, start + 200)).toLowerCase(),
  };
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ');
}

/**
 * Script-aware word count. Thai and Lao are written without spaces, so
 * whitespace tokenization massively undercounts them; approximate with
 * characters ÷ 4 (average Thai/Lao word length) and add Latin-ish tokens.
 */
function countWords(text) {
  const thai = (text.match(/[฀-๿]/g) || []).length;
  const lao = (text.match(/[຀-໿]/g) || []).length;
  const rest = text.replace(/[฀-໿]/g, ' ');
  const latin = rest.split(/\s+/).filter((w) => /[A-Za-z0-9À-ɏ]/.test(w)).length;
  return latin + Math.round(thai / 4) + Math.round(lao / 4);
}

/** Find `<tag ... class="...needle..."` open-tag index, or -1. */
function findOpenTagWithClass(html, tagName, classNeedle, from) {
  const re = new RegExp(`<${tagName}\\b[^>]*class="[^"]*${classNeedle}[^"]*"[^>]*>`, 'gi');
  re.lastIndex = from || 0;
  const m = re.exec(html);
  return m ? m.index : -1;
}

/** Same, but matches any tag; returns {index, tag} or null. */
function findAnyTagWithClass(html, classNeedle) {
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*class="[^"]*${classNeedle}[^"]*"[^>]*>`, 'i');
  const m = re.exec(html);
  return m ? { index: m.index, tag: m[1].toLowerCase() } : null;
}

// ---------------------------------------------------------------------------
// Discovery + classification
// ---------------------------------------------------------------------------
function discover() {
  const files = [];
  const langDirs = CONFIG.LANGS.filter((l) => fs.existsSync(path.join(ROOT, l)));
  for (const lang of langDirs) {
    for (const sub of [['articles'], ['resources', 'glossary']]) {
      const dir = path.join(ROOT, lang, ...sub);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.html')) files.push(path.join(lang, ...sub, f));
      }
    }
    const toolsDir = path.join(ROOT, lang, 'resources', 'ai-tools');
    if (fs.existsSync(toolsDir)) {
      for (const slug of fs.readdirSync(toolsDir)) {
        const idx = path.join(toolsDir, slug, 'index.html');
        if (fs.statSync(path.join(toolsDir, slug)).isDirectory() && fs.existsSync(idx)) {
          files.push(path.join(lang, 'resources', 'ai-tools', slug, 'index.html'));
        }
      }
    }
  }
  return files.map((f) => f.split(path.sep).join('/')).sort();
}

function templateForPath(rel) {
  if (PATH_PATTERNS.article.test(rel)) return 'A';
  if (PATH_PATTERNS.glossary.test(rel)) return 'B';
  if (PATH_PATTERNS.tool.test(rel)) return 'C';
  return null;
}

/** Category listing pages are navigation, not content. */
function isCategoryIndex(rel) {
  return /(^|\/)(articles|glossary)\/index\.html$/.test(rel);
}

function hasNoindex(html) {
  return /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
}

/** Extract the main-content region used for the word-count floor. */
function mainContentWords(html, template) {
  let region = null;
  if (template === 'A') {
    const i = html.search(/<article\b/i);
    if (i >= 0) {
      const end = findMatchingClose(html, i, 'article');
      if (end > 0) region = html.slice(i, end);
    }
  }
  if (!region) {
    const i = html.search(/<main\b/i);
    if (i >= 0) {
      const end = findMatchingClose(html, i, 'main');
      if (end > 0) region = html.slice(i, end);
    }
  }
  if (!region) region = html; // last resort: whole page, minus chrome below
  region = region
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  return countWords(stripTags(region));
}

// ---------------------------------------------------------------------------
// Placement engines — each returns { insertions: [{pos, text, unit}], skipped: [{unit, reason}] }
// ---------------------------------------------------------------------------

/** Mid-content insertion points inside a fragment between top-level <p> boundaries. */
function midBoundaries(fragment, opts) {
  const segs = topLevelSegments(fragment).filter((s) => s.words > 0 || !['script', 'style'].includes(s.tag));
  const total = segs.reduce((a, s) => a + s.words, 0);
  const points = [];
  if (!segs.length) return { points, total };

  // A boundary qualifies when the previous block is a closed top-level <p> and
  // the next block starts a paragraph or a new section heading. Non-<p> blocks
  // (.key-insight divs, tables, FAQ containers, .cta-box, forms) can never be
  // adjacent on the leading side, so they are never split or directly preceded.
  const NEXT_OK = ['p', 'h2', 'h3'];

  // Section-wrapped article bodies (older template generation) have no
  // top-level <p> at all — there, the seam between two plain content
  // <section>s is the paragraph boundary. FAQ and internal-link-cluster
  // sections never border an ad (accidental-click policy).
  const isPlainSection = (s) =>
    s.tag === 'section' && !/faq|ecosystem-links|sources|related/.test(s.head);

  if (opts.mode === 'interval') {
    // Every ~INTERVAL words at a qualifying boundary; keep ≥300 words after.
    let since = 0;
    let after = total;
    for (let i = 0; i < segs.length - 1 && points.length < opts.max; i++) {
      since += segs[i].words;
      after -= segs[i].words;
      const boundaryOk =
        (segs[i].tag === 'p' && NEXT_OK.includes(segs[i + 1].tag)) ||
        (isPlainSection(segs[i]) && isPlainSection(segs[i + 1]));
      if (boundaryOk && since >= opts.interval && after >= 300) {
        points.push(segs[i].end);
        since = 0;
      }
    }
  } else {
    // 'fraction' mode: nearest paragraph boundary to each requested fraction.
    for (const frac of opts.fractions) {
      let cum = 0;
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < segs.length - 1; i++) {
        cum += segs[i].words;
        if (segs[i].tag !== 'p' || !NEXT_OK.includes(segs[i + 1].tag)) continue;
        const dist = Math.abs(cum - total * frac);
        if (dist < bestDist) { bestDist = dist; best = segs[i].end; }
      }
      if (best > 0 && !points.includes(best)) points.push(best);
    }
  }
  return { points: points.sort((a, b) => a - b), total };
}

function placeArticle(html, words) {
  const insertions = [];
  const skipped = [];

  // article_top — after the .article-header (which contains .article-meta), before first <h2>.
  const headerIdx = findOpenTagWithClass(html, 'header', 'article-header');
  if (headerIdx >= 0) {
    const end = findMatchingClose(html, headerIdx, 'header');
    if (end > 0) insertions.push({ pos: end, text: renderUnit('article_top'), unit: 'article_top' });
    else skipped.push({ unit: 'article_top', reason: 'unbalanced article-header' });
  } else skipped.push({ unit: 'article_top', reason: '.article-header not found' });

  // article_inarticle_n — every ~800 words between top-level </p><p> boundaries
  // inside .article-content. Non-<p> blocks (.key-insight, tables, FAQ, .cta-box)
  // can never host a boundary, so they are never split or bordered.
  // Newer articles wrap body copy in <div class="article-content">; the older
  // generation puts the class on the <article> element itself with the actual
  // copy one level down in <div itemprop="articleBody">.
  let content = null;
  const bodyMatch = /<(div|section)\b[^>]*itemprop="articleBody"[^>]*>/i.exec(html);
  if (bodyMatch) content = { index: bodyMatch.index, tag: bodyMatch[1].toLowerCase() };
  else content = findAnyTagWithClass(html, 'article-content');
  if (content) {
    const contentIdx = content.index;
    const contentEnd = findMatchingClose(html, contentIdx, content.tag);
    const innerStart = html.indexOf('>', contentIdx) + 1;
    const fragment = html.slice(innerStart, contentEnd);
    const { points } = midBoundaries(fragment, {
      mode: 'interval', interval: RULES.IN_ARTICLE_INTERVAL, max: RULES.MAX_IN_ARTICLE,
    });
    points.forEach((p, n) => insertions.push({
      pos: innerStart + p, text: renderUnit('article_inarticle'), unit: `article_inarticle_${n + 1}`,
    }));
    if (!points.length) skipped.push({ unit: 'article_inarticle', reason: `no qualifying paragraph boundary (${words} words)` });
  } else skipped.push({ unit: 'article_inarticle', reason: '.article-content not found' });

  // article_sidebar — below the existing .sidebar-card, inside the sticky aside.
  const asideIdx = findOpenTagWithClass(html, 'aside', 'article-sidebar');
  if (asideIdx >= 0) {
    const asideEnd = findMatchingClose(html, asideIdx, 'aside');
    if (asideEnd > 0) {
      const closeLen = '</aside>'.length;
      insertions.push({ pos: asideEnd - closeLen, text: renderUnit('article_sidebar'), unit: 'article_sidebar' });
    } else skipped.push({ unit: 'article_sidebar', reason: 'unbalanced aside' });
  } else skipped.push({ unit: 'article_sidebar', reason: '.article-sidebar not found' });

  // article_bottom — after the FAQ container, before the .cta-box (CTA keeps last position).
  const ctaIdx = findOpenTagWithClass(html, 'div', 'cta-box');
  if (ctaIdx >= 0) insertions.push({ pos: ctaIdx, text: renderUnit('article_bottom'), unit: 'article_bottom' });
  else skipped.push({ unit: 'article_bottom', reason: '.cta-box not found' });

  return { insertions, skipped };
}

function placeGlossary(html, words) {
  const insertions = [];
  const skipped = [];

  // glossary_top — after the .concept-jump key-box nav (and hero figure), i.e.
  // immediately before the glossary body <article>.
  const keyBoxIdx = findOpenTagWithClass(html, 'div', 'key-concepts-top');
  const mainIdx = html.search(/<main\b/i);
  const articleIdx = html.indexOf('<article', keyBoxIdx >= 0 ? keyBoxIdx : (mainIdx >= 0 ? mainIdx : 0));
  if (articleIdx > 0) {
    insertions.push({ pos: articleIdx, text: renderUnit('glossary_top'), unit: 'glossary_top' });
  } else skipped.push({ unit: 'glossary_top', reason: 'glossary body <article> not found' });

  // glossary_mid — one fluid unit at the midpoint boundary; two (1/3, 2/3) past 1800 words.
  if (articleIdx > 0) {
    if (words >= RULES.GLOSSARY_MID_MIN) {
      const artEnd = findMatchingClose(html, articleIdx, 'article');
      const innerStart = html.indexOf('>', articleIdx) + 1;
      const fragment = html.slice(innerStart, artEnd);
      const fractions = words >= RULES.GLOSSARY_TWO_MID_MIN ? [1 / 3, 2 / 3] : [0.5];
      const { points } = midBoundaries(fragment, { mode: 'fraction', fractions });
      points.forEach((p, n) => insertions.push({
        pos: innerStart + p, text: renderUnit('glossary_mid'), unit: `glossary_mid_${n + 1}`,
      }));
      if (!points.length) skipped.push({ unit: 'glossary_mid', reason: 'no qualifying paragraph boundary' });
    } else {
      skipped.push({ unit: 'glossary_mid', reason: `body ${words} words < ${RULES.GLOSSARY_MID_MIN} (density rule)` });
    }
  }

  // glossary_bottom — end of definition content: before the related-terms
  // section (a link cluster) and the closing .cta block, both of which keep
  // their positions. Never anywhere near .wts-slide-panel (outside <main>).
  const relIdx = html.search(/<h2[^>]*id=["']related-terms["']/i);
  let bottomPos = relIdx;
  if (bottomPos < 0) bottomPos = findOpenTagWithClass(html, 'div', 'cta');
  if (bottomPos < 0 && articleIdx > 0) {
    const artEnd = findMatchingClose(html, articleIdx, 'article');
    if (artEnd > 0) bottomPos = artEnd - '</article>'.length;
  }
  if (bottomPos >= 0) insertions.push({ pos: bottomPos, text: renderUnit('glossary_bottom'), unit: 'glossary_bottom' });
  else skipped.push({ unit: 'glossary_bottom', reason: 'no end-of-content anchor found' });

  return { insertions, skipped };
}

function placeTool(html, words) {
  const insertions = [];
  const skipped = [];
  const mainIdx = html.search(/<main\b/i);

  // tool_top — after the intro ("What is …?") section: below hero + first CTA
  // bar (keeps separation from the conversion element), before the pros/cons cards.
  let placedTop = false;
  if (mainIdx >= 0) {
    const firstSection = html.indexOf('<section', mainIdx);
    if (firstSection > 0) {
      const end = findMatchingClose(html, firstSection, 'section');
      if (end > 0) {
        insertions.push({ pos: end, text: renderUnit('tool_top'), unit: 'tool_top' });
        placedTop = true;
      }
    }
  }
  if (!placedTop) skipped.push({ unit: 'tool_top', reason: 'intro <section> not found' });

  // tool_mid — after the pros/cons <section class="cols">, before the next
  // content section; ≥1 full section from both .cta-bar elements.
  if (words >= RULES.TOOL_MID_MIN) {
    const colsIdx = findOpenTagWithClass(html, 'section', 'cols');
    if (colsIdx >= 0) {
      const end = findMatchingClose(html, colsIdx, 'section');
      if (end > 0) insertions.push({ pos: end, text: renderUnit('tool_mid'), unit: 'tool_mid' });
      else skipped.push({ unit: 'tool_mid', reason: 'unbalanced .cols section' });
    } else skipped.push({ unit: 'tool_mid', reason: 'pros/cons .cols section not found' });
  } else {
    skipped.push({ unit: 'tool_mid', reason: `body ${words} words < ${RULES.TOOL_MID_MIN} (density rule)` });
  }

  // tool_related — AFTER the .related-card grid (its parent <section>), before
  // </main>. Multiplex format + grey labelled container keeps it visually
  // distinct from the site's own related-tool cards.
  let placedRel = false;
  const relCardIdx = findOpenTagWithClass(html, 'a', 'related-card');
  if (relCardIdx >= 0) {
    const sectionIdx = html.lastIndexOf('<section', relCardIdx);
    if (sectionIdx >= 0) {
      const end = findMatchingClose(html, sectionIdx, 'section');
      if (end > 0) {
        insertions.push({ pos: end, text: renderUnit('tool_related'), unit: 'tool_related' });
        placedRel = true;
      }
    }
  }
  if (!placedRel) {
    const mainEnd = mainIdx >= 0 ? findMatchingClose(html, mainIdx, 'main') : -1;
    if (mainEnd > 0) {
      insertions.push({ pos: mainEnd - '</main>'.length, text: renderUnit('tool_related'), unit: 'tool_related' });
      placedRel = true;
    } else skipped.push({ unit: 'tool_related', reason: 'related grid / </main> not found' });
  }

  return { insertions, skipped };
}

// ---------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------
function processFile(rel) {
  const abs = path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const template = templateForPath(rel);
  const result = { rel, template, status: '', words: 0, injected: [], skipped: [] };

  if (STRIP) {
    const stripped = html
      .replace(/[ \t]*<!-- wts-adsense:head:start -->[\s\S]*?<!-- wts-adsense:head:end -->\n?/g, '')
      .replace(/[ \t]*<!-- wts-ad:start:[\s\S]*?<!-- wts-ad:end -->\n?/g, '');
    if (stripped !== html) {
      if (!DRY_RUN) fs.writeFileSync(abs, stripped);
      result.status = 'STRIPPED';
    } else result.status = 'CLEAN';
    return result;
  }

  if (isCategoryIndex(rel)) { result.status = 'EXCLUDED: category index page'; return result; }
  if (hasNoindex(html)) { result.status = 'EXCLUDED: noindex'; return result; }
  if (html.includes(HEAD_START) || html.includes('class="ad-container')) {
    result.status = 'SKIPPED: already injected (idempotent)';
    return result;
  }

  result.words = mainContentWords(html, template);
  if (result.words < RULES.MIN_WORD_COUNT) {
    result.status = `EXCLUDED: ${result.words} words < ${RULES.MIN_WORD_COUNT} (thin-content floor)`;
    return result;
  }

  const placer = { A: placeArticle, B: placeGlossary, C: placeTool }[template];
  const { insertions, skipped } = placer(html, result.words);
  result.skipped = skipped;

  if (!insertions.length) {
    result.status = 'UNCLASSIFIED: matches monetizable path + word floor but no template anchors found — manual review, nothing injected';
    return result;
  }

  // Apply insertions bottom-up so earlier positions stay valid, then the head block.
  let out = html;
  insertions.sort((a, b) => b.pos - a.pos);
  for (const ins of insertions) out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  const headClose = out.search(/<\/head>/i);
  if (headClose < 0) {
    result.status = 'UNCLASSIFIED: no </head> found — manual review, nothing injected';
    result.skipped = [];
    return result;
  }
  out = out.slice(0, headClose) + headBlock() + '\n' + out.slice(headClose);

  if (!DRY_RUN) fs.writeFileSync(abs, out);
  result.injected = insertions.map((i) => i.unit).reverse();
  result.status = DRY_RUN ? 'WOULD INJECT' : 'INJECTED';
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!ADS_ENABLED && !STRIP) {
    console.log('ADS_ENABLED is false in config/adsense.config.js — nothing to do.');
    console.log('Flip it to true and re-run, or use --strip to remove existing ad markup.');
    return;
  }

  let files = discover();
  if (ONLY.length) files = files.filter((f) => ONLY.includes(f));
  if (!files.length) {
    console.error('No matching files found.');
    process.exitCode = 1;
    return;
  }

  const results = files.map(processFile);
  const byTemplate = { A: [], B: [], C: [] };
  const excluded = [];
  const unclassified = [];
  const already = [];
  let unitCount = 0;

  for (const r of results) {
    if (r.status.startsWith('EXCLUDED')) excluded.push(r);
    else if (r.status.startsWith('UNCLASSIFIED')) unclassified.push(r);
    else if (r.status.startsWith('SKIPPED')) already.push(r);
    else if (r.template) { byTemplate[r.template].push(r); unitCount += r.injected.length; }
  }

  const mode = STRIP ? 'STRIP' : DRY_RUN ? 'DRY RUN' : 'INJECT';
  console.log(`\n=== AdSense injection report (${mode}) — publisher ca-${PUBLISHER_ID} ===\n`);

  if (VERBOSE) {
    for (const r of results) {
      console.log(`${r.rel}`);
      console.log(`  template=${r.template || '-'} words=${r.words} → ${r.status}`);
      if (r.injected.length) console.log(`  units: ${r.injected.join(', ')}`);
      for (const s of r.skipped) console.log(`  skipped ${s.unit}: ${s.reason}`);
    }
    console.log('');
  }

  if (STRIP) {
    console.log(`Stripped: ${results.filter((r) => r.status === 'STRIPPED').length}, already clean: ${results.filter((r) => r.status === 'CLEAN').length}`);
    return;
  }

  console.log('--- Summary ---');
  console.log(`Template A (articles):        ${byTemplate.A.length} pages, ${byTemplate.A.reduce((a, r) => a + r.injected.length, 0)} units`);
  console.log(`Template B (glossary):        ${byTemplate.B.length} pages, ${byTemplate.B.reduce((a, r) => a + r.injected.length, 0)} units`);
  console.log(`Template C (ai-tools):        ${byTemplate.C.length} pages, ${byTemplate.C.reduce((a, r) => a + r.injected.length, 0)} units`);
  console.log(`Already injected (skipped):   ${already.length}`);
  console.log(`Excluded:                     ${excluded.length}`);
  console.log(`UNCLASSIFIED (manual review): ${unclassified.length}`);
  console.log(`Total ad units ${DRY_RUN ? 'planned' : 'injected'}: ${unitCount}`);

  if (excluded.length) {
    console.log('\n--- Excluded ---');
    const reasons = {};
    for (const r of excluded) {
      const key = r.status.replace(/\d+ words/, 'N words');
      (reasons[key] = reasons[key] || []).push(r.rel);
    }
    for (const [reason, list] of Object.entries(reasons)) {
      console.log(`${reason} (${list.length}):`);
      const show = VERBOSE ? list : list.slice(0, 10);
      for (const f of show) console.log(`  ${f}`);
      if (!VERBOSE && list.length > 10) console.log(`  … and ${list.length - 10} more (use --verbose)`);
    }
  }

  console.log('\n--- UNCLASSIFIED (no injection performed — review these manually) ---');
  if (!unclassified.length) console.log('none');
  for (const r of unclassified) console.log(`  ${r.rel} (${r.words} words): ${r.status}`);
  console.log('');
}

if (require.main === module) main();

module.exports = { processFile, discover, countWords, mainContentWords };
