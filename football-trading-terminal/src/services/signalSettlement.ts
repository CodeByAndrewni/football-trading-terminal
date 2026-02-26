// ============================================
// 信号结算状态机
// Version: 139
// ============================================

import { SETTLEMENT_CONFIG } from '../config/battleRoomConstants';
import type { SignalTier } from '../config/battleRoomConstants';
import { addCalibrationRecord, type CalibrationRecord } from './probabilityCalibration';

// ============================================
// 类型定义
// ============================================

export type SignalStatus = 'pending' | 'hit' | 'miss' | 'expired';

export interface SignalRecord {
  id: string;
  fixtureId: number;
  matchName: string;

  // 触发信息
  triggeredAt: string;  // ISO 字符串，便于序列化
  triggerMinute: number;
  signalStrength: number;
  tier: SignalTier;
  reasonsTop3: string[];

  // 赔率快照
  oddsAtTrigger: number | null;
  lineAtTrigger: string;

  // 结算状态
  status: SignalStatus;
  settledAt?: string;
  goalMinute?: number;
  settlementNote?: string;
}

export interface GoalEvent {
  minute: number;
  team: 'home' | 'away';
}

export interface HitRateStats {
  total: number;
  hits: number;
  misses: number;
  pending: number;
  hitRate: number;
}

// ============================================
// 信号创建
// ============================================

/**
 * 创建新的信号记录
 */
export function createSignalRecord(params: {
  fixtureId: number;
  matchName: string;
  minute: number;
  signalStrength: number;
  tier: SignalTier;
  reasonsTop3: string[];
  odds: number | null;
  line: string;
}): SignalRecord {
  return {
    id: `${params.fixtureId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fixtureId: params.fixtureId,
    matchName: params.matchName,
    triggeredAt: new Date().toISOString(),
    triggerMinute: params.minute,
    signalStrength: params.signalStrength,
    tier: params.tier,
    reasonsTop3: params.reasonsTop3,
    oddsAtTrigger: params.odds,
    lineAtTrigger: params.line,
    status: 'pending',
  };
}

// ============================================
// 信号结算
// ============================================

/**
 * 结算单个信号
 *
 * @param signal 信号记录
 * @param currentMinute 当前比赛分钟
 * @param goalEvents 进球事件列表
 * @param matchStatus 比赛状态
 * @returns 更新后的信号记录
 */
export function settleSignal(
  signal: SignalRecord,
  currentMinute: number,
  goalEvents: GoalEvent[],
  matchStatus: 'live' | 'finished' | 'postponed'
): SignalRecord {
  // 已结算的不再处理
  if (signal.status !== 'pending') return signal;

  const windowEnd = signal.triggerMinute + SETTLEMENT_CONFIG.WINDOW_MINUTES;

  // 检查窗口内进球
  const goalInWindow = goalEvents.find(
    g => g.minute > signal.triggerMinute && g.minute <= windowEnd
  );

  if (goalInWindow) {
    const settledSignal: SignalRecord = {
      ...signal,
      status: 'hit',
      settledAt: new Date().toISOString(),
      goalMinute: goalInWindow.minute,
      settlementNote: `${goalInWindow.minute}' 进球，窗口内 ${goalInWindow.minute - signal.triggerMinute} 分钟`,
    };

    // 记录校准数据
    recordCalibrationData(settledSignal, true, goalInWindow.minute);

    return settledSignal;
  }

  // 超过窗口期
  if (currentMinute > windowEnd) {
    const settledSignal: SignalRecord = {
      ...signal,
      status: 'miss',
      settledAt: new Date().toISOString(),
      settlementNote: `${SETTLEMENT_CONFIG.WINDOW_MINUTES} 分钟内无进球`,
    };

    // 记录校准数据
    recordCalibrationData(settledSignal, false);

    return settledSignal;
  }

  // 比赛结束
  if (matchStatus === 'finished') {
    const settledSignal: SignalRecord = {
      ...signal,
      status: 'miss',
      settledAt: new Date().toISOString(),
      settlementNote: '比赛结束，无进球',
    };

    // 记录校准数据
    recordCalibrationData(settledSignal, false);

    return settledSignal;
  }

  return signal; // 仍在等待
}

/**
 * 批量结算信号
 */
export function settleSignals(
  signals: SignalRecord[],
  matchUpdates: Map<number, { minute: number; goals: GoalEvent[]; status: 'live' | 'finished' | 'postponed' }>
): SignalRecord[] {
  return signals.map(signal => {
    const update = matchUpdates.get(signal.fixtureId);
    if (!update) return signal;
    return settleSignal(signal, update.minute, update.goals, update.status);
  });
}

// ============================================
// 本地存储
// ============================================

const STORAGE_KEY = 'battleroom_signals_v1';

/**
 * 加载信号记录
 */
export function loadSignals(): SignalRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SignalRecord[];
  } catch {
    return [];
  }
}

/**
 * 保存信号记录
 * 只保留最近 N 天的数据
 */
export function saveSignals(signals: SignalRecord[]): void {
  const retentionMs = SETTLEMENT_CONFIG.STORAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;

  const recentSignals = signals.filter(
    s => new Date(s.triggeredAt).getTime() > cutoff
  );

  localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSignals));
}

/**
 * 添加新信号
 */
export function addSignal(signal: SignalRecord): void {
  const signals = loadSignals();
  signals.unshift(signal);
  saveSignals(signals);
}

// ============================================
// 统计
// ============================================

/**
 * 计算命中率统计
 */
export function calculateHitRate(signals: SignalRecord[]): HitRateStats {
  const hits = signals.filter(s => s.status === 'hit').length;
  const misses = signals.filter(s => s.status === 'miss').length;
  const pending = signals.filter(s => s.status === 'pending').length;
  const settled = hits + misses;

  return {
    total: signals.length,
    hits,
    misses,
    pending,
    hitRate: settled > 0 ? Math.round((hits / settled) * 100) : 0,
  };
}

/**
 * 获取今日信号统计
 */
export function getTodayStats(): HitRateStats {
  const signals = loadSignals();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaySignals = signals.filter(
    s => new Date(s.triggeredAt).getTime() >= today.getTime()
  );

  return calculateHitRate(todaySignals);
}

/**
 * 获取最近 N 条信号
 */
export function getRecentSignals(limit = 20): SignalRecord[] {
  return loadSignals().slice(0, limit);
}

// ============================================
// 校准数据记录
// ============================================

/**
 * 记录校准数据（每次结算时调用）
 */
function recordCalibrationData(
  signal: SignalRecord,
  isHit: boolean,
  goalMinute?: number
): void {
  const record: CalibrationRecord = {
    id: `cal-${signal.id}`,
    signalStrength: signal.signalStrength,
    triggerMinute: signal.triggerMinute,
    isHit,
    goalMinute,
    settledAt: new Date().toISOString(),
    context: {
      league: signal.matchName.includes('vs') ? undefined : signal.matchName,
      minute: signal.triggerMinute,
      scoreDiff: 0, // TODO: 从信号记录中获取
      timePhase: signal.triggerMinute >= 85 ? 'extraLate'
        : signal.triggerMinute >= 75 ? 'late'
        : 'mid',
    },
  };

  addCalibrationRecord(record);
}
