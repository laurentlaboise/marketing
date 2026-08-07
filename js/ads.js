/**
 * WordsThatSells — AdSense unit initialiser.
 *
 * Injected once per monetized page by scripts/inject-adsense.js.
 * Responsibilities:
 *   - Hide any unit whose data-ad-slot is still a REPLACE_ME_* placeholder
 *     (slots not yet created in the AdSense dashboard) so no broken grey
 *     boxes render in production.
 *   - Initialise above-the-fold units (data-wts-lazy="0") immediately.
 *   - Lazy-initialise below-the-fold units (data-wts-lazy="1") via
 *     IntersectionObserver when they come within 200px of the viewport —
 *     ads that are never scrolled to are never requested.
 *
 * No document.write, no inline script, CSP-safe. The adsbygoogle loader is
 * loaded async from <head>; pushes below just queue until it arrives.
 */
(function () {
  'use strict';

  function initUnit(container) {
    if (container.getAttribute('data-wts-init') === '1') return;
    container.setAttribute('data-wts-init', '1');
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      /* an ad-blocker removing the loader must never break the page */
    }
  }

  function init() {
    var containers = document.querySelectorAll('.ad-container');
    if (!containers.length) return;

    var lazy = [];
    for (var i = 0; i < containers.length; i++) {
      var c = containers[i];
      var ins = c.querySelector('ins.adsbygoogle');
      var slot = ins ? ins.getAttribute('data-ad-slot') || '' : '';
      if (!ins || slot.indexOf('REPLACE_ME') === 0) {
        c.style.display = 'none'; // unit not configured yet — render nothing
        continue;
      }
      if (c.getAttribute('data-wts-lazy') === '1') {
        lazy.push(c);
      } else {
        initUnit(c);
      }
    }

    if (!lazy.length) return;

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].isIntersecting) {
            io.unobserve(entries[j].target);
            initUnit(entries[j].target);
          }
        }
      }, { rootMargin: '200px 0px' });
      for (var k = 0; k < lazy.length; k++) io.observe(lazy[k]);
    } else {
      for (var m = 0; m < lazy.length; m++) initUnit(lazy[m]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
