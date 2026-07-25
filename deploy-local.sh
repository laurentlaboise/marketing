#!/bin/bash

# Local Deployment Script for Blog CMS
# This script sets up everything locally using Docker PostgreSQL

set -e  # Exit on error

echo "🚀 Blog CMS Local Deployment Script"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker found${NC}"

# Step 1: Stop and remove existing container if it exists
echo ""
echo "📦 Cleaning up old containers..."
docker stop blog-postgres 2>/dev/null || true
docker rm blog-postgres 2>/dev/null || true

# Step 2: Start PostgreSQL container
echo ""
echo "🐘 Starting PostgreSQL container..."
docker run --name blog-postgres \
  -e POSTGRES_PASSWORD=blogpassword \
  -e POSTGRES_DB=blog_cms \
  -p 5432:5432 \
  -d postgres:16

echo -e "${GREEN}✅ PostgreSQL container started${NC}"

# Step 3: Wait for PostgreSQL to be ready
echo ""
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 8

# Test connection
for i in {1..10}; do
  if docker exec blog-postgres pg_isready -U postgres &>/dev/null; then
    echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
    break
  fi
  if [ $i -eq 10 ]; then
    echo -e "${RED}❌ PostgreSQL failed to start${NC}"
    exit 1
  fi
  sleep 2
done

# Step 4: Import database schema
echo ""
echo "📊 Importing database schema..."
docker cp blog-backend/database/schema.sql blog-postgres:/schema.sql
docker exec blog-postgres psql -U postgres -d blog_cms -f /schema.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database schema imported successfully${NC}"
else
    echo -e "${RED}❌ Failed to import schema${NC}"
    exit 1
fi

# Step 5: Create .env file
echo ""
echo "⚙️  Creating backend configuration..."
cd blog-backend

cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:blogpassword@localhost:5432/blog_cms
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*
EOF

echo -e "${GREEN}✅ .env file created${NC}"

# Step 6: Install npm dependencies — unconditionally, so every deploy
# enforces package-lock.json instead of reusing whatever tree is present.
echo ""
echo "📦 Installing npm dependencies..."
npm ci
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 7: Show next steps
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Local deployment complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1️⃣  Start the backend server:"
echo -e "   ${YELLOW}cd blog-backend && npm start${NC}"
echo ""
echo "2️⃣  In a new terminal, serve the frontend:"
echo -e "   ${YELLOW}cd /home/user/marketing && python3 -m http.server 3000${NC}"
echo ""
echo "3️⃣  Open the admin panel:"
echo -e "   ${YELLOW}http://localhost:3000/admin/blog-admin.html${NC}"
echo ""
echo "4️⃣  View your blog:"
echo -e "   ${YELLOW}http://localhost:3000/en/resources/articles/articles-dynamic.html${NC}"
echo ""
echo "📚 Database Info:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: blog_cms"
echo "   Username: postgres"
echo "   Password: blogpassword"
echo ""
echo "🛑 To stop PostgreSQL:"
echo -e "   ${YELLOW}docker stop blog-postgres${NC}"
echo ""
echo "🔄 To restart PostgreSQL:"
echo -e "   ${YELLOW}docker start blog-postgres${NC}"
echo ""
echo -e "${GREEN}Happy blogging! 🎉${NC}"
