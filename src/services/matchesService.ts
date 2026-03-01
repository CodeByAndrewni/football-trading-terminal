/**
 * 比赛数据服务 (新架构)
 *
 * 调用后端聚合 API `/api/matches` 获取数据
 * 替代原有的直连 API-Football 模式
 */

import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================
// 类型定义
// ============================================

export interface MatchesMeta {
  total: number;
  live: number;
  lastRefresh: string | null;
  nextRefresh: string | null;
  cacheAge: number;
  apiCallsToday: number;
  status: 'FRESH' | 'STALE' | 'STALE_REFRESHING' | 'INITIALIZING';
  refreshDuration?: number;
  errors?: string[];
  message?: string;
  // 赔率覆盖率统计
  matchesWithAnyOdds?: number;
  matchesWithOverUnder?: number;
  matchesWithStats?: number;
}

export interface MatchesAPIResponse {
  success: boolean;
  data?: {
    matches: AdvancedMatch[];
    meta: MatchesMeta;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface MatchesResult {
  matches: AdvancedMatch[];
  meta: MatchesMeta;
}

// ============================================
// 配置
// ============================================

const CONFIG = {
  // API 端点
  MATCHES_ENDPOINT: '/api/matches',

  // 请求超时
  TIMEOUT_MS: 10000,

  // 重试配置
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
};

// ============================================
// 错误类型
// ============================================

export class MatchesAPIError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MatchesAPIError';
    this.code = code;
  }
}

// ============================================
// API 调用
// ============================================

/**
 * 获取聚合后的比赛数据
 *
 * @returns 比赛列表和元数据
 * @throws MatchesAPIError
 */
export async function fetchAggregatedMatches(): Promise<MatchesResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

      const response = await fetch(CONFIG.MATCHES_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new MatchesAPIError(
          'HTTP_ERROR',
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data: MatchesAPIResponse = await response.json();

      if (!data.success) {
        throw new MatchesAPIError(
          data.error?.code || 'API_ERROR',
          data.error?.message || 'Unknown API error'
        );
      }

      if (!data.data) {
        throw new MatchesAPIError('NO_DATA', 'No data in response');
      }

      return {
        matches: data.data.matches,
        meta: data.data.meta,
      };

    } catch (error) {
      lastError = error as Error;

      // 如果是最后一次尝试，不再重试
      if (attempt === CONFIG.MAX_RETRIES) {
        break;
      }

      // 某些错误不需要重试
      if (error instanceof MatchesAPIError) {
        if (['AUTH_ERROR', 'NOT_FOUND'].includes(error.code)) {
          break;
        }
      }

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
      console.log(`[MatchesService] Retry attempt ${attempt + 1}...`);
    }
  }

  // 所有重试都失败
  if (lastError instanceof MatchesAPIError) {
    throw lastError;
  }

  throw new MatchesAPIError(
    'FETCH_FAILED',
    lastError?.message || 'Failed to fetch matches'
  );
}

// ============================================
// 辅助函数
// ============================================

/**
 * 检查缓存是否陈旧
 */
export function isCacheStale(meta: MatchesMeta): boolean {
  return meta.status === 'STALE' || meta.status === 'STALE_REFRESHING' || meta.cacheAge > 120;
}

/**
 * 检查服务是否正在初始化
 */
export function isInitializing(meta: MatchesMeta): boolean {
  return meta.status === 'INITIALIZING';
}

/**
 * 获取缓存年龄的可读字符串
 */
export function getCacheAgeText(meta: MatchesMeta): string {
  const age = meta.cacheAge;
  if (age < 60) {
    return `${age}秒前`;
  }
  const minutes = Math.floor(age / 60);
  return `${minutes}分钟前`;
}

/**
 * 获取下次刷新的倒计时（秒）
 */
export function getNextRefreshCountdown(meta: MatchesMeta): number {
  if (!meta.nextRefresh) return 60;

  const nextRefreshTime = new Date(meta.nextRefresh).getTime();
  const now = Date.now();
  const remaining = Math.max(0, Math.floor((nextRefreshTime - now) / 1000));

  return remaining;
}

// ============================================
// 兼容层 - 保持与旧 API 的接口一致
// ============================================

/**
 * 获取进行中的比赛（高级格式）
 * 兼容旧的 getLiveMatchesAdvanced 接口
 */
export async function getLiveMatchesFromAggregator(): Promise<AdvancedMatch[]> {
  const result = await fetchAggregatedMatches();
  return result.matches;
}

/**
 * 检查聚合 API 是否可用
 * 本地开发时返回 false，因为没有 /api/matches 端点
 * 部署后返回 true，使用 Vercel/Netlify 的 serverless functions
 */
export function isAggregatorAvailable(): boolean {
  // 本地开发时，聚合 API 不可用，直接使用直连模式
  if (import.meta.env.DEV) {
    return false;
  }
  // 生产环境使用聚合 API
  return true;
}
