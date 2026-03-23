/**
 * ============================================
 * 比赛表格 V2 - 9列精简布局 + Module A 统一评分
 * 列: 赛事 | ⏱ | 主队（初：让球） | 比分 | （初：进球数）客队 | 动态 | 让球 | 大小 | 评分/置信
 * Phase 2A: 无假数据显示，缺失显示 N/A
 * ============================================
 */

import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Bug, Filter, Volume2 } from "lucide-react";
import type { AdvancedMatch } from "../../data/advancedMockData";
import { LEAGUE_COLORS } from "../../data/advancedMockData";
import type { UnifiedSignal } from "../../types/unified-scoring";
import {
  calculateDynamicScore,
  type ScoreResult,
} from "../../services/scoringEngine";
import { calculateSignalFromMatch } from "../../services/unifiedScoringEngine";
import { hasLiveOddsCoverage } from "../../config/constants";
import { MatchTimeline } from "./MatchTimeline";
import { DebugModal } from "./DebugModal";
import { ReasonsPanel } from "./SignalCard";
// v159: 晚期模块集成
import {
  calculateUnifiedLateSignal,
  shouldTriggerLateModule,
  getLateModulePhase,
  type UnifiedLateSignal,
  type ScenarioTag as ScenarioTagType,
  type TeamStrengthInfo,
} from "../../services/modules/unifiedLateModule";
import { CompactScenarioTag } from "../ui/ScenarioTag";
import { SimpleOddsBadge } from "../ui/OddsMovementBadge";
// v161: 积分榜服务 + 声音通知
import { batchGetMatchStrengths, type MatchStrengthMap } from "../../hooks/useStandings";
import { soundService, playSound } from "../../services/soundService";
// v162: 赔率历史追踪
import {
  batchRecordOddsSnapshots,
  getOddsMovementSummary,
  type OddsMovementSummary,
} from "../../services/oddsHistoryService";
import { OddsMovementBadge, type OddsMovement } from "../ui/OddsMovementBadge";
import { useLiveClock } from "../../hooks/useLiveClock";
import { formatMatchMinute } from "../../utils/matchTime";
import { formatLeagueWithCountry } from "../../utils/leagueDisplay";
import { CompactRating } from "./DynamicRating";
import { getDataHealthIcon, getOddsHealthIcon } from "../../utils/scoreVisuals";

// ============================================
// 筛选配置接口
// ============================================
export interface MatchTableFilters {
  oddsConfirmed?: boolean; // 只显示赔率确认的比赛
  hideNoOddsCoverage?: boolean; // 隐藏无赔率覆盖的比赛
  minMinute?: number; // 最小比赛分钟
  minRating?: number; // 最小评分
  oddsMode?: 'ALL' | 'WITH_LIVE' | 'WITHOUT_LIVE'; // 滚球盘口筛选模式
}

interface MatchTableV2Props {
  matches: AdvancedMatch[];
  onToggleWatch: (matchId: number) => void;
  watchedMatches?: Set<number>;
  filters?: MatchTableFilters; // 新增筛选参数
  showInlineFilters?: boolean; // 是否显示内联筛选按钮
  showImbalanceColumns?: boolean; // Phase 2: 是否显示失衡指标列
}

// Phase 2: 失衡指标计算结果
interface ImbalanceMetrics {
  shotsDiff: number;
  shotsOnTargetDiff: number;
  cornersDiff: number;
  imbalanceScore: number;
  attackingTeam: 'home' | 'away' | 'balanced';
}

interface MatchWithScore extends AdvancedMatch {
  scoreResult: ScoreResult | null;
  moduleASignal: UnifiedSignal | null;
  // v159: 晚期模块信号
  lateSignal: UnifiedLateSignal | null;
  latePhase: 'inactive' | 'warmup' | 'active';
}

const LIVE_WINDOW_MS = 5 * 60 * 1000; // 5分钟内视为“近期有滚球盘口”

