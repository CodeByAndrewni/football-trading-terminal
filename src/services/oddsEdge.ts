/**
 * 赔率价值层 (Odds Edge Layer)
 *
 * 核心理念：策略引擎判断"会不会进球"，赔率层判断"市场是否已经消化了这个信息"。
 * 只有当策略预测的概率 > 市场隐含概率时，才存在正期望值（+EV）。
 *
 * 数据来源：
 *   - 赛前初盘: match.initialOverUnder, match.initialHandicap
 *   - 滚球赔率: match.odds.overUnder.over, match.odds.handicap, match.odds.matchWinner
 *   - 赛前 vs 滚球的漂移方向
 */

import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================================
// 类型
// ============================================================

export interface OddsEdgeResult {
  /** 滚球 Over 赔率的隐含概率 (0-1)，null 表示无数据 */
  impliedOverProb: number | null;
  /** 赛前→滚球 Over 赔率漂移方向: 'shortened'=缩短(市场看多), 'drifted'=拉长(市场看淡) */
  overDrift: 'shortened' | 'drifted' | 'stable' | 'unknown';
  /** 漂移幅度 (0-1 区间，越大漂移越显著) */
  driftMagnitude: number;
  /** 价值边际 = 策略预测概率 - 市场隐含概率。正数=有价值 */
  edge: number | null;
  /** 最终调节系数: >1 表示赔率支撑加分, <1 表示赔率已消化应减分 */
  oddsMultiplier: number;
  /** 人类可读的赔率判读 */
  reasons: string[];
}

// ============================================================
// 赔率→概率转换 (含 vig 剥离)
// ============================================================

/**
 * 欧赔→隐含概率，扣除庄家 margin（overround）。
 * 对于滚球 Over/Under 双向盘，用双向估算去 vig。
 */
function oddsToProb(odds: number): number {
  if (odds <= 1) return 1;
  return 1 / odds;
}

function devig(overOdds: number, underOdds: number): { overProb: number; underProb: number } {
  const rawOver = oddsToProb(overOdds);
  const rawUnder = oddsToProb(underOdds);
  const total = rawOver + rawUnder;
  if (total <= 0) return { overProb: 0.5, underProb: 0.5 };
  return {
    overProb: rawOver / total,
    underProb: rawUnder / total,
  };
}

// ============================================================
// 策略分数→模型概率映射
// ============================================================

/**
 * 将 compositeScore (0-100) 映射为「剩余时间内再进球」的估计概率。
 *
 * 这个映射是粗糙的初始版本，需要用 paper trade 数据校准：
 *   score=0  → 基线概率 (取决于分钟)
 *   score=50 → 基线 + 小幅提升
 *   score=75 → 明显高于基线
 *   score=100 → 接近上限
 *
 * 基线概率: 75 分钟后再进球 ≈ 35-40%（全市场平均）
 */
function compositeToProb(compositeScore: number, minute: number): number {
  const remainMin = Math.max(1, 95 - minute);
  const baseProbPerMin = 0.012;
  const baseline = Math.min(0.65, remainMin * baseProbPerMin);

  const boost = compositeScore / 100 * 0.30;
  return Math.min(0.85, baseline + boost);
}

// ============================================================
// 赛前→滚球漂移分析
// ============================================================

function analyzeDrift(m: AdvancedMatch): { drift: OddsEdgeResult['overDrift']; magnitude: number; reasons: string[] } {
  const reasons: string[] = [];
  const initOU = m.initialOverUnder;
  const liveTotal = m.odds?.overUnder?.total ?? null;
  const liveOver = m.odds?.overUnder?.over ?? null;

  if (typeof initOU !== 'number' || typeof liveTotal !== 'number' || typeof liveOver !== 'number') {
    return { drift: 'unknown', magnitude: 0, reasons };
  }

  const goals = (m.home?.score ?? 0) + (m.away?.score ?? 0);

  // 盘口线的漂移：赛前 O/U 2.5 → 滚球调到 1.5 说明已进 1 球，盘口跟上了
  // 真正有信息量的是 "考虑当前比分后，Over 赔率是否偏高"
  // 用「剩余进球需求」来衡量：如果需要再进 1 球但 over 赔率 3.0+，说明市场不看好
  const remainingGoalsNeeded = Math.max(0, Math.ceil(liveTotal) - goals);

  if (remainingGoalsNeeded === 0) {
    reasons.push('Over 已穿盘，无需追大');
    return { drift: 'shortened', magnitude: 0, reasons };
  }

  // 赛前盘口 vs 实际进球进度的对比
  const expectedGoalsByNow = initOU * (m.minute / 95);
  const goalPace = goals - expectedGoalsByNow;

  if (goalPace < -0.8) {
    reasons.push(`进球落后预期 (实际${goals} vs 预期${expectedGoalsByNow.toFixed(1)})`);
  } else if (goalPace > 0.5) {
    reasons.push(`进球超预期 (实际${goals} vs 预期${expectedGoalsByNow.toFixed(1)})`);
  }

  // Over 赔率的漂移
  // 如果 over odds 很高（>3.0），说明市场不看好再进球
  // 如果 over odds 在 1.5-2.0，说明市场仍认为会进球
  if (liveOver >= 3.5) {
    reasons.push(`Over ${liveOver.toFixed(2)} — 市场极度看淡`);
    return { drift: 'drifted', magnitude: 0.8, reasons };
  }
  if (liveOver >= 2.5) {
    reasons.push(`Over ${liveOver.toFixed(2)} — 市场偏淡`);
    return { drift: 'drifted', magnitude: 0.4, reasons };
  }
  if (liveOver <= 1.5) {
    reasons.push(`Over ${liveOver.toFixed(2)} — 市场强烈看多（已消化）`);
    return { drift: 'shortened', magnitude: 0.6, reasons };
  }

  reasons.push(`Over ${liveOver.toFixed(2)} — 中性区间`);
  return { drift: 'stable', magnitude: 0.1, reasons };
}

