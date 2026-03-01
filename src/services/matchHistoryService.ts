/**
 * ============================================
 * 历史比赛存储服务
 * 存储已结束的比赛记录，保留7天
 * ============================================
 */

import type { AdvancedMatch } from '../data/advancedMockData';
import type { ScoreResult } from './scoringEngine';

// 存储的历史比赛记录
export interface HistoryMatch {
  id: number;
  home: {
    name: string;
    score: number;
    rank?: number;
  };
  away: {
    name: string;
    score: number;
    rank?: number;
  };
  league: string;
  leagueShort: string;
  finalScore: {
    home: number;
    away: number;
  };
  // 评分相关
  lastScore: number;           // 最后记录的评分
  lastConfidence: number;      // 最后记录的置信度
  scoreAtMinute: number;       // 记录评分时的分钟
  // 时间
  kickoffTime: string;
  finishedAt: number;          // 结束时间戳
  // 统计
  stats: {
    shots?: { home: number; away: number };
    shotsOnTarget?: { home: number; away: number };
    corners?: { home: number; away: number };
    xG?: { home: number; away: number };
  };
  // 结果分析
  hadGoalAfter75: boolean;     // 75分钟后是否有进球
  hadGoalAfter80: boolean;     // 80分钟后是否有进球
}

// 模拟下单记录
export interface SimulatedOrder {
  id: string;
  fixtureId: number;
  createdAt: number;
  minute: number;
  betType: 'handicap' | 'overUnder' | 'matchWinner';
  selection: string;
  odds: number;
  amount: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  profit?: number;
  settledAt?: number;
}

const HISTORY_KEY = 'livepro_match_history';
const ORDERS_KEY = 'livepro_simulated_orders';
const MAX_HISTORY_AGE = 7 * 24 * 60 * 60 * 1000; // 7天
const MAX_ORDERS = 1000;

/**
 * 获取所有历史比赛
 */
export function getMatchHistory(): HistoryMatch[] {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (!data) return [];

    const history: HistoryMatch[] = JSON.parse(data);
    const now = Date.now();

    // 过滤掉过期的记录
    return history.filter(m => now - m.finishedAt < MAX_HISTORY_AGE);
  } catch {
    return [];
  }
}

/**
 * 保存历史比赛
 */
export function saveMatchHistory(matches: HistoryMatch[]): void {
  try {
    const now = Date.now();
    // 过滤掉过期的记录
    const validMatches = matches.filter(m => now - m.finishedAt < MAX_HISTORY_AGE);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(validMatches));
  } catch (error) {
    console.error('Failed to save match history:', error);
  }
}

/**
 * 添加已结束的比赛到历史
 */
export function addToHistory(match: AdvancedMatch, scoreResult: ScoreResult | null): void {
  try {
    const history = getMatchHistory();

    // 检查是否已存在
    if (history.some(h => h.id === match.id)) {
      return;
    }

    const historyMatch: HistoryMatch = {
      id: match.id,
      home: {
        name: match.home?.name || 'Unknown',
        score: match.home?.score ?? 0,
        rank: match.home?.rank ?? undefined,
      },
      away: {
        name: match.away?.name || 'Unknown',
        score: match.away?.score ?? 0,
        rank: match.away?.rank ?? undefined,
      },
      league: match.league || '',
      leagueShort: match.leagueShort || '',
      finalScore: {
        home: match.home?.score ?? 0,
        away: match.away?.score ?? 0,
      },
      lastScore: scoreResult?.totalScore ?? 0,
      lastConfidence: scoreResult?.confidence ?? 0,
      scoreAtMinute: match.minute,
      kickoffTime: match.kickoffTime || match.startTime || new Date().toISOString(),
      finishedAt: Date.now(),
      stats: {
        shots: match.stats?.shots,
        shotsOnTarget: match.stats?.shotsOnTarget,
        corners: match.corners ? { home: match.corners.home, away: match.corners.away } : undefined,
        xG: match.stats?.xG,
      },
      // 检查是否有晚期进球（需要事件数据）
      hadGoalAfter75: checkLateGoal(match, 75),
      hadGoalAfter80: checkLateGoal(match, 80),
    };

    history.unshift(historyMatch);
    saveMatchHistory(history);
  } catch (error) {
    console.error('Failed to add match to history:', error);
  }
}

/**
 * 检查比赛是否有晚期进球
 */
function checkLateGoal(match: AdvancedMatch, afterMinute: number): boolean {
  if (!match.events || !Array.isArray(match.events)) {
    return false;
  }

  return match.events.some(event => {
    const minute = event.time?.elapsed ?? event.minute ?? 0;
    const isGoal = event.type === 'Goal' || event.type === 'goal';
    return isGoal && minute >= afterMinute;
  });
}

