/**
 * ============================================
 * 历史数据收集服务
 * 用于回测的真实历史比赛数据获取与存储
 *
 * Version: 1.0.0
 * ============================================
 */

import * as SDK from './apiFootballSDK';
import { supabase } from '../lib/supabase';
import type { Match, TeamStatistics, MatchEvent, OddsData } from '../types';

// ============================================
// 类型定义
// ============================================

/** 历史比赛快照 - 用于回测 */
export interface HistoricalMatchSnapshot {
  fixture_id: number;
  minute: number;
  timestamp: number;

  // 比分
  score_home: number;
  score_away: number;

  // 统计数据
  shots_home: number;
  shots_away: number;
  shots_on_home: number;
  shots_on_away: number;
  corners_home: number;
  corners_away: number;
  possession_home: number;
  possession_away: number;
  xg_home: number;
  xg_away: number;
  dangerous_home: number;
  dangerous_away: number;

  // 赔率快照
  over_odds: number | null;
  under_odds: number | null;
  ou_line: number | null;
  ah_line: number | null;
  ah_home: number | null;
  ah_away: number | null;
}

/** 历史比赛完整数据 - 用于回测 */
export interface HistoricalMatchData {
  fixture_id: number;
  league_id: number;
  league_name: string;
  home_team_id: number;
  home_team_name: string;
  away_team_id: number;
  away_team_name: string;
  match_date: string;
  kick_off_time: string;

  // 最终比分
  final_home: number;
  final_away: number;
  ht_home: number;
  ht_away: number;

  // 进球时间
  goal_minutes: number[];

  // 快照 (65分钟+)
  snapshots: HistoricalMatchSnapshot[];

  // 元数据
  collected_at: string;
}

/** 收集进度 */
export interface CollectionProgress {
  league_id: number;
  league_name: string;
  season: number;
  total_matches: number;
  collected_matches: number;
  failed_matches: number;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  last_updated: string;
}

/** 主要联赛配置 */
export const MAJOR_LEAGUES = [
  { id: 39, name: '英超', country: 'England' },
  { id: 140, name: '西甲', country: 'Spain' },
  { id: 78, name: '德甲', country: 'Germany' },
  { id: 135, name: '意甲', country: 'Italy' },
  { id: 61, name: '法甲', country: 'France' },
  { id: 2, name: '欧冠', country: 'World' },
  { id: 3, name: '欧联', country: 'World' },
  { id: 94, name: '葡超', country: 'Portugal' },
  { id: 88, name: '荷甲', country: 'Netherlands' },
];

// ============================================
// 统计数据解析
// ============================================

function parseStatValue(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const num = Number.parseFloat(value.replace('%', ''));
  return isNaN(num) ? 0 : num;
}

function extractStats(stats: TeamStatistics[]): {
  home: Record<string, number>;
  away: Record<string, number>;
} {
  const result = {
    home: {} as Record<string, number>,
    away: {} as Record<string, number>,
  };

  if (!stats || stats.length < 2) return result;

  for (const stat of stats[0]?.statistics || []) {
    result.home[stat.type.toLowerCase().replace(/ /g, '_')] = parseStatValue(stat.value);
  }
  for (const stat of stats[1]?.statistics || []) {
    result.away[stat.type.toLowerCase().replace(/ /g, '_')] = parseStatValue(stat.value);
  }

  return result;
}

// ============================================
// 数据收集函数
// ============================================

/**
 * 从已完成比赛收集历史数据
 * @param match 比赛数据
 * @param stats 统计数据
 * @param events 事件数据
 * @param odds 赔率数据
 */
