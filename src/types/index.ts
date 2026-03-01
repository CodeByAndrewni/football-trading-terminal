// ============================================
// 足球交易决策终端 - 类型定义
// ============================================

// API-Football 基础类型
export interface Team {
  id: number;
  name: string;
  logo: string;
}

export interface League {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string;
  season: number;
  round?: string;
}

export interface Goals {
  home: number | null;
  away: number | null;
}

export interface Score {
  halftime: Goals;
  fulltime: Goals;
  extratime: Goals;
  penalty: Goals;
}

export interface FixtureStatus {
  long: string;
  short: string;
  elapsed: number | null;
}

export interface Fixture {
  id: number;
  referee: string | null;
  timezone: string;
  date: string;
  timestamp: number;
  periods: {
    first: number | null;
    second: number | null;
  };
  venue: {
    id: number;
    name: string;
    city: string;
  };
  status: FixtureStatus;
}

// 比赛完整数据
export interface Match {
  fixture: Fixture;
  league: League;
  teams: {
    home: Team;
    away: Team;
  };
  goals: Goals;
  score: Score;
}

// 比赛统计数据
export interface MatchStatistic {
  type: string;
  value: number | string | null;
}

export interface TeamStatistics {
  team: Team;
  statistics: MatchStatistic[];
}

// 比赛事件
export interface MatchEvent {
  time: {
    elapsed: number;
    extra: number | null;
  };
  team: Team;
  player: {
    id: number;
    name: string;
  };
  assist: {
    id: number | null;
    name: string | null;
  };
  type: 'Goal' | 'Card' | 'subst' | 'Var';
  detail: string;
  comments: string | null;
}

// 阵容
export interface Player {
  id: number;
  name: string;
  number: number;
  pos: string; // G = 门将, D = 后卫, M = 中场, F = 前锋
  grid: string | null;
}

export interface Lineup {
  team: Team;
  formation: string;
  startXI: { player: Player }[];
  substitutes: { player: Player }[];
  coach: {
    id: number;
    name: string;
    photo: string;
  };
}

// 球队赛季统计 (来自 /teams/statistics)
export interface TeamSeasonStats {
  team: Team;
  league: League;
  form: string; // "WWDLW"
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    for: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
      minute: GoalMinuteDistribution;
    };
    against: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
      minute: GoalMinuteDistribution;
    };
  };
  clean_sheet: { home: number; away: number; total: number };
  failed_to_score: { home: number; away: number; total: number };
  penalty: {
    scored: { total: number; percentage: string };
    missed: { total: number; percentage: string };
  };
  lineups: Array<{ formation: string; played: number }>;
  cards: {
    yellow: GoalMinuteDistribution;
    red: GoalMinuteDistribution;
  };
}

// 进球时段分布 (关键数据: 用于计算75+进球率)
export interface GoalMinuteDistribution {
  '0-15': { total: number | null; percentage: string | null };
  '16-30': { total: number | null; percentage: string | null };
  '31-45': { total: number | null; percentage: string | null };
  '46-60': { total: number | null; percentage: string | null };
  '61-75': { total: number | null; percentage: string | null };
  '76-90': { total: number | null; percentage: string | null };
  '91-105'?: { total: number | null; percentage: string | null };
  '106-120'?: { total: number | null; percentage: string | null };
}

// 80分钟后进球概率评分系统
export interface GoalProbabilityScore {
  matchId: number;
  timestamp: number;
  totalScore: number; // 0-100 综合评分
  factors: {
    momentum: number;        // 进攻势头 0-20
    shotPressure: number;    // 射门压力 0-20
    cornerPressure: number;  // 角球压力 0-15
    timeUrgency: number;     // 时间紧迫度 0-15
    scoreDifferential: number; // 比分差异影响 0-15
    recentGoals: number;     // 近期进球趋势 0-15
  };
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID';
  confidence: number; // 0-100
  alerts: string[];
}

// 角球分析
export interface CornerAnalysis {
  matchId: number;
  home: {
    total: number;
    firstHalf: number;
    secondHalf: number;
    last15Min: number;
  };
  away: {
    total: number;
    firstHalf: number;
    secondHalf: number;
    last15Min: number;
  };
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
  prediction: {
    nextCornerTeam: 'home' | 'away' | 'uncertain';
    probability: number;
    estimatedTime: number; // 分钟
  };
}

