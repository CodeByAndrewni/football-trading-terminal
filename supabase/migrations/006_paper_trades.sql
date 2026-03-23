-- ============================================================
-- Paper Trading（模拟下单）系统
-- 情景引擎触发 → 模拟下单 → 自动结算 → 复盘统计
-- ============================================================

CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 比赛标识
  fixture_id INTEGER NOT NULL,
  league TEXT,
  home_team TEXT,
  away_team TEXT,

  -- 下单时刻快照（全程可复盘的关键）
  entry_minute INTEGER NOT NULL,
  entry_score_home INTEGER NOT NULL,
  entry_score_away INTEGER NOT NULL,
  entry_composite_score NUMERIC NOT NULL,
  entry_action TEXT NOT NULL,
  entry_scenarios JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_stats_snapshot JSONB,
  entry_odds_snapshot JSONB,

  -- 模拟订单参数
  market_type TEXT NOT NULL DEFAULT 'OVER',
  market_line NUMERIC,
  entry_odds NUMERIC,
  stake NUMERIC NOT NULL DEFAULT 10,
  trigger_rule TEXT NOT NULL,

  -- 结算
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'WON', 'LOST', 'VOID', 'PUSH')),
  final_score_home INTEGER,
  final_score_away INTEGER,
  settled_at TIMESTAMPTZ,
  pnl NUMERIC,

  -- 复盘
  settlement_reason TEXT,
  post_entry_events JSONB,
  user_notes TEXT
);

COMMENT ON TABLE paper_trades IS '模拟下单记录：情景引擎触发 → 自动结算 → 复盘统计';

CREATE INDEX IF NOT EXISTS idx_paper_trades_created
  ON paper_trades (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paper_trades_fixture
  ON paper_trades (fixture_id);

CREATE INDEX IF NOT EXISTS idx_paper_trades_status
  ON paper_trades (status);

ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
