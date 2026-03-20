-- ============================================================
-- AI 交易判断日志：持久化「赛前/赛中判断 → 赛后结果 → 复盘」
-- 供多轮对话注入记忆与后续统计（如对/错模式）
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  fixture_id INTEGER,
  related_fixture_ids INTEGER[] DEFAULT '{}',
  league_short TEXT,
  home_team_name TEXT,
  away_team_name TEXT,

  minute_at_judgment INTEGER,
  score_home INTEGER,
  score_away INTEGER,

  user_message TEXT NOT NULL,
  assistant_message TEXT NOT NULL,
  context_snapshot JSONB,

  outcome_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome_status IN ('pending', 'correct', 'incorrect', 'partial', 'unknown')),
  final_home INTEGER,
  final_away INTEGER,
  match_ended_at TIMESTAMPTZ,

  ai_review TEXT,
  user_review_notes TEXT,
  meta JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE ai_trade_journal IS 'AI 问答附带的交易/判断记录，用于赛后复盘与长期记忆注入';

CREATE INDEX IF NOT EXISTS idx_ai_trade_journal_created
  ON ai_trade_journal (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_trade_journal_fixture
  ON ai_trade_journal (fixture_id);

CREATE INDEX IF NOT EXISTS idx_ai_trade_journal_outcome
  ON ai_trade_journal (outcome_status);

ALTER TABLE ai_trade_journal ENABLE ROW LEVEL SECURITY;

-- 仅 service_role 通过服务端访问；anon 无策略（前端直连需后续加 auth + policy）
