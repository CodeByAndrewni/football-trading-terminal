/**
 * VercelRequest 为 Node IncomingMessage，无 Web fetch 的 .json()。
 * 兼容 Vercel 已解析的 body 与原始流。
 */
import type { VercelRequest } from '@vercel/node';

export async function parseRequestJsonBody(req: VercelRequest): Promise<Record<string, unknown> | null> {
  const r = req as VercelRequest & { body?: unknown };

  if (r.body !== undefined && r.body !== null) {
    if (typeof r.body === 'string') {
      try {
        return JSON.parse(r.body) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (typeof r.body === 'object' && !Buffer.isBuffer(r.body)) {
      return r.body as Record<string, unknown>;
    }
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) {
          resolve(null);
          return;
        }
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}
