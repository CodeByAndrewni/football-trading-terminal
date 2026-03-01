/*
============================================================
UNIFIED SCORING TYPES - 四模块统一评分系统类型定义
Version: 1.0
============================================================
*/

// ============================================================
// 基础类型定义
// ============================================================

/** 模块类型 */
export type ModuleType = 'A' | 'B' | 'C' | 'D' | 'LATE';

/** 行动类型 */
export type ActionType = 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE';

/** 模块名称 */
export const MODULE_NAMES: Record<ModuleType, string> = {
  A: '大球冲刺',
  B: '强队反扑',
  C: '角球追击',
  D: '防守破裂',
  LATE: '晚期统一',
};

/** 模块描述 */
export const MODULE_DESCRIPTIONS: Record<ModuleType, string> = {
  A: '70-90+分钟大球方向信号',
  B: '强队落后追分信号',
  C: '角球市场机会信号',
  D: '防守崩溃信号',
  LATE: '65-90+分钟统一晚期信号',
};

/** 行动标签（字符串版本） */
export const ACTION_LABELS: Record<ActionType, string> = {
  BET: '下注',
  PREPARE: '准备',
  WATCH: '关注',
  IGNORE: '忽略',
};

/** 行动标签（带样式） */
export const ACTION_LABELS_STYLED: Record<ActionType, { label: string; color: string; bgColor: string }> = {
  BET: { label: '下注', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.2)' },
  PREPARE: { label: '准备', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.2)' },
  WATCH: { label: '关注', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.2)' },
  IGNORE: { label: '忽略', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.2)' },
};

// ============================================================
// 输入类型定义
// ============================================================

/** 比赛状态输入 */
export interface MatchStateInput {
  fixture_id: number;
  minute: number;
  score_home: number;
  score_away: number;
  status: string;

  // 统计数据
  shots_home: number;
  shots_away: number;
  shots_on_home: number;
  shots_on_away: number;
  xg_home: number;
  xg_away: number;
  corners_home: number;
  corners_away: number;
  possession_home: number;
  possession_away: number;
  dangerous_home: number;
  dangerous_away: number;

  // 时间序列数据
  shots_last_15?: number;
  xg_last_15?: number;
  corners_last_15?: number;
  shots_prev_15?: number;
  xg_prev_15?: number;

  // 事件数据
  red_cards_home: number;
  red_cards_away: number;
  recent_goals: number;
  recent_subs_attack: number;

  // 数据质量
  stats_available: boolean;
  events_available: boolean;
  data_timestamp: string;
}

/** 市场状态输入 */
export interface MarketStateInput {
  fixture_id: number;

  // 大小球
  over_odds: number | null;
  under_odds: number | null;
  over_odds_prev?: number | null;
  ou_line: number | null;

  // 亚盘
  ah_line: number | null;
  ah_home: number | null;
  ah_away: number | null;
  ah_line_prev?: number | null;

  // 胜平负
  win_home: number | null;
  win_draw: number | null;
  win_away: number | null;

  // 元数据
  bookmaker: string;
  is_live: boolean;
  captured_at: string;
}

/** 球队强弱输入 */
export interface TeamStrengthInput {
  home_rank?: number;
  away_rank?: number;
  home_points?: number;
  away_points?: number;
  home_form?: number;  // 最近5场胜率
  away_form?: number;
  strength_gap?: number;  // 0-100
}

// ============================================================
// 评分细节类型定义
// ============================================================

/** Base 评分详情 (0-20) */
export interface BaseScoreDetails {
  score_state: number;
  total_goals: number;
  goal_diff: number;
  is_draw: boolean;
  total?: number;
}

/** Edge 评分详情 (0-30) */
export interface EdgeScoreDetails {
  total: number;
  description: string[];
  components?: Record<string, number>;
}

/** Timing 评分详情 (0-20) */
export interface TimingScoreDetails {
  minute: number;
  time_multiplier?: number;   // 时间乘数 - 可选
  urgency_bonus: number;
  total?: number;             // 总分 - 可选
  window_score?: number;      // 时间窗口评分
  is_peak_window?: boolean;   // 是否高峰时间窗口
}

/** Market 评分详情 (0-20) */
export interface MarketScoreDetails {
  over_odds?: number | null;  // 大球赔率 - 可选
  odds_value?: number;        // 赔率值 - 可选
  line_movement: number;
  total: number;
  price_drift?: number;       // 价格漂移
  consistency?: number;       // 一致性
  has_data?: boolean;         // 是否有数据
}

/** Quality 评分详情 (0-10) */
export interface QualityScoreDetails {
  data_completeness: number;
  consistency?: number;       // 一致性 (可选)
  total: number;
  freshness?: number;         // 数据新鲜度
  anomaly_penalty?: number;   // 异常惩罚
}

/** 置信度详情 */
export interface ConfidenceDetails {
  base_confidence?: number;
  data_quality_factor?: number;
  consistency_factor?: number;
  final_confidence?: number;
  total?: number;                    // 总置信度
  data_completeness?: number;        // 数据完整度
  freshness_stability?: number;      // 新鲜稳定度
  cross_source_consistency?: number; // 跨源一致性
  market_confirmation?: number;      // 市场确认度
}

// ============================================================
// 信号原因类型定义
// ============================================================

/** 信号原因 - 状态信息 */
export interface SignalReasonsState {
  status?: string;
  score_home?: number;
  score_away?: number;
  score_diff?: number;
  is_second_half?: boolean;
  is_draw?: boolean;
  minute?: number;
  is_injury_time?: boolean;  // 补时阶段
}

