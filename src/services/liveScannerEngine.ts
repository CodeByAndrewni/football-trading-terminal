/**
 * Live Scanner Engine - 结构失衡扫描器 v1
 *
 * Phase 2 核心模块：
 * - 计算结构失衡/攻势指标
 * - 实现 5 条 MVP 筛选规则
 * - 计算 imbalanceScore 综合评分
 *
 * 筛选规则 MVP (v1):
 * 1. 比赛分钟 minute >= 75 (或可配置)
 * 2. 分差 goalDiff <= 1
 * 3. xgDiff >= 0.5 (或攻势评分替代)
 * 4. shotsDiff >= 5
 * 5. recent10MinActivity (近10分钟活跃度)
 */

// ============================================
// 类型定义
// ============================================

/**
 * 筛选配置
 */
export interface ScannerFilterConfig {
  // 时间条件
  minMinute: number;           // 最小分钟数 (默认: 75)
  maxMinute: number;           // 最大分钟数 (默认: 90)

  // 比分条件
  maxGoalDiff: number;         // 最大分差 (默认: 1)
  allowDraw: boolean;          // 是否包含平局 (默认: true)

  // 攻势条件
  minXgDiff: number;           // 最小 xG 差 (默认: 0.5)
  minShotsDiff: number;        // 最小射门差 (默认: 5)
  minShotsOnTargetDiff: number; // 最小射正差 (默认: 2)

  // 近期活跃度
  minRecentShots: number;      // 近期最小射门数 (默认: 3)

  // 其他开关
  requireRealData: boolean;    // 是否要求真实数据 (默认: true)
  includeHalfTime: boolean;    // 是否包含中场休息 (默认: false)
}

/**
 * 扫描结果
 */
export interface ScannerResult {
  // 匹配状态
  isMatch: boolean;            // 是否符合筛选条件
  matchedRules: string[];      // 匹配的规则列表
  failedRules: string[];       // 不匹配的规则列表

  // 评分
  imbalanceScore: number;      // 综合失衡评分 (0-100)
  attackingTeam: 'home' | 'away' | 'balanced';  // 进攻主导方

  // 指标详情
  metrics: ImbalanceMetrics;

  // 推荐
  recommendation: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
  reasons: string[];
}

/**
 * 失衡指标（与后端 aggregator.ts 保持一致）
 */
export interface ImbalanceMetrics {
  shotsDiff: number;           // 主队射门 - 客队射门
  shotsOnTargetDiff: number;   // 射正差
  xgDiff: number;              // xG 差
  cornersDiff: number;         // 角球差
  possessionDiff: number;      // 控球差
  imbalanceScore: number;      // 综合失衡评分
  attackingTeam: 'home' | 'away' | 'balanced';
}

/**
 * 比赛事件（简化版）
 */
export interface MatchEventInput {
  minute: number;
  type: string;  // 'Goal', 'shot', 'corner', etc.
  team?: 'home' | 'away';
}

/**
 * 比赛数据输入（简化版，从 AdvancedMatch 提取）
 */
export interface MatchInput {
  id: number;
  minute: number;
  status: string;
  homeScore: number;
  awayScore: number;
  stats?: {
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    corners: { home: number; away: number };
    possession: { home: number; away: number };
    xG: { home: number; away: number };
    _realDataAvailable?: boolean;
    // Phase 2: 近期射门统计（如果已预计算）
    recentShots20min?: number;
  } | null;
  imbalance?: ImbalanceMetrics;
  // Phase 2: 事件列表（用于估算近10分钟活跃度）
  events?: MatchEventInput[];
}

// ============================================
// 默认配置
// ============================================

export const DEFAULT_SCANNER_CONFIG: ScannerFilterConfig = {
  minMinute: 75,
  maxMinute: 90,
  maxGoalDiff: 1,
  allowDraw: true,
  minXgDiff: 0.5,
  minShotsDiff: 5,
  minShotsOnTargetDiff: 2,
  minRecentShots: 3,
  requireRealData: true,
  includeHalfTime: false,
};

