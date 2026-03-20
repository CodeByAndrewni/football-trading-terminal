/**
 * /api/football/* 子路由逻辑（由单个 Serverless Function 统一转发）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE = 'https://v3.football.api-sports.io';
const TIMEOUT_MS = 10000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/** GET /api/football/fixtures */
export async function handleFootballFixtures(req: VercelRequest, res: VercelResponse) {
  const CACHE_SECONDS = 30;
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'API_KEY_NOT_CONFIGURED', message: 'API key is not configured' },
      data: [],
    });
  }

  const { date, league, live, id } = req.query;

  try {
    const params = new URLSearchParams();
    if (id) {
      params.append('id', String(id));
    } else if (live === 'true' || live === '1') {
      params.append('live', 'all');
    } else if (date) {
      params.append('date', String(date));
    } else {
      const today = new Date().toISOString().split('T')[0];
      params.append('date', today);
    }
    if (league && !id) {
      params.append('league', String(league));
    }

    const url = `${API_BASE}/fixtures?${params.toString()}`;
    console.log(`[FIXTURES] Fetching: ${url.replace(apiKey, '***')}`);

    const response = await fetchWithTimeout(
      url,
      { headers: { 'x-apisports-key': apiKey } },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const fixtures = (data.response || []).map((item: any) => ({
      fixtureId: item.fixture?.id ?? 0,
      date: item.fixture?.date ?? '',
      timestamp: item.fixture?.timestamp ?? 0,
      status: {
        long: item.fixture?.status?.long ?? 'Unknown',
        short: item.fixture?.status?.short ?? 'NS',
        elapsed: item.fixture?.status?.elapsed ?? null,
      },
      league: {
        id: item.league?.id ?? 0,
        name: item.league?.name ?? '',
        logo: item.league?.logo ?? '',
      },
      teams: {
        home: {
          id: item.teams?.home?.id ?? 0,
          name: item.teams?.home?.name ?? '',
          logo: item.teams?.home?.logo ?? '',
        },
        away: {
          id: item.teams?.away?.id ?? 0,
          name: item.teams?.away?.name ?? '',
          logo: item.teams?.away?.logo ?? '',
        },
      },
      score: {
        fulltime: {
          home: item.goals?.home ?? null,
          away: item.goals?.away ?? null,
        },
        halftime: {
          home: item.score?.halftime?.home ?? null,
          away: item.score?.halftime?.away ?? null,
        },
      },
    }));

    console.log(`[FIXTURES] Success: ${fixtures.length} fixtures`);
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
    );
    return res.status(200).json({
      success: true,
      data: fixtures,
      count: fixtures.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[FIXTURES] Error:', error);
    return res.status(200).json({
      success: false,
      error: {
        code: error.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
        message: error.message || 'Unknown error',
      },
      data: [],
      count: 0,
      timestamp: new Date().toISOString(),
    });
  }
}

/** GET /api/football/odds */
export async function handleFootballOdds(req: VercelRequest, res: VercelResponse) {
  const CACHE_SECONDS = 60;
  const LIVE_CACHE_SECONDS = 15;
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'API_KEY_NOT_CONFIGURED', message: 'API key is not configured' },
      data: [],
    });
  }

  const { fixture, live, bookmaker } = req.query;
  if (!fixture) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIXTURE_ID', message: 'fixture parameter is required' },
      data: [],
    });
  }

  const isLive = live === 'true' || live === '1';
  const endpoint = isLive ? '/odds/live' : '/odds';

  try {
    const params = new URLSearchParams();
    params.append('fixture', String(fixture));
    if (bookmaker) {
      params.append('bookmaker', String(bookmaker));
    }
    const url = `${API_BASE}${endpoint}?${params.toString()}`;
    console.log(`[ODDS] Fetching ${isLive ? 'live' : 'prematch'} odds: fixture=${fixture}`);

    const response = await fetchWithTimeout(
      url,
      { headers: { 'x-apisports-key': apiKey } },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const odds: any[] = [];

    if (data.response && data.response.length > 0) {
      for (const item of data.response) {
        if (isLive) {
          if (item.odds && item.odds.length > 0) {
            odds.push({
              fixtureId: item.fixture?.id ?? Number(fixture),
              bookmaker: { id: 0, name: 'Live' },
              markets: item.odds.map((market: any) => ({
                id: market.id ?? 0,
                name: market.name ?? '',
                values: (market.values || []).map((v: any) => ({
                  value: v.value ?? '',
                  odd: v.odd ?? '',
                  handicap: v.handicap ?? null,
                })),
              })),
              update: item.update ?? new Date().toISOString(),
              isLive: true,
            });
          }
        } else if (item.bookmakers && item.bookmakers.length > 0) {
          for (const bookmakerData of item.bookmakers) {
            odds.push({
              fixtureId: item.fixture?.id ?? Number(fixture),
              bookmaker: {
                id: bookmakerData.id ?? 0,
                name: bookmakerData.name ?? '',
              },
              markets: (bookmakerData.bets || []).map((bet: any) => ({
                id: bet.id ?? 0,
                name: bet.name ?? '',
                values: (bet.values || []).map((v: any) => ({
                  value: v.value ?? '',
                  odd: v.odd ?? '',
                  handicap: v.handicap ?? null,
                })),
              })),
              update: item.update ?? new Date().toISOString(),
              isLive: false,
            });
          }
        }
      }
    }

    console.log(`[ODDS] Success: ${odds.length} bookmakers/markets`);
    const cacheSeconds = isLive ? LIVE_CACHE_SECONDS : CACHE_SECONDS;
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`,
    );
    return res.status(200).json({
      success: true,
      data: odds,
      count: odds.length,
      isLive,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[ODDS] Error:', error);
    return res.status(200).json({
      success: false,
      error: {
        code: error.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
        message: error.message || 'Unknown error',
      },
      data: [],
      count: 0,
      isLive,
      timestamp: new Date().toISOString(),
    });
  }
}

/** GET /api/football/stats */
export async function handleFootballStats(req: VercelRequest, res: VercelResponse) {
  const CACHE_SECONDS = 30;
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'API_KEY_NOT_CONFIGURED', message: 'API key is not configured' },
      data: [],
    });
  }

  const { fixture } = req.query;
  if (!fixture) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIXTURE_ID', message: 'fixture parameter is required' },
      data: [],
    });
  }

  try {
    const params = new URLSearchParams();
    params.append('fixture', String(fixture));
    const url = `${API_BASE}/fixtures/statistics?${params.toString()}`;
    console.log(`[STATS] Fetching: fixture=${fixture}`);

    const response = await fetchWithTimeout(
      url,
      { headers: { 'x-apisports-key': apiKey } },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const stats = (data.response || []).map((item: any) => ({
      team: {
        id: item.team?.id ?? 0,
        name: item.team?.name ?? '',
        logo: item.team?.logo ?? '',
      },
      stats: (item.statistics || []).map((stat: any) => ({
        type: stat.type ?? '',
        value: stat.value ?? null,
      })),
    }));

    console.log(`[STATS] Success: ${stats.length} teams`);
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
    );
    return res.status(200).json({
      success: true,
      data: stats,
      count: stats.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[STATS] Error:', error);
    return res.status(200).json({
      success: false,
      error: {
        code: error.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
        message: error.message || 'Unknown error',
      },
      data: [],
      count: 0,
      timestamp: new Date().toISOString(),
    });
  }
}

/** GET /api/football/standings */
export async function handleFootballStandings(req: VercelRequest, res: VercelResponse) {
  const CACHE_SECONDS = 3600;
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'API_KEY_NOT_CONFIGURED', message: 'API key is not configured' },
      data: null,
    });
  }

  const { league, season } = req.query;
  if (!league) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_LEAGUE_ID', message: 'league parameter is required' },
      data: null,
    });
  }

  try {
    const params = new URLSearchParams();
    params.append('league', String(league));
    const seasonYear = season ? String(season) : new Date().getFullYear().toString();
    params.append('season', seasonYear);
    const url = `${API_BASE}/standings?${params.toString()}`;
    console.log(`[STANDINGS] Fetching: league=${league}, season=${seasonYear}`);

    const response = await fetchWithTimeout(
      url,
      { headers: { 'x-apisports-key': apiKey } },
      TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    let standings: any = null;

    if (data.response && data.response.length > 0) {
      const item = data.response[0];
      const standingsData = (item.league?.standings || []).map((group: any[]) =>
        group.map((team: any) => ({
          rank: team.rank ?? 0,
          team: {
            id: team.team?.id ?? 0,
            name: team.team?.name ?? '',
            logo: team.team?.logo ?? '',
          },
          points: team.points ?? 0,
          played: team.all?.played ?? 0,
          win: team.all?.win ?? 0,
          draw: team.all?.draw ?? 0,
          lose: team.all?.lose ?? 0,
          goalsFor: team.all?.goals?.for ?? 0,
          goalsAgainst: team.all?.goals?.against ?? 0,
          goalsDiff: team.goalsDiff ?? 0,
          form: team.form ?? '',
        })),
      );

      standings = {
        league: {
          id: item.league?.id ?? Number(league),
          name: item.league?.name ?? '',
          country: item.league?.country ?? '',
          logo: item.league?.logo ?? '',
          season: item.league?.season ?? Number(seasonYear),
        },
        standings: standingsData,
      };
    }

    console.log(`[STANDINGS] Success: ${standings ? 'data found' : 'no data'}`);
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
    );
    return res.status(200).json({
      success: true,
      data: standings,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[STANDINGS] Error:', error);
    return res.status(200).json({
      success: false,
      error: {
        code: error.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
        message: error.message || 'Unknown error',
      },
      data: null,
      timestamp: new Date().toISOString(),
    });
  }
}
