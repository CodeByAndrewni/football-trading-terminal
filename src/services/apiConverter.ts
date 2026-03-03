// ============================================
// API Converter Service
// 将 API-Football 原始数据转换为 AdvancedMatch 格式
// Phase 2A: 数据验证 + 初盘/实时赔率分离
// Phase 3.1: The Odds API 集成作为第三回退源
// ============================================

import type {
  Match,
  TeamStatistics,
  MatchEvent,
  Lineup,
  LiveOddsData,
  OddsData,
  Bookmaker,
  Bet,
} from '../types';
import type { AdvancedMatch, OddsInfo, AttackEvent, Substitution, CardInfo, MatchStats } from '../data/advancedMockData';
import { validateFixturesLive, validateStatistics, validateOddsLive, validateEvents, type DataQuality, type FixtureValidation, type StatisticsValidation, type OddsValidation, type EventsValidation } from './dataValidation';
import { parseLiveOdds } from './oddsService';
// TheOddsAPI removed - 500/month quota too low

// ============================================
// 联赛名称映射
// ============================================
const LEAGUE_NAME_MAP: Record<number, string> = {
  39: '英超',
  140: '西甲',
  135: '意甲',
  78: '德甲',
  61: '法甲',
  2: '欧冠',
  3: '欧联',
  4: '欧洲超级杯',
  848: '欧国联',
  94: '葡超',
  88: '荷甲',
  144: '比甲',
  203: '土超',
  235: '俄超',
  169: '瑞超',
  197: '挪超',
  113: '瑞士超',
  179: '苏超',
  262: '墨西哥联赛',
  128: '阿根廷联赛',
  71: '巴甲',
  253: '美职联',
  288: '韩K联',
  17: '世界杯',
};

// ============================================
// 状态映射
// ============================================
const STATUS_MAP: Record<string, AdvancedMatch['status']> = {
  '1H': 'live',
  '2H': 'live',
  'HT': 'ht',
  'FT': 'ft',
  'NS': 'ns',
  'ET': 'live',
  'BT': 'live',
  'P': 'live',
  'SUSP': 'live',
  'INT': 'live',
  'LIVE': 'live',
};

// ============================================
// 计算数据质量
// ============================================
function computeDataQuality(
  fixtureVal: FixtureValidation,
  statsVal: StatisticsValidation,
  oddsVal: OddsValidation,
  eventsVal: EventsValidation
): DataQuality {
  const realCount = [fixtureVal.is_real, statsVal.is_real, oddsVal.is_real, eventsVal.is_real].filter(Boolean).length;
  if (realCount >= 3) return 'REAL';
  if (realCount >= 1) return 'PARTIAL';
  return 'INVALID';
}

