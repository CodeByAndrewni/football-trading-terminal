// ============================================
// 足球交易决策终端 - API 服务
// 已迁移使用 apiFootballSDK 统一接口
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
  OddsAnalysis,
  Prediction,
  Standing,
  FixturePlayersResponse,
  Injury,
  LeagueInfo,
} from '../types';
import type { AdvancedMatch } from '../data/advancedMockData';
import {
  convertApiMatchToAdvanced,
  convertApiMatchesToAdvanced,
} from './apiConverter';
import {
  fetchOddsBatchOptimized,
  getCacheStats,
  clearOddsCache,
  getCachedPrematchOdds,
  setCachedPrematchOdds,
} from './oddsBatchOptimizer';
// TheOddsAPI removed - 500/month quota too low

// ============================================
// 导入 API-Football SDK (新)
// ============================================
import * as SDK from './apiFootballSDK';

// 重新导出SDK中有用的常量和类型
export { LEAGUE_IDS, BOOKMAKER_IDS, BET_TYPE_IDS } from './apiFootballSDK';
export { ApiFootballError, clearCache as clearSDKCache } from './apiFootballSDK';

// 重新导出转换函数
export {
  convertApiMatchToAdvanced,
  convertApiMatchesToAdvanced,
  isHighAlertMatch,
  isCriticalTimeMatch,
  filterByScenario,
  getScenarioDescription,
} from './apiConverter';

// ============================================
// 服务端 API 调用（通过 Vercel Serverless）
// ============================================

// API 是否可用（通过服务端代理，不再需要前端 key）
export function isApiKeyConfigured(): boolean {
  // 总是返回 true，因为 API Key 在服务端
  return true;
}

// 通用请求方法 - 调用同域 Serverless API
async function fetchServerAPI<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.message || `API 请求失败: ${response.status}`;

    if (response.status === 401) {
      throw new Error('API Key 无效');
    }
    if (response.status === 429) {
      throw new Error('API 请求次数已达上限');
    }
    throw new Error(message);
  }

  return response.json();
}

// 获取进行中的比赛
// [已迁移] 使用SDK的getLiveFixtures，统一缓存和错误处理
export async function getLiveMatches(): Promise<Match[]> {
  return SDK.getLiveFixtures();
}

// 获取比赛详情（带可选的统计和事件）
// 🔧 已更新为使用 Vercel API 的 query 参数端点
async function getFixtureWithDetails(
  matchId: number,
  options?: { stats?: boolean; events?: boolean }
): Promise<{
  fixture: APIResponse<Match[]>;
  statistics?: APIResponse<TeamStatistics[]>;
  events?: APIResponse<MatchEvent[]>;
}> {
  // Make parallel calls to individual endpoints
  const promises: Promise<any>[] = [
    // ✅ 使用 /api/football/fixtures?id=${matchId} 而不是 /api/football/fixture/${matchId}
    fetchServerAPI<APIResponse<Match[]>>(`/api/football/fixtures?id=${matchId}`)
  ];

  if (options?.stats) {
    promises.push(
      // ✅ 使用 /api/football/stats?fixture=${matchId} 而不是 /api/football/statistics/${matchId}
      fetchServerAPI<APIResponse<TeamStatistics[]>>(`/api/football/stats?fixture=${matchId}`)
        .catch(() => ({ response: [] }))
    );
  }

  if (options?.events) {
    // 🔧 Events 端点暂不可用，返回空数组
    // TODO: 后续可实现 /api/football/events 端点
    promises.push(
      Promise.resolve({ response: [] as MatchEvent[] })
    );
  }

  const results = await Promise.all(promises);

  return {
    fixture: results[0],
    statistics: options?.stats ? results[1] : undefined,
    events: options?.events ? results[options?.stats ? 2 : 1] : undefined,
  };
}

// 获取比赛详情
// [已迁移] 使用SDK的getFixtureById
export async function getMatchById(matchId: number): Promise<Match | null> {
  return SDK.getFixtureById(matchId);
}

