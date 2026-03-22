// ============================================
// 尾盘猎手面板 - 整合 Module A + Module B
// Module A: 大球冲刺 (Over Sprint)
// Module B: 强队反扑 (Strong Behind)
// ============================================

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, TrendingUp, Flame, AlertTriangle, Clock, ChevronRight, Swords } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import {
  calculateUnifiedLateSignal,
  shouldTriggerLateModule,
  getLateModulePhase,
  type UnifiedLateSignal,
  type ScenarioTag,
} from '../../services/modules/unifiedLateModule';
import { formatLeagueWithCountry } from '../../utils/leagueDisplay';

interface LateGameHunterPanelProps {
  matches: AdvancedMatch[];
  onMatchClick?: (matchId: number) => void;
}

interface LateGameMatch {
  match: AdvancedMatch;
  signal: UnifiedLateSignal | null;
  phase: 'inactive' | 'warmup' | 'active';
}

// 场景标签中文映射
const SCENARIO_LABELS: Record<ScenarioTag, { label: string; color: string; icon: string }> = {
  OVER_SPRINT: { label: '大球冲刺', color: '#22c55e', icon: '🎯' },
  STRONG_BEHIND: { label: '强队反扑', color: '#f97316', icon: '💪' },
  DEADLOCK_BREAK: { label: '破僵局', color: '#eab308', icon: '🔓' },
  WEAK_DEFEND: { label: '弱队守成', color: '#6b7280', icon: '🛡️' },
  BLOWOUT: { label: '大比分', color: '#6b7280', icon: '💨' },
  BALANCED_LATE: { label: '均势末段', color: '#8b5cf6', icon: '⚖️' },
  GENERIC: { label: '通用场景', color: '#8b949e', icon: '📋' },
};

// Action 标签
const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  BET: { bg: 'bg-[#ef4444]/20', text: 'text-[#ef4444]', label: '下注' },
  PREPARE: { bg: 'bg-[#f97316]/20', text: 'text-[#f97316]', label: '准备' },
  WATCH: { bg: 'bg-[#eab308]/20', text: 'text-[#eab308]', label: '关注' },
  IGNORE: { bg: 'bg-[#6b7280]/20', text: 'text-[#6b7280]', label: '忽略' },
};

