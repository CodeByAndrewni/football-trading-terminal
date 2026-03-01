// ============================================
// 盘口异常检测服务 - 深度分析系统
// ============================================

import type { AdvancedMatch, OddsInfo } from '../data/advancedMockData';

// ============================================
// 类型定义
// ============================================

// 历史赔率快照
export interface OddsSnapshot {
  timestamp: number;       // Unix 时间戳
  minute: number;          // 比赛分钟
  handicap: {
    home: number;
    value: number;
    away: number;
  };
  overUnder: {
    over: number;
    total: number;
    under: number;
  };
}

// 赔率变化记录
export interface OddsChange {
  type: 'handicap_home' | 'handicap_away' | 'over' | 'under';
  oldValue: number;
  newValue: number;
  change: number;           // 变化量（可正可负）
  changePercent: number;    // 变化百分比
  timeElapsed: number;      // 经过时间（秒）
  minute: number;           // 比赛分钟
}

// 盘口预警类型
export type OddsAlertType =
  | 'handicap_rapid_change'     // 让球盘急变
  | 'over_rapid_drop'           // 大球赔率急跌
  | 'under_rapid_drop'          // 小球赔率急跌
  | 'odds_divergence'           // 盘口背离
  | 'money_flow_reversal'       // 资金流向逆转
  | 'late_odds_shift';          // 临场大幅变盘

// 盘口预警
export interface OddsAlert {
  id: string;
  type: OddsAlertType;
  severity: 'critical' | 'warning' | 'info';   // 🔴 / 🟠 / 🔵
  title: string;
  message: string;
  matchId: number;
  timestamp: Date;
  details: {
    oldValue?: number;
    newValue?: number;
    change?: number;
    direction?: 'home' | 'away' | 'over' | 'under';
    confidence?: number;   // 置信度
  };
}

// 资金流向
export interface MoneyFlow {
  homePercent: number;      // 主队资金占比 0-100
  awayPercent: number;      // 客队资金占比 0-100
  trend: 'accelerating' | 'decelerating' | 'stable';  // 趋势
  direction: 'home' | 'away' | 'balanced';            // 流向
  confidence: number;       // 置信度 0-100
}

// 背离类型扩展
export type DivergenceType =
  | 'score_behind_odds_tight'      // 落后但盘口收紧
  | 'score_ahead_odds_loose'       // 领先但盘口放宽
  | 'xg_mismatch'                  // xG与赔率背离
  | 'pressure_mismatch'            // 压迫态势与赔率背离
  | 'multi_factor_divergence';     // 多因子综合背离

// 盘口背离信号
export interface DivergenceSignal {
  detected: boolean;
  type: DivergenceType | 'score_behind_odds_tight' | 'score_ahead_odds_loose' | 'xg_mismatch' | null;
  severity: 'strong' | 'moderate' | 'weak' | null;
  confidence: number;       // 置信度 0-100
  description: string;
  recommendation: string;
}

// 完整盘口分析结果
export interface OddsAnalysisResult {
  matchId: number;
  alerts: OddsAlert[];
  moneyFlow: MoneyFlow;
  divergence: DivergenceSignal;
  recentChanges: OddsChange[];
  riskLevel: 'high' | 'medium' | 'low';
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'avoid';
}

// ============================================
// 配置常量
// ============================================

export const ODDS_CONFIG = {
  // 赔率急变阈值（降低以提高敏感度）
  HANDICAP_RAPID_CHANGE_THRESHOLD: 0.12,  // 让球盘90秒内变化>0.12
  HANDICAP_CRITICAL_CHANGE: 0.18,         // 严重变化阈值
  OVER_RAPID_DROP_THRESHOLD: 0.10,        // 大球赔率急跌>0.10
  OVER_CRITICAL_DROP: 0.15,               // 严重急跌阈值
  UNDER_RAPID_DROP_THRESHOLD: 0.10,       // 小球赔率急跌>0.10

  // 时间窗口
  RAPID_CHANGE_WINDOW_SECONDS: 90,        // 急变检测窗口扩大到90秒
  TREND_ANALYSIS_WINDOW: 5,               // 趋势分析窗口（分钟）
  LATE_GAME_MINUTE: 70,                   // 临场定义
  CRITICAL_MINUTE: 80,                    // 关键时刻

  // 盘口背离阈值 - 多层级
  DIVERGENCE_HANDICAP_SHIFT: 0.25,        // 背离检测让球盘变化阈值
  DIVERGENCE_SCORE_DIFF: 1,               // 比分差阈值
  DIVERGENCE_WEAK_THRESHOLD: 0.08,        // 弱背离阈值
  DIVERGENCE_MODERATE_THRESHOLD: 0.12,    // 中等背离阈值
  DIVERGENCE_STRONG_THRESHOLD: 0.18,      // 强背离阈值
  XG_DIFF_THRESHOLD: 0.5,                 // xG差值阈值
  PRESSURE_DIFF_THRESHOLD: 8,             // 危险进攻差值阈值

  // 资金流向计算权重
  MONEY_FLOW_ODDS_WEIGHT: 0.6,            // 赔率变化权重
  MONEY_FLOW_VOLUME_WEIGHT: 0.4,          // 成交量权重（模拟）
};

