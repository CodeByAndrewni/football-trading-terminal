// ============================================================
// SignalCard - 信号卡片组件
// 展示统一评分框架的 Score/Confidence/Reasons
// ============================================================

import { useState } from 'react';
import type { UnifiedSignal, ModuleType } from '../../types/unified-scoring';
import { MODULE_NAMES, ACTION_LABELS_STYLED } from '../../types/unified-scoring';
import { getScoreColor, getConfidenceColor } from '../../services/unifiedScoringEngine';

// ============================================================
// 子组件：评分条
// ============================================================

interface ScoreBarProps {
  score: number;
  maxScore?: number;
  height?: number;
  showLabel?: boolean;
}

function ScoreBar({ score, maxScore = 100, height = 6, showLabel = false }: ScoreBarProps) {
  const percentage = Math.min(100, (score / maxScore) * 100);
  const color = getScoreColor(score);

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height, backgroundColor: 'rgba(255,255,255,0.1)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono" style={{ color, minWidth: '2rem' }}>
          {score}
        </span>
      )}
    </div>
  );
}

// ============================================================
// 子组件：置信度指示器
// ============================================================

interface ConfidenceIndicatorProps {
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
}

function ConfidenceIndicator({ confidence, size = 'md' }: ConfidenceIndicatorProps) {
  const color = getConfidenceColor(confidence);
  const sizeMap = { sm: 24, md: 32, lg: 40 };
  const dimension = sizeMap[size];
  const strokeWidth = size === 'sm' ? 3 : 4;
  const radius = (dimension - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (confidence / 100) * circumference;

  return (
    <div className="relative" style={{ width: dimension, height: dimension }}>
      <svg width={dimension} height={dimension} className="transform -rotate-90">
        {/* 背景圆 */}
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* 进度圆 */}
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      {size !== 'sm' && (
        <span
          className="absolute inset-0 flex items-center justify-center text-xs font-bold"
          style={{ color }}
        >
          {confidence}
        </span>
      )}
    </div>
  );
}

// ============================================================
// 子组件：行动徽章
// ============================================================

interface ActionBadgeProps {
  action: UnifiedSignal['action'];
}

function ActionBadge({ action }: ActionBadgeProps) {
  const { label, color, bgColor } = ACTION_LABELS_STYLED[action];

  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider"
      style={{ color, backgroundColor: bgColor }}
    >
      {label}
    </span>
  );
}

// ============================================================
// 子组件：标签列表
// ============================================================

interface TagListProps {
  tags: string[];
  maxShow?: number;
}

function TagList({ tags, maxShow = 4 }: TagListProps) {
  const displayTags = tags.slice(0, maxShow);
  const remaining = tags.length - maxShow;

  return (
    <div className="flex flex-wrap gap-1">
      {displayTags.map(tag => (
        <span
          key={tag}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-white/60"
        >
          {tag}
        </span>
      ))}
      {remaining > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-white/40">
          +{remaining}
        </span>
      )}
    </div>
  );
}

// ============================================================
// 子组件：理由面板
// ============================================================

interface ReasonsPanelProps {
  signal: UnifiedSignal;
  onClose: () => void;
}

