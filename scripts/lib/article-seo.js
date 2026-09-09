/**
 * Article SEO helpers shared by the sitemap gate, GitHub publish, and tests.
 * Public article URLs are always `/{lang}/articles/{slug}.html`.
 */
const SITE_ORIGIN = 'https://wordsthatsells.website';

function articlePublicPath(slug, lang = 'en') {
  const clean = String(slug || '')
    .replace(/^\/+/, '')
    .replace(/\.html?$/i, '')
    .replace(/^.*\//, '');
  if (!clean) return '';
  return `/${lang}/articles/${clean}.html`;
}

function articlePublicUrl(slug, lang = 'en') {
  const p = articlePublicPath(slug, lang);
  return p ? `${SITE_ORIGIN}${p}` : '';
}

function isIndexableArticleRel(relFile) {
  const rel = String(relFile || '').replace(/\\/g, '/');
  if (!/^(en|th|la|fr)\/articles\//.test(rel)) return false;
  if (!rel.endsWith('.html')) return false;
  if (/\/index\.html$/.test(rel)) return false;
  if (/example-article|logo-design\.html$/i.test(rel)) return false;
  return true;
}

function assertArticleHead(html, { slug, keywords = [] } = {}) {
  const errors = [];
  const head = String(html || '').slice(0, 12000);
  const url = articlePublicUrl(slug);
  if (!/name=["']robots["'][^>]*content=["']index,\s*follow["']/i.test(head)
    && !/content=["']index,\s*follow["'][^>]*name=["']robots["']/i.test(head)) {
    errors.push('robots must be index, follow');
  }
  if (url && !head.includes(`rel="canonical"`) && !head.includes("rel='canonical'")) {
    errors.push('missing canonical');
  }
  if (url && !head.includes(url)) {
    errors.push(`canonical/og url should include ${url}`);
  }
  if (!/"@type"\s*:\s*"Article"/i.test(html)) {
    errors.push('missing schema.org Article JSON-LD (SOS)');
  }
  if (url && /hreflang=["']x-default["'][^>]*href=["']https:\/\/wordsthatsells\.website\/en\/["']/i.test(head)) {
    errors.push('x-default hreflang must not point at the homepage');
  }
  if (keywords.length) {
    const blob = html.toLowerCase();
    const missing = keywords.filter((k) => !blob.includes(String(k).toLowerCase()));
    if (missing.length === keywords.length) {
      errors.push('none of the SEO keywords appear in the HTML');
    }
  }
  return errors;
}

function sitemapHasLoc(xml, loc) {
  return String(xml || '').includes(`<loc>${loc}</loc>`);
}

function insertSitemapLoc(xml, loc, { lastmod, changefreq = 'weekly', priority = '0.6' } = {}) {
  const body = String(xml || '');
  if (sitemapHasLoc(body, loc)) return { xml: body, changed: false };
  const today = lastmod || new Date().toISOString().slice(0, 10);
  const entry = [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${today}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
    '',
  ].join('\n');
  if (!/<\/urlset>/i.test(body)) {
    throw new Error('sitemap xml missing </urlset>');
  }
  return { xml: body.replace(/<\/urlset>/i, `${entry}</urlset>`), changed: true };
}

function crawlCardHtml(articles) {
  const items = (articles || []).map((a) => {
    const href = a.href || articlePublicPath(a.slug);
    const title = a.title || a.slug;
    const desc = a.description ? `<p>${a.description}</p>` : '';
    return `<li class="article-crawl-card"><a href="${href}"><strong>${title}</strong></a>${desc}</li>`;
  }).join('\n');
  return `<ul class="article-crawl-list" id="article-crawl-list">\n${items}\n</ul>`;
}

module.exports = {
  SITE_ORIGIN,
  articlePublicPath,
  articlePublicUrl,
  isIndexableArticleRel,
  assertArticleHead,
  sitemapHasLoc,
  insertSitemapLoc,
  crawlCardHtml,
};
