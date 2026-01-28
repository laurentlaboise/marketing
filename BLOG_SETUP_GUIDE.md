# Blog CMS Setup Guide - WordsThatSells.Website

Complete step-by-step guide to set up and run your blog content management system.

## Overview

This blog CMS consists of three main components:

1. **Backend API** (`/blog-backend/`) - Node.js/Express server with PostgreSQL
2. **Admin Panel** (`/admin/blog-admin.html`) - Create and manage articles
3. **Dynamic Articles Page** (`/en/resources/articles/articles-dynamic.html`) - Display articles

## Quick Start (5 Minutes)

### Step 1: Set Up Database

```bash
# Install PostgreSQL (if not already installed)
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt-get install postgresql
sudo service postgresql start

# Windows - Download from postgresql.org

# Create database
psql -U postgres -c "CREATE DATABASE blog_cms;"

# Run schema
psql -U postgres -d blog_cms -f blog-backend/database/schema.sql
```

### Step 2: Configure Backend

```bash
cd blog-backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/blog_cms
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*
EOF

# Start server
npm run dev
```

You should see:
```
✅ Database connected successfully
🚀 Blog API running on http://localhost:5000
```

### Step 3: Update Frontend Configuration

**Edit `/admin/blog-admin.html`:**

Find line ~283 and update:
```javascript
const API_URL = 'http://localhost:5000/api';
```

**Edit `/en/resources/articles/articles-dynamic.html`:**

Find line ~425 and update:
```javascript
const API_URL = 'http://localhost:5000/api';
```

### Step 4: Test the System

1. **Open Admin Panel:** `http://localhost:3000/admin/blog-admin.html`
   (or use `python3 -m http.server 3000` to serve the frontend)

2. **Create Your First Article:**
   - Title: "Welcome to Our Blog"
   - Description: "This is our first article"
   - Content: "Hello world! This is our first blog post."
   - Categories: Select "Marketing"
   - Click "Publish Article"

3. **View Articles:** `http://localhost:3000/en/resources/articles/articles-dynamic.html`

## Detailed Setup Instructions

### 1. Prerequisites

#### Software Requirements

