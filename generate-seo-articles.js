#!/usr/bin/env node

/**
 * Static SEO Article Page Generator
 *
 * Fetches articles from Railway API and generates static HTML files
 * with full SEO optimization:
 * - Schema.org JSON-LD markup
 * - Semantic HTML5 tags
 * - All meta tags (OG, Twitter Cards)
 * - Full content in initial HTML (no API calls)
 *
 * Usage: node generate-seo-articles.js [--slug article-slug] [--all]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const striptags = require('striptags');
const API_BASE_URL = 'https://admin.wordsthatsells.website/api/public';
const SITE_BASE_URL = 'https://wordsthatsells.website';
const OUTPUT_DIR = path.join(__dirname, 'en', 'articles');

// Parse command line arguments
const args = process.argv.slice(2);
const slugArg = args.find(arg => arg.startsWith('--slug='));
const generateAll = args.includes('--all');
const targetSlug = slugArg ? slugArg.split('=')[1] : null;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Fetch data from URL using https module
 */
function fetchData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Calculate reading time based on content
 */
function calculateReadingTime(content) {
  const text = content.replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / 200);
  return minutes;
}

/**
 * Format date
 */
function formatDate(dateString) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', options);
}

/**
 * Format date for Schema.org (ISO 8601)
 */
function formatSchemaDate(dateString) {
  return new Date(dateString).toISOString();
}

/**
 * Generate the inline "Listen to this Article" audio widget HTML.
 * Returns empty string if audio is not enabled.
 */
