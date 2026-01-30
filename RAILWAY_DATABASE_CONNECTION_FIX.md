# 🚨 Railway Database Connection Fix

## Current Issue
Your screenshot shows:
- ✅ Postgres: Online
- ✅ Marketing (app): Online  
- ❌ **Database Connection: "Unable to connect via SSH"**
- ⚠️ **"Database container is starting up or transitioning"**

## 🔧 Quick Fix Steps

### Step 1: Wait for Database to Fully Start (1-2 minutes)
The message "starting up or transitioning" means Postgres is restarting. This is normal.

### Step 2: Verify DATABASE_URL Environment Variable

1. **Click on "marketing" service** (your Node.js app, not Postgres)
2. Go to **"Variables"** tab
3. Look for `DATABASE_URL`

**It should look like:**
```
DATABASE_URL=postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway
```

**If it's MISSING or WRONG:**

#### Option A: Link the Services (Recommended)
1. In "marketing" service → Variables tab
2. Click **"+ New Variable"**
3. Click **"Add Reference"**
4. Select: **Postgres** → **DATABASE_URL**
5. Click **"Add"**
6. Railway will auto-restart your service

#### Option B: Manually Set (if Option A doesn't work)
1. Click on **"Postgres"** service
2. Go to **"Connect"** tab
3. Copy the **"DATABASE_URL"** (looks like `postgresql://...`)
4. Click on **"marketing"** service
5. Go to **"Variables"** tab
6. Click **"+ New Variable"**
7. Variable name: `DATABASE_URL`
8. Variable value: Paste the connection string
9. Click **"Add"**

### Step 3: Check Other Required Variables

In **marketing** service → Variables, you should have:

```bash
DATABASE_URL=postgresql://postgres:...  # From Postgres service (or reference)
NODE_ENV=production                      # Set manually
PORT=<auto-provided-by-railway>         # Usually auto-set
CORS_ORIGIN=*                           # Or your frontend URL
```

### Step 4: Verify Service Logs

After database starts and variables are set:

1. Click **"marketing"** service
2. Click **"Deployments"** tab
3. Click latest deployment
4. Check logs for:

**✅ Good logs:**
```
🚀 Starting blog backend server...
📦 Node version: v20.x.x
📍 Changed to: /app/blog-backend
✅ Dependencies ready
🚀 Blog API running on http://0.0.0.0:8080
✅ Database client connected
✅ Database initialized: guides table ready
```

**❌ Bad logs (database connection error):**
```
⚠️ Unexpected database error: connect ECONNREFUSED
Error: Connection terminated unexpectedly
```

## 🔍 Troubleshooting Specific Errors

### Error: "connect ECONNREFUSED"
**Cause**: `DATABASE_URL` is wrong or missing

**Fix**: 
- Verify `DATABASE_URL` in marketing service variables
- Make sure it points to `postgres.railway.internal` (not localhost)
- Link the services using References (Step 2, Option A)

### Error: "password authentication failed"
**Cause**: Wrong password in `DATABASE_URL`

**Fix**:
- Get fresh `DATABASE_URL` from Postgres service → Connect tab
- Update variable in marketing service

### Error: "no pg_hba.conf entry for host"
**Cause**: SSL configuration issue

**Fix**: Your `db.js` already handles this (line 7), but verify:
```javascript
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
```

Make sure `NODE_ENV=production` is set in Variables.

## 🎯 Quick Check: Is Your Server Even Starting?

1. Click **"marketing"** service
2. Click **"Deployments"**
3. Click latest deployment
4. Look for logs

**If you see:**
- ✅ `🚀 Starting blog backend server...` → Server is starting!
- ❌ No logs at all → Server not starting (check build logs)
- ❌ Database errors → Connection issue (follow Step 2 above)

## ⚡ Fast Fix Command (Railway CLI)

If you have Railway CLI installed:

```bash
# Check environment variables
railway variables

# View live logs
railway logs

# Check if DATABASE_URL exists
railway variables | grep DATABASE_URL

# Set variables manually if needed
railway variables set NODE_ENV=production
```

## 🔗 Railway Service Linking (Best Practice)

Instead of copying connection strings, **link services**:

1. Both services in same project → Railway auto-creates internal network
2. Use **References** for environment variables
3. Railway manages the connection automatically
4. Database credentials auto-update if changed

**To link:**
- marketing service → Variables → + New Variable → Add Reference → Select Postgres

## 📊 Expected State After Fix

**Postgres Service:**
- Status: ✅ Online
- Deployments: Active
- Database Connection: ✅ Connected

**Marketing Service:**
- Status: ✅ Online  
- Deployments: Active
- Environment Variables: DATABASE_URL ✅ set
- Logs: `✅ Database client connected`

## ⏭️ Next Steps

1. **Wait 2-3 minutes** for Postgres to fully start (the "transitioning" message)
2. **Check Variables** in marketing service for DATABASE_URL
3. **Check Logs** in marketing service for connection status
4. **Test API**: `https://your-app.railway.app/api/health`

If still not working after these steps, share:
- Screenshot of marketing service → Variables tab
- Logs from marketing service → Deployments → Latest
