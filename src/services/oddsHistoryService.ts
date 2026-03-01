/**
 * ============================================
 * 赔率历史追踪服务
 * 追踪每场比赛的大小球/让球赔率变化
 * Version: 1.0
 * ============================================
 */

// ============================================
// 类型定义
// ============================================

export interface OddsSnapshot {
  timestamp: number;
  minute: number;
  // 大小球
  ouLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  // 让球
  ahLine: number | null;
  ahHome: number | null;
  ahAway: number | null;
}

export interface MatchOddsHistory {
  matchId: number;
  snapshots: OddsSnapshot[];
  firstSeen: number;
  lastUpdated: number;
}

export interface OddsMovementSummary {
  // 大小球趋势
  overOddsHistory: number[];
  overOddsChange: number;       // 百分比变化
  overOddsDirection: 'up' | 'down' | 'stable';
  overOddsSignificant: boolean; // 是否显著变化 (>5%)

  // 让球趋势
  ahHomeHistory: number[];
  ahHomeChange: number;
  ahHomeDirection: 'up' | 'down' | 'stable';

  // 元数据
  snapshotCount: number;
  timeSpanMinutes: number;
}

// ============================================
// 存储
// ============================================

// 内存缓存 (Session 级别)
const oddsHistoryMap = new Map<number, MatchOddsHistory>();

// 配置
const MAX_SNAPSHOTS_PER_MATCH = 30;  // 最多保留 30 个快照
const SNAPSHOT_INTERVAL_MS = 60000;  // 最小快照间隔 1 分钟
const SIGNIFICANT_CHANGE_THRESHOLD = 5; // 5% 视为显著变化

// ============================================
// 核心函数
// ============================================

/**
 * 记录赔率快照
 * @param matchId 比赛ID
 * @param minute 当前分钟
 * @param odds 赔率数据
 */
export function recordOddsSnapshot(
  matchId: number,
  minute: number,
  odds: {
    ouLine?: number | null;
    overOdds?: number | null;
    underOdds?: number | null;
    ahLine?: number | null;
    ahHome?: number | null;
    ahAway?: number | null;
  }
): void {
  const now = Date.now();

  let history = oddsHistoryMap.get(matchId);

  if (!history) {
    // 新比赛
    history = {
      matchId,
      snapshots: [],
      firstSeen: now,
      lastUpdated: now,
    };
    oddsHistoryMap.set(matchId, history);
  }

  // 检查是否需要添加新快照 (间隔检查)
  const lastSnapshot = history.snapshots[history.snapshots.length - 1];
  if (lastSnapshot && now - lastSnapshot.timestamp < SNAPSHOT_INTERVAL_MS) {
    return; // 太频繁，跳过
  }

  // 检查数据是否有变化
  if (lastSnapshot) {
    const noChange =
      lastSnapshot.overOdds === odds.overOdds &&
      lastSnapshot.underOdds === odds.underOdds &&
      lastSnapshot.ahHome === odds.ahHome &&
      lastSnapshot.ahAway === odds.ahAway;

    if (noChange) return; // 无变化，跳过
  }

  // 添加新快照
  const snapshot: OddsSnapshot = {
    timestamp: now,
    minute,
    ouLine: odds.ouLine ?? null,
    overOdds: odds.overOdds ?? null,
    underOdds: odds.underOdds ?? null,
    ahLine: odds.ahLine ?? null,
    ahHome: odds.ahHome ?? null,
    ahAway: odds.ahAway ?? null,
  };

  history.snapshots.push(snapshot);
  history.lastUpdated = now;

  // 限制快照数量
  if (history.snapshots.length > MAX_SNAPSHOTS_PER_MATCH) {
    history.snapshots = history.snapshots.slice(-MAX_SNAPSHOTS_PER_MATCH);
  }
}

/**
 * 批量记录赔率快照
 */
export function batchRecordOddsSnapshots(
  matches: Array<{
    id: number;
    minute: number;
    odds?: {
      overUnder?: { total?: number | null; over?: number | null; under?: number | null };
      handicap?: { value?: number | null; home?: number | null; away?: number | null };
      _fetch_status?: string;
    };
  }>
): void {
  for (const match of matches) {
    if (match.odds?._fetch_status !== 'SUCCESS') continue;

    recordOddsSnapshot(match.id, match.minute, {
      ouLine: match.odds.overUnder?.total,
      overOdds: match.odds.overUnder?.over,
      underOdds: match.odds.overUnder?.under,
      ahLine: match.odds.handicap?.value,
      ahHome: match.odds.handicap?.home,
      ahAway: match.odds.handicap?.away,
    });
  }
}

