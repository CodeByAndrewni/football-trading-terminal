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
  STANDINGS: 24 * 60 * 60 * 1000,       // 24小时 - 积分榜
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
 * 转换 Vercel API 返回的比赛数据为 API-Football 格式
 *
 * Vercel API 格式:
 * { fixtureId, date, status, league, teams, score: { fulltime, halftime } }
 *
 * API-Football 格式:
 * { fixture: { id, date, status }, league, teams, goals, score }
 */
function convertVercelFixtureToMatch(vercelFixture: any): Match {
  return {
    fixture: {
      id: vercelFixture.fixtureId,
      referee: null,
      timezone: 'UTC',
      date: vercelFixture.date,
      timestamp: vercelFixture.timestamp,
      periods: {
        first: null,
        second: null,
      },
      venue: {
        id: 0,
        name: '',
        city: '',
      },
      status: vercelFixture.status,
    },
    league: {
      ...vercelFixture.league,
      country: vercelFixture.league.country || '',
      flag: vercelFixture.league.flag || '',
      season: vercelFixture.league.season || new Date().getFullYear(),
    },
    teams: vercelFixture.teams,
    goals: {
      home: vercelFixture.score?.fulltime?.home ?? null,
      away: vercelFixture.score?.fulltime?.away ?? null,
    },
    score: {
      halftime: vercelFixture.score?.halftime || { home: null, away: null },
      fulltime: vercelFixture.score?.fulltime || { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

/**
 * 通过本地代理请求API(用于前端调用)
 * @param path 本地API路径
 * @returns API响应
 *
 * 🔧 支持两种返回格式：
 * - Vercel API: { success: true, data: [...] }
 * - API-Football: { response: [...] }
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

  const json = await response.json();

  // 🔥 兼容 Vercel API 的新格式 { success, data }
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    console.log(`[API_ADAPTER] Detected Vercel API format for ${path}`);

    // 如果是 fixtures 端点，需要转换数据格式
    if (path.includes('/fixtures')) {
      const convertedData = Array.isArray(json.data)
        ? json.data.map((item: any) => convertVercelFixtureToMatch(item))
        : [];

      console.log(`[API_ADAPTER] Converted ${convertedData.length} Vercel fixtures to Match format`);
      return { response: convertedData } as T;
    }

    // 其他端点直接映射 data -> response
    return { response: json.data } as T;
  }

  // 原始 API-Football 格式，直接返回
  return json;
}

// ============================================
// P0: Fixtures 端点 (比赛核心数据)
// ============================================

export async function getLiveFixtures(): Promise<Match[]> {
  const cacheKey = 'fixtures:live';
  const cached = getCache<Match[]>(cacheKey);
  if (cached) {
    console.log(`[LEGACY MODE] Using cached data: ${cached.length} live matches`);
    return cached;
  }

  const data = await fetchLocalAPI<APIResponse<Match[]>>('/api/football/fixtures?live=all');
  const matches = data?.response || [];

  if (matches.length > 0) {
    console.log(`[LEGACY MODE] Found ${matches.length} live matches from API-Football`);
  } else {
    console.log(`[LEGACY MODE] No live matches from API-Football`);
  }

  setCache(cacheKey, matches, CACHE_TTL.LIVE_FIXTURES);
  return matches;
}

export async function getFixtureById(fixtureId: number): Promise<Match | null> {
  const data = await fetchLocalAPI<APIResponse<Match[]>>(`/api/football/fixtures?id=${fixtureId}`);
  return data.response?.[0] || null;
}

export async function getFixturesByDate(date: string): Promise<Match[]> {
  const cacheKey = `fixtures:date:${date}`;
  const cached = getCache<Match[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Match[]>('/fixtures', { date });
  const matches = data?.response || [];
  setCache(cacheKey, matches, CACHE_TTL.H2H);
  return matches;
}

export async function getFixturesByLeague(leagueId: number, season: number): Promise<Match[]> {
  const cacheKey = `fixtures:league:${leagueId}:${season}`;
  const cached = getCache<Match[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Match[]>('/fixtures', { league: leagueId, season });
  const matches = data?.response || [];
  setCache(cacheKey, matches, CACHE_TTL.STANDINGS);
  return matches;
}

export async function getFixtureStatistics(fixtureId: number): Promise<TeamStatistics[]> {
  const cacheKey = `statistics:${fixtureId}`;
  const cached = getCache<TeamStatistics[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TeamStatistics[]>('/fixtures/statistics', { fixture: fixtureId });
  const stats = data?.response || [];
  setCache(cacheKey, stats, CACHE_TTL.FIXTURE_STATS);
  return stats;
}

export async function getFixtureEvents(fixtureId: number): Promise<MatchEvent[]> {
  const cacheKey = `events:${fixtureId}`;
  const cached = getCache<MatchEvent[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<MatchEvent[]>('/fixtures/events', { fixture: fixtureId });
  const events = data?.response || [];
  setCache(cacheKey, events, CACHE_TTL.FIXTURE_STATS);
  return events;
}

export async function getFixtureLineups(fixtureId: number): Promise<Lineup[]> {
  const cacheKey = `lineups:${fixtureId}`;
  const cached = getCache<Lineup[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<Lineup[]>>(
    `/api/football/lineups/${fixtureId}`
  );
  const lineups = data?.response || [];
  setCache(cacheKey, lineups, CACHE_TTL.FIXTURE_STATS);
  return lineups;
}

export async function getFixturePlayers(fixtureId: number): Promise<FixturePlayersResponse[]> {
  const cacheKey = `players:${fixtureId}`;
  const cached = getCache<FixturePlayersResponse[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<FixturePlayersResponse[]>>(
    `/api/football/teams?type=players&fixture=${fixtureId}`
  );
  const players = data?.response || [];
  setCache(cacheKey, players, CACHE_TTL.FIXTURE_STATS);
  return players;
}

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
  const matches = data?.response || [];
  setCache(cacheKey, matches, CACHE_TTL.H2H);
  return matches;
}

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
  const rounds = data?.response || [];
  setCache(cacheKey, rounds, CACHE_TTL.STANDINGS);
  return rounds;
}

// ============================================
// P1: Odds 端点 (赔率数据)
// ============================================

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
  const odds = data?.response || [];
  setCache(cacheKey, odds, CACHE_TTL.PREMATCH_ODDS);
  return odds;
}

export async function getLiveOdds(
  fixtureId: number,
  options?: { bet?: number }
): Promise<LiveOddsData[]> {
  const params = new URLSearchParams();
  params.append('fixture', fixtureId.toString());
  params.append('live', 'true');
  if (options?.bet) params.append('bet', options.bet.toString());

  const data = await fetchLocalAPI<APIResponse<LiveOddsData[]>>(
    `/api/football/odds?${params.toString()}`
  );
  const odds = data?.response || [];
  return odds;
}

export async function getAllLiveOdds(): Promise<LiveOddsData[]> {
  const data = await fetchAPI<LiveOddsData[]>('/odds/live');
  return data?.response || [];
}

export async function getOddsMapping(page = 1): Promise<OddsMapping[]> {
  const cacheKey = `odds:mapping:${page}`;
  const cached = getCache<OddsMapping[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<OddsMapping[]>('/odds/mapping', { page });
  const mapping = data?.response || [];
  setCache(cacheKey, mapping, CACHE_TTL.LEAGUES);
  return mapping;
}

export async function getBookmakers(
  options?: { id?: number; search?: string }
): Promise<Bookmaker[]> {
  const cacheKey = `bookmakers:${options?.id || ''}:${options?.search || ''}`;
  const cached = getCache<Bookmaker[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Bookmaker[]>('/odds/bookmakers', options);
  const bookmakers = data?.response || [];
  setCache(cacheKey, bookmakers, CACHE_TTL.BASIC_DATA);
  return bookmakers;
}

export async function getBetTypes(
  options?: { id?: number; search?: string }
): Promise<BetType[]> {
  const cacheKey = `bets:${options?.id || ''}:${options?.search || ''}`;
  const cached = getCache<BetType[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<BetType[]>('/odds/bets', options);
  const bets = data?.response || [];
  setCache(cacheKey, bets, CACHE_TTL.BASIC_DATA);
  return bets;
}

// ============================================
// P2: Teams & Standings 端点 (球队/联赛数据)
// ============================================

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

export async function getTeams(
  options?: { id?: number; name?: string; league?: number; season?: number; country?: string; search?: string }
): Promise<Array<{ team: { id: number; name: string; code: string; country: string; founded: number; national: boolean; logo: string }; venue: Venue }>> {
  const cacheKey = `teams:${JSON.stringify(options)}`;
  const cached = getCache<Array<{ team: { id: number; name: string; code: string; country: string; founded: number; national: boolean; logo: string }; venue: Venue }>>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Array<{ team: { id: number; name: string; code: string; country: string; founded: number; national: boolean; logo: string }; venue: Venue }>>('/teams', options);
  const teams = data?.response || [];
  setCache(cacheKey, teams, CACHE_TTL.LEAGUES);
  return teams;
}

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

export async function getTeamSeasons(teamId: number): Promise<number[]> {
  const cacheKey = `team-seasons:${teamId}`;
  const cached = getCache<number[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<number[]>('/teams/seasons', { team: teamId });
  const seasons = data?.response || [];
  setCache(cacheKey, seasons, CACHE_TTL.BASIC_DATA);
  return seasons;
}

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
  const leagues = data?.response || [];
  setCache(cacheKey, leagues, CACHE_TTL.LEAGUES);
  return leagues;
}

// ============================================
// P3: Players 端点 (球员数据)
// ============================================

export async function getPlayers(
  options: { id?: number; team?: number; league?: number; season: number; search?: string; page?: number }
): Promise<Player[]> {
  const cacheKey = `players:${JSON.stringify(options)}`;
  const cached = getCache<Player[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Player[]>('/players', options);
  const players = data?.response || [];
  setCache(cacheKey, players, CACHE_TTL.TEAM_STATS);
  return players;
}

export async function getSquad(teamId: number): Promise<Squad[]> {
  const cacheKey = `squad:${teamId}`;
  const cached = getCache<Squad[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Squad[]>('/players/squads', { team: teamId });
  const squad = data?.response || [];
  setCache(cacheKey, squad, CACHE_TTL.TEAM_STATS);
  return squad;
}

export async function getTopScorers(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topscorers:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topscorers', { league: leagueId, season });
  const scorers = data?.response || [];
  setCache(cacheKey, scorers, CACHE_TTL.TEAM_STATS);
  return scorers;
}

export async function getTopAssists(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topassists:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topassists', { league: leagueId, season });
  const assists = data?.response || [];
  setCache(cacheKey, assists, CACHE_TTL.TEAM_STATS);
  return assists;
}

export async function getTopYellowCards(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topyellowcards:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topyellowcards', { league: leagueId, season });
  const yellowCards = data?.response || [];
  setCache(cacheKey, yellowCards, CACHE_TTL.TEAM_STATS);
  return yellowCards;
}

export async function getTopRedCards(leagueId: number, season: number): Promise<TopPlayer[]> {
  const cacheKey = `topredcards:${leagueId}:${season}`;
  const cached = getCache<TopPlayer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TopPlayer[]>('/players/topredcards', { league: leagueId, season });
  const redCards = data?.response || [];
  setCache(cacheKey, redCards, CACHE_TTL.TEAM_STATS);
  return redCards;
}

// ============================================
// P4: 其他端点 (辅助数据)
// ============================================

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
  const injuries = data?.response || [];
  setCache(cacheKey, injuries, CACHE_TTL.INJURIES);
  return injuries;
}

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

export async function getCoachs(
  options?: { id?: number; team?: number; search?: string }
): Promise<Coach[]> {
  const cacheKey = `coachs:${JSON.stringify(options)}`;
  const cached = getCache<Coach[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Coach[]>('/coachs', options);
  const coachs = data?.response || [];
  setCache(cacheKey, coachs, CACHE_TTL.LEAGUES);
  return coachs;
}

export async function getTransfers(
  options: { player?: number; team?: number }
): Promise<Transfer[]> {
  const cacheKey = `transfers:${JSON.stringify(options)}`;
  const cached = getCache<Transfer[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Transfer[]>('/transfers', options);
  const transfers = data?.response || [];
  setCache(cacheKey, transfers, CACHE_TTL.LEAGUES);
  return transfers;
}

export async function getTrophies(
  options: { player?: number; coach?: number }
): Promise<Trophy[]> {
  const cacheKey = `trophies:${JSON.stringify(options)}`;
  const cached = getCache<Trophy[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Trophy[]>('/trophies', options);
  const trophies = data?.response || [];
  setCache(cacheKey, trophies, CACHE_TTL.BASIC_DATA);
  return trophies;
}

export async function getSidelined(
  options: { player?: number; coach?: number }
): Promise<Sidelined[]> {
  const cacheKey = `sidelined:${JSON.stringify(options)}`;
  const cached = getCache<Sidelined[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Sidelined[]>('/sidelined', options);
  const sidelined = data?.response || [];
  setCache(cacheKey, sidelined, CACHE_TTL.INJURIES);
  return sidelined;
}

export async function getVenues(
  options?: { id?: number; name?: string; city?: string; country?: string; search?: string }
): Promise<Venue[]> {
  const cacheKey = `venues:${JSON.stringify(options)}`;
  const cached = getCache<Venue[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Venue[]>('/venues', options);
  const venues = data?.response || [];
  setCache(cacheKey, venues, CACHE_TTL.BASIC_DATA);
  return venues;
}

export async function getTimezones(): Promise<string[]> {
  const cacheKey = 'timezones';
  const cached = getCache<string[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<string[]>('/timezone');
  const timezones = data?.response || [];
  setCache(cacheKey, timezones, CACHE_TTL.BASIC_DATA);
  return timezones;
}

export async function getCountries(
  options?: { name?: string; code?: string; search?: string }
): Promise<Country[]> {
  const cacheKey = `countries:${JSON.stringify(options)}`;
  const cached = getCache<Country[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Country[]>('/countries', options);
  const countries = data?.response || [];
  setCache(cacheKey, countries, CACHE_TTL.BASIC_DATA);
  return countries;
}

export async function getSeasons(): Promise<number[]> {
  const cacheKey = 'seasons';
  const cached = getCache<number[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<number[]>('/seasons');
  const seasons = data?.response || [];
  setCache(cacheKey, seasons, CACHE_TTL.BASIC_DATA);
  return seasons;
}

// ============================================
// 新增批量修复函数
// ============================================

export async function getLeagueStandings(
  leagueId: number,
  season?: number,
  current?: boolean
): Promise<Standing[]> {
  const currentSeason = season || new Date().getFullYear();
  const cacheKey = `standings:${leagueId}:${currentSeason}`;
  const cached = getCache<Standing[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Standing[]>('/standings', {
    league: leagueId,
    season: currentSeason,
    current: current ? 'true' : undefined,
  });
  const standings = data?.response || [];
  setCache(cacheKey, standings, CACHE_TTL.STANDINGS);
  return standings;
}

export async function getOdds(fixtureId: number, bookmaker?: number): Promise<OddsData[]> {
  const cacheKey = `odds:${fixtureId}:${bookmaker || 'all'}`;
  const cached = getCache<OddsData[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchLocalAPI<APIResponse<OddsData[]>>(
    `/api/football/odds-prematch?fixture=${fixtureId}${bookmaker ? `&bookmaker=${bookmaker}` : ''}`
  );
  const odds = data?.response || [];
  setCache(cacheKey, odds, CACHE_TTL.PREMATCH_ODDS);
  return odds;
}

export async function getOddsForAllLiveMatches(): Promise<LiveOddsData[]> {
  const data = await fetchAPI<LiveOddsData[]>('/odds/live');
  return data?.response || [];
}

export async function getTeamSeasonStats(
  teamId: number,
  season: number,
  leagueId?: number
): Promise<TeamSeasonStats> {
  const cacheKey = `team:stats:${teamId}:${season}:${leagueId || 'all'}`;
  const cached = getCache<TeamSeasonStats>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<TeamSeasonStats>('/teams/statistics', {
    team: teamId,
    season,
    league: leagueId,
  });
  const stats = data?.response || null;
  if (stats) {
    setCache(cacheKey, stats, CACHE_TTL.TEAM_STATS);
  }
  return stats;
}

export async function getTeamInjuries(teamId: number): Promise<Injury[]> {
  const cacheKey = `injuries:${teamId}`;
  const cached = getCache<Injury[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Injury[]>('/injuries', { team: teamId });
  const injuries = data?.response || [];
  setCache(cacheKey, injuries, CACHE_TTL.TEAM_STATS);
  return injuries;
}

export async function getPredictionsList(fixtureId: number): Promise<Prediction[]> {
  const cacheKey = `predictions:${fixtureId}`;
  const cached = getCache<Prediction[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<Prediction[]>('/predictions', { fixture: fixtureId });
  const predictions = data?.response || [];
  setCache(cacheKey, predictions, CACHE_TTL.H2H);
  return predictions;
}

export async function getAllLeagues(): Promise<LeagueInfo[]> {
  const cacheKey = 'leagues:all';
  const cached = getCache<LeagueInfo[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<LeagueInfo[]>('/leagues');
  const leagues = data?.response || [];
  setCache(cacheKey, leagues, CACHE_TTL.LEAGUES);
  return leagues;
}

export async function getLeaguesByCountry(country: string): Promise<LeagueInfo[]> {
  const cacheKey = `leagues:country:${country}`;
  const cached = getCache<LeagueInfo[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<LeagueInfo[]>('/leagues', { country });
  const leagues = data?.response || [];
  setCache(cacheKey, leagues, CACHE_TTL.LEAGUES);
  return leagues;
}

export async function getLeagueSeasons(leagueId: number): Promise<number[]> {
  const cacheKey = `seasons:${leagueId}`;
  const cached = getCache<number[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchAPI<LeagueInfo[]>('/leagues', { id: leagueId });
  const leagueInfo = data?.response?.[0];
  const seasons = leagueInfo?.seasons?.map(s => s.year) || [];
  setCache(cacheKey, seasons, CACHE_TTL.LEAGUES);
  return seasons;
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
