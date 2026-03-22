/**
 * Hobby 套餐：仅 **1** 个 Serverless Function 入口，按路径分发到 lib/vercel-api/ 实现。
 * （实现代码必须放在 api/ 外，否则 Vercel 会把 api 下每个 .ts 都计为一个 Function。）
 * 原 URL 保持不变：/api/health、/api/matches、/api/ai/chat、/api/football/… 等。
 *
 * 使用动态 import：避免请求 /api/matches 时静态加载 ai-chat（含 scoringEngine 等大依赖），
 * 降低冷启动内存与 FUNCTION_INVOCATION_FAILED 风险。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPathname = new URL(req.url || '/', 'http://localhost').pathname;
  const pathname =
    rawPathname.length > 1 && rawPathname.endsWith('/')
      ? rawPathname.slice(0, -1)
      : rawPathname;

  try {
    if (pathname === '/api/health') {
      const { default: route } = await import('../lib/vercel-api/health-route.js');
      return route(req, res);
    }
    if (pathname === '/api/matches') {
      const { default: route } = await import('../lib/vercel-api/matches-route.js');
      return route(req, res);
    }
    if (pathname === '/api/ai/chat') {
      const { default: route } = await import('../lib/vercel-api/ai-chat-route.js');
      return route(req, res);
    }
    if (pathname === '/api/ai/journal') {
      const { default: route } = await import('../lib/vercel-api/ai-journal-route.js');
      return route(req, res);
    }
    if (pathname.startsWith('/api/football')) {
      const { default: route } = await import('../lib/vercel-api/football-catchall.js');
      return route(req, res);
    }
    if (pathname === '/api/test' || pathname === '/api/verify-alignment' || pathname === '/api/tools-bundle') {
      const { default: route } = await import('../lib/vercel-api/tools-bundle-route.js');
      return route(req, res);
    }
    if (pathname === '/api/supabase-heartbeat') {
      const { default: route } = await import('../lib/vercel-api/supabase-heartbeat-route.js');
      return route(req, res);
    }

    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `No handler for ${pathname}` },
    });
  } catch (err) {
    console.error('[api][...path] handler error:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
    });
  }
}

export const config = {
  maxDuration: 180,
};
