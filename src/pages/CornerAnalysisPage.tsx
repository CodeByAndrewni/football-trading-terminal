// ============================================
// 角球分析页 - 深度角球数据分析与预测
// ============================================

import { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CornerUpRight, TrendingUp, TrendingDown, Clock, AlertTriangle,
  Target, RefreshCw, BarChart3, Activity, ChevronDown, Check,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, AreaChart, Area, ComposedChart
} from 'recharts';
import { type AdvancedMatch, LEAGUE_COLORS } from '../data/advancedMockData';
import { useMatchAdvanced, useLiveMatchesAdvanced } from '../hooks/useMatches';

// 角球事件
interface CornerEvent {
  minute: number;
  team: 'home' | 'away';
  period: '1H' | '2H';
}

// 角球预测结果
interface CornerPrediction {
  nextCornerTeam: 'home' | 'away' | 'uncertain';
  nextCornerProbability: number;
  nextCornerEstimatedMinute: number;
  totalPrediction: { min: number; max: number; expected: number };
  trend: 'increasing' | 'stable' | 'decreasing';
  overUnderRecommendation: 'over' | 'under' | 'neutral';
  confidence: number;
}

// 生成角球事件数据
function generateCornerEvents(minute: number, homeCorners: number, awayCorners: number): CornerEvent[] {
  const events: CornerEvent[] = [];
  const totalCorners = homeCorners + awayCorners;

  // 分配角球到各个时间段
  for (let i = 0; i < totalCorners; i++) {
    const isHome = i < homeCorners;
    const eventMinute = Math.floor(Math.random() * Math.min(minute, 90)) + 1;
    events.push({
      minute: eventMinute,
      team: isHome ? 'home' : 'away',
      period: eventMinute <= 45 ? '1H' : '2H',
    });
  }

  return events.sort((a, b) => a.minute - b.minute);
}

// 角球预测算法
function predictCorners(
  events: CornerEvent[],
  minute: number,
  homeCorners: number,
  awayCorners: number
): CornerPrediction {
  const totalCorners = homeCorners + awayCorners;
  const remainingMinutes = 90 - minute;

  // 计算角球速率（每分钟）
  const cornerRate = minute > 0 ? totalCorners / minute : 0;

  // 近15分钟角球数
  const recentCorners = events.filter(e => e.minute > minute - 15).length;
  const recentRate = recentCorners / 15;

  // 趋势判断
  let trend: CornerPrediction['trend'] = 'stable';
  if (recentRate > cornerRate * 1.3) trend = 'increasing';
  else if (recentRate < cornerRate * 0.7) trend = 'decreasing';

  // 预测剩余角球
  const expectedRemaining = Math.round(recentRate * remainingMinutes);
  const totalExpected = totalCorners + expectedRemaining;

  // 下一角球预测
  const homeRecentCorners = events.filter(e => e.minute > minute - 10 && e.team === 'home').length;
  const awayRecentCorners = events.filter(e => e.minute > minute - 10 && e.team === 'away').length;

  let nextCornerTeam: CornerPrediction['nextCornerTeam'] = 'uncertain';
  let nextCornerProbability = 50;

  if (homeRecentCorners > awayRecentCorners + 1) {
    nextCornerTeam = 'home';
    nextCornerProbability = 60 + (homeRecentCorners - awayRecentCorners) * 5;
  } else if (awayRecentCorners > homeRecentCorners + 1) {
    nextCornerTeam = 'away';
    nextCornerProbability = 60 + (awayRecentCorners - homeRecentCorners) * 5;
  }

  // 下一角球预估时间
  const avgInterval = minute > 0 && totalCorners > 0 ? minute / totalCorners : 8;
  const lastCorner = events.length > 0 ? events[events.length - 1].minute : 0;
  const nextCornerEstimatedMinute = Math.min(90, Math.round(lastCorner + avgInterval));

  // 大小球建议
  const cornerLine = 9.5; // 常见角球盘口
  let overUnderRecommendation: CornerPrediction['overUnderRecommendation'] = 'neutral';

  if (totalExpected > cornerLine + 1.5) {
    overUnderRecommendation = 'over';
  } else if (totalExpected < cornerLine - 1.5) {
    overUnderRecommendation = 'under';
  }

  // 置信度
  const confidence = Math.min(95, 50 + minute * 0.3 + totalCorners * 2);

  return {
    nextCornerTeam,
    nextCornerProbability: Math.min(95, nextCornerProbability),
    nextCornerEstimatedMinute,
    totalPrediction: {
      min: Math.max(totalCorners, totalExpected - 2),
      max: totalExpected + 3,
      expected: totalExpected,
    },
    trend,
    overUnderRecommendation,
    confidence: Math.round(confidence),
  };
}