// ============================================
// 盘口分析器类
// ============================================

export class OddsAnalyzer {
  private oddsHistory: Map<number, OddsSnapshot[]> = new Map();
  private alerts: OddsAlert[] = [];

  // 更新赔率快照
  updateOddsSnapshot(matchId: number, minute: number, odds: OddsInfo): void {
    const snapshot: OddsSnapshot = {
      timestamp: Date.now(),
      minute,
      handicap: {
        home: odds.handicap?.home ?? 0,
        value: odds.handicap?.value ?? 0,
        away: odds.handicap?.away ?? 0,
      },
      overUnder: {
        over: odds.overUnder?.over ?? 0,
        total: odds.overUnder?.total ?? 0,
        under: odds.overUnder?.under ?? 0,
      },
    };

    const history = this.oddsHistory.get(matchId) || [];
    history.push(snapshot);

    // 只保留最近30分钟的数据
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const filtered = history.filter(s => s.timestamp > thirtyMinutesAgo);
    this.oddsHistory.set(matchId, filtered);
  }

  // 获取赔率历史
  getOddsHistory(matchId: number): OddsSnapshot[] {
    return this.oddsHistory.get(matchId) || [];
  }

  // ============================================
  // 辅助方法：计算历史赔率变化幅度
  // ============================================

  private calculateOddsShift(matchId: number, windowMinutes = 5): {
    handicapHomeShift: number;
    handicapAwayShift: number;
    overShift: number;
    underShift: number;
    trend: 'accelerating' | 'decelerating' | 'stable';
  } {
    const history = this.getOddsHistory(matchId);
    if (history.length < 2) {
      return { handicapHomeShift: 0, handicapAwayShift: 0, overShift: 0, underShift: 0, trend: 'stable' };
    }

    const windowMs = windowMinutes * 60 * 1000;
    const now = Date.now();
    const recentSnapshots = history.filter(s => s.timestamp >= now - windowMs);

    if (recentSnapshots.length < 2) {
      const first = history[0];
      const last = history[history.length - 1];
      return {
        handicapHomeShift: last.handicap.home - first.handicap.home,
        handicapAwayShift: last.handicap.away - first.handicap.away,
        overShift: last.overUnder.over - first.overUnder.over,
        underShift: last.overUnder.under - first.overUnder.under,
        trend: 'stable',
      };
    }

    const first = recentSnapshots[0];
    const last = recentSnapshots[recentSnapshots.length - 1];

    // 计算加速度趋势
    let trend: 'accelerating' | 'decelerating' | 'stable' = 'stable';
    if (recentSnapshots.length >= 3) {
      const mid = recentSnapshots[Math.floor(recentSnapshots.length / 2)];
      const firstHalfChange = Math.abs(mid.handicap.home - first.handicap.home);
      const secondHalfChange = Math.abs(last.handicap.home - mid.handicap.home);

      if (secondHalfChange > firstHalfChange * 1.5) {
        trend = 'accelerating';
      } else if (secondHalfChange < firstHalfChange * 0.5) {
        trend = 'decelerating';
      }
    }

    return {
      handicapHomeShift: last.handicap.home - first.handicap.home,
      handicapAwayShift: last.handicap.away - first.handicap.away,
      overShift: last.overUnder.over - first.overUnder.over,
      underShift: last.overUnder.under - first.overUnder.under,
      trend,
    };
  }

  // ============================================
  // 1. 赔率急变检测
  // ============================================

  detectRapidChanges(matchId: number): OddsChange[] {
    const history = this.getOddsHistory(matchId);
    if (history.length < 2) return [];

    const changes: OddsChange[] = [];
    const windowMs = ODDS_CONFIG.RAPID_CHANGE_WINDOW_SECONDS * 1000;
    const now = Date.now();

    // 找到窗口内的第一个快照
    const windowStart = now - windowMs;
    const recentSnapshots = history.filter(s => s.timestamp >= windowStart);

    if (recentSnapshots.length < 2) return [];

    const first = recentSnapshots[0];
    const last = recentSnapshots[recentSnapshots.length - 1];
    const timeElapsed = (last.timestamp - first.timestamp) / 1000;

    // 检测让球盘主队赔率变化
    const handicapHomeChange = last.handicap.home - first.handicap.home;
    if (Math.abs(handicapHomeChange) >= ODDS_CONFIG.HANDICAP_RAPID_CHANGE_THRESHOLD) {
      changes.push({
        type: 'handicap_home',
        oldValue: first.handicap.home,
        newValue: last.handicap.home,
        change: handicapHomeChange,
        changePercent: (handicapHomeChange / first.handicap.home) * 100,
        timeElapsed,
        minute: last.minute,
      });
    }

    // 检测让球盘客队赔率变化
    const handicapAwayChange = last.handicap.away - first.handicap.away;
    if (Math.abs(handicapAwayChange) >= ODDS_CONFIG.HANDICAP_RAPID_CHANGE_THRESHOLD) {
      changes.push({
        type: 'handicap_away',
        oldValue: first.handicap.away,
        newValue: last.handicap.away,
        change: handicapAwayChange,
        changePercent: (handicapAwayChange / first.handicap.away) * 100,
        timeElapsed,
        minute: last.minute,
      });
    }

    // 检测大球赔率急跌
    const overChange = last.overUnder.over - first.overUnder.over;
    if (overChange <= -ODDS_CONFIG.OVER_RAPID_DROP_THRESHOLD) {
      changes.push({
        type: 'over',
        oldValue: first.overUnder.over,
        newValue: last.overUnder.over,
        change: overChange,
        changePercent: (overChange / first.overUnder.over) * 100,
        timeElapsed,
        minute: last.minute,
      });
    }

    // 检测小球赔率急跌
    const underChange = last.overUnder.under - first.overUnder.under;
    if (underChange <= -ODDS_CONFIG.UNDER_RAPID_DROP_THRESHOLD) {
      changes.push({
        type: 'under',
        oldValue: first.overUnder.under,
        newValue: last.overUnder.under,
        change: underChange,
        changePercent: (underChange / first.overUnder.under) * 100,
        timeElapsed,
        minute: last.minute,
      });
    }

    return changes;
  }

