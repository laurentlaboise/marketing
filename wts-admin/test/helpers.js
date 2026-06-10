// Shared test harness: boots the real server as a child process against a
// test database and provides a minimal cookie-jar fetch client.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const { Client, Pool } = require('pg');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..');

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/wts_admin_test';

const TEST_ENV = {
  SESSION_SECRET: 'test-session-secret',
  TELEMETRY_WEBHOOK_SECRET: 'test-telemetry-secret',
  STRIPE_SECRET_KEY: 'sk_test_dummy_key_for_signature_tests',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
  AUTH_RATE_LIMIT_MAX: '1000', // the 10/15min production limit would trip mid-suite
};

// Create the test database if it does not exist yet (CI usually provides it).
async function ensureDatabase() {
  const url = new URL(TEST_DB_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DB_URL);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  } catch (err) {
    if (err.code !== '42P04') throw err; // 42P04 = duplicate_database
  } finally {
    await client.end();
  }
}

// Seed an admin and a regular user; create the telemetry table the
// webhook writes to (it has no schema in db.js).
async function seedDatabase() {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const hash = await bcrypt.hash('Password123!', 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('admin@test.local', $1, 'Admin', 'Test', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'admin'`,
    [hash]
  );
  await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role)
     VALUES ('user@test.local', $1, 'Normal', 'Test', 'user')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'user'`,
    [hash]
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS execution_telemetry (
      automation_id TEXT,
      execution_status TEXT,
      error_log TEXT,
      anomaly_score NUMERIC,
      latency_ms INTEGER,
      executed_at TIMESTAMP
    )
  `);
  await pool.end();
}

// Spawn server.js on the given port and wait until /health responds.
async function startServer(port, envOverrides = {}) {
  await ensureDatabase();

  const env = {
    ...process.env,
    ...TEST_ENV,
    DATABASE_URL: TEST_DB_URL,
    PORT: String(port),
    NODE_ENV: 'test',
    IMAGES_DIR: path.join(os.tmpdir(), `wts-test-images-${port}`),
    UPLOAD_TEMP_DIR: path.join(os.tmpdir(), `wts-test-uploads-${port}`),
    ...envOverrides,
  };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined || v === null) delete env[k];
  }

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited with code ${child.exitCode} before becoming healthy:\n${output}`);
    }
    try {
      const res = await fetch(`${base}/health`);
      if (res.status === 200) {
        if (child.exitCode !== null) {
          // A stale process from an earlier run is answering on this port.
          throw new Error(`port ${port} is served by a leftover process; our child exited (code ${child.exitCode}):\n${output}`);
        }
        await seedDatabase();
        return {
          base,
          child,
          getOutput: () => output,
          stop: () => new Promise((resolve) => {
            child.once('exit', resolve);
            child.kill('SIGKILL');
          }),
        };
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill('SIGKILL');
  throw new Error(`server did not become healthy in time:\n${output}`);
}

// Spawn server.js and wait for it to EXIT (for fail-fast boot tests).
function runServerExpectingExit(envOverrides = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...TEST_ENV, DATABASE_URL: TEST_DB_URL, PORT: '0', ...envOverrides };
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined || v === null) delete env[k];
    }
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 10000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

// Minimal cookie-jar fetch client (follows nothing; stores Set-Cookie).
class Session {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  storeCookies(res) {
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async fetch(pathname, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await fetch(this.base + pathname, { ...opts, headers, redirect: 'manual' });
    this.storeCookies(res);
    return res;
  }

  // Extract the CSRF token from a rendered page (form input or meta tag).
  async getCsrfToken(pathname = '/auth/login') {
    const res = await this.fetch(pathname);
    const html = await res.text();
    const match = html.match(/name="_csrf" value="([a-f0-9]+)"/) ||
      html.match(/name="csrf-token" content="([a-f0-9]+)"/);
    if (!match) throw new Error(`no CSRF token found on ${pathname} (status ${res.status})`);
    return match[1];
  }

  async login(email, password = 'Password123!') {
    const token = await this.getCsrfToken('/auth/login');
    const res = await this.fetch('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, password, _csrf: token }).toString(),
    });
    if (res.status !== 302 || !(res.headers.get('location') || '').includes('/dashboard')) {
      throw new Error(`login as ${email} failed: ${res.status} -> ${res.headers.get('location')}`);
    }
    return res;
  }
}

module.exports = { startServer, runServerExpectingExit, Session, TEST_DB_URL, TEST_ENV };
