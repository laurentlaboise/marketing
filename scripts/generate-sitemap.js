#!/usr/bin/env node
/**
 * Multi-language sitemap generator.
 *
 * Walks the committed language trees (en/ plus th/ la/ fr/ once the page
 * generator has materialized them) and emits sitemap.xml with a full
 * xhtml:link hreflang cluster per URL:
 *   - a page's cluster lists only languages whose file actually exists
 *     (never a soft-fallback URL), plus x-default → English
 *   - localized pages get their own <url> entries with the same cluster
 *
 * Also emits sitemap-images.xml (Google image sitemap) from on-page
 * og:image / featured <img> + alt/title/caption so Image Library SEO
 * on the front is discoverable by Google Images.
 *
 * Also emits, from the same URL inventory:
 *   - sitemap-google.xml: plain <loc>+<lastmod> pairs (clean GSC fetch)
 *   - sitemap-index.xml: sitemapindex over the three child sitemaps
 *
 * Skips: pages whose <meta name="robots"> contains noindex (e.g. the
 * /xx/articles/ SPA shells), checkout pages, and backup/dynamic files.
 *
 * Usage: node scripts/generate-sitemap.js [--out sitemap.xml] [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { SITE_ORIGIN, LANGUAGES, filePathToSitePath } = require('./lib/html-l10n');

const ROOT = path.resolve(__dirname, '..');
const LANG_DIRS = ['en', 'th', 'la', 'fr'];
const HREFLANG_BY_DIR = { en: 'en', th: 'th', la: 'lo', fr: 'fr' };

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const outIndex = args.indexOf('--out');
const OUT_FILE = outIndex !== -1 ? path.resolve(args[outIndex + 1]) : path.join(ROOT, 'sitemap.xml');
const IMAGE_OUT = path.join(ROOT, 'sitemap-images.xml');
const GOOGLE_OUT = path.join(ROOT, 'sitemap-google.xml');
const INDEX_OUT = path.join(ROOT, 'sitemap-index.xml');

function walkHtml(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(full, base));
    else if (entry.name.endsWith('.html') && !/backup|dynamic/i.test(entry.name)) {
      files.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return files.sort();
}

function isRedirectStub(html) {
  return /Moved permanently — WordsThatSells|This page has moved/i.test(html)
    || (/meta\s+http-equiv=["']refresh["']/i.test(html)
      && /noindex/i.test(html)
      && html.length < 4000);
}

function isIndexable(absFile, relFile) {
  if (relFile.startsWith('checkout/')) return false;
  if (/example-article|index-static-backup|articles-dynamic/i.test(relFile)) return false;
  const html = fs.readFileSync(absFile, 'utf8');
  if (isRedirectStub(html)) return false;
  const robots = /<meta\b[^>]*name="robots"[^>]*content="([^"]*)"/i.exec(html.slice(0, 4000));
  if (robots && /noindex/i.test(robots[1])) return false;
  // Placeholder files (e.g. the glossary term stubs, which hold a content
  // prompt + injected footer but no real page) have no extractable text
  // segments — keep them out of the sitemap until real pages exist.
  const { extractSegments } = require('./lib/html-l10n');
  if (Object.keys(extractSegments(html)).length === 0) return false;
  return true;
}

/** True only when a localized mirror is a real published page (not a legacy redirect stub). */
function isRealLangPage(dir, rel) {
  const abs = path.join(ROOT, dir, rel);
  if (!fs.existsSync(abs)) return false;
  const html = fs.readFileSync(abs, 'utf8');
  if (isRedirectStub(html)) return false;
  const robots = /<meta\b[^>]*name="robots"[^>]*content="([^"]*)"/i.exec(html.slice(0, 4000));
  if (robots && /noindex/i.test(robots[1])) return false;
  return true;
}

// changefreq / priority by section (mirrors the tiers of the previous
// hand-maintained sitemap).
function pageMeta(relFile) {
  const sitePath = filePathToSitePath(relFile);
  if (sitePath === '/') return { priority: '1.0', changefreq: 'weekly' };
  if (relFile.startsWith('articles/')) return { priority: '0.6', changefreq: 'weekly' };
  if (sitePath === '/digital-marketing-services/prices/') return { priority: '0.9', changefreq: 'monthly' };
  if (relFile.startsWith('digital-marketing-services/')) return { priority: '0.8', changefreq: 'monthly' };
  if (relFile.startsWith('company/legal/')) return { priority: '0.3', changefreq: 'yearly' };
  if (relFile.startsWith('company/')) return { priority: '0.7', changefreq: 'monthly' };
  if (relFile.startsWith('resources/glossary/') && relFile !== 'resources/glossary/index.html') {
    return { priority: '0.5', changefreq: 'monthly' };
  }
  if (relFile.startsWith('resources/')) return { priority: '0.7', changefreq: 'weekly' };
  return { priority: '0.6', changefreq: 'monthly' };
}

