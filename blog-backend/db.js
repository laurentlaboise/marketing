// db.js - Database connection module
const { Pool } = require('pg');
require('dotenv').config();

// Validate DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('');
  console.error('❌ FATAL ERROR: DATABASE_URL environment variable is NOT SET!');
  console.error('');
  console.error('🔍 This means Railway is not passing the environment variable.');
  console.error('');
  console.error('📝 To fix in Railway dashboard:');
  console.error('   1. Go to "marketing" service → Variables tab');
  console.error('   2. Check if DATABASE_URL exists');
  console.error('   3. If using Reference: Delete it and add as RAW variable');
  console.error('   4. Add new variable:');
  console.error('      Name: DATABASE_URL');
  console.error('      Value: postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway');
  console.error('');
  console.error('🔧 Alternative: Check variable is exposed at RUNTIME (not just build)');
  console.error('');
  process.exit(1);
}

console.log('✅ DATABASE_URL is set');
console.log(`📍 Database host: ${process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown'}`);

console.log('🔌 Initializing database connection pool...');
console.log(`📍 Database host: ${process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown'}`);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  
  // Connection pool limits
  max: 20,                    // Maximum pool size (Railway default: 20 connections)
  
  // Connection timeouts - INCREASED for Railway database startup
  connectionTimeoutMillis: 30000,  // Wait 30s for available connection (Railway DB startup)
  idleTimeoutMillis: 120000,       // Close idle connections after 2 minutes
  maxLifetimeSeconds: 1800,        // Recycle connections after 30 minutes
  
  // Keep-alive settings (prevent NO_SOCKET errors)
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Handle pool errors gracefully (don't kill entire app)
pool.on('error', (err) => {
  console.error('⚠️  Unexpected database error on idle client:', err.message);
  console.error('Stack:', err.stack);
  // Log but don't exit - let pool recover
});

pool.on('connect', (client) => {
  console.log('✅ Database client connected');
  // Set query timeout for this connection (30 seconds)
  client.query('SET statement_timeout = 30000').catch((err) => {
    console.error('Warning: Failed to set statement_timeout:', err.message);
  });
});

pool.on('remove', (client) => {
  console.log('🔌 Database client removed from pool');
});

// Note: Graceful shutdown is handled in server.js to ensure proper order:
// 1. Stop accepting new connections (server.close())
// 2. Close database pool (pool.end())
// 3. Exit process

module.exports = pool;
