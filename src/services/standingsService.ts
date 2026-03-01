// ============================================
// 积分榜服务 - 获取球队强弱信息
// 用于填充 UnifiedLateModule 的 TeamStrengthInfo
// Version: 1.0
// ============================================

import type { Standing, StandingTeam } from '../types';
import type { TeamStrengthInfo } from './modules/unifiedLateModule';
import * as SDK from './apiFootballSDK';

// ============================================
// 缓存
// ============================================

interface StandingsCache {
  data: Standing;
  timestamp: number;
}

const standingsCache = new Map<string, StandingsCache>();
const CACHE_TTL = 60 * 60 * 1000; // 1小时

// ============================================
// 类型
// ============================================

export interface TeamRankInfo {
  teamId: number;
  rank: number;
  totalTeams: number;
  points: number;
  form: string;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  winRate: number;
  strengthScore: number; // 0-100
}

// ============================================
// 核心函数
// ============================================

/**
 * 获取联赛积分榜
 * @param leagueId 联赛ID
 * @param season 赛季年份 (默认2024)
 */
export async function getStandings(
  leagueId: number,
  season = 2024
): Promise<Standing | null> {
  const cacheKey = `standings:${leagueId}:${season}`;

  // 检查缓存
  const cached = standingsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await SDK.getStandings(leagueId, season);
    if (result) {
      standingsCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });
    }
    return result;
  } catch (error) {
    console.warn(`[standingsService] Failed to fetch standings for league ${leagueId}:`, error);
    return null;
  }
}

/**
 * 从积分榜获取球队排名信息
 * @param standing 积分榜数据
 * @param teamId 球队ID
 */
export function getTeamRankInfo(
  standing: Standing | null,
  teamId: number
): TeamRankInfo | null {
  if (!standing?.league?.standings?.[0]) return null;

  const teams = standing.league.standings[0];
  const team = teams.find(t => t.team.id === teamId);

  if (!team) return null;

  const totalTeams = teams.length;
  const played = team.all.played || 1;
  const winRate = (team.all.win / played) * 100;

  // 计算强度分数 (0-100)
  // 基于: 排名、净胜球、胜率
  const rankScore = Math.max(0, 100 - ((team.rank - 1) / totalTeams) * 100);
  const gdScore = Math.min(100, Math.max(0, 50 + team.goalsDiff * 2));
  const wrScore = winRate;

  const strengthScore = Math.round(
    rankScore * 0.4 + gdScore * 0.3 + wrScore * 0.3
  );

  return {
    teamId,
    rank: team.rank,
    totalTeams,
    points: team.points,
    form: team.form,
    goalsFor: team.all.goals.for,
    goalsAgainst: team.all.goals.against,
    goalsDiff: team.goalsDiff,
    winRate: Math.round(winRate),
    strengthScore,
  };
}

/**
 * 计算两队强弱信息 - 用于 UnifiedLateModule
 * @param leagueId 联赛ID
 * @param homeTeamId 主队ID
 * @param awayTeamId 客队ID
 * @param season 赛季年份
 */
export async function getTeamStrengthInfo(
  leagueId: number,
  homeTeamId: number,
  awayTeamId: number,
  season = 2024
): Promise<TeamStrengthInfo | undefined> {
  try {
    const standing = await getStandings(leagueId, season);
    if (!standing) return undefined;

    const homeInfo = getTeamRankInfo(standing, homeTeamId);
    const awayInfo = getTeamRankInfo(standing, awayTeamId);

    if (!homeInfo || !awayInfo) return undefined;

    const homeStrength = homeInfo.strengthScore;
    const awayStrength = awayInfo.strengthScore;
    const strengthGap = Math.abs(homeStrength - awayStrength);

    // 强队判定: 强度分数 >= 70 且比对手高 15+
    const isHomeStrong = homeStrength >= 70 && homeStrength > awayStrength + 15;
    const isAwayStrong = awayStrength >= 70 && awayStrength > homeStrength + 15;

    return {
      homeStrength,
      awayStrength,
      isHomeStrong,
      isAwayStrong,
      strengthGap,
    };
  } catch (error) {
    console.warn('[standingsService] Failed to get team strength info:', error);
    return undefined;
  }
}

/**
 * 基于排名快速判断强弱 (无需完整强度计算)
 * @param standing 积分榜
 * @param homeTeamId 主队ID
 * @param awayTeamId 客队ID
 */
export function quickStrengthCheck(
  standing: Standing | null,
  homeTeamId: number,
  awayTeamId: number
): { isHomeStrong: boolean; isAwayStrong: boolean; rankGap: number } | null {
  if (!standing?.league?.standings?.[0]) return null;

  const teams = standing.league.standings[0];
  const homeTeam = teams.find(t => t.team.id === homeTeamId);
  const awayTeam = teams.find(t => t.team.id === awayTeamId);

  if (!homeTeam || !awayTeam) return null;

  const homeRank = homeTeam.rank;
  const awayRank = awayTeam.rank;
  const rankGap = Math.abs(homeRank - awayRank);
  const totalTeams = teams.length;

  // 强队: 排名前25% 且排名差 >= 6
  const topQuarter = Math.ceil(totalTeams * 0.25);

  const isHomeStrong = homeRank <= topQuarter && homeRank < awayRank - 5;
  const isAwayStrong = awayRank <= topQuarter && awayRank < homeRank - 5;

  return {
    isHomeStrong,
    isAwayStrong,
    rankGap,
  };
}

/**
 * 批量获取多个联赛的积分榜
 * @param leagueIds 联赛ID列表
 * @param season 赛季年份
 */
export async function batchGetStandings(
  leagueIds: number[],
  season = 2024
): Promise<Map<number, Standing>> {
  const results = new Map<number, Standing>();

  // 并行获取所有联赛
  const promises = leagueIds.map(async (leagueId) => {
    const standing = await getStandings(leagueId, season);
    if (standing) {
      results.set(leagueId, standing);
    }
  });

  await Promise.allSettled(promises);
  return results;
}

/**
 * 清除积分榜缓存
 */
export function clearStandingsCache(): void {
  standingsCache.clear();
}

/**
 * 获取缓存状态
 */
export function getStandingsCacheStats(): {
  size: number;
  keys: string[];
} {
  return {
    size: standingsCache.size,
    keys: Array.from(standingsCache.keys()),
  };
}

// ============================================
// 常用联赛ID
// ============================================

export const TOP_LEAGUE_IDS = {
  PREMIER_LEAGUE: 39,     // 英超
  LA_LIGA: 140,           // 西甲
  BUNDESLIGA: 78,         // 德甲
  SERIE_A: 135,           // 意甲
  LIGUE_1: 61,            // 法甲
  CHAMPIONS_LEAGUE: 2,    // 欧冠
  EUROPA_LEAGUE: 3,       // 欧联
} as const;

/**
 * 检查是否为顶级联赛
 */
export function isTopLeague(leagueId: number): boolean {
  return Object.values(TOP_LEAGUE_IDS).includes(leagueId as any);
}
