/**
 * Article AdSense inject for the CMS GitHub-publish path.
 * Same units / markers as marketing/scripts/inject-adsense.js.
 * Keep SLOTS in sync with marketing/config/adsense.config.js.
 */
'use strict';

const PUBLISHER_ID = process.env.ADSENSE_PUBLISHER_ID || 'pub-8300153677207733';
const SLOTS = {
  ARTICLE_TOP: '8924528663',
  IN_ARTICLE: '6647663773',
  ARTICLE_SIDEBAR: '2420378223',
  MULTIPLEX_BOTTOM: '9503113164',
};
const MIN_WORDS = 400;
const IN_ARTICLE_INTERVAL = 800;
const MAX_IN_ARTICLE = 3;

const HEAD_START = '<!-- wts-adsense:head:start -->';
const HEAD_END = '<!-- wts-adsense:head:end -->';
const AD_CSS = [
  '.ad-container{margin:2rem 0;padding:8px 8px 12px;text-align:center;background:#f8f9fa;border-radius:8px;overflow:hidden}',
  '.ad-container .ad-label{display:block;font-variant:small-caps;font-size:.7rem;letter-spacing:.14em;color:#94a3b8;margin-bottom:6px}',
  '.ad-slot--horizontal{min-height:100px}',
  '.ad-slot--inarticle{min-height:280px}',
  '.ad-slot--sidebar{min-height:250px;margin-top:1.25rem}',
  '.ad-slot--multiplex{min-height:280px}',
  '@media (max-width:960px){.ad-slot--sidebar{display:none}}',
].join('');

const FORMAT_ATTRS = {
  horizontal: ' data-ad-format="auto" data-full-width-responsive="true"',
  inarticle: ' data-ad-format="fluid" data-ad-layout="in-article"',
  sidebar: ' data-ad-format="auto"',
  multiplex: ' data-ad-format="autorelaxed"',
};

function headBlock() {
  return [
    HEAD_START,
    `<style id="wts-ads-css">${AD_CSS}</style>`,
    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${PUBLISHER_ID}" crossorigin="anonymous"></script>`,
    '<script defer src="/js/ads.js"></script>',
    HEAD_END,
  ].join('\n');
}

function renderUnit(placement, format, slotKey, lazy) {
  return [
    '',
    `<!-- wts-ad:start:${placement} -->`,
    `<div class="ad-container ad-slot--${format}" role="complementary" aria-label="Advertisement" data-wts-lazy="${lazy}">`,
    '  <span class="ad-label">Advertisement</span>',
    `  <ins class="adsbygoogle" style="display:block" data-ad-client="ca-${PUBLISHER_ID}" data-ad-slot="${SLOTS[slotKey]}"${FORMAT_ATTRS[format]}></ins>`,
    '</div>',
    '<!-- wts-ad:end -->',
    '',
  ].join('\n');
}

const TAG_RE = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

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

function findOpenTagWithClass(html, tag, classNeedle) {
  const re = new RegExp(`<${tag}\\b[^>]*class="[^"]*${classNeedle}[^"]*"[^>]*>`, 'i');
  const m = re.exec(html);
  return m ? m.index : -1;
}

