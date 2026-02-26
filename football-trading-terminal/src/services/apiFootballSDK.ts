// ============================================
// API-Football v3 完整SDK
// 所有端点的函数实现
// ============================================

import type {
  APIResponse,
  Match,
  TeamStatistics,
  MatchEvent,
  Lineup,
  TeamSeasonStats,
  OddsData,
  LiveOddsData,
  Prediction,
  Standing,
  FixturePlayersResponse,
  Injury,
  LeagueInfo,
} from '../types';

// ============================================
// 基础配置
// ============================================

const API_BASE_URL = 'https://v3.football.api-sports.io';

/** 缓存策略配置 */
export const CACHE_TTL = {
  LIVE_FIXTURES: 10 * 1000,        // 10秒 - 进行中比赛
  LIVE_ODDS: 10 * 1000,            // 10秒 - 滚球赔率
  FIXTURE_STATS: 30 * 1000,        // 30秒 - 比赛统计
  PREMATCH_ODDS: 5 * 60 * 1000,    // 5分钟 - 赛前赔率
  H2H: 5 * 60 * 1000,              // 5分钟 - 历史对战
  STANDINGS: 60 * 60 * 1000,       // 1小时 - 积分榜
  TEAM_STATS: 60 * 60 * 1000,      // 1小时 - 球队统计
  INJURIES: 60 * 60 * 1000,        // 1小时 - 伤病信息
  LEAGUES: 24 * 60 * 60 * 1000,    // 24小时 - 联赛信息
  BASIC_DATA: 7 * 24 * 60 * 60 * 1000, // 7天 - 基础数据
} as const;

// ============================================
// 类型定义
// ============================================

/** API响应错误 */
export interface APIError {
  status: number;
  message: string;
  code?: string;
}

/** 缓存条目 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/** 时区信息 */
export interface Timezone {
  timezone: string;
}

/** 国家信息 */
export interface Country {
  name: string;
  code: string | null;
  flag: string | null;
}

/** 赛季信息 */
export interface Season {
  year: number;
  start: string;
  end: string;
  current: boolean;
}

/** 球场信息 */
export interface Venue {
  id: number;
  name: string;
  address: string | null;
  city: string;
  country: string;
  capacity: number;
  surface: string;
  image: string;
}

/** 教练信息 */
export interface Coach {
  id: number;
  name: string;
  firstname: string;
  lastname: string;
  age: number;
  birth: {
    date: string;
    place: string | null;
    country: string | null;
  };
  nationality: string;
  height: string | null;
  weight: string | null;
  photo: string;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  career: Array<{
    team: { id: number; name: string; logo: string };
    start: string;
    end: string | null;
  }>;
}

/** 转会记录 */
export interface Transfer {
  player: {
    id: number;
    name: string;
  };
  update: string;
  transfers: Array<{
    date: string;
    type: string;
    teams: {
      in: { id: number; name: string; logo: string };
      out: { id: number; name: string; logo: string };
    };
  }>;
}

/** 奖杯记录 */
export interface Trophy {
  league: string;
  country: string;
  season: string;
  place: string;
}

/** 缺阵记录 */
export interface Sidelined {
  type: string;
  start: string;
  end: string | null;
}

/** 博彩公司 */
export interface Bookmaker {
  id: number;
  name: string;
}

/** 盘口类型 */
export interface BetType {
  id: number;
  name: string;
}

/** 盘口映射 */
export interface OddsMapping {
  league: { id: number; name: string; country: string };
  fixture: { id: number; date: string };
  update: string;
}

/** 球员信息 */
export interface Player {
  id: number;
  name: string;
  firstname: string;
  lastname: string;
  age: number;
  birth: {
    date: string;
    place: string | null;
    country: string | null;
  };
  nationality: string;
  height: string | null;
  weight: string | null;
  injured: boolean;
  photo: string;
  statistics: Array<{
    team: { id: number; name: string; logo: string };
    league: { id: number; name: string; country: string; logo: string; flag: string; season: number };
    games: {
      appearences: number | null;
      lineups: number | null;
      minutes: number | null;
      number: number | null;
      position: string;
      rating: string | null;
      captain: boolean;
    };
    substitutes: { in: number | null; out: number | null; bench: number | null };
    shots: { total: number | null; on: number | null };
    goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
    passes: { total: number | null; key: number | null; accuracy: number | null };
    tackles: { total: number | null; blocks: number | null; interceptions: number | null };
    duels: { total: number | null; won: number | null };
    dribbles: { attempts: number | null; success: number | null; past: number | null };
    fouls: { drawn: number | null; committed: number | null };
    cards: { yellow: number; yellowred: number; red: number };
    penalty: {
      won: number | null;
      commited: number | null;
      scored: number | null;
      missed: number | null;
      saved: number | null;
    };
  }>;
}

