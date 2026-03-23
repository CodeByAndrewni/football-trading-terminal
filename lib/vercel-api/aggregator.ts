/**
 * 数据聚合器
 * 将 API-Football 原始数据转换为 AdvancedMatch 格式
 *
 * 注意：这是 src/services/apiConverter.ts 的后端版本
 * 保持输出格式一致，但简化了部分逻辑
 *
 * === 字段来源映射 ===
 * - 基础信息 (id/league/teams/status/minute) → LiveCore ← /fixtures?live=all
 * - 统计数据 (shots/corners/possession/xG) → LiveStatsCore ← /fixtures/statistics
 * - 事件数据 (goals/cards/subs) → LiveEventsCore ← /fixtures/events
 * - 赔率数据 → OddsLiveCore ← /odds/live 或 OddsPrematchCore ← /odds
 */

import type { Match, TeamStatistics, MatchEvent, LiveOddsData, OddsData } from './api-football.js';
import { fallbackLeagueShort } from './league-display.js';

// ============================================
// AdvancedMatch 类型定义（与前端一致）
// ============================================

export interface AdvancedMatch {
  // === 基础信息 (来源: LiveCore ← /fixtures?live=all) ===
  id: number;                   // fixture.id
  leagueId: number;             // league.id
  league: string;               // league.name (翻译后)
  leagueShort: string;          // league.name (缩写)
  leagueLogo: string;           // league.logo
  leagueFlag?: string;          // league.flag
  /** API-Football league.country，列表展示用于区分同名联赛 */
  leagueCountry?: string;
  round: string;                // league.round

  // === 球队信息 (来源: LiveCore ← /fixtures?live=all) ===
  home: TeamInfo;
  away: TeamInfo;

  // === 时间/状态 (来源: LiveCore ← /fixtures?live=all) ===
  status: 'ns' | 'live' | 'ht' | 'ft' | 'aet' | 'pen' | '1h' | '2h';  // fixture.status.short 映射
  minute: number;               // fixture.status.elapsed
  timestamp: number;            // fixture.timestamp
  venue?: string;               // fixture.venue.name
  referee?: string;             // fixture.referee

  // === 半场比分 (来源: LiveCore ← /fixtures?live=all) ===
  halftimeScore?: { home: number | null; away: number | null };  // score.halftime

  // === 比赛统计数据 - 顶层 (来源: LiveStatsCore ← /fixtures/statistics) ===
  corners?: { home: number; away: number };          // Corner Kicks
  shots?: { home: number; away: number };            // Total Shots
  shotsOnTarget?: { home: number; away: number };    // Shots on Goal
  shotsOffTarget?: { home: number; away: number };   // Shots off Goal (新增)
  shotsInsideBox?: { home: number; away: number };   // Shots insidebox (新增)
  possession?: { home: number; away: number };       // Ball Possession
  fouls?: { home: number; away: number };            // Fouls
  yellowCards?: { home: number; away: number };      // Yellow Cards
  redCards?: { home: number; away: number };         // Red Cards
  offsides?: { home: number; away: number };         // Offsides (新增)
  saves?: { home: number; away: number };            // Goalkeeper Saves (新增)

  // === 嵌套 stats 对象（前端期望的格式）===
  stats?: MatchStats | null;

  // === 赔率数据 (来源: OddsLiveCore ← /odds/live 或 OddsPrematchCore ← /odds) ===
  odds?: OddsInfo;

  // === 赛前初始盘口快照 (仅来自 OddsPrematchCore ← /odds) ===
  // 注意：initialHandicap / initialOverUnder 只反映赛前主盘口线，
  //       不会被 live odds 或后续盘口变化覆盖。
  initialHandicap?: number | null;
  initialOverUnder?: number | null;
  /** 当 /odds 与 /odds/live 对该场次均返回空时为 true；任一有有效赔率则不设置或为 false */
  noOddsFromProvider?: boolean;

  // === 事件数据 (来源: LiveEventsCore ← /fixtures/events) ===
  events?: MatchEventForUI[];
  homeTeamId?: number;

  // === 评分数据 ===
  killScore?: number;
  scenarioTag?: string;
  confidence?: number;
  reasons?: string[];

  // === 换人信息 (来源: LiveEventsCore ← /fixtures/events, type=subst) ===
  substitutions?: SubstitutionInfo[];

  // === 牌况 (来源: LiveEventsCore ← /fixtures/events, type=Card) ===
  cards?: CardInfo;

  // === 阵容 (来源: enrichment ← /fixtures/lineups) ===
  lineups?: {
    team: { id: number; name: string; logo?: string };
    formation: string;
    startXI: { player: { id: number; name: string; number: number; pos: string; grid: string | null } }[];
    substitutes: { player: { id: number; name: string; number: number; pos: string; grid: string | null } }[];
    coach: { id: number; name: string; photo?: string };
  }[];

  // === 数据质量标记 ===
  _dataQuality?: 'REAL' | 'PARTIAL' | 'INVALID';
  _unscoreable?: boolean;
  _oddsSource?: 'live' | 'prematch' | null;

  // === 结构失衡/攻势指标 (Phase 2 新增) ===
  imbalance?: ImbalanceMetrics;

  // === 晚期进球模型预留字段 (Phase 3) ===
  lateGoalProb?: number;    // 80分钟后再进一球的概率 (0-1)
  lateGoalScore?: number;   // 晚期进球评分 (0-100)

  /** API 扩展：预测、伤病、阵容、对战、球队赛季统计（live-enrichment 写入） */
  enrichment?: {
    predictions?: unknown;
    injuries?: unknown;
    lineups?: unknown;
    headToHead?: unknown;
    teamStatsHome?: unknown;
    teamStatsAway?: unknown;
  };

