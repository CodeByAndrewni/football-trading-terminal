// ============================================
// 作战室状态管理 Hook
// Hysteresis + 信号去重
// Version: 139
// ============================================

import { useRef, useCallback } from 'react';
import { HYSTERESIS_CONFIG, SIGNAL_THRESHOLD, type SignalTier } from '../config/battleRoomConstants';

// ============================================
// 类型定义
// ============================================

interface MatchStableState {
  tier: SignalTier;
  pendingTier: SignalTier | null;
  confirmCount: number;
  lastSignalTime: Record<string, number>; // signalType -> timestamp
}

interface TierUpdateResult {
  tier: SignalTier;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isStable: boolean;
}

// ============================================
// Hysteresis Hook
// ============================================

export function useBattleRoomHysteresis() {
  const stateMapRef = useRef<Map<number, MatchStableState>>(new Map());

  /**
   * 更新比赛分档状态（带滞后）
   * 连续确认 CONFIRM_THRESHOLD 次才会真正变档
   */
  const updateTier = useCallback((
    fixtureId: number,
    rawSignalStrength: number
  ): TierUpdateResult => {
    const rawTier = getRawTier(rawSignalStrength);
    const stateMap = stateMapRef.current;
    const prev = stateMap.get(fixtureId);

    // 新比赛
    if (!prev) {
      stateMap.set(fixtureId, {
        tier: rawTier,
        pendingTier: null,
        confirmCount: 0,
        lastSignalTime: {},
      });
      return { tier: rawTier, isUpgrade: false, isDowngrade: false, isStable: true };
    }

    // 相同分档 → 重置 pending，状态稳定
    if (rawTier === prev.tier) {
      prev.pendingTier = null;
      prev.confirmCount = 0;
      return { tier: prev.tier, isUpgrade: false, isDowngrade: false, isStable: true };
    }

    // 变档请求
    if (rawTier === prev.pendingTier) {
      // 持续确认中
      prev.confirmCount++;

      if (prev.confirmCount >= HYSTERESIS_CONFIG.CONFIRM_THRESHOLD) {
        // 确认达标 → 变档
        const isUpgrade = tierToNumber(rawTier) > tierToNumber(prev.tier);
        const isDowngrade = tierToNumber(rawTier) < tierToNumber(prev.tier);

        prev.tier = rawTier;
        prev.pendingTier = null;
        prev.confirmCount = 0;

        return { tier: rawTier, isUpgrade, isDowngrade, isStable: true };
      }

      // 还没确认够 → 保持原档，状态不稳定
      return { tier: prev.tier, isUpgrade: false, isDowngrade: false, isStable: false };
    }

    // 新的变档请求
    prev.pendingTier = rawTier;
    prev.confirmCount = 1;

    // 保持原档
    return { tier: prev.tier, isUpgrade: false, isDowngrade: false, isStable: false };
  }, []);

  /**
   * 检查是否应该发出信号（去重）
   * 同类型信号 SIGNAL_COOLDOWN_MS 内只发一次
   */
  const shouldEmitSignal = useCallback((
    fixtureId: number,
    signalType: string
  ): boolean => {
    const stateMap = stateMapRef.current;
    const state = stateMap.get(fixtureId);

    if (!state) return true;

    const now = Date.now();
    const lastTime = state.lastSignalTime[signalType];

    if (!lastTime || (now - lastTime) > HYSTERESIS_CONFIG.SIGNAL_COOLDOWN_MS) {
      state.lastSignalTime[signalType] = now;
      return true;
    }

    return false;
  }, []);

  /**
   * 重置所有状态（用于刷新）
   */
  const resetAll = useCallback(() => {
    stateMapRef.current.clear();
  }, []);

  /**
   * 获取当前稳定的分档
   */
  const getStableTier = useCallback((fixtureId: number): SignalTier | null => {
    const state = stateMapRef.current.get(fixtureId);
    return state?.tier ?? null;
  }, []);

  return {
    updateTier,
    shouldEmitSignal,
    resetAll,
    getStableTier,
  };
}

// ============================================
// 辅助函数
// ============================================

function getRawTier(signalStrength: number): SignalTier {
  if (signalStrength >= SIGNAL_THRESHOLD.HIGH) return 'high';
  if (signalStrength >= SIGNAL_THRESHOLD.WATCH) return 'watch';
  return 'low';
}

function tierToNumber(tier: SignalTier): number {
  switch (tier) {
    case 'high': return 3;
    case 'watch': return 2;
    case 'low': return 1;
  }
}