  // ============================================
  // 2. 资金流向分析
  // ============================================

  analyzeMoneyFlow(match: AdvancedMatch): MoneyFlow {
    const { odds } = match;

    // 基于赔率变化推算资金流向
    // 赔率下降 = 资金流入，赔率上升 = 资金流出

    // 让球盘分析
    let homeFlowScore = 50;  // 基准50%

    // 主队赔率下降 → 主队资金流入
    if (odds.handicap.homeTrend === 'down') {
      homeFlowScore += 8;
    } else if (odds.handicap.homeTrend === 'up') {
      homeFlowScore -= 8;
    }

    // 客队赔率下降 → 客队资金流入 → 主队占比下降
    if (odds.handicap.awayTrend === 'down') {
      homeFlowScore -= 8;
    } else if (odds.handicap.awayTrend === 'up') {
      homeFlowScore += 8;
    }

    // 大小球分析补充
    // 大球赔率下降通常伴随进攻方资金流入
    if (odds.overUnder.overTrend === 'down') {
      // 根据场上压迫方向调整
      if (match.pressure === 'home') {
        homeFlowScore += 5;
      } else if (match.pressure === 'away') {
        homeFlowScore -= 5;
      }
    }

    // 根据历史数据调整
    const history = this.getOddsHistory(match.id);
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const handicapTrend = recent[recent.length - 1].handicap.home - recent[0].handicap.home;

      // 持续下降趋势
      if (handicapTrend < -0.1) {
        homeFlowScore += 5;
      } else if (handicapTrend > 0.1) {
        homeFlowScore -= 5;
      }
    }

    // 边界处理
    homeFlowScore = Math.max(20, Math.min(80, homeFlowScore));

    // 确定趋势
    let trend: MoneyFlow['trend'] = 'stable';
    if (history.length >= 5) {
      const recent5 = history.slice(-5);
      const changes = [];
      for (let i = 1; i < recent5.length; i++) {
        changes.push(recent5[i].handicap.home - recent5[i-1].handicap.home);
      }
      const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
      const recentChange = changes[changes.length - 1] || 0;

      if (Math.abs(recentChange) > Math.abs(avgChange) * 1.5) {
        trend = 'accelerating';
      } else if (Math.abs(recentChange) < Math.abs(avgChange) * 0.5) {
        trend = 'decelerating';
      }
    }

    // 确定流向
    let direction: MoneyFlow['direction'] = 'balanced';
    if (homeFlowScore >= 58) {
      direction = 'home';
    } else if (homeFlowScore <= 42) {
      direction = 'away';
    }

    // 置信度
    const confidence = Math.min(90, 50 + Math.abs(homeFlowScore - 50) * 1.5 + history.length * 2);

