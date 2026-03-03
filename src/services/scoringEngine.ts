// ============================================
// 动态评分引擎 - 80+进球概率评分系统
// 基于6大因子体系：比分/进攻/动量/历史/特殊
// ============================================
// STRICT REAL DATA MODE: 仅使用真实 API 数据
// ============================================

import type { AdvancedMatch } from '../data/advancedMockData';
import type { TeamSeasonStats, ScoringFactors, ScoreResult, OddsAnalysis } from '../types';

// 重新导出类型，供其他模块使用
export type { ScoringFactors, ScoreResult } from '../types';

// 基础分
const BASE_SCORE = 30;

// ============================================
// STRICT REAL DATA MODE 检查
// ============================================

/**
 * 检查比赛是否可以评分
 * 返回 null 表示可以评分，返回 string 表示不能评分的原因
 */
function checkScoreability(match: AdvancedMatch): string | null {
  // 检查是否被标记为无法评分
  if (match._unscoreable) {
    return match._noStatsReason || 'MISSING_STATISTICS_DATA';
  }

  // 检查统计数据是否可用
  if (!match.stats) {
    return 'NO_STATS_OBJECT';
  }

  // 检查关键统计字段
  const stats = match.stats;
  if (stats.shots.home === 0 && stats.shots.away === 0 && match.minute > 10) {
    // 10分钟后还没有射门数据，可能是数据缺失
    return 'SUSPICIOUS_ZERO_SHOTS';
  }

  return null; // 可以评分
}

// ============================================
// 因子1：比分因子（最高 +25）
// ============================================
interface ScoreFactorResult {
  score: number;
  details: {
    isDraw: boolean;
    oneGoalDiff: boolean;
    twoGoalDiff: boolean;
    largeGap: boolean;
    strongBehind: boolean;
    strongLeadByOne: boolean;
  };
}

function calculateScoreFactor(match: AdvancedMatch): ScoreFactorResult {
  const homeScore = match.home.score;
  const awayScore = match.away.score;
  const diff = Math.abs(homeScore - awayScore);
  const handicap = match.home.handicap ?? 0;

  // 判断强队
  const isHomeStrong = handicap !== 0 && handicap < 0;
  const isAwayStrong = handicap !== 0 && handicap > 0;

  // 判断强队落后
  const strongBehind =
    (isHomeStrong && homeScore < awayScore) ||
    (isAwayStrong && awayScore < homeScore);

  // 判断强队领先1球
  const strongLeadByOne =
    (isHomeStrong && homeScore - awayScore === 1) ||
    (isAwayStrong && awayScore - homeScore === 1);

  const details = {
    isDraw: diff === 0,
    oneGoalDiff: diff === 1,
    twoGoalDiff: diff === 2,
    largeGap: diff >= 3,
    strongBehind,
    strongLeadByOne,
  };

  let score = 0;

  // 平局 +18
  if (details.isDraw) score += 18;
  // 1球差距 +12
  else if (details.oneGoalDiff) score += 12;
  // 2球差距 +5
  else if (details.twoGoalDiff) score += 5;
  // 3球及以上差距 -10
  else if (details.largeGap) score -= 10;

  // 强队落后 +15
  if (details.strongBehind) score += 15;

  // 强队领先1球 +5
  if (details.strongLeadByOne) score += 5;

  return { score: Math.max(-10, Math.min(25, score)), details };
}

// ============================================
// 因子2：进攻因子（最高 +30）
// ============================================
interface AttackFactorResult {
  score: number;
  details: {
    totalShots: number;
    shotsOnTarget: number;
    shotAccuracy: number;
    corners: number;
    xgTotal: number;
    xgDebt: number;
  };
}

function calculateAttackFactor(match: AdvancedMatch): AttackFactorResult {
  const stats = match.stats;
  const totalShots = (stats?.shots?.home || 0) + (stats?.shots?.away || 0);
  const shotsOnTarget = (stats?.shotsOnTarget?.home || 0) + (stats?.shotsOnTarget?.away || 0);
  const shotAccuracy = totalShots > 0 ? (shotsOnTarget / totalShots) * 100 : 0;
  const corners = (match.corners?.home || 0) + (match.corners?.away || 0);
  const xgTotal = (stats?.xG?.home || 0) + (stats?.xG?.away || 0);
  const totalGoals = match.home.score + match.away.score;
  const xgDebt = xgTotal - totalGoals;

  const details = {
    totalShots,
    shotsOnTarget,
    shotAccuracy,
    corners,
    xgTotal,
    xgDebt,
  };

  let score = 0;

  // 全场射门 ≥ 25 → +10, ≥ 18 → +6
  if (totalShots >= 25) score += 10;
  else if (totalShots >= 18) score += 6;

  // 射正率 ≥ 45% → +8, ≥ 35% → +4
  if (shotAccuracy >= 45) score += 8;
  else if (shotAccuracy >= 35) score += 4;

  // 角球总数 ≥ 12 → +6, ≥ 8 → +3
  if (corners >= 12) score += 6;
  else if (corners >= 8) score += 3;

  // xG总和 ≥ 3.0 → +10, ≥ 2.0 → +5
  if (xgTotal >= 3.0) score += 10;
  else if (xgTotal >= 2.0) score += 5;

  // xG > 实际进球 × 1.5（欠债要还）→ +8
  if (xgTotal > totalGoals * 1.5 && totalGoals > 0) score += 8;

  return { score: Math.min(30, score), details };
}