export function MatchTableV2({
  matches,
  onToggleWatch,
  watchedMatches = new Set(),
  filters,
  showInlineFilters = false,
  showImbalanceColumns = false,
}: MatchTableV2Props) {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<"minute" | "score">("score");
  const [sortAsc, setSortAsc] = useState(false);

  // 内联筛选状态（仅当 showInlineFilters 为 true 时使用）
  const [inlineOddsConfirmed, setInlineOddsConfirmed] = useState(false);

  // v161: 球队强弱信息状态
  const [strengthMap, setStrengthMap] = useState<MatchStrengthMap>({});
  const strengthLoadedRef = useRef<Set<number>>(new Set());

  // v161: 声音通知 - 追踪已通知的比赛
  const notifiedMatchesRef = useRef<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(soundService.isEnabled());
  const lastSeenLiveAtRef = useRef<Map<number, number>>(new Map());

  // v161: 获取球队强弱数据
  useEffect(() => {
    // Filter to matches with valid leagueId and team IDs
    const lateMatches = matches.filter(m =>
      m.minute >= 65 &&
      m.stats?._realDataAvailable &&
      !strengthLoadedRef.current.has(m.id) &&
      m.leagueId !== undefined &&
      m.home?.id !== undefined &&
      m.away?.id !== undefined
    );

    if (lateMatches.length === 0) return;

    // 标记正在加载
    for (const m of lateMatches) {
      strengthLoadedRef.current.add(m.id);
    }

    // 异步获取强弱数据 - map to required type
    const matchesForStrength = lateMatches.map(m => ({
      id: m.id,
      leagueId: m.leagueId as number,
      home: { id: m.home.id as number },
      away: { id: m.away.id as number },
      minute: m.minute,
    }));

    batchGetMatchStrengths(matchesForStrength).then((result) => {
      if (Object.keys(result).length > 0) {
        setStrengthMap(prev => ({ ...prev, ...result }));
      }
    }).catch(err => {
      console.warn('[MatchTableV2] Failed to fetch team strengths:', err);
    });
  }, [matches]);

  // v162: 记录赔率历史快照
  useEffect(() => {
    // 过滤有赔率数据的比赛
    const matchesWithOdds = matches.filter(m => m.odds?._fetch_status === 'SUCCESS');
    if (matchesWithOdds.length > 0) {
      batchRecordOddsSnapshots(matchesWithOdds);
    }
  }, [matches]);

  // 加强评分 + 排序
  const matchesWithScores: MatchWithScore[] = useMemo(() => {
    const now = Date.now();

    return matches.map((m) => {
      // 🔥 DEBUG: 每个 fixture 的赔率和统计数据获取状态
      const hasOdds = m.odds?._fetch_status === 'SUCCESS';
      const hasStats = m.stats?._realDataAvailable === true;
      const hasLiveOdds = hasOdds && m.odds?._is_live === true;
      const hasPrematchOdds = hasOdds && m.odds?._source === 'PREMATCH';

      // 记录最近一次看到 live 盘口的时间戳（用于“粘滞式” WITH_LIVE 过滤）
      if (hasLiveOdds) {
        lastSeenLiveAtRef.current.set(m.id, now);
      }

      console.log(`[Odds Debug] fixture=${m.id} | ${m.home.name} vs ${m.away.name}`, {
        hasOdds,
        hasLiveOdds,
        hasPrematchOdds,
        oddsSource: m.odds?._source,
        fetchStatus: m.odds?._fetch_status,
        hasStats,
        statsAvailable: m.stats?._realDataAvailable,
        xgHome: m.stats?.xG?.home ?? null,
        xgAway: m.stats?.xG?.away ?? null,
      });

      // 计算 Module A 信号（只在 65'+ 且有数据时）
      let moduleASignal: UnifiedSignal | null = null;
      let lateSignal: UnifiedLateSignal | null = null;
      let scoreResult: ScoreResult | null = null;
      const latePhase = getLateModulePhase(m.minute);

      try {
        // 计算评分
        scoreResult = calculateDynamicScore(m);

        if (m.minute >= 65 && m.stats?._realDataAvailable && !m._unscoreable) {
          moduleASignal = calculateSignalFromMatch("A", m);
        }

        // v159: 计算晚期模块信号
        if (shouldTriggerLateModule(m.minute) && m.stats?._realDataAvailable && !m._unscoreable) {
          // 计算红牌数
          const redCardsHome = m.cards?.red?.home ?? 0;
          const redCardsAway = m.cards?.red?.away ?? 0;

          // 计算最近进球数（从 events 中提取）
          const recentGoals = m.events?.filter(e =>
            e.type === 'Goal' &&
            e.minute !== undefined &&
            e.minute >= m.minute - 15
          ).length ?? 0;

          // 计算最近进攻换人
          const recentSubsAttack = m.substitutions?.filter(s =>
            s.minute >= m.minute - 10 &&
            (s.type === 'attack' || s.playerInPosition === 'FW' || s.playerInPosition === 'MF')
          ).length ?? 0;

          // 构建 MatchStateInput
          const matchState = {
            fixture_id: m.id,
            minute: m.minute,
            score_home: m.home?.score ?? 0,
            score_away: m.away?.score ?? 0,
            status: m.status ?? 'live',
            shots_home: m.stats?.shots?.home ?? 0,
            shots_away: m.stats?.shots?.away ?? 0,
            shots_on_home: m.stats?.shotsOnTarget?.home ?? 0,
            shots_on_away: m.stats?.shotsOnTarget?.away ?? 0,
            xg_home: m.stats?.xG?.home ?? 0,
            xg_away: m.stats?.xG?.away ?? 0,
            corners_home: m.corners?.home ?? 0,
            corners_away: m.corners?.away ?? 0,
            possession_home: m.stats?.possession?.home ?? 50,
            possession_away: m.stats?.possession?.away ?? 50,
            dangerous_home: m.stats?.dangerousAttacks?.home ?? 0,
            dangerous_away: m.stats?.dangerousAttacks?.away ?? 0,
            shots_last_15: 0,
            xg_last_15: 0,
            shots_prev_15: 0,
            corners_last_15: 0,
            red_cards_home: redCardsHome,
            red_cards_away: redCardsAway,
            recent_goals: recentGoals,
            recent_subs_attack: recentSubsAttack,
            stats_available: m.stats?._realDataAvailable === true,
            events_available: (m.events?.length ?? 0) > 0,
            data_timestamp: new Date().toISOString(),
          };

          // 构建 MarketStateInput (如果有赔率数据)
          let marketState = null;
          if (m.odds?._fetch_status === 'SUCCESS') {
            marketState = {
              fixture_id: m.id,
              over_odds: m.odds?.overUnder?.over ?? null,
              under_odds: m.odds?.overUnder?.under ?? null,
              over_odds_prev: null,
              ou_line: m.odds?.overUnder?.total ?? null,
              ah_line: m.odds?.handicap?.value ?? null,
              ah_home: m.odds?.handicap?.home ?? null,
              ah_away: m.odds?.handicap?.away ?? null,
              ah_line_prev: null,
              win_home: m.odds?.matchWinner?.home ?? null,
              win_draw: m.odds?.matchWinner?.draw ?? null,
              win_away: m.odds?.matchWinner?.away ?? null,
              bookmaker: m.odds?._bookmaker ?? 'unknown',
              is_live: m.odds?._is_live ?? true,
              captured_at: m.odds?._captured_at ?? new Date().toISOString(),
            };
          }

          // v161: 使用积分榜数据计算球队强弱
          const teamStrength = strengthMap[m.id];

          lateSignal = calculateUnifiedLateSignal(matchState, marketState, teamStrength);
        }
      } catch (err) {
        console.warn(`[MatchTableV2] Error processing match ${m.id}:`, err);
        // 继续处理，不中断整个列表
      }

      return {
        ...m,
        scoreResult,
        moduleASignal,
        lateSignal,
        latePhase,
      };
    });
  }, [matches, strengthMap]);

  // 应用筛选器和排序
  const processedMatches = useMemo(() => {
    let filteredMatches = matchesWithScores;

    const effectiveOddsConfirmed = filters?.oddsConfirmed ?? inlineOddsConfirmed;

    if (effectiveOddsConfirmed) {
      filteredMatches = filteredMatches.filter(
        (m) =>
          m.scoreResult?.factors.oddsFactor?.dataAvailable &&
          (m.scoreResult?.factors.oddsFactor?.score ?? 0) >= 5
      );
    }

    if (filters?.hideNoOddsCoverage) {
      filteredMatches = filteredMatches.filter((m) => hasLiveOddsCoverage(m.leagueId));
    }

    if (filters?.minMinute && filters.minMinute > 0) {
      filteredMatches = filteredMatches.filter((m) => m.minute >= filters.minMinute!);
    }

    if (filters?.minRating && filters.minRating > 0) {
      filteredMatches = filteredMatches.filter(
        (m) => (m.scoreResult?.totalScore ?? 0) >= filters.minRating!
      );
    }

    // 新增：根据滚球盘口模式筛选（WITH_LIVE 使用“粘滞式”时间窗口）
    const oddsMode = filters?.oddsMode ?? 'ALL';
    if (oddsMode === 'WITH_LIVE') {
      const now = Date.now();
      filteredMatches = filteredMatches.filter((m) => {
        const lastSeen = lastSeenLiveAtRef.current.get(m.id);
        if (typeof lastSeen !== 'number') return false;
        return now - lastSeen <= LIVE_WINDOW_MS;
      });
    } else if (oddsMode === 'WITHOUT_LIVE') {
      filteredMatches = filteredMatches.filter(
        (m) => m.odds?._is_live !== true
      );
    }

    return filteredMatches.sort((a, b) => {
      if (sortField === "score") {
        // v159: 优先使用晚期模块分数，回退到 Module A，最后用旧评分
        const aScore = a.lateSignal?.score ?? a.moduleASignal?.score ?? a.scoreResult?.totalScore ?? 0;
        const bScore = b.lateSignal?.score ?? b.moduleASignal?.score ?? b.scoreResult?.totalScore ?? 0;

        // BET/PREPARE 行动置顶
        const aAction = a.lateSignal?.action ?? a.moduleASignal?.action ?? 'IGNORE';
        const bAction = b.lateSignal?.action ?? b.moduleASignal?.action ?? 'IGNORE';
        const actionPriority = { BET: 4, PREPARE: 3, WATCH: 2, IGNORE: 1 };
        const aPriority = actionPriority[aAction as keyof typeof actionPriority] ?? 1;
        const bPriority = actionPriority[bAction as keyof typeof actionPriority] ?? 1;

        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }

        return sortAsc ? aScore - bScore : bScore - aScore;
      }
      // 时间排序：进行中按分钟倒序，未开始按开赛时间升序
      const aIsLive = !["NS", "未开始"].includes(a.status);
      const bIsLive = !["NS", "未开始"].includes(b.status);

      if (aIsLive && bIsLive) {
        return sortAsc ? a.minute - b.minute : b.minute - a.minute;
      }
      if (aIsLive && !bIsLive) return -1;
      if (!aIsLive && bIsLive) return 1;
      // 都是未开始，按开赛时间升序
      return sortAsc ? b.minute - a.minute : a.minute - b.minute;
    });
  }, [matchesWithScores, sortField, sortAsc, filters, inlineOddsConfirmed]);

  // v161: 声音通知 - 检测新的高分信号
  useEffect(() => {
  if (!soundEnabled) return;

  for (const match of processedMatches) {
    const signal = match.lateSignal ?? match.moduleASignal;
    if (!signal) continue;

    const action = signal.action;
    const score = signal.score;
    const notifyKey = `${match.id}:${action}:${match.minute}`;

    // 只通知 BET 或高分 PREPARE
    if (action === 'BET' && !notifiedMatchesRef.current.has(notifyKey)) {
      notifiedMatchesRef.current.add(notifyKey);
      playSound('high_score');
      console.log(`[SoundNotify] BET signal: ${match.home.name} vs ${match.away.name} (${match.minute}') score=${score}`);
    } else if (action === 'PREPARE' && score >= 80 && !notifiedMatchesRef.current.has(notifyKey)) {
      notifiedMatchesRef.current.add(notifyKey);
      playSound('alert');
      console.log(`[SoundNotify] PREPARE signal: ${match.home.name} vs ${match.away.name} (${match.minute}') score=${score}`);
    }

    // 强队追分特殊音效
    if (match.lateSignal?.scenario_tag === 'STRONG_BEHIND' && score >= 75) {
      const strongKey = `${match.id}:STRONG_BEHIND`;
      if (!notifiedMatchesRef.current.has(strongKey)) {
        notifiedMatchesRef.current.add(strongKey);
        playSound('strong_behind');
      }
    }
  }
}, [processedMatches, soundEnabled]);