// ============================================
// 解析赛前赔率 (修复 #2: 初盘数据分离)
// ============================================
export function parsePrematchOdds(prematchOdds: OddsData[] | undefined): {
  handicap: number | null;
  overUnder: number | null;
  source: 'PREMATCH_API' | null;
} {
  if (!prematchOdds || prematchOdds.length === 0) {
    return { handicap: null, overUnder: null, source: null };
  }

  const data = prematchOdds[0];
  const bookmakers = data.bookmakers;

  if (!bookmakers || bookmakers.length === 0) {
    return { handicap: null, overUnder: null, source: null };
  }

  let handicap: number | null = null;
  let overUnder: number | null = null;

  // 优先查找 Bet365 (id=8), 然后是其他主流博彩公司
  const preferredOrder = [8, 6, 11, 3, 1];
  let selectedBookmaker: Bookmaker | undefined;

  for (const id of preferredOrder) {
    selectedBookmaker = bookmakers.find(b => b.id === id);
    if (selectedBookmaker) break;
  }

  if (!selectedBookmaker) {
    selectedBookmaker = bookmakers[0];
  }

  const bets = selectedBookmaker.bets || [];

  // 解析亚洲让球 (bet id = 8)
  const asianHandicapBet = bets.find(b => b.id === 8 || b.name === 'Asian Handicap');
  if (asianHandicapBet && asianHandicapBet.values && asianHandicapBet.values.length >= 2) {
    const homeValue = asianHandicapBet.values.find(v => v.value.includes('Home'));
    if (homeValue) {
      const lineMatch = homeValue.value.match(/(-?\d+\.?\d*)/);
      if (lineMatch) {
        handicap = Number.parseFloat(lineMatch[1]);
      }
    }
  }

  // 解析大小球 (bet id = 5)
  const overUnderBet = bets.find(b => b.id === 5 || b.name === 'Goals Over/Under');
  if (overUnderBet && overUnderBet.values) {
    // 优先查找 2.5 线
    const over25 = overUnderBet.values.find(v => v.value === 'Over 2.5');
    if (over25) {
      overUnder = 2.5;
    } else {
      // 如果没有 2.5，尝试找其他线
      const overValues = overUnderBet.values.filter(v => v.value.startsWith('Over '));
      if (overValues.length > 0) {
        const lineMatch = overValues[0].value.match(/Over (\d+\.?\d*)/);
        if (lineMatch) {
          overUnder = Number.parseFloat(lineMatch[1]);
        }
      }
    }
  }

  return {
    handicap,
    overUnder,
    source: (handicap !== null || overUnder !== null) ? 'PREMATCH_API' : null,
  };
}

