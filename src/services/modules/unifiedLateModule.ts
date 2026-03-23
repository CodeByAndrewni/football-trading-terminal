// ============================================================
// UNIFIED LATE MODULE: 统一晚期模块
// 合并 Module A (大球冲刺) + Module B (强队反扑)
// 时间窗口: 65-90+ 分钟
// Version: 1.0
// ============================================================

import type {
  UnifiedSignal,
  BaseScoreDetails,
  EdgeScoreDetails,
  TimingScoreDetails,
  MarketScoreDetails,
  QualityScoreDetails,
  ConfidenceDetails,
  SignalReasons,
  BetPlan,
  ActionType,
  MatchStateInput,
  MarketStateInput,
} from '../../types/unified-scoring';

import {
  shotsToScore,
  xgToScore,
  xgDebtToScore,
  xgVelocityToScore,
  cornersToScore,
  recentShotsToScore,
  minuteToTimingScoreA,
  scoreDiffToBase,
  gameStateToBias,
  calculatePressureIndex,
  overOddsChangeToScore,
} from '../continuousMappers';

import { getTimeMultiplier, poissonLateGoalProbability, calculateUrgencyBonus } from '../lateGameScoring';

// ============================================================
// 类型定义
// ============================================================

/** 场景标签 */
export type ScenarioTag =
  | 'OVER_SPRINT'      // 大球冲刺: xG > goals, 射门活跃
  | 'STRONG_BEHIND'    // 强队追分: 强队落后/逼平
  | 'DEADLOCK_BREAK'   // 破僵局: 0-0 或低进球僵持
  | 'WEAK_DEFEND'      // 弱队守成: 弱队领先, 防守态势
  | 'BLOWOUT'          // 大比分: 3+球差
  | 'BALANCED_LATE'    // 均势末段
  | 'GENERIC';         // 通用场景

/** 强弱队信息 */
export interface TeamStrengthInfo {
  homeStrength: number;     // 0-100
  awayStrength: number;     // 0-100
  isHomeStrong: boolean;
  isAwayStrong: boolean;
  strengthGap: number;      // 强弱差 (0-50)
}

/** 晚期模块 Edge 详情 */
export interface UnifiedLateEdgeDetails extends EdgeScoreDetails {
  components: {
    // 来自 Module A
    pressure_index: number;      // 压制强度 (0-12)
    xg_velocity: number;         // xG增长速度 (0-8)
    shot_quality: number;        // 射门质量 (0-6)

    // 来自 Module B
    strength_gap: number;        // 强弱差 (0-8)
    trailing_pressure: number;   // 落后/追分压力 (0-6)

    // 合并后
    scenario_bonus: number;      // 场景加成 (0-10)
  };
}

/** 晚期模块信号 */
export interface UnifiedLateSignal extends Omit<UnifiedSignal, 'module' | 'score_breakdown'> {
  module: 'LATE';

  // 场景信息
  scenario_tag: ScenarioTag;
  is_warmup: boolean;           // 是否预热模式 (65-79分钟)

  // 评分详情
  score_breakdown: {
    base: BaseScoreDetails;
    edge: UnifiedLateEdgeDetails;
    timing: TimingScoreDetails;
    market: MarketScoreDetails;
    quality: QualityScoreDetails;
  };

  // 强弱队信息
  team_strength?: TeamStrengthInfo;

  // 泊松概率
  poisson_goal_prob: number;
}

// ============================================================
// 常量
// ============================================================

const MODULE_VERSION = 'v1.0';

import { STRATEGY_CONFIG } from '../../config/strategyConfig';

const WARMUP_MINUTE = STRATEGY_CONFIG.WARMUP_MINUTE;
const ACTIVE_MINUTE = STRATEGY_CONFIG.ACTIVE_MINUTE;

/** 信号触发阈值 */
const SIGNAL_THRESHOLDS = {
  // 预热模式: 更宽松的阈值，但带警告
  WARMUP: {
    MIN_SCORE: 60,
    MIN_CONFIDENCE: 40,
  },
  // 激活模式: 正式信号
  ACTIVE: {
    BET_SCORE: 85,
    BET_CONFIDENCE: 70,
    PREPARE_SCORE: 75,
    PREPARE_CONFIDENCE: 55,
    WATCH_SCORE: 65,
  },
} as const;

