// ============================================
// 角球分析列表页 - 显示所有进行中比赛的角球数据
// ============================================

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CornerUpRight, RefreshCw, TrendingUp, TrendingDown,
  Activity, Target, Filter, ChevronRight, AlertTriangle
} from 'lucide-react';
import { useLiveMatchesAdvanced, useRefreshMatches } from '../hooks/useMatches';
import type { AdvancedMatch } from '../data/advancedMockData';
import { LEAGUE_COLORS } from '../data/advancedMockData';

// 排序类型
type SortType = 'corners' | 'recent' | 'minute';

export function CornersLandingPage() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortType>('corners');
  const [minCorners, setMinCorners] = useState<number>(0);

  // 使用 React Query 获取实时数据
  const {
    data: matchesData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useLiveMatchesAdvanced({
    refetchInterval: 20000, // 20秒刷新角球数据
  });

  const { refreshLiveAdvanced } = useRefreshMatches();

  // 从数据中获取比赛列表
  const matches = matchesData?.matches ?? [];
  const dataSource = matchesData?.dataSource ?? 'none';
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // 筛选和排序比赛
  const filteredMatches = useMemo(() => {
    // 只显示进行中的比赛
    let result = matches.filter(m => m.status === 'live');

    // 按最低角球数筛选
    if (minCorners > 0) {
      result = result.filter(m => ((m.corners?.home ?? 0) + (m.corners?.away ?? 0)) >= minCorners);
    }

    // 排序
    if (sortBy === 'corners') {
      result.sort((a, b) => ((b.corners?.home ?? 0) + (b.corners?.away ?? 0)) - ((a.corners?.home ?? 0) + (a.corners?.away ?? 0)));
    } else if (sortBy === 'recent') {
      result.sort((a, b) => (b.corners?.recent5min ?? 0) - (a.corners?.recent5min ?? 0));
    } else if (sortBy === 'minute') {
      result.sort((a, b) => b.minute - a.minute);
    }

    return result;
  }, [matches, sortBy, minCorners]);

  // 统计数据
  const stats = useMemo(() => {
    const liveMatches = matches.filter(m => m.status === 'live');
    const totalCorners = liveMatches.reduce((sum, m) => sum + (m.corners?.home ?? 0) + (m.corners?.away ?? 0), 0);
    const denseCornerMatches = liveMatches.filter(m => (m.corners?.recent5min ?? 0) >= 2).length;
    const highCornerMatches = liveMatches.filter(m => ((m.corners?.home ?? 0) + (m.corners?.away ?? 0)) >= 8).length;

    return {
      liveCount: liveMatches.length,
      totalCorners,
      denseCornerMatches,
      highCornerMatches,
    };
  }, [matches]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-deepest flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-warning border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary">加载角球数据...</p>
        </div>
      </div>
    );
  }

  // 无比赛数据
  if (filteredMatches.length === 0) {
    return (
      <div className="min-h-screen bg-bg-deepest">
        {/* 顶部导航 */}
        <header className="sticky top-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
          <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm hidden sm:inline">返回大厅</span>
              </Link>
              <div className="h-4 w-px bg-border-default" />
              <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <CornerUpRight className="w-5 h-5 text-accent-warning" />
                角球分析
              </h1>
            </div>
          </div>
        </header>

        <div className="flex flex-col items-center justify-center py-20">
          <CornerUpRight className="w-16 h-16 text-text-muted mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">无角球比赛数据</h2>
          <p className="text-text-secondary mb-4">
            {matches.length === 0 ? '当前没有进行中的比赛' : '没有符合筛选条件的比赛'}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMinCorners(0)}
              className="px-4 py-2 rounded-lg bg-bg-component text-text-secondary hover:text-text-primary transition-colors"
            >
              重置筛选
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-deepest">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm hidden sm:inline">返回大厅</span>
            </Link>
            <div className="h-4 w-px bg-border-default" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-warning/20 flex items-center justify-center">
                <CornerUpRight className="w-5 h-5 text-accent-warning" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-text-primary">角球分析</h1>
                <p className="text-[10px] text-text-muted">实时角球数据监控</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 数据源标识 */}
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              dataSource === 'api' ? 'bg-accent-success/20 text-accent-success' : 'bg-accent-warning/20 text-accent-warning'
            }`}>
              {dataSource === 'api' ? '实时数据' : '无数据'}
            </span>

            {/* 刷新按钮 */}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-component text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="text-xs hidden sm:inline">
                {lastUpdate ? lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '刷新'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={Activity}
            label="进行中比赛"
            value={stats.liveCount}
            color="primary"
          />
          <StatCard
            icon={CornerUpRight}
            label="总角球数"
            value={stats.totalCorners}
            color="warning"
          />
          <StatCard
            icon={TrendingUp}
            label="角球密集"
            value={stats.denseCornerMatches}
            subLabel="近5分钟≥2个"
            color="danger"
          />
          <StatCard
            icon={Target}
            label="高角球场次"
            value={stats.highCornerMatches}
            subLabel="总角球≥8个"
            color="success"
          />
        </div>

        {/* 筛选栏 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-muted" />
            <span className="text-sm text-text-secondary">排序：</span>
            <div className="flex items-center gap-1 bg-bg-component rounded-lg p-1">
              {[
                { key: 'corners', label: '总角球' },
                { key: 'recent', label: '近5分钟' },
                { key: 'minute', label: '比赛时间' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortBy(key as SortType)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    sortBy === key
                      ? 'bg-accent-warning text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">最低角球：</span>
            <select
              value={minCorners}
              onChange={(e) => setMinCorners(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg bg-bg-component border border-border-default text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-warning"
            >
              <option value={0}>全部</option>
              <option value={3}>≥3个</option>
              <option value={5}>≥5个</option>
              <option value={8}>≥8个</option>
            </select>
          </div>
        </div>

        {/* 比赛列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMatches.map((match) => (
            <CornerMatchCard
              key={match.id}
              match={match}
              onClick={() => navigate(`/corners/${match.id}`)}
            />
          ))}
        </div>

        {/* 底部提示 */}
        <div className="mt-6 text-center text-xs text-text-muted">
          <p>数据每20秒自动刷新 · 点击比赛卡片查看详细角球分析</p>
        </div>
      </div>
    </div>
  );
}

// 统计卡片
function StatCard({
  icon: Icon,
  label,
  value,
  subLabel,
  color,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: number;
  subLabel?: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const colorClasses = {
    primary: 'bg-accent-primary/10 text-accent-primary border-accent-primary/30',
    success: 'bg-accent-success/10 text-accent-success border-accent-success/30',
    warning: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',
    danger: 'bg-accent-danger/10 text-accent-danger border-accent-danger/30',
  };

  return (
    <div className={`card border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs opacity-80">{label}</span>
      </div>
      <p className="font-mono text-2xl font-bold">{value}</p>
      {subLabel && <p className="text-[10px] opacity-70 mt-1">{subLabel}</p>}
    </div>
  );
}

