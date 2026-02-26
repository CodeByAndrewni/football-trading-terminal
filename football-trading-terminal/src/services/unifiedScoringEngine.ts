// ============================================================
// UNIFIED SCORING ENGINE
// 四模块统一评分引擎 (A/B/C/D)
// ============================================================

import type {
  UnifiedSignal,
  ModuleType,
  MatchStateInput,
  MarketStateInput,
  TeamStrengthInput,
  ActionType,
  BacktestResult,
  SignalValidation,
} from '../types/unified-scoring';

import { MODULE_NAMES, MODULE_DESCRIPTIONS, ACTION_LABELS } from '../types/unified-scoring';
import { calculateModuleASignal } from './modules/moduleA';
// import { calculateModuleBSignal } from './modules/moduleB';  // TODO
// import { calculateModuleCSignal } from './modules/moduleC';  // TODO
// import { calculateModuleDSignal } from './modules/moduleD';  // TODO

import type { AdvancedMatch } from '../data/advancedMockData';
import type { OddsAnalysis } from '../types';

// ============================================================
// 类型转换：从 AdvancedMatch 到 MatchStateInput
// ============================================================

/**
 * 将 AdvancedMatch 转换为 MatchStateInput
 */
export function convertToMatchStateInput(match: AdvancedMatch): MatchStateInput {
  const stats = match.stats;

  return {
    fixture_id: match.id,
    minute: match.minute,
    score_home: match.home.score,
    score_away: match.away.score,
    status: match.status,

    // 统计数据
    shots_home: stats?.shots?.home ?? 0,
    shots_away: stats?.shots?.away ?? 0,
    shots_on_home: stats?.shotsOnTarget?.home ?? 0,
    shots_on_away: stats?.shotsOnTarget?.away ?? 0,
    xg_home: stats?.xG?.home ?? 0,
    xg_away: stats?.xG?.away ?? 0,
    corners_home: match.corners?.home ?? 0,
    corners_away: match.corners?.away ?? 0,
    possession_home: stats?.possession?.home ?? 50,
    possession_away: stats?.possession?.away ?? 50,
    dangerous_home: stats?.dangerousAttacks?.home ?? 0,
    dangerous_away: stats?.dangerousAttacks?.away ?? 0,

    // 时间序列
    shots_last_15: stats?.recentShots20min ?? 0,  // 使用20分钟数据
    xg_last_15: undefined,  // 需要额外计算
    corners_last_15: undefined,
    shots_prev_15: undefined,
    xg_prev_15: undefined,

    // 事件数据
    red_cards_home: match.cards?.red?.home ?? 0,
    red_cards_away: match.cards?.red?.away ?? 0,
    recent_goals: 0,  // 需要从事件计算
    recent_subs_attack: match.recentAttackSubs ?? 0,

    // 数据质量
    stats_available: stats?._realDataAvailable ?? false,
    events_available: true,  // 假设事件数据可用
    data_timestamp: new Date().toISOString(),
  };
}

/**
 * 将 OddsAnalysis 转换为 MarketStateInput
 */
export function convertToMarketStateInput(
  fixtureId: number,
  oddsAnalysis: OddsAnalysis | null,
  previousOdds: OddsAnalysis | null = null
): MarketStateInput | null {
  if (!oddsAnalysis) return null;

  return {
    fixture_id: fixtureId,

    // 大小球
    over_odds: oddsAnalysis.overUnder?.over ?? null,
    under_odds: oddsAnalysis.overUnder?.under ?? null,
    ou_line: oddsAnalysis.overUnder?.line ?? null,

    // 亚盘
    ah_line: oddsAnalysis.asianHandicap?.line ?? null,
    ah_home: oddsAnalysis.asianHandicap?.home ?? null,
    ah_away: oddsAnalysis.asianHandicap?.away ?? null,

    // 胜平负
    win_home: oddsAnalysis.matchWinner?.home ?? null,
    win_draw: oddsAnalysis.matchWinner?.draw ?? null,
    win_away: oddsAnalysis.matchWinner?.away ?? null,

    // 变动
    over_odds_prev: previousOdds?.overUnder?.over ?? null,
    ah_line_prev: previousOdds?.asianHandicap?.line ?? null,

    // 元数据
    bookmaker: 'API-Football',
    is_live: true,
    captured_at: new Date().toISOString(),
  };
}

