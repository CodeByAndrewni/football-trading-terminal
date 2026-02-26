import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE_URL = 'https://v3.football.api-sports.io';

/**
 * 获取联赛列表
 * GET /api/football/leagues
 *
 * 可选参数:
 * - id: 联赛ID (获取单个联赛)
 * - country: 国家名 (筛选)
 * - season: 赛季年份 (筛选)
 * - current: "true" (只获取当前赛季)
 * - type: "league" | "cup" (筛选类型)
 *
 * 返回联赛/杯赛信息列表
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 405, message: 'Method Not Allowed' });
  }

  const { id, country, season, current, type } = req.query;

  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ status: 500, message: 'API Key not configured on server' });
  }

  try {
    const url = new URL(`${API_BASE_URL}/leagues`);

    // 可选参数
    if (id) {
      const leagueId = Array.isArray(id) ? id[0] : id;
      if (/^\d+$/.test(leagueId)) {
        url.searchParams.append('id', leagueId);
      }
    }

    if (country) {
      const countryName = Array.isArray(country) ? country[0] : country;
      url.searchParams.append('country', countryName);
    }

    if (season) {
      const seasonYear = Array.isArray(season) ? season[0] : season;
      if (/^\d{4}$/.test(seasonYear)) {
        url.searchParams.append('season', seasonYear);
      }
    }

    if (current === 'true') {
      url.searchParams.append('current', 'true');
    }

    if (type) {
      const leagueType = Array.isArray(type) ? type[0] : type;
      if (leagueType === 'league' || leagueType === 'cup') {
        url.searchParams.append('type', leagueType);
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

    // 联赛信息很少变化，缓存24小时
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ status: 500, message });
  }
}
