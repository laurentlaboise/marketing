#!/usr/bin/env node
/**
 * Meta Pixel injection for wordsthatsells.website public pages.
 *
 * Idempotent, marker-based, string-anchored — never re-serializes the DOM, so
 * diffs are limited to the injected head block. Safe to re-run after every
 * publish (`npm run inject:pixel`).
 *
 * Usage:
 *   node scripts/inject-pixel.js --dry-run          # classify + report, write nothing
 *   node scripts/inject-pixel.js                    # inject for real
 *   node scripts/inject-pixel.js --only <rel-path>  # limit to specific file(s), repeatable
 *   node scripts/inject-pixel.js --strip            # remove all injected pixel markup
 *   node scripts/inject-pixel.js --verbose          # per-file detail even outside dry runs
 *   node scripts/inject-pixel.js --base <dir>       # treat <dir> as the site root (tests)
 *
 * Official fbq loader is inserted verbatim. PageView only — no extra events.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const STRIP = argv.includes('--strip');
const VERBOSE = argv.includes('--verbose') || DRY_RUN;
const ONLY = [];
let ROOT = DEFAULT_ROOT;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--only' && argv[i + 1]) ONLY.push(argv[i + 1].replace(/^\.\//, ''));
  if (argv[i] === '--base' && argv[i + 1]) ROOT = path.resolve(argv[i + 1]);
}

// Config always loads from the repo (not --base). --base only remaps HTML roots.
const CONFIG = require(path.join(DEFAULT_ROOT, 'config', 'pixel.config.js'));
const {
  PIXEL_ID,
  PIXEL_ENABLED,
  LEGACY_PIXEL_ID,
  INCLUDE_PATTERNS,
  EXCLUDE_PATTERNS,
  WALK_ROOTS,
} = CONFIG;

// ---------------------------------------------------------------------------
// Official snippet (loader kept intact — only PIXEL_ID is interpolated)
// ---------------------------------------------------------------------------
const HEAD_START = '<!-- wts-pixel:head:start -->';
const HEAD_END = '<!-- wts-pixel:head:end -->';

function officialSnippet(pixelId) {
  return [
    '<!-- Meta Pixel Code -->',
    '<script>',
    '!function(f,b,e,v,n,t,s)',
    '{if(f.fbq)return;n=f.fbq=function(){n.callMethod?',
    'n.callMethod.apply(n,arguments):n.queue.push(arguments)};',
    'if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version=\'2.0\';',
    'n.queue=[];t=b.createElement(e);t.async=!0;',
    't.src=v;s=b.getElementsByTagName(e)[0];',
    's.parentNode.insertBefore(t,s)}(window, document,\'script\',',
    '\'https://connect.facebook.net/en_US/fbevents.js\');',
    `fbq('init', '${pixelId}');`,
    `fbq('track', 'PageView');`,
    '</script>',
    '<noscript><img height="1" width="1" style="display:none"',
    `src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"`,
    '/></noscript>',
    '<!-- End Meta Pixel Code -->',
  ].join('\n');
}

function headBlock(pixelId) {
  return [HEAD_START, officialSnippet(pixelId), HEAD_END].join('\n');
}

function matchesAny(rel, patterns) {
  return patterns.some((re) => re.test(rel));
}

function isBackupName(rel) {
  return /backup|dynamic/i.test(path.posix.basename(rel));
}

function hasNoindex(html) {
  return /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
}

function is404Page(rel, html) {
  if (/(^|\/)404\.html$/.test(rel)) return true;
  if (/Custom 404 handler/i.test(html)) return true;
  if (/<title>[^<]*\b404\b/i.test(html)) return true;
  return false;
}

function hasPixel(html) {
  if (html.includes(HEAD_START)) return true;
  if (/connect\.facebook\.net\/en_US\/fbevents\.js/i.test(html)) return true;
  if (/facebook\.com\/tr\?id=/i.test(html)) return true;
  if (/fbq\s*\(\s*['"]init['"]/i.test(html)) return true;
  if (html.includes(LEGACY_PIXEL_ID)) return true;
  return false;
}

function classifyPath(rel) {
  if (isBackupName(rel)) return 'EXCLUDED: backup/dynamic file';
  if (matchesAny(rel, EXCLUDE_PATTERNS)) return 'EXCLUDED: path rule';
  if (!matchesAny(rel, INCLUDE_PATTERNS)) return 'EXCLUDED: not in include list';
  return null;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------
function walkHtml(dir, base) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'checkout' || entry.name === 'node_modules') continue;
      files.push(...walkHtml(full, base));
    } else if (entry.name.endsWith('.html')) {
      files.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return files;
}

function discover(root) {
  const base = root || ROOT;
  const files = [];
  const rootIndex = path.join(base, 'index.html');
  if (fs.existsSync(rootIndex)) files.push('index.html');
  for (const relRoot of WALK_ROOTS) {
    files.push(...walkHtml(path.join(base, relRoot), base));
  }
  return [...new Set(files)].sort();
}

// ---------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------
function processFile(rel, opts) {
  const root = (opts && opts.root) || ROOT;
  const pixelId = (opts && opts.pixelId) || PIXEL_ID;
  const dryRun = opts && opts.dryRun !== undefined ? opts.dryRun : DRY_RUN;
  const strip = opts && opts.strip !== undefined ? opts.strip : STRIP;
  const abs = path.join(root, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const result = { rel, status: '' };

  if (strip) {
    const stripped = html.replace(
      /[ \t]*<!-- wts-pixel:head:start -->[\s\S]*?<!-- wts-pixel:head:end -->\n?/g,
      ''
    );
    if (stripped !== html) {
      if (!dryRun) fs.writeFileSync(abs, stripped);
      result.status = 'STRIPPED';
    } else result.status = 'CLEAN';
    return result;
  }

  const pathStatus = classifyPath(rel);
  if (pathStatus) { result.status = pathStatus; return result; }
  if (is404Page(rel, html)) { result.status = 'EXCLUDED: 404 page'; return result; }
  if (hasNoindex(html)) { result.status = 'EXCLUDED: noindex'; return result; }
  if (hasPixel(html)) {
    result.status = 'SKIPPED: already injected (idempotent)';
    return result;
  }

  const headClose = html.search(/<\/head>/i);
  if (headClose < 0) {
    result.status = 'UNCLASSIFIED: no </head> found — nothing injected';
    return result;
  }

  const out = html.slice(0, headClose) + headBlock(pixelId) + '\n' + html.slice(headClose);
  if (!dryRun) fs.writeFileSync(abs, out);
  result.status = dryRun ? 'WOULD INJECT' : 'INJECTED';
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!PIXEL_ENABLED && !STRIP) {
    console.log('PIXEL_ENABLED is false in config/pixel.config.js — nothing to do.');
    console.log('Flip it to true and re-run, or use --strip to remove existing pixel markup.');
    return;
  }

  let files = discover(ROOT);
  if (ONLY.length) files = files.filter((f) => ONLY.includes(f));
  if (!files.length) {
    console.error('No matching files found.');
    process.exitCode = 1;
    return;
  }

  const results = files.map((rel) => processFile(rel));
  const injected = [];
  const excluded = [];
  const already = [];
  const unclassified = [];

  for (const r of results) {
    if (r.status.startsWith('EXCLUDED')) excluded.push(r);
    else if (r.status.startsWith('UNCLASSIFIED')) unclassified.push(r);
    else if (r.status.startsWith('SKIPPED')) already.push(r);
    else if (r.status === 'INJECTED' || r.status === 'WOULD INJECT' || r.status === 'STRIPPED') {
      injected.push(r);
    }
  }

  const mode = STRIP ? 'STRIP' : DRY_RUN ? 'DRY RUN' : 'INJECT';
  console.log(`\n=== Meta Pixel injection report (${mode}) — pixel ${PIXEL_ID} ===\n`);

  if (VERBOSE) {
    for (const r of results) {
      console.log(`${r.rel}`);
      console.log(`  → ${r.status}`);
    }
    console.log('');
  }

  if (STRIP) {
    console.log(`Stripped: ${results.filter((r) => r.status === 'STRIPPED').length}, already clean: ${results.filter((r) => r.status === 'CLEAN').length}`);
    return;
  }

  console.log('--- Summary ---');
  console.log(`${DRY_RUN ? 'Would inject' : 'Injected'}:     ${injected.length}`);
  console.log(`Already injected (skipped):   ${already.length}`);
  console.log(`Excluded:                     ${excluded.length}`);
  console.log(`UNCLASSIFIED (manual review): ${unclassified.length}`);

  if (excluded.length) {
    console.log('\n--- Excluded ---');
    const reasons = {};
    for (const r of excluded) {
      (reasons[r.status] = reasons[r.status] || []).push(r.rel);
    }
    for (const [reason, list] of Object.entries(reasons)) {
      console.log(`${reason} (${list.length}):`);
      const show = VERBOSE ? list : list.slice(0, 10);
      for (const f of show) console.log(`  ${f}`);
      if (!VERBOSE && list.length > 10) console.log(`  … and ${list.length - 10} more (use --verbose)`);
    }
  }

  console.log('\n--- UNCLASSIFIED (no injection performed — review these manually) ---');
  if (!unclassified.length) console.log('none');
  for (const r of unclassified) console.log(`  ${r.rel}: ${r.status}`);
  console.log('');
}

if (require.main === module) main();

module.exports = {
  HEAD_START,
  HEAD_END,
  officialSnippet,
  headBlock,
  matchesAny,
  classifyPath,
  hasNoindex,
  is404Page,
  hasPixel,
  discover,
  processFile,
  main,
};