  // === 情景引擎派生字段 ===
  stoppageTimeAnnounced?: number | null;
  halfStatsDelta?: { shotsDelta: number; xgDelta: number; cornersDelta: number } | null;
  subsAfter70Attack?: number;
  needsWinProxy?: 'home' | 'away' | 'both' | null;
}

// === 结构失衡指标 (Phase 2) ===
interface ImbalanceMetrics {
  shotsDiff: number;            // 主队射门 - 客队射门
  shotsOnTargetDiff: number;    // 射正差
  xgDiff: number;               // xG差
  cornersDiff: number;          // 角球差
  possessionDiff: number;       // 控球差
  imbalanceScore: number;       // 综合失衡评分 (0-100)
  attackingTeam: 'home' | 'away' | 'balanced';  // 进攻主导方
}

interface TeamInfo {
  id: number;                   // teams.home.id / teams.away.id
  name: string;                 // teams.home.name / teams.away.name
  logo: string;                 // teams.home.logo / teams.away.logo
  score: number;                // goals.home / goals.away
  rank?: number | null;         // 来自 StandingsCore (如有)
  handicap?: number | null;     // 来自 OddsLiveCore/OddsPrematchCore
  _handicap_source?: 'API' | 'PREMATCH_API' | null;
  overUnder?: number | null;    // 来自 OddsLiveCore/OddsPrematchCore
  _ou_source?: 'API' | 'PREMATCH_API' | null;
}

// 前端期望的 stats 嵌套格式
interface MatchStats {
  possession: { home: number; away: number };          // Ball Possession
  shots: { home: number; away: number };               // Total Shots
  shotsOnTarget: { home: number; away: number };       // Shots on Goal
  xG: { home: number; away: number };                  // expected_goals
  // 射门细分
  shotsOffTarget?: { home: number; away: number };     // Shots off Goal
  shotsInsideBox?: { home: number; away: number };     // Shots insidebox
  shotsOutsideBox?: { home: number; away: number };    // Shots outsidebox
  // 进攻相关
  attacks?: { home: number; away: number };            // Attacks
  dangerousAttacks?: { home: number; away: number };   // Dangerous Attacks
  // 其他统计
  fouls?: { home: number; away: number };              // Fouls
  corners?: { home: number; away: number };            // Corner Kicks
  saves?: { home: number; away: number };              // Goalkeeper Saves
  offsides?: { home: number; away: number };           // Offsides
  _realDataAvailable?: boolean;
}

// 前端期望的 odds 格式
interface OddsInfo {
  handicap: {
    home: number | null;       // 主让赔率
    value: number | null;      // 盘口线 (如 -0.5)
    away: number | null;       // 客受赔率
    homeTrend: 'up' | 'down' | 'stable';
    awayTrend: 'up' | 'down' | 'stable';
  };
  overUnder: {
    over: number | null;       // 大球赔率
    total: number | null;      // 盘口线 (如 2.5)
    under: number | null;      // 小球赔率
    overTrend: 'up' | 'down' | 'stable';
    underTrend: 'up' | 'down' | 'stable';
    allLines?: { line: number; over: number | null; under: number | null; isMain: boolean }[];
  };
  matchWinner?: {
    home: number | null;       // 主胜赔率
    draw: number | null;       // 平局赔率
    away: number | null;       // 客胜赔率
  };
  bothTeamsScore?: {           // 新增: 双方进球
    yes: number | null;
    no: number | null;
  };
  _source?: string;
  _bookmaker?: string;
  _captured_at?: string | null;
  _is_live?: boolean;
  _fetch_status?: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FETCHED';
  _no_data_reason?: string;
  _is_stopped?: boolean;       // 新增: 是否暂停投注
  _is_blocked?: boolean;       // 新增: 是否封盘
}

// 前端期望的事件格式
interface MatchEventForUI {
  time?: { elapsed: number; extra?: number | null };
  minute?: number;
  team?: { id?: number; name?: string };
  teamSide?: 'home' | 'away';
  type: string;
  detail?: string;
  player?: { id?: number; name?: string };
  assist?: { id?: number; name?: string };
}

// 换人信息
interface SubstitutionInfo {
  minute: number;
  playerIn: string;
  playerOut: string;
  playerInPosition?: string | null;
  playerOutPosition?: string | null;
  type: 'attack' | 'defense' | 'neutral';
  team: 'home' | 'away';
}

// 牌况
interface CardInfo {
  yellow: { home: number; away: number; players: string[] };
  red: { home: number; away: number; players: string[] };
}

// ============================================
// 联赛名称映射
// ============================================

const LEAGUE_NAME_MAP: Record<number, { name: string; short: string }> = {
  39: { name: '英超', short: '英超' },
  140: { name: '西甲', short: '西甲' },
  135: { name: '意甲', short: '意甲' },
  78: { name: '德甲', short: '德甲' },
  61: { name: '法甲', short: '法甲' },
  2: { name: '欧冠', short: '欧冠' },
  3: { name: '欧联', short: '欧联' },
  4: { name: '欧洲超级杯', short: '欧超杯' },
  848: { name: '欧国联', short: '欧国联' },
  94: { name: '葡超', short: '葡超' },
  88: { name: '荷甲', short: '荷甲' },
  144: { name: '比甲', short: '比甲' },
  203: { name: '土超', short: '土超' },
  235: { name: '俄超', short: '俄超' },
  169: { name: '瑞超', short: '瑞超' },
  197: { name: '挪超', short: '挪超' },
  113: { name: '瑞士超', short: '瑞士超' },
  179: { name: '苏超', short: '苏超' },
  262: { name: '墨西哥联赛', short: '墨西联' },
  128: { name: '阿根廷联赛', short: '阿甲' },
  71: { name: '巴甲', short: '巴甲' },
  253: { name: '美职联', short: '美职联' },
  288: { name: '韩K联', short: '韩K联' },
  17: { name: '世界杯', short: '世界杯' },
  736: { name: '墨TDP', short: '墨TDP' },
  239: { name: '哥伦比亚甲', short: '哥甲' },
  240: { name: '哥伦比亚乙级联赛', short: '哥伦乙' },
  242: { name: '厄瓜多尔甲', short: '厄甲' },
  265: { name: '巴拉圭甲', short: '巴拉甲' },
  268: { name: '乌拉圭甲', short: '乌甲' },
  269: { name: '乌拉圭乙级联赛', short: '乌拉乙' },
  266: { name: '秘鲁甲', short: '秘甲' },
  73: { name: '巴乙', short: '巴乙' },
};

