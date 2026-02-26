import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE_URL = 'https://v3.football.api-sports.io';

/**
 * 球员数据端点
 *
 * GET /api/football/players
 *
 * 用法:
 * - ?id=276&season=2023           获取指定球员信息
 * - ?team=33&season=2023          获取球队所有球员
 * - ?league=39&season=2023        获取联赛球员
 * - ?search=Messi                 搜索球员
 * - ?type=squads&team=33          获取球队阵容
 * - ?type=topscorers&league=39&season=2023  射手榜
 * - ?type=topassists&league=39&season=2023  助攻榜
 * - ?type=topyellowcards&league=39&season=2023  黄牌榜
 * - ?type=topredcards&league=39&season=2023  红牌榜
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 405, message: 'Method Not Allowed' });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ status: 500, message: 'API Key not configured on server' });
  }

  const { type, id, team, league, season, search, player, page } = req.query;
  const dataType = Array.isArray(type) ? type[0] : type;

  try {
    let url: URL;
    let cacheControl: string;

    switch (dataType) {
      // 获取球队阵容
      case 'squads': {
        const teamId = Array.isArray(team) ? team[0] : team;
        const playerId = Array.isArray(player) ? player[0] : player;

        if (!teamId && !playerId) {
          return res.status(400).json({ status: 400, message: 'team or player ID required for squads' });
        }

        url = new URL(`${API_BASE_URL}/players/squads`);
        if (teamId) url.searchParams.append('team', teamId);
        if (playerId) url.searchParams.append('player', playerId);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      // 射手榜
      case 'topscorers': {
        const leagueId = Array.isArray(league) ? league[0] : league;
        const seasonYear = Array.isArray(season) ? season[0] : season;

        if (!leagueId || !seasonYear) {
          return res.status(400).json({ status: 400, message: 'league and season required for topscorers' });
        }

        url = new URL(`${API_BASE_URL}/players/topscorers`);
        url.searchParams.append('league', leagueId);
        url.searchParams.append('season', seasonYear);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      // 助攻榜
      case 'topassists': {
        const leagueId = Array.isArray(league) ? league[0] : league;
        const seasonYear = Array.isArray(season) ? season[0] : season;

        if (!leagueId || !seasonYear) {
          return res.status(400).json({ status: 400, message: 'league and season required for topassists' });
        }

        url = new URL(`${API_BASE_URL}/players/topassists`);
        url.searchParams.append('league', leagueId);
        url.searchParams.append('season', seasonYear);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      // 黄牌榜
      case 'topyellowcards': {
        const leagueId = Array.isArray(league) ? league[0] : league;
        const seasonYear = Array.isArray(season) ? season[0] : season;

        if (!leagueId || !seasonYear) {
          return res.status(400).json({ status: 400, message: 'league and season required' });
        }

        url = new URL(`${API_BASE_URL}/players/topyellowcards`);
        url.searchParams.append('league', leagueId);
        url.searchParams.append('season', seasonYear);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      // 红牌榜
      case 'topredcards': {
        const leagueId = Array.isArray(league) ? league[0] : league;
        const seasonYear = Array.isArray(season) ? season[0] : season;

        if (!leagueId || !seasonYear) {
          return res.status(400).json({ status: 400, message: 'league and season required' });
        }

        url = new URL(`${API_BASE_URL}/players/topredcards`);
        url.searchParams.append('league', leagueId);
        url.searchParams.append('season', seasonYear);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      // 默认: 获取球员信息
      default: {
        const playerId = Array.isArray(id) ? id[0] : id;
        const teamId = Array.isArray(team) ? team[0] : team;
        const leagueId = Array.isArray(league) ? league[0] : league;
        const seasonYear = Array.isArray(season) ? season[0] : season;
        const searchTerm = Array.isArray(search) ? search[0] : search;
        const pageNum = Array.isArray(page) ? page[0] : page;

        // 必须有搜索条件
        if (!playerId && !teamId && !leagueId && !searchTerm) {
          return res.status(400).json({
            status: 400,
            message: 'id, team, league or search required. Use type=squads|topscorers|topassists for special endpoints'
          });
        }

        // season is required for players endpoint
        if (!seasonYear) {
          return res.status(400).json({ status: 400, message: 'season required for players endpoint' });
        }

        url = new URL(`${API_BASE_URL}/players`);
        if (playerId) url.searchParams.append('id', playerId);
        if (teamId) url.searchParams.append('team', teamId);
        if (leagueId) url.searchParams.append('league', leagueId);
        url.searchParams.append('season', seasonYear);
        if (searchTerm) url.searchParams.append('search', searchTerm);
        if (pageNum) url.searchParams.append('page', pageNum);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }
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
