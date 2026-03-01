/**
 * API-Football 标准数据模型
 *
 * 版本: v2.0 (2026-03-01)
 *
 * 这个文件定义了与 API-Football 一一对应的标准数据模型。
 * 每个字段都标注了来源端点和原始字段名。
 *
 * 参考文档: .same/API_FOOTBALL_MASTER_REFERENCE.md
 */

// ============================================
// 第 1 部分：核心 Live 数据模型
// ============================================

/**
 * LiveCore - 比赛核心实时数据
 *
 * 数据来源: GET /fixtures?live=all
 */
export interface LiveCore {
  /** 比赛唯一ID | fixture.id */
  fixtureId: number;

  /** 当前分钟数 (0-90+) | fixture.status.elapsed */
  minute: number;

  /** 状态码 | fixture.status.short */
  status: LiveStatus;

  /** 状态文本 | fixture.status.long */
  statusLong: string;

  /** 主队进球 | goals.home */
  homeGoals: number;

  /** 客队进球 | goals.away */
  awayGoals: number;

  /** 半场比分 | score.halftime */
  halftimeScore: { home: number | null; away: number | null };

  /** 比赛开始时间戳 | fixture.timestamp */
  timestamp: number;

  /** 上半场开始时间 | fixture.periods.first */
  firstHalfStart: number | null;

  /** 下半场开始时间 | fixture.periods.second */
  secondHalfStart: number | null;
}

/**
 * 比赛状态码枚举
 * 来源: fixture.status.short
 */
export type LiveStatus =
  | 'NS'    // Not Started - 未开始
  | '1H'    // First Half - 上半场
  | 'HT'    // Half Time - 中场休息
  | '2H'    // Second Half - 下半场
  | 'ET'    // Extra Time - 加时赛
  | 'BT'    // Break Time - 加时中场
  | 'P'     // Penalty - 点球大战
  | 'SUSP'  // Suspended - 暂停
  | 'INT'   // Interrupted - 中断
  | 'LIVE'  // Live (generic) - 进行中
  | 'FT'    // Full Time - 全场结束
  | 'AET'   // After Extra Time - 加时结束
  | 'PEN'   // Penalty Shootout End - 点球结束
  | 'PST'   // Postponed - 延期
  | 'CANC'  // Cancelled - 取消
  | 'ABD'   // Abandoned - 腰斩
  | 'AWD'   // Awarded - 判定
  | 'WO';   // Walk Over - 弃权

/**
 * 内部标准化状态
 */
export type NormalizedStatus = 'ns' | 'live' | '1h' | 'ht' | '2h' | 'ft' | 'aet' | 'pen';

/**
 * 状态映射函数
 */
export function normalizeStatus(apiStatus: LiveStatus): NormalizedStatus {
  const map: Record<string, NormalizedStatus> = {
    'NS': 'ns',
    '1H': '1h',
    'HT': 'ht',
    '2H': '2h',
    'ET': 'live',
    'BT': 'live',
    'P': 'live',
    'SUSP': 'live',
    'INT': 'live',
    'LIVE': 'live',
    'FT': 'ft',
    'AET': 'aet',
    'PEN': 'pen',
  };
  return map[apiStatus] || 'live';
}

// ============================================
// 第 2 部分：比赛统计数据模型
// ============================================

/**
 * LiveStatsCore - 比赛实时统计
 *
 * 数据来源: GET /fixtures/statistics?fixture={id}
 */
export interface LiveStatsCore {
  /** 比赛ID */
  fixtureId: number;

  /** 主队统计 */
  home: TeamStats;

  /** 客队统计 */
  away: TeamStats;

  /** 是否有真实数据（非模拟） */
  hasRealData: boolean;
}

/**
 * 单方统计数据
 */
export interface TeamStats {
  // ============ 射门相关 ============
  /** 总射门数 | Total Shots */
  shots: number;

  /** 射正数 | Shots on Goal */
  shotsOnTarget: number;

  /** 射偏数 | Shots off Goal */
  shotsOffTarget: number;

  /** 被封堵 | Blocked Shots */
  blockedShots: number;

