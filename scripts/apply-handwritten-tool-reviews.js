#!/usr/bin/env node
/**
 * Apply unique localized reviews onto handwritten AI-tool URLs.
 * Re-run after a localized regenerate that accidentally overwrote them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const REVIEWS = [
  ...require('./data/handwritten-tool-reviews.js'),
  ...require('./data/gsc20-th-a.js'),
  ...require('./data/gsc20-th-b.js'),
  ...require('./data/gsc20-th-c.js'),
  ...require('./data/gsc20-fr-a.js'),
  ...require('./data/gsc20-fr-b.js'),
  ...require('./data/gsc20-en.js'),
];

function applyOne(rel, review) {
  const abs = path.join(ROOT, rel);
  let html = fs.readFileSync(abs, 'utf8');

  const replaceAttr = (name, attr, value) => {
    const re = new RegExp(`(<meta[^>]+${name}="${attr}"[^>]+content=")[^"]*(")`);
    if (re.test(html)) html = html.replace(re, `$1${value}$2`);
    else {
      const re2 = new RegExp(`(<meta[^>]+content=")[^"]*("[^>]+${name}="${attr}")`);
      if (re2.test(html)) html = html.replace(re2, `$1${value}$2`);
    }
  };

  replaceAttr('name', 'description', review.meta);
  replaceAttr('property', 'og:description', review.meta);
  replaceAttr('name', 'twitter:description', review.meta);
  html = html.replace(/<p class="lead">[\s\S]*?<\/p>/, `<p class="lead">${review.lead}</p>`);

  const cta = html.indexOf('id="get-tool"');
  if (cta < 0) throw new Error(`${rel}: no #get-tool`);
  const firstSection = html.indexOf('<section', cta);
  const relatedDiv = html.indexOf('<div class="related">');
  if (firstSection < 0 || relatedDiv < 0) throw new Error(`${rel}: section anchors missing`);
  const relatedSection = html.lastIndexOf('<section', relatedDiv);
  html = html.slice(0, firstSection) + review.sections.trim() + '\n\n    ' + html.slice(relatedSection);

  fs.writeFileSync(abs, html);
  return rel;
}

function main() {
  const written = REVIEWS.map((r) => applyOne(r.rel, r));
  console.log(`[handwritten-reviews] applied ${written.length} pages`);
  written.forEach((r) => console.log(`  ${r}`));
}

if (require.main === module) main();
module.exports = { applyOne, main };