function generateAudioWidgetHTML(article) {
  const audioFiles = article.audio_files || {};
  if (!audioFiles._enabled) return '';

  const LANG_LABELS = {
    en: 'English', lo: 'Lao', th: 'Thai', es: 'Spanish',
    fr: 'French', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
    vi: 'Vietnamese', km: 'Khmer', my: 'Burmese'
  };

  // Build tracks object (exclude _enabled flag)
  const tracks = {};
  for (const [code, url] of Object.entries(audioFiles)) {
    if (code === '_enabled' || !url) continue;
    tracks[code] = { label: LANG_LABELS[code] || code, url: url };
  }

  if (Object.keys(tracks).length === 0) return '';

  const firstCode = Object.keys(tracks)[0];
  const articleTitle = escapeHtml(article.title);

  return `
            <!-- Audio Widget: Listen to this Article -->
            <script type="application/ld+json" id="audio-widget-schema">
            ${JSON.stringify({
              "@context": "https://schema.org",
              "@type": "AudioObject",
              "name": article.title,
              "description": article.description || '',
              "encodingFormat": "audio/mpeg",
              "inLanguage": firstCode,
              "contentUrl": tracks[firstCode].url
            }, null, 14)}
            </script>
            <figure class="article-audio-widget" role="region" aria-label="Listen to this article in multiple languages">
              <figcaption class="aaw-caption">
                <svg class="aaw-icon-headphones" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/></svg>
                <span>Listen to this article</span>
              </figcaption>
              <div class="aaw-controls">
                <div class="aaw-lang-wrapper">
                  <label for="aaw-lang-select" class="aaw-sr-only">Select language</label>
                  <select id="aaw-lang-select" class="aaw-lang-select" aria-label="Audio language"></select>
                </div>
                <button class="aaw-play-btn" id="aaw-play-btn" aria-label="Play audio" type="button">
                  <svg class="aaw-icon-play" id="aaw-icon-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>
                  <svg class="aaw-icon-pause" id="aaw-icon-pause" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </button>
                <span class="aaw-time" id="aaw-time-current">0:00</span>
                <div class="aaw-progress-wrap" id="aaw-progress-wrap" role="slider" aria-label="Audio progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
                  <div class="aaw-progress-track"><div class="aaw-progress-fill" id="aaw-progress-fill"></div></div>
                </div>
                <span class="aaw-time" id="aaw-time-total">0:00</span>
              </div>
              <audio id="aaw-audio" preload="metadata"></audio>
            </figure>
            <style>
            .article-audio-widget,.article-audio-widget *,.article-audio-widget *::before,.article-audio-widget *::after{box-sizing:border-box;margin:0;padding:0}
            .article-audio-widget{--aaw-bg:#f8fafc;--aaw-border:#e2e8f0;--aaw-text:#334155;--aaw-text-muted:#94a3b8;--aaw-accent:#2563eb;--aaw-accent-hover:#1d4ed8;--aaw-track-bg:#cbd5e1;--aaw-radius:999px;--aaw-radius-md:10px;--aaw-font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;gap:8px;background:var(--aaw-bg);border:1px solid var(--aaw-border);border-radius:var(--aaw-radius-md);padding:14px 18px;margin:20px 0 28px;font-family:var(--aaw-font);max-width:100%}
            .aaw-caption{display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:600;color:var(--aaw-text-muted);text-transform:uppercase;letter-spacing:.5px}
            .aaw-icon-headphones{flex-shrink:0;color:var(--aaw-accent)}
            .aaw-controls{display:flex;align-items:center;gap:10px}
            .aaw-lang-wrapper{flex-shrink:0}
            .aaw-lang-select{appearance:none;-webkit-appearance:none;background:#fff;border:1px solid var(--aaw-border);border-radius:var(--aaw-radius);padding:6px 28px 6px 12px;font-size:.8rem;font-weight:500;color:var(--aaw-text);cursor:pointer;font-family:var(--aaw-font);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;transition:border-color .2s}
            .aaw-lang-select:hover,.aaw-lang-select:focus{border-color:var(--aaw-accent);outline:none}
            .aaw-play-btn{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;border:none;background:var(--aaw-accent);color:#fff;cursor:pointer;transition:background .2s,transform .15s}
            .aaw-play-btn:hover{background:var(--aaw-accent-hover);transform:scale(1.06)}
            .aaw-play-btn:active{transform:scale(.96)}
            .aaw-icon-play{margin-left:2px}
            .aaw-time{flex-shrink:0;font-size:.75rem;font-variant-numeric:tabular-nums;color:var(--aaw-text-muted);min-width:34px;text-align:center;user-select:none}
            .aaw-progress-wrap{flex:1;min-width:0;cursor:pointer;padding:6px 0;-webkit-tap-highlight-color:transparent}
            .aaw-progress-track{position:relative;height:5px;background:var(--aaw-track-bg);border-radius:var(--aaw-radius);overflow:hidden}
            .aaw-progress-fill{position:absolute;top:0;left:0;height:100%;width:0%;background:var(--aaw-accent);border-radius:var(--aaw-radius);transition:width .15s linear}
            .aaw-progress-wrap:hover .aaw-progress-track{height:7px}
            .aaw-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
            @media(max-width:480px){.article-audio-widget{padding:12px 14px}.aaw-controls{flex-wrap:wrap;gap:8px}.aaw-lang-wrapper{order:-1;width:100%}.aaw-lang-select{width:100%}}
            </style>
            <script>
            (function(){
              'use strict';
              var AUDIO_TRACKS=${JSON.stringify(tracks)};
              var audio=document.getElementById('aaw-audio'),playBtn=document.getElementById('aaw-play-btn'),iconPlay=document.getElementById('aaw-icon-play'),iconPause=document.getElementById('aaw-icon-pause'),langSelect=document.getElementById('aaw-lang-select'),timeCurrent=document.getElementById('aaw-time-current'),timeTotal=document.getElementById('aaw-time-total'),progressWrap=document.getElementById('aaw-progress-wrap'),progressFill=document.getElementById('aaw-progress-fill'),schemaScript=document.getElementById('audio-widget-schema');
              function fmtTime(s){if(!s||!isFinite(s))return'0:00';var m=Math.floor(s/60),sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec}
              function updateSchema(langCode,url){try{var schema=JSON.parse(schemaScript.textContent);schema.inLanguage=langCode;schema.contentUrl=url;schemaScript.textContent=JSON.stringify(schema,null,2)}catch(e){}}
              var codes=Object.keys(AUDIO_TRACKS);
              codes.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=AUDIO_TRACKS[c].label;langSelect.appendChild(o)});
              if(codes.length>0){audio.src=AUDIO_TRACKS[codes[0]].url;updateSchema(codes[0],AUDIO_TRACKS[codes[0]].url)}
              langSelect.addEventListener('change',function(){var c=langSelect.value,t=AUDIO_TRACKS[c];if(!t)return;audio.pause();audio.src=t.url;audio.load();progressFill.style.width='0%';timeCurrent.textContent='0:00';timeTotal.textContent='0:00';setPlayIcon(false);updateSchema(c,t.url);
                // Analytics: language_changed — Replace console.log with dataLayer.push()
                // window.dataLayer.push({event:'audio_language_changed',audio_language:c});
                console.log('[AudioWidget] language_changed:',c)});
              function setPlayIcon(p){iconPlay.style.display=p?'none':'block';iconPause.style.display=p?'block':'none';playBtn.setAttribute('aria-label',p?'Pause audio':'Play audio')}
              playBtn.addEventListener('click',function(){if(audio.paused){audio.play().catch(function(){})}else{audio.pause()}});
              audio.addEventListener('play',function(){setPlayIcon(true);
                // Analytics: play — Replace with dataLayer.push({event:'audio_play',audio_language:langSelect.value})
                console.log('[AudioWidget] play — lang:',langSelect.value)});
              audio.addEventListener('pause',function(){setPlayIcon(false);
                // Analytics: pause — Replace with dataLayer.push({event:'audio_pause',audio_language:langSelect.value,audio_position:audio.currentTime})
                console.log('[AudioWidget] pause — lang:',langSelect.value,'at',fmtTime(audio.currentTime))});
              audio.addEventListener('ended',function(){setPlayIcon(false);progressFill.style.width='100%';
                // Analytics: ended — Replace with dataLayer.push({event:'audio_ended',audio_language:langSelect.value})
                console.log('[AudioWidget] ended — lang:',langSelect.value)});
              audio.addEventListener('loadedmetadata',function(){timeTotal.textContent=fmtTime(audio.duration)});
              audio.addEventListener('timeupdate',function(){if(!audio.duration)return;var pct=(audio.currentTime/audio.duration)*100;progressFill.style.width=pct+'%';timeCurrent.textContent=fmtTime(audio.currentTime);progressWrap.setAttribute('aria-valuenow',Math.round(pct))});
              function seekFromEvent(e){var rect=progressWrap.getBoundingClientRect();var clientX=e.touches?e.touches[0].clientX:e.clientX;var pct=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));if(audio.duration&&isFinite(audio.duration)){audio.currentTime=pct*audio.duration}}
              var isScrubbing=false;
              progressWrap.addEventListener('mousedown',function(e){isScrubbing=true;seekFromEvent(e)});
              document.addEventListener('mousemove',function(e){if(isScrubbing)seekFromEvent(e)});
              document.addEventListener('mouseup',function(){isScrubbing=false});
              progressWrap.addEventListener('touchstart',function(e){isScrubbing=true;seekFromEvent(e)},{passive:true});
              progressWrap.addEventListener('touchmove',function(e){if(isScrubbing)seekFromEvent(e)},{passive:true});
              progressWrap.addEventListener('touchend',function(){isScrubbing=false});
              progressWrap.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){audio.currentTime=Math.min(audio.duration||0,audio.currentTime+5)}else if(e.key==='ArrowLeft'){audio.currentTime=Math.max(0,audio.currentTime-5)}});
            })();
            </script>`;
}

/**
 * Resolve social metadata with fallback chain
 */
function resolveSocialMeta(article) {
  const sm = article.social_meta || {};
  const defaultImage = 'https://wordsthatsells.website/images/default-blog.jpg';

  return {
    ogTitle: sm.og_title || article.title,
    ogDescription: sm.og_description || article.description || article.title,
    ogImage: sm.og_image || article.featured_image_url || defaultImage,
    ogType: sm.og_type || 'article',
    twitterCard: sm.twitter_card || 'summary_large_image',
    twitterTitle: sm.twitter_title || sm.og_title || article.title,
    twitterDescription: sm.twitter_description || sm.og_description || article.description || article.title,
    twitterImage: sm.twitter_image || sm.og_image || article.featured_image_url || defaultImage,
    twitterSite: sm.twitter_site || '',
    twitterCreator: sm.twitter_creator || '',
    canonicalUrl: sm.canonical_url || '',
    robotsMeta: sm.robots_meta || 'index, follow',
    schemaMarkup: sm.schema_markup || null
  };
}

