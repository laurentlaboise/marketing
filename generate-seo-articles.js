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

const API_BASE_URL = 'https://marketing-production-a3ee.up.railway.app/api';
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

/**
 * Generate Schema.org JSON-LD for Article
 */
function generateSchemaMarkup(article) {
  const articleUrl = `${SITE_BASE_URL}/en/articles/${article.slug}.html`;
  const social = resolveSocialMeta(article);

  // Use custom schema markup from CMS if available
  if (social.schemaMarkup && typeof social.schemaMarkup === 'object') {
    return social.schemaMarkup;
  }

  // Collect all article images (featured/OG + article_images)
  const images = [];
  if (social.ogImage) images.push(social.ogImage);
  if (Array.isArray(article.article_images)) {
    article.article_images.forEach(img => {
      const url = img.cdn_url || img.url || '';
      if (url && !images.includes(url)) images.push(url);
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": social.ogDescription,
    "image": images,
    "datePublished": formatSchemaDate(article.published_at || article.created_at),
    "dateModified": formatSchemaDate(article.updated_at || article.created_at),
    "author": {
      "@type": "Organization",
      "name": "Words That Sells",
      "url": "https://wordsthatsells.website"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Words That Sells",
      "url": "https://wordsthatsells.website",
      "logo": {
        "@type": "ImageObject",
        "url": "https://wordsthatsells.website/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": articleUrl
    }
  };
}

/**
 * Generate breadcrumb Schema.org JSON-LD
 */
function generateBreadcrumbSchema(article) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://wordsthatsells.website"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Articles",
        "item": "https://wordsthatsells.website/en/resources/articles/"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": article.title,
        "item": `${SITE_BASE_URL}/en/articles/${article.slug}.html`
      }
    ]
  };
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
  const breadcrumbSchema = generateBreadcrumbSchema(article);

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

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
${JSON.stringify(schemaMarkup, null, 2)}
    </script>

    <!-- Breadcrumb Schema -->
    <script type="application/ld+json">
${JSON.stringify(breadcrumbSchema, null, 2)}
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
            max-width: 900px;
            margin: 0 auto;
            padding: var(--spacing-3xl) 0;
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
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="../resources/articles/" class="back-link">
            <i class="fas fa-arrow-left"></i> Back to All Articles
        </a>

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

            ${article.featured_image_url ? `
            <img src="${article.featured_image_url}" alt="${escapeHtml(article.title)}" class="featured-image" onerror="this.style.display='none'">
            ` : ''}

            <div class="article-content">
                ${article.full_article_content || article.content || '<p>Content not available.</p>'}
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
