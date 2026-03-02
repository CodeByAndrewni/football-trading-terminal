// ============================================
// Odds Batch Optimizer - 优化赔率 API 请求批处理
// 功能：请求去重、缓存、优先级排序、智能批次
// Phase 3.0: 添加赛前赔率缓存
// ============================================

import type { LiveOddsData, Match, OddsData } from '../types';
import { hasLiveOddsCoverage } from '../config/constants';

// ============================================
// 请求缓存配置
// ============================================
const LIVE_CACHE_TTL_MS = 15000; // 实时赔率缓存有效期 15 秒
const PREMATCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 赛前赔率缓存有效期 24 小时（刷新频率由调度控制）
const MAX_CACHE_SIZE = 200; // 最大缓存条目数

interface CachedOddsEntry {
  data: LiveOddsData[];
  timestamp: number;
  fixtureId: number;
}

interface CachedPrematchEntry {
  data: OddsData[];
  timestamp: number;
  fixtureId: number;
}

// 全局赔率缓存
const oddsCache = new Map<number, CachedOddsEntry>();

// 赛前赔率缓存
const prematchOddsCache = new Map<number, CachedPrematchEntry>();

// 正在请求中的 fixture IDs（用于去重）
const pendingRequests = new Map<number, Promise<LiveOddsData[]>>();
const pendingPrematchRequests = new Map<number, Promise<OddsData[]>>();

// ============================================
// 缓存管理
// ============================================

/**
 * 获取缓存的赔率数据
 */
export function getCachedOdds(fixtureId: number): LiveOddsData[] | null {
  const entry = oddsCache.get(fixtureId);
  if (!entry) return null;

  // 检查是否过期
  if (Date.now() - entry.timestamp > LIVE_CACHE_TTL_MS) {
    oddsCache.delete(fixtureId);
    return null;
  }

  return entry.data;
}

/**
 * 设置缓存的赔率数据
 */
export function setCachedOdds(fixtureId: number, data: LiveOddsData[]): void {
  // 限制缓存大小 - LRU 策略
  if (oddsCache.size >= MAX_CACHE_SIZE) {
    // 删除最旧的条目
    let oldestKey: number | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, entry] of oddsCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      oddsCache.delete(oldestKey);
    }
  }

  oddsCache.set(fixtureId, {
    data,
    timestamp: Date.now(),
    fixtureId,
  });
}

// ============================================
// 赛前赔率缓存管理 (Phase 3.0)
// ============================================

/**
 * 获取缓存的赛前赔率数据
 */
export function getCachedPrematchOdds(fixtureId: number): OddsData[] | null {
  const entry = prematchOddsCache.get(fixtureId);
  if (!entry) return null;

  // 检查是否过期
  if (Date.now() - entry.timestamp > PREMATCH_CACHE_TTL_MS) {
    prematchOddsCache.delete(fixtureId);
    return null;
  }

  prematchCacheHits++;
  return entry.data;
}

/**
 * 设置缓存的赛前赔率数据
 */
export function setCachedPrematchOdds(fixtureId: number, data: OddsData[]): void {
  // 限制缓存大小 - LRU 策略
  if (prematchOddsCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: number | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, entry] of prematchOddsCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      prematchOddsCache.delete(oldestKey);
    }
  }

  prematchOddsCache.set(fixtureId, {
    data,
    timestamp: Date.now(),
    fixtureId,
  });
}

// 赛前赔率缓存命中统计
let prematchCacheHits = 0;
const prematchCacheMisses = 0;

/**
 * 清除缓存
 */
export function clearOddsCache(): void {
  oddsCache.clear();
  prematchOddsCache.clear();
  pendingRequests.clear();
  pendingPrematchRequests.clear();
}

/**
 * 获取缓存统计
 */
export function getCacheStats(): {
  size: number;
  hitRate: string;
  prematchSize: number;
  prematchHitRate: string;
} {
  return {
    size: oddsCache.size,
    hitRate: `${((cacheHits / Math.max(cacheHits + cacheMisses, 1)) * 100).toFixed(1)}%`,
    prematchSize: prematchOddsCache.size,
    prematchHitRate: `${((prematchCacheHits / Math.max(prematchCacheHits + prematchCacheMisses, 1)) * 100).toFixed(1)}%`,
  };
}

