// ============================================
// 高级比赛数据类型定义
// PRODUCTION STRICT MODE - 仅类型定义，无模拟数据
// Phase 2A: 添加数据验证标记
// ============================================

// 联赛颜色配置
export const LEAGUE_COLORS: Record<string, string> = {
  '英超': '#3d195b',
  '西甲': '#ee8707',
  '德甲': '#d4021d',
  '意甲': '#024494',
  '法甲': '#003189',
  '欧冠': '#1a1a2e',
  '欧联': '#f68e1e',
  '中超': '#b71c1c',
  '日职': '#1e88e5',
  '葡超': '#006400',
  '荷甲': '#ff6600',
  '默认': '#30363d',
};

// 进攻事件类型
export interface AttackEvent {
  minute: number;
  type: 'dangerous' | 'normal' | 'goal' | 'corner';
  team: 'home' | 'away';
}

// 换人信息
export interface Substitution {
  minute: number;
  playerIn: string;
  playerOut: string;
  playerInPosition?: string | null;  // 换上球员位置 (G/D/M/F)
  playerOutPosition?: string | null; // 换下球员位置
  type: 'attack' | 'defense' | 'neutral';
  team: 'home' | 'away';
}

// 牌况
export interface CardInfo {
  yellow: { home: number; away: number; players: string[] };
  red: { home: number; away: number; players: string[] };
}

// 单个 O/U 线信息
export interface OULineInfo {
  line: number;        // 盘口线 (1.5, 2.0, 2.25, 2.5, etc.)
  over: number | null; // 大球赔率
  under: number | null; // 小球赔率
  isMain: boolean;     // 是否为主盘口
}

// 盘口信息
export interface OddsInfo {
  handicap: {
    home: number | null;
    value: number | null;
    away: number | null;
    homeTrend: 'up' | 'down' | 'stable';
    awayTrend: 'up' | 'down' | 'stable';
  };
  overUnder: {
    over: number | null;
    total: number | null;
    under: number | null;
    overTrend: 'up' | 'down' | 'stable';
    underTrend: 'up' | 'down' | 'stable';
    // 所有可用的 O/U 线（用于悬停提示）
    allLines?: OULineInfo[];
  };
  // 胜平负（可选）
  matchWinner?: {
    home: number | null;
    draw: number | null;
    away: number | null;
  };
  // Phase 1.5: 赔率元数据
  _source?: 'API-Football' | 'GENERATED' | 'N/A' | string;
  _bookmaker?: string;
  _captured_at?: string | null;
  _is_live?: boolean;
  _fetch_status?: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FETCHED';
  // Phase 2A: 无数据原因
  _no_data_reason?: string;
}

// 历史进球分布
export interface GoalDistribution {
  periods: number[]; // 6个时段的进球概率 [0-15, 15-30, 30-45, 45-60, 60-75, 75-90]
}

// 比赛统计数据
export interface MatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  xG: { home: number; away: number };
  dangerousAttacks: { home: number; away: number };
  fouls?: { home: number; away: number };
  recentShots20min?: number; // 近20分钟总射门数（基于真实 events）

  // ============================================
  // STRICT REAL DATA MODE 标记
  // ============================================
  _realDataAvailable?: boolean; // 是否有真实统计数据
  _halfTimeIntensity?: { firstHalf: number; secondHalf: number } | null; // 上下半场射门分布
}

// 完整比赛数据
export interface AdvancedMatch {
  id: number;
  league: string;
  leagueShort: string;
  leagueId?: number;
  leagueLogo?: string;
  minute: number;
  status: 'live' | 'ht' | 'ft' | 'ns' | '1h' | '2h';

  home: {
    id?: number;
    name: string;
    logo?: string;
    rank?: number | null;
    score: number;
    handicap: number | null;  // Phase 2A: 允许 null
    // Phase 2A: 数据来源标记 (修复 #3: 支持 PREMATCH_API)
    _handicap_source?: 'API' | 'PREMATCH_API' | null;
  };

  away: {
    id?: number;
    name: string;
    logo?: string;
    rank?: number | null;
    score: number;
    overUnder?: number | null;  // Phase 2A: 允许 null
    // Phase 2A: 数据来源标记 (修复 #3: 支持 PREMATCH_API)
    _ou_source?: 'API' | 'PREMATCH_API' | null;
  };

  rating: number | string;
  ratingScore: number;
  attacks: AttackEvent[];
  pressure: 'home' | 'away' | 'neutral';
  substitutions: Substitution[];
  cards: CardInfo;
  odds: OddsInfo;
  corners: { home: number; away: number; recent5min: number | null } | null;
  goalHistory?: GoalDistribution | null;  // Phase 2A: 允许 null
  killScore: number;
  isWatched?: boolean;
  recentEvent?: 'goal' | 'red_card' | null;
  stats: MatchStats | null;
  scenarioTags?: string[];

  // 新增字段 (用于评分引擎)
  subsRemaining?: { home: number; away: number }; // 剩余换人名额
  recentAttackSubs?: number;   // 近5分钟攻击型换人数
  varCancelled?: boolean;      // VAR取消进球
  totalGoals?: number;         // 本场总进球数

  // ============================================
  // STRICT REAL DATA MODE 标记
  // ============================================
  _unscoreable?: boolean;      // 无法评分（缺少统计数据）
  _noStatsReason?: string;     // 无法评分原因

  // ============================================
  // Phase 2A: 数据验证结果
  // ============================================
  _validation?: {
    fixture_id: number;
    fixtures_real: boolean;
    stats_real: boolean;
    odds_real: boolean;
    events_real: boolean;
    data_quality: 'REAL' | 'PARTIAL' | 'INVALID';
    invalid_reasons: string[];
    validation_timestamp: string;
  };

  // ============================================
  // 额外字段（用于时间轴和历史记录）
  // ============================================
  events?: MatchEvent[];       // 比赛事件（进球、换人、牌等）
  kickoffTime?: string;        // 开赛时间 ISO 格式
  startTime?: string;          // 开赛时间（备用）
  homeTeamId?: number;         // 主队 ID（用于事件判断）
}

// 比赛事件类型
export interface MatchEvent {
  time?: { elapsed: number; extra?: number | null };
  minute?: number;
  team?: { id?: number; name?: string };
  teamSide?: 'home' | 'away';
  type: string;                // 'Goal', 'Card', 'subst', 'Var' 等
  detail?: string;             // 'Normal Goal', 'Yellow Card', 'Red Card' 等
  player?: { id?: number; name?: string };
  assist?: { id?: number; name?: string };
}

// ============================================
// PRODUCTION STRICT MODE: 不再导出任何 mock 数据生成函数
// 所有数据必须来自 API-Football
// ============================================
