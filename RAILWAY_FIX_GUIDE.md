# 🚀 Railway Deployment Fix Guide

## ⚠️ Problem Identified

Your Railway deployment is stalling because:

1. **Wrong Directory**: Railway is trying to deploy from the root directory (`/home/user/webapp`)
2. **Missing Dependencies**: The root `package.json` only has webpack/build tools, not Express/pg/etc.
3. **Missing Files**: The root doesn't have `db.js` that `server.js` requires
4. **Actual Backend**: Your real backend is in the `blog-backend/` subdirectory

## ✅ Solution Applied

I've created configuration files to tell Railway to use the `blog-backend/` directory:

### Files Created:

1. **`railway.json`** - Railway-specific configuration
2. **`Procfile`** - Alternative Railway start command
3. **`nixpacks.toml`** - Nixpacks build configuration

## 🔧 Railway Configuration Steps

### Option A: In Railway Dashboard (Recommended)

1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Settings** tab
4. Find **"Root Directory"** setting
5. Set it to: `blog-backend`
6. Click **"Redeploy"**

### Option B: Using Environment Variables

In Railway dashboard, add these environment variables:

```
DATABASE_URL=your_postgresql_connection_string
PORT=5000
NODE_ENV=production
CORS_ORIGIN=your_frontend_url
```

**Important**: Railway usually auto-provides `DATABASE_URL` if you have a Postgres service attached.

### Option C: Using Configuration Files (Already Done)

The files I created should automatically work. Railway will detect:
- `nixpacks.toml` (highest priority)
- `Procfile` (fallback)
- `railway.json` (additional config)

## 🗄️ Database Setup

Your server has auto-initialization code, but you need to ensure:

1. **PostgreSQL Service**: Add a PostgreSQL database in Railway
   - Click **"+ New"** → **"Database"** → **"PostgreSQL"**
   - Railway will automatically set `DATABASE_URL` environment variable

2. **Database Connection**: The `DATABASE_URL` format should be:
   ```
   postgresql://username:password@host:port/database_name
   ```

3. **Auto-Init**: Your server automatically creates:
   - `guides` table on startup
   - `articles` table via `/api/setup-database` endpoint

## 🔍 Debugging Stalled Deployment

### Check Railway Logs:

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Check **Build Logs** and **Deploy Logs**
4. Look for errors like:
   - `Cannot find module './db'`
   - `MODULE_NOT_FOUND`
   - Database connection errors
   - Port binding issues

### Common Error Fixes:

#### Error: "Cannot find module './db'"
**Fix**: Use "Root Directory" = `blog-backend` in Railway settings

#### Error: "PORT environment variable not found"
**Fix**: Railway auto-provides `PORT`, but your code has fallback to 5000 (✅ already handled)

#### Error: "Database connection failed"
**Fix**: 
- Ensure PostgreSQL service is added in Railway
- Check `DATABASE_URL` is set correctly
- Verify database credentials

#### Error: "EADDRINUSE: address already in use"
**Fix**: Use Railway's provided PORT:
```javascript
const PORT = process.env.PORT || 5000; // ✅ Your code already does this
```

## 🚀 Quick Deployment Checklist

- [ ] PostgreSQL database added in Railway
- [ ] `DATABASE_URL` environment variable set (or auto-provided)
- [ ] Root Directory set to `blog-backend` OR configuration files present
- [ ] `PORT` environment variable (Railway auto-provides)
- [ ] `NODE_ENV=production` set
- [ ] `CORS_ORIGIN` set to your frontend URL (if needed)

## 📝 Post-Deployment

After successful deployment:

1. **Test Health Endpoint**: Visit `https://your-railway-url.railway.app/api/health`
2. **Setup Database**: Visit `https://your-railway-url.railway.app/api/setup-database` (one-time)
3. **Check Guides**: Visit `https://your-railway-url.railway.app/api/guides`
4. **Check Articles**: Visit `https://your-railway-url.railway.app/api/articles`

## 🔄 Alternative: Restructure Project (If Above Doesn't Work)

If Railway still stalls, you can move backend to root:

```bash
# Move backend files to root
mv blog-backend/* .
mv blog-backend/.env.example .
rm -rf blog-backend/

# Commit and push
git add .
git commit -m "Move backend to root for Railway deployment"
git push
```

Then remove the `Root Directory` setting in Railway.

## 📞 Still Having Issues?

Check these:

1. **Railway Build Logs**: Look for the exact error message
2. **Database Connection**: Ensure PostgreSQL is running and accessible
3. **Environment Variables**: Double-check all required variables are set
4. **Port Binding**: Ensure server listens on `0.0.0.0`, not `localhost`:
   ```javascript
   app.listen(PORT, '0.0.0.0', () => { ... }); // ✅ Your code already does this
   ```

## 🎯 Expected Behavior

Once fixed, you should see in Railway logs:

```
🚀 Blog API running on http://0.0.0.0:5000
📊 Environment: production
✅ Database initialized: guides table ready
```

And your API will be accessible at: `https://your-app.railway.app`
