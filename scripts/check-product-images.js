#!/usr/bin/env node
/**
 * Guard against product image URLs that point at files this repo doesn't ship.
 *
 * Fetches the live product catalog (public API) and, for every image_url /
 * slide_in.image hosted on this repo's CDNs (wordsthatsells.website or the
 * jsDelivr mirror of laurentlaboise/marketing@main), asserts the referenced
 * file exists in the working tree. A missing file means the portal will render
 * an empty placeholder on the sell path — that's a failure, not a warning.
 *
 * Usage:
 *   node scripts/check-product-images.js          # repo-file check only
 *   node scripts/check-product-images.js --live   # also HTTP-check each URL (post-deploy)
 *
 * Exit codes: 0 = all referenced files exist, 1 = at least one is missing.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const LIVE = process.argv.includes('--live');
const API = 'https://admin.wordsthatsells.website/api/public/products';
const REPO_ROOT = path.join(__dirname, '..');

// Returns the repo-relative path for URLs served from this repo, else null.
function repoPathFor(url) {
  const m =
    url.match(/^https?:\/\/(?:www\.)?wordsthatsells\.website\/(.+)$/) ||
    url.match(/^https?:\/\/cdn\.jsdelivr\.net\/gh\/laurentlaboise\/marketing@[^/]+\/(.+)$/);
  return m ? decodeURIComponent(m[1].split('?')[0]) : null;
}

async function main() {
  const res = await fetch(API);
  if (!res.ok) {
    console.error(`Could not fetch ${API}: HTTP ${res.status} — skipping check (API down is not a repo regression).`);
    return;
  }
  const products = await res.json();

  const problems = [];
  const external = [];
  let checked = 0;

  for (const p of products) {
    const refs = [
      ['image_url', p.image_url],
      ['slide_in.image', p.slide_in && p.slide_in.image],
    ];
    for (const [field, url] of refs) {
      if (!url) continue;
      const rel = repoPathFor(url);
      if (!rel) {
        external.push(`${p.slug} ${field}: ${url}`);
        continue;
      }
      checked += 1;
      if (!fs.existsSync(path.join(REPO_ROOT, rel))) {
        problems.push(`${p.slug} ${field}: ${url} → missing repo file ${rel}`);
        continue;
      }
      if (LIVE) {
        try {
          const live = await fetch(url, { method: 'HEAD', redirect: 'follow' });
          if (!live.ok) problems.push(`${p.slug} ${field}: ${url} → HTTP ${live.status} (file in repo but not deployed?)`);
        } catch (e) {
          problems.push(`${p.slug} ${field}: ${url} → fetch failed (${e.message})`);
        }
      }
    }
  }

  console.log(`Products: ${products.length}; repo-hosted image refs checked: ${checked}; external refs (not checked): ${external.length}`);
  if (external.length) external.forEach((x) => console.log(`  external: ${x}`));
  if (problems.length) {
    console.error(`\n${problems.length} broken product image reference(s):`);
    problems.forEach((x) => console.error(`  ✗ ${x}`));
    process.exit(1);
  }
  console.log('All repo-hosted product image references resolve to files in the repo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