// ============================================================
// 场景检测
// ============================================================

/**
 * 判断场景标签
 */
function detectScenario(
  matchState: MatchStateInput,
  teamStrength?: TeamStrengthInfo
): ScenarioTag {
  const { score_home, score_away, minute, xg_home, xg_away } = matchState;
  const totalGoals = score_home + score_away;
  const goalDiff = score_home - score_away;
  const absDiff = Math.abs(goalDiff);
  const xgTotal = xg_home + xg_away;
  const xgDebt = xgTotal - totalGoals;

  // 1. 大比分 - 信号减弱
  if (absDiff >= 3) {
    return 'BLOWOUT';
  }

  // 2. 强队追分
  if (teamStrength) {
    const { isHomeStrong, isAwayStrong, strengthGap } = teamStrength;

    // 强队落后
    if (isHomeStrong && goalDiff < 0 && strengthGap >= 10) {
      return 'STRONG_BEHIND';
    }
    if (isAwayStrong && goalDiff > 0 && strengthGap >= 10) {
      return 'STRONG_BEHIND';
    }

    // 强队逼平且占优
    if (isHomeStrong && goalDiff === 0 && xg_home > xg_away + 0.5) {
      return 'STRONG_BEHIND';
    }
    if (isAwayStrong && goalDiff === 0 && xg_away > xg_home + 0.5) {
      return 'STRONG_BEHIND';
    }

    // 弱队领先守成
    if (isHomeStrong && goalDiff < 0) {
      return 'WEAK_DEFEND';
    }
    if (isAwayStrong && goalDiff > 0) {
      return 'WEAK_DEFEND';
    }
  }

  // 3. 破僵局 - 0-0 或低进球僵持
  if (totalGoals === 0 && minute >= 70) {
    return 'DEADLOCK_BREAK';
  }
  if (totalGoals <= 1 && xgDebt >= 1.5 && minute >= 75) {
    return 'DEADLOCK_BREAK';
  }

  // 4. 大球冲刺 - xG 欠债高，射门活跃
  if (xgDebt >= 1.0) {
    return 'OVER_SPRINT';
  }

  const totalShots = matchState.shots_home + matchState.shots_away;
  if (totalShots >= 20 && xgTotal >= 2.0) {
    return 'OVER_SPRINT';
  }

  // 5. 默认: 均势末段
  return 'BALANCED_LATE';
}

/**
 * 获取场景描述
 */
export function getScenarioLabel(tag: ScenarioTag): { label: string; color: string; icon: string } {
  switch (tag) {
    case 'OVER_SPRINT':
      return { label: '大球冲刺', color: '#22c55e', icon: '⚡' };
    case 'STRONG_BEHIND':
      return { label: '强队追分', color: '#f97316', icon: '🔥' };
    case 'DEADLOCK_BREAK':
      return { label: '破僵局', color: '#eab308', icon: '💥' };
    case 'WEAK_DEFEND':
      return { label: '弱队守成', color: '#6366f1', icon: '🛡️' };
    case 'BLOWOUT':
      return { label: '大比分', color: '#6b7280', icon: '📊' };
    case 'BALANCED_LATE':
      return { label: '均势末段', color: '#06b6d4', icon: '⚖️' };
    case 'GENERIC':
      return { label: '通用场景', color: '#8b949e', icon: '📋' };
  }
}

// ============================================================
// 评分组件计算
// ============================================================

/**
 * 计算 Base 得分 (0-20)
 */
function calculateBase(matchState: MatchStateInput): BaseScoreDetails {
  const { score_home, score_away, minute } = matchState;
  const totalGoals = score_home + score_away;
  const goalDiff = score_home - score_away;
  const isDraw = goalDiff === 0;

  // 比分状态得分 (0-10)
  const scoreState = scoreDiffToBase(goalDiff, totalGoals);

  // 总进球影响 (0-6)
  let goalsBonus = 0;
  if (totalGoals === 0) goalsBonus = 5;      // 0-0 爆发潜力
  else if (totalGoals === 1) goalsBonus = 6; // 1球场面开放
  else if (totalGoals === 2) goalsBonus = 5;
  else if (totalGoals === 3) goalsBonus = 3;
  else goalsBonus = 1;

  // 紧迫性加成 (仅 80+ 分钟)
  const urgencyBonus = calculateUrgencyBonus(minute, score_home, score_away);

  return {
    score_state: Math.min(20, scoreState + goalsBonus + Math.min(4, urgencyBonus / 3)),
    total_goals: totalGoals,
    goal_diff: goalDiff,
    is_draw: isDraw,
  };
}

