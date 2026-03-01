/**
 * GET /api/matches
 *
 * 按需刷新模式（无需 Cron）
 * - 缓存新鲜（< 60秒）：直接返回
 * - 缓存过期（> 60秒）：返回旧数据 + 后台刷新
 * - 无缓存：等待刷新完成
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMatches, saveMatches, acquireLock, releaseLock, incrementApiCalls, getApiCallsToday, KV_KEYS, KV_CONFIG } from '../lib/kv.js';
import type { RefreshMeta } from '../lib/kv.js';
import {
  getLiveFixtures,
  getStatisticsBatch,
  getEventsBatch,
  getLiveOddsBatch,
  getPrematchOddsBatch,
  getApiCallsThisCycle,
  resetApiCallsThisCycle,
} from '../lib/api-football.js';
import { aggregateMatches, calculateBasicKillScore } from '../lib/aggregator.js';

// ============================================
// 配置
// ============================================

const CONFIG = {
  CACHE_TTL: 60,              // 缓存有效期（秒）
  STALE_TTL: 300,             // 最大允许返回的旧数据年龄（秒）
  STATS_BATCH_SIZE: 10,
  STATS_BATCH_DELAY: 30,
  ODDS_BATCH_SIZE: 8,
  ODDS_BATCH_DELAY: 50,
};

// ============================================
// 刷新数据函数
// ============================================

async function refreshMatches(): Promise<{ matches: unknown[]; meta: RefreshMeta } | null> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log('[Refresh] Starting on-demand refresh...');
  resetApiCallsThisCycle();

  try {
    // 1. 获取进行中的比赛
    const fixtures = await getLiveFixtures();
    console.log(`[Refresh] Found ${fixtures.length} live fixtures`);

    if (fixtures.length === 0) {
      const meta: RefreshMeta = {
        lastRefresh: new Date().toISOString(),
        nextRefresh: new Date(Date.now() + 60000).toISOString(),
        matchCount: 0,
        liveCount: 0,
        apiCallsThisCycle: 1,
        duration: Date.now() - startTime,
        errors: [],
      };
      await saveMatches([], meta);
      return { matches: [], meta };
    }

    const fixtureIds = fixtures.map(f => f.fixture.id);
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'];
    const liveFixtureIds = fixtures
      .filter(f => liveStatuses.includes(f.fixture.status.short))
      .map(f => f.fixture.id);

    // 2. 并行获取统计和事件
    const [statisticsMap, eventsMap] = await Promise.all([
      getStatisticsBatch(liveFixtureIds, {
        batchSize: CONFIG.STATS_BATCH_SIZE,
        batchDelay: CONFIG.STATS_BATCH_DELAY,
      }),
      getEventsBatch(liveFixtureIds, {
        batchSize: CONFIG.STATS_BATCH_SIZE,
        batchDelay: CONFIG.STATS_BATCH_DELAY,
      }),
    ]);

    // 3. 获取赔率
    const [liveOddsMap, prematchOddsMap] = await Promise.all([
      getLiveOddsBatch(fixtureIds, {
        batchSize: CONFIG.ODDS_BATCH_SIZE,
        batchDelay: CONFIG.ODDS_BATCH_DELAY,
      }),
      getPrematchOddsBatch(fixtureIds.slice(0, 20), {
        batchSize: CONFIG.ODDS_BATCH_SIZE,
        batchDelay: CONFIG.ODDS_BATCH_DELAY,
      }),
    ]);

    // 4. 聚合数据
    const matches = aggregateMatches(
      fixtures,
      statisticsMap,
      eventsMap,
      liveOddsMap,
      prematchOddsMap
    );

    // 计算评分
    for (const match of matches) {
      match.killScore = calculateBasicKillScore(match);
    }

    // 计算赔率覆盖率统计
    const matchesWithAnyOdds = matches.filter(m =>
      m.odds?._fetch_status === 'SUCCESS' && (
        m.odds?.handicap?.value !== null ||
        m.odds?.overUnder?.total !== null ||
        m.odds?.matchWinner?.home !== null
      )
    ).length;

    const matchesWithOverUnder = matches.filter(m =>
      m.odds?.overUnder?.total !== null && m.odds?.overUnder?.over !== null
    ).length;

    const matchesWithStats = matches.filter(m =>
      m.stats?._realDataAvailable === true
    ).length;

    // 5. 保存到 KV
    const apiCallsThisCycle = getApiCallsThisCycle();
    const meta: RefreshMeta = {
      lastRefresh: new Date().toISOString(),
      nextRefresh: new Date(Date.now() + 60000).toISOString(),
      matchCount: matches.length,
      liveCount: liveFixtureIds.length,
      apiCallsThisCycle,
      duration: Date.now() - startTime,
      errors,
      // 新增：赔率覆盖率统计
      matchesWithAnyOdds,
      matchesWithOverUnder,
      matchesWithStats,
    };

    await saveMatches(matches, meta);
    await incrementApiCalls(apiCallsThisCycle);

    console.log(`[Refresh] Complete: ${matches.length} matches, ${apiCallsThisCycle} API calls, ${Date.now() - startTime}ms`);

    return { matches, meta };

  } catch (error) {
    console.error('[Refresh] Error:', error);
    return null;
  }
}

// ============================================
// 主处理函数
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET requests are allowed' },
    });
  }

  try {
    // 从 KV 获取缓存数据
    const cached = await getMatches();
    const apiCallsToday = await getApiCallsToday();

    // 情况1: 缓存新鲜（< 60秒）→ 直接返回
    if (cached && cached.cacheAge < CONFIG.CACHE_TTL) {
      res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
      return res.status(200).json({
        success: true,
        data: {
          matches: cached.matches,
          meta: {
            total: cached.matches.length,
            live: cached.meta?.liveCount || 0,
            lastRefresh: cached.meta?.lastRefresh || null,
            nextRefresh: cached.meta?.nextRefresh || null,
            cacheAge: cached.cacheAge,
            apiCallsToday,
            status: 'FRESH',
            refreshDuration: cached.meta?.duration || 0,
          },
        },
      });
    }

    // 情况2: 缓存过期但可用（< 5分钟）→ 返回旧数据 + 后台刷新
    if (cached && cached.cacheAge < CONFIG.STALE_TTL) {
      // 尝试获取锁，避免多个请求同时刷新
      const lockAcquired = await acquireLock(KV_KEYS.lock, KV_CONFIG.LOCK_TTL);

      if (lockAcquired) {
        // 后台刷新（不等待）
        refreshMatches().finally(() => releaseLock(KV_KEYS.lock));
      }

      // 立即返回旧数据
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=60');
      return res.status(200).json({
        success: true,
        data: {
          matches: cached.matches,
          meta: {
            total: cached.matches.length,
            live: cached.meta?.liveCount || 0,
            lastRefresh: cached.meta?.lastRefresh || null,
            nextRefresh: cached.meta?.nextRefresh || null,
            cacheAge: cached.cacheAge,
            apiCallsToday,
            status: 'STALE_REFRESHING',
            refreshDuration: cached.meta?.duration || 0,
          },
        },
      });
    }

    // 情况3: 无缓存或缓存太旧 → 等待刷新完成
    const lockAcquired = await acquireLock(KV_KEYS.lock, KV_CONFIG.LOCK_TTL);

    if (!lockAcquired) {
      // 其他请求正在刷新，等待一下再读缓存
      await new Promise(r => setTimeout(r, 2000));
      const newCached = await getMatches();

      if (newCached) {
        return res.status(200).json({
          success: true,
          data: {
            matches: newCached.matches,
            meta: {
              total: newCached.matches.length,
              live: newCached.meta?.liveCount || 0,
              lastRefresh: newCached.meta?.lastRefresh || null,
              cacheAge: newCached.cacheAge,
              apiCallsToday,
              status: 'FRESH',
            },
          },
        });
      }
    }

    // 执行刷新
    const result = await refreshMatches();
    await releaseLock(KV_KEYS.lock);

    if (!result) {
      return res.status(503).json({
        success: false,
        error: { code: 'REFRESH_FAILED', message: 'Failed to refresh data' },
      });
    }

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json({
      success: true,
      data: {
        matches: result.matches,
        meta: {
          total: result.matches.length,
          live: result.meta.liveCount,
          lastRefresh: result.meta.lastRefresh,
          nextRefresh: result.meta.nextRefresh,
          cacheAge: 0,
          apiCallsToday: await getApiCallsToday(),
          status: 'FRESH',
          refreshDuration: result.meta.duration,
        },
      },
    });

  } catch (error) {
    console.error('[/api/matches] Error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

export const config = {
  maxDuration: 60, // 允许最长 60 秒（刷新可能需要时间）
};