// 关注列表
export interface WatchlistItem {
  matchId: number;
  addedAt: number;
  notes?: string;
  alertThreshold?: number; // 触发预警的评分阈值
}

// 策略配置
export interface StrategyConfig {
  id: string;
  name: string;
  enabled: boolean;
  params: {
    minScore: number;
    minMinute: number;
    maxMinute: number;
    leagueIds?: number[];
    alertSound: boolean;
  };
}

// 用户设置
export interface UserSettings {
  watchlist: WatchlistItem[];
  strategies: StrategyConfig[];
  refreshInterval: number; // 秒
  soundEnabled: boolean;
  theme: 'dark'; // 仅支持暗色主题
}

// API 响应包装
export interface APIResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: string[];
  results: number;
  paging: {
    current: number;
    total: number;
  };
  response: T;
}

// 页面状态
export interface PageState {
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

// 路由参数
export interface MatchDetailParams {
  matchId: string;
}

// 大屏监控数据
export interface MonitorData {
  liveMatches: Match[];
  alerts: {
    matchId: number;
    type: 'GOAL' | 'HIGH_SCORE' | 'CORNER_SURGE';
    message: string;
    timestamp: number;
  }[];
  topOpportunities: GoalProbabilityScore[];
}

// ============================================
// 评分引擎相关类型
// ============================================

// 评分因子详情 (基于7大因子体系 - 含赔率因子)
export interface ScoringFactors {
  // 比分因子 (最高 +25)
  scoreFactor: {
    score: number;
    details: {
      isDraw: boolean;           // 平局 +18
      oneGoalDiff: boolean;      // 1球差距 +12
      twoGoalDiff: boolean;      // 2球差距 +5
      largeGap: boolean;         // 3球+ -10
      strongBehind: boolean;     // 强队落后 +15
      strongLeadByOne: boolean;  // 强队领先1球 +5
    };
  };

  // 进攻因子 (最高 +30)
  attackFactor: {
    score: number;
    details: {
      totalShots: number;        // 全场射门数
      shotsOnTarget: number;     // 射正数
      shotAccuracy: number;      // 射正率 %
      corners: number;           // 角球总数
      xgTotal: number;           // xG总和
      xgDebt: number;            // xG欠债 (xG - 实际进球)
    };
  };

  // 动量因子 (最高 +35) - 最重要！
  momentumFactor: {
    score: number;
    details: {
      recentShots: number;       // 近20分钟射门
      recentCorners: number;     // 近20分钟角球
      secondHalfIntensity: number; // 下半场vs上半场射门比
      losingTeamPossession: number; // 落后方近期控球率
      attackDensityChange: number; // 进攻密度变化
    };
  };

  // 历史因子 (最高 +25)
  historyFactor: {
    score: number;
    details: {
      homeTeam75PlusRate: number;  // 主队75+分钟进球率 %
      awayTeam75PlusRate: number;  // 客队75+分钟进球率 %
      h2h75PlusGoals: number;      // H2H近5场75+进球数
      leagueAvg75Plus: number;     // 联赛75+场均进球
      losingTeamComebackRate: number; // 落后方追分成功率 %
    };
  };

  // 特殊因子 (+/- 20)
  specialFactor: {
    score: number;
    details: {
      redCardAdvantage: boolean;   // 多一人进攻 +12
      highScoringMatch: boolean;   // 本场已有3+球 +8
      subsRemaining: boolean;      // 双方都有换人名额 +5
      recentAttackSub: boolean;    // 刚换上进攻球员 +6
      varCancelled: boolean;       // VAR取消进球 +5
      allSubsUsed: boolean;        // 双方都换满 -8
      tooManyFouls: boolean;       // 犯规过多 -5
      possessionStalemate: boolean; // 控球50-50僵持 -3
    };
  };

