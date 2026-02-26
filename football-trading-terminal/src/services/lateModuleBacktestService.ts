/**
 * ============================================
 * 晚期模块大规模回测服务
 * 支持真实历史数据获取和分析
 *
 * Version: 1.0.0
 * ============================================
 */

import {
  calculateUnifiedLateSignal,
  type UnifiedLateSignal,
  type ScenarioTag,
} from './modules/unifiedLateModule';
import type { MatchStateInput, MarketStateInput } from '../types/unified-scoring';
import {
  collectLeagueData,
  collectByDateRange,
  type HistoricalMatch,
  type HistoricalSnapshot,
  type CollectorProgress,
  MAJOR_LEAGUES,
  calculateDatasetStats,
  exportToJSON,
  importFromJSON,
  type DatasetStats,
} from './historicalDataCollector';

// ============================================
// 类型定义
// ============================================

/** 回测配置 */
export interface BacktestConfig {
  // 数据源
  dataSource: 'mock' | 'api' | 'local';

  // API 数据收集参数
  leagueIds?: number[];
  season?: number;
  dateFrom?: string;
  dateTo?: string;

  // 回测参数
  minMinute: number; // 最小分钟 (默认 65)
  maxMinute: number; // 最大分钟 (默认 90)
  minScore: number; // 最小信号分数过滤
  minConfidence: number; // 最小置信度过滤
  scenarios: ScenarioTag[]; // 要回测的场景

  // 投注策略
  baseStake: number; // 基础注码
  stakingStrategy: 'flat' | 'kelly' | 'proportional';
}

/** 单个信号回测结果 */
export interface SignalBacktestResult {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  minute: number;
  scoreAtSignal: { home: number; away: number };
  finalScore: { home: number; away: number };

  // 信号信息
  signal: UnifiedLateSignal;
  scenario: ScenarioTag;
  action: string;
  score: number;
  confidence: number;
  reasons: string[];

  // 结果验证
  predictedOutcome: 'OVER' | 'AH_HOME' | 'AH_AWAY' | null;
  targetLine: number;
  actualGoalsAfter: number;
  isCorrect: boolean | null;

  // 盈亏
  odds: number;
  stake: number;
  profit: number;
}

/** 场景统计 */
export interface ScenarioStats {
  scenario: ScenarioTag;
  totalSignals: number;
  betSignals: number;
  prepareSignals: number;
  ignoreSignals: number;
  correctPredictions: number;
  accuracy: number;
  totalProfit: number;
  avgOdds: number;
}

/** 时间分布统计 */
export interface MinuteStats {
  minute: number;
  signals: number;
  correct: number;
  accuracy: number;
  profit: number;
}

/** 回测汇总报告 */
export interface BacktestSummary {
  // 元数据
  config: BacktestConfig;
  runAt: string;
  datasetStats: DatasetStats;

  // 核心指标
  totalMatches: number;
  totalSnapshots: number;
  totalSignals: number;
  betSignals: number;
  prepareSignals: number;
  ignoreSignals: number;

  // 准确率
  correctPredictions: number;
  overallAccuracy: number;
  betAccuracy: number;
  prepareAccuracy: number;

  // 盈亏
  totalStake: number;
  totalProfit: number;
  roi: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;

  // 分布统计
  byScenario: ScenarioStats[];
  byMinute: MinuteStats[];

  // 最佳/最差
  bestSignals: SignalBacktestResult[];
  worstSignals: SignalBacktestResult[];

  // 资金曲线
  equityCurve: { index: number; equity: number; drawdown: number }[];
}

/** 回测进度 */
export interface BacktestProgress {
  phase: 'collecting' | 'analyzing' | 'completed';
  totalMatches: number;
  processedMatches: number;
  totalSnapshots: number;
  processedSnapshots: number;
  currentMatch?: string;
}

// ============================================
// 默认配置
// ============================================

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  dataSource: 'mock',
  leagueIds: [MAJOR_LEAGUES.PREMIER_LEAGUE, MAJOR_LEAGUES.LA_LIGA, MAJOR_LEAGUES.BUNDESLIGA],
  season: 2025,
  minMinute: 65,
  maxMinute: 90,
  minScore: 0,
  minConfidence: 0,
  scenarios: ['OVER_SPRINT', 'STRONG_BEHIND', 'DEADLOCK_BREAK', 'GENERIC'],
  baseStake: 100,
  stakingStrategy: 'flat',
};

// ============================================
// 模拟数据生成
// ============================================