/** 球队阵容 */
export interface Squad {
  team: { id: number; name: string; logo: string };
  players: Array<{
    id: number;
    name: string;
    age: number;
    number: number | null;
    position: string;
    photo: string;
  }>;
}

/** 射手榜/助攻榜球员 */
export interface TopPlayer {
  player: {
    id: number;
    name: string;
    firstname: string;
    lastname: string;
    age: number;
    birth: { date: string; place: string | null; country: string | null };
    nationality: string;
    height: string | null;
    weight: string | null;
    injured: boolean;
    photo: string;
  };
  statistics: Array<{
    team: { id: number; name: string; logo: string };
    league: { id: number; name: string; country: string; logo: string; flag: string; season: number };
    games: { appearences: number | null; lineups: number | null; minutes: number | null; };
    goals: { total: number | null; assists: number | null };
    cards: { yellow: number; red: number };
  }>;
}

/** 联赛轮次 */
export interface Round {
  round: string;
}

// ============================================
// 内存缓存
// ============================================

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * 获取缓存数据
 * @param key 缓存键
 * @returns 缓存数据或null
 */
function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

/**
 * 设置缓存数据
 * @param key 缓存键
 * @param data 数据
 * @param ttl 过期时间(毫秒)
 */
function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

/**
 * 清除所有缓存
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * 获取缓存统计
 */
export function getCacheStatistics(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

// ============================================
// 错误处理
// ============================================

/**
 * API错误类
 */
export class ApiFootballError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiFootballError';
  }
}

/**
 * 处理API错误响应
 */
function handleApiError(response: Response, data?: { errors?: Record<string, string> }): never {
  if (response.status === 401) {
    throw new ApiFootballError(401, 'API Key 无效或已过期', 'INVALID_API_KEY');
  }
  if (response.status === 429) {
    throw new ApiFootballError(429, 'API 请求次数已达上限', 'RATE_LIMIT_EXCEEDED');
  }
  if (data?.errors && Object.keys(data.errors).length > 0) {
    const errorMsg = Object.values(data.errors).join(', ');
    throw new ApiFootballError(400, errorMsg, 'API_ERROR');
  }
  throw new ApiFootballError(response.status, `API 请求失败: ${response.statusText}`, 'REQUEST_FAILED');
}

// ============================================
// 基础请求函数
// ============================================

/**
 * 通用API请求函数(直接调用API-Football)
 * @param endpoint API端点
 * @param params 查询参数
 * @returns API响应
 */