  // 赔率因子 (最高 +20) - 新增！
  oddsFactor?: {
    score: number;
    details: {
      handicapTightening: boolean;      // 让球盘收紧 +10
      overOddsDrop: boolean;            // 大球赔率急跌 +8
      multiBookmakerMovement: boolean;  // 多家同向变动 +12
      liveOddsShift: boolean;           // 临场变盘 +8
      oddsXgDivergence: boolean;        // 赔率与xG背离 +6
      handicapWidening: boolean;        // 让球盘放宽 -5
      goalExpectation: 'HIGH' | 'MEDIUM' | 'LOW'; // 市场进球预期
    };
    dataAvailable: boolean;             // 是否有赔率数据
  };
}

// 评分结果
export interface ScoreResult {
  totalScore: number;           // 总分 0-100+
  baseScore: number;            // 基础分 (30)
  factors: ScoringFactors;      // 各因子详情
  stars: number;                // 星级 1-5
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID';
  isStrongTeamBehind: boolean;  // 强队落后标记
  alerts: string[];             // 预警信息
  confidence: number;           // 置信度 (基于数据完整性)

  // ============================================
  // STRICT REAL DATA MODE 标记
  // ============================================
  _dataMode?: 'STRICT_REAL_DATA';  // 数据模式标记
}

// 评分等级
export interface ScoreLevel {
  min: number;
  label: string;
  color: string;
  emoji: string;
}

export const SCORE_LEVELS: ScoreLevel[] = [
  { min: 80, label: '极高概率', color: 'red', emoji: '🔴' },
  { min: 70, label: '高概率', color: 'orange', emoji: '🟠' },
  { min: 60, label: '中等概率', color: 'yellow', emoji: '🟡' },
  { min: 50, label: '一般概率', color: 'green', emoji: '🟢' },
  { min: 0, label: '低概率', color: 'gray', emoji: '⚪' },
];

// ============================================
// 赔率相关类型 (Odds)
// ============================================

// 单个赔率值
export interface OddValue {
  value: string;      // "Home", "Draw", "Away", "Over 2.5", etc.
  odd: string;        // "2.10", "3.40", etc.
}

// 盘口类型
export interface Bet {
  id: number;         // 盘口ID
  name: string;       // "Match Winner", "Goals Over/Under", etc.
  values: OddValue[];
}

// 博彩公司
export interface Bookmaker {
  id: number;
  name: string;       // "Bet365", "1xBet", etc.
  bets: Bet[];
}

// ============================================
// 赛前赔率响应 (Pre-match Odds)
// API: /odds?fixture={id}
// 结构: response[].bookmakers[].bets[].values[]
// ============================================
export interface OddsData {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
  };
  fixture: {
    id: number;
    timezone: string;
    date: string;
    timestamp: number;
  };
  update: string;     // 最后更新时间
  bookmakers: Bookmaker[];
}

// ============================================
// 滚球赔率响应 (Live Odds)
// API: /odds/live?fixture={id}
// 结构: response[].odds[].values[]
// 注意：结构与赛前赔率完全不同！
// ============================================

// 滚球赔率值
export interface LiveOddValue {
  value: string;        // "Over", "Under", "Home", "Away", "Draw"
  odd: string;          // "2.05"
  handicap?: string;    // "2.5", "-0.5" 等 (O/U 和 AH 使用)
  main?: boolean;       // 是否为主盘口
  suspended?: boolean;  // 是否暂停
}

// 滚球盘口
export interface LiveOddsBet {
  id: number;           // 盘口类型 ID (36=O/U, 33=AH, 59=1X2, etc.)
  name: string;         // "Over/Under", "Asian Handicap", "Match Winner"
  values: LiveOddValue[];
}

// 滚球赔率响应主体
export interface LiveOddsData {
  fixture: {
    id: number;
    status: {
      long: string;     // "Second Half", "First Half"
      elapsed: number | null;  // 比赛分钟
      seconds: string | null;  // "65:23"
    };
  };
  league: {
    id: number;
    season: number;
  };
  teams: {
    home: { id: number; goals: number };
    away: { id: number; goals: number };
  };
  status: {
    stopped: boolean;   // 是否暂停接受投注
    blocked: boolean;   // 是否封盘
    finished: boolean;  // 比赛是否结束
  };
  update: string;       // ISO 时间戳
  odds: LiveOddsBet[];  // 滚球赔率数组 (不是 bookmakers!)
}

// 滚球赔率盘口类型 ID
export const LIVE_BET_TYPE_IDS = {
  ASIAN_HANDICAP: 33,       // 亚洲让球
  OVER_UNDER_LINE: 36,      // 大小球
  FULLTIME_RESULT: 59,      // 全场胜平负
  MATCH_GOALS: 25,          // 总进球数
  BOTH_TEAMS_SCORE: 69,     // 双方进球
} as const;

