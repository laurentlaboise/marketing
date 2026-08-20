#!/usr/bin/env node
/**
 * GA4 (gtag.js) injection for AI-tool slug pages and glossary TERM pages.
 *
 * The marketing layout and article baker already emit G-LMRKC1VBBB. Tool and
 * glossary generators historically omitted that block. This script backfills
 * existing HTML and is safe to re-run after every publish (`npm run inject:ga`).
 *
 * Idempotent, marker-based, string-anchored — never re-serializes the DOM.
 * Does not invent a GTM container. Does not add Google Ads AW- tags.
 *
 * Usage:
 *   node scripts/inject-ga.js --dry-run          # classify + report, write nothing
 *   node scripts/inject-ga.js                    # inject for real
 *   node scripts/inject-ga.js --only <rel-path>  # limit to specific file(s)
 *   node scripts/inject-ga.js --strip            # remove injected GA markup
 *   node scripts/inject-ga.js --verbose
 *   node scripts/inject-ga.js --base <dir>       # treat <dir> as the site root (tests)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

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

const CONFIG = require(path.join(DEFAULT_ROOT, 'config', 'ga.config.js'));
const {
  MEASUREMENT_ID,
  GA_ENABLED,
  INCLUDE_PATTERNS,
  EXCLUDE_PATTERNS,
  WALK_ROOTS,
} = CONFIG;

const HEAD_START = '<!-- wts-ga:head:start -->';
const HEAD_END = '<!-- wts-ga:head:end -->';
const SNIPPET_PATH = path.join(DEFAULT_ROOT, 'partials', 'gtag.html');

function officialSnippet(measurementId) {
  const raw = fs.readFileSync(SNIPPET_PATH, 'utf8').trim();
  if (measurementId === 'G-LMRKC1VBBB') return raw;
  return raw.replace(/G-LMRKC1VBBB/g, measurementId);
}

function headBlock(measurementId) {
  return [HEAD_START, officialSnippet(measurementId), HEAD_END].join('\n');
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

function hasGa(html) {
  if (html.includes(HEAD_START)) return true;
  if (/googletagmanager\.com\/gtag\/js\?id=G-/i.test(html)) return true;
  if (/gtag\(\s*['"]config['"]\s*,\s*['"]G-/i.test(html)) return true;
  if (html.includes(MEASUREMENT_ID)) return true;
  return false;
}

function classifyPath(rel) {
  if (isBackupName(rel)) return 'EXCLUDED: backup/dynamic file';
  if (matchesAny(rel, EXCLUDE_PATTERNS)) return 'EXCLUDED: path rule';
  if (!matchesAny(rel, INCLUDE_PATTERNS)) return 'EXCLUDED: not in include list';
  return null;
}

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
  for (const relRoot of WALK_ROOTS) {
    files.push(...walkHtml(path.join(base, relRoot), base));
  }
  return [...new Set(files)].sort();
}

function processFile(rel, opts) {
  const root = (opts && opts.root) || ROOT;
  const measurementId = (opts && opts.measurementId) || MEASUREMENT_ID;
  const dryRun = opts && opts.dryRun !== undefined ? opts.dryRun : DRY_RUN;
  const strip = opts && opts.strip !== undefined ? opts.strip : STRIP;
  const abs = path.join(root, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const result = { rel, status: '' };

  if (strip) {
    const stripped = html.replace(
      /[ \t]*<!-- wts-ga:head:start -->[\s\S]*?<!-- wts-ga:head:end -->\n?/g,
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
  if (hasGa(html)) {
    result.status = 'SKIPPED: already injected (idempotent)';
    return result;
  }

  const headClose = html.search(/<\/head>/i);
  if (headClose < 0) {
    result.status = 'UNCLASSIFIED: no </head> found — nothing injected';
    return result;
  }

  const out = html.slice(0, headClose) + headBlock(measurementId) + '\n' + html.slice(headClose);
  if (!dryRun) fs.writeFileSync(abs, out);
  result.status = dryRun ? 'WOULD INJECT' : 'INJECTED';
  return result;
}

function main() {
  if (!GA_ENABLED && !STRIP) {
    console.log('GA_ENABLED is false in config/ga.config.js — nothing to do.');
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
  console.log(`\n=== GA4 injection report (${mode}) — ${MEASUREMENT_ID} ===\n`);

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

  if (excluded.length && VERBOSE) {
    console.log('\n--- Excluded ---');
    const reasons = {};
    for (const r of excluded) {
      (reasons[r.status] = reasons[r.status] || []).push(r.rel);
    }
    for (const [reason, list] of Object.entries(reasons)) {
      console.log(`${reason} (${list.length}):`);
      for (const f of list.slice(0, 10)) console.log(`  ${f}`);
      if (list.length > 10) console.log(`  … and ${list.length - 10} more`);
    }
  }

  console.log('\n--- UNCLASSIFIED ---');
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
  hasGa,
  discover,
  processFile,
  main,
};