  /** 禁区内射门 | Shots insidebox */
  shotsInsideBox: number;

  /** 禁区外射门 | Shots outsidebox */
  shotsOutsideBox: number;

  // ============ 控球/传球 ============
  /** 控球率 (0-100) | Ball Possession (解析自 "55%") */
  possession: number;

  /** 总传球 | Total passes */
  passes: number;

  /** 成功传球 | Passes accurate */
  passesAccurate: number;

  /** 传球成功率 (0-100) | Passes % */
  passAccuracy: number;

  // ============ 进攻指标 ============
  /** 角球数 | Corner Kicks */
  corners: number;

  /** 越位数 | Offsides */
  offsides: number;

  /** 期望进球 | expected_goals */
  xG: number;

  // ============ 防守/犯规 ============
  /** 犯规数 | Fouls */
  fouls: number;

  /** 门将扑救 | Goalkeeper Saves */
  saves: number;

  // ============ 牌 ============
  /** 黄牌数 | Yellow Cards */
  yellowCards: number;

  /** 红牌数 | Red Cards */
  redCards: number;
}

/**
 * API 原始统计类型名称 (用于解析)
 */
export const API_STATS_TYPE_MAP: Record<string, keyof TeamStats> = {
  'Total Shots': 'shots',
  'Shots on Goal': 'shotsOnTarget',
  'Shots off Goal': 'shotsOffTarget',
  'Blocked Shots': 'blockedShots',
  'Shots insidebox': 'shotsInsideBox',
  'Shots outsidebox': 'shotsOutsideBox',
  'Ball Possession': 'possession',
  'Total passes': 'passes',
  'Passes accurate': 'passesAccurate',
  'Passes %': 'passAccuracy',
  'Corner Kicks': 'corners',
  'Offsides': 'offsides',
  'expected_goals': 'xG',
  'Fouls': 'fouls',
  'Goalkeeper Saves': 'saves',
  'Yellow Cards': 'yellowCards',
  'Red Cards': 'redCards',
};

/**
 * 创建空的统计对象
 */
export function createEmptyTeamStats(): TeamStats {
  return {
    shots: 0,
    shotsOnTarget: 0,
    shotsOffTarget: 0,
    blockedShots: 0,
    shotsInsideBox: 0,
    shotsOutsideBox: 0,
    possession: 50,
    passes: 0,
    passesAccurate: 0,
    passAccuracy: 0,
    corners: 0,
    offsides: 0,
    xG: 0,
    fouls: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
  };
}

// ============================================
// 第 3 部分：比赛事件数据模型
// ============================================

/**
 * LiveEventsCore - 比赛事件列表
 *
 * 数据来源: GET /fixtures/events?fixture={id}
 */
export interface LiveEventsCore {
  /** 比赛ID */
  fixtureId: number;

  /** 事件列表 */
  events: MatchEventCore[];

  /** 统计汇总 */
  summary: EventSummary;
}

/**
 * 单个事件
 */
export interface MatchEventCore {
  /** 事件发生分钟 | time.elapsed */
  minute: number;

  /** 补时分钟 | time.extra */
  extraMinute: number | null;

  /** 球队ID | team.id */
  teamId: number;

  /** 是否主队事件 */
  isHome: boolean;

  /** 事件类型 | type */
  type: EventType;

  /** 详细类型 | detail */
  detail: string;

  /** 球员姓名 | player.name */
  playerName: string;

  /** 球员ID | player.id */
  playerId: number;

  /** 助攻/被换下球员 | assist.name */
  assistName: string | null;

  /** 备注 | comments */
  comments: string | null;
}

/**
 * 事件类型枚举
 */
export type EventType = 'Goal' | 'Card' | 'subst' | 'Var';

/**
 * 进球详情类型
 */
export type GoalDetail =
  | 'Normal Goal'
  | 'Penalty'
  | 'Own Goal'
  | 'Missed Penalty';

/**
 * 牌详情类型
 */
export type CardDetail =
  | 'Yellow Card'
  | 'Red Card'
  | 'Second Yellow card';

/**
 * VAR 详情类型
 */