// ============================================
// 核心扫描逻辑
// ============================================

/**
 * 扫描单场比赛
 */
export function scanMatch(
  match: MatchInput,
  config: Partial<ScannerFilterConfig> = {}
): ScannerResult {
  const cfg = { ...DEFAULT_SCANNER_CONFIG, ...config };
  const matchedRules: string[] = [];
  const failedRules: string[] = [];
  const reasons: string[] = [];

  // 计算指标
  const metrics = match.imbalance || calculateImbalanceMetrics(match);

  // === 规则 1: 时间条件 ===
  const isInTimeWindow = match.minute >= cfg.minMinute && match.minute <= cfg.maxMinute;
  const isHalfTime = match.status === 'ht';
  const timeOK = isInTimeWindow || (cfg.includeHalfTime && isHalfTime);

  if (timeOK) {
    matchedRules.push('TIME_WINDOW');
    reasons.push(`${match.minute}'分钟 (${cfg.minMinute}'-${cfg.maxMinute}')`);
  } else {
    failedRules.push('TIME_WINDOW');
  }

  // === 规则 2: 分差条件 ===
  const goalDiff = Math.abs(match.homeScore - match.awayScore);
  const isDraw = match.homeScore === match.awayScore;
  const goalDiffOK = goalDiff <= cfg.maxGoalDiff && (cfg.allowDraw || !isDraw);

  if (goalDiffOK) {
    matchedRules.push('GOAL_DIFF');
    if (isDraw) {
      reasons.push(`平局 ${match.homeScore}-${match.awayScore}`);
    } else {
      reasons.push(`分差仅${goalDiff}球 (${match.homeScore}-${match.awayScore})`);
    }
  } else {
    failedRules.push('GOAL_DIFF');
  }

  // === 规则 3: xG 差条件 ===
  const absXgDiff = Math.abs(metrics.xgDiff);
  const xgDiffOK = absXgDiff >= cfg.minXgDiff;

  if (xgDiffOK) {
    matchedRules.push('XG_DIFF');
    const xgLeader = metrics.xgDiff > 0 ? '主队' : '客队';
    reasons.push(`${xgLeader}xG优势 +${absXgDiff.toFixed(2)}`);
  } else {
    failedRules.push('XG_DIFF');
  }

  // === 规则 4: 射门差条件 ===
  const absShotsDiff = Math.abs(metrics.shotsDiff);
  const shotsDiffOK = absShotsDiff >= cfg.minShotsDiff;

  if (shotsDiffOK) {
    matchedRules.push('SHOTS_DIFF');
    const shotsLeader = metrics.shotsDiff > 0 ? '主队' : '客队';
    reasons.push(`${shotsLeader}射门优势 +${absShotsDiff}`);
  } else {
    failedRules.push('SHOTS_DIFF');
  }

  // === 规则 5: 射正差条件 ===
  const absSOTDiff = Math.abs(metrics.shotsOnTargetDiff);
  const sotDiffOK = absSOTDiff >= cfg.minShotsOnTargetDiff;

  if (sotDiffOK) {
    matchedRules.push('SOT_DIFF');
    const sotLeader = metrics.shotsOnTargetDiff > 0 ? '主队' : '客队';
    reasons.push(`${sotLeader}射正优势 +${absSOTDiff}`);
  } else {
    failedRules.push('SOT_DIFF');
  }

  // === 数据质量检查 ===
  const hasRealData = match.stats?._realDataAvailable !== false;
  if (cfg.requireRealData && !hasRealData) {
    failedRules.push('REAL_DATA');
  } else if (hasRealData) {
    matchedRules.push('REAL_DATA');
  }

  // === 计算是否匹配 ===
  // MVP v1: 要求满足 时间 + 分差 + (xG差 或 射门差)
  const coreConditionsMet = timeOK && goalDiffOK && (xgDiffOK || shotsDiffOK);
  const isMatch = coreConditionsMet && (!cfg.requireRealData || hasRealData);

  // === 推荐等级 ===
  let recommendation: ScannerResult['recommendation'] = 'NONE';
  if (isMatch) {
    const matchCount = matchedRules.length;
    if (matchCount >= 5) {
      recommendation = 'STRONG';
    } else if (matchCount >= 4) {
      recommendation = 'MODERATE';
    } else if (matchCount >= 3) {
      recommendation = 'WEAK';
    }
  }

  return {
    isMatch,
    matchedRules,
    failedRules,
    imbalanceScore: metrics.imbalanceScore,
    attackingTeam: metrics.attackingTeam,
    metrics,
    recommendation,
    reasons,
  };
}