// 获取比赛统计
// [已迁移] 使用SDK的getFixtureStatistics
export async function getMatchStatistics(matchId: number): Promise<TeamStatistics[]> {
  return SDK.getFixtureStatistics(matchId);
}

// 获取比赛事件
// [已迁移] 使用SDK的getFixtureEvents
export async function getMatchEvents(matchId: number): Promise<MatchEvent[]> {
  return SDK.getFixtureEvents(matchId);
}

// ============================================
// 新增 API 端点（使用合并端点）
// ============================================

// 获取比赛阵容
// [已迁移] 使用SDK的getFixtureLineups
export async function getMatchLineups(matchId: number): Promise<Lineup[]> {
  try {
    return await SDK.getFixtureLineups(matchId);
  } catch (error) {
    console.warn(`获取阵容失败 (fixture ${matchId}):`, error);
    return [];
  }
}

// 获取 H2H 历史对战
// [已迁移] 使用SDK的getHeadToHead
export async function getHeadToHead(
  team1Id: number,
  team2Id: number,
  last = 10
): Promise<Match[]> {
  try {
    return await SDK.getHeadToHead(team1Id, team2Id, last);
  } catch (error) {
    console.warn(`获取H2H失败 (${team1Id} vs ${team2Id}):`, error);
    return [];
  }
}

// 获取球队赛季统计
// [已迁移] 使用SDK的getTeamStatistics
export async function getTeamSeasonStats(
  teamId: number,
  leagueId: number,
  season?: number
): Promise<TeamSeasonStats | null> {
  try {
    return await SDK.getTeamStatistics(teamId, leagueId, season);
  } catch (error) {
    console.warn(`获取球队统计失败 (team ${teamId}):`, error);
    return null;
  }
}

// 获取今日比赛（复用 live 接口逻辑，实际可扩展）
export async function getTodayMatches(): Promise<Match[]> {
  // 目前复用 live 接口；如需完整今日数据，添加 api/football/today.ts
  return getLiveMatches();
}

// 获取今日所有比赛
export async function getAllTodayFixtures(): Promise<Match[]> {
  return getLiveMatches();
}

// 获取指定联赛的比赛（暂未实现服务端代理）
export async function getMatchesByLeague(
  _leagueId: number,
  _season?: number
): Promise<Match[]> {
  // TODO: 如需按联赛筛选，添加 api/football/league/[id].ts
  return [];
}

// 获取指定多个联赛的进行中比赛
export async function getLiveMatchesByLeagues(_leagueIds: number[]): Promise<Match[]> {
  // 复用 live 接口
  return getLiveMatches();
}

// 检查 API 状态
export async function checkAPIStatus(): Promise<{ ok: boolean; message: string; remaining?: number }> {
  try {
    const response = await fetch('/api/health');

    if (!response.ok) {
      return { ok: false, message: `API 错误: ${response.status}` };
    }

    const data = await response.json();
    return {
      ok: data.ok === true,
      message: data.ok ? '连接正常' : '连接异常',
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '连接失败' };
  }
}

// ============================================
// 赔率 API 端点（使用合并端点）
// ============================================

/**
 * 获取赛前赔率
 * @param fixtureId 比赛ID
 * @param options 可选参数
 */
// [已迁移] 使用SDK的getPrematchOdds
export async function getOdds(
  fixtureId: number,
  options?: { bookmaker?: number; bet?: number }
): Promise<OddsData[]> {
  try {
    return await SDK.getPrematchOdds(fixtureId, options);
  } catch (error) {
    console.warn(`获取赔率失败 (fixture ${fixtureId}):`, error);
    return [];
  }
}

/**
 * 获取滚球赔率 (实时赔率)
 * @param fixtureId 比赛ID
 * @param options 可选参数
 */
