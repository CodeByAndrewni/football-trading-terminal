-- ============================================================
-- LIVEPRO FOOTBALL TERMINAL
-- ARCHITECTURE_FREEZE_V1 - Database Migration
-- Created: 2026-02-25
-- ============================================================
--
-- 三层架构: RAW → MODEL → SIGNAL
-- 规则:
--   1. Raw层为唯一事实来源
--   2. 不删除现有表
--   3. 所有写入必须使用 upsert
--   4. 禁止 mock 数据
-- ============================================================

-- ============================================================
-- RAW LAYER - 原始数据层
-- ============================================================

-- 1. raw_fixtures - 比赛基础信息
CREATE TABLE IF NOT EXISTS raw_fixtures (
  fixture_id INTEGER PRIMARY KEY,
  league_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  match_date DATE NOT NULL,
  kickoff TIMESTAMPTZ NOT NULL,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_team_name TEXT,
  away_team_name TEXT,
  home_score INTEGER,
  away_score INTEGER,
  ht_home_score INTEGER,
  ht_away_score INTEGER,
  status TEXT NOT NULL DEFAULT 'NS',
  venue_id INTEGER,
  venue_name TEXT,
  referee TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw JSONB
);

COMMENT ON TABLE raw_fixtures IS 'RAW层 - 比赛基础信息（唯一事实来源）';

-- Indexes for raw_fixtures
CREATE INDEX IF NOT EXISTS idx_raw_fixtures_league_date
  ON raw_fixtures(league_id, match_date);
CREATE INDEX IF NOT EXISTS idx_raw_fixtures_status
  ON raw_fixtures(status);
CREATE INDEX IF NOT EXISTS idx_raw_fixtures_teams
  ON raw_fixtures(home_team_id, away_team_id);
CREATE INDEX IF NOT EXISTS idx_raw_fixtures_kickoff
  ON raw_fixtures(kickoff);


-- 2. raw_statistics - 比赛统计时间序列
CREATE TABLE IF NOT EXISTS raw_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  -- 射门数据
  shots_home INTEGER DEFAULT 0,
  shots_away INTEGER DEFAULT 0,
  shots_on_home INTEGER DEFAULT 0,
  shots_on_away INTEGER DEFAULT 0,
  shots_off_home INTEGER DEFAULT 0,
  shots_off_away INTEGER DEFAULT 0,
  shots_blocked_home INTEGER DEFAULT 0,
  shots_blocked_away INTEGER DEFAULT 0,
  -- xG 数据
  xg_home NUMERIC(5,2),
  xg_away NUMERIC(5,2),
  -- 角球数据
  corners_home INTEGER DEFAULT 0,
  corners_away INTEGER DEFAULT 0,
  -- 控球数据
  possession_home INTEGER DEFAULT 50,
  possession_away INTEGER DEFAULT 50,
  -- 进攻数据
  attacks_home INTEGER DEFAULT 0,
  attacks_away INTEGER DEFAULT 0,
  dangerous_home INTEGER DEFAULT 0,
  dangerous_away INTEGER DEFAULT 0,
  -- 其他数据
  fouls_home INTEGER DEFAULT 0,
  fouls_away INTEGER DEFAULT 0,
  offsides_home INTEGER DEFAULT 0,
  offsides_away INTEGER DEFAULT 0,
  yellow_cards_home INTEGER DEFAULT 0,
  yellow_cards_away INTEGER DEFAULT 0,
  red_cards_home INTEGER DEFAULT 0,
  red_cards_away INTEGER DEFAULT 0,
  saves_home INTEGER DEFAULT 0,
  saves_away INTEGER DEFAULT 0,
  passes_home INTEGER DEFAULT 0,
  passes_away INTEGER DEFAULT 0,
  passes_accurate_home INTEGER DEFAULT 0,
  passes_accurate_away INTEGER DEFAULT 0,
  -- 时间戳
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB,
  -- 唯一约束：同一比赛同一时间只有一条记录
  CONSTRAINT raw_statistics_unique UNIQUE (fixture_id, captured_at)
);

