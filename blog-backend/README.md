# Blog CMS Backend - WordsThatSells.Website

A lightweight Node.js/Express API for managing blog articles with PostgreSQL database.

## Features

- ✅ RESTful API for article management (CRUD operations)
- ✅ PostgreSQL database with proper indexing
- ✅ Category-based filtering
- ✅ Search functionality
- ✅ CORS enabled for frontend integration
- ✅ Error handling and validation
- ✅ Auto-slug generation from titles

## Project Structure

```
blog-backend/
├── database/
│   └── schema.sql          # Database schema and setup
├── db.js                   # Database connection module
├── server.js              # Main Express server
├── package.json           # Node dependencies
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

### 1. Install Dependencies

```bash
cd blog-backend
npm install
```

### 2. Set Up PostgreSQL Database

#### Option A: Using PostgreSQL CLI

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE blog_cms;

# Connect to the new database
\c blog_cms

# Run the schema file
\i database/schema.sql

# Verify tables were created
\dt
```

#### Option B: Using GUI (pgAdmin, DBeaver, etc.)

1. Create a new database named `blog_cms`
2. Open and execute the SQL from `database/schema.sql`

### 3. Configure Environment Variables

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your database credentials
nano .env
```

**Example .env configuration:**

```env
DATABASE_URL=postgresql://username:password@localhost:5432/blog_cms
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*
```

**Important:** Replace `username` and `password` with your PostgreSQL credentials.

### 4. Test Database Connection

```bash
# Start the server
npm start

# You should see:
# ✅ Database connected successfully
# 🚀 Blog API running on http://localhost:5000
```

## API Endpoints

### Articles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/articles` | Get all published articles |
| GET | `/api/articles/:slug` | Get single article by slug |
| POST | `/api/articles` | Create new article |
| PUT | `/api/articles/:id` | Update article |
| DELETE | `/api/articles/:id` | Delete article |

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | Get all unique categories |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health status |

## API Usage Examples

### Get All Articles

```bash
curl http://localhost:5000/api/articles
```

**With query parameters:**

```bash
# Filter by category
curl http://localhost:5000/api/articles?category=SEO

# Search articles
curl http://localhost:5000/api/articles?search=marketing
```

### Create New Article

```bash
curl -X POST http://localhost:5000/api/articles \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Getting Started with SEO",
    "description": "Learn the basics of search engine optimization",
    "content": "<p>SEO is essential for online success...</p>",
    "featured_image_url": "https://example.com/image.jpg",
    "categories": ["SEO", "Marketing Strategy"]
  }'
```

### Get Single Article

```bash
curl http://localhost:5000/api/articles/getting-started-with-seo
```

### Update Article

```bash
curl -X PUT http://localhost:5000/api/articles/1 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "is_published": true
  }'
```

### Delete Article

```bash
curl -X DELETE http://localhost:5000/api/articles/1
```

## Development

### Run in Development Mode (with auto-reload)

```bash
npm run dev
```

### Run in Production Mode

```bash
npm start
```

## Database Schema

### Articles Table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| title | VARCHAR(255) | Article title |
| slug | VARCHAR(255) | URL-friendly slug (unique) |
| description | TEXT | Short description |
| content | TEXT | Full article content (HTML) |
| featured_image_url | VARCHAR(500) | Image URL |
| categories | TEXT[] | Array of category tags |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |
| is_published | BOOLEAN | Publication status |

### Indexes

- `idx_articles_slug` - Fast slug lookups
- `idx_articles_published` - Fast published article queries
- `idx_articles_created_at` - Sorted by date queries

## Adding Sample Data

Uncomment the sample data section in `database/schema.sql` or run:

```sql
INSERT INTO articles (title, slug, description, content, featured_image_url, categories, is_published)
VALUES
  (
    'Mastering SEO for Small Businesses',
    'mastering-seo-small-businesses',
    'Essential SEO strategies for small businesses',
    '<p>Complete guide to SEO...</p>',
    'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a',
    ARRAY['SEO', 'Marketing Strategy'],
    TRUE
  );
```

## Deployment

### Deploy to Heroku

```bash
# Install Heroku CLI
# Login to Heroku
heroku login

# Create new app
heroku create your-blog-api

# Add PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set CORS_ORIGIN=https://yourdomain.com

# Deploy
git push heroku main

# Run database migration
heroku pg:psql < database/schema.sql
```

### Deploy to Railway/Render

1. Connect your GitHub repository
2. Add PostgreSQL database addon
3. Set environment variables from `.env.example`
4. Deploy automatically on push

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL
```

### CORS Errors

Update `CORS_ORIGIN` in `.env`:

```env
# Allow all origins (development only)
CORS_ORIGIN=*

# Allow specific origin
CORS_ORIGIN=https://yourdomain.com
```

### Port Already in Use

Change the `PORT` in `.env`:

```env
PORT=5001
```

## Security Considerations

⚠️ **Important for Production:**

1. **Add Authentication:** Protect POST, PUT, DELETE endpoints with JWT or session auth
2. **Rate Limiting:** Add rate limiting middleware (e.g., express-rate-limit)
3. **Input Validation:** Add robust input validation (e.g., joi, express-validator)
4. **SQL Injection:** Using parameterized queries (already implemented)
5. **CORS:** Restrict CORS to your domain only
6. **HTTPS:** Always use HTTPS in production
7. **Environment Variables:** Never commit `.env` to version control

## Support

For issues or questions:
- Check existing issues in the repository
- Create a new issue with detailed information
- Contact: support@wordsthatsells.website

## License

ISC License - See LICENSE file for details