/**
 * 批量扫描比赛列表
 */
export function scanMatches(
  matches: MatchInput[],
  config: Partial<ScannerFilterConfig> = {}
): Array<{ match: MatchInput; result: ScannerResult }> {
  return matches
    .map(match => ({
      match,
      result: scanMatch(match, config),
    }))
    .sort((a, b) => {
      // 优先排序: 匹配的在前，然后按 imbalanceScore 降序
      if (a.result.isMatch && !b.result.isMatch) return -1;
      if (!a.result.isMatch && b.result.isMatch) return 1;
      return b.result.imbalanceScore - a.result.imbalanceScore;
    });
}

/**
 * 获取符合条件的比赛
 */
export function getMatchingMatches(
  matches: MatchInput[],
  config: Partial<ScannerFilterConfig> = {}
): Array<{ match: MatchInput; result: ScannerResult }> {
  return scanMatches(matches, config).filter(item => item.result.isMatch);
}

// ============================================
// 指标计算
// ============================================

/**
 * 计算失衡指标（从 MatchInput 计算）
 */
export function calculateImbalanceMetrics(match: MatchInput): ImbalanceMetrics {
  const stats = match.stats;

  if (!stats) {
    return {
      shotsDiff: 0,
      shotsOnTargetDiff: 0,
      xgDiff: 0,
      cornersDiff: 0,
      possessionDiff: 0,
      imbalanceScore: 0,
      attackingTeam: 'balanced',
    };
  }

  const shotsDiff = stats.shots.home - stats.shots.away;
  const shotsOnTargetDiff = stats.shotsOnTarget.home - stats.shotsOnTarget.away;
  const xgDiff = stats.xG.home - stats.xG.away;
  const cornersDiff = stats.corners.home - stats.corners.away;
  const possessionDiff = stats.possession.home - stats.possession.away;

  // 综合失衡评分 (0-100)
  // 权重: 射门差 30%, 射正差 25%, xG差 25%, 角球差 10%, 控球差 10%
  const absScore = (
    Math.abs(shotsDiff) * 3 +
    Math.abs(shotsOnTargetDiff) * 5 +
    Math.abs(xgDiff) * 25 +
    Math.abs(cornersDiff) * 2 +
    Math.abs(possessionDiff) * 0.5
  );
  const imbalanceScore = Math.min(100, Math.round(absScore));

  // 判断进攻主导方
  let attackingTeam: 'home' | 'away' | 'balanced' = 'balanced';
  if (shotsDiff >= 5 || xgDiff >= 0.5) {
    attackingTeam = 'home';
  } else if (shotsDiff <= -5 || xgDiff <= -0.5) {
    attackingTeam = 'away';
  }

  return {
    shotsDiff,
    shotsOnTargetDiff,
    xgDiff,
    cornersDiff,
    possessionDiff,
    imbalanceScore,
    attackingTeam,
  };
}

