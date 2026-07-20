#!/usr/bin/env node
/**
 * Localized page generator: materializes /th /la /fr mirrors of /en pages.
 *
 * Sources of translated content, in priority order:
 *   --payloads <file.json>   offline payload map (used by tests / CI cache):
 *                            { "th": { "/": { "s_ab12…": "…" } }, … }
 *   --api <adminBase>        pulls published page translations from the
 *                            wts-admin public API
 *                            (GET /api/public/translations/:lang/page)
 *
 * A page is only written when it has a published translation payload —
 * until then the existing 302/404 fallbacks keep serving English at the
 * localized URL. --include-untranslated overrides this for chrome-only
 * mirrors (used for the /xx/articles/ SPA shells whose body is dynamic).
 *
 * What every generated page gets (see scripts/lib/html-l10n.js):
 *   - published segment translations applied (English stays where a
 *     segment has no translation yet — progressive)
 *   - chrome strings from src/locales/site/<lang>.json
 *   - all /en/ links rewritten to the target language
 *   - <html lang>, canonical, og:url, JSON-LD inLanguage
 *   - hreflang cluster limited to languages that really exist as files
 *   - Noto Sans Thai/Lao fonts + /css/i18n.css (th/la only)
 *
 * Usage:
 *   node scripts/generate-localized-pages.js --api https://<admin-host>
 *   node scripts/generate-localized-pages.js --payloads seed.json --langs th
 *   node scripts/generate-localized-pages.js --dry-run
 *   node scripts/generate-localized-pages.js --update-en-hreflang
 *
 * Flags:
 *   --langs th,la,fr        target languages (default: all three)
 *   --paths a,b             only pages whose path contains one of these
 *   --src <dir>             English tree (default ./en)
 *   --out <dir>             output root (default .; languages become
 *                           <out>/th, <out>/la, <out>/fr)
 *   --include-untranslated  also write pages with no translation payload
 *   --update-en-hreflang    rewrite hreflang clusters on the English
 *                           sources for pages that now have mirrors
 *   --dry-run               report without writing
 */
const fs = require('fs');
const path = require('path');
const l10n = require('./lib/html-l10n');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    langs: [...l10n.TARGET_DIRS],
    paths: [],
    src: path.join(ROOT, 'en'),
    out: ROOT,
    api: null,
    payloads: null,
    includeUntranslated: false,
    updateEnHreflang: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--langs') args.langs = argv[++i].split(',').map((s) => s.trim()).filter((l) => l10n.TARGET_DIRS.includes(l));
    else if (arg === '--paths') args.paths = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--src') args.src = path.resolve(argv[++i]);
    else if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--api') args.api = argv[++i].replace(/\/$/, '');
    else if (arg === '--payloads') args.payloads = path.resolve(argv[++i]);
    else if (arg === '--include-untranslated') args.includeUntranslated = true;
    else if (arg === '--update-en-hreflang') args.updateEnHreflang = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function walkHtml(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkHtml(full, base));
    else if (entry.name.endsWith('.html')) files.push(path.relative(base, full));
  }
  return files.sort();
}

// Static article exports are 'article' entities (dynamic shell / later
// static export), not 'page' entities — everything else localizes as a page.
function isPageFile(relFile) {
  const normalized = relFile.replace(/\\/g, '/');
  if (normalized.startsWith('articles/')) return normalized === 'articles/index.html';
  return true;
}

// True when the file exists AND is real localized content — not one of
// the legacy meta-refresh redirect stubs ("Moved permanently" pages that
// bounce to /en/). Stubs keep serving visitors, but only real mirrors
// may join an hreflang cluster.
function isRealMirror(file) {
  try {
    const head = fs.readFileSync(file, 'utf8').slice(0, 2048);
    return !/http-equiv=["']refresh["']/i.test(head);
  } catch {
    return false; // missing/unreadable — not a mirror
  }
}

function loadSiteLocales() {
  const dir = path.join(ROOT, 'src', 'locales', 'site');
  const locales = {};
  for (const lang of ['en', ...l10n.TARGET_DIRS]) {
    locales[lang] = JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'));
  }
  return locales;
}

async function loadPayloads(args) {
  const payloads = Object.fromEntries(args.langs.map((l) => [l, {}]));
  if (args.payloads) {
    const raw = JSON.parse(fs.readFileSync(args.payloads, 'utf8'));
    for (const lang of args.langs) Object.assign(payloads[lang], raw[lang] || {});
    return payloads;
  }
  if (args.api) {
    for (const lang of args.langs) {
      const url = `${args.api}/api/public/translations/${lang}/page`;
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`${url} responded ${response.status}`);
      const body = await response.json();
      for (const row of body.translations || []) {
        if (row.path && row.content_payload) payloads[lang][row.path] = row.content_payload;
      }
      console.log(`[api] ${lang}: ${Object.keys(payloads[lang]).length} published page translations`);
    }
  }
  return payloads;
}

