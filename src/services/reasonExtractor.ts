// ============================================
// 理由提取器：Top3 + 具体数值
// Version: 139
// ============================================

import type { ScoreResult } from './scoringEngine';
import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================
// 类型定义
// ============================================

export interface ReasonItem {
  icon: string;
  label: string;
  score: number;
  detail: string;
  priority: number;
}

// ============================================
// 理由提取
// ============================================

/**
 * 提取评分原因，带具体数值
 * 按优先级排序，返回 Top3
 */
export function extractReasonsWithDetails(
  scoreResult: ScoreResult,
  match: AdvancedMatch
): ReasonItem[] {
  const reasons: ReasonItem[] = [];
  const factors = scoreResult.factors;
  const stats = match.stats;

  // 1. 攻势压制
  if (factors.attackFactor.score >= 12) {
    const shotsHome = stats?.shotsOnTarget?.home ?? 0;
    const shotsAway = stats?.shotsOnTarget?.away ?? 0;

    reasons.push({
      icon: '🎯',
      label: '攻势压制',
      score: factors.attackFactor.score,
      detail: `射正 ${shotsHome}-${shotsAway}`,
      priority: factors.attackFactor.score,
    });
  }

  // 2. 动量爆发
  if (factors.momentumFactor.score >= 15) {
    // 使用 stats 中的近期射门数据
    const recentShots = stats?.recentShots20min ?? 0;

    reasons.push({
      icon: '🔥',
      label: '动量爆发',
      score: factors.momentumFactor.score,
      detail: recentShots > 0 ? `近期 ${recentShots}射` : '攻势上升',
      priority: factors.momentumFactor.score + 5, // 动量权重高
    });
  }

  // 3. xG欠债
  if (factors.historyFactor.score >= 12) {
    const xgHome = stats?.xG?.home ?? 0;
    const xgAway = stats?.xG?.away ?? 0;
    const totalXg = xgHome + xgAway;
    const actualGoals = match.home.score + match.away.score;
    const debt = totalXg - actualGoals;

    if (debt > 0.3) {
      reasons.push({
        icon: '📊',
        label: 'xG欠债',
        score: factors.historyFactor.score,
        detail: `xG ${totalXg.toFixed(1)} 仅${actualGoals}球`,
        priority: factors.historyFactor.score + 3,
      });
    }
  }

  // 4. 比分状态
  if (factors.scoreFactor.score >= 10) {
    const scoreDiff = match.home.score - match.away.score;
    let label: string;
    let icon: string;

    if (scoreDiff < 0) {
      label = '落后追赶';
      icon = '💪';
    } else if (scoreDiff > 0) {
      label = '比分领先';
      icon = '✅';
    } else {
      label = '平局僵持';
      icon = '⚖️';
    }

    reasons.push({
      icon,
      label,
      score: factors.scoreFactor.score,
      detail: `${match.home.score}-${match.away.score}`,
      priority: factors.scoreFactor.score,
    });
  }

  // 5. 强队落后
  if (scoreResult.isStrongTeamBehind) {
    const homeRank = match.home.rank ?? 10;
    const awayRank = match.away.rank ?? 10;
    const rankDiff = Math.abs(homeRank - awayRank);

    reasons.push({
      icon: '🏆',
      label: '强队落后',
      score: 15,
      detail: rankDiff > 0 ? `排名差${rankDiff}` : '实力占优',
      priority: 20, // 高权重
    });
  }

  // 6. 赔率支持（仅真实赔率时）
  if (factors.oddsFactor?.dataAvailable && factors.oddsFactor.score >= 8) {
    reasons.push({
      icon: '💰',
      label: '赔率支持',
      score: factors.oddsFactor.score,
      detail: '盘口下探',
      priority: factors.oddsFactor.score,
    });
  }

  // 7. 末段时间
  if (match.minute >= 80) {
    const remaining = Math.max(0, 90 - match.minute + 5);
    reasons.push({
      icon: '⏱️',
      label: '末段冲刺',
      score: 8,
      detail: `剩${remaining}分钟`,
      priority: 10,
    });
  }

  // 8. 角球优势（从 match.corners 获取）
  const cornersHome = match.corners?.home ?? 0;
  const cornersAway = match.corners?.away ?? 0;
  const cornerDiff = cornersHome - cornersAway;
  if (Math.abs(cornerDiff) >= 4) {
    reasons.push({
      icon: '🚩',
      label: '角球优势',
      score: 6,
      detail: `角球 ${cornersHome}-${cornersAway}`,
      priority: 6,
    });
  }

  // 按优先级排序，取 Top3
  return reasons
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
}

/**
 * 获取理由标签列表（纯文本）
 */
export function getReasonLabels(reasons: ReasonItem[]): string[] {
  return reasons.map(r => r.label);
}
