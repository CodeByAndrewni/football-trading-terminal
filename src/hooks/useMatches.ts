/**
 * ============================================
 * 比赛数据 React Query Hooks
 *
 * V2 架构：优先使用后端聚合 API (/api/matches)
 * 当聚合 API 不可用时，fallback 到旧的直连模式
 * ============================================
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, useEffect } from 'react';
import { queryKeys, refetchIntervals } from '../lib/queryClient';
import {
  isApiKeyConfigured,
  getLiveMatches,
  getLiveMatchesAdvanced as getLiveMatchesAdvancedLegacy,
  getTodayMatches,
  getTodayMatchesAdvanced as getTodayMatchesAdvancedLegacy,
  getMatchById,
  getMatchAdvanced,
  getMatchStatistics,
  getMatchEvents,
  getMatchLineups,
  getHeadToHead,
  checkAPIStatus,
} from '../services/api';
import {
  fetchAggregatedMatches,
  isAggregatorAvailable,
  isCacheStale,
  isInitializing,
  type MatchesMeta,
} from '../services/matchesService';
import type { AdvancedMatch } from '../data/advancedMockData';
import type { Match, TeamStatistics, MatchEvent, Lineup } from '../types';

// ============================================
// 配置
// ============================================

/**
 * 是否使用后端聚合模式
 * 设置为 true 使用新架构，false 使用旧的直连模式
 *
 * 🔧 临时禁用：Same 平台不支持 serverless functions
 */
const USE_AGGREGATED_API = true;

/**
 * 当聚合 API 失败时是否 fallback 到旧模式
 */
const FALLBACK_TO_LEGACY = true;

// ============================================
// 类型定义
// ============================================

/**
 * 数据源类型
 */
export type DataSource = 'aggregated' | 'api' | 'none';

/**
 * 带数据源信息的返回类型
 */
export interface MatchesResult {
  matches: AdvancedMatch[];
  dataSource: DataSource;
  meta?: MatchesMeta;
  error?: string;
}

// ============================================
// 辅助函数
// ============================================

/**
 * 按 fixture.id 合并更新比赛列表
 * 保留现有比赛的引用以避免不必要的重渲染
 */
function mergeMatches(
  existing: AdvancedMatch[] | undefined,
  incoming: AdvancedMatch[]
): AdvancedMatch[] {
  if (!existing || existing.length === 0) {
    return incoming;
  }

  const existingMap = new Map(existing.map((m) => [m.id, m]));
  const result: AdvancedMatch[] = [];

  for (const match of incoming) {
    const existingMatch = existingMap.get(match.id);
    if (existingMatch) {
      const hasChanged =
        existingMatch.minute !== match.minute ||
        existingMatch.home.score !== match.home.score ||
        existingMatch.away.score !== match.away.score ||
        existingMatch.status !== match.status ||
        existingMatch.corners?.home !== match.corners?.home ||
        existingMatch.corners?.away !== match.corners?.away ||
        existingMatch.killScore !== match.killScore;

      if (hasChanged) {
        result.push(match);
      } else {
        result.push(existingMatch);
      }
      existingMap.delete(match.id);
    } else {
      result.push(match);
    }
  }

  return result;
}

// ============================================
// 主 Hook：获取进行中比赛（高级格式）
// ============================================

/**
 * 获取进行中比赛（高级格式）
 *
 * V2 架构：优先使用后端聚合 API
 */