// ============================================
// 状态映射 (LiveCore.status → AdvancedMatch.status)
// ============================================

const STATUS_MAP: Record<string, AdvancedMatch['status']> = {
  '1H': '1h',
  '2H': '2h',
  'HT': 'ht',
  'FT': 'ft',
  'NS': 'ns',
  'ET': 'live',
  'BT': 'live',
  'P': 'live',
  'SUSP': 'live',
  'INT': 'live',
  'LIVE': 'live',
  'AET': 'aet',
  'PEN': 'pen',
  'PST': 'ft',
  'CANC': 'ft',
  'ABD': 'ft',
  'AWD': 'ft',
  'WO': 'ft',
  'TBD': 'ns',
};

// ============================================
// 统计数据解析 (来源: LiveStatsCore ← /fixtures/statistics)
// ============================================

/**
 * 解析 /fixtures/statistics 响应
 * 严格按照 API-Football 字段名映射
 */
function parseStatistics(
  statistics: TeamStatistics[] | undefined
): {
  // 射门相关 (来源: LiveStatsCore)
  corners: { home: number; away: number };            // Corner Kicks
  shots: { home: number; away: number };              // Total Shots
  shotsOnTarget: { home: number; away: number };      // Shots on Goal
  shotsOffTarget: { home: number; away: number };     // Shots off Goal
  shotsInsideBox: { home: number; away: number };     // Shots insidebox
  shotsOutsideBox: { home: number; away: number };    // Shots outsidebox
  // 进攻相关
  attacks: { home: number; away: number };            // Attacks
  dangerousAttacks: { home: number; away: number };   // Dangerous Attacks
  // 控球/犯规
  possession: { home: number; away: number };         // Ball Possession
  fouls: { home: number; away: number };              // Fouls
  // 牌
  yellowCards: { home: number; away: number };        // Yellow Cards
  redCards: { home: number; away: number };           // Red Cards
  // 其他
  offsides: { home: number; away: number };           // Offsides
  saves: { home: number; away: number };              // Goalkeeper Saves
  xG: { home: number; away: number };                 // expected_goals
} | null {
  if (!statistics || statistics.length < 2) {
    return null;
  }

  const homeStats = statistics[0];
  const awayStats = statistics[1];

  /**
   * 从统计数组中获取指定类型的值
   * @param stats - 球队统计数组
   * @param type - API 原始字段名 (如 "Total Shots", "Ball Possession")
   */
  const getStat = (stats: TeamStatistics, type: string): number => {
    const stat = stats.statistics.find(s => s.type === type);
    if (!stat || stat.value === null) return 0;
    if (typeof stat.value === 'string') {
      // 处理百分比格式 "65%" → 65
      return parseInt(stat.value.replace('%', ''), 10) || 0;
    }
    return stat.value;
  };

  return {
    // === 射门相关 ===
    corners: {
      home: getStat(homeStats, 'Corner Kicks'),
      away: getStat(awayStats, 'Corner Kicks'),
    },
    shots: {
      home: getStat(homeStats, 'Total Shots'),
      away: getStat(awayStats, 'Total Shots'),
    },
    shotsOnTarget: {
      home: getStat(homeStats, 'Shots on Goal'),
      away: getStat(awayStats, 'Shots on Goal'),
    },
    shotsOffTarget: {
      home: getStat(homeStats, 'Shots off Goal'),
      away: getStat(awayStats, 'Shots off Goal'),
    },
    shotsInsideBox: {
      home: getStat(homeStats, 'Shots insidebox'),
      away: getStat(awayStats, 'Shots insidebox'),
    },
    shotsOutsideBox: {
      home: getStat(homeStats, 'Shots outsidebox'),
      away: getStat(awayStats, 'Shots outsidebox'),
    },
    // === 进攻相关 ===
    attacks: {
      home: getStat(homeStats, 'Attacks'),
      away: getStat(awayStats, 'Attacks'),
    },
    dangerousAttacks: {
      home: getStat(homeStats, 'Dangerous Attacks'),
      away: getStat(awayStats, 'Dangerous Attacks'),
    },
    // === 控球/犯规 ===
    possession: {
      home: getStat(homeStats, 'Ball Possession'),
      away: getStat(awayStats, 'Ball Possession'),
    },
    fouls: {
      home: getStat(homeStats, 'Fouls'),
      away: getStat(awayStats, 'Fouls'),
    },
    // === 牌 ===
    yellowCards: {
      home: getStat(homeStats, 'Yellow Cards'),
      away: getStat(awayStats, 'Yellow Cards'),
    },
    redCards: {
      home: getStat(homeStats, 'Red Cards'),
      away: getStat(awayStats, 'Red Cards'),
    },
    // === 其他 ===
    offsides: {
      home: getStat(homeStats, 'Offsides'),
      away: getStat(awayStats, 'Offsides'),
    },
    saves: {
      home: getStat(homeStats, 'Goalkeeper Saves'),
      away: getStat(awayStats, 'Goalkeeper Saves'),
    },
    xG: {
      home: getStat(homeStats, 'expected_goals') || 0,
      away: getStat(awayStats, 'expected_goals') || 0,
    },
  };
}

