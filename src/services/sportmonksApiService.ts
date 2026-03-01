// ============================================
// Sportmonks API Service - 第三数据源
// 14天试用期 - 支持中文翻译
// API Docs: https://docs.sportmonks.com/v3
// ============================================
//
// ⚠️ 注意: 试用版仅支持 4 个联赛:
// - 丹超 (Danish Superliga) ID: 271
// - 苏超 (Scottish Premiership) ID: 501
// - 英超附加赛 ID: 513
// - 超级联赛季后赛 ID: 1659
//
// 购买正式订阅后设置 SPORTMONKS_ENABLED = true
// ============================================

// 全局开关 - 试用版限制太大，暂时禁用
export const SPORTMONKS_ENABLED = false;

// ============================================
// Types - Sportmonks API Response Types
// ============================================

export interface SportmonksFixture {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  group_id: number | null;
  aggregate_id: number | null;
  round_id: number | null;
  state_id: number;
  venue_id: number | null;
  name: string;
  starting_at: string;
  result_info: string | null;
  leg: string;
  details: string | null;
  length: number;
  placeholder: boolean;
  has_odds: boolean;
  starting_at_timestamp: number;
  // Included data
  participants?: SportmonksTeam[];
  scores?: SportmonksScore[];
  statistics?: SportmonksStatistic[];
  events?: SportmonksEvent[];
  league?: SportmonksLeague;
  state?: SportmonksState;
  periods?: SportmonksPeriod[];
  odds?: SportmonksOdd[];
  venue?: SportmonksVenue;
}

export interface SportmonksTeam {
  id: number;
  sport_id: number;
  country_id: number;
  venue_id: number | null;
  gender: string;
  name: string;
  short_code: string;
  image_path: string;
  founded: number;
  type: string;
  placeholder: boolean;
  last_played_at: string;
  meta: {
    location?: 'home' | 'away';
    winner?: boolean;
    position?: number;
  };
}

export interface SportmonksScore {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  score: {
    goals: number;
    participant: 'home' | 'away';
  };
  description: string;
}

export interface SportmonksStatistic {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  data: {
    value: number | string | null;
  };
  location: 'home' | 'away';
  type?: {
    id: number;
    name: string;
    code: string;
    developer_name: string;
    model_type: string;
    stat_group: string;
  };
}

export interface SportmonksEvent {
  id: number;
  fixture_id: number;
  participant_id: number;
  type_id: number;
  section: 'event' | 'lineup';
  player_id: number | null;
  related_player_id: number | null;
  player_name: string;
  related_player_name: string | null;
  result: string | null;
  info: string | null;
  addition: string | null;
  minute: number;
  extra_minute: number | null;
  injured: boolean;
  on_bench: boolean;
  type?: {
    id: number;
    name: string;
    code: string;
    developer_name: string;
    model_type: string;
    stat_group: string;
  };
}

export interface SportmonksLeague {
  id: number;
  sport_id: number;
  country_id: number;
  name: string;
  active: boolean;
  short_code: string;
  image_path: string;
  type: string;
  sub_type: string;
  last_played_at: string;
}

export interface SportmonksState {
  id: number;
  state: string;
  name: string;
  short_name: string;
  developer_name: string;
}

export interface SportmonksPeriod {
  id: number;
  fixture_id: number;
  type_id: number;
  started: number | null;
  ended: number | null;
  counts_from: number;
  ticking: boolean;
  sort_order: number;
  description: string;
  time_added: number;
  period_length: number;
  minutes: number;
  seconds: number;
}

export interface SportmonksOdd {
  id: number;
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label: string;
  value: string;
  name: string;
  sort_order: number;
  market_description: string;
  probability: string;
  dp3: string;
  fractional: string;
  american: string;
  winning: boolean | null;
  stopped: boolean;
  total: string | null;
  handicap: string | null;
  participants: string | null;
  created_at: string;
  original_label: string;
  latest_bookmaker_update: string;
}

