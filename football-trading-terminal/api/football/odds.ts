import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE_URL = 'https://v3.football.api-sports.io';

/**
 * 合并端点: 赔率数据
 *
 * GET /api/football/odds
 *
 * 用法:
 * - ?fixture=123           获取赛前赔率
 * - ?fixture=123&live=true 获取滚球赔率
 * - ?bookmaker=1           指定博彩公司ID
 * - ?bet=5                 指定盘口类型ID
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ status: 405, message: 'Method Not Allowed' });
  }

  const { fixture, live, bookmaker, bet } = req.query;
  const fixtureId = Array.isArray(fixture) ? fixture[0] : fixture;

  if (!fixtureId || !/^\d+$/.test(fixtureId)) {
    return res.status(400).json({ status: 400, message: 'Invalid fixture ID. Use ?fixture=xxx' });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ status: 500, message: 'API Key not configured on server' });
  }

  try {
    // 选择端点: 滚球赔率 or 赛前赔率
    const endpoint = live === 'true' ? '/odds/live' : '/odds';
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    url.searchParams.append('fixture', fixtureId);

    // 可选: 指定博彩公司
    if (bookmaker) {
      const bookmakerId = Array.isArray(bookmaker) ? bookmaker[0] : bookmaker;
      if (/^\d+$/.test(bookmakerId)) {
        url.searchParams.append('bookmaker', bookmakerId);
      }
    }

    // 可选: 指定盘口类型
    if (bet) {
      const betId = Array.isArray(bet) ? bet[0] : bet;
      if (/^\d+$/.test(betId)) {
        url.searchParams.append('bet', betId);
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

    // 滚球赔率缓存10秒，赛前赔率缓存5分钟
    const cacheTime = live === 'true' ? 's-maxage=10, stale-while-revalidate=20' : 's-maxage=300, stale-while-revalidate=600';
    res.setHeader('Cache-Control', cacheTime);
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ status: 500, message });
  }
}