export function useLiveMatchesAdvanced(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  const queryClient = useQueryClient();
  const previousMatchesRef = useRef<AdvancedMatch[] | undefined>(undefined);

  const query = useQuery({
    queryKey: queryKeys.matches.liveAdvanced(),
    queryFn: async (): Promise<MatchesResult> => {
      // 尝试使用聚合 API
      if (USE_AGGREGATED_API && isAggregatorAvailable()) {
        try {
          const result = await fetchAggregatedMatches();

          // 检查是否正在初始化
          if (isInitializing(result.meta)) {
            console.log('[useMatches] Aggregator initializing, waiting...');
            return {
              matches: [],
              dataSource: 'aggregated',
              meta: result.meta,
              error: 'INITIALIZING',
            };
          }

          // 检查缓存是否陈旧
          if (isCacheStale(result.meta)) {
            console.warn('[useMatches] Aggregator cache is stale');
          }

          const mergedMatches = mergeMatches(previousMatchesRef.current, result.matches);
          previousMatchesRef.current = mergedMatches;

          return {
            matches: mergedMatches,
            dataSource: 'aggregated',
            meta: result.meta,
          };

        } catch (error) {
          console.error('[useMatches] Aggregator failed:', error);

          // 如果允许 fallback，尝试旧模式
          if (FALLBACK_TO_LEGACY) {
            console.log('[useMatches] Falling back to legacy API...');
          } else {
            return {
              matches: [],
              dataSource: 'none',
              error: error instanceof Error ? error.message : 'AGGREGATOR_ERROR',
            };
          }
        }
      }

      // Fallback: 使用旧的直连模式（直连 API-Football）
      try {
        console.log('[useMatches] Calling getLiveMatchesAdvancedLegacy...');

        // 直连模式下，赔率 / 统计 / 事件是异步加载完成后，通过 onOddsLoaded 回调更新 React Query 缓存
        const apiMatches = await getLiveMatchesAdvancedLegacy({
          onOddsLoaded: (matchesWithOdds) => {
            try {
              const merged = mergeMatches(previousMatchesRef.current, matchesWithOdds);
              previousMatchesRef.current = merged;

              queryClient.setQueryData(queryKeys.matches.liveAdvanced(), (prev: MatchesResult | undefined) => {
                if (!prev) {
                  return {
                    matches: merged,
                    dataSource: 'api' as DataSource,
                  };
                }
                return {
                  ...prev,
                  matches: merged,
                };
              });
            } catch (err) {
              console.error('[useMatches] Failed to apply onOddsLoaded result:', err);
            }
          },
        });

        console.log(`[useMatches] ✅ Received ${apiMatches.length} matches from API-Football`);

        // 🔥 详细调试日志
        if (apiMatches.length > 0) {
          const withOdds = apiMatches.filter(m => m.odds?._fetch_status === 'SUCCESS');
          const withStats = apiMatches.filter(m => m.stats !== null);

          console.log(`[useMatches] Data status: odds=${withOdds.length}/${apiMatches.length}, stats=${withStats.length}/${apiMatches.length}`);

          // 打印前3个比赛的详细信息
          for (let i = 0; i < Math.min(3, apiMatches.length); i++) {
            const m = apiMatches[i];
            console.log(`[useMatches] Match ${i + 1}: ${m.home.name} vs ${m.away.name}`, {
              id: m.id,
              status: m.status,
              minute: m.minute,
              score: `${m.home.score}-${m.away.score}`,
              hasOdds: m.odds?._fetch_status === 'SUCCESS',
              hasStats: m.stats !== null,
            });
          }
        }

        // 🔥 CRITICAL: 首次返回所有比赛，即使暂时没有赔率/统计
        if (apiMatches.length > 0) {
          const mergedMatches = mergeMatches(previousMatchesRef.current, apiMatches);
          previousMatchesRef.current = mergedMatches;

          console.log(`[useMatches] ✅ Returning ${mergedMatches.length} matches to UI`);
          return { matches: mergedMatches, dataSource: 'api' };
        }

        console.log('[useMatches] ⚠️ No live matches from API-Football');
        return { matches: [], dataSource: 'none', error: 'NO_LIVE_MATCHES' };

      } catch (error) {
        console.error('[useMatches] ❌ API request failed:', error);
        return {
          matches: [],
          dataSource: 'none',
          error: error instanceof Error ? error.message : 'API_ERROR'
        };
      }
    },
    staleTime: 10 * 1000,
    refetchInterval: options?.refetchInterval ?? 10 * 1000,
    enabled: options?.enabled ?? true,
    structuralSharing: (oldData, newData) => {
      if (!oldData) return newData;
      const old = oldData as MatchesResult;
      const next = newData as MatchesResult;
      if (
        old.dataSource === next.dataSource &&
        old.matches.length === next.matches.length &&
        old.matches.every((m, i) => m === next.matches[i])
      ) {
        return oldData;
      }
      return newData;
    },
  });

  const matches = query.data?.matches ?? [];
  if (matches.length > 0) {
    const uniqueStatuses = [...new Set(matches.map(m => JSON.stringify(m.status)))];
    console.log('[RAW_MATCHES_SAMPLE] unique status values (all matches):', uniqueStatuses);
  }

  // 诊断：id=1508863 单场结构（排查盘口/统计不显示）
  const diagMatch = matches.find((m: { id?: number }) => m.id === 1508863);
  if (diagMatch) {
    const m = diagMatch as import('../data/advancedMockData').AdvancedMatch;
    console.log('[MATCH_1508863]', {
      id: m.id,
      league: m.league,
      status: m.status,
      minute: m.minute,
      homeName: m.home?.name,
      awayName: m.away?.name,
      homeScore: m.home?.score,
      awayScore: m.away?.score,
      initialHandicap: m.initialHandicap,
      initialOverUnder: m.initialOverUnder,
      stats: m.stats
        ? {
            _realDataAvailable: m.stats._realDataAvailable,
            shots: m.stats.shots,
            shotsOnTarget: m.stats.shotsOnTarget,
            possession: m.stats.possession,
            corners: m.corners ?? null,
          }
        : null,
      odds: m.odds
        ? {
            _fetch_status: m.odds._fetch_status,
            _is_live: m.odds._is_live,
            _source: m.odds._source,
            handicap_value: m.odds.handicap?.value,
            handicap_home: m.odds.handicap?.home,
            handicap_away: m.odds.handicap?.away,
            overUnder_total: m.odds.overUnder?.total,
            overUnder_over: m.odds.overUnder?.over,
            overUnder_under: m.odds.overUnder?.under,
          }
        : null,
    });
  }

  // 统一“进行中”定义：只排除未开始(NS)和已结束(FT)，
  // 其余状态（1h/2h/ht/live/aet/pen 等）全部视为进行中，避免列表为空。
  const liveMatches = matches.filter((m) => {
    const s = String(m.status).toLowerCase();
    return s !== 'ns' && s !== 'ft';
  });
  console.log('[MATCHES_FILTERED] liveMatches=', liveMatches.length, 'allMatches=', matches.length);

  return { ...query, liveMatches };
}