export interface SportmonksVenue {
  id: number;
  country_id: number;
  city_id: number;
  name: string;
  address: string;
  zipcode: string | null;
  latitude: string;
  longitude: string;
  capacity: number;
  image_path: string;
  surface: string;
}

export interface SportmonksApiResponse<T> {
  data: T;
  pagination?: {
    count: number;
    per_page: number;
    current_page: number;
    next_page: string | null;
    has_more: boolean;
  };
  subscription?: unknown[];
  rate_limit?: {
    resets_in_seconds: number;
    remaining: number;
    requested_entity: string;
  };
  timezone?: string;
}

// ============================================
// State ID Mapping (Sportmonks -> Standard)
// ============================================

// Sportmonks state IDs
// Reference: https://docs.sportmonks.com/v3/definitions/states
export const SPORTMONKS_STATE_MAP: Record<number, {
  status: 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'BT' | 'P' | 'FT' | 'AET' | 'PEN' | 'SUSP' | 'INT' | 'PST' | 'CANC' | 'ABD' | 'AWD' | 'WO' | 'LIVE';
  label: string;
  isLive: boolean;
}> = {
  1: { status: 'NS', label: '未开始', isLive: false },
  2: { status: '1H', label: '上半场', isLive: true },
  3: { status: 'HT', label: '中场', isLive: true },
  4: { status: '2H', label: '下半场', isLive: true },
  5: { status: 'FT', label: '完场', isLive: false },
  6: { status: 'FT', label: '完场(加时)', isLive: false },
  7: { status: 'FT', label: '完场(点球)', isLive: false },
  8: { status: 'LIVE', label: '进行中', isLive: true },
  9: { status: 'ET', label: '加时', isLive: true },
  10: { status: 'BT', label: '点球前', isLive: true },
  11: { status: 'P', label: '点球', isLive: true },
  12: { status: 'PST', label: '延期', isLive: false },
  13: { status: 'CANC', label: '取消', isLive: false },
  14: { status: 'INT', label: '中断', isLive: true },
  15: { status: 'ABD', label: '腰斩', isLive: false },
  16: { status: 'SUSP', label: '暂停', isLive: true },
  17: { status: 'AWD', label: '判负', isLive: false },
  18: { status: 'WO', label: '弃权', isLive: false },
  19: { status: 'NS', label: '待确认', isLive: false },
  20: { status: 'NS', label: '待定', isLive: false },
  21: { status: 'NS', label: '删除', isLive: false },
  22: { status: '2H', label: '下半场(进行)', isLive: true },
  23: { status: 'ET', label: '加时(上半)', isLive: true },
  24: { status: 'ET', label: '加时(下半)', isLive: true },
  25: { status: 'BT', label: '加时中场', isLive: true },
  26: { status: 'P', label: '点球(进行)', isLive: true },
};

// ============================================
// Statistic Type ID Mapping
// ============================================

export const SPORTMONKS_STAT_TYPE_MAP: Record<number, string> = {
  34: 'shots_total',
  41: 'shots_on_target',
  45: 'possession',
  51: 'corners',
  52: 'offsides',
  56: 'fouls',
  57: 'yellow_cards',
  62: 'red_cards',
  78: 'ball_possession',
  79: 'attacks',
  80: 'dangerous_attacks',
  83: 'saves',
  84: 'passes_total',
  85: 'passes_accurate',
  86: 'passes_percentage',
  118: 'expected_goals',
};

// ============================================
// Cache Configuration
// ============================================

interface CachedSportmonksData {
  data: SportmonksFixture[];
  timestamp: number;
}

let livescoresCache: CachedSportmonksData | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds for livescores

// ============================================
// Rate Limiting
// ============================================

interface RateLimitState {
  requestsLastMinute: number;
  lastRequestTime: number;
  minuteStartTime: number;
}