// ============================================
// 因子3：动量因子（最高 +35）- 最重要！
// STRICT REAL DATA MODE: 使用真实 events 数据
// ============================================
interface MomentumFactorResult {
  score: number;
  details: {
    recentShots: number;
    recentCorners: number;
    secondHalfIntensity: number;
    losingTeamPossession: number;
    attackDensityChange: number;
  };
  _dataQuality: 'real' | 'partial' | 'unavailable';
}

// ============================================
// 纯统计通道：基于实时 stats + 初盘兑现度
// ============================================

interface StatsChannel {
  totalScore: number;
  shotsScore: number;
  possessionScore: number;
  eventsScore: number;
  lineRealizationScore: number;
  reasons: string[];
  // 原始统计快照，便于 UI/分析层访问完整 stats 字段
  rawStats?: {
    possession?: { home: number; away: number };
    shots?: { home: number; away: number };
    shotsOnTarget?: { home: number; away: number };
    shotsOffTarget?: { home: number; away: number };
    shotsInsideBox?: { home: number; away: number };
    shotsOutsideBox?: { home: number; away: number };
    xG?: { home: number; away: number };
    attacks?: { home: number; away: number };
    dangerousAttacks?: { home: number; away: number };
    corners?: { home: number; away: number };
  };
  // 标记统计数据完整性，用于 STRICT 模式提示
  flags?: {
    missingCoreStats?: boolean;   // 核心字段（shots / shotsOnTarget / xG）严重缺失
    missingAuxStats?: boolean;    // 辅助字段（attacks / 危险进攻 / 控球）缺失
  };
}

function calculateStatsChannel(match: AdvancedMatch): StatsChannel | null {
  // 前提：有初始盘口，否则不计算
  const initHandicap = match.initialHandicap ?? match.home.handicap ?? null;
  if (initHandicap == null) return null;

  const minute = match.minute ?? 0;
  const homeGoals = match.home.score ?? 0;
  const awayGoals = match.away.score ?? 0;

  const stats = match.stats;
  if (!stats) return null;

  let shotsScore = 0;
  let possessionScore = 0;
  let eventsScore = 0;
  let lineRealizationScore = 0;
  const reasons: string[] = [];

  // 统计可用性标记：核心 / 辅助是否至少有部分字段可用
  const corePresent =
    !!stats.shots || !!stats.shotsOnTarget || !!stats.xG;
  const auxPresent =
    !!stats.attacks || !!stats.dangerousAttacks || !!stats.possession;

  // 1) 射门压制分 (0-30)
  const shotsTotalHome = typeof stats.shots?.home === 'number' ? stats.shots.home : null;
  const shotsTotalAway = typeof stats.shots?.away === 'number' ? stats.shots.away : null;
  const shotsOnHome = typeof stats.shotsOnTarget?.home === 'number' ? stats.shotsOnTarget.home : null;
  const shotsOnAway = typeof stats.shotsOnTarget?.away === 'number' ? stats.shotsOnTarget.away : null;
  const xgHome = typeof stats.xG?.home === 'number' ? stats.xG.home : null;
  const xgAway = typeof stats.xG?.away === 'number' ? stats.xG.away : null;

  if (
    shotsTotalHome !== null &&
    shotsTotalAway !== null &&
    shotsOnHome !== null &&
    shotsOnAway !== null
  ) {
    const shotsDiff = shotsTotalHome - shotsTotalAway;
    const onDiff = shotsOnHome - shotsOnAway;
    let score = 0;

    // 简化规则：射门差 + 射正差越大，分越高，最大 30
    score += Math.max(0, Math.min(20, shotsDiff * 2));
    score += Math.max(0, Math.min(10, onDiff * 3));

    if (xgHome !== null && xgAway !== null) {
      const xgDiff = xgHome - xgAway;
      score += Math.max(0, Math.min(5, xgDiff * 2));
      reasons.push(`xG ${xgHome.toFixed(2)} - ${xgAway.toFixed(2)}`);
    }

    shotsScore = Math.min(30, score);
    reasons.push(`射门 ${shotsTotalHome}-${shotsTotalAway}, 射正 ${shotsOnHome}-${shotsOnAway}`);
  }

  // 2) 控球压制分 (0-20)
  const possHome = typeof stats.possession?.home === 'number' ? stats.possession.home : null;
  const possAway = typeof stats.possession?.away === 'number' ? stats.possession.away : null;
  if (possHome !== null && possAway !== null) {
    const possDiff = possHome - possAway;
    let score = 0;
    if (possDiff > 5) {
      score = Math.min(20, (possDiff - 5) * 0.5);
    }
    possessionScore = Math.max(0, score);
    reasons.push(`控球 ${possHome.toFixed(1)}%-${possAway.toFixed(1)}%`);
  }

  // 3) 攻防事件分 (0-20)
  const cornersHome = (match.corners?.home as number | undefined) ?? null;
  const cornersAway = (match.corners?.away as number | undefined) ?? null;
  let events = 0;

  if (cornersHome !== null && cornersAway !== null) {
    const cornerDiff = cornersHome - cornersAway;
    events += Math.max(0, Math.min(10, cornerDiff * 1.5));
    reasons.push(`角球 ${cornersHome}-${cornersAway}`);
  }

  const redHome = match.cards?.red?.home ?? 0;
  const redAway = match.cards?.red?.away ?? 0;
  if (redAway > redHome) {
    events += 5;
    reasons.push('对手红牌在身');
  }

  eventsScore = Math.min(20, events);

  // 4) 初盘兑现度分 (0-30)
  const isHomeFavorite = initHandicap < 0;
  const favGoals = isHomeFavorite ? homeGoals : awayGoals;
  const dogGoals = isHomeFavorite ? awayGoals : homeGoals;
  const goalDiff = favGoals - dogGoals;

  const absHandicap = Math.abs(initHandicap);
  let expectedAtMinute = absHandicap * (minute / 90);
  expectedAtMinute = Math.min(absHandicap, expectedAtMinute);

  const shortfall = expectedAtMinute - goalDiff;
  let lineScore = 0;
  if (shortfall > 0) {
    lineScore = Math.min(30, shortfall * 10);
  }

  lineRealizationScore = Math.max(0, lineScore);
  reasons.push(
    `初盘 ${initHandicap >= 0 ? `+${initHandicap}` : String(initHandicap)}, 当前比分 ${homeGoals}-${awayGoals}, ${minute}'`
  );

  const totalScore = Math.min(
    100,
    shotsScore + possessionScore + eventsScore + lineRealizationScore
  );

  return {
    totalScore,
    shotsScore,
    possessionScore,
    eventsScore,
    lineRealizationScore,
    reasons,
    rawStats: {
      possession: stats.possession,
      shots: stats.shots,
      shotsOnTarget: stats.shotsOnTarget,
      shotsOffTarget: stats.shotsOffTarget,
      shotsInsideBox: stats.shotsInsideBox,
      shotsOutsideBox: stats.shotsOutsideBox,
      xG: stats.xG,
      attacks: stats.attacks,
      dangerousAttacks: stats.dangerousAttacks,
      corners: stats.corners,
    },
    flags: {
      missingCoreStats: !corePresent,
      missingAuxStats: !auxPresent,
    },
  };
}