export type VarDetail =
  | 'Goal cancelled'
  | 'Goal confirmed'
  | 'Penalty confirmed'
  | 'Goal Disallowed - offside'
  | 'Card upgrade';

/**
 * 事件汇总统计
 */
export interface EventSummary {
  /** 总进球 */
  totalGoals: number;

  /** 主队进球 */
  homeGoals: number;

  /** 客队进球 */
  awayGoals: number;

  /** 主队黄牌 */
  homeYellowCards: number;

  /** 客队黄牌 */
  awayYellowCards: number;

  /** 主队红牌 */
  homeRedCards: number;

  /** 客队红牌 */
  awayRedCards: number;

  /** 主队换人次数 */
  homeSubstitutions: number;

  /** 客队换人次数 */
  awaySubstitutions: number;

  /** VAR 事件数 */
  varEvents: number;
}

// ============================================
// 第 4 部分：阵容数据模型
// ============================================

/**
 * LineupCore - 比赛阵容
 *
 * 数据来源: GET /fixtures/lineups?fixture={id}
 */
export interface LineupCore {
  /** 比赛ID */
  fixtureId: number;

  /** 主队阵容 */
  home: TeamLineup;

  /** 客队阵容 */
  away: TeamLineup;
}

/**
 * 单方阵容
 */
export interface TeamLineup {
  /** 球队ID */
  teamId: number;

  /** 球队名 */
  teamName: string;

  /** 阵型 | formation (如 "4-2-3-1") */
  formation: string | null;

  /** 首发11人 | startXI */
  startingXI: PlayerInLineup[];

  /** 替补球员 | substitutes */
  substitutes: PlayerInLineup[];

  /** 教练 | coach */
  coach: {
    id: number;
    name: string;
    photo: string;
  } | null;
}

/**
 * 阵容中的球员
 */
export interface PlayerInLineup {
  /** 球员ID | player.id */
  playerId: number;

  /** 球员姓名 | player.name */
  name: string;

  /** 球衣号码 | player.number */
  number: number;

  /** 位置 | player.pos */
  position: PlayerPosition;

  /** 位置坐标 | player.grid (如 "2:3") */
  grid: string | null;
}

/**
 * 球员位置枚举
 */
export type PlayerPosition = 'G' | 'D' | 'M' | 'F';

/**
 * 判断是否进攻型替补
 */
export function countAttackingSubs(lineup: TeamLineup): number {
  return lineup.substitutes.filter(p => p.position === 'F').length;
}

// ============================================
// 第 5 部分：赔率数据模型
// ============================================

/**
 * OddsPrematchCore - 赛前赔率
 *
 * 数据来源: GET /odds?fixture={id}
 */
export interface OddsPrematchCore {
  /** 比赛ID */
  fixtureId: number;

  /** 最后更新时间 */
  updatedAt: string;

  /** 博彩公司来源 */
  bookmakerName: string;

  /** 博彩公司ID */
  bookmakerId: number;

  /** 胜平负赔率 | bet.id=1 (Match Winner) */
  matchWinner: {
    home: number | null;
    draw: number | null;
    away: number | null;
  };

  /** 大小球 | bet.id=5 (Goals Over/Under) */
  overUnder: {
    line: number;      // 盘口线 (如 2.5)
    over: number | null;
    under: number | null;
  };

  /** 亚洲让球 | bet.id=8 (Asian Handicap) */
  asianHandicap: {
    line: number;      // 让球线 (如 -0.5)
    home: number | null;
    away: number | null;
  };

  /** 双方进球 | bet.id=26 (Both Teams Score) */
  bothTeamsScore: {
    yes: number | null;
    no: number | null;
  };
}

/**
 * OddsLiveCore - 滚球赔率
 *
 * 数据来源: GET /odds/live?fixture={id}
 * ⚠️ 结构与赛前赔率不同
 */
export interface OddsLiveCore {
  /** 比赛ID */
  fixtureId: number;

  /** 当前分钟 */
  minute: number | null;

  /** 当前比分 */
  currentScore: { home: number; away: number };