// 生成完整的角球分析数据
function generateCornerAnalysisData(match: AdvancedMatch) {
  const homeCorners = match.corners?.home ?? 0;
  const awayCorners = match.corners?.away ?? 0;
  const minute = match.minute;

  const events = generateCornerEvents(minute, homeCorners, awayCorners);
  const prediction = predictCorners(events, minute, homeCorners, awayCorners);

  // 时间分布数据（每15分钟一个区间）
  const timeDistribution = [
    { period: '0-15', home: 0, away: 0 },
    { period: '15-30', home: 0, away: 0 },
    { period: '30-45', home: 0, away: 0 },
    { period: '45-60', home: 0, away: 0 },
    { period: '60-75', home: 0, away: 0 },
    { period: '75-90', home: 0, away: 0 },
  ];

  for (const event of events) {
    const periodIndex = Math.min(Math.floor(event.minute / 15), 5);
    if (event.team === 'home') {
      timeDistribution[periodIndex].home++;
    } else {
      timeDistribution[periodIndex].away++;
    }
  }

  // 累计曲线数据
  const cumulativeData: { minute: number; home: number; away: number; total: number }[] = [];
  let homeCount = 0;
  let awayCount = 0;

  for (let m = 0; m <= minute; m += 5) {
    const cornersUpToMinute = events.filter(e => e.minute <= m);
    homeCount = cornersUpToMinute.filter(e => e.team === 'home').length;
    awayCount = cornersUpToMinute.filter(e => e.team === 'away').length;
    cumulativeData.push({
      minute: m,
      home: homeCount,
      away: awayCount,
      total: homeCount + awayCount,
    });
  }

  // 添加当前时间点
  cumulativeData.push({
    minute,
    home: homeCorners,
    away: awayCorners,
    total: homeCorners + awayCorners,
  });

  // 历史场均数据（模拟）
  const historicalAvg = {
    home: 4.2 + Math.random() * 1.5,
    away: 3.8 + Math.random() * 1.5,
    total: 9.5 + Math.random() * 2,
  };

  return {
    match,
    events,
    prediction,
    timeDistribution,
    cumulativeData,
    historicalAvg,
    homeCorners,
    awayCorners,
    totalCorners: homeCorners + awayCorners,
    minute,
  };
}