COMMENT ON TABLE raw_statistics IS 'RAW层 - 比赛统计时间序列（支持多次采样）';

-- Indexes for raw_statistics
CREATE INDEX IF NOT EXISTS idx_raw_statistics_fixture
  ON raw_statistics(fixture_id);
CREATE INDEX IF NOT EXISTS idx_raw_statistics_time
  ON raw_statistics(fixture_id, minute);
CREATE INDEX IF NOT EXISTS idx_raw_statistics_captured
  ON raw_statistics(captured_at);


-- 3. raw_events - 比赛事件
CREATE TABLE IF NOT EXISTS raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  extra_minute INTEGER,
  team_id INTEGER,
  team_name TEXT,
  event_type TEXT NOT NULL,
  detail TEXT,
  player_id INTEGER,
  player_name TEXT,
  assist_id INTEGER,
  assist_name TEXT,
  comments TEXT,
  -- 事件哈希用于去重
  event_hash TEXT NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- 唯一约束：同一比赛同一事件只有一条记录
  CONSTRAINT raw_events_unique UNIQUE (fixture_id, event_hash)
);

COMMENT ON TABLE raw_events IS 'RAW层 - 比赛事件（进球、换人、红黄牌等）';

-- Indexes for raw_events
CREATE INDEX IF NOT EXISTS idx_raw_events_fixture
  ON raw_events(fixture_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_type
  ON raw_events(fixture_id, event_type);
CREATE INDEX IF NOT EXISTS idx_raw_events_minute
  ON raw_events(fixture_id, minute);


-- 4. raw_odds - 赔率数据（动态市场结构）
CREATE TABLE IF NOT EXISTS raw_odds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  bookmaker TEXT NOT NULL,
  bookmaker_id INTEGER,
  -- 动态市场结构
  market TEXT NOT NULL,           -- '1X2', 'OU', 'AH', 'BTS', 'DNB' 等
  line NUMERIC(5,2),              -- 盘口线 (如 2.5, -0.5 等)
  selection TEXT NOT NULL,        -- 'Home', 'Away', 'Draw', 'Over', 'Under' 等
  odds NUMERIC(8,3) NOT NULL,     -- 赔率
  -- 滚球标记
  is_live BOOLEAN DEFAULT FALSE,
  -- 时间戳
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB,
  -- 唯一约束：完整的赔率定位
  CONSTRAINT raw_odds_unique UNIQUE (fixture_id, captured_at, bookmaker, market, COALESCE(line, 0), selection)
);

COMMENT ON TABLE raw_odds IS 'RAW层 - 赔率数据（动态市场结构，支持任意盘口）';

-- Indexes for raw_odds
CREATE INDEX IF NOT EXISTS idx_raw_odds_fixture
  ON raw_odds(fixture_id);
CREATE INDEX IF NOT EXISTS idx_raw_odds_market
  ON raw_odds(fixture_id, market, line);
CREATE INDEX IF NOT EXISTS idx_raw_odds_live
  ON raw_odds(fixture_id, is_live);
CREATE INDEX IF NOT EXISTS idx_raw_odds_captured
  ON raw_odds(captured_at);
CREATE INDEX IF NOT EXISTS idx_raw_odds_bookmaker
  ON raw_odds(bookmaker);


-- 5. raw_standings - 联赛积分榜
CREATE TABLE IF NOT EXISTS raw_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  team_name TEXT,
  team_logo TEXT,
  rank INTEGER NOT NULL,
  played INTEGER DEFAULT 0,
  won INTEGER DEFAULT 0,
  drawn INTEGER DEFAULT 0,
  lost INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  goal_diff INTEGER DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  form TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw JSONB,
  -- 唯一约束
  CONSTRAINT raw_standings_unique UNIQUE (league_id, season, team_id)
);

COMMENT ON TABLE raw_standings IS 'RAW层 - 联赛积分榜';