/**
 * 计算 Edge 得分 (0-30) - 统一晚期特定
 */
function calculateEdge(
  matchState: MatchStateInput,
  scenario: ScenarioTag,
  teamStrength?: TeamStrengthInfo
): UnifiedLateEdgeDetails {
  const {
    shots_home, shots_away,
    shots_on_home, shots_on_away,
    xg_home, xg_away,
    corners_home, corners_away,
    shots_last_15 = 0,
    xg_last_15 = 0,
    corners_last_15 = 0,
    score_home, score_away,
    minute,
  } = matchState;

  const totalShots = shots_home + shots_away;
  const totalShotsOn = shots_on_home + shots_on_away;
  const xgTotal = xg_home + xg_away;

  // 1. 压制强度 (0-12) - 来自 Module A
  const pressureIndex = calculatePressureIndex(
    shots_last_15,
    Math.round(shots_last_15 * 0.4),
    xg_last_15,
    corners_last_15
  );

  // 2. xG 增长速度 (0-8) - 来自 Module A
  const xgVelocity = xgVelocityToScore(xg_last_15);

  // 3. 射门质量 (0-6) - 来自 Module A
  const shotAccuracy = totalShots > 0 ? (totalShotsOn / totalShots) * 100 : 0;
  let shotQuality = 0;
  if (shotAccuracy >= 50) shotQuality = 6;
  else if (shotAccuracy >= 40) shotQuality = 4;
  else if (shotAccuracy >= 30) shotQuality = 2;

  // 4. 强弱差 (0-8) - 来自 Module B
  let strengthGap = 0;
  if (teamStrength) {
    strengthGap = Math.min(8, teamStrength.strengthGap / 5);
  }

  // 5. 落后/追分压力 (0-6) - 来自 Module B
  let trailingPressure = 0;
  const goalDiff = score_home - score_away;
  const absDiff = Math.abs(goalDiff);

  if (absDiff === 1) {
    // 1球差: 追分压力大
    trailingPressure = minute >= 85 ? 6 : minute >= 80 ? 5 : 3;
  } else if (absDiff === 0 && minute >= 80) {
    // 平局晚期: 双方都有压力
    trailingPressure = 4;
  } else if (absDiff === 2 && minute >= 85) {
    // 2球差但很晚: 仍有追分可能
    trailingPressure = 2;
  }

  // 6. 场景加成 (0-10)
  let scenarioBonus = 0;
  switch (scenario) {
    case 'OVER_SPRINT':
      // xG 欠债高时加成
      const xgDebt = xgTotal - (score_home + score_away);
      scenarioBonus = Math.min(10, xgDebt * 4);
      break;
    case 'STRONG_BEHIND':
      // 强队追分加成
      scenarioBonus = strengthGap >= 15 ? 10 : strengthGap >= 10 ? 7 : 4;
      break;
    case 'DEADLOCK_BREAK':
      // 0-0 + 高 xG = 爆发信号
      if (score_home + score_away === 0 && xgTotal >= 1.5) {
        scenarioBonus = 8;
      } else {
        scenarioBonus = 5;
      }
      break;
    case 'WEAK_DEFEND':
      // 弱队守成 - 反向信号（押小球）
      scenarioBonus = 3;
      break;
    case 'BLOWOUT':
      // 大比分 - 信号减弱
      scenarioBonus = -5;
      break;
    case 'BALANCED_LATE':
      scenarioBonus = 2;
      break;
  }

  const total = pressureIndex + xgVelocity + shotQuality + strengthGap + trailingPressure + scenarioBonus;

  // 生成描述
  const description: string[] = [];
  if (pressureIndex >= 8) description.push(`压制强度高 (${pressureIndex.toFixed(1)}/12)`);
  if (xgVelocity >= 5) description.push(`xG快速增长`);
  if (shotQuality >= 4) description.push(`射门质量好`);
  if (strengthGap >= 5) description.push(`强弱差明显`);
  if (trailingPressure >= 4) description.push(`追分压力大`);
  if (scenarioBonus >= 6) description.push(`场景利好 (${getScenarioLabel(scenario).label})`);

  return {
    total: Math.max(0, Math.min(30, total)),
    components: {
      pressure_index: pressureIndex,
      xg_velocity: xgVelocity,
      shot_quality: shotQuality,
      strength_gap: strengthGap,
      trailing_pressure: trailingPressure,
      scenario_bonus: scenarioBonus,
    },
    description,
  };
}