function calculateMomentumFactor(match: AdvancedMatch): MomentumFactorResult {
  const stats = match.stats;
  const minute = match.minute;

  // 近20分钟射门（从真实 events 计算）
  const recentShots = stats?.recentShots20min ?? 0;

  // 近20分钟角球（API-Football events 不支持，标记为不可用）
  const recentCorners = 0; // 真实数据不可用

  // 下半场vs上半场射门比（使用真实 halfTimeIntensity）
  let secondHalfIntensity = 1.0;
  let intensityDataQuality: 'real' | 'partial' | 'unavailable' = 'unavailable';

  if (stats?._halfTimeIntensity) {
    const { firstHalf, secondHalf } = stats._halfTimeIntensity;
    if (firstHalf > 0) {
      secondHalfIntensity = secondHalf / firstHalf;
      intensityDataQuality = 'real';
    } else if (secondHalf > 0) {
      secondHalfIntensity = 2.0; // 上半场0射门，下半场有射门
      intensityDataQuality = 'real';
    }
  }

  // 落后方近期控球率（使用真实 API 数据）
  const homeScore = match.home.score;
  const awayScore = match.away.score;
  const homePossession = stats?.possession?.home ?? 0;
  const awayPossession = stats?.possession?.away ?? 0;

  let losingTeamPossession = 0;
  if (homeScore < awayScore) {
    losingTeamPossession = homePossession;
  } else if (awayScore < homeScore) {
    losingTeamPossession = awayPossession;
  }

  // 进攻密度变化（使用真实 Dangerous Attacks 数据）
  const dangerousHome = stats?.dangerousAttacks?.home ?? 0;
  const dangerousAway = stats?.dangerousAttacks?.away ?? 0;
  const totalDangerous = dangerousHome + dangerousAway;

  // 只有在有真实数据时才计算
  let attackDensityChange = 0;
  if (totalDangerous > 0 && minute > 0) {
    const expectedDangerous = minute * 0.3;
    attackDensityChange = totalDangerous > expectedDangerous ? 1 : 0;
  }

  const details = {
    recentShots,
    recentCorners,
    secondHalfIntensity,
    losingTeamPossession,
    attackDensityChange,
  };

  // 判断数据质量
  const hasRealStats = stats?._realDataAvailable === true;
  const _dataQuality: 'real' | 'partial' | 'unavailable' = hasRealStats
    ? (intensityDataQuality === 'real' ? 'real' : 'partial')
    : 'unavailable';

  let score = 0;

  // STRICT MODE: 仅在有真实数据时加分
  if (hasRealStats) {
    // 近20分钟射门 ≥ 8 → +15, ≥ 5 → +8
    // 注意：recentShots 现在来自 events，可能比 statistics 少
    if (recentShots >= 5) score += 15;
    else if (recentShots >= 3) score += 8;
    else if (recentShots >= 1) score += 4;

    // 下半场射门 > 上半场 × 1.5 → +10（仅在有真实数据时）
    if (intensityDataQuality === 'real' && secondHalfIntensity > 1.5) score += 10;

    // 落后方近20分钟控球 ≥ 60% → +10, ≥ 55% → +5
    if (homeScore !== awayScore) {
      if (losingTeamPossession >= 60) score += 10;
      else if (losingTeamPossession >= 55) score += 5;
    }

    // 进攻密度上升 → +8（仅在有真实危险进攻数据时）
    if (totalDangerous > 0 && attackDensityChange > 0) score += 8;
  }

  return { score: Math.min(35, score), details, _dataQuality };
}

// ============================================
// 因子4：历史因子（最高 +25）
// 注意：需要额外API数据，如无数据则使用默认值
// ============================================
interface HistoryFactorResult {
  score: number;
  details: {
    homeTeam75PlusRate: number;
    awayTeam75PlusRate: number;
    h2h75PlusGoals: number;
    leagueAvg75Plus: number;
    losingTeamComebackRate: number;
  };
  dataAvailable: boolean;
}

