import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE_URL = 'https://v3.football.api-sports.io';

/**
 * 合并端点: 比赛/联赛数据
 *
 * GET /api/football/data
 *
 * 用法:
 * - ?type=predictions&fixture=123     获取比赛预测
 * - ?type=standings&league=39         获取联赛积分榜
 * - ?type=standings&league=39&season=2024
 * - ?type=lineups&fixture=123         获取比赛阵容
 * - ?type=team-stats&team=123&league=39  获取球队统计
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 405, message: 'Method Not Allowed' });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ status: 500, message: 'API Key not configured on server' });
  }

  const { type, fixture, league, team, season } = req.query;
  const dataType = Array.isArray(type) ? type[0] : type;

  if (!dataType) {
    return res.status(400).json({
      status: 400,
      message: 'type required. Use type=predictions|standings|lineups|team-stats'
    });
  }

  try {
    let url: URL;
    let cacheControl: string;

    switch (dataType) {
      case 'predictions': {
        const fixtureId = Array.isArray(fixture) ? fixture[0] : fixture;
        if (!fixtureId || !/^\d+$/.test(fixtureId)) {
          return res.status(400).json({ status: 400, message: 'Invalid fixture ID' });
        }
        url = new URL(`${API_BASE_URL}/predictions`);
        url.searchParams.append('fixture', fixtureId);
        cacheControl = 's-maxage=600, stale-while-revalidate=1200';
        break;
      }

      case 'standings': {
        const leagueId = Array.isArray(league) ? league[0] : league;
        if (!leagueId || !/^\d+$/.test(leagueId)) {
          return res.status(400).json({ status: 400, message: 'Invalid league ID' });
        }
        const seasonYear = Array.isArray(season) ? season[0] : season;
        const currentSeason = seasonYear || new Date().getFullYear().toString();

        url = new URL(`${API_BASE_URL}/standings`);
        url.searchParams.append('league', leagueId);
        url.searchParams.append('season', currentSeason);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      case 'lineups': {
        const fixtureId = Array.isArray(fixture) ? fixture[0] : fixture;
        if (!fixtureId || !/^\d+$/.test(fixtureId)) {
          return res.status(400).json({ status: 400, message: 'Invalid fixture ID' });
        }
        url = new URL(`${API_BASE_URL}/fixtures/lineups`);
        url.searchParams.append('fixture', fixtureId);
        cacheControl = 's-maxage=60, stale-while-revalidate=120';
        break;
      }

      case 'team-stats': {
        const teamId = Array.isArray(team) ? team[0] : team;
        const leagueId = Array.isArray(league) ? league[0] : league;
        if (!teamId || !/^\d+$/.test(teamId)) {
          return res.status(400).json({ status: 400, message: 'Invalid team ID' });
        }
        if (!leagueId || !/^\d+$/.test(leagueId)) {
          return res.status(400).json({ status: 400, message: 'League ID required. Use &league=X' });
        }
        const seasonYear = Array.isArray(season) ? season[0] : season;
        const currentSeason = seasonYear || new Date().getFullYear().toString();

        url = new URL(`${API_BASE_URL}/teams/statistics`);
        url.searchParams.append('team', teamId);
        url.searchParams.append('league', leagueId);
        url.searchParams.append('season', currentSeason);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      default:
        return res.status(400).json({
          status: 400,
          message: `Unknown type: ${dataType}. Use predictions|standings|lineups|team-stats`
        });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'x-apisports-key': apiKey },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        status: response.status,
        message: `Upstream API error: ${response.statusText}`,
      });
    }

    const data = await response.json();

    if (data.errors && Object.keys(data.errors).length > 0) {
      return res.status(400).json({
        status: 400,
        message: Object.values(data.errors).join(', '),
      });
    }

    res.setHeader('Cache-Control', cacheControl);
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ status: 500, message });
  }
}
