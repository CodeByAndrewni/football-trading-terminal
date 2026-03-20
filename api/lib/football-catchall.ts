/**
 * 统一入口：根据 URL 分发到 /api/football/fixtures|odds|stats|standings
 * 使 Vercel 仅部署 1 个 Serverless Function 覆盖原 4 个路由。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  handleFootballFixtures,
  handleFootballOdds,
  handleFootballStats,
  handleFootballStandings,
} from './football-http-handlers.js';

export default async function routeFootballApi(req: VercelRequest, res: VercelResponse) {
  const pathname = (req.url ?? '').split('?')[0];
  const match = pathname.match(/^\/api\/football\/([^/?]+)/);
  const segment = match?.[1] ?? '';

  if (segment === 'fixtures') {
    return handleFootballFixtures(req, res);
  }
  if (segment === 'odds') {
    return handleFootballOdds(req, res);
  }
  if (segment === 'stats') {
    return handleFootballStats(req, res);
  }
  if (segment === 'standings') {
    return handleFootballStandings(req, res);
  }

  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: segment
        ? `Unknown football route: ${segment}`
        : 'Use /api/football/fixtures|odds|stats|standings',
    },
  });
}