// ============================================
// 结构失衡指标计算 (Phase 2)
// ============================================

/**
 * 计算结构失衡/攻势指标
 * 用于 Live 扫描器筛选
 */
function calculateImbalanceMetrics(
  stats: ReturnType<typeof parseStatistics>,
  xG: { home: number; away: number }
): ImbalanceMetrics {
  if (!stats) {
    return {
      shotsDiff: 0,
      shotsOnTargetDiff: 0,
      xgDiff: 0,
      cornersDiff: 0,
      possessionDiff: 0,
      imbalanceScore: 0,
      attackingTeam: 'balanced',
    };
  }

  const shotsDiff = stats.shots.home - stats.shots.away;
  const shotsOnTargetDiff = stats.shotsOnTarget.home - stats.shotsOnTarget.away;
  const xgDiff = xG.home - xG.away;
  const cornersDiff = stats.corners.home - stats.corners.away;
  const possessionDiff = stats.possession.home - stats.possession.away;

  // 综合失衡评分 (0-100)
  // 权重: 射门差 30%, 射正差 25%, xG差 25%, 角球差 10%, 控球差 10%
  const absScore = (
    Math.abs(shotsDiff) * 3 +
    Math.abs(shotsOnTargetDiff) * 5 +
    Math.abs(xgDiff) * 25 +
    Math.abs(cornersDiff) * 2 +
    Math.abs(possessionDiff) * 0.5
  );
  const imbalanceScore = Math.min(100, Math.round(absScore));

  // 判断进攻主导方
  let attackingTeam: 'home' | 'away' | 'balanced' = 'balanced';
  if (shotsDiff >= 5 || xgDiff >= 0.5) {
    attackingTeam = 'home';
  } else if (shotsDiff <= -5 || xgDiff <= -0.5) {
    attackingTeam = 'away';
  }

  return {
    shotsDiff,
    shotsOnTargetDiff,
    xgDiff,
    cornersDiff,
    possessionDiff,
    imbalanceScore,
    attackingTeam,
  };
}

// ============================================
// 事件解析 (来源: LiveEventsCore ← /fixtures/events)
// ============================================

function parseEvents(
  events: MatchEvent[] | undefined,
  homeTeamId: number,
  awayTeamId: number
): {
  eventsForUI: MatchEventForUI[];
  substitutions: SubstitutionInfo[];
  cards: CardInfo;
} {
  const eventsForUI: MatchEventForUI[] = [];
  const substitutions: SubstitutionInfo[] = [];
  const cards: CardInfo = {
    yellow: { home: 0, away: 0, players: [] },
    red: { home: 0, away: 0, players: [] },
  };

  if (!events || events.length === 0) {
    return { eventsForUI, substitutions, cards };
  }

  for (const event of events) {
    const isHome = event.team.id === homeTeamId;
    const teamSide: 'home' | 'away' = isHome ? 'home' : 'away';

    // 转换为前端期望的格式
    const uiEvent: MatchEventForUI = {
      time: event.time,
      minute: event.time.elapsed,
      team: { id: event.team.id, name: event.team.name },
      teamSide,
      type: event.type,
      detail: event.detail,
      player: event.player ? { id: event.player.id, name: event.player.name } : undefined,
      assist: event.assist?.id ? { id: event.assist.id, name: event.assist.name || undefined } : undefined,
    };
    eventsForUI.push(uiEvent);

    // 处理换人 (type: subst)
    if (event.type === 'subst') {
      substitutions.push({
        minute: event.time.elapsed,
        playerIn: event.player?.name || '未知',
        playerOut: event.assist?.name || '未知',
        type: 'neutral',  // 简化处理
        team: teamSide,
      });
    }

    // 处理牌 (type: Card)
    if (event.type === 'Card') {
      const detail = event.detail?.toLowerCase() || '';
      // Red Card 或 Second Yellow card 都算红牌
      if (detail.includes('red') || detail.includes('second yellow')) {
        if (isHome) cards.red.home++;
        else cards.red.away++;
        cards.red.players.push(event.player?.name || '未知');
      } else {
        // Yellow Card
        if (isHome) cards.yellow.home++;
        else cards.yellow.away++;
        cards.yellow.players.push(event.player?.name || '未知');
      }
    }
  }

  return { eventsForUI, substitutions, cards };
}

// ============================================
// 滚球赔率解析 (来源: OddsLiveCore ← /odds/live)
// ============================================

