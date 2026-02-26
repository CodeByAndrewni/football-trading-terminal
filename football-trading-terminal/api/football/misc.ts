import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE_URL = 'https://v3.football.api-sports.io';

/**
 * 杂项数据端点
 *
 * GET /api/football/misc
 *
 * 用法:
 * - ?type=coachs&id=123           获取教练信息
 * - ?type=coachs&team=33          获取球队教练
 * - ?type=coachs&search=Guardiola 搜索教练
 * - ?type=transfers&player=276    获取球员转会记录
 * - ?type=transfers&team=33       获取球队转会记录
 * - ?type=trophies&player=276     获取球员奖杯
 * - ?type=trophies&coach=123      获取教练奖杯
 * - ?type=sidelined&player=276    获取球员缺阵记录
 * - ?type=venues&id=556           获取球场信息
 * - ?type=venues&city=Manchester  搜索球场
 * - ?type=countries               获取所有国家
 * - ?type=timezones               获取所有时区
 * - ?type=seasons                 获取所有赛季
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 405, message: 'Method Not Allowed' });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ status: 500, message: 'API Key not configured on server' });
  }

  const { type, id, team, player, coach, search, city, country, name } = req.query;
  const dataType = Array.isArray(type) ? type[0] : type;

  if (!dataType) {
    return res.status(400).json({
      status: 400,
      message: 'type required. Use: coachs|transfers|trophies|sidelined|venues|countries|timezones|seasons'
    });
  }

  try {
    let url: URL;
    let cacheControl: string;

    switch (dataType) {
      // 教练信息
      case 'coachs': {
        const coachId = Array.isArray(id) ? id[0] : id;
        const teamId = Array.isArray(team) ? team[0] : team;
        const searchTerm = Array.isArray(search) ? search[0] : search;

        if (!coachId && !teamId && !searchTerm) {
          return res.status(400).json({ status: 400, message: 'id, team or search required for coachs' });
        }

        url = new URL(`${API_BASE_URL}/coachs`);
        if (coachId) url.searchParams.append('id', coachId);
        if (teamId) url.searchParams.append('team', teamId);
        if (searchTerm) url.searchParams.append('search', searchTerm);
        cacheControl = 's-maxage=86400, stale-while-revalidate=172800';
        break;
      }

      // 转会记录
      case 'transfers': {
        const playerId = Array.isArray(player) ? player[0] : player;
        const teamId = Array.isArray(team) ? team[0] : team;

        if (!playerId && !teamId) {
          return res.status(400).json({ status: 400, message: 'player or team required for transfers' });
        }

        url = new URL(`${API_BASE_URL}/transfers`);
        if (playerId) url.searchParams.append('player', playerId);
        if (teamId) url.searchParams.append('team', teamId);
        cacheControl = 's-maxage=86400, stale-while-revalidate=172800';
        break;
      }

      // 奖杯荣誉
      case 'trophies': {
        const playerId = Array.isArray(player) ? player[0] : player;
        const coachId = Array.isArray(coach) ? coach[0] : coach;

        if (!playerId && !coachId) {
          return res.status(400).json({ status: 400, message: 'player or coach required for trophies' });
        }

        url = new URL(`${API_BASE_URL}/trophies`);
        if (playerId) url.searchParams.append('player', playerId);
        if (coachId) url.searchParams.append('coach', coachId);
        cacheControl = 's-maxage=86400, stale-while-revalidate=172800';
        break;
      }

      // 缺阵记录
      case 'sidelined': {
        const playerId = Array.isArray(player) ? player[0] : player;
        const coachId = Array.isArray(coach) ? coach[0] : coach;

        if (!playerId && !coachId) {
          return res.status(400).json({ status: 400, message: 'player or coach required for sidelined' });
        }

        url = new URL(`${API_BASE_URL}/sidelined`);
        if (playerId) url.searchParams.append('player', playerId);
        if (coachId) url.searchParams.append('coach', coachId);
        cacheControl = 's-maxage=3600, stale-while-revalidate=7200';
        break;
      }

      // 球场信息
      case 'venues': {
        const venueId = Array.isArray(id) ? id[0] : id;
        const venueName = Array.isArray(name) ? name[0] : name;
        const venueCity = Array.isArray(city) ? city[0] : city;
        const venueCountry = Array.isArray(country) ? country[0] : country;
        const searchTerm = Array.isArray(search) ? search[0] : search;

        url = new URL(`${API_BASE_URL}/venues`);
        if (venueId) url.searchParams.append('id', venueId);
        if (venueName) url.searchParams.append('name', venueName);
        if (venueCity) url.searchParams.append('city', venueCity);
        if (venueCountry) url.searchParams.append('country', venueCountry);
        if (searchTerm) url.searchParams.append('search', searchTerm);
        cacheControl = 's-maxage=604800, stale-while-revalidate=1209600'; // 7 days
        break;
      }

      // 国家列表
      case 'countries': {
        const countryName = Array.isArray(name) ? name[0] : name;
        const countryCode = Array.isArray(search) ? search[0] : search;

        url = new URL(`${API_BASE_URL}/countries`);
        if (countryName) url.searchParams.append('name', countryName);
        if (countryCode) url.searchParams.append('code', countryCode);
        cacheControl = 's-maxage=604800, stale-while-revalidate=1209600'; // 7 days
        break;
      }

      // 时区列表
      case 'timezones': {
        url = new URL(`${API_BASE_URL}/timezone`);
        cacheControl = 's-maxage=604800, stale-while-revalidate=1209600'; // 7 days
        break;
      }

      // 赛季列表
      case 'seasons': {
        url = new URL(`${API_BASE_URL}/seasons`);
        cacheControl = 's-maxage=604800, stale-while-revalidate=1209600'; // 7 days
        break;
      }

      default:
        return res.status(400).json({
          status: 400,
          message: `Unknown type: ${dataType}. Use: coachs|transfers|trophies|sidelined|venues|countries|timezones|seasons`
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