function calculateHistoryFactor(
  match: AdvancedMatch,
  homeTeamStats?: TeamSeasonStats | null,
  awayTeamStats?: TeamSeasonStats | null,
  h2h75PlusGoals?: number
): HistoryFactorResult {
  // 从球队统计中获取 75-90 分钟进球率
  let homeTeam75PlusRate = 0;
  let awayTeam75PlusRate = 0;
  let dataAvailable = false;

  if (homeTeamStats?.goals?.for?.minute?.['76-90']?.percentage) {
    const pct = homeTeamStats.goals.for.minute['76-90'].percentage;
    homeTeam75PlusRate = Number.parseFloat(pct.replace('%', '')) || 0;
    dataAvailable = true;
  }

  if (awayTeamStats?.goals?.for?.minute?.['76-90']?.percentage) {
    const pct = awayTeamStats.goals.for.minute['76-90'].percentage;
    awayTeam75PlusRate = Number.parseFloat(pct.replace('%', '')) || 0;
    dataAvailable = true;
  }

  // H2H 近5场 75+ 进球数（需要从 H2H API 获取并计算）
  const h2hGoals = h2h75PlusGoals ?? 0;

  // 联赛75+分钟场均进球（暂用默认值，可从联赛统计获取）
  const leagueAvg75Plus = 0.5; // 默认值

  // 落后方历史追分成功率（需要更复杂的历史数据）
  const losingTeamComebackRate = 30; // 默认30%

  const details = {
    homeTeam75PlusRate,
    awayTeam75PlusRate,
    h2h75PlusGoals: h2hGoals,
    leagueAvg75Plus,
    losingTeamComebackRate,
  };

  let score = 0;

  // 两队75+分钟进球率均 > 40% → +12, > 30% → +6
  if (homeTeam75PlusRate > 40 && awayTeam75PlusRate > 40) score += 12;
  else if (homeTeam75PlusRate > 30 && awayTeam75PlusRate > 30) score += 6;

  // 任一队75+分钟进球率 > 50% → +8
  if (homeTeam75PlusRate > 50 || awayTeam75PlusRate > 50) score += 8;

  // H2H近5场75+分钟进球 ≥ 4 → +10, ≥ 2 → +5
  if (h2hGoals >= 4) score += 10;
  else if (h2hGoals >= 2) score += 5;

  // 联赛75+分钟场均进球 > 0.6 → +5
  if (leagueAvg75Plus > 0.6) score += 5;

  // 落后方历史追分成功率 > 40% → +8
  if (losingTeamComebackRate > 40 && match.home.score !== match.away.score) {
    score += 8;
  }

  return { score: Math.min(25, score), details, dataAvailable };
}

// ============================================
// 因子5：特殊因子（+/- 20）
// ============================================
interface SpecialFactorResult {
  score: number;
  details: {
    redCardAdvantage: boolean;
    highScoringMatch: boolean;
    subsRemaining: boolean;
    recentAttackSub: boolean;
    varCancelled: boolean;
    allSubsUsed: boolean;
    tooManyFouls: boolean;
    possessionStalemate: boolean;
  };
}

function calculateSpecialFactor(match: AdvancedMatch): SpecialFactorResult {
  const cards = match.cards;
  const stats = match.stats;
  const totalGoals = match.home.score + match.away.score;

  // 红牌优势判断
  const homeReds = cards?.red?.home || 0;
  const awayReds = cards?.red?.away || 0;
  const redCardAdvantage = (homeReds > 0 && awayReds === 0) || (awayReds > 0 && homeReds === 0);

  // 本场已有3+球
  const highScoringMatch = totalGoals >= 3;

  // 双方都还有换人名额
  const homeSubs = match.subsRemaining?.home ?? 5;
  const awaySubs = match.subsRemaining?.away ?? 5;
  const subsRemaining = homeSubs > 0 && awaySubs > 0;

  // 刚换上进攻球员（5分钟内）
  const recentAttackSub = (match.recentAttackSubs ?? 0) > 0;

  // VAR取消进球
  const varCancelled = match.varCancelled ?? false;

  // 两队都已换满
  const allSubsUsed = homeSubs === 0 && awaySubs === 0;

  // 犯规过多（总犯规 > 25）
  const totalFouls = (stats?.fouls?.home || 0) + (stats?.fouls?.away || 0);
  const tooManyFouls = totalFouls > 25;

  // 双方控球接近50-50
  const homePossession = stats?.possession?.home || 50;
  const possessionStalemate = Math.abs(homePossession - 50) < 5;

  const details = {
    redCardAdvantage,
    highScoringMatch,
    subsRemaining,
    recentAttackSub,
    varCancelled,
    allSubsUsed,
    tooManyFouls,
    possessionStalemate,
  };

  let score = 0;

  // 红牌（多一人方进攻）→ +12
  if (redCardAdvantage) score += 12;

  // 本场已有3+球 → +8
  if (highScoringMatch) score += 8;

  // 双方都还有换人名额 → +5
  if (subsRemaining) score += 5;

  // 刚换上进攻球员 → +6
  if (recentAttackSub) score += 6;

  // VAR取消进球 → +5
  if (varCancelled) score += 5;

  // 两队都已换满3人 → -8
  if (allSubsUsed) score -= 8;

  // 犯规过多 → -5
  if (tooManyFouls) score -= 5;

  // 双方控球接近50-50 → -3
  if (possessionStalemate) score -= 3;

  return { score: Math.max(-20, Math.min(20, score)), details };
}