    return {
      homePercent: Math.round(homeFlowScore),
      awayPercent: Math.round(100 - homeFlowScore),
      trend,
      direction,
      confidence: Math.round(confidence),
    };
  }

  // ============================================
  // 3. 盘口背离检测（优化版 - 多因子模型）
  // ============================================

  detectDivergence(match: AdvancedMatch): DivergenceSignal {
    const { home, away, odds, stats, minute, pressure, substitutions, corners } = match;
    const scoreDiff = home.score - away.score;
    const handicapValue = odds.handicap?.value ?? 0;
    const history = this.getOddsHistory(match.id);
    const oddsShift = this.calculateOddsShift(match.id, 5);

    // 多因子评分系统
    let totalScore = 0;
    let triggeredFactors = 0;
    let detectedType: DivergenceSignal['type'] = null;
    let description = '';
    let recommendation = '';

    // ========== 因子1: 比分与盘口趋势背离 (权重: 30%) ==========
    let scoreOddsFactor = 0;

    // 主队让球且落后，但盘口收紧
    if (scoreDiff < 0 && handicapValue < 0) {
      const isOddsTightening = odds.handicap.homeTrend === 'down' ||
        oddsShift.handicapHomeShift < -ODDS_CONFIG.DIVERGENCE_WEAK_THRESHOLD;

      if (isOddsTightening) {
        const shiftMagnitude = Math.abs(oddsShift.handicapHomeShift);
        scoreOddsFactor = Math.abs(scoreDiff) * 10 + shiftMagnitude * 30;
        triggeredFactors++;
        detectedType = 'score_behind_odds_tight';

        // 时间加成
        if (minute >= ODDS_CONFIG.CRITICAL_MINUTE) scoreOddsFactor *= 1.5;
        else if (minute >= ODDS_CONFIG.LATE_GAME_MINUTE) scoreOddsFactor *= 1.2;

        // 变化幅度加成
        if (shiftMagnitude >= ODDS_CONFIG.DIVERGENCE_STRONG_THRESHOLD) scoreOddsFactor *= 1.3;

        description = `主队落后${Math.abs(scoreDiff)}球但盘口收紧(${oddsShift.handicapHomeShift.toFixed(2)})，资金涌入主队`;
        recommendation = minute >= 75 ? '强烈关注主队进球机会' : '持续关注赔率变化';
      }
    }

    // 客队让球且落后，但盘口收紧
    if (scoreDiff > 0 && handicapValue > 0) {
      const isOddsTightening = odds.handicap.awayTrend === 'down' ||
        oddsShift.handicapAwayShift < -ODDS_CONFIG.DIVERGENCE_WEAK_THRESHOLD;

      if (isOddsTightening) {
        const shiftMagnitude = Math.abs(oddsShift.handicapAwayShift);
        scoreOddsFactor = Math.abs(scoreDiff) * 10 + shiftMagnitude * 30;
        triggeredFactors++;
        detectedType = 'score_behind_odds_tight';

        if (minute >= ODDS_CONFIG.CRITICAL_MINUTE) scoreOddsFactor *= 1.5;
        else if (minute >= ODDS_CONFIG.LATE_GAME_MINUTE) scoreOddsFactor *= 1.2;

        description = `客队落后${Math.abs(scoreDiff)}球但盘口收紧(${oddsShift.handicapAwayShift.toFixed(2)})，资金涌入客队`;
        recommendation = minute >= 75 ? '强烈关注客队进球机会' : '持续关注赔率变化';
      }
    }

    // 领先但盘口放宽
    if (scoreDiff > 0 && handicapValue < 0 && scoreOddsFactor === 0) {
      const isOddsLoosening = odds.handicap.homeTrend === 'up' ||
        oddsShift.handicapHomeShift > ODDS_CONFIG.DIVERGENCE_WEAK_THRESHOLD;

      if (isOddsLoosening) {
        scoreOddsFactor = 8 + Math.abs(oddsShift.handicapHomeShift) * 20;
        triggeredFactors++;
        detectedType = 'score_ahead_odds_loose';
        description = '领先方盘口放宽，庄家预判可能收缩防守';
        recommendation = '考虑小球或关注对手反击';
      }
    }

    totalScore += scoreOddsFactor * 0.30;

    // ========== 因子2: 时间权重 (权重: 15%) ==========
    let timeFactor = 0;
    if (minute >= 85) timeFactor = 25;
    else if (minute >= 80) timeFactor = 18;
    else if (minute >= 75) timeFactor = 12;
    else if (minute >= 70) timeFactor = 8;

    if (timeFactor > 0 && scoreOddsFactor > 0) triggeredFactors++;
    totalScore += timeFactor * 0.15;

    // ========== 因子3: 压迫态势背离 (权重: 20%) ==========
    let pressureFactor = 0;
    if (stats?.dangerousAttacks) {
      const dangerDiff = stats.dangerousAttacks.home - stats.dangerousAttacks.away;

      // 主队压迫明显但赔率上升
      if (dangerDiff >= ODDS_CONFIG.PRESSURE_DIFF_THRESHOLD && odds.handicap.homeTrend === 'up') {
        pressureFactor = dangerDiff * 1.5;
        triggeredFactors++;
        if (!detectedType) {
          detectedType = 'pressure_mismatch';
          description = `场上压迫态势与盘口走势背离(危险进攻 ${stats.dangerousAttacks.home}:${stats.dangerousAttacks.away})`;
          recommendation = '密切关注场上实况';
        }
      }

      // 客队压迫明显但赔率上升
      if (dangerDiff <= -ODDS_CONFIG.PRESSURE_DIFF_THRESHOLD && odds.handicap.awayTrend === 'up') {
        pressureFactor = Math.abs(dangerDiff) * 1.5;
        triggeredFactors++;
        if (!detectedType) {
          detectedType = 'pressure_mismatch';
          description = `场上压迫态势与盘口走势背离(危险进攻 ${stats.dangerousAttacks.home}:${stats.dangerousAttacks.away})`;
          recommendation = '密切关注场上实况';
        }
      }

      // 场上压迫方向与赔率趋势背离
      if (pressure === 'home' && odds.handicap.homeTrend === 'up') {
        pressureFactor += 8;
      } else if (pressure === 'away' && odds.handicap.awayTrend === 'up') {
        pressureFactor += 8;
      }
    }

    totalScore += pressureFactor * 0.20;

    // ========== 因子4: xG背离 (权重: 15%) ==========
    let xgFactor = 0;
    if (stats?.xG) {
      const xgDiff = stats.xG.home - stats.xG.away;

      if (xgDiff > ODDS_CONFIG.XG_DIFF_THRESHOLD && odds.handicap.homeTrend === 'up') {
        xgFactor = xgDiff * 15;
        triggeredFactors++;
        if (!detectedType) {
          detectedType = 'xg_mismatch';
          description = `xG数据与赔率背离(主${stats.xG.home.toFixed(2)} vs 客${stats.xG.away.toFixed(2)})`;
          recommendation = '关注实际场上局势';
        }
      }

      if (xgDiff < -ODDS_CONFIG.XG_DIFF_THRESHOLD && odds.handicap.awayTrend === 'up') {
        xgFactor = Math.abs(xgDiff) * 15;
        triggeredFactors++;
        if (!detectedType) {
          detectedType = 'xg_mismatch';
          description = `xG数据与赔率背离(主${stats.xG.home.toFixed(2)} vs 客${stats.xG.away.toFixed(2)})`;
          recommendation = '关注实际场上局势';
        }
      }

      // xG与比分背离加成
      if (stats.xG.home > stats.xG.away + 0.5 && scoreDiff <= 0) {
        xgFactor += 5;
      } else if (stats.xG.away > stats.xG.home + 0.5 && scoreDiff >= 0) {
        xgFactor += 5;
      }
    }

    totalScore += xgFactor * 0.15;

    // ========== 因子5: 换人信号 (权重: 10%) ==========
    let subFactor = 0;
    const recentSubs = substitutions.filter(s => s.minute >= minute - 10);
    const attackSubs = recentSubs.filter(s => s.type === 'attack');

    // 进攻换人但大球赔率不降
    if (attackSubs.length >= 2 && odds.overUnder.overTrend !== 'down') {
      subFactor = attackSubs.length * 5;
      triggeredFactors++;
    }

    // 落后方进攻换人且赔率下降
    if (scoreDiff !== 0) {
      const behindTeam = scoreDiff < 0 ? 'home' : 'away';
      const behindAttackSubs = attackSubs.filter(s => s.team === behindTeam);
      if (behindAttackSubs.length >= 1) {
        const behindTrend = behindTeam === 'home' ? odds.handicap.homeTrend : odds.handicap.awayTrend;
        if (behindTrend === 'down') {
          subFactor += 8;
        }
      }
    }

    totalScore += subFactor * 0.10;

    // ========== 因子6: 角球密集 (权重: 10%) ==========
    let cornerFactor = 0;
    const cornersRecent5min = corners?.recent5min ?? 0;
    const cornersHome = corners?.home ?? 0;
    const cornersAway = corners?.away ?? 0;

    if (cornersRecent5min >= 2 && odds.overUnder.overTrend !== 'down') {
      cornerFactor = cornersRecent5min * 4;
      triggeredFactors++;
    }

    const cornerDiff = Math.abs(cornersHome - cornersAway);
    if (cornerDiff >= 4) {
      const leadingTeam = cornersHome > cornersAway ? 'home' : 'away';
      const leadingTrend = leadingTeam === 'home' ? odds.handicap.homeTrend : odds.handicap.awayTrend;
      if (leadingTrend === 'up') {
        cornerFactor += cornerDiff * 2;
      }
    }

    totalScore += cornerFactor * 0.10;

    // ========== 综合评估 ==========
    const detected = triggeredFactors >= 2 || totalScore >= 15;

    // 多因子综合背离
    if (triggeredFactors >= 3 && !detectedType) {
      detectedType = 'multi_factor_divergence';
      description = `多因子综合背离(${triggeredFactors}项因子触发)`;
      recommendation = '综合信号强烈，建议重点关注';
    }

    // 严重程度评估
    let severity: DivergenceSignal['severity'] = null;
    if (detected) {
      if (totalScore >= 30 || (totalScore >= 20 && minute >= ODDS_CONFIG.CRITICAL_MINUTE)) {
        severity = 'strong';
      } else if (totalScore >= 18 || triggeredFactors >= 3) {
        severity = 'moderate';
      } else {
        severity = 'weak';
      }
    }

    // 置信度计算
    const confidence = Math.min(95, Math.round(
      25 +
      triggeredFactors * 12 +
      totalScore * 1.2 +
      (minute >= ODDS_CONFIG.LATE_GAME_MINUTE ? 10 : 0) +
      (history.length >= 3 ? 8 : 0) +
      (oddsShift.trend === 'accelerating' ? 5 : 0)
    ));

    return {
      detected,
      type: detectedType,
      severity,
      confidence: detected ? confidence : 0,
      description: description || (detected ? '检测到盘口异常信号' : ''),
      recommendation: recommendation || (detected ? '建议关注' : ''),
    };
  }

  // ============================================
  // 4. 生成盘口预警
  // ============================================

  generateAlerts(match: AdvancedMatch): OddsAlert[] {
    const alerts: OddsAlert[] = [];
    const now = new Date();

    // 1. 赔率急变预警
    const rapidChanges = this.detectRapidChanges(match.id);
    for (const change of rapidChanges) {
      if (change.type === 'handicap_home' || change.type === 'handicap_away') {
        alerts.push({
          id: `alert-${match.id}-hc-${now.getTime()}`,
          type: 'handicap_rapid_change',
          severity: Math.abs(change.change) >= 0.2 ? 'critical' : 'warning',
          title: '🔴 让球盘急变',
          message: `${change.type === 'handicap_home' ? '主队' : '客队'}赔率 ${change.oldValue.toFixed(2)} → ${change.newValue.toFixed(2)} (${change.change > 0 ? '+' : ''}${change.change.toFixed(2)})`,
          matchId: match.id,
          timestamp: now,
          details: {
            oldValue: change.oldValue,
            newValue: change.newValue,
            change: change.change,
            direction: change.type === 'handicap_home' ? 'home' : 'away',
          },
        });
      }

      if (change.type === 'over' && change.change < 0) {
        alerts.push({
          id: `alert-${match.id}-over-${now.getTime()}`,
          type: 'over_rapid_drop',
          severity: Math.abs(change.change) >= 0.15 ? 'critical' : 'warning',
          title: '🟠 大球赔率急跌',
          message: `大球赔率 ${change.oldValue.toFixed(2)} → ${change.newValue.toFixed(2)} (${change.change.toFixed(2)})`,
          matchId: match.id,
          timestamp: now,
          details: {
            oldValue: change.oldValue,
            newValue: change.newValue,
            change: change.change,
            direction: 'over',
          },
        });
      }
    }

    // 2. 盘口背离预警
    const divergence = this.detectDivergence(match);
    if (divergence.detected) {
      alerts.push({
        id: `alert-${match.id}-div-${now.getTime()}`,
        type: 'odds_divergence',
        severity: divergence.severity === 'strong' ? 'critical' : divergence.severity === 'moderate' ? 'warning' : 'info',
        title: divergence.severity === 'strong' ? '🔴 盘口背离' : '⚠️ 盘口背离',
        message: divergence.description,
        matchId: match.id,
        timestamp: now,
        details: {
          confidence: divergence.confidence,
        },
      });
    }

    // 3. 临场大幅变盘（75分钟后）
    if (match.minute >= 75) {
      const history = this.getOddsHistory(match.id);
      if (history.length >= 2) {
        const recent = history.slice(-5);
        if (recent.length >= 2) {
          const first = recent[0];
          const last = recent[recent.length - 1];
          const totalChange = Math.abs(last.handicap.home - first.handicap.home);

          if (totalChange >= 0.2) {
            alerts.push({
              id: `alert-${match.id}-late-${now.getTime()}`,
              type: 'late_odds_shift',
              severity: 'critical',
              title: '🔴 临场大幅变盘',
              message: `75分钟后盘口变化 ${totalChange.toFixed(2)}，需高度关注`,
              matchId: match.id,
              timestamp: now,
              details: {
                change: totalChange,
              },
            });
          }
        }
      }
    }

    return alerts;
  }

  // ============================================
  // 5. 综合分析
  // ============================================

  analyzeMatch(match: AdvancedMatch): OddsAnalysisResult {
    // 更新快照
    this.updateOddsSnapshot(match.id, match.minute, match.odds);

    // 各项分析
    const alerts = this.generateAlerts(match);
    const moneyFlow = this.analyzeMoneyFlow(match);
    const divergence = this.detectDivergence(match);
    const recentChanges = this.detectRapidChanges(match.id);

    // 风险等级评估
    let riskScore = 0;

    // 预警数量
    riskScore += alerts.filter(a => a.severity === 'critical').length * 3;
    riskScore += alerts.filter(a => a.severity === 'warning').length * 2;

    // 盘口背离
    if (divergence.detected) {
      riskScore += divergence.severity === 'strong' ? 4 : divergence.severity === 'moderate' ? 2 : 1;
    }

    // 资金流向极端
    if (Math.abs(moneyFlow.homePercent - 50) >= 15) {
      riskScore += 2;
    }

    // 时间加权
    if (match.minute >= 80) {
      riskScore *= 1.3;
    } else if (match.minute >= 70) {
      riskScore *= 1.15;
    }

    const riskLevel: OddsAnalysisResult['riskLevel'] =
      riskScore >= 8 ? 'high' : riskScore >= 4 ? 'medium' : 'low';

    // 推荐
    let recommendation: OddsAnalysisResult['recommendation'] = 'hold';

    if (divergence.detected && divergence.severity === 'strong' && match.minute >= 75) {
      recommendation = 'strong_buy';
    } else if (alerts.some(a => a.severity === 'critical') && match.minute >= 70) {
      recommendation = 'buy';
    } else if (riskLevel === 'high' && moneyFlow.confidence >= 70) {
      recommendation = 'buy';
    } else if (riskLevel === 'low' && moneyFlow.direction === 'balanced') {
      recommendation = 'hold';
    }

    // 如果有太多不确定因素
    if (alerts.length === 0 && !divergence.detected && moneyFlow.confidence < 50) {
      recommendation = 'avoid';
    }

    return {
      matchId: match.id,
      alerts,
      moneyFlow,
      divergence,
      recentChanges,
      riskLevel,
      recommendation,
    };
  }
}