function parseLiveOdds(liveOdds: LiveOddsData[] | undefined): OddsInfo | null {
  if (!liveOdds || liveOdds.length === 0) {
    console.log('[parseLiveOdds] No liveOdds data');
    return null;
  }

  const data = liveOdds[0];
  if (!data.odds || data.odds.length === 0) {
    console.log('[parseLiveOdds] No odds in liveOdds data');
    return null;
  }

  const result: OddsInfo = {
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
    _source: 'API-Football',
    _is_live: true,
    _fetch_status: 'SUCCESS',
    _captured_at: new Date().toISOString(),
    // 新增: 解析暂停/封盘状态
    _is_stopped: data.status?.stopped || false,
    _is_blocked: data.status?.blocked || false,
  };

  // 解析让球盘 (Asian Handicap) - odds.id: 33 或 8
  const ahMarket = data.odds.find(o =>
    o.name === 'Asian Handicap' ||
    o.id === 33 ||
    o.id === 8
  );
  if (ahMarket && ahMarket.values.length >= 2) {
    const mainHome = ahMarket.values.find(v => v.value === 'Home' && v.main === true);
    const mainAway = ahMarket.values.find(v => v.value === 'Away' && v.main === true);
    const homeVal = mainHome || ahMarket.values.find(v => v.value === 'Home' || v.value.includes('Home'));
    const awayVal = mainAway || ahMarket.values.find(v => v.value === 'Away' || v.value.includes('Away'));

    if (homeVal && awayVal) {
      const handicapValue = homeVal.handicap ? parseFloat(homeVal.handicap) : null;
      result.handicap = {
        home: parseFloat(homeVal.odd) || null,
        away: parseFloat(awayVal.odd) || null,
        value: handicapValue,
        homeTrend: 'stable',
        awayTrend: 'stable',
      };
    }
  }

  // 解析大小球 (Over/Under) - odds.id: 36, 25, 5
  const ouMarket = data.odds.find(o =>
    o.name === 'Over/Under Line' ||
    o.name === 'Over/Under' ||
    o.name === 'Goals Over/Under' ||
    o.name === 'Match Goals' ||
    o.name === 'Totals' ||
    o.id === 36 ||
    o.id === 25 ||
    o.id === 5
  );

  if (ouMarket && ouMarket.values.length > 0) {
    const allLines: { line: number; over: number | null; under: number | null; isMain: boolean }[] = [];
    const seenLines = new Set<number>();

    for (const val of ouMarket.values) {
      const lineStr = val.handicap;
      if (!lineStr) continue;
      const line = parseFloat(lineStr);
      if (isNaN(line)) continue;

      if (!seenLines.has(line)) {
        seenLines.add(line);
        const overVal = ouMarket.values.find(v =>
          v.value.toLowerCase() === 'over' && v.handicap === lineStr
        );
        const underVal = ouMarket.values.find(v =>
          v.value.toLowerCase() === 'under' && v.handicap === lineStr
        );

        if (overVal || underVal) {
          const isMain = (overVal?.main === true) || (underVal?.main === true);
          allLines.push({
            line,
            over: overVal ? parseFloat(overVal.odd) : null,
            under: underVal ? parseFloat(underVal.odd) : null,
            isMain,
          });
        }
      }
    }

    let mainLine = allLines.find(l => l.isMain);
    if (!mainLine && allLines.length > 0) {
      allLines.sort((a, b) => Math.abs(a.line - 2.5) - Math.abs(b.line - 2.5));
      mainLine = allLines[0];
    }

    if (mainLine) {
      result.overUnder = {
        over: mainLine.over,
        under: mainLine.under,
        total: mainLine.line,
        overTrend: 'stable',
        underTrend: 'stable',
        allLines: allLines.length > 1 ? allLines : undefined,
      };
    }
  }

  // 解析胜平负 - odds.id: 59 或 1
  const mlMarket = data.odds.find(o =>
    o.name === 'Match Winner' ||
    o.name === 'Fulltime Result' ||
    o.name === '1X2' ||
    o.id === 1 ||
    o.id === 59
  );
  if (mlMarket && mlMarket.values.length >= 3) {
    const home = mlMarket.values.find(v => v.value === 'Home' || v.value === '1');
    const draw = mlMarket.values.find(v => v.value === 'Draw' || v.value === 'X');
    const away = mlMarket.values.find(v => v.value === 'Away' || v.value === '2');
    if (home && draw && away) {
      result.matchWinner = {
        home: parseFloat(home.odd) || null,
        draw: parseFloat(draw.odd) || null,
        away: parseFloat(away.odd) || null,
      };
    }
  }

  // 解析双方进球 - odds.id: 69
  const btsMarket = data.odds.find(o =>
    o.name === 'Both Teams Score' ||
    o.id === 69
  );
  if (btsMarket && btsMarket.values.length >= 2) {
    const yes = btsMarket.values.find(v => v.value.toLowerCase() === 'yes');
    const no = btsMarket.values.find(v => v.value.toLowerCase() === 'no');
    if (yes || no) {
      result.bothTeamsScore = {
        yes: yes ? parseFloat(yes.odd) : null,
        no: no ? parseFloat(no.odd) : null,
      };
    }
  }

  const hasData =
    result.handicap.value !== null ||
    result.overUnder.total !== null ||
    result.matchWinner?.home !== null;
  return hasData ? result : null;
}

// ============================================
// 赛前赔率解析 (来源: OddsPrematchCore ← /odds)
// ============================================