/** 信号原因 - 统计信息 */
export interface SignalReasonsStats {
  shots_total?: number;
  shots_on_total?: number;
  xg_total?: number;
  xg_debt?: number;
  xg_home?: number;              // 主队xG
  xg_away?: number;              // 客队xG
  corners_total?: number;
  possession_home?: number;
  possession_away?: number;
  shot_accuracy?: number;        // 射门准确率
  dangerous_attacks_home?: number;  // 主队危险进攻
  dangerous_attacks_away?: number;  // 客队危险进攻
}

/** 信号原因 - 变化信息 */
export interface SignalReasonsDeltas {
  shots_last_15?: number;
  shots_delta?: number;
  pressure_direction?: string;
  momentum_trend?: string;
  xg_last_15?: number;       // 最近15分钟xG
  xg_velocity?: number;      // xG增长速度
  corners_last_15?: number;  // 最近15分钟角球
}

/** 信号原因 - 检查信息 */
export interface SignalReasonsChecks {
  has_stats?: boolean;
  has_events?: boolean;
  has_odds?: boolean;
  stats_fresh?: boolean;
  data_anomaly?: boolean;
  anomaly_reason?: string;
}

/** 信号原因 - 市场信息 */
export interface SignalReasonsMarket {
  over_odds?: number;
  under_odds?: number;
  ah_line?: number;
  ah_home?: number;
  ah_away?: number;
  implied_over_prob?: number;
  line_movement?: string;
  market_sentiment?: string;
}

/** 信号原因 */
export interface SignalReasons {
  primary: string;
  secondary: string[];
  warnings?: string[];
  tags?: string[];  // 场景标签
  state?: SignalReasonsState;
  stats?: SignalReasonsStats;
  deltas?: SignalReasonsDeltas;
  checks?: SignalReasonsChecks;
  market?: SignalReasonsMarket;
}

/** 下注计划 */
export interface BetPlan {
  market: 'OU' | 'AH' | '1X2' | 'CORNERS';
  line: number;
  selection: 'OVER' | 'UNDER' | 'HOME' | 'AWAY' | 'DRAW' | string;
  odds_min: number;
  stake_pct: number;
  ttl_minutes: number;
}

/** 统一信号输出 */
export interface UnifiedSignal {
  // 元信息
  module: ModuleType;
  version: string;
  timestamp: string;
  fixture_id: number;
  minute?: number;           // 比赛分钟
  captured_at?: string;      // 捕获时间

  // 核心输出
  score: number;           // 0-100
  confidence: number;      // 0-100
  action: ActionType;

  // 评分分解
  score_breakdown: {
    base: BaseScoreDetails;
    edge: EdgeScoreDetails;
    timing: TimingScoreDetails;
    market: MarketScoreDetails;
    quality: QualityScoreDetails;
  };

  // 置信度分解
  confidence_breakdown: ConfidenceDetails;

  // 原因说明
  reasons: SignalReasons;

  // 下注计划
  bet_plan: BetPlan | null;

  // 标签
  tags: string[];
}

// ============================================================
// Module A 特定类型
// ============================================================

/** Module A Edge 详情 */
export interface ModuleAEdgeDetails extends EdgeScoreDetails {
  components: {
    pressure_index: number;    // 压制强度 (0-12)
    xg_velocity: number;       // xG增长速度 (0-8)
    shot_quality: number;      // 射门质量 (0-6)
    xg_debt?: number;          // xG欠债 (0-4) - 可选
    game_state_bias?: number;  // 比赛状态偏差 - 可选
  };
}

/** Module A 信号 */
export interface ModuleASignal extends Omit<UnifiedSignal, 'module' | 'score_breakdown'> {
  module: 'A';
  score_breakdown: {
    base: BaseScoreDetails;
    edge: ModuleAEdgeDetails;
    timing: TimingScoreDetails;
    market: MarketScoreDetails;
    quality: QualityScoreDetails;
  };
}

// ============================================================
// 回测类型定义
// ============================================================

/** 回测结果 */
export interface BacktestResult {
  fixture_id?: number;
  signal?: UnifiedSignal;
  actual_outcome?: {
    final_score_home: number;
    final_score_away: number;
    goals_after_signal: number;
  };
  is_success?: boolean;
  roi?: number;
  module?: ModuleType;
  // 聚合结果属性
  total_signals?: number;
  hit_count?: number;
  hit_rate?: number;
  by_action?: Record<ActionType, { count: number; hit_count: number; hit_rate: number }>;
  by_score_range?: Record<string, { count: number; hit_count: number; hit_rate: number }>;
  by_confidence_range?: Record<string, { count: number; hit_count: number; hit_rate: number }>;
}

/** 信号验证 */
export interface SignalValidation {
  signal_id: string;
  created_at?: string;
  settled_at?: string;
  outcome?: 'WIN' | 'LOSE' | 'PUSH' | 'VOID';
  pnl?: number;
  // 扩展属性
  fixture_id?: number;
  module?: ModuleType;
  action?: ActionType;
  trigger_minute?: number;
  trigger_score?: number;
  trigger_confidence?: number;
  is_hit?: boolean;
  goals_after?: number;
  goals_after_trigger?: number;
  had_goal_after?: boolean;
  first_goal_minute?: number | null;
  final_score_home?: number;
  final_score_away?: number;
  hit_minute?: number;
  hit_criteria?: string;
  profit_if_bet?: number | null;
}

// ============================================================
// 映射器类型定义
// ============================================================

/** 映射器范围配置 */
export interface MapperRange {
  min: number;
  max: number;
  output_min: number;
  output_max: number;
}

/** 映射器配置 */
export interface MapperConfig {
  name?: string;  // 可选名称
  ranges: MapperRange[];
  cap?: number;
}

/** 连续映射函数类型 */
export type ContinuousMapper = (value: number) => number;
