// Language switcher (EN / ไทย / ລາວ / FR), rendered on every page that
// lives under a language prefix. Injected from js/main.js so no page
// markup needs editing: a floating pill near the top of the viewport
// (header role) plus an inline row inside the footer.
//
// Behaviour:
//  - links preserve the rest of the path (/en/company/about-us/ ↔
//    /th/company/about-us/) — pages that don't exist yet in the target
//    language are served English by the 302 / 404 fallbacks until the
//    generator materializes them
//  - clicking a language stores a long-lived `wts_lang` cookie that the
//    root redirect (index.html) honours on the next visit
//  - keyboard accessible: plain links inside a labelled <nav>,
//    aria-current="true" on the active language

const LANGUAGES = [
  { dir: 'en', hreflang: 'en', label: 'EN', name: 'English' },
  { dir: 'th', hreflang: 'th', label: 'ไทย', name: 'Thai' },
  { dir: 'la', hreflang: 'lo', label: 'ລາວ', name: 'Lao' },
  { dir: 'fr', hreflang: 'fr', label: 'FR', name: 'French' },
];

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const STYLES = `
.lang-switcher{display:inline-flex;gap:2px;align-items:center;background:rgba(18,42,63,.85);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px}
.lang-switcher a{display:inline-block;padding:4px 10px;border-radius:999px;font-size:.8rem;line-height:1.6;color:#fff;text-decoration:none;letter-spacing:0;text-transform:none}
.lang-switcher a:hover{background:rgba(255,255,255,.18)}
.lang-switcher a[aria-current="true"]{background:#d62b83;font-weight:600}
.lang-switcher a:focus-visible{outline:2px solid #fff;outline-offset:1px}
.lang-switcher--floating{position:fixed;top:12px;right:12px;z-index:1200;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.lang-switcher--footer{background:transparent;border-color:rgba(255,255,255,.2);margin-top:.75rem}
@media print{.lang-switcher--floating{display:none}}
`;

function currentLanguageContext() {
  const match = window.location.pathname.match(/^\/(en|th|la|fr)(\/.*)?$/);
  if (!match) return null;
  return { lang: match[1], rest: match[2] || '/' };
}

function setLangCookie(dir) {
  document.cookie = `wts_lang=${dir};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}

function buildSwitcher({ lang, rest }, variant) {
  const nav = document.createElement('nav');
  nav.className = `lang-switcher lang-switcher--${variant}`;
  nav.setAttribute('aria-label', 'Language');
  nav.dataset.current = lang;

  for (const language of LANGUAGES) {
    const link = document.createElement('a');
    link.href = `/${language.dir}${rest}`;
    link.hreflang = language.hreflang;
    link.lang = language.hreflang;
    link.textContent = language.label;
    link.title = language.name;
    if (language.dir === lang) link.setAttribute('aria-current', 'true');
    link.addEventListener('click', () => setLangCookie(language.dir));
    nav.appendChild(link);
  }
  return nav;
}

// "View this page in your language?" — shown once per visitor when the
// browser language doesn't match the page language (e.g. a Thai visitor
// landing on /en from a search result). A suggestion, never a forced
// redirect: SEO-safe and dismissible for 30 days.
const BANNER_STRINGS = {
  th: { text: 'ดูเว็บไซต์นี้เป็นภาษาไทยไหม?', cta: 'ดูภาษาไทย' },
  la: { text: 'ເບິ່ງເວັບໄຊນີ້ເປັນພາສາລາວບໍ?', cta: 'ເບິ່ງພາສາລາວ' },
  fr: { text: 'Voir ce site en français ?', cta: 'Voir en français' },
  en: { text: 'View this site in English?', cta: 'View in English' },
};

function browserPreferredDir() {
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || '').toLowerCase();
  if (nav.indexOf('th') === 0) return 'th';
  if (nav.indexOf('lo') === 0) return 'la';
  if (nav.indexOf('fr') === 0) return 'fr';
  if (nav.indexOf('en') === 0) return 'en';
  return null;
}

function maybeShowLanguageBanner(context) {
  const preferred = browserPreferredDir();
  if (!preferred || preferred === context.lang) return;
  if (/(?:^|;\s*)wts_lang_banner=off/.test(document.cookie)) return;
  const saved = document.cookie.match(/(?:^|;\s*)wts_lang=(en|th|la|fr)/);
  if (saved && saved[1] === context.lang) return; // explicit choice wins

  const strings = BANNER_STRINGS[preferred];
  const banner = document.createElement('div');
  banner.className = 'lang-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Language suggestion');

  const text = document.createElement('span');
  text.textContent = strings.text;
  banner.appendChild(text);

  const go = document.createElement('a');
  go.href = `/${preferred}${context.rest}`;
  go.textContent = strings.cta;
  go.addEventListener('click', () => setLangCookie(preferred));
  banner.appendChild(go);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss');
  close.addEventListener('click', () => {
    document.cookie = `wts_lang_banner=off;path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`;
    banner.remove();
  });
  banner.appendChild(close);

  document.body.appendChild(banner);
}

const BANNER_STYLES = `
.lang-banner{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:1300;display:flex;gap:12px;align-items:center;background:#122a3f;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:10px 14px;font-size:.9rem;line-height:1.7;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:92vw}
.lang-banner a{color:#fff;background:#d62b83;border-radius:999px;padding:4px 14px;text-decoration:none;white-space:nowrap}
.lang-banner button{background:none;border:none;color:#fff;font-size:1.1rem;cursor:pointer;padding:0 2px}
`;

export function initLangSwitcher() {
  const context = currentLanguageContext();
  if (!context) return; // root, admin previews, non-language pages

  const style = document.createElement('style');
  style.textContent = STYLES + BANNER_STYLES;
  document.head.appendChild(style);

  // Header role: floating pill (the homepage has no navbar, so a fixed
  // pill is the one placement that exists on every page).
  document.body.appendChild(buildSwitcher(context, 'floating'));

  // Footer copy, inside the bottom bar when present.
  const footerBottom = document.querySelector('.footer-bottom') || document.querySelector('footer');
  if (footerBottom) footerBottom.appendChild(buildSwitcher(context, 'footer'));

  maybeShowLanguageBanner(context);
}
