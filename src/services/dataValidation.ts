// ============================================================
// DATA VALIDATION SERVICE - Phase 2A Real Data Gate
// 验证 API 数据真实性，防止假数据进入仓库
// ============================================================

import type { Match, TeamStatistics, MatchEvent, LiveOddsData, OddsData } from '../types';

// ============================================================
// Types
// ============================================================

export type DataQuality = 'REAL' | 'PARTIAL' | 'INVALID';

export interface DataValidationResult {
  fixture_id: number;
  fixtures_real: boolean;
  stats_real: boolean;
  odds_real: boolean;
  events_real: boolean;
  data_quality: DataQuality;
  invalid_reasons: string[];
  validation_timestamp: string;
}

export interface FixtureValidation {
  is_real: boolean;
  reasons: string[];
  fields_present: string[];
  fields_missing: string[];
}

export interface StatisticsValidation {
  is_real: boolean;
  reasons: string[];
  home_stats_count: number;
  away_stats_count: number;
  critical_stats_present: string[];
  critical_stats_missing: string[];
}

export interface OddsValidation {
  is_real: boolean;
  reasons: string[];
  has_1x2: boolean;
  has_over_under: boolean;
  has_asian_handicap: boolean;
  bookmaker: string | null;
  is_live: boolean;
}

export interface EventsValidation {
  is_real: boolean;
  reasons: string[];
  event_count: number;
  has_goals: boolean;
  has_cards: boolean;
  has_substitutions: boolean;
}

// ============================================================
// Critical Statistics List
// ============================================================

const CRITICAL_STATS = [
  'Total Shots',
  'Shots on Goal',
  'Ball Possession',
  'Corner Kicks',
] as const;

const OPTIONAL_STATS = [
  'Dangerous Attacks',
  'expected_goals',
  'Fouls',
  'Offsides',
  'Blocked Shots',
] as const;

// ============================================================
// Validation Functions
// ============================================================

/**
 * 验证比赛数据的真实性
 */
export function validateFixturesLive(match: Match | null | undefined): FixtureValidation {
  const reasons: string[] = [];
  const fieldsPresent: string[] = [];
  const fieldsMissing: string[] = [];

  if (!match) {
    return {
      is_real: false,
      reasons: ['FIXTURE_NULL'],
      fields_present: [],
      fields_missing: ['fixture', 'teams', 'goals', 'league'],
    };
  }

  // 检查必要字段
  if (match.fixture?.id) {
    fieldsPresent.push('fixture.id');
  } else {
    fieldsMissing.push('fixture.id');
    reasons.push('MISSING_FIXTURE_ID');
  }

  if (match.fixture?.status?.elapsed !== undefined && match.fixture?.status?.elapsed !== null) {
    fieldsPresent.push('fixture.status.elapsed');
  } else {
    fieldsMissing.push('fixture.status.elapsed');
    // 未开始的比赛 elapsed 为 null 是正常的
    if (match.fixture?.status?.short !== 'NS') {
      reasons.push('MISSING_ELAPSED_TIME');
    }
  }

  if (match.teams?.home?.id && match.teams?.away?.id) {
    fieldsPresent.push('teams.home.id', 'teams.away.id');
  } else {
    fieldsMissing.push('teams');
    reasons.push('MISSING_TEAM_IDS');
  }

  if (match.goals?.home !== undefined && match.goals?.away !== undefined) {
    fieldsPresent.push('goals.home', 'goals.away');
  } else {
    fieldsMissing.push('goals');
    // 未开始的比赛 goals 为 null 是正常的
    if (match.fixture?.status?.short !== 'NS') {
      reasons.push('MISSING_GOALS');
    }
  }

  if (match.league?.id) {
    fieldsPresent.push('league.id');
  } else {
    fieldsMissing.push('league.id');
    reasons.push('MISSING_LEAGUE_ID');
  }

  return {
    is_real: reasons.length === 0,
    reasons,
    fields_present: fieldsPresent,
    fields_missing: fieldsMissing,
  };
}

/**
 * 验证统计数据的真实性
 */
