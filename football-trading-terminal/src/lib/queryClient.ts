/**
 * ============================================
 * React Query 客户端配置
 * ============================================
 */

import { QueryClient } from '@tanstack/react-query';
import { REFRESH_INTERVALS } from '../config/constants';

/**
 * 创建 QueryClient 实例
 * 配置全局默认选项
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 默认缓存时间：5分钟
      staleTime: 5 * 60 * 1000,
      // 垃圾回收时间：10分钟
      gcTime: 10 * 60 * 1000,
      // 失败重试次数
      retry: 2,
      // 重试延迟
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // 窗口聚焦时不自动刷新（避免频繁请求）
      refetchOnWindowFocus: false,
      // 网络恢复时刷新
      refetchOnReconnect: true,
    },
    mutations: {
      // 失败重试次数
      retry: 1,
    },
  },
});

/**
 * 查询键工厂
 * 统一管理所有查询的 key，便于缓存失效和预取
 */
export const queryKeys = {
  // 比赛相关
  matches: {
    all: ['matches'] as const,
    live: () => [...queryKeys.matches.all, 'live'] as const,
    liveAdvanced: () => [...queryKeys.matches.all, 'live', 'advanced'] as const,
    today: () => [...queryKeys.matches.all, 'today'] as const,
    todayAdvanced: () => [...queryKeys.matches.all, 'today', 'advanced'] as const,
    byLeague: (leagueId: number) => [...queryKeys.matches.all, 'league', leagueId] as const,
    detail: (matchId: number) => [...queryKeys.matches.all, 'detail', matchId] as const,
    detailAdvanced: (matchId: number) => [...queryKeys.matches.all, 'detail', matchId, 'advanced'] as const,
  },

  // 统计数据
  statistics: {
    all: ['statistics'] as const,
    byMatch: (matchId: number) => [...queryKeys.statistics.all, matchId] as const,
  },

  // 比赛事件
  events: {
    all: ['events'] as const,
    byMatch: (matchId: number) => [...queryKeys.events.all, matchId] as const,
  },

  // 阵容
  lineups: {
    all: ['lineups'] as const,
    byMatch: (matchId: number) => [...queryKeys.lineups.all, matchId] as const,
  },

  // 历史对战
  h2h: {
    all: ['h2h'] as const,
    byTeams: (team1Id: number, team2Id: number) => [...queryKeys.h2h.all, team1Id, team2Id] as const,
  },

  // API 状态
  apiStatus: ['apiStatus'] as const,
} as const;

/**
 * 刷新间隔配置（用于 refetchInterval）
 */
export const refetchIntervals = {
  liveMatches: REFRESH_INTERVALS.LIVE_MATCHES,
  matchDetail: REFRESH_INTERVALS.MATCH_DETAIL,
  statistics: REFRESH_INTERVALS.STATISTICS,
  cornerAnalysis: REFRESH_INTERVALS.CORNER_ANALYSIS,
} as const;