// 常用盘口类型 ID
export const BET_TYPES = {
  MATCH_WINNER: 1,          // 胜平负
  HOME_AWAY: 2,             // 主/客
  DOUBLE_CHANCE: 11,        // 双重机会
  FIRST_HALF_WINNER: 12,    // 半场胜负
  GOALS_OVER_UNDER: 5,      // 大小球
  GOALS_OVER_UNDER_FIRST_HALF: 6, // 半场大小球
  BOTH_TEAMS_SCORE: 26,     // 双方都进球
  EXACT_SCORE: 10,          // 比分
  ASIAN_HANDICAP: 8,        // 亚洲让球
  CORNERS_OVER_UNDER: 16,   // 角球大小
  TOTAL_GOALS: 21,          // 总进球数
  ODD_EVEN: 27,             // 单双
  CARDS_OVER_UNDER: 25,     // 牌数大小
} as const;

// 赔率变化分析
export interface OddsMovement {
  bookmaker: string;
  betType: string;
  direction: 'UP' | 'DOWN' | 'STABLE';
  oldOdd: number;
  newOdd: number;
  changePercent: number;
  timestamp: number;
}

// 赔率分析结果 (用于评分引擎)
export interface OddsAnalysis {
  fixtureId: number;
  timestamp: number;

  // 胜平负赔率
  matchWinner: {
    home: number;
    draw: number;
    away: number;
    favorite: 'home' | 'away' | 'none';
  } | null;

  // 大小球赔率
  overUnder: {
    line: number;       // 2.5, 3.5, etc.
    over: number;
    under: number;
  } | null;

  // 亚洲让球
  asianHandicap: {
    line: number;       // -0.5, +0.5, -1, etc.
    home: number;
    away: number;
  } | null;

  // 双方进球
  bothTeamsScore: {
    yes: number;
    no: number;
  } | null;

  // 赔率变动
  movements: OddsMovement[];

  // 综合分析
  marketSentiment: 'HOME_FAVORED' | 'AWAY_FAVORED' | 'BALANCED';
  goalExpectation: 'HIGH' | 'MEDIUM' | 'LOW';

  // 异常检测
  anomalies: string[];
}

// 赔率因子 (评分引擎扩展)
export interface OddsFactor {
  score: number;            // 最高 +20
  details: {
    handicapTightening: boolean;      // 让球盘收紧 +10
    overOddsDrop: boolean;            // 大球赔率急跌 +8
    multiBookmakerMovement: boolean;  // 多家同向变动 +12
    liveOddsShift: boolean;           // 临场变盘 +8
    oddsXgDivergence: boolean;        // 赔率与xG背离 +6
    handicapWidening: boolean;        // 让球盘放宽 -5
  };
  confidence: number;       // 数据置信度 0-100
}

// ============================================
// 预测相关类型 (Predictions)
// ============================================

// 球队对比数据
export interface TeamComparison {
  name: string;
  logo: string;
  last_5: {
    form: string;       // "WWDLW"
    att: string;        // 进攻评级 "Good", "Average", "Poor"
    def: string;        // 防守评级
    goals: {
      for: { total: number; average: string };
      against: { total: number; average: string };
    };
  };
  league: {
    form: string;
    fixtures: { played: { total: number }; wins: { total: number }; draws: { total: number }; loses: { total: number } };
    goals: { for: { total: number }; against: { total: number } };
  };
}

// API 预测数据
export interface Prediction {
  predictions: {
    winner: {
      id: number;
      name: string;
      comment: string;    // "Win or Draw", "Win", etc.
    } | null;
    win_or_draw: boolean;
    under_over: string | null;  // "+3.5", "-2.5", etc.
    goals: {
      home: string;       // "-3.5", "+1.5"
      away: string;
    };
    advice: string;       // "Double chance : Manchester United or draw"
    percent: {
      home: string;       // "45%"
      draw: string;       // "25%"
      away: string;       // "30%"
    };
  };
  league: League;
  teams: {
    home: TeamComparison;
    away: TeamComparison;
  };
  comparison: {
    form: { home: string; away: string };         // "80%", "60%"
    att: { home: string; away: string };
    def: { home: string; away: string };
    poisson_distribution: { home: string; away: string };
    h2h: { home: string; away: string };
    goals: { home: string; away: string };
    total: { home: string; away: string };
  };
  h2h: Match[];  // 历史对战记录
}

