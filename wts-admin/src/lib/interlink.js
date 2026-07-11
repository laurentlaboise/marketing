// Internal-link (SEO) injection: hyperlink glossary / SEO-term mentions in
// long-form content to their term pages — the interlinking half of the
// article editor's auto-hyperlink feature, shared server-side so the
// translation pipeline gets it too.
//
// One engine for every language:
//   en          → term names straight from the glossary / seo_terms tables,
//                 links to /en/resources/glossary/<slug>.html (glossary) or
//                 the term's own article/glossary link (SEO terms).
//   th, la, fr  → the PUBLISHED translation of each term is the matchable
//                 name (so Lao only ever links names a human approved), and
//                 the link points at the localized mirror of the term page.
//                 Mirrors that aren't generated yet fall back to English
//                 via the site's 404 handler — links never dead-end.
//
// Matching discipline (SEO-shaped):
//   - longest term first, one link per term, hard cap per document;
//   - only in text nodes — never inside existing anchors, headings,
//     script/style, or tag markup;
//   - word-boundary matching for spaced scripts, plain substring for
//     Thai/Lao (no word breaks);
//   - anchor format mirrors the article editor's client-side linker
//     (class="auto-linked auto-linked-<type>") so styling applies evenly.
const db = require('../../database/db');

const NO_WORD_BREAK_LANGS = new Set(['th', 'la', 'lo']);
const DEFAULT_MAX_LINKS = 12;

const glossaryUrl = (lang, slug) => `/${lang}/resources/glossary/${slug}.html`;

// Rewrite an English site path to its localized mirror; external URLs and
// non-/en/ paths pass through untouched.
function localizeLink(link, lang) {
  if (!link || lang === 'en') return link || '';
  return link.replace(/^\/en\//, `/${lang}/`);
}

// Attribute-context escaping (quotes included — esc()-style helpers that
// stop at <>& must never build attribute values).
function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Linkable terms for a language, longest name first. `exclude` skips one
// entity (a term's own page must not link to itself).
async function buildTermIndex(lang, { exclude = null, client = db } = {}) {
  const [glossary, seoTerms] = await Promise.all([
    client.query(
      `SELECT id, term, definition, slug FROM glossary
       WHERE slug IS NOT NULL AND slug <> ''`
    ),
    client.query(
      `SELECT id, term, COALESCE(short_definition, definition) AS definition,
              article_link, glossary_link
       FROM seo_terms
       WHERE COALESCE(article_link, glossary_link) IS NOT NULL`
    ),
  ]);

  const base = [
    ...glossary.rows.map((g) => ({
      entityType: 'glossary', entityId: String(g.id), type: 'glossary',
      name: g.term, definition: g.definition || '',
      link: glossaryUrl('en', g.slug), localizedLink: glossaryUrl(lang, g.slug),
    })),
    ...seoTerms.rows.map((s) => ({
      entityType: 'seo_term', entityId: String(s.id), type: 'seo',
      name: s.term, definition: s.definition || '',
      link: s.article_link || s.glossary_link,
      localizedLink: localizeLink(s.article_link || s.glossary_link, lang),
    })),
  ].filter((t) => t.name && t.link);

  let entries;
  if (lang === 'en') {
    entries = base.map((t) => ({ ...t, matchName: t.name, href: t.link }));
  } else {
    // Only published (human-approved) translated names are matchable.
    const translated = await client.query(
      `SELECT entity_type, entity_id, content_payload->>'term' AS term
       FROM translations
       WHERE entity_type IN ('glossary', 'seo_term')
         AND target_language = $1 AND status = 'published'
         AND COALESCE(content_payload->>'term', '') <> ''`,
      [lang]
    );
    const names = new Map(
      translated.rows.map((r) => [`${r.entity_type}:${r.entity_id}`, r.term])
    );
    entries = base
      .map((t) => {
        const name = names.get(`${t.entityType}:${t.entityId}`);
        return name ? { ...t, matchName: name, href: t.localizedLink } : null;
      })
      .filter(Boolean);
  }

  if (exclude) {
    entries = entries.filter(
      (t) => !(t.entityType === exclude.entityType && t.entityId === String(exclude.entityId))
    );
  }

  // Longest first so "technical SEO" wins over "SEO"; dedupe on the
  // matchable name so two entities never fight over one phrase.
  entries.sort((a, b) => b.matchName.length - a.matchName.length);
  const seen = new Set();
  return entries.filter((t) => {
    const key = t.matchName.toLowerCase();
    if (seen.has(key) || t.matchName.length < 3) return false;
    seen.add(key);
    return true;
  });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Split HTML into alternating segments and mark which text is eligible for
// linking (outside anchors, headings, script/style).
function segments(html) {
  const out = [];
  const re = /<[^>]*>/g;
  let last = 0;
  let anchorDepth = 0;
  let blockedDepth = 0; // headings + script/style
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) {
      out.push({ text: html.slice(last, m.index), eligible: anchorDepth === 0 && blockedDepth === 0 });
    }
    const tag = m[0];
    const name = (tag.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/) || [])[1];
    const lower = (name || '').toLowerCase();
    const closing = /^<\s*\//.test(tag);
    const selfClosing = /\/>$/.test(tag);
    if (lower === 'a' && !selfClosing) anchorDepth = Math.max(0, anchorDepth + (closing ? -1 : 1));
    if ((/^h[1-6]$/.test(lower) || lower === 'script' || lower === 'style') && !selfClosing) {
      blockedDepth = Math.max(0, blockedDepth + (closing ? -1 : 1));
    }
    out.push({ tag });
    last = re.lastIndex;
  }
  if (last < html.length) {
    out.push({ text: html.slice(last), eligible: anchorDepth === 0 && blockedDepth === 0 });
  }
  return out;
}

