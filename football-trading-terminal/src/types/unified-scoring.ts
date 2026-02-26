// ============================================================
// FOUR-MODULE UNIFIED SCORING FRAMEWORK - Type Definitions
// v1.0 | ARCHITECTURE_FREEZE_V1 Compatible
// ============================================================

// ============================================================
// 模块类型
// ============================================================

export type ModuleType = 'A' | 'B' | 'C' | 'D' | 'LATE';

export const MODULE_NAMES: Record<ModuleType, string> = {
  A: '大球冲刺',    // Over Sprint (legacy)
  B: '强队反扑',    // Strong Team Comeback (legacy)
  C: '盘口错位',    // Line Mispricing
  D: '水位异常',    // Odds Anomaly
  LATE: '晚期统一', // Unified Late Module (A+B merged)
};

export const MODULE_DESCRIPTIONS: Record<ModuleType, string> = {
  A: '预测后段进球/大球方向机会 (70\'~90\'+)',
  B: '强队落后/逼平时末段反扑 (60\'~90\')',
  C: '统计态势与盘口定价不一致 (20\'~80\')',
  D: '盘口/水位异常跳变且无显性事件解释',
  LATE: '统一晚期模块 - 大球冲刺+强队追分 (65\'~90\'+)',
};

// ============================================================
// 行动建议
// ============================================================

export type ActionType = 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE';

export const ACTION_THRESHOLDS = {
  BET: { minScore: 85, minConfidence: 70 },
  PREPARE: { minScore: 80, minConfidence: 55 },
  WATCH: { minScore: 70, minConfidence: 0 },
  IGNORE: { minScore: 0, minConfidence: 0 },
} as const;