const DIR_BY_HREFLANG = { en: 'en', th: 'th', lo: 'la', fr: 'fr' };

async function main() {
  const args = parseArgs(process.argv);
  const locales = loadSiteLocales();
  const payloads = await loadPayloads(args);

  const pages = walkHtml(args.src)
    .filter(isPageFile)
    .filter((rel) => args.paths.length === 0 || args.paths.some((p) => rel.includes(p) || l10n.filePathToSitePath(rel).includes(p)));

  // Pass 1 — decide the write set so hreflang clusters only list
  // languages that will really exist as files.
  const plan = new Map(); // relFile -> Set<lang> being written
  for (const rel of pages) {
    const sitePath = l10n.filePathToSitePath(rel);
    for (const lang of args.langs) {
      const hasPayload = Boolean(payloads[lang][sitePath]);
      if (hasPayload || args.includeUntranslated) {
        if (!plan.has(rel)) plan.set(rel, new Set());
        plan.get(rel).add(lang);
      }
    }
  }

  const summary = { written: 0, skipped: 0, enUpdated: 0 };

  for (const rel of pages) {
    const sitePath = l10n.filePathToSitePath(rel);
    const englishHtml = fs.readFileSync(path.join(args.src, rel), 'utf8');

    // Languages present after this run: being written now, or already on
    // disk as a REAL mirror. Legacy redirect stubs (meta-refresh "moved"
    // pages that bounce to /en/) still serve visitors but are not
    // alternates: advertising one in an hreflang cluster points search
    // engines at a noindex redirect and breaks cluster reciprocity — the
    // exact failure mode the check-hreflang audit exists to block.
    const presentDirs = new Set(['en']);
    for (const lang of l10n.TARGET_DIRS) {
      if ((plan.get(rel) || new Set()).has(lang)) presentDirs.add(lang);
      else if (isRealMirror(path.join(args.out, lang, rel))) presentDirs.add(lang);
    }
    const alternates = l10n.buildAlternates(sitePath)
      .filter((a) => a.hreflang === 'x-default' || presentDirs.has(DIR_BY_HREFLANG[a.hreflang]));

    for (const lang of args.langs) {
      if (!(plan.get(rel) || new Set()).has(lang)) {
        summary.skipped += 1;
        continue;
      }
      const result = l10n.localizePage(englishHtml, {
        lang,
        relFile: rel,
        segmentsPayload: payloads[lang][sitePath] || null,
        chromePairs: l10n.buildChromeDict(locales.en, locales[lang]),
        alternates,
      });
      const outFile = path.join(args.out, lang, rel);
      if (args.dryRun) {
        console.log(`[dry-run] ${lang}/${rel} (${result.segmentsApplied} segments, ${result.chromeReplaced} chrome)`);
      } else {
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, result.html, 'utf8');
        console.log(`[write] ${lang}/${rel} (${result.segmentsApplied} segments, ${result.chromeReplaced} chrome)`);
      }
      summary.written += 1;
    }

    // Keep the English source's hreflang cluster reciprocal once real
    // mirrors exist (Google ignores non-reciprocal alternates).
    if (args.updateEnHreflang && presentDirs.size > 1) {
      const updated = l10n.setAlternates(englishHtml, alternates);
      if (updated !== englishHtml) {
        if (!args.dryRun) fs.writeFileSync(path.join(args.src, rel), updated, 'utf8');
        summary.enUpdated += 1;
      }
    }
  }

  console.log(`\nDone: ${summary.written} written, ${summary.skipped} skipped (no published translation), ${summary.enUpdated} English pages re-clustered${args.dryRun ? ' [dry-run]' : ''}`);
}

main().catch((error) => {
  console.error('generate-localized-pages failed:', error.message);
  process.exit(1);
});