/**
 * 计算 Timing 得分 (0-20)
 */
function calculateTiming(
  matchState: MatchStateInput,
  isWarmup: boolean
): TimingScoreDetails {
  const { minute, score_home, score_away } = matchState;

  // 时间窗口得分 - 使用修改后的曲线
  let windowScore = 0;

  if (minute < 65) {
    windowScore = 0;
  } else if (minute < 75) {
    // 预热期: 65-74 → 2-8分
    windowScore = 2 + (minute - 65) * 0.6;
  } else if (minute < 80) {
    // 准备期: 75-79 → 8-12分
    windowScore = 8 + (minute - 75) * 0.8;
  } else if (minute < 85) {
    // 黄金期: 80-84 → 12-16分
    windowScore = 12 + (minute - 80) * 0.8;
  } else if (minute < 90) {
    // 冲刺期: 85-89 → 16-20分
    windowScore = 16 + (minute - 85) * 0.8;
  } else {
    // 补时: 90+ → 20分
    windowScore = 20;
  }

  // 是否在峰值窗口 (80-90分钟)
  const isPeakWindow = minute >= 80 && minute <= 90;

  // 紧迫性加成 - 仅非预热模式
  let urgencyBonus = 0;
  if (!isWarmup) {
    const diff = Math.abs(score_home - score_away);
    if (minute >= 88 && diff <= 1) urgencyBonus = 4;
    else if (minute >= 85 && diff === 0) urgencyBonus = 3;
    else if (minute >= 82 && diff === 1) urgencyBonus = 2;
  }

  return {
    minute,
    window_score: windowScore,
    is_peak_window: isPeakWindow,
    urgency_bonus: urgencyBonus,
  };
}

/**
 * 计算 Market 得分 (0-20)
 */
function calculateMarket(
  matchState: MatchStateInput,
  marketState: MarketStateInput | null,
  scenario: ScenarioTag
): MarketScoreDetails {
  if (!marketState) {
    return {
      total: 0,
      line_movement: 0,
      price_drift: 0,
      consistency: 0,
      has_data: false,
    };
  }

  // 1. 盘口移动 (0-8)
  let lineMovement = 0;
  if (marketState.over_odds_prev && marketState.over_odds) {
    lineMovement = overOddsChangeToScore(
      marketState.over_odds_prev,
      marketState.over_odds
    );
  }

  // 2. 价格漂移 (0-6) - 大球赔率低表示市场看好
  let priceDrift = 0;
  if (marketState.over_odds) {
    if (marketState.over_odds < 1.5) priceDrift = 6;
    else if (marketState.over_odds < 1.65) priceDrift = 4;
    else if (marketState.over_odds < 1.8) priceDrift = 2;
  }

  // 3. 统计/盘口一致性 (0-6)
  let consistency = 0;
  const xgTotal = matchState.xg_home + matchState.xg_away;
  const totalGoals = matchState.score_home + matchState.score_away;
  const xgDebt = xgTotal - totalGoals;

  // 场景特定一致性
  if (scenario === 'OVER_SPRINT' || scenario === 'DEADLOCK_BREAK') {
    // 大球场景: xG 高且大球赔率低 = 一致
    if (xgDebt > 1.0 && marketState.over_odds && marketState.over_odds < 1.8) {
      consistency = 6;
    } else if (xgDebt > 0.5 && marketState.over_odds && marketState.over_odds < 2.0) {
      consistency = 3;
    }
  } else if (scenario === 'STRONG_BEHIND') {
    // 强队追分: 亚盘和胜负盘一致性
    if (marketState.ah_home && marketState.ah_away) {
      const ahDiff = Math.abs(marketState.ah_home - marketState.ah_away);
      if (ahDiff > 0.2) consistency = 4;
    }
  }

  const total = lineMovement + priceDrift + consistency;

  return {
    total: Math.min(20, total),
    line_movement: lineMovement,
    price_drift: priceDrift,
    consistency,
    has_data: true,
  };
}