export const ACTION_LABELS: Record<ActionType, { label: string; color: string; bgColor: string }> = {
  BET: { label: '下注', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
  PREPARE: { label: '准备', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)' },
  WATCH: { label: '关注', color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.15)' },
  IGNORE: { label: '忽略', color: '#6b7280', bgColor: 'rgba(107, 114, 128, 0.15)' },
};

// ============================================================
// 下注计划
// ============================================================

export type MarketType = 'OU' | 'AH' | '1X2' | 'BTS' | 'DNB';

export interface BetPlan {
  market: MarketType;           // 盘口类型
  line: number;                 // 盘口线 (2.5, -0.5, etc.)
  selection: string;            // 选项 (OVER, HOME, YES, etc.)
  odds_min: number;             // 最低可接受赔率
  stake_pct: number;            // 建议本金比例 (0.5~2%)
  ttl_minutes: number;          // 信号有效期 (分钟)
}

// ============================================================
// 结构化理由 (Reasons)
// ============================================================

export interface SignalReasons {
  // 比赛态势摘要
  state: {
    minute: number;
    score_home: number;
    score_away: number;
    status: string;              // 'draw', 'home_leading', 'away_leading'
    score_diff: number;
    is_second_half: boolean;
    is_injury_time: boolean;
  };

  // 统计数据摘要
  stats: {
    shots_total: number;
    shots_on_total: number;
    shot_accuracy: number;       // 射正率 %
    xg_home: number;
    xg_away: number;
    xg_total: number;
    xg_debt: number;             // xG - 实际进球
    corners_total: number;
    possession_home: number;
    possession_away: number;
    dangerous_attacks_home: number;
    dangerous_attacks_away: number;
  };

  // 市场/盘口摘要
  market: {
    over_odds: number | null;    // 大球赔率
    under_odds: number | null;
    ah_line: number | null;      // 亚盘线
    ah_home: number | null;
    ah_away: number | null;
    implied_over_prob: number | null;  // 隐含大球概率 %
    line_movement: 'UP' | 'DOWN' | 'STABLE' | null;
    market_sentiment: 'HOME_FAVORED' | 'AWAY_FAVORED' | 'BALANCED' | null;
  };

  // 动量/变化摘要
  deltas: {
    shots_last_15: number;       // 最近15分钟射门
    shots_delta: number;         // 与前15分钟比较
    xg_last_15: number;
    xg_velocity: number;         // xG增长速度 (per 15min)
    corners_last_15: number;
    pressure_direction: 'HOME' | 'AWAY' | 'BALANCED';
    momentum_trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  };

  // 场景标签
  tags: string[];

  // 数据质量检查
  checks: {
    has_stats: boolean;
    has_events: boolean;
    has_odds: boolean;
    stats_fresh: boolean;        // 数据是否新鲜 (<2min)
    data_anomaly: boolean;       // 数据异常标记
    anomaly_reason: string | null;
  };
}

// ============================================================
// 评分组件详情
// ============================================================

// Base 评分 (0-20)
export interface BaseScoreDetails {
  score_state: number;           // 比分状态得分 (0-8)
  total_goals: number;           // 当前总进球
  goal_diff: number;
  is_draw: boolean;
}

// Edge 评分 (0-30) - 模块特定
export interface EdgeScoreDetails {
  total: number;
  components: Record<string, number>;  // 各组件得分
  description: string[];               // 可读描述
}

// Timing 评分 (0-20)
export interface TimingScoreDetails {
  minute: number;
  window_score: number;          // 时间窗口得分
  is_peak_window: boolean;       // 是否在峰值窗口
  urgency_bonus: number;         // 紧迫性加成
}

// Market 评分 (0-20)
export interface MarketScoreDetails {
  total: number;
  line_movement: number;         // 盘口移动得分
  price_drift: number;           // 价格漂移得分
  consistency: number;           // 一致性得分
  has_data: boolean;
}

// Quality 评分 (-10 ~ +10)
export interface QualityScoreDetails {
  total: number;
  data_completeness: number;     // 数据完整度
  freshness: number;             // 数据新鲜度
  anomaly_penalty: number;       // 异常扣分
}

// ============================================================
// 置信度组件详情
// ============================================================

export interface ConfidenceDetails {
  total: number;                 // 0-100
  data_completeness: number;     // 0-35
  freshness_stability: number;   // 0-20
  cross_source_consistency: number;  // 0-25
  market_confirmation: number;   // 0-20
}

// ============================================================
// 统一信号输出 (所有模块必须返回此结构)
// ============================================================

export interface UnifiedSignal {
  // 标识
  fixture_id: number;
  module: ModuleType;

  // 时间
  minute: number;
  captured_at: string;           // ISO timestamp

  // 核心评分
  score: number;                 // 0-100
  confidence: number;            // 0-100

  // 行动建议
  action: ActionType;
  bet_plan: BetPlan | null;

  // 评分详情
  score_breakdown: {
    base: BaseScoreDetails;
    edge: EdgeScoreDetails;
    timing: TimingScoreDetails;
    market: MarketScoreDetails;
    quality: QualityScoreDetails;
  };

  // 置信度详情
  confidence_breakdown: ConfidenceDetails;

  // 结构化理由
  reasons: SignalReasons;

  // 元数据
  _version: string;              // 'v1.0'
  _data_mode: 'STRICT_REAL_DATA';
}

// ============================================================
// 模块 A 特定类型 (大球冲刺)
// ============================================================

export interface ModuleAEdgeDetails extends EdgeScoreDetails {
  components: {
    pressure_index: number;      // 压制强度 (0-12)
    xg_velocity: number;         // xG增长速度 (0-8)
    shot_quality: number;        // 射正率/转化潜力 (0-6)
    game_state_bias: number;     // 比分结构 (0-4)
  };
}

export interface ModuleASignal extends UnifiedSignal {
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
// 模块 B 特定类型 (强队反扑)
// ============================================================

export interface ModuleBEdgeDetails extends EdgeScoreDetails {
  components: {
    strength_gap: number;        // 强弱差 (0-10)
    trailing_state: number;      // 落后/平局压力 (0-6)
    rally_momentum: number;      // 反扑动量 (0-10)
    finishing_support: number;   // 阵容/换人 (0-4)
  };
}

export interface ModuleBSignal extends UnifiedSignal {
  module: 'B';
  score_breakdown: {
    base: BaseScoreDetails;
    edge: ModuleBEdgeDetails;
    timing: TimingScoreDetails;
    market: MarketScoreDetails;
    quality: QualityScoreDetails;
  };
}

// ============================================================
// 模块 C 特定类型 (盘口错位)
// ============================================================

export interface ModuleCEdgeDetails extends EdgeScoreDetails {
  components: {
    model_vs_market_gap: number; // 模型-市场差 (0-20)
    lag_score: number;           // 盘口滞后 (0-10)
  };
}

export interface ModuleCSignal extends UnifiedSignal {
  module: 'C';
  score_breakdown: {
    base: BaseScoreDetails;
    edge: ModuleCEdgeDetails;
    timing: TimingScoreDetails;
    market: MarketScoreDetails;
    quality: QualityScoreDetails;
  };
}

// ============================================================
// 模块 D 特定类型 (水位异常)
// ============================================================

export interface ModuleDEdgeDetails extends EdgeScoreDetails {
  components: {
    jump_magnitude: number;      // 跳变幅度 (0-12)
    jump_speed: number;          // 跳变速度 (0-8)
    unexplained_factor: number;  // 不可解释性 (0-10)
  };
}

export interface ModuleDSignal extends UnifiedSignal {
  module: 'D';
  score_breakdown: {
    base: BaseScoreDetails;
    edge: ModuleDEdgeDetails;
    timing: TimingScoreDetails;
    market: MarketScoreDetails;
    quality: QualityScoreDetails;
  };
}

// ============================================================
// 输入数据类型 (从 RAW/MODEL 层读取)
// ============================================================

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

  // 时间序列 (最近15分钟)
  shots_last_15?: number;
  xg_last_15?: number;
  corners_last_15?: number;

  // 历史/对比数据
  shots_prev_15?: number;
  xg_prev_15?: number;

  // 事件数据
  red_cards_home: number;
  red_cards_away: number;
  recent_goals: number;          // 最近15分钟进球数
  recent_subs_attack: number;    // 最近进攻换人数

  // 数据质量
  stats_available: boolean;
  events_available: boolean;
  data_timestamp: string;
}

export interface MarketStateInput {
  fixture_id: number;

  // 大小球
  over_odds: number | null;
  under_odds: number | null;
  ou_line: number | null;

  // 亚盘
  ah_line: number | null;
  ah_home: number | null;
  ah_away: number | null;

  // 胜平负
  win_home: number | null;
  win_draw: number | null;
  win_away: number | null;

  // 变动
  over_odds_prev: number | null;
  ah_line_prev: number | null;

  // 元数据
  bookmaker: string;
  is_live: boolean;
  captured_at: string;
}

export interface TeamStrengthInput {
  team_id: number;
  strength_score: number;
  attack_score: number;
  defense_score: number;
  late_goal_rate: number;        // 75+ 进球率
  comeback_rate: number;
  form_trend: number;
}

// ============================================================
// 验证/回测类型
// ============================================================

export interface SignalValidation {
  signal_id: string;
  fixture_id: number;
  module: ModuleType;
  trigger_minute: number;
  trigger_score: number;
  trigger_confidence: number;
  action: ActionType;

  // 结果
  had_goal_after: boolean;
  goals_after_trigger: number;
  first_goal_minute: number | null;
  final_score_home: number;
  final_score_away: number;

  // 评估
  is_hit: boolean;               // 信号命中
  hit_criteria: string;          // 命中标准描述
  profit_if_bet: number | null;  // 如果下注的盈亏
}

export interface BacktestResult {
  module: ModuleType;
  total_signals: number;
  hit_count: number;
  hit_rate: number;

  // 按 action 分组
  by_action: Record<ActionType, {
    count: number;
    hit_count: number;
    hit_rate: number;
  }>;

  // 按 score 分组
  by_score_range: Record<string, {
    count: number;
    hit_count: number;
    hit_rate: number;
  }>;

  // 按 confidence 分组
  by_confidence_range: Record<string, {
    count: number;
    hit_count: number;
    hit_rate: number;
  }>;
}

// ============================================================
// 工具函数类型
// ============================================================

export type ContinuousMapper = (value: number) => number;

export interface MapperConfig {
  ranges: Array<{
    min: number;
    max: number;
    output_min: number;
    output_max: number;
  }>;
  cap?: number;
}
