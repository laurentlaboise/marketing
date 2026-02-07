# jsDelivr CDN Setup Guide for wordsthatsells.website

## Overview

This guide covers serving images from the `laurentlaboise/marketing` GitHub repository
through jsDelivr CDN, optimized for both traditional search engines (Google, Bing) and
AI-powered search engines (ChatGPT, Perplexity, SearchGPT).

**Base CDN URL:**
```
https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/
```

---

## 1. Repository Image Directory Structure

```
marketing/
├── images/
│   ├── hero/                    # Above-the-fold hero images
│   │   └── ai-digital-marketing-thailand-laos-southeast-asia.webp
│   ├── portfolio/               # Service portfolio showcase images
│   │   ├── financial-consultancy-business.webp
│   │   ├── brand-identity-tech-startup.webp
│   │   ├── membership-sales-fitness-studio.webp
│   │   └── ...
│   ├── logos/                   # Brand logos (all formats)
│   │   ├── wts-logo-full-colour-1080x1080.png
│   │   ├── wts-logo-full-colour-1080x1080.jpg
│   │   ├── wts-logo-full-colour.svg
│   │   ├── wts-logo-with-words-full-colour-900x900.png
│   │   ├── wts-logo-with-words-white-colour.svg
│   │   └── ...
│   ├── articles/                # Blog article featured images
│   │   └── {article-slug}.webp
│   ├── og/                      # Open Graph / social sharing images
│   │   └── og-default.jpg
│   └── icons/                   # UI and service icons
│       └── ...
```

### File Naming Conventions

Use lowercase, hyphen-separated, descriptive filenames:

| Bad | Good |
|-----|------|
| `Brand Identity  For a Tech Start-up.svg` | `brand-identity-tech-startup.webp` |
| `AIDigitalMarketingthailandlaossoutheastasia.webp` | `ai-digital-marketing-thailand-laos-southeast-asia.webp` |
| `Content & Socials For a Artisan Bakery.svg` | `content-socials-artisan-bakery.webp` |

**Rules:**
- All lowercase
- Hyphens instead of spaces or underscores
- No special characters (`&`, `(`, `)`, etc.)
- Include descriptive keywords (helps search engines)
- Prefer `.webp` for raster images (smaller, faster)
- Keep `.svg` only where vector scaling is required

---

## 2. jsDelivr URL Format

### Basic URL Structure

```
https://cdn.jsdelivr.net/gh/{user}/{repo}@{version}/{file}
```

### URL Examples for wordsthatsells.website

**Pinned to `main` branch (recommended for production):**
```
https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp
```

**Pinned to a specific tag (versioned releases):**
```
https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@v1.0.0/images/logos/wts-logo-full-colour-1080x1080.png
```

**Pinned to a specific commit (immutable, best for caching):**
```
https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@81e625c/images/portfolio/financial-consultancy-business.webp
```

**Latest (no version - NOT recommended, caching delays):**
```
https://cdn.jsdelivr.net/gh/laurentlaboise/marketing/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp
```

### Current Images Mapped to CDN URLs

| Current URL | jsDelivr CDN URL |
|---|---|
| `/images/AIDigitalMarketingthailandlaossoutheastasia.webp` | `https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp` |
| `/images/Financial%20Consultancy%20Business.svg` | `https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/portfolio/financial-consultancy-business.webp` |
| `/images/SEO_AI_Digital_Marketing_Agency_Laos_Thailand_Asia_logo_with-words_white_colour_SVG.svg` | `https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/logos/wts-logo-with-words-white-colour.svg` |

---

## 3. HTML Image Implementation with Full SEO

### Hero Image (Above the Fold)

```html
<!-- Preconnect to jsDelivr for faster first-load -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">

<!-- Preload hero image for LCP optimization -->
<link rel="preload"
      fetchpriority="high"
      as="image"
      type="image/webp"
      href="https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp">

<!-- Hero image tag -->
<img
    src="https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp"
    alt="AI-powered digital marketing team collaborating on SEO strategy for businesses in Thailand, Laos, and Southeast Asia"
    title="AI Digital Marketing Services - SEO and Business Automation in Southeast Asia"
    width="2070"
    height="1380"
    fetchpriority="high"
    decoding="async"
    onerror="this.onerror=null;this.src='https://placehold.co/2070x1380/122a3f/ffffff?text=Hero+Image';">
```

### Lazy-Loaded Portfolio Images

```html
<img
    src="https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/portfolio/financial-consultancy-business.webp"
    alt="Financial consultancy digital marketing campaign showing business charts and ROI analytics for authority building strategy"
    title="Authority Building Campaign - Financial Consultancy Digital Marketing"
    width="2070"
    height="1380"
    loading="lazy"
    decoding="async"
    onerror="this.onerror=null;this.src='https://placehold.co/2070x1380/eeeeee/333333?text=Financial+Consultancy';">
```

### Logo in Footer

```html
<img
    src="https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/logos/wts-logo-with-words-white-colour.svg"
    alt="WordsThatSells.website - AI Digital Marketing Agency in Laos"
    title="WordsThatSells.website Logo"
    class="footer-logo"
    width="200"
    height="50"
    loading="lazy"
    decoding="async">
```

---

## 4. AI Search Engine Optimization

### Schema.org ImageObject Markup

Add this to each page's `<script type="application/ld+json">` block within the `@graph` array:

```json
{
  "@type": "ImageObject",
  "contentUrl": "https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp",
  "url": "https://wordsthatsells.website/en",
  "name": "AI Digital Marketing Services in Southeast Asia",
  "description": "Professional AI-powered digital marketing team providing SEO, content creation, and business automation services for SMEs in Laos, Thailand, and Southeast Asia",
  "width": 2070,
  "height": 1380,
  "encodingFormat": "image/webp",
  "creator": {
    "@type": "Organization",
    "name": "WordsThatSells.website",
    "url": "https://wordsthatsells.website"
  },
  "copyrightHolder": {
    "@type": "Organization",
    "name": "WordsThatSells.website"
  },
  "license": "https://wordsthatsells.website/en/company/legal/"
}
```

### Contextual Metadata for AI Crawlers

AI search engines extract meaning from surrounding context. Wrap images with semantic HTML:

```html
<figure itemscope itemtype="https://schema.org/ImageObject">
    <img
        itemprop="contentUrl"
        src="https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/portfolio/brand-identity-tech-startup.webp"
        alt="Complete brand identity package for a tech startup including logo, color palette, and marketing collateral"
        title="Brand Identity Design - Tech Startup Marketing Campaign"
        width="2071"
        height="1381"
        loading="lazy"
        decoding="async">
    <figcaption itemprop="description">
        Brand identity design for a tech startup: logo, color palette,
        and marketing collateral created by WordsThatSells AI marketing agency.
    </figcaption>
    <meta itemprop="name" content="Tech Startup Brand Identity Campaign">
    <meta itemprop="width" content="2071">
    <meta itemprop="height" content="1381">
</figure>
```

### robots.txt Additions

Ensure AI crawlers can access your CDN-served images:

```
# Allow AI search engine crawlers
User-agent: GPTBot
Allow: /images/
Allow: /en/

User-agent: ChatGPT-User
Allow: /images/
Allow: /en/

User-agent: PerplexityBot
Allow: /images/
Allow: /en/

User-agent: Googlebot-Image
Allow: /images/

User-agent: *
Allow: /
```

---

## 5. Caching and Versioning Strategy

### jsDelivr Cache Behavior

| URL Pattern | Cache Duration | Use Case |
|---|---|---|
| `@main` (branch) | ~24 hours (CDN-controlled) | Production, updated regularly |
| `@v1.0.0` (tag) | Permanent (immutable) | Stable releases |
| `@abc1234` (commit) | Permanent (immutable) | Maximum cache reliability |
| No version | ~24 hours | Development only, NOT recommended |

### Recommended Workflow

1. **Development:** Use `@main` for quick iteration
2. **Staging:** Use `@main` to test CDN delivery
3. **Production:** Use git tags for immutable, permanently cached URLs

```bash
# Tag a release when images are finalized
git tag -a v1.0.0 -m "Initial image assets for CDN"
git push origin v1.0.0
```

Then use:
```
https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@v1.0.0/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp
```

### Purging the jsDelivr Cache

If you update an image on `@main` and need it live immediately:

```
https://purge.jsdelivr.net/gh/laurentlaboise/marketing@main/images/hero/ai-digital-marketing-thailand-laos-southeast-asia.webp
```

Visit this URL in a browser or `curl` it to purge the cached version.

---

## 6. Testing and Validation

### Step 1: Verify CDN URL resolves

```bash
curl -I "https://cdn.jsdelivr.net/gh/laurentlaboise/marketing@main/images/AIDigitalMarketingthailandlaossoutheastasia.webp"
```

Expected: `HTTP/2 200` with `content-type: image/webp`

### Step 2: Check response headers

Look for:
- `access-control-allow-origin: *` (CORS enabled)
- `cache-control: public, max-age=...`
- `content-type` matches the image format

### Step 3: Validate page SEO

- **Google Rich Results Test:** https://search.google.com/test/rich-results
- **Schema.org Validator:** https://validator.schema.org/
- **PageSpeed Insights:** https://pagespeed.web.dev/ (check LCP with CDN images)

### Step 4: Validate AI discoverability

- Test with ChatGPT: Ask "What services does wordsthatsells.website offer?"
- Test with Perplexity: Search "wordsthatsells.website digital marketing Laos"
- Check that structured data is parseable by feeding the page URL to AI tools

### Step 5: Performance comparison

Compare load times before/after CDN migration:
- Use Chrome DevTools Network tab
- Compare TTFB (Time to First Byte) for images
- Check Core Web Vitals (LCP should improve significantly)

---

## 7. Migration Checklist

- [ ] Rename image files to use SEO-friendly, lowercase, hyphenated names
- [ ] Organize images into subdirectories (`hero/`, `portfolio/`, `logos/`, `articles/`)
- [ ] Convert large SVGs to WebP where vector scaling is not needed
- [ ] Update all `<img src>` tags to use jsDelivr CDN URLs
- [ ] Add `<link rel="preconnect" href="https://cdn.jsdelivr.net">` to `<head>`
- [ ] Preload above-the-fold hero images
- [ ] Add `loading="lazy"` to all below-the-fold images
- [ ] Add `width` and `height` attributes to prevent layout shifts
- [ ] Write descriptive `alt` text with relevant keywords
- [ ] Add Schema.org `ImageObject` structured data
- [ ] Update Open Graph and Twitter Card `image` meta tags to use CDN URLs
- [ ] Update `robots.txt` to allow AI crawler access
- [ ] Tag a git release for immutable CDN caching
- [ ] Purge jsDelivr cache after initial migration
- [ ] Test with PageSpeed Insights and Rich Results Test
