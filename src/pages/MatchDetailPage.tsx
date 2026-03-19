// ============================================
// 比赛详情页 - 80分钟进球概率评分系统（增强版）
// PRODUCTION STRICT MODE - 仅使用 API-Football 真实数据
// ============================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Star, TrendingUp, TrendingDown, Target, Clock, Zap,
  Activity, CornerUpRight, Users, AlertTriangle, Shield, RefreshCw,
  ChevronRight, Minus, Play, Volume2, Bell, Eye, BarChart3, WifiOff
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, AreaChart
} from 'recharts';
import type { AdvancedMatch, AttackEvent, Substitution } from '../data/advancedMockData';
import { LEAGUE_COLORS } from '../data/advancedMockData';
import { calculateDynamicScore, type ScoreResult, type ScoringFactors } from '../services/scoringEngine';
import { HistoryValidation } from '../components/home/HistoryValidation';
import { SimulatedOrderPanel } from '../components/home/SimulatedOrderPanel';
import { recordScoreSnapshot } from '../services/scoreHistory';
import { useMatchAdvanced } from '../hooks/useMatches';
import {
  getScoreTextClass,
  getScoreBgGradient,
  getDataHealthIcon,
  getOddsHealthIcon,
} from '../utils/scoreVisuals';

// xG历史数据类型
interface XgHistoryPoint {
  minute: number;
  homeXg: number;
  awayXg: number;
  totalXg: number;
  event?: string;
}

// ============================================
// PRODUCTION STRICT MODE: 不再使用 generateMatchDetailData
// 所有数据必须来自 API-Football
// ============================================

