/**
 * Google AdSense Auto-Injection for Article Pages
 *
 * Reads config from window.WTS_ADSENSE (set in adsense-config.js).
 * Dynamically loads the AdSense library and injects ad units at
 * three revenue-optimized positions on article pages.
 */
(function () {
  'use strict';

  var config = window.WTS_ADSENSE;
  if (!config || !config.enabled) return;

  var publisherId = config.publisherId;
  var slots = config.slots || {};

  // Only run on article pages
  var articleBody = document.querySelector('[itemprop="articleBody"]') ||
                    document.querySelector('.article-content [itemprop="articleBody"]');
  if (!articleBody) return;

  // Inject ad container styles
  var style = document.createElement('style');
  style.textContent =
    '.wts-ad-container{margin:30px auto;text-align:center;overflow:hidden;clear:both}' +
    '.wts-ad-container::before{content:"Advertisement";display:block;font-size:11px;' +
    'color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}' +
    '.wts-ad-container ins{display:block}';
  document.head.appendChild(style);

  // Load AdSense library
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + publisherId;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);

  // Build an ad unit element
  function createAdUnit(slotId) {
    var container = document.createElement('div');
    container.className = 'wts-ad-container';

    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', publisherId);
    ins.setAttribute('data-ad-slot', slotId);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    container.appendChild(ins);

    return container;
  }

  // Push ad after element is in the DOM
  function pushAd() {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { /* AdSense not loaded yet — ignore */ }
  }

  // Position 1: Below title / above article body
  if (slots.belowTitle) {
    var header = document.querySelector('.article-header');
    if (header && header.nextSibling) {
      var featuredImage = document.querySelector('.featured-image-wrapper');
      var insertAfter = featuredImage || header;
      insertAfter.parentNode.insertBefore(createAdUnit(slots.belowTitle), insertAfter.nextSibling);
    }
  }

  // Position 2: Mid-article (~40% through paragraphs)
  if (slots.midArticle) {
    var paragraphs = articleBody.querySelectorAll(':scope > p, :scope > section > p');
    if (paragraphs.length > 4) {
      var midIndex = Math.floor(paragraphs.length * 0.4);
      var midParagraph = paragraphs[midIndex];
      midParagraph.parentNode.insertBefore(createAdUnit(slots.midArticle), midParagraph.nextSibling);
    }
  }

  // Position 3: End of article (before share buttons or at end of articleBody)
  if (slots.endArticle) {
    var shareButtons = document.querySelector('.share-buttons');
    if (shareButtons) {
      shareButtons.parentNode.insertBefore(createAdUnit(slots.endArticle), shareButtons);
    } else {
      articleBody.appendChild(createAdUnit(slots.endArticle));
    }
  }

  // Activate all injected ad units once AdSense script loads
  script.addEventListener('load', function () {
    var adCount = document.querySelectorAll('.wts-ad-container ins.adsbygoogle').length;
    for (var i = 0; i < adCount; i++) {
      pushAd();
    }
  });
})();
