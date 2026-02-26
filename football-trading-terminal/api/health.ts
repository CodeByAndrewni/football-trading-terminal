import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  return res.status(200).json({ ok: true, timestamp: Date.now() });
}
