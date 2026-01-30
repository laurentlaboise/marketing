#!/bin/bash
# Railway startup script - ensures server starts from correct directory

echo "🚀 Starting blog backend server..."
echo "📁 Working directory: $(pwd)"
echo "📦 Node version: $(node --version)"
echo "📦 NPM version: $(npm --version)"

# Navigate to blog-backend directory
cd blog-backend || {
  echo "❌ Error: blog-backend directory not found!"
  exit 1
}

echo "📍 Changed to: $(pwd)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📥 Installing dependencies..."
  npm ci --prefer-offline --no-audit || npm install
fi

echo "✅ Dependencies ready"
echo "🎯 Starting server with: node server.js"

# Start the server
exec node server.js
