// ============================================================
// MODULE A: 大球冲刺 (Over Sprint)
// 适用：70'~90'+ 重点（也支持HT前小窗口）
// 目标：预测"后段进球/大球方向"机会
// ============================================================

import type {
  ModuleASignal,
  ModuleAEdgeDetails,
  BaseScoreDetails,
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
  shotsOnToScore,
  shotAccuracyToScore,
  xgToScore,
  xgLast15ToScore,
  xgDebtToScore,
  xgVelocityToScore,
  cornersToScore,
  recentShotsToScore,
  minuteToTimingScoreA,
  scoreDiffToBase,
  gameStateToBias,
  calculatePressureIndex,
  overOddsChangeToScore,
  ahLineChangeToScore,
} from '../continuousMappers';

// ============================================================
// 常量
// ============================================================

const MODULE_VERSION = 'v1.0';

// ============================================================
// 辅助函数
// ============================================================

/**
 * 计算行动建议
 */
function calculateAction(score: number, confidence: number): ActionType {
  if (score >= 85 && confidence >= 70) return 'BET';
  if (score >= 80 && confidence >= 55) return 'PREPARE';
  if (score >= 70 || (score >= 80 && confidence < 55)) return 'WATCH';
  return 'IGNORE';
}

/**
 * 生成下注计划
 */
function generateBetPlan(
  score: number,
  confidence: number,
  minute: number,
  marketState: MarketStateInput | null
): BetPlan | null {
  const action = calculateAction(score, confidence);

  if (action !== 'BET' && action !== 'PREPARE') return null;

  // 确定盘口线
  const line = marketState?.ou_line ?? 2.5;

  // 确定最低赔率 (基于置信度)
  const oddsMin = confidence >= 80 ? 1.50 : confidence >= 70 ? 1.65 : 1.80;

  // 确定注码比例
  const stakePct = action === 'BET'
    ? (confidence >= 80 ? 2.0 : 1.5)
    : (confidence >= 65 ? 1.0 : 0.5);

  // 信号有效期
  const ttlMinutes = minute >= 85 ? 3 : minute >= 80 ? 5 : 8;

  return {
    market: 'OU',
    line,
    selection: 'OVER',
    odds_min: oddsMin,
    stake_pct: stakePct,
    ttl_minutes: ttlMinutes,
  };
}

/**
 * 生成场景标签
 */
function generateTags(
  matchState: MatchStateInput,
  edgeDetails: ModuleAEdgeDetails,
  marketState: MarketStateInput | null
): string[] {
  const tags: string[] = [];

  const { minute, score_home, score_away } = matchState;
  const total = score_home + score_away;
  const diff = Math.abs(score_home - score_away);

  // 时间相关
  if (minute >= 85) tags.push('INJURY_TIME_PUSH');
  else if (minute >= 80) tags.push('LATE_PRESSURE');
  else if (minute >= 75) tags.push('FINAL_QUARTER');

  // 比分相关
  if (total === 0) tags.push('SCORELESS');
  if (diff === 1 && minute >= 75) tags.push('CHASING_GAME');
  if (diff === 0 && minute >= 70) tags.push('DRAW_URGENCY');

  // 进攻相关
  if (edgeDetails.components.pressure_index >= 9) tags.push('HIGH_PRESSURE');
  if (edgeDetails.components.xg_velocity >= 6) tags.push('XG_SURGE');
  if (edgeDetails.components.shot_quality >= 4) tags.push('QUALITY_CHANCES');

  // 市场相关
  if (marketState && marketState.over_odds && marketState.over_odds < 1.6) {
    tags.push('MARKET_CONFIDENT');
  }

  // xG 欠债
  const xgTotal = matchState.xg_home + matchState.xg_away;
  if (xgTotal - total >= 1.5) tags.push('XG_DEBT');

  return tags;
}

// ============================================================
// 评分组件计算
// ============================================================

/**
 * 计算 Base 得分 (0-20)
 */
