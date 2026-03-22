import type { VercelRequest, VercelResponse } from '@vercel/node';
import aiChatRoute from '../../lib/vercel-api/ai-chat-route.js';

/**
 * 独立保底入口：避免个别环境下 catch-all 对 /api/ai/chat 的匹配异常。
 * 仍复用同一套服务端实现。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return aiChatRoute(req, res);
}

export const config = {
  maxDuration: 180,
};
