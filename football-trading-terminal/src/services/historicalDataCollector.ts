/**
 * ============================================
 * 历史数据收集服务
 * 从 API-Football 获取已完成比赛数据用于回测
 *
 * Version: 1.0
 * ============================================
 */

import * as SDK from './apiFootballSDK';
import type { Match, TeamStatistics, MatchEvent } from '../types';

// ============================================
// 类型定义
// ============================================

/** 历史比赛快照 - 用于回测 */
export interface HistoricalSnapshot {
  minute: number;
  score: { home: number; away: number };
  stats: {
    shots: { home: number; away: number };
    shotsOn: { home: number; away: number };
    xg: { home: number; away: number };
    corners: { home: number; away: number };
    possession: { home: number; away: number };
    dangerous: { home: number; away: number };
  };
  odds?: {
    overOdds: number;
    underOdds: number;
    ouLine: number;
    ahLine: number;
    ahHome: number;
    ahAway: number;
  };
}

/** 历史比赛完整数据 */
export interface HistoricalMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  league: string;
  leagueId: number;
  date: string;
  finalScore: { home: number; away: number };
  halfTimeScore: { home: number; away: number };
  // 进球时间列表
  goalMinutes: number[];
  // 各时间点快照 (65', 70', 75', 80', 85', 90')
  snapshots: HistoricalSnapshot[];
  // 原始数据
  rawStats?: TeamStatistics[];
  rawEvents?: MatchEvent[];
}

/** 收集配置 */
export interface CollectorConfig {
  leagueIds: number[];       // 要收集的联赛 ID
  season: number;            // 赛季
  dateFrom?: string;         // 起始日期 YYYY-MM-DD
  dateTo?: string;           // 结束日期 YYYY-MM-DD
  minMinute?: number;        // 最小分钟数 (默认 65)
  delayMs?: number;          // API 请求延迟 (毫秒)
}

/** 收集进度 */
export interface CollectorProgress {
  total: number;
  completed: number;
  failed: number;
  currentMatch?: string;
}

// ============================================
// 主要联赛 ID 映射
// ============================================

export const MAJOR_LEAGUES = {
  // 欧洲五大联赛
  PREMIER_LEAGUE: 39,      // 英超
  LA_LIGA: 140,            // 西甲
  BUNDESLIGA: 78,          // 德甲
  SERIE_A: 135,            // 意甲
  LIGUE_1: 61,             // 法甲

  // 其他欧洲联赛
  EREDIVISIE: 88,          // 荷甲
  PRIMEIRA_LIGA: 94,       // 葡超
  SUPER_LIG: 203,          // 土超

  // 欧洲杯赛
  CHAMPIONS_LEAGUE: 2,     // 欧冠
  EUROPA_LEAGUE: 3,        // 欧联

  // 其他地区
  MLS: 253,                // 美职联
  J_LEAGUE: 98,            // 日职联
  K_LEAGUE: 292,           // 韩K联
  CSL: 169,                // 中超
} as const;

// ============================================
// 辅助函数
// ============================================

