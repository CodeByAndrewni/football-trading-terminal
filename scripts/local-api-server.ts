#!/usr/bin/env bun

/**
 * 本地 API 测试服务器
 * 模拟 Vercel Serverless Functions 环境
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// 导入 API 端点
import fixturesHandler from '../api/football/fixtures';
import oddsHandler from '../api/football/odds';
import statsHandler from '../api/football/stats';
import standingsHandler from '../api/football/standings';
import aiChatHandler from '../api/ai/chat';

const PORT = typeof process.env.PORT === 'string'
  ? Number(process.env.PORT)
  : typeof process.env.AI_API_PORT === 'string'
    ? Number(process.env.AI_API_PORT)
    : 3000;

// 创建模拟的 Vercel Response 对象
function createMockResponse(): VercelResponse {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let responseData: any = null;

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    setHeader: (name: string, value: string) => {
      headers[name] = value;
      return res;
    },
    json: (data: any) => {
      responseData = { statusCode, headers, data };
      return res;
    },
    getResponse: () => responseData,
  } as any as VercelResponse;

  return res;
}

// 路由处理
const routes: Record<string, (req: VercelRequest, res: VercelResponse) => Promise<any>> = {
  '/api/football/fixtures': fixturesHandler,
  '/api/football/odds': oddsHandler,
  '/api/football/stats': statsHandler,
  '/api/football/standings': standingsHandler,
  '/api/ai/chat': aiChatHandler,
};

// HTTP 服务器
const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 添加 CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理 OPTIONS 请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 查找匹配的路由
    const handler = routes[pathname];

    if (!handler) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not Found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      // 解析查询参数
      const query: Record<string, string | string[]> = {};
      for (const [key, value] of url.searchParams.entries()) {
        query[key] = value;
      }

      // 创建模拟的 Vercel Request
      // 注意：部分 handler 会调用 `req.json()`，所以这里需要实现该方法。
      const parsedBody = request.method !== 'GET' ? await request.json().catch(() => ({})) : {};
      const mockReq = {
        method: request.method,
        url: request.url,
        query,
        headers: Object.fromEntries(request.headers.entries()),
        body: parsedBody,
        json: async () => parsedBody,
      } as any as VercelRequest;

      // 创建模拟的 Vercel Response
      const mockRes = createMockResponse();

      // 调用处理函数
      await handler(mockReq, mockRes);

      const result = mockRes.getResponse();

      return new Response(JSON.stringify(result.data), {
        status: result.statusCode,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          ...result.headers,
        },
      });
    } catch (error) {
      console.error('Server error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
});

console.log(`🚀 Local API Server running on http://localhost:${PORT}`);
console.log('\n📍 Available endpoints:');
for (const route of Object.keys(routes)) {
  console.log(`   - http://localhost:${PORT}${route}`);
}
console.log('\n✨ Press Ctrl+C to stop\n');
