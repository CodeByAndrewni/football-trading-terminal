/**
 * 单 Serverless Function 入口，按路径分发到 lib/vercel-api/ 实现。
 *
 * 使用 **静态 import** 而非 dynamic import：Vercel bundler (nft) 对 dynamic import
 * 的依赖追踪经常漏掉间接模块（如 scoringEngine、aiContext），导致部署后
 * ERR_MODULE_NOT_FOUND 或 500。静态 import 让 bundler 确定性地包含全部文件。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import healthRoute from '../lib/vercel-api/health-route.js';
import matchesRoute from '../lib/vercel-api/matches-route.js';
import aiChatRoute from '../lib/vercel-api/ai-chat-route.js';
import aiJournalRoute from '../lib/vercel-api/ai-journal-route.js';
import footballCatchall from '../lib/vercel-api/football-catchall.js';
import toolsBundleRoute from '../lib/vercel-api/tools-bundle-route.js';
import supabaseHeartbeatRoute from '../lib/vercel-api/supabase-heartbeat-route.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPathname = new URL(req.url || '/', 'http://localhost').pathname;
  const pathname =
    rawPathname.length > 1 && rawPathname.endsWith('/')
      ? rawPathname.slice(0, -1)
      : rawPathname;

  try {
    if (pathname === '/api/health') return healthRoute(req, res);
    if (pathname === '/api/matches') return matchesRoute(req, res);
    if (pathname === '/api/ai/chat') return aiChatRoute(req, res);
    if (pathname === '/api/ai/journal') return aiJournalRoute(req, res);
    if (pathname.startsWith('/api/football')) return footballCatchall(req, res);
    if (pathname === '/api/test' || pathname === '/api/verify-alignment' || pathname === '/api/tools-bundle') {
      return toolsBundleRoute(req, res);
    }
    if (pathname === '/api/supabase-heartbeat') return supabaseHeartbeatRoute(req, res);

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