/**
 * 计算 Quality 得分 (-10 ~ +10)
 */
function calculateQuality(matchState: MatchStateInput): QualityScoreDetails {
  const { stats_available, events_available, data_timestamp, minute } = matchState;

  // 1. 数据完整度 (-5 ~ +5)
  let completeness = 0;
  if (stats_available) completeness += 3;
  if (events_available) completeness += 2;
  if (!stats_available && !events_available) completeness = -5;

  // 2. 数据新鲜度 (-3 ~ +3)
  let freshness = 0;
  if (data_timestamp) {
    const age = (Date.now() - new Date(data_timestamp).getTime()) / 1000;
    if (age < 60) freshness = 3;
    else if (age < 120) freshness = 1;
    else if (age > 300) freshness = -3;
  }

  // 3. 异常检测 (-5 ~ 0)
  let anomalyPenalty = 0;
  const totalShots = matchState.shots_home + matchState.shots_away;
  if (minute > 30 && totalShots === 0) {
    anomalyPenalty = -5;
  }

  const total = completeness + freshness + anomalyPenalty;

  return {
    total: Math.max(-10, Math.min(10, total)),
    data_completeness: completeness,
    freshness,
    anomaly_penalty: anomalyPenalty,
  };
}

/**
 * 计算置信度 (0-100)
 */
function calculateConfidence(
  matchState: MatchStateInput,
  marketState: MarketStateInput | null,
  quality: QualityScoreDetails,
  scenario: ScenarioTag,
  isWarmup: boolean
): ConfidenceDetails {
  // 1. 数据完整度 (0-35)
  let dataCompleteness = 0;
  if (matchState.stats_available) dataCompleteness += 15;
  if (matchState.events_available) dataCompleteness += 10;
  if (matchState.xg_home > 0 || matchState.xg_away > 0) dataCompleteness += 5;
  if (matchState.shots_last_15 !== undefined) dataCompleteness += 5;

  // 2. 数据稳定性 (0-20)
  let freshnessStability = 10;
  if ((quality.freshness ?? 0) > 0) freshnessStability += (quality.freshness ?? 0) * 3;
  if ((quality.anomaly_penalty ?? 0) < 0) freshnessStability += (quality.anomaly_penalty ?? 0) * 2;
  freshnessStability = Math.max(0, Math.min(20, freshnessStability));

  // 3. 交叉一致性 (0-25)
  let crossSourceConsistency = 10;
  const totalShots = matchState.shots_home + matchState.shots_away;
  const xgTotal = matchState.xg_home + matchState.xg_away;
  if (totalShots > 0 && xgTotal > 0) {
    const xgPerShot = xgTotal / totalShots;
    if (xgPerShot >= 0.05 && xgPerShot <= 0.2) {
      crossSourceConsistency += 10;
    } else {
      crossSourceConsistency -= 5;
    }
  }
  crossSourceConsistency = Math.max(0, Math.min(25, crossSourceConsistency));

  // 4. 市场确认 (0-20)
  let marketConfirmation = 0;
  if (marketState) {
    marketConfirmation = 5;
    if (marketState.is_live) marketConfirmation += 5;

    // 场景特定市场确认
    const totalGoals = matchState.score_home + matchState.score_away;
    if (scenario === 'OVER_SPRINT' || scenario === 'DEADLOCK_BREAK') {
      if (xgTotal > totalGoals + 1.0 && marketState.over_odds && marketState.over_odds < 1.8) {
        marketConfirmation += 10;
      }
    }
  }

  // 预热模式置信度打折
  let total = dataCompleteness + freshnessStability + crossSourceConsistency + marketConfirmation;
  if (isWarmup) {
    total = Math.round(total * 0.8);
  }

  return {
    total: Math.min(100, total),
    data_completeness: dataCompleteness,
    freshness_stability: freshnessStability,
    cross_source_consistency: crossSourceConsistency,
    market_confirmation: marketConfirmation,
  };
}

/**
 * 计算行动建议
 */