-- Indexes for raw_standings
CREATE INDEX IF NOT EXISTS idx_raw_standings_league
  ON raw_standings(league_id, season);
CREATE INDEX IF NOT EXISTS idx_raw_standings_team
  ON raw_standings(team_id);


-- 6. raw_team_stats - 球队赛季统计
CREATE TABLE IF NOT EXISTS raw_team_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id INTEGER NOT NULL,
  league_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  team_name TEXT,
  team_logo TEXT,
  -- 场次统计
  matches_played INTEGER DEFAULT 0,
  matches_home INTEGER DEFAULT 0,
  matches_away INTEGER DEFAULT 0,
  -- 进球统计
  goals_for_total INTEGER DEFAULT 0,
  goals_for_home INTEGER DEFAULT 0,
  goals_for_away INTEGER DEFAULT 0,
  goals_against_total INTEGER DEFAULT 0,
  goals_against_home INTEGER DEFAULT 0,
  goals_against_away INTEGER DEFAULT 0,
  -- 场均数据
  avg_goals_for NUMERIC(4,2),
  avg_goals_against NUMERIC(4,2),
  home_avg_goals NUMERIC(4,2),
  away_avg_goals NUMERIC(4,2),
  -- 概率数据
  over25_rate NUMERIC(5,2),
  btts_rate NUMERIC(5,2),
  clean_sheet_rate NUMERIC(5,2),
  failed_to_score_rate NUMERIC(5,2),
  -- 进球时段分布
  goals_0_15 NUMERIC(5,2),
  goals_16_30 NUMERIC(5,2),
  goals_31_45 NUMERIC(5,2),
  goals_46_60 NUMERIC(5,2),
  goals_61_75 NUMERIC(5,2),
  goals_76_90 NUMERIC(5,2),
  -- 失球时段分布
  against_0_15 NUMERIC(5,2),
  against_16_30 NUMERIC(5,2),
  against_31_45 NUMERIC(5,2),
  against_46_60 NUMERIC(5,2),
  against_61_75 NUMERIC(5,2),
  against_76_90 NUMERIC(5,2),
  -- 其他
  biggest_win TEXT,
  biggest_loss TEXT,
  longest_win_streak INTEGER,
  longest_unbeaten INTEGER,
  longest_losing INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw JSONB,
  -- 唯一约束
  CONSTRAINT raw_team_stats_unique UNIQUE (team_id, league_id, season)
);

COMMENT ON TABLE raw_team_stats IS 'RAW层 - 球队赛季统计';

-- Indexes for raw_team_stats
CREATE INDEX IF NOT EXISTS idx_raw_team_stats_team
  ON raw_team_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_raw_team_stats_league
  ON raw_team_stats(league_id, season);


-- 7. raw_h2h - 历史对战记录
CREATE TABLE IF NOT EXISTS raw_h2h (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team1_id INTEGER NOT NULL,
  team2_id INTEGER NOT NULL,
  fixture_id INTEGER NOT NULL,
  match_date DATE NOT NULL,
  league_id INTEGER,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  raw JSONB,
  -- 唯一约束
  CONSTRAINT raw_h2h_unique UNIQUE (team1_id, team2_id, fixture_id)
);

COMMENT ON TABLE raw_h2h IS 'RAW层 - 历史对战记录';

CREATE INDEX IF NOT EXISTS idx_raw_h2h_teams
  ON raw_h2h(team1_id, team2_id);


-- ============================================================
-- MODEL LAYER - 模型计算层
-- ============================================================

