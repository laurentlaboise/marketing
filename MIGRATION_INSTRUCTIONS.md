# Database Migration Instructions - Fix Error 500

## Problem
The Railway database still has the old schema with `content` column, but the updated code expects `sidebar_content` and `full_article_content` columns.

## Solution
You need to migrate your existing Railway database. There are two ways to do this:

### Option 1: Using the Built-in Migration Endpoint (Recommended)

The server already has a migration endpoint. Simply visit:

```
https://marketing-production-a3ee.up.railway.app/api/migrate-content-fields
```

This endpoint will:
1. Rename `content` → `sidebar_content`
2. Add the new `full_article_content` column
3. Copy existing content to both fields

**Expected Response:**
```json
{
  "success": true,
  "message": "✅ Migration completed successfully!",
  "details": {
    "renamed": "content → sidebar_content",
    "added": "full_article_content",
    "note": "Existing articles have content in both fields"
  }
}
```

### Option 2: Manual Database Migration

If the endpoint doesn't work, connect to your Railway PostgreSQL database and run:

```sql
-- Step 1: Rename content to sidebar_content
ALTER TABLE articles RENAME COLUMN content TO sidebar_content;

-- Step 2: Add full_article_content column
ALTER TABLE articles ADD COLUMN full_article_content TEXT;

-- Step 3: Copy existing content to full_article_content
UPDATE articles 
SET full_article_content = sidebar_content 
WHERE full_article_content IS NULL;
```

## Verification

After migration, test the API:

1. **Check health:**
   ```
   https://marketing-production-a3ee.up.railway.app/api/health
   ```

2. **List articles:**
   ```
   https://marketing-production-a3ee.up.railway.app/api/articles
   ```

3. **Visit your resources page:**
   - Articles: https://wordsthatsells.website/en/resources/articles/
   - Guides: https://wordsthatsells.website/en/resources/guides/

## What Was Fixed

1. **blog-backend/database/schema.sql** - Updated to use new column names
2. **blog-backend/server.js** - Fixed setup-database endpoint to use correct schema
3. **blog-backend/README.md** - Updated documentation to reflect new schema

## Notes

- The guides table is automatically created with the correct schema on server startup (no migration needed)
- New article installations will use the correct schema from the start
- Existing data in your Railway database will be preserved during migration
