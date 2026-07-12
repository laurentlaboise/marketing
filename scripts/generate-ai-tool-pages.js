#!/usr/bin/env node
/**
 * Generate SEO detail pages for each AI tool.
 *
 * URL pattern (like aitoolsdirectory.com/tool/{slug}):
 *   /en/resources/ai-tools/{slug}/index.html
 *
 * Data source: wts-admin/database/seed/top-100-ai-tools.json
 * (same seed used by admin — frontend still hydrates from public API)
 *
 * Usage:
 *   node scripts/generate-ai-tool-pages.js
 *   node scripts/generate-ai-tool-pages.js --clean
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SEED = path.join(ROOT, 'wts-admin/database/seed/top-100-ai-tools.json');
const OUT_DIR = path.join(ROOT, 'en/resources/ai-tools');
const SITE = 'https://wordsthatsells.website';
const CLEAN = process.argv.includes('--clean');

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'tool';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}

function paragraphs(text) {
  const raw = String(text || '').trim();
  if (!raw) return '<p>Details coming soon.</p>';
  return raw
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n');
}

function listHtml(items, empty = 'Details coming soon.') {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!arr.length) return `<ul><li>${esc(empty)}</li></ul>`;
  return `<ul>${arr.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function loadTools() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const tools = Array.isArray(raw) ? raw : raw.tools || [];
  const used = new Set();
  return tools.map((t) => {
    let base = t.slug ? slugify(t.slug) : slugify(t.name);
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return Object.assign({}, t, { slug });
  });
}

function relatedTools(tool, all, limit = 6) {
  return all
    .filter((t) => t.slug !== tool.slug && t.category === tool.category)
    .slice(0, limit);
}

function renderPage(tool, related) {
  const slug = tool.slug;
  const name = tool.name;
  const category = tool.category || 'AI Tools';
  const pricing = tool.pricing_model || tool.pricing || 'Unknown';
  const rating = tool.rating != null ? String(tool.rating) : null;
  const logo = tool.logo_url || tool.logo || '';
  const website = tool.website_url || tool.website_link || '';
  const appStore = tool.app_store_url || tool.app_store_link || '';
  const playStore = tool.play_store_url || tool.play_store_link || '';
  const features = tool.features || tool.key_features || [];
  const pros = tool.pros || [];
  const cons = tool.cons || [];
  const description = tool.description || '';
  const metaDesc = String(description).replace(/\s+/g, ' ').trim().slice(0, 158);
  const canonical = `${SITE}/en/resources/ai-tools/${slug}/`;
  const title = `${name}: AI Tool Review, Features & Pricing | WordsThatSells`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description: metaDesc,
    applicationCategory: category,
    operatingSystem: 'Web',
    url: canonical,
    image: logo || undefined,
    offers: {
      '@type': 'Offer',
      price: pricing.toLowerCase() === 'free' ? '0' : undefined,
      priceCurrency: 'USD',
      description: pricing,
      url: website || canonical
    },
    aggregateRating: rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: rating,
          bestRating: '5',
          worstRating: '1',
          ratingCount: '1'
        }
      : undefined
  };

  const relatedHtml = related.length
    ? related
        .map(
          (r) => `
      <a class="related-card" href="/en/resources/ai-tools/${escAttr(r.slug)}/">
        <strong>${esc(r.name)}</strong>
        <span>${esc(r.category || '')}</span>
      </a>`
        )
        .join('')
    : '<p class="muted">Explore more tools on the <a href="/en/resources/ai-tools/">AI tools directory</a>.</p>';

  const websiteBtn = website
    ? `<a class="btn btn-primary" href="${escAttr(website)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-globe"></i> Visit website</a>`
    : '';
  const appBtn = appStore
    ? `<a class="btn btn-store apple" href="${escAttr(appStore)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-apple"></i> App Store</a>`
    : '';
  const playBtn = playStore
    ? `<a class="btn btn-store google" href="${escAttr(playStore)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-google-play"></i> Google Play</a>`
    : '';
  const storeNote =
    !appStore && !playStore
      ? '<p class="store-note">This tool is primarily web-based — open the website to get started.</p>'
      : '<p class="store-note">Store buttons open official listings in a new tab.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${escAttr(metaDesc)}">
  <meta name="robots" content="index, follow">
  <meta name="keywords" content="${escAttr(`${name}, ${category}, AI tool, ${name} review, ${name} pricing, digital marketing AI`)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <link rel="alternate" hreflang="en" href="${escAttr(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${SITE}/en/resources/ai-tools/">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escAttr(`${name} — AI Tool Guide`)}">
  <meta property="og:description" content="${escAttr(metaDesc)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="WordsThatSells">
  ${logo ? `<meta property="og:image" content="${escAttr(logo)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escAttr(`${name} — AI Tool Guide`)}">
  <meta name="twitter:description" content="${escAttr(metaDesc)}">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <style>
    :root { --navy:#122a3f; --magenta:#d62b83; --muted:#64748b; --border:#e2e8f0; --surface:#f8fafc; }
    body { font-family: Poppins, system-ui, sans-serif; color:#0f172a; background:#fff; margin:0; line-height:1.7; }
    .wrap { max-width: 920px; margin: 0 auto; padding: 1.25rem 1.25rem 3rem; }
    .crumb { font-size: .88rem; color: var(--muted); margin: 1.25rem 0 1rem; }
    .crumb a { color: var(--magenta); text-decoration:none; font-weight:600; }
    .hero { display:grid; grid-template-columns: 96px 1fr; gap: 1.1rem; align-items:start; margin-bottom: 1.5rem; }
    .hero img { width:96px; height:96px; border-radius:18px; border:1px solid var(--border); object-fit:contain; background:#fff; }
    .badge { display:inline-flex; align-items:center; gap:.35rem; background:#fdf2f8; color:#9d174d; border:1px solid #fbcfe8; border-radius:999px; padding:.25rem .7rem; font-size:.78rem; font-weight:700; margin:0 .35rem .35rem 0; }
    .badge.neutral { background:var(--surface); color:#334155; border-color:var(--border); }
    h1 { font-size: clamp(1.6rem, 3vw, 2.15rem); line-height:1.2; margin:.35rem 0 .65rem; color:var(--navy); }
    .lead { color:#334155; font-size:1.02rem; }
    .cta-bar { display:flex; flex-wrap:wrap; gap:.65rem; margin: 1.25rem 0 1.75rem; }
    .btn { display:inline-flex; align-items:center; justify-content:center; gap:.45rem; border-radius:12px; padding:.7rem 1.1rem; font-weight:700; text-decoration:none; font-size:.92rem; }
    .btn-primary { background:var(--magenta); color:#fff; }
    .btn-primary:hover { background:#b91c6f; }
    .btn-store { color:#fff; background:#111827; }
    .btn-store.google { background:#0b57d0; }
    .store-note { font-size:.85rem; color:var(--muted); margin:.25rem 0 0; width:100%; }
    section { margin: 1.75rem 0; }
    h2 { font-size:1.25rem; color:var(--navy); margin:0 0 .75rem; padding-bottom:.4rem; border-bottom:3px solid var(--magenta); }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:1.1rem 1.2rem; }
    ul { margin:.35rem 0 0 1.1rem; }
    li { margin:.35rem 0; }
    .cols { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
    @media (max-width:720px){ .hero{grid-template-columns:72px 1fr} .hero img{width:72px;height:72px} .cols{grid-template-columns:1fr} }
    .related { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:.75rem; }
    .related-card { display:block; border:1px solid var(--border); border-radius:12px; padding:.85rem 1rem; text-decoration:none; color:inherit; background:#fff; }
    .related-card:hover { border-color:#f9a8d4; box-shadow:0 6px 18px rgba(15,23,42,.06); }
    .related-card strong { display:block; color:var(--navy); margin-bottom:.2rem; }
    .related-card span { font-size:.8rem; color:var(--muted); font-weight:600; }
    .muted { color:var(--muted); }
    .back { display:inline-flex; gap:.4rem; align-items:center; color:var(--magenta); font-weight:700; text-decoration:none; margin-bottom:1rem; }
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/en/">Home</a> ·
      <a href="/en/resources/ai-tools/">AI Tools</a> ·
      <span>${esc(name)}</span>
    </nav>
    <a class="back" href="/en/resources/ai-tools/"><i class="fas fa-arrow-left"></i> All AI tools</a>

    <header class="hero">
      ${logo ? `<img src="${escAttr(logo)}" alt="${escAttr(name)} logo" width="96" height="96" loading="eager">` : '<div></div>'}
      <div>
        <div>
          <span class="badge neutral"><i class="fas fa-folder-open"></i> ${esc(category)}</span>
          <span class="badge"><i class="fas fa-tag"></i> ${esc(pricing)}</span>
          ${rating ? `<span class="badge neutral"><i class="fas fa-star" style="color:#f59e0b"></i> ${esc(rating)} / 5</span>` : ''}
        </div>
        <h1>${esc(name)}</h1>
        <p class="lead">${esc(String(description).split(/\n/)[0] || `${name} is an AI tool for ${category}.`)}</p>
      </div>
    </header>

    <div class="cta-bar" id="get-tool">
      ${websiteBtn}
      ${appBtn}
      ${playBtn}
      ${storeNote}
    </div>

    <section>
      <h2>What is ${esc(name)}?</h2>
      <div class="card">
        ${paragraphs(description)}
        <p>${esc(name)} is listed in the WordsThatSells AI tools directory for marketers, agencies, and founders building growth systems across Southeast Asia. Compare features, pricing model, and mobile availability before adding it to your stack.</p>
      </div>
    </section>

    <section>
      <h2>Key features</h2>
      <div class="card">${listHtml(features)}</div>
    </section>

    <section class="cols">
      <div>
        <h2>Pros</h2>
        <div class="card">${listHtml(pros)}</div>
      </div>
      <div>
        <h2>Cons</h2>
        <div class="card">${listHtml(cons)}</div>
      </div>
    </section>

    <section>
      <h2>Who should use ${esc(name)}?</h2>
      <div class="card">
        <ul>
          <li>Marketing teams producing content, creatives, or campaigns faster</li>
          <li>Agencies evaluating tools for client delivery and white-label workflows</li>
          <li>Founders and operators automating research, support, or sales tasks</li>
          <li>SEA businesses that need practical AI with clear pricing signals</li>
        </ul>
      </div>
    </section>

    <section>
      <h2>Pricing</h2>
      <div class="card">
        <p><strong>Listed model:</strong> ${esc(pricing)}. Confirm current plans on the official site — tiers and limits change often.</p>
      </div>
    </section>

    <section>
      <h2>Get ${esc(name)}</h2>
      <div class="cta-bar">
        ${websiteBtn}
        ${appBtn}
        ${playBtn}
      </div>
    </section>

    <section>
      <h2>Related ${esc(category)} tools</h2>
      <div class="related">${relatedHtml}</div>
    </section>
  </main>

  <footer class="footer" data-i18n-links>
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          <img src="/images/SEO_AI_Digital_Marketing_Agency_Laos_Thailand_Asia_logo_with-words_white_colour_SVG.svg" alt="WordsThatSells" class="footer-logo" width="200" height="50">
          <div class="footer-brand-divider"></div>
          <p class="footer-brand-text">Laboise eworker Laos enterprise<br>Empowering businesses in Southeast Asia with AI-driven marketing.</p>
        </div>
        <div class="footer-grid"></div>
      </div>
      <div class="footer-bottom"></div>
    </div>
  </footer>
</body>
</html>
`;
}

function cleanOldToolDirs(tools) {
  if (!fs.existsSync(OUT_DIR)) return;
  const keep = new Set(['index.html', ...tools.map((t) => t.slug)]);
  for (const ent of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (keep.has(ent.name)) continue;
    // only remove generated slug dirs (no dots / special)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ent.name)) continue;
    fs.rmSync(path.join(OUT_DIR, ent.name), { recursive: true, force: true });
  }
}

function main() {
  const tools = loadTools();
  if (CLEAN) cleanOldToolDirs(tools);

  let written = 0;
  for (const tool of tools) {
    const dir = path.join(OUT_DIR, tool.slug);
    fs.mkdirSync(dir, { recursive: true });
    const related = relatedTools(tool, tools);
    fs.writeFileSync(path.join(dir, 'index.html'), renderPage(tool, related), 'utf8');
    written += 1;
  }

  // SEO helper: inject crawlable link list into directory index if marker exists
  const indexPath = path.join(OUT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    const seoList = tools
      .map((t) => `<li><a href="/en/resources/ai-tools/${t.slug}/">${esc(t.name)}</a> — ${esc(t.category || 'AI')}</li>`)
      .join('\n');
    const block = `<!-- AI_TOOLS_SEO_LINKS_START -->
<nav class="ai-tools-seo-links" aria-label="All AI tools" style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;">
  <h2>All AI tools</h2>
  <ul>
${seoList}
  </ul>
</nav>
<!-- AI_TOOLS_SEO_LINKS_END -->`;
    if (indexHtml.includes('AI_TOOLS_SEO_LINKS_START')) {
      indexHtml = indexHtml.replace(
        /<!-- AI_TOOLS_SEO_LINKS_START -->[\s\S]*?<!-- AI_TOOLS_SEO_LINKS_END -->/,
        block
      );
    } else if (indexHtml.includes('<div id="ai-tools-container"')) {
      indexHtml = indexHtml.replace(
        '<div id="ai-tools-container"',
        `${block}\n                <div id="ai-tools-container"`
      );
    }
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
  }

  console.log(`[generate-ai-tool-pages] wrote ${written} pages → en/resources/ai-tools/{slug}/`);
}

main();
