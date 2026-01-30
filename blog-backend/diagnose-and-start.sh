#!/bin/bash
# Diagnostic script to check Railway environment

echo "======================================"
echo "Railway Environment Diagnostics"
echo "======================================"
echo ""

echo "📦 Node.js Version:"
node --version
echo ""

echo "📍 Current Directory:"
pwd
echo ""

echo "📂 Directory Contents:"
ls -la
echo ""

echo "🔍 Environment Variables (filtered):"
echo "NODE_ENV: ${NODE_ENV:-'not set'}"
echo "PORT: ${PORT:-'not set'}"
echo ""
echo "Database Connection Variables:"
echo "DATABASE_URL: ${DATABASE_URL:+'***set*** (length: '${#DATABASE_URL}' chars)'}"
if [ -z "$DATABASE_URL" ]; then
  echo "  ⚠️ DATABASE_URL is NOT SET in environment!"
  echo "  Checking individual PG variables..."
else
  echo "  ✅ DATABASE_URL is set"
  echo "  Database host: $(echo $DATABASE_URL | cut -d@ -f2 | cut -d/ -f1)"
fi
echo ""
echo "Individual Postgres Variables:"
echo "PGHOST: ${PGHOST:-'not set'}"
echo "PGPORT: ${PGPORT:-'not set'}"
echo "PGUSER: ${PGUSER:-'not set'}"
echo "PGPASSWORD: ${PGPASSWORD:+'***set***'}"
echo "PGDATABASE: ${PGDATABASE:-'not set'}"
echo ""

echo "📄 .env file check:"
if [ -f ".env" ]; then
  echo "  ✅ .env file exists"
  echo "  Contents (first 5 lines, values hidden):"
  head -5 .env | sed 's/=.*/=***/'
else
  echo "  ℹ️  No .env file (this is normal for Railway)"
fi
echo ""

echo "🔧 Package.json check:"
if [ -f "package.json" ]; then
  echo "  ✅ package.json exists"
  echo "  Main: $(cat package.json | grep '"main"' || echo 'not specified')"
else
  echo "  ❌ package.json NOT FOUND!"
fi
echo ""

echo "======================================"
echo "Starting Node.js application..."
echo "======================================"
echo ""

# Start the actual server
exec node server.js
