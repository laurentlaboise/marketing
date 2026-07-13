// Link hygiene for auto-linked content — pure string transforms, no DB.
//
// Two production defects this repairs (and keeps repaired):
//
//   1. Nested auto-links. The article form's client-side linker used to
//      re-wrap terms that were already linked, leaving invalid
//      <a class="auto-linked"><a class="auto-linked">term</a></a> nests in
//      saved bodies. stripNestedAutoLinks() unwraps them (outer wins; the
//      duplicates always carry the same href).
//
//   2. Dead glossary hrefs. Glossary rows were slugged independently of the
//      static pages under en/resources/glossary/, so DB-derived links like
//      /en/resources/glossary/alt-attributes.html 404'd — the real page is
//      alt-attributes-seo-and-accessibility-2026.html. GLOSSARY_SLUG_MAP is
//      the reviewed one-to-one reconciliation (every static page claimed
//      exactly once; only 'progressive-web-apps' has no page and is left
//      alone). rewriteGlossaryHrefs() repairs already-injected links in any
//      language mirror; the DB migration applies the same map to
//      glossary.slug so future links are born correct.
//
// Shared by the boot migration (database/db.js), the static-page generator
// (generate-seo-articles.js) and tests — keep this file dependency-free.

// Old DB slug → basename of the real static page (no .html).
const GLOSSARY_SLUG_MAP = {
  'accelerated-mobile-pages-amp': 'amp-accelerated-mobile-pages-guide-2026',
  'agile-content-development': 'agile-content-development-for-seo-2026',
  'alt-attributes': 'alt-attributes-seo-and-accessibility-2026',
  'anchor-text': 'anchor-text-optimization-guide-2026',
  'backlinks': 'backlinks-building-strategy-2026',
  'bad-neighborhood': 'bad-neighborhood-links-risks-2026',
  'blocker': 'content-blockers-in-seo-2026',
  'briefing': 'seo-briefing-template-2026',
  'broken-link': 'broken-link-building-guide-2026',
  'business-directory': 'business-directory-submissions-2026',
  'cloaking': 'cloaking-seo-penalty-risk-2026',
  'competition': 'seo-competition-analysis-2026',
  'content-editor': 'seo-content-editor-role-2026',
  'content-gap-analysis': 'content-gap-analysis-strategy-guide-2026',
  'content-marketing': 'content-marketing-strategy-2026',
  'content-relevance': 'content-relevance-signals-2026',
  'conversion': 'seo-conversion-optimization-2026',
  'cookies': 'cookies-and-seo-impact-2026',
  'crawlers': 'search-engine-crawlers-guide-2026',
  'domain-popularity': 'domain-popularity-metrics-2026',
  'domain-trust': 'domain-trust-signals-2026',
  'duplicate-content': 'duplicate-content-issues-and-fixes-2026',
  'featured-snippets': 'featured-snippets-optimization-2026',
  'frame': 'frames-and-seo-problems-2026',
  'generative-engine-optimization-geo': 'geo-generative-engine-optimization-strategies-2026',
  'google-ads': 'google-ads-strategy-2026-guide',
  'google-knowledge-graph': 'google-knowledge-graph-optimization-2026',
  'google-lighthouse': 'google-lighthouse-audit-guide-2026',
  'google-maps': 'google-maps-seo-guide-2026',
  'google-my-business': 'google-business-profile-optimization-2026',
  'google-news': 'google-news-seo-strategy-2026',
  'index': 'search-index-management-2026',
  'internal-links': 'internal-linking-strategy-2026',
  'keyword': 'keywords-in-seo-2026-guide',
  'keyword-cannibalization': 'keyword-cannibalization-detection-and-fix-2026',
  'keyword-density': 'keyword-density-myths-2026',
  'keyword-proximity': 'keyword-proximity-in-seo-2026',
  'keyword-stuffing': 'keyword-stuffing-penalties-2026',
  'link-juice': 'link-juice-flow-strategy-2026',
  'link-popularity': 'link-popularity-metrics-2026',
  'link-text': 'link-text-anchor-best-practices-2026',
  'meta-description': 'meta-description-optimization-2026',
  'meta-tag': 'meta-tags-for-seo-2026',
  'offpage-optimization': 'offpage-optimization-strategies-2026',
  'onpage-optimization': 'onpage-optimization-checklist-2026',
  'page-content': 'page-content-optimization-2026',
  'page-title': 'page-title-optimization-2026',
  'paid-listing': 'paid-listings-vs-organic-2026',
  'ranking-factor': 'seo-ranking-factors-2026',
  'ranking-opportunities': 'finding-seo-ranking-opportunities-2026',
  'rankings': 'tracking-seo-rankings-2026',
  'rich-snippets': 'rich-snippets-with-structured-data-2026',
  'robots-txt': 'robots-txt-best-practices-2026',
  'search-engine': 'how-search-engines-work-2026',
  'search-engine-advertising': 'search-engine-advertising-sea-guide-2026',
  'search-engine-guidelines': 'search-engine-guidelines-compliance-2026',
  'search-engine-marketing': 'search-engine-marketing-sem-2026',
  'search-engine-optimization-seo': 'search-engine-optimization-seo-2026',
  'search-engine-registration': 'search-engine-submission-myths-2026',
  'search-engine-spam': 'search-engine-spam-penalties-2026',
  'search-result': 'understanding-search-results-2026',
  'search-term': 'search-terms-vs-keywords-2026',
  'search-volume': 'search-volume-analysis-2026',
  'seo-visibility': 'seo-visibility-metrics-2026',
  'sitemap-xml': 'sitemap-xml-best-practices-2026',
  'ssl-encryption': 'ssl-encryption-for-seo-2026',
  'structured-data': 'structured-data-implementation-2026',
  'topic-explorer': 'topic-explorer-tools-for-seo-2026',
  'topical-relevance': 'topical-relevance-and-authority-2026',
  'universal-search': 'universal-search-optimization-2026',
  'url': 'url-structure-for-seo-2026',
  'user-experience': 'user-experience-ux-in-seo-2026',
  'user-search-intent': 'search-intent-optimization-2026',
  'user-signals': 'user-signals-in-ranking-2026',
  'web-catalogues': 'web-catalogues-and-directories-2026',
  'web-directory': 'web-directory-submissions-2026',
  'web-pages': 'optimizing-web-pages-for-seo-2026',
  'webmaster-guidelines': 'google-webmaster-guidelines-2026',
  'website': 'website-seo-fundamentals-2026',
  'website-structure': 'website-structure-for-seo-2026',
  'zero-click-searches': 'zero-click-searches-impact-and-strategy-2026',
};