export function validateStatistics(
  statistics: TeamStatistics[] | null | undefined,
  homeTeamId?: number,
  awayTeamId?: number
): StatisticsValidation {
  const reasons: string[] = [];
  const criticalPresent: string[] = [];
  const criticalMissing: string[] = [];

  if (!statistics || statistics.length === 0) {
    return {
      is_real: false,
      reasons: ['STATS_EMPTY'],
      home_stats_count: 0,
      away_stats_count: 0,
      critical_stats_present: [],
      critical_stats_missing: [...CRITICAL_STATS],
    };
  }

  // 找到主客队统计
  const homeStats = homeTeamId
    ? statistics.find(s => s.team.id === homeTeamId)
    : statistics[0];
  const awayStats = awayTeamId
    ? statistics.find(s => s.team.id === awayTeamId)
    : statistics[1];

  const homeStatsCount = homeStats?.statistics?.length ?? 0;
  const awayStatsCount = awayStats?.statistics?.length ?? 0;

  if (!homeStats) {
    reasons.push('MISSING_HOME_STATS');
  }
  if (!awayStats) {
    reasons.push('MISSING_AWAY_STATS');
  }

  // 检查关键统计数据
  for (const statType of CRITICAL_STATS) {
    const hasHomeStat = homeStats?.statistics?.some(s => s.type === statType && s.value !== null);
    const hasAwayStat = awayStats?.statistics?.some(s => s.type === statType && s.value !== null);

    if (hasHomeStat || hasAwayStat) {
      criticalPresent.push(statType);
    } else {
      criticalMissing.push(statType);
      reasons.push(`MISSING_${statType.toUpperCase().replace(/\s+/g, '_')}`);
    }
  }

  // 如果缺少超过一半的关键统计，标记为无效
  const isValid = criticalMissing.length <= CRITICAL_STATS.length / 2;

  return {
    is_real: isValid && reasons.length === 0,
    reasons,
    home_stats_count: homeStatsCount,
    away_stats_count: awayStatsCount,
    critical_stats_present: criticalPresent,
    critical_stats_missing: criticalMissing,
  };
}

/**
 * 验证赔率数据的真实性
 */
export function validateOddsLive(
  oddsData: LiveOddsData[] | OddsData[] | null | undefined
): OddsValidation {
  const reasons: string[] = [];

  if (!oddsData || oddsData.length === 0) {
    return {
      is_real: false,
      reasons: ['ODDS_EMPTY'],
      has_1x2: false,
      has_over_under: false,
      has_asian_handicap: false,
      bookmaker: null,
      is_live: false,
    };
  }

  const firstOdds = oddsData[0];
  let has1x2 = false;
  let hasOverUnder = false;
  let hasAsianHandicap = false;
  let bookmaker: string | null = null;
  let isLive = false;

  // 检测滚球赔率结构 (odds 数组直接在响应中)
  const liveOddsData = firstOdds as any;
  if (liveOddsData.odds && Array.isArray(liveOddsData.odds)) {
    isLive = true;
    const odds = liveOddsData.odds;

    // 检查各类盘口
    has1x2 = odds.some((o: any) => o.id === 59 && o.values?.length > 0); // FULLTIME_RESULT
    hasOverUnder = odds.some((o: any) => o.id === 36 && o.values?.length > 0); // OVER_UNDER_LINE
    hasAsianHandicap = odds.some((o: any) => o.id === 33 && o.values?.length > 0); // ASIAN_HANDICAP

    bookmaker = 'API-Football Live';
  }

  // 检测赛前赔率结构 (bookmakers 数组)
  const preMatchData = firstOdds as OddsData;
  if (preMatchData.bookmakers && preMatchData.bookmakers.length > 0) {
    const bm = preMatchData.bookmakers[0];
    bookmaker = bm.name;

    has1x2 = bm.bets?.some(b => b.id === 1 && b.values?.length > 0) ?? false;
    hasOverUnder = bm.bets?.some(b => b.id === 5 && b.values?.length > 0) ?? false;
    hasAsianHandicap = bm.bets?.some(b => b.id === 8 && b.values?.length > 0) ?? false;
  }

  // 验证
  if (!has1x2 && !hasOverUnder && !hasAsianHandicap) {
    reasons.push('NO_ODDS_DATA');
  }
  if (!has1x2) reasons.push('MISSING_1X2');
  if (!hasOverUnder) reasons.push('MISSING_OVER_UNDER');
  if (!hasAsianHandicap) reasons.push('MISSING_ASIAN_HANDICAP');

  // 至少有一种盘口才算有真实数据
  const isReal = has1x2 || hasOverUnder || hasAsianHandicap;

  return {
    is_real: isReal,
    reasons: isReal ? [] : reasons,
    has_1x2: has1x2,
    has_over_under: hasOverUnder,
    has_asian_handicap: hasAsianHandicap,
    bookmaker,
    is_live: isLive,
  };
}

/**
 * 验证事件数据的真实性
 */
export function validateEvents(
  events: MatchEvent[] | null | undefined
): EventsValidation {
  const reasons: string[] = [];

  if (!events) {
    return {
      is_real: false,
      reasons: ['EVENTS_NULL'],
      event_count: 0,
      has_goals: false,
      has_cards: false,
      has_substitutions: false,
    };
  }

  // 空事件数组也是有效的（比赛可能没有任何事件发生）
  const hasGoals = events.some(e => e.type === 'Goal');
  const hasCards = events.some(e => e.type === 'Card');
  const hasSubstitutions = events.some(e => e.type === 'subst');

  return {
    is_real: true, // 只要有 events 数组就是真实的
    reasons,
    event_count: events.length,
    has_goals: hasGoals,
    has_cards: hasCards,
    has_substitutions: hasSubstitutions,
  };
}

