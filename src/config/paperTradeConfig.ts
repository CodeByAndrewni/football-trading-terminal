/**
 * Paper Trading 触发规则配置
 *
 * 定义何时自动模拟下单：基于 compositeScore、命中情景数、分钟区间等条件。
 * 所有阈值集中管理，便于根据复盘数据调参。
 */

import type { ScenarioId } from './scenarioConfig';

export type MarketType = 'OVER' | 'NEXT_GOAL' | 'BTTS_YES';

export interface PaperTradeRule {
  id: string;
  label: string;
  enabled: boolean;
  /** 最低复合分 */
  minCompositeScore: number;
  /** 最少同时命中情景数 */
  minActiveScenarios: number;
  /** 必须包含的情景（任一命中即满足，留空表示不限） */
  requiredScenarios?: ScenarioId[];
  /** 模拟市场类型 */
  marketType: MarketType;
  /** 生效分钟区间 [min, max] */
  minuteRange: [number, number];
  /** 同一场比赛的冷却时间（分钟），防止重复下单 */
  cooldownMinutes: number;
  /** 固定注额 */
  stake: number;
}

export const PAPER_TRADE_RULES: PaperTradeRule[] = [
  {
    id: 'AUTO_HIGH',
    label: '高分自动买入',
    enabled: true,
    minCompositeScore: 75,
    minActiveScenarios: 2,
    marketType: 'OVER',
    minuteRange: [75, 92],
    cooldownMinutes: 5,
    stake: 10,
  },
  {
    id: 'AUTO_MEDIUM_MULTI',
    label: '中分多标签买入',
    enabled: true,
    minCompositeScore: 55,
    minActiveScenarios: 3,
    marketType: 'OVER',
    minuteRange: [80, 92],
    cooldownMinutes: 5,
    stake: 10,
  },
];

/** 模拟下单全局开关（localStorage key） */
export const PAPER_TRADE_ENABLED_KEY = 'paper_trade_enabled';

/** 获取全局开关状态 */
export function isPaperTradeEnabled(): boolean {
  try {
    return localStorage.getItem(PAPER_TRADE_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** 切换全局开关 */
export function setPaperTradeEnabled(v: boolean): void {
  try {
    localStorage.setItem(PAPER_TRADE_ENABLED_KEY, v ? 'true' : 'false');
  } catch {
    // SSR / no localStorage
  }
}