/**
 * 生成模拟历史比赛数据
 */
export function generateMockHistoricalMatches(count = 100): HistoricalMatch[] {
  const leagues = [
    { id: 39, name: '英超' },
    { id: 140, name: '西甲' },
    { id: 78, name: '德甲' },
    { id: 135, name: '意甲' },
    { id: 61, name: '法甲' },
  ];

  const teams = [
    ['曼城', '利物浦'], ['阿森纳', '切尔西'], ['曼联', '热刺'],
    ['皇马', '巴萨'], ['马竞', '塞维利亚'], ['瓦伦西亚', '比利亚雷亚尔'],
    ['拜仁', '多特'], ['莱比锡', '勒沃库森'], ['法兰克福', '门兴'],
    ['国米', 'AC米兰'], ['尤文', '那不勒斯'], ['罗马', '拉齐奥'],
    ['巴黎', '摩纳哥'], ['里昂', '马赛'], ['里尔', '雷恩'],
  ];

  const matches: HistoricalMatch[] = [];

  for (let i = 0; i < count; i++) {
    const league = leagues[i % leagues.length];
    const teamPair = teams[i % teams.length];

    // 生成最终比分 (符合真实分布)
    const totalGoals = generateRealisticTotalGoals();
    const homeGoals = Math.floor(Math.random() * (totalGoals + 1));
    const awayGoals = totalGoals - homeGoals;

    // 生成进球时间
    const goalMinutes: number[] = [];
    for (let g = 0; g < totalGoals; g++) {
      goalMinutes.push(Math.floor(Math.random() * 90) + 1);
    }
    goalMinutes.sort((a, b) => a - b);

    // 生成快照 (65', 70', 75', 80', 85')
    const snapshots: HistoricalSnapshot[] = [];
    const snapshotMinutes = [65, 70, 75, 80, 85];

    for (const minute of snapshotMinutes) {
      // 计算该时间点的比分
      let scoreHome = 0;
      let scoreAway = 0;
      const assignedHome: number[] = [];

      for (let g = 0; g < goalMinutes.length; g++) {
        if (goalMinutes[g] <= minute) {
          if (assignedHome.length < homeGoals && (Math.random() > 0.5 || goalMinutes.length - g <= homeGoals - assignedHome.length)) {
            scoreHome++;
            assignedHome.push(g);
          } else {
            scoreAway++;
          }
        }
      }

      // 确保最终比分正确
      const goalsAtMinute = goalMinutes.filter(m => m <= minute).length;
      scoreHome = Math.min(scoreHome, homeGoals);
      scoreAway = goalsAtMinute - scoreHome;

      // 生成统计数据
      const ratio = minute / 90;
      const baseShots = 10 + Math.random() * 8;
      const baseShotsOn = 4 + Math.random() * 4;
      const baseCorners = 4 + Math.random() * 4;
      const baseXg = 0.8 + Math.random() * 1.2;

      // 进攻倾向 (影响统计分布)
      const homeAttackBias = 0.4 + Math.random() * 0.2;

      snapshots.push({
        minute,
        score: { home: scoreHome, away: scoreAway },
        stats: {
          shots: {
            home: Math.round(baseShots * ratio * (0.8 + homeAttackBias * 0.4)),
            away: Math.round(baseShots * ratio * (1.2 - homeAttackBias * 0.4)),
          },
          shotsOn: {
            home: Math.round(baseShotsOn * ratio * (0.8 + homeAttackBias * 0.4)),
            away: Math.round(baseShotsOn * ratio * (1.2 - homeAttackBias * 0.4)),
          },
          xg: {
            home: Number((baseXg * ratio * (0.8 + homeAttackBias * 0.4)).toFixed(2)),
            away: Number((baseXg * ratio * (1.2 - homeAttackBias * 0.4)).toFixed(2)),
          },
          corners: {
            home: Math.round(baseCorners * ratio * (0.8 + homeAttackBias * 0.4)),
            away: Math.round(baseCorners * ratio * (1.2 - homeAttackBias * 0.4)),
          },
          possession: {
            home: Math.round(45 + homeAttackBias * 20),
            away: Math.round(55 - homeAttackBias * 20),
          },
          dangerous: {
            home: Math.round(30 * ratio * (0.8 + homeAttackBias * 0.4)),
            away: Math.round(30 * ratio * (1.2 - homeAttackBias * 0.4)),
          },
        },
        odds: generateSimulatedOdds(
          { home: scoreHome, away: scoreAway },
          minute,
          2.5
        ),
      });
    }

    matches.push({
      id: 1000000 + i,
      homeTeam: teamPair[0],
      awayTeam: teamPair[1],
      homeTeamId: 1000 + i * 2,
      awayTeamId: 1000 + i * 2 + 1,
      league: league.name,
      leagueId: league.id,
      date: generateRandomDate(2025),
      finalScore: { home: homeGoals, away: awayGoals },
      halfTimeScore: {
        home: Math.floor(homeGoals * 0.4),
        away: Math.floor(awayGoals * 0.4),
      },
      goalMinutes,
      snapshots,
    });
  }

  return matches;
}

