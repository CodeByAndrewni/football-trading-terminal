-- ============================================================
-- LIVEPRO FOOTBALL TERMINAL
-- Migration 002: odds_snapshots table
-- Created: 2026-02-25
-- ============================================================

-- odds_snapshots - 赔率快照表（用于 Phase 1.5 odds pipeline）
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id SERIAL PRIMARY KEY,
  fixture_id INTEGER NOT NULL,
  minute INTEGER,

  -- 胜平负
  home_win NUMERIC(6,3),
  draw NUMERIC(6,3),
  away_win NUMERIC(6,3),

  -- 大小球
  over_1_5 NUMERIC(6,3),
  under_1_5 NUMERIC(6,3),
  over_2_5 NUMERIC(6,3),
  under_2_5 NUMERIC(6,3),
  over_3_5 NUMERIC(6,3),
  under_3_5 NUMERIC(6,3),

  -- 让球
  asian_handicap_line NUMERIC(5,2),
  asian_handicap_home NUMERIC(6,3),
  asian_handicap_away NUMERIC(6,3),

  -- 元数据
  bookmaker TEXT NOT NULL DEFAULT 'API-Football',
  is_live BOOLEAN DEFAULT FALSE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 唯一约束：同一比赛同一分钟同一博彩公司只有一条记录
  CONSTRAINT odds_snapshots_unique UNIQUE (fixture_id, minute, bookmaker)
);

COMMENT ON TABLE odds_snapshots IS 'Phase 1.5 - 赔率快照表（用于监控 odds pipeline）';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_fixture
  ON odds_snapshots(fixture_id);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_captured
  ON odds_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_live
  ON odds_snapshots(fixture_id, is_live);

-- RLS
ALTER TABLE odds_snapshots ENABLE ROW LEVEL SECURITY;

-- 允许 anon 读取和写入（因为前端直接写入）
CREATE POLICY "odds_snapshots_anon_all" ON odds_snapshots
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- service_role 完整权限
CREATE POLICY "odds_snapshots_service_all" ON odds_snapshots
  FOR ALL TO service_role USING (true);

-- ============================================================
-- 完成
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 002_odds_snapshots completed successfully';
END $$;