/** 从统计数组中获取值 */
function getStatValue(stats: TeamStatistics[], teamIndex: number, statType: string): number {
  const team = stats[teamIndex];
  if (!team?.statistics) return 0;

  const stat = team.statistics.find(s =>
    s.type.toLowerCase().includes(statType.toLowerCase())
  );

  if (!stat?.value) return 0;
  if (typeof stat.value === 'number') return stat.value;
  if (typeof stat.value === 'string') {
    // 处理百分比 "55%"
    const num = parseFloat(stat.value.replace('%', ''));
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/** 从事件中提取进球时间 */
function extractGoalMinutes(events: MatchEvent[]): number[] {
  return events
    .filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty')
    .map(e => e.time.elapsed + (e.time.extra || 0))
    .sort((a, b) => a - b);
}

/** 根据进球时间重建各分钟的比分 */
function reconstructScoreAtMinute(
  goalMinutes: number[],
  events: MatchEvent[],
  minute: number
): { home: number; away: number } {
  let home = 0;
  let away = 0;

  for (const event of events) {
    if (event.type !== 'Goal' || event.detail === 'Missed Penalty') continue;
    const goalMinute = event.time.elapsed + (event.time.extra || 0);
    if (goalMinute <= minute) {
      // 需要判断是主队还是客队进球 - 通过 team.id 判断
      // 这里简化处理，使用事件中的 team 信息
      if (event.team) {
        // 假设我们有主队 ID，需要从外部传入
        // 暂时用 events 的顺序来判断
      }
    }
  }

  return { home, away };
}

/** 模拟不同时间点的统计数据 (基于终场数据按比例计算) */
function interpolateStats(
  finalStats: TeamStatistics[],
  minute: number,
  totalMinutes = 90
): HistoricalSnapshot['stats'] {
  // 根据时间比例估算该时间点的数据
  const ratio = minute / totalMinutes;
  // 加入一些随机性，模拟真实比赛的波动
  const variance = 0.1; // 10% 方差

  const applyRatio = (value: number): number => {
    const base = value * ratio;
    const randomFactor = 1 + (Math.random() - 0.5) * variance * 2;
    return Math.round(base * randomFactor);
  };

  return {
    shots: {
      home: applyRatio(getStatValue(finalStats, 0, 'Total Shots')),
      away: applyRatio(getStatValue(finalStats, 1, 'Total Shots')),
    },
    shotsOn: {
      home: applyRatio(getStatValue(finalStats, 0, 'Shots on Goal')),
      away: applyRatio(getStatValue(finalStats, 1, 'Shots on Goal')),
    },
    xg: {
      home: Number((getStatValue(finalStats, 0, 'expected_goals') * ratio).toFixed(2)),
      away: Number((getStatValue(finalStats, 1, 'expected_goals') * ratio).toFixed(2)),
    },
    corners: {
      home: applyRatio(getStatValue(finalStats, 0, 'Corner Kicks')),
      away: applyRatio(getStatValue(finalStats, 1, 'Corner Kicks')),
    },
    possession: {
      home: getStatValue(finalStats, 0, 'Ball Possession') || 50,
      away: getStatValue(finalStats, 1, 'Ball Possession') || 50,
    },
    dangerous: {
      home: applyRatio(getStatValue(finalStats, 0, 'Dangerous Attacks') || 0),
      away: applyRatio(getStatValue(finalStats, 1, 'Dangerous Attacks') || 0),
    },
  };
}

/** 根据比分和时间生成模拟赔率 */
function generateSimulatedOdds(
  score: { home: number; away: number },
  minute: number,
  ouLine = 2.5
): HistoricalSnapshot['odds'] {
  const totalGoals = score.home + score.away;
  const remainingTime = 90 - minute;
  const remainingRatio = remainingTime / 90;

  // 估算剩余时间内的预期进球
  const avgGoalsPer90 = 2.6; // 平均每场 2.6 球
  const expectedRemaining = avgGoalsPer90 * remainingRatio;

  // 到 ouLine 还差多少球
  const goalsNeeded = ouLine - totalGoals;

  // 简单的赔率模型
  let overProb: number;
  if (goalsNeeded <= 0) {
    // 已经达到大球
    overProb = 1 - (0.1 * Math.max(0, goalsNeeded));
  } else if (goalsNeeded >= expectedRemaining * 2) {
    // 很难达到
    overProb = 0.1;
  } else {
    // 正常情况
    overProb = Math.max(0.15, Math.min(0.85, expectedRemaining / goalsNeeded * 0.5));
  }

  // 转换为赔率 (含水位 ~5%)
  const margin = 0.05;
  const overOdds = Number(((1 / overProb) * (1 - margin / 2)).toFixed(2));
  const underOdds = Number(((1 / (1 - overProb)) * (1 - margin / 2)).toFixed(2));

  // 让球盘 (简化)
  const scoreDiff = score.home - score.away;
  const ahLine = -scoreDiff * 0.5;

  return {
    overOdds: Math.max(1.01, Math.min(15, overOdds)),
    underOdds: Math.max(1.01, Math.min(15, underOdds)),
    ouLine,
    ahLine,
    ahHome: 1.90,
    ahAway: 1.90,
  };
}

// ============================================
// 数据收集器
// ============================================

/**
 * 收集单场比赛的历史数据
 */
export async function collectMatchData(
  match: Match,
  config: Partial<CollectorConfig> = {}
): Promise<HistoricalMatch | null> {
  const fixtureId = match.fixture.id;
  const minMinute = config.minMinute ?? 65;

  try {
    // 获取比赛统计
    const stats = await SDK.getFixtureStatistics(fixtureId);
    if (!stats || stats.length < 2) {
      console.warn(`[Collector] No stats for fixture ${fixtureId}`);
      return null;
    }

    // 获取比赛事件
    const events = await SDK.getFixtureEvents(fixtureId);
    const goalMinutes = extractGoalMinutes(events || []);

    // 构建快照 (65', 70', 75', 80', 85', 90')
    const snapshotMinutes = [65, 70, 75, 80, 85, 90].filter(m => m >= minMinute);
    const snapshots: HistoricalSnapshot[] = [];

    for (const minute of snapshotMinutes) {
      // 计算该时间点的比分
      const goalsAtMinute = goalMinutes.filter(gm => gm <= minute).length;
      // 简化: 按比例分配给主客队 (实际应该从事件中精确计算)
      const homeGoalsRatio = match.goals.home
        ? match.goals.home / ((match.goals.home || 0) + (match.goals.away || 0) || 1)
        : 0.5;

      // 从事件中精确重建比分
      let homeScore = 0;
      let awayScore = 0;
      for (const event of events || []) {
        if (event.type !== 'Goal' || event.detail === 'Missed Penalty') continue;
        const goalMinute = event.time.elapsed + (event.time.extra || 0);
        if (goalMinute <= minute) {
          if (event.team.id === match.teams.home.id) {
            homeScore++;
          } else {
            awayScore++;
          }
        }
      }

      const score = { home: homeScore, away: awayScore };
      const statsAtMinute = interpolateStats(stats, minute);
      const odds = generateSimulatedOdds(score, minute);

      snapshots.push({
        minute,
        score,
        stats: statsAtMinute,
        odds,
      });
    }

    return {
      id: fixtureId,
      homeTeam: match.teams.home.name,
      awayTeam: match.teams.away.name,
      homeTeamId: match.teams.home.id,
      awayTeamId: match.teams.away.id,
      league: match.league.name,
      leagueId: match.league.id,
      date: match.fixture.date,
      finalScore: {
        home: match.goals.home ?? 0,
        away: match.goals.away ?? 0,
      },
      halfTimeScore: {
        home: match.score.halftime.home ?? 0,
        away: match.score.halftime.away ?? 0,
      },
      goalMinutes,
      snapshots,
      rawStats: stats,
      rawEvents: events,
    };
  } catch (error) {
    console.error(`[Collector] Error collecting match ${fixtureId}:`, error);
    return null;
  }
}

/**
 * 批量收集联赛历史数据
 */
export async function collectLeagueData(
  config: CollectorConfig,
  onProgress?: (progress: CollectorProgress) => void
): Promise<HistoricalMatch[]> {
  const results: HistoricalMatch[] = [];
  const delayMs = config.delayMs ?? 300; // API 限速

  for (const leagueId of config.leagueIds) {
    console.log(`[Collector] Fetching fixtures for league ${leagueId}, season ${config.season}`);

    try {
      // 获取联赛所有比赛
      const fixtures = await SDK.getFixturesByLeague(leagueId, config.season);

      // 过滤已完成的比赛
      const finishedMatches = fixtures.filter(m => {
        const status = m.fixture.status.short;
        const isFinished = ['FT', 'AET', 'PEN'].includes(status);

        // 日期过滤
        if (config.dateFrom || config.dateTo) {
          const matchDate = m.fixture.date.split('T')[0];
          if (config.dateFrom && matchDate < config.dateFrom) return false;
          if (config.dateTo && matchDate > config.dateTo) return false;
        }

        return isFinished;
      });

      console.log(`[Collector] Found ${finishedMatches.length} finished matches`);

      const progress: CollectorProgress = {
        total: finishedMatches.length,
        completed: 0,
        failed: 0,
      };

      for (const match of finishedMatches) {
        progress.currentMatch = `${match.teams.home.name} vs ${match.teams.away.name}`;
        onProgress?.(progress);

        const data = await collectMatchData(match, config);
        if (data) {
          results.push(data);
          progress.completed++;
        } else {
          progress.failed++;
        }

        // API 限速延迟
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

    } catch (error) {
      console.error(`[Collector] Error fetching league ${leagueId}:`, error);
    }
  }

  return results;
}

/**
 * 按日期范围收集数据
 */
export async function collectByDateRange(
  startDate: string,
  endDate: string,
  config: Partial<CollectorConfig> = {},
  onProgress?: (progress: CollectorProgress) => void
): Promise<HistoricalMatch[]> {
  const results: HistoricalMatch[] = [];
  const delayMs = config.delayMs ?? 300;

  // 生成日期范围
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  console.log(`[Collector] Collecting data for ${dates.length} days`);

  const progress: CollectorProgress = {
    total: dates.length,
    completed: 0,
    failed: 0,
  };

  for (const date of dates) {
    progress.currentMatch = `Date: ${date}`;
    onProgress?.(progress);

    try {
      const fixtures = await SDK.getFixturesByDate(date);

      // 过滤已完成 + 主要联赛
      const targetLeagues = config.leagueIds ?? Object.values(MAJOR_LEAGUES);
      const finishedMatches = fixtures.filter(m => {
        const status = m.fixture.status.short;
        const isFinished = ['FT', 'AET', 'PEN'].includes(status);
        const isMajorLeague = targetLeagues.includes(m.league.id);
        return isFinished && isMajorLeague;
      });

      for (const match of finishedMatches) {
        const data = await collectMatchData(match, config);
        if (data) results.push(data);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      progress.completed++;
    } catch (error) {
      console.error(`[Collector] Error on date ${date}:`, error);
      progress.failed++;
    }
  }

  return results;
}

// ============================================
// 数据持久化
// ============================================

/** 导出数据为 JSON */
export function exportToJSON(matches: HistoricalMatch[]): string {
  // 移除原始数据以减小文件大小
  const exportData = matches.map(m => ({
    ...m,
    rawStats: undefined,
    rawEvents: undefined,
  }));
  return JSON.stringify(exportData, null, 2);
}

/** 从 JSON 导入数据 */
export function importFromJSON(json: string): HistoricalMatch[] {
  try {
    return JSON.parse(json);
  } catch {
    console.error('[Collector] Failed to parse JSON');
    return [];
  }
}

/** 保存到 localStorage (浏览器环境) */
export function saveToLocalStorage(key: string, matches: HistoricalMatch[]): void {
  try {
    const data = exportToJSON(matches);
    localStorage.setItem(key, data);
    console.log(`[Collector] Saved ${matches.length} matches to localStorage`);
  } catch (error) {
    console.error('[Collector] Failed to save to localStorage:', error);
  }
}

/** 从 localStorage 加载 (浏览器环境) */
export function loadFromLocalStorage(key: string): HistoricalMatch[] {
  try {
    const data = localStorage.getItem(key);
    if (!data) return [];
    return importFromJSON(data);
  } catch {
    return [];
  }
}

// ============================================
// 数据统计
// ============================================

export interface DatasetStats {
  totalMatches: number;
  totalSnapshots: number;
  byLeague: Record<string, number>;
  byMonth: Record<string, number>;
  avgGoalsPerMatch: number;
  scoreDistribution: Record<string, number>;
  goalMinuteDistribution: Record<number, number>;
}

/** 计算数据集统计信息 */
export function calculateDatasetStats(matches: HistoricalMatch[]): DatasetStats {
  const stats: DatasetStats = {
    totalMatches: matches.length,
    totalSnapshots: matches.reduce((sum, m) => sum + m.snapshots.length, 0),
    byLeague: {},
    byMonth: {},
    avgGoalsPerMatch: 0,
    scoreDistribution: {},
    goalMinuteDistribution: {},
  };

  let totalGoals = 0;

  for (const match of matches) {
    // 联赛分布
    stats.byLeague[match.league] = (stats.byLeague[match.league] || 0) + 1;

    // 月份分布
    const month = match.date.slice(0, 7);
    stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;

    // 总进球
    const goals = match.finalScore.home + match.finalScore.away;
    totalGoals += goals;

    // 比分分布
    const scoreKey = `${match.finalScore.home}-${match.finalScore.away}`;
    stats.scoreDistribution[scoreKey] = (stats.scoreDistribution[scoreKey] || 0) + 1;

    // 进球时间分布
    for (const minute of match.goalMinutes) {
      const bucket = Math.floor(minute / 15) * 15;
      stats.goalMinuteDistribution[bucket] = (stats.goalMinuteDistribution[bucket] || 0) + 1;
    }
  }

  stats.avgGoalsPerMatch = matches.length > 0 ? totalGoals / matches.length : 0;

  return stats;
}