/** 生成符合真实分布的总进球数 */
function generateRealisticTotalGoals(): number {
  // 泊松分布近似，均值约2.6
  const rand = Math.random();
  if (rand < 0.08) return 0;
  if (rand < 0.22) return 1;
  if (rand < 0.42) return 2;
  if (rand < 0.62) return 3;
  if (rand < 0.78) return 4;
  if (rand < 0.88) return 5;
  if (rand < 0.94) return 6;
  return 7;
}

/** 生成模拟赔率 */
function generateSimulatedOdds(
  score: { home: number; away: number },
  minute: number,
  ouLine = 2.5
): HistoricalSnapshot['odds'] {
  const totalGoals = score.home + score.away;
  const remainingTime = 90 - minute;
  const remainingRatio = remainingTime / 90;

  const avgGoalsPer90 = 2.6;
  const expectedRemaining = avgGoalsPer90 * remainingRatio;
  const goalsNeeded = ouLine - totalGoals;

  let overProb: number;
  if (goalsNeeded <= 0) {
    overProb = 0.95;
  } else if (goalsNeeded >= expectedRemaining * 2) {
    overProb = 0.15;
  } else {
    overProb = Math.max(0.2, Math.min(0.8, expectedRemaining / goalsNeeded * 0.4));
  }

  const margin = 0.05;
  const overOdds = Number(((1 / overProb) * (1 - margin / 2)).toFixed(2));
  const underOdds = Number(((1 / (1 - overProb)) * (1 - margin / 2)).toFixed(2));

  const scoreDiff = score.home - score.away;
  const ahLine = -scoreDiff * 0.5;

  return {
    overOdds: Math.max(1.05, Math.min(10, overOdds)),
    underOdds: Math.max(1.05, Math.min(10, underOdds)),
    ouLine,
    ahLine,
    ahHome: 1.90,
    ahAway: 1.90,
  };
}

