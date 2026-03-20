/**
 * Hobby 套餐：仅 **1** 个 Serverless Function 入口，按路径分发到 api/lib/* 实现。
 * 原 URL 保持不变：/api/health、/api/matches、/api/ai/chat、/api/football/* 等。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import aiChatRoute from './lib/ai-chat-route.js';
import matchesRoute from './lib/matches-route.js';
import healthRoute from './lib/health-route.js';
import supabaseHeartbeatRoute from './lib/supabase-heartbeat-route.js';
import routeFootballApi from './lib/football-catchall.js';
import toolsBundleRoute from './lib/tools-bundle-route.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;

  if (pathname === '/api/health') {
    return healthRoute(req, res);
  }
  if (pathname === '/api/matches') {
    return matchesRoute(req, res);
  }
  if (pathname === '/api/ai/chat') {
    return aiChatRoute(req, res);
  }
  if (pathname.startsWith('/api/football')) {
    return routeFootballApi(req, res);
  }
  if (pathname === '/api/test' || pathname === '/api/verify-alignment' || pathname === '/api/tools-bundle') {
    return toolsBundleRoute(req, res);
  }
  if (pathname === '/api/supabase-heartbeat') {
    return supabaseHeartbeatRoute(req, res);
  }

  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `No handler for ${pathname}` },
  });
}

export const config = {
  maxDuration: 60,
};
