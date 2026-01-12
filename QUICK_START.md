# 🚀 Quick Start - Deploy Your Blog CMS in 10 Minutes

Your blog CMS is now merged into main! Here's how to get it running and start posting.

## Option 1: Deploy to Railway (Recommended - Easiest)

### Step 1: Sign Up for Railway
1. Go to [railway.app](https://railway.app)
2. Click "Login with GitHub"
3. Authorize Railway

### Step 2: Deploy Backend

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose `laurentlaboise/marketing` repository
4. Railway will detect Node.js automatically

**Configure the deployment:**
- Root Directory: `/blog-backend`
- Build Command: `npm install`
- Start Command: `npm start`

### Step 3: Add PostgreSQL Database

1. In your Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway automatically connects it to your backend (sets `DATABASE_URL`)

### Step 4: Initialize Database Schema

**Option A: Using Railway Dashboard**
1. Click on your PostgreSQL service
2. Go to "Data" tab
3. Click "Query"
4. Copy contents from `blog-backend/database/schema.sql` and paste
5. Click "Run"

**Option B: Using Local psql** (if you have psql installed)
```bash
# Get DATABASE_URL from Railway dashboard → PostgreSQL → Variables tab
psql "your-railway-database-url-here" -f blog-backend/database/schema.sql
```

### Step 5: Get Your API URL

1. Go to your backend service in Railway
2. Click "Settings" tab
3. Scroll to "Networking"
4. Click "Generate Domain"
5. Copy the URL (e.g., `https://your-app.railway.app`)

### Step 6: Update Frontend Configuration

**Edit these two files with your Railway URL:**

**File 1: `/admin/blog-admin.html`** (line ~283)
```javascript
// Change this:
const API_URL = 'http://localhost:5000/api';

// To this:
const API_URL = 'https://your-app.railway.app/api';
```

**File 2: `/en/resources/articles/articles-dynamic.html`** (line ~425)
```javascript
// Change this:
const API_URL = 'http://localhost:5000/api';

// To this:
const API_URL = 'https://your-app.railway.app/api';
```

### Step 7: Test Your API

Open in browser:
```
https://your-app.railway.app/
https://your-app.railway.app/api/health
https://your-app.railway.app/api/articles
```

You should see JSON responses!

### Step 8: Start Creating Content! 🎉

```bash
# Serve your frontend
cd /home/user/marketing
python3 -m http.server 3000
```

**Then open these URLs:**

1. **Admin Panel (Create Posts):**
   ```
   http://localhost:3000/admin/blog-admin.html
   ```

2. **View Blog:**
   ```
   http://localhost:3000/en/resources/articles/articles-dynamic.html
   ```

---

## Option 2: Run Locally with Docker PostgreSQL

If you prefer to run everything locally:

### Step 1: Start PostgreSQL in Docker

```bash
docker run --name blog-postgres \
  -e POSTGRES_PASSWORD=blogpassword \
  -e POSTGRES_DB=blog_cms \
  -p 5432:5432 \
  -d postgres:16
```

### Step 2: Import Database Schema

```bash
# Wait 5 seconds for PostgreSQL to start
sleep 5

# Copy schema file
docker cp blog-backend/database/schema.sql blog-postgres:/schema.sql

# Import schema
docker exec blog-postgres psql -U postgres -d blog_cms -f /schema.sql
```

### Step 3: Configure Backend

```bash
cd blog-backend

# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:blogpassword@localhost:5432/blog_cms
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*
EOF
```

### Step 4: Start Backend

```bash
npm start
```

You should see:
```
🚀 Blog API running on http://localhost:5000
📍 Routes registered:
   GET  /
   GET  /api/health
   GET  /api/articles
   ...
```

### Step 5: Update Frontend (for local API)

**Edit `/admin/blog-admin.html` (line ~283):**
```javascript
const API_URL = 'http://localhost:5000/api';
```

**Edit `/en/resources/articles/articles-dynamic.html` (line ~425):**
```javascript
const API_URL = 'http://localhost:5000/api';
```

### Step 6: Serve Frontend

```bash
cd /home/user/marketing
python3 -m http.server 3000
```

**Then access:**
- Admin: `http://localhost:3000/admin/blog-admin.html`
- Blog: `http://localhost:3000/en/resources/articles/articles-dynamic.html`

---

## 📝 Creating Your First Article

1. Open: `http://localhost:3000/admin/blog-admin.html`

2. Fill out the form:
   - **Title:** "Getting Started with Digital Marketing"
   - **Description:** "Essential tips for small businesses starting their digital marketing journey"
   - **Content:**
     ```html
     <p>Digital marketing is essential for modern businesses. Here's what you need to know:</p>

     <h2>1. Know Your Audience</h2>
     <p>Understanding your target audience is the foundation of successful marketing.</p>

     <h2>2. Create Quality Content</h2>
     <p>Content is king. Focus on providing value to your readers.</p>

     <h2>3. Be Consistent</h2>
     <p>Regular posting builds trust and keeps your audience engaged.</p>
     ```
   - **Featured Image:** `https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a`
   - **Categories:** Select "Marketing Strategy" and "Content Creation"

3. Click **"Publish Article"**

4. View your article at: `http://localhost:3000/en/resources/articles/articles-dynamic.html`

---

## 🎯 What You Have Now

✅ **Backend API** - Ready to deploy or run locally
✅ **Admin Panel** - Create, edit, delete articles
✅ **Blog Frontend** - Beautiful article display with search/filter
✅ **Database Schema** - Optimized PostgreSQL structure
✅ **Complete Documentation** - See `BLOG_SETUP_GUIDE.md`

---

## 🆘 Troubleshooting

### API returns 404 for all routes
- Check Railway logs for startup messages
- Verify routes are registered (look for "Routes registered:" in logs)
- Make sure error handlers are AFTER routes (already fixed in your merge)

### Can't connect to API
- Check if backend is running
- Test: `curl http://localhost:5000/api/health`
- Check CORS settings in `.env`

### Database errors
- Verify DATABASE_URL is set correctly
- Check if schema was imported: `psql DATABASE_URL -c "SELECT * FROM articles;"`
- Railway: Database URL is auto-configured

### Frontend shows "Failed to load articles"
- Check browser console (F12) for errors
- Verify API_URL in frontend files
- Check CORS errors (backend must allow frontend origin)

---

## 📚 Next Steps

1. ✅ Deploy backend (Railway or local Docker)
2. ✅ Import database schema
3. ✅ Update frontend API URLs
4. ✅ Create your first article
5. 🚀 Start blogging!

**Need help?** Check `BLOG_SETUP_GUIDE.md` for detailed instructions.