// 统计被过滤的比赛数量
const filterStats = useMemo(() => {
  const total = matches.length;
  const displayed = processedMatches.length;
  const filtered = total - displayed;

  // 统计赔率确认的比赛数量
  const oddsConfirmedCount = matches.filter((m) => {
    const scoreResult = calculateDynamicScore(m);
    return (
      scoreResult?.factors.oddsFactor?.dataAvailable &&
      (scoreResult?.factors.oddsFactor?.score ?? 0) >= 5
    );
  }).length;

  return { total, displayed, filtered, oddsConfirmedCount };
}, [matches, processedMatches]);

// v161: 切换声音
const toggleSound = () => {
  const newEnabled = !soundEnabled;
  setSoundEnabled(newEnabled);
  soundService.setEnabled(newEnabled);
  if (newEnabled) {
    soundService.warmup();
    soundService.test('notification');
  }
};

const handleSort = (field: "minute" | "score") => {
  if (sortField === field) {
    setSortAsc(!sortAsc);
  } else {
    setSortField(field);
    setSortAsc(false);
  }
};

if (matches.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="text-6xl mb-4">&#9917;</div>
      <p className="text-[#888] text-lg">暂无可评分比赛</p>
      <p className="text-[#555] text-sm mt-2">{matches.length} 场比赛进行中</p>
    </div>
  );
}

