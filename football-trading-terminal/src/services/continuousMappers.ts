// ============================================================
// CONTINUOUS MAPPERS - 连续映射函数库
// 替代硬阈值，使用分段线性/S型函数实现平滑评分
// ============================================================

import type { MapperConfig, ContinuousMapper } from '../types/unified-scoring';

// ============================================================
// 核心映射函数生成器
// ============================================================

/**
 * 创建分段线性映射函数
 * 根据配置的范围区间，线性插值计算输出值
 */
export function createPiecewiseLinearMapper(config: MapperConfig): ContinuousMapper {
  return (value: number): number => {
    // 检查是否低于最小值
    if (config.ranges.length === 0) return 0;

    const firstRange = config.ranges[0];
    if (value <= firstRange.min) return firstRange.output_min;

    // 检查是否超过最大值
    const lastRange = config.ranges[config.ranges.length - 1];
    if (value >= lastRange.max) {
      return config.cap !== undefined ? config.cap : lastRange.output_max;
    }

    // 找到对应的区间并线性插值
    for (const range of config.ranges) {
      if (value >= range.min && value <= range.max) {
        const ratio = (value - range.min) / (range.max - range.min);
        return range.output_min + ratio * (range.output_max - range.output_min);
      }
    }

    // 默认返回0
    return 0;
  };
}

/**
 * S型函数 (Sigmoid-like)
 * 用于平滑过渡，避免突然跳变
 */
export function sigmoidMapper(
  value: number,
  midpoint: number,
  steepness: number,
  outputMin: number,
  outputMax: number
): number {
  const x = (value - midpoint) * steepness;
  const sigmoid = 1 / (1 + Math.exp(-x));
  return outputMin + sigmoid * (outputMax - outputMin);
}

/**
 * 钟形函数 (用于时间窗口)
 * 在 peak 处达到最大值，两侧衰减
 */
export function bellCurveMapper(
  value: number,
  peak: number,
  spread: number,
  maxOutput: number
): number {
  const distance = Math.abs(value - peak);
  const decay = Math.exp(-(distance * distance) / (2 * spread * spread));
  return maxOutput * decay;
}

/**
 * 梯形函数 (平台期)
 * 在 [start, end] 范围内保持最大值，两侧线性衰减
 */
export function trapezoidMapper(
  value: number,
  rampStart: number,
  plateauStart: number,
  plateauEnd: number,
  rampEnd: number,
  maxOutput: number
): number {
  if (value <= rampStart || value >= rampEnd) return 0;
  if (value >= plateauStart && value <= plateauEnd) return maxOutput;

  if (value < plateauStart) {
    return maxOutput * (value - rampStart) / (plateauStart - rampStart);
  }

  return maxOutput * (rampEnd - value) / (rampEnd - plateauEnd);
}

// ============================================================
// 预定义映射器 - 射门相关
// ============================================================

/**
 * 射门总数 -> 得分 (0-12)
 * 0-5:   0~2分（线性）
 * 5-15:  2~8分（线性）
 * 15-25: 8~12分（线性）
 * 25+:   12分封顶
 */
export const shotsToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 5, output_min: 0, output_max: 2 },
    { min: 5, max: 15, output_min: 2, output_max: 8 },
    { min: 15, max: 25, output_min: 8, output_max: 12 },
  ],
  cap: 12,
});

/**
 * 射正数 -> 得分 (0-8)
 */
export const shotsOnToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 3, output_min: 0, output_max: 2 },
    { min: 3, max: 8, output_min: 2, output_max: 5 },
    { min: 8, max: 15, output_min: 5, output_max: 8 },
  ],
  cap: 8,
});

/**
 * 射正率 -> 得分 (0-6)
 */
export const shotAccuracyToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 20, output_min: 0, output_max: 1 },
    { min: 20, max: 35, output_min: 1, output_max: 3 },
    { min: 35, max: 50, output_min: 3, output_max: 5 },
    { min: 50, max: 70, output_min: 5, output_max: 6 },
  ],
  cap: 6,
});

