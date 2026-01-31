// db.js - Database connection module
const { Pool } = require('pg');
require('dotenv').config();

// Track database availability for graceful degradation
let databaseAvailable = false;
let connectionString = null;

// Build connection string from individual variables if DATABASE_URL not available
connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️  DATABASE_URL not found, checking for individual PG* variables...');

  const pgHost = process.env.PGHOST;
  const pgPort = process.env.PGPORT || '5432';
  const pgUser = process.env.PGUSER;
  const pgPassword = process.env.PGPASSWORD;
  const pgDatabase = process.env.PGDATABASE;

  if (pgHost && pgUser && pgPassword && pgDatabase) {
    connectionString = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}`;
    console.log('✅ Built connection string from PG* variables');
  } else {
    console.warn('⚠️  No database credentials available - running in degraded mode');
    console.warn('📝 To enable database, set either:');
    console.warn('   1. DATABASE_URL (full connection string), OR');
    console.warn('   2. PGHOST, PGUSER, PGPASSWORD, PGDATABASE');
  }
}

// Create a mock pool for when database is unavailable
const createMockPool = () => {
  const mockError = new Error('Database not configured - Postgres deployment may have been removed');
  mockError.code = 'NO_DATABASE';

  return {
    query: async () => { throw mockError; },
    connect: async () => { throw mockError; },
    end: async () => { console.log('Mock pool closed'); },
    on: () => {},
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    _isDegraded: true
  };
};

let pool;

if (connectionString) {
  console.log('🔌 Initializing database connection pool...');
  console.log(`📍 Database host: ${connectionString.split('@')[1]?.split('/')[0] || 'unknown'}`);

  pool = new Pool({
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
    databaseAvailable = false;
    // Log but don't exit - let pool recover
  });

  pool.on('connect', (client) => {
    console.log('✅ Database client connected');
    databaseAvailable = true;
    // Set query timeout for this connection (30 seconds)
    client.query('SET statement_timeout = 30000').catch((err) => {
      console.error('Warning: Failed to set statement_timeout:', err.message);
    });
  });

  pool.on('remove', (client) => {
    console.log('🔌 Database client removed from pool');
  });

  pool._isDegraded = false;
} else {
  console.warn('🚨 Running without database - using mock pool');
  pool = createMockPool();
}

// Export helper to check database status
pool.isDatabaseAvailable = () => databaseAvailable;
pool.isDegraded = () => pool._isDegraded;

// Note: Graceful shutdown is handled in server.js to ensure proper order:
// 1. Stop accepting new connections (server.close())
// 2. Close database pool (pool.end())
// 3. Exit process

module.exports = pool;
