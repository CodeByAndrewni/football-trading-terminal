// ============================================
// 赔率异动 Badge 组件
// 显示赔率变化趋势和异动标记
// Version: 1.0
// ============================================

import { useMemo } from 'react';
import { TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export interface OddsMovement {
  current: number;
  previous: number;
  history?: number[];  // 历史赔率数组 (用于 Sparkline)
  timestamp?: string;
}

export type MovementDirection = 'up' | 'down' | 'stable';

interface OddsMovementBadgeProps {
  movement: OddsMovement;
  type?: 'over' | 'under' | 'ah' | 'win';
  showSparkline?: boolean;
  showPercentage?: boolean;
  significantThreshold?: number;  // 异动阈值 (默认 5%)
  size?: 'sm' | 'md';
  className?: string;
}

// ============================================
// 工具函数
// ============================================

function getMovementDirection(current: number, previous: number): MovementDirection {
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

function getMovementPercent(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function isSignificantMovement(percent: number, threshold: number): boolean {
  return Math.abs(percent) >= threshold;
}

// ============================================
// 迷你 Sparkline (内嵌版)
// ============================================

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  direction: MovementDirection;
}

function MiniSparkline({
  data,
  width = 40,
  height = 14,
  direction,
}: MiniSparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.01;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  const color = direction === 'down' ? '#22c55e' : direction === 'up' ? '#ef4444' : '#6b7280';

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* 最后一个点 */}
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 2) - 1}
        r="2"
        fill={color}
      />
    </svg>
  );
}

// ============================================
// 主组件
// ============================================

export function OddsMovementBadge({
  movement,
  type = 'over',
  showSparkline = true,
  showPercentage = true,
  significantThreshold = 5,
  size = 'md',
  className = '',
}: OddsMovementBadgeProps) {
  const { current, previous, history } = movement;

  const direction = useMemo(
    () => getMovementDirection(current, previous),
    [current, previous]
  );

  const percentChange = useMemo(
    () => getMovementPercent(current, previous),
    [current, previous]
  );

  const isSignificant = useMemo(
    () => isSignificantMovement(percentChange, significantThreshold),
    [percentChange, significantThreshold]
  );

  // 颜色配置
  const colors = useMemo(() => {
    // 对于大球 (over)，赔率下降是利好 (绿色)
    // 对于小球 (under) 或亚盘，需要相反判断
    const isPositive = type === 'over'
      ? direction === 'down'
      : direction === 'up';

    if (direction === 'stable') {
      return {
        text: '#6b7280',
        bg: 'rgba(107, 114, 128, 0.1)',
        border: 'rgba(107, 114, 128, 0.3)',
      };
    }

    if (isPositive) {
      return {
        text: '#22c55e',
        bg: 'rgba(34, 197, 94, 0.1)',
        border: 'rgba(34, 197, 94, 0.3)',
      };
    }

    return {
      text: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.3)',
    };
  }, [direction, type]);

  // 方向图标
  const DirectionIcon = useMemo(() => {
    switch (direction) {
      case 'up':
        return TrendingUp;
      case 'down':
        return TrendingDown;
      default:
        return Minus;
    }
  }, [direction]);

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-[10px] gap-1'
    : 'px-2 py-1 text-xs gap-1.5';

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <div
      className={`
        inline-flex items-center rounded-md border
        transition-all duration-200
        ${sizeClasses}
        ${className}
      `}
      style={{
        color: colors.text,
        backgroundColor: colors.bg,
        borderColor: colors.border,
      }}
    >
      {/* Sparkline */}
      {showSparkline && history && history.length >= 2 && (
        <MiniSparkline
          data={history}
          direction={direction}
          width={size === 'sm' ? 30 : 40}
          height={size === 'sm' ? 10 : 14}
        />
      )}

      {/* 当前赔率 */}
      <span className="font-mono font-medium">
        {current.toFixed(2)}
      </span>

      {/* 方向图标 */}
      <DirectionIcon className={iconSize} />

      {/* 百分比变化 */}
      {showPercentage && direction !== 'stable' && (
        <span className="font-mono">
          {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
        </span>
      )}

      {/* 异动警告 */}
      {isSignificant && (
        <AlertTriangle
          className={`${iconSize} animate-pulse`}
          style={{ color: '#eab308' }}
        />
      )}
    </div>
  );
}