// ============================================================
// 预定义映射器 - xG 相关
// ============================================================

/**
 * xG 总量 -> 得分 (0-10)
 */
export const xgToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 0.5, output_min: 0, output_max: 1 },
    { min: 0.5, max: 1.5, output_min: 1, output_max: 4 },
    { min: 1.5, max: 2.5, output_min: 4, output_max: 7 },
    { min: 2.5, max: 4.0, output_min: 7, output_max: 10 },
  ],
  cap: 10,
});

/**
 * 最近15分钟 xG -> 得分 (0-8)
 */
export const xgLast15ToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 0.2, output_min: 0, output_max: 2 },
    { min: 0.2, max: 0.6, output_min: 2, output_max: 5 },
    { min: 0.6, max: 1.0, output_min: 5, output_max: 7 },
    { min: 1.0, max: 1.5, output_min: 7, output_max: 8 },
  ],
  cap: 8,
});

/**
 * xG 欠债 (xG - 实际进球) -> 得分 (0-8)
 */
export const xgDebtToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 0.5, output_min: 0, output_max: 1 },
    { min: 0.5, max: 1.0, output_min: 1, output_max: 3 },
    { min: 1.0, max: 1.5, output_min: 3, output_max: 5 },
    { min: 1.5, max: 2.5, output_min: 5, output_max: 8 },
  ],
  cap: 8,
});

// ============================================================
// 预定义映射器 - 动量相关
// ============================================================

/**
 * 最近15分钟射门数 -> 得分 (0-10)
 */
export const recentShotsToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 2, output_min: 0, output_max: 2 },
    { min: 2, max: 5, output_min: 2, output_max: 5 },
    { min: 5, max: 8, output_min: 5, output_max: 8 },
    { min: 8, max: 12, output_min: 8, output_max: 10 },
  ],
  cap: 10,
});

/**
 * 射门变化量 (delta) -> 得分 (-4 ~ +6)
 * 正值表示进攻增强，负值表示进攻减弱
 */
export function shotsDeltaToScore(delta: number): number {
  if (delta <= -4) return -4;
  if (delta >= 6) return 6;

  // S型函数平滑过渡
  return sigmoidMapper(delta, 1, 0.5, -4, 6);
}

/**
 * xG 增长速度 (per 15min) -> 得分 (0-8)
 */
export const xgVelocityToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 0.15, output_min: 0, output_max: 2 },
    { min: 0.15, max: 0.4, output_min: 2, output_max: 5 },
    { min: 0.4, max: 0.8, output_min: 5, output_max: 7 },
    { min: 0.8, max: 1.2, output_min: 7, output_max: 8 },
  ],
  cap: 8,
});

// ============================================================
// 预定义映射器 - 角球相关
// ============================================================

/**
 * 角球总数 -> 得分 (0-6)
 */
export const cornersToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 4, output_min: 0, output_max: 1 },
    { min: 4, max: 8, output_min: 1, output_max: 3 },
    { min: 8, max: 12, output_min: 3, output_max: 5 },
    { min: 12, max: 18, output_min: 5, output_max: 6 },
  ],
  cap: 6,
});

/**
 * 最近15分钟角球 -> 得分 (0-4)
 */
export const recentCornersToScore = createPiecewiseLinearMapper({
  ranges: [
    { min: 0, max: 1, output_min: 0, output_max: 1 },
    { min: 1, max: 3, output_min: 1, output_max: 2.5 },
    { min: 3, max: 5, output_min: 2.5, output_max: 4 },
  ],
  cap: 4,
});

// ============================================================
// 预定义映射器 - 时间相关
// ============================================================

/**
 * 比赛分钟 -> 时间窗口得分 (Module A: 大球冲刺)
 * 峰值在 78-88 分钟
 */
export function minuteToTimingScoreA(minute: number): number {
  // 使用梯形函数: 70-78 上升, 78-88 平台, 88-95 下降但仍有价值
  if (minute < 65) return 0;
  if (minute >= 95) return trapezoidMapper(minute, 88, 90, 95, 100, 15);  // 补时

  return trapezoidMapper(minute, 65, 78, 88, 95, 20);
}

