import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/test
 * 简单的测试端点，用于验证 Vercel Serverless Functions 是否正常工作
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
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