return (
  <div className="overflow-x-auto">
    {/* 内联筛选栏（可选） */}
    {showInlineFilters && (
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#0d0d0d] border-b border-[#222] text-[11px]">
        <Filter className="w-3 h-3 text-[#555]" />
        <button
          type="button"
          onClick={() => setInlineOddsConfirmed(!inlineOddsConfirmed)}
          className={`px-2 py-0.5 rounded transition-colors ${
            inlineOddsConfirmed
              ? "bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/50"
              : "text-[#888] hover:text-[#aaa] border border-transparent hover:border-[#333]"
          }`}
        >
          赔率确认
          {filterStats.oddsConfirmedCount > 0 && (
            <span className="ml-1 opacity-70">
              ({filterStats.oddsConfirmedCount})
            </span>
          )}
        </button>

        {/* v161: 声音开关 */}
        <button
          type="button"
          onClick={toggleSound}
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
            soundEnabled
              ? "bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/50"
              : "text-[#666] hover:text-[#888] border border-transparent hover:border-[#333]"
          }`}
          title={soundEnabled ? '关闭声音通知' : '开启声音通知'}
        >
          <Volume2 className="w-3 h-3" />
          {soundEnabled ? '声音开' : '静音'}
        </button>

        {filterStats.filtered > 0 && (
          <span className="text-[#555] ml-auto">
            已筛选 {filterStats.displayed}/{filterStats.total} 场
          </span>
        )}
      </div>
    )}

    <table className="w-full min-w-[780px] border-collapse">
      <thead>
        <tr className="bg-[#0d1117] border-b border-[#21262d]">
          <th
            className="w-[70px] px-2 py-2.5 text-center text-[11px] font-medium text-[#888] cursor-pointer hover:text-[#00d4ff]"
            onClick={() => handleSort("minute")}
          >
            <div className="flex items-center justify-center gap-1">
              时间
              {sortField === "minute" &&
                (sortAsc ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                ))}
            </div>
          </th>
          <th className="w-[280px] px-2 py-2.5 text-left text-[11px] font-medium text-[#888]">
            对阵 / 比分
          </th>
          <th className="px-2 py-2.5 text-center text-[11px] font-medium text-[#888]">
            场面概览
          </th>
        </tr>
      </thead>
      <tbody>
        {processedMatches.map((match) => (
          <MatchRow
            key={match.id}
            match={match}
            isWatched={watchedMatches.has(match.id)}
            onToggleWatch={() => onToggleWatch(match.id)}
            onViewDetail={() => navigate(`/match/${match.id}`)}
            showImbalanceColumns={showImbalanceColumns}
          />
        ))}
      </tbody>
    </table>

    {/* 筛选结果为空提示 */}
    {processedMatches.length === 0 && matches.length > 0 && (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-4xl mb-3 opacity-50">🔍</div>
        <p className="text-[#888] text-sm">无符合筛选条件的比赛</p>
        <p className="text-[#555] text-xs mt-1">
          共 {matches.length} 场比赛，{filterStats.oddsConfirmedCount} 场有赔率确认
        </p>
      </div>
    )}
  </div>
);
}

// 单行组件
function MatchRow({
  match,
  isWatched,
  onToggleWatch,
  onViewDetail,
  showImbalanceColumns = false,
}: {
  match: MatchWithScore;
  isWatched: boolean;
  onToggleWatch: () => void;
  onViewDetail: () => void;
  showImbalanceColumns?: boolean;
}) {
  const liveClockTick = useLiveClock(5000);
  const deltaMinutes = 0; // 比赛时间完全以 API 的 elapsed 为准，不再做本地分钟推算
  const [showDebug, setShowDebug] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  // v159: 优先使用晚期模块信号
  const lateSignal = match.lateSignal;
  const moduleASignal = match.moduleASignal;

  // 使用晚期模块分数（如果存在），否则回退 - 取整数
  const rawRating = lateSignal?.score ?? moduleASignal?.score ?? match.scoreResult?.totalScore ?? 0;
  const rawConfidence = lateSignal?.confidence ?? moduleASignal?.confidence ?? match.scoreResult?.confidence ?? 0;
  const rating = Math.round(rawRating);
  const confidence = Math.round(rawConfidence);
  const hasStats = match.stats?._realDataAvailable === true;
  const isUnscoreable = match._unscoreable === true;

  // v159: 场景标签和预热状态
  const scenarioTag = lateSignal?.scenario_tag ?? null;
  const isWarmup = lateSignal?.is_warmup ?? false;
  const latePhase = match.latePhase;

  // Phase 2: 计算失衡指标
  const imbalanceMetrics = useMemo((): ImbalanceMetrics => {
    const stats = match.stats;
    if (!stats || !stats._realDataAvailable) {
      return {
        shotsDiff: 0,
        shotsOnTargetDiff: 0,
        cornersDiff: 0,
        imbalanceScore: 0,
        attackingTeam: 'balanced',
      };
    }

    const shotsDiff = (stats.shots?.home ?? 0) - (stats.shots?.away ?? 0);
    const shotsOnTargetDiff = (stats.shotsOnTarget?.home ?? 0) - (stats.shotsOnTarget?.away ?? 0);
    const cornersDiff = (match.corners?.home ?? 0) - (match.corners?.away ?? 0);
    const xgDiff = (stats.xG?.home ?? 0) - (stats.xG?.away ?? 0);
    const possessionDiff = (stats.possession?.home ?? 50) - (stats.possession?.away ?? 50);

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
      cornersDiff,
      imbalanceScore,
      attackingTeam,
    };
  }, [match.stats, match.corners]);

  const getMinuteStyle = () => {
    const status = match.status?.toLowerCase?.() ?? match.status;
    if (status === "ht") return "text-[#ffaa00]";
    if (status === "ns" || status === "未开始") return "text-[#666]";
    if (status === "ft" || status === "aet" || status === "pen")
      return "text-[#888]";
    if (match.minute >= 85) return "text-[#ff4444] animate-pulse";
    if (match.minute >= 80) return "text-[#ff6600]";
    if (match.minute >= 75) return "text-[#ffaa00]";
    return "text-[#00ff88]";
  };

  const getRatingStyle = () => {
    if (isUnscoreable || rating === 0) return "text-[#666]";
    if (rating >= 85) return "text-[#ff4444]";
    if (rating >= 80) return "text-[#ff6600]";
    if (rating >= 70) return "text-[#ffaa00]";
    return "text-[#888]";
  };

  const getConfidenceStyle = () => {
    if (confidence >= 70) return "text-[#22c55e]";
    if (confidence >= 55) return "text-[#eab308]";
    return "text-[#888]";
  };

  const getActionBadge = () => {
    // v159: 优先使用晚期模块 action
    const signal = lateSignal ?? moduleASignal;
    if (!signal) return null;

    const { action } = signal;
    const styles: Record<string, string> = {
      BET: "bg-[#ef4444]/20 text-[#ef4444]",
      PREPARE: "bg-[#f97316]/20 text-[#f97316]",
      WATCH: "bg-[#eab308]/20 text-[#eab308]",
      IGNORE: "bg-[#6b7280]/20 text-[#6b7280]",
    };
    const labels: Record<string, string> = {
      BET: "下注",
      PREPARE: "准备",
      WATCH: isWarmup ? "预热" : "关注",
      IGNORE: "",
    };
    if (action === "IGNORE") return null;
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${styles[action]} ${isWarmup ? 'opacity-75' : ''}`}
      >
        {labels[action]}
      </span>
    );
  };

  const hasRedCard = (match.cards?.red?.home ?? 0) + (match.cards?.red?.away ?? 0) > 0;
  const totalGoals = (match.home?.score ?? 0) + (match.away?.score ?? 0);

  const getRowStyle = () => {
    const action = lateSignal?.action ?? moduleASignal?.action;

    if (action === "BET") {
      return "bg-[#1a0a0a] hover:bg-[rgba(239,68,68,0.1)] border-l-2 border-l-[#ef4444]";
    }
    if (action === "PREPARE") {
      return "bg-[#1a120a] hover:bg-[rgba(249,115,22,0.1)] border-l-2 border-l-[#f97316]";
    }
    if (isWarmup && action === "WATCH") {
      return "bg-[#1a1a0a] hover:bg-[rgba(234,179,8,0.08)] border-l-2 border-l-[#eab308]/50";
    }
    if (match.minute >= 75 && rating >= 80) {
      return "bg-[#1a0a0a] hover:bg-[rgba(255,68,68,0.08)] border-l-2 border-l-[#ff4444]";
    }
    if (match.minute >= 75 && rating >= 70) {
      return "bg-[#1a1a0a] hover:bg-[rgba(255,170,0,0.08)] border-l-2 border-l-[#ffaa00]";
    }
    if (hasRedCard) {
      return "bg-[#160a0a] hover:bg-[rgba(239,68,68,0.06)]";
    }
    if (totalGoals >= 3) {
      return "bg-[#0a160a] hover:bg-[rgba(34,197,94,0.06)]";
    }
    if (match.minute >= 65) {
      return "bg-[#0d1117] hover:bg-[rgba(0,255,136,0.06)]";
    }
    return "bg-[#0d1117] hover:bg-[#151b23]";
  };

  // 让球盘显示 - Phase 2A: 无假数据
  const handicapOdds = useMemo(() => {
    // 🔥 DEBUG: 检查 match.odds 内容
    console.log(`[ODDS_DEBUG_UI] fixture=${match.id} | odds:`, {
      hasOdds: !!match.odds,
      fetchStatus: match.odds?._fetch_status,
      source: match.odds?._source,
      handicapValue: match.odds?.handicap?.value,
      ouTotal: match.odds?.overUnder?.total,
    });

    // 检查是否有真实数据
    const oddsSource = match.odds?._fetch_status;
    const handicapValue = match.odds?.handicap?.value;

    // 如果无真实数据或值为 null，显示 N/A
    if (
      oddsSource !== "SUCCESS" ||
      handicapValue === null ||
      handicapValue === undefined
    ) {
      return {
        home: "N/A",
        line: "N/A",
        away: "N/A",
        isReal: false,
        reason: match.odds?._no_data_reason || "NO_DATA",
      };
    }

    const ah = match.odds.handicap;
    return {
      home: ah.home !== null ? ah.home.toFixed(2) : "N/A",
      line: handicapValue > 0 ? `+${handicapValue}` : String(handicapValue),
      away: ah.away !== null ? ah.away.toFixed(2) : "N/A",
      isReal: true,
      reason: null,
    };
  }, [match.odds]);

  // 大小球显示 - Phase 2A: 无假数据 + 主盘标识 + 所有可用线
  const overUnderOdds = useMemo(() => {
    // 检查是否有真实数据
    const oddsSource = match.odds?._fetch_status;
    const ouTotal = match.odds?.overUnder?.total;
    const allLines = match.odds?.overUnder?.allLines || [];

    // 如果无真实数据或值为 null，显示 N/A
    if (oddsSource !== "SUCCESS" || ouTotal === null || ouTotal === undefined) {
      return {
        over: "N/A",
        lineDisplay: "N/A", // 用于显示的盘口（带"大"前缀）
        lineValue: null as number | null, // 纯数值（用于悬浮提示）
        under: "N/A",
        isReal: false,
        reason: match.odds?._no_data_reason || "NO_DATA",
        allLines: [] as Array<{
          line: number;
          over: number | null;
          under: number | null;
          isMain: boolean;
        }>,
        hasMultipleLines: false,
      };
    }

    const ou = match.odds.overUnder;
    // 显示格式: "大 2.5" 明确表示主盘口
    const lineDisplay = `大 ${ouTotal}`;

    return {
      over: ou.over !== null ? ou.over.toFixed(2) : "N/A",
      lineDisplay, // 带"大"前缀的显示值
      lineValue: ouTotal, // 纯数值
      under: ou.under !== null ? ou.under.toFixed(2) : "N/A",
      isReal: true,
      reason: null,
      allLines, // 所有可用的 O/U 线
      hasMultipleLines: allLines.length > 1, // 是否有多条线可显示
    };
  }, [match.odds]);

  // Phase 1.5: 赔率状态 - 增加联赛覆盖检测
  const oddsStatus = useMemo(() => {
    const source = match.odds?._source;
    const fetchStatus = match.odds?._fetch_status;
    const capturedAt = match.odds?._captured_at;
    const leagueId = match.leagueId;
    const hasCoverage = hasLiveOddsCoverage(leagueId);

    // 计算 captured_at 相对时间
    let timeAgo: string | null = null;
    if (capturedAt) {
      const diff = Date.now() - new Date(capturedAt).getTime();
      const minutes = Math.floor(diff / 1000 / 60);
      if (minutes < 1) timeAgo = "<1m";
      else if (minutes < 60) timeAgo = `${minutes}m`;
      else timeAgo = `${Math.floor(minutes / 60)}h`;
    }

    if (fetchStatus === "SUCCESS" && source === "API-Football") {
      return {
        icon: "✓",
        color: "text-green-400",
        status: "LIVE",
        timeAgo,
        tooltip: "滚球赔率实时更新",
        hasCoverage: true,
      };
    }
    // 使用赛前赔率作为回退
    if (fetchStatus === "SUCCESS" && source === "PREMATCH") {
      return {
        icon: "◎",
        color: "text-cyan-400",
        status: "初盘",
        timeAgo,
        tooltip: "使用赛前赔率（滚球赔率暂不可用）",
        hasCoverage: true,
      };
    }
    // Phase 3.2: 使用 The Odds API 作为第三回退
    if (fetchStatus === "SUCCESS" && source === "TheOddsAPI") {
      return {
        icon: "⚡",
        color: "text-purple-400",
        status: "外源",
        timeAgo,
        tooltip: "使用 The Odds API 第三方数据源",
        hasCoverage: true,
      };
    }
    if (fetchStatus === "EMPTY") {
      // 区分: 联赛无覆盖 vs 暂时无数据
      if (!hasCoverage) {
        return {
          icon: "○",
          color: "text-gray-500",
          status: "无覆盖",
          timeAgo: null,
          tooltip: "该联赛暂无滚球赔率覆盖",
          hasCoverage: false,
        };
      }
      return {
        icon: "◌",
        color: "text-yellow-500",
        status: "待开盘",
        timeAgo: null,
        tooltip: "赔率暂未开放，稍后刷新",
        hasCoverage: true,
      };
    }
    if (fetchStatus === "ERROR") {
      return {
        icon: "!",
        color: "text-red-500",
        status: "ERR",
        timeAgo: null,
        tooltip: "赔率获取失败",
        hasCoverage,
      };
    }
    if (source === "N/A" || source === "GENERATED") {
      return {
        icon: "",
        color: "text-gray-500",
        status: "N/A",
        timeAgo: null,
        tooltip: hasCoverage ? "等待数据" : "该联赛暂无滚球赔率",
        hasCoverage,
      };
    }
    return {
      icon: "",
      color: "text-gray-600",
      status: "N/A",
      timeAgo: null,
      tooltip: "无赔率数据",
      hasCoverage,
    };
  }, [match.odds, match.leagueId]);

  // 获取初盘让球显示值 - Phase 2A
  const prematchHandicapDisplay = useMemo(() => {
    // 优先使用聚合层提供的赛前初盘快照，其次回退到旧直连模式的 home.handicap
    const value = match.initialHandicap ?? match.home?.handicap ?? null;
    if (value === null || value === undefined) {
      return null; // 不显示
    }
    return value > 0 ? `+${value}` : String(value);
  }, [match.initialHandicap, match.home]);

  // 获取初盘大小球显示值 - Phase 2A
  const prematchOUDisplay = useMemo(() => {
    const value = match.initialOverUnder ?? match.away?.overUnder ?? null;
    if (value === null || value === undefined) {
      return null; // 不显示
    }
    return String(value);
  }, [match.initialOverUnder, match.away]);

  // v162: 赔率历史趋势
  const oddsMovement = useMemo((): OddsMovementSummary | null => {
    return getOddsMovementSummary(match.id);
  }, [match.id, match.odds]); // 依赖 odds 变化时重新计算
  const minuteDisplay = formatMatchMinute(match);
  const shotsHome = match.stats?.shots?.home ?? 0;
  const shotsAway = match.stats?.shots?.away ?? 0;
  const cornersHome = match.corners?.home ?? 0;
  const cornersAway = match.corners?.away ?? 0;
  const healthScore = match.scoreResult?.dataHealthScore ?? 0;
  const dataHealthIcon = getDataHealthIcon(healthScore);
  const oddsIcon = getOddsHealthIcon(match.scoreResult?.oddsHealthLevel);

  return (
    <>
      <tr
        className={`${getRowStyle()} border-b border-[#222] cursor-pointer transition-colors`}
        onClick={onViewDetail}
      >
        {/* 时间 */}
        <td
          className={`px-2 py-2 text-center text-[13px] font-bold ${getMinuteStyle()}`}
        >
          {minuteDisplay}
        </td>

        {/* 对阵 / 比分 */}
        <td className="px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div
                className="text-[11px] truncate"
                style={{ color: LEAGUE_COLORS[match.league] || LEAGUE_COLORS[match.leagueShort ?? ''] || '#888' }}
                title={formatLeagueWithCountry(match)}
              >
                {formatLeagueWithCountry(match)}
              </div>
              <div className="flex items-center gap-1 text-[12px] text-[#e0e0e0] truncate">
                <TeamLabel name={match.home?.name || "-"} rank={match.home?.rank} redCards={match.cards?.red?.home ?? 0} redMinutes={getRedCardMinutes(match, 'home')} />
                <span className="text-[#555] text-[10px] flex-shrink-0">vs</span>
                <TeamLabel name={match.away?.name || "-"} rank={match.away?.rank} redCards={match.cards?.red?.away ?? 0} redMinutes={getRedCardMinutes(match, 'away')} />
              </div>
            </div>
            <span className="text-[16px] font-bold font-mono whitespace-nowrap">
              <span className={match.home?.score > match.away?.score ? "text-[#22d3ee]" : "text-white"}>
                {match.home?.score ?? "-"}
              </span>
              <span className="text-[#444] mx-1">-</span>
              <span className={match.away?.score > match.home?.score ? "text-[#f87171]" : "text-white"}>
                {match.away?.score ?? "-"}
              </span>
            </span>
          </div>
        </td>

        {/* 场面概览 */}
        <td className="px-2 py-2">
          <div className="space-y-1">
            <div className="text-[11px] text-[#aaa] text-center">
              射门 {shotsHome}-{shotsAway} · 角球 {cornersHome}-{cornersAway}
            </div>
            <MatchTimeline match={match} />
          </div>
        </td>

      </tr>

      {/* Debug Modal - v159: 传递晚期模块信号 */}
      {showDebug && (
        <DebugModal
          match={match}
          signal={lateSignal ?? moduleASignal}
          lateSignal={lateSignal}
          onClose={() => setShowDebug(false)}
        />
      )}

      {/* Reasons Panel - v159: 支持晚期模块 */}
      {showReasons && (lateSignal || moduleASignal) && (
        <ReasonsPanel
          signal={(lateSignal ?? moduleASignal) as UnifiedSignal}
          onClose={() => setShowReasons(false)}
        />
      )}
    </>
  );
}

