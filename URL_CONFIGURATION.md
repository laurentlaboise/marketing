# Clean URL Configuration Guide

This document explains how clean article URLs work across different hosting platforms.

## URL Format

**Clean URLs:** `https://wordsthatsells.website/en/articles/article-slug`

No query parameters like `?slug=article-slug` - just clean, SEO-friendly paths.

---

## How It Works

When a user visits `/en/articles/article-slug`, the server needs to:
1. Serve the file `/en/articles/index.html`
2. Keep the URL as `/en/articles/article-slug` in the browser
3. Let JavaScript read the slug from the pathname

This is called a **"rewrite"** (not a redirect).

---

## Platform-Specific Configuration

### ✅ Netlify
**Files:** `_redirects` and `netlify.toml`

Netlify automatically reads these files and applies the rewrite rules.

**How to verify:**
- Deploy to Netlify
- Visit `/en/articles/test-slug`
- Should load the article page without 404

---

### ✅ Vercel
**File:** `vercel.json`

Vercel uses `vercel.json` for rewrite configuration.

**How to verify:**
- Deploy to Vercel
- Visit `/en/articles/test-slug`
- Should load the article page without 404

---

### ✅ Apache/cPanel
**File:** `.htaccess`

Most shared hosting providers (like Bluehost, GoDaddy, HostGator) use Apache.

**How to verify:**
1. Upload `.htaccess` to your root directory
2. Make sure `mod_rewrite` is enabled (ask hosting support)
3. Visit `/en/articles/test-slug`
4. Should load the article page

**Troubleshooting:**
- If 500 error: Contact hosting support to enable `mod_rewrite`
- If 404 still shows: Check file permissions on `.htaccess` (should be 644)

---

### ✅ GitHub Pages
**Files:** `404.html` and `_config.yml`

GitHub Pages doesn't support traditional rewrites, so we use a custom 404 page.

**How it works:**
1. User visits `/en/articles/article-slug`
2. GitHub Pages shows `404.html` (but URL stays the same)
3. Our custom `404.html` detects it's an article URL
4. Loads `/en/articles/index.html` via JavaScript
5. Keeps the clean URL visible

**How to verify:**
- Deploy to GitHub Pages
- Visit `/en/articles/test-slug`
- Should load after brief "Loading..." message

---

### ✅ Other Platforms / Fallback
**File:** `404.html`

Even if your hosting platform doesn't support rewrites, the `404.html` fallback will work.

**How it works:**
- Any hosting platform serves `404.html` when a page isn't found
- Our custom `404.html` handles article URLs automatically
- Uses `fetch()` and `history.replaceState()` to keep clean URL

---

## Testing After Deployment

1. **Create a test article** in admin panel with any title
2. **Note the slug** (e.g., "my-test-article")
3. **Visit the URL:** `https://yourdomain.com/en/articles/my-test-article`
4. **Expected result:** Article loads without 404

---

## Troubleshooting

### Still seeing 404 errors?

**Check 1: Files are deployed**
```bash
# Make sure these files exist on your server:
- _redirects
- netlify.toml (Netlify)
- vercel.json (Vercel)
- .htaccess (Apache)
- 404.html (All platforms)
```

**Check 2: Clear browser cache**
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Or open in incognito/private mode

**Check 3: Platform-specific issues**

**Netlify:**
- Check Build & Deploy settings
- Make sure `_redirects` is in the published directory

**Vercel:**
- Check Vercel dashboard → Deployments → Build logs
- Make sure `vercel.json` is recognized

**Apache/cPanel:**
- Contact hosting support to enable `mod_rewrite`
- Check `.htaccess` file permissions (644)

**GitHub Pages:**
- Make sure `404.html` is deployed
- Check browser console for JavaScript errors

**Check 4: Test the article page directly**
Visit: `https://yourdomain.com/en/articles/index.html`
If this works, the issue is with URL rewrites.

---

## Which Platform Are You Using?

If you're still having issues, identify your hosting platform:

- **Netlify** → Use `_redirects`
- **Vercel** → Use `vercel.json`
- **Apache/cPanel** → Use `.htaccess`
- **GitHub Pages** → Use `404.html`
- **Nginx** → Need custom nginx configuration (contact hosting support)
- **Unknown** → The `404.html` fallback should work on any platform

---

## Custom Nginx Configuration

If you're using Nginx, add this to your site configuration:

```nginx
location /en/articles/ {
    try_files $uri $uri/ /en/articles/index.html;
}
```

Then reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## SEO Benefits

Clean URLs like `/en/articles/article-slug` provide:
- ✅ Better search engine rankings
- ✅ More memorable URLs
- ✅ Professional appearance
- ✅ Better social media sharing
- ✅ Improved click-through rates

---

## Need Help?

1. Check which hosting platform you're using
2. Verify the correct configuration file is deployed
3. Test the URL: `/en/articles/test-article`
4. Check browser console for JavaScript errors
5. Contact your hosting support if needed

The `404.html` fallback works on 99% of hosting platforms as a last resort!
