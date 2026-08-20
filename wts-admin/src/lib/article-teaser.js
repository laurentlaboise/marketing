/**
 * Listing/sidemenu teaser HTML built from Content Labels — the single source
 * of truth for the article preview card. Shared by the admin form save
 * (src/routes/content.js) and the machine API (src/routes/machine-api.js) so
 * the teaser can never drift depending on which writer saved last.
 *
 * The teaser carries no CTA/"next article" button: the surfaces that show it
 * (listing modal, article side menu) provide their own link to the article.
 * stripTeaserCtaButtons() removes that button from teasers saved before this,
 * so legacy rows lose it without waiting for a re-save.
 */

function escapeHtmlLite(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildArticleListingTeaserHtml({
  title,
  featured_image,
  author_name,
  time_to_read,
  category,
  content_labels,
}) {
  const cl = content_labels && typeof content_labels === 'object' ? content_labels : {};
  const chapters = Array.isArray(cl.chapters) && cl.chapters.length
    ? cl.chapters.map(String).filter(Boolean)
    : (Array.isArray(cl.key_points)
      ? cl.key_points.map((kp) => (typeof kp === 'string' ? kp : (kp && kp.title) || '')).filter(Boolean)
      : []);
  const facts = Array.isArray(cl.facts) ? cl.facts.map(String).filter(Boolean).slice(0, 6) : [];
  const sources = Array.isArray(cl.sources) ? cl.sources.slice(0, 4) : [];
  const desc = (cl.description || '').trim();
  const faqs = cl.faqs_count || 0;
  const read = time_to_read ? `${time_to_read} min read` : '';
  const author = author_name || 'Words That Sells';
  const cat = category || '';
  const metaBits = [author, read, faqs ? `${faqs} FAQs` : ''].filter(Boolean).join(' · ');

  const chapterLis = chapters.map((c) => `<li>${escapeHtmlLite(c)}</li>`).join('');
  const factLis = facts.map((f) => `<li>${escapeHtmlLite(f)}</li>`).join('');
  const sourceBadges = sources.map((src) => {
    const name = typeof src === 'string' ? src : (src && src.name) || 'Source';
    const href = typeof src === 'object' && src && src.url ? src.url : '';
    if (href) {
      return `<a href="${escapeHtmlLite(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#eef2ff;color:#1e3a8a;padding:4px 10px;border-radius:999px;font-size:12px;text-decoration:none;margin:0 6px 6px 0;">${escapeHtmlLite(name)}</a>`;
    }
    return `<span style="display:inline-block;background:#eef2ff;color:#1e3a8a;padding:4px 10px;border-radius:999px;font-size:12px;margin:0 6px 6px 0;">${escapeHtmlLite(name)}</span>`;
  }).join('');

  // If labels are empty, return null so callers keep existing content
  if (!desc && !chapters.length && !facts.length) return null;

  return `<article class="preview-card" data-teaser-source="content_labels" style="font-family:Poppins,system-ui,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;">
  ${featured_image ? `<img src="${escapeHtmlLite(featured_image)}" alt="${escapeHtmlLite(title || '')}" style="width:100%;height:auto;display:block;" onerror="this.style.display='none'">` : ''}
  <div style="padding:1.25rem 1.4rem 1.5rem;">
    ${cat ? `<span style="display:inline-block;background:#1f85c9;color:#fff;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;margin-bottom:10px;">${escapeHtmlLite(cat)}</span>` : ''}
    <h2 style="margin:0 0 8px;font-size:1.25rem;line-height:1.3;color:#122a3f;">${escapeHtmlLite(title || '')}</h2>
    ${metaBits ? `<p style="margin:0 0 14px;color:#64748b;font-size:14px;">${escapeHtmlLite(metaBits)}</p>` : ''}
    ${desc ? `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.55;">${escapeHtmlLite(desc)}</p>` : ''}
    ${chapterLis ? `<h3 style="margin:0 0 8px;font-size:14px;color:#122a3f;">In this guide</h3><ul style="margin:0 0 14px;padding-left:1.1rem;color:#334155;font-size:14px;line-height:1.5;">${chapterLis}</ul>` : ''}
    ${factLis ? `<h3 style="margin:0 0 8px;font-size:14px;color:#122a3f;">Quick facts</h3><ul style="margin:0 0 14px;padding-left:1.1rem;color:#334155;font-size:14px;line-height:1.5;">${factLis}</ul>` : ''}
    ${sourceBadges ? `<h3 style="margin:0 0 8px;font-size:14px;color:#122a3f;">Sources</h3><div style="margin:0 0 16px;">${sourceBadges}</div>` : ''}
  </div>
</article>`;
}

// Any <a>…</a> in a stored teaser. Non-greedy so each anchor is matched on
// its own; anchors cannot nest in valid HTML. No leading/trailing \s* — the
// teaser HTML is uncontrolled input, and whitespace runs next to a literal
// make the match backtrack on long strings of spaces (CodeQL: polynomial
// regex on uncontrolled data).
const ANCHOR_RE = /<a\b[^>]*>[\s\S]*?<\/a>/gi;

// Markers of the trailing arrow the CTA always rendered with.
const ARROW_MARKERS = ['→', '&rarr;', '&#8594;', '&#x2192;', 'fa-arrow-right'];

/**
 * A CTA button, as opposed to a source badge or an inline link: it both looks
 * like a button (button/CTA class, or an inline-block pill with a background)
 * and carries the trailing arrow. Deliberately substring tests over a
 * once-normalized open tag rather than whitespace-tolerant regexes, so hostile
 * teaser HTML has nothing to backtrack.
 */
function isCtaButtonAnchor(anchorHtml) {
  const lower = anchorHtml.toLowerCase();
  if (!ARROW_MARKERS.some((marker) => lower.includes(marker))) return false;

  // One linear normalization pass: collapse whitespace runs, then close the
  // gaps around "=" and ":" so attributes and CSS declarations read the same
  // however they were spaced.
  const tag = lower
    .slice(0, lower.indexOf('>') + 1)
    .replace(/\s+/g, ' ')
    .replace(/ ?([=:]) ?/g, '$1');

  const quote = tag.includes('class="') ? '"' : (tag.includes("class='") ? "'" : '');
  if (quote) {
    const start = tag.indexOf('class=' + quote) + 'class='.length + 1;
    const end = tag.indexOf(quote, start);
    const classNames = (end === -1 ? tag.slice(start) : tag.slice(start, end)).split(' ');
    if (classNames.some((name) => /(?:^|[-_])(?:btn|button|cta)(?:[-_]|$)/.test(name))) return true;
  }

  return (tag.includes('display:inline-block') || tag.includes('display:inline-flex'))
    && tag.includes('background')
    && tag.includes('border-radius');
}

/**
 * Drop the legacy "read full article →" CTA button from a stored teaser card.
 * Source badges (pills without an arrow) and body links are left untouched.
 */
function stripTeaserCtaButtons(html) {
  if (!html || typeof html !== 'string') return html;
  return html.replace(ANCHOR_RE, (anchor) => (isCtaButtonAnchor(anchor) ? '' : anchor));
}

module.exports = { buildArticleListingTeaserHtml, stripTeaserCtaButtons, escapeHtmlLite };
