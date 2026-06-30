/**
 * Minimal GitHub Contents API helper for committing text files (e.g. the
 * build-time footers.json) to the marketing repo. Mirrors the proven push
 * mechanism in routes/images.js (same repo config + GITHUB_TOKEN), kept here as
 * a small, dependency-free module the footer "Publish" action can reuse.
 */
const https = require('https');
const { CDN_CONFIG } = require('../utils/storage');

function request(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', (err) => resolve({ networkError: err.message }));
    if (body) req.write(body);
    req.end();
  });
}

function authHeaders(token, extra) {
  return Object.assign({
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'WTS-Admin-FooterPublish',
    'Accept': 'application/vnd.github.v3+json',
  }, extra || {});
}

// Fetch a file's current content + sha. Returns { sha, content } (content is the
// decoded UTF-8 string), or null if the file does not exist / on error.
async function getFile(repoPath) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const res = await request({
    hostname: 'api.github.com',
    path: `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}/contents/${repoPath}?ref=${CDN_CONFIG.branch}`,
    method: 'GET',
    headers: authHeaders(token),
  });
  if (res.statusCode !== 200) return null;
  try {
    const json = JSON.parse(res.data);
    const content = Buffer.from(json.content || '', 'base64').toString('utf8');
    return { sha: json.sha, content };
  } catch (e) {
    return null;
  }
}

// Create or update a text file. Pass sha to update an existing file.
// Returns { ok, reason, statusCode }.
async function putFile(repoPath, contentString, message, sha) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, reason: 'no_token' };

  const payload = {
    message,
    content: Buffer.from(contentString, 'utf8').toString('base64'),
    branch: CDN_CONFIG.branch,
  };
  if (sha) payload.sha = sha;
  const body = JSON.stringify(payload);

  const res = await request({
    hostname: 'api.github.com',
    path: `/repos/${CDN_CONFIG.user}/${CDN_CONFIG.repo}/contents/${repoPath}`,
    method: 'PUT',
    headers: authHeaders(token, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }),
  }, body);

  if (res.networkError) return { ok: false, reason: 'network', detail: res.networkError };
  if (res.statusCode === 200 || res.statusCode === 201) return { ok: true, statusCode: res.statusCode };
  if (res.statusCode === 401 || res.statusCode === 403) return { ok: false, reason: 'auth', statusCode: res.statusCode };
  if (res.statusCode === 409) return { ok: false, reason: 'conflict', statusCode: res.statusCode };
  return { ok: false, reason: 'http_' + res.statusCode, statusCode: res.statusCode };
}

module.exports = { getFile, putFile };