// ============================================
// 简化版赔率显示 (无 Sparkline)
// ============================================

interface SimpleOddsBadgeProps {
  odds: number;
  previousOdds?: number;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function SimpleOddsBadge({
  odds,
  previousOdds,
  label,
  size = 'md',
  className = '',
}: SimpleOddsBadgeProps) {
  const hasChange = previousOdds !== undefined && previousOdds !== odds;
  const direction = previousOdds !== undefined
    ? getMovementDirection(odds, previousOdds)
    : 'stable';

  const percentChange = previousOdds !== undefined
    ? getMovementPercent(odds, previousOdds)
    : 0;

  const color = direction === 'down'
    ? '#22c55e'
    : direction === 'up'
      ? '#ef4444'
      : '#888';

  const sizeClasses = size === 'sm'
    ? 'text-[10px]'
    : 'text-xs';

  return (
    <div className={`inline-flex items-center gap-1 ${sizeClasses} ${className}`}>
      {label && <span className="text-[#666]">{label}</span>}
      <span className="font-mono font-medium" style={{ color }}>
        {odds.toFixed(2)}
      </span>
      {hasChange && (
        <span className="font-mono" style={{ color }}>
          {percentChange > 0 ? '↑' : '↓'}
          {Math.abs(percentChange).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

// ============================================
// 赔率变化历史条
// ============================================

interface OddsHistoryBarProps {
  history: number[];
  label?: string;
  height?: number;
  className?: string;
}

export function OddsHistoryBar({
  history,
  label,
  height = 24,
  className = '',
}: OddsHistoryBarProps) {
  if (!history || history.length < 2) {
    return (
      <div className={`text-[10px] text-[#555] ${className}`}>
        {label && <span>{label}: </span>}
        无数据
      </div>
    );
  }

  const min = Math.min(...history);
  const max = Math.max(...history);
  const current = history[history.length - 1];
  const first = history[0];
  const percentChange = ((current - first) / first) * 100;

  const direction = getMovementDirection(current, first);
  const color = direction === 'down' ? '#22c55e' : direction === 'up' ? '#ef4444' : '#6b7280';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && (
        <span className="text-[10px] text-[#666] w-8">{label}</span>
      )}

      {/* Sparkline */}
      <div className="flex-1">
        <MiniSparkline
          data={history}
          direction={direction}
          width={60}
          height={height - 4}
        />
      </div>

      {/* 数值变化 */}
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-[#555]">{first.toFixed(2)}</span>
        <span style={{ color }}>→</span>
        <span className="font-medium" style={{ color }}>
          {current.toFixed(2)}
        </span>
        <span className="font-mono" style={{ color }}>
          ({percentChange > 0 ? '+' : ''}{percentChange.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}

// ============================================
// 异动警告 Badge
// ============================================

interface OddsAlertProps {
  type: 'significant_drop' | 'significant_rise' | 'rapid_change' | 'market_consensus';
  message?: string;
  className?: string;
}

export function OddsAlert({
  type,
  message,
  className = '',
}: OddsAlertProps) {
  const configs = {
    significant_drop: {
      label: '急跌',
      color: '#22c55e',
      bg: 'rgba(34, 197, 94, 0.15)',
      icon: TrendingDown,
    },
    significant_rise: {
      label: '急涨',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      icon: TrendingUp,
    },
    rapid_change: {
      label: '剧烈波动',
      color: '#eab308',
      bg: 'rgba(234, 179, 8, 0.15)',
      icon: AlertTriangle,
    },
    market_consensus: {
      label: '市场共识',
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.15)',
      icon: TrendingDown,
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
        ${className}
      `}
      style={{
        color: config.color,
        backgroundColor: config.bg,
      }}
      title={message}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}