export function LateGameHunterPanel({ matches, onMatchClick }: LateGameHunterPanelProps) {
  const navigate = useNavigate();

  // 处理晚期比赛
  const lateGameMatches = useMemo((): LateGameMatch[] => {
    const results: LateGameMatch[] = [];

    for (const match of matches) {
      // ⚠️ Guard：供应商无赔率的比赛只作为 stats 参考场，不进入尾盘猎手机会列表
      if (match.noOddsFromProvider) {
        continue;
      }

      const phase = getLateModulePhase(match.minute);

      // 只处理 65+ 分钟的比赛
      if (phase === 'inactive') continue;
      if (!match.stats?._realDataAvailable) continue;
      if (match._unscoreable) continue;

      let signal: UnifiedLateSignal | null = null;

      try {
        if (shouldTriggerLateModule(match.minute)) {
          const redCardsHome = match.cards?.red?.home ?? 0;
          const redCardsAway = match.cards?.red?.away ?? 0;
          const recentGoals = match.events?.filter(e =>
            e.type === 'Goal' && e.minute !== undefined && e.minute >= match.minute - 15
          ).length ?? 0;
          const recentSubsAttack = match.substitutions?.filter(s =>
            s.minute >= match.minute - 10 &&
            (s.type === 'attack' || s.playerInPosition === 'FW' || s.playerInPosition === 'MF')
          ).length ?? 0;

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

          signal = calculateUnifiedLateSignal(matchState, marketState, undefined);
        }
      } catch (err) {
        console.warn(`[LateGameHunter] Error processing match ${match.id}:`, err);
      }

      results.push({ match, signal, phase });
    }

    // 排序：BET > PREPARE > WATCH，分数高的优先
    return results.sort((a, b) => {
      const actionPriority = { BET: 4, PREPARE: 3, WATCH: 2, IGNORE: 1 };
      const aAction = a.signal?.action ?? 'IGNORE';
      const bAction = b.signal?.action ?? 'IGNORE';
      const aPriority = actionPriority[aAction as keyof typeof actionPriority] ?? 1;
      const bPriority = actionPriority[bAction as keyof typeof actionPriority] ?? 1;

      if (aPriority !== bPriority) return bPriority - aPriority;

      const aScore = a.signal?.score ?? 0;
      const bScore = b.signal?.score ?? 0;
      return bScore - aScore;
    });
  }, [matches]);

  // 统计
  const stats = useMemo(() => {
    const betCount = lateGameMatches.filter(m => m.signal?.action === 'BET').length;
    const prepareCount = lateGameMatches.filter(m => m.signal?.action === 'PREPARE').length;
    const overSprintCount = lateGameMatches.filter(m => m.signal?.scenario_tag === 'OVER_SPRINT').length;
    const strongBehindCount = lateGameMatches.filter(m => m.signal?.scenario_tag === 'STRONG_BEHIND').length;

    return { betCount, prepareCount, overSprintCount, strongBehindCount, total: lateGameMatches.length };
  }, [lateGameMatches]);

  const handleMatchClick = (matchId: number) => {
    if (onMatchClick) {
      onMatchClick(matchId);
    } else {
      navigate(`/match/${matchId}`);
    }
  };

  if (lateGameMatches.length === 0) {
    return (
      <div className="bg-[#111] rounded-lg border border-[#333] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-[#ff6600]" />
          <h3 className="text-sm font-bold text-white">尾盘猎手</h3>
          <span className="text-xs text-[#666]">65'+ 进球机会</span>
        </div>
        <div className="text-center py-6 text-[#666]">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无 65+ 分钟比赛</p>
          <p className="text-xs mt-1">等待比赛进入尾盘阶段...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111] rounded-lg border border-[#333] overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-gradient-to-r from-[#ff6600]/10 to-transparent">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-[#ff6600]" />
          <h3 className="text-sm font-bold text-white">尾盘猎手</h3>
          <span className="px-1.5 py-0.5 bg-[#ff6600]/20 text-[#ff6600] text-xs rounded">
            {stats.total} 场
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {stats.betCount > 0 && (
            <span className="flex items-center gap-1 text-[#ef4444]">
              <Flame className="w-3.5 h-3.5" />
              {stats.betCount} 下注
            </span>
          )}
          {stats.prepareCount > 0 && (
            <span className="flex items-center gap-1 text-[#f97316]">
              <AlertTriangle className="w-3.5 h-3.5" />
              {stats.prepareCount} 准备
            </span>
          )}
        </div>
      </div>

      {/* 场景统计 */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-[#222] text-xs">
        <span className="text-[#666]">场景:</span>
        {stats.overSprintCount > 0 && (
          <span className="flex items-center gap-1 text-[#22c55e]">
            🎯 大球冲刺 x{stats.overSprintCount}
          </span>
        )}
        {stats.strongBehindCount > 0 && (
          <span className="flex items-center gap-1 text-[#f97316]">
            💪 强队反扑 x{stats.strongBehindCount}
          </span>
        )}
        {stats.overSprintCount === 0 && stats.strongBehindCount === 0 && (
          <span className="text-[#555]">无高价值场景</span>
        )}
      </div>

      {/* 比赛列表 */}
      <div className="max-h-[400px] overflow-auto">
        {lateGameMatches.map(({ match, signal, phase }) => {
          const scenario = signal?.scenario_tag ? SCENARIO_LABELS[signal.scenario_tag] : null;
          const action = signal?.action ?? 'IGNORE';
          const actionStyle = ACTION_STYLES[action];
          const score = Math.round(signal?.score ?? 0);
          const confidence = Math.round(signal?.confidence ?? 0);
          const isWarmup = signal?.is_warmup ?? false;

          return (
            <div
              key={match.id}
              onClick={() => handleMatchClick(match.id)}
              className={`flex items-center gap-3 px-4 py-3 border-b border-[#222] hover:bg-[#1a1a1a] cursor-pointer transition-colors ${
                action === 'BET' ? 'bg-[#ef4444]/5 border-l-2 border-l-[#ef4444]' :
                action === 'PREPARE' ? 'bg-[#f97316]/5 border-l-2 border-l-[#f97316]' :
                ''
              }`}
            >
              {/* 时间 */}
              <div className={`text-sm font-bold font-mono w-10 text-center ${
                match.minute >= 85 ? 'text-[#ef4444] animate-pulse' :
                match.minute >= 80 ? 'text-[#f97316]' :
                match.minute >= 75 ? 'text-[#eab308]' :
                'text-[#22c55e]'
              }`}>
                {match.minute}'
              </div>

              {/* 比赛信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[#888] text-xs truncate max-w-[120px]" title={formatLeagueWithCountry(match)}>
                    {formatLeagueWithCountry(match)}
                  </span>
                  <span className="text-white truncate">{match.home?.name}</span>
                  <span className="font-bold text-[#00d4ff]">{match.home?.score}</span>
                  <span className="text-[#444]">-</span>
                  <span className="font-bold text-[#ff6b6b]">{match.away?.score}</span>
                  <span className="text-white truncate">{match.away?.name}</span>
                </div>
                {/* 场景标签 */}
                {scenario && (
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${scenario.color}20`, color: scenario.color }}
                    >
                      {scenario.icon} {scenario.label}
                    </span>
                    {isWarmup && (
                      <span className="text-xs text-[#666]">预热中</span>
                    )}
                    {signal?.poisson_goal_prob && signal.poisson_goal_prob > 30 && (
                      <span className="text-xs text-[#22c55e]">
                        进球率 {Math.round(signal.poisson_goal_prob)}%
                      </span>
                    )}
                  </div>
                )}
              </div>

            {/* 评分和行动 + 作战室入口 */}
            <div className="flex items-center gap-2">
                {score > 0 && (
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      score >= 85 ? 'text-[#ef4444]' :
                      score >= 75 ? 'text-[#f97316]' :
                      score >= 65 ? 'text-[#eab308]' :
                      'text-[#888]'
                    }`}>
                      {score}
                    </div>
                    <div className="text-xs text-[#666]">/{confidence}</div>
                  </div>
                )}
                {action !== 'IGNORE' && (
                  <span className={`px-2 py-1 rounded text-xs font-bold ${actionStyle.bg} ${actionStyle.text}`}>
                    {actionStyle.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/battle?focusId=${match.id}`);
                  }}
                  className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#ff4444]/40 text-[10px] text-[#ff8888] hover:bg-[#ff4444]/15 transition-colors"
                  title="在作战室中查看"
                >
                  <Swords className="w-3 h-3" />
                  作战室
                </button>
                <ChevronRight className="w-4 h-4 text-[#444]" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-2 bg-[#0a0a0a] text-xs text-[#555] flex items-center justify-between">
        <span>整合: 大球冲刺 + 强队反扑</span>
        <span>75'+ 激活 | 65-74' 预热</span>
      </div>
    </div>
  );
}

export default LateGameHunterPanel;