export async function getLiveOdds(
  fixtureId: number,
  options?: { bookmaker?: number; bet?: number }
): Promise<LiveOddsData[]> {
  try {
    const params = new URLSearchParams();
    params.append('fixture', fixtureId.toString());
    params.append('live', 'true'); // ✅ 添加 live=true 参数获取滚球赔率
    if (options?.bookmaker) params.append('bookmaker', options.bookmaker.toString());
    if (options?.bet) params.append('bet', options.bet.toString());

    // ✅ 使用 /api/football/odds?fixture=${id}&live=true 而不是 /api/football/odds-live
    const url = `/api/football/odds?${params.toString()}`;

    console.log(`[LIVE_ODDS_REQ] fixture=${fixtureId} url=${url}`);

    const data = await fetchServerAPI<APIResponse<LiveOddsData[]>>(url);

    // 🔥 详细诊断日志
    const responseLen = data.response?.length || 0;
    console.log(`[LIVE_ODDS_RESPONSE] fixture=${fixtureId} | response.length=${responseLen}`);

    if (responseLen > 0) {
      const firstItem = data.response[0];
      const oddsCount = firstItem.odds?.length || 0;
      const status = firstItem.status;
      console.log(`[LIVE_ODDS_OK] fixture=${fixtureId} | items=${responseLen} | odds_markets=${oddsCount} | stopped=${status?.stopped} | blocked=${status?.blocked}`);

      // 如果有 odds 数组，打印市场类型
      if (oddsCount > 0) {
        const marketNames = firstItem.odds.map(o => `${o.id}:${o.name}`).join(', ');
        console.log(`[LIVE_ODDS_MARKETS] fixture=${fixtureId} | ${marketNames}`);

        // 🔥 检查具体盘口数据
        const ahMarket = firstItem.odds.find(o => o.id === 33);
        const ouMarket = firstItem.odds.find(o => o.id === 36);
        console.log(`[LIVE_ODDS_DATA] fixture=${fixtureId} | AH(33)=${!!ahMarket}, OU(36)=${!!ouMarket}`);
        if (ahMarket) {
          console.log(`[LIVE_ODDS_DATA] AH values:`, ahMarket.values?.slice(0, 2));
        }
        if (ouMarket) {
          console.log(`[LIVE_ODDS_DATA] OU values:`, ouMarket.values?.slice(0, 4));
        }
      }

      // 🔥 返回完整数据供 converter 使用
      return data.response;
    } else {
      // 检查是否有错误信息
      const errors = (data as any).errors;
      if (errors && Object.keys(errors).length > 0) {
        console.warn(`[LIVE_ODDS_ERROR] fixture=${fixtureId} | errors=${JSON.stringify(errors)}`);
      } else {
        console.log(`[LIVE_ODDS_EMPTY] fixture=${fixtureId} | 该比赛暂无滚球赔率 (可能是小联赛或赔率未开盘)`);
      }
    }

    return data.response || [];
  } catch (error) {
    console.error(`[LIVE_ODDS_FAIL] fixture=${fixtureId} |`, error);
    return [];
  }
}

/**
 * 解析赔率数据为分析结果
 * @param oddsData 原始赔率数据
 */
