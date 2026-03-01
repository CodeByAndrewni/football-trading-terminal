/**
 * Phase 1 验收端点
 * 用于对比原始 API 数据与处理后的数据
 *
 * 访问: GET /api/verify-alignment
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE_URL = 'https://v3.football.api-sports.io';

interface RawApiResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: Record<string, string>;
  results: number;
  response: T;
}

async function fetchRaw<T>(endpoint: string, params: Record<string, string> = {}): Promise<RawApiResponse<T>> {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    throw new Error('FOOTBALL_API_KEY not configured');
  }

  const url = new URL(`${API_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { 'x-apisports-key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

interface VerificationResult {
  fixtureId: number;
  teams: string;
  minute: number;
  // Raw API data
  raw: {
    liveOdds: any;
    prematchOdds: any;
    statistics: any;
  };
  // Parsed data
  parsed: {
    odds: {
      handicap: { value: number | null; home: number | null; away: number | null };
      overUnder: { total: number | null; over: number | null; under: number | null };
      matchWinner: { home: number | null; draw: number | null; away: number | null };
      _is_live: boolean;
      _source: string;
    };
    stats: {
      shots: { home: number; away: number };
      shotsOnTarget: { home: number; away: number };
      corners: { home: number; away: number };
      possession: { home: number; away: number };
      xG: { home: number; away: number };
      fouls: { home: number; away: number };
      yellowCards: { home: number; away: number };
      redCards: { home: number; away: number };
    };
  };
  // Comparison
  comparison: {
    oddsSourceMatch: boolean;
    statsFieldsMatch: boolean;
    issues: string[];
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'API key not configured',
        message: '请在 .env 文件中配置 FOOTBALL_API_KEY'
      });
    }

    // Step 1: Get live fixtures
    const liveResponse = await fetchRaw<any[]>('/fixtures', { live: 'all' });
    const liveMatches = liveResponse.response || [];

    if (liveMatches.length === 0) {
      return res.status(200).json({
        message: '暂无进行中比赛',
        timestamp: new Date().toISOString(),
        liveCount: 0,
        verifications: []
      });
    }

    // Step 2: Pick 2-3 matches (prefer MLS or Liga MX)
    const preferredLeagues = [253, 262, 266, 71, 128]; // MLS, Liga MX, etc.
    let selectedMatches = liveMatches.filter(m => preferredLeagues.includes(m.league.id));

    // If no preferred leagues, just take first 3
    if (selectedMatches.length === 0) {
      selectedMatches = liveMatches.slice(0, 3);
    } else {
      selectedMatches = selectedMatches.slice(0, 3);
    }

    // Step 3: For each match, fetch raw data and compare
    const verifications: VerificationResult[] = [];

    for (const match of selectedMatches) {
      const fixtureId = match.fixture.id;

      // Fetch all raw data in parallel
      const [liveOddsRaw, prematchOddsRaw, statsRaw] = await Promise.all([
        fetchRaw<any[]>('/odds/live', { fixture: String(fixtureId) }).catch(() => ({ response: [] })),
        fetchRaw<any[]>('/odds', { fixture: String(fixtureId) }).catch(() => ({ response: [] })),
        fetchRaw<any[]>('/fixtures/statistics', { fixture: String(fixtureId) }).catch(() => ({ response: [] })),
      ]);

      // Parse live odds
      const liveOddsData = liveOddsRaw.response?.[0] || null;
      const prematchOddsData = prematchOddsRaw.response?.[0] || null;
      const statsData = statsRaw.response || [];

      // Parse odds
      const parsedOdds = parseOddsFromRaw(liveOddsData, prematchOddsData);

      // Parse statistics
      const parsedStats = parseStatsFromRaw(statsData);

      // Compare and find issues
      const issues: string[] = [];

      // Check odds source
      if (liveOddsData?.odds?.length > 0 && !parsedOdds._is_live) {
        issues.push('滚球赔率存在但 _is_live 为 false');
      }
      if (!liveOddsData?.odds?.length && prematchOddsData?.bookmakers?.length > 0 && parsedOdds._is_live) {
        issues.push('仅有赛前赔率但 _is_live 为 true');
      }

      // Check statistics
      if (statsData.length >= 2) {
        const homeStats = statsData[0]?.statistics || [];
        const rawShots = homeStats.find((s: any) => s.type === 'Total Shots')?.value;
        if (rawShots !== null && rawShots !== undefined && parsedStats.shots.home !== Number(rawShots)) {
          issues.push(`射门数不匹配: raw=${rawShots}, parsed=${parsedStats.shots.home}`);
        }
      }

      verifications.push({
        fixtureId,
        teams: `${match.teams.home.name} vs ${match.teams.away.name}`,
        minute: match.fixture.status.elapsed || 0,
        raw: {
          liveOdds: liveOddsData ? {
            status: liveOddsData.status,
            oddsCount: liveOddsData.odds?.length || 0,
            odds: liveOddsData.odds?.slice(0, 5) // First 5 markets
          } : null,
          prematchOdds: prematchOddsData ? {
            bookmakersCount: prematchOddsData.bookmakers?.length || 0,
            firstBookmaker: prematchOddsData.bookmakers?.[0]?.name,
            betsCount: prematchOddsData.bookmakers?.[0]?.bets?.length || 0
          } : null,
          statistics: statsData.map((team: any) => ({
            team: team.team?.name,
            stats: team.statistics?.slice(0, 10) // First 10 stats
          }))
        },
        parsed: {
          odds: {
            handicap: parsedOdds.handicap,
            overUnder: parsedOdds.overUnder,
            matchWinner: parsedOdds.matchWinner,
            _is_live: parsedOdds._is_live,
            _source: parsedOdds._source,
          },
          stats: parsedStats,
        },
        comparison: {
          oddsSourceMatch: checkOddsSourceMatch(liveOddsData, prematchOddsData, parsedOdds),
          statsFieldsMatch: issues.filter(i => i.includes('不匹配')).length === 0,
          issues,
        }
      });
    }

    return res.status(200).json({
      message: 'Phase 1 验收数据',
      timestamp: new Date().toISOString(),
      liveCount: liveMatches.length,
      selectedCount: selectedMatches.length,
      verifications,
      summary: {
        totalIssues: verifications.reduce((sum, v) => sum + v.comparison.issues.length, 0),
        allOddsSourceMatch: verifications.every(v => v.comparison.oddsSourceMatch),
        allStatsMatch: verifications.every(v => v.comparison.statsFieldsMatch),
      }
    });

  } catch (error) {
    console.error('[verify-alignment] Error:', error);
    return res.status(500).json({
      error: 'Verification failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function parseOddsFromRaw(liveOdds: any, prematchOdds: any): {
  handicap: { value: number | null; home: number | null; away: number | null };
  overUnder: { total: number | null; over: number | null; under: number | null };
  matchWinner: { home: number | null; draw: number | null; away: number | null };
  _is_live: boolean;
  _source: string;
} {
  const result = {
    handicap: { value: null as number | null, home: null as number | null, away: null as number | null },
    overUnder: { total: null as number | null, over: null as number | null, under: null as number | null },
    matchWinner: { home: null as number | null, draw: null as number | null, away: null as number | null },
    _is_live: false,
    _source: 'N/A',
  };

  // Try live odds first
  if (liveOdds?.odds?.length > 0) {
    result._is_live = true;
    result._source = 'API-Football (live)';

    // Parse Asian Handicap (id: 33 or 8)
    const ahMarket = liveOdds.odds.find((o: any) =>
      o.id === 33 || o.id === 8 || o.name === 'Asian Handicap'
    );
    if (ahMarket?.values?.length >= 2) {
      const homeVal = ahMarket.values.find((v: any) => v.value === 'Home' && v.main === true) ||
                      ahMarket.values.find((v: any) => v.value === 'Home');
      const awayVal = ahMarket.values.find((v: any) => v.value === 'Away' && v.main === true) ||
                      ahMarket.values.find((v: any) => v.value === 'Away');
      if (homeVal && awayVal) {
        result.handicap.home = parseFloat(homeVal.odd) || null;
        result.handicap.away = parseFloat(awayVal.odd) || null;
        result.handicap.value = homeVal.handicap ? parseFloat(homeVal.handicap) : null;
      }
    }

    // Parse Over/Under (id: 36)
    const ouMarket = liveOdds.odds.find((o: any) =>
      o.id === 36 || o.name === 'Over/Under Line' || o.name === 'Over/Under'
    );
    if (ouMarket?.values?.length > 0) {
      const mainOver = ouMarket.values.find((v: any) => v.value === 'Over' && v.main === true) ||
                       ouMarket.values.find((v: any) => v.value.toLowerCase() === 'over');
      const mainUnder = ouMarket.values.find((v: any) => v.value === 'Under' && v.main === true) ||
                        ouMarket.values.find((v: any) => v.value.toLowerCase() === 'under');
      if (mainOver || mainUnder) {
        result.overUnder.over = mainOver ? parseFloat(mainOver.odd) : null;
        result.overUnder.under = mainUnder ? parseFloat(mainUnder.odd) : null;
        result.overUnder.total = mainOver?.handicap ? parseFloat(mainOver.handicap) :
                                  (mainUnder?.handicap ? parseFloat(mainUnder.handicap) : null);
      }
    }

    // Parse Match Winner (id: 59 or 1)
    const mlMarket = liveOdds.odds.find((o: any) =>
      o.id === 59 || o.id === 1 || o.name === 'Match Winner' || o.name === 'Fulltime Result'
    );
    if (mlMarket?.values?.length >= 3) {
      const home = mlMarket.values.find((v: any) => v.value === 'Home' || v.value === '1');
      const draw = mlMarket.values.find((v: any) => v.value === 'Draw' || v.value === 'X');
      const away = mlMarket.values.find((v: any) => v.value === 'Away' || v.value === '2');
      if (home && draw && away) {
        result.matchWinner.home = parseFloat(home.odd) || null;
        result.matchWinner.draw = parseFloat(draw.odd) || null;
        result.matchWinner.away = parseFloat(away.odd) || null;
      }
    }

    return result;
  }

  // Fall back to prematch odds
  if (prematchOdds?.bookmakers?.length > 0) {
    result._is_live = false;
    result._source = 'API-Football (prematch)';

    const bookmaker = prematchOdds.bookmakers[0];

    for (const bet of bookmaker.bets || []) {
      // Asian Handicap (id: 8)
      if (bet.id === 8 || bet.name === 'Asian Handicap') {
        const homeVal = bet.values.find((v: any) => v.value.includes('Home'));
        const awayVal = bet.values.find((v: any) => v.value.includes('Away'));
        if (homeVal && awayVal) {
          result.handicap.home = parseFloat(homeVal.odd) || null;
          result.handicap.away = parseFloat(awayVal.odd) || null;
          const lineMatch = homeVal.value.match(/-?\d+\.?\d*/);
          result.handicap.value = lineMatch ? parseFloat(lineMatch[0]) : null;
        }
      }

      // Over/Under (id: 5)
      if (bet.id === 5 || bet.name === 'Goals Over/Under') {
        // Find 2.5 line preferentially
        const over25 = bet.values.find((v: any) => v.value === 'Over 2.5');
        const under25 = bet.values.find((v: any) => v.value === 'Under 2.5');
        if (over25 && under25) {
          result.overUnder.over = parseFloat(over25.odd) || null;
          result.overUnder.under = parseFloat(under25.odd) || null;
          result.overUnder.total = 2.5;
        }
      }

      // Match Winner (id: 1)
      if (bet.id === 1 || bet.name === 'Match Winner') {
        const home = bet.values.find((v: any) => v.value === 'Home');
        const draw = bet.values.find((v: any) => v.value === 'Draw');
        const away = bet.values.find((v: any) => v.value === 'Away');
        if (home && draw && away) {
          result.matchWinner.home = parseFloat(home.odd) || null;
          result.matchWinner.draw = parseFloat(draw.odd) || null;
          result.matchWinner.away = parseFloat(away.odd) || null;
        }
      }
    }

    return result;
  }

  return result;
}

