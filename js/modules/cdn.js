/**
 * jsDelivr CDN URL helper for wordsthatsells.website
 *
 * Generates CDN URLs for images hosted in the laurentlaboise/marketing
 * GitHub repository, served through jsDelivr's global CDN.
 *
 * Usage:
 *   import { cdnUrl, cdnImage, purgeUrl } from './modules/cdn.js';
 *
 *   cdnUrl('images/hero/ai-digital-marketing.webp');
 *   // => https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/hero/ai-digital-marketing.webp
 *
 *   cdnUrl('images/logos/logo.svg', 'v1.0.0');
 *   // => https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@v1.0.0/images/logos/logo.svg
 */

const CDN_CONFIG = {
  baseUrl: 'https://cdn.jsdelivr.net/gh',
  purgeUrl: 'https://purge.jsdelivr.net/gh',
  user: 'laurentlaboise',
  repo: 'marketing',
  defaultVersion: 'main',
};

/**
 * Build a jsDelivr CDN URL for a file in the repository.
 * @param {string} path - File path relative to repo root (e.g. 'images/hero/photo.webp')
 * @param {string} [version] - Branch, tag, or commit hash. Defaults to 'main'.
 * @returns {string} Full jsDelivr CDN URL
 */
export function cdnUrl(path, version) {
  const ver = version || CDN_CONFIG.defaultVersion;
  const cleanPath = path.replace(/^\/+/, '');
  return `${CDN_CONFIG.baseUrl}/${CDN_CONFIG.user}/${CDN_CONFIG.repo}@${ver}/${cleanPath}`;
}

/**
 * Build a jsDelivr CDN URL specifically for images.
 * Convenience wrapper that prepends 'images/' if not already present.
 * @param {string} imagePath - Image path (e.g. 'hero/photo.webp' or 'images/hero/photo.webp')
 * @param {string} [version] - Branch, tag, or commit hash.
 * @returns {string} Full jsDelivr CDN URL for the image
 */
export function cdnImage(imagePath, version) {
  const path = imagePath.startsWith('images/') ? imagePath : `images/${imagePath}`;
  return cdnUrl(path, version);
}

/**
 * Build a jsDelivr purge URL to invalidate a cached file.
 * Visit this URL (GET request) to clear the CDN cache for the file.
 * @param {string} path - File path relative to repo root
 * @param {string} [version] - Branch, tag, or commit hash.
 * @returns {string} Purge URL
 */
export function purgeUrl(path, version) {
  const ver = version || CDN_CONFIG.defaultVersion;
  const cleanPath = path.replace(/^\/+/, '');
  return `${CDN_CONFIG.purgeUrl}/${CDN_CONFIG.user}/${CDN_CONFIG.repo}@${ver}/${cleanPath}`;
}

/**
 * Create an HTML img element string with SEO attributes.
 * Useful for dynamic content insertion (e.g. blog articles loaded via API).
 * @param {object} options
 * @param {string} options.src - Image path for cdnImage()
 * @param {string} options.alt - Descriptive alt text (required for SEO)
 * @param {string} [options.title] - Title attribute
 * @param {number} [options.width] - Image width in pixels
 * @param {number} [options.height] - Image height in pixels
 * @param {boolean} [options.lazy=true] - Use lazy loading
 * @param {string} [options.version] - CDN version
 * @param {string} [options.fallback] - Fallback image URL on error
 * @returns {string} HTML img tag string
 */
export function cdnImgTag(options) {
  const {
    src,
    alt,
    title,
    width,
    height,
    lazy = true,
    version,
    fallback,
  } = options;

  const url = cdnImage(src, version);
  const attrs = [
    `src="${url}"`,
    `alt="${alt}"`,
  ];

  if (title) attrs.push(`title="${title}"`);
  if (width) attrs.push(`width="${width}"`);
  if (height) attrs.push(`height="${height}"`);
  if (lazy) {
    attrs.push('loading="lazy"');
  } else {
    attrs.push('fetchpriority="high"');
  }
  attrs.push('decoding="async"');
  if (fallback) {
    attrs.push(`onerror="this.onerror=null;this.src='${fallback}'"`);
  }

  return `<img ${attrs.join(' ')}>`;
}

/**
 * Generate Schema.org ImageObject JSON-LD for an image.
 * Used for structured data that AI search engines parse.
 * @param {object} options
 * @param {string} options.src - Image path for cdnImage()
 * @param {string} options.name - Image name/title
 * @param {string} options.description - Detailed image description
 * @param {string} options.pageUrl - URL of the page containing the image
 * @param {number} [options.width] - Image width
 * @param {number} [options.height] - Image height
 * @param {string} [options.format] - MIME type (e.g. 'image/webp')
 * @param {string} [options.version] - CDN version
 * @returns {object} Schema.org ImageObject
 */
export function imageSchema(options) {
  const {
    src,
    name,
    description,
    pageUrl,
    width,
    height,
    format,
    version,
  } = options;

  const schema = {
    '@type': 'ImageObject',
    contentUrl: cdnImage(src, version),
    url: pageUrl,
    name,
    description,
    creator: {
      '@type': 'Organization',
      name: 'WordsThatSells.website',
      url: 'https://wordsthatsells.website',
    },
    copyrightHolder: {
      '@type': 'Organization',
      name: 'WordsThatSells.website',
    },
  };

  if (width) schema.width = width;
  if (height) schema.height = height;
  if (format) schema.encodingFormat = format;

  return schema;
}
