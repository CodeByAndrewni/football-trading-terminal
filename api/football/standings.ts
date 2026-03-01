/**
 * GET /api/football/standings
 * 获取联赛积分榜
 *
 * Query Params:
 * - league=<id>: 联赛ID（必填）
 * - season=<year>: 赛季年份（可选，默认当前年份）
 *
 * 返回稳定的 JSON 结构，即使 API 失败也不会 500
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_BASE = 'https://v3.football.api-sports.io';
const TIMEOUT_MS = 10000; // 10 秒超时
const CACHE_SECONDS = 3600; // 缓存 1 小时（积分榜不常变化）

interface StandingTeam {
  rank: number;
  team: {
    id: number;
    name: string;
    logo: string;
  };
  points: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  form: string;
}

interface StandingsResponse {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    season: number;
  };
  standings: StandingTeam[][];
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
      data: null,
    });
  }

  const { league, season } = req.query;

  // league 参数必填
  if (!league) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_LEAGUE_ID', message: 'league parameter is required' },
      data: null,
    });
  }

  try {
    // 构建 API URL
    const params = new URLSearchParams();
    params.append('league', String(league));

    // 默认使用当前年份
    const seasonYear = season ? String(season) : new Date().getFullYear().toString();
    params.append('season', seasonYear);

    const url = `${API_BASE}/standings?${params.toString()}`;

    console.log(`[STANDINGS] Fetching: league=${league}, season=${seasonYear}`);

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
    let standings: StandingsResponse | null = null;

    if (data.response && data.response.length > 0) {
      const item = data.response[0];

      const standingsData: StandingTeam[][] = (item.league?.standings || []).map((group: any[]) =>
        group.map((team: any) => ({
          rank: team.rank ?? 0,
          team: {
            id: team.team?.id ?? 0,
            name: team.team?.name ?? '',
            logo: team.team?.logo ?? '',
          },
          points: team.points ?? 0,
          played: team.all?.played ?? 0,
          win: team.all?.win ?? 0,
          draw: team.all?.draw ?? 0,
          lose: team.all?.lose ?? 0,
          goalsFor: team.all?.goals?.for ?? 0,
          goalsAgainst: team.all?.goals?.against ?? 0,
          goalsDiff: team.goalsDiff ?? 0,
          form: team.form ?? '',
        }))
      );

      standings = {
        league: {
          id: item.league?.id ?? Number(league),
          name: item.league?.name ?? '',
          country: item.league?.country ?? '',
          logo: item.league?.logo ?? '',
          season: item.league?.season ?? Number(seasonYear),
        },
        standings: standingsData,
      };
    }

    console.log(`[STANDINGS] Success: ${standings ? 'data found' : 'no data'}`);

    // 设置缓存头
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`);

    return res.status(200).json({
      success: true,
      data: standings,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[STANDINGS] Error:', error);

    // 返回空数据结构（前端可以优雅降级）
    return res.status(200).json({
      success: false,
      error: {
        code: error.name === 'AbortError' ? 'TIMEOUT' : 'API_ERROR',
        message: error.message || 'Unknown error',
      },
      data: null,
      timestamp: new Date().toISOString(),
    });
  }
}

export const config = {
  maxDuration: 15, // 15秒超时（Vercel Hobby 计划限制）
};
