/**
 * GET /api/football/odds
 * 获取赔率数据（初盘和实时盘）
 *
 * Query Params:
 * - fixture=<id>: 比赛ID（必填）
 * - live=true: 获取实时赔率（默认：false）
 * - bookmaker=<id>: 指定博彩公司（可选）
 *
 * 返回稳定的 JSON 结构，即使 API 失败也不会 500
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE = 'https://v3.football.api-sports.io';
const TIMEOUT_MS = 10000; // 10 秒超时
const CACHE_SECONDS = 60; // 缓存 60 秒（初盘）
const LIVE_CACHE_SECONDS = 15; // 缓存 15 秒（实时盘）

interface OddsResponse {
  fixtureId: number;
  bookmaker: {
    id: number;
    name: string;
  };
  markets: {
    id: number;
    name: string;
    values: Array<{
      value: string;
      odd: string;
      handicap?: string | null;
    }>;
  }[];
  update: string;
  isLive: boolean;
}

// 超时 fetch wrapper
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: { code: 'API_KEY_NOT_CONFIGURED', message: 'API key is not configured' },
      data: [],
    });
  }

  const { fixture, live, bookmaker } = req.query;

  // fixture 参数必填
  if (!fixture) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIXTURE_ID', message: 'fixture parameter is required' },
      data: [],
    });
  }

  const isLive = live === 'true' || live === '1';
  const endpoint = isLive ? '/odds/live' : '/odds';

  try {
    // 构建 API URL
    const params = new URLSearchParams();
    params.append('fixture', String(fixture));

    if (bookmaker) {
      params.append('bookmaker', String(bookmaker));
    }

    const url = `${API_BASE}${endpoint}?${params.toString()}`;

    console.log(`[ODDS] Fetching ${isLive ? 'live' : 'prematch'} odds: fixture=${fixture}`);

    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          'x-apisports-key': apiKey,
        },
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // 转换为稳定格式
    const odds: OddsResponse[] = [];

    if (data.response && data.response.length > 0) {
      for (const item of data.response) {
        // 实时赔率和赛前赔率结构略有不同
        if (isLive) {
          // 实时赔率：item.odds 是市场数组
          if (item.odds && item.odds.length > 0) {
            odds.push({
              fixtureId: item.fixture?.id ?? Number(fixture),
              bookmaker: {
                id: 0, // 实时赔率没有博彩公司字段
                name: 'Live',
              },
              markets: item.odds.map((market: any) => ({
                id: market.id ?? 0,
                name: market.name ?? '',
                values: (market.values || []).map((v: any) => ({
                  value: v.value ?? '',
                  odd: v.odd ?? '',
                  handicap: v.handicap ?? null,
                })),
              })),
              update: item.update ?? new Date().toISOString(),
              isLive: true,
            });
          }
        } else {
          // 赛前赔率：item.bookmakers 是博彩公司数组
          if (item.bookmakers && item.bookmakers.length > 0) {
            for (const bookmakerData of item.bookmakers) {
              odds.push({
                fixtureId: item.fixture?.id ?? Number(fixture),
                bookmaker: {
                  id: bookmakerData.id ?? 0,
                  name: bookmakerData.name ?? '',
                },
                markets: (bookmakerData.bets || []).map((bet: any) => ({
                  id: bet.id ?? 0,
                  name: bet.name ?? '',
                  values: (bet.values || []).map((v: any) => ({
                    value: v.value ?? '',
                    odd: v.odd ?? '',
                    handicap: v.handicap ?? null,
                  })),
                })),
                update: item.update ?? new Date().toISOString(),
                isLive: false,
              });
            }
          }
        }
      }
    }

    console.log(`[ODDS] Success: ${odds.length} bookmakers/markets`);

    // 设置缓存头
    const cacheSeconds = isLive ? LIVE_CACHE_SECONDS : CACHE_SECONDS;
    res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`);

    return res.status(200).json({
      success: true,
      data: odds,
      count: odds.length,
      isLive,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[ODDS] Error:', error);

    // 返回空数据结构（前端可以优雅降级）
    return res.status(200).json({
      success: false,
      error: {
        code: error.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
        message: error.message || 'Unknown error',
      },
      data: [],
      count: 0,
      isLive,
      timestamp: new Date().toISOString(),
    });
  }
}

export const config = {
  maxDuration: 15, // 15秒超时（Vercel Hobby 计划限制）
};
