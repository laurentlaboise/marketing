// db.js - Database connection module
const { Pool } = require('pg');
require('dotenv').config();

// Build connection string from individual variables if DATABASE_URL not available
let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️  DATABASE_URL not found, building from individual variables...');
  
  const pgHost = process.env.PGHOST || 'localhost';
  const pgPort = process.env.PGPORT || '5432';
  const pgUser = process.env.PGUSER || 'postgres';
  const pgPassword = process.env.PGPASSWORD || '';
  const pgDatabase = process.env.PGDATABASE || 'railway';
  
  if (!pgPassword) {
    console.error('❌ FATAL: No DATABASE_URL and no PGPASSWORD set!');
    console.error('📝 Please set either:');
    console.error('   1. DATABASE_URL (full connection string), OR');
    console.error('   2. PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE');
    process.exit(1);
  }
  
  connectionString = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}`;
  console.log('✅ Built connection string from PG* variables');
}

console.log('🔌 Initializing database connection pool...');
console.log(`📍 Database host: ${connectionString.split('@')[1]?.split('/')[0] || 'unknown'}`);

const pool = new Pool({
  connectionString: connectionString,
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
