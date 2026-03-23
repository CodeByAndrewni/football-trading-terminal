/**
 * 复合信号聚合器
 *
 * 将 scenarioEngine 输出的多个 ScenarioSignal 加权合并为单一 CompositeSignal，
 * 用于排序、UI 展示和 AI 上下文注入。
 */

import type { ScenarioSignal } from './modules/scenarioEngine';
import { SCENARIO_THRESHOLDS, type ScenarioCategory } from '../config/scenarioConfig';

export type CompositeAction = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface CompositeSignal {
  /** 按 score 降序的活跃情景（最多 5 个） */
  topScenarios: ScenarioSignal[];
  /** 加权复合分数 0-100 */
  compositeScore: number;
  /** 行动级别 */
  action: CompositeAction;
  /** 命中的情景数 */
  activeCount: number;
  /** 按大类汇总命中数 */
  byCategory: Record<ScenarioCategory, number>;
}

const TIER_W = SCENARIO_THRESHOLDS.TIER_WEIGHT;

/**
 * 将多个活跃情景信号聚合为复合分数。
 * 取最高 3 个情景的加权平均，叠加多标签命中奖励。
 */
export function aggregateScenarioSignals(activeSignals: ScenarioSignal[]): CompositeSignal {
  if (activeSignals.length === 0) {
    return {
      topScenarios: [],
      compositeScore: 0,
      action: 'NONE',
      activeCount: 0,
      byCategory: { match_state: 0, momentum: 0, price_psychology: 0 },
    };
  }

  const sorted = [...activeSignals].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);

  // 加权平均（top 3 by tier weight）
  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of top3) {
    const w = TIER_W[s.tier];
    weightedSum += s.score * w;
    weightTotal += w;
  }
  let composite = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // 多标签奖励：每多命中 1 个情景，+3 分（上限 +15）
  const bonus = Math.min(15, (activeSignals.length - 1) * 3);
  composite = Math.min(100, Math.round(composite + bonus));

  // 按大类汇总
  const byCategory: Record<ScenarioCategory, number> = {
    match_state: 0,
    momentum: 0,
    price_psychology: 0,
  };
  for (const s of activeSignals) {
    byCategory[s.category]++;
  }

  const action = getAction(composite);

  return {
    topScenarios: sorted.slice(0, 5),
    compositeScore: composite,
    action,
    activeCount: activeSignals.length,
    byCategory,
  };
}

function getAction(score: number): CompositeAction {
  if (score >= SCENARIO_THRESHOLDS.COMPOSITE.HIGH) return 'HIGH';
  if (score >= SCENARIO_THRESHOLDS.COMPOSITE.MEDIUM) return 'MEDIUM';
  if (score >= SCENARIO_THRESHOLDS.COMPOSITE.LOW) return 'LOW';
  return 'NONE';
}

/**
 * 格式化复合信号为可读文本（用于 AI 上下文）
 */
export function formatCompositeForAI(sig: CompositeSignal): string {
  if (sig.activeCount === 0) return '';

  const lines: string[] = [
    `**绝杀情景分析** — 复合评分: ${sig.compositeScore} (${sig.action}) — 命中 ${sig.activeCount} 个情景`,
  ];

  for (const s of sig.topScenarios) {
    const reasonStr = s.reasons.length > 0 ? ` (${s.reasons.join(', ')})` : '';
    lines.push(`- ${s.emoji} ${s.label}: ${s.score}分${reasonStr}`);
  }

  return lines.join('\n');
}