// ============================================
// 因子6：赔率因子（最高 +20）- 新增！
// 需要传入赔率分析数据
// ============================================
interface OddsFactorResult {
  score: number;
  details: {
    handicapTightening: boolean;      // 让球盘收紧 +10
    overOddsDrop: boolean;            // 大球赔率急跌 +8
    multiBookmakerMovement: boolean;  // 多家同向变动 +12
    liveOddsShift: boolean;           // 临场变盘 +8
    oddsXgDivergence: boolean;        // 赔率与xG背离 +6
    handicapWidening: boolean;        // 让球盘放宽 -5
    goalExpectation: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  dataAvailable: boolean;
}

/**
 * 计算赔率因子
 * @param match 比赛数据
 * @param oddsAnalysis 赔率分析数据（可选）
 * @param previousOdds 之前的赔率数据（用于检测变化，可选）
 */
export function calculateOddsFactor(
  match: AdvancedMatch,
  oddsAnalysis?: OddsAnalysis | null,
  previousOdds?: OddsAnalysis | null
): OddsFactorResult {
  // 默认值
  const defaultDetails: {
    handicapTightening: boolean;
    overOddsDrop: boolean;
    multiBookmakerMovement: boolean;
    liveOddsShift: boolean;
    oddsXgDivergence: boolean;
    handicapWidening: boolean;
    goalExpectation: 'HIGH' | 'MEDIUM' | 'LOW';
  } = {
    handicapTightening: false,
    overOddsDrop: false,
    multiBookmakerMovement: false,
    liveOddsShift: false,
    oddsXgDivergence: false,
    handicapWidening: false,
    goalExpectation: 'MEDIUM',
  };

  // 没有赔率数据时返回0分
  if (!oddsAnalysis) {
    return {
      score: 0,
      details: defaultDetails,
      dataAvailable: false,
    };
  }

  let score = 0;
  const details = { ...defaultDetails };

  // 1. 市场进球预期 (基于大小球赔率)
  details.goalExpectation = oddsAnalysis.goalExpectation;
  if (oddsAnalysis.goalExpectation === 'HIGH') {
    score += 6; // 市场预期高进球
  } else if (oddsAnalysis.goalExpectation === 'LOW') {
    score -= 3; // 市场预期低进球
  }

  // 2. 检测让球盘变化 (需要 previousOdds)
  if (previousOdds?.asianHandicap && oddsAnalysis.asianHandicap) {
    const prevLine = previousOdds.asianHandicap.line;
    const currLine = oddsAnalysis.asianHandicap.line;

    // 让球盘收紧 (如 -1.5 变成 -1.0)
    if (Math.abs(currLine) < Math.abs(prevLine) - 0.25) {
      details.handicapTightening = true;
      score += 10;
    }

    // 让球盘放宽 (如 -1.0 变成 -1.5)
    if (Math.abs(currLine) > Math.abs(prevLine) + 0.25) {
      details.handicapWidening = true;
      score -= 5;
    }
  }

  // 3. 大球赔率急跌 (需要 previousOdds)
  if (previousOdds?.overUnder && oddsAnalysis.overUnder) {
    const prevOver = previousOdds.overUnder.over;
    const currOver = oddsAnalysis.overUnder.over;

    // 大球赔率跌幅 > 0.15
    if (prevOver - currOver > 0.15) {
      details.overOddsDrop = true;
      score += 8;
    }
  }

  // 4. 临场变盘检测 (比赛进行中赔率大幅变化)
  if (match.minute > 0 && match.minute < 80) {
    // 如果有实时赔率且变化较大
    if (oddsAnalysis.movements && oddsAnalysis.movements.length > 0) {
      const significantMovements = oddsAnalysis.movements.filter(
        m => Math.abs(m.changePercent) > 5
      );
      if (significantMovements.length >= 2) {
        details.liveOddsShift = true;
        score += 8;
      }
    }
  }

  // 5. 多家博彩公司同向变动 (需要 movements 数据)
  if (oddsAnalysis.movements && oddsAnalysis.movements.length >= 3) {
    const downMovements = oddsAnalysis.movements.filter(m => m.direction === 'DOWN');
    const upMovements = oddsAnalysis.movements.filter(m => m.direction === 'UP');

    // 3家以上同向变动
    if (downMovements.length >= 3 || upMovements.length >= 3) {
      details.multiBookmakerMovement = true;
      score += 12;
    }
  }

  // 6. 赔率与 xG 背离
  if (oddsAnalysis.overUnder && match.stats?.xG) {
    const xgTotal = (match.stats.xG.home || 0) + (match.stats.xG.away || 0);
    const currentGoals = match.home.score + match.away.score;
    const overOdds = oddsAnalysis.overUnder.over;

    // xG 高但大球赔率也高 (市场低估进球)
    if (xgTotal > currentGoals + 1.5 && overOdds > 2.0) {
      details.oddsXgDivergence = true;
      score += 6;
    }
  }

  // 7. 双方进球预期
  if (oddsAnalysis.bothTeamsScore) {
    // "是"的赔率很低 (市场预期双方都会进球)
    if (oddsAnalysis.bothTeamsScore.yes < 1.5) {
      score += 4;
    }
  }

  return {
    score: Math.max(-10, Math.min(20, score)),
    details,
    dataAvailable: true,
  };
}

// ============================================
// 生成预警信息
// ============================================
function generateAlerts(
  totalScore: number,
  factors: ScoringFactors,
  match: AdvancedMatch
): string[] {
  const alerts: string[] = [];

  // 基于总分的预警
  if (totalScore >= 90) {
    alerts.push('🔴 极高概率：评分超过90，强烈关注');
  } else if (totalScore >= 80) {
    alerts.push('🔴 高概率进球预警：评分超过80');
  } else if (totalScore >= 70) {
    alerts.push('🟠 较高概率：评分70+，建议关注');
  }

  // 强队落后
  if (factors.scoreFactor.details.strongBehind) {
    alerts.push('⚡ 强队落后：预期反扑');
  }

  // 关键时段
  if (match.minute >= 80 && factors.scoreFactor.details.oneGoalDiff) {
    alerts.push('⏰ 关键时段：80分钟+且仅差1球');
  }

  // 平局 + 80+ 分钟
  if (factors.scoreFactor.details.isDraw && match.minute >= 80) {
    alerts.push('⚖️ 80+平局：双方都有得分动力');
  }

  // 进攻强度高
  if (factors.attackFactor.details.totalShots >= 25) {
    alerts.push('🎯 射门密集：全场射门25+');
  }

  // xG欠债
  if (factors.attackFactor.details.xgDebt > 1.5) {
    alerts.push('📊 xG欠债：预期进球远高于实际，可能补偿');
  }

  // 动量因子
  if (factors.momentumFactor.details.recentShots >= 8) {
    alerts.push('🔥 进攻爆发：近20分钟射门8+');
  }

  // 红牌优势
  if (factors.specialFactor.details.redCardAdvantage) {
    alerts.push('🟥 红牌优势：多一人进攻');
  }

  // 刚换上进攻球员
  if (factors.specialFactor.details.recentAttackSub) {
    alerts.push('🔄 攻击换人：刚换上进攻球员');
  }

  // VAR取消进球
  if (factors.specialFactor.details.varCancelled) {
    alerts.push('📺 VAR影响：进球被取消，士气波动');
  }

  // ============================================
  // 赔率因子相关预警 - 新增！
  // ============================================
  if (factors.oddsFactor?.dataAvailable) {
    const oddsDetails = factors.oddsFactor.details;

    // 让球盘收紧
    if (oddsDetails.handicapTightening) {
      alerts.push('💰 让球盘收紧：市场看好进球');
    }

    // 大球赔率急跌
    if (oddsDetails.overOddsDrop) {
      alerts.push('📉 大球赔率急跌：市场预期更多进球');
    }

    // 多家同向变动
    if (oddsDetails.multiBookmakerMovement) {
      alerts.push('🏦 多家博彩同向：市场共识形成');
    }

    // 临场变盘
    if (oddsDetails.liveOddsShift) {
      alerts.push('⚠️ 临场变盘：赔率大幅调整');
    }

    // 赔率与xG背离
    if (oddsDetails.oddsXgDivergence) {
      alerts.push('📊 赔率xG背离：市场可能低估进球');
    }

    // 让球盘放宽 (负面)
    if (oddsDetails.handicapWidening) {
      alerts.push('⚠️ 让球盘放宽：市场信心下降');
    }

    // 高进球预期
    if (oddsDetails.goalExpectation === 'HIGH') {
      alerts.push('🔥 市场高进球预期');
    }
  }

  return alerts;
}

// ============================================
// 总分转星级
// ============================================
function scoreToStars(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 70) return 3;
  if (score >= 60) return 2;
  return 1;
}