// Prefer the git commit date (stable across clones); file mtime is the
// fallback for shallow checkouts and uncommitted files.
const { execFileSync } = require('child_process');
function lastmod(absFile) {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', absFile], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch (e) { /* no git or no history — fall through */ }
  return fs.statSync(absFile).mtime.toISOString().slice(0, 10);
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pull primary image + SEO fields from page HTML (own-domain preferred). */
function extractPageImage(html) {
  const og = /property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html)
    || /content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
  const ogAlt = /property=["']og:image:alt["'][^>]*content=["']([^"']+)["']/i.exec(html)
    || /content=["']([^"']+)["'][^>]*property=["']og:image:alt["']/i.exec(html);
  const fig = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(html);
  const imgBlock = /<img\b[^>]*class=["'][^"']*featured-image[^"']*["'][^>]*>/i.exec(html)
    || /<img\b[^>]*src=["'][^"']*\/images\/[^"']+["'][^>]*>/i.exec(html);
  let src = og ? og[1] : '';
  let alt = ogAlt ? ogAlt[1] : '';
  let title = '';
  if (imgBlock) {
    const tag = imgBlock[0];
    const srcM = /\bsrc=["']([^"']+)["']/i.exec(tag);
    const altM = /\balt=["']([^"']*)["']/i.exec(tag);
    const titleM = /\btitle=["']([^"']*)["']/i.exec(tag);
    if (!src && srcM) src = srcM[1];
    if (!alt && altM) alt = altM[1];
    if (titleM) title = titleM[1];
  }
  if (!src || !/\/images\//i.test(src)) return null;
  // Prefer first-party host
  if (src.startsWith('/')) src = `${SITE_ORIGIN}${src}`;
  // Skip logos, icons, favicons — not ranking assets
  if (/logo|favicon|icon[_-]|sprite|placeholder/i.test(src)) return null;
  if (/\.svg(\?|$)/i.test(src)) return null;
  const caption = fig ? fig[1].replace(/<[^>]+>/g, '').trim() : '';
  return {
    loc: src.split(/\s/)[0],
    title: title || alt || '',
    caption: caption || alt || '',
  };
}

function urlEntry(loc, meta, mod, alternates, image) {
  const lines = [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${mod}</lastmod>`,
    `    <changefreq>${meta.changefreq}</changefreq>`,
    `    <priority>${meta.priority}</priority>`,
  ];
  for (const alt of alternates) {
    lines.push(`    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${alt.href}" />`);
  }
  if (image && image.loc) {
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${escapeXml(image.loc)}</image:loc>`);
    if (image.title) lines.push(`      <image:title>${escapeXml(image.title)}</image:title>`);
    if (image.caption) lines.push(`      <image:caption>${escapeXml(image.caption)}</image:caption>`);
    lines.push('    </image:image>');
  }
  lines.push('  </url>');
  return lines.join('\n');
}

function imageOnlyEntry(pageLoc, image) {
  const lines = [
    '  <url>',
    `    <loc>${escapeXml(pageLoc)}</loc>`,
    '    <image:image>',
    `      <image:loc>${escapeXml(image.loc)}</image:loc>`,
  ];
  if (image.title) lines.push(`      <image:title>${escapeXml(image.title)}</image:title>`);
  if (image.caption) lines.push(`      <image:caption>${escapeXml(image.caption)}</image:caption>`);
  lines.push('    </image:image>', '  </url>');
  return lines.join('\n');
}

function main() {
  // English tree defines the page inventory; other languages contribute
  // entries only where their mirror file exists.
  const enPages = walkHtml(path.join(ROOT, 'en')).filter((rel) => {
    const abs = path.join(ROOT, 'en', rel);
    return isIndexable(abs, rel);
  });

  const entries = [];
  const imageEntries = [];
  // Plain {loc, mod} inventory shared with sitemap-google.xml (same URLs
  // and lastmod values as sitemap.xml, minus hreflang/image decoration).
  const plainEntries = [];
  let urlCount = 0;

  for (const rel of enPages) {
    const sitePath = filePathToSitePath(rel);
    const meta = pageMeta(rel);
    const enAbs = path.join(ROOT, 'en', rel);
    const enHtml = fs.readFileSync(enAbs, 'utf8');
    const pageImage = extractPageImage(enHtml);

    // Only real published mirrors — skip language-root redirect stubs.
    const presentDirs = LANG_DIRS.filter((dir) => isRealLangPage(dir, rel));
    const alternates = presentDirs.map((dir) => ({
      hreflang: HREFLANG_BY_DIR[dir],
      href: `${SITE_ORIGIN}/${dir}${sitePath}`,
    }));
    alternates.push({ hreflang: 'x-default', href: `${SITE_ORIGIN}/en${sitePath}` });

    for (const dir of presentDirs) {
      const pageLoc = `${SITE_ORIGIN}/${dir}${sitePath}`;
      const mod = lastmod(path.join(ROOT, dir, rel));
      // Image tags only on English (primary) to avoid duplicate image URLs
      const img = dir === 'en' ? pageImage : null;
      entries.push(urlEntry(
        pageLoc,
        meta,
        mod,
        // Only emit the cluster when a page really has alternates.
        presentDirs.length > 1 ? alternates : alternates.filter((a) => ['en', 'x-default'].includes(a.hreflang)),
        img
      ));
      plainEntries.push({ loc: pageLoc, mod });
      urlCount += 1;
      if (dir === 'en' && pageImage) {
        imageEntries.push(imageOnlyEntry(pageLoc, pageImage));
      }
    }
  }

  const generated = new Date().toISOString().slice(0, 10);
  const hasImages = entries.some((e) => e.includes('<image:image>'));
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml"'
      + (hasImages ? '\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : '')
      + '>',
    '',
    '  <!-- Multi-language sitemap (en/th/la/fr). SPA article shells excluded (noindex). -->',
    `  <!-- URL count: ${urlCount} | generated ${generated} by scripts/generate-sitemap.js -->`,
    '',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  const imageXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    `  <!-- Image sitemap | ${imageEntries.length} pages with images | generated ${generated} -->`,
    imageEntries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  // Plain <loc>+<lastmod> sitemap (clean first fetch for Google Search
  // Console) — same URL inventory and lastmod values as sitemap.xml.
  const googleXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- generated by scripts/generate-sitemap.js - do not hand-edit -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    plainEntries
      .map((e) => `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <lastmod>${e.mod}</lastmod>\n  </url>`)
      .join('\n'),
    '</urlset>',
    '',
  ].join('\n');

  // Sitemap index pointing at the three child sitemaps above.
  const indexXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- generated by scripts/generate-sitemap.js - do not hand-edit -->',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <!-- Primary clean URL list (best first fetch for GSC) -->',
    '  <sitemap>',
    `    <loc>${SITE_ORIGIN}/sitemap-google.xml</loc>`,
    `    <lastmod>${generated}</lastmod>`,
    '  </sitemap>',
    '  <!-- Full multi-language sitemap with hreflang + optional image tags -->',
    '  <sitemap>',
    `    <loc>${SITE_ORIGIN}/sitemap.xml</loc>`,
    `    <lastmod>${generated}</lastmod>`,
    '  </sitemap>',
    '  <!-- Google Images discovery -->',
    '  <sitemap>',
    `    <loc>${SITE_ORIGIN}/sitemap-images.xml</loc>`,
    `    <lastmod>${generated}</lastmod>`,
    '  </sitemap>',
    '</sitemapindex>',
    '',
  ].join('\n');

  if (DRY_RUN) {
    console.log(xml);
    console.error('--- sitemap-images.xml ---');
    console.log(imageXml);
    console.error('--- sitemap-google.xml ---');
    console.log(googleXml);
    console.error('--- sitemap-index.xml ---');
    console.log(indexXml);
  } else {
    fs.writeFileSync(OUT_FILE, xml, 'utf8');
    fs.writeFileSync(IMAGE_OUT, imageXml, 'utf8');
    fs.writeFileSync(GOOGLE_OUT, googleXml, 'utf8');
    fs.writeFileSync(INDEX_OUT, indexXml, 'utf8');
  }
  console.error(`[sitemap] ${urlCount} URLs (${enPages.length} English pages) → ${DRY_RUN ? 'stdout' : path.relative(ROOT, OUT_FILE)}`);
  console.error(`[sitemap-images] ${imageEntries.length} image pages → ${DRY_RUN ? 'stdout' : path.relative(ROOT, IMAGE_OUT)}`);
  console.error(`[sitemap-google] ${plainEntries.length} URLs → ${DRY_RUN ? 'stdout' : path.relative(ROOT, GOOGLE_OUT)}`);
  console.error(`[sitemap-index] 3 child sitemaps → ${DRY_RUN ? 'stdout' : path.relative(ROOT, INDEX_OUT)}`);
}

main();
