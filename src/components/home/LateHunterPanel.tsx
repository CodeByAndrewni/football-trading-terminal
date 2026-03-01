// ============================================
// 尾盘猎手面板 - Late Hunter Panel
// 整合 Module A (大球冲刺) + Module B (强队反扑)
// 显示 65+ 分钟的高价值信号
// ============================================

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, TrendingUp, Zap, ChevronDown, ChevronUp, Clock, AlertTriangle } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import {
  calculateUnifiedLateSignal,
  shouldTriggerLateModule,
  getLateModulePhase,
  type UnifiedLateSignal,
  type ScenarioTag,
} from '../../services/modules/unifiedLateModule';

interface LateHunterPanelProps {
  matches: AdvancedMatch[];
  onMatchClick?: (matchId: number) => void;
}

// 场景标签中文映射
const SCENARIO_LABELS: Record<ScenarioTag, { label: string; color: string; icon: string }> = {
  OVER_SPRINT: { label: '大球冲刺', color: '#22c55e', icon: '⚡' },
  STRONG_BEHIND: { label: '强队反扑', color: '#f97316', icon: '🔥' },
  DEADLOCK_BREAK: { label: '破僵局', color: '#eab308', icon: '💥' },
  WEAK_DEFEND: { label: '弱队守成', color: '#6366f1', icon: '🛡️' },
  BLOWOUT: { label: '大比分', color: '#6b7280', icon: '📊' },
  BALANCED_LATE: { label: '均势末段', color: '#8b5cf6', icon: '⚖️' },
  GENERIC: { label: '通用场景', color: '#8b949e', icon: '📋' },
};

// Action 中文映射
const ACTION_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  BET: { label: '立即下注', color: '#ef4444', bgColor: 'bg-[#ef4444]/20' },
  PREPARE: { label: '准备出手', color: '#f97316', bgColor: 'bg-[#f97316]/20' },
  WATCH: { label: '密切关注', color: '#eab308', bgColor: 'bg-[#eab308]/20' },
  IGNORE: { label: '暂不关注', color: '#6b7280', bgColor: 'bg-[#6b7280]/20' },
};

interface ProcessedMatch {
  match: AdvancedMatch;
  signal: UnifiedLateSignal;
  phase: 'warmup' | 'active';
}