-- 1. model_match_state - 比赛状态模型（Module A）
CREATE TABLE IF NOT EXISTS model_match_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  -- 比分状态
  score_home INTEGER NOT NULL DEFAULT 0,
  score_away INTEGER NOT NULL DEFAULT 0,
  score_diff INTEGER GENERATED ALWAYS AS (score_home - score_away) STORED,
  -- 压迫指数
  pressure_index NUMERIC(5,2),       -- -100 到 100, 正数主队压迫
  pressure_direction TEXT,           -- 'home', 'away', 'neutral'
  -- 进攻状态
  attack_delta NUMERIC(5,2),         -- 进攻差值
  attack_intensity NUMERIC(5,2),     -- 进攻强度
  -- xG 状态
  xg_home NUMERIC(5,2),
  xg_away NUMERIC(5,2),
  xg_delta NUMERIC(5,2),             -- xG 差值
  xg_debt NUMERIC(5,2),              -- xG 欠债 (xG - 实际进球)
  -- 动量状态
  momentum_score NUMERIC(5,2),       -- 动量评分 0-100
  momentum_direction TEXT,           -- 'improving', 'declining', 'stable'
  -- 射门状态
  shot_intensity NUMERIC(5,2),       -- 射门强度
  shots_last_10 INTEGER,             -- 最近10分钟射门
  shots_last_20 INTEGER,             -- 最近20分钟射门
  -- 角球状态
  corner_intensity NUMERIC(5,2),     -- 角球强度
  corners_last_10 INTEGER,           -- 最近10分钟角球
  -- 换人状态
  subs_home INTEGER DEFAULT 0,
  subs_away INTEGER DEFAULT 0,
  recent_attack_subs INTEGER DEFAULT 0,
  -- 牌况状态
  red_card_advantage INTEGER DEFAULT 0,  -- 红牌优势 (正数=主队多人)
  -- 时间戳
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 唯一约束
  CONSTRAINT model_match_state_unique UNIQUE (fixture_id, minute, captured_at)
);

COMMENT ON TABLE model_match_state IS 'MODEL层 - 比赛状态模型（Module A 使用）';

CREATE INDEX IF NOT EXISTS idx_model_match_state_fixture
  ON model_match_state(fixture_id);
CREATE INDEX IF NOT EXISTS idx_model_match_state_time
  ON model_match_state(fixture_id, minute);
CREATE INDEX IF NOT EXISTS idx_model_match_state_momentum
  ON model_match_state(momentum_score);


-- 2. model_team_strength - 球队实力模型（Module B）
CREATE TABLE IF NOT EXISTS model_team_strength (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id INTEGER NOT NULL,
  season INTEGER NOT NULL,
  team_name TEXT,
  -- 实力评分
  strength_score NUMERIC(5,2),       -- 综合实力分 0-100
  attack_score NUMERIC(5,2),         -- 进攻评分 0-100
  defense_score NUMERIC(5,2),        -- 防守评分 0-100
  -- 倾向性
  over25_bias NUMERIC(5,2),          -- 大球倾向 -50 到 50
  btts_bias NUMERIC(5,2),            -- 双方进球倾向
  -- 逆转能力
  comeback_rate NUMERIC(5,2),        -- 逆转率 %
  comeback_score NUMERIC(5,2),       -- 逆转能力评分
  -- 75+ 分钟特性
  late_goal_rate NUMERIC(5,2),       -- 75+ 进球率 %
  late_concede_rate NUMERIC(5,2),    -- 75+ 失球率 %
  late_goal_score NUMERIC(5,2),      -- 75+ 进球能力评分
  -- 状态趋势
  form_trend NUMERIC(5,2),           -- 状态趋势 -50 到 50
  form_score NUMERIC(5,2),           -- 状态评分
  -- 主客场差异
  home_strength NUMERIC(5,2),
  away_strength NUMERIC(5,2),
  -- 更新时间
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- 唯一约束
  CONSTRAINT model_team_strength_unique UNIQUE (team_id, season)
);

COMMENT ON TABLE model_team_strength IS 'MODEL层 - 球队实力模型（Module B 使用）';

CREATE INDEX IF NOT EXISTS idx_model_team_strength_team
  ON model_team_strength(team_id);
CREATE INDEX IF NOT EXISTS idx_model_team_strength_strength
  ON model_team_strength(strength_score);


