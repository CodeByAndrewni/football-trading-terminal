// ============================================
// 动态评分星级组件
// ============================================

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';
import type { ScoreResult, ScoringFactors } from '../../services/scoringEngine';

interface DynamicRatingProps {
  scoreResult: ScoreResult;
  showDetails?: boolean;
}

export function DynamicRating({ scoreResult, showDetails = false }: DynamicRatingProps) {
  const { totalScore, stars, recommendation, isStrongTeamBehind } = scoreResult;

  // 评分颜色
  const getScoreColor = () => {
    if (totalScore >= 80) return 'text-accent-danger';
    if (totalScore >= 60) return 'text-accent-warning';
    if (totalScore >= 40) return 'text-accent-success';
    return 'text-text-muted';
  };

  // 星级渲染
  const renderStars = () => {
    const starElements = [];
    for (let i = 1; i <= 5; i++) {
      const isFilled = i <= stars;
      starElements.push(
        <span
          key={i}
          className={`text-sm transition-all duration-300 ${
            isFilled
              ? stars >= 4
                ? 'text-accent-danger animate-pulse'
                : 'text-accent-warning'
              : 'text-text-muted/30'
          }`}
        >
          ★
        </span>
      );
    }
    return starElements;
  };

  return (
    <div className="flex items-center gap-2">
      {/* 星级 */}
      <div className="flex items-center">
        {renderStars()}
      </div>

      {/* 评分数字 */}
      <span className={`font-mono text-xs font-bold ${getScoreColor()}`}>
        {totalScore}
      </span>

      {/* 强队落后标记 */}
      {isStrongTeamBehind && (
        <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-accent-danger/20 text-accent-danger text-[10px]">
          <Zap className="w-3 h-3" />
        </span>
      )}

      {/* 详情展示 */}
      {showDetails && (
        <FactorBreakdown factors={scoreResult.factors} />
      )}
    </div>
  );
}

// 因子分解组件
function FactorBreakdown({ factors }: { factors: ScoringFactors }) {
  const factorList = [
    { label: '比分', value: factors.scoreFactor.score, max: 25 },
    { label: '进攻', value: factors.attackFactor.score, max: 30 },
    { label: '动量', value: factors.momentumFactor.score, max: 35 },
    { label: '历史', value: factors.historyFactor.score, max: 25 },
    { label: '特殊', value: factors.specialFactor.score + 20, max: 40 }, // 特殊因子可为负，加偏移
  ];

  return (
    <div className="absolute top-full left-0 mt-2 p-3 bg-bg-card border border-border-default rounded-lg shadow-xl z-50 min-w-[200px]">
      <p className="text-xs text-text-muted mb-2">评分因子分解</p>
      <div className="space-y-1.5">
        {factorList.map(({ label, value, max }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-text-secondary w-8">{label}</span>
            <div className="flex-1 h-1 bg-bg-component rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-full"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-text-muted">{value}/{max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 紧凑版评分显示
export function CompactRating({ scoreResult }: { scoreResult: ScoreResult }) {
  const { totalScore, stars, isStrongTeamBehind } = scoreResult;

  const getScoreStyle = () => {
    if (totalScore >= 80) return 'bg-accent-danger/20 text-accent-danger border-accent-danger/30';
    if (totalScore >= 60) return 'bg-accent-warning/20 text-accent-warning border-accent-warning/30';
    if (totalScore >= 40) return 'bg-accent-success/20 text-accent-success border-accent-success/30';
    return 'bg-bg-component text-text-muted border-border-default';
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* 星级紧凑显示 */}
      <div className="flex">
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            className={`text-[10px] ${
              i <= stars
                ? stars >= 4 ? 'text-accent-danger' : 'text-accent-warning'
                : 'text-text-muted/20'
            }`}
          >
            ★
          </span>
        ))}
      </div>

      {/* 评分徽章 */}
      <span className={`inline-flex items-center justify-center min-w-[32px] px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${getScoreStyle()}`}>
        {totalScore}
      </span>

      {/* 强队落后闪电标记 */}
      {isStrongTeamBehind && (
        <Zap className="w-3 h-3 text-accent-danger animate-pulse" />
      )}
    </div>
  );
}

// 评分趋势指示器
export function ScoreTrend({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;

  if (Math.abs(diff) < 3) {
    return <Minus className="w-3 h-3 text-text-muted" />;
  }

  if (diff > 0) {
    return (
      <div className="flex items-center gap-0.5 text-accent-success">
        <TrendingUp className="w-3 h-3" />
        <span className="text-[10px] font-mono">+{diff}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 text-accent-danger">
      <TrendingDown className="w-3 h-3" />
      <span className="text-[10px] font-mono">{diff}</span>
    </div>
  );
}

// 预警徽章
export function AlertBadge({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-danger/20 text-accent-danger text-[10px] font-bold animate-pulse">
        {alerts.length}
      </span>
    </div>
  );
}