// 计算角球盘口建议
function getCornerOddsRecommendation(totalCorners: number, minute: number, recent5min: number) {
  const cornerLine = 9.5; // 常见角球盘口
  const remainingMinutes = 90 - minute;

  // 计算预期全场角球
  const currentRate = minute > 0 ? totalCorners / minute : 0;
  const recentRate = recent5min / 5;

  // 使用近5分钟速率权重更高
  const weightedRate = minute > 30 ? (currentRate * 0.4 + recentRate * 0.6) : currentRate;
  const expectedTotal = totalCorners + weightedRate * remainingMinutes;

  // 判断建议
  let recommendation: 'over' | 'under' | 'neutral' = 'neutral';
  let confidence = 50;

  if (expectedTotal > cornerLine + 1.5) {
    recommendation = 'over';
    confidence = Math.min(85, 50 + (expectedTotal - cornerLine) * 5);
  } else if (expectedTotal < cornerLine - 1.5) {
    recommendation = 'under';
    confidence = Math.min(85, 50 + (cornerLine - expectedTotal) * 5);
  }

  // 已过盘或接近过盘
  const distanceToLine = cornerLine - totalCorners;
  const isPassed = totalCorners >= cornerLine;

  return {
    line: cornerLine,
    recommendation,
    expectedTotal: Math.round(expectedTotal * 10) / 10,
    confidence: Math.round(confidence),
    distanceToLine: Math.round(distanceToLine * 10) / 10,
    isPassed,
  };
}

