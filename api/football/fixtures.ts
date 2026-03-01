/**
 * GET /api/football/fixtures
 * 获取比赛基础信息（比分、时间、状态等）
 *
 * Query Params:
 * - live=true: 只返回进行中的比赛
 * - date=YYYY-MM-DD: 获取指定日期的比赛
 * - league=<id>: 指定联赛
 *
 * 返回稳定的 JSON 结构，即使 API 失败也不会 500
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE = 'https://v3.football.api-sports.io';
const TIMEOUT_MS = 10000; // 10 秒超时
const CACHE_SECONDS = 30; // 缓存 30 秒

interface FixtureResponse {
  fixtureId: number;
  date: string;
  timestamp: number;
  status: {
    long: string;
    short: string;
    elapsed: number | null;
  };
  league: {
    id: number;
    name: string;
    logo: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
    };
    away: {
      id: number;
      name: string;
      logo: string;
    };
  };
  score: {
    fulltime: {
      home: number | null;
      away: number | null;
    };
    halftime: {
      home: number | null;
      away: number | null;
    };
  };
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

  const { date, league, live, id } = req.query;

  try {
    // 构建 API URL
    const params = new URLSearchParams();

    if (id) {
      params.append('id', String(id));
    } else if (live === 'true' || live === '1') {
      params.append('live', 'all');
    } else if (date) {
      params.append('date', String(date));
    } else {
      // 默认获取今日比赛
      const today = new Date().toISOString().split('T')[0];
      params.append('date', today);
    }

    if (league && !id) {
      params.append('league', String(league));
    }

    const url = `${API_BASE}/fixtures?${params.toString()}`;

    console.log(`[FIXTURES] Fetching: ${url.replace(apiKey, '***')}`);

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
    const fixtures: FixtureResponse[] = (data.response || []).map((item: any) => ({
      fixtureId: item.fixture?.id ?? 0,
      date: item.fixture?.date ?? '',
      timestamp: item.fixture?.timestamp ?? 0,
      status: {
        long: item.fixture?.status?.long ?? 'Unknown',
        short: item.fixture?.status?.short ?? 'NS',
        elapsed: item.fixture?.status?.elapsed ?? null,
      },
      league: {
        id: item.league?.id ?? 0,
        name: item.league?.name ?? '',
        logo: item.league?.logo ?? '',
      },
      teams: {
        home: {
          id: item.teams?.home?.id ?? 0,
          name: item.teams?.home?.name ?? '',
          logo: item.teams?.home?.logo ?? '',
        },
        away: {
          id: item.teams?.away?.id ?? 0,
          name: item.teams?.away?.name ?? '',
          logo: item.teams?.away?.logo ?? '',
        },
      },
      score: {
        fulltime: {
          home: item.goals?.home ?? null,
          away: item.goals?.away ?? null,
        },
        halftime: {
          home: item.score?.halftime?.home ?? null,
          away: item.score?.halftime?.away ?? null,
        },
      },
    }));

    console.log(`[FIXTURES] Success: ${fixtures.length} fixtures`);

    // 设置缓存头
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`);

    return res.status(200).json({
      success: true,
      data: fixtures,
      count: fixtures.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[FIXTURES] Error:', error);

    // 返回空数据结构，而不是 500（前端可以优雅降级）
    return res.status(200).json({
      success: false,
      error: {
        code: error.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
        message: error.message || 'Unknown error',
      },
      data: [],
      count: 0,
      timestamp: new Date().toISOString(),
    });
  }
}

export const config = {
  maxDuration: 15, // 15秒超时（Vercel Hobby 计划限制）
};
