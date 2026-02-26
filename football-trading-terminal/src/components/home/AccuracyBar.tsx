// ============================================
// 准确率统计条组件
// ============================================

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Target, Zap, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import {
  scoreHistoryService,
  type DailyStats,
  type ScenarioStats,
} from '../../services/scoreHistory';

interface AccuracyBarProps {
  compact?: boolean;
}

// 场景名称映射
const SCENARIO_NAMES: Record<string, string> = {
  strong_behind: '强队落后',
  red_card: '红牌',
  dense_corners: '角球密集',
  large_lead: '大比分',
  multiple_subs: '多换人',
};

export function AccuracyBar({ compact = false }: AccuracyBarProps) {
  const [todayStats, setTodayStats] = useState<DailyStats | null>(null);
  const [weekStats, setWeekStats] = useState<DailyStats | null>(null);
  const [scenarioStats, setScenarioStats] = useState<ScenarioStats[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 加载数据
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = () => {
    setIsLoading(true);

    // PRODUCTION STRICT MODE: 不再初始化演示数据

    // 获取统计
    setTodayStats(scoreHistoryService.getDailyStats());
    setWeekStats(scoreHistoryService.getOverallStats(7));
    setScenarioStats(scoreHistoryService.getScenarioStats());

    setIsLoading(false);
  };

  // 刷新数据
  const handleRefresh = () => {
    loadStats();
  };

  if (isLoading) {
    return (
      <div className="bg-bg-card/50 border-b border-border-default px-4 py-2">
        <div className="flex items-center gap-2 text-text-muted">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载统计数据...</span>
        </div>
      </div>
    );
  }

  if (!todayStats || todayStats.totalMatches === 0) {
    // 如果没有数据，显示周数据
    if (!weekStats || weekStats.totalMatches === 0) {
      return null; // 完全没有数据时不显示
    }
  }

  const displayStats = todayStats && todayStats.totalMatches > 0 ? todayStats : weekStats;
  const statsLabel = todayStats && todayStats.totalMatches > 0 ? '今日' : '本周';

  if (!displayStats) return null;

  // 紧凑模式
  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 bg-bg-component/50 rounded-lg border border-border-default">
        <BarChart3 className="w-4 h-4 text-accent-primary" />
        <span className="text-xs text-text-secondary">
          {statsLabel}准确率:
        </span>
        <span className={`text-xs font-bold font-mono ${
          displayStats.highScoreAccuracy >= 60 ? 'text-accent-success' :
          displayStats.highScoreAccuracy >= 50 ? 'text-accent-warning' :
          'text-accent-danger'
        }`}>
          {displayStats.highScoreAccuracy}%
        </span>
        <span className="text-xs text-text-muted">
          ({displayStats.highScoreMatches}场)
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-bg-card/80 to-bg-component/50 border-b border-border-default">
      {/* 主统计条 */}
      <div
        className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-bg-component/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 flex-wrap">
          {/* 图标和标题 */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent-primary/20">
              <BarChart3 className="w-4 h-4 text-accent-primary" />
            </div>
            <span className="text-sm font-medium text-text-primary">{statsLabel}评分准确率</span>
          </div>

          {/* 高评分准确率 */}
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-accent-warning" />
            <span className="text-sm text-text-secondary">高评分(≥70)后进球率:</span>
            <span className={`text-sm font-bold font-mono ${
              displayStats.highScoreAccuracy >= 60 ? 'text-accent-success' :
              displayStats.highScoreAccuracy >= 50 ? 'text-accent-warning' :
              'text-accent-danger'
            }`}>
              {displayStats.highScoreAccuracy}%
            </span>
            <span className="text-xs text-text-muted bg-bg-deepest/50 px-1.5 py-0.5 rounded">
              {displayStats.goalAfterHighScore}/{displayStats.highScoreMatches}场
            </span>
          </div>

          {/* 超高评分准确率 */}
          {displayStats.veryHighScoreMatches > 0 && (
            <div className="hidden md:flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent-danger" />
              <span className="text-sm text-text-secondary">超高评分(≥80):</span>
              <span className={`text-sm font-bold font-mono ${
                displayStats.veryHighScoreAccuracy >= 65 ? 'text-accent-success' :
                displayStats.veryHighScoreAccuracy >= 55 ? 'text-accent-warning' :
                'text-accent-danger'
              }`}>
                {displayStats.veryHighScoreAccuracy}%
              </span>
              <span className="text-xs text-text-muted bg-bg-deepest/50 px-1.5 py-0.5 rounded">
                {displayStats.goalAfterVeryHighScore}/{displayStats.veryHighScoreMatches}场
              </span>
            </div>
          )}

          {/* 平均进球 */}
          <div className="hidden lg:flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent-success" />
            <span className="text-sm text-text-secondary">峰值后平均进球:</span>
            <span className="text-sm font-bold font-mono text-accent-primary">
              {displayStats.avgGoalsAfterPeak}
            </span>
          </div>
        </div>

        {/* 展开/收起按钮 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
            className="p-1.5 rounded-lg hover:bg-bg-component text-text-muted hover:text-text-primary transition-colors"
            title="刷新数据"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="p-1.5 rounded-lg hover:bg-bg-component text-text-muted transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* 展开的详细统计 */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border-default/50 pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 今日统计 */}
            {todayStats && todayStats.totalMatches > 0 && (
              <div className="p-3 rounded-lg bg-bg-deepest/50 border border-border-default">
                <h4 className="text-xs text-text-muted mb-2">今日统计</h4>
                <div className="grid grid-cols-2 gap-2">
                  <StatItem label="总场次" value={todayStats.totalMatches.toString()} />
                  <StatItem label="高评分场次" value={todayStats.highScoreMatches.toString()} />
                  <StatItem
                    label="高评分准确率"
                    value={`${todayStats.highScoreAccuracy}%`}
                    highlight={todayStats.highScoreAccuracy >= 55}
                  />
                  <StatItem
                    label="平均进球"
                    value={todayStats.avgGoalsAfterPeak.toString()}
                  />
                </div>
              </div>
            )}

            {/* 本周统计 */}
            {weekStats && weekStats.totalMatches > 0 && (
              <div className="p-3 rounded-lg bg-bg-deepest/50 border border-border-default">
                <h4 className="text-xs text-text-muted mb-2">本周统计 (7天)</h4>
                <div className="grid grid-cols-2 gap-2">
                  <StatItem label="总场次" value={weekStats.totalMatches.toString()} />
                  <StatItem label="高评分场次" value={weekStats.highScoreMatches.toString()} />
                  <StatItem
                    label="高评分准确率"
                    value={`${weekStats.highScoreAccuracy}%`}
                    highlight={weekStats.highScoreAccuracy >= 55}
                  />
                  <StatItem
                    label="超高评分准确率"
                    value={`${weekStats.veryHighScoreAccuracy}%`}
                    highlight={weekStats.veryHighScoreAccuracy >= 60}
                  />
                </div>
              </div>
            )}

            {/* 场景分析 */}
            {scenarioStats.length > 0 && (
              <div className="p-3 rounded-lg bg-bg-deepest/50 border border-border-default">
                <h4 className="text-xs text-text-muted mb-2">场景准确率排行</h4>
                <div className="space-y-1.5">
                  {scenarioStats.slice(0, 4).map((stat, index) => (
                    <div key={stat.scenario} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-accent-success/20 text-accent-success' :
                          index === 1 ? 'bg-accent-primary/20 text-accent-primary' :
                          'bg-bg-component text-text-muted'
                        }`}>
                          {index + 1}
                        </span>
                        <span className="text-sm text-text-secondary">
                          {SCENARIO_NAMES[stat.scenario] || stat.scenario}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold font-mono ${
                          stat.goalRate >= 60 ? 'text-accent-success' :
                          stat.goalRate >= 50 ? 'text-accent-warning' :
                          'text-accent-danger'
                        }`}>
                          {stat.goalRate}%
                        </span>
                        <span className="text-xs text-text-muted">({stat.totalMatches}场)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 说明 */}
          <p className="text-[10px] text-text-muted mt-3 text-center">
            数据基于最近30天内完成的比赛统计，高评分后进球率指评分达到阈值后比赛剩余时间内是否有进球
          </p>
        </div>
      )}
    </div>
  );
}

// 统计项组件
function StatItem({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-sm font-mono font-medium ${
        highlight ? 'text-accent-success' : 'text-text-primary'
      }`}>
        {value}
      </span>
    </div>
  );
}