// ============================================
// 获取交易建议
// ============================================
function getRecommendation(score: number): ScoreResult['recommendation'] {
  if (score >= 80) return 'STRONG_BUY';
  if (score >= 70) return 'BUY';
  if (score >= 50) return 'HOLD';
  return 'AVOID';
}

// ============================================
// 计算置信度（基于数据完整性）
// STRICT REAL DATA MODE: 更严格的置信度计算
// ============================================
function calculateConfidence(
  match: AdvancedMatch,
  historyDataAvailable: boolean,
  momentumDataQuality: 'real' | 'partial' | 'unavailable'
): number {
  let confidence = 30; // STRICT MODE 基础置信度更低

  // 有真实统计数据
  if (match.stats?._realDataAvailable) {
    confidence += 25;
  }

  // 有真实射门数据
  if (match.stats?.shots?.home !== undefined && match.stats.shots.home > 0) {
    confidence += 10;
  }

  // 有真实 xG 数据（API-Football 可能不提供）
  if (match.stats?.xG?.home && match.stats.xG.home > 0) {
    confidence += 10;
  }

  // 动量数据质量
  if (momentumDataQuality === 'real') confidence += 10;
  else if (momentumDataQuality === 'partial') confidence += 5;

  // 有历史数据
  if (historyDataAvailable) confidence += 10;

  // 比赛时间因素
  if (match.minute >= 70) confidence += 5;

  return Math.min(100, confidence);
}

// ============================================
// 核心评分函数
// STRICT REAL DATA MODE
// ============================================

/**
 * 无法评分时的返回结果
 */
export interface UnscoreableResult {
  scoreable: false;
  reason: string;
  matchId: number;
  matchInfo: string;
}

/**
 * 可评分时的返回结果
 */
export interface ScoreableResult extends ScoreResult {
  scoreable: true;
  _dataMode: 'STRICT_REAL_DATA';
}

export type ScoringResult = ScoreableResult | UnscoreableResult;

/**
 * 评分选项（扩展参数）
 */
export interface ScoringOptions {
  homeTeamStats?: TeamSeasonStats | null;
  awayTeamStats?: TeamSeasonStats | null;
  h2h75PlusGoals?: number;
  oddsAnalysis?: OddsAnalysis | null;
  previousOdds?: OddsAnalysis | null;
}

/**
 * 计算动态评分（主函数）
 * STRICT REAL DATA MODE: 如果缺少统计数据，返回 null
 * @param match 比赛数据
 * @param homeTeamStats 主队赛季统计（可选，用于历史因子）
 * @param awayTeamStats 客队赛季统计（可选，用于历史因子）
 * @param h2h75PlusGoals H2H近场75+进球数（可选）
 */
