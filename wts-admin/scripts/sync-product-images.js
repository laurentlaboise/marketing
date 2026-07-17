#!/usr/bin/env node
/**
 * Wire products.image_url / products.slide_in_image to the product images
 * deployed on the marketing CDN (GitHub Pages), via the Machine API.
 *
 * For every active product it resolves the expected asset
 *   https://wordsthatsells.website/images/products/{slug}-featured.webp
 * (see SLUG_TO_FILE for slug↔filename exceptions), and only writes a URL
 * to the database after the URL has been verified to return HTTP 200.
 * Products whose current image_url already resolves are left untouched
 * unless --force is given.
 *
 * Unlike sync-products-to-stripe.js this script previews by default —
 * it UPDATEs ~40 rows on the sell path, so mutation is opt-in.
 *
 * Usage (from wts-admin):
 *   export ADMIN_API_TOKEN='…'   # Railway → marketing service → Variables
 *   node scripts/sync-product-images.js               # dry-run: print the plan
 *   node scripts/sync-product-images.js --apply       # verify + write
 *   node scripts/sync-product-images.js --apply --library   # also upsert Image Library rows
 *
 * Options:
 *   --apply          perform the writes (default: dry-run)
 *   --force          also rewrite URLs that currently resolve (standardize hosts)
 *   --library        register each verified file in the Image Library (images/seo-upsert)
 *   --only=<slugs>   comma-separated product slugs to process
 *   --base=<url>     Machine API base (default https://admin.wordsthatsells.website/api/machine)
 *   --site=<url>     public site base (default https://wordsthatsells.website)
 *
 * Requires: ADMIN_API_TOKEN, Node 18+ (global fetch). No other dependencies.
 */
