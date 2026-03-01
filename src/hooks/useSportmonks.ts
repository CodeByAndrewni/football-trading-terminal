// ============================================
// Sportmonks API Hook
// 用于获取Sportmonks数据（支持中文）
// ============================================

import { useQuery } from '@tanstack/react-query';
import {
  getSportmonksLivescores,
  getSportmonksFixtureById,
  convertSportmonksFixtures,
  testSportmonksConnection,
  getSportmonksRateLimitStats,
  clearSportmonksCache,
  SPORTMONKS_ENABLED,
  type SportmonksFixture,
} from '../services/sportmonksApiService';

// Re-export enabled flag
export { SPORTMONKS_ENABLED };

// ============================================
// Types
// ============================================

export interface SportmonksLiveMatch {
  id: number;
  name: string;
  league: string;
  leagueId: number;
  minute: number;
  status: string;
  isLive: boolean;
  homeTeam: { id: number; name: string; logo: string; score: number };
  awayTeam: { id: number; name: string; logo: string; score: number };
  statistics: {
    possession: { home: number; away: number };
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    corners: { home: number; away: number };
    dangerousAttacks: { home: number; away: number };
    xG: { home: number; away: number };
  };
  events: Array<{
    minute: number;
    type: string;
    team: 'home' | 'away';
    player: string;
  }>;
  hasOdds: boolean;
  venue: string | null;
  startTime: string;
}

// ============================================
// Hooks
// ============================================

/**
 * 获取 Sportmonks 进行中比赛列表
 * 自动使用中文翻译
 */
export function useSportmonksLivescores(options?: {
  enabled?: boolean;
  refetchInterval?: number;
}) {
  return useQuery({
    queryKey: ['sportmonks', 'livescores'],
    queryFn: async () => {
      const fixtures = await getSportmonksLivescores();
      return convertSportmonksFixtures(fixtures);
    },
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval ?? 30000,
    staleTime: 15000,
    retry: 2,
  });
}

/**
 * 获取 Sportmonks 单场比赛详情
 */
export function useSportmonksFixture(fixtureId: number | null) {
  return useQuery({
    queryKey: ['sportmonks', 'fixture', fixtureId],
    queryFn: async () => {
      if (!fixtureId) return null;
      return getSportmonksFixtureById(fixtureId);
    },
    enabled: !!fixtureId,
    staleTime: 15000,
  });
}

/**
 * 测试 Sportmonks API 连接
 */
export function useSportmonksConnectionTest() {
  return useQuery({
    queryKey: ['sportmonks', 'test'],
    queryFn: testSportmonksConnection,
    staleTime: 60000,
    retry: 1,
  });
}

/**
 * 获取原始 Sportmonks Fixture 数据（未转换）
 */
export function useSportmonksRawLivescores() {
  return useQuery({
    queryKey: ['sportmonks', 'livescores', 'raw'],
    queryFn: getSportmonksLivescores,
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

// ============================================
// Utility Exports
// ============================================

export {
  getSportmonksRateLimitStats,
  clearSportmonksCache,
};
