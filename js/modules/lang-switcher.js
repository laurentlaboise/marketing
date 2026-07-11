// Footer language selector (EN / ไทย / ລາວ / FR) — runtime upgrade.
//
// The selector MARKUP is baked into every page's footer at build time by
// scripts/inject-footers.js, so it exists and works with JavaScript
// disabled. There is deliberately no floating pill, no banner and no
// overlay: the footer is the single language-switching surface.
//
// This module only progressively enhances the static markup:
//  - recomputes each link from the CURRENT address so a switch always
//    REPLACES the locale segment at the root of the path, never appends:
//    /en/company/about-us/ → /la/company/about-us/, and an already-broken
//    nested path like /en/la/pricing self-heals to /la/pricing. This also
//    covers SPA-style article URLs (/en/articles/slug) where the address
//    bar differs from the shell file the page was served from.
//  - keeps aria-current on the active language in sync with the address.
//  - stores the long-lived `wts_lang` cookie on click so the root router
//    (/index.html) honours the explicit choice on the next visit.

export const LANGUAGES = [
  { dir: 'en', hreflang: 'en', label: 'EN', name: 'English' },
  { dir: 'th', hreflang: 'th', label: 'ไทย', name: 'ไทย (Thai)' },
  { dir: 'la', hreflang: 'lo', label: 'ລາວ', name: 'ລາວ (Lao)' },
  { dir: 'fr', hreflang: 'fr', label: 'FR', name: 'Français' },
];

const LOCALE_RE = /^\/(en|th|la|fr)(\/.*)?$/;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Split a pathname into { lang, rest }, treating EVERY leading locale
// segment as routing state rather than content: '/en/la/pricing.html'
// yields lang 'la' (the language most recently asked for) and rest
// '/pricing.html'. A path with no locale prefix yields lang null.
export function splitLocalePath(pathname) {
  let rest = String(pathname || '/');
  if (rest[0] !== '/') rest = '/' + rest;
  let lang = null;
  for (;;) {
    const m = rest.match(LOCALE_RE);
    if (!m) break;
    lang = m[1];
    rest = m[2] || '/';
  }
  return { lang, rest };
}

// Absolute path of the same page in another language: the locale replaces
// at the root of the path — by construction it can never nest.
export function switchPath(pathname, dir) {
  return '/' + dir + splitLocalePath(pathname).rest;
}

function setLangCookie(dir) {
  document.cookie = `wts_lang=${dir};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}

export function initLangSwitcher() {
  const { lang, rest } = splitLocalePath(window.location.pathname);
  if (!lang) return; // root/utility pages carry no locale context

  document.querySelectorAll('nav.lang-switcher').forEach((nav) => {
    nav.dataset.current = lang;
    nav.querySelectorAll('a[data-lang-dir]').forEach((link) => {
      const dir = link.getAttribute('data-lang-dir');
      if (!LANGUAGES.some((l) => l.dir === dir)) return;
      link.setAttribute('href', '/' + dir + rest);
      if (dir === lang) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
      link.addEventListener('click', () => setLangCookie(dir));
    });
  });
}
