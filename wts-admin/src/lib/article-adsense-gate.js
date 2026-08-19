/**
 * AdSense qualify gate for the article CMS.
 * Google reviews the live site as publisher inventory. Thin published posts
 * from this admin (or Make/machine API) become the next reject. Drafts are free.
 */
const MIN_PUBLISH_WORDS = 800;

function countArticleWords(html) {
  const raw = String(html || '').replace(/<[^>]*>/g, ' ');
  return raw.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Returns an error string if this save would publish thin inventory; else null. */
function publishBlockedReason(status, html, wordCount) {
  if (String(status || '').toLowerCase() !== 'published') return null;
  const n = Number(wordCount);
  const words = Number.isFinite(n) && n > 0 ? n : countArticleWords(html);
  if (words < MIN_PUBLISH_WORDS) {
    return `Cannot publish under ${MIN_PUBLISH_WORDS} words (got ${words}). Save as draft until the article is original long-form. Thin posts fail Google AdSense site review.`;
  }
  return null;
}

module.exports = { MIN_PUBLISH_WORDS, countArticleWords, publishBlockedReason };