export function parseOddsData(oddsData: OddsData[]): OddsAnalysis | null {
  if (!oddsData || oddsData.length === 0) {
    return null;
  }

  const data = oddsData[0];
  const bookmakers = data.bookmakers || [];

  if (bookmakers.length === 0) {
    return null;
  }

  // 取第一个博彩公司的赔率作为基准
  const primaryBookmaker = bookmakers[0];
  const bets = primaryBookmaker.bets || [];

  // 解析胜平负赔率
  const matchWinnerBet = bets.find(b => b.id === 1 || b.name === 'Match Winner');
  let matchWinner: OddsAnalysis['matchWinner'] = null;
  if (matchWinnerBet) {
    const home = matchWinnerBet.values.find(v => v.value === 'Home');
    const draw = matchWinnerBet.values.find(v => v.value === 'Draw');
    const away = matchWinnerBet.values.find(v => v.value === 'Away');

    if (home && draw && away) {
      const homeOdd = Number.parseFloat(home.odd);
      const awayOdd = Number.parseFloat(away.odd);
      matchWinner = {
        home: homeOdd,
        draw: Number.parseFloat(draw.odd),
        away: awayOdd,
        favorite: homeOdd < awayOdd ? 'home' : awayOdd < homeOdd ? 'away' : 'none',
      };
    }
  }

  // 解析大小球赔率
  const overUnderBet = bets.find(b => b.id === 5 || b.name === 'Goals Over/Under');
  let overUnder: OddsAnalysis['overUnder'] = null;
  if (overUnderBet) {
    // 优先找 2.5 线
    const over25 = overUnderBet.values.find(v => v.value === 'Over 2.5');
    const under25 = overUnderBet.values.find(v => v.value === 'Under 2.5');

    if (over25 && under25) {
      overUnder = {
        line: 2.5,
        over: Number.parseFloat(over25.odd),
        under: Number.parseFloat(under25.odd),
      };
    }
  }

  // 解析亚洲让球
  const asianHandicapBet = bets.find(b => b.id === 8 || b.name === 'Asian Handicap');
  let asianHandicap: OddsAnalysis['asianHandicap'] = null;
  if (asianHandicapBet && asianHandicapBet.values.length >= 2) {
    const homeValue = asianHandicapBet.values.find(v => v.value.includes('Home'));
    const awayValue = asianHandicapBet.values.find(v => v.value.includes('Away'));

    if (homeValue && awayValue) {
      // 从 value 解析让球线 (如 "Home -0.5" -> -0.5)
      const lineMatch = homeValue.value.match(/-?\d+\.?\d*/);
      const line = lineMatch ? Number.parseFloat(lineMatch[0]) : 0;

      asianHandicap = {
        line,
        home: Number.parseFloat(homeValue.odd),
        away: Number.parseFloat(awayValue.odd),
      };
    }
  }

  // 解析双方进球
  const btsBet = bets.find(b => b.id === 26 || b.name === 'Both Teams Score');
  let bothTeamsScore: OddsAnalysis['bothTeamsScore'] = null;
  if (btsBet) {
    const yes = btsBet.values.find(v => v.value === 'Yes');
    const no = btsBet.values.find(v => v.value === 'No');

    if (yes && no) {
      bothTeamsScore = {
        yes: Number.parseFloat(yes.odd),
        no: Number.parseFloat(no.odd),
      };
    }
  }

  // 计算市场情绪
  let marketSentiment: OddsAnalysis['marketSentiment'] = 'BALANCED';
  if (matchWinner) {
    const diff = matchWinner.away - matchWinner.home;
    if (diff > 0.5) marketSentiment = 'HOME_FAVORED';
    else if (diff < -0.5) marketSentiment = 'AWAY_FAVORED';
  }

  // 计算进球预期
  let goalExpectation: OddsAnalysis['goalExpectation'] = 'MEDIUM';
  if (overUnder) {
    if (overUnder.over < 1.7) goalExpectation = 'HIGH';
    else if (overUnder.over > 2.1) goalExpectation = 'LOW';
  }

  return {
    fixtureId: data.fixture.id,
    timestamp: Date.now(),
    matchWinner,
    overUnder,
    asianHandicap,
    bothTeamsScore,
    movements: [],
    marketSentiment,
    goalExpectation,
    anomalies: [],
  };
}

// ============================================
// 预测 API 端点（使用合并端点）
// ============================================

/**
 * 获取比赛预测
 * [已迁移] 使用SDK的getPredictions
 * @param fixtureId 比赛ID
 * @returns API-Football 官方预测数据
 */
export async function getPredictions(fixtureId: number): Promise<Prediction | null> {
  try {
    return await SDK.getPredictions(fixtureId);
  } catch (error) {
    console.warn(`获取预测失败 (fixture ${fixtureId}):`, error);
    return null;
  }
}