/**
 * 获取比赛赔率历史
 */
export function getOddsHistory(matchId: number): MatchOddsHistory | null {
  return oddsHistoryMap.get(matchId) ?? null;
}

/**
 * 获取赔率变化摘要
 */
export function getOddsMovementSummary(matchId: number): OddsMovementSummary | null {
  const history = oddsHistoryMap.get(matchId);
  if (!history || history.snapshots.length < 2) {
    return null;
  }

  const snapshots = history.snapshots;
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  // 大小球历史
  const overOddsHistory = snapshots
    .map(s => s.overOdds)
    .filter((v): v is number => v !== null);

  // 让球历史
  const ahHomeHistory = snapshots
    .map(s => s.ahHome)
    .filter((v): v is number => v !== null);

  // 计算大小球变化
  let overOddsChange = 0;
  let overOddsDirection: 'up' | 'down' | 'stable' = 'stable';

  if (first.overOdds !== null && last.overOdds !== null && first.overOdds !== 0) {
    overOddsChange = ((last.overOdds - first.overOdds) / first.overOdds) * 100;
    if (Math.abs(overOddsChange) < 1) {
      overOddsDirection = 'stable';
    } else {
      overOddsDirection = overOddsChange > 0 ? 'up' : 'down';
    }
  }

  // 计算让球变化
  let ahHomeChange = 0;
  let ahHomeDirection: 'up' | 'down' | 'stable' = 'stable';

  if (first.ahHome !== null && last.ahHome !== null && first.ahHome !== 0) {
    ahHomeChange = ((last.ahHome - first.ahHome) / first.ahHome) * 100;
    if (Math.abs(ahHomeChange) < 1) {
      ahHomeDirection = 'stable';
    } else {
      ahHomeDirection = ahHomeChange > 0 ? 'up' : 'down';
    }
  }

  return {
    overOddsHistory,
    overOddsChange,
    overOddsDirection,
    overOddsSignificant: Math.abs(overOddsChange) >= SIGNIFICANT_CHANGE_THRESHOLD,
    ahHomeHistory,
    ahHomeChange,
    ahHomeDirection,
    snapshotCount: snapshots.length,
    timeSpanMinutes: Math.round((last.timestamp - first.timestamp) / 60000),
  };
}

/**
 * 清理已结束比赛的历史
 */
export function cleanupFinishedMatches(activeMatchIds: Set<number>): number {
  let cleaned = 0;
  for (const matchId of oddsHistoryMap.keys()) {
    if (!activeMatchIds.has(matchId)) {
      oddsHistoryMap.delete(matchId);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * 获取服务统计
 */
export function getOddsHistoryStats(): {
  matchCount: number;
  totalSnapshots: number;
  oldestMatch: number | null;
} {
  let totalSnapshots = 0;
  let oldestMatch: number | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;

  for (const [matchId, history] of oddsHistoryMap) {
    totalSnapshots += history.snapshots.length;
    if (history.firstSeen < oldestTime) {
      oldestTime = history.firstSeen;
      oldestMatch = matchId;
    }
  }

  return {
    matchCount: oddsHistoryMap.size,
    totalSnapshots,
    oldestMatch,
  };
}

/**
 * 清除所有历史
 */
export function clearOddsHistory(): void {
  oddsHistoryMap.clear();
}

// ============================================
// 便捷函数
// ============================================

/**
 * 格式化赔率变化为显示文本
 */
export function formatOddsChange(change: number): string {
  if (Math.abs(change) < 0.5) return '稳定';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * 获取变化方向颜色
 * 大球赔率下降 = 利好 (绿色)
 */
export function getOddsChangeColor(
  direction: 'up' | 'down' | 'stable',
  type: 'over' | 'ah' = 'over'
): string {
  if (direction === 'stable') return '#6b7280';

  if (type === 'over') {
    // 大球: 下降利好
    return direction === 'down' ? '#22c55e' : '#ef4444';
  }
  // 让球: 上升利好
  return direction === 'up' ? '#22c55e' : '#ef4444';
}

export default {
  recordOddsSnapshot,
  batchRecordOddsSnapshots,
  getOddsHistory,
  getOddsMovementSummary,
  cleanupFinishedMatches,
  getOddsHistoryStats,
  clearOddsHistory,
};