/**
 * 获取今日所有比赛（高级格式）
 *
 * 注意：目前聚合 API 只返回进行中的比赛
 * 如需今日所有比赛，仍需使用旧模式
 */
export function useTodayMatchesAdvanced(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  const previousMatchesRef = useRef<AdvancedMatch[] | undefined>(undefined);

  return useQuery({
    queryKey: queryKeys.matches.todayAdvanced(),
    queryFn: async (): Promise<MatchesResult> => {
      // 今日比赛目前仍使用旧模式
      // TODO: 扩展聚合 API 支持今日所有比赛
      try {
        const apiMatches = await getTodayMatchesAdvancedLegacy();

        if (apiMatches.length > 0) {
          const mergedMatches = mergeMatches(previousMatchesRef.current, apiMatches);
          previousMatchesRef.current = mergedMatches;
          return { matches: mergedMatches, dataSource: 'api' };
        }

        console.log('[useMatches] No today matches from API-Football');
        return { matches: [], dataSource: 'none', error: 'NO_TODAY_MATCHES' };

      } catch (error) {
        console.error('[useMatches] API request failed:', error);
        return {
          matches: [],
          dataSource: 'none',
          error: error instanceof Error ? error.message : 'API_ERROR'
        };
      }
    },
    staleTime: 20 * 1000,
    refetchInterval: options?.refetchInterval ?? 30 * 1000,
    enabled: options?.enabled ?? true,
  });
}

// ============================================
// 单场比赛 Hook
// ============================================

/**
 * 获取单场比赛详情（高级格式）
 */
export function useMatchAdvanced(matchId: number | undefined, options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: queryKeys.matches.detailAdvanced(matchId ?? 0),
    queryFn: async () => {
      if (!matchId) return null;

      if (!isApiKeyConfigured()) {
        console.error('[useMatches] API key not configured');
        return null;
      }

      try {
        const match = await getMatchAdvanced(matchId);
        if (match) {
          return { match, dataSource: 'api' as DataSource };
        }

        console.log(`[useMatches] Match ${matchId} not found`);
        return null;

      } catch (error) {
        console.error('[useMatches] Failed to get match:', error);
        return null;
      }
    },
    staleTime: 10 * 1000,
    refetchInterval: options?.refetchInterval ?? refetchIntervals.matchDetail,
    enabled: (options?.enabled ?? true) && !!matchId,
  });
}

// ============================================
// 原始格式 Hooks（保持兼容）
// ============================================

/**
 * 获取进行中比赛（原始格式）
 */
export function useLiveMatches(options?: {
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.matches.live(),
    queryFn: async () => {
      try {
        const matches = await getLiveMatches();
        return matches ?? [];
      } catch (error) {
        console.error('[useMatches] Failed to get live matches:', error);
        return [];
      }
    },
    staleTime: 15 * 1000,
    refetchInterval: refetchIntervals.liveMatches,
    enabled: options?.enabled ?? isApiKeyConfigured(),
  });
}

/**
 * 获取今日比赛（原始格式）
 */
export function useTodayMatches(options?: {
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.matches.today(),
    queryFn: async () => {
      try {
        const matches = await getTodayMatches();
        return matches ?? [];
      } catch (error) {
        console.error('[useMatches] Failed to get today matches:', error);
        return [];
      }
    },
    staleTime: 60 * 1000,
    enabled: options?.enabled ?? isApiKeyConfigured(),
  });
}

/**
 * 获取单场比赛（原始格式）
 */
