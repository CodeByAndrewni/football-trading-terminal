// ============================================
// 信号强度计算引擎
// Version: 139
// ============================================

import { SIGNAL_THRESHOLD, SIGNAL_BLEND_WEIGHTS, type SignalTier } from '../config/battleRoomConstants';
import { getTimeMultiplier, poissonLateGoalProbability, calculateUrgencyBonus } from './lateGameScoring';
import { calculateKellyWithRealOdds, type KellyResult } from './kellyCalculator';
import { getCalibratedProbability } from './probabilityCalibration';
import type { ScoreResult } from './scoringEngine';
import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================
// 类型定义
// ============================================

export interface SignalStrengthResult {
  // 核心输出
  signalStrength: number;
  tier: SignalTier;

  // 校准概率（Phase 2）
  calibration: {
    probability: number;      // 校准后的概率 (0-100)
    isCalibrated: boolean;    // 是否有足够样本
    confidence: number;       // 置信度 (0-1)
    sampleSize: number;       // 该桶的样本数
  };

  // 组成部分（可解释性）
  components: {
    baseScore: number;
    timeMultiplier: number;
    timePhase: string;
    poissonEstimate: number;
    urgencyBonus: number;
  };

  // Kelly 结果
  kellyResult: KellyResult;

  // 元数据
  minute: number;
  scoreDiff: number;
}

// ============================================
// 信号强度计算
// ============================================

/**
 * 计算比赛的信号强度
 * 混合公式：(baseScore × timeMultiplier + urgencyBonus) × 0.7 + poissonEstimate × 0.3
 */
export function calculateSignalStrength(
  match: AdvancedMatch,
  scoreResult: ScoreResult
): SignalStrengthResult {
  const { minute, home, away, stats } = match;
  const scoreDiff = home.score - away.score;

  // 从 stats 中提取 xG（使用正确的属性名）
  const xgHome = stats?.xG?.home ?? 0;
  const xgAway = stats?.xG?.away ?? 0;
  const totalXg = xgHome + xgAway;

  // 1. 基础评分（现有逻辑，0-100）
  const baseScore = scoreResult.totalScore;

  // 2. 时间乘数（Weibull 思想）
  const timeResult = getTimeMultiplier(minute, scoreDiff);
  const timeMultiplier = timeResult.multiplier;

  // 3. 泊松估算（参考，不直接用作概率）
  const poissonEstimate = poissonLateGoalProbability(totalXg, minute, scoreDiff);

  // 4. 紧迫性加成
  const urgencyBonus = calculateUrgencyBonus(minute, home.score, away.score);

  // 5. 混合计算信号强度
  const adjustedScore = baseScore * timeMultiplier + urgencyBonus;
  const blendedStrength =
    adjustedScore * SIGNAL_BLEND_WEIGHTS.baseScore +
    poissonEstimate * SIGNAL_BLEND_WEIGHTS.poissonEstimate;

  // 归一化到 0-100
  const signalStrength = Math.min(100, Math.max(0, Math.round(blendedStrength)));

  // 分档
  const tier = determineTier(signalStrength);

  // 6. 获取校准概率
  const calibrationResult = getCalibratedProbability(signalStrength);

  // 7. Kelly 计算（使用校准概率，如果可用）
  const probabilityForKelly = calibrationResult.isCalibrated
    ? calibrationResult.probability
    : signalStrength;
  const kellyResult = calculateKellyWithRealOdds(probabilityForKelly, match);

  return {
    signalStrength,
    tier,
    calibration: {
      probability: calibrationResult.probability,
      isCalibrated: calibrationResult.isCalibrated,
      confidence: calibrationResult.confidence,
      sampleSize: calibrationResult.sampleSize,
    },
    components: {
      baseScore,
      timeMultiplier,
      timePhase: timeResult.phase,
      poissonEstimate,
      urgencyBonus,
    },
    kellyResult,
    minute,
    scoreDiff,
  };
}

/**
 * 根据信号强度确定分档
 */
export function determineTier(signalStrength: number): SignalTier {
  if (signalStrength >= SIGNAL_THRESHOLD.HIGH) return 'high';
  if (signalStrength >= SIGNAL_THRESHOLD.WATCH) return 'watch';
  return 'low';
}

/**
 * 获取分档的显示信息
 */
export function getTierDisplay(tier: SignalTier): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  switch (tier) {
    case 'high':
      return {
        label: '高信号',
        color: '#ff4444',
        bgColor: 'rgba(255, 68, 68, 0.1)',
        borderColor: 'rgba(255, 68, 68, 0.3)',
      };
    case 'watch':
      return {
        label: '观望',
        color: '#ffaa00',
        bgColor: 'rgba(255, 170, 0, 0.1)',
        borderColor: 'rgba(255, 170, 0, 0.3)',
      };
    case 'low':
      return {
        label: '低信号',
        color: '#4488ff',
        bgColor: 'rgba(68, 136, 255, 0.1)',
        borderColor: 'rgba(68, 136, 255, 0.3)',
      };
  }
}
