// ============================================
// 筛选栏组件（响应式 + 预设功能）
// ============================================

import { useState } from 'react';
import { Search, ArrowDownWideNarrow, Clock, Zap, AlertTriangle, CornerUpRight, Shield, Users, ChevronDown, Filter, X } from 'lucide-react';

export type FilterType = 'live' | 'alert' | 'watched' | 'all';
export type SortType = 'score' | 'time' | 'league';
export type ScenarioType = 'strong_behind' | 'red_card' | 'dense_corners' | 'large_lead' | 'multiple_subs' | null;

interface FilterBarProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  sortBy: SortType;
  onSortChange: (sort: SortType) => void;
  showOver70Only: boolean;
  onShowOver70Change: (value: boolean) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  counts: {
    live: number;
    alert: number;
    watched: number;
    all: number;
  };
  // 新增：场景筛选
  activeScenario?: ScenarioType;
  onScenarioChange?: (scenario: ScenarioType) => void;
  scenarioCounts?: {
    strong_behind: number;
    red_card: number;
    dense_corners: number;
    large_lead: number;
    multiple_subs: number;
  };
  // 新增：隐藏无赔率覆盖的联赛
  hideNoOddsCoverage?: boolean;
  onHideNoOddsCoverageChange?: (value: boolean) => void;
  noOddsCoverageCount?: number;
}

