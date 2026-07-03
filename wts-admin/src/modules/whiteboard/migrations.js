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

  // LEGACY — written by the removed tldraw integration; unused since its
  // removal. Kept for rollback safety and the additive-only migration
  // policy. Do not write to it. Candidate for a drop migration after
  // several releases.
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

  // Spatial placement: every asset is a node on an infinite canvas.
  // World units = CSS px at zoom 1. x/y = node top-left; w = node width;
  // h NULL = natural aspect (the client derives it from w and the image's
  // intrinsic ratio, and persists it on first arrange). x NULL = legacy row
  // not yet placed — the assets list serves a deterministic grid fallback
  // and the backfill below fills the bulk at boot.
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS x DOUBLE PRECISION
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS y DOUBLE PRECISION
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS w DOUBLE PRECISION
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS h DOUBLE PRECISION
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS z INTEGER NOT NULL DEFAULT 0
  `);
  // Concurrency + audit: set by the server on every placement write. NULL =
  // never hand-placed (backfilled/legacy) — sorts before any real timestamp
  // in last-write-wins comparisons.
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS placed_at TIMESTAMP
  `);
  await db.query(`
    ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS placed_by VARCHAR(80)
  `);

  // One-time default placement for pre-spatial boards: 4-column grid in
  // created_at order, 480-wide nodes on a 520 stride, z = grid index.
  // WHERE x IS NULL makes this idempotent AND sweeps up rows inserted by
  // old app instances during a rolling deploy on the next boot.
  await db.query(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY board_id ORDER BY created_at ASC, id ASC
             ) - 1 AS n
      FROM board_assets
      WHERE x IS NULL
    )
    UPDATE board_assets a
    SET x = (ranked.n % 4) * 520,
        y = FLOOR(ranked.n / 4) * 520,
        w = 480,
        z = ranked.n
    FROM ranked
    WHERE a.id = ranked.id
  `);
}

module.exports = { runMigrations };