// SEO terms cache (fetched once at build time)
let seoTermsCache = [];
const ADMIN_API_BASE = 'https://admin.wordsthatsells.website/api/public';

/**
 * Fetch SEO terms from admin backend for build-time highlighting
 */
async function fetchSeoTerms() {
  try {
    const url = `${ADMIN_API_BASE}/seo-terms`;
    console.log('   Fetching SEO terms for article highlighting...');
    const terms = await fetchData(url);
    console.log(`   Found ${terms.length} SEO terms`);
    return terms;
  } catch (err) {
    console.warn('   Warning: Could not fetch SEO terms:', err.message);
    return [];
  }
}

/**
 * Highlight SEO terms in HTML content at build time.
 * Wraps first occurrence of each term with <span class="seo-term-link"> and data attributes.
 * Skips terms inside existing links, code blocks, and headings.
 */
function highlightTermsInHTML(htmlContent, terms) {
  if (!terms || terms.length === 0 || !htmlContent) return htmlContent;

  // Sort terms by length (longest first) for greedy matching
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);

  const linked = new Set();
  let result = htmlContent;

  for (const termData of sorted) {
    const termKey = termData.term.toLowerCase();
    if (linked.has(termKey)) continue;

    // Build regex: word-boundary match, case-insensitive, first occurrence only
    const escaped = termData.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(?<![<\\/\\w])\\b(' + escaped + ')\\b(?![^<]*>)', 'i');

    const match = result.match(regex);
    if (match) {
      const shortDef = escapeHtml(termData.short_definition || termData.definition || '').substring(0, 200);
      const replacement = `<span class="seo-term-link" data-term-id="${termData.id}" data-term="${escapeHtml(termData.term.toLowerCase())}" data-def="${shortDef}" data-category="${escapeHtml(termData.category || '')}" data-article-link="${termData.article_link || ''}" data-glossary-link="${termData.glossary_link || ''}" role="button" tabindex="0">${match[1]}</span>`;
      result = result.replace(regex, replacement);
      linked.add(termKey);
    }
  }

  return result;
}

// Social links for sameAs
const SOCIAL_LINKS = [
  "https://www.linkedin.com/company/wordsthatsells",
  "https://www.instagram.com/wordsthatsells",
  "https://github.com/laurentlaboise"
];

/**
 * Generate unified Schema.org JSON-LD with @graph (Article + BreadcrumbList)
 */
function generateSchemaMarkup(article) {
  const articleUrl = `${SITE_BASE_URL}/en/articles/${article.slug}.html`;
  const social = resolveSocialMeta(article);

  // Use custom schema markup from CMS if available
  if (social.schemaMarkup && typeof social.schemaMarkup === 'object') {
    return social.schemaMarkup;
  }

  // Unified image: prefer og_image → featured_image → article_images library
  const primaryImage = social.ogImage;
  const imageObjects = [];

  // Add primary image first (og/featured image)
  if (primaryImage && primaryImage !== 'https://wordsthatsells.website/images/default-blog.jpg') {
    imageObjects.push({
      "@type": "ImageObject",
      "url": primaryImage,
      "representativeOfPage": true
    });
  }

  // Then add article_images library entries
  if (Array.isArray(article.article_images)) {
    article.article_images.forEach((img) => {
      const url = img.cdn_url || img.url || '';
      if (!url || url === primaryImage) return;
      const obj = {
        "@type": "ImageObject",
        "url": url,
        "name": img.title || img.filename || ''
      };
      if (img.alt_text) obj.caption = img.alt_text;
      if (img.width) obj.width = { "@type": "QuantitativeValue", "value": img.width, "unitCode": "E37" };
      if (img.height) obj.height = { "@type": "QuantitativeValue", "value": img.height, "unitCode": "E37" };
      imageObjects.push(obj);
    });
  }

  // Word count from content (use stored word_count if available)
  const content = article.full_article_content || article.content || '';
  const textContent = striptags(content);
  const wordCount = article.word_count || textContent.split(/\s+/).filter(w => w.length > 0).length;
  const readTime = article.time_to_read || calculateReadingTime(content);

  // Build Article object
  const articleObj = {
    "@type": "Article",
    "@id": `${articleUrl}#article`,
    "headline": article.title,
    "description": social.ogDescription
  };

  if (imageObjects.length > 0) articleObj.image = imageObjects;
  articleObj.datePublished = formatSchemaDate(article.published_at || article.created_at);
  articleObj.dateModified = formatSchemaDate(article.updated_at || article.created_at);

  // Author: Person or Organization based on article.author_type
  if (article.author_type === 'person' && article.author_name) {
    const authorObj = {
      "@type": "Person",
      "name": article.author_name
    };
    if (article.author_job_title) authorObj.jobTitle = article.author_job_title;
    if (article.author_url) authorObj.sameAs = [article.author_url];
    articleObj.author = authorObj;
  } else {
    articleObj.author = {
      "@type": "Organization",
      "name": "Words That Sells",
      "url": "https://wordsthatsells.website",
      "sameAs": SOCIAL_LINKS
    };
  }

  articleObj.publisher = {
    "@type": "Organization",
    "name": "Words That Sells",
    "logo": {
      "@type": "ImageObject",
      "url": "https://wordsthatsells.website/assets/images/logo.png"
    },
    "sameAs": SOCIAL_LINKS
  };
  articleObj.mainEntityOfPage = {
    "@type": "WebPage",
    "@id": articleUrl
  };

  // articleSection: use category directly (now human-readable from admin)
  if (article.category) {
    articleObj.articleSection = article.category;
  } else if (article.categories && article.categories.length > 0) {
    articleObj.articleSection = article.categories[0];
  }

  if (readTime) articleObj.timeRequired = `PT${readTime}M`;
  if (wordCount > 0) articleObj.wordCount = String(wordCount);

  // About (entity linking from tags) - normalize slugified tags to human-readable
  if (article.tags && article.tags.length > 0) {
    articleObj.about = article.tags.map(tag => {
      // Normalize: "ai-marketing" → "AI Marketing"
      const normalized = tag.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return { "@type": "Thing", "name": normalized };
    });
  }

  // Speakable property (voice assistants: Gemini Live, Siri, Alexa)
  articleObj.speakable = {
    "@type": "SpeakableSpecification",
    "cssSelector": [".article-summary", ".article-key-insights", ".article-header h1", ".article-excerpt"]
  };

  // Citations (entity linking for AI search engines)
  if (Array.isArray(article.citations) && article.citations.length > 0) {
    const validCitations = article.citations.filter(c => c.url);
    if (validCitations.length > 0) {
      articleObj.citation = validCitations.map(c => {
        const citObj = { "@type": "CreativeWork", "url": c.url };
        if (c.name) citObj.name = c.name;
        return citObj;
      });
    }
  }

  // Build BreadcrumbList
  const breadcrumb = {
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://wordsthatsells.website" },
      { "@type": "ListItem", "position": 2, "name": "Articles", "item": "https://wordsthatsells.website/en/articles/" },
      { "@type": "ListItem", "position": 3, "name": article.title }
    ]
  };

  return {
    "@context": "https://schema.org",
    "@graph": [articleObj, breadcrumb]
  };
}