// 比赛卡片
function CornerMatchCard({
  match,
  onClick,
}: {
  match: AdvancedMatch;
  onClick: () => void;
}) {
  const leagueColor = LEAGUE_COLORS[match.league] || LEAGUE_COLORS.默认;
  const totalCorners = (match.corners?.home ?? 0) + (match.corners?.away ?? 0);
  const isDenseCorner = (match.corners?.recent5min ?? 0) >= 2;
  const isHighCorner = totalCorners >= 8;

  // 计算角球速率
  const cornerRate = match.minute > 0 ? (totalCorners / match.minute * 90).toFixed(1) : '0';

  // 计算角球盘口建议
  const oddsInfo = getCornerOddsRecommendation(totalCorners, match.minute, match.corners?.recent5min ?? 0);

  return (
    <div
      className={`card cursor-pointer transition-all hover:scale-[1.02] hover:border-accent-warning/50 ${
        isDenseCorner ? 'border-l-4 border-l-accent-danger' : isHighCorner ? 'border-l-4 border-l-accent-warning' : ''
      }`}
      onClick={onClick}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
          style={{ backgroundColor: leagueColor }}
        >
          {match.leagueShort}
        </span>
        <div className="flex items-center gap-2">
          {isDenseCorner && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-danger/20 text-accent-danger flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              密集
            </span>
          )}
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse" />
            <span className="font-mono text-xs text-accent-success">{match.minute}'</span>
          </div>
        </div>
      </div>

      {/* 球队信息 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{match.home.name}</p>
          <p className="text-sm font-medium text-text-primary truncate mt-1">{match.away.name}</p>
        </div>
        <div className="text-center px-3">
          <p className="font-mono text-xl font-bold text-text-primary">
            {match.home.score} : {match.away.score}
          </p>
        </div>
      </div>

      {/* 角球数据 */}
      <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-bg-component">
        <div className="text-center">
          <span className="text-[10px] text-text-muted block">主队</span>
          <span className="font-mono text-lg font-bold text-accent-primary">{match.corners?.home ?? 0}</span>
        </div>
        <div className="text-center border-x border-border-default">
          <span className="text-[10px] text-text-muted block">总计</span>
          <span className={`font-mono text-lg font-bold ${isHighCorner ? 'text-accent-warning' : 'text-text-primary'}`}>
            {totalCorners}
          </span>
        </div>
        <div className="text-center">
          <span className="text-[10px] text-text-muted block">客队</span>
          <span className="font-mono text-lg font-bold text-accent-danger">{match.corners?.away ?? 0}</span>
        </div>
      </div>

      {/* 角球盘口数据和建议 */}
      <div className="mt-3 p-3 rounded-lg bg-bg-deepest">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">角球盘口</span>
            <span className="font-mono text-sm font-bold text-text-primary">{oddsInfo.line}</span>
          </div>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
            oddsInfo.recommendation === 'over'
              ? 'bg-accent-success/20 text-accent-success'
              : oddsInfo.recommendation === 'under'
              ? 'bg-accent-danger/20 text-accent-danger'
              : 'bg-bg-component text-text-muted'
          }`}>
            {oddsInfo.recommendation === 'over' && (
              <>
                <TrendingUp className="w-3 h-3" />
                <span>大球</span>
              </>
            )}
            {oddsInfo.recommendation === 'under' && (
              <>
                <TrendingDown className="w-3 h-3" />
                <span>小球</span>
              </>
            )}
            {oddsInfo.recommendation === 'neutral' && <span>观望</span>}
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-text-muted">
            {oddsInfo.isPassed ? (
              <span className="text-accent-success">已过盘 ✓</span>
            ) : (
              <span>差 <span className="font-mono text-text-primary">{oddsInfo.distanceToLine}</span> 个</span>
            )}
          </span>
          <span className="text-text-muted">
            预测: <span className="font-mono text-accent-warning">{oddsInfo.expectedTotal}</span>
            <span className="ml-1 text-text-muted/70">({oddsInfo.confidence}%)</span>
          </span>
        </div>
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-default">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>近5分钟: <span className={`font-mono ${(match.corners?.recent5min ?? 0) >= 2 ? 'text-accent-danger' : 'text-text-primary'}`}>{match.corners?.recent5min ?? 0}</span></span>
          <span>速率: <span className="font-mono text-text-primary">{cornerRate}/场</span></span>
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted" />
      </div>
    </div>
  );
}

export default CornersLandingPage;