function parsePrematchOdds(prematchOdds: OddsData[] | undefined): OddsInfo | null {
  if (!prematchOdds || prematchOdds.length === 0) return null;

  const data = prematchOdds[0];
  if (!data.bookmakers || data.bookmakers.length === 0) return null;

  const bookmaker = data.bookmakers[0];
  const result: OddsInfo = {
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
    _source: 'PREMATCH',
    _bookmaker: bookmaker.name,
    _is_live: false,
    _fetch_status: 'SUCCESS',
    _captured_at: new Date().toISOString(),
  };

  for (const bet of bookmaker.bets) {
    // 让球盘 - bet.id: 8 或 33
    if (bet.id === 8 || bet.id === 33 || bet.name === 'Asian Handicap') {
      const homeVal = bet.values.find(v => v.value.includes('Home'));
      const awayVal = bet.values.find(v => v.value.includes('Away'));
      if (homeVal && awayVal) {
        const lineMatch = homeVal.value.match(/-?\d+\.?\d*/);
        result.handicap = {
          home: parseFloat(homeVal.odd) || null,
          away: parseFloat(awayVal.odd) || null,
          value: lineMatch ? parseFloat(lineMatch[0]) : null,
          homeTrend: 'stable',
          awayTrend: 'stable',
        };
      }
    }

    // 大小球 - bet.id: 5 或 36
    if (
      bet.id === 5 ||
      bet.id === 36 ||
      bet.name === 'Goals Over/Under' ||
      bet.name === 'Over/Under' ||
      bet.name === 'Over/Under Line' ||
      bet.name === 'Match Goals'
    ) {
      const targetLines = [2.5, 2.25, 2.75, 3.0, 2.0, 3.5, 1.5, 3.25, 3.75];
      let foundLine: number | null = null;
      let overOdd: number | null = null;
      let underOdd: number | null = null;

      for (const targetLine of targetLines) {
        const overVal = bet.values.find(v =>
          v.value.toLowerCase().includes('over') &&
          v.value.includes(targetLine.toString())
        );
        const underVal = bet.values.find(v =>
          v.value.toLowerCase().includes('under') &&
          v.value.includes(targetLine.toString())
        );

        if (overVal && underVal) {
          foundLine = targetLine;
          overOdd = parseFloat(overVal.odd) || null;
          underOdd = parseFloat(underVal.odd) || null;
          break;
        }
      }

      if (foundLine !== null) {
        result.overUnder = {
          over: overOdd,
          under: underOdd,
          total: foundLine,
          overTrend: 'stable',
          underTrend: 'stable',
        };
      }
    }

    // 胜平负 - bet.id: 1
    if (bet.id === 1 || bet.name === 'Match Winner' || bet.name === 'Fulltime Result' || bet.name === '1X2') {
      const home = bet.values.find(v => v.value === 'Home' || v.value === '1');
      const draw = bet.values.find(v => v.value === 'Draw' || v.value === 'X');
      const away = bet.values.find(v => v.value === 'Away' || v.value === '2');
      if (home && draw && away) {
        result.matchWinner = {
          home: parseFloat(home.odd) || null,
          draw: parseFloat(draw.odd) || null,
          away: parseFloat(away.odd) || null,
        };
      }
    }

    // 双方进球 - bet.id: 26
    if (bet.id === 26 || bet.name === 'Both Teams Score') {
      const yes = bet.values.find(v => v.value.toLowerCase() === 'yes');
      const no = bet.values.find(v => v.value.toLowerCase() === 'no');
      if (yes || no) {
        result.bothTeamsScore = {
          yes: yes ? parseFloat(yes.odd) : null,
          no: no ? parseFloat(no.odd) : null,
        };
      }
    }
  }

  const hasData =
    result.handicap.value !== null ||
    result.overUnder.total !== null ||
    result.matchWinner?.home !== null;
  return hasData ? result : null;
}

// 创建空的默认赔率（当没有数据时）
function createEmptyOdds(reason: string): OddsInfo {
  return {
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
    _source: 'N/A',
    _fetch_status: 'EMPTY',
    _no_data_reason: reason,
  };
}

// ============================================
// 主聚合函数
// ============================================

/**
 * 将 API-Football 原始数据聚合为 AdvancedMatch 格式
 *
 * 数据来源映射:
 * - fixtures → LiveCore (基础信息)
 * - statisticsMap → LiveStatsCore (统计数据)
 * - eventsMap → LiveEventsCore (事件数据)
 * - liveOddsMap → OddsLiveCore (滚球赔率)
 * - prematchOddsMap → OddsPrematchCore (赛前赔率)
 */