function ReasonsPanel({ signal, onClose }: ReasonsPanelProps) {
  const { reasons, score_breakdown, confidence_breakdown } = signal;

  // 安全访问可选属性
  const stats = reasons?.stats ?? { shots_total: 0, shots_on_total: 0, xg_total: 0, xg_debt: 0, corners_total: 0, possession_home: 0 };
  const deltas = reasons?.deltas ?? { shots_last_15: 0, shots_delta: 0, pressure_direction: '-', momentum_trend: 'STABLE' };
  const checks = reasons?.checks ?? { has_stats: false, has_events: false, has_odds: false, stats_fresh: false, data_anomaly: false };
  const market = reasons?.market ?? { over_odds: 0, implied_over_prob: 0, line_movement: '-' };
  const tags = reasons?.tags ?? [];
  const windowScore = score_breakdown?.timing?.window_score ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0f] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold" style={{ color: getScoreColor(signal.score) }}>
              {signal.score}
            </span>
            <div className="text-sm text-white/60">
              <span className="text-white font-medium">{MODULE_NAMES[signal.module]}</span>
              <span className="mx-2">·</span>
              <span>{signal.minute}'</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 评分明细 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-white/80 mb-3">评分明细</h3>
          <div className="grid grid-cols-5 gap-2">
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">Base</div>
              <div className="text-lg font-bold">{score_breakdown.base.score_state}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">Edge</div>
              <div className="text-lg font-bold">{score_breakdown.edge.total.toFixed(1)}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">Timing</div>
              <div className="text-lg font-bold">{windowScore.toFixed(1)}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">Market</div>
              <div className="text-lg font-bold">{score_breakdown.market.total.toFixed(1)}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">Quality</div>
              <div className="text-lg font-bold" style={{
                color: score_breakdown.quality.total < 0 ? '#ef4444' : undefined
              }}>
                {score_breakdown.quality.total > 0 ? '+' : ''}{score_breakdown.quality.total}
              </div>
            </div>
          </div>

          {/* Edge 组件详情 */}
          {score_breakdown.edge.description.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-2">Edge 详情</div>
              <div className="space-y-1">
                {score_breakdown.edge.description.map((desc, i) => (
                  <div key={i} className="text-sm text-white/70">{desc}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 置信度明细 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-white/80 mb-3">置信度明细</h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">数据完整</div>
              <div className="text-lg font-bold">{confidence_breakdown.data_completeness}/35</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">新鲜稳定</div>
              <div className="text-lg font-bold">{confidence_breakdown.freshness_stability}/20</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">交叉一致</div>
              <div className="text-lg font-bold">{confidence_breakdown.cross_source_consistency}/25</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50 mb-1">市场确认</div>
              <div className="text-lg font-bold">{confidence_breakdown.market_confirmation}/20</div>
            </div>
          </div>
        </div>

        {/* 统计数据 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-white/80 mb-3">关键统计</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50">射门</div>
              <div className="text-xl font-bold">{stats.shots_total}</div>
              <div className="text-xs text-white/40">射正 {stats.shots_on_total}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50">xG</div>
              <div className="text-xl font-bold">{(stats.xg_total ?? 0).toFixed(2)}</div>
              <div className="text-xs text-white/40">欠债 {(stats.xg_debt ?? 0).toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50">角球</div>
              <div className="text-xl font-bold">{stats.corners_total}</div>
              <div className="text-xs text-white/40">控球 {stats.possession_home}%</div>
            </div>
          </div>
        </div>

        {/* 动量 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-white/80 mb-3">动量变化</h3>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50">近15'射门</div>
              <div className="text-xl font-bold">{deltas.shots_last_15}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50">射门变化</div>
              <div className="text-xl font-bold" style={{
                color: (deltas.shots_delta ?? 0) > 0 ? '#22c55e' : (deltas.shots_delta ?? 0) < 0 ? '#ef4444' : undefined
              }}>
                {(deltas.shots_delta ?? 0) > 0 ? '+' : ''}{deltas.shots_delta ?? 0}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50">压力方向</div>
              <div className="text-sm font-bold">{deltas.pressure_direction}</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5">
              <div className="text-xs text-white/50">趋势</div>
              <div className="text-sm font-bold" style={{
                color: deltas.momentum_trend === 'INCREASING' ? '#22c55e' :
                       deltas.momentum_trend === 'DECREASING' ? '#ef4444' : undefined
              }}>
                {deltas.momentum_trend}
              </div>
            </div>
          </div>
        </div>

        {/* 市场数据 */}
        {checks.has_odds && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-white/80 mb-3">市场数据</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50">大球赔率</div>
                <div className="text-xl font-bold">{(market.over_odds ?? 0).toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50">隐含概率</div>
                <div className="text-xl font-bold">{market.implied_over_prob ?? '-'}%</div>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <div className="text-xs text-white/50">盘口变化</div>
                <div className="text-sm font-bold" style={{
                  color: market.line_movement === 'DOWN' ? '#22c55e' :
                         market.line_movement === 'UP' ? '#ef4444' : undefined
                }}>
                  {market.line_movement ?? '-'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 数据检查 */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-white/80 mb-3">数据检查</h3>
          <div className="flex flex-wrap gap-2">
            <span className={`px-2 py-1 rounded text-xs ${checks.has_stats ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              统计 {checks.has_stats ? '✓' : '✗'}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${checks.has_events ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              事件 {checks.has_events ? '✓' : '✗'}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${checks.has_odds ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              赔率 {checks.has_odds ? '✓' : '✗'}
            </span>
            <span className={`px-2 py-1 rounded text-xs ${checks.stats_fresh ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              新鲜 {checks.stats_fresh ? '✓' : '✗'}
            </span>
            {checks.data_anomaly && (
              <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400">
                异常: {(checks as Record<string, unknown>).anomaly_reason as string}
              </span>
            )}
          </div>
        </div>

        {/* 标签 */}
        {tags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-white/80 mb-3">场景标签</h3>
            <TagList tags={tags} maxShow={10} />
          </div>
        )}

        {/* 下注计划 */}
        {signal.bet_plan && (
          <div className="p-4 rounded-lg border border-white/10 bg-white/5">
            <h3 className="text-sm font-medium text-white/80 mb-3">下注建议</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-white/50">盘口:</span>
                <span className="ml-2 font-bold">{signal.bet_plan.market} {signal.bet_plan.line}</span>
              </div>
              <div>
                <span className="text-white/50">方向:</span>
                <span className="ml-2 font-bold">{signal.bet_plan.selection}</span>
              </div>
              <div>
                <span className="text-white/50">最低赔率:</span>
                <span className="ml-2 font-bold">{signal.bet_plan.odds_min}</span>
              </div>
              <div>
                <span className="text-white/50">注码:</span>
                <span className="ml-2 font-bold">{signal.bet_plan.stake_pct}%</span>
              </div>
              <div>
                <span className="text-white/50">有效期:</span>
                <span className="ml-2 font-bold">{signal.bet_plan.ttl_minutes}分钟</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 主组件：信号卡片
// ============================================================

interface SignalCardProps {
  signal: UnifiedSignal;
  matchInfo?: {
    homeTeam: string;
    awayTeam: string;
    leagueName: string;
  };
  compact?: boolean;
  onClick?: () => void;
}

export function SignalCard({ signal, matchInfo, compact = false, onClick }: SignalCardProps) {
  const [showReasons, setShowReasons] = useState(false);

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
        onClick={() => setShowReasons(true)}
      >
        {/* 评分 */}
        <div
          className="text-xl font-bold min-w-[2.5rem] text-center"
          style={{ color: getScoreColor(signal.score) }}
        >
          {signal.score}
        </div>

        {/* 置信度 */}
        <ConfidenceIndicator confidence={signal.confidence} size="sm" />

        {/* 行动 */}
        <ActionBadge action={signal.action} />

        {/* 模块 */}
        <span className="text-xs text-white/50">{MODULE_NAMES[signal.module]}</span>

        {/* 时间 */}
        <span className="text-xs text-white/40">{signal.minute}'</span>

        {showReasons && (
          <ReasonsPanel signal={signal} onClose={() => setShowReasons(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          {matchInfo && (
            <div className="text-sm font-medium mb-1">
              {matchInfo.homeTeam} vs {matchInfo.awayTeam}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span>{MODULE_NAMES[signal.module]}</span>
            <span>·</span>
            <span>{signal.minute}'</span>
            {matchInfo && (
              <>
                <span>·</span>
                <span>{matchInfo.leagueName}</span>
              </>
            )}
          </div>
        </div>
        <ActionBadge action={signal.action} />
      </div>

      {/* 评分与置信度 */}
      <div className="flex items-center gap-6 mb-4">
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span
              className="text-3xl font-bold"
              style={{ color: getScoreColor(signal.score) }}
            >
              {signal.score}
            </span>
            <span className="text-sm text-white/40">/ 100</span>
          </div>
          <div className="text-xs text-white/50">评分</div>
        </div>

        <div className="flex items-center gap-3">
          <ConfidenceIndicator confidence={signal.confidence} size="lg" />
          <div className="text-xs text-white/50">置信度</div>
        </div>
      </div>

      {/* 评分条 */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/40 w-12">Edge</span>
          <ScoreBar score={signal.score_breakdown?.edge?.total ?? 0} maxScore={30} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/40 w-12">Timing</span>
          <ScoreBar score={signal.score_breakdown?.timing?.window_score ?? 0} maxScore={20} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/40 w-12">Market</span>
          <ScoreBar score={signal.score_breakdown?.market?.total ?? 0} maxScore={20} />
        </div>
      </div>

      {/* 标签 */}
      {(signal.reasons?.tags?.length ?? 0) > 0 && (
        <div className="mb-4">
          <TagList tags={signal.reasons?.tags ?? []} />
        </div>
      )}

      {/* 下注计划预览 */}
      {signal.bet_plan && (
        <div className="p-3 rounded-lg bg-white/5 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{signal.bet_plan.market} {signal.bet_plan.line}</span>
            <span className="font-bold" style={{ color: getScoreColor(signal.score) }}>
              {signal.bet_plan.selection}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-white/50 mt-1">
            <span>最低赔率 {signal.bet_plan.odds_min}</span>
            <span>有效期 {signal.bet_plan.ttl_minutes}分钟</span>
          </div>
        </div>
      )}

      {/* 查看详情按钮 */}
      <button
        onClick={() => setShowReasons(true)}
        className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/70 hover:text-white transition-colors"
      >
        查看评分理由
      </button>

      {showReasons && (
        <ReasonsPanel signal={signal} onClose={() => setShowReasons(false)} />
      )}
    </div>
  );
}

// ============================================================
// 导出
// ============================================================

export default SignalCard;
export { ScoreBar, ConfidenceIndicator, ActionBadge, TagList, ReasonsPanel };