function parseStatsFromRaw(statsData: any[]): {
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  possession: { home: number; away: number };
  xG: { home: number; away: number };
  fouls: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
} {
  const result = {
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    corners: { home: 0, away: 0 },
    possession: { home: 50, away: 50 },
    xG: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    yellowCards: { home: 0, away: 0 },
    redCards: { home: 0, away: 0 },
  };

  if (!statsData || statsData.length < 2) {
    return result;
  }

  const getStat = (stats: any[], type: string): number => {
    const stat = stats.find((s: any) => s.type === type);
    if (!stat || stat.value === null) return 0;
    if (typeof stat.value === 'string') {
      return parseInt(stat.value.replace('%', ''), 10) || 0;
    }
    return stat.value;
  };

  const homeStats = statsData[0]?.statistics || [];
  const awayStats = statsData[1]?.statistics || [];

  result.shots.home = getStat(homeStats, 'Total Shots');
  result.shots.away = getStat(awayStats, 'Total Shots');
  result.shotsOnTarget.home = getStat(homeStats, 'Shots on Goal');
  result.shotsOnTarget.away = getStat(awayStats, 'Shots on Goal');
  result.corners.home = getStat(homeStats, 'Corner Kicks');
  result.corners.away = getStat(awayStats, 'Corner Kicks');
  result.possession.home = getStat(homeStats, 'Ball Possession');
  result.possession.away = getStat(awayStats, 'Ball Possession');
  result.xG.home = getStat(homeStats, 'expected_goals') || 0;
  result.xG.away = getStat(awayStats, 'expected_goals') || 0;
  result.fouls.home = getStat(homeStats, 'Fouls');
  result.fouls.away = getStat(awayStats, 'Fouls');
  result.yellowCards.home = getStat(homeStats, 'Yellow Cards');
  result.yellowCards.away = getStat(awayStats, 'Yellow Cards');
  result.redCards.home = getStat(homeStats, 'Red Cards');
  result.redCards.away = getStat(awayStats, 'Red Cards');

  return result;
}

function checkOddsSourceMatch(liveOdds: any, prematchOdds: any, parsed: any): boolean {
  // If we have live odds and _is_live is true, that's correct
  if (liveOdds?.odds?.length > 0 && parsed._is_live === true) {
    return true;
  }
  // If we only have prematch and _is_live is false, that's correct
  if ((!liveOdds?.odds?.length || liveOdds.odds.length === 0) &&
      prematchOdds?.bookmakers?.length > 0 &&
      parsed._is_live === false) {
    return true;
  }
  // If neither, and source is N/A, that's correct
  if (!liveOdds?.odds?.length && !prematchOdds?.bookmakers?.length && parsed._source === 'N/A') {
    return true;
  }
  return false;
}
