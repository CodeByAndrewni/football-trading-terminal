// ============================================
// 场景标签组件 - 晚期模块场景显示
// Version: 1.0
// ============================================

import { useMemo } from 'react';
import {
  Zap, Target, Shield, Flame, BarChart3, Scale, Clock
} from 'lucide-react';

// ============================================
// 类型定义
// ============================================

export type ScenarioTagType =
  | 'OVER_SPRINT'      // 大球冲刺
  | 'STRONG_BEHIND'    // 强队追分
  | 'DEADLOCK_BREAK'   // 破僵局
  | 'WEAK_DEFEND'      // 弱队守成
  | 'BLOWOUT'          // 大比分
  | 'BALANCED_LATE';   // 均势末段

interface ScenarioConfig {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  description: string;
}

// ============================================
// 场景配置
// ============================================

const SCENARIO_CONFIGS: Record<ScenarioTagType, ScenarioConfig> = {
  OVER_SPRINT: {
    label: '大球冲刺',
    shortLabel: '大球',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
    icon: <Zap className="w-3.5 h-3.5" />,
    description: 'xG高于实际进球，射门活跃',
  },
  STRONG_BEHIND: {
    label: '强队追分',
    shortLabel: '追分',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.12)',
    borderColor: 'rgba(249, 115, 22, 0.4)',
    icon: <Flame className="w-3.5 h-3.5" />,
    description: '强队落后或逼平，反扑动力强',
  },
  DEADLOCK_BREAK: {
    label: '破僵局',
    shortLabel: '僵局',
    color: '#eab308',
    bgColor: 'rgba(234, 179, 8, 0.12)',
    borderColor: 'rgba(234, 179, 8, 0.4)',
    icon: <Target className="w-3.5 h-3.5" />,
    description: '0-0或低进球僵持，进球压力大',
  },
  WEAK_DEFEND: {
    label: '弱队守成',
    shortLabel: '守成',
    color: '#6366f1',
    bgColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.4)',
    icon: <Shield className="w-3.5 h-3.5" />,
    description: '弱队领先，防守态势明显',
  },
  BLOWOUT: {
    label: '大比分',
    shortLabel: '大分',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.12)',
    borderColor: 'rgba(107, 114, 128, 0.4)',
    icon: <BarChart3 className="w-3.5 h-3.5" />,
    description: '3球以上差距，信号减弱',
  },
  BALANCED_LATE: {
    label: '均势末段',
    shortLabel: '均势',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.12)',
    borderColor: 'rgba(6, 182, 212, 0.4)',
    icon: <Scale className="w-3.5 h-3.5" />,
    description: '双方势均力敌，无明显优势',
  },
};

// ============================================
// 组件属性
// ============================================

interface ScenarioTagProps {
  scenario: ScenarioTagType;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showDescription?: boolean;
  isWarmup?: boolean;
  animate?: boolean;
  className?: string;
}

// ============================================
// 主组件
// ============================================

export function ScenarioTag({
  scenario,
  size = 'md',
  showIcon = true,
  showDescription = false,
  isWarmup = false,
  animate = false,
  className = '',
}: ScenarioTagProps) {
  const config = SCENARIO_CONFIGS[scenario];

  const sizeClasses = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'px-1.5 py-0.5 text-[10px] gap-1';
      case 'lg':
        return 'px-3 py-1.5 text-sm gap-2';
      default:
        return 'px-2 py-1 text-xs gap-1.5';
    }
  }, [size]);

  const iconSize = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'w-3 h-3';
      case 'lg':
        return 'w-4 h-4';
      default:
        return 'w-3.5 h-3.5';
    }
  }, [size]);

  // 预热模式样式调整
  const warmupStyles = isWarmup ? {
    opacity: 0.75,
    filter: 'saturate(0.7)',
  } : {};

  return (
    <div className={`relative inline-flex flex-col ${className}`}>
      <span
        className={`
          inline-flex items-center font-medium rounded-md border
          transition-all duration-200
          ${sizeClasses}
          ${animate && scenario !== 'BLOWOUT' ? 'animate-pulse' : ''}
        `}
        style={{
          color: config.color,
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
          ...warmupStyles,
        }}
      >
        {showIcon && (
          <span className={iconSize} style={{ color: config.color }}>
            {config.icon}
          </span>
        )}
        <span>{size === 'sm' ? config.shortLabel : config.label}</span>

        {/* 预热标记 */}
        {isWarmup && (
          <span
            className="ml-1 px-1 py-0.5 rounded text-[9px] font-semibold"
            style={{
              backgroundColor: 'rgba(234, 179, 8, 0.2)',
              color: '#eab308',
            }}
          >
            预热
          </span>
        )}
      </span>

      {/* 描述文字 */}
      {showDescription && (
        <span
          className="mt-1 text-[10px] max-w-32"
          style={{ color: '#888' }}
        >
          {config.description}
        </span>
      )}
    </div>
  );
}

