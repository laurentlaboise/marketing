/**
 * Listing/sidemenu teaser HTML built from Content Labels — the single source
 * of truth for the article preview card. Shared by the admin form save
 * (src/routes/content.js) and the machine API (src/routes/machine-api.js) so
 * the teaser can never drift depending on which writer saved last.
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
  published_url,
  slug,
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
  const cta = (cl.cta_text || 'Read full article').trim();
  const faqs = cl.faqs_count || 0;
  const url = published_url
    || (slug ? `https://wordsthatsells.website/en/articles/${slug}.html` : '#');
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
    <a href="${escapeHtmlLite(url)}" style="display:inline-block;background:#1f85c9;color:#fff;padding:10px 18px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">${escapeHtmlLite(cta)} →</a>
  </div>
</article>`;
}

module.exports = { buildArticleListingTeaserHtml, escapeHtmlLite };