const rateLimitState: RateLimitState = {
  requestsLastMinute: 0,
  lastRequestTime: 0,
  minuteStartTime: Date.now(),
};

// Sportmonks rate limit: depends on plan (free trial: 180/min)
const MAX_REQUESTS_PER_MINUTE = 180;

function canMakeRequest(): boolean {
  const now = Date.now();

  // Reset counter every minute
  if (now - rateLimitState.minuteStartTime > 60000) {
    rateLimitState.requestsLastMinute = 0;
    rateLimitState.minuteStartTime = now;
  }

  return rateLimitState.requestsLastMinute < MAX_REQUESTS_PER_MINUTE;
}

function recordRequest(): void {
  rateLimitState.requestsLastMinute++;
  rateLimitState.lastRequestTime = Date.now();
}

export function getSportmonksRateLimitStats(): {
  requestsLastMinute: number;
  remainingInMinute: number;
  secondsUntilReset: number;
} {
  const now = Date.now();
  const secondsSinceMinuteStart = Math.floor((now - rateLimitState.minuteStartTime) / 1000);

  return {
    requestsLastMinute: rateLimitState.requestsLastMinute,
    remainingInMinute: Math.max(0, MAX_REQUESTS_PER_MINUTE - rateLimitState.requestsLastMinute),
    secondsUntilReset: Math.max(0, 60 - secondsSinceMinuteStart),
  };
}

// ============================================
// API Functions
// ============================================

/**
 * Fetch data from Sportmonks API via proxy
 * @param endpoint API endpoint (e.g., 'livescores/inplay')
 * @param params Additional query parameters
 * @param locale Language code (default: 'zh' for Chinese)
 */
async function fetchSportmonksApi<T>(
  endpoint: string,
  params: Record<string, string> = {},
  locale = 'zh'
): Promise<T | null> {
  if (!canMakeRequest()) {
    console.warn('[Sportmonks] Rate limit reached, waiting...');
    return null;
  }

  try {
    const queryParams = new URLSearchParams({
      locale,
      ...params,
    });

    const url = `/api/sportmonks/${endpoint}?${queryParams.toString()}`;

    console.log(`[Sportmonks] Fetching: ${endpoint}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    recordRequest();

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Sportmonks] API error ${response.status}: ${errorText}`);
      return null;
    }

    const result: SportmonksApiResponse<T> = await response.json();

    // Log rate limit info if available
    if (result.rate_limit) {
      console.log(`[Sportmonks] Rate limit: ${result.rate_limit.remaining} remaining, resets in ${result.rate_limit.resets_in_seconds}s`);
    }

    return result.data;
  } catch (error) {
    console.error('[Sportmonks] Fetch error:', error);
    return null;
  }
}

// ============================================
// Livescores Endpoints
// ============================================

/**
 * Get all in-play livescores with full data
 * Uses Chinese locale by default
 */
export async function getSportmonksLivescores(): Promise<SportmonksFixture[]> {
  // Check cache first
  const now = Date.now();
  if (livescoresCache && (now - livescoresCache.timestamp) < CACHE_TTL_MS) {
    console.log('[Sportmonks] Using cached livescores');
    return livescoresCache.data;
  }

  const includes = [
    'participants',
    'scores',
    'statistics',
    'events',
    'league',
    'state',
    'periods',
    'venue',
  ].join(';');

  const fixtures = await fetchSportmonksApi<SportmonksFixture[]>(
    'livescores/inplay',
    { include: includes }
  );

  if (fixtures) {
    livescoresCache = {
      data: fixtures,
      timestamp: now,
    };
    console.log(`[Sportmonks] Fetched ${fixtures.length} live fixtures (Chinese)`);
    return fixtures;
  }

  return livescoresCache?.data || [];
}

/**
 * Get all livescores (including upcoming within 15 minutes)
 */