/**
 * 解析预测数据为评分参考
 */
export function parsePredictionForScoring(prediction: Prediction | null): {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  overUnderAdvice: string | null;
  advice: string;
} | null {
  if (!prediction) return null;

  const { predictions } = prediction;

  return {
    homeWinProb: Number.parseInt(predictions.percent.home) || 0,
    drawProb: Number.parseInt(predictions.percent.draw) || 0,
    awayWinProb: Number.parseInt(predictions.percent.away) || 0,
    overUnderAdvice: predictions.under_over,
    advice: predictions.advice || '',
  };
}

// ============================================
// 积分榜 API 端点（使用合并端点）
// ============================================

/**
 * 获取联赛积分榜
 * [已迁移] 使用SDK的getStandings
 * @param leagueId 联赛ID
 * @param season 赛季年份 (可选)
 */
export async function getStandings(
  leagueId: number,
  season?: number
): Promise<Standing | null> {
  try {
    return await SDK.getStandings(leagueId, season);
  } catch (error) {
    console.warn(`获取积分榜失败 (league ${leagueId}):`, error);
    return null;
  }
}

/**
 * 获取球队在联赛中的排名
 * @param standing 积分榜数据
 * @param teamId 球队ID
 */
export function getTeamRank(standing: Standing | null, teamId: number): {
  rank: number;
  points: number;
  form: string;
  goalsDiff: number;
  position: 'top' | 'mid' | 'bottom';
} | null {
  if (!standing?.league?.standings?.[0]) return null;

  const teams = standing.league.standings[0];
  const team = teams.find(t => t.team.id === teamId);

  if (!team) return null;

  const totalTeams = teams.length;
  const topThreshold = Math.ceil(totalTeams * 0.25);
  const bottomThreshold = Math.floor(totalTeams * 0.75);

  let position: 'top' | 'mid' | 'bottom' = 'mid';
  if (team.rank <= topThreshold) position = 'top';
  else if (team.rank > bottomThreshold) position = 'bottom';

  return {
    rank: team.rank,
    points: team.points,
    form: team.form,
    goalsDiff: team.goalsDiff,
    position,
  };
}

// ============================================
// 球员统计 API 端点（使用合并端点）
// ============================================

/**
 * 获取比赛中球员统计
 * [已迁移] 使用SDK的getFixturePlayers
 * @param fixtureId 比赛ID
 */
export async function getFixturePlayers(fixtureId: number): Promise<FixturePlayersResponse[]> {
  try {
    return await SDK.getFixturePlayers(fixtureId);
  } catch (error) {
    console.warn(`获取球员统计失败 (fixture ${fixtureId}):`, error);
    return [];
  }
}

/**
 * 获取比赛中表现最佳的球员
 */