export function useMatch(matchId: number | undefined, options?: {
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.matches.detail(matchId ?? 0),
    queryFn: async () => {
      if (!matchId) return null;
      try {
        const match = await getMatchById(matchId);
        return match ?? null;
      } catch (error) {
        console.error('[useMatches] Failed to get match:', error);
        return null;
      }
    },
    staleTime: 15 * 1000,
    enabled: (options?.enabled ?? true) && !!matchId && isApiKeyConfigured(),
  });
}

// ============================================
// 统计/事件/阵容 Hooks
// ============================================

/**
 * 获取比赛统计数据
 */
export function useMatchStatistics(matchId: number | undefined, options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: queryKeys.statistics.byMatch(matchId ?? 0),
    queryFn: async () => {
      if (!matchId) return [];
      try {
        const stats = await getMatchStatistics(matchId);
        return stats ?? [];
      } catch (error) {
        console.error('[useMatches] Failed to get match statistics:', error);
        return [];
      }
    },
    staleTime: 20 * 1000,
    refetchInterval: options?.refetchInterval ?? refetchIntervals.statistics,
    enabled: (options?.enabled ?? true) && !!matchId && isApiKeyConfigured(),
  });
}

/**
 * 获取比赛事件
 */
export function useMatchEvents(matchId: number | undefined, options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: queryKeys.events.byMatch(matchId ?? 0),
    queryFn: async () => {
      if (!matchId) return [];
      try {
        const events = await getMatchEvents(matchId);
        return events ?? [];
      } catch (error) {
        console.error('[useMatches] Failed to get match events:', error);
        return [];
      }
    },
    staleTime: 15 * 1000,
    refetchInterval: options?.refetchInterval ?? refetchIntervals.matchDetail,
    enabled: (options?.enabled ?? true) && !!matchId && isApiKeyConfigured(),
  });
}

/**
 * 获取比赛阵容
 */
export function useMatchLineups(matchId: number | undefined, options?: {
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.lineups.byMatch(matchId ?? 0),
    queryFn: async () => {
      if (!matchId) return [];
      try {
        const lineups = await getMatchLineups(matchId);
        return lineups ?? [];
      } catch (error) {
        console.error('[useMatches] Failed to get match lineups:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!matchId && isApiKeyConfigured(),
  });
}

/**
 * 获取历史对战
 */
export function useHeadToHead(
  team1Id: number | undefined,
  team2Id: number | undefined,
  last?: number,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.h2h.byTeams(team1Id ?? 0, team2Id ?? 0),
    queryFn: async () => {
      if (!team1Id || !team2Id) return [];
      try {
        const h2h = await getHeadToHead(team1Id, team2Id, last);
        return h2h ?? [];
      } catch (error) {
        console.error('[useMatches] Failed to get head-to-head:', error);
        return [];
      }
    },
    staleTime: 10 * 60 * 1000,
    enabled: (options?.enabled ?? true) && !!team1Id && !!team2Id && isApiKeyConfigured(),
  });
}

// ============================================
// API 状态 Hook
// ============================================

/**
 * 获取 API 状态
 */
export function useApiStatus(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: queryKeys.apiStatus,
    queryFn: async () => {
      try {
        return await checkAPIStatus();
      } catch (error) {
        console.error('[useMatches] Failed to check API status:', error);
        return null;
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

// ============================================
// 工具 Hooks
// ============================================

/**
 * 预取比赛详情（用于 hover 预加载）
 */
export function usePrefetchMatch() {
  const queryClient = useQueryClient();

  return (matchId: number) => {
    if (isApiKeyConfigured()) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.matches.detailAdvanced(matchId),
        queryFn: () => getMatchAdvanced(matchId),
        staleTime: 10 * 1000,
      });
    }
  };
}

/**
 * 手动刷新比赛数据
 */
export function useRefreshMatches() {
  const queryClient = useQueryClient();

  return {
    refreshLive: () => queryClient.invalidateQueries({
      queryKey: queryKeys.matches.live(),
    }),
    refreshLiveAdvanced: () => queryClient.invalidateQueries({
      queryKey: queryKeys.matches.liveAdvanced(),
    }),
    refreshAll: () => queryClient.invalidateQueries({
      queryKey: queryKeys.matches.all,
    }),
  };
}

// ============================================
// 聚合状态 Hook（新增）
// ============================================

/**
 * 获取聚合 API 的状态信息
 */
export function useAggregatorStatus() {
  const { data } = useLiveMatchesAdvanced({ enabled: true });

  return {
    isAggregated: data?.dataSource === 'aggregated',
    isLegacy: data?.dataSource === 'api',
    meta: data?.meta,
    cacheAge: data?.meta?.cacheAge ?? 0,
    isStale: data?.meta ? isCacheStale(data.meta) : false,
    apiCallsToday: data?.meta?.apiCallsToday ?? 0,
  };
}