-- 3. model_market_state - 市场状态模型（Module C/D）
CREATE TABLE IF NOT EXISTS model_market_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  -- 隐含概率
  implied_home NUMERIC(5,2),         -- 隐含主胜概率 %
  implied_away NUMERIC(5,2),         -- 隐含客胜概率 %
  implied_draw NUMERIC(5,2),         -- 隐含平局概率 %
  -- 大小球
  over25_prob NUMERIC(5,2),          -- 隐含大2.5概率 %
  over35_prob NUMERIC(5,2),          -- 隐含大3.5概率 %
  under25_prob NUMERIC(5,2),         -- 隐含小2.5概率 %
  -- 让球
  ah_line NUMERIC(5,2),              -- 亚盘线
  ah_home_prob NUMERIC(5,2),         -- 亚盘主队概率
  ah_away_prob NUMERIC(5,2),         -- 亚盘客队概率
  -- 盘口移动
  line_movement_score NUMERIC(5,2),  -- 盘口移动评分 -50 到 50
  line_direction TEXT,               -- 'narrowing', 'widening', 'stable'
  -- 波动性
  volatility_index NUMERIC(5,2),     -- 波动指数 0-100
  -- 市场情绪
  market_sentiment TEXT,             -- 'home_favored', 'away_favored', 'balanced'
  market_confidence NUMERIC(5,2),    -- 市场信心度
  -- 异常检测
  anomaly_detected BOOLEAN DEFAULT FALSE,
  anomaly_type TEXT,
  anomaly_score NUMERIC(5,2),
  -- 时间戳
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 唯一约束
  CONSTRAINT model_market_state_unique UNIQUE (fixture_id, captured_at)
);

COMMENT ON TABLE model_market_state IS 'MODEL层 - 市场状态模型（Module C/D 使用）';

CREATE INDEX IF NOT EXISTS idx_model_market_state_fixture
  ON model_market_state(fixture_id);
CREATE INDEX IF NOT EXISTS idx_model_market_state_captured
  ON model_market_state(captured_at);


-- ============================================================
-- SIGNAL LAYER - 信号输出层
-- ============================================================

-- 1. model_signals - 模块信号输出
CREATE TABLE IF NOT EXISTS model_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id INTEGER NOT NULL,
  -- 模块信息
  module_type TEXT NOT NULL,         -- 'A', 'B', 'C', 'D', 'COMBINED'
  module_version TEXT DEFAULT 'v1',
  -- 触发信息
  trigger_minute INTEGER NOT NULL,
  trigger_score_home INTEGER,
  trigger_score_away INTEGER,
  -- 评分
  heat_score INTEGER NOT NULL,       -- 热度评分 0-100
  confidence_score INTEGER,          -- 置信度 0-100
  -- 信号详情
  signal_type TEXT,                  -- 'GOAL_ALERT', 'MOMENTUM_SHIFT', 'MARKET_MOVE' 等
  signal_strength TEXT,              -- 'STRONG', 'MEDIUM', 'WEAK'
  -- 评分因子详情
  factors JSONB,                     -- 各因子得分详情
  reasons JSONB,                     -- 触发原因列表
  -- 预测
  predicted_outcome TEXT,
  predicted_confidence NUMERIC(5,2),
  -- 时间
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- 索引
  CONSTRAINT model_signals_pk PRIMARY KEY (id)
);

COMMENT ON TABLE model_signals IS 'SIGNAL层 - 模块信号输出';

CREATE INDEX IF NOT EXISTS idx_model_signals_fixture
  ON model_signals(fixture_id);
CREATE INDEX IF NOT EXISTS idx_model_signals_module
  ON model_signals(module_type);
CREATE INDEX IF NOT EXISTS idx_model_signals_score
  ON model_signals(heat_score);
CREATE INDEX IF NOT EXISTS idx_model_signals_time
  ON model_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_model_signals_minute
  ON model_signals(trigger_minute);


-- ============================================================
-- RLS 策略
-- ============================================================

-- 启用 RLS
ALTER TABLE raw_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_team_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_h2h ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_match_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_team_strength ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_market_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_signals ENABLE ROW LEVEL SECURITY;