function findAnyTagWithClass(html, classNeedle) {
  const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*class="[^"]*${classNeedle}[^"]*"[^>]*>`, 'i');
  const m = re.exec(html);
  return m ? { index: m.index, tag: m[1].toLowerCase() } : null;
}

function countWords(text) {
  return String(text || '').split(/\s+/).filter((w) => w.length > 0).length;
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

function mainContentWords(html) {
  let region = null;
  const i = html.search(/<article\b/i);
  if (i >= 0) {
    const end = findMatchingClose(html, i, 'article');
    if (end > 0) region = html.slice(i, end);
  }
  if (!region) region = html;
  region = region
    .replace(/<nav[\s\S]*?<\/nav\b[^>]*>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer\b[^>]*>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside\b[^>]*>/gi, ' ');
  return countWords(stripTags(region));
}

function topLevelSegments(fragment) {
  const segs = [];
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  let m;
  while ((m = re.exec(fragment))) {
    if (m[0][1] === '/') continue;
    const tag = m[1].toLowerCase();
    if (['script', 'style', 'br', 'img', 'hr', 'input', 'link', 'meta'].includes(tag)) continue;
    const end = findMatchingClose(fragment, m.index, tag);
    if (end < 0) continue;
    const inner = fragment.slice(m.index, end);
    segs.push({
      tag,
      end,
      words: countWords(stripTags(inner)),
      head: inner.slice(0, 180).toLowerCase(),
    });
    re.lastIndex = end;
  }
  return segs;
}

function midBoundaries(fragment) {
  const segs = topLevelSegments(fragment);
  const total = segs.reduce((a, s) => a + s.words, 0);
  const points = [];
  const NEXT_OK = ['p', 'h2', 'h3'];
  const isPlainSection = (s) =>
    s.tag === 'section' && !/faq|ecosystem-links|sources|related/.test(s.head);
  let since = 0;
  let after = total;
  for (let i = 0; i < segs.length - 1 && points.length < MAX_IN_ARTICLE; i++) {
    since += segs[i].words;
    after -= segs[i].words;
    const boundaryOk =
      (segs[i].tag === 'p' && NEXT_OK.includes(segs[i + 1].tag)) ||
      (isPlainSection(segs[i]) && isPlainSection(segs[i + 1]));
    if (boundaryOk && since >= IN_ARTICLE_INTERVAL && after >= 300) {
      points.push(segs[i].end);
      since = 0;
    }
  }
  return { points, total };
}

function injectHtml(html, rel) {
  const result = { html, rel, status: '', words: 0, injected: [], skipped: [] };
  if (!html || typeof html !== 'string') {
    result.status = 'EXCLUDED: empty html';
    return result;
  }
  if (!/^en\/articles\/[a-z0-9][a-z0-9-]*\.html$/.test(String(rel || ''))) {
    result.status = 'EXCLUDED: path is not a monetizable article page';
    return result;
  }
  if (/<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) {
    result.status = 'EXCLUDED: noindex';
    return result;
  }
  if (html.includes(HEAD_START) || html.includes('class="ad-container')) {
    result.status = 'SKIPPED: already injected (idempotent)';
    return result;
  }

  result.words = mainContentWords(html);
  if (result.words < MIN_WORDS) {
    result.status = `EXCLUDED: ${result.words} words < ${MIN_WORDS} (thin-content floor)`;
    return result;
  }

  const insertions = [];
  const skipped = [];

  const headerIdx = findOpenTagWithClass(html, 'header', 'article-header');
  if (headerIdx >= 0) {
    const end = findMatchingClose(html, headerIdx, 'header');
    if (end > 0) insertions.push({ pos: end, text: renderUnit('article_top', 'horizontal', 'ARTICLE_TOP', '0'), unit: 'article_top' });
    else skipped.push({ unit: 'article_top', reason: 'unbalanced article-header' });
  } else skipped.push({ unit: 'article_top', reason: '.article-header not found' });

  let content = null;
  const bodyMatch = /<(div|section)\b[^>]*itemprop="articleBody"[^>]*>/i.exec(html);
  if (bodyMatch) content = { index: bodyMatch.index, tag: bodyMatch[1].toLowerCase() };
  else content = findAnyTagWithClass(html, 'article-content');
  if (content) {
    const contentEnd = findMatchingClose(html, content.index, content.tag);
    const innerStart = html.indexOf('>', content.index) + 1;
    const fragment = html.slice(innerStart, contentEnd);
    const { points } = midBoundaries(fragment);
    points.forEach((p, n) => insertions.push({
      pos: innerStart + p,
      text: renderUnit('article_inarticle', 'inarticle', 'IN_ARTICLE', '1'),
      unit: `article_inarticle_${n + 1}`,
    }));
    if (!points.length) skipped.push({ unit: 'article_inarticle', reason: `no qualifying paragraph boundary (${result.words} words)` });
  } else skipped.push({ unit: 'article_inarticle', reason: '.article-content not found' });

  const asideIdx = findOpenTagWithClass(html, 'aside', 'article-sidebar');
  if (asideIdx >= 0) {
    const asideEnd = findMatchingClose(html, asideIdx, 'aside');
    if (asideEnd > 0) insertions.push({ pos: asideEnd - '</aside>'.length, text: renderUnit('article_sidebar', 'sidebar', 'ARTICLE_SIDEBAR', '1'), unit: 'article_sidebar' });
    else skipped.push({ unit: 'article_sidebar', reason: 'unbalanced aside' });
  } else skipped.push({ unit: 'article_sidebar', reason: '.article-sidebar not found' });

  const ctaIdx = findOpenTagWithClass(html, 'div', 'cta-box');
  if (ctaIdx >= 0) insertions.push({ pos: ctaIdx, text: renderUnit('article_bottom', 'multiplex', 'MULTIPLEX_BOTTOM', '1'), unit: 'article_bottom' });
  else skipped.push({ unit: 'article_bottom', reason: '.cta-box not found' });

  result.skipped = skipped;
  if (!insertions.length) {
    result.status = 'UNCLASSIFIED: no template anchors found — nothing injected';
    return result;
  }

  let out = html;
  insertions.sort((a, b) => b.pos - a.pos);
  for (const ins of insertions) out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  const headClose = out.search(/<\/head>/i);
  if (headClose < 0) {
    result.status = 'UNCLASSIFIED: no </head> found — nothing injected';
    return result;
  }
  out = out.slice(0, headClose) + headBlock() + '\n' + out.slice(headClose);
  result.html = out;
  result.injected = insertions.map((i) => i.unit).reverse();
  result.status = 'INJECTED';
  return result;
}

module.exports = { injectHtml, SLOTS, PUBLISHER_ID };