// 缓存命中统计
let cacheHits = 0;
let cacheMisses = 0;

// ============================================
// 优先级排序
// ============================================

interface MatchPriority {
  fixtureId: number;
  priority: number; // 数值越低优先级越高
  hasCoverage: boolean;
  minute: number;
}

/**
 * 计算比赛的赔率请求优先级
 * 优先级规则：
 * 1. 有赔率覆盖的联赛优先
 * 2. 比赛分钟越大越优先（接近结束的比赛）
 * 3. 用户关注的比赛优先
 */
export function calculateOddsPriority(
  match: Match,
  watchedIds?: Set<number>
): MatchPriority {
  const fixtureId = match.fixture.id;
  const leagueId = match.league.id;
  const minute = match.fixture.status.elapsed || 0;
  const hasCoverage = hasLiveOddsCoverage(leagueId);
  const isWatched = watchedIds?.has(fixtureId) ?? false;

  // 计算优先级分数（越低越优先）
  let priority = 1000;

  // 有赔率覆盖：-500
  if (hasCoverage) priority -= 500;

  // 用户关注：-200
  if (isWatched) priority -= 200;

  // 比赛时间：75分钟以上优先
  if (minute >= 80) priority -= 100;
  else if (minute >= 75) priority -= 80;
  else if (minute >= 70) priority -= 60;
  else if (minute >= 60) priority -= 40;
  else if (minute >= 45) priority -= 20;

  return {
    fixtureId,
    priority,
    hasCoverage,
    minute,
  };
}

/**
 * 按优先级排序比赛
 */
export function sortMatchesByOddsPriority(
  matches: Match[],
  watchedIds?: Set<number>
): Match[] {
  const priorities = matches.map(m => ({
    match: m,
    ...calculateOddsPriority(m, watchedIds),
  }));

  priorities.sort((a, b) => a.priority - b.priority);

  return priorities.map(p => p.match);
}

// ============================================
// 智能批处理
// ============================================

interface BatchConfig {
  batchSize: number;       // 每批数量
  delayBetweenBatches: number; // 批次间延迟（ms）
  maxConcurrency: number;  // 最大并发数
}

/**
 * 根据当前情况计算最优批处理配置
 * 🔥 v163: 大幅降低请求频率以避免 Rate Limit
 */
export function calculateOptimalBatchConfig(
  totalMatches: number,
  matchesWithCoverage: number
): BatchConfig {
  // 🔥 保守配置避免 Rate Limit (API限制: 30 requests/minute)
  // 每分钟最多 30 请求 = 每 2 秒 1 请求
  let batchSize = 3;  // 每批只请求 3 个
  let delayBetweenBatches = 2500; // 2.5 秒间隔
  let maxConcurrency = 3;

  // 根据比赛数量微调
  if (totalMatches <= 10) {
    batchSize = 3;
    delayBetweenBatches = 2000; // 2 秒
    maxConcurrency = 3;
  } else if (totalMatches <= 20) {
    batchSize = 3;
    delayBetweenBatches = 2500; // 2.5 秒
    maxConcurrency = 3;
  } else {
    // 大量比赛：更保守
    batchSize = 2;
    delayBetweenBatches = 3000; // 3 秒
    maxConcurrency = 2;
  }

  console.log(`[BATCH_CONFIG] totalMatches=${totalMatches}, batchSize=${batchSize}, delay=${delayBetweenBatches}ms`);

  return { batchSize, delayBetweenBatches, maxConcurrency };
}

// ============================================
// 优化的批量获取函数
// ============================================

type FetchOddsFn = (fixtureId: number) => Promise<LiveOddsData[]>;

interface BatchFetchResult {
  oddsMap: Map<number, LiveOddsData[]>;
  stats: {
    total: number;
    cached: number;
    fetched: number;
    failed: number;
    timeMs: number;
  };
}

