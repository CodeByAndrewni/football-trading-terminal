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
  CACHE_TTL: 15,              // 缓存有效期（秒） - 15秒内视为新鲜
  STALE_TTL: 60,             // 最大允许返回的旧数据年龄（秒） - 60秒内允许作为旧数据返回
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

    // ----- 赔率诊断：API 原始返回 -----
    const liveOddsEntries = Array.from(liveOddsMap.entries());
    const withLiveOddsCount = liveOddsEntries.filter(([, arr]) => arr && arr.length > 0 && arr[0].odds?.length > 0).length;
    const prematchEntries = Array.from(prematchOddsMap.entries());
    const withPrematchCount = prematchEntries.filter(([, arr]) => arr && arr.length > 0).length;
    console.log('[ODDS_LOG] 赔率 API 返回统计:', {
      总比赛数: fixtureIds.length,
      有滚球赔率的比赛数: withLiveOddsCount,
      有赛前赔率的比赛数: withPrematchCount,
    });
    // 前 2 条滚球赔率原始结构
    for (let i = 0; i < Math.min(2, liveOddsEntries.length); i++) {
      const [fid, arr] = liveOddsEntries[i];
      const first = arr?.[0];
      console.log(`[ODDS_LOG] 滚球赔率原始 第${i + 1} 条 fixture=${fid}:`, {
        hasData: !!first,
        fixtureId: first?.fixture?.id,
        oddsArrayLength: first?.odds?.length ?? 0,
        marketIds: first?.odds?.map(o => o.id) ?? [],
        firstMarketSample: first?.odds?.[0] ? {
          id: first.odds[0].id,
          name: first.odds[0].name,
          valuesLength: first.odds[0].values?.length ?? 0,
          valuesSample: (first.odds[0].values ?? []).slice(0, 3),
        } : null,
      });
    }
    // 前 2 条赛前赔率原始结构（OddsData 为单条 response，含 bookmakers 数组）
    for (let i = 0; i < Math.min(2, prematchEntries.length); i++) {
      const [fid, arr] = prematchEntries[i];
      const first = arr?.[0] as { bookmakers?: Array<{ id: number; name: string; bets?: unknown[] }> } | undefined;
      console.log(`[ODDS_LOG] 赛前赔率原始 第${i + 1} 条 fixture=${fid}:`, {
        hasData: !!first,
        responseLength: arr?.length ?? 0,
        bookmakersLength: first?.bookmakers?.length ?? 0,
        firstBookmaker: first?.bookmakers?.[0] ? { id: first.bookmakers[0].id, name: first.bookmakers[0].name, betsLength: first.bookmakers[0].bets?.length ?? 0 } : null,
      });
    }

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

    // ----- 赔率诊断：解析后的赔率结构（前 2 条有赔率的比赛）-----
    const withOdds = matches.filter((m: { odds?: { _fetch_status?: string } }) => m.odds?._fetch_status === 'SUCCESS');
    console.log('[ODDS_LOG] 解析后统计:', { 有任意赔率: matchesWithAnyOdds, 有大小球: matchesWithOverUnder, 总比赛数: matches.length });
    for (let i = 0; i < Math.min(2, withOdds.length); i++) {
      const m = withOdds[i] as { id: number; home?: { name?: string }; away?: { name?: string }; odds?: { handicap?: { value?: number | null; home?: number | null; away?: number | null }; overUnder?: { total?: number | null; over?: number | null; under?: number | null }; _fetch_status?: string } };
      const o = m.odds;
      console.log(`[ODDS_LOG] 解析后赔率 第${i + 1} 场 id=${m.id} ${m.home?.name ?? '?'} vs ${m.away?.name ?? '?'}:`, {
        handicap: o?.handicap ? { value: o.handicap.value, home: o.handicap.home, away: o.handicap.away } : null,
        overUnder: o?.overUnder ? { total: o.overUnder.total, over: o.overUnder.over, under: o.overUnder.under } : null,
        _fetch_status: o?._fetch_status,
      });
    }

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

    // 赔率数据流诊断：确认写入 KV 前首条带 odds
    const firstForKv = matches[0] as { id?: number; odds?: { overUnder?: { total?: number | null }; handicap?: { value?: number | null }; _fetch_status?: string } } | undefined;
    if (firstForKv) {
      console.log('[ODDS_LOG] 即将写入 KV 首条:', {
        id: firstForKv.id,
        hasOdds: !!firstForKv.odds,
        _fetch_status: firstForKv.odds?._fetch_status,
        overUnder_total: firstForKv.odds?.overUnder?.total,
        handicap_value: firstForKv.odds?.handicap?.value,
      });
    }

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