const TAG_RE = /<[^>]*>/g;
const isAutoLinkOpen = (tag) =>
  /^<a\b/i.test(tag) && !/^<\s*\//.test(tag) && /class="[^"]*\bauto-linked\b[^"]*"/i.test(tag);
const isAnchorOpen = (tag) => /^<a\b/i.test(tag) && !/^<\s*\//.test(tag) && !/\/>$/.test(tag);
const isAnchorClose = (tag) => /^<\s*\/\s*a\s*>/i.test(tag);

// Unwrap auto-linked anchors nested inside other auto-linked anchors: the
// outer anchor is kept, inner open/close pairs are dropped. Linear
// single-pass token walk — no backtracking regex over the whole document.
function stripNestedAutoLinks(html) {
  if (!html || typeof html !== 'string' || !/auto-linked/.test(html)) return html || '';
  const out = [];
  const stack = []; // 'auto' | 'dropped' | 'other' per open <a>
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html)) !== null) {
    if (m.index > last) out.push(html.slice(last, m.index));
    const tag = m[0];
    if (isAnchorOpen(tag)) {
      const insideAuto = stack.includes('auto');
      if (isAutoLinkOpen(tag) && insideAuto) {
        stack.push('dropped');
      } else {
        stack.push(isAutoLinkOpen(tag) ? 'auto' : 'other');
        out.push(tag);
      }
    } else if (isAnchorClose(tag)) {
      if (stack.pop() !== 'dropped') out.push(tag);
    } else {
      out.push(tag);
    }
    last = TAG_RE.lastIndex;
  }
  if (last < html.length) out.push(html.slice(last));
  return out.join('');
}

// Repair glossary hrefs that use a pre-reconciliation slug, in any language
// mirror (/en/, /la/, /th/, /fr/ — the mirrors share filenames).
function rewriteGlossaryHrefs(html) {
  if (!html || typeof html !== 'string') return html || '';
  return html.replace(
    /(href="\/[a-z]{2}\/resources\/glossary\/)([a-z0-9-]+)(\.html")/g,
    (whole, prefix, slug, suffix) =>
      GLOSSARY_SLUG_MAP[slug] ? prefix + GLOSSARY_SLUG_MAP[slug] + suffix : whole
  );
}

// Unwrap auto-linked AI-tool anchors that point OFF-site, keeping their
// text. Every external tool link found in production was a false positive
// (prose "durable"/"type"/"consensus", and "Claude" in Claude Hopkins,
// linked to vendor domains); the linkers now only mint internal tool-page
// links, so an external auto-linked-ai-tool anchor is by definition stale.
// Hand-written external links are untouched — they never carry the class.
function unwrapExternalAiToolLinks(html) {
  if (!html || typeof html !== 'string' || !/auto-linked-ai-tool/.test(html)) return html || '';
  const isExternalToolOpen = (tag) =>
    /class="[^"]*\bauto-linked-ai-tool\b[^"]*"/i.test(tag) && /href="https?:\/\//i.test(tag);
  const out = [];
  const stack = []; // 'dropped' | 'kept' per open <a>
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html)) !== null) {
    if (m.index > last) out.push(html.slice(last, m.index));
    const tag = m[0];
    if (isAnchorOpen(tag)) {
      if (isExternalToolOpen(tag)) {
        stack.push('dropped');
      } else {
        stack.push('kept');
        out.push(tag);
      }
    } else if (isAnchorClose(tag)) {
      if (stack.pop() !== 'dropped') out.push(tag);
    } else {
      out.push(tag);
    }
    last = TAG_RE.lastIndex;
  }
  if (last < html.length) out.push(html.slice(last));
  return out.join('');
}

const sanitizeAutoLinks = (html) =>
  rewriteGlossaryHrefs(unwrapExternalAiToolLinks(stripNestedAutoLinks(html)));

module.exports = {
  GLOSSARY_SLUG_MAP,
  stripNestedAutoLinks,
  rewriteGlossaryHrefs,
  unwrapExternalAiToolLinks,
  sanitizeAutoLinks,
};