function calculateAction(
  score: number,
  confidence: number,
  isWarmup: boolean,
  scenario: ScenarioTag
): ActionType {
  // 大比分场景: 始终 IGNORE
  if (scenario === 'BLOWOUT') {
    return 'IGNORE';
  }

  // 预热模式: 最高只能是 WATCH
  if (isWarmup) {
    if (score >= SIGNAL_THRESHOLDS.WARMUP.MIN_SCORE &&
        confidence >= SIGNAL_THRESHOLDS.WARMUP.MIN_CONFIDENCE) {
      return 'WATCH';
    }
    return 'IGNORE';
  }

  // 激活模式
  const t = SIGNAL_THRESHOLDS.ACTIVE;
  if (score >= t.BET_SCORE && confidence >= t.BET_CONFIDENCE) return 'BET';
  if (score >= t.PREPARE_SCORE && confidence >= t.PREPARE_CONFIDENCE) return 'PREPARE';
  if (score >= t.WATCH_SCORE) return 'WATCH';
  return 'IGNORE';
}

/**
 * 生成下注计划
 */
function generateBetPlan(
  score: number,
  confidence: number,
  minute: number,
  scenario: ScenarioTag,
  marketState: MarketStateInput | null,
  isWarmup: boolean
): BetPlan | null {
  // 预热模式不生成下注计划
  if (isWarmup) return null;

  const action = calculateAction(score, confidence, isWarmup, scenario);
  if (action !== 'BET' && action !== 'PREPARE') return null;

  // 根据场景确定市场类型
  let market: 'OU' | 'AH' = 'OU';
  let selection = 'OVER';
  let line = marketState?.ou_line ?? 2.5;

  if (scenario === 'STRONG_BEHIND') {
    // 强队追分可能更适合亚盘
    if (marketState?.ah_line !== null && marketState?.ah_line !== undefined) {
      market = 'AH';
      line = marketState.ah_line;
      // 判断选择主队还是客队
      selection = 'HOME'; // 简化: 需要更多逻辑
    }
  } else if (scenario === 'WEAK_DEFEND') {
    // 弱队守成 - 押小球
    selection = 'UNDER';
  }

  // 赔率和注码
  const oddsMin = confidence >= 80 ? 1.50 : confidence >= 70 ? 1.65 : 1.80;
  const stakePct = action === 'BET'
    ? (confidence >= 80 ? 2.0 : 1.5)
    : (confidence >= 65 ? 1.0 : 0.5);
  const ttlMinutes = minute >= 88 ? 2 : minute >= 85 ? 3 : minute >= 80 ? 5 : 8;

  return {
    market,
    line,
    selection,
    odds_min: oddsMin,
    stake_pct: stakePct,
    ttl_minutes: ttlMinutes,
  };
}

/**
 * 生成场景标签数组
 */
function generateTags(
  matchState: MatchStateInput,
  scenario: ScenarioTag,
  edge: UnifiedLateEdgeDetails,
  isWarmup: boolean
): string[] {
  const tags: string[] = [];
  const { minute, score_home, score_away, xg_home, xg_away } = matchState;
  const total = score_home + score_away;
  const diff = Math.abs(score_home - score_away);
  const xgTotal = xg_home + xg_away;

  // 场景标签
  tags.push(scenario);

  // 预热标签
  if (isWarmup) {
    tags.push('WARMUP');
  }

  // 时间标签
  if (minute >= 88) tags.push('INJURY_TIME');
  else if (minute >= 85) tags.push('FINAL_PUSH');
  else if (minute >= 80) tags.push('LATE_STAGE');
  else if (minute >= 70) tags.push('WARMING_UP');

  // 比分标签
  if (total === 0) tags.push('SCORELESS');
  if (diff === 1 && minute >= 80) tags.push('ONE_GOAL_GAME');
  if (diff === 0 && minute >= 75) tags.push('DRAW_PRESSURE');

  // 进攻标签
  if (edge.components.pressure_index >= 10) tags.push('HIGH_PRESSURE');
  if (edge.components.xg_velocity >= 6) tags.push('XG_SURGE');

  // xG 欠债标签
  if (xgTotal - total >= 1.5) tags.push('XG_DEBT_HIGH');
  else if (xgTotal - total >= 1.0) tags.push('XG_DEBT');

  return tags;
}