/**
 * 清除所有历史
 */
export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

/**
 * 获取历史统计
 */
export function getHistoryStats() {
  const history = getMatchHistory();

  const totalMatches = history.length;
  const matchesWithHighScore = history.filter(m => m.lastScore >= 80).length;
  const matchesWithGoalAfter75 = history.filter(m => m.hadGoalAfter75).length;
  const matchesWithGoalAfter80 = history.filter(m => m.hadGoalAfter80).length;

  // 高评分命中率
  const highScoreMatches = history.filter(m => m.lastScore >= 80);
  const highScoreHits = highScoreMatches.filter(m => m.hadGoalAfter75).length;
  const highScoreAccuracy = highScoreMatches.length > 0
    ? Math.round((highScoreHits / highScoreMatches.length) * 100)
    : 0;

  return {
    totalMatches,
    matchesWithHighScore,
    matchesWithGoalAfter75,
    matchesWithGoalAfter80,
    highScoreAccuracy,
    averageScore: totalMatches > 0
      ? Math.round(history.reduce((sum, m) => sum + m.lastScore, 0) / totalMatches)
      : 0,
  };
}

// ============================================
// 模拟下单相关
// ============================================

/**
 * 获取所有模拟订单
 */
export function getSimulatedOrders(): SimulatedOrder[] {
  try {
    const data = localStorage.getItem(ORDERS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * 保存模拟订单
 */
export function saveSimulatedOrders(orders: SimulatedOrder[]): void {
  try {
    // 限制最大数量
    const trimmed = orders.slice(0, MAX_ORDERS);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save orders:', error);
  }
}

/**
 * 创建新订单
 */
export function createOrder(order: Omit<SimulatedOrder, 'id' | 'createdAt' | 'status'>): SimulatedOrder {
  const newOrder: SimulatedOrder = {
    ...order,
    id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    status: 'pending',
  };

  const orders = getSimulatedOrders();
  orders.unshift(newOrder);
  saveSimulatedOrders(orders);

  return newOrder;
}

/**
 * 更新订单状态
 */
export function updateOrderStatus(
  orderId: string,
  status: 'won' | 'lost' | 'void',
  profit?: number
): void {
  const orders = getSimulatedOrders();
  const orderIndex = orders.findIndex(o => o.id === orderId);

  if (orderIndex !== -1) {
    orders[orderIndex] = {
      ...orders[orderIndex],
      status,
      profit,
      settledAt: Date.now(),
    };
    saveSimulatedOrders(orders);
  }
}

/**
 * 获取比赛的订单
 */
export function getMatchOrders(fixtureId: number): SimulatedOrder[] {
  return getSimulatedOrders().filter(o => o.fixtureId === fixtureId);
}

/**
 * 获取订单统计
 */
export function getOrderStats() {
  const orders = getSimulatedOrders();
  const settledOrders = orders.filter(o => o.status !== 'pending');

  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const wonOrders = orders.filter(o => o.status === 'won').length;
  const lostOrders = orders.filter(o => o.status === 'lost').length;

  const totalProfit = settledOrders.reduce((sum, o) => sum + (o.profit ?? 0), 0);
  const totalStake = settledOrders.reduce((sum, o) => sum + o.amount, 0);
  const roi = totalStake > 0 ? Math.round((totalProfit / totalStake) * 100) : 0;

  return {
    totalOrders,
    pendingOrders,
    wonOrders,
    lostOrders,
    winRate: settledOrders.length > 0
      ? Math.round((wonOrders / settledOrders.length) * 100)
      : 0,
    totalProfit,
    totalStake,
    roi,
  };
}

/**
 * 清除所有订单
 */
export function clearOrders(): void {
  localStorage.removeItem(ORDERS_KEY);
}

/**
 * 导出订单为CSV
 */
export function exportOrdersToCSV(): string {
  const orders = getSimulatedOrders();
  const headers = ['ID', 'Fixture', 'Created', 'Minute', 'Type', 'Selection', 'Odds', 'Amount', 'Status', 'Profit', 'Settled'];

  const rows = orders.map(o => [
    o.id,
    o.fixtureId,
    new Date(o.createdAt).toISOString(),
    o.minute,
    o.betType,
    o.selection,
    o.odds,
    o.amount,
    o.status,
    o.profit ?? '',
    o.settledAt ? new Date(o.settledAt).toISOString() : '',
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}