/**
 * 估算近10分钟射门数
 *
 * 实现方案说明:
 * 由于 API-Football 的 statistics 端点只返回全场累计数据，不提供分时段统计，
 * 我们采用以下估算方法：
 *
 * 方法1（优先）: 如果有 events 数据，计算近10分钟内的 Goal 事件数量
 * - 进球事件通常伴随多次射门，按 1进球 ≈ 3-4次射门估算
 * - 此方法准确度受限于事件数据的完整性
 *
 * 方法2（备用）: 如果有 recentShots20min 预计算字段，取一半作为近10分钟估算
 *
 * 方法3（兜底）: 使用全场射门数按比例估算
 * - 假设射门均匀分布，近10分钟占比 = 10 / minute
 * - 但实际上75+分钟射门密度通常高于平均
 *
 * 局限性:
 * - 无法精确获取分时段射门数据
 * - 事件数据可能不包含所有射门（只有进球会被记录）
 * - 估算结果仅供参考，真实精度有限
 */
export function estimateRecent10MinShots(match: MatchInput): number {
  const currentMinute = match.minute;

  if (currentMinute < 10) {
    // 比赛刚开始，返回全场射门
    return (match.stats?.shots?.home ?? 0) + (match.stats?.shots?.away ?? 0);
  }

  // 方法1: 使用事件数据估算
  if (match.events && match.events.length > 0) {
    const windowStart = currentMinute - 10;
    const recentEvents = match.events.filter(e =>
      e.minute >= windowStart && e.minute <= currentMinute
    );

    // 计算近10分钟进球数
    const recentGoals = recentEvents.filter(e =>
      e.type.toLowerCase() === 'goal' || e.type === 'Goal'
    ).length;

    // 如果有进球，按 1进球 ≈ 4射门估算
    // 如果无进球，按事件活跃度估算（每个事件 ≈ 0.5 射门）
    if (recentGoals > 0) {
      return recentGoals * 4;
    }

    // 其他事件类型可能包含角球、换人等，不直接计入射门
    // 返回基于全场数据的保守估算
  }

  // 方法2: 使用预计算的 recentShots20min
  if (match.stats?.recentShots20min !== undefined && match.stats.recentShots20min > 0) {
    return Math.round(match.stats.recentShots20min / 2);
  }

  // 方法3: 基于全场数据按比例估算
  const totalShots = (match.stats?.shots?.home ?? 0) + (match.stats?.shots?.away ?? 0);
  if (totalShots === 0) return 0;

  // 75+分钟阶段射门密度通常更高，给予 1.3 倍权重
  const baseRatio = 10 / currentMinute;
  const lateGameMultiplier = currentMinute >= 75 ? 1.3 : 1.0;

  return Math.round(totalShots * baseRatio * lateGameMultiplier);
}

/**
 * 估算近10分钟活跃度评分 (0-100)
 * 综合考虑射门、进球、角球等活动
 */
export function estimateRecent10MinActivity(match: MatchInput): {
  activityScore: number;
  estimatedShots: number;
  recentGoals: number;
  isActive: boolean;
} {
  const estimatedShots = estimateRecent10MinShots(match);
  const currentMinute = match.minute;

  // 计算近10分钟进球数
  let recentGoals = 0;
  if (match.events && match.events.length > 0) {
    const windowStart = currentMinute - 10;
    recentGoals = match.events.filter(e =>
      e.minute >= windowStart &&
      e.minute <= currentMinute &&
      (e.type.toLowerCase() === 'goal' || e.type === 'Goal')
    ).length;
  }

  // 活跃度评分
  // - 近10分钟有进球: +30分
  // - 每次射门: +8分 (最多40分)
  // - 高射门频率: 额外加分
  let activityScore = 0;

  activityScore += recentGoals * 30; // 进球加分
  activityScore += Math.min(estimatedShots * 8, 40); // 射门加分

  // 射门频率奖励（超过4次/10分钟）
  if (estimatedShots >= 6) {
    activityScore += 20;
  } else if (estimatedShots >= 4) {
    activityScore += 10;
  }

  activityScore = Math.min(100, activityScore);

  return {
    activityScore,
    estimatedShots,
    recentGoals,
    isActive: activityScore >= 30,
  };
}