// ============================================
// 积分榜相关类型 (Standings)
// ============================================

// 单支球队的排名数据
export interface StandingTeam {
  rank: number;
  team: Team;
  points: number;
  goalsDiff: number;
  group?: string;         // 小组 (杯赛)
  form: string;           // "WWDLW"
  status: string;         // "same", "up", "down"
  description: string | null;  // "Promotion", "Relegation", "Champions League"
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  home: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  away: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
  update: string;         // ISO date
}

// 联赛积分榜
export interface Standing {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    standings: StandingTeam[][];  // 二维数组 (支持分组)
  };
}

// ============================================
// 球员比赛统计类型 (Fixture Players)
// ============================================

// 球员比赛统计
export interface PlayerMatchStats {
  player: {
    id: number;
    name: string;
    photo: string;
  };
  statistics: Array<{
    games: {
      minutes: number | null;
      number: number;
      position: string;
      rating: string | null;
      captain: boolean;
      substitute: boolean;
    };
    offsides: number | null;
    shots: {
      total: number | null;
      on: number | null;
    };
    goals: {
      total: number | null;
      conceded: number | null;
      assists: number | null;
      saves: number | null;
    };
    passes: {
      total: number | null;
      key: number | null;
      accuracy: string | null;
    };
    tackles: {
      total: number | null;
      blocks: number | null;
      interceptions: number | null;
    };
    duels: {
      total: number | null;
      won: number | null;
    };
    dribbles: {
      attempts: number | null;
      success: number | null;
      past: number | null;
    };
    fouls: {
      drawn: number | null;
      committed: number | null;
    };
    cards: {
      yellow: number;
      red: number;
    };
    penalty: {
      won: number | null;
      committed: number | null;
      scored: number | null;
      missed: number | null;
      saved: number | null;
    };
  }>;
}

// 球队球员统计响应
export interface FixturePlayersResponse {
  team: Team;
  players: PlayerMatchStats[];
}

// ============================================
// 伤病信息类型 (Injuries)
// ============================================

export interface Injury {
  player: {
    id: number;
    name: string;
    photo: string;
    type: string;      // "Missing Fixture", "Questionable", etc.
    reason: string;    // "Injury", "Suspended", "International Duty"
  };
  team: Team;
  fixture: {
    id: number;
    timezone: string;
    date: string;
    timestamp: number;
  };
  league: League;
}

// ============================================
// 联赛信息类型 (Leagues)
// ============================================

export interface LeagueInfo {
  league: {
    id: number;
    name: string;
    type: 'league' | 'cup';
    logo: string;
  };
  country: {
    name: string;
    code: string | null;
    flag: string | null;
  };
  seasons: Array<{
    year: number;
    start: string;
    end: string;
    current: boolean;
    coverage: {
      fixtures: {
        events: boolean;
        lineups: boolean;
        statistics_fixtures: boolean;
        statistics_players: boolean;
      };
      standings: boolean;
      players: boolean;
      top_scorers: boolean;
      top_assists: boolean;
      top_cards: boolean;
      injuries: boolean;
      predictions: boolean;
      odds: boolean;
    };
  }>;
}

// 常用联赛 ID
export const POPULAR_LEAGUES = {
  // 欧洲五大联赛
  PREMIER_LEAGUE: 39,
  LA_LIGA: 140,
  SERIE_A: 135,
  BUNDESLIGA: 78,
  LIGUE_1: 61,
  // 其他热门
  CHAMPIONS_LEAGUE: 2,
  EUROPA_LEAGUE: 3,
  WORLD_CUP: 1,
  EURO: 4,
  EREDIVISIE: 88,
  PRIMEIRA_LIGA: 94,
  SUPER_LIG: 203,
  // 亚洲
  J_LEAGUE: 98,
  K_LEAGUE: 292,
  CSL: 169,
  // 美洲
  MLS: 253,
  BRASILEIRAO: 71,
  ARGENTINA_PRIMERA: 128,
} as const;

// ============================================================
// 统一评分框架类型导出
// ============================================================

export * from './unified-scoring';
