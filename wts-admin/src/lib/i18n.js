const fs = require('fs');
const path = require('path');
const escapeHtml = require('escape-html');
const format = require('./format');

// ── Portal i18n ─────────────────────────────────────────────────
//
// Deliberately tiny: two locales, flat-ish JSON dictionaries, {var}
// interpolation and English fallback. If the portal ever needs plural
// rules or 5+ languages, swap these internals for i18next behind the
// same t() surface — nothing outside this file needs to change.

const SUPPORTED = ['en', 'th'];
const DEFAULT_LOCALE = SUPPORTED.includes(process.env.PORTAL_DEFAULT_LOCALE)
  ? process.env.PORTAL_DEFAULT_LOCALE
  : 'en';

const dictionaries = {};
for (const loc of SUPPORTED) {
  try {
    dictionaries[loc] = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'locales', `${loc}.json`), 'utf8')
    );
  } catch (e) {
    console.error(`[i18n] Failed to load locale "${loc}":`, e.message);
    dictionaries[loc] = {};
  }
}

const lookup = (dict, key) =>
  key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);

// A missing key can never surface to a customer: it falls back to the
// English string, and failing that renders the key itself — both logged
// once per key so the gap shows up in Railway logs, not in the UI.
const warnedMissing = new Set();
function warnOnce(locale, key) {
  const id = `${locale}:${key}`;
  if (warnedMissing.has(id)) return;
  warnedMissing.add(id);
  console.warn(`[i18n] Missing ${locale} translation for "${key}"`);
}

function translate(locale, key, vars) {
  let str = lookup(dictionaries[locale] || {}, key);
  if (str === undefined && locale !== 'en') {
    warnOnce(locale, key);
    str = lookup(dictionaries.en, key);
  }
  if (str === undefined) {
    warnOnce('en', key);
    return key;
  }
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      vars[name] !== undefined ? String(vars[name]) : m
    );
  }
  return str;
}

// Locale resolution, first match wins:
//   ?lang= → session → (customer preference, copied into the session at
//   login) → Accept-Language → default. An explicit ?lang= also persists:
//   to the session always, and to the customer record when signed in.
function middleware(db) {
  return (req, res, next) => {
    let locale = null;

    const q = typeof req.query.lang === 'string' ? req.query.lang.toLowerCase() : null;
    if (q && SUPPORTED.includes(q)) {
      locale = q;
      if (req.session) {
        req.session.locale = q;
        if (req.session.customerId) {
          db.query(
            'UPDATE customers SET preferred_language = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [q, req.session.customerId]
          ).catch((e) => console.warn('[i18n] Failed to persist language preference:', e.message));
        }
      }
    }

    if (!locale && req.session && SUPPORTED.includes(req.session.locale)) {
      locale = req.session.locale;
    }
    if (!locale && typeof req.acceptsLanguages === 'function') {
      locale = req.acceptsLanguages(...SUPPORTED) || null;
    }
    if (!locale) locale = DEFAULT_LOCALE;

    const t = (key, vars) => translate(locale, key, vars);
    req.locale = locale;
    req.t = t;
    res.locals.locale = locale;
    res.locals.t = t;
    res.locals.esc = escapeHtml;
    res.locals.fmtDate = (d) => format.formatDate(d, locale);
    res.locals.fmtMoney = (amount, currency) => format.formatMoney(amount, currency, locale);
    res.locals.fmtSize = (bytes) => format.formatFileSize(bytes, locale);
    next();
  };
}

// Whole flat subtree of the dictionary (e.g. 'boards.island'), with the
// English strings underneath as fallback for locale gaps — used to ship a
// strings object to client-side islands that render outside EJS.
function dictionary(locale, prefix) {
  const en = lookup(dictionaries.en, prefix);
  const loc = locale === 'en' ? null : lookup(dictionaries[locale] || {}, prefix);
  return { ...(en || {}), ...(loc || {}) };
}

module.exports = { SUPPORTED, DEFAULT_LOCALE, translate, middleware, dictionary };
