/**
 * WTS Article Sidebar — the sticky "In this guide" card, one implementation
 * for every article surface:
 *
 *  - en/articles/index.html (the article shell) calls buildHeadingAnchors()
 *    + renderInto() after fetching the article from the API;
 *  - static article pages embed a <script type="application/json"
 *    id="article-sidebar-data"> blob and include this file — autoInit()
 *    wraps the page in the two-column layout and renders the card;
 *  - generate-seo-articles.js require()s this file in Node and pre-renders
 *    the card + heading anchors into the static HTML at build time —
 *    autoInit() then only wires smooth-scroll and the reading-position
 *    highlight in the browser.
 *
 * Change the format here and every article page follows.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WTSArticleSidebar = factory();
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { root.WTSArticleSidebar.autoInit(); });
      } else {
        root.WTSArticleSidebar.autoInit();
      }
    }
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Pure helpers (Node + browser) ─────────────────────────────────

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Heading text → stable anchor id ("2. The Psychology of Logo Shapes" →
  // "the-psychology-of-logo-shapes"). Linear-time, no edge trimming needed.
  function slugifyHeading(text) {
    var base = String(text || '')
      .toLowerCase()
      .replace(/^\d+(\.\d+)*\.?\s*/, '')
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .join('-')
      .slice(0, 80);
    return base || 'section';
  }

  // Chapter labels are hand-written summaries of the real headings
  // ("Logo shape psychology" vs "2. The Psychology of Logo Shapes — What
  // Neuroscience Actually Shows"), so match on token overlap.
  var CHAPTER_STOPWORDS = { the: 1, a: 1, an: 1, and: 1, or: 1, of: 1, in: 1, on: 1, for: 1, to: 1, at: 1, is: 1, are: 1, what: 1, why: 1, how: 1, it: 1, its: 1, your: 1, with: 1, more: 1, now: 1, right: 1, actually: 1 };

  function chapterTokens(s) {
    return String(s).toLowerCase()
      .replace(/^\d+(\.\d+)*\.?\s*/, '')
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return w.length > 2 && !CHAPTER_STOPWORDS[w]; })
      .map(function (w) { return w.replace(/s$/, ''); });
  }

  // headings: [{ id, text, level }]; consumes matched ids via usedIds
  function matchChapterToHeading(chapter, headings, usedIds) {
    var cTokens = chapterTokens(chapter);
    if (!cTokens.length) return null;
    var best = null;
    var bestScore = 0;
    (headings || []).forEach(function (h) {
      if (h.level !== 2 || usedIds[h.id]) return;
      var hTokens = chapterTokens(h.text);
      if (!hTokens.length) return;
      var hits = cTokens.filter(function (t) { return hTokens.indexOf(t) !== -1; }).length;
      var score = hits / cTokens.length;
      if (score > bestScore) { bestScore = score; best = h; }
    });
    if (best && bestScore >= 0.5) {
      usedIds[best.id] = true;
      return best;
    }
    return null;
  }

  // Chapters straight from content_labels, with the legacy key_points
  // fallback every surface needs.
  function chaptersFromLabels(cl) {
    cl = cl || {};
    if (Array.isArray(cl.chapters) && cl.chapters.length) return cl.chapters;
    if (Array.isArray(cl.key_points)) {
      return cl.key_points.map(function (kp) {
        return typeof kp === 'string' ? kp : (kp && kp.title) || '';
      }).filter(Boolean);
    }
    return [];
  }

  // Resolve a chapters list against the headings once, in order.
  // Returns [{ text, id|null }].
  function resolveChapters(chapters, headings) {
    var usedIds = {};
    return (chapters || []).map(function (ch) {
      var heading = matchChapterToHeading(ch, headings, usedIds);
      return { text: ch, id: heading ? heading.id : null };
    });
  }

  // The browser derives ids from decoded textContent — decode the common
  // entities in the Node path too, or "&amp;" would slug differently there.
  function decodeEntitiesLite(s) {
    return String(s)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&#8212;|&mdash;/gi, '—')
      .replace(/&amp;/gi, '&');
  }

  // Node-side: give every <h2>/<h3> in an HTML string a stable id (in-place
  // regex pass — no DOM). Returns { html, headings } for build-time renders.
  function injectHeadingIds(html) {
    var headings = [];
    var seen = {};
    var out = String(html || '').replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, function (full, level, attrs, inner) {
      var text = decodeEntitiesLite(inner.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (!text) return full;
      var idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
      var id = idMatch ? idMatch[1] : null;
      if (!id) {
        id = slugifyHeading(text);
        if (seen[id]) id = id + '-' + (++seen[id]);
        else seen[id] = 1;
        attrs = ' id="' + id + '"' + attrs;
      }
      headings.push({ id: id, text: text, level: Number(level) });
      return '<h' + level + attrs + '>' + inner + '</h' + level + '>';
    });
    return { html: out, headings: headings };
  }

  // Source URLs come from CMS data — only plain web links may become
  // clickable (a javascript: value must never reach an href).
  function isSafeHttpUrl(url) {
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function calcReadingTime(text) {
    var words = String(text || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(function (w) { return w.length > 0; }).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    var d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /**
   * The card itself. `article` mirrors the public-API article shape:
   * { title, categories|category, featured_image_url, content_labels,
   *   published_at, created_at, time_to_read, word_count, citations }.
   * `chapterEntries` comes from resolveChapters(). Text is escaped here —
   * callers pass raw values.
   */
  function buildCardHTML(article, chapterEntries, opts) {
    opts = opts || {};
    var cl = article.content_labels || {};
    var chapters = chapterEntries || [];
    var facts = Array.isArray(cl.facts) ? cl.facts.filter(Boolean).slice(0, 4) : [];
    var sources = Array.isArray(cl.sources) ? cl.sources.slice(0, 4) : [];
    var description = (cl.description || '').trim();
    var hasChapters = chapters.length > 0;

    if (!description && !hasChapters && !facts.length && !sources.length) return '';

    var category = article.categories && article.categories.length ? article.categories[0] : (article.category || '');
    // Numeric fields arrive from JSON blobs/API payloads — coerce hard so a
    // non-numeric value can never reach the HTML string unescaped.
    var readingTime = Number(article.time_to_read) || calcReadingTime(article.full_article_content || article.text_article || '');
    var wordCount = Number(article.word_count) || null;
    var publishedDate = formatDate(article.published_at || article.created_at);
    var sourcesCount = (cl.sources || []).length || (article.citations || []).length;
    var faqsCount = Number(cl.faqs_count) || 0;
    var ctaText = cl.cta_text || 'Read full article';
    var ctaHref = opts.ctaHref || '#article-container';

    var html = '<div class="sidebar-card">';

    if (article.featured_image_url) {
      html += '<img src="' + escapeHtml(article.featured_image_url) + '" alt="' + escapeHtml(article.title || '') + '" class="sidebar-card-image" onerror="this.style.display=\'none\'">';
    }

    html += '<div class="sidebar-card-body">';
    if (category) html += '<span class="sidebar-card-category">' + escapeHtml(category) + '</span>';
    html += '<h3 class="sidebar-card-title">' + escapeHtml(article.title || '') + '</h3>';

    html += '<div class="sidebar-card-meta">';
    if (publishedDate) html += '<span><i class="fas fa-calendar"></i> ' + escapeHtml(publishedDate) + '</span>';
    html += '<span><i class="fas fa-clock"></i> ' + readingTime + ' min read</span>';
    if (sourcesCount > 0) html += '<span><i class="fas fa-book"></i> ' + sourcesCount + ' sources</span>';
    html += '</div>';

    if (description) html += '<p class="sidebar-card-desc">' + escapeHtml(description) + '</p>';

    if (hasChapters) {
      html += '<div class="sidebar-section">';
      html += '<h4 class="sidebar-section-title"><i class="fas fa-list-ul"></i> In this guide</h4>';
      html += '<ul>';
      chapters.forEach(function (entry) {
        if (entry.id) {
          html += '<li><a class="sidebar-chapter-link" href="#' + escapeHtml(entry.id) + '">' + escapeHtml(entry.text) + '</a></li>';
        } else {
          html += '<li>' + escapeHtml(entry.text) + '</li>';
        }
      });
      html += '</ul></div>';
    }

    if (facts.length) {
      html += '<div class="sidebar-section">';
      html += '<h4 class="sidebar-section-title"><i class="fas fa-bolt"></i> Quick facts</h4>';
      html += '<ul>';
      facts.forEach(function (f) { html += '<li>' + escapeHtml(f) + '</li>'; });
      html += '</ul></div>';
    }

    if (sources.length) {
      html += '<div class="sidebar-section">';
      html += '<h4 class="sidebar-section-title"><i class="fas fa-book-open"></i> Sources</h4>';
      html += '<div class="sidebar-sources-badges">';
      sources.forEach(function (src) {
        var name = typeof src === 'string' ? src : (src && src.name) || 'Source';
        var url = (typeof src === 'object' && src && src.url) ? src.url : '';
        if (url && isSafeHttpUrl(url)) {
          html += '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="sidebar-source-badge">' + escapeHtml(name) + '</a>';
        } else {
          html += '<span class="sidebar-source-badge">' + escapeHtml(name) + '</span>';
        }
      });
      html += '</div></div>';
    }

    html += '</div>'; // /sidebar-card-body

    html += '<div class="sidebar-read-bar">';
    html += '<div class="sidebar-read-stats">';
    if (wordCount) html += '<span><i class="fas fa-file-alt"></i> ' + Number(wordCount).toLocaleString() + ' words</span>';
    if (faqsCount > 0) html += '<span><i class="fas fa-question-circle"></i> ' + faqsCount + ' FAQs</span>';
    html += '</div>';
    html += '<a href="' + escapeHtml(ctaHref) + '" class="sidebar-cta-btn">' + escapeHtml(ctaText) + ' <i class="fas fa-arrow-right"></i></a>';
    html += '</div>';

    html += '</div>'; // /sidebar-card
    return html;
  }

  // ── Browser-side ──────────────────────────────────────────────────

  // Verbatim copy of the article shell's sidebar styles, with fallback
  // values mirroring its :root palette so the card looks identical on pages
  // that don't define the site variables. Explicit margins guard against
  // heading/list resets bleeding in from a host page's own stylesheet.
  var CARD_CSS = [
    '.article-sidebar{position:sticky;top:24px;}',
    '.wts-article-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:var(--spacing-2xl,3rem);align-items:start;}',
    '.sidebar-card{background:var(--color-white,#fff);border:1px solid var(--color-border,#e5e7eb);border-radius:var(--border-radius-lg,0.75rem);box-shadow:var(--shadow-md,0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1));overflow:hidden;}',
    '.sidebar-card-image{width:100%;height:180px;object-fit:cover;margin:0;}',
    '.sidebar-card-body{padding:20px;}',
    '.sidebar-card-category{display:inline-block;background:var(--color-primary-base,#1f85c9);color:var(--color-white,#fff);font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 10px;border-radius:999px;margin-bottom:10px;}',
    '.sidebar-card-title{font-family:var(--font-family-heading,Poppins,system-ui,sans-serif);font-size:1.1rem;font-weight:700;color:var(--color-slate-900,#122a3f);line-height:1.3;margin:0 0 8px;}',
    '.sidebar-card-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:0.75rem;color:var(--color-slate-500,#64748b);margin-bottom:12px;}',
    '.sidebar-card-meta span{display:flex;align-items:center;gap:4px;}',
    '.sidebar-card-meta i{color:var(--color-primary-base,#1f85c9);font-size:0.7rem;}',
    '.sidebar-card-desc{font-size:0.85rem;color:var(--color-slate-500,#64748b);line-height:1.6;margin:0 0 16px;}',
    '.sidebar-section{border-top:1px solid var(--color-border,#e5e7eb);padding-top:14px;margin-top:14px;}',
    '.sidebar-section-title{font-family:var(--font-family-heading,Poppins,system-ui,sans-serif);font-size:0.8rem;font-weight:700;color:var(--color-slate-900,#122a3f);text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;}',
    '.sidebar-section-title i{color:var(--color-primary-base,#1f85c9);margin-right:4px;}',
    '.sidebar-section ul{list-style:none;padding:0;margin:0;}',
    '.sidebar-section ul li{font-size:0.82rem;color:var(--color-slate-800,#154266);padding:3px 0 3px 16px;position:relative;line-height:1.5;}',
    '.sidebar-section ul li::before{content:"";position:absolute;left:0;top:10px;width:6px;height:6px;border-radius:50%;background:var(--color-primary-base,#1f85c9);}',
    '.sidebar-chapter-link{color:var(--color-slate-800,#154266);text-decoration:none;display:inline-block;transition:color 0.15s ease;cursor:pointer;}',
    '.sidebar-chapter-link:hover{color:var(--color-primary-base,#1f85c9);text-decoration:underline;}',
    '.sidebar-section ul li.chapter-active .sidebar-chapter-link{color:var(--color-primary-base,#1f85c9);font-weight:600;}',
    '.sidebar-sources-badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}',
    '.sidebar-source-badge{font-size:0.7rem;font-weight:600;padding:3px 8px;border-radius:999px;background:#f0f4f8;color:var(--color-slate-800,#154266);text-decoration:none;transition:background 0.2s;}',
    '.sidebar-source-badge:hover{background:var(--color-primary-base,#1f85c9);color:var(--color-white,#fff);}',
    '.sidebar-read-bar{border-top:1px solid var(--color-border,#e5e7eb);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f8fafc;}',
    '.sidebar-read-stats{display:flex;gap:14px;font-size:0.72rem;color:var(--color-slate-500,#64748b);}',
    '.sidebar-read-stats span{display:flex;align-items:center;gap:4px;}',
    '.sidebar-read-stats i{color:var(--color-primary-base,#1f85c9);font-size:0.7rem;}',
    '.sidebar-cta-btn{display:inline-flex;align-items:center;gap:6px;background:var(--color-accent-magenta,#d62b83);color:var(--color-white,#fff);font-size:0.78rem;font-weight:600;padding:8px 16px;border-radius:6px;text-decoration:none;transition:background 0.2s;white-space:nowrap;}',
    '.sidebar-cta-btn:hover{background:#b8236f;color:var(--color-white,#fff);}',
    '.article-content h2,.article-content h3{scroll-margin-top:96px;}',
    '@media (max-width:960px){.wts-article-layout{grid-template-columns:1fr;}.article-sidebar{position:static;order:-1;}}',
  ].join('\n');

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('wts-article-sidebar-css')) return;
    var style = document.createElement('style');
    style.id = 'wts-article-sidebar-css';
    style.textContent = CARD_CSS;
    document.head.appendChild(style);
  }

  // Give every section heading in the live DOM a stable id.
  // Returns [{ id, text, el, level }] in document order.
  function buildHeadingAnchors(rootEl) {
    if (!rootEl) return [];
    var seen = {};
    var headings = [];
    rootEl.querySelectorAll('h2, h3').forEach(function (el) {
      var text = (el.textContent || '').trim();
      if (!text) return;
      var id = el.id;
      if (!id) {
        id = slugifyHeading(text);
        if (seen[id]) id = id + '-' + (++seen[id]);
        else seen[id] = 1;
        el.id = id;
      }
      headings.push({ id: id, text: text, el: el, level: el.tagName === 'H2' ? 2 : 3 });
    });
    return headings;
  }

  // Smooth-scroll chapter links + highlight the section being read.
  function wireChapterNav(sidebarEl) {
    if (!sidebarEl) return;
    var links = [];
    sidebarEl.querySelectorAll('.sidebar-chapter-link[href^="#"]').forEach(function (a) {
      var target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) links.push({ a: a, target: target });
    });
    if (!links.length) return;

    links.forEach(function (link) {
      link.a.addEventListener('click', function (e) {
        e.preventDefault();
        link.target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', '#' + link.target.id);
      });
    });

    var raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : function (f) { setTimeout(f, 16); };
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      raf(function () {
        ticking = false;
        var fromTop = window.scrollY + 140;
        var current = null;
        links.forEach(function (link) {
          var top = link.target.getBoundingClientRect().top + window.scrollY;
          if (top <= fromTop) current = link;
        });
        links.forEach(function (link) {
          link.a.parentElement.classList.toggle('chapter-active', link === current);
        });
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Render the card into a sidebar element from live data (article shell path).
  function renderInto(sidebarEl, article, headings, opts) {
    if (!sidebarEl) return;
    injectStyles();
    var entries = resolveChapters(chaptersFromLabels(article.content_labels), headings || []);
    var html = buildCardHTML(article, entries, opts);
    if (!html) { sidebarEl.style.display = 'none'; return; }
    sidebarEl.innerHTML = html;
    sidebarEl.style.display = '';
    wireChapterNav(sidebarEl);
  }

  // Static pages: read the JSON blob, wrap the article in the two-column
  // layout, render the card, wire the nav. Pages that PRE-RENDER the card
  // (the static generator) only get styles + nav wiring.
  function autoInit() {
    if (typeof document === 'undefined') return;

    var existingCard = document.querySelector('.article-sidebar .sidebar-card');
    if (existingCard) {
      injectStyles();
      var contentRoot = document.querySelector('.article-content');
      if (contentRoot) buildHeadingAnchors(contentRoot);
      wireChapterNav(existingCard.closest('.article-sidebar'));
      return;
    }

    var blobEl = document.getElementById('article-sidebar-data');
    if (!blobEl) return;
    var article;
    try { article = JSON.parse(blobEl.textContent); } catch (e) { return; }

    var contentEl = document.querySelector('.article-content');
    if (!contentEl || document.querySelector('.article-sidebar')) return;

    injectStyles();

    // Two-column layout around the article, sidebar alongside
    var layout = document.createElement('div');
    layout.className = 'wts-article-layout';
    contentEl.parentNode.insertBefore(layout, contentEl);
    layout.appendChild(contentEl);
    var aside = document.createElement('aside');
    aside.className = 'article-sidebar';
    layout.appendChild(aside);
    if (!contentEl.id) contentEl.id = 'article-container';

    var headings = buildHeadingAnchors(contentEl);
    renderInto(aside, article, headings, { ctaHref: '#' + contentEl.id });
  }

  return {
    escapeHtml: escapeHtml,
    isSafeHttpUrl: isSafeHttpUrl,
    slugifyHeading: slugifyHeading,
    chapterTokens: chapterTokens,
    matchChapterToHeading: matchChapterToHeading,
    chaptersFromLabels: chaptersFromLabels,
    resolveChapters: resolveChapters,
    injectHeadingIds: injectHeadingIds,
    calcReadingTime: calcReadingTime,
    formatDate: formatDate,
    buildCardHTML: buildCardHTML,
    CARD_CSS: CARD_CSS,
    injectStyles: injectStyles,
    buildHeadingAnchors: buildHeadingAnchors,
    wireChapterNav: wireChapterNav,
    renderInto: renderInto,
    autoInit: autoInit,
  };
}));
