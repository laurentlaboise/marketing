#!/usr/bin/env node
// Builds the whiteboard React island:
//   node whiteboard-ui/build.js
// Output: wts-admin/public/whiteboard/board.js + board.css (minified IIFE).
// Dependencies (esbuild, react, react-dom, tldraw, @tldraw/sync) resolve from
// wts-admin/node_modules.
const path = require('path');
const zlib = require('zlib');
const fs = require('fs');
const esbuild = require('esbuild');

const outdir = path.join(__dirname, '..', 'public', 'whiteboard');

async function main() {
  const result = await esbuild.build({
    entryPoints: [{ in: path.join(__dirname, 'src', 'main.jsx'), out: 'board' }],
    outdir,
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    // Inline any assets referenced from tldraw's CSS so the page stays
    // self-contained under CSP (no extra hosts).
    loader: {
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      '.ttf': 'dataurl',
      '.otf': 'dataurl',
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.gif': 'dataurl',
    },
    logLevel: 'info',
    metafile: true,
  });

  // Copy tldraw's static assets (icon sprite, fonts, translations, embed
  // icons) next to the bundle so everything is served same-origin — see the
  // getAssetUrls({ baseUrl: '/whiteboard/assets/' }) call in src/main.jsx.
  const assetsSrc = path.dirname(
    require.resolve('@tldraw/assets/package.json', { paths: [__dirname] })
  );
  const assetsDest = path.join(outdir, 'assets');
  for (const dir of ['icons', 'fonts', 'translations', 'embed-icons']) {
    fs.cpSync(path.join(assetsSrc, dir), path.join(assetsDest, dir), { recursive: true });
  }
  console.log(`assets: copied icons/fonts/translations/embed-icons to ${assetsDest}`);

  for (const name of ['board.js', 'board.css']) {
    const file = path.join(outdir, name);
    if (!fs.existsSync(file)) {
      throw new Error(`Expected build output missing: ${file}`);
    }
    const raw = fs.readFileSync(file);
    const gz = zlib.gzipSync(raw, { level: 9 });
    console.log(
      `${name}: ${(raw.length / 1024).toFixed(1)} KB (${(gz.length / 1024).toFixed(1)} KB gzipped)`
    );
  }
  return result;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