/**
 * 综合验证所有数据并返回 DataValidationResult
 */
export function validateAllData(
  match: Match | null | undefined,
  statistics: TeamStatistics[] | null | undefined,
  events: MatchEvent[] | null | undefined,
  odds: LiveOddsData[] | OddsData[] | null | undefined
): DataValidationResult {
  const fixtureValidation = validateFixturesLive(match);
  const statsValidation = validateStatistics(
    statistics,
    match?.teams?.home?.id,
    match?.teams?.away?.id
  );
  const oddsValidation = validateOddsLive(odds);
  const eventsValidation = validateEvents(events);

  // 合并所有 invalid reasons
  const allReasons: string[] = [];

  if (!fixtureValidation.is_real) {
    allReasons.push(...fixtureValidation.reasons.map(r => `FIXTURE:${r}`));
  }
  if (!statsValidation.is_real) {
    allReasons.push(...statsValidation.reasons.map(r => `STATS:${r}`));
  }
  if (!oddsValidation.is_real) {
    allReasons.push(...oddsValidation.reasons.map(r => `ODDS:${r}`));
  }
  if (!eventsValidation.is_real) {
    allReasons.push(...eventsValidation.reasons.map(r => `EVENTS:${r}`));
  }

  // 确定数据质量等级
  let dataQuality: DataQuality;
  const realCount = [
    fixtureValidation.is_real,
    statsValidation.is_real,
    oddsValidation.is_real,
  ].filter(Boolean).length;

  if (realCount === 3) {
    dataQuality = 'REAL';
  } else if (realCount >= 1 && fixtureValidation.is_real) {
    dataQuality = 'PARTIAL';
  } else {
    dataQuality = 'INVALID';
  }

  return {
    fixture_id: match?.fixture?.id ?? 0,
    fixtures_real: fixtureValidation.is_real,
    stats_real: statsValidation.is_real,
    odds_real: oddsValidation.is_real,
    events_real: eventsValidation.is_real,
    data_quality: dataQuality,
    invalid_reasons: allReasons,
    validation_timestamp: new Date().toISOString(),
  };
}

// ============================================================
// 辅助函数 - 用于 UI 显示
// ============================================================

/**
 * 获取数据质量的显示信息
 */
export function getDataQualityDisplay(quality: DataQuality): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} {
  switch (quality) {
    case 'REAL':
      return {
        label: '真实数据',
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        icon: '✓',
      };
    case 'PARTIAL':
      return {
        label: '部分数据',
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/20',
        icon: '⚠',
      };
    case 'INVALID':
      return {
        label: '无效数据',
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        icon: '✗',
      };
  }
}

/**
 * 格式化 invalid_reasons 为可读文本
 */
export function formatInvalidReasons(reasons: string[]): string[] {
  const reasonMap: Record<string, string> = {
    'FIXTURE:FIXTURE_NULL': '比赛数据为空',
    'FIXTURE:MISSING_FIXTURE_ID': '缺少比赛ID',
    'FIXTURE:MISSING_ELAPSED_TIME': '缺少比赛时间',
    'FIXTURE:MISSING_TEAM_IDS': '缺少球队ID',
    'FIXTURE:MISSING_GOALS': '缺少进球数据',
    'FIXTURE:MISSING_LEAGUE_ID': '缺少联赛ID',
    'STATS:STATS_EMPTY': '统计数据为空',
    'STATS:MISSING_HOME_STATS': '缺少主队统计',
    'STATS:MISSING_AWAY_STATS': '缺少客队统计',
    'STATS:MISSING_TOTAL_SHOTS': '缺少射门数据',
    'STATS:MISSING_SHOTS_ON_GOAL': '缺少射正数据',
    'STATS:MISSING_BALL_POSSESSION': '缺少控球率',
    'STATS:MISSING_CORNER_KICKS': '缺少角球数据',
    'ODDS:ODDS_EMPTY': '赔率数据为空',
    'ODDS:NO_ODDS_DATA': '无任何赔率',
    'ODDS:MISSING_1X2': '缺少胜平负赔率',
    'ODDS:MISSING_OVER_UNDER': '缺少大小球赔率',
    'ODDS:MISSING_ASIAN_HANDICAP': '缺少让球盘',
    'EVENTS:EVENTS_NULL': '事件数据为空',
  };

  return reasons.map(r => reasonMap[r] || r);
}

/**
 * 判断数据是否可以写入仓库
 * 只有 REAL 或 PARTIAL (必须有真实 fixture) 的数据可以写入
 * 但 missing 字段必须写入 NULL，不能使用默认值
 */
export function canWriteToWarehouse(validation: DataValidationResult): boolean {
  return validation.data_quality !== 'INVALID' && validation.fixtures_real;
}

export default {
  validateFixturesLive,
  validateStatistics,
  validateOddsLive,
  validateEvents,
  validateAllData,
  getDataQualityDisplay,
  formatInvalidReasons,
  canWriteToWarehouse,
};