/**
 * 构建结构化理由
 */
function buildReasons(
  matchState: MatchStateInput,
  marketState: MarketStateInput | null,
  tags: string[]
): SignalReasons {
  const {
    minute, score_home, score_away,
    shots_home, shots_away, shots_on_home, shots_on_away,
    xg_home, xg_away, corners_home, corners_away,
    possession_home, possession_away,
    dangerous_home, dangerous_away,
    shots_last_15 = 0, xg_last_15 = 0, shots_prev_15 = 0,
    stats_available, events_available, data_timestamp,
  } = matchState;

  const totalShots = shots_home + shots_away;
  const totalShotsOn = shots_on_home + shots_on_away;
  const xgTotal = xg_home + xg_away;
  const totalGoals = score_home + score_away;

  // 压力方向
  let pressureDirection: 'HOME' | 'AWAY' | 'BALANCED' = 'BALANCED';
  const shotsDiff = shots_home - shots_away;
  if (shotsDiff > 5) pressureDirection = 'HOME';
  else if (shotsDiff < -5) pressureDirection = 'AWAY';

  // 动量趋势
  let momentumTrend: 'INCREASING' | 'STABLE' | 'DECREASING' = 'STABLE';
  const shotsDelta = shots_last_15 - shots_prev_15;
  if (shotsDelta > 2) momentumTrend = 'INCREASING';
  else if (shotsDelta < -2) momentumTrend = 'DECREASING';

  // 市场情绪
  let marketSentiment: 'HOME_FAVORED' | 'AWAY_FAVORED' | 'BALANCED' | null = null;
  if (marketState?.win_home && marketState?.win_away) {
    if (marketState.win_home < marketState.win_away - 0.3) {
      marketSentiment = 'HOME_FAVORED';
    } else if (marketState.win_away < marketState.win_home - 0.3) {
      marketSentiment = 'AWAY_FAVORED';
    } else {
      marketSentiment = 'BALANCED';
    }
  }

  // 盘口移动
  let lineMovement: 'UP' | 'DOWN' | 'STABLE' | null = null;
  if (marketState?.over_odds_prev && marketState?.over_odds) {
    const change = marketState.over_odds - marketState.over_odds_prev;
    if (change < -0.05) lineMovement = 'DOWN';
    else if (change > 0.05) lineMovement = 'UP';
    else lineMovement = 'STABLE';
  }

  // 构建主要原因
  const primaryReason = tags.length > 0 ? tags[0] : '晚期信号分析中';
  const secondaryReasons = tags.slice(1);

  return {
    primary: primaryReason,
    secondary: secondaryReasons,
    state: {
      minute,
      score_home,
      score_away,
      status: score_home > score_away ? 'home_leading'
            : score_away > score_home ? 'away_leading'
            : 'draw',
      score_diff: score_home - score_away,
      is_second_half: minute > 45,
      is_injury_time: minute > 90,
    },
    stats: {
      shots_total: totalShots,
      shots_on_total: totalShotsOn,
      shot_accuracy: totalShots > 0 ? (totalShotsOn / totalShots) * 100 : 0,
      xg_home,
      xg_away,
      xg_total: xgTotal,
      xg_debt: xgTotal - totalGoals,
      corners_total: corners_home + corners_away,
      possession_home,
      possession_away,
      dangerous_attacks_home: dangerous_home,
      dangerous_attacks_away: dangerous_away,
    },
    market: {
      over_odds: marketState?.over_odds ?? undefined,
      under_odds: marketState?.under_odds ?? undefined,
      ah_line: marketState?.ah_line ?? undefined,
      ah_home: marketState?.ah_home ?? undefined,
      ah_away: marketState?.ah_away ?? undefined,
      implied_over_prob: marketState?.over_odds
        ? Math.round((1 / marketState.over_odds) * 100 * 0.95)
        : undefined,
      line_movement: lineMovement ?? undefined,
      market_sentiment: marketSentiment ?? undefined,
    },
    deltas: {
      shots_last_15,
      shots_delta: shotsDelta,
      xg_last_15,
      xg_velocity: minute > 15 ? xg_last_15 : 0,
      corners_last_15: 0,
      pressure_direction: pressureDirection,
      momentum_trend: momentumTrend,
    },
    tags,
    checks: {
      has_stats: stats_available,
      has_events: events_available,
      has_odds: marketState !== null,
      stats_fresh: data_timestamp
        ? (Date.now() - new Date(data_timestamp).getTime()) < 120000
        : false,
      data_anomaly: false,
      anomaly_reason: undefined,
    },
  };
}

