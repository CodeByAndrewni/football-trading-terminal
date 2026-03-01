-- ============================================================
-- LIVEPRO FOOTBALL TERMINAL
-- Migration 003: Add main O/U line columns to odds_snapshots
-- Created: 2026-02-25
-- Purpose: Store dynamic main O/U line data (not just fixed 1.5/2.5/3.5)
-- ============================================================

-- Add main O/U line columns
ALTER TABLE odds_snapshots
ADD COLUMN IF NOT EXISTS main_ou_line NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS main_ou_over NUMERIC(6,3),
ADD COLUMN IF NOT EXISTS main_ou_under NUMERIC(6,3);

COMMENT ON COLUMN odds_snapshots.main_ou_line IS 'Main O/U line (e.g., 1.75, 2.0, 2.25, 2.5)';
COMMENT ON COLUMN odds_snapshots.main_ou_over IS 'Over odds for main O/U line';
COMMENT ON COLUMN odds_snapshots.main_ou_under IS 'Under odds for main O/U line';

-- Create index for main O/U line queries
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_main_ou
  ON odds_snapshots(fixture_id, main_ou_line);

-- ============================================================
-- 完成
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 003_main_ou_line completed successfully';
END $$;