export function CornerAnalysisPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [showMatchSelector, setShowMatchSelector] = useState(false);

  // 使用 React Query 获取当前比赛数据
  const {
    data: matchData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useMatchAdvanced(matchId ? Number(matchId) : undefined, {
    refetchInterval: 20000, // 20秒刷新
  });

  // 获取所有进行中的比赛用于快速切换
  const { data: allMatchesData } = useLiveMatchesAdvanced({
    refetchInterval: 30000,
  });
  const allLiveMatches = useMemo(() => {
    return (allMatchesData?.matches ?? []).filter(m => m.status === 'live');
  }, [allMatchesData?.matches]);

  const match = matchData?.match ?? null;
  const dataSource = matchData?.dataSource ?? 'none';
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();

  // 生成角球分析数据
  const analysisData = useMemo(() => {
    if (!match) return null;
    return generateCornerAnalysisData(match);
  }, [match]);

  // 加载状态
  if (isLoading || !analysisData) {
    return (
      <div className="min-h-screen bg-bg-deepest flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-warning border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary">加载角球数据...</p>
        </div>
      </div>
    );
  }

  // 无数据
  if (!match) {
    return (
      <div className="min-h-screen bg-bg-deepest">
        <header className="sticky top-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3">
            <Link to="/corners" className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">返回角球列表</span>
            </Link>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center py-20">
          <CornerUpRight className="w-16 h-16 text-text-muted mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">无角球比赛数据</h2>
          <p className="text-text-secondary mb-4">找不到该比赛的数据</p>
          <button
            type="button"
            onClick={() => navigate('/corners')}
            className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
          >
            返回角球列表
          </button>
        </div>
      </div>
    );
  }

  const { events, prediction, timeDistribution, cumulativeData, historicalAvg, homeCorners, awayCorners, totalCorners, minute } = analysisData;
  const leagueColor = LEAGUE_COLORS[match.league] || LEAGUE_COLORS.默认;

  return (
    <div className="min-h-screen bg-bg-deepest">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/corners" className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm hidden sm:inline">返回角球列表</span>
            </Link>
            <div className="h-4 w-px bg-border-default" />
            <span
              className="px-2 py-0.5 rounded text-xs font-medium text-white"
              style={{ backgroundColor: leagueColor }}
            >
              {match.league}
            </span>
            {/* 数据源标识 */}
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
              dataSource === 'api' ? 'bg-accent-success/20 text-accent-success' : 'bg-accent-warning/20 text-accent-warning'
            }`}>
              {dataSource === 'api' ? '实时' : '模拟'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 比赛快速切换下拉 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMatchSelector(!showMatchSelector)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-component text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="text-xs">切换比赛</span>
                <span className="px-1.5 py-0.5 rounded bg-accent-warning/20 text-accent-warning text-[10px] font-mono">
                  {allLiveMatches.length}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showMatchSelector ? 'rotate-180' : ''}`} />
              </button>

              {/* 下拉菜单 */}
              {showMatchSelector && (
                <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-bg-card border border-border-default rounded-xl shadow-xl z-50">
                  <div className="p-2 border-b border-border-default">
                    <p className="text-xs text-text-muted px-2">选择比赛查看角球分析</p>
                  </div>
                  <div className="p-2 space-y-1">
                    {allLiveMatches.map((m) => {
                      const isActive = m.id === Number(matchId);
                      const total = (m.corners?.home ?? 0) + (m.corners?.away ?? 0);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            navigate(`/corners/${m.id}`);
                            setShowMatchSelector(false);
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                            isActive
                              ? 'bg-accent-warning/20 border border-accent-warning/50'
                              : 'hover:bg-bg-component border border-transparent'
                          }`}
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-2">
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-medium text-white"
                                style={{ backgroundColor: LEAGUE_COLORS[m.league] || LEAGUE_COLORS.默认 }}
                              >
                                {m.leagueShort}
                              </span>
                              <span className="font-mono text-xs text-accent-success">{m.minute}'</span>
                            </div>
                            <p className="text-sm text-text-primary mt-1 truncate">
                              {m.home.name} {m.home.score}:{m.away.score} {m.away.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <div className="text-center">
                              <span className="text-[10px] text-text-muted block">角球</span>
                              <span className={`font-mono text-sm font-bold ${total >= 8 ? 'text-accent-warning' : 'text-text-primary'}`}>
                                {total}
                              </span>
                            </div>
                            {isActive && <Check className="w-4 h-4 text-accent-warning" />}
                          </div>
                        </button>
                      );
                    })}
                    {allLiveMatches.length === 0 && (
                      <p className="text-center text-text-muted text-sm py-4">暂无进行中的比赛</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isFetching && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-xs">
                <span className="w-2 h-2 border border-accent-primary border-t-transparent rounded-full animate-spin" />
                刷新中
              </span>
            )}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-component text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="text-xs hidden sm:inline">
                {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 点击外部关闭下拉菜单 */}
      {showMatchSelector && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMatchSelector(false)}
        />
      )}

      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-6">
        {/* 页面标题和比赛信息 */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-accent-warning/20 flex items-center justify-center">
              <CornerUpRight className="w-7 h-7 text-accent-warning" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">角球深度分析</h1>
              <p className="text-sm text-text-secondary">
                {match.home.name} vs {match.away.name} · {minute}'
              </p>
            </div>
          </div>

          {/* 实时角球统计 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-primary/10 border border-accent-primary/30">
              <span className="text-sm text-text-secondary">主队</span>
              <span className="font-mono text-2xl font-bold text-accent-primary">{homeCorners}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-success/10 border border-accent-success/30">
              <span className="text-sm text-text-secondary">总计</span>
              <span className="font-mono text-2xl font-bold text-accent-success">{totalCorners}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-danger/10 border border-accent-danger/30">
              <span className="text-sm text-text-secondary">客队</span>
              <span className="font-mono text-2xl font-bold text-accent-danger">{awayCorners}</span>
            </div>
          </div>
        </div>

        {/* 主要内容 */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* 左侧：图表区域 */}
          <div className="xl:col-span-8 space-y-6">
            {/* 角球统计卡片 */}
            <CornerStatsCards
              homeCorners={homeCorners}
              awayCorners={awayCorners}
              minute={minute}
              events={events}
              historicalAvg={historicalAvg}
            />

            {/* 角球时间分布 */}
            <CornerTimeDistribution data={timeDistribution} currentMinute={minute} />

            {/* 角球累计曲线 */}
            <CornerCumulativeChart data={cumulativeData} currentMinute={minute} />

            {/* 历史趋势对比图表 */}
            <CornerHistoryComparison
              currentCorners={totalCorners}
              minute={minute}
              historicalAvg={historicalAvg}
              homeCorners={homeCorners}
              awayCorners={awayCorners}
            />

            {/* 角球事件时间线 */}
            <CornerEventsTimeline events={events} homeName={match.home.name} awayName={match.away.name} />
          </div>

          {/* 右侧：预测和分析 */}
          <div className="xl:col-span-4 space-y-6">
            {/* 下一角球预测 */}
            <NextCornerPrediction
              prediction={prediction}
              homeName={match.home.name}
              awayName={match.away.name}
              currentMinute={minute}
            />

            {/* 全场预测 */}
            <TotalCornerPrediction prediction={prediction} currentTotal={totalCorners} />

            {/* 角球趋势分析 */}
            <CornerTrendAnalysis
              prediction={prediction}
              totalCorners={totalCorners}
              minute={minute}
              historicalAvg={historicalAvg}
            />

            {/* 角球盘口建议 */}
            <CornerOddsRecommendation
              prediction={prediction}
              totalCorners={totalCorners}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 角球统计卡片
// ============================================
function CornerStatsCards({
  homeCorners,
  awayCorners,
  minute,
  events,
  historicalAvg,
}: {
  homeCorners: number;
  awayCorners: number;
  minute: number;
  events: CornerEvent[];
  historicalAvg: { home: number; away: number; total: number };
}) {
  const totalCorners = homeCorners + awayCorners;
  const cornerRate = minute > 0 ? (totalCorners / minute * 90).toFixed(1) : '0';
  const recentCorners = events.filter(e => e.minute > minute - 15).length;

  const homeFirstHalf = events.filter(e => e.team === 'home' && e.period === '1H').length;
  const homeSecondHalf = events.filter(e => e.team === 'home' && e.period === '2H').length;
  const awayFirstHalf = events.filter(e => e.team === 'away' && e.period === '1H').length;
  const awaySecondHalf = events.filter(e => e.team === 'away' && e.period === '2H').length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 主队角球 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-text-secondary">主队角球</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-primary/20 text-accent-primary">HOME</span>
        </div>
        <div className="text-center">
          <span className="font-mono text-4xl font-black text-accent-primary">{homeCorners}</span>
          <div className="flex items-center justify-center gap-3 mt-3 text-xs text-text-muted">
            <span>上: {homeFirstHalf}</span>
            <span className="w-px h-3 bg-border-default" />
            <span>下: {homeSecondHalf}</span>
          </div>
          <p className="text-xs text-text-muted mt-2">
            场均 {historicalAvg.home.toFixed(1)}
            {homeCorners > historicalAvg.home ? (
              <span className="text-accent-success ml-1">↑</span>
            ) : (
              <span className="text-accent-danger ml-1">↓</span>
            )}
          </p>
        </div>
      </div>

      {/* 客队角球 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-text-secondary">客队角球</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-danger/20 text-accent-danger">AWAY</span>
        </div>
        <div className="text-center">
          <span className="font-mono text-4xl font-black text-accent-danger">{awayCorners}</span>
          <div className="flex items-center justify-center gap-3 mt-3 text-xs text-text-muted">
            <span>上: {awayFirstHalf}</span>
            <span className="w-px h-3 bg-border-default" />
            <span>下: {awaySecondHalf}</span>
          </div>
          <p className="text-xs text-text-muted mt-2">
            场均 {historicalAvg.away.toFixed(1)}
            {awayCorners > historicalAvg.away ? (
              <span className="text-accent-success ml-1">↑</span>
            ) : (
              <span className="text-accent-danger ml-1">↓</span>
            )}
          </p>
        </div>
      </div>

      {/* 全场预估 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-text-secondary">全场预估</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-warning/20 text-accent-warning">90'</span>
        </div>
        <div className="text-center">
          <span className="font-mono text-4xl font-black text-accent-warning">{cornerRate}</span>
          <p className="text-xs text-text-muted mt-3">按当前速率计算</p>
          <p className="text-xs text-text-muted mt-1">
            场均 {historicalAvg.total.toFixed(1)}
          </p>
        </div>
      </div>

      {/* 近15分钟 */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-text-secondary">近15分钟</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-success/20 text-accent-success">RECENT</span>
        </div>
        <div className="text-center">
          <span className={`font-mono text-4xl font-black ${recentCorners >= 3 ? 'text-accent-danger' : recentCorners >= 2 ? 'text-accent-warning' : 'text-accent-success'}`}>
            {recentCorners}
          </span>
          <p className="text-xs text-text-muted mt-3">
            {recentCorners >= 3 ? '角球密集' : recentCorners >= 2 ? '正常频率' : '角球较少'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            速率 {(recentCorners / 15 * 90).toFixed(1)}/场
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 角球时间分布
// ============================================
function CornerTimeDistribution({
  data,
  currentMinute,
}: {
  data: { period: string; home: number; away: number }[];
  currentMinute: number;
}) {
  const currentPeriodIndex = Math.min(Math.floor(currentMinute / 15), 5);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">角球时间分布</h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-accent-primary" />
            <span className="text-text-muted">主队</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-accent-danger" />
            <span className="text-text-muted">客队</span>
          </div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="period"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
            <Bar dataKey="home" name="主队" fill="#00d4ff" radius={[4, 4, 0, 0]} />
            <Bar dataKey="away" name="客队" fill="#ff4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 时段标注 */}
      <div className="flex justify-between mt-2 text-[10px] text-text-muted">
        {data.map((d, i) => (
          <span
            key={d.period}
            className={`px-2 py-0.5 rounded ${
              i === currentPeriodIndex ? 'bg-accent-primary/20 text-accent-primary' : ''
            }`}
          >
            {d.period}'
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================
// 角球累计曲线
// ============================================
function CornerCumulativeChart({
  data,
  currentMinute,
}: {
  data: { minute: number; home: number; away: number; total: number }[];
  currentMinute: number;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">角球累计曲线</h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-accent-primary" />
            <span className="text-text-muted">主队</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-accent-danger" />
            <span className="text-text-muted">客队</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-accent-success" />
            <span className="text-text-muted">总计</span>
          </div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="minute"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 11 }}
              tickFormatter={(v) => `${v}'`}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              labelFormatter={(v) => `${v}分钟`}
            />
            <ReferenceLine x={45} stroke="#30363d" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="home" name="主队" stroke="#00d4ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="away" name="客队" stroke="#ff4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total" name="总计" stroke="#00cc66" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 半场标注 */}
      <div className="flex justify-center mt-2 text-xs text-text-muted">
        <span className="px-3 py-1 rounded bg-bg-component">HT = 中场休息</span>
      </div>
    </div>
  );
}

// ============================================
// 角球事件时间线
// ============================================
function CornerEventsTimeline({
  events,
  homeName,
  awayName,
}: {
  events: CornerEvent[];
  homeName: string;
  awayName: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">角球事件时间线</h2>
      </div>

      {/* 时间轴可视化 */}
      <div className="relative h-16 bg-bg-component rounded-xl overflow-hidden mb-4">
        {/* 半场分界线 */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border-default" />
        <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[10px] text-text-muted bg-bg-component px-1">HT</span>

        {/* 角球事件 */}
        {events.map((event, i) => {
          const x = (event.minute / 90) * 100;
          const isHome = event.team === 'home';

          return (
            <div
              key={`corner-${event.minute}-${i}`}
              className={`absolute w-3 h-3 rounded-full transition-all hover:scale-150 cursor-pointer ${
                isHome ? 'bg-accent-primary top-3' : 'bg-accent-danger bottom-3'
              }`}
              style={{ left: `${x}%` }}
              title={`${event.minute}' - ${isHome ? homeName : awayName}`}
            />
          );
        })}

        {/* 中线标签 */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-accent-primary">{homeName}</div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-accent-danger">{awayName}</div>
      </div>

      {/* 事件列表 */}
      <div className="flex flex-wrap gap-2">
        {events.slice(-10).map((event, i) => (
          <div
            key={`event-${event.minute}-${i}`}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${
              event.team === 'home'
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'bg-accent-danger/10 text-accent-danger'
            }`}
          >
            <CornerUpRight className="w-3 h-3" />
            <span className="font-mono">{event.minute}'</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// 下一角球预测
// ============================================
function NextCornerPrediction({
  prediction,
  homeName,
  awayName,
  currentMinute,
}: {
  prediction: CornerPrediction;
  homeName: string;
  awayName: string;
  currentMinute: number;
}) {
  const getTeamText = () => {
    if (prediction.nextCornerTeam === 'home') return homeName;
    if (prediction.nextCornerTeam === 'away') return awayName;
    return '不确定';
  };

  const getTeamColor = () => {
    if (prediction.nextCornerTeam === 'home') return 'text-accent-primary';
    if (prediction.nextCornerTeam === 'away') return 'text-accent-danger';
    return 'text-text-muted';
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-accent-warning" />
        <h2 className="text-lg font-semibold text-text-primary">下一角球预测</h2>
      </div>

      <div className="text-center py-4">
        <p className="text-sm text-text-muted mb-2">预测下一角球方</p>
        <p className={`text-2xl font-bold ${getTeamColor()}`}>{getTeamText()}</p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <span className="text-sm text-text-muted">概率</span>
          <span className={`font-mono text-lg font-bold ${
            prediction.nextCornerProbability >= 70 ? 'text-accent-success' : 'text-text-primary'
          }`}>
            {prediction.nextCornerProbability}%
          </span>
        </div>
      </div>

      <div className="mt-4 p-4 rounded-xl bg-bg-component">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-muted">预估时间</span>
          <span className="font-mono text-lg font-bold text-accent-warning">
            {prediction.nextCornerEstimatedMinute}'
          </span>
        </div>
        <div className="h-2 bg-bg-deepest rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-warning rounded-full transition-all"
            style={{ width: `${(currentMinute / prediction.nextCornerEstimatedMinute) * 100}%` }}
          />
        </div>
        <p className="text-xs text-text-muted mt-2 text-center">
          距离下一角球约 {Math.max(0, prediction.nextCornerEstimatedMinute - currentMinute)} 分钟
        </p>
      </div>
    </div>
  );
}

// ============================================
// 全场预测
// ============================================
function TotalCornerPrediction({
  prediction,
  currentTotal,
}: {
  prediction: CornerPrediction;
  currentTotal: number;
}) {
  const { totalPrediction, confidence } = prediction;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent-success" />
          <h2 className="text-lg font-semibold text-text-primary">全场预测</h2>
        </div>
        <span className="px-2 py-0.5 rounded text-xs font-mono bg-accent-success/20 text-accent-success">
          置信度 {confidence}%
        </span>
      </div>

      <div className="text-center py-4">
        <p className="text-sm text-text-muted mb-2">预测全场角球</p>
        <div className="flex items-center justify-center gap-2">
          <span className="font-mono text-lg text-text-muted">{totalPrediction.min}</span>
          <span className="text-text-muted">-</span>
          <span className="font-mono text-4xl font-black text-accent-success">{totalPrediction.expected}</span>
          <span className="text-text-muted">-</span>
          <span className="font-mono text-lg text-text-muted">{totalPrediction.max}</span>
        </div>
        <p className="text-xs text-text-muted mt-2">（最小 - 预期 - 最大）</p>
      </div>

      <div className="mt-4 p-4 rounded-xl bg-bg-component">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-muted">当前进度</span>
          <span className="font-mono text-sm text-text-primary">
            {currentTotal} / {totalPrediction.expected}
          </span>
        </div>
        <div className="h-3 bg-bg-deepest rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent-primary to-accent-success rounded-full transition-all"
            style={{ width: `${Math.min(100, (currentTotal / totalPrediction.expected) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-text-muted mt-2 text-center">
          预计还需 {Math.max(0, totalPrediction.expected - currentTotal)} 个角球
        </p>
      </div>
    </div>
  );
}

// ============================================
// 角球趋势分析
// ============================================
function CornerTrendAnalysis({
  prediction,
  totalCorners,
  minute,
  historicalAvg,
}: {
  prediction: CornerPrediction;
  totalCorners: number;
  minute: number;
  historicalAvg: { home: number; away: number; total: number };
}) {
  const getTrendIcon = () => {
    if (prediction.trend === 'increasing') return <TrendingUp className="w-5 h-5 text-accent-success" />;
    if (prediction.trend === 'decreasing') return <TrendingDown className="w-5 h-5 text-accent-danger" />;
    return <Minus className="w-5 h-5 text-text-muted" />;
  };

  const getTrendText = () => {
    if (prediction.trend === 'increasing') return '角球趋势上升';
    if (prediction.trend === 'decreasing') return '角球趋势下降';
    return '角球趋势平稳';
  };

  const getTrendColor = () => {
    if (prediction.trend === 'increasing') return 'text-accent-success';
    if (prediction.trend === 'decreasing') return 'text-accent-danger';
    return 'text-text-muted';
  };

  // 与场均对比
  const expectedAtMinute = (historicalAvg.total / 90) * minute;
  const diff = totalCorners - expectedAtMinute;
  const diffPercent = expectedAtMinute > 0 ? ((diff / expectedAtMinute) * 100).toFixed(0) : 0;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-accent-primary" />
        <h2 className="text-lg font-semibold text-text-primary">趋势分析</h2>
      </div>

      <div className="space-y-4">
        {/* 趋势状态 */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-bg-component">
          <div className="flex items-center gap-2">
            {getTrendIcon()}
            <span className={`font-medium ${getTrendColor()}`}>{getTrendText()}</span>
          </div>
          <span className="text-xs text-text-muted">近15分钟对比</span>
        </div>

        {/* 与场均对比 */}
        <div className="p-3 rounded-lg bg-bg-component">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-muted">较场均</span>
            <span className={`font-mono font-bold ${
              diff > 0 ? 'text-accent-success' : diff < 0 ? 'text-accent-danger' : 'text-text-muted'
            }`}>
              {diff > 0 ? '+' : ''}{diff.toFixed(1)} ({diff > 0 ? '+' : ''}{diffPercent}%)
            </span>
          </div>
          <p className="text-xs text-text-muted">
            同时段场均 {expectedAtMinute.toFixed(1)} 个角球
          </p>
        </div>

        {/* 角球速率 */}
        <div className="p-3 rounded-lg bg-bg-component">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-muted">当前速率</span>
            <span className="font-mono font-bold text-text-primary">
              {minute > 0 ? (totalCorners / minute * 90).toFixed(1) : '0'} 个/场
            </span>
          </div>
          <p className="text-xs text-text-muted">
            历史场均 {historicalAvg.total.toFixed(1)} 个/场
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 角球盘口建议
// ============================================
function CornerOddsRecommendation({
  prediction,
  totalCorners,
}: {
  prediction: CornerPrediction;
  totalCorners: number;
}) {
  const cornerLine = 9.5; // 常见角球盘口

  const getRecommendationStyle = () => {
    if (prediction.overUnderRecommendation === 'over') {
      return 'bg-accent-success/10 border-accent-success/30 text-accent-success';
    }
    if (prediction.overUnderRecommendation === 'under') {
      return 'bg-accent-danger/10 border-accent-danger/30 text-accent-danger';
    }
    return 'bg-bg-component border-border-default text-text-muted';
  };

  const getRecommendationText = () => {
    if (prediction.overUnderRecommendation === 'over') return '建议大球';
    if (prediction.overUnderRecommendation === 'under') return '建议小球';
    return '观望';
  };

  const getRecommendationIcon = () => {
    if (prediction.overUnderRecommendation === 'over') return <ArrowUpRight className="w-5 h-5" />;
    if (prediction.overUnderRecommendation === 'under') return <ArrowDownRight className="w-5 h-5" />;
    return <Minus className="w-5 h-5" />;
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-accent-warning" />
        <h2 className="text-lg font-semibold text-text-primary">盘口建议</h2>
      </div>

      {/* 盘口信息 */}
      <div className="text-center mb-4">
        <p className="text-sm text-text-muted mb-1">角球大小球盘口</p>
        <span className="font-mono text-3xl font-black text-text-primary">{cornerLine}</span>
      </div>

      {/* 建议 */}
      <div className={`flex items-center justify-center gap-3 p-4 rounded-xl border ${getRecommendationStyle()}`}>
        {getRecommendationIcon()}
        <span className="text-lg font-bold">{getRecommendationText()}</span>
      </div>

      {/* 分析 */}
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-muted">当前角球</span>
          <span className="font-mono text-text-primary">{totalCorners}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted">距离盘口</span>
          <span className={`font-mono ${
            totalCorners >= cornerLine ? 'text-accent-success' : 'text-accent-danger'
          }`}>
            {totalCorners >= cornerLine ? '已过盘' : `差 ${(cornerLine - totalCorners).toFixed(1)}`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted">预测终盘</span>
          <span className="font-mono text-text-primary">{prediction.totalPrediction.expected}</span>
        </div>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-bg-deepest">
        <p className="text-xs text-text-muted text-center">
          {prediction.overUnderRecommendation === 'over' && '📈 按当前趋势，角球数有望突破盘口'}
          {prediction.overUnderRecommendation === 'under' && '📉 角球速率较低，小球可能性较大'}
          {prediction.overUnderRecommendation === 'neutral' && '⏸️ 数据中性，建议继续观察'}
        </p>
      </div>
    </div>
  );
}

// ============================================
// 历史趋势对比图表
// ============================================
function CornerHistoryComparison({
  currentCorners,
  minute,
  historicalAvg,
  homeCorners,
  awayCorners,
}: {
  currentCorners: number;
  minute: number;
  historicalAvg: { home: number; away: number; total: number };
  homeCorners: number;
  awayCorners: number;
}) {
  // 生成历史对比数据（按时间段）
  const comparisonData = useMemo(() => {
    const data = [];
    const timePoints = [15, 30, 45, 60, 75, 90];

    for (const t of timePoints) {
      // 场均预期角球（按时间线性分布）
      const expectedTotal = (historicalAvg.total / 90) * t;
      const expectedHome = (historicalAvg.home / 90) * t;
      const expectedAway = (historicalAvg.away / 90) * t;

      // 当前比赛进度（如果已到该时间点）
      let actualTotal = null;
      let actualHome = null;
      let actualAway = null;

      if (minute >= t) {
        // 按比例估算该时间点的角球数
        const ratio = t / minute;
        actualTotal = Math.round(currentCorners * ratio * 10) / 10;
        actualHome = Math.round(homeCorners * ratio * 10) / 10;
        actualAway = Math.round(awayCorners * ratio * 10) / 10;
      } else if (t === Math.ceil(minute / 15) * 15 && minute > 0) {
        // 当前时间点
        actualTotal = currentCorners;
        actualHome = homeCorners;
        actualAway = awayCorners;
      }

      data.push({
        time: `${t}'`,
        expected: Math.round(expectedTotal * 10) / 10,
        actual: actualTotal,
        expectedHome: Math.round(expectedHome * 10) / 10,
        expectedAway: Math.round(expectedAway * 10) / 10,
        isCurrent: t === Math.ceil(minute / 15) * 15,
      });
    }

    return data;
  }, [currentCorners, minute, historicalAvg, homeCorners, awayCorners]);

  // 计算当前与场均的差异
  const expectedAtMinute = (historicalAvg.total / 90) * minute;
  const diff = currentCorners - expectedAtMinute;
  const diffPercent = expectedAtMinute > 0 ? ((diff / expectedAtMinute) * 100) : 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent-primary" />
          <h2 className="text-lg font-semibold text-text-primary">历史趋势对比</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            diff > 0 ? 'bg-accent-success/20 text-accent-success' : diff < 0 ? 'bg-accent-danger/20 text-accent-danger' : 'bg-bg-component text-text-muted'
          }`}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)} ({diff > 0 ? '+' : ''}{diffPercent.toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* 对比说明 */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded-lg bg-bg-component">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted">当前角球</span>
            <span className="font-mono text-lg font-bold text-accent-primary">{currentCorners}</span>
          </div>
          <p className="text-[10px] text-text-muted">第 {minute} 分钟</p>
        </div>
        <div className="p-3 rounded-lg bg-bg-component">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted">场均预期</span>
            <span className="font-mono text-lg font-bold text-text-secondary">{expectedAtMinute.toFixed(1)}</span>
          </div>
          <p className="text-[10px] text-text-muted">同时段场均</p>
        </div>
      </div>

      {/* 对比图表 */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={comparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#00d4ff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8b949e', fontSize: 11 }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value, name) => [
                value ?? '-',
                name === 'expected' ? '场均预期' : '本场实际'
              ]}
            />
            {/* 场均预期线 */}
            <Line
              type="monotone"
              dataKey="expected"
              name="expected"
              stroke="#8b949e"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
            {/* 本场实际区域 */}
            <Area
              type="monotone"
              dataKey="actual"
              name="actual"
              stroke="#00d4ff"
              strokeWidth={2}
              fill="url(#actualGradient)"
              connectNulls={false}
            />
            {/* 当前时间点标记 */}
            <ReferenceLine
              x={`${Math.ceil(minute / 15) * 15}'`}
              stroke="#ffaa00"
              strokeDasharray="3 3"
              label={{ value: '当前', fill: '#ffaa00', fontSize: 10, position: 'top' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 图例 */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-accent-primary" />
          <span className="text-text-muted">本场实际</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-text-muted" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#8b949e' }} />
          <span className="text-text-muted">场均预期</span>
        </div>
      </div>

      {/* 分析结论 */}
      <div className="mt-4 p-3 rounded-lg bg-bg-deepest">
        <p className="text-xs text-text-muted text-center">
          {diff > 2 && '📈 本场角球明显高于场均，进攻节奏较快'}
          {diff > 0 && diff <= 2 && '📊 本场角球略高于场均，表现正常'}
          {diff === 0 && '📊 本场角球与场均持平'}
          {diff < 0 && diff >= -2 && '📉 本场角球略低于场均，进攻节奏较慢'}
          {diff < -2 && '📉 本场角球明显低于场均，可能防守为主'}
        </p>
      </div>
    </div>
  );
}

export default CornerAnalysisPage;