// ============================================================
// 核心: 计算价值边际
// ============================================================

export function calculateOddsEdge(m: AdvancedMatch, compositeScore: number): OddsEdgeResult {
  const reasons: string[] = [];
  const overOdds = m.odds?.overUnder?.over ?? null;
  const underOdds = m.odds?.overUnder?.under ?? null;

  // 无赔率数据时，不调节（乘数=1）
  if (typeof overOdds !== 'number' || typeof underOdds !== 'number') {
    return {
      impliedOverProb: null,
      overDrift: 'unknown',
      driftMagnitude: 0,
      edge: null,
      oddsMultiplier: 1.0,
      reasons: ['无滚球赔率数据，不调节'],
    };
  }

  // 1. 隐含概率
  const { overProb } = devig(overOdds, underOdds);
  reasons.push(`市场隐含 Over 概率: ${(overProb * 100).toFixed(0)}%`);

  // 2. 模型预测概率
  const modelProb = compositeToProb(compositeScore, m.minute);
  reasons.push(`模型预测概率: ${(modelProb * 100).toFixed(0)}%`);

  // 3. 价值边际
  const edge = modelProb - overProb;
  if (edge > 0.10) {
    reasons.push(`✅ 正 EV: +${(edge * 100).toFixed(0)}pp 边际`);
  } else if (edge > 0) {
    reasons.push(`⚠️ 微弱正 EV: +${(edge * 100).toFixed(0)}pp`);
  } else {
    reasons.push(`❌ 负 EV: ${(edge * 100).toFixed(0)}pp — 市场已消化`);
  }

  // 4. 漂移分析
  const drift = analyzeDrift(m);
  reasons.push(...drift.reasons);

  // 5. 综合调节系数
  let multiplier = 1.0;

  // 正 EV 加成
  if (edge > 0.15) multiplier += 0.25;
  else if (edge > 0.08) multiplier += 0.15;
  else if (edge > 0) multiplier += 0.05;
  // 负 EV 惩罚
  else if (edge < -0.15) multiplier -= 0.30;
  else if (edge < -0.05) multiplier -= 0.15;

  // 市场极端看淡时额外惩罚
  if (drift.drift === 'drifted' && drift.magnitude >= 0.6) {
    multiplier -= 0.15;
    reasons.push('漂移惩罚: 市场持续看淡');
  }

  // 市场已充分消化（over odds < 1.5）时，策略分数需打折
  if (overOdds < 1.5) {
    multiplier -= 0.20;
    reasons.push('低赔惩罚: Over 赔率过低，无价值');
  }

  // 赔率在甜蜜区间（2.0-3.5）+ 正 EV = 最佳组合
  if (overOdds >= 2.0 && overOdds <= 3.5 && edge > 0.05) {
    multiplier += 0.10;
    reasons.push('🎯 甜蜜区间: 赔率适中 + 正 EV');
  }

  multiplier = Math.max(0.3, Math.min(1.5, multiplier));

  return {
    impliedOverProb: overProb,
    overDrift: drift.drift,
    driftMagnitude: drift.magnitude,
    edge,
    oddsMultiplier: multiplier,
    reasons,
  };
}

/**
 * 格式化赔率分析为可读文本（用于 AI 上下文 / UI 提示）
 */
export function formatOddsEdgeForAI(result: OddsEdgeResult): string {
  if (result.edge === null) return '';
  const lines = ['**赔率价值分析:**'];
  for (const r of result.reasons) {
    lines.push(`  ${r}`);
  }
  lines.push(`  调节系数: ${result.oddsMultiplier.toFixed(2)}x`);
  return lines.join('\n');
}