function anchorFor(term, visibleText) {
  const title = escAttr((term.definition || '').slice(0, 200));
  return `<a href="${escAttr(term.href)}" class="auto-linked auto-linked-${term.type}"` +
    ` title="${title}" data-type="${term.type}">${visibleText}</a>`;
}

// Link the first occurrence of each term in `html` (or plain text — same
// path), respecting the eligibility rules. Returns { html, linked, count }.
function injectTermLinks(html, terms, { lang = 'en', maxLinks = DEFAULT_MAX_LINKS } = {}) {
  if (!html || typeof html !== 'string' || !terms.length) {
    return { html: html || '', linked: [], count: 0 };
  }
  const substringMode = NO_WORD_BREAK_LANGS.has(lang);
  const segs = segments(html);
  const linked = [];
  const used = new Set();

  for (const term of terms) {
    if (linked.length >= maxLinks) break;
    if (used.has(term.matchName.toLowerCase())) continue;

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.tag !== undefined || !seg.eligible || !seg.text.trim()) continue;

      let start = -1;
      let matchText = null;
      if (substringMode) {
        start = seg.text.indexOf(term.matchName);
        if (start !== -1) matchText = term.matchName;
      } else {
        // Word-boundary match without \b (Unicode-safe): no letter/number
        // may directly precede or follow the term.
        const re = new RegExp(
          `(^|[^\\p{L}\\p{N}])(${escapeRegex(term.matchName)})(?![\\p{L}\\p{N}])`,
          'iu'
        );
        const m = seg.text.match(re);
        if (m) {
          start = m.index + m[1].length;
          matchText = m[2];
        }
      }
      if (start === -1) continue;

      // Replace this text segment with before + opaque anchor + after, so
      // OTHER terms can still match around the link (a long plain-text
      // field is one segment) while nothing ever matches inside it.
      segs.splice(i, 1,
        { text: seg.text.slice(0, start), eligible: true },
        { tag: anchorFor(term, matchText) },
        { text: seg.text.slice(start + matchText.length), eligible: true });
      used.add(term.matchName.toLowerCase());
      linked.push({ term: term.matchName, href: term.href, type: term.type });
      break;
    }
  }

  return {
    html: segs.map((s) => (s.tag !== undefined ? s.tag : s.text)).join(''),
    linked,
    count: linked.length,
  };
}

module.exports = { buildTermIndex, injectTermLinks, localizeLink, DEFAULT_MAX_LINKS };
