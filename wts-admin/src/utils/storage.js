const path = require('path');
const fs = require('fs');

// Storage layout for the image library.
//
// The durable, canonical store for images is the GitHub repo (pushed via
// the GitHub API) fronted by the jsDelivr CDN — image rows keep a
// repo-relative file_path ('images/<category>/<file>') that doubles as
// the GitHub path and the public site URL. The local directories below
// are a working copy: writes land here before being pushed, and reads
// re-hydrate from the CDN when the file is missing locally (e.g. after a
// redeploy on Railway's ephemeral filesystem).
//
// Both roots are env-configurable so deployments don't depend on the
// monorepo sibling layout: point IMAGES_DIR (and optionally
// UPLOAD_TEMP_DIR) at a mounted Railway volume for a persistent working
// copy, or leave them unset to use the in-repo defaults.
const IMAGES_DIR = process.env.IMAGES_DIR
  ? path.resolve(process.env.IMAGES_DIR)
  : path.resolve(__dirname, '../../../images');

const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR
  ? path.resolve(process.env.UPLOAD_TEMP_DIR)
  : path.resolve(__dirname, '../../uploads/temp');

// CDN configuration (jsDelivr in front of the GitHub repo)
const CDN_CONFIG = {
  baseUrl: 'https://cdn.jsdelivr.net/gh',
  user: 'laurentlaboise',
  repo: 'marketing',
  branch: 'main',
};

function buildCdnUrl(filePath) {
  const clean = String(filePath).replace(/^\/+/, '');
  // Encode each path segment to handle spaces and special chars in filenames
  const encoded = clean.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `${CDN_CONFIG.baseUrl}/${CDN_CONFIG.user}/${CDN_CONFIG.repo}@${CDN_CONFIG.branch}/${encoded}`;
}

// Validate a resolved path stays within an allowed parent directory (prevents path traversal)
function assertPathWithin(filePath, parentDir) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(parentDir + path.sep) && resolved !== parentDir) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

// Map a repo-relative file_path ('images/foo/bar.webp') to its absolute
// location under IMAGES_DIR, refusing anything that escapes it.
function localPathFor(repoRelPath) {
  const clean = String(repoRelPath || '').replace(/^\/+/, '');
  const withoutPrefix = clean === 'images'
    ? ''
    : clean.startsWith('images/') ? clean.slice('images/'.length) : clean;
  return assertPathWithin(path.resolve(IMAGES_DIR, withoutPrefix), IMAGES_DIR);
}

// Is this path a multer temp upload we own?
function isTempUpload(filePath) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(UPLOAD_TEMP_DIR + path.sep);
}

// Safely remove a temp upload file after validating its path
function cleanupTempFile(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (isTempUpload(resolved) && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
}

function ensureDirs() {
  for (const dir of [IMAGES_DIR, UPLOAD_TEMP_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  IMAGES_DIR,
  UPLOAD_TEMP_DIR,
  CDN_CONFIG,
  buildCdnUrl,
  assertPathWithin,
  localPathFor,
  isTempUpload,
  cleanupTempFile,
  ensureDirs,
};
