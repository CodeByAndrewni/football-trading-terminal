/**
 * API-Football 请求封装
 * 用于 Cron Job 调用
 */

const API_BASE_URL = 'https://v3.football.api-sports.io';

// ============================================
// 类型定义（简化版，用于后端）
// ============================================

export interface Match {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: { first: number | null; second: number | null };
    venue: { id: number | null; name: string; city: string };
    status: { long: string; short: string; elapsed: number | null };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string | null;
    season: number;
    round: string;
  };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
  events?: MatchEvent[];
  statistics?: TeamStatistics[];
}

export interface TeamStatistics {
  team: { id: number; name: string; logo: string };
  statistics: Array<{ type: string; value: number | string | null }>;
}

export interface MatchEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string; logo: string };
  player: { id: number; name: string };
  assist: { id: number | null; name: string | null };
  type: string;
  detail: string;
  comments: string | null;
}

export interface LiveOddsData {
  fixture: { id: number; status: { long: string; elapsed: number | null } };
  league: { id: number; name: string };
  teams: { home: { name: string }; away: { name: string } };
  status: { stopped: boolean; blocked: boolean; finished: boolean };
  update: string;
  odds: Array<{
    id: number;
    name: string;
    values: Array<{ value: string; odd: string; handicap: string | null; main: boolean | null; suspended: boolean }>;
  }>;
}

export interface OddsData {
  fixture: { id: number; timezone: string; date: string; timestamp: number };
  league: { id: number; name: string; country: string; season: number };
  update: string;
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
}

interface APIResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: Record<string, string>;
  results: number;
  paging: { current: number; total: number };
  response: T;
}

// ============================================
// 请求统计
// ============================================

let apiCallsThisCycle = 0;

export function getApiCallsThisCycle(): number {
  return apiCallsThisCycle;
}

export function resetApiCallsThisCycle(): void {
  apiCallsThisCycle = 0;
}

// ============================================
// 基础请求方法
// ============================================

async function fetchAPI<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    throw new Error('FOOTBALL_API_KEY not configured');
  }

  const url = new URL(`${API_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-apisports-key': apiKey,
    },
  });

  apiCallsThisCycle++;

  if (!response.ok) {
    throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as APIResponse<T>;

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Football errors: ${JSON.stringify(data.errors)}`);
  }

  return data.response;
}

// ============================================
// 比赛数据
// ============================================

/**
 * 获取所有进行中的比赛
 */
export async function getLiveFixtures(): Promise<Match[]> {
  return fetchAPI<Match[]>('/fixtures', { live: 'all' });
}

/**
 * 获取单场比赛的统计数据
 */
export async function getFixtureStatistics(fixtureId: number): Promise<TeamStatistics[]> {
  return fetchAPI<TeamStatistics[]>('/fixtures/statistics', {
    fixture: fixtureId.toString(),
  });
}

/**
 * 获取单场比赛的事件数据
 */
export async function getFixtureEvents(fixtureId: number): Promise<MatchEvent[]> {
  return fetchAPI<MatchEvent[]>('/fixtures/events', {
    fixture: fixtureId.toString(),
  });
}

/**
 * 获取单场比赛的阵容
 */
export async function getFixtureLineups(fixtureId: number): Promise<unknown[]> {
  return fetchAPI<unknown[]>('/fixtures/lineups', {
    fixture: fixtureId.toString(),
  });
}

// ============================================
// 赔率数据
// ============================================

/**
 * 获取滚球赔率
 */
export async function getLiveOdds(fixtureId: number): Promise<LiveOddsData[]> {
  return fetchAPI<LiveOddsData[]>('/odds/live', {
    fixture: fixtureId.toString(),
  });
}

/**
 * 获取赛前赔率
 */
export async function getPrematchOdds(fixtureId: number): Promise<OddsData[]> {
  return fetchAPI<OddsData[]>('/odds', {
    fixture: fixtureId.toString(),
  });
}

// ============================================
// 批量获取
// ============================================

/**
 * 批量获取统计数据
 * 分批执行以避免过载
 */
export async function getStatisticsBatch(
  fixtureIds: number[],
  options: { batchSize?: number; batchDelay?: number } = {}
): Promise<Map<number, TeamStatistics[]>> {
  const { batchSize = 10, batchDelay = 50 } = options;
  const result = new Map<number, TeamStatistics[]>();

  for (let i = 0; i < fixtureIds.length; i += batchSize) {
    const batch = fixtureIds.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const stats = await getFixtureStatistics(id);
        return { id, stats };
      })
    );

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        result.set(res.value.id, res.value.stats);
      }
    }

    // 批次间延迟
    if (i + batchSize < fixtureIds.length && batchDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  return result;
}

/**
 * 批量获取事件数据
 */
export async function getEventsBatch(
  fixtureIds: number[],
  options: { batchSize?: number; batchDelay?: number } = {}
): Promise<Map<number, MatchEvent[]>> {
  const { batchSize = 10, batchDelay = 50 } = options;
  const result = new Map<number, MatchEvent[]>();

  for (let i = 0; i < fixtureIds.length; i += batchSize) {
    const batch = fixtureIds.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const events = await getFixtureEvents(id);
        return { id, events };
      })
    );

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        result.set(res.value.id, res.value.events);
      }
    }

    if (i + batchSize < fixtureIds.length && batchDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  return result;
}

/**
 * 批量获取滚球赔率
 */
export async function getLiveOddsBatch(
  fixtureIds: number[],
  options: { batchSize?: number; batchDelay?: number } = {}
): Promise<Map<number, LiveOddsData[]>> {
  const { batchSize = 8, batchDelay = 100 } = options;
  const result = new Map<number, LiveOddsData[]>();

  for (let i = 0; i < fixtureIds.length; i += batchSize) {
    const batch = fixtureIds.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const odds = await getLiveOdds(id);
        return { id, odds };
      })
    );

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        result.set(res.value.id, res.value.odds);
      }
    }

    if (i + batchSize < fixtureIds.length && batchDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  return result;
}

/**
 * 批量获取赛前赔率
 */
export async function getPrematchOddsBatch(
  fixtureIds: number[],
  options: { batchSize?: number; batchDelay?: number } = {}
): Promise<Map<number, OddsData[]>> {
  const { batchSize = 8, batchDelay = 100 } = options;
  const result = new Map<number, OddsData[]>();

  for (let i = 0; i < fixtureIds.length; i += batchSize) {
    const batch = fixtureIds.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const odds = await getPrematchOdds(id);
        return { id, odds };
      })
    );

    for (const res of batchResults) {
      if (res.status === 'fulfilled') {
        result.set(res.value.id, res.value.odds);
      }
    }

    if (i + batchSize < fixtureIds.length && batchDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }

  return result;
}