export async function collectMatchData(
  match: Match,
  stats: TeamStatistics[],
  events: MatchEvent[],
  odds?: OddsData | null
): Promise<HistoricalMatchData | null> {
  try {
    const { fixture, league, teams, goals, score } = match;

    // 只处理已结束的比赛
    if (fixture.status.short !== 'FT') {
      return null;
    }

    // 提取进球时间
    const goalMinutes = events
      .filter((e) => e.type === 'Goal' && e.detail !== 'Missed Penalty')
      .map((e) => e.time.elapsed + (e.time.extra || 0));

    // 提取统计数据
    const parsedStats = extractStats(stats);

    // 构建 65+ 分钟快照 (模拟基于最终统计的分布)
    const snapshots: HistoricalMatchSnapshot[] = [];

    // 我们无法获取比赛中的实时快照，但可以根据最终统计推算
    // 65, 70, 75, 80, 85 分钟的快照
    const snapshotMinutes = [65, 70, 75, 80, 85];
    const finalMinute = 90;

    for (const minute of snapshotMinutes) {
      const ratio = minute / finalMinute;

      // 计算该时间点的比分
      const goalsAtMinute = goalMinutes.filter((m) => m <= minute).length;
      const homeGoalsAtMinute = events
        .filter(
          (e) =>
            e.type === 'Goal' &&
            e.detail !== 'Missed Penalty' &&
            e.time.elapsed + (e.time.extra || 0) <= minute &&
            e.team.id === teams.home.id
        )
        .length;
      const awayGoalsAtMinute = goalsAtMinute - homeGoalsAtMinute;

      // 估算统计数据 (线性分布)
      snapshots.push({
        fixture_id: fixture.id,
        minute,
        timestamp: fixture.timestamp + minute * 60,
        score_home: homeGoalsAtMinute,
        score_away: awayGoalsAtMinute,
        shots_home: Math.round((parsedStats.home['total_shots'] || parsedStats.home['shots_on_goal'] || 0) * ratio),
        shots_away: Math.round((parsedStats.away['total_shots'] || parsedStats.away['shots_on_goal'] || 0) * ratio),
        shots_on_home: Math.round((parsedStats.home['shots_on_goal'] || 0) * ratio),
        shots_on_away: Math.round((parsedStats.away['shots_on_goal'] || 0) * ratio),
        corners_home: Math.round((parsedStats.home['corner_kicks'] || 0) * ratio),
        corners_away: Math.round((parsedStats.away['corner_kicks'] || 0) * ratio),
        possession_home: parsedStats.home['ball_possession'] || 50,
        possession_away: parsedStats.away['ball_possession'] || 50,
        xg_home: ((parsedStats.home['expected_goals'] || 0) * ratio),
        xg_away: ((parsedStats.away['expected_goals'] || 0) * ratio),
        dangerous_home: Math.round((parsedStats.home['attacks'] || 0) * ratio * 0.3),
        dangerous_away: Math.round((parsedStats.away['attacks'] || 0) * ratio * 0.3),
        // 赔率需要从历史赔率API获取，这里暂时为空
        over_odds: null,
        under_odds: null,
        ou_line: 2.5,
        ah_line: null,
        ah_home: null,
        ah_away: null,
      });
    }

    return {
      fixture_id: fixture.id,
      league_id: league.id,
      league_name: league.name,
      home_team_id: teams.home.id,
      home_team_name: teams.home.name,
      away_team_id: teams.away.id,
      away_team_name: teams.away.name,
      match_date: fixture.date.split('T')[0],
      kick_off_time: fixture.date,
      final_home: goals.home ?? 0,
      final_away: goals.away ?? 0,
      ht_home: score.halftime.home ?? 0,
      ht_away: score.halftime.away ?? 0,
      goal_minutes: goalMinutes,
      snapshots,
      collected_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[HistoricalData] 收集比赛数据失败:`, error);
    return null;
  }
}

/**
 * 批量收集联赛历史数据
 * @param leagueId 联赛ID
 * @param season 赛季
 * @param onProgress 进度回调
 */
export async function collectLeagueHistory(
  leagueId: number,
  season: number,
  onProgress?: (progress: CollectionProgress) => void
): Promise<HistoricalMatchData[]> {
  const leagueName = MAJOR_LEAGUES.find((l) => l.id === leagueId)?.name || `League ${leagueId}`;
  const results: HistoricalMatchData[] = [];

  const progress: CollectionProgress = {
    league_id: leagueId,
    league_name: leagueName,
    season,
    total_matches: 0,
    collected_matches: 0,
    failed_matches: 0,
    status: 'in_progress',
    last_updated: new Date().toISOString(),
  };

  try {
    // 获取联赛所有比赛
    console.log(`[HistoricalData] 获取 ${leagueName} ${season} 赛季比赛...`);
    const matches = await SDK.getFixturesByLeague(leagueId, season);

    // 过滤已完成的比赛
    const finishedMatches = matches.filter((m) => m.fixture.status.short === 'FT');
    progress.total_matches = finishedMatches.length;
    onProgress?.(progress);

    console.log(`[HistoricalData] 共 ${finishedMatches.length} 场已完成比赛`);

    // 逐个收集 (API限制，需要控制速率)
    for (let i = 0; i < finishedMatches.length; i++) {
      const match = finishedMatches[i];

      try {
        // 获取统计和事件
        const [stats, events] = await Promise.all([
          SDK.getFixtureStatistics(match.fixture.id),
          SDK.getFixtureEvents(match.fixture.id),
        ]);

        const data = await collectMatchData(match, stats, events);

        if (data) {
          results.push(data);
          progress.collected_matches++;
        } else {
          progress.failed_matches++;
        }
      } catch (error) {
        console.error(`[HistoricalData] 收集比赛 ${match.fixture.id} 失败:`, error);
        progress.failed_matches++;
      }

      progress.last_updated = new Date().toISOString();
      onProgress?.(progress);

      // API 速率限制 (10 req/min for free plan)
      if ((i + 1) % 5 === 0) {
        console.log(`[HistoricalData] 进度: ${i + 1}/${finishedMatches.length}`);
        await new Promise((r) => setTimeout(r, 3000)); // 等待3秒
      }
    }

    progress.status = 'completed';
    onProgress?.(progress);

    return results;
  } catch (error) {
    console.error(`[HistoricalData] 收集联赛数据失败:`, error);
    progress.status = 'error';
    onProgress?.(progress);
    return results;
  }
}

// ============================================
// Supabase 存储
// ============================================

/**
 * 保存历史比赛数据到 Supabase
 */
export async function saveHistoricalData(data: HistoricalMatchData[]): Promise<number> {
  if (!data.length) return 0;

  try {
    const { error } = await supabase.from('historical_matches').upsert(
      data.map((d) => ({
        fixture_id: d.fixture_id,
        league_id: d.league_id,
        league_name: d.league_name,
        home_team_id: d.home_team_id,
        home_team_name: d.home_team_name,
        away_team_id: d.away_team_id,
        away_team_name: d.away_team_name,
        match_date: d.match_date,
        kick_off_time: d.kick_off_time,
        final_home: d.final_home,
        final_away: d.final_away,
        ht_home: d.ht_home,
        ht_away: d.ht_away,
        goal_minutes: d.goal_minutes,
        snapshots: d.snapshots,
        collected_at: d.collected_at,
      })),
      { onConflict: 'fixture_id' }
    );

    if (error) {
      console.error('[HistoricalData] Supabase 保存失败:', error);
      return 0;
    }

    return data.length;
  } catch (error) {
    console.error('[HistoricalData] 保存失败:', error);
    return 0;
  }
}

/**
 * 从 Supabase 加载历史数据
 */
export async function loadHistoricalData(options?: {
  leagueId?: number;
  season?: string; // "2024" -> match_date LIKE '2024%' or '2025%'
  limit?: number;
}): Promise<HistoricalMatchData[]> {
  try {
    let query = supabase.from('historical_matches').select('*');

    if (options?.leagueId) {
      query = query.eq('league_id', options.leagueId);
    }

    if (options?.season) {
      // 赛季通常跨年，如 2024 赛季是 2024-08 到 2025-05
      const seasonStart = `${options.season}-08`;
      const seasonEnd = `${Number.parseInt(options.season) + 1}-06`;
      query = query.gte('match_date', seasonStart).lte('match_date', seasonEnd);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[HistoricalData] 加载失败:', error);
      return [];
    }

    return data as HistoricalMatchData[];
  } catch (error) {
    console.error('[HistoricalData] 加载失败:', error);
    return [];
  }
}

/**
 * 获取历史数据统计
 */
export async function getHistoricalDataStats(): Promise<{
  totalMatches: number;
  byLeague: Record<number, number>;
  dateRange: { min: string; max: string } | null;
}> {
  try {
    const { data, error } = await supabase
      .from('historical_matches')
      .select('fixture_id, league_id, match_date');

    if (error || !data) {
      return { totalMatches: 0, byLeague: {}, dateRange: null };
    }

    const byLeague: Record<number, number> = {};
    let minDate = '';
    let maxDate = '';

    for (const row of data) {
      byLeague[row.league_id] = (byLeague[row.league_id] || 0) + 1;
      if (!minDate || row.match_date < minDate) minDate = row.match_date;
      if (!maxDate || row.match_date > maxDate) maxDate = row.match_date;
    }

    return {
      totalMatches: data.length,
      byLeague,
      dateRange: minDate ? { min: minDate, max: maxDate } : null,
    };
  } catch (error) {
    console.error('[HistoricalData] 获取统计失败:', error);
    return { totalMatches: 0, byLeague: {}, dateRange: null };
  }
}

// ============================================
// 本地存储 (localStorage fallback)
// ============================================

const LOCAL_STORAGE_KEY = 'backtest_historical_data';

/**
 * 保存到 localStorage
 */
export function saveToLocalStorage(data: HistoricalMatchData[]): void {
  try {
    const existing = loadFromLocalStorage();
    const merged = [...existing];

    for (const item of data) {
      const idx = merged.findIndex((m) => m.fixture_id === item.fixture_id);
      if (idx >= 0) {
        merged[idx] = item;
      } else {
        merged.push(item);
      }
    }

    // 限制大小 (最多500场)
    const limited = merged.slice(-500);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(limited));
  } catch (error) {
    console.error('[HistoricalData] localStorage 保存失败:', error);
  }
}

/**
 * 从 localStorage 加载
 */
export function loadFromLocalStorage(): HistoricalMatchData[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoricalMatchData[];
  } catch (error) {
    console.error('[HistoricalData] localStorage 加载失败:', error);
    return [];
  }
}

/**
 * 清除本地缓存
 */
export function clearLocalStorage(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}
