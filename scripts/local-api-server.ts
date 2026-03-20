#!/usr/bin/env bun

/**
 * 本地 API 测试服务器
 * 模拟 Vercel Serverless Functions 环境
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// 本地模式下：bun 默认不会自动读取项目根目录的 `.env`。
// 为了让 `FOOTBALL_API_KEY / MINIMAX_API_KEY / PERPLEXITY_API_KEY` 等
// 在本地 `bun run api:dev` 下也能生效，这里做一个极简 `.env` 解析器。
// ---------------------------------------------------------------------------
function loadLocalDotEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore
  }
}

loadLocalDotEnv();

// 单一入口：与 Vercel `api/[...path].ts` 一致
import apiRouter from '../api/[...path].ts';

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

    const handler = pathname.startsWith('/api') ? apiRouter : null;

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
console.log('\n📍 All /api/* routes use the unified handler (see api/[...path].ts)');
console.log('\n✨ Press Ctrl+C to stop\n');