/**
 * 比赛分钟 -> 时间窗口得分 (Module B: 强队反扑)
 * 峰值在 70-85 分钟
 */
export function minuteToTimingScoreB(minute: number): number {
  if (minute < 55) return 0;

  return trapezoidMapper(minute, 55, 70, 85, 95, 20);
}

/**
 * 比赛分钟 -> 时间窗口得分 (Module C: 盘口错位)
 * 更宽的窗口 20-80
 */
export function minuteToTimingScoreC(minute: number): number {
  if (minute < 15) return minute;
  if (minute > 85) return Math.max(0, 95 - minute);

  return trapezoidMapper(minute, 15, 25, 75, 85, 20);
}

/**
 * 比赛分钟 -> 时间窗口得分 (Module D: 水位异常)
 * 关键时段加成
 */
export function minuteToTimingScoreD(minute: number): number {
  // HT 前后 (40-50) 和 80+ 是关键时段
  const htBonus = bellCurveMapper(minute, 45, 5, 10);
  const lateBonus = minute >= 75 ? trapezoidMapper(minute, 75, 80, 90, 95, 15) : 0;

  // 基础分
  const base = minute >= 10 ? Math.min(minute / 10, 5) : 0;

  return Math.min(20, base + htBonus + lateBonus);
}

// ============================================================
// 预定义映射器 - 比分状态
// ============================================================

/**
 * 比分差 -> 基础态势得分 (0-8)
 * 平局和小比分差有利于进球
 */
export function scoreDiffToBase(diff: number, totalGoals: number): number {
  const absDiff = Math.abs(diff);

  // 平局时根据总进球数调整
  if (absDiff === 0) {
    if (totalGoals === 0) return 8;  // 0-0 最有利
    if (totalGoals <= 2) return 6;   // 1-1
    return 4;  // 高比分平局
  }

  // 1球差
  if (absDiff === 1) return 5;

  // 2球差
  if (absDiff === 2) return 2;

  // 3球及以上
  return 0;
}

/**
 * 比分状态 -> Game State Bias (Module A)
 * 某些比分状态更利于大球
 */
export function gameStateToBias(
  scoreHome: number,
  scoreAway: number,
  minute: number
): number {
  const diff = scoreHome - scoreAway;
  const total = scoreHome + scoreAway;

  let bias = 0;

  // 0-0 且 70+ 分钟
  if (total === 0 && minute >= 70) bias += 3;

  // 1球差且落后方有压力
  if (Math.abs(diff) === 1 && minute >= 75) bias += 2;

  // 已有进球表明双方都能进球
  if (total >= 2 && total <= 4) bias += 1;

  // 低比分长时间无进球 (可能爆发)
  if (total <= 1 && minute >= 65) bias += 2;

  return Math.min(4, bias);
}

// ============================================================
// 预定义映射器 - 盘口/市场
// ============================================================

/**
 * 大球赔率变化 -> 得分 (0-10)
 * 下降表示市场看好大球
 */
export function overOddsChangeToScore(prevOdds: number, currOdds: number): number {
  if (!prevOdds || !currOdds) return 0;

  const change = prevOdds - currOdds;  // 正值=下降=看好大球

  if (change <= 0) return 0;
  if (change >= 0.3) return 10;

  return change / 0.03;  // 每下降0.03得1分
}

/**
 * 亚盘变化 -> 得分 (0-8)
 * 让球收紧表示看好
 */
export function ahLineChangeToScore(prevLine: number, currLine: number): number {
  if (prevLine === null || currLine === null) return 0;

  const change = Math.abs(currLine) - Math.abs(prevLine);  // 负值=收紧

  if (change >= 0) return 0;  // 放宽不得分
  if (change <= -0.5) return 8;

  return Math.abs(change) * 16;  // 每收紧0.25得4分
}

/**
 * 隐含概率 vs 模型概率 -> 错位得分 (Module C)
 */