/* eslint-disable no-console */

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const LIBRARY = process.argv.includes('--library');
const ONLY = ((process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const BASE = (process.argv.find((a) => a.startsWith('--base=')) || '').split('=')[1]
  || process.env.ADMIN_API_BASE
  || 'https://admin.wordsthatsells.website/api/machine';
const SITE = (process.argv.find((a) => a.startsWith('--site=')) || '').split('=')[1]
  || 'https://wordsthatsells.website';
const TOKEN = process.env.ADMIN_API_TOKEN || '';

// DB slug → asset basename, where they differ. Everything else uses
// `${slug}-featured.webp` in images/products/.
// The July 2026 catalogue consolidation merged variant SKUs into single
// products with named options; their art keeps the variant filenames, so
// each consolidated slug maps to one representative variant's image
// (matching the URLs already wired in the DB).
const SLUG_TO_FILE = {
  'document-translation': 'ai-document-translation',
  'website-copywriting': 'website-copywriting-1000-characters',
  'seo-article-copywriting-package': '3-seo-article-copywriting-package',
  'metal-utap-nfc-cards': '25-metal-utap-nfc-cards',
  'virtual-cards': 'virtual-card-biz-plus',
  'seo-branded-stock-photos': '10-seo-branded-stock-photos',
  'social-media-post-generator': 'social-media-post-generator-starter',
  'wordpress-divi-services': 'wordpress-divi-website-setup-and-design',
  'website-forms': 'standard-website-form',
  'video-forms': 'video-form',
  'sme-all-in-one-digital-package': 'sme-all-in-one-digital-package-basic-monthly',
  'canva-pro-access': 'canva-pro-access-monthly',
};

// jsDelivr mirror of the same repo path — the Image Library's cdn_url convention.
const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main';

function api(path, opts = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

async function urlIsLive(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    // Some CDNs reject HEAD; confirm with a ranged GET before declaring dead.
    if (!res.ok) res = await fetch(url, { method: 'GET', redirect: 'follow', headers: { Range: 'bytes=0-0' } });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!TOKEN || TOKEN.length < 16) {
    console.error('ADMIN_API_TOKEN missing — Railway → marketing service → Variables.');
    process.exit(1);
  }

  const res = await api('/v1/products?status=active&limit=500');
  if (!res.ok) {
    console.error(`GET /v1/products failed: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const products = (await res.json()).products || [];
  let list = ONLY.length ? products.filter((p) => ONLY.includes(p.slug)) : products;

  const plan = [];
  const skipped = [];
  for (const p of list) {
    const fileBase = SLUG_TO_FILE[p.slug] || p.slug;
    const featuredUrl = `${SITE}/images/products/${fileBase}-featured.webp`;

    const currentOk = p.image_url ? await urlIsLive(p.image_url) : false;
    if (currentOk && !FORCE) {
      skipped.push({ slug: p.slug, reason: `current image_url resolves (${p.image_url})` });
      continue;
    }

    if (!(await urlIsLive(featuredUrl))) {
      skipped.push({
        slug: p.slug,
        reason: `${featuredUrl} is not live (HTTP non-200)${p.image_url ? ` — current image_url also broken: ${p.image_url}` : ''}`,
      });
      continue;
    }

    plan.push({
      slug: p.slug,
      name: p.name,
      fileBase,
      from: p.image_url || '(empty)',
      update: { slug: p.slug, image_url: featuredUrl, slide_in_image: featuredUrl },
    });
  }

  console.log(`Products (active): ${list.length}`);
  console.log(`To update: ${plan.length}   Skipped: ${skipped.length}\n`);
  for (const row of plan) console.log(`  SET   ${row.slug}\n        ${row.from} → ${row.update.image_url}`);
  for (const row of skipped) console.log(`  SKIP  ${row.slug} — ${row.reason}`);

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write.');
    return;
  }
  if (!plan.length) {
    console.log('\nNothing to write.');
    return;
  }

  const write = await api('/v1/products/bulk-update-copy', {
    method: 'POST',
    body: JSON.stringify({ updates: plan.map((r) => r.update) }),
  });
  const result = await write.json().catch(() => ({}));
  if (!write.ok) {
    console.error(`\nbulk-update-copy failed: HTTP ${write.status} ${JSON.stringify(result)}`);
    process.exit(1);
  }
  console.log(`\nWrote: ${result.updated} updated, ${result.failed} failed`);
  for (const r of result.results || []) {
    if (!r.ok) console.error(`  FAIL ${r.slug || r.id}: ${r.error}`);
  }

  // Post-write verification through the same door the portal uses.
  const adminOrigin = BASE.replace(/\/api\/machine\/?$/, '');
  const pub = await fetch(`${adminOrigin}/api/public/products`);
  const pubProducts = pub.ok ? await pub.json() : [];
  let verified = 0;
  for (const row of plan) {
    const now = pubProducts.find((p) => p.slug === row.slug);
    if (now && now.image_url === row.update.image_url && (await urlIsLive(now.image_url))) verified += 1;
    else console.error(`  VERIFY FAIL ${row.slug}: public payload image_url=${now ? now.image_url : '(product missing)'}`);
  }
  console.log(`Verified via /api/public/products: ${verified}/${plan.length}`);

  if (LIBRARY) {
    let upserted = 0;
    for (const row of plan) {
      const filename = `${row.fileBase}-featured.webp`;
      const lib = await api('/v1/images/seo-upsert', {
        method: 'POST',
        body: JSON.stringify({
          filename: `products/${filename}`,
          also_match: filename,
          new_filename: `products/${filename}`,
          new_cdn_url: `${JSDELIVR_BASE}/images/products/${filename}`,
          alt_text: `${row.name} — featured product image`,
          title: row.name,
          width: 1200,
          height: 628,
        }),
      });
      if (lib.ok) upserted += 1;
      else console.error(`  LIBRARY FAIL ${row.slug}: HTTP ${lib.status} ${await lib.text()}`);
    }
    console.log(`Image Library rows upserted: ${upserted}/${plan.length}`);
  }

  if ((result.failed || 0) > 0 || verified < plan.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