function calculateBase(matchState: MatchStateInput): BaseScoreDetails {
  const { score_home, score_away } = matchState;
  const totalGoals = score_home + score_away;
  const goalDiff = score_home - score_away;
  const isDraw = goalDiff === 0;

  // 比分状态得分 (0-8)
  const scoreState = scoreDiffToBase(goalDiff, totalGoals);

  // 总进球影响 (0-6)
  // 已有进球表明比赛开放
  let goalsBonus = 0;
  if (totalGoals === 0) goalsBonus = 4;  // 0-0 有爆发潜力
  else if (totalGoals === 1) goalsBonus = 5;
  else if (totalGoals === 2) goalsBonus = 6;
  else if (totalGoals === 3) goalsBonus = 4;
  else goalsBonus = 2;  // 已经很多球了

  // 时间压力加成 (0-6)
  const { minute } = matchState;
  let timeBonus = 0;
  if (minute >= 80 && isDraw) timeBonus = 6;
  else if (minute >= 75 && Math.abs(goalDiff) === 1) timeBonus = 4;
  else if (minute >= 70) timeBonus = 2;

  const total = Math.min(20, scoreState + goalsBonus + timeBonus);

  return {
    score_state: scoreState,
    total_goals: totalGoals,
    goal_diff: goalDiff,
    is_draw: isDraw,
  };
}

/**
 * 计算 Edge 得分 (0-30) - Module A 特定
 */
function calculateEdge(matchState: MatchStateInput): ModuleAEdgeDetails {
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

  // 1. 压制强度 (0-12)
  const pressureIndex = calculatePressureIndex(
    shots_last_15,
    Math.round(shots_last_15 * 0.4),  // 估算射正
    xg_last_15,
    corners_last_15
  );

  // 2. xG 增长速度 (0-8)
  const xgVelocity = xgVelocityToScore(xg_last_15);

  // 3. 射正率/转化潜力 (0-6)
  const shotAccuracy = totalShots > 0 ? (totalShotsOn / totalShots) * 100 : 0;
  const shotQuality = shotAccuracyToScore(shotAccuracy);

  // 4. 比分结构 (0-4)
  const gameStateBias = gameStateToBias(score_home, score_away, minute);

  const total = pressureIndex + xgVelocity + shotQuality + gameStateBias;

  // 生成描述
  const description: string[] = [];
  if (pressureIndex >= 8) description.push(`压制强度高 (${pressureIndex.toFixed(1)}/12)`);
  if (xgVelocity >= 5) description.push(`xG快速增长 (${xgVelocity.toFixed(1)}/8)`);
  if (shotQuality >= 4) description.push(`射门质量好 (${shotQuality.toFixed(1)}/6)`);
  if (gameStateBias >= 2) description.push(`比分结构利好 (+${gameStateBias})`);

  return {
    total: Math.min(30, total),
    components: {
      pressure_index: pressureIndex,
      xg_velocity: xgVelocity,
      shot_quality: shotQuality,
      game_state_bias: gameStateBias,
    },
    description,
  };
}

/**
 * 计算 Timing 得分 (0-20)
 */