export function aggregateMatches(
  fixtures: Match[],
  statisticsMap: Map<number, TeamStatistics[]>,
  eventsMap: Map<number, MatchEvent[]>,
  liveOddsMap: Map<number, LiveOddsData[]>,
  prematchOddsMap: Map<number, OddsData[]>
): AdvancedMatch[] {
  const results: AdvancedMatch[] = [];

  for (const fixture of fixtures) {
    try {
      const fixtureId = fixture.fixture.id;
      const leagueInfo = LEAGUE_NAME_MAP[fixture.league.id];
      const leagueName = leagueInfo?.name || fixture.league.name;
      const leagueShort = leagueInfo?.short || fallbackLeagueShort(fixture.league.name);

      // === 基础数据 (来源: LiveCore ← /fixtures?live=all) ===
      const match: AdvancedMatch = {
        id: fixtureId,
        leagueId: fixture.league.id,
        league: leagueName,
        leagueShort,
        leagueLogo: fixture.league.logo,
        leagueFlag: fixture.league.flag || undefined,
        leagueCountry: fixture.league.country || undefined,
        round: fixture.league.round,
        home: {
          id: fixture.teams.home.id,
          name: fixture.teams.home.name,
          logo: fixture.teams.home.logo,
          score: fixture.goals.home || 0,
          handicap: null,
        },
        away: {
          id: fixture.teams.away.id,
          name: fixture.teams.away.name,
          logo: fixture.teams.away.logo,
          score: fixture.goals.away || 0,
          overUnder: null,
        },
        homeTeamId: fixture.teams.home.id,
        status: STATUS_MAP[fixture.fixture.status.short] || 'live',
        minute: fixture.fixture.status.elapsed || 0,
        timestamp: fixture.fixture.timestamp,
        venue: fixture.fixture.venue?.name,
        referee: fixture.fixture.referee || undefined,
        // 新增: 半场比分
        halftimeScore: fixture.score.halftime,
        // 初始盘口快照默认为空，由赛前赔率单独填充
        initialHandicap: null,
        initialOverUnder: null,
      };

      // === 统计数据 (来源: LiveStatsCore ← /fixtures/statistics) ===
      const stats = statisticsMap.get(fixtureId);
      if (stats) {
        const parsed = parseStatistics(stats);
        if (parsed) {
          // 顶层字段
          match.corners = parsed.corners;
          match.shots = parsed.shots;
          match.shotsOnTarget = parsed.shotsOnTarget;
          match.shotsOffTarget = parsed.shotsOffTarget;
          match.shotsInsideBox = parsed.shotsInsideBox;
          match.possession = parsed.possession;
          match.fouls = parsed.fouls;
          match.yellowCards = parsed.yellowCards;
          match.redCards = parsed.redCards;
          match.offsides = parsed.offsides;
          match.saves = parsed.saves;

          // 嵌套 stats 对象
          match.stats = {
            possession: parsed.possession,
            shots: parsed.shots,
            shotsOnTarget: parsed.shotsOnTarget,
            xG: parsed.xG,
            shotsOffTarget: parsed.shotsOffTarget,
            shotsInsideBox: parsed.shotsInsideBox,
            shotsOutsideBox: parsed.shotsOutsideBox,
            attacks: parsed.attacks,
            dangerousAttacks: parsed.dangerousAttacks,
            fouls: parsed.fouls,
            corners: parsed.corners,
            saves: parsed.saves,
            offsides: parsed.offsides,
            _realDataAvailable: true,
          };

          // === 结构失衡指标 (Phase 2) ===
          match.imbalance = calculateImbalanceMetrics(parsed, parsed.xG);

          match._dataQuality = 'REAL';
        }
      }

      // === 事件数据 (来源: LiveEventsCore ← /fixtures/events) ===
      const events = eventsMap.get(fixtureId);
      if (events && events.length > 0) {
        const { eventsForUI, substitutions, cards } = parseEvents(
          events,
          fixture.teams.home.id,
          fixture.teams.away.id
        );
        match.events = eventsForUI;
        match.substitutions = substitutions;
        match.cards = cards;
      }

      // === 赔率数据 (来源: OddsLiveCore / OddsPrematchCore) ===
      const liveOdds = liveOddsMap.get(fixtureId);
      const prematchOdds = prematchOddsMap.get(fixtureId);

      // 判断供应商是否“完全无赔率”（/odds 与 /odds/live 均返回空数组）
      const hasLiveOddsResponse = !!(liveOdds && liveOdds.length > 0);
      const hasPrematchOddsResponse = !!(prematchOdds && prematchOdds.length > 0);
      const noOddsFromProvider = !hasLiveOddsResponse && !hasPrematchOddsResponse;

      // 解析实时赔率和赛前赔率（只要任一端点有可用的欧赔 / 亚盘 / 大小球，即认为供应商“有赔率”）
      const liveOddsInfo = parseLiveOdds(liveOdds);
      const prematchOddsInfo = parsePrematchOdds(prematchOdds);

      // 当前盘口：优先使用 live odds，其次回退到 prematch odds
      let odds: OddsInfo | null = null;
      let oddsSource: 'live' | 'prematch' | null = null;

      if (liveOddsInfo) {
        odds = liveOddsInfo;
        oddsSource = 'live';
      } else if (prematchOddsInfo) {
        odds = prematchOddsInfo;
        oddsSource = 'prematch';
      }

      if (odds) {
        match.odds = odds;
        match._oddsSource = oddsSource;
      } else {
        match.odds = createEmptyOdds('暂无实时赔率');
        match._oddsSource = null;
      }

      // 当两个端点响应都为空数组时，明确标记为供应商无赔率
      if (noOddsFromProvider) {
        match.noOddsFromProvider = true;
      } else if (odds) {
        // 只要有任一端点给出有效欧赔/亚盘/大小球，就认为“有赔率”
        match.noOddsFromProvider = false;
      }

      // 赛前初盘快照：仅从 prematch odds 中提取，不受 live odds 影响
      if (prematchOddsInfo) {
        const initialHandicap =
          prematchOddsInfo.handicap && prematchOddsInfo.handicap.value !== null
            ? prematchOddsInfo.handicap.value
            : null;
        const initialOverUnder =
          prematchOddsInfo.overUnder && prematchOddsInfo.overUnder.total !== null
            ? prematchOddsInfo.overUnder.total
            : null;

        match.initialHandicap = initialHandicap;
        match.initialOverUnder = initialOverUnder;
      }

      // === 情景引擎派生字段 ===
      match.stoppageTimeAnnounced = fixture.fixture.status.extra ?? null;

      // 下半场统计增量：粗略用"全场总量 - 半场推测"计算
      if (match.stats?._realDataAvailable && match.halftimeScore && match.minute > 45) {
        const htGoalsHome = match.halftimeScore.home ?? 0;
        const htGoalsAway = match.halftimeScore.away ?? 0;
        const htTotalGoals = htGoalsHome + htGoalsAway;
        const ftTotalGoals = match.home.score + match.away.score;
        const totalShots = (match.stats.shots?.home ?? 0) + (match.stats.shots?.away ?? 0);
        const totalXG = (match.stats.xG?.home ?? 0) + (match.stats.xG?.away ?? 0);
        const totalCorners = (match.stats.corners?.home ?? 0) + (match.stats.corners?.away ?? 0);
        // 用进球比例近似半场射门/xG/角球占比
        const htRatio = ftTotalGoals > 0 ? htTotalGoals / ftTotalGoals : 0.5;
        const estimatedHtShots = Math.round(totalShots * htRatio);
        const estimatedHtXG = totalXG * htRatio;
        const estimatedHtCorners = Math.round(totalCorners * htRatio);
        match.halfStatsDelta = {
          shotsDelta: totalShots - estimatedHtShots - estimatedHtShots,
          xgDelta: totalXG - estimatedHtXG - estimatedHtXG,
          cornersDelta: totalCorners - estimatedHtCorners - estimatedHtCorners,
        };
      }

      // 70分钟后攻击型换人数
      if (match.substitutions && match.substitutions.length > 0) {
        match.subsAfter70Attack = match.substitutions.filter(
          s => s.minute >= 70 && s.type === 'attack'
        ).length;
      }

      // 争胜压力代理：排名前3争冠 / 后3保级
      const homeRank = match.home.rank;
      const awayRank = match.away.rank;
      if (typeof homeRank === 'number' && typeof awayRank === 'number') {
        const homeNeedsWin = homeRank <= 3 || homeRank >= 16;
        const awayNeedsWin = awayRank <= 3 || awayRank >= 16;
        if (homeNeedsWin && awayNeedsWin) match.needsWinProxy = 'both';
        else if (homeNeedsWin) match.needsWinProxy = 'home';
        else if (awayNeedsWin) match.needsWinProxy = 'away';
        else match.needsWinProxy = null;
      }

      // === 数据质量标记 ===
      if (!stats || stats.length === 0) {
        match._dataQuality = 'PARTIAL';
        match._unscoreable = true;
        // 创建空的 stats 对象
        match.stats = {
          possession: { home: 50, away: 50 },
          shots: { home: 0, away: 0 },
          shotsOnTarget: { home: 0, away: 0 },
          xG: { home: 0, away: 0 },
          _realDataAvailable: false,
        };
        // 空的 imbalance
        match.imbalance = {
          shotsDiff: 0,
          shotsOnTargetDiff: 0,
          xgDiff: 0,
          cornersDiff: 0,
          possessionDiff: 0,
          imbalanceScore: 0,
          attackingTeam: 'balanced',
        };
      }

      results.push(match);
    } catch (error) {
      console.error(`[Aggregator] Error processing fixture ${fixture.fixture.id}:`, error);
    }
  }

  return results;
}