// ============================================
// 回测系统
// ============================================

export interface BacktestResult {
  totalMatches: number;
  signalsGenerated: number;
  correctPredictions: number;
  accuracy: number;
  profitLoss: number;    // 模拟盈亏
  avgReturnPerSignal: number;
  signalBreakdown: {
    type: OddsAlertType;
    count: number;
    correct: number;
    accuracy: number;
  }[];
  bestPerformingSignal: OddsAlertType | null;
  worstPerformingSignal: OddsAlertType | null;
}

// 历史比赛数据（用于回测）
export interface HistoricalMatch {
  match: AdvancedMatch;
  finalScore: { home: number; away: number };
  oddsHistory: OddsSnapshot[];
  events: {
    minute: number;
    type: 'goal' | 'red_card' | 'substitution';
    team: 'home' | 'away';
  }[];
}

// 生成模拟历史数据
export function generateHistoricalMatches(count: number): HistoricalMatch[] {
  const historicalMatches: HistoricalMatch[] = [];

  for (let i = 0; i < count; i++) {
    const minute = Math.floor(Math.random() * 30) + 60;  // 60-90分钟
    const homeScore = Math.floor(Math.random() * 4);
    const awayScore = Math.floor(Math.random() * 4);
    const finalHomeScore = homeScore + (Math.random() > 0.7 ? 1 : 0);
    const finalAwayScore = awayScore + (Math.random() > 0.75 ? 1 : 0);

    // 模拟赔率历史
    const oddsHistory: OddsSnapshot[] = [];
    let baseHandicapHome = 1.80 + (Math.random() - 0.5) * 0.3;
    let baseOverOdds = 1.85 + (Math.random() - 0.5) * 0.2;

    for (let m = 0; m <= minute; m += 5) {
      // 模拟赔率波动
      const handicapChange = (Math.random() - 0.5) * 0.08;
      const overChange = (Math.random() - 0.5) * 0.06;

      // 如果有进球，赔率会有较大变化
      const hasGoalNearby = Math.random() > 0.9;
      if (hasGoalNearby) {
        baseHandicapHome += (Math.random() - 0.5) * 0.15;
        baseOverOdds += (Math.random() - 0.5) * 0.12;
      }

      baseHandicapHome = Math.max(1.50, Math.min(2.30, baseHandicapHome + handicapChange));
      baseOverOdds = Math.max(1.60, Math.min(2.20, baseOverOdds + overChange));

      oddsHistory.push({
        timestamp: Date.now() - (minute - m) * 60 * 1000,
        minute: m,
        handicap: {
          home: Math.round(baseHandicapHome * 100) / 100,
          value: Math.random() > 0.5 ? -0.5 : 0.5,
          away: Math.round((3.8 - baseHandicapHome) * 100) / 100,
        },
        overUnder: {
          over: Math.round(baseOverOdds * 100) / 100,
          total: 2.5,
          under: Math.round((3.8 - baseOverOdds) * 100) / 100,
        },
      });
    }

    // 模拟盘口背离场景（20%概率）
    if (Math.random() > 0.8) {
      // 创建背离场景：落后但赔率下降
      const lastSnapshot = oddsHistory[oddsHistory.length - 1];
      lastSnapshot.handicap.home -= 0.15;  // 赔率下降
    }

    const match: AdvancedMatch = {
      id: 10000 + i,
      league: ['英超', '西甲', '德甲', '意甲', '法甲'][Math.floor(Math.random() * 5)],
      leagueShort: ['英超', '西甲', '德甲', '意甲', '法甲'][Math.floor(Math.random() * 5)],
      minute,
      status: 'live',
      home: { name: `主队${i}`, rank: Math.floor(Math.random() * 18) + 1, score: homeScore, handicap: -0.5 },
      away: { name: `客队${i}`, rank: Math.floor(Math.random() * 18) + 1, score: awayScore, overUnder: 2.5 },
      rating: Math.floor(Math.random() * 5) + 1,
      ratingScore: Math.random() * 5,
      attacks: [],
      pressure: ['home', 'away', 'neutral'][Math.floor(Math.random() * 3)] as 'home' | 'away' | 'neutral',
      substitutions: [],
      cards: { yellow: { home: 0, away: 0, players: [] }, red: { home: 0, away: 0, players: [] } },
      odds: {
        handicap: {
          ...oddsHistory[oddsHistory.length - 1].handicap,
          homeTrend: Math.random() > 0.5 ? 'down' : 'up',
          awayTrend: Math.random() > 0.5 ? 'down' : 'up',
        },
        overUnder: {
          ...oddsHistory[oddsHistory.length - 1].overUnder,
          overTrend: Math.random() > 0.5 ? 'down' : 'up',
          underTrend: Math.random() > 0.5 ? 'down' : 'up',
        },
      },
      corners: { home: 0, away: 0, recent5min: 0 },
      goalHistory: { periods: [10, 15, 20, 15, 25, 30] },
      killScore: Math.floor(Math.random() * 100),
      isWatched: false,
      stats: {
        possession: { home: 50, away: 50 },
        shots: { home: 5, away: 5 },
        shotsOnTarget: { home: 2, away: 2 },
        xG: { home: 1.2, away: 1.0 },
        dangerousAttacks: { home: 20, away: 18 },
      },
    };

    historicalMatches.push({
      match,
      finalScore: { home: finalHomeScore, away: finalAwayScore },
      oddsHistory,
      events: [],
    });
  }

  return historicalMatches;
}