export function getTopPerformers(
  playersData: FixturePlayersResponse[],
  limit = 5
): Array<{
  player: { id: number; name: string; photo: string };
  team: string;
  rating: number;
  goals: number;
  assists: number;
}> {
  const allPlayers: Array<{
    player: { id: number; name: string; photo: string };
    team: string;
    rating: number;
    goals: number;
    assists: number;
  }> = [];

  for (const teamData of playersData) {
    for (const playerData of teamData.players) {
      const stats = playerData.statistics[0];
      if (stats?.games?.rating) {
        allPlayers.push({
          player: playerData.player,
          team: teamData.team.name,
          rating: Number.parseFloat(stats.games.rating) || 0,
          goals: stats.goals?.total || 0,
          assists: stats.goals?.assists || 0,
        });
      }
    }
  }

  return allPlayers
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

// ============================================
// 伤病信息 API 端点（使用合并端点）
// ============================================

/**
 * 获取球队伤病信息
 * @param teamId 球队ID
 * @param options 可选参数
 */
export async function getTeamInjuries(
  teamId: number,
  options?: { season?: number; fixture?: number }
): Promise<Injury[]> {
  try {
    const params = new URLSearchParams();
    params.append('type', 'injuries');
    params.append('team', teamId.toString());
    if (options?.season) params.append('season', options.season.toString());
    if (options?.fixture) params.append('fixture', options.fixture.toString());

    const url = `/api/football/teams?${params.toString()}`;

    const data = await fetchServerAPI<APIResponse<Injury[]>>(url);
    return data.response || [];
  } catch (error) {
    console.warn(`获取伤病信息失败 (team ${teamId}):`, error);
    return [];
  }
}

/**
 * 获取比赛双方的伤病情况
 */
export async function getMatchInjuries(
  homeTeamId: number,
  awayTeamId: number,
  fixtureId?: number
): Promise<{
  home: Injury[];
  away: Injury[];
  totalMissing: number;
}> {
  try {
    const [homeInjuries, awayInjuries] = await Promise.all([
      getTeamInjuries(homeTeamId, { fixture: fixtureId }),
      getTeamInjuries(awayTeamId, { fixture: fixtureId }),
    ]);

    return {
      home: homeInjuries,
      away: awayInjuries,
      totalMissing: homeInjuries.length + awayInjuries.length,
    };
  } catch (error) {
    console.warn('获取比赛伤病信息失败:', error);
    return { home: [], away: [], totalMissing: 0 };
  }
}

// ============================================
// 联赛信息 API 端点（保持不变）
// ============================================

/**
 * 获取联赛列表
 * [已迁移] 使用SDK的getLeagues
 * @param options 筛选参数
 */
export async function getLeagues(options?: {
  id?: number;
  country?: string;
  season?: number;
  current?: boolean;
  type?: 'league' | 'cup';
}): Promise<LeagueInfo[]> {
  try {
    return await SDK.getLeagues(options);
  } catch (error) {
    console.warn('获取联赛列表失败:', error);
    return [];
  }
}

/**
 * 获取当前赛季的所有联赛
 */
export async function getCurrentSeasonLeagues(): Promise<LeagueInfo[]> {
  return getLeagues({ current: true });
}

/**
 * 获取指定国家的联赛
 */
export async function getLeaguesByCountry(country: string): Promise<LeagueInfo[]> {
  return getLeagues({ country, current: true });
}

// ============================================
// 高级数据获取方法 - 返回 AdvancedMatch 格式
// ============================================

/**
 * 获取进行中比赛并转换为 AdvancedMatch 格式
 * 包含完整的统计数据和场景标签
 * Phase 1.5: 现在也获取 live odds
 * Phase 2.5: 使用优化的批处理获取赔率
 * Phase 3.0: 添加赛前赔率获取 (prematch odds) 用于 strong_behind 检测
 */
export async function getLiveMatchesAdvanced(): Promise<AdvancedMatch[]> {
  try {
    const startTime = Date.now();

    // 获取进行中比赛
    const matches = await getLiveMatches();

    if (matches.length === 0) {
      return [];
    }

    // 批量获取统计数据（限制并发以避免API限制）
    const statisticsMap = new Map<number, TeamStatistics[]>();
    const eventsMap = new Map<number, MatchEvent[]>();
    const lineupsMap = new Map<number, Lineup[]>();
    const prematchOddsMap = new Map<number, OddsData[]>();

    // 构建 minute map（用于 odds 存储）
    const minuteMap = new Map<number, number>();
    for (const match of matches) {
      minuteMap.set(match.fixture.id, match.fixture.status.elapsed || 0);
    }

    // ============================================
    // 并行执行: 统计/事件/阵容 + 实时赔率 + 赛前赔率
    // ============================================

    // 1. 启动实时赔率批量获取（使用优化器）
    const liveOddsPromise = fetchOddsBatchOptimized(matches, getLiveOdds);

    // 2. 启动赛前赔率批量获取 (Phase 3.0)
    const prematchOddsPromise = (async () => {
      const batchSize = 10;
      let fetched = 0;
      let failed = 0;

      for (let i = 0; i < matches.length; i += batchSize) {
        const batch = matches.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (match) => {
            try {
              // 先检查缓存
              const cached = getCachedPrematchOdds(match.fixture.id);
              if (cached !== null) {
                prematchOddsMap.set(match.fixture.id, cached);
                fetched++;
                return;
              }

              // 未缓存则从 API 获取
              const odds = await getOdds(match.fixture.id);
              if (odds && odds.length > 0) {
                prematchOddsMap.set(match.fixture.id, odds);
                setCachedPrematchOdds(match.fixture.id, odds);
                fetched++;
              }
            } catch (error) {
              failed++;
              console.warn(`获取赛前赔率失败 (fixture ${match.fixture.id}):`, error);
            }
          })
        );

        // 批次间延迟
        if (i + batchSize < matches.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      return { fetched, failed };
    })();

    // 3. 同时批量获取统计数据
    // 🔥 v164: 优化加载速度（Same 平台直连模式）
    const statsBatchSize = 5; // 每批 5 个（提速）
    const statsDelay = 800;  // 0.8 秒间隔（提速）
    const statsPromise = (async () => {
      for (let i = 0; i < matches.length; i += statsBatchSize) {
        const batch = matches.slice(i, i + statsBatchSize);

        await Promise.all(
          batch.map(async (match) => {
            try {
              // 🔥 v164: 只获取核心数据（统计+事件），跳过阵容
              const details = await getFixtureWithDetails(match.fixture.id, { stats: true, events: true });

              if (details.statistics?.response) {
                statisticsMap.set(match.fixture.id, details.statistics.response);
              }
              if (details.events?.response) {
                eventsMap.set(match.fixture.id, details.events.response);
              }
            } catch (error) {
              // 静默失败，不打印错误（减少日志噪音）
              // console.warn(`获取比赛 ${match.fixture.id} 详情失败:`, error);
            }
          })
        );

        // 🔥 增加批次间延迟
        if (i + statsBatchSize < matches.length) {
          await new Promise((resolve) => setTimeout(resolve, statsDelay));
        }
      }
    })();

    // 🔥 CRITICAL FIX: 立即转换并返回基础数据，不等待赔率/统计完成
    console.log(`[MATCHES] Loaded ${matches.length} live fixtures from API-Football`);

    // 先创建基础的 AdvancedMatch 数据（赔率/统计字段为空）
    const initialMatches = convertApiMatchesToAdvanced(matches, statisticsMap, eventsMap, lineupsMap, new Map(), new Map());

    console.log(`[MATCHES] Converted to ${initialMatches.length} AdvancedMatch objects (without odds/stats yet)`);

    // 4. 后台异步加载赔率和统计（不阻塞返回）
    Promise.all([
      liveOddsPromise,
      prematchOddsPromise,
      statsPromise,
    ]).then(([liveOddsResult, prematchResult]) => {
      const oddsMap = liveOddsResult.oddsMap;
      const totalTime = Date.now() - startTime;
      const cacheStats = getCacheStats();

      // 统计信息
      let oddsWithData = 0;
      for (const [fid, odds] of oddsMap.entries()) {
        if (odds && odds.length > 0 && odds[0].odds?.length > 0) {
          oddsWithData++;
        }
      }

      console.log(`[MATCHES_ASYNC] Odds/Stats loaded in ${totalTime}ms`);
      console.log(`[MATCHES_ASYNC] Live Odds: fetched=${liveOddsResult.stats.fetched}, cached=${liveOddsResult.stats.cached}, failed=${liveOddsResult.stats.failed}`);
      console.log(`[MATCHES_ASYNC] Prematch Odds: fetched=${prematchResult.fetched}, failed=${prematchResult.failed}`);
      console.log(`[MATCHES_ASYNC] Fixtures with odds: ${oddsWithData}/${matches.length}`);
      console.log(`[MATCHES_ASYNC] Cache hit rate: live=${cacheStats.hitRate}, prematch=${cacheStats.prematchHitRate}`);
    }).catch(error => {
      console.error('[MATCHES_ASYNC] Background loading failed:', error);
    });

    // 立即返回基础数据
    return initialMatches;
  } catch (error) {
    console.error('获取进行中比赛失败:', error);
    throw error;
  }
}

// 导出缓存管理函数
export { clearOddsCache, getCacheStats };

/**
 * 获取单场比赛的完整 AdvancedMatch 数据
 */
export async function getMatchAdvanced(matchId: number): Promise<AdvancedMatch | null> {
  try {
    // 并行获取所有数据
    const [details, lineups] = await Promise.all([
      getFixtureWithDetails(matchId, { stats: true, events: true }),
      getMatchLineups(matchId),
    ]);

    const match = details.fixture.response[0];
    if (!match) {
      return null;
    }

    const statistics = details.statistics?.response || [];
    const events = details.events?.response || [];

    return convertApiMatchToAdvanced(match, statistics, events, lineups);
  } catch (error) {
    console.error(`获取比赛 ${matchId} 失败:`, error);
    throw error;
  }
}

/**
 * 获取今日所有比赛并转换为 AdvancedMatch 格式
 */
export async function getTodayMatchesAdvanced(): Promise<AdvancedMatch[]> {
  try {
    const matches = await getAllTodayFixtures();

    // 只处理进行中的比赛统计数据
    const liveMatches = matches.filter((m) =>
      ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(m.fixture.status.short)
    );

    const statisticsMap = new Map<number, TeamStatistics[]>();
    const eventsMap = new Map<number, MatchEvent[]>();
    const lineupsMap = new Map<number, Lineup[]>();

    // 获取进行中比赛的详细数据
    const batchSize = 5;
    for (let i = 0; i < liveMatches.length; i += batchSize) {
      const batch = liveMatches.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (match) => {
          try {
            const [details, lineups] = await Promise.all([
              getFixtureWithDetails(match.fixture.id, { stats: true, events: true }),
              getMatchLineups(match.fixture.id),
            ]);

            if (details.statistics?.response) {
              statisticsMap.set(match.fixture.id, details.statistics.response);
            }
            if (details.events?.response) {
              eventsMap.set(match.fixture.id, details.events.response);
            }
            if (lineups.length > 0) {
              lineupsMap.set(match.fixture.id, lineups);
            }
          } catch (error) {
            console.warn(`获取比赛 ${match.fixture.id} 详情失败:`, error);
          }
        })
      );

      if (i + batchSize < liveMatches.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return convertApiMatchesToAdvanced(matches, statisticsMap, eventsMap, lineupsMap);
  } catch (error) {
    console.error('获取今日比赛失败:', error);
    throw error;
  }
}

/**
 * 获取比赛的完整评分数据（包含历史统计）
 */
export async function getMatchWithHistoryData(
  match: Match
): Promise<{
  match: Match;
  homeTeamStats: TeamSeasonStats | null;
  awayTeamStats: TeamSeasonStats | null;
  h2hMatches: Match[];
}> {
  try {
    const [homeTeamStats, awayTeamStats, h2hMatches] = await Promise.all([
      getTeamSeasonStats(match.teams.home.id, match.league.id, match.league.season),
      getTeamSeasonStats(match.teams.away.id, match.league.id, match.league.season),
      getHeadToHead(match.teams.home.id, match.teams.away.id, 10),
    ]);

    return {
      match,
      homeTeamStats,
      awayTeamStats,
      h2hMatches,
    };
  } catch (error) {
    console.error('获取历史数据失败:', error);
    return {
      match,
      homeTeamStats: null,
      awayTeamStats: null,
      h2hMatches: [],
    };
  }
}
