/**
 * Vercel KV 封装层
 * 用于后端聚合层的缓存操作
 */

import { kv } from '@vercel/kv';

// ============================================
// 缓存配置
// ============================================

export const KV_CONFIG = {
  // 数据 TTL（秒）
  MATCHES_TTL: 90,           // 90秒 - 聚合结果（比 Cron 间隔稍长）
  META_TTL: 90,              // 90秒 - 刷新元数据
  STATISTICS_TTL: 90,        // 90秒 - 统计数据
  EVENTS_TTL: 90,            // 90秒 - 事件数据
  LIVE_ODDS_TTL: 60,         // 60秒 - 滚球赔率
  PREMATCH_ODDS_TTL: 300,    // 5分钟 - 赛前赔率
  LOCK_TTL: 45,              // 45秒 - 分布式锁
  METRICS_TTL: 86400,        // 24小时 - 监控指标
} as const;

// ============================================
// 缓存键
// ============================================

export const KV_KEYS = {
  matches: 'matches:live',
  meta: 'matches:meta',
  lock: 'refresh:lock',
  stats: (id: number) => `stats:${id}`,
  events: (id: number) => `events:${id}`,
  liveOdds: (id: number) => `odds:live:${id}`,
  prematchOdds: (id: number) => `odds:pre:${id}`,
  metricsDaily: (date: string) => `metrics:calls:${date}`,
  lastRefresh: 'refresh:last',
} as const;

// ============================================
// 类型定义
// ============================================

export interface RefreshMeta {
  lastRefresh: string;       // ISO timestamp
  nextRefresh: string;       // ISO timestamp
  matchCount: number;
  liveCount: number;
  apiCallsThisCycle: number;
  duration: number;          // 刷新耗时（毫秒）
  errors: string[];
  // 赔率覆盖率统计
  matchesWithAnyOdds?: number;      // 有任意赔率的比赛数
  matchesWithOverUnder?: number;    // 有大小球盘口的比赛数
  matchesWithStats?: number;        // 有统计数据的比赛数
}

export interface MatchesCache {
  matches: unknown[];        // AdvancedMatch[]
  timestamp: number;
}

// ============================================
// 基础操作
// ============================================

/**
 * 获取缓存数据
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const data = await kv.get<T>(key);
    return data;
  } catch (error) {
    console.error(`[KV] Get error for key ${key}:`, error);
    return null;
  }
}

/**
 * 设置缓存数据（带 TTL）
 */
export async function kvSet<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
  try {
    await kv.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (error) {
    console.error(`[KV] Set error for key ${key}:`, error);
    return false;
  }
}

/**
 * 删除缓存
 */
export async function kvDelete(key: string): Promise<boolean> {
  try {
    await kv.del(key);
    return true;
  } catch (error) {
    console.error(`[KV] Delete error for key ${key}:`, error);
    return false;
  }
}

/**
 * 检查键是否存在
 */
export async function kvExists(key: string): Promise<boolean> {
  try {
    const exists = await kv.exists(key);
    return exists > 0;
  } catch (error) {
    console.error(`[KV] Exists error for key ${key}:`, error);
    return false;
  }
}

// ============================================
// 分布式锁
// ============================================

/**
 * 尝试获取锁
 * @returns true 如果成功获取锁
 */
export async function acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
  try {
    // 使用 NX（不存在时才设置）来实现锁
    const result = await kv.set(lockKey, Date.now().toString(), {
      ex: ttlSeconds,
      nx: true,
    });
    return result === 'OK';
  } catch (error) {
    console.error(`[KV] Acquire lock error:`, error);
    return false;
  }
}

/**
 * 释放锁
 */
export async function releaseLock(lockKey: string): Promise<boolean> {
  return kvDelete(lockKey);
}

// ============================================
// 比赛数据操作
// ============================================

/**
 * 保存聚合后的比赛数据
 */
export async function saveMatches(matches: unknown[], meta: RefreshMeta): Promise<boolean> {
  try {
    const [matchesResult, metaResult] = await Promise.all([
      kvSet(KV_KEYS.matches, {
        matches,
        timestamp: Date.now(),
      }, KV_CONFIG.MATCHES_TTL),
      kvSet(KV_KEYS.meta, meta, KV_CONFIG.META_TTL),
    ]);
    return matchesResult && metaResult;
  } catch (error) {
    console.error(`[KV] Save matches error:`, error);
    return false;
  }
}

/**
 * 获取缓存的比赛数据
 */