// ============================================
// 从统计数据中提取数值
// ============================================
function extractStatValue(statistics: TeamStatistics[] | undefined, teamIndex: number, statType: string): number | null {
  if (!statistics || !statistics[teamIndex]) return null;

  const stat = statistics[teamIndex].statistics?.find(s =>
    s.type === statType || s.type.toLowerCase() === statType.toLowerCase()
  );

  if (!stat || stat.value === null || stat.value === undefined) return null;

  if (typeof stat.value === 'number') return stat.value;
  if (typeof stat.value === 'string') {
    // 处理百分比格式 "55%"
    const cleaned = stat.value.replace('%', '').trim();
    const parsed = Number.parseFloat(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

// ============================================
// 解析事件数据 (增加 varCancelled 检测)
// ============================================
function parseEventsData(events: MatchEvent[] | undefined, homeTeamId: number, awayTeamId: number): {
  cards: CardInfo;
  substitutions: Substitution[];
  attacks: AttackEvent[];
  recentEvent: 'goal' | 'red_card' | null;
  varCancelled: boolean;
} {
  const cards: CardInfo = {
    yellow: { home: 0, away: 0, players: [] },
    red: { home: 0, away: 0, players: [] },
  };

  const substitutions: Substitution[] = [];
  const attacks: AttackEvent[] = [];
  let recentEvent: 'goal' | 'red_card' | null = null;
  let varCancelled = false;

  if (!events || events.length === 0) {
    return { cards, substitutions, attacks, recentEvent, varCancelled };
  }

  for (const event of events) {
    const minute = event.time?.elapsed || 0;
    const teamSide: 'home' | 'away' = event.team?.id === homeTeamId ? 'home' : 'away';

    if (event.type === 'Card') {
      if (event.detail === 'Yellow Card') {
        cards.yellow[teamSide]++;
        if (event.player?.name) {
          cards.yellow.players.push(event.player.name);
        }
      } else if (event.detail === 'Red Card' || event.detail === 'Second Yellow card') {
        cards.red[teamSide]++;
        if (event.player?.name) {
          cards.red.players.push(event.player.name);
        }
        // 最近红牌
        if (minute >= 70) {
          recentEvent = 'red_card';
        }
      }
    } else if (event.type === 'subst') {
      substitutions.push({
        minute,
        playerIn: event.player?.name || 'Unknown',
        playerOut: event.assist?.name || 'Unknown',
        playerInPosition: null,
        playerOutPosition: null,
        type: 'neutral',
        team: teamSide,
      });
    } else if (event.type === 'Goal') {
      attacks.push({
        minute,
        type: 'goal',
        team: teamSide,
      });
      // 最近进球
      if (minute >= 70) {
        recentEvent = 'goal';
      }
    } else if (event.type === 'Var') {
      // VAR 取消进球检测
      const detail = event.detail?.toLowerCase() || '';
      if (detail.includes('cancelled') ||
          detail.includes('disallowed') ||
          detail.includes('no goal') ||
          detail.includes('goal cancelled')) {
        varCancelled = true;
      }
    }
  }

  return { cards, substitutions, attacks, recentEvent, varCancelled };
}

// ============================================
// 计算场景标签
// ============================================
function calculateScenarioTags(
  minute: number,
  homeScore: number,
  awayScore: number,
  homeHandicap: number | null,
  cards: CardInfo,
  stats: MatchStats | null
): string[] {
  const tags: string[] = [];
  const goalDiff = homeScore - awayScore;

  // 关键时段 (75+)
  if (minute >= 75) {
    tags.push('critical_time');
  }

  // 红牌
  if (cards.red.home > 0 || cards.red.away > 0) {
    tags.push('red_card');
    if (cards.red.home > 0) tags.push('home_red');
    if (cards.red.away > 0) tags.push('away_red');
  }

  // 强队落后检测
  if (homeHandicap !== null && minute >= 70) {
    const isHomeStrong = homeHandicap < 0; // 主队让球
    const isAwayStrong = homeHandicap > 0; // 客队让球

    if (isHomeStrong && homeScore < awayScore) {
      tags.push('strong_behind');
    } else if (isAwayStrong && awayScore < homeScore) {
      tags.push('strong_behind');
    }
  }

  // 平局
  if (goalDiff === 0) {
    tags.push('balanced');
    // 0-0 僵局
    if (homeScore === 0 && awayScore === 0 && minute >= 60) {
      tags.push('deadlock');
    }
  }

  // 大比分领先
  if (Math.abs(goalDiff) >= 3) {
    tags.push('large_lead');
  }

  // 无统计数据
  if (!stats || !stats._realDataAvailable) {
    tags.push('no_stats');
  }

  return tags;
}

// ============================================
// 计算 killScore (简化版)
// ============================================
function calculateKillScore(
  minute: number,
  homeScore: number,
  awayScore: number,
  stats: MatchStats | null
): number {
  let score = 30; // 基础分
  const goalDiff = Math.abs(homeScore - awayScore);

  // 时间因素
  if (minute >= 85) {
    score += 15;
  } else if (minute >= 75) {
    score += 10;
  } else if (minute >= 60) {
    score += 5;
  }

  // 比分因素
  if (goalDiff === 0) {
    score += 18;
  } else if (goalDiff === 1) {
    score += 12;
  } else if (goalDiff === 2) {
    score += 5;
  } else {
    score -= 10;
  }

  // 统计数据因素
  if (stats && stats._realDataAvailable) {
    const totalShots = (stats.shots?.home || 0) + (stats.shots?.away || 0);
    if (totalShots >= 25) score += 10;
    else if (totalShots >= 18) score += 6;

    const totalXG = (stats.xG?.home || 0) + (stats.xG?.away || 0);
    if (totalXG >= 3.0) score += 10;
    else if (totalXG >= 2.0) score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

// ============================================
// 核心转换函数
// ============================================
export function convertApiMatchToAdvanced(
  match: Match,
  statistics?: TeamStatistics[],
  events?: MatchEvent[],
  lineups?: Lineup[],
  liveOdds?: LiveOddsData[],
  prematchOdds?: OddsData[]
): AdvancedMatch | null {
  if (!match || !match.fixture) {
    return null;
  }

  const fixtureId = match.fixture.id;
  const homeTeamId = match.teams?.home?.id || 0;
  const awayTeamId = match.teams?.away?.id || 0;
  const minute = match.fixture.status?.elapsed || 0;
  const homeScore = match.goals?.home ?? 0;
  const awayScore = match.goals?.away ?? 0;

  // 解析统计数据
  const hasRealStats = statistics && statistics.length >= 2;
  const stats: MatchStats | null = hasRealStats ? {
    // 射门 & xG
    possession: {
      home: extractStatValue(statistics, 0, 'Ball Possession') || 50,
      away: extractStatValue(statistics, 1, 'Ball Possession') || 50,
    },
    shots: {
      home: extractStatValue(statistics, 0, 'Total Shots') || 0,
      away: extractStatValue(statistics, 1, 'Total Shots') || 0,
    },
    shotsOnTarget: {
      home: extractStatValue(statistics, 0, 'Shots on Goal') || 0,
      away: extractStatValue(statistics, 1, 'Shots on Goal') || 0,
    },
    shotsOffTarget: {
      home: extractStatValue(statistics, 0, 'Shots off Goal') || 0,
      away: extractStatValue(statistics, 1, 'Shots off Goal') || 0,
    },
    shotsInsideBox: {
      home: extractStatValue(statistics, 0, 'Shots insidebox') || 0,
      away: extractStatValue(statistics, 1, 'Shots insidebox') || 0,
    },
    shotsOutsideBox: {
      home: extractStatValue(statistics, 0, 'Shots outsidebox') || 0,
      away: extractStatValue(statistics, 1, 'Shots outsidebox') || 0,
    },
    xG: {
      home: extractStatValue(statistics, 0, 'expected_goals') || 0,
      away: extractStatValue(statistics, 1, 'expected_goals') || 0,
    },
    // 进攻相关
    attacks: {
      home: extractStatValue(statistics, 0, 'Attacks') || 0,
      away: extractStatValue(statistics, 1, 'Attacks') || 0,
    },
    dangerousAttacks: {
      home: extractStatValue(statistics, 0, 'Dangerous Attacks') || 0,
      away: extractStatValue(statistics, 1, 'Dangerous Attacks') || 0,
    },
    // 其他统计
    fouls: {
      home: extractStatValue(statistics, 0, 'Fouls') || 0,
      away: extractStatValue(statistics, 1, 'Fouls') || 0,
    },
    corners: {
      home: extractStatValue(statistics, 0, 'Corner Kicks') || 0,
      away: extractStatValue(statistics, 1, 'Corner Kicks') || 0,
    },
    saves: {
      home: extractStatValue(statistics, 0, 'Goalkeeper Saves') || 0,
      away: extractStatValue(statistics, 1, 'Goalkeeper Saves') || 0,
    },
    offsides: {
      home: extractStatValue(statistics, 0, 'Offsides') || 0,
      away: extractStatValue(statistics, 1, 'Offsides') || 0,
    },
    _realDataAvailable: true,
  } : null;

  // 解析角球
  const homeCorners = statistics ? extractStatValue(statistics, 0, 'Corner Kicks') : null;
  const awayCorners = statistics ? extractStatValue(statistics, 1, 'Corner Kicks') : null;
  const corners = (homeCorners !== null || awayCorners !== null) ? {
    home: homeCorners || 0,
    away: awayCorners || 0,
    recent5min: null,
  } : null;

  // 解析事件
  const { cards, substitutions, attacks, recentEvent, varCancelled } = parseEventsData(events, homeTeamId, awayTeamId);

  // 🔥 修复：解析赔率 - 优先使用赛前赔率获取初盘数据
  const prematch = parsePrematchOdds(prematchOdds);

  // 🔥 DEBUG: 检查传入的 liveOdds 参数 + 诊断用数据结构
  const liveOddsStructure = liveOdds?.[0] ? {
    fixtureId: liveOdds[0].fixture?.id,
    oddsLength: liveOdds[0].odds?.length ?? 0,
    status: liveOdds[0].status,
    hasAH: liveOdds[0].odds?.some(o => o.id === 33),
    hasOU: liveOdds[0].odds?.some(o => o.id === 36),
    // liveOdds 数据结构摘要（便于诊断）
    oddsMarketIds: liveOdds[0].odds?.map(o => o.id) ?? [],
    firstOddsValuesSample: liveOdds[0].odds?.[0]?.values?.slice(0, 2) ?? [],
  } : null;
  console.log(`[ODDS_DEBUG_1] fixture=${fixtureId} | liveOdds received:`, {
    hasLiveOdds: !!liveOdds,
    liveOddsLength: liveOdds?.length ?? 0,
    firstItem: liveOddsStructure,
  });

  // 🔥 调用 parseLiveOdds 并打印结果
  let liveOddsData: ReturnType<typeof parseLiveOdds> | null = null;
  if (liveOdds && liveOdds.length > 0) {
    console.log(`[ODDS_DEBUG_1.5] fixture=${fixtureId} | Calling parseLiveOdds...`);
    liveOddsData = parseLiveOdds(liveOdds[0], minute);
    console.log(`[ODDS_DEBUG_1.6] fixture=${fixtureId} | parseLiveOdds returned:`, {
      rawAvailable: liveOddsData?._raw_available,
      fetchStatus: liveOddsData?._fetch_status,
      ouLine: liveOddsData?.main_ou_line,
      ahLine: liveOddsData?.asian_handicap_line,
    });
  } else {
    console.log(`[ODDS_DEBUG_1.5] fixture=${fixtureId} | liveOdds is empty or null, skipping parseLiveOdds`);
  }

  // 判断是否有有效的滚球赔率
  const hasLiveOdds = !!(liveOddsData && liveOddsData._raw_available);

  // 🔥 DEBUG: parseLiveOdds 返回结果
  console.log(`[ODDS_DEBUG_2] fixture=${fixtureId} | parseLiveOdds result:`, {
    hasLiveOdds,
    rawAvailable: liveOddsData?._raw_available,
    fetchStatus: liveOddsData?._fetch_status,
    mainOULine: liveOddsData?.main_ou_line,
    ahLine: liveOddsData?.asian_handicap_line,
  });

  // 🔥 修复：从赛前赔率解析完整的赔率数据作为回退（使用正确的类型）
  const prematchOddsData = prematchOdds && prematchOdds.length > 0 ? parseLiveOdds(prematchOdds[0], minute) : null;
  const hasPrematchOdds = !!(prematchOddsData && prematchOddsData._raw_available);

  // 判断供应商是否“完全无赔率”（/odds 与 /odds/live 均返回空数组或无有效欧赔/亚盘/大小球）
  const noOddsFromProvider = !hasLiveOdds && !hasPrematchOdds;

  // 选择使用的赔率数据源 (优先级: Live > Prematch > TheOddsAPI)
  let oddsSource = 'N/A';
  let isLiveOdds = false;
  let effectiveOdds: typeof liveOddsData = null;

  if (hasLiveOdds) {
    effectiveOdds = liveOddsData;
    oddsSource = 'API-Football';
    isLiveOdds = true;
  } else if (hasPrematchOdds) {
    // Live odds 不可用时回退到赛前赔率
    console.log(`[ODDS_FALLBACK] fixture=${fixtureId} 使用 prematch 赔率`);
    effectiveOdds = prematchOddsData;
    oddsSource = 'PREMATCH';
    isLiveOdds = false;
  }

  // 构建 OddsInfo
  let odds: OddsInfo;

  if (effectiveOdds) {
    // 使用 API-Football 数据
    odds = {
      handicap: {
        home: effectiveOdds.asian_handicap_home ?? null,
        value: effectiveOdds.asian_handicap_line ?? null,
        away: effectiveOdds.asian_handicap_away ?? null,
        homeTrend: 'stable',
        awayTrend: 'stable',
      },
      overUnder: {
        over: effectiveOdds.main_ou_over ?? null,
        total: effectiveOdds.main_ou_line ?? null,
        under: effectiveOdds.main_ou_under ?? null,
        overTrend: 'stable',
        underTrend: 'stable',
        allLines: effectiveOdds.all_ou_lines?.map(line => ({
          line: line.line,
          over: line.over,
          under: line.under,
          isMain: line.isMain,
        })),
      },
      matchWinner: {
        home: effectiveOdds.home_win,
        draw: effectiveOdds.draw,
        away: effectiveOdds.away_win,
      },
      _source: oddsSource,
      _bookmaker: effectiveOdds.bookmaker,
      _captured_at: effectiveOdds.captured_at ?? null,
      _is_live: isLiveOdds,
      _fetch_status: 'SUCCESS',
    };
  } else {
    // 无赔率数据
    odds = {
      handicap: {
        home: null,
        value: null,
        away: null,
        homeTrend: 'stable',
        awayTrend: 'stable',
      },
      overUnder: {
        over: null,
        total: null,
        under: null,
        overTrend: 'stable',
        underTrend: 'stable',
      },
      matchWinner: undefined,
      _source: 'N/A',
      _bookmaker: undefined,
      _captured_at: null,
      _is_live: false,
      _fetch_status: 'EMPTY',
    };
  }

  // 计算场景标签 - 使用赛前赔率的 handicap 来判断强队
  const scenarioTags = calculateScenarioTags(
    minute,
    homeScore,
    awayScore,
    prematch.handicap,  // 使用赛前让球判断强队
    cards,
    stats
  );

  // 计算 killScore
  const killScore = calculateKillScore(minute, homeScore, awayScore, stats);

  // 联赛名称映射
  const leagueName = LEAGUE_NAME_MAP[match.league?.id] || match.league?.name || '未知联赛';

  // 状态映射
  const statusShort = match.fixture.status?.short || 'NS';
  const status = STATUS_MAP[statusShort] || 'live';

  // 判断 unscoreable
  const isLiveMatch = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(statusShort);
  const unscoreable = isLiveMatch && !hasRealStats;

  // 计算换人剩余
  const homeSubs = substitutions.filter(s => s.team === 'home').length;
  const awaySubs = substitutions.filter(s => s.team === 'away').length;

  // 数据验证
  const fixtureValidation = validateFixturesLive(match);
  const statsValidation = validateStatistics(statistics, homeTeamId, awayTeamId);
  const oddsValidation = validateOddsLive(liveOdds);
  const eventsValidation = validateEvents(events);
  const dataQuality = computeDataQuality(fixtureValidation, statsValidation, oddsValidation, eventsValidation);

  const extraMinute = match.fixture.status?.extra ?? null;

  const advancedMatch: AdvancedMatch = {
    id: fixtureId,
    league: leagueName,
    leagueShort: leagueName.length > 4 ? leagueName.substring(0, 4) : leagueName,
    leagueId: match.league?.id,
    leagueLogo: match.league?.logo,
    minute,
    status,
    extraMinute,
    home: {
      id: homeTeamId,
      name: match.teams?.home?.name || 'Home',
      logo: match.teams?.home?.logo,
      rank: null,
      score: homeScore,
      handicap: prematch.handicap,  // 使用赛前赔率
      _handicap_source: prematch.source,
    },
    away: {
      id: awayTeamId,
      name: match.teams?.away?.name || 'Away',
      logo: match.teams?.away?.logo,
      rank: null,
      score: awayScore,
      overUnder: prematch.overUnder,  // 使用赛前赔率
      _ou_source: prematch.source,
    },
    rating: killScore >= 70 ? 'A' : killScore >= 50 ? 'B' : 'C',
    ratingScore: killScore,
    attacks,
    pressure: stats ? (
      stats.possession.home > 55 ? 'home' :
      stats.possession.away > 55 ? 'away' : 'neutral'
    ) : 'neutral',
    substitutions,
    cards,
    odds,
    corners,
    goalHistory: null,
    killScore,
    recentEvent,
    stats,
    scenarioTags,
    subsRemaining: {
      home: Math.max(0, 5 - homeSubs),
      away: Math.max(0, 5 - awaySubs),
    },
    totalGoals: homeScore + awayScore,
    _unscoreable: unscoreable,
    _noStatsReason: unscoreable ? 'MISSING_STATISTICS_DATA' : undefined,
    noOddsFromProvider,
    _validation: {
      fixture_id: fixtureId,
      fixtures_real: fixtureValidation.is_real,
      stats_real: statsValidation.is_real,
      odds_real: oddsValidation.is_real,
      events_real: eventsValidation.is_real,
      data_quality: dataQuality,
      invalid_reasons: [
        ...fixtureValidation.reasons,
        ...statsValidation.reasons,
        ...oddsValidation.reasons,
        ...eventsValidation.reasons,
      ],
      validation_timestamp: new Date().toISOString(),
    },
    events: events?.map(e => ({
      time: e.time,
      minute: e.time?.elapsed,
      team: e.team,
      teamSide: (e.team?.id === homeTeamId ? 'home' : 'away') as 'home' | 'away',
      type: e.type,
      detail: e.detail,
      player: e.player,
      assist: e.assist ? {
        id: e.assist.id !== null ? e.assist.id : undefined,
        name: e.assist.name !== null ? e.assist.name : undefined,
      } : undefined,
    })),
    kickoffTime: match.fixture.date,
    startTime: match.fixture.date,
    homeTeamId,
    varCancelled, // Add varCancelled to AdvancedMatch if needed in your type
  };

  return advancedMatch;
}

// ============================================
// 批量转换函数
// ============================================
export function convertApiMatchesToAdvanced(
  matches: Match[],
  statisticsMap?: Map<number, TeamStatistics[]>,
  eventsMap?: Map<number, MatchEvent[]>,
  lineupsMap?: Map<number, Lineup[]>,
  oddsMap?: Map<number, LiveOddsData[]>,
  prematchOddsMap?: Map<number, OddsData[]>
): AdvancedMatch[] {
  const results: AdvancedMatch[] = [];
  for (const match of matches) {
    const fixtureId = match.fixture?.id;
    if (!fixtureId) continue;

    const statistics = statisticsMap?.get(fixtureId);
    const events = eventsMap?.get(fixtureId);
    const lineups = lineupsMap?.get(fixtureId);
    const odds = oddsMap?.get(fixtureId);
    const prematchOdds = prematchOddsMap?.get(fixtureId);

    const advanced = convertApiMatchToAdvanced(match, statistics, events, lineups, odds, prematchOdds);
    if (advanced) {
      results.push(advanced);
    }
  }

  return results;
}

// ============================================
// 辅助函数
// ============================================

/**
 * 判断是否为高警戒比赛
 */
export function isHighAlertMatch(match: AdvancedMatch): boolean {
  if (match.killScore >= 70) return true;
  if (match.scenarioTags?.includes('strong_behind')) return true;
  if (match.scenarioTags?.includes('red_card') && match.minute >= 60) return true;
  return false;
}

/**
 * 判断是否为关键时段
 */
export function isCriticalTimeMatch(match: AdvancedMatch): boolean {
  return match.minute >= 75;
}

/**
 * 按场景筛选比赛
 */
export function filterByScenario(matches: AdvancedMatch[], scenario: string): AdvancedMatch[] {
  return matches.filter(m => m.scenarioTags?.includes(scenario));
}

/**
 * 获取场景描述
 */
export function getScenarioDescription(match: AdvancedMatch): string {
  const tags = match.scenarioTags || [];

  if (tags.includes('strong_behind')) return '强队落后';
  if (tags.includes('red_card')) return '红牌影响';
  if (tags.includes('deadlock')) return '僵局待破';
  if (tags.includes('critical_time')) return '关键时段';
  if (tags.includes('large_lead')) return '大比分领先';
  if (tags.includes('balanced')) return '均势对峙';

  return '普通比赛';
}