/**
 * Generate sidebar card HTML from content_labels
 */
function generateSidebarHTML(article) {
  const cl = article.content_labels || {};
  const hasDescription = cl.description && cl.description.trim();
  const hasWhoShouldRead = cl.who_should_read && cl.who_should_read.length > 0;
  const hasKeyPoints = cl.key_points && cl.key_points.length > 0;
  const hasSources = cl.sources && cl.sources.length > 0;

  if (!hasDescription && !hasWhoShouldRead && !hasKeyPoints && !hasSources) {
    return '';
  }

  const readingTime = article.time_to_read || calculateReadingTime(article.full_article_content || article.content || '');
  const content = article.full_article_content || article.content || '';
  const textContent = striptags(content);
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
  const publishedDate = formatDate(article.published_at || article.created_at);
  const sourcesCount = (cl.sources || []).length + (article.citations || []).length;
  const faqsCount = cl.faqs_count || 0;
  const ctaText = cl.cta_text || 'Read Full Article';

  let html = '<aside class="article-sidebar"><div class="sidebar-card">';

  if (article.featured_image_url) {
    html += `<img src="${article.featured_image_url}" alt="${escapeHtml(article.title)}" class="sidebar-card-image" onerror="this.style.display='none'">`;
  }

  html += '<div class="sidebar-card-body">';

  if (article.categories && article.categories.length > 0) {
    html += `<span class="sidebar-card-category">${escapeHtml(article.categories[0])}</span>`;
  }

  html += `<h3 class="sidebar-card-title">${escapeHtml(article.title)}</h3>`;

  html += '<div class="sidebar-card-meta">';
  html += `<span><i class="fas fa-calendar"></i> ${publishedDate}</span>`;
  html += `<span><i class="fas fa-clock"></i> ${readingTime} min read</span>`;
  if (sourcesCount > 0) {
    html += `<span><i class="fas fa-book"></i> ${sourcesCount} sources</span>`;
  }
  html += '</div>';

  if (hasDescription) {
    html += `<p class="sidebar-card-desc">${escapeHtml(cl.description)}</p>`;
  }

  if (hasWhoShouldRead) {
    html += '<div class="sidebar-section">';
    html += '<h4 class="sidebar-section-title"><i class="fas fa-users" style="color: var(--color-primary-base); margin-right: 4px;"></i> Who Should Read This</h4>';
    html += '<ul>';
    cl.who_should_read.forEach(item => { html += `<li>${escapeHtml(item)}</li>`; });
    html += '</ul></div>';
  }

  if (hasKeyPoints) {
    html += '<div class="sidebar-section">';
    html += '<h4 class="sidebar-section-title"><i class="fas fa-lightbulb" style="color: var(--color-primary-base); margin-right: 4px;"></i> What You\'ll Learn</h4>';
    cl.key_points.forEach(kp => {
      html += '<div class="sidebar-key-point">';
      if (kp.title) html += `<div class="sidebar-key-point-title">${escapeHtml(kp.title)}</div>`;
      if (kp.description) html += `<div class="sidebar-key-point-desc">${escapeHtml(kp.description)}</div>`;
      html += '</div>';
    });
    html += '</div>';
  }

  if (hasSources) {
    html += '<div class="sidebar-section">';
    html += '<h4 class="sidebar-section-title"><i class="fas fa-book-open" style="color: var(--color-primary-base); margin-right: 4px;"></i> Sources Referenced</h4>';
    html += '<div class="sidebar-sources-badges">';
    cl.sources.forEach(src => {
      if (src.url) {
        html += `<a href="${src.url}" target="_blank" rel="noopener" class="sidebar-source-badge">${escapeHtml(src.name || 'Source')}</a>`;
      } else {
        html += `<span class="sidebar-source-badge">${escapeHtml(src.name || 'Source')}</span>`;
      }
    });
    html += '</div></div>';
  }

  html += '</div>'; // end sidebar-card-body

  // Read stats bar
  html += '<div class="sidebar-read-bar">';
  html += '<div class="sidebar-read-stats">';
  html += `<span><i class="fas fa-file-alt"></i> ${wordCount.toLocaleString()} words</span>`;
  if (faqsCount > 0) {
    html += `<span><i class="fas fa-question-circle"></i> ${faqsCount} FAQs</span>`;
  }
  html += '</div>';
  html += `<a href="#" class="sidebar-cta-btn" onclick="window.scrollTo({top:0,behavior:'smooth'});return false;">${escapeHtml(ctaText)} <i class="fas fa-arrow-right"></i></a>`;
  html += '</div>';

  html += '</div></aside>'; // end sidebar-card and aside

  return html;
}

