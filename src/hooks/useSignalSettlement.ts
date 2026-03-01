// ============================================
// 信号自动结算 Hook
// 检测进球事件，自动结算待处理信号
// Version: 143
// ============================================

import { useRef, useCallback, useEffect } from 'react';
import { SETTLEMENT_CONFIG } from '../config/battleRoomConstants';
import {
  loadSignals,
  saveSignals,
  type SignalRecord,
  type GoalEvent,
} from '../services/signalSettlement';
import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================
// 类型定义
// ============================================

interface MatchSnapshot {
  id: number;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
}

interface GoalDetectionResult {
  fixtureId: number;
  goalMinute: number;
  team: 'home' | 'away';
  newScore: { home: number; away: number };
}

interface SettlementResult {
  updated: SignalRecord[];
  newHits: SignalRecord[];
  newMisses: SignalRecord[];
}

// ============================================
// Hook 实现
// ============================================

export function useSignalSettlement() {
  // 上一次的比赛快照
  const prevSnapshotsRef = useRef<Map<number, MatchSnapshot>>(new Map());

  // 检测到的进球事件
  const goalEventsRef = useRef<Map<number, GoalEvent[]>>(new Map());

  /**
   * 检测进球事件
   * 比较前后两次数据刷新的比分变化
   */
  const detectGoals = useCallback((matches: AdvancedMatch[]): GoalDetectionResult[] => {
    const goals: GoalDetectionResult[] = [];
    const prevSnapshots = prevSnapshotsRef.current;
    const newSnapshots = new Map<number, MatchSnapshot>();

    for (const match of matches) {
      const snapshot: MatchSnapshot = {
        id: match.id,
        homeScore: match.home.score,
        awayScore: match.away.score,
        minute: match.minute,
        status: match.status,
      };
      newSnapshots.set(match.id, snapshot);

      const prev = prevSnapshots.get(match.id);
      if (!prev) continue;

      // 检测主队进球
      if (snapshot.homeScore > prev.homeScore) {
        const goalCount = snapshot.homeScore - prev.homeScore;
        for (let i = 0; i < goalCount; i++) {
          goals.push({
            fixtureId: match.id,
            goalMinute: match.minute,
            team: 'home',
            newScore: { home: snapshot.homeScore, away: snapshot.awayScore },
          });

          // 记录进球事件
          const events = goalEventsRef.current.get(match.id) || [];
          events.push({ minute: match.minute, team: 'home' });
          goalEventsRef.current.set(match.id, events);
        }
      }

      // 检测客队进球
      if (snapshot.awayScore > prev.awayScore) {
        const goalCount = snapshot.awayScore - prev.awayScore;
        for (let i = 0; i < goalCount; i++) {
          goals.push({
            fixtureId: match.id,
            goalMinute: match.minute,
            team: 'away',
            newScore: { home: snapshot.homeScore, away: snapshot.awayScore },
          });

          // 记录进球事件
          const events = goalEventsRef.current.get(match.id) || [];
          events.push({ minute: match.minute, team: 'away' });
          goalEventsRef.current.set(match.id, events);
        }
      }
    }

    // 更新快照
    prevSnapshotsRef.current = newSnapshots;

    return goals;
  }, []);

  /**
   * 结算信号
   * 根据进球事件和比赛状态更新信号状态
   */
  const settleSignals = useCallback((matches: AdvancedMatch[]): SettlementResult => {
    const signals = loadSignals();
    const pendingSignals = signals.filter(s => s.status === 'pending');

    if (pendingSignals.length === 0) {
      return { updated: signals, newHits: [], newMisses: [] };
    }

    const newHits: SignalRecord[] = [];
    const newMisses: SignalRecord[] = [];
    const matchMap = new Map(matches.map(m => [m.id, m]));

    const updatedSignals = signals.map(signal => {
      if (signal.status !== 'pending') return signal;

      const match = matchMap.get(signal.fixtureId);
      if (!match) return signal;

      const currentMinute = match.minute;
      const windowEnd = signal.triggerMinute + SETTLEMENT_CONFIG.WINDOW_MINUTES;
      const goalEvents = goalEventsRef.current.get(signal.fixtureId) || [];

      // 检查窗口内是否有进球
      const goalInWindow = goalEvents.find(
        g => g.minute > signal.triggerMinute && g.minute <= windowEnd
      );

      if (goalInWindow) {
        const hitSignal: SignalRecord = {
          ...signal,
          status: 'hit',
          settledAt: new Date().toISOString(),
          goalMinute: goalInWindow.minute,
          settlementNote: `${goalInWindow.minute}' 进球，窗口内 ${goalInWindow.minute - signal.triggerMinute} 分钟`,
        };
        newHits.push(hitSignal);
        return hitSignal;
      }

      // 检查是否超过窗口期
      if (currentMinute > windowEnd) {
        const missSignal: SignalRecord = {
          ...signal,
          status: 'miss',
          settledAt: new Date().toISOString(),
          settlementNote: `${SETTLEMENT_CONFIG.WINDOW_MINUTES} 分钟内无进球`,
        };
        newMisses.push(missSignal);
        return missSignal;
      }

      // 检查比赛是否结束
      if (match.status === 'ft') {
        const missSignal: SignalRecord = {
          ...signal,
          status: 'miss',
          settledAt: new Date().toISOString(),
          settlementNote: '比赛结束，无进球',
        };
        newMisses.push(missSignal);
        return missSignal;
      }

      return signal; // 仍在等待
    });

    // 如果有变化，保存更新
    if (newHits.length > 0 || newMisses.length > 0) {
      saveSignals(updatedSignals);
    }

    return { updated: updatedSignals, newHits, newMisses };
  }, []);

  /**
   * 处理数据更新
   * 综合执行进球检测和信号结算
   */
  const processMatchUpdate = useCallback((matches: AdvancedMatch[]): {
    goals: GoalDetectionResult[];
    settlement: SettlementResult;
  } => {
    // 1. 检测进球
    const goals = detectGoals(matches);

    // 2. 结算信号
    const settlement = settleSignals(matches);

    return { goals, settlement };
  }, [detectGoals, settleSignals]);

  /**
   * 初始化快照（首次加载时）
   */
  const initSnapshots = useCallback((matches: AdvancedMatch[]) => {
    const snapshots = new Map<number, MatchSnapshot>();
    for (const match of matches) {
      snapshots.set(match.id, {
        id: match.id,
        homeScore: match.home.score,
        awayScore: match.away.score,
        minute: match.minute,
        status: match.status,
      });
    }
    prevSnapshotsRef.current = snapshots;
  }, []);

  /**
   * 清理过期的进球记录
   */
  const cleanupGoalEvents = useCallback((activeMatchIds: Set<number>) => {
    const events = goalEventsRef.current;
    for (const [fixtureId] of events) {
      if (!activeMatchIds.has(fixtureId)) {
        events.delete(fixtureId);
      }
    }
  }, []);

  /**
   * 手动触发结算检查
   */
  const forceSettle = useCallback((matches: AdvancedMatch[]) => {
    return settleSignals(matches);
  }, [settleSignals]);

  return {
    processMatchUpdate,
    initSnapshots,
    cleanupGoalEvents,
    forceSettle,
    detectGoals,
    settleSignals,
  };
}