// Phase 2: 失衡指标单元格组件
function ImbalanceCell({
  value,
  hasData,
  colorThreshold,
}: {
  value: number;
  hasData: boolean;
  colorThreshold: number;
}) {
  if (!hasData) {
    return <span className="text-[11px] text-[#555]">-</span>;
  }

  const absValue = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '' : '';

  // 颜色根据绝对值大小
  let colorClass = 'text-[#888]';
  if (absValue >= colorThreshold) {
    colorClass = value > 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'; // 主队优势绿色，客队优势红色
  } else if (absValue >= colorThreshold / 2) {
    colorClass = 'text-[#eab308]';
  }

  return (
    <span className={`text-[11px] font-mono font-medium ${colorClass}`}>
      {sign}{value}
    </span>
  );
}

function getRedCardMinutes(match: AdvancedMatch, side: 'home' | 'away'): number[] {
  if (!match.events) return [];
  return match.events
    .filter((ev) => {
      const t = (ev.type ?? '').toLowerCase();
      const d = (ev.detail ?? '').toLowerCase();
      const isRed = t === 'card' && (d.includes('red') || d.includes('second yellow'));
      const isSide = ev.teamSide === side ||
        (side === 'home' && ev.team?.id === match.homeTeamId) ||
        (side === 'away' && ev.team?.id !== match.homeTeamId && ev.team?.id != null);
      return isRed && isSide;
    })
    .map((ev) => ev.time?.elapsed ?? ev.minute ?? 0)
    .sort((a, b) => a - b);
}

function TeamLabel({ name, rank, redCards, redMinutes = [] }: {
  name: string;
  rank?: number | null;
  redCards: number;
  redMinutes?: number[];
}) {
  return (
    <span className="inline-flex items-center gap-0.5 truncate">
      {(rank ?? 0) > 0 && (
        <span className="text-[9px] font-mono bg-[#2a2a2a] text-[#aaa] px-1 rounded flex-shrink-0">
          {rank}
        </span>
      )}
      <span className="truncate">{name}</span>
      {redCards > 0 && (
        <span
          className="text-[9px] bg-red-500/20 text-red-400 px-0.5 rounded flex-shrink-0 font-bold"
          title={redMinutes.length > 0 ? `红牌: ${redMinutes.map(m => m + "'").join(', ')}` : undefined}
        >
          🟥{redMinutes.length > 0 ? redMinutes.map(m => m + "'").join(',') : redCards}
        </span>
      )}
    </span>
  );
}

export default MatchTableV2;