/**
 * 优化的批量获取赔率函数
 * 特点：
 * 1. 请求去重 - 相同 fixtureId 只请求一次
 * 2. 缓存命中 - 使用未过期的缓存数据
 * 3. 优先级排序 - 有赔率覆盖的比赛优先
 * 4. 智能批次 - 根据数量动态调整
 */
export async function fetchOddsBatchOptimized(
  matches: Match[],
  fetchFn: FetchOddsFn,
  options?: {
    watchedIds?: Set<number>;
    skipNoCoverage?: boolean;
  }
): Promise<BatchFetchResult> {
  const startTime = Date.now();
  const result: BatchFetchResult = {
    oddsMap: new Map(),
    stats: { total: matches.length, cached: 0, fetched: 0, failed: 0, timeMs: 0 },
  };

  if (matches.length === 0) {
    result.stats.timeMs = Date.now() - startTime;
    return result;
  }

  // 1. 按优先级排序
  const sortedMatches = sortMatchesByOddsPriority(matches, options?.watchedIds);

  // 2. 分离需要请求的和可以用缓存的
  const toFetch: Match[] = [];

  for (const match of sortedMatches) {
    const fixtureId = match.fixture.id;
    const leagueId = match.league.id;
    const hasCoverage = hasLiveOddsCoverage(leagueId);

    // 跳过无覆盖的比赛（如果配置了）
    if (options?.skipNoCoverage && !hasCoverage) {
      result.oddsMap.set(fixtureId, []);
      continue;
    }

    // 检查缓存
    const cached = getCachedOdds(fixtureId);
    if (cached !== null) {
      result.oddsMap.set(fixtureId, cached);
      result.stats.cached++;
      cacheHits++;
      continue;
    }

    cacheMisses++;
    toFetch.push(match);
  }

  // 3. 计算批处理配置
  const matchesWithCoverage = toFetch.filter(m => hasLiveOddsCoverage(m.league.id)).length;
  const config = calculateOptimalBatchConfig(toFetch.length, matchesWithCoverage);

  console.log(`[ODDS_BATCH] Optimizing: ${toFetch.length} to fetch, ${result.stats.cached} cached, config=${JSON.stringify(config)}`);

  // 4. 批量请求
  for (let i = 0; i < toFetch.length; i += config.batchSize) {
    const batch = toFetch.slice(i, i + config.batchSize);

    const batchPromises = batch.map(async (match) => {
      const fixtureId = match.fixture.id;

      // 检查是否已有相同请求在进行中
      const pendingPromise = pendingRequests.get(fixtureId);
      if (pendingPromise) {
        try {
          const data = await pendingPromise;
          result.oddsMap.set(fixtureId, data);
          return;
        } catch {
          // 已经失败的请求，重试
        }
      }

      // 创建新请求
      const promise = fetchFn(fixtureId).catch((err) => {
        console.warn(`[ODDS_BATCH] Failed for ${fixtureId}:`, err);
        result.stats.failed++;
        return [] as LiveOddsData[];
      });

      pendingRequests.set(fixtureId, promise);

      try {
        const data = await promise;
        result.oddsMap.set(fixtureId, data);
        setCachedOdds(fixtureId, data);
        result.stats.fetched++;
      } finally {
        pendingRequests.delete(fixtureId);
      }
    });

    await Promise.all(batchPromises);

    // 批次间延迟
    if (i + config.batchSize < toFetch.length) {
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
    }
  }

  result.stats.timeMs = Date.now() - startTime;
  console.log(`[ODDS_BATCH] Complete: fetched=${result.stats.fetched}, cached=${result.stats.cached}, failed=${result.stats.failed}, time=${result.stats.timeMs}ms`);

  return result;
}

// ============================================
// 导出便捷函数
// ============================================

/**
 * 获取批处理统计信息
 */
export function getBatchStats(): { cacheHits: number; cacheMisses: number; cacheSize: number } {
  return {
    cacheHits,
    cacheMisses,
    cacheSize: oddsCache.size,
  };
}

/**
 * 重置统计信息
 */
export function resetBatchStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
}