-- RAW 层 - 只读访问（anon 角色）
CREATE POLICY "raw_fixtures_anon_read" ON raw_fixtures
  FOR SELECT TO anon USING (true);

CREATE POLICY "raw_statistics_anon_read" ON raw_statistics
  FOR SELECT TO anon USING (true);

CREATE POLICY "raw_events_anon_read" ON raw_events
  FOR SELECT TO anon USING (true);

CREATE POLICY "raw_odds_anon_read" ON raw_odds
  FOR SELECT TO anon USING (true);

CREATE POLICY "raw_standings_anon_read" ON raw_standings
  FOR SELECT TO anon USING (true);

CREATE POLICY "raw_team_stats_anon_read" ON raw_team_stats
  FOR SELECT TO anon USING (true);

CREATE POLICY "raw_h2h_anon_read" ON raw_h2h
  FOR SELECT TO anon USING (true);

-- RAW 层 - 完整访问（service_role 角色 - 用于数据写入）
CREATE POLICY "raw_fixtures_service_all" ON raw_fixtures
  FOR ALL TO service_role USING (true);

CREATE POLICY "raw_statistics_service_all" ON raw_statistics
  FOR ALL TO service_role USING (true);

CREATE POLICY "raw_events_service_all" ON raw_events
  FOR ALL TO service_role USING (true);

CREATE POLICY "raw_odds_service_all" ON raw_odds
  FOR ALL TO service_role USING (true);

CREATE POLICY "raw_standings_service_all" ON raw_standings
  FOR ALL TO service_role USING (true);

CREATE POLICY "raw_team_stats_service_all" ON raw_team_stats
  FOR ALL TO service_role USING (true);

CREATE POLICY "raw_h2h_service_all" ON raw_h2h
  FOR ALL TO service_role USING (true);

-- MODEL 层 - 只读访问（anon 角色）
CREATE POLICY "model_match_state_anon_read" ON model_match_state
  FOR SELECT TO anon USING (true);

CREATE POLICY "model_team_strength_anon_read" ON model_team_strength
  FOR SELECT TO anon USING (true);

CREATE POLICY "model_market_state_anon_read" ON model_market_state
  FOR SELECT TO anon USING (true);

-- MODEL 层 - 完整访问（service_role 角色）
CREATE POLICY "model_match_state_service_all" ON model_match_state
  FOR ALL TO service_role USING (true);

CREATE POLICY "model_team_strength_service_all" ON model_team_strength
  FOR ALL TO service_role USING (true);

CREATE POLICY "model_market_state_service_all" ON model_market_state
  FOR ALL TO service_role USING (true);

-- SIGNAL 层
CREATE POLICY "model_signals_anon_read" ON model_signals
  FOR SELECT TO anon USING (true);

CREATE POLICY "model_signals_service_all" ON model_signals
  FOR ALL TO service_role USING (true);


-- ============================================================
-- 函数: 自动更新 updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用到相关表
CREATE TRIGGER update_raw_fixtures_updated_at
  BEFORE UPDATE ON raw_fixtures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_raw_standings_updated_at
  BEFORE UPDATE ON raw_standings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_raw_team_stats_updated_at
  BEFORE UPDATE ON raw_team_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_raw_h2h_updated_at
  BEFORE UPDATE ON raw_h2h
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_team_strength_updated_at
  BEFORE UPDATE ON model_team_strength
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 完成
-- ============================================================

-- 确认迁移完成
DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'ARCHITECTURE_FREEZE_V1 Migration Completed Successfully';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'RAW Layer: raw_fixtures, raw_statistics, raw_events, raw_odds, raw_standings, raw_team_stats, raw_h2h';
  RAISE NOTICE 'MODEL Layer: model_match_state, model_team_strength, model_market_state';
  RAISE NOTICE 'SIGNAL Layer: model_signals';
  RAISE NOTICE '============================================================';
END $$;