export function calculateDynamicScore(
  match: AdvancedMatch,
  homeTeamStats?: TeamSeasonStats | null,
  awayTeamStats?: TeamSeasonStats | null,
  h2h75PlusGoals?: number
): ScoreResult | null {
  // STRICT REAL DATA MODE: 检查是否可评分
  const unscoreableReason = checkScoreability(match);
  if (unscoreableReason) {
    console.warn(`[STRICT MODE] Match ${match.id} (${match.home.name} vs ${match.away.name}) unscoreable: ${unscoreableReason}`);
    return null;
  }

  // 计算各因子
  const scoreFactor = calculateScoreFactor(match);
  const attackFactor = calculateAttackFactor(match);
  const momentumFactor = calculateMomentumFactor(match);
  const historyFactor = calculateHistoryFactor(match, homeTeamStats, awayTeamStats, h2h75PlusGoals);
  const specialFactor = calculateSpecialFactor(match);

  const factors: ScoringFactors = {
    scoreFactor,
    attackFactor,
    momentumFactor: {
      score: momentumFactor.score,
      details: momentumFactor.details,
    },
    historyFactor: {
      score: historyFactor.score,
      details: historyFactor.details,
    },
    specialFactor,
  };

  // 计算总分 (不含赔率因子的基础版本)
  const totalScore = Math.max(0, Math.min(100,
    BASE_SCORE +
    scoreFactor.score +
    attackFactor.score +
    momentumFactor.score +
    historyFactor.score +
    specialFactor.score
  ));

  // 转换星级
  const stars = scoreToStars(totalScore);

  // 判断强队落后
  const isStrongTeamBehind = scoreFactor.details.strongBehind;

  // 生成预警
  const alerts = generateAlerts(totalScore, factors, match);

  // 计算置信度（使用动量数据质量）
  const confidence = calculateConfidence(match, historyFactor.dataAvailable, momentumFactor._dataQuality);

  // 纯统计通道评分（不改变原有 totalScore，只作为并行参考线）
  const statsChannel = calculateStatsChannel(match);
  if (match.id === 1508863 && statsChannel) {
    // 调试：确认 fixture=1508863 的 Stats 通道评分（含赔率因子版本）
    console.log('[STATS_CHANNEL_1508863]', match.id, statsChannel);
  }
  if (match.id === 1508863 && statsChannel) {
    // 调试：确认 fixture=1508863 的 Stats 通道评分
    console.log('[STATS_CHANNEL_1508863]', match.id, statsChannel);
  }

  return {
    totalScore,
    baseScore: BASE_SCORE,
    factors,
    stars,
    recommendation: getRecommendation(totalScore),
    isStrongTeamBehind,
    alerts,
    confidence,
    statsChannel,
    // STRICT MODE 标记
    _dataMode: 'STRICT_REAL_DATA' as const,
  } as ScoreResult;
}

/**
 * 计算动态评分（含赔率因子的完整版本）
 * @param match 比赛数据
 * @param options 评分选项（含赔率分析数据）
 */
export function calculateDynamicScoreWithOdds(
  match: AdvancedMatch,
  options: ScoringOptions = {}
): ScoreResult | null {
  const {
    homeTeamStats,
    awayTeamStats,
    h2h75PlusGoals,
    oddsAnalysis,
    previousOdds,
  } = options;

  // STRICT REAL DATA MODE: 检查是否可评分
  const unscoreableReason = checkScoreability(match);
  if (unscoreableReason) {
    console.warn(`[STRICT MODE] Match ${match.id} (${match.home.name} vs ${match.away.name}) unscoreable: ${unscoreableReason}`);
    return null;
  }

  // 计算各因子
  const scoreFactor = calculateScoreFactor(match);
  const attackFactor = calculateAttackFactor(match);
  const momentumFactor = calculateMomentumFactor(match);
  const historyFactor = calculateHistoryFactor(match, homeTeamStats, awayTeamStats, h2h75PlusGoals);
  const specialFactor = calculateSpecialFactor(match);
  const oddsFactor = calculateOddsFactor(match, oddsAnalysis, previousOdds);

  const factors: ScoringFactors = {
    scoreFactor,
    attackFactor,
    momentumFactor: {
      score: momentumFactor.score,
      details: momentumFactor.details,
    },
    historyFactor: {
      score: historyFactor.score,
      details: historyFactor.details,
    },
    specialFactor,
    // 赔率因子（新增）
    oddsFactor: {
      score: oddsFactor.score,
      details: oddsFactor.details,
      dataAvailable: oddsFactor.dataAvailable,
    },
  };

  // 计算总分 (含赔率因子，最高可达 120)
  const totalScore = Math.max(0, Math.min(120,
    BASE_SCORE +
    scoreFactor.score +
    attackFactor.score +
    momentumFactor.score +
    historyFactor.score +
    specialFactor.score +
    oddsFactor.score
  ));

  // 转换星级 (含赔率因子时调整阈值)
  const stars = scoreToStarsWithOdds(totalScore, oddsFactor.dataAvailable);

  // 判断强队落后
  const isStrongTeamBehind = scoreFactor.details.strongBehind;

  // 生成预警
  const alerts = generateAlerts(totalScore, factors, match);

  // 计算置信度（含赔率数据）
  let confidence = calculateConfidence(match, historyFactor.dataAvailable, momentumFactor._dataQuality);
  if (oddsFactor.dataAvailable) {
    confidence = Math.min(100, confidence + 10); // 有赔率数据加10分置信度
  }

  // 纯统计通道评分（不改变原有 totalScore，只作为并行参考线）
  const statsChannel = calculateStatsChannel(match);

  return {
    totalScore,
    baseScore: BASE_SCORE,
    factors,
    stars,
    recommendation: getRecommendationWithOdds(totalScore, oddsFactor.dataAvailable),
    isStrongTeamBehind,
    alerts,
    confidence,
    statsChannel,
    _dataMode: 'STRICT_REAL_DATA' as const,
  } as ScoreResult;
}