/** 生成随机日期 */
function generateRandomDate(year: number): string {
  const month = Math.floor(Math.random() * 10) + 1; // 1-10月
  const day = Math.floor(Math.random() * 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ============================================
// 回测核心逻辑
// ============================================

/**
 * 将历史快照转换为信号输入
 */
function snapshotToInputs(
  match: HistoricalMatch,
  snapshot: HistoricalSnapshot
): { matchState: MatchStateInput; marketState: MarketStateInput | null } {
  const matchState: MatchStateInput = {
    fixture_id: match.id,
    minute: snapshot.minute,
    score_home: snapshot.score.home,
    score_away: snapshot.score.away,
    shots_home: snapshot.stats.shots.home,
    shots_away: snapshot.stats.shots.away,
    shots_on_home: snapshot.stats.shotsOn.home,
    shots_on_away: snapshot.stats.shotsOn.away,
    xg_home: snapshot.stats.xg.home,
    xg_away: snapshot.stats.xg.away,
    corners_home: snapshot.stats.corners.home,
    corners_away: snapshot.stats.corners.away,
    possession_home: snapshot.stats.possession.home,
    possession_away: snapshot.stats.possession.away,
    dangerous_home: snapshot.stats.dangerous.home,
    dangerous_away: snapshot.stats.dangerous.away,
    shots_last_15: Math.round((snapshot.stats.shots.home + snapshot.stats.shots.away) * 0.25),
    xg_last_15: (snapshot.stats.xg.home + snapshot.stats.xg.away) * 0.2,
    shots_prev_15: Math.round((snapshot.stats.shots.home + snapshot.stats.shots.away) * 0.2),
    corners_last_15: Math.round((snapshot.stats.corners.home + snapshot.stats.corners.away) * 0.2),
    stats_available: true,
    events_available: true,
  };

  let marketState: MarketStateInput | null = null;
  if (snapshot.odds) {
    marketState = {
      over_odds: snapshot.odds.overOdds,
      under_odds: snapshot.odds.underOdds,
      over_odds_prev: snapshot.odds.overOdds + (Math.random() - 0.5) * 0.1,
      ou_line: snapshot.odds.ouLine,
      ah_line: snapshot.odds.ahLine,
      ah_home: snapshot.odds.ahHome,
      ah_away: snapshot.odds.ahAway,
      win_home: null,
      win_draw: null,
      win_away: null,
      is_live: true,
    };
  }

  return { matchState, marketState };
}

/**
 * 验证信号正确性
 */
function validateSignal(
  signal: UnifiedLateSignal,
  match: HistoricalMatch,
  snapshot: HistoricalSnapshot
): {
  predictedOutcome: 'OVER' | 'AH_HOME' | 'AH_AWAY' | null;
  targetLine: number;
  isCorrect: boolean | null;
  odds: number;
} {
  if (signal.action === 'IGNORE') {
    return { predictedOutcome: null, targetLine: 0, isCorrect: null, odds: 1 };
  }

  const finalGoals = match.finalScore.home + match.finalScore.away;
  const goalsAtSignal = snapshot.score.home + snapshot.score.away;
  const ouLine = snapshot.odds?.ouLine ?? 2.5;

  // 大球场景
  if (signal.scenario_tag === 'OVER_SPRINT' || signal.scenario_tag === 'DEADLOCK_BREAK') {
    const isCorrect = finalGoals > ouLine;
    return {
      predictedOutcome: 'OVER',
      targetLine: ouLine,
      isCorrect,
      odds: snapshot.odds?.overOdds ?? 1.8,
    };
  }

  // 强队追分场景 - 也是大球
  if (signal.scenario_tag === 'STRONG_BEHIND') {
    const goalsAfter = finalGoals - goalsAtSignal;
    const isCorrect = goalsAfter > 0;
    return {
      predictedOutcome: 'OVER',
      targetLine: ouLine,
      isCorrect,
      odds: snapshot.odds?.overOdds ?? 1.8,
    };
  }

  // 通用场景
  return {
    predictedOutcome: 'OVER',
    targetLine: ouLine,
    isCorrect: finalGoals > ouLine,
    odds: snapshot.odds?.overOdds ?? 1.8,
  };
}

/**
 * 计算单个信号的盈亏
 */
function calculateProfit(
  isCorrect: boolean | null,
  odds: number,
  stake: number,
  action: string
): number {
  if (isCorrect === null) return 0;

  // PREPARE 信号减半注码
  const actualStake = action === 'PREPARE' ? stake * 0.5 : stake;

  if (isCorrect) {
    return (odds - 1) * actualStake;
  }
  return -actualStake;
}

/**
 * 运行单场比赛的回测
 */
function backtestMatch(
  match: HistoricalMatch,
  config: BacktestConfig
): SignalBacktestResult[] {
  const results: SignalBacktestResult[] = [];

  for (const snapshot of match.snapshots) {
    // 时间过滤
    if (snapshot.minute < config.minMinute || snapshot.minute > config.maxMinute) {
      continue;
    }

    // 转换输入
    const { matchState, marketState } = snapshotToInputs(match, snapshot);

    // 计算信号
    const signal = calculateUnifiedLateSignal(matchState, marketState);

    // 分数/置信度过滤
    if (signal.score < config.minScore || signal.confidence < config.minConfidence) {
      continue;
    }

    // 场景过滤
    if (!config.scenarios.includes(signal.scenario_tag)) {
      continue;
    }

    // 验证结果
    const validation = validateSignal(signal, match, snapshot);

    // 计算盈亏
    const stake = config.baseStake;
    const profit = calculateProfit(
      validation.isCorrect,
      validation.odds,
      stake,
      signal.action
    );

    results.push({
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      date: match.date,
      minute: snapshot.minute,
      scoreAtSignal: snapshot.score,
      finalScore: match.finalScore,
      signal,
      scenario: signal.scenario_tag,
      action: signal.action,
      score: signal.score,
      confidence: signal.confidence,
      reasons: signal.reasons,
      predictedOutcome: validation.predictedOutcome,
      targetLine: validation.targetLine,
      actualGoalsAfter: (match.finalScore.home + match.finalScore.away) -
        (snapshot.score.home + snapshot.score.away),
      isCorrect: validation.isCorrect,
      odds: validation.odds,
      stake,
      profit,
    });
  }

  return results;
}

/**
 * 计算回测汇总统计
 */
function calculateSummary(
  results: SignalBacktestResult[],
  matches: HistoricalMatch[],
  config: BacktestConfig
): BacktestSummary {
  const datasetStats = calculateDatasetStats(matches);

  // 基础统计
  const betSignals = results.filter(r => r.action === 'BET');
  const prepareSignals = results.filter(r => r.action === 'PREPARE');
  const ignoreSignals = results.filter(r => r.action === 'IGNORE');

  const betCorrect = betSignals.filter(r => r.isCorrect === true).length;
  const prepareCorrect = prepareSignals.filter(r => r.isCorrect === true).length;

  // 场景统计
  const scenarioMap = new Map<ScenarioTag, SignalBacktestResult[]>();
  for (const r of results) {
    const arr = scenarioMap.get(r.scenario) || [];
    arr.push(r);
    scenarioMap.set(r.scenario, arr);
  }

  const byScenario: ScenarioStats[] = [];
  for (const [scenario, signals] of scenarioMap) {
    const bet = signals.filter(s => s.action === 'BET');
    const prepare = signals.filter(s => s.action === 'PREPARE');
    const ignore = signals.filter(s => s.action === 'IGNORE');
    const correct = signals.filter(s => s.isCorrect === true).length;
    const totalWithOutcome = signals.filter(s => s.isCorrect !== null).length;

    byScenario.push({
      scenario,
      totalSignals: signals.length,
      betSignals: bet.length,
      prepareSignals: prepare.length,
      ignoreSignals: ignore.length,
      correctPredictions: correct,
      accuracy: totalWithOutcome > 0 ? (correct / totalWithOutcome) * 100 : 0,
      totalProfit: signals.reduce((sum, s) => sum + s.profit, 0),
      avgOdds: signals.length > 0
        ? signals.reduce((sum, s) => sum + s.odds, 0) / signals.length
        : 0,
    });
  }

  // 时间分布
  const minuteMap = new Map<number, SignalBacktestResult[]>();
  for (const r of results) {
    const bucket = Math.floor(r.minute / 5) * 5;
    const arr = minuteMap.get(bucket) || [];
    arr.push(r);
    minuteMap.set(bucket, arr);
  }

  const byMinute: MinuteStats[] = [];
  for (const [minute, signals] of minuteMap) {
    const correct = signals.filter(s => s.isCorrect === true).length;
    const total = signals.filter(s => s.isCorrect !== null).length;
    byMinute.push({
      minute,
      signals: signals.length,
      correct,
      accuracy: total > 0 ? (correct / total) * 100 : 0,
      profit: signals.reduce((sum, s) => sum + s.profit, 0),
    });
  }
  byMinute.sort((a, b) => a.minute - b.minute);

  // 盈亏统计
  const totalProfit = results.reduce((sum, r) => sum + r.profit, 0);
  const totalStake = betSignals.length * config.baseStake +
    prepareSignals.length * config.baseStake * 0.5;
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;

  // 资金曲线和最大回撤
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve: BacktestSummary['equityCurve'] = [];

  const sortedResults = [...results].sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.minute - b.minute;
  });

  for (let i = 0; i < sortedResults.length; i++) {
    equity += sortedResults[i].profit;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    equityCurve.push({
      index: i + 1,
      equity: Math.round(equity),
      drawdown: Math.round(drawdown),
    });
  }

  // 夏普比率 (简化计算)
  const returns = results.map(r => r.profit / config.baseStake);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // 盈利因子
  const grossProfit = results.filter(r => r.profit > 0).reduce((sum, r) => sum + r.profit, 0);
  const grossLoss = Math.abs(results.filter(r => r.profit < 0).reduce((sum, r) => sum + r.profit, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  // 最佳/最差信号
  const sortedByProfit = [...results].sort((a, b) => b.profit - a.profit);
  const bestSignals = sortedByProfit.slice(0, 10);
  const worstSignals = sortedByProfit.slice(-10).reverse();

  return {
    config,
    runAt: new Date().toISOString(),
    datasetStats,
    totalMatches: matches.length,
    totalSnapshots: matches.reduce((sum, m) => sum + m.snapshots.length, 0),
    totalSignals: results.length,
    betSignals: betSignals.length,
    prepareSignals: prepareSignals.length,
    ignoreSignals: ignoreSignals.length,
    correctPredictions: betCorrect + prepareCorrect,
    overallAccuracy: results.filter(r => r.isCorrect !== null).length > 0
      ? ((betCorrect + prepareCorrect) / results.filter(r => r.isCorrect !== null).length) * 100
      : 0,
    betAccuracy: betSignals.filter(r => r.isCorrect !== null).length > 0
      ? (betCorrect / betSignals.filter(r => r.isCorrect !== null).length) * 100
      : 0,
    prepareAccuracy: prepareSignals.filter(r => r.isCorrect !== null).length > 0
      ? (prepareCorrect / prepareSignals.filter(r => r.isCorrect !== null).length) * 100
      : 0,
    totalStake,
    totalProfit,
    roi,
    maxDrawdown,
    sharpeRatio,
    profitFactor,
    byScenario,
    byMinute,
    bestSignals,
    worstSignals,
    equityCurve,
  };
}

// ============================================
// 主回测函数
// ============================================

/**
 * 运行晚期模块大规模回测
 */
export async function runLateModuleBacktest(
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
  onProgress?: (progress: BacktestProgress) => void
): Promise<{
  results: SignalBacktestResult[];
  summary: BacktestSummary;
  matches: HistoricalMatch[];
}> {
  let matches: HistoricalMatch[] = [];

  const progress: BacktestProgress = {
    phase: 'collecting',
    totalMatches: 0,
    processedMatches: 0,
    totalSnapshots: 0,
    processedSnapshots: 0,
  };

  // 数据收集
  if (config.dataSource === 'mock') {
    // 使用模拟数据
    matches = generateMockHistoricalMatches(200);
    progress.totalMatches = matches.length;
    progress.processedMatches = matches.length;
    onProgress?.(progress);
  } else if (config.dataSource === 'api') {
    // 从 API 收集真实数据
    if (config.dateFrom && config.dateTo) {
      matches = await collectByDateRange(
        config.dateFrom,
        config.dateTo,
        { leagueIds: config.leagueIds, delayMs: 500 },
        (p) => {
          progress.totalMatches = p.total;
          progress.processedMatches = p.completed;
          progress.currentMatch = p.currentMatch;
          onProgress?.(progress);
        }
      );
    } else if (config.leagueIds && config.season) {
      matches = await collectLeagueData(
        {
          leagueIds: config.leagueIds,
          season: config.season,
          delayMs: 500,
        },
        (p) => {
          progress.totalMatches = p.total;
          progress.processedMatches = p.completed;
          progress.currentMatch = p.currentMatch;
          onProgress?.(progress);
        }
      );
    }
  } else if (config.dataSource === 'local') {
    // 从本地存储加载
    const stored = localStorage.getItem('backtest_historical_matches');
    if (stored) {
      matches = importFromJSON(stored);
    }
  }

  // 分析阶段
  progress.phase = 'analyzing';
  progress.totalSnapshots = matches.reduce((sum, m) => sum + m.snapshots.length, 0);
  onProgress?.(progress);

  // 运行回测
  const results: SignalBacktestResult[] = [];

  for (let i = 0; i < matches.length; i++) {
    const matchResults = backtestMatch(matches[i], config);
    results.push(...matchResults);

    progress.processedMatches = i + 1;
    progress.processedSnapshots += matches[i].snapshots.length;
    onProgress?.(progress);
  }

  // 生成汇总
  const summary = calculateSummary(results, matches, config);

  progress.phase = 'completed';
  onProgress?.(progress);

  return { results, summary, matches };
}

/**
 * 保存回测数据到本地存储
 */
export function saveBacktestData(
  matches: HistoricalMatch[],
  key = 'backtest_historical_matches'
): void {
  const json = exportToJSON(matches);
  localStorage.setItem(key, json);
}

/**
 * 加载回测数据
 */
export function loadBacktestData(
  key = 'backtest_historical_matches'
): HistoricalMatch[] {
  const json = localStorage.getItem(key);
  if (!json) return [];
  return importFromJSON(json);
}

/**
 * 获取已保存数据的统计
 */
export function getSavedDataStats(): {
  hasData: boolean;
  matchCount: number;
  dateRange: { min: string; max: string } | null;
} {
  const matches = loadBacktestData();
  if (matches.length === 0) {
    return { hasData: false, matchCount: 0, dateRange: null };
  }

  const dates = matches.map(m => m.date).sort();
  return {
    hasData: true,
    matchCount: matches.length,
    dateRange: {
      min: dates[0],
      max: dates[dates.length - 1],
    },
  };
}

// ============================================
// 导出工具函数
// ============================================

export {
  MAJOR_LEAGUES,
  calculateDatasetStats,
  exportToJSON,
  importFromJSON,
};
