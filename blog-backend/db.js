// db.js - Database connection module
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  
  // Connection pool limits
  max: 20,                    // Maximum pool size (Railway default: 20 connections)
  min: 2,                     // Minimum pool size (keep some connections ready)
  
  // Connection timeouts
  connectionTimeoutMillis: 10000,  // Wait 10s for available connection
  idleTimeoutMillis: 120000,       // Close idle connections after 2 minutes
  maxLifetimeSeconds: 1800,        // Recycle connections after 30 minutes
  
  // Query timeout
  statement_timeout: 30000,        // Kill queries running longer than 30s
  
  // Keep-alive settings (prevent NO_SOCKET errors)
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Handle pool errors gracefully (don't kill entire app)
pool.on('error', (err, client) => {
  console.error('⚠️  Unexpected database error on idle client:', err.message);
  console.error('Stack:', err.stack);
  // Log but don't exit - let pool recover
});

pool.on('connect', (client) => {
  console.log('✅ Database client connected');
});

pool.on('remove', (client) => {
  console.log('🔌 Database client removed from pool');
});

// Note: Graceful shutdown is handled in server.js to ensure proper order:
// 1. Stop accepting new connections (server.close())
// 2. Close database pool (pool.end())
// 3. Exit process

module.exports = pool;
