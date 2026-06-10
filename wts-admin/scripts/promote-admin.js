#!/usr/bin/env node
/**
 * Promote an existing user to the admin role.
 *
 * Usage:
 *   node scripts/promote-admin.js user@example.com
 *
 * On Railway:
 *   railway run node scripts/promote-admin.js user@example.com
 *
 * With public signup disabled (ALLOW_SIGNUP=false, the default) this is the
 * supported way to bootstrap the first admin:
 *   1. Temporarily set ALLOW_SIGNUP=true and create the account via /auth/signup
 *      (or add the email to OAUTH_ALLOWED_EMAILS and sign in via Google/Facebook).
 *   2. Run this script to promote it.
 *   3. Set ALLOW_SIGNUP back to false.
 */
require('dotenv').config();
const db = require('../database/db');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node scripts/promote-admin.js <email>');
    process.exit(1);
  }

  const result = await db.query(
    "UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE email = $1 RETURNING id, email, role",
    [email]
  );

  if (result.rows.length === 0) {
    console.error(`No user found with email ${email}. Create the account first, then re-run.`);
    process.exit(1);
  }

  console.log(`Promoted ${result.rows[0].email} to role '${result.rows[0].role}'.`);
  await db.close();
}

main().catch((err) => {
  console.error('Failed to promote admin:', err.message);
  process.exit(1);
});