export async function getSportmonksAllLivescores(): Promise<SportmonksFixture[]> {
  const includes = [
    'participants',
    'scores',
    'statistics',
    'events',
    'league',
    'state',
    'periods',
  ].join(';');

  const fixtures = await fetchSportmonksApi<SportmonksFixture[]>(
    'livescores',
    { include: includes }
  );

  return fixtures || [];
}

// ============================================
// Fixture Endpoints
// ============================================

/**
 * Get fixture by ID with full details
 */
export async function getSportmonksFixtureById(fixtureId: number): Promise<SportmonksFixture | null> {
  const includes = [
    'participants',
    'scores',
    'statistics.type',
    'events.type',
    'league',
    'state',
    'periods',
    'venue',
    'odds',
  ].join(';');

  const fixture = await fetchSportmonksApi<SportmonksFixture>(
    `fixtures/${fixtureId}`,
    { include: includes }
  );

  return fixture;
}

/**
 * Get fixtures by date (YYYY-MM-DD format)
 */
export async function getSportmonksFixturesByDate(date: string): Promise<SportmonksFixture[]> {
  const includes = [
    'participants',
    'scores',
    'league',
    'state',
  ].join(';');

  const fixtures = await fetchSportmonksApi<SportmonksFixture[]>(
    `fixtures/date/${date}`,
    { include: includes }
  );

  return fixtures || [];
}

// ============================================
// Odds Endpoints
// ============================================

/**
 * Get odds for a specific fixture
 */
export async function getSportmonksOdds(fixtureId: number): Promise<SportmonksOdd[]> {
  const fixture = await fetchSportmonksApi<SportmonksFixture>(
    `fixtures/${fixtureId}`,
    { include: 'odds' }
  );

  return fixture?.odds || [];
}

// ============================================
// Conversion Functions
// ============================================

/**
 * Parse Sportmonks fixture into AdvancedMatch format
 * This allows integration with the existing scoring engine
 */
