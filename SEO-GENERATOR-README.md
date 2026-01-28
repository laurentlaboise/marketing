# Static SEO Article Generator

## 🎯 Purpose

This generator creates static HTML files for your blog articles with complete SEO optimization:

- ✅ **Schema.org JSON-LD markup** - Google recognizes pages as Articles
- ✅ **Semantic HTML5** - `<article>`, `<time datetime="">`, proper heading structure
- ✅ **All meta tags** - Open Graph (Facebook/LinkedIn), Twitter Cards
- ✅ **Full content in initial HTML** - No JavaScript rendering delays
- ✅ **Breadcrumb structured data** - Helps Google understand site hierarchy
- ✅ **Social sharing buttons** - X, LinkedIn, Facebook, WhatsApp, Copy Link
- ✅ **Back to top button** - Matching your site's style

## 📁 Files

- **`generate-seo-articles.js`** - Main generator script
- **`en/articles/example-article.html`** - Example output showing all SEO features
- **`SEO-GENERATOR-README.md`** - This file

## 🚀 Quick Start

### 1. Generate All Articles

```bash
node generate-seo-articles.js --all
```

This will:
- Fetch all published articles from your Railway API
- Generate one `.html` file per article in `/en/articles/`
- Include all SEO optimizations

### 2. Generate Single Article

```bash
node generate-seo-articles.js --slug=your-article-slug
```

Example:
```bash
node generate-seo-articles.js --slug=ai-in-southeast-asia-market-opportunities-and-business-transformation-in-2026
```

### 3. View Example Output

Open `/en/articles/example-article.html` in your browser to see what the generated pages look like.

## 📊 What Gets Generated

Each article HTML file includes:

### In `<head>`:
```html
<!-- Page title -->
<title>Article Title | WordsThatSells.Website</title>

<!-- SEO meta tags -->
<meta name="description" content="...">
<link rel="canonical" href="...">

<!-- Open Graph (Facebook, LinkedIn) -->
<meta property="og:type" content="article">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="...">
<meta property="article:published_time" content="...">
<meta property="article:tag" content="...">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="...">

<!-- Schema.org JSON-LD for Article -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "...",
  "datePublished": "...",
  "author": {...},
  "publisher": {...}
}
</script>

<!-- Schema.org JSON-LD for Breadcrumbs -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  ...
}
</script>
```

### In `<body>`:
```html
<article>
  <header>
    <h1>Article Title</h1>
    <div class="article-meta">
      <time datetime="2026-01-26">January 26, 2026</time>
      <span>19 min read</span>
    </div>
    <div class="article-categories">
      <span>AI</span>
      <span>Marketing</span>
    </div>
  </header>

  <img src="..." alt="..." class="featured-image">

  <div class="article-content">
    <!-- Full article content from database -->
  </div>

  <div class="share-buttons">
    <!-- Social sharing buttons -->
  </div>
</article>
```

## 🔄 Workflow

### Initial Setup (One Time)
1. Run `node generate-seo-articles.js --all`
2. Upload generated HTML files to your hosting
3. Test one article URL in Google's Rich Results Test
4. Submit sitemap to Google Search Console

### When Adding New Articles
1. Create article in admin panel
2. Run `node generate-seo-articles.js --slug=new-article-slug`
3. Upload the new HTML file
4. OR: Run `--all` to regenerate everything

### When Updating Existing Articles
1. Update article in admin panel
2. Run `node generate-seo-articles.js --slug=updated-article-slug`
3. Re-upload the updated HTML file

## 🧪 Testing SEO

### Test Schema Markup:
1. Visit: https://search.google.com/test/rich-results
2. Enter your article URL
3. Verify "Article" is detected

### Test Open Graph:
1. Visit: https://www.opengraph.xyz/
2. Enter your article URL
3. Check preview looks good

### View Source:
Right-click on generated HTML page → "View Page Source"
- You should see complete article content in the initial HTML
- No loading spinners, no empty divs
- All meta tags present

## 📂 File Structure

```
marketing/
├── generate-seo-articles.js          # Generator script
├── SEO-GENERATOR-README.md           # This file
├── en/
│   ├── articles/
│   │   ├── index.html                # Dynamic version (for API testing)
│   │   ├── example-article.html      # Example SEO output
│   │   ├── article-slug-1.html       # Generated SEO page
│   │   ├── article-slug-2.html       # Generated SEO page
│   │   └── ...                       # More generated pages
│   └── resources/
│       └── articles/
│           └── index.html            # Listing page (update links here)
```

## 🔗 Update Listing Page

After generating static files, update `/en/resources/articles/index.html` to link to them:

### Find this line (~1228):
```javascript
slideInReadMore.href = postData.read_more_link;
```

### Change to:
```javascript
slideInReadMore.href = `${SITE_BASE_URL}/en/articles/${postData.slug}.html`;
```

This makes the "Read Full Article" button point to your SEO-optimized static pages.

## 🌐 URL Structure

```
User Experience:
https://wordsthatsells.website/en/resources/articles/
  └─ Interactive listing page (users browse here)
  └─ Click article → Modal preview
  └─ Click "Read Full Article" → Opens static SEO page

SEO/Google:
https://wordsthatsells.website/en/articles/article-slug.html
  └─ Static SEO-optimized HTML
  └─ Full content in initial HTML
  └─ All Schema.org markup
  └─ Canonical URL points to itself
```

## ⚡ Automation Options

### Option A: Manual (Simple)
- Run generator script when you add/update articles
- Upload new HTML files manually

### Option B: GitHub Actions (Automated)
Create `.github/workflows/generate-articles.yml`:
```yaml
name: Generate SEO Articles
on:
  workflow_dispatch:  # Manual trigger

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: node generate-seo-articles.js --all
      - run: git add en/articles/*.html
      - run: git commit -m "Update SEO articles"
      - run: git push
```

### Option C: Railway Cron (Scheduled)
Add to `railway.toml`:
```toml
[[services]]
  name = "article-generator"
  cron = "0 * * * *"  # Every hour
  command = "node generate-seo-articles.js --all"
```

## 📈 Expected SEO Impact

### Week 1-2:
- Google discovers and crawls new static pages
- Rich snippets may appear in Search Console
- Pages begin indexing

### Week 3-4:
- Articles start appearing in search results
- Keywords begin ranking
- Traffic from organic search increases

### Month 2-3:
- Full SEO benefits realized
- Article-specific features (news, authorship) may activate
- Improved rankings for target keywords

## 🐛 Troubleshooting

### "Network error" when running generator
**Solution**: The Railway API may be temporarily unavailable. Try again in a few minutes.

### Generated HTML looks wrong
**Solution**: Check that your Railway API returns `full_article_content` field. The generator uses this for the complete article content.

### Google not indexing pages
**Solution**:
1. Check robots.txt doesn't block `/en/articles/`
2. Submit sitemap to Google Search Console
3. Use "Request Indexing" in Search Console
4. Verify Schema.org markup with Rich Results Test

### Share buttons not working
**Solution**: Share buttons use JavaScript - make sure you're testing on a web server (not file://). Open the HTML via http://localhost or your live site.

## 📞 Questions?

The generator is ready to use! Run it whenever you need to create or update SEO-optimized article pages.

**Next immediate step**: Run `node generate-seo-articles.js --all` to generate all your articles!