/**
 * Generate complete HTML for an article
 */
function generateArticleHTML(article) {
  const articleUrl = `${SITE_BASE_URL}/en/articles/${article.slug}.html`;
  const social = resolveSocialMeta(article);
  const readingTime = article.time_to_read || calculateReadingTime(article.full_article_content || article.content || '');
  const publishedDate = formatDate(article.published_at || article.created_at);
  const updatedDate = article.updated_at ? formatDate(article.updated_at) : null;
  const canonicalUrl = social.canonicalUrl || articleUrl;
  const schemaMarkup = generateSchemaMarkup(article);

  const sidebarHTML = generateSidebarHTML(article);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(article.title)} | WordsThatSells.Website</title>

    <!-- SEO Meta Tags -->
    <meta name="description" content="${escapeHtml(social.ogDescription)}">
    <meta name="robots" content="${social.robotsMeta}">
    <link rel="canonical" href="${canonicalUrl}">

    <!-- Open Graph / Facebook / LinkedIn / WhatsApp / Pinterest / Slack / Discord -->
    <meta property="og:site_name" content="WordsThatSells.Website">
    <meta property="og:type" content="${social.ogType}">
    <meta property="og:title" content="${escapeHtml(social.ogTitle)}">
    <meta property="og:description" content="${escapeHtml(social.ogDescription)}">
    <meta property="og:image" content="${social.ogImage}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${articleUrl}">
    <meta property="article:published_time" content="${formatSchemaDate(article.published_at || article.created_at)}">
    ${article.updated_at ? `<meta property="article:modified_time" content="${formatSchemaDate(article.updated_at)}">` : ''}
    <meta property="article:author" content="WordsThatSells.Website">
    ${article.categories && article.categories.length > 0 ? article.categories.map(cat => `<meta property="article:tag" content="${escapeHtml(cat)}">`).join('\n    ') : ''}
    ${article.tags && article.tags.length > 0 ? article.tags.map(tag => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join('\n    ') : ''}

    <!-- Twitter / X Card -->
    <meta name="twitter:card" content="${social.twitterCard}">
    ${social.twitterSite ? `<meta name="twitter:site" content="${escapeHtml(social.twitterSite)}">` : ''}
    ${social.twitterCreator ? `<meta name="twitter:creator" content="${escapeHtml(social.twitterCreator)}">` : ''}
    <meta name="twitter:title" content="${escapeHtml(social.twitterTitle)}">
    <meta name="twitter:description" content="${escapeHtml(social.twitterDescription)}">
    <meta name="twitter:image" content="${social.twitterImage}">

    <!-- Schema.org JSON-LD (@graph: Article + BreadcrumbList) -->
    <script type="application/ld+json">
${JSON.stringify(schemaMarkup, null, 2)}
    </script>

    <!-- Fonts and Icons -->
    <script src="https://kit.fontawesome.com/a521ce00f6.js" crossorigin="anonymous"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <style>
        :root {
            --color-primary-base: #1f85c9;
            --color-accent-magenta: #d62b83;
            --color-slate-900: #122a3f;
            --color-slate-800: #154266;
            --color-slate-500: #64748b;
            --color-white: #ffffff;
            --color-light: #f9f9f9;
            --color-border: #e5e7eb;
            --font-family-heading: 'Poppins', sans-serif;
            --font-family-body: 'Inter', sans-serif;
            --spacing-sm: 0.5rem;
            --spacing-md: 1rem;
            --spacing-lg: 1.5rem;
            --spacing-xl: 2rem;
            --spacing-2xl: 3rem;
            --spacing-3xl: 4rem;
            --border-radius-md: 0.5rem;
            --border-radius-lg: 0.75rem;
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
        }

        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--font-family-body);
            line-height: 1.6;
            color: var(--color-slate-800);
            background-color: var(--color-white);
        }

        .container {
            width: 90%;
            max-width: 1200px;
            margin: 0 auto;
            padding: var(--spacing-3xl) 0;
        }

        .article-layout {
            display: grid;
            grid-template-columns: 1fr 340px;
            gap: var(--spacing-2xl);
            align-items: start;
        }

        .article-header {
            margin-bottom: var(--spacing-2xl);
            text-align: center;
        }

        h1 {
            font-family: var(--font-family-heading);
            font-size: clamp(2rem, 5vw, 3rem);
            color: var(--color-slate-900);
            margin-bottom: var(--spacing-md);
            line-height: 1.2;
        }

        .article-meta {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: var(--spacing-md);
            font-size: 0.875rem;
            color: var(--color-slate-500);
            margin-bottom: var(--spacing-lg);
        }

        .article-meta span {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
        }

        .article-meta i {
            color: var(--color-primary-base);
        }

        .article-categories {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: var(--spacing-sm);
            margin-bottom: var(--spacing-xl);
        }

        .category-pill {
            background-color: var(--color-slate-500);
            color: var(--color-white);
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 0.875rem;
            font-weight: 500;
        }

        .featured-image {
            width: 100%;
            max-height: 500px;
            object-fit: cover;
            border-radius: var(--border-radius-lg);
            margin-bottom: var(--spacing-2xl);
        }

        .article-content {
            font-size: 1.125rem;
            line-height: 1.8;
        }

        .article-content h2 {
            font-family: var(--font-family-heading);
            font-size: 1.875rem;
            color: var(--color-slate-900);
            margin-top: var(--spacing-2xl);
            margin-bottom: var(--spacing-md);
        }

        .article-content h3 {
            font-family: var(--font-family-heading);
            font-size: 1.5rem;
            color: var(--color-slate-900);
            margin-top: var(--spacing-xl);
            margin-bottom: var(--spacing-md);
        }

        .article-content p {
            margin-bottom: var(--spacing-md);
        }

        .article-content ul,
        .article-content ol {
            margin-bottom: var(--spacing-md);
            padding-left: var(--spacing-xl);
        }

        .article-content li {
            margin-bottom: var(--spacing-sm);
        }

        .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: var(--border-radius-md);
            margin: var(--spacing-lg) 0;
        }

        .back-link {
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-sm);
            color: var(--color-primary-base);
            text-decoration: none;
            font-weight: 500;
            margin-bottom: var(--spacing-xl);
            transition: color 0.2s;
        }

        .back-link:hover {
            color: var(--color-accent-magenta);
        }

        .share-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: var(--spacing-sm);
            margin-top: var(--spacing-2xl);
            padding-top: var(--spacing-xl);
            border-top: 1px solid var(--color-border);
            justify-content: center;
        }

        .share-buttons a {
            background-color: #e5e7eb;
            color: #4e555b;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            text-decoration: none;
        }

        .share-buttons a:hover {
            color: var(--color-white);
        }

        .share-buttons .share-x:hover {
            background-color: #000000;
        }

        .share-buttons .share-linkedin:hover {
            background-color: #0077b5;
        }

        .share-buttons .share-facebook:hover {
            background-color: #3b5998;
        }

        .share-buttons .share-whatsapp:hover {
            background-color: #25d366;
        }

        .share-buttons .share-copy:hover {
            background-color: var(--color-primary-base);
        }

        .back-to-top {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: var(--color-accent-magenta);
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            cursor: pointer;
            z-index: 1000;
            transition: background-color 0.3s, transform 0.3s, opacity 0.3s;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 24px;
            opacity: 0;
            transform: translateY(20px);
            pointer-events: none;
            text-decoration: none;
        }

        .back-to-top.show {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }

        .back-to-top:hover {
            background-color: #f90784;
            color: white;
        }

        /* --- SEO Term Tooltip Styles --- */
        .seo-term-link {
            color: var(--color-primary-base);
            text-decoration: none;
            border-bottom: 1px dashed var(--color-primary-base);
            cursor: pointer;
            transition: color 0.2s, border-color 0.2s;
        }
        .seo-term-link:hover {
            color: var(--color-accent-magenta);
            border-bottom-color: var(--color-accent-magenta);
        }
        .seo-term-tooltip {
            position: absolute;
            z-index: 1000;
            background: var(--color-white);
            border: 1px solid var(--color-border);
            border-radius: var(--border-radius-lg);
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
            padding: 16px 20px;
            max-width: 360px;
            min-width: 280px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(8px);
            transition: opacity 0.25s ease, visibility 0.25s ease, transform 0.25s ease;
            pointer-events: none;
            font-size: 0.9rem;
            line-height: 1.5;
        }
        .seo-term-tooltip.visible {
            opacity: 1; visibility: visible; transform: translateY(0); pointer-events: auto;
        }
        .seo-term-tooltip-header {
            display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;
        }
        .seo-term-tooltip-title {
            font-family: var(--font-family-heading); font-weight: 700; font-size: 1rem; color: var(--color-slate-900); margin: 0;
        }
        .seo-term-tooltip-category {
            font-size: 0.7rem; background: var(--color-primary-base); color: var(--color-white); padding: 2px 8px; border-radius: 12px; white-space: nowrap; flex-shrink: 0; margin-left: 8px;
        }
        .seo-term-tooltip-def {
            color: var(--color-slate-500); margin: 0 0 10px; font-size: 0.85rem;
        }
        .seo-term-tooltip-links {
            display: flex; gap: 8px; flex-wrap: wrap;
        }
        .seo-term-tooltip-links a {
            font-size: 0.8rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; text-decoration: none; transition: background 0.2s;
        }
        .seo-term-tooltip-links .tt-read-more {
            background: var(--color-primary-base); color: var(--color-white);
        }
        .seo-term-tooltip-links .tt-read-more:hover {
            background: #185a8d; color: var(--color-white);
        }
        .seo-term-tooltip-links .tt-glossary {
            background: var(--color-light); color: var(--color-primary-base); border: 1px solid var(--color-border);
        }
        .seo-term-tooltip-links .tt-glossary:hover {
            background: var(--color-primary-base); color: var(--color-white);
        }

        /* --- Article Sidebar Card --- */
        .article-sidebar { position: sticky; top: 24px; }
        .sidebar-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--border-radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
        .sidebar-card-image { width: 100%; height: 180px; object-fit: cover; }
        .sidebar-card-body { padding: 20px; }
        .sidebar-card-category { display: inline-block; background: var(--color-primary-base); color: var(--color-white); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 999px; margin-bottom: 10px; }
        .sidebar-card-title { font-family: var(--font-family-heading); font-size: 1.1rem; font-weight: 700; color: var(--color-slate-900); line-height: 1.3; margin-bottom: 8px; }
        .sidebar-card-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 0.75rem; color: var(--color-slate-500); margin-bottom: 12px; }
        .sidebar-card-meta span { display: flex; align-items: center; gap: 4px; }
        .sidebar-card-meta i { color: var(--color-primary-base); font-size: 0.7rem; }
        .sidebar-card-desc { font-size: 0.85rem; color: var(--color-slate-500); line-height: 1.6; margin-bottom: 16px; }
        .sidebar-section { border-top: 1px solid var(--color-border); padding-top: 14px; margin-top: 14px; }
        .sidebar-section-title { font-family: var(--font-family-heading); font-size: 0.8rem; font-weight: 700; color: var(--color-slate-900); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .sidebar-section ul { list-style: none; padding: 0; margin: 0; }
        .sidebar-section ul li { font-size: 0.82rem; color: var(--color-slate-800); padding: 3px 0 3px 16px; position: relative; line-height: 1.5; }
        .sidebar-section ul li::before { content: ''; position: absolute; left: 0; top: 10px; width: 6px; height: 6px; border-radius: 50%; background: var(--color-primary-base); }
        .sidebar-key-point { margin-bottom: 8px; }
        .sidebar-key-point-title { font-weight: 700; font-size: 0.82rem; color: var(--color-slate-900); }
        .sidebar-key-point-desc { font-size: 0.8rem; color: var(--color-slate-500); line-height: 1.5; }
        .sidebar-sources-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .sidebar-source-badge { font-size: 0.7rem; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: #f0f4f8; color: var(--color-slate-800); text-decoration: none; transition: background 0.2s; }
        .sidebar-source-badge:hover { background: var(--color-primary-base); color: var(--color-white); }
        .sidebar-read-bar { border-top: 1px solid var(--color-border); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #f8fafc; }
        .sidebar-read-stats { display: flex; gap: 14px; font-size: 0.72rem; color: var(--color-slate-500); }
        .sidebar-read-stats span { display: flex; align-items: center; gap: 4px; }
        .sidebar-read-stats i { color: var(--color-primary-base); font-size: 0.7rem; }
        .sidebar-cta-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--color-accent-magenta); color: var(--color-white); font-size: 0.78rem; font-weight: 600; padding: 8px 16px; border-radius: 6px; text-decoration: none; transition: background 0.2s; white-space: nowrap; }
        .sidebar-cta-btn:hover { background: #b8236f; color: var(--color-white); }

        @media (max-width: 960px) {
            .article-layout { grid-template-columns: 1fr; }
            .article-sidebar { position: static; order: -1; }
        }

        @media (max-width: 768px) {
            .container {
                width: 95%;
                padding: var(--spacing-xl) 0;
            }

            h1 {
                font-size: 2rem;
            }

            .article-content {
                font-size: 1rem;
            }

            .seo-term-tooltip {
                max-width: 300px; min-width: 240px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="../resources/articles/" class="back-link">
            <i class="fas fa-arrow-left"></i> Back to All Articles
        </a>

        <div class="article-layout">
        <article>
            <header class="article-header">
                <h1>${escapeHtml(article.title)}</h1>

                <div class="article-meta">
                    <span><i class="fas fa-calendar"></i> <time datetime="${formatSchemaDate(article.created_at)}">${publishedDate}</time></span>
                    ${updatedDate ? `<span><i class="fas fa-clock"></i> Updated: <time datetime="${formatSchemaDate(article.updated_at)}">${updatedDate}</time></span>` : ''}
                    <span><i class="fas fa-book-open"></i> ${readingTime} min read</span>
                </div>

                ${article.categories && article.categories.length > 0 ? `
                <div class="article-categories">
                    ${article.categories.map(cat => `<span class="category-pill">${escapeHtml(cat)}</span>`).join('')}
                </div>
                ` : ''}
            </header>

            ${generateAudioWidgetHTML(article)}

            ${article.featured_image_url ? `
            <img src="${article.featured_image_url}" alt="${escapeHtml(article.title)}" class="featured-image" onerror="this.style.display='none'">
            ` : ''}

            <div class="article-content">
                ${highlightTermsInHTML(article.full_article_content || article.content || '<p>Content not available.</p>', seoTermsCache)}
            </div>

            <div class="share-buttons">
                <a href="#" class="share-btn share-x" data-platform="x" title="Share on X (Twitter)">
                    <i class="fab fa-twitter"></i>
                </a>
                <a href="#" class="share-btn share-linkedin" data-platform="linkedin" title="Share on LinkedIn">
                    <i class="fab fa-linkedin-in"></i>
                </a>
                <a href="#" class="share-btn share-facebook" data-platform="facebook" title="Share on Facebook">
                    <i class="fab fa-facebook-f"></i>
                </a>
                <a href="#" class="share-btn share-whatsapp" data-platform="whatsapp" title="Share on WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </a>
                <a href="#" class="share-btn share-copy" data-platform="copy" title="Copy Link">
                    <i class="fas fa-link"></i>
                </a>
            </div>
        </article>
        ${sidebarHTML}
        </div>
    </div>

    <!-- Back to Top Button -->
    <a href="#" class="back-to-top" id="back-to-top">
        <i class="fas fa-chevron-up"></i>
    </a>

    <script>
        // Article data for sharing (uses social preview metadata from CMS)
        const ARTICLE_URL = '${canonicalUrl}';
        const ARTICLE_TITLE = ${JSON.stringify(social.ogTitle)};
        const ARTICLE_DESCRIPTION = ${JSON.stringify(social.ogDescription)};
        const ARTICLE_IMAGE = '${social.ogImage}';
        const TWITTER_TITLE = ${JSON.stringify(social.twitterTitle)};
        const TWITTER_DESCRIPTION = ${JSON.stringify(social.twitterDescription)};

        // Share functions
        function sharePost(platform, title, url, description, imageUrl) {
            let shareUrl = '';
            const encodedTitle = encodeURIComponent(title);
            const encodedUrl = encodeURIComponent(url);
            const encodedDescription = encodeURIComponent(description || title);
            const shareText = title + (description ? ' - ' + description : '');
            const encodedShareText = encodeURIComponent(shareText);

            switch (platform) {
                case 'x':
                    shareUrl = 'https://twitter.com/intent/tweet?text=' + encodedShareText + '&url=' + encodedUrl;
                    break;
                case 'linkedin':
                    shareUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodedUrl;
                    break;
                case 'facebook':
                    shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl;
                    break;
                case 'whatsapp':
                    shareUrl = 'https://api.whatsapp.com/send?text=' + encodedShareText + '%20' + encodedUrl;
                    break;
                case 'copy':
                    copyLink(url);
                    return;
            }

            if (shareUrl) {
                window.open(shareUrl, '_blank', 'width=600,height=400');
            }
        }

        function copyLink(url) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(function() {
                    alert('Link copied to clipboard!');
                }).catch(function(err) {
                    fallbackCopyLink(url);
                });
            } else {
                fallbackCopyLink(url);
            }
        }

        function fallbackCopyLink(url) {
            const tempInput = document.createElement('input');
            tempInput.value = url;
            document.body.appendChild(tempInput);
            tempInput.select();
            try {
                document.execCommand('copy');
                alert('Link copied to clipboard!');
            } catch (err) {
                alert('Failed to copy link. Please copy it manually: ' + url);
            }
            document.body.removeChild(tempInput);
        }

        // Initialize share buttons with platform-specific social metadata
        document.addEventListener('DOMContentLoaded', function() {
            const shareButtons = document.querySelectorAll('.share-btn');
            shareButtons.forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const platform = btn.dataset.platform;
                    if (platform === 'x') {
                        // Use Twitter-specific title/desc
                        sharePost(platform, TWITTER_TITLE, ARTICLE_URL, TWITTER_DESCRIPTION, ARTICLE_IMAGE);
                    } else {
                        sharePost(platform, ARTICLE_TITLE, ARTICLE_URL, ARTICLE_DESCRIPTION, ARTICLE_IMAGE);
                    }
                });
            });
        });

        // Back to top button
        function initBackToTop() {
            const backToTopButton = document.querySelector('.back-to-top');

            const handleScroll = function() {
                const shouldShow = window.scrollY > 300;
                if (backToTopButton) {
                    if (shouldShow) {
                        backToTopButton.classList.add('show');
                    } else {
                        backToTopButton.classList.remove('show');
                    }
                }
            };

            window.addEventListener('scroll', handleScroll);

            if (backToTopButton) {
                backToTopButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            }

            handleScroll();
        }

        // SEO Term Tooltip Interaction
        var activeTooltip = null;
        function showTermTooltip(el) {
            closeTooltip();
            var t = document.createElement('div');
            t.className = 'seo-term-tooltip';
            t.setAttribute('role', 'dialog');
            var hdr = document.createElement('div');
            hdr.className = 'seo-term-tooltip-header';
            var title = document.createElement('span');
            title.className = 'seo-term-tooltip-title';
            title.textContent = el.textContent;
            hdr.appendChild(title);
            var cat = el.getAttribute('data-category');
            if (cat) { var catEl = document.createElement('span'); catEl.className = 'seo-term-tooltip-category'; catEl.textContent = cat; hdr.appendChild(catEl); }
            t.appendChild(hdr);
            var def = document.createElement('p');
            def.className = 'seo-term-tooltip-def';
            def.textContent = el.getAttribute('data-def') || '';
            t.appendChild(def);
            var links = document.createElement('div');
            links.className = 'seo-term-tooltip-links';
            var artLink = el.getAttribute('data-article-link');
            if (artLink) { var a = document.createElement('a'); a.href = artLink; a.className = 'tt-read-more'; a.target = '_blank'; a.textContent = 'Read Article'; links.appendChild(a); }
            var glLink = el.getAttribute('data-glossary-link');
            if (glLink) { var g = document.createElement('a'); g.href = glLink; g.className = 'tt-glossary'; g.target = '_blank'; g.textContent = 'Glossary'; links.appendChild(g); }
            if (links.children.length > 0) t.appendChild(links);
            document.body.appendChild(t);
            activeTooltip = t;
            var r = el.getBoundingClientRect();
            var tr = t.getBoundingClientRect();
            var top = r.bottom + window.scrollY + 8;
            var left = r.left + window.scrollX + (r.width / 2) - (tr.width / 2);
            if (left < 8) left = 8;
            if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
            t.style.position = 'absolute';
            t.style.top = top + 'px';
            t.style.left = left + 'px';
            requestAnimationFrame(function() { t.classList.add('visible'); });
        }
        function closeTooltip() {
            if (activeTooltip) { activeTooltip.classList.remove('visible'); var ref = activeTooltip; setTimeout(function() { if (ref.parentNode) ref.parentNode.removeChild(ref); }, 250); activeTooltip = null; }
        }
        document.addEventListener('click', function(e) {
            var link = e.target.closest('.seo-term-link');
            if (link) { e.preventDefault(); e.stopPropagation(); showTermTooltip(link); return; }
            if (activeTooltip && !e.target.closest('.seo-term-tooltip')) closeTooltip();
        });
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeTooltip(); });

        document.addEventListener('DOMContentLoaded', initBackToTop);
    </script>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate a single article
 */
