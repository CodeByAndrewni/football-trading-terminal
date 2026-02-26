/**
 * ============================================
 * 比赛数据 React Query Hooks
 * PRODUCTION STRICT MODE - 仅使用 API-Football 真实数据
 * ============================================
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { queryKeys, refetchIntervals } from '../lib/queryClient';
import {
  isApiKeyConfigured,
  getLiveMatches,
  getLiveMatchesAdvanced,
  getTodayMatches,
  getTodayMatchesAdvanced,
  getMatchById,
  getMatchAdvanced,
  getMatchStatistics,
  getMatchEvents,
  getMatchLineups,
  getHeadToHead,
  checkAPIStatus,
} from '../services/api';
import type { AdvancedMatch } from '../data/advancedMockData';
import type { Match, TeamStatistics, MatchEvent, Lineup } from '../types';

/**
 * 数据源类型
 * PRODUCTION STRICT MODE: 只有 'api' 或 'none'
 */
export type DataSource = 'api' | 'none';

/**
 * 带数据源信息的返回类型
 */
export interface MatchesResult {
  matches: AdvancedMatch[];
  dataSource: DataSource;
  error?: string;
}

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

  // 处理传入的比赛
  for (const match of incoming) {
    const existingMatch = existingMap.get(match.id);
    if (existingMatch) {
      // 检查是否有实际变化
      const hasChanged =
        existingMatch.minute !== match.minute ||
        existingMatch.home.score !== match.home.score ||
        existingMatch.away.score !== match.away.score ||
        existingMatch.status !== match.status ||
        existingMatch.corners?.home !== match.corners?.home ||
        existingMatch.corners?.away !== match.corners?.away ||
        existingMatch.killScore !== match.killScore;

      if (hasChanged) {
        // 有变化，使用新数据
        result.push(match);
      } else {
        // 无变化，保留旧引用
        result.push(existingMatch);
      }
      existingMap.delete(match.id);
    } else {
      // 新比赛
      result.push(match);
    }
  }

  return result;
}

/**
 * 获取进行中比赛（高级格式）
 * PRODUCTION STRICT MODE: 仅从 API-Football 获取数据
 */
export function useLiveMatchesAdvanced(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  const previousMatchesRef = useRef<AdvancedMatch[] | undefined>(undefined);

  const query = useQuery({
    queryKey: queryKeys.matches.liveAdvanced(),
    queryFn: async (): Promise<MatchesResult> => {
      // PRODUCTION STRICT MODE: 仅使用 API
      try {
        const apiMatches = await getLiveMatchesAdvanced();

        // 过滤掉无法评分的比赛（保留用于显示，但标记）
        const scorableMatches = apiMatches.filter(m => !m._unscoreable);
        const unscorableCount = apiMatches.length - scorableMatches.length;

        if (unscorableCount > 0) {
          console.warn(`[PRODUCTION STRICT MODE] ${unscorableCount} matches filtered (no statistics)`);
        }

        if (apiMatches.length > 0) {
          const mergedMatches = mergeMatches(previousMatchesRef.current, apiMatches);
          previousMatchesRef.current = mergedMatches;
          return { matches: mergedMatches, dataSource: 'api' };
        }

        // API 返回空数据
        console.log('[PRODUCTION STRICT MODE] No live matches from API-Football');
        return { matches: [], dataSource: 'none', error: 'NO_LIVE_MATCHES' };

      } catch (error) {
        // PRODUCTION STRICT MODE: 不回退到 mock 数据
        console.error('[PRODUCTION STRICT MODE] API request failed:', error);
        return {
          matches: [],
          dataSource: 'none',
          error: error instanceof Error ? error.message : 'API_ERROR'
        };
      }
    },
    staleTime: 10 * 1000,
    refetchInterval: options?.refetchInterval ?? 15 * 1000,
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

  return query;
}

/**
 * 获取今日所有比赛（高级格式）
 * PRODUCTION STRICT MODE: 仅从 API-Football 获取数据
 */
export function useTodayMatchesAdvanced(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  const previousMatchesRef = useRef<AdvancedMatch[] | undefined>(undefined);

  return useQuery({
    queryKey: queryKeys.matches.todayAdvanced(),
    queryFn: async (): Promise<MatchesResult> => {
      try {
        const apiMatches = await getTodayMatchesAdvanced();

        if (apiMatches.length > 0) {
          const mergedMatches = mergeMatches(previousMatchesRef.current, apiMatches);
          previousMatchesRef.current = mergedMatches;
          return { matches: mergedMatches, dataSource: 'api' };
        }

        console.log('[PRODUCTION STRICT MODE] No today matches from API-Football');
        return { matches: [], dataSource: 'none', error: 'NO_TODAY_MATCHES' };

      } catch (error) {
        console.error('[PRODUCTION STRICT MODE] API request failed:', error);
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

/**
 * 获取单场比赛详情（高级格式）
 * PRODUCTION STRICT MODE: 仅从 API-Football 获取数据
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
        console.error('[PRODUCTION STRICT MODE] API key not configured');
        return null;
      }

      try {
        const match = await getMatchAdvanced(matchId);
        if (match) {
          return { match, dataSource: 'api' as DataSource };
        }

        console.log(`[PRODUCTION STRICT MODE] Match ${matchId} not found`);
        return null;

      } catch (error) {
        console.error('[PRODUCTION STRICT MODE] Failed to get match:', error);
        return null;
      }
    },
    staleTime: 10 * 1000,
    refetchInterval: options?.refetchInterval ?? refetchIntervals.matchDetail,
    enabled: (options?.enabled ?? true) && !!matchId,
  });
}

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
        console.error('[PRODUCTION STRICT MODE] Failed to get live matches:', error);
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
        console.error('[PRODUCTION STRICT MODE] Failed to get today matches:', error);
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
        console.error('[PRODUCTION STRICT MODE] Failed to get match:', error);
        return null;
      }
    },
    staleTime: 15 * 1000,
    enabled: (options?.enabled ?? true) && !!matchId && isApiKeyConfigured(),
  });
}

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
        console.error('[PRODUCTION STRICT MODE] Failed to get match statistics:', error);
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
        console.error('[PRODUCTION STRICT MODE] Failed to get match events:', error);
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
        console.error('[PRODUCTION STRICT MODE] Failed to get match lineups:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 阵容不常变，缓存5分钟
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
        console.error('[PRODUCTION STRICT MODE] Failed to get head-to-head:', error);
        return [];
      }
    },
    staleTime: 10 * 60 * 1000, // 历史对战缓存10分钟
    enabled: (options?.enabled ?? true) && !!team1Id && !!team2Id && isApiKeyConfigured(),
  });
}

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
        console.error('[PRODUCTION STRICT MODE] Failed to check API status:', error);
        return null;
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: options?.refetchInterval ?? 5 * 60 * 1000, // 5分钟检查一次
    enabled: options?.enabled ?? true,
  });
}

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