/**
 * 计算攻势评分（xG + 射门综合）
 * 用于没有 xG 数据时的替代指标
 */
export function calculateAttackScore(match: MatchInput): {
  home: number;
  away: number;
  diff: number;
} {
  const stats = match.stats;

  if (!stats) {
    return { home: 0, away: 0, diff: 0 };
  }

  // 攻势评分公式:
  // = xG * 30 + 射门数 * 2 + 射正数 * 3 + 角球数 * 1
  const calcScore = (side: 'home' | 'away') => {
    const xg = stats.xG[side] || 0;
    const shots = stats.shots[side] || 0;
    const sot = stats.shotsOnTarget[side] || 0;
    const corners = stats.corners[side] || 0;
    return xg * 30 + shots * 2 + sot * 3 + corners * 1;
  };

  const home = Math.round(calcScore('home'));
  const away = Math.round(calcScore('away'));

  return {
    home,
    away,
    diff: home - away,
  };
}

// ============================================
// 辅助函数
// ============================================

/**
 * 获取推荐等级的颜色
 */
export function getRecommendationColor(rec: ScannerResult['recommendation']): string {
  switch (rec) {
    case 'STRONG':
      return '#ef4444'; // red
    case 'MODERATE':
      return '#f97316'; // orange
    case 'WEAK':
      return '#eab308'; // yellow
    default:
      return '#6b7280'; // gray
  }
}

/**
 * 获取推荐等级的中文标签
 */
export function getRecommendationLabel(rec: ScannerResult['recommendation']): string {
  switch (rec) {
    case 'STRONG':
      return '强烈推荐';
    case 'MODERATE':
      return '中等推荐';
    case 'WEAK':
      return '轻度关注';
    default:
      return '不推荐';
  }
}

/**
 * 格式化失衡指标显示
 */
export function formatImbalanceMetrics(metrics: ImbalanceMetrics): string {
  const parts: string[] = [];

  if (Math.abs(metrics.shotsDiff) > 0) {
    const sign = metrics.shotsDiff > 0 ? '+' : '';
    parts.push(`射门${sign}${metrics.shotsDiff}`);
  }

  if (Math.abs(metrics.xgDiff) > 0.1) {
    const sign = metrics.xgDiff > 0 ? '+' : '';
    parts.push(`xG${sign}${metrics.xgDiff.toFixed(2)}`);
  }

  if (Math.abs(metrics.cornersDiff) > 0) {
    const sign = metrics.cornersDiff > 0 ? '+' : '';
    parts.push(`角球${sign}${metrics.cornersDiff}`);
  }

  return parts.join(' | ') || '无明显失衡';
}

// ============================================
// 预设筛选配置
// ============================================

/**
 * 晚期进球猎手配置（75分钟+）
 */
export const LATE_GOAL_HUNTER_CONFIG: Partial<ScannerFilterConfig> = {
  minMinute: 75,
  maxMinute: 90,
  maxGoalDiff: 1,
  minXgDiff: 0.3,
  minShotsDiff: 4,
  minShotsOnTargetDiff: 2,
};

/**
 * 下半场结构失衡配置（55分钟+）
 */
export const SECOND_HALF_IMBALANCE_CONFIG: Partial<ScannerFilterConfig> = {
  minMinute: 55,
  maxMinute: 90,
  maxGoalDiff: 2,
  minXgDiff: 0.5,
  minShotsDiff: 5,
  minShotsOnTargetDiff: 3,
};

/**
 * 宽松扫描配置（发现更多机会）
 */
export const RELAXED_SCAN_CONFIG: Partial<ScannerFilterConfig> = {
  minMinute: 60,
  maxMinute: 90,
  maxGoalDiff: 2,
  minXgDiff: 0.3,
  minShotsDiff: 3,
  minShotsOnTargetDiff: 1,
  requireRealData: false,
};