function calculateTiming(matchState: MatchStateInput): TimingScoreDetails {
  const { minute, score_home, score_away } = matchState;

  // 时间窗口得分
  const windowScore = minuteToTimingScoreA(minute);

  // 是否在峰值窗口 (78-88分钟)
  const isPeakWindow = minute >= 78 && minute <= 88;

  // 紧迫性加成
  let urgencyBonus = 0;
  const diff = Math.abs(score_home - score_away);
  if (minute >= 85 && diff <= 1) urgencyBonus = 3;
  else if (minute >= 80 && diff === 0) urgencyBonus = 2;

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
  marketState: MarketStateInput | null
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

  // 1. 盘口移动 (0-10)
  let lineMovement = 0;
  if (marketState.over_odds_prev && marketState.over_odds) {
    lineMovement = overOddsChangeToScore(
      marketState.over_odds_prev,
      marketState.over_odds
    );
  }

  // 2. 价格漂移 (0-6)
  let priceDrift = 0;
  if (marketState.over_odds) {
    // 低于 1.6 表示市场强烈看好大球
    if (marketState.over_odds < 1.5) priceDrift = 6;
    else if (marketState.over_odds < 1.65) priceDrift = 4;
    else if (marketState.over_odds < 1.8) priceDrift = 2;
  }

  // 3. 盘口/水位与统计同向 (0-4)
  let consistency = 0;
  const xgTotal = matchState.xg_home + matchState.xg_away;
  const totalShots = matchState.shots_home + matchState.shots_away;
  const totalGoals = matchState.score_home + matchState.score_away;

  // 如果 xG 高且大球赔率低，一致
  if (xgTotal > totalGoals + 1.0 && marketState.over_odds && marketState.over_odds < 1.8) {
    consistency = 4;
  } else if (totalShots > 20 && marketState.over_odds && marketState.over_odds < 2.0) {
    consistency = 2;
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

  // 3. 异常检测扣分 (-5 ~ 0)
  let anomalyPenalty = 0;

  // 检测异常：比赛进行中但射门为0
  const totalShots = matchState.shots_home + matchState.shots_away;
  if (minute > 20 && totalShots === 0) {
    anomalyPenalty = -5;
  }

  // 检测异常：xG 与射门严重不匹配
  const xgTotal = matchState.xg_home + matchState.xg_away;
  if (totalShots > 15 && xgTotal < 0.3) {
    anomalyPenalty = Math.min(anomalyPenalty, -3);
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
  quality: QualityScoreDetails
): ConfidenceDetails {
  // 1. 数据完整度 (0-35)
  let dataCompleteness = 0;
  if (matchState.stats_available) dataCompleteness += 15;
  if (matchState.events_available) dataCompleteness += 10;
  if (matchState.xg_home > 0 || matchState.xg_away > 0) dataCompleteness += 5;
  if (matchState.shots_last_15 !== undefined) dataCompleteness += 5;

  // 2. 数据新鲜/稳定 (0-20)
  let freshnessStability = 10;  // 基础分
  if (quality.freshness > 0) freshnessStability += quality.freshness * 3;
  if (quality.anomaly_penalty < 0) freshnessStability += quality.anomaly_penalty * 2;
  freshnessStability = Math.max(0, Math.min(20, freshnessStability));

  // 3. 交叉一致性 (0-25)
  let crossSourceConsistency = 10;  // 基础分
  // 检查 xG 与射门一致性
  const totalShots = matchState.shots_home + matchState.shots_away;
  const xgTotal = matchState.xg_home + matchState.xg_away;
  if (totalShots > 0 && xgTotal > 0) {
    const xgPerShot = xgTotal / totalShots;
    // 正常范围是 0.08-0.15
    if (xgPerShot >= 0.05 && xgPerShot <= 0.2) {
      crossSourceConsistency += 10;
    } else {
      crossSourceConsistency -= 5;
    }
  }
  // 检查控球与进攻一致性
  const possDiff = matchState.possession_home - matchState.possession_away;
  const dangerousDiff = matchState.dangerous_home - matchState.dangerous_away;
  if ((possDiff > 10 && dangerousDiff > 5) || (possDiff < -10 && dangerousDiff < -5)) {
    crossSourceConsistency += 5;
  }
  crossSourceConsistency = Math.max(0, Math.min(25, crossSourceConsistency));

  // 4. 市场确认 (0-20)
  let marketConfirmation = 0;
  if (marketState) {
    marketConfirmation = 5;  // 有盘口数据
    if (marketState.is_live) marketConfirmation += 5;
    // 如果统计看好大球且盘口也看好
    if (xgTotal > matchState.score_home + matchState.score_away + 1.0) {
      if (marketState.over_odds && marketState.over_odds < 1.8) {
        marketConfirmation += 10;
      } else if (marketState.over_odds && marketState.over_odds < 2.0) {
        marketConfirmation += 5;
      }
    }
  }

  const total = dataCompleteness + freshnessStability + crossSourceConsistency + marketConfirmation;

  return {
    total: Math.min(100, total),
    data_completeness: dataCompleteness,
    freshness_stability: freshnessStability,
    cross_source_consistency: crossSourceConsistency,
    market_confirmation: marketConfirmation,
  };
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
    minute, score_home, score_away, status,
    shots_home, shots_away, shots_on_home, shots_on_away,
    xg_home, xg_away, corners_home, corners_away,
    possession_home, possession_away,
    dangerous_home, dangerous_away,
    shots_last_15 = 0, xg_last_15 = 0, shots_prev_15 = 0, xg_prev_15 = 0,
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

  // 盘口移动方向
  let lineMovement: 'UP' | 'DOWN' | 'STABLE' | null = null;
  if (marketState?.over_odds_prev && marketState?.over_odds) {
    const change = marketState.over_odds - marketState.over_odds_prev;
    if (change < -0.05) lineMovement = 'DOWN';
    else if (change > 0.05) lineMovement = 'UP';
    else lineMovement = 'STABLE';
  }

  // 数据异常检测
  let dataAnomaly = false;
  let anomalyReason: string | null = null;
  if (minute > 20 && totalShots === 0) {
    dataAnomaly = true;
    anomalyReason = 'NO_SHOTS_AFTER_20MIN';
  }

  return {
    state: {
      minute,
      score_home,
      score_away,
      status: score_home > score_away ? 'home_leading' : score_away > score_home ? 'away_leading' : 'draw',
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
      over_odds: marketState?.over_odds ?? null,
      under_odds: marketState?.under_odds ?? null,
      ah_line: marketState?.ah_line ?? null,
      ah_home: marketState?.ah_home ?? null,
      ah_away: marketState?.ah_away ?? null,
      implied_over_prob: marketState?.over_odds
        ? Math.round((1 / marketState.over_odds) * 100 * 0.95)  // 含margin调整
        : null,
      line_movement: lineMovement,
      market_sentiment: marketSentiment,
    },
    deltas: {
      shots_last_15: shots_last_15,
      shots_delta: shotsDelta,
      xg_last_15: xg_last_15,
      xg_velocity: minute > 15 ? xg_last_15 : 0,
      corners_last_15: 0,  // 需要额外数据
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
      data_anomaly: dataAnomaly,
      anomaly_reason: anomalyReason,
    },
  };
}

// ============================================================
// 主计算函数
// ============================================================

/**
 * 计算 Module A 信号
 */
export function calculateModuleASignal(
  matchState: MatchStateInput,
  marketState: MarketStateInput | null = null
): ModuleASignal {
  // 1. 计算各组件
  const base = calculateBase(matchState);
  const edge = calculateEdge(matchState);
  const timing = calculateTiming(matchState);
  const market = calculateMarket(matchState, marketState);
  const quality = calculateQuality(matchState);

  // 2. 计算总分
  const baseScore = Math.min(20, base.score_state + (base.is_draw ? 4 : 0) +
    (base.total_goals >= 1 && base.total_goals <= 3 ? 4 : 0));
  const timingScore = timing.window_score + timing.urgency_bonus;

  const score = Math.max(0, Math.min(100,
    baseScore +
    edge.total +
    timingScore +
    market.total +
    quality.total
  ));

  // 3. 计算置信度
  const confidenceDetails = calculateConfidence(matchState, marketState, quality);
  const confidence = confidenceDetails.total;

  // 4. 确定行动
  const action = calculateAction(score, confidence);

  // 5. 生成标签
  const tags = generateTags(matchState, edge, marketState);

  // 6. 生成下注计划
  const betPlan = generateBetPlan(score, confidence, matchState.minute, marketState);

  // 7. 构建理由
  const reasons = buildReasons(matchState, marketState, tags);

  // 8. 组装信号
  return {
    fixture_id: matchState.fixture_id,
    module: 'A',
    minute: matchState.minute,
    captured_at: new Date().toISOString(),
    score,
    confidence,
    action,
    bet_plan: betPlan,
    score_breakdown: {
      base: {
        ...base,
        score_state: baseScore,  // 使用计算后的值
      },
      edge,
      timing: {
        ...timing,
        window_score: timingScore,
      },
      market,
      quality,
    },
    confidence_breakdown: confidenceDetails,
    reasons,
    _version: MODULE_VERSION,
    _data_mode: 'STRICT_REAL_DATA',
  };
}

// ============================================================
// 导出
// ============================================================

export default calculateModuleASignal;
