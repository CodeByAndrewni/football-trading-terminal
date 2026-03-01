// ============================================
// 末段进球评分：Weibull 时间衰减
// Version: 139
// ============================================

import { TIME_DECAY_CONFIG } from '../config/battleRoomConstants';

// ============================================
// 类型定义
// ============================================

export interface TimeMultiplierResult {
  multiplier: number;
  phase: 'early' | 'mid' | 'late' | 'extraLate';
  components: {
    baseMultiplier: number;
    fatigueBonus: number;
    desperationBonus: number;
  };
}

// ============================================
// 时间乘数计算
// ============================================

/**
 * 获取时间相关的评分乘数
 * 基于 Weibull 分布思想：末段进球率上升
 *
 * @param minute 当前比赛分钟
 * @param scoreDiff 比分差（正数=领先，负数=落后）
 * @returns 时间乘数结果
 */
export function getTimeMultiplier(
  minute: number,
  scoreDiff: number
): TimeMultiplierResult {
  const config = TIME_DECAY_CONFIG;

  // 1. 判断比赛阶段
  let phase: 'early' | 'mid' | 'late' | 'extraLate';
  let baseMultiplier: number;

  if (minute < 15) {
    phase = 'early';
    baseMultiplier = config.phaseMultipliers.early;
  } else if (minute >= 85) {
    phase = 'extraLate';
    baseMultiplier = config.phaseMultipliers.extraLate;
  } else if (minute >= 75) {
    phase = 'late';
    baseMultiplier = config.phaseMultipliers.late;
  } else {
    phase = 'mid';
    baseMultiplier = config.phaseMultipliers.mid;
  }

  // 2. 疲劳累积（75分钟后开始）
  const fatigueBonus = minute > 75
    ? (minute - 75) * config.fatiguePerMinute
    : 0;

  // 3. 绝望因子（落后方更激进）
  const desperationBonus = scoreDiff < 0 ? config.desperationBonus : 0;

  // 4. 总乘数
  const multiplier = baseMultiplier + fatigueBonus + desperationBonus;

  return {
    multiplier,
    phase,
    components: {
      baseMultiplier,
      fatigueBonus,
      desperationBonus,
    },
  };
}

// ============================================
// 泊松分布：剩余时间进球概率
// ============================================

/**
 * 基于泊松分布计算剩余时间进球概率
 * P(至少1球) = 1 - e^(-λ)
 * λ = (xG/90) × 剩余分钟 × 时间乘数
 *
 * @param totalXg 双方总 xG
 * @param minute 当前分钟
 * @param scoreDiff 比分差
 * @returns 进球概率百分比 (0-100)
 */
export function poissonLateGoalProbability(
  totalXg: number,
  minute: number,
  scoreDiff: number
): number {
  // 剩余时间（含补时估算）
  const remainingMinutes = Math.max(0, 90 - minute + 5);

  // 时间乘数
  const { multiplier } = getTimeMultiplier(minute, scoreDiff);

  // λ = 剩余时间的预期进球数
  const lambda = (totalXg / 90) * remainingMinutes * multiplier;

  // P(≥1球) = 1 - P(0球) = 1 - e^(-λ)
  const probability = 1 - Math.exp(-lambda);

  return Math.round(probability * 100);
}

// ============================================
// 紧迫性加成
// ============================================

/**
 * 计算紧迫性加成
 * - 比分接近（0-0, 1-1, 1-0）+ 时间紧迫 → 进球意愿强
 * - 大比分领先 → 进球意愿弱
 *
 * @param minute 当前分钟
 * @param homeScore 主队比分
 * @param awayScore 客队比分
 * @returns 紧迫性加成分数
 */
export function calculateUrgencyBonus(
  minute: number,
  homeScore: number,
  awayScore: number
): number {
  // 80分钟后才触发
  if (minute < 80) return 0;

  const scoreDiff = homeScore - awayScore;
  const absDiff = Math.abs(scoreDiff);

  // 时间紧迫性（80分钟后每分钟 +0.5）
  const timeUrgency = (minute - 80) * 0.5;

  let bonus = 0;

  if (absDiff === 0) {
    // 平局：双方都想赢
    bonus = 8 + timeUrgency;
  } else if (absDiff === 1) {
    // 1球差：落后方拼命
    bonus = scoreDiff < 0 ? 12 + timeUrgency : 5 + timeUrgency;
  } else if (absDiff >= 2) {
    // 2球+差：领先方松懈，落后方可能放弃或 all-in
    bonus = scoreDiff < 0 ? 6 : 0;
  }

  // 特殊情况：0-0 且 85分钟+ → 高紧迫
  if (homeScore === 0 && awayScore === 0 && minute >= 85) {
    bonus += 5;
  }

  return bonus;
}