/**
 * 总分转星级（含赔率因子版本）
 */
function scoreToStarsWithOdds(score: number, hasOddsData: boolean): number {
  // 如果有赔率数据，总分上限更高，调整阈值
  if (hasOddsData) {
    if (score >= 100) return 5;
    if (score >= 85) return 4;
    if (score >= 75) return 3;
    if (score >= 65) return 2;
    return 1;
  }
  // 无赔率数据使用原阈值
  return scoreToStars(score);
}

/**
 * 获取交易建议（含赔率因子版本）
 */
function getRecommendationWithOdds(score: number, hasOddsData: boolean): ScoreResult['recommendation'] {
  if (hasOddsData) {
    if (score >= 90) return 'STRONG_BUY';
    if (score >= 75) return 'BUY';
    if (score >= 55) return 'HOLD';
    return 'AVOID';
  }
  return getRecommendation(score);
}

/**
 * 带结果类型的评分函数（推荐使用）
 */
export function calculateScore(
  match: AdvancedMatch,
  homeTeamStats?: TeamSeasonStats | null,
  awayTeamStats?: TeamSeasonStats | null,
  h2h75PlusGoals?: number
): ScoringResult {
  const unscoreableReason = checkScoreability(match);

  if (unscoreableReason) {
    return {
      scoreable: false,
      reason: unscoreableReason,
      matchId: match.id,
      matchInfo: `${match.home.name} vs ${match.away.name} (${match.minute}')`,
    };
  }

  const result = calculateDynamicScore(match, homeTeamStats, awayTeamStats, h2h75PlusGoals);

  if (!result) {
    return {
      scoreable: false,
      reason: 'CALCULATION_FAILED',
      matchId: match.id,
      matchInfo: `${match.home.name} vs ${match.away.name} (${match.minute}')`,
    };
  }

  return {
    ...result,
    scoreable: true,
    _dataMode: 'STRICT_REAL_DATA',
  };
}

/**
 * 批量计算评分
 * STRICT MODE: 跳过无法评分的比赛
 */
export function calculateAllScores(matches: AdvancedMatch[]): Map<number, ScoreResult> {
  const results = new Map<number, ScoreResult>();

  for (const match of matches) {
    const result = calculateDynamicScore(match);
    if (result) {
      results.set(match.id, result);
    }
    // STRICT MODE: 无法评分的比赛不加入结果
  }

  return results;
}

/**
 * 筛选高评分比赛
 */
export function filterHighScoreMatches(
  matches: AdvancedMatch[],
  minScore = 70
): AdvancedMatch[] {
  return matches.filter(match => {
    const result = calculateDynamicScore(match);
    return result && result.totalScore >= minScore;
  });
}

/**
 * 筛选强队落后比赛
 */
export function filterStrongTeamBehindMatches(matches: AdvancedMatch[]): AdvancedMatch[] {
  return matches.filter(match => {
    const result = calculateDynamicScore(match);
    return result && result.isStrongTeamBehind;
  });
}

/**
 * 获取评分等级描述
 */
export function getScoreLevel(score: number): {
  label: string;
  color: string;
  emoji: string;
} {
  if (score >= 80) return { label: '极高概率', color: 'red', emoji: '🔴' };
  if (score >= 70) return { label: '高概率', color: 'orange', emoji: '🟠' };
  if (score >= 60) return { label: '中等概率', color: 'yellow', emoji: '🟡' };
  if (score >= 50) return { label: '一般概率', color: 'green', emoji: '🟢' };
  return { label: '低概率', color: 'gray', emoji: '⚪' };
}

/**
 * 格式化评分详情（用于调试和显示）
 */
export function formatScoreBreakdown(result: ScoreResult): string {
  const { factors, totalScore, baseScore } = result;

  return `
评分明细 (总分: ${totalScore})
━━━━━━━━━━━━━━━━━━━━━━━━
基础分: ${baseScore}
比分因子: ${factors.scoreFactor.score > 0 ? '+' : ''}${factors.scoreFactor.score}
  - 平局: ${factors.scoreFactor.details.isDraw ? '是' : '否'}
  - 1球差: ${factors.scoreFactor.details.oneGoalDiff ? '是' : '否'}
  - 强队落后: ${factors.scoreFactor.details.strongBehind ? '是' : '否'}
进攻因子: +${factors.attackFactor.score}
  - 射门: ${factors.attackFactor.details.totalShots}
  - 射正率: ${factors.attackFactor.details.shotAccuracy.toFixed(1)}%
  - xG: ${factors.attackFactor.details.xgTotal.toFixed(2)}
动量因子: +${factors.momentumFactor.score}
  - 近20分钟射门: ${factors.momentumFactor.details.recentShots}
  - 落后方控球: ${factors.momentumFactor.details.losingTeamPossession}%
历史因子: +${factors.historyFactor.score}
  - 主队75+%: ${factors.historyFactor.details.homeTeam75PlusRate}%
  - 客队75+%: ${factors.historyFactor.details.awayTeam75PlusRate}%
特殊因子: ${factors.specialFactor.score > 0 ? '+' : ''}${factors.specialFactor.score}
  - 红牌优势: ${factors.specialFactor.details.redCardAdvantage ? '是' : '否'}
  - 3+球: ${factors.specialFactor.details.highScoringMatch ? '是' : '否'}
━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}
