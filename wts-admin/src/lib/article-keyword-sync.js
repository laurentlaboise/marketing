/**
 * Bind an article's seo_keywords to seo_terms.article_link so the
 * keyword-identifier graph (interlink + public SEO terms API) points at
 * a crawlable .html URL. Empty article_link is why terms never "recognize"
 * a newly written article.
 */
const db = require('../../database/db');

function articlePublicPath(slug, lang = 'en') {
  const clean = String(slug || '')
    .replace(/^\/+/, '')
    .replace(/\.html?$/i, '')
    .replace(/^.*\//, '');
  if (!clean) return '';
  return `/${lang}/articles/${clean}.html`;
}

function asKeywords(raw) {
  if (Array.isArray(raw)) return raw.map((k) => String(k).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(',').map((k) => k.trim()).filter(Boolean);
  }
  return [];
}

async function syncArticleKeywordLinks({ slug, keywords, client = db } = {}) {
  const path = articlePublicPath(slug);
  const kws = asKeywords(keywords).map((k) => k.toLowerCase());
  if (!path || !kws.length) return { updated: 0, terms: [] };
  const result = await client.query(
    `UPDATE seo_terms
        SET article_link = $1
      WHERE COALESCE(article_link, '') = ''
        AND lower(term) = ANY($2::text[])
      RETURNING id, term`,
    [path, kws],
  );
  return { updated: result.rowCount, terms: result.rows };
}

module.exports = { syncArticleKeywordLinks, asKeywords };
