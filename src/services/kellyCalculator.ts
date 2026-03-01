// ============================================
// Kelly 计算器：真实赔率版
// Version: 139
// ============================================

import { KELLY_CONFIG } from '../config/battleRoomConstants';
import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================
// 类型定义
// ============================================

export interface RealOddsResult {
  odds: number | null;
  source: 'live' | 'prematch' | 'none';
  line: string;
  bookmaker?: string;
}

export interface KellyResult {
  kellyFraction: number | null;
  betSuggestion: number | null;
  hasRealOdds: boolean;
  oddsInfo: RealOddsResult;
}

// ============================================
// 真实赔率提取
// ============================================

/**
 * 从比赛数据中提取真实赔率
 * 使用 overUnder 盘口数据
 */
export function extractRealOdds(match: AdvancedMatch): RealOddsResult {
  const odds = match.odds;

  if (!odds) {
    return { odds: null, source: 'none', line: '-' };
  }

  // 检查 overUnder 是否有有效数据
  const ou = odds.overUnder;
  if (ou?.over && ou.over > 1.01) {
    // 判断数据来源（live 或 prematch）
    const isLive = odds._is_live === true;
    const source = isLive ? 'live' : 'prematch';
    const line = ou.total ?? 0.5;

    return {
      odds: ou.over,
      source,
      line: `大${line}球`,
      bookmaker: odds._bookmaker,
    };
  }

  return { odds: null, source: 'none', line: '-' };
}

// ============================================
// Kelly 计算
// ============================================

/**
 * 使用真实赔率计算 Kelly 值
 *
 * @param signalStrength 信号强度 (0-100)
 * @param match 比赛数据
 * @returns Kelly 计算结果
 */
export function calculateKellyWithRealOdds(
  signalStrength: number,
  match: AdvancedMatch
): KellyResult {
  const oddsInfo = extractRealOdds(match);

  // 无赔率 → 不给仓位建议
  if (!oddsInfo.odds) {
    return {
      kellyFraction: null,
      betSuggestion: null,
      hasRealOdds: false,
      oddsInfo,
    };
  }

  // 信号强度转换为估计胜率（保守处理）
  // 注意：这不是"真实概率"，只是仓位计算的输入
  // Phase 2 会用校准后的真实概率替换
  const estimatedWinRate = (signalStrength / 100) * KELLY_CONFIG.CONSERVATIVE_FACTOR;

  const realOdds = oddsInfo.odds;
  const q = 1 - estimatedWinRate;
  const b = realOdds - 1;

  // Kelly 公式: f* = (bp - q) / b
  const rawKelly = (b * estimatedWinRate - q) / b;
  const kellyFraction = Math.max(0, Math.round(rawKelly * 100) / 100);

  // 建议投注：凯利的 1/4（保守策略），上限 5%
  let betSuggestion: number | null = null;
  if (kellyFraction > 0) {
    const suggestion = kellyFraction * 100 * KELLY_CONFIG.POSITION_FRACTION;
    betSuggestion = Math.min(
      KELLY_CONFIG.MAX_BET_PERCENTAGE,
      Math.round(suggestion * 10) / 10
    );
    if (betSuggestion <= 0) betSuggestion = null;
  }

  return {
    kellyFraction,
    betSuggestion,
    hasRealOdds: true,
    oddsInfo,
  };
}

/**
 * 格式化赔率显示
 */
export function formatOddsDisplay(oddsInfo: RealOddsResult): string {
  if (!oddsInfo.odds) {
    return '暂无实时赔率';
  }
  return `${oddsInfo.line} @${oddsInfo.odds.toFixed(2)}`;
}