  /** 是否暂停投注 | status.stopped */
  isStopped: boolean;

  /** 是否封盘 | status.blocked */
  isBlocked: boolean;

  /** 最后更新时间 */
  updatedAt: string;

  /** 亚洲让球 (滚球) | odds.id=33 */
  asianHandicap: {
    line: number | null;   // ⭐ 从 values[].handicap 解析
    home: number | null;
    away: number | null;
    isMain: boolean;
    isSuspended: boolean;
  };

  /** 大小球 (滚球) | odds.id=36 */
  overUnder: {
    line: number | null;   // ⭐ 从 values[].handicap 解析
    over: number | null;
    under: number | null;
    isMain: boolean;
    isSuspended: boolean;
    /** 所有可用盘口线 */
    allLines?: Array<{
      line: number;
      over: number | null;
      under: number | null;
      isMain: boolean;
    }>;
  };

  /** 全场胜平负 (滚球) | odds.id=59 */
  matchWinner: {
    home: number | null;
    draw: number | null;
    away: number | null;
    isSuspended: boolean;
  };
}

/**
 * 滚球盘口类型ID映射
 */
export const LIVE_ODDS_MARKET_IDS = {
  ASIAN_HANDICAP: [33, 8],
  OVER_UNDER: [36, 25, 5],
  MATCH_WINNER: [59, 1],
  BOTH_TEAMS_SCORE: [69],
} as const;

/**
 * 滚球盘口类型名称映射
 */
export const LIVE_ODDS_MARKET_NAMES = {
  ASIAN_HANDICAP: ['Asian Handicap'],
  OVER_UNDER: ['Over/Under Line', 'Over/Under', 'Match Goals', 'Goals Over/Under', 'Totals'],
  MATCH_WINNER: ['Fulltime Result', 'Match Winner', '1X2'],
  BOTH_TEAMS_SCORE: ['Both Teams Score'],
} as const;

// ============================================
// 第 6 部分：积分榜数据模型
// ============================================

/**
 * StandingsCore - 联赛积分榜
 *
 * 数据来源: GET /standings?league={id}&season={year}
 */
export interface StandingsCore {
  /** 联赛ID */
  leagueId: number;

  /** 联赛名称 */
  leagueName: string;

  /** 赛季 */
  season: number;

  /** 积分榜（支持分组） */
  standings: StandingsGroup[];
}

/**
 * 积分榜分组（联赛只有1组，杯赛可能多组）
 */
export interface StandingsGroup {
  /** 组名（联赛为空） */
  groupName?: string;

  /** 球队排名列表 */
  teams: TeamStanding[];
}

/**
 * 单支球队的排名数据
 */
export interface TeamStanding {
  /** 排名 | rank */
  rank: number;

  /** 球队ID | team.id */
  teamId: number;

  /** 球队名 | team.name */
  teamName: string;

  /** 球队Logo | team.logo */
  teamLogo: string;

  /** 积分 | points */
  points: number;

  /** 净胜球 | goalsDiff */
  goalsDiff: number;

  /** 近期战绩 | form (如 "WWDLW") */
  form: string;

  /** 排名变化 | status ("same" | "up" | "down") */
  trend: 'same' | 'up' | 'down';

  /** 描述（如 "Champions League" | "Relegation"） | description */
  description: string | null;

  /** 总成绩 | all */
  overall: FixturesRecord;

  /** 主场成绩 | home */
  homeRecord: FixturesRecord;

  /** 客场成绩 | away */
  awayRecord: FixturesRecord;
}

/**
 * 比赛记录
 */
export interface FixturesRecord {
  /** 比赛场数 | played */
  played: number;

  /** 胜场 | win */
  wins: number;

  /** 平场 | draw */
  draws: number;

  /** 负场 | lose */
  losses: number;

  /** 进球 | goals.for */
  goalsFor: number;

  /** 失球 | goals.against */
  goalsAgainst: number;
}

// ============================================
// 第 7 部分：球队赛季统计数据模型
// ============================================

/**
 * TeamSeasonStatsCore - 球队赛季统计
 *
 * 数据来源: GET /teams/statistics?team={id}&league={id}&season={year}
 */