export function convertSportmonksFixture(fixture: SportmonksFixture): {
  id: number;
  name: string;
  league: string;
  leagueId: number;
  minute: number;
  status: string;
  isLive: boolean;
  homeTeam: { id: number; name: string; logo: string; score: number };
  awayTeam: { id: number; name: string; logo: string; score: number };
  statistics: {
    possession: { home: number; away: number };
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    corners: { home: number; away: number };
    dangerousAttacks: { home: number; away: number };
    xG: { home: number; away: number };
  };
  events: Array<{
    minute: number;
    type: string;
    team: 'home' | 'away';
    player: string;
  }>;
  hasOdds: boolean;
  venue: string | null;
  startTime: string;
} {
  // Get teams
  const homeTeam = fixture.participants?.find(p => p.meta.location === 'home');
  const awayTeam = fixture.participants?.find(p => p.meta.location === 'away');

  // Get current scores
  const homeScore = fixture.scores?.find(s =>
    s.score.participant === 'home' &&
    (s.description === 'CURRENT' || s.description === '2ND_HALF')
  )?.score.goals ?? 0;

  const awayScore = fixture.scores?.find(s =>
    s.score.participant === 'away' &&
    (s.description === 'CURRENT' || s.description === '2ND_HALF')
  )?.score.goals ?? 0;

  // Get state info
  const stateInfo = fixture.state_id ? SPORTMONKS_STATE_MAP[fixture.state_id] : null;

  // Calculate current minute from periods
  let currentMinute = 0;
  const activePeriod = fixture.periods?.find(p => p.ticking);
  if (activePeriod) {
    currentMinute = activePeriod.minutes;
    // Add 45 if in second half
    if (activePeriod.type_id === 2) {
      currentMinute += 45;
    }
  }

  // Parse statistics
  const stats = {
    possession: { home: 50, away: 50 },
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    dangerousAttacks: { home: 0, away: 0 },
    xG: { home: 0, away: 0 },
  };

  for (const stat of fixture.statistics || []) {
    const value = typeof stat.data.value === 'number' ? stat.data.value :
                  typeof stat.data.value === 'string' ? Number.parseFloat(stat.data.value) || 0 : 0;
    const side = stat.location === 'home' ? 'home' : 'away';

    const statName = SPORTMONKS_STAT_TYPE_MAP[stat.type_id];
    if (!statName) continue;

    switch (statName) {
      case 'possession':
      case 'ball_possession':
        stats.possession[side] = value;
        break;
      case 'shots_total':
        stats.shots[side] = value;
        break;
      case 'shots_on_target':
        stats.shotsOnTarget[side] = value;
        break;
      case 'corners':
        stats.corners[side] = value;
        break;
      case 'dangerous_attacks':
        stats.dangerousAttacks[side] = value;
        break;
      case 'expected_goals':
        stats.xG[side] = value;
        break;
    }
  }

  // Parse events (goals, cards)
  const events = (fixture.events || [])
    .filter(e => e.section === 'event')
    .map(e => {
      const isHome = homeTeam && e.participant_id === homeTeam.id;
      return {
        minute: e.minute + (e.extra_minute || 0),
        type: e.type?.name || 'Unknown',
        team: isHome ? 'home' : 'away' as 'home' | 'away',
        player: e.player_name,
      };
    });

  return {
    id: fixture.id,
    name: fixture.name, // Already translated if locale=zh was used
    league: fixture.league?.name || '未知联赛',
    leagueId: fixture.league_id,
    minute: currentMinute,
    status: stateInfo?.status || 'LIVE',
    isLive: stateInfo?.isLive ?? true,
    homeTeam: {
      id: homeTeam?.id || 0,
      name: homeTeam?.name || '主队',
      logo: homeTeam?.image_path || '',
      score: homeScore,
    },
    awayTeam: {
      id: awayTeam?.id || 0,
      name: awayTeam?.name || '客队',
      logo: awayTeam?.image_path || '',
      score: awayScore,
    },
    statistics: stats,
    events,
    hasOdds: fixture.has_odds,
    venue: fixture.venue?.name || null,
    startTime: fixture.starting_at,
  };
}

/**
 * Convert multiple Sportmonks fixtures
 */
export function convertSportmonksFixtures(fixtures: SportmonksFixture[]): ReturnType<typeof convertSportmonksFixture>[] {
  return fixtures.map(convertSportmonksFixture);
}

// ============================================
// Cache Management
// ============================================

export function clearSportmonksCache(): void {
  livescoresCache = null;
  console.log('[Sportmonks] Cache cleared');
}

export function getSportmonksCacheStats(): {
  hasCachedLivescores: boolean;
  cacheAge: number;
  cachedCount: number;
} {
  const now = Date.now();
  return {
    hasCachedLivescores: livescoresCache !== null,
    cacheAge: livescoresCache ? now - livescoresCache.timestamp : -1,
    cachedCount: livescoresCache?.data.length || 0,
  };
}

// ============================================
// Test/Debug Functions
// ============================================

/**
 * Test Sportmonks API connection
 */
export async function testSportmonksConnection(): Promise<{
  ok: boolean;
  message: string;
  fixtureCount?: number;
}> {
  try {
    const fixtures = await getSportmonksLivescores();

    if (fixtures.length > 0) {
      // Test Chinese translation
      const firstFixture = fixtures[0];
      const hasChinese = /[\u4e00-\u9fff]/.test(firstFixture.name);

      return {
        ok: true,
        message: hasChinese
          ? `连接成功 - ${fixtures.length} 场比赛 (中文翻译已启用)`
          : `连接成功 - ${fixtures.length} 场比赛 (中文翻译未生效)`,
        fixtureCount: fixtures.length,
      };
    }

    return {
      ok: true,
      message: '连接成功 - 当前无进行中比赛',
      fixtureCount: 0,
    };
  } catch (error) {
    return {
      ok: false,
      message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}