// ============================================
// 紧凑版场景标签 (用于表格)
// ============================================

interface CompactScenarioTagProps {
  scenario: ScenarioTagType;
  isWarmup?: boolean;
  className?: string;
}

export function CompactScenarioTag({
  scenario,
  isWarmup = false,
  className = '',
}: CompactScenarioTagProps) {
  const config = SCENARIO_CONFIGS[scenario];

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
        ${className}
      `}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        opacity: isWarmup ? 0.7 : 1,
      }}
      title={`${config.label}${isWarmup ? ' (预热)' : ''}: ${config.description}`}
    >
      {config.icon}
      {config.shortLabel}
      {isWarmup && (
        <Clock className="w-2.5 h-2.5 text-[#eab308]" />
      )}
    </span>
  );
}

// ============================================
// 场景标签组 (显示多个标签)
// ============================================

interface ScenarioTagGroupProps {
  tags: string[];
  maxShow?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function ScenarioTagGroup({
  tags,
  maxShow = 3,
  size = 'sm',
  className = '',
}: ScenarioTagGroupProps) {
  const scenarioTags = tags.filter(tag =>
    Object.keys(SCENARIO_CONFIGS).includes(tag)
  ) as ScenarioTagType[];

  const isWarmup = tags.includes('WARMUP');
  const displayTags = scenarioTags.slice(0, maxShow);
  const remaining = scenarioTags.length - maxShow;

  if (displayTags.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {displayTags.map(tag => (
        <ScenarioTag
          key={tag}
          scenario={tag}
          size={size}
          isWarmup={isWarmup}
          showIcon={size !== 'sm'}
        />
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-[#666]">+{remaining}</span>
      )}
    </div>
  );
}

// ============================================
// 信号强度指示器
// ============================================

interface SignalStrengthIndicatorProps {
  score: number;
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SignalStrengthIndicator({
  score,
  confidence,
  size = 'md',
  className = '',
}: SignalStrengthIndicatorProps) {
  const getScoreColor = (s: number) => {
    if (s >= 85) return '#ef4444';
    if (s >= 70) return '#f97316';
    if (s >= 55) return '#eab308';
    return '#6b7280';
  };

  const getConfidenceColor = (c: number) => {
    if (c >= 70) return '#22c55e';
    if (c >= 50) return '#eab308';
    return '#6b7280';
  };

  const scoreColor = getScoreColor(score);
  const confColor = getConfidenceColor(confidence);

  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-1.5',
    lg: 'text-base gap-2',
  };

  const barHeight = {
    sm: 'h-1',
    md: 'h-1.5',
    lg: 'h-2',
  };

  return (
    <div className={`flex flex-col ${sizeClasses[size]} ${className}`}>
      {/* 分数 */}
      <div className="flex items-center gap-2">
        <span className="text-[#888] text-[10px] w-8">信号</span>
        <div className="flex-1 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className={`${barHeight[size]} rounded-full transition-all duration-300`}
            style={{
              width: `${score}%`,
              backgroundColor: scoreColor,
            }}
          />
        </div>
        <span
          className="font-mono font-bold min-w-8 text-right"
          style={{ color: scoreColor }}
        >
          {score}
        </span>
      </div>

      {/* 置信度 */}
      <div className="flex items-center gap-2">
        <span className="text-[#888] text-[10px] w-8">置信</span>
        <div className="flex-1 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className={`${barHeight[size]} rounded-full transition-all duration-300`}
            style={{
              width: `${confidence}%`,
              backgroundColor: confColor,
            }}
          />
        </div>
        <span
          className="font-mono min-w-8 text-right"
          style={{ color: confColor }}
        >
          {confidence}%
        </span>
      </div>
    </div>
  );
}

// ============================================
// 导出配置 (供外部使用)
// ============================================

export { SCENARIO_CONFIGS };
export type { ScenarioConfig };