// ============================================================
// 主评分函数
// ============================================================

/**
 * 计算指定模块的信号
 */
export function calculateSignal(
  module: ModuleType,
  matchState: MatchStateInput,
  marketState: MarketStateInput | null = null,
  teamStrength?: { home: TeamStrengthInput; away: TeamStrengthInput }
): UnifiedSignal | null {
  switch (module) {
    case 'A':
      return calculateModuleASignal(matchState, marketState);
    case 'B':
      // TODO: 实现 Module B
      console.warn('Module B not implemented yet');
      return null;
    case 'C':
      // TODO: 实现 Module C
      console.warn('Module C not implemented yet');
      return null;
    case 'D':
      // TODO: 实现 Module D
      console.warn('Module D not implemented yet');
      return null;
    default:
      return null;
  }
}

/**
 * 计算所有模块的信号
 */
export function calculateAllSignals(
  matchState: MatchStateInput,
  marketState: MarketStateInput | null = null,
  teamStrength?: { home: TeamStrengthInput; away: TeamStrengthInput }
): Map<ModuleType, UnifiedSignal> {
  const signals = new Map<ModuleType, UnifiedSignal>();

  const modules: ModuleType[] = ['A', 'B', 'C', 'D'];

  for (const module of modules) {
    const signal = calculateSignal(module, matchState, marketState, teamStrength);
    if (signal) {
      signals.set(module, signal);
    }
  }

  return signals;
}

/**
 * 从 AdvancedMatch 计算信号 (便捷函数)
 */
export function calculateSignalFromMatch(
  module: ModuleType,
  match: AdvancedMatch,
  oddsAnalysis: OddsAnalysis | null = null,
  previousOdds: OddsAnalysis | null = null
): UnifiedSignal | null {
  const matchState = convertToMatchStateInput(match);
  const marketState = convertToMarketStateInput(match.id, oddsAnalysis, previousOdds);

  return calculateSignal(module, matchState, marketState);
}

/**
 * 批量计算多场比赛的 Module A 信号
 */
export function calculateModuleASignals(
  matches: AdvancedMatch[]
): Map<number, UnifiedSignal> {
  const signals = new Map<number, UnifiedSignal>();

  for (const match of matches) {
    // 跳过不可评分的比赛
    if (match._unscoreable || !match.stats?._realDataAvailable) {
      continue;
    }

    // 跳过时间不在窗口内的比赛
    if (match.minute < 65) {
      continue;
    }

    const signal = calculateSignalFromMatch('A', match);
    if (signal) {
      signals.set(match.id, signal);
    }
  }

  return signals;
}

// ============================================================
// 信号筛选
// ============================================================

/**
 * 筛选高分信号
 */