- **Node.js** (v14+): [Download](https://nodejs.org/)
- **PostgreSQL** (v12+): [Download](https://www.postgresql.org/download/)
- **Web Browser** (Chrome, Firefox, Safari, Edge)
- **Text Editor** (VS Code, Sublime Text, etc.)

#### Check Installations

```bash
# Check Node.js
node --version  # Should show v14.0.0 or higher

# Check npm
npm --version   # Should show 6.0.0 or higher

# Check PostgreSQL
psql --version  # Should show 12.0 or higher
```

### 2. Database Setup (PostgreSQL)

#### Option A: Command Line Setup

```bash
# Start PostgreSQL service
# macOS
brew services start postgresql

# Linux
sudo service postgresql start

# Windows - Use pgAdmin or Services

# Access PostgreSQL
psql -U postgres

# In psql prompt:
CREATE DATABASE blog_cms;
\c blog_cms
\i /path/to/blog-backend/database/schema.sql

# Verify
\dt  # Should show 'articles' table
SELECT COUNT(*) FROM articles;  # Should show 0 rows
```

#### Option B: GUI Setup (pgAdmin)

1. Open pgAdmin
2. Right-click "Databases" → Create → Database
3. Name: `blog_cms`
4. Click "Save"
5. Right-click `blog_cms` → Query Tool
6. Open `blog-backend/database/schema.sql`
7. Execute (F5)
8. Verify in Tables section

#### Option C: Using Docker

```bash
# Run PostgreSQL in Docker
docker run --name blog-postgres \
  -e POSTGRES_PASSWORD=mysecretpassword \
  -e POSTGRES_DB=blog_cms \
  -p 5432:5432 \
  -d postgres:14

# Wait 5 seconds for container to start
sleep 5

# Import schema
docker cp blog-backend/database/schema.sql blog-postgres:/schema.sql
docker exec blog-postgres psql -U postgres -d blog_cms -f /schema.sql
```

### 3. Backend API Setup

```bash
cd blog-backend

# Install all dependencies
npm install

# Dependencies installed:
# - express: Web framework
# - pg: PostgreSQL client
# - dotenv: Environment variables
# - cors: Cross-origin requests
# - body-parser: Parse request bodies
# - nodemon: Auto-restart (dev only)
```

#### Configure Environment Variables

```bash
# Copy example file
cp .env.example .env

# Edit .env
nano .env  # or use your preferred editor
```

**Update these values in `.env`:**

```env
# Your PostgreSQL connection string
DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/blog_cms

# API server port
PORT=5000

# Environment
NODE_ENV=development

# Allow all origins (development)
CORS_ORIGIN=*
```

**Connection String Format:**
```
postgresql://[user]:[password]@[host]:[port]/[database]
```

**Examples:**
```env
# Local default user
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/blog_cms

# Custom user
DATABASE_URL=postgresql://myuser:mypass123@localhost:5432/blog_cms

# Remote database
DATABASE_URL=postgresql://admin:secret@db.example.com:5432/blog_cms

# Docker
DATABASE_URL=postgresql://postgres:mysecretpassword@localhost:5432/blog_cms
```

#### Test the Backend

```bash
# Start server in development mode
npm run dev

# Expected output:
# ✅ Database connected successfully
# 🚀 Blog API running on http://localhost:5000
# 📊 Environment: development

# Test health endpoint
curl http://localhost:5000/api/health

# Expected response:
# {"status":"OK","timestamp":"2024-01-11T...","environment":"development"}
```

### 4. Frontend Setup

#### Serve Static Files

You need a web server to serve the HTML files. Choose one option:

**Option A: Python (Easiest)**

```bash
# Python 3
cd /path/to/marketing
python3 -m http.server 3000

# Python 2
python -m SimpleHTTPServer 3000

# Access: http://localhost:3000
```

**Option B: Node.js http-server**

```bash
npm install -g http-server
cd /path/to/marketing
http-server -p 3000

# Access: http://localhost:3000
```

**Option C: VS Code Live Server Extension**

1. Install "Live Server" extension in VS Code
2. Right-click `index.html`
3. Select "Open with Live Server"

**Option D: PHP**

```bash
cd /path/to/marketing
php -S localhost:3000
```

#### Update API URLs

**File 1: `/admin/blog-admin.html`**

Find this line (around line 283):
```javascript
const API_URL = 'http://localhost:5000/api';
```

**File 2: `/en/resources/articles/articles-dynamic.html`**

Find this line (around line 425):
```javascript
const API_URL = 'http://localhost:5000/api';
```

**For Production:**
Replace with your production API URL:
```javascript
const API_URL = 'https://api.wordsthatsells.website/api';
```

### 5. Create Your First Article

1. **Open Admin Panel:**
   - Navigate to: `http://localhost:3000/admin/blog-admin.html`

2. **Fill Out the Form:**
   - **Title:** "10 Essential SEO Tips for 2024"
   - **Description:** "Boost your website's visibility with these proven SEO strategies"
   - **Content:**
     ```html
     <p>Search Engine Optimization is crucial for online success. Here are 10 tips to improve your rankings:</p>

     <h2>1. Optimize Your Page Titles</h2>
     <p>Make sure every page has a unique, descriptive title that includes your target keyword.</p>

     <h2>2. Create Quality Content</h2>
     <p>Focus on creating valuable, informative content that answers your audience's questions.</p>

     <h2>3. Build Quality Backlinks</h2>
     <p>Earn links from reputable websites in your industry to boost your authority.</p>

     <p>Continue implementing these strategies to see significant improvements in your search rankings!</p>
     ```
   - **Featured Image URL:** `https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a`
   - **Categories:** Select "SEO" and "Marketing Strategy"

3. **Publish:**
   - Click "Publish Article"
   - Wait for success message
   - You'll be redirected to the articles page

4. **View Your Article:**
   - Navigate to: `http://localhost:3000/en/resources/articles/articles-dynamic.html`
   - You should see your article in the grid
   - Click to view the full article in a modal

### 6. Replace Old Articles Page (Optional)

If you want to use the new dynamic page as your main articles page:

```bash
# Backup the old page (already done)
cp en/resources/articles/index.html en/resources/articles/index-backup.html

# Replace with dynamic version
cp en/resources/articles/articles-dynamic.html en/resources/articles/index.html
```

Or keep both and link to the dynamic version:

```html
<!-- Add this link somewhere on your site -->
<a href="/en/resources/articles/articles-dynamic.html">View Dynamic Blog</a>
```

## Testing Checklist

Use this checklist to verify everything works:

### Backend Tests

- [ ] Server starts without errors
- [ ] Database connection successful
- [ ] Health endpoint responds: `http://localhost:5000/api/health`
- [ ] Can fetch articles: `http://localhost:5000/api/articles`
- [ ] Can fetch single article: `http://localhost:5000/api/articles/test-slug`
- [ ] Can create article via API (use curl or Postman)

### Frontend Tests

- [ ] Admin page loads without errors
- [ ] Can fill out article form
- [ ] Form validation works (try submitting empty form)
- [ ] Can create article and see success message
- [ ] Articles page loads without errors
- [ ] Can see published articles in grid
- [ ] Search functionality works
- [ ] Category filtering works
- [ ] Can click article to view in modal
- [ ] Modal opens and displays content correctly
- [ ] Can close modal (X button, outside click, Escape key)

### Browser Console Tests

Open browser DevTools (F12) and check:

- [ ] No JavaScript errors in Console
- [ ] Network tab shows successful API calls
- [ ] No CORS errors
- [ ] Images load correctly (or show fallback)

## Common Issues & Solutions

### Issue 1: Database Connection Failed

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions:**
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL
# macOS
brew services start postgresql

# Linux
sudo service postgresql start

# Check port
lsof -i :5432

# Verify connection string in .env
echo $DATABASE_URL
```

### Issue 2: CORS Errors

**Error:** `Access to fetch at 'http://localhost:5000/api/articles' from origin 'http://localhost:3000' has been blocked by CORS`

**Solution:**
Update `.env`:
```env
CORS_ORIGIN=*
```

Or specify your frontend URL:
```env
CORS_ORIGIN=http://localhost:3000
```

Restart the backend server.

### Issue 3: Articles Not Displaying

**Check:**
1. Backend is running (`http://localhost:5000/api/health`)
2. API URL is correct in frontend JavaScript
3. Articles exist in database:
   ```sql
   SELECT * FROM articles WHERE is_published = TRUE;
   ```
4. Browser console for errors (F12)

**Create test article:**
```bash
curl -X POST http://localhost:5000/api/articles \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Article",
    "description": "Test description",
    "content": "<p>Test content</p>",
    "categories": ["SEO"]
  }'
```

### Issue 4: Port Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use :::5000`

**Solution:**
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 [PID]

# Or use a different port in .env
PORT=5001
```

### Issue 5: "Showing Cached Articles"

**Meaning:** Frontend can't reach backend, using localStorage cache

**Solutions:**
1. Start the backend server
2. Check API URL in frontend code
3. Check CORS settings
4. Clear browser cache and refresh

### Issue 6: Images Not Loading

**Solutions:**
1. Use full URLs for images (not relative paths)
2. Use free image services:
   - Unsplash: `https://images.unsplash.com/photo-...`
   - Pexels: `https://images.pexels.com/photos/...`
3. Leave blank to use gradient fallback
4. Host images on CDN (Cloudinary, imgix, etc.)

## Production Deployment

### Deploy Backend (Railway/Render)

1. **Create Account:** [Railway.app](https://railway.app) or [Render.com](https://render.com)

2. **Add PostgreSQL:**
   - Railway: Add PostgreSQL plugin
   - Render: Create PostgreSQL instance

3. **Deploy Backend:**
   ```bash
   # Push to GitHub
   cd blog-backend
   git init
   git add .
   git commit -m "Initial backend commit"
   git push origin main
   ```

4. **Connect Repository:**
   - Connect GitHub repo in Railway/Render
   - Auto-deploy from `main` branch

5. **Set Environment Variables:**
   ```
   NODE_ENV=production
   CORS_ORIGIN=https://wordsthatsells.website
   ```
   (DATABASE_URL auto-set by PostgreSQL addon)

6. **Run Database Migration:**
   - Railway: Use CLI or dashboard SQL editor
   - Render: Use dashboard SQL editor
   - Paste contents of `database/schema.sql`

7. **Get API URL:**
   - Example: `https://blog-api-production.up.railway.app`

### Deploy Frontend

#### Option A: Keep with Existing Site

Just update API URL in files:
```javascript
const API_URL = 'https://your-api-url.railway.app/api';
```

#### Option B: Separate Deployment (Netlify/Vercel)

```bash
# Create netlify.toml
cat > netlify.toml << EOF
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
EOF

# Deploy
netlify deploy --prod
```

### Update URLs in Production

**In `/admin/blog-admin.html`:**
```javascript
const API_URL = 'https://your-backend-url.railway.app/api';
```

**In `/en/resources/articles/articles-dynamic.html`:**
```javascript
const API_URL = 'https://your-backend-url.railway.app/api';
```

## Maintenance & Best Practices

### Regular Backups

```bash
# Backup database daily
pg_dump -U postgres blog_cms > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -U postgres blog_cms < backup_20240111.sql
```

### Monitor Performance

```bash
# Check database size
psql -U postgres -d blog_cms -c "SELECT pg_size_pretty(pg_database_size('blog_cms'));"

# Check number of articles
psql -U postgres -d blog_cms -c "SELECT COUNT(*) FROM articles;"

# Check recent articles
psql -U postgres -d blog_cms -c "SELECT title, created_at FROM articles ORDER BY created_at DESC LIMIT 5;"
```

### Security Recommendations

1. **Add Authentication:** Protect admin panel with password
2. **Use HTTPS:** Always in production
3. **Limit CORS:** Specify exact domain, not `*`
4. **Rate Limiting:** Prevent abuse
5. **Input Sanitization:** Prevent XSS attacks
6. **Regular Updates:** Keep dependencies updated

### Content Guidelines

1. **Optimize Images:**
   - Use compressed images (< 200KB)
   - Recommended size: 1200x630px
   - Use WebP format when possible

2. **Write Quality Content:**
   - 500-2000 words per article
   - Use clear headings (H2, H3)
   - Include relevant keywords
   - Add internal/external links

3. **SEO Best Practices:**
   - Unique titles (50-60 characters)
   - Compelling descriptions (150-160 characters)
   - 2-3 relevant categories per article
   - Regular publishing schedule

## Next Steps

1. ✅ Set up database and backend
2. ✅ Create first article
3. ✅ Test all functionality
4. 📝 Migrate existing articles from old page
5. 🚀 Deploy to production
6. 📊 Set up analytics
7. 🔒 Add authentication
8. 📧 Add newsletter signup
9. 💬 Add comments system
10. 📱 Test mobile responsiveness

## Support & Resources

- **Documentation:** This file
- **Backend README:** `/blog-backend/README.md`
- **API Testing:** Use [Postman](https://www.postman.com/) or [Insomnia](https://insomnia.rest/)
- **Database GUI:** [pgAdmin](https://www.pgadmin.org/), [DBeaver](https://dbeaver.io/)

## Conclusion

You now have a fully functional blog CMS! 🎉

- **Create articles:** `http://localhost:3000/admin/blog-admin.html`
- **View blog:** `http://localhost:3000/en/resources/articles/articles-dynamic.html`
- **API docs:** `http://localhost:5000/api/health`

Happy blogging! 📝