export function mispricingToScore(
  modelProb: number,
  impliedProb: number
): number {
  const gap = modelProb - impliedProb;  // 模型认为概率更高

  if (gap <= 0) return 0;
  if (gap >= 30) return 20;

  return (gap / 30) * 20;
}

// ============================================================
// 预定义映射器 - 压制指数
// ============================================================

/**
 * 计算压制指数 (Module A)
 * 综合最近15分钟的 shots, shots_on, xg, corners
 */
export function calculatePressureIndex(
  shotsLast15: number,
  shotsOnLast15: number,
  xgLast15: number,
  cornersLast15: number
): number {
  // 权重: shots=1, shots_on=2, xg=3, corners=0.5
  const raw = shotsLast15 + 2 * shotsOnLast15 + 3 * xgLast15 + 0.5 * cornersLast15;

  // 归一化到 0-12
  return createPiecewiseLinearMapper({
    ranges: [
      { min: 0, max: 3, output_min: 0, output_max: 3 },
      { min: 3, max: 8, output_min: 3, output_max: 7 },
      { min: 8, max: 15, output_min: 7, output_max: 10 },
      { min: 15, max: 25, output_min: 10, output_max: 12 },
    ],
    cap: 12,
  })(raw);
}

// ============================================================
// 预定义映射器 - 强队反扑
// ============================================================

/**
 * 强弱差 -> 得分 (Module B)
 * 基于 strength_score 差值或让球盘
 */
export function strengthGapToScore(
  strongTeamStrength: number,
  weakTeamStrength: number,
  handicapLine: number | null
): number {
  // 从实力分计算
  const strengthDiff = strongTeamStrength - weakTeamStrength;
  const strengthScore = createPiecewiseLinearMapper({
    ranges: [
      { min: 0, max: 5, output_min: 0, output_max: 2 },
      { min: 5, max: 15, output_min: 2, output_max: 5 },
      { min: 15, max: 30, output_min: 5, output_max: 8 },
    ],
    cap: 8,
  })(strengthDiff);

  // 从让球盘补充 (让球越深越强)
  let handicapBonus = 0;
  if (handicapLine !== null) {
    const absLine = Math.abs(handicapLine);
    if (absLine >= 1.5) handicapBonus = 2;
    else if (absLine >= 1.0) handicapBonus = 1.5;
    else if (absLine >= 0.5) handicapBonus = 1;
  }

  return Math.min(10, strengthScore + handicapBonus);
}

/**
 * 落后/平局压力 -> 得分 (Module B)
 */
export function trailingStateToScore(
  isStrongTeamTrailing: boolean,
  isStrongTeamDraw: boolean,
  minute: number
): number {
  if (!isStrongTeamTrailing && !isStrongTeamDraw) return 0;

  let score = 0;

  if (isStrongTeamTrailing) {
    score = 4;  // 落后基础分
    // 时间越晚压力越大
    if (minute >= 80) score += 2;
    else if (minute >= 70) score += 1;
  } else if (isStrongTeamDraw) {
    score = 2;
    if (minute >= 80) score += 1;
  }

  return Math.min(6, score);
}

// ============================================================
// 导出所有映射器
// ============================================================

export const Mappers = {
  // 射门
  shotsToScore,
  shotsOnToScore,
  shotAccuracyToScore,
  recentShotsToScore,
  shotsDeltaToScore,

  // xG
  xgToScore,
  xgLast15ToScore,
  xgDebtToScore,
  xgVelocityToScore,

  // 角球
  cornersToScore,
  recentCornersToScore,

  // 时间
  minuteToTimingScoreA,
  minuteToTimingScoreB,
  minuteToTimingScoreC,
  minuteToTimingScoreD,

  // 比分
  scoreDiffToBase,
  gameStateToBias,

  // 盘口
  overOddsChangeToScore,
  ahLineChangeToScore,
  mispricingToScore,

  // 综合
  calculatePressureIndex,
  strengthGapToScore,
  trailingStateToScore,

  // 工具
  createPiecewiseLinearMapper,
  sigmoidMapper,
  bellCurveMapper,
  trapezoidMapper,
};

export default Mappers;
