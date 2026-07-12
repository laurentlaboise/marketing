#!/usr/bin/env node
/**
 * Seed top 100 AI tools into Postgres (ai_tools).
 *
 * Usage:
 *   node scripts/seed-ai-tools.js
 *   node scripts/seed-ai-tools.js --replace
 *   railway run node scripts/seed-ai-tools.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../database/db');
const { seedAiTools } = require('../src/lib/ai-tools-seed');

async function main() {
  const replace = process.argv.includes('--replace');
  console.log('[seed-ai-tools] starting…', replace ? '(replace mode)' : '(upsert mode)');
  const result = await seedAiTools(db, { replace });
  console.log('[seed-ai-tools] done:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-ai-tools] failed:', err);
  process.exit(1);
});