async function fetchAPI<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<APIResponse<T>> {
  const apiKey = import.meta.env.VITE_FOOTBALL_API_KEY || process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    throw new ApiFootballError(500, 'API Key 未配置', 'NO_API_KEY');
  }

  const url = new URL(`${API_BASE_URL}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-apisports-key': apiKey,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    handleApiError(response, data);
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    handleApiError(response, data);
  }

  return data;
}

/**
 * 通过本地代理请求API(用于前端调用)
 * @param path 本地API路径
 * @returns API响应
 */
async function fetchLocalAPI<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    handleApiError(response, errorData);
  }

  return response.json();
}

// ============================================
// P0: Fixtures 端点 (比赛核心数据)
// ============================================

/**
 * 获取所有进行中的比赛
 * @description 返回当前正在进行的所有足球比赛，包含实时比分和状态
 * @returns 进行中比赛列表
 * @example
 * const liveMatches = await getLiveFixtures();
 * // 用于: 实时监控滚球机会，获取比分、时间、状态
 */
export async function getLiveFixtures(): Promise<Match[]> {
  const cacheKey = 'fixtures:live';
  const cached = getCache<Match[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<Match[]>>('/api/football/fixtures?live=all');
  setCache(cacheKey, data.response, CACHE_TTL.LIVE_FIXTURES);
  return data.response;
}

/**
 * 获取单场比赛详情
 * @description 获取指定比赛的完整信息，包括球队、比分、状态等
 * @param fixtureId 比赛ID
 * @returns 比赛详情
 * @example
 * const match = await getFixtureById(1035034);
 * // 用于: 获取单场比赛的详细信息用于分析
 */
export async function getFixtureById(fixtureId: number): Promise<Match | null> {
  const data = await fetchLocalAPI<APIResponse<Match[]>>(`/api/football/fixtures?id=${fixtureId}`);
  return data.response?.[0] || null;
}

/**
 * 获取指定日期的比赛
 * @description 获取某一天的所有比赛，用于赛程浏览
 * @param date 日期 (YYYY-MM-DD格式)
 * @returns 比赛列表
 * @example
 * const todayMatches = await getFixturesByDate('2024-01-15');
 * // 用于: 赛程展示、今日比赛预览
 */
export async function getFixturesByDate(date: string): Promise<Match[]> {
  const cacheKey = `fixtures:date:${date}`;
  const cached = getCache<Match[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Match[]>('/fixtures', { date });
  setCache(cacheKey, data.response, CACHE_TTL.H2H);
  return data.response;
}

/**
 * 获取联赛赛季比赛
 * @description 获取指定联赛指定赛季的所有比赛
 * @param leagueId 联赛ID
 * @param season 赛季年份
 * @returns 比赛列表
 * @example
 * const plMatches = await getFixturesByLeague(39, 2023);
 * // 用于: 联赛历史数据分析、模型训练数据收集
 */
export async function getFixturesByLeague(leagueId: number, season: number): Promise<Match[]> {
  const cacheKey = `fixtures:league:${leagueId}:${season}`;
  const cached = getCache<Match[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Match[]>('/fixtures', { league: leagueId, season });
  setCache(cacheKey, data.response, CACHE_TTL.STANDINGS);
  return data.response;
}

/**
 * 获取比赛统计数据
 * @description 获取比赛的实时统计，包括射门、角球、控球率、xG等
 * @param fixtureId 比赛ID
 * @returns 双方球队统计数据
 * @example
 * const stats = await getFixtureStatistics(1035034);
 * // 用于: 进攻因子评分、xG欠债检测、动量分析
 */
export async function getFixtureStatistics(fixtureId: number): Promise<TeamStatistics[]> {
  const cacheKey = `statistics:${fixtureId}`;
  const cached = getCache<TeamStatistics[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TeamStatistics[]>('/fixtures/statistics', { fixture: fixtureId });
  setCache(cacheKey, data.response, CACHE_TTL.FIXTURE_STATS);
  return data.response;
}

/**
 * 获取比赛事件
 * @description 获取比赛的所有事件(进球、红黄牌、换人、VAR等)
 * @param fixtureId 比赛ID
 * @returns 事件列表
 * @example
 * const events = await getFixtureEvents(1035034);
 * // 用于: 进球时间分析、红牌检测、换人策略分析、VAR影响评估
 */
export async function getFixtureEvents(fixtureId: number): Promise<MatchEvent[]> {
  const cacheKey = `events:${fixtureId}`;
  const cached = getCache<MatchEvent[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<MatchEvent[]>('/fixtures/events', { fixture: fixtureId });
  setCache(cacheKey, data.response, CACHE_TTL.FIXTURE_STATS);
  return data.response;
}

/**
 * 获取比赛阵容
 * @description 获取比赛的首发阵容、替补球员和阵型
 * @param fixtureId 比赛ID
 * @returns 双方阵容数据
 * @example
 * const lineups = await getFixtureLineups(1035034);
 * // 用于: 阵型分析、关键球员监控、换人预测、位置可视化
 */
export async function getFixtureLineups(fixtureId: number): Promise<Lineup[]> {
  const cacheKey = `lineups:${fixtureId}`;
  const cached = getCache<Lineup[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Lineup[]>('/fixtures/lineups', { fixture: fixtureId });
  setCache(cacheKey, data.response, CACHE_TTL.FIXTURE_STATS);
  return data.response;
}

/**
 * 获取比赛球员统计
 * @description 获取单场比赛中每个球员的详细表现数据
 * @param fixtureId 比赛ID
 * @returns 球员统计数据
 * @example
 * const players = await getFixturePlayers(1035034);
 * // 用于: 球员评分追踪、关键传球分析、射门分布、点球数据
 */
export async function getFixturePlayers(fixtureId: number): Promise<FixturePlayersResponse[]> {
  const cacheKey = `players:fixture:${fixtureId}`;
  const cached = getCache<FixturePlayersResponse[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<FixturePlayersResponse[]>>(
    `/api/football/teams?type=players&fixture=${fixtureId}`
  );
  setCache(cacheKey, data.response, CACHE_TTL.FIXTURE_STATS);
  return data.response;
}

/**
 * 获取历史对战记录
 * @description 获取两支球队的历史交锋记录
 * @param team1Id 球队1 ID
 * @param team2Id 球队2 ID
 * @param last 最近N场 (默认10场)
 * @returns 历史比赛列表
 * @example
 * const h2h = await getHeadToHead(33, 40, 10);
 * // 用于: H2H进球模式分析、75+分钟进球频率、心理因素评估
 */
export async function getHeadToHead(
  team1Id: number,
  team2Id: number,
  last = 10
): Promise<Match[]> {
  const cacheKey = `h2h:${team1Id}:${team2Id}:${last}`;
  const cached = getCache<Match[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<Match[]>>(
    `/api/football/teams?type=h2h&team1=${team1Id}&team2=${team2Id}&last=${last}`
  );
  setCache(cacheKey, data.response, CACHE_TTL.H2H);
  return data.response;
}

/**
 * 获取联赛轮次
 * @description 获取联赛的所有轮次名称
 * @param leagueId 联赛ID
 * @param season 赛季年份
 * @param current 是否只返回当前轮次
 * @returns 轮次列表
 * @example
 * const rounds = await getFixtureRounds(39, 2023);
 * // 用于: 赛程导航、收官阶段检测、密集赛程识别
 */
export async function getFixtureRounds(
  leagueId: number,
  season: number,
  current = false
): Promise<string[]> {
  const cacheKey = `rounds:${leagueId}:${season}:${current}`;
  const cached = getCache<string[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<string[]>('/fixtures/rounds', {
    league: leagueId,
    season,
    current: current ? 'true' : undefined,
  });
  setCache(cacheKey, data.response, CACHE_TTL.STANDINGS);
  return data.response;
}

// ============================================
// P1: Odds 端点 (赔率数据)
// ============================================

/**
 * 获取赛前赔率
 * @description 获取比赛的赛前赔率数据，包含多家博彩公司的各类盘口
 * @param fixtureId 比赛ID
 * @param options 可选参数
 * @returns 赔率数据
 * @example
 * const odds = await getPrematchOdds(1035034);
 * // 用于: 强队判断、市场进球预期、让球盘分析、临场变盘检测
 */
export async function getPrematchOdds(
  fixtureId: number,
  options?: { bookmaker?: number; bet?: number }
): Promise<OddsData[]> {
  const cacheKey = `odds:prematch:${fixtureId}:${options?.bookmaker || ''}:${options?.bet || ''}`;
  const cached = getCache<OddsData[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams();
  params.append('fixture', fixtureId.toString());
  if (options?.bookmaker) params.append('bookmaker', options.bookmaker.toString());
  if (options?.bet) params.append('bet', options.bet.toString());

  const data = await fetchLocalAPI<APIResponse<OddsData[]>>(
    `/api/football/odds?${params.toString()}`
  );
  setCache(cacheKey, data.response, CACHE_TTL.PREMATCH_ODDS);
  return data.response;
}

/**
 * 获取滚球赔率
 * @description 获取进行中比赛的实时赔率数据
 * @param fixtureId 比赛ID
 * @param options 可选参数
 * @returns 实时赔率数据
 * @example
 * const liveOdds = await getLiveOdds(1035034);
 * // 用于: 赔率变动追踪、封盘检测、Smart Money追踪、进球信号识别
 */
export async function getLiveOdds(
  fixtureId: number,
  options?: { bet?: number }
): Promise<LiveOddsData[]> {
  // 滚球赔率不缓存，需要实时数据
  const params = new URLSearchParams();
  params.append('fixture', fixtureId.toString());
  params.append('live', 'true');
  if (options?.bet) params.append('bet', options.bet.toString());

  const data = await fetchLocalAPI<APIResponse<LiveOddsData[]>>(
    `/api/football/odds?${params.toString()}`
  );
  return data.response;
}

/**
 * 获取所有进行中比赛的滚球赔率
 * @description 一次性获取所有正在进行比赛的实时赔率
 * @returns 所有比赛的实时赔率
 * @example
 * const allLiveOdds = await getAllLiveOdds();
 * // 用于: 批量监控所有比赛的赔率变化
 */
export async function getAllLiveOdds(): Promise<LiveOddsData[]> {
  const data = await fetchAPI<LiveOddsData[]>('/odds/live');
  return data.response;
}

/**
 * 获取盘口映射表
 * @description 获取所有盘口类型与博彩公司的覆盖关系
 * @param page 页码
 * @returns 盘口映射列表
 * @example
 * const mapping = await getOddsMapping();
 * // 用于: 了解哪些联赛/博彩公司有数据、盘口类型字典
 */
export async function getOddsMapping(page = 1): Promise<OddsMapping[]> {
  const cacheKey = `odds:mapping:${page}`;
  const cached = getCache<OddsMapping[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<OddsMapping[]>('/odds/mapping', { page });
  setCache(cacheKey, data.response, CACHE_TTL.LEAGUES);
  return data.response;
}

/**
 * 获取博彩公司列表
 * @description 获取所有支持的博彩公司及其ID
 * @param options 可选筛选参数
 * @returns 博彩公司列表
 * @example
 * const bookmakers = await getBookmakers();
 * // 用于: 数据源选择、优先级配置、博彩公司对比
 */
export async function getBookmakers(
  options?: { id?: number; search?: string }
): Promise<Bookmaker[]> {
  const cacheKey = `bookmakers:${options?.id || ''}:${options?.search || ''}`;
  const cached = getCache<Bookmaker[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Bookmaker[]>('/odds/bookmakers', options);
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

/**
 * 获取盘口类型列表
 * @description 获取所有可用的盘口类型及其ID
 * @param options 可选筛选参数
 * @returns 盘口类型列表
 * @example
 * const bets = await getBetTypes();
 * // 用于: 了解所有可用盘口类型、ID与名称映射
 */
export async function getBetTypes(
  options?: { id?: number; search?: string }
): Promise<BetType[]> {
  const cacheKey = `bets:${options?.id || ''}:${options?.search || ''}`;
  const cached = getCache<BetType[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<BetType[]>('/odds/bets', options);
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

// ============================================
// P2: Teams & Standings 端点 (球队/联赛数据)
// ============================================

/**
 * 获取联赛积分榜
 * @description 获取联赛的完整积分榜数据
 * @param leagueId 联赛ID
 * @param season 赛季年份 (可选)
 * @returns 积分榜数据
 * @example
 * const standings = await getStandings(39, 2023);
 * // 用于: 强弱队判断、近期状态分析、保级/争冠压力评估
 */
export async function getStandings(
  leagueId: number,
  season?: number
): Promise<Standing | null> {
  const currentSeason = season || new Date().getFullYear();
  const cacheKey = `standings:${leagueId}:${currentSeason}`;
  const cached = getCache<Standing>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<Standing[]>>(
    `/api/football/data?type=standings&league=${leagueId}&season=${currentSeason}`
  );
  const standing = data.response?.[0] || null;
  if (standing) {
    setCache(cacheKey, standing, CACHE_TTL.STANDINGS);
  }
  return standing;
}

/**
 * 获取球队信息
 * @description 获取球队基本信息和主场信息
 * @param options 筛选参数
 * @returns 球队列表
 * @example
 * const teams = await getTeams({ id: 33 });
 * // 用于: UI展示、主场信息、球队搜索
 */
export async function getTeams(
  options?: { id?: number; name?: string; league?: number; season?: number; country?: string; search?: string }
): Promise<Array<{ team: { id: number; name: string; code: string; country: string; founded: number; national: boolean; logo: string }; venue: Venue }>> {
  const cacheKey = `teams:${JSON.stringify(options)}`;
  const cached = getCache<Array<{ team: { id: number; name: string; code: string; country: string; founded: number; national: boolean; logo: string }; venue: Venue }>>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Array<{ team: { id: number; name: string; code: string; country: string; founded: number; national: boolean; logo: string }; venue: Venue }>>('/teams', options);
  setCache(cacheKey, data.response, CACHE_TTL.LEAGUES);
  return data.response;
}

/**
 * 获取球队赛季统计
 * @description 获取球队在指定联赛赛季的完整统计数据，包含进球时段分布
 * @param teamId 球队ID
 * @param leagueId 联赛ID
 * @param season 赛季年份 (可选)
 * @returns 球队统计数据
 * @example
 * const stats = await getTeamStatistics(33, 39, 2023);
 * // 用于: 75+进球率计算、主客场差异分析、零封能力评估、历史因子
 */
export async function getTeamStatistics(
  teamId: number,
  leagueId: number,
  season?: number
): Promise<TeamSeasonStats | null> {
  const currentSeason = season || new Date().getFullYear();
  const cacheKey = `team-stats:${teamId}:${leagueId}:${currentSeason}`;
  const cached = getCache<TeamSeasonStats>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<{ response: TeamSeasonStats }>(
    `/api/football/data?type=team-stats&team=${teamId}&league=${leagueId}&season=${currentSeason}`
  );
  const stats = data.response || null;
  if (stats) {
    setCache(cacheKey, stats, CACHE_TTL.TEAM_STATS);
  }
  return stats;
}

/**
 * 获取球队参赛赛季列表
 * @description 获取球队参与过的所有赛季年份
 * @param teamId 球队ID
 * @returns 赛季年份列表
 * @example
 * const seasons = await getTeamSeasons(33);
 * // 用于: 了解球队历史数据可用范围
 */
export async function getTeamSeasons(teamId: number): Promise<number[]> {
  const cacheKey = `team-seasons:${teamId}`;
  const cached = getCache<number[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<number[]>('/teams/seasons', { team: teamId });
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

/**
 * 获取联赛信息
 * @description 获取联赛基本信息和数据覆盖范围
 * @param options 筛选参数
 * @returns 联赛列表
 * @example
 * const leagues = await getLeagues({ current: true });
 * // 用于: 联赛筛选、数据可用性检测、当前赛季联赛
 */
export async function getLeagues(
  options?: { id?: number; name?: string; country?: string; type?: 'league' | 'cup'; season?: number; current?: boolean; search?: string }
): Promise<LeagueInfo[]> {
  const cacheKey = `leagues:${JSON.stringify(options)}`;
  const cached = getCache<LeagueInfo[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<LeagueInfo[]>>(
    `/api/football/leagues?${new URLSearchParams(
      Object.entries(options || {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString()}`
  );
  setCache(cacheKey, data.response, CACHE_TTL.LEAGUES);
  return data.response;
}

// ============================================
// P3: Players 端点 (球员数据)
// ============================================

/**
 * 获取球员信息和统计
 * @description 获取球员的详细信息和各赛季统计数据
 * @param options 筛选参数
 * @returns 球员列表
 * @example
 * const players = await getPlayers({ team: 33, season: 2023 });
 * // 用于: 关键球员识别、伤病后复出评估、转会新援历史数据
 */
export async function getPlayers(
  options: { id?: number; team?: number; league?: number; season: number; search?: string; page?: number }
): Promise<Player[]> {
  const cacheKey = `players:${JSON.stringify(options)}`;
  const cached = getCache<Player[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Player[]>('/players', options);
  setCache(cacheKey, data.response, CACHE_TTL.TEAM_STATS);
  return data.response;
}

/**
 * 获取球队当前阵容
 * @description 获取球队的完整阵容名单
 * @param teamId 球队ID
 * @returns 阵容数据
 * @example
 * const squad = await getSquad(33);
 * // 用于: 阵容完整性检测、位置分布分析、转会检测
 */
export async function getSquad(teamId: number): Promise<Squad[]> {
  const cacheKey = `squad:${teamId}`;
  const cached = getCache<Squad[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Squad[]>('/players/squads', { team: teamId });
  setCache(cacheKey, data.response, CACHE_TTL.TEAM_STATS);
  return data.response;
}

/**
 * 获取联赛射手榜
 * @description 获取联赛赛季的前20名射手
 * @param leagueId 联赛ID
 * @param season 赛季年份
 * @returns 射手榜
 * @example
 * const scorers = await getTopScorers(39, 2023);
 * // 用于: 进球概率评估、关键射手追踪
 */
export async function getTopScorers(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topscorers:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topscorers', { league: leagueId, season });
  setCache(cacheKey, data.response, CACHE_TTL.TEAM_STATS);
  return data.response;
}

/**
 * 获取联赛助攻榜
 * @description 获取联赛赛季的前20名助攻手
 * @param leagueId 联赛ID
 * @param season 赛季年份
 * @returns 助攻榜
 * @example
 * const assists = await getTopAssists(39, 2023);
 * // 用于: 识别创造机会最多的球员
 */
export async function getTopAssists(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topassists:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topassists', { league: leagueId, season });
  setCache(cacheKey, data.response, CACHE_TTL.TEAM_STATS);
  return data.response;
}

/**
 * 获取联赛黄牌榜
 * @description 获取联赛赛季的黄牌排行榜
 * @param leagueId 联赛ID
 * @param season 赛季年份
 * @returns 黄牌榜
 * @example
 * const yellowCards = await getTopYellowCards(39, 2023);
 * // 用于: 停赛风险评估、纪律问题球员识别
 */
export async function getTopYellowCards(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topyellowcards:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topyellowcards', { league: leagueId, season });
  setCache(cacheKey, data.response, CACHE_TTL.TEAM_STATS);
  return data.response;
}

/**
 * 获取联赛红牌榜
 * @description 获取联赛赛季的红牌排行榜
 * @param leagueId 联赛ID
 * @param season 赛季年份
 * @returns 红牌榜
 * @example
 * const redCards = await getTopRedCards(39, 2023);
 * // 用于: 红牌风险评估、识别历史红牌多的球员
 */
export async function getTopRedCards(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topredcards:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topredcards', { league: leagueId, season });
  setCache(cacheKey, data.response, CACHE_TTL.TEAM_STATS);
  return data.response;
}

// ============================================
// P4: 其他端点 (辅助数据)
// ============================================

/**
 * 获取伤病信息
 * @description 获取球员伤病和停赛信息
 * @param options 筛选参数
 * @returns 伤病列表
 * @example
 * const injuries = await getInjuries({ team: 33 });
 * // 用于: 关键球员缺阵评估、阵容深度分析、复出预期
 */
export async function getInjuries(
  options: { team?: number; league?: number; fixture?: number; player?: number; season?: number }
): Promise<Injury[]> {
  const cacheKey = `injuries:${JSON.stringify(options)}`;
  const cached = getCache<Injury[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<Injury[]>>(
    `/api/football/teams?type=injuries&${new URLSearchParams(
      Object.entries(options)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString()}`
  );
  setCache(cacheKey, data.response, CACHE_TTL.INJURIES);
  return data.response;
}

/**
 * 获取官方预测
 * @description 获取API官方的比赛预测数据
 * @param fixtureId 比赛ID
 * @returns 预测数据
 * @example
 * const prediction = await getPredictions(1035034);
 * // 用于: 辅助参考(不应过度依赖)，包含胜率、建议、H2H
 */
export async function getPredictions(fixtureId: number): Promise<Prediction | null> {
  const cacheKey = `predictions:${fixtureId}`;
  const cached = getCache<Prediction>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<Prediction[]>>(
    `/api/football/data?type=predictions&fixture=${fixtureId}`
  );
  const prediction = data.response?.[0] || null;
  if (prediction) {
    setCache(cacheKey, prediction, CACHE_TTL.H2H);
  }
  return prediction;
}

/**
 * 获取教练信息
 * @description 获取教练的详细信息和执教历史
 * @param options 筛选参数
 * @returns 教练列表
 * @example
 * const coach = await getCoachs({ team: 33 });
 * // 用于: 新帅效应分析、战术风格评估、大赛经验
 */
export async function getCoachs(
  options?: { id?: number; team?: number; search?: string }
): Promise<Coach[]> {
  const cacheKey = `coachs:${JSON.stringify(options)}`;
  const cached = getCache<Coach[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Coach[]>('/coachs', options);
  setCache(cacheKey, data.response, CACHE_TTL.LEAGUES);
  return data.response;
}

/**
 * 获取转会记录
 * @description 获取球员或球队的转会历史
 * @param options 筛选参数
 * @returns 转会记录列表
 * @example
 * const transfers = await getTransfers({ team: 33 });
 * // 用于: 新援磨合期评估、阵容变化分析
 */
export async function getTransfers(
  options: { player?: number; team?: number }
): Promise<Transfer[]> {
  const cacheKey = `transfers:${JSON.stringify(options)}`;
  const cached = getCache<Transfer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Transfer[]>('/transfers', options);
  setCache(cacheKey, data.response, CACHE_TTL.LEAGUES);
  return data.response;
}

/**
 * 获取奖杯荣誉
 * @description 获取球员或教练的奖杯记录
 * @param options 筛选参数
 * @returns 奖杯列表
 * @example
 * const trophies = await getTrophies({ player: 276 });
 * // 用于: 大赛经验评估、心理优势分析
 */
export async function getTrophies(
  options: { player?: number; coach?: number }
): Promise<Trophy[]> {
  const cacheKey = `trophies:${JSON.stringify(options)}`;
  const cached = getCache<Trophy[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Trophy[]>('/trophies', options);
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

/**
 * 获取缺阵记录
 * @description 获取球员的历史缺阵记录(伤病/停赛)
 * @param options 筛选参数
 * @returns 缺阵记录列表
 * @example
 * const sidelined = await getSidelined({ player: 276 });
 * // 用于: 伤病规律分析、反复受伤球员识别
 */
export async function getSidelined(
  options: { player?: number; coach?: number }
): Promise<Sidelined[]> {
  const cacheKey = `sidelined:${JSON.stringify(options)}`;
  const cached = getCache<Sidelined[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Sidelined[]>('/sidelined', options);
  setCache(cacheKey, data.response, CACHE_TTL.INJURIES);
  return data.response;
}

/**
 * 获取球场信息
 * @description 获取球场的详细信息
 * @param options 筛选参数
 * @returns 球场列表
 * @example
 * const venues = await getVenues({ id: 556 });
 * // 用于: 主场优势量化、场地类型影响、UI展示
 */
export async function getVenues(
  options?: { id?: number; name?: string; city?: string; country?: string; search?: string }
): Promise<Venue[]> {
  const cacheKey = `venues:${JSON.stringify(options)}`;
  const cached = getCache<Venue[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Venue[]>('/venues', options);
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

/**
 * 获取时区列表
 * @description 获取所有可用的时区
 * @returns 时区列表
 * @example
 * const timezones = await getTimezones();
 * // 用于: 时间标准化、时区转换
 */
export async function getTimezones(): Promise<string[]> {
  const cacheKey = 'timezones';
  const cached = getCache<string[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<string[]>('/timezone');
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

/**
 * 获取国家列表
 * @description 获取所有国家及其代码
 * @param options 筛选参数
 * @returns 国家列表
 * @example
 * const countries = await getCountries();
 * // 用于: 数据关联、国家筛选
 */
export async function getCountries(
  options?: { name?: string; code?: string; search?: string }
): Promise<Country[]> {
  const cacheKey = `countries:${JSON.stringify(options)}`;
  const cached = getCache<Country[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Country[]>('/countries', options);
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

/**
 * 获取赛季列表
 * @description 获取所有可用的赛季年份
 * @returns 赛季年份列表
 * @example
 * const seasons = await getSeasons();
 * // 用于: 历史数据范围确定
 */
export async function getSeasons(): Promise<number[]> {
  const cacheKey = 'seasons';
  const cached = getCache<number[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<number[]>('/seasons');
  setCache(cacheKey, data.response, CACHE_TTL.BASIC_DATA);
  return data.response;
}

// ============================================
// 导出常用ID常量
// ============================================

/** 常用博彩公司ID */
export const BOOKMAKER_IDS = {
  PINNACLE: 1,
  UNIBET: 3,
  BWIN: 6,
  BET365: 8,
  ONE_XBET: 11,
} as const;

/** 常用盘口类型ID (赛前) */
export const BET_TYPE_IDS = {
  MATCH_WINNER: 1,
  HOME_AWAY: 2,
  GOALS_OVER_UNDER: 5,
  GOALS_OVER_UNDER_FIRST_HALF: 6,
  ASIAN_HANDICAP: 8,
  EXACT_SCORE: 10,
  DOUBLE_CHANCE: 11,
  FIRST_HALF_WINNER: 12,
  CORNERS_OVER_UNDER: 16,
  TOTAL_GOALS: 21,
  BOTH_TEAMS_SCORE: 26,
  ODD_EVEN: 27,
} as const;

/** 滚球盘口类型ID */
export const LIVE_BET_TYPE_IDS = {
  ASIAN_HANDICAP: 33,
  OVER_UNDER: 36,
  FULLTIME_RESULT: 59,
  MATCH_GOALS: 25,
  BOTH_TEAMS_SCORE: 69,
} as const;

/** 常用联赛ID */
export const LEAGUE_IDS = {
  // 欧洲五大联赛
  PREMIER_LEAGUE: 39,
  LA_LIGA: 140,
  SERIE_A: 135,
  BUNDESLIGA: 78,
  LIGUE_1: 61,
  // 欧洲赛事
  CHAMPIONS_LEAGUE: 2,
  EUROPA_LEAGUE: 3,
  CONFERENCE_LEAGUE: 848,
  // 其他热门
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
  // 国际赛事
  WORLD_CUP: 1,
  EURO: 4,
} as const;
