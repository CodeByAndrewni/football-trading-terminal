/**
 * ============================================
 * 积分榜数据 Hook - 用于计算球队强弱信息
 * 为 UnifiedLateModule 提供 TeamStrengthInfo
 * Version: 1.0
 * ============================================
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import {
  getTeamStrengthInfo,
  batchGetStandings,
  getStandings,
  type TeamRankInfo,
} from '../services/standingsService';
import type { TeamStrengthInfo } from '../services/modules/unifiedLateModule';

// ============================================
// 类型定义
// ============================================

export interface StandingsHookResult {
  /** 获取球队强弱信息 (异步) */
  getStrength: (
    leagueId: number,
    homeTeamId: number,
    awayTeamId: number
  ) => Promise<TeamStrengthInfo | undefined>;

  /** 从缓存获取球队强弱信息 (同步) */
  getStrengthFromCache: (
    leagueId: number,
    homeTeamId: number,
    awayTeamId: number
  ) => TeamStrengthInfo | undefined;

  /** 预加载联赛积分榜 */
  preloadLeagues: (leagueIds: number[]) => Promise<void>;

  /** 缓存的联赛ID列表 */
  cachedLeagues: number[];

  /** 是否正在加载 */
  isLoading: boolean;
}

// ============================================
// 内存缓存 (Session 级别)
// ============================================

interface CachedStrength {
  data: TeamStrengthInfo;
  timestamp: number;
}

// 球队强弱缓存: "leagueId:homeId:awayId" -> TeamStrengthInfo
const strengthCache = new Map<string, CachedStrength>();
const STRENGTH_CACHE_TTL = 30 * 60 * 1000; // 30分钟

// 已加载的联赛ID
const loadedLeagues = new Set<number>();

// ============================================
// Hook 实现
// ============================================

export function useStandings(): StandingsHookResult {
  // 获取球队强弱信息 (异步，会调用 API)
  const getStrength = useCallback(async (
    leagueId: number,
    homeTeamId: number,
    awayTeamId: number
  ): Promise<TeamStrengthInfo | undefined> => {
    const cacheKey = `${leagueId}:${homeTeamId}:${awayTeamId}`;

    // 检查缓存
    const cached = strengthCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < STRENGTH_CACHE_TTL) {
      return cached.data;
    }

    try {
      const strength = await getTeamStrengthInfo(leagueId, homeTeamId, awayTeamId);
      if (strength) {
        strengthCache.set(cacheKey, {
          data: strength,
          timestamp: Date.now(),
        });
        loadedLeagues.add(leagueId);
      }
      return strength;
    } catch (error) {
      console.warn('[useStandings] Failed to get strength:', error);
      return undefined;
    }
  }, []);

  // 从缓存获取 (同步，不调用 API)
  const getStrengthFromCache = useCallback((
    leagueId: number,
    homeTeamId: number,
    awayTeamId: number
  ): TeamStrengthInfo | undefined => {
    const cacheKey = `${leagueId}:${homeTeamId}:${awayTeamId}`;
    const cached = strengthCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < STRENGTH_CACHE_TTL) {
      return cached.data;
    }

    return undefined;
  }, []);

  // 预加载联赛积分榜
  const preloadLeagues = useCallback(async (leagueIds: number[]): Promise<void> => {
    // 过滤已加载的联赛
    const toLoad = leagueIds.filter(id => !loadedLeagues.has(id));
    if (toLoad.length === 0) return;

    try {
      await batchGetStandings(toLoad);
      for (const id of toLoad) {
        loadedLeagues.add(id);
      }
    } catch (error) {
      console.warn('[useStandings] Failed to preload leagues:', error);
    }
  }, []);

  const cachedLeagues = useMemo(() => Array.from(loadedLeagues), []);

  return {
    getStrength,
    getStrengthFromCache,
    preloadLeagues,
    cachedLeagues,
    isLoading: false,
  };
}

// ============================================
// 批量获取球队强弱 (用于比赛列表)
// ============================================

export interface MatchStrengthMap {
  [matchId: number]: TeamStrengthInfo | undefined;
}

/**
 * 批量获取比赛的球队强弱信息
 * 用于在 MatchTableV2 中批量处理
 */
export async function batchGetMatchStrengths(
  matches: Array<{
    id: number;
    leagueId: number;
    home: { id: number };
    away: { id: number };
    minute: number;
  }>
): Promise<MatchStrengthMap> {
  const result: MatchStrengthMap = {};

  // 只处理 65+ 分钟的比赛
  const lateMatches = matches.filter(m => m.minute >= 65);
  if (lateMatches.length === 0) return result;

  // 收集需要获取的联赛
  const leagueIds = [...new Set(lateMatches.map(m => m.leagueId))];

  // 预加载联赛积分榜
  await batchGetStandings(leagueIds);

  // 并行获取所有比赛的强弱信息
  const promises = lateMatches.map(async (match) => {
    const cacheKey = `${match.leagueId}:${match.home.id}:${match.away.id}`;
    const cached = strengthCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < STRENGTH_CACHE_TTL) {
      result[match.id] = cached.data;
      return;
    }

    try {
      const strength = await getTeamStrengthInfo(
        match.leagueId,
        match.home.id,
        match.away.id
      );
      if (strength) {
        strengthCache.set(cacheKey, {
          data: strength,
          timestamp: Date.now(),
        });
        result[match.id] = strength;
      }
    } catch {
      // 忽略单个失败
    }
  });

  await Promise.allSettled(promises);
  return result;
}

// ============================================
// 导出缓存管理函数
// ============================================

export function clearStrengthCache(): void {
  strengthCache.clear();
  loadedLeagues.clear();
}

export function getStrengthCacheStats(): {
  size: number;
  leagues: number[];
} {
  return {
    size: strengthCache.size,
    leagues: Array.from(loadedLeagues),
  };
}

export default useStandings;