export function filterHighScoreSignals(
  signals: Map<number, UnifiedSignal>,
  minScore = 70
): UnifiedSignal[] {
  return Array.from(signals.values())
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/**
 * 筛选可下注信号
 */
export function filterBetSignals(
  signals: Map<number, UnifiedSignal>
): UnifiedSignal[] {
  return Array.from(signals.values())
    .filter(s => s.action === 'BET')
    .sort((a, b) => b.score - a.score);
}

/**
 * 筛选准备中信号
 */
export function filterPrepareSignals(
  signals: Map<number, UnifiedSignal>
): UnifiedSignal[] {
  return Array.from(signals.values())
    .filter(s => s.action === 'PREPARE')
    .sort((a, b) => b.score - a.score);
}

/**
 * 筛选关注中信号
 */
export function filterWatchSignals(
  signals: Map<number, UnifiedSignal>
): UnifiedSignal[] {
  return Array.from(signals.values())
    .filter(s => s.action === 'WATCH')
    .sort((a, b) => b.score - a.score);
}

// ============================================================
// 格式化与显示
// ============================================================

/**
 * 获取评分颜色
 */
export function getScoreColor(score: number): string {
  if (score >= 85) return '#ef4444';  // red
  if (score >= 80) return '#f97316';  // orange
  if (score >= 70) return '#eab308';  // yellow
  if (score >= 60) return '#22c55e';  // green
  return '#6b7280';  // gray
}

/**
 * 获取置信度颜色
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return '#22c55e';  // green
  if (confidence >= 60) return '#eab308';  // yellow
  if (confidence >= 40) return '#f97316';  // orange
  return '#ef4444';  // red
}

/**
 * 格式化信号摘要
 */
export function formatSignalSummary(signal: UnifiedSignal): string {
  const moduleName = MODULE_NAMES[signal.module];
  const actionLabel = ACTION_LABELS[signal.action].label;

  return `[${moduleName}] ${signal.score}分 / ${signal.confidence}%置信 → ${actionLabel}`;
}

/**
 * 格式化评分明细
 */
export function formatScoreBreakdown(signal: UnifiedSignal): string {
  const { score_breakdown } = signal;
  const lines = [
    `评分明细 (总分: ${signal.score})`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `Base (态势): ${score_breakdown.base.score_state}`,
    `Edge (优势): ${score_breakdown.edge.total}`,
  ];

  // 添加 Edge 组件详情
  for (const [key, value] of Object.entries(score_breakdown.edge.components)) {
    lines.push(`  - ${key}: ${(value as number).toFixed(1)}`);
  }

  lines.push(
    `Timing (时间): ${score_breakdown.timing.window_score}`,
    `Market (盘口): ${score_breakdown.market.total}`,
    `Quality (质量): ${score_breakdown.quality.total}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  );

  return lines.join('\n');
}

/**
 * 格式化置信度明细
 */
export function formatConfidenceBreakdown(signal: UnifiedSignal): string {
  const { confidence_breakdown } = signal;

  return [
    `置信度明细 (总分: ${signal.confidence})`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `数据完整: ${confidence_breakdown.data_completeness}/35`,
    `新鲜稳定: ${confidence_breakdown.freshness_stability}/20`,
    `交叉一致: ${confidence_breakdown.cross_source_consistency}/25`,
    `市场确认: ${confidence_breakdown.market_confirmation}/20`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

// ============================================================
// 回测支持
// ============================================================

/**
 * 验证单个信号
 */
export function validateSignal(
  signal: UnifiedSignal,
  finalScoreHome: number,
  finalScoreAway: number,
  goalMinutes: number[] = []
): SignalValidation {
  const triggerScore = signal.reasons.state.score_home + signal.reasons.state.score_away;
  const finalScore = finalScoreHome + finalScoreAway;
  const goalsAfter = finalScore - triggerScore;

  // 找到触发后第一个进球
  const firstGoalAfter = goalMinutes.find(m => m > signal.minute);

  // 判断是否命中 (Module A: 触发后有进球)
  const isHit = signal.module === 'A' && goalsAfter > 0;

  return {
    signal_id: `${signal.fixture_id}_${signal.module}_${signal.minute}`,
    fixture_id: signal.fixture_id,
    module: signal.module,
    trigger_minute: signal.minute,
    trigger_score: signal.score,
    trigger_confidence: signal.confidence,
    action: signal.action,
    had_goal_after: goalsAfter > 0,
    goals_after_trigger: goalsAfter,
    first_goal_minute: firstGoalAfter ?? null,
    final_score_home: finalScoreHome,
    final_score_away: finalScoreAway,
    is_hit: isHit,
    hit_criteria: 'GOAL_AFTER_TRIGGER',
    profit_if_bet: signal.bet_plan && isHit
      ? (signal.bet_plan.odds_min - 1) * signal.bet_plan.stake_pct
      : signal.bet_plan
        ? -signal.bet_plan.stake_pct
        : null,
  };
}

/**
 * 聚合回测结果
 */
export function aggregateBacktestResults(
  validations: SignalValidation[],
  module: ModuleType
): BacktestResult {
  const moduleValidations = validations.filter(v => v.module === module);
  const total = moduleValidations.length;
  const hits = moduleValidations.filter(v => v.is_hit).length;

  // 按 action 分组
  const byAction: Record<ActionType, { count: number; hit_count: number; hit_rate: number }> = {
    BET: { count: 0, hit_count: 0, hit_rate: 0 },
    PREPARE: { count: 0, hit_count: 0, hit_rate: 0 },
    WATCH: { count: 0, hit_count: 0, hit_rate: 0 },
    IGNORE: { count: 0, hit_count: 0, hit_rate: 0 },
  };

  for (const v of moduleValidations) {
    byAction[v.action].count++;
    if (v.is_hit) byAction[v.action].hit_count++;
  }

  for (const action of Object.keys(byAction) as ActionType[]) {
    byAction[action].hit_rate = byAction[action].count > 0
      ? byAction[action].hit_count / byAction[action].count
      : 0;
  }

  // 按分数分组
  const scoreRanges = ['0-50', '50-60', '60-70', '70-80', '80-90', '90-100'];
  const byScoreRange: Record<string, { count: number; hit_count: number; hit_rate: number }> = {};

  for (const range of scoreRanges) {
    byScoreRange[range] = { count: 0, hit_count: 0, hit_rate: 0 };
  }

  for (const v of moduleValidations) {
    let range = '0-50';
    if (v.trigger_score >= 90) range = '90-100';
    else if (v.trigger_score >= 80) range = '80-90';
    else if (v.trigger_score >= 70) range = '70-80';
    else if (v.trigger_score >= 60) range = '60-70';
    else if (v.trigger_score >= 50) range = '50-60';

    byScoreRange[range].count++;
    if (v.is_hit) byScoreRange[range].hit_count++;
  }

  for (const range of scoreRanges) {
    byScoreRange[range].hit_rate = byScoreRange[range].count > 0
      ? byScoreRange[range].hit_count / byScoreRange[range].count
      : 0;
  }

  // 按置信度分组
  const confRanges = ['0-40', '40-60', '60-80', '80-100'];
  const byConfidenceRange: Record<string, { count: number; hit_count: number; hit_rate: number }> = {};

  for (const range of confRanges) {
    byConfidenceRange[range] = { count: 0, hit_count: 0, hit_rate: 0 };
  }

  for (const v of moduleValidations) {
    let range = '0-40';
    if (v.trigger_confidence >= 80) range = '80-100';
    else if (v.trigger_confidence >= 60) range = '60-80';
    else if (v.trigger_confidence >= 40) range = '40-60';

    byConfidenceRange[range].count++;
    if (v.is_hit) byConfidenceRange[range].hit_count++;
  }

  for (const range of confRanges) {
    byConfidenceRange[range].hit_rate = byConfidenceRange[range].count > 0
      ? byConfidenceRange[range].hit_count / byConfidenceRange[range].count
      : 0;
  }

  return {
    module,
    total_signals: total,
    hit_count: hits,
    hit_rate: total > 0 ? hits / total : 0,
    by_action: byAction,
    by_score_range: byScoreRange,
    by_confidence_range: byConfidenceRange,
  };
}

// ============================================================
// 导出
// ============================================================

export {
  MODULE_NAMES,
  MODULE_DESCRIPTIONS,
  ACTION_LABELS,
};

export default {
  calculateSignal,
  calculateAllSignals,
  calculateSignalFromMatch,
  calculateModuleASignals,
  filterHighScoreSignals,
  filterBetSignals,
  filterPrepareSignals,
  filterWatchSignals,
  getScoreColor,
  getConfidenceColor,
  formatSignalSummary,
  formatScoreBreakdown,
  formatConfidenceBreakdown,
  validateSignal,
  aggregateBacktestResults,
  convertToMatchStateInput,
  convertToMarketStateInput,
};