async function generateArticle(article) {
  console.log(`\n📝 Generating: ${article.title}`);
  console.log(`   Slug: ${article.slug}`);

  const html = generateArticleHTML(article);
  const filename = `${article.slug}.html`;
  const filepath = path.join(OUTPUT_DIR, filename);

  fs.writeFileSync(filepath, html, 'utf8');
  console.log(`   ✅ Created: ${filepath}`);

  return filepath;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🚀 Static SEO Article Generator\n');
  console.log(`📂 Output directory: ${OUTPUT_DIR}\n`);

  try {
    // Fetch SEO terms for article content highlighting
    seoTermsCache = await fetchSeoTerms();

    if (targetSlug) {
      // Generate single article by slug
      console.log(`🔍 Fetching article: ${targetSlug}`);
      const article = await fetchData(`${API_BASE_URL}/articles/${targetSlug}`);
      await generateArticle(article);
      console.log('\n✅ Successfully generated 1 article!');
    } else if (generateAll) {
      // Generate all published articles
      console.log('🔍 Fetching all published articles...');
      const articles = await fetchData(`${API_BASE_URL}/articles`);

      if (articles.length === 0) {
        console.log('⚠️  No published articles found.');
        return;
      }

      console.log(`📚 Found ${articles.length} published articles\n`);

      for (const article of articles) {
        await generateArticle(article);
      }

      console.log(`\n✅ Successfully generated ${articles.length} articles!`);
    } else {
      console.log('Usage:');
      console.log('  node generate-seo-articles.js --all                    # Generate all articles');
      console.log('  node generate-seo-articles.js --slug=article-slug      # Generate single article');
      console.log('\nExamples:');
      console.log('  node generate-seo-articles.js --all');
      console.log('  node generate-seo-articles.js --slug=ai-in-southeast-asia-market-opportunities-and-business-transformation-in-2026');
      process.exit(1);
    }

    console.log('\n📍 Generated files location:');
    console.log(`   ${OUTPUT_DIR}/`);
    console.log('\n🌐 Next steps:');
    console.log('   1. Test generated HTML files in a browser');
    console.log('   2. Verify Schema.org markup: https://search.google.com/test/rich-results');
    console.log('   3. Deploy to your hosting');
    console.log('   4. Submit to Google Search Console\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