export async function getMatches(): Promise<{
  matches: unknown[];
  meta: RefreshMeta | null;
  cacheAge: number;
} | null> {
  try {
    const [matchesCache, meta] = await Promise.all([
      kvGet<MatchesCache>(KV_KEYS.matches),
      kvGet<RefreshMeta>(KV_KEYS.meta),
    ]);

    if (!matchesCache) {
      return null;
    }

    const cacheAge = Math.floor((Date.now() - matchesCache.timestamp) / 1000);

    return {
      matches: matchesCache.matches,
      meta,
      cacheAge,
    };
  } catch (error) {
    console.error(`[KV] Get matches error:`, error);
    return null;
  }
}

// ============================================
// 批量操作
// ============================================

/**
 * 批量获取统计数据
 */
export async function getStatsBatch(fixtureIds: number[]): Promise<Map<number, unknown>> {
  const result = new Map<number, unknown>();

  if (fixtureIds.length === 0) return result;

  try {
    // 使用 mget 批量获取
    const keys = fixtureIds.map(id => KV_KEYS.stats(id));
    const values = await kv.mget(...keys);

    fixtureIds.forEach((id, index) => {
      if (values[index] !== null) {
        result.set(id, values[index]);
      }
    });
  } catch (error) {
    console.error(`[KV] Get stats batch error:`, error);
  }

  return result;
}

/**
 * 批量保存统计数据
 */
export async function setStatsBatch(statsMap: Map<number, unknown>): Promise<void> {
  if (statsMap.size === 0) return;

  try {
    const pipeline = kv.pipeline();

    for (const [id, stats] of statsMap) {
      pipeline.set(KV_KEYS.stats(id), stats, { ex: KV_CONFIG.STATISTICS_TTL });
    }

    await pipeline.exec();
  } catch (error) {
    console.error(`[KV] Set stats batch error:`, error);
  }
}

/**
 * 批量获取赛前赔率
 */
export async function getPrematchOddsBatch(fixtureIds: number[]): Promise<Map<number, unknown>> {
  const result = new Map<number, unknown>();

  if (fixtureIds.length === 0) return result;

  try {
    const keys = fixtureIds.map(id => KV_KEYS.prematchOdds(id));
    const values = await kv.mget(...keys);

    fixtureIds.forEach((id, index) => {
      if (values[index] !== null) {
        result.set(id, values[index]);
      }
    });
  } catch (error) {
    console.error(`[KV] Get prematch odds batch error:`, error);
  }

  return result;
}

/**
 * 批量保存赛前赔率
 */
export async function setPrematchOddsBatch(oddsMap: Map<number, unknown>): Promise<void> {
  if (oddsMap.size === 0) return;

  try {
    const pipeline = kv.pipeline();

    for (const [id, odds] of oddsMap) {
      pipeline.set(KV_KEYS.prematchOdds(id), odds, { ex: KV_CONFIG.PREMATCH_ODDS_TTL });
    }

    await pipeline.exec();
  } catch (error) {
    console.error(`[KV] Set prematch odds batch error:`, error);
  }
}

// ============================================
// 监控指标
// ============================================

/**
 * 增加当日 API 调用计数
 */
export async function incrementApiCalls(count: number): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = KV_KEYS.metricsDaily(today);

  try {
    const newCount = await kv.incrby(key, count);
    // 设置过期时间（如果是新 key）
    await kv.expire(key, KV_CONFIG.METRICS_TTL);
    return newCount;
  } catch (error) {
    console.error(`[KV] Increment API calls error:`, error);
    return 0;
  }
}

/**
 * 获取当日 API 调用计数
 */
export async function getApiCallsToday(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = KV_KEYS.metricsDaily(today);

  try {
    const count = await kv.get<number>(key);
    return count || 0;
  } catch (error) {
    console.error(`[KV] Get API calls error:`, error);
    return 0;
  }
}

// ============================================
// 健康检查
// ============================================

/**
 * 检查 KV 连接状态
 */
export async function checkKVHealth(): Promise<{
  connected: boolean;
  lastWrite: string | null;
  matchCount: number;
  error?: string;
}> {
  try {
    // 尝试读取元数据
    const meta = await kvGet<RefreshMeta>(KV_KEYS.meta);

    return {
      connected: true,
      lastWrite: meta?.lastRefresh || null,
      matchCount: meta?.matchCount || 0,
    };
  } catch (error) {
    return {
      connected: false,
      lastWrite: null,
      matchCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
