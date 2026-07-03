// Whiteboard module migrations — module-owned tables only.
//
// CREATE TABLE IF NOT EXISTS style, matching database/db.js conventions.
// Runs inside attach(), i.e. only when FEATURE_WHITEBOARD === '1' and only
// after db.initialize() has completed. Flag off → none of these tables are
// ever created.

const db = require('../../../database/db');

async function runMigrations() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS boards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      created_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS board_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      principal_type VARCHAR(10) NOT NULL CHECK (principal_type IN ('admin','customer')),
      principal_id VARCHAR(64) NOT NULL,
      role VARCHAR(12) NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor','commenter','viewer')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(board_id, principal_type, principal_id)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_board_members_principal
    ON board_members (principal_type, principal_id)
  `);

  // Latest-only snapshot in v1: PK on board_id, persisted via upsert.
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_snapshots (
      board_id UUID PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
      snapshot JSONB NOT NULL,
      seq BIGINT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Created now, routed in a later stage.
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      parent_id UUID,
      anchor JSONB,
      author_type VARCHAR(10),
      author_id VARCHAR(64),
      author_name VARCHAR(255),
      body TEXT NOT NULL,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS board_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'awaiting_review' CHECK (status IN ('awaiting_review','needs_changes','approved')),
      requested_by VARCHAR(255),
      reviewer_note TEXT,
      due_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Stage D+E addition: the admin's note when requesting a review lives in
  // its own column so the client's decision note (reviewer_note) never
  // overwrites it. ADD COLUMN IF NOT EXISTS keeps this idempotent for
  // databases created by earlier stages.
  await db.query(`
    ALTER TABLE board_approvals ADD COLUMN IF NOT EXISTS request_note TEXT
  `);

  // Images placed on a board (drag-drop / paste / insert-media). Stored in
  // Postgres like deliverables so they survive Railway's ephemeral disk;
  // served through a membership-checked route shared by both portals.
  await db.query(`
    CREATE TABLE IF NOT EXISTS board_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      mime VARCHAR(80) NOT NULL,
      size INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_by VARCHAR(80),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_board_assets_board ON board_assets (board_id)
  `);

  // Gated delivery: an admin can mark one asset per board as the final
  // deliverable, optionally priced. A priced final starts 'locked' and is
  // unlocked by the payment webhook (or a manual admin unlock for bank
  // transfer / BCEL). ADD COLUMN IF NOT EXISTS keeps this idempotent for
  // databases created by earlier stages.
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS payment_status VARCHAR(10) NOT NULL DEFAULT 'unlocked'
  `);
  await db.query(`
    DO $$ BEGIN
      ALTER TABLE board_assets ADD CONSTRAINT board_assets_payment_status_check
        CHECK (payment_status IN ('locked','unlocked'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS title VARCHAR(200)
  `);
}

module.exports = { runMigrations };