export function LateHunterPanel({ matches, onMatchClick }: LateHunterPanelProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [showAllSignals, setShowAllSignals] = useState(false);

  // 处理晚期信号
  const lateSignals = useMemo((): ProcessedMatch[] => {
    const results: ProcessedMatch[] = [];

    for (const match of matches) {
      // 只处理 65+ 分钟且有统计数据的比赛
      if (!shouldTriggerLateModule(match.minute)) continue;
      if (!match.stats?._realDataAvailable) continue;
      if (match._unscoreable) continue;

      const phase = getLateModulePhase(match.minute);
      if (phase === 'inactive') continue;

      try {
        // 计算红牌数
        const redCardsHome = match.cards?.red?.home ?? 0;
        const redCardsAway = match.cards?.red?.away ?? 0;

        // 计算最近进球数
        const recentGoals = match.events?.filter(e =>
          e.type === 'Goal' &&
          e.minute !== undefined &&
          e.minute >= match.minute - 15
        ).length ?? 0;

        // 计算最近进攻换人
        const recentSubsAttack = match.substitutions?.filter(s =>
          s.minute >= match.minute - 10 &&
          (s.type === 'attack' || s.playerInPosition === 'FW' || s.playerInPosition === 'MF')
        ).length ?? 0;

        // 构建 MatchStateInput
        const matchState = {
          fixture_id: match.id,
          minute: match.minute,
          score_home: match.home?.score ?? 0,
          score_away: match.away?.score ?? 0,
          status: match.status ?? 'live',
          shots_home: match.stats?.shots?.home ?? 0,
          shots_away: match.stats?.shots?.away ?? 0,
          shots_on_home: match.stats?.shotsOnTarget?.home ?? 0,
          shots_on_away: match.stats?.shotsOnTarget?.away ?? 0,
          xg_home: match.stats?.xG?.home ?? 0,
          xg_away: match.stats?.xG?.away ?? 0,
          corners_home: match.corners?.home ?? 0,
          corners_away: match.corners?.away ?? 0,
          possession_home: match.stats?.possession?.home ?? 50,
          possession_away: match.stats?.possession?.away ?? 50,
          dangerous_home: match.stats?.dangerousAttacks?.home ?? 0,
          dangerous_away: match.stats?.dangerousAttacks?.away ?? 0,
          shots_last_15: 0,
          xg_last_15: 0,
          shots_prev_15: 0,
          corners_last_15: 0,
          red_cards_home: redCardsHome,
          red_cards_away: redCardsAway,
          recent_goals: recentGoals,
          recent_subs_attack: recentSubsAttack,
          stats_available: true,
          events_available: (match.events?.length ?? 0) > 0,
          data_timestamp: new Date().toISOString(),
        };

        // 构建 MarketStateInput
        let marketState = null;
        if (match.odds?._fetch_status === 'SUCCESS') {
          marketState = {
            fixture_id: match.id,
            over_odds: match.odds?.overUnder?.over ?? null,
            under_odds: match.odds?.overUnder?.under ?? null,
            over_odds_prev: null,
            ou_line: match.odds?.overUnder?.total ?? null,
            ah_line: match.odds?.handicap?.value ?? null,
            ah_home: match.odds?.handicap?.home ?? null,
            ah_away: match.odds?.handicap?.away ?? null,
            ah_line_prev: null,
            win_home: match.odds?.matchWinner?.home ?? null,
            win_draw: match.odds?.matchWinner?.draw ?? null,
            win_away: match.odds?.matchWinner?.away ?? null,
            bookmaker: match.odds?._bookmaker ?? 'unknown',
            is_live: match.odds?._is_live ?? true,
            captured_at: match.odds?._captured_at ?? new Date().toISOString(),
          };
        }

        const signal = calculateUnifiedLateSignal(matchState, marketState);

        // 只保留有价值的信号 (WATCH 以上或高分)
        if (signal.action !== 'IGNORE' || signal.score >= 60) {
          results.push({
            match,
            signal,
            phase: phase as 'warmup' | 'active',
          });
        }
      } catch (err) {
        console.warn(`[LateHunter] Error processing match ${match.id}:`, err);
      }
    }

    // 按信号强度排序
    return results.sort((a, b) => {
      // BET > PREPARE > WATCH > IGNORE
      const actionPriority = { BET: 4, PREPARE: 3, WATCH: 2, IGNORE: 1 };
      const aPriority = actionPriority[a.signal.action as keyof typeof actionPriority] ?? 0;
      const bPriority = actionPriority[b.signal.action as keyof typeof actionPriority] ?? 0;

      if (aPriority !== bPriority) return bPriority - aPriority;
      return b.signal.score - a.signal.score;
    });
  }, [matches]);

  // 统计
  const stats = useMemo(() => {
    const betCount = lateSignals.filter(s => s.signal.action === 'BET').length;
    const prepareCount = lateSignals.filter(s => s.signal.action === 'PREPARE').length;
    const watchCount = lateSignals.filter(s => s.signal.action === 'WATCH').length;
    const activeCount = lateSignals.filter(s => s.phase === 'active').length;

    return { betCount, prepareCount, watchCount, activeCount, total: lateSignals.length };
  }, [lateSignals]);

  // 显示的信号（默认只显示高价值）
  const displaySignals = showAllSignals
    ? lateSignals
    : lateSignals.filter(s => s.signal.action === 'BET' || s.signal.action === 'PREPARE' || s.signal.score >= 70);

  const handleMatchClick = (matchId: number) => {
    if (onMatchClick) {
      onMatchClick(matchId);
    } else {
      navigate(`/match/${matchId}`);
    }
  };

  if (lateSignals.length === 0) {
    return null; // 无信号时不显示面板
  }

  return (
    <div className="bg-gradient-to-r from-[#1a1a1a] to-[#0d0d0d] border border-[#333] rounded-lg overflow-hidden">
      {/* 标题栏 */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#222]/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff4444] to-[#ff6600]">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              尾盘猎手
              <span className="text-xs font-normal text-[#888]">65'+</span>
            </h3>
            <p className="text-xs text-[#666]">大球冲刺 + 强队反扑</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* 信号统计 */}
          <div className="flex items-center gap-3 text-sm">
            {stats.betCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#ef4444]/20 text-[#ef4444]">
                <Zap className="w-3 h-3" />
                <span className="font-bold">{stats.betCount}</span>
              </div>
            )}
            {stats.prepareCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#f97316]/20 text-[#f97316]">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-bold">{stats.prepareCount}</span>
              </div>
            )}
            {stats.watchCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#eab308]/20 text-[#eab308]">
                <Clock className="w-3 h-3" />
                <span>{stats.watchCount}</span>
              </div>
            )}
          </div>

          {/* 展开/收起 */}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-[#666]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#666]" />
          )}
        </div>
      </div>

      {/* 内容区 */}
      {expanded && (
        <div className="border-t border-[#333]">
          {/* 控制栏 */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a0a]">
            <div className="text-xs text-[#666]">
              共 {stats.total} 个信号 · {stats.activeCount} 个激活
            </div>
            <button
              type="button"
              onClick={() => setShowAllSignals(!showAllSignals)}
              className="text-xs text-[#00d4ff] hover:underline"
            >
              {showAllSignals ? '只看高价值' : '显示全部'}
            </button>
          </div>

          {/* 信号列表 */}
          <div className="max-h-[320px] overflow-auto">
            {displaySignals.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#666] text-sm">
                暂无高价值信号
              </div>
            ) : (
              <div className="divide-y divide-[#222]">
                {displaySignals.map(({ match, signal, phase }) => {
                  const scenarioInfo = SCENARIO_LABELS[signal.scenario_tag] || SCENARIO_LABELS.BALANCED_LATE;
                  const actionInfo = ACTION_LABELS[signal.action] || ACTION_LABELS.IGNORE;

                  return (
                    <div
                      key={match.id}
                      className={`px-4 py-3 hover:bg-[#1a1a1a] cursor-pointer transition-colors ${
                        signal.action === 'BET' ? 'bg-[#ef4444]/5 border-l-2 border-l-[#ef4444]' :
                        signal.action === 'PREPARE' ? 'bg-[#f97316]/5 border-l-2 border-l-[#f97316]' :
                        ''
                      }`}
                      onClick={() => handleMatchClick(match.id)}
                    >
                      <div className="flex items-center justify-between">
                        {/* 左侧：比赛信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {/* 联赛 */}
                            <span className="text-xs text-[#666]">{match.leagueShort}</span>
                            {/* 分钟 */}
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                              match.minute >= 85 ? 'bg-[#ef4444]/20 text-[#ef4444] animate-pulse' :
                              match.minute >= 80 ? 'bg-[#f97316]/20 text-[#f97316]' :
                              'bg-[#eab308]/20 text-[#eab308]'
                            }`}>
                              {match.minute}'
                            </span>
                            {/* 场景标签 */}
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${scenarioInfo.color}20`,
                                color: scenarioInfo.color,
                              }}
                            >
                              {scenarioInfo.icon} {scenarioInfo.label}
                            </span>
                            {/* 预热标记 */}
                            {signal.is_warmup && (
                              <span className="text-xs text-[#666] bg-[#333] px-1.5 py-0.5 rounded">
                                预热
                              </span>
                            )}
                          </div>

                          {/* 球队和比分 */}
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-white truncate max-w-[100px]">{match.home?.name ?? '主队'}</span>
                            <span className="font-bold font-mono">
                              <span className={(match.home?.score ?? 0) > (match.away?.score ?? 0) ? 'text-[#00d4ff]' : 'text-white'}>
                                {match.home?.score ?? 0}
                              </span>
                              <span className="text-[#444] mx-1">-</span>
                              <span className={(match.away?.score ?? 0) > (match.home?.score ?? 0) ? 'text-[#ff6b6b]' : 'text-white'}>
                                {match.away?.score ?? 0}
                              </span>
                            </span>
                            <span className="text-white truncate max-w-[100px]">{match.away?.name ?? '客队'}</span>
                          </div>

                          {/* 关键数据 */}
                          <div className="flex items-center gap-3 mt-1 text-xs text-[#666]">
                            <span>射门 {(match.stats?.shots?.home ?? 0) + (match.stats?.shots?.away ?? 0)}</span>
                            {match.stats?.xG && (
                              <span>xG {((match.stats.xG.home ?? 0) + (match.stats.xG.away ?? 0)).toFixed(1)}</span>
                            )}
                            <span>角球 {(match.corners?.home ?? 0) + (match.corners?.away ?? 0)}</span>
                            {signal.poisson_goal_prob > 30 && (
                              <span className="text-[#22c55e]">
                                P {Math.round(signal.poisson_goal_prob)}%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 右侧：评分和行动 */}
                        <div className="flex flex-col items-end gap-1 ml-4">
                          {/* 评分 */}
                          <div className="flex items-center gap-2">
                            <span className={`text-xl font-bold ${
                              signal.score >= 85 ? 'text-[#ef4444]' :
                              signal.score >= 75 ? 'text-[#f97316]' :
                              signal.score >= 65 ? 'text-[#eab308]' :
                              'text-[#888]'
                            }`}>
                              {Math.round(signal.score)}
                            </span>
                            <span className={`text-xs ${
                              signal.confidence >= 70 ? 'text-[#22c55e]' :
                              signal.confidence >= 55 ? 'text-[#eab308]' :
                              'text-[#888]'
                            }`}>
                              /{Math.round(signal.confidence)}
                            </span>
                          </div>

                          {/* 行动标签 */}
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${actionInfo.bgColor}`}
                            style={{ color: actionInfo.color }}
                          >
                            {actionInfo.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LateHunterPanel;