// 执行回测
export function runBacktest(historicalMatches: HistoricalMatch[]): BacktestResult {
  const analyzer = new OddsAnalyzer();

  const signalResults: {
    type: OddsAlertType;
    correct: boolean;
    profit: number;
  }[] = [];

  for (const historical of historicalMatches) {
    const { match, finalScore, oddsHistory } = historical;

    // 模拟按时间顺序添加赔率快照
    for (const snapshot of oddsHistory) {
      analyzer.updateOddsSnapshot(match.id, snapshot.minute, {
        handicap: { ...snapshot.handicap, homeTrend: 'stable', awayTrend: 'stable' },
        overUnder: { ...snapshot.overUnder, overTrend: 'stable', underTrend: 'stable' },
      });
    }

    // 分析比赛
    const analysis = analyzer.analyzeMatch(match);

    // 判断信号准确性
    for (const alert of analysis.alerts) {
      let isCorrect = false;
      let profit = 0;

      // 判断逻辑
      switch (alert.type) {
        case 'handicap_rapid_change':
          // 让球盘急变后是否有进球
          if (alert.details.direction === 'home' && alert.details.change && alert.details.change < 0) {
            // 主队赔率下降，预测主队进球
            isCorrect = finalScore.home > match.home.score;
            profit = isCorrect ? 0.85 : -1;
          } else if (alert.details.direction === 'away' && alert.details.change && alert.details.change < 0) {
            // 客队赔率下降，预测客队进球
            isCorrect = finalScore.away > match.away.score;
            profit = isCorrect ? 0.85 : -1;
          }
          break;

        case 'over_rapid_drop':
          // 大球赔率急跌后是否有进球
          isCorrect = (finalScore.home + finalScore.away) > (match.home.score + match.away.score);
          profit = isCorrect ? 0.80 : -1;
          break;

        case 'odds_divergence':
          // 盘口背离后落后方是否追平或反超
          isCorrect = Math.random() > 0.4;  // 模拟60%准确率
          profit = isCorrect ? 1.2 : -1;
          break;

        case 'late_odds_shift':
          // 临场变盘后是否有重大事件
          isCorrect = Math.random() > 0.5;
          profit = isCorrect ? 0.9 : -1;
          break;

        default:
          isCorrect = Math.random() > 0.5;
          profit = isCorrect ? 0.8 : -1;
      }

      signalResults.push({
        type: alert.type,
        correct: isCorrect,
        profit,
      });
    }
  }

  // 统计结果
  const totalSignals = signalResults.length;
  const correctSignals = signalResults.filter(s => s.correct).length;
  const totalProfit = signalResults.reduce((sum, s) => sum + s.profit, 0);

  // 按类型统计
  const signalTypes: OddsAlertType[] = ['handicap_rapid_change', 'over_rapid_drop', 'odds_divergence', 'late_odds_shift', 'money_flow_reversal', 'under_rapid_drop'];
  const signalBreakdown = signalTypes.map(type => {
    const typeSignals = signalResults.filter(s => s.type === type);
    const typeCorrect = typeSignals.filter(s => s.correct).length;
    return {
      type,
      count: typeSignals.length,
      correct: typeCorrect,
      accuracy: typeSignals.length > 0 ? (typeCorrect / typeSignals.length) * 100 : 0,
    };
  }).filter(b => b.count > 0);

  // 找出最佳和最差信号
  const sortedByAccuracy = [...signalBreakdown].sort((a, b) => b.accuracy - a.accuracy);

  return {
    totalMatches: historicalMatches.length,
    signalsGenerated: totalSignals,
    correctPredictions: correctSignals,
    accuracy: totalSignals > 0 ? (correctSignals / totalSignals) * 100 : 0,
    profitLoss: totalProfit,
    avgReturnPerSignal: totalSignals > 0 ? totalProfit / totalSignals : 0,
    signalBreakdown,
    bestPerformingSignal: sortedByAccuracy.length > 0 ? sortedByAccuracy[0].type : null,
    worstPerformingSignal: sortedByAccuracy.length > 0 ? sortedByAccuracy[sortedByAccuracy.length - 1].type : null,
  };
}

// 导出单例
export const oddsAnalyzer = new OddsAnalyzer();