export function FilterBar({
  activeFilter,
  onFilterChange,
  sortBy,
  onSortChange,
  showOver70Only,
  onShowOver70Change,
  searchQuery,
  onSearchChange,
  counts,
  activeScenario,
  onScenarioChange,
  scenarioCounts,
  hideNoOddsCoverage,
  onHideNoOddsCoverageChange,
  noOddsCoverageCount,
}: FilterBarProps) {
  const [showScenarios, setShowScenarios] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const filters: { key: FilterType; label: string; shortLabel: string; icon?: string }[] = [
    { key: 'live', label: '进行中', shortLabel: '进行中' },
    { key: 'alert', label: '高预警', shortLabel: '预警', icon: '🔴' },
    { key: 'watched', label: '已关注', shortLabel: '关注', icon: '⭐' },
    { key: 'all', label: '全部', shortLabel: '全部' },
  ];

  const scenarios: { key: ScenarioType; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'strong_behind', label: '强队落后', icon: <Zap className="w-3 h-3" />, color: 'danger' },
    { key: 'red_card', label: '红牌', icon: <AlertTriangle className="w-3 h-3" />, color: 'danger' },
    { key: 'dense_corners', label: '角球密集', icon: <CornerUpRight className="w-3 h-3" />, color: 'warning' },
    { key: 'large_lead', label: '大比分', icon: <Shield className="w-3 h-3" />, color: 'success' },
    { key: 'multiple_subs', label: '多换人', icon: <Users className="w-3 h-3" />, color: 'primary' },
  ];

  const getScenarioStyles = (key: ScenarioType, color: string) => {
    const isActive = activeScenario === key;
    const colorMap: Record<string, { active: string; inactive: string }> = {
      danger: {
        active: 'bg-accent-danger/20 text-accent-danger border-accent-danger/50',
        inactive: 'text-accent-danger/70 border-accent-danger/30 hover:bg-accent-danger/10',
      },
      warning: {
        active: 'bg-accent-warning/20 text-accent-warning border-accent-warning/50',
        inactive: 'text-accent-warning/70 border-accent-warning/30 hover:bg-accent-warning/10',
      },
      success: {
        active: 'bg-accent-success/20 text-accent-success border-accent-success/50',
        inactive: 'text-accent-success/70 border-accent-success/30 hover:bg-accent-success/10',
      },
      primary: {
        active: 'bg-accent-primary/20 text-accent-primary border-accent-primary/50',
        inactive: 'text-accent-primary/70 border-accent-primary/30 hover:bg-accent-primary/10',
      },
    };
    return isActive ? colorMap[color].active : colorMap[color].inactive;
  };

  const activeScenarioCount = activeScenario && scenarioCounts
    ? scenarioCounts[activeScenario as keyof typeof scenarioCounts]
    : 0;

  return (
    <div className="flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 bg-bg-card border-b border-border-default">
      {/* 第一行：主筛选按钮 */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
        {filters.map(({ key, label, shortLabel, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={`flex-shrink-0 flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === key
                ? 'bg-accent-primary text-bg-deepest'
                : 'bg-bg-component text-text-secondary hover:text-text-primary border border-border-default hover:border-text-muted'
            }`}
          >
            {icon && <span className="text-xs">{icon}</span>}
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
            <span className={`ml-0.5 sm:ml-1 font-mono text-xs ${activeFilter === key ? 'text-bg-deepest/70' : 'text-text-muted'}`}>
              {counts[key]}
            </span>
          </button>
        ))}

        {/* 排序和时间筛选 - 桌面端 */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSortChange('score')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              sortBy === 'score'
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <ArrowDownWideNarrow className="w-3.5 h-3.5" />
            <span>按80+评分</span>
          </button>

          <button
            type="button"
            onClick={() => onShowOver70Change(!showOver70Only)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              showOver70Only
                ? 'bg-accent-warning/20 text-accent-warning'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>70分钟+</span>
          </button>

          {/* 隐藏无赔率覆盖的比赛 */}
          {onHideNoOddsCoverageChange && (
            <button
              type="button"
              onClick={() => onHideNoOddsCoverageChange(!hideNoOddsCoverage)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                hideNoOddsCoverage
                  ? 'bg-green-500/20 text-green-400'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="只显示有滚球赔率的联赛"
            >
              <span className="text-sm">💰</span>
              <span>有赔率</span>
              {noOddsCoverageCount !== undefined && noOddsCoverageCount > 0 && !hideNoOddsCoverage && (
                <span className="text-[10px] text-gray-500">(-{noOddsCoverageCount})</span>
              )}
            </button>
          )}
        </div>

        {/* 搜索按钮 - 移动端 */}
        <button
          type="button"
          onClick={() => setShowSearch(!showSearch)}
          className={`sm:hidden flex-shrink-0 p-2 rounded-lg transition-colors ${
            showSearch || searchQuery
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-bg-component text-text-secondary'
          }`}
        >
          <Search className="w-4 h-4" />
        </button>

        {/* 场景筛选按钮 - 移动端 */}
        {onScenarioChange && (
          <button
            type="button"
            onClick={() => setShowScenarios(!showScenarios)}
            className={`sm:hidden flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
              activeScenario
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-bg-component text-text-secondary'
            }`}
          >
            <Filter className="w-4 h-4" />
            {activeScenario && <span className="text-xs font-mono">{activeScenarioCount}</span>}
          </button>
        )}

        {/* 搜索框 - 桌面端 */}
        <div className="relative hidden sm:block ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="搜索球队..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-40 lg:w-48 pl-9 pr-4 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
          />
        </div>
      </div>

      {/* 搜索框 - 移动端展开 */}
      {showSearch && (
        <div className="sm:hidden relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="搜索球队名称..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            autoFocus
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
          />
        </div>
      )}

      {/* 第二行：场景快速筛选 - 移动端折叠 */}
      {onScenarioChange && (
        <div className={`${showScenarios ? 'flex' : 'hidden'} sm:flex items-center gap-2 flex-wrap`}>
          <span className="hidden sm:inline text-xs text-text-muted mr-1">场景筛选:</span>

          {/* 移动端：额外的排序选项 */}
          <div className="flex sm:hidden items-center gap-2 w-full mb-2">
            <button
              type="button"
              onClick={() => onSortChange('score')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                sortBy === 'score'
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-bg-component text-text-secondary border border-border-default'
              }`}
            >
              <ArrowDownWideNarrow className="w-3.5 h-3.5" />
              <span>按评分</span>
            </button>

            <button
              type="button"
              onClick={() => onShowOver70Change(!showOver70Only)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                showOver70Only
                  ? 'bg-accent-warning/20 text-accent-warning'
                  : 'bg-bg-component text-text-secondary border border-border-default'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>70分钟+</span>
            </button>
          </div>

          {/* 场景按钮 */}
          {scenarios.map(({ key, label, icon, color }) => {
            const count = scenarioCounts?.[key as keyof typeof scenarioCounts] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onScenarioChange(activeScenario === key ? null : key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-medium border transition-all ${getScenarioStyles(key, color)}`}
              >
                {icon}
                <span>{label}</span>
                {count > 0 && (
                  <span className="ml-0.5 font-mono text-[10px] opacity-80">{count}</span>
                )}
              </button>
            );
          })}

          {activeScenario && (
            <button
              type="button"
              onClick={() => onScenarioChange(null)}
              className="ml-1 sm:ml-2 px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-bg-component transition-colors"
            >
              清除
            </button>
          )}
        </div>
      )}
    </div>
  );
}