export interface TeamSeasonStatsCore {
  /** 球队ID */
  teamId: number;

  /** 球队名 */
  teamName: string;

  /** 联赛ID */
  leagueId: number;

  /** 赛季 */
  season: number;

  /** 近期战绩 | form (如 "LWWDW") */
  form: string;

  /** 比赛场次 | fixtures */
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    losses: { home: number; away: number; total: number };
  };

  /** 进球数据 | goals.for */
  goalsFor: GoalStats;

  /** 失球数据 | goals.against */
  goalsAgainst: GoalStats;

  /** 零封场次 | clean_sheet */
  cleanSheets: { home: number; away: number; total: number };

  /** 未进球场次 | failed_to_score */
  failedToScore: { home: number; away: number; total: number };

  /** 点球数据 | penalty */
  penalty: {
    scored: { total: number; percentage: string };
    missed: { total: number; percentage: string };
  };

  /** 常用阵型 | lineups */
  formations: Array<{ formation: string; played: number }>;
}

/**
 * 进球统计（含时段分布）
 */
export interface GoalStats {
  /** 总计 */
  total: { home: number; away: number; total: number };

  /** 场均 */
  average: { home: string; away: string; total: string };

  /** ⭐ 时段分布 - 75+进球率关键数据 | minute */
  byMinute: {
    '0-15': MinuteStats;
    '16-30': MinuteStats;
    '31-45': MinuteStats;
    '46-60': MinuteStats;
    '61-75': MinuteStats;
    '76-90': MinuteStats;  // ⭐ 75+分钟进球率
    '91-105'?: MinuteStats;
    '106-120'?: MinuteStats;
  };
}

/**
 * 单时段统计
 */
export interface MinuteStats {
  /** 进球数 */
  total: number | null;

  /** 百分比 (如 "15.5%") */
  percentage: string | null;
}

/**
 * 计算 75+ 分钟进球概率
 */
export function getLateGoalProbability(stats: TeamSeasonStatsCore): {
  for: number;      // 进球概率 (0-100)
  against: number;  // 失球概率 (0-100)
  combined: number; // 综合概率 (至少一方进球)
} {
  const parsePercentage = (p: string | null): number => {
    if (!p) return 0;
    return Number.parseFloat(p.replace('%', '')) || 0;
  };

  const forProb = parsePercentage(stats.goalsFor.byMinute['76-90'].percentage);
  const againstProb = parsePercentage(stats.goalsAgainst.byMinute['76-90'].percentage);

  // 至少一方进球的概率: 1 - (1 - forProb/100) * (1 - againstProb/100)
  const combined = (1 - (1 - forProb / 100) * (1 - againstProb / 100)) * 100;

  return {
    for: forProb,
    against: againstProb,
    combined: Math.round(combined * 10) / 10,
  };
}

// ============================================
// 第 8 部分：H2H 对战数据模型
// ============================================

/**
 * H2HCore - 历史对战
 *
 * 数据来源: GET /fixtures/headtohead?h2h={t1}-{t2}
 */
export interface H2HCore {
  /** 球队1 ID */
  team1Id: number;

  /** 球队2 ID */
  team2Id: number;

  /** 历史比赛列表 */
  matches: H2HMatch[];

  /** 统计汇总 */
  summary: H2HSummary;
}

/**
 * H2H 单场比赛
 */
export interface H2HMatch {
  /** 比赛ID */
  fixtureId: number;

  /** 比赛日期 */
  date: string;

  /** 联赛名 */
  leagueName: string;

  /** 主队ID */
  homeTeamId: number;

  /** 主队名 */
  homeTeamName: string;

  /** 客队ID */
  awayTeamId: number;

  /** 客队名 */
  awayTeamName: string;

  /** 主队进球 */
  homeGoals: number;

  /** 客队进球 */
  awayGoals: number;

  /** 总进球 */
  totalGoals: number;
}

/**
 * H2H 汇总统计
 */
export interface H2HSummary {
  /** 总比赛数 */
  totalMatches: number;