// ============================================
// 阵容解析 + 换人位置关联
// ============================================

interface RawLineupPlayer {
  id: number;
  name: string;
  number: number;
  pos: string;
  grid: string | null;
}

interface RawLineupTeam {
  team: { id: number; name: string; logo?: string };
  formation: string;
  startXI: { player: RawLineupPlayer }[];
  substitutes: { player: RawLineupPlayer }[];
  coach: { id: number; name: string; photo?: string };
}

const POS_RANK: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

function inferSubType(posIn: string | null, posOut: string | null): 'attack' | 'defense' | 'neutral' {
  if (!posIn || !posOut) return 'neutral';
  const rIn = POS_RANK[posIn] ?? 2;
  const rOut = POS_RANK[posOut] ?? 2;
  if (rIn > rOut) return 'attack';
  if (rIn < rOut) return 'defense';
  return 'neutral';
}

/**
 * Post-process: parse enrichment.lineups into match.lineups,
 * and cross-reference substitution events with lineup data
 * to fill playerInPosition, playerOutPosition, and type.
 */
export function applyLineupsAndSubPositions(matches: AdvancedMatch[]): void {
  for (const match of matches) {
    const rawLineups = (match.enrichment as { lineups?: unknown[] } | undefined)?.lineups;
    if (!rawLineups || !Array.isArray(rawLineups) || rawLineups.length === 0) continue;

    // Build a player ID → position lookup from all lineup entries
    const posMap = new Map<number, string>();
    const parsedLineups: RawLineupTeam[] = [];

    for (const raw of rawLineups) {
      const lu = raw as RawLineupTeam;
      if (!lu?.team?.id || !lu?.startXI) continue;

      for (const s of lu.startXI ?? []) {
        if (s.player?.id && s.player.pos) posMap.set(s.player.id, s.player.pos);
      }
      for (const s of lu.substitutes ?? []) {
        if (s.player?.id && s.player.pos) posMap.set(s.player.id, s.player.pos);
      }
      parsedLineups.push(lu);
    }

    // Attach structured lineups to match (so frontend can render lineup tab)
    if (parsedLineups.length > 0 && !match.lineups) {
      match.lineups = parsedLineups.map((lu) => ({
        team: { id: lu.team.id, name: lu.team.name, logo: lu.team.logo },
        formation: lu.formation ?? '',
        startXI: (lu.startXI ?? []).map((s) => ({
          player: { id: s.player.id, name: s.player.name, number: s.player.number, pos: s.player.pos ?? '', grid: s.player.grid },
        })),
        substitutes: (lu.substitutes ?? []).map((s) => ({
          player: { id: s.player.id, name: s.player.name, number: s.player.number, pos: s.player.pos ?? '', grid: s.player.grid },
        })),
        coach: lu.coach ?? { id: 0, name: '' },
      }));
    }

    if (posMap.size === 0 || !match.substitutions || match.substitutions.length === 0) continue;

    // Cross-reference substitutions with events to get player IDs
    const subEvents = (match.events ?? []).filter(
      (ev) => (ev.type ?? '').toLowerCase() === 'subst',
    );

    for (const sub of match.substitutions) {
      // Find matching event by minute and player name
      const ev = subEvents.find(
        (e) =>
          e.minute === sub.minute &&
          (e.player?.name === sub.playerIn || e.assist?.name === sub.playerOut),
      );
      if (!ev) continue;

      const inId = ev.player?.id;
      const outId = ev.assist?.id;
      const posIn = inId ? posMap.get(inId) ?? null : null;
      const posOut = outId ? posMap.get(outId) ?? null : null;

      sub.playerInPosition = posIn;
      sub.playerOutPosition = posOut;
      sub.type = inferSubType(posIn, posOut);
    }
  }
}

/**
 * 计算简单的 kill score（后端简化版）
 * 详细评分在前端进行
 */
export function calculateBasicKillScore(match: AdvancedMatch): number {
  if (!match.corners || !match.possession) {
    return 0;
  }

  const totalCorners = match.corners.home + match.corners.away;
  const minute = match.minute || 0;

  // 角球率评分
  const cornerRate = minute > 0 ? totalCorners / minute : 0;

  let score = 50;

  if (cornerRate > 0.15) score += 30;
  else if (cornerRate > 0.1) score += 15;

  const possessionDiff = Math.abs(match.possession.home - match.possession.away);
  if (possessionDiff < 10) score += 10;

  if (match.shots) {
    const totalShots = match.shots.home + match.shots.away;
    if (totalShots > 15) score += 15;
    else if (totalShots > 10) score += 10;
  }

  return Math.min(100, Math.max(0, score));
}