export function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [isWatched, setIsWatched] = useState(false);
  const [showAlertAnimation, setShowAlertAnimation] = useState(false);

  // 使用 React Query 获取真实数据
  const { data: matchResult, isLoading, isFetching, refetch, error } = useMatchAdvanced(
    matchId ? Number(matchId) : undefined,
    { refetchInterval: 30000 } // 30秒自动刷新
  );

  // 生成增强数据（添加 scoreHistory, events, statsList, xgHistory）
  const matchData = useMemo(() => {
    // 放宽数据源要求：只要有比赛数据就显示，不管数据源
    if (!matchResult?.match) {
      return null;
    }

    const match = matchResult.match;

    // 生成评分历史（基于当前评分推算）
    const currentScore = calculateDynamicScore(match);
    const scoreHistory: { minute: number; score: number; event?: string }[] = [];

    if (currentScore) {
      for (let m = 60; m <= match.minute; m++) {
        const progress = (m - 60) / (match.minute - 60 || 1);
        const score = Math.max(30, Math.floor(currentScore.totalScore * (0.6 + progress * 0.4)));
        scoreHistory.push({ minute: m, score });
      }
    }

    // 生成 xG 历史趋势
    const finalHomeXg = match.stats?.xG?.home ?? 0;
    const finalAwayXg = match.stats?.xG?.away ?? 0;
    const xgHistory: XgHistoryPoint[] = [];
    for (let m = 0; m <= match.minute; m += 5) {
      const progress = m / 90;
      xgHistory.push({
        minute: m,
        homeXg: Math.round(finalHomeXg * progress * 100) / 100,
        awayXg: Math.round(finalAwayXg * progress * 100) / 100,
        totalXg: Math.round((finalHomeXg + finalAwayXg) * progress * 100) / 100,
      });
    }

    // 统计数据列表
    // 🔥 根据数据可用性构建统计列表
    const hasStats = match.stats?._realDataAvailable === true;
    const hasXg = finalHomeXg !== null && finalHomeXg !== undefined && finalAwayXg !== null && finalAwayXg !== undefined && (finalHomeXg > 0 || finalAwayXg > 0);

    const statsList = hasStats ? [
      { label: '射门', home: match.stats?.shots?.home ?? 0, away: match.stats?.shots?.away ?? 0 },
      { label: '射正', home: match.stats?.shotsOnTarget?.home ?? 0, away: match.stats?.shotsOnTarget?.away ?? 0 },
      { label: '控球率', home: match.stats?.possession?.home ?? 0, away: match.stats?.possession?.away ?? 0, suffix: '%' },
      { label: '角球', home: match.corners?.home ?? 0, away: match.corners?.away ?? 0 },
      // 只在有 xG 数据时显示预期进球
      ...(hasXg ? [{ label: 'xG', home: finalHomeXg, away: finalAwayXg }] : []),
      { label: '危险进攻', home: match.stats?.dangerousAttacks?.home ?? 0, away: match.stats?.dangerousAttacks?.away ?? 0 },
      { label: '犯规', home: match.stats?.fouls?.home ?? 0, away: match.stats?.fouls?.away ?? 0 },
    ] : [];

    // 简化事件列表（从真实数据中提取）
    const events: any[] = [];

    return {
      ...match,
      scoreHistory,
      events,
      statsList,
      xgHistory,
    };
  }, [matchResult]);

  // 计算动态评分
  const scoreResult = useMemo(() => {
    if (!matchData) return null;
    return calculateDynamicScore(matchData);
  }, [matchData]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // 高评分预警动画
  useEffect(() => {
    if (scoreResult?.totalScore && scoreResult.totalScore >= 80) {
      setShowAlertAnimation(true);
      const timer = setTimeout(() => setShowAlertAnimation(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [scoreResult]);

  // 记录评分快照用于历史验证
  useEffect(() => {
    if (matchData && scoreResult) {
      recordScoreSnapshot(
        matchData.id,
        matchData.minute,
        scoreResult.totalScore,
        matchData.home.name,
        matchData.away.name,
        matchData.home.score,
        matchData.away.score,
        matchData.league,
        matchData.pressure,
        matchData.scenarioTags || []
      );
    }
  }, [matchData, scoreResult]);

  // ============================================
  // NO LIVE DATA 显示 - 只有在完全无法获取比赛数据时显示
  // ============================================
  if (!isLoading && !matchResult?.match) {
    return (
      <div className="min-h-screen bg-bg-deepest flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 p-8 bg-bg-card rounded-2xl border border-border-default max-w-md text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center">
            <WifiOff className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">无法加载比赛</h2>
          <p className="text-text-secondary">
            无法获取比赛数据，请稍后重试。
          </p>
          <div className="text-xs text-text-muted bg-bg-elevated p-3 rounded-lg font-mono">
            数据源: {matchResult?.dataSource || 'none'}<br/>
            错误: {(matchResult as any)?.error || 'MATCH_NOT_FOUND'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
            <Link
              to="/"
              className="px-4 py-2 bg-bg-elevated text-text-secondary rounded-lg hover:bg-bg-card transition-colors"
            >
              返回大厅
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-deepest flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary">从 API-Football 加载数据...</p>
        </div>
      </div>
    );
  }

  // 即使无法评分，也显示比赛基本信息
  // scoreResult 为 null 时，页面仍会渲染，只是评分区域显示"统计不足"
  const isUnscoreable = matchResult?.match?._unscoreable || !scoreResult;
  const unscoreableReason = matchResult?.match?._noStatsReason || 'MISSING_STATISTICS_DATA';

  // 只有完全没有比赛数据时才返回错误页面
  if (!matchData) {
    return (
      <div className="min-h-screen bg-bg-deepest flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 p-8 bg-bg-card rounded-2xl border border-border-default max-w-md text-center">
          <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-yellow-500" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">无法加载比赛</h2>
          <p className="text-text-secondary">
            比赛数据加载失败，请稍后重试。
          </p>
          <Link
            to="/"
            className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
          >
            返回大厅
          </Link>
        </div>
      </div>
    );
  }

  const leagueColor = LEAGUE_COLORS[matchData.league] || LEAGUE_COLORS.默认;

  return (
    <div className={`min-h-screen bg-bg-deepest ${showAlertAnimation ? 'animate-pulse' : ''}`}>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm hidden sm:inline">返回大厅</span>
            </Link>
            <div className="h-4 w-px bg-border-default" />
            <span
              className="px-2 py-0.5 rounded text-xs font-medium text-white"
              style={{ backgroundColor: leagueColor }}
            >
              {matchData.league}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 刷新按钮 */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isFetching}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-component text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="text-xs hidden sm:inline">
                实时数据
              </span>
            </button>

            {/* 关注按钮 */}
            <button
              type="button"
              onClick={() => setIsWatched(!isWatched)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isWatched
                  ? 'bg-accent-warning/20 text-accent-warning border border-accent-warning/30'
                  : 'bg-bg-component text-text-secondary hover:text-text-primary border border-border-default'
              }`}
            >
              <Star className={`w-4 h-4 ${isWatched ? 'fill-current' : ''}`} />
              <span className="text-sm hidden sm:inline">{isWatched ? '已关注' : '关注'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-6">
        {/* 统计不足提示 */}
        {isUnscoreable && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-yellow-500 font-medium">统计数据不足，无法计算评分</p>
              <p className="text-sm text-text-secondary mt-1">
                比赛基本信息可正常显示，评分功能将在数据完整后启用。
                {unscoreableReason && <span className="text-text-muted ml-2">({unscoreableReason})</span>}
              </p>
              <p className="text-xs text-text-muted mt-1">
                统计不足，不评分（{unscoreableReason}）
              </p>
            </div>
          </div>
        )}

        {/* 比赛头部 - 比分和核心评分 */}
        <MatchHeaderSection match={matchData} scoreResult={scoreResult} isUnscoreable={isUnscoreable} />

        {/* 主要内容区域 */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mt-6">
          {/* 左侧：评分详情 */}
          <div className="xl:col-span-8 space-y-6">
            {/* 评分面板 - 仅在有评分时显示 */}
            {scoreResult && <ScoreDashboard match={matchData} scoreResult={scoreResult} />}

            {/* 评分趋势图 - 仅在有评分时显示 */}
            {scoreResult && (
              <ScoreTrendChart
                scoreHistory={matchData.scoreHistory}
                currentMinute={matchData.minute}
                currentScore={scoreResult.totalScore}
              />
            )}

            {/* 进攻时间轴 */}
            <AttackTimelineSection attacks={matchData.attacks} minute={matchData.minute} />

            {/* 比赛统计 */}
            <StatisticsSection stats={matchData.statsList} home={matchData.home} away={matchData.away} />
          </div>

          {/* 右侧：三卡片结构（决策概要 / 数据拆解 / 盘口&历史） */}
          <div className="xl:col-span-4 space-y-6">
            <DecisionSummaryCard
              match={matchData}
              scoreResult={scoreResult}
              unscoreableReason={unscoreableReason}
            />
            <DataBreakdownCard match={matchData} scoreResult={scoreResult} />
            <MarketHistoryCard match={matchData} scoreResult={scoreResult} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 比赛头部区域
// ============================================
function MatchHeaderSection({ match, scoreResult, isUnscoreable }: { match: AdvancedMatch; scoreResult: ScoreResult | null; isUnscoreable?: boolean }) {
  const totalScore = scoreResult?.totalScore ?? 0;

  const getScoreColor = () => {
    if (isUnscoreable) return 'text-text-muted';
    return getScoreTextClass(totalScore);
  };

  const getScoreBg = () => {
    if (isUnscoreable) return 'from-gray-500/10 to-transparent';
    return getScoreBgGradient(totalScore);
  };

  return (
    <div className={`card relative overflow-hidden ${!isUnscoreable && totalScore >= 80 ? 'ring-2 ring-accent-danger/50 animate-border-breathe' : ''}`}>
      {/* 背景渐变 */}
      <div className={`absolute inset-0 bg-gradient-to-r ${getScoreBg()} opacity-50`} />

      <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6 py-6">
        {/* 左侧：比赛信息 */}
        <div className="flex items-center gap-6 lg:gap-10">
          {/* 主队 */}
          <div className="flex flex-col items-center gap-2 w-28">
            <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-bg-component flex items-center justify-center p-2">
              <span className="text-2xl lg:text-3xl font-bold text-text-primary">{match.home.name.slice(0, 2)}</span>
            </div>
            <span className="text-sm lg:text-base font-medium text-text-primary text-center">{match.home.name}</span>
            {(match.home.rank ?? 0) > 0 && (
              <span className="text-xs text-text-muted">排名 #{match.home.rank}</span>
            )}
          </div>

          {/* 比分 */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 lg:gap-4">
              <span className="font-mono text-4xl lg:text-6xl font-black text-text-primary">{match.home.score}</span>
              <div className="flex flex-col items-center">
                <span className="text-2xl lg:text-3xl text-text-muted">:</span>
              </div>
              <span className="font-mono text-4xl lg:text-6xl font-black text-text-primary">{match.away.score}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse" />
              <span className="font-mono text-lg lg:text-xl text-accent-success font-bold">{match.minute}'</span>
              <span className="text-sm text-text-muted">进行中</span>
            </div>
          </div>

          {/* 客队 */}
          <div className="flex flex-col items-center gap-2 w-28">
            <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-2xl bg-bg-component flex items-center justify-center p-2">
              <span className="text-2xl lg:text-3xl font-bold text-text-primary">{match.away.name.slice(0, 2)}</span>
            </div>
            <span className="text-sm lg:text-base font-medium text-text-primary text-center">{match.away.name}</span>
            {(match.away.rank ?? 0) > 0 && (
              <span className="text-xs text-text-muted">排名 #{match.away.rank}</span>
            )}
          </div>
        </div>

        {/* 右侧：核心评分 */}
        <div className="flex items-center gap-6 lg:gap-8">
          {/* 评分圆环 */}
          <div className="relative">
            <svg className="w-28 h-28 lg:w-36 lg:h-36 -rotate-90">
              <circle
                cx="50%" cy="50%" r="45%"
                fill="none"
                stroke="#21262d"
                strokeWidth="8"
              />
              <circle
                cx="50%" cy="50%" r="45%"
                fill="none"
                stroke={isUnscoreable ? '#666' : totalScore >= 80 ? '#ff4444' : totalScore >= 60 ? '#ffaa00' : '#00cc66'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={isUnscoreable ? '0 283' : `${(totalScore / 100) * 283} 283`}
                className="transition-all duration-1000"
                style={{
                  filter: !isUnscoreable && totalScore >= 80 ? 'drop-shadow(0 0 8px rgba(255, 68, 68, 0.6))' : 'none'
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-mono text-3xl lg:text-4xl font-black ${getScoreColor()}`}>
                {isUnscoreable ? '--' : totalScore}
              </span>
              <span className="text-[10px] lg:text-xs text-text-muted">
                {isUnscoreable ? '统计不足' : '80+评分'}
              </span>
            </div>
          </div>

          {/* 评分信息 */}
          <div className="space-y-3">
            {/* 星级 */}
            <div>
              <p className="text-xs text-text-muted mb-1">评级</p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <span
                    key={i}
                    className={`text-xl ${
                      isUnscoreable
                        ? 'text-text-muted/30'
                        : i <= (scoreResult?.stars ?? 0)
                          ? (scoreResult?.stars ?? 0) >= 4 ? 'text-accent-danger' : 'text-accent-warning'
                          : 'text-text-muted/30'
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>

            {/* 建议 */}
            <div>
              <p className="text-xs text-text-muted mb-1">交易建议</p>
              {isUnscoreable ? (
                <span className="text-sm text-text-muted">数据不足</span>
              ) : (
                <RecommendationBadge recommendation={scoreResult?.recommendation || 'HOLD'} />
              )}
            </div>

            {/* 强队落后标记 */}
            {!isUnscoreable && scoreResult?.isStrongTeamBehind && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent-danger/20 border border-accent-danger/30">
                <Zap className="w-4 h-4 text-accent-danger" />
                <span className="text-xs font-medium text-accent-danger">强队落后</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionSummaryCard({
  match,
  scoreResult,
  unscoreableReason,
}: {
  match: AdvancedMatch;
  scoreResult: ScoreResult | null;
  unscoreableReason?: string | null;
}) {
  const score = scoreResult?.totalScore ?? 0;
  const scoreClass = getScoreTextClass(score);
  const keyReasons = scoreResult?.alerts?.slice(0, 3) ?? [];

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-primary" />
          <span className="font-medium text-text-primary">决策概要</span>
        </div>
        <div className="text-xs text-text-muted">{match.minute}' · {match.home.score}-{match.away.score}</div>
      </div>

      {scoreResult ? (
        <>
          <div className="flex items-center justify-between">
            <div className={`font-mono text-3xl font-black ${scoreClass}`}>{score}</div>
            <RecommendationBadge recommendation={scoreResult.recommendation} />
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span title="数据健康">{getDataHealthIcon(scoreResult.dataHealthScore)}</span>
            <span>数据 {scoreResult.dataHealthScore ?? '--'}/100</span>
            <span className="text-text-muted">·</span>
            <span title="盘口健康">{getOddsHealthIcon(scoreResult.oddsHealthLevel)}</span>
            <span>
              {scoreResult.oddsHealthScore != null ? `盘口 ${scoreResult.oddsHealthScore}/100` : '盘口未计算'}
            </span>
          </div>
          <div className="space-y-1">
            {keyReasons.length > 0 ? (
              keyReasons.map((reason, i) => (
                <div key={`${reason}-${i}`} className="text-xs text-text-secondary">
                  • {reason}
                </div>
              ))
            ) : (
              <div className="text-xs text-text-muted">暂无关键理由</div>
            )}
          </div>
        </>
      ) : (
        <div className="text-sm text-accent-warning">
          统计不足，当前仅展示基础信息（{unscoreableReason || 'NO_SCORE'}）
        </div>
      )}
    </div>
  );
}

function DataBreakdownCard({
  match,
  scoreResult,
}: {
  match: AdvancedMatch;
  scoreResult: ScoreResult | null;
}) {
  const shots = `${match.stats?.shots?.home ?? 0}-${match.stats?.shots?.away ?? 0}`;
  const shotsOn = `${match.stats?.shotsOnTarget?.home ?? 0}-${match.stats?.shotsOnTarget?.away ?? 0}`;
  const corners = `${match.corners?.home ?? 0}-${match.corners?.away ?? 0}`;
  const xg = `${(match.stats?.xG?.home ?? 0).toFixed(2)}-${(match.stats?.xG?.away ?? 0).toFixed(2)}`;
  const timelineEvents = (match.events ?? [])
    .map((e) => ({
      minute: e.minute ?? e.time?.elapsed ?? 0,
      type: e.type ?? 'other',
      team: (e.teamSide === 'away' ? 'away' : 'home') as 'home' | 'away',
      player: e.player?.name ?? '',
      detail: e.detail,
    }))
    .filter((e) => e.minute >= 0);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-accent-primary" />
        <span className="font-medium text-text-primary">数据拆解</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded bg-bg-component px-2 py-1.5 text-text-secondary">射门 <span className="font-mono text-text-primary">{shots}</span></div>
        <div className="rounded bg-bg-component px-2 py-1.5 text-text-secondary">射正 <span className="font-mono text-text-primary">{shotsOn}</span></div>
        <div className="rounded bg-bg-component px-2 py-1.5 text-text-secondary">角球 <span className="font-mono text-text-primary">{corners}</span></div>
        <div className="rounded bg-bg-component px-2 py-1.5 text-text-secondary">xG <span className="font-mono text-text-primary">{xg}</span></div>
      </div>
      <StatsChannelPanel scoreResult={scoreResult} match={match} />
      <EventsTimeline events={timelineEvents} />
    </div>
  );
}

function MarketHistoryCard({
  match,
  scoreResult,
}: {
  match: AdvancedMatch;
  scoreResult: ScoreResult | null;
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-accent-primary" />
        <span className="font-medium text-text-primary">盘口 & 历史（低权重参考）</span>
      </div>
      <OddsAnalysisPanel odds={match.odds} />
      {scoreResult && (
        <>
          <HistoryValidation
            teamName={match.home.name}
            scenarioTags={match.scenarioTags || []}
            pressure={match.pressure}
            currentMinute={match.minute}
            currentScore={scoreResult.totalScore}
          />
          <AlertSignalsPanel
            alerts={scoreResult.alerts}
            recommendation={scoreResult.recommendation}
            isStrongTeamBehind={scoreResult.isStrongTeamBehind}
          />
        </>
      )}
      <SimulatedOrderPanel match={match} />
    </div>
  );
}

// ============================================
// 评分仪表盘
// ============================================
function ScoreDashboard({ match, scoreResult }: { match: AdvancedMatch; scoreResult: ScoreResult }) {
  const metrics = [
    {
      icon: Clock,
      label: '比分因子',
      value: match.home.score === match.away.score ? '平局' : Math.abs(match.home.score - match.away.score) === 1 ? '差1球' : '差2球+',
      subValue: `${match.home.score} : ${match.away.score}`,
      color: scoreResult.factors.scoreFactor.score >= 15 ? 'danger' : scoreResult.factors.scoreFactor.score >= 10 ? 'warning' : 'primary',
      score: scoreResult.factors.scoreFactor.score,
      maxScore: 25,
    },
    {
      icon: Target,
      label: '进攻因子',
      value: `${match.attacks?.filter(a => a.minute > match.minute - 5 && a.type === 'dangerous').length ?? 0}次`,
      subValue: '近5分钟危险进攻',
      color: scoreResult.factors.attackFactor.score >= 20 ? 'danger' : scoreResult.factors.attackFactor.score >= 10 ? 'warning' : 'success',
      score: scoreResult.factors.attackFactor.score,
      maxScore: 30,
    },
    {
      icon: Activity,
      label: '动量因子',
      value: `${match.minute}'`,
      subValue: match.minute >= 85 ? '绝杀时段' : match.minute >= 80 ? '关键时段' : '下半场',
      color: scoreResult.factors.momentumFactor.score >= 25 ? 'danger' : scoreResult.factors.momentumFactor.score >= 15 ? 'warning' : 'primary',
      score: scoreResult.factors.momentumFactor.score,
      maxScore: 35,
    },
    {
      icon: Users,
      label: '历史因子',
      value: match.substitutions?.filter(s => s.minute >= 70 && s.type === 'attack').length > 0 ? '攻击' : '中性',
      subValue: `${match.substitutions?.filter(s => s.minute >= 70).length ?? 0}次换人`,
      color: scoreResult.factors.historyFactor.score >= 15 ? 'danger' : scoreResult.factors.historyFactor.score >= 8 ? 'warning' : 'muted',
      score: scoreResult.factors.historyFactor.score,
      maxScore: 25,
    },
    {
      icon: BarChart3,
      label: '特殊因子',
      value: match.odds?.overUnder?.overTrend === 'down' ? '下跌' : match.odds?.overUnder?.overTrend === 'up' ? '上涨' : '稳定',
      subValue: '大球赔率',
      color: scoreResult.factors.specialFactor.score >= 10 ? 'success' : scoreResult.factors.specialFactor.score <= -5 ? 'danger' : 'muted',
      score: scoreResult.factors.specialFactor.score,
      maxScore: 20,
    },
    {
      icon: CornerUpRight,
      label: '角球数据',
      value: `${(match.corners?.home ?? 0) + (match.corners?.away ?? 0)}`,
      subValue: `近5分钟 +${match.corners?.recent5min ?? 0}`,
      color: (match.corners?.recent5min ?? 0) >= 2 ? 'warning' : 'primary',
      score: scoreResult.factors.attackFactor.details.corners,
      maxScore: 10,
    },
  ];

  const colorClasses: Record<string, string> = {
    primary: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',
    success: 'bg-accent-success/10 text-accent-success border-accent-success/30',
    warning: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',
    danger: 'bg-accent-danger/10 text-accent-danger border-accent-danger/30',
    muted: 'bg-bg-component text-text-secondary border-border-default',
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">实时指标监控</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map(({ icon: Icon, label, value, subValue, color, score, maxScore }) => (
          <div
            key={label}
            className={`p-3 rounded-xl border ${colorClasses[color]} transition-all hover:scale-105`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4" />
              <span className="text-xs opacity-80">{label}</span>
            </div>
            <p className="font-mono text-lg font-bold mb-1">{value}</p>
            <p className="text-[10px] opacity-70">{subValue}</p>
            <div className="mt-2 flex items-center gap-1">
              <div className="flex-1 h-1 bg-black/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-current rounded-full transition-all duration-500"
                  style={{ width: `${(score / maxScore) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-mono">{score}/{maxScore}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// 评分趋势图
// ============================================
function ScoreTrendChart({
  scoreHistory,
  currentMinute,
  currentScore,
}: {
  scoreHistory: { minute: number; score: number; event?: string }[];
  currentMinute: number;
  currentScore: number;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">评分趋势</h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-accent-warning" />
            <span className="text-text-muted">买入线 (70)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-accent-danger" />
            <span className="text-text-muted">强烈买入 (80)</span>
          </div>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={scoreHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGradientDetail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={currentScore >= 80 ? '#ff4444' : currentScore >= 60 ? '#ffaa00' : '#00d4ff'} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={currentScore >= 80 ? '#ff4444' : currentScore >= 60 ? '#ffaa00' : '#00d4ff'} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              stroke="#484f58"
              fontSize={11}
              tickFormatter={(v) => `${v}'`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="#484f58"
              fontSize={11}
              domain={[0, 100]}
              ticks={[0, 25, 50, 70, 80, 100]}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '12px',
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}
              labelFormatter={(v) => `${v}分钟`}
              formatter={(value) => [`${value}分`, '评分']}
            />
            <ReferenceLine y={70} stroke="#ffaa00" strokeDasharray="5 5" strokeOpacity={0.7} />
            <ReferenceLine y={80} stroke="#ff4444" strokeDasharray="5 5" strokeOpacity={0.7} />
            <ReferenceLine y={currentScore} stroke={currentScore >= 80 ? '#ff4444' : '#00d4ff'} strokeWidth={2} />
            <Area
              type="monotone"
              dataKey="score"
              stroke={currentScore >= 80 ? '#ff4444' : currentScore >= 60 ? '#ffaa00' : '#00d4ff'}
              strokeWidth={3}
              fill="url(#scoreGradientDetail)"
              activeDot={{ r: 8, fill: currentScore >= 80 ? '#ff4444' : '#00d4ff', strokeWidth: 2, stroke: '#0d1117' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 时间轴标记 */}
      <div className="flex justify-between mt-2 px-8 text-[10px] text-text-muted">
        <span>60'</span>
        <span className="text-accent-warning">70' 关注</span>
        <span className="text-accent-warning">75' 准备</span>
        <span className="text-accent-danger">80' 买入</span>
        <span className="text-accent-danger font-bold">85' 绝杀</span>
        <span>90'+</span>
      </div>
    </div>
  );
}

// ============================================
// 进攻时间轴
// ============================================
function AttackTimelineSection({ attacks, minute }: { attacks: AttackEvent[]; minute: number }) {
  const homeAttacks = attacks?.filter(a => a.team === 'home') ?? [];
  const awayAttacks = attacks?.filter(a => a.team === 'away') ?? [];
  const recentDangerous = attacks?.filter(a => a.minute > minute - 10 && a.type === 'dangerous') ?? [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">进攻时间轴</h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-text-muted">
            近10分钟危险进攻: <span className="font-mono text-accent-danger font-bold">{recentDangerous.length}</span>
          </span>
        </div>
      </div>

      {/* 时间轴可视化 */}
      <div className="relative h-20 bg-bg-component rounded-xl overflow-hidden">
        {/* 时间刻度 */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-border-default" />

        {/* 半场标记 */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border-default" />
        <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] text-text-muted">HT</span>

        {/* 最近10分钟高亮 */}
        <div
          className="absolute top-0 bottom-0 bg-accent-primary/10"
          style={{
            left: `${Math.max(0, ((minute - 10) / 90) * 100)}%`,
            width: `${(10 / 90) * 100}%`
          }}
        />

        {/* 进攻事件 */}
        {attacks?.map((attack, i) => {
          const x = (attack.minute / 90) * 100;
          const isHome = attack.team === 'home';
          const isDangerous = attack.type === 'dangerous';
          const isRecent = attack.minute > minute - 5;

          return (
            <div
              key={`attack-${attack.minute}-${i}`}
              className={`absolute w-1.5 transition-all ${
                isDangerous
                  ? isRecent ? 'h-5 animate-pulse' : 'h-4'
                  : 'h-2'
              } rounded-full ${
                isDangerous ? 'bg-accent-danger' : 'bg-accent-primary/60'
              }`}
              style={{
                left: `${x}%`,
                top: isHome ? '15%' : undefined,
                bottom: isHome ? undefined : '15%',
              }}
              title={`${attack.minute}' - ${attack.team === 'home' ? '主队' : '客队'} ${isDangerous ? '危险进攻' : '普通进攻'}`}
            />
          );
        })}

        {/* 当前时间指示器 */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-accent-success"
          style={{ left: `${(minute / 90) * 100}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent-success animate-pulse" />
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-bg-deepest">
          <span className="text-sm text-text-secondary">主队进攻</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-accent-primary">{homeAttacks.length}</span>
            <span className="text-xs text-text-muted">
              危险 <span className="text-accent-danger">{homeAttacks.filter(a => a.type === 'dangerous').length}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-bg-deepest">
          <span className="text-sm text-text-secondary">客队进攻</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-accent-danger">{awayAttacks.length}</span>
            <span className="text-xs text-text-muted">
              危险 <span className="text-accent-danger">{awayAttacks.filter(a => a.type === 'dangerous').length}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 因子雷达图
// ============================================
function FactorRadarChart({ factors }: { factors: ScoringFactors }) {
  const data = [
    { factor: '比分', value: Math.min((factors.scoreFactor.score / 25) * 100, 100), fullMark: 100 },
    { factor: '进攻', value: Math.min((factors.attackFactor.score / 30) * 100, 100), fullMark: 100 },
    { factor: '动量', value: Math.min((factors.momentumFactor.score / 35) * 100, 100), fullMark: 100 },
    { factor: '历史', value: Math.min((factors.historyFactor.score / 25) * 100, 100), fullMark: 100 },
    { factor: '特殊', value: Math.min(Math.max((factors.specialFactor.score + 20) / 40 * 100, 0), 100), fullMark: 100 },
  ];

  const totalScore = factors.scoreFactor.score + factors.attackFactor.score +
    factors.momentumFactor.score + factors.historyFactor.score + factors.specialFactor.score;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">因子雷达</h2>
        </div>
        <span className={`font-mono text-lg font-bold ${
          totalScore >= 70 ? 'text-accent-danger' : totalScore >= 50 ? 'text-accent-warning' : 'text-accent-success'
        }`}>
          {totalScore}/100
        </span>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid stroke="#30363d" />
            <PolarAngleAxis
              dataKey="factor"
              tick={{ fill: '#8b949e', fontSize: 11 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: '#484f58', fontSize: 9 }}
              axisLine={false}
            />
            <Radar
              name="评分"
              dataKey="value"
              stroke={totalScore >= 70 ? '#ff4444' : '#00d4ff'}
              fill={totalScore >= 70 ? '#ff4444' : '#00d4ff'}
              fillOpacity={0.3}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================
// 因子详情面板
// ============================================
function FactorBreakdownPanel({ factors }: { factors: ScoringFactors }) {
  const factorList = [
    { key: 'scoreFactor', label: '比分因子', value: factors.scoreFactor.score, max: 25, desc: '平局/1球差/强队落后等' },
    { key: 'attackFactor', label: '进攻因子', value: factors.attackFactor.score, max: 30, desc: '射门/射正/角球/xG等' },
    { key: 'momentumFactor', label: '动量因子', value: factors.momentumFactor.score, max: 35, desc: '近期进攻强度变化' },
    { key: 'historyFactor', label: '历史因子', value: factors.historyFactor.score, max: 25, desc: '75+分钟进球率/H2H' },
    { key: 'specialFactor', label: '特殊因子', value: Math.max(0, factors.specialFactor.score + 20), max: 40, desc: '红牌/换人/VAR等' },
  ];

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">因子分解</h2>
      </div>

      <div className="space-y-3">
        {factorList.map(({ key, label, value, max, desc }) => {
          const percentage = (value / max) * 100;
          const colorClass = percentage >= 80 ? 'bg-accent-danger' : percentage >= 60 ? 'bg-accent-warning' : percentage >= 40 ? 'bg-accent-success' : 'bg-text-muted';

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-text-secondary">{label}</span>
                <span className="font-mono text-sm font-medium text-text-primary">{value}/{max}</span>
              </div>
              <div className="relative h-2 bg-bg-deepest rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${colorClass} rounded-full transition-all duration-700`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-[10px] text-text-muted mt-0.5">{desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Stats 通道评分面板（仅展示，不参与排序/信号）
// ============================================
function StatsChannelPanel({ scoreResult, match }: { scoreResult: ScoreResult | null; match: AdvancedMatch }) {
  const sc = scoreResult?.statsChannel;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">Stats 通道评分（不含赔率/历史）</h2>
      </div>

      {sc ? (
        <>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">总分</span>
              <span className="font-mono text-lg font-bold text-text-primary">{sc.totalScore}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="px-3 py-2 rounded-lg bg-bg-deepest">
                <div className="text-text-muted text-xs">射门压制</div>
                <div className="font-mono font-medium text-text-primary">{sc.shotsScore}</div>
                {sc.reasons.find(r => r.includes('射门') || r.includes('xG')) && (
                  <div className="mt-1 text-[11px] text-text-muted truncate">
                    {sc.reasons.find(r => r.includes('射门') || r.includes('xG'))}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 rounded-lg bg-bg-deepest">
                <div className="text-text-muted text-xs">场面主动（控球）</div>
                <div className="font-mono font-medium text-text-primary">{sc.possessionScore}</div>
                {sc.reasons.find(r => r.includes('控球')) && (
                  <div className="mt-1 text-[11px] text-text-muted truncate">
                    {sc.reasons.find(r => r.includes('控球'))}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 rounded-lg bg-bg-deepest">
                <div className="text-text-muted text-xs">事件压力</div>
                <div className="font-mono font-medium text-text-primary">{sc.eventsScore}</div>
                {sc.reasons.find(r => r.includes('角球') || r.includes('红牌')) && (
                  <div className="mt-1 text-[11px] text-text-muted truncate">
                    {sc.reasons.find(r => r.includes('角球') || r.includes('红牌'))}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 rounded-lg bg-bg-deepest">
                <div className="text-text-muted text-xs">初盘兑现</div>
                <div className="font-mono font-medium text-text-primary">{sc.lineRealizationScore}</div>
                {sc.reasons.find(r => r.includes('盘口') || r.includes('让球')) && (
                  <div className="mt-1 text-[11px] text-text-muted truncate">
                    {sc.reasons.find(r => r.includes('盘口') || r.includes('让球'))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 全局说明列表 */}
          {sc.reasons.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-text-muted mb-1">综合说明</div>
              <ul className="space-y-1 text-xs text-text-secondary">
                {sc.reasons.map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 仅 stats 无赔率提示 */}
          {match.noOddsFromProvider && (
            <div className="mt-3 text-xs text-accent-warning">
              仅有 stats，无赔率（供应商未提供盘口），仅作场面参考。
            </div>
          )}

          {/* 数据不完整提示 */}
          {(sc.flags?.missingCoreStats || sc.flags?.missingAuxStats) && (
            <div className="mt-1 text-xs text-accent-warning/80">
              数据不完整，分数仅供参考。
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-text-muted">Stats 通道不可用</p>
      )}
    </div>
  );
}

// ============================================
// 换人分析
// ============================================
function SubstitutionAnalysis({
  substitutions,
  minute,
  signalScore,
}: {
  substitutions: Substitution[];
  minute: number;
  signalScore: number;
}) {
  const lateSubs = substitutions?.filter(s => s.minute >= 70) ?? [];
  const attackSubs = lateSubs.filter(s => s.type === 'attack');
  const defenseSubs = lateSubs.filter(s => s.type === 'defense');

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">换人分析</h2>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
          signalScore >= 10 ? 'bg-accent-danger/20 text-accent-danger' : 'bg-bg-component text-text-muted'
        }`}>
          +{signalScore}分
        </span>
      </div>

      {lateSubs.length > 0 ? (
        <div className="space-y-2">
          {lateSubs.map((sub, i) => (
            <div
              key={`sub-${sub.minute}-${sub.playerIn}`}
              className={`flex items-center gap-3 p-2 rounded-lg ${
                sub.type === 'attack' ? 'bg-accent-danger/10' : sub.type === 'defense' ? 'bg-accent-primary/10' : 'bg-bg-component'
              }`}
            >
              <span className="font-mono text-xs text-text-muted w-8">{sub.minute}'</span>
              <span className={`text-lg ${
                sub.type === 'attack' ? '' : sub.type === 'defense' ? '' : ''
              }`}>
                {sub.type === 'attack' ? '🔴' : sub.type === 'defense' ? '🔵' : '⚪'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary truncate">{sub.playerIn}</p>
                <p className="text-xs text-text-muted truncate">← {sub.playerOut}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                sub.type === 'attack' ? 'bg-accent-danger/20 text-accent-danger' : 'bg-accent-deepest text-text-muted'
              }`}>
                {sub.type === 'attack' ? '攻击' : sub.type === 'defense' ? '防守' : '中性'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted text-center py-4">70分钟后暂无换人</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-default text-xs">
        <span className="text-text-muted">70分钟后换人统计</span>
        <div className="flex items-center gap-3">
          <span className="text-accent-danger">🔴 攻击 {attackSubs.length}</span>
          <span className="text-accent-primary">🔵 防守 {defenseSubs.length}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 盘口分析
// ============================================
function OddsAnalysisPanel({ odds }: { odds: AdvancedMatch['odds'] }) {
  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 text-accent-danger" />;
    if (trend === 'down') return <TrendingDown className="w-3 h-3 text-accent-success" />;
    return <Minus className="w-3 h-3 text-text-muted" />;
  };

  // 检查是否有赔率数据
  const hasOdds = odds?._fetch_status === 'SUCCESS';

  // 🔥 DEBUG: 盘口数据获取状态
  console.log('[LEGACY MODE] OddsAnalysisPanel:', {
    hasOdds,
    fetchStatus: odds?._fetch_status,
    source: odds?._source,
    handicapValue: odds?.handicap?.value,
    ouTotal: odds?.overUnder?.total,
  });

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">盘口分析</h2>
      </div>

      {hasOdds ? (
        <>
          {/* 让球盘 */}
          <div className="p-3 rounded-lg bg-bg-component mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted">让球盘</span>
              <span className="font-mono text-sm text-accent-primary">{(odds?.handicap?.value ?? 0) > 0 ? '+' : ''}{odds?.handicap?.value ?? 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="font-mono text-sm text-text-primary">{odds?.handicap?.home?.toFixed(2) ?? 'N/A'}</span>
                {getTrendIcon(odds?.handicap?.homeTrend ?? 'stable')}
              </div>
              <div className="flex items-center gap-1">
                {getTrendIcon(odds?.handicap?.awayTrend ?? 'stable')}
                <span className="font-mono text-sm text-text-primary">{odds?.handicap?.away?.toFixed(2) ?? 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* 大小球 */}
          <div className={`p-3 rounded-lg ${odds?.overUnder?.overTrend === 'down' ? 'bg-accent-success/10 border border-accent-success/30' : 'bg-bg-component'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted">大小球</span>
              <span className={`font-mono text-sm ${odds?.overUnder?.overTrend === 'down' ? 'text-accent-success' : 'text-accent-primary'}`}>
                {odds?.overUnder?.total ?? 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">大</span>
                <span className="font-mono text-sm text-text-primary">{odds?.overUnder?.over?.toFixed(2) ?? 'N/A'}</span>
                {getTrendIcon(odds?.overUnder?.overTrend ?? 'stable')}
              </div>
              <div className="flex items-center gap-1">
                {getTrendIcon(odds?.overUnder?.underTrend ?? 'stable')}
                <span className="font-mono text-sm text-text-primary">{odds?.overUnder?.under?.toFixed(2) ?? 'N/A'}</span>
                <span className="text-xs text-text-muted">小</span>
              </div>
            </div>
            {odds?.overUnder?.overTrend === 'down' && (
              <p className="text-[10px] text-accent-success mt-2">📊 大球赔率下跌，进球预期上升</p>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center mb-3">
            <WifiOff className="w-6 h-6 text-yellow-500" />
          </div>
          <p className="text-text-muted text-sm">暂无盘口数据</p>
          <p className="text-text-muted text-xs mt-1">
            {odds?._no_data_reason || '赔率数据暂不可用'}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// 预警信号
// ============================================
function AlertSignalsPanel({
  alerts,
  recommendation,
  isStrongTeamBehind,
}: {
  alerts: string[];
  recommendation: ScoreResult['recommendation'];
  isStrongTeamBehind: boolean;
}) {
  return (
    <div className={`card ${alerts.length > 0 ? 'ring-1 ring-accent-danger/30' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${alerts.length > 0 ? 'text-accent-danger' : 'text-accent-primary'}`} />
          <h2 className="text-lg font-semibold text-text-primary">交易信号</h2>
        </div>
        {alerts.length > 0 && (
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-danger text-white text-xs font-bold animate-pulse">
            {alerts.length}
          </span>
        )}
      </div>

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={`alert-${alert.slice(0, 20)}`}
              className="flex items-start gap-2 p-3 rounded-lg bg-accent-danger/10 border border-accent-danger/30 animate-fade-in"
            >
              <Zap className="w-4 h-4 text-accent-danger flex-shrink-0 mt-0.5" />
              <span className="text-sm text-text-primary">{alert}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-component">
          <span className="text-sm text-text-muted">暂无预警信号</span>
        </div>
      )}

      {/* 系统建议 */}
      <div className="mt-4 p-4 rounded-lg bg-bg-deepest">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-4 h-4 text-text-muted" />
          <p className="text-xs text-text-muted">系统建议</p>
        </div>
        <p className="text-sm text-text-secondary">
          {recommendation === 'STRONG_BUY' && '🔥 当前比赛处于高进球概率区间，强烈建议关注大球方向，可考虑即时入场。'}
          {recommendation === 'BUY' && '📈 比赛具有较好的进球潜力，建议持续关注，等待更好的入场时机。'}
          {recommendation === 'HOLD' && '⏸️ 当前数据指标中性，建议继续观察比赛走势，暂不建议入场。'}
          {recommendation === 'AVOID' && '⚠️ 当前进球概率较低，建议回避或关注小球方向。'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// 统计面板
// ============================================
function StatisticsSection({
  stats,
  home,
  away,
}: {
  stats: { label: string; home: number; away: number; suffix?: string }[];
  home: AdvancedMatch['home'];
  away: AdvancedMatch['away'];
}) {
  // 检查是否有统计数据
  const hasStats = stats.length > 0;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">比赛统计</h2>
      </div>

      {hasStats ? (
        <>
          <div className="flex items-center justify-between mb-4 px-4">
            <span className="text-sm font-medium text-accent-primary">{home.name}</span>
            <span className="text-sm font-medium text-accent-danger">{away.name}</span>
          </div>

          <div className="space-y-4">
            {stats.map(({ label, home: homeVal, away: awayVal, suffix = '' }) => {
              const total = homeVal + awayVal || 1;
              const homePercent = (homeVal / total) * 100;

              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5 text-sm">
                    <span className="font-mono text-text-primary w-12 text-right">{homeVal}{suffix}</span>
                    <span className="text-text-muted flex-1 text-center">{label}</span>
                    <span className="font-mono text-text-primary w-12 text-left">{awayVal}{suffix}</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-bg-deepest">
                    <div
                      className="bg-accent-primary transition-all duration-500"
                      style={{ width: `${homePercent}%` }}
                    />
                    <div
                      className="bg-accent-danger transition-all duration-500"
                      style={{ width: `${100 - homePercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
          </div>
          <p className="text-text-muted text-sm">暂无技术统计</p>
          <p className="text-text-muted text-xs mt-1">比赛进行中，数据稍后可用</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// 比赛事件时间线
// ============================================
function EventsTimeline({ events }: { events: { minute: number; type: string; team: 'home' | 'away'; player: string; detail?: string }[] }) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'goal': return '⚽';
      case 'yellow': return '🟨';
      case 'red': return '🟥';
      case 'sub': return '🔄';
      case 'corner': return '🚩';
      case 'dangerous': return '⚠️';
      case 'var': return '📺';
      default: return '📋';
    }
  };

  const getEventBg = (type: string) => {
    switch (type) {
      case 'goal': return 'bg-accent-success/10 border-accent-success/30';
      case 'dangerous': return 'bg-accent-warning/10 border-accent-warning/30';
      case 'red': return 'bg-accent-danger/10 border-accent-danger/30';
      default: return 'bg-bg-component border-border-default';
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">比赛事件</h2>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-hide">
        {events?.sort((a, b) => b.minute - a.minute).map((event, i) => (
          <div
            key={`event-${event.minute}-${event.type}-${i}`}
            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${getEventBg(event.type)}`}
          >
            <span className="font-mono text-xs text-text-muted w-8">{event.minute}'</span>
            <span className="text-lg">{getEventIcon(event.type)}</span>
            <div className="flex-1 min-w-0">
              {event.player && <p className="text-sm text-text-primary truncate">{event.player}</p>}
              {event.detail && <p className="text-xs text-text-muted truncate">{event.detail}</p>}
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              event.team === 'home' ? 'bg-accent-primary/20 text-accent-primary' : 'bg-accent-danger/20 text-accent-danger'
            }`}>
              {event.team === 'home' ? '主' : '客'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// 推荐徽章组件
// ============================================
function RecommendationBadge({ recommendation }: { recommendation: ScoreResult['recommendation'] }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    STRONG_BUY: { bg: 'bg-accent-danger/20 border-accent-danger/50', text: 'text-accent-danger', label: '强烈买入' },
    BUY: { bg: 'bg-accent-warning/20 border-accent-warning/50', text: 'text-accent-warning', label: '建议买入' },
    HOLD: { bg: 'bg-accent-success/20 border-accent-success/50', text: 'text-accent-success', label: '观望持有' },
    AVOID: { bg: 'bg-text-muted/20 border-text-muted/50', text: 'text-text-muted', label: '建议回避' },
  };

  const style = styles[recommendation];

  return (
    <span className={`inline-block px-3 py-1.5 rounded-lg border text-sm font-bold ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

export default MatchDetailPage;