  /** 球队1胜场 */
  team1Wins: number;

  /** 平局 */
  draws: number;

  /** 球队2胜场 */
  team2Wins: number;

  /** 球队1总进球 */
  team1Goals: number;

  /** 球队2总进球 */
  team2Goals: number;

  /** 场均进球 */
  averageGoals: number;

  /** 75+分钟进球场次 */
  lateGoalMatches: number;

  /** 75+分钟进球比例 */
  lateGoalPercentage: number;
}

// ============================================
// 第 9 部分：联赛信息数据模型
// ============================================

/**
 * LeagueCore - 联赛信息
 *
 * 数据来源: GET /leagues
 */
export interface LeagueCore {
  /** 联赛ID */
  leagueId: number;

  /** 联赛名称 */
  name: string;

  /** 联赛类型 */
  type: 'league' | 'cup';

  /** Logo URL */
  logo: string;

  /** 国家 */
  country: {
    name: string;
    code: string | null;
    flag: string | null;
  };

  /** 当前赛季 */
  currentSeason: number | null;

  /** 数据覆盖范围 | coverage */
  coverage: {
    fixtures: {
      events: boolean;
      lineups: boolean;
      statisticsFixtures: boolean;
      statisticsPlayers: boolean;
    };
    standings: boolean;
    players: boolean;
    injuries: boolean;
    predictions: boolean;
    odds: boolean;  // ⭐ 是否有赔率数据
  };
}

// ============================================
// 第 10 部分：复合数据模型（用于前端展示）
// ============================================

/**
 * AdvancedMatchModel - 完整比赛数据（前端展示用）
 *
 * 这是聚合后的数据模型，整合多个端点的数据
 */
export interface AdvancedMatchModel {
  // ---- 基础信息 ----
  id: number;
  leagueId: number;
  leagueName: string;
  leagueShort: string;
  leagueLogo: string;
  leagueFlag?: string;
  round: string;

  // ---- 球队信息 ----
  home: {
    id: number;
    name: string;
    logo: string;
    score: number;
    rank?: number | null;
  };
  away: {
    id: number;
    name: string;
    logo: string;
    score: number;
    rank?: number | null;
  };

  // ---- 时间/状态 (来自 LiveCore) ----
  status: NormalizedStatus;
  minute: number;
  timestamp: number;

  // ---- 统计数据 (来自 LiveStatsCore) ----
  stats: {
    possession: { home: number; away: number };
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    corners: { home: number; away: number };
    xG: { home: number; away: number };
    fouls?: { home: number; away: number };
    dangerousAttacks?: { home: number; away: number };
    hasRealData: boolean;
  } | null;

  // ---- 赔率数据 (来自 OddsLiveCore / OddsPrematchCore) ----
  odds: {
    handicap: {
      home: number | null;
      value: number | null;  // 盘口线
      away: number | null;
      homeTrend: 'up' | 'down' | 'stable';
      awayTrend: 'up' | 'down' | 'stable';
    };
    overUnder: {
      over: number | null;
      total: number | null;  // 盘口线
      under: number | null;
      overTrend: 'up' | 'down' | 'stable';
      underTrend: 'up' | 'down' | 'stable';
      allLines?: Array<{ line: number; over: number | null; under: number | null; isMain: boolean }>;
    };
    matchWinner?: {
      home: number | null;
      draw: number | null;
      away: number | null;
    };
    source: 'live' | 'prematch' | null;
    fetchStatus: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FETCHED';
    bookmaker?: string;
    capturedAt?: string;
  } | null;

  // ---- 事件数据 (来自 LiveEventsCore) ----
  events?: MatchEventCore[];

  // ---- 换人信息 ----
  substitutions?: Array<{
    minute: number;
    playerIn: string;
    playerOut: string;
    team: 'home' | 'away';
    type: 'attack' | 'defense' | 'neutral';
  }>;

  // ---- 数据质量标记 ----
  dataQuality: 'REAL' | 'PARTIAL' | 'INVALID';
  unscoreable: boolean;
}

// ============================================
// 所有类型和函数已在定义时通过 export 导出
// ============================================