// ============================================================
// 主计算函数
// ============================================================

/**
 * 计算统一晚期模块信号
 *
 * @param matchState 比赛状态
 * @param marketState 市场/盘口状态 (可选)
 * @param teamStrength 球队强弱信息 (可选)
 * @returns 晚期模块信号
 */
export function calculateUnifiedLateSignal(
  matchState: MatchStateInput,
  marketState: MarketStateInput | null = null,
  teamStrength?: TeamStrengthInfo
): UnifiedLateSignal {
  const { minute, score_home, score_away, xg_home, xg_away } = matchState;

  // 1. 判断是否在晚期模块时间窗口
  const isInWindow = minute >= WARMUP_MINUTE;
  const isWarmup = minute >= WARMUP_MINUTE && minute < ACTIVE_MINUTE;

  // 2. 检测场景
  const scenario = isInWindow ? detectScenario(matchState, teamStrength) : 'BALANCED_LATE';

  // 3. 计算各组件
  const base = calculateBase(matchState);
  const edge = calculateEdge(matchState, scenario, teamStrength);
  const timing = calculateTiming(matchState, isWarmup);
  const market = calculateMarket(matchState, marketState, scenario);
  const quality = calculateQuality(matchState);

  // 4. 计算总分
  const baseScore = base.score_state ?? 0;
  const timingScore = (timing.window_score ?? 0) + (timing.urgency_bonus ?? 0);

  let score = baseScore + (edge.total ?? 0) + timingScore + (market.total ?? 0) + (quality.total ?? 0);

  // 预热模式分数上限
  if (isWarmup) {
    score = Math.min(score, 75);
  }

  score = Math.max(0, Math.min(100, score));

  // 5. 计算置信度
  const confidenceDetails = calculateConfidence(matchState, marketState, quality, scenario, isWarmup);
  const confidence = confidenceDetails.total ?? 50;

  // 6. 计算泊松进球概率
  const xgTotal = xg_home + xg_away;
  const scoreDiff = score_home - score_away;
  const poissonGoalProb = poissonLateGoalProbability(xgTotal, minute, scoreDiff);

  // 7. 确定行动
  const action = calculateAction(score, confidence, isWarmup, scenario);

  // 8. 生成标签
  const tags = generateTags(matchState, scenario, edge, isWarmup);

  // 9. 生成下注计划
  const betPlan = generateBetPlan(score, confidence, minute ?? 0, scenario, marketState, isWarmup);

  // 10. 构建理由
  const reasons = buildReasons(matchState, marketState, tags);

  // 11. 组装信号
  return {
    fixture_id: matchState.fixture_id,
    module: 'LATE',
    minute,
    captured_at: new Date().toISOString(),
    score,
    confidence,
    action,
    bet_plan: betPlan,
    score_breakdown: {
      base,
      edge,
      timing,
      market,
      quality,
    },
    confidence_breakdown: confidenceDetails,
    reasons,
    tags,
    scenario_tag: scenario,
    is_warmup: isWarmup,
    team_strength: teamStrength,
    poisson_goal_prob: poissonGoalProb,
    version: MODULE_VERSION,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// 便捷函数
// ============================================================

/**
 * 快速检查是否应该触发晚期模块
 */
export function shouldTriggerLateModule(minute: number): boolean {
  return minute >= WARMUP_MINUTE;
}

/**
 * 获取预热/激活状态
 */
export function getLateModulePhase(minute: number): 'inactive' | 'warmup' | 'active' {
  if (minute < WARMUP_MINUTE) return 'inactive';
  if (minute < ACTIVE_MINUTE) return 'warmup';
  return 'active';
}

/**
 * 信号是否值得关注
 */
export function isSignalWorthWatching(signal: UnifiedLateSignal): boolean {
  return signal.action !== 'IGNORE' && signal.scenario_tag !== 'BLOWOUT';
}

// ============================================================
// 导出
// ============================================================

export default calculateUnifiedLateSignal;
