// Locale-aware display formatting for the customer portal.
//
// Thai dates use the Gregorian year with Thai month names
// (th-TH-u-ca-gregory): the portal's amounts and dates cross-reference
// invoices and international payment systems, which are all Gregorian —
// native th-TH would show the Buddhist era (2569, not 2026).

const DATE_LOCALES = { en: 'en-GB', th: 'th-TH-u-ca-gregory' };
const NUMBER_LOCALES = { en: 'en-GB', th: 'th-TH' };

// Currencies without minor units (satang-style decimals never shown).
const ZERO_DECIMAL = new Set(['LAK', 'JPY', 'VND', 'KRW']);

function formatDate(value, locale) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(DATE_LOCALES[locale] || DATE_LOCALES.en, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Keeps the portal's existing "1,234.56 USD" shape (amount then code)
// rather than Intl currency style, so English rendering is unchanged.
function formatMoney(amount, currency, locale) {
  const n = Number(amount);
  if (!isFinite(n)) return '';
  const code = String(currency || 'USD').toUpperCase();
  const decimals = ZERO_DECIMAL.has(code) ? 0 : 2;
  const formatted = n.toLocaleString(NUMBER_LOCALES[locale] || NUMBER_LOCALES.en, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return `${formatted} ${code}`;
}

// B/KB/MB units stay Latin in every locale — standard practice in Thai UIs.
function formatFileSize(bytes, locale) {
  if (bytes == null) return '';
  const b = Number(bytes);
  if (!isFinite(b)) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

module.exports = { formatDate, formatMoney, formatFileSize };
