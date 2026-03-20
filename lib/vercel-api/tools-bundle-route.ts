/**
 * 合并 /api/test 与 /api/verify-alignment，节省 Serverless Function 配额。
 * 生产环境通过 vercel.json rewrites 将原路径指向本函数 + ?__route=
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import verifyAlignmentHandler from './verify-alignment-handler.js';

function handleTest(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');
  return res.status(200).json({
    success: true,
    message: 'Vercel Serverless Function is working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    env: {
      hasApiKey: !!process.env.FOOTBALL_API_KEY,
      nodeVersion: process.version,
    },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.url ?? '/';
  const pathOnly = raw.split('?')[0];
  const sp = new URL(raw, 'http://localhost');
  const viaRoute = sp.searchParams.get('__route');

  if (viaRoute === 'test' || pathOnly === '/api/test' || pathOnly.endsWith('/api/test')) {
    return handleTest(req, res);
  }
  if (
    viaRoute === 'verify-alignment' ||
    pathOnly === '/api/verify-alignment' ||
    pathOnly.endsWith('/verify-alignment')
  ) {
    return verifyAlignmentHandler(req, res);
  }

  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Use /api/test or /api/verify-alignment (rewrites)' },
  });
}
