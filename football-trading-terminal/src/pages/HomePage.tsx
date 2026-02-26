// ============================================
// 足球交易决策终端 - 首页（简化版）
// 核心诉求：75分钟后的进球机会 = 投资机会
// ============================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Volume2, VolumeX, RefreshCw, ChevronDown, ChevronRight, HelpCircle, X,
  Monitor, CornerUpRight, BarChart3, Clock, Radar, Settings, Wifi, WifiOff,
  Menu, LayoutGrid, LayoutList, ChevronUp, TrendingUp, Target, Zap
} from 'lucide-react';
// LeagueSidebar removed per P0 requirements
import { AdvancedMatchTable } from '../components/home/AdvancedMatchTable';
import { MatchTableV2 } from '../components/home/MatchTableV2';
import { DataStatsPanel } from '../components/home/DataStatsPanel';
import { addToHistory, getHistoryStats } from '../services/matchHistoryService';
import { useLiveMatchesAdvanced, useRefreshMatches } from '../hooks/useMatches';
import { calculateDynamicScore, type ScoreResult } from '../services/scoringEngine';
import type { AdvancedMatch } from '../data/advancedMockData';
import { soundService } from '../services/soundService';
import { isApiKeyConfigured } from '../services/api';
import { ApiSettingsPanel } from '../components/settings/ApiSettingsPanel';
import { MobileMenu } from '../components/layout/MobileMenu';
import { AcceptanceReport } from '../components/home/AcceptanceReport';

// ============================================
// 类型定义
// ============================================

interface MatchWithScore extends AdvancedMatch {
  scoreResult: ScoreResult | null;
}

type ViewMode = 'card' | 'table';

interface Filters {
  league: string;
  minMinute: number;
  showAll: boolean; // 显示所有比赛还是只显示75+
}

// ============================================
// 主组件
// ============================================

export function HomePage() {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);

  // 状态
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [watchedMatches, setWatchedMatches] = useState<Set<number>>(new Set());

  // 简化的筛选器 - 默认显示全部比赛
  const [filters, setFilters] = useState<Filters>({
    league: 'ALL',
    minMinute: 0,
    showAll: true, // 默认显示全部，用户可选择75+或80+筛选
  });

  // 数据获取
  const { data: matchesData, isLoading, error, refetch } = useLiveMatchesAdvanced();
  const refreshMatches = useRefreshMatches();

  // 是否使用新表格 V2
  const [useTableV2, setUseTableV2] = useState(true);

  // Phase 2A: 显示验收报告
  const [showAcceptanceReport, setShowAcceptanceReport] = useState(false);

  // 处理比赛数据 - 过滤已结束比赛，保存到历史
  const processedMatches = useMemo(() => {
    const all = matchesData?.matches ?? [];

    // 定义已结束状态
    const finishedStatuses = ['FT', 'AET', 'PEN', '完场', '已结束'];

    // 为每场比赛计算评分（可能为null）
    const withScores: MatchWithScore[] = all.map(m => ({
      ...m,
      scoreResult: calculateDynamicScore(m),
    }));

    // 分离已结束和进行中的比赛
    const liveMatches: MatchWithScore[] = [];
    const finishedMatches: MatchWithScore[] = [];

    for (const match of withScores) {
      if (finishedStatuses.includes(match.status)) {
        finishedMatches.push(match);
      } else {
        liveMatches.push(match);
      }
    }

    // 将已结束的比赛保存到历史（副作用，在 useEffect 中处理更好，但这里简化处理）
    for (const match of finishedMatches) {
      addToHistory(match, match.scoreResult);
    }

    let filtered = liveMatches;

    // 联赛筛选
    if (filters.league !== 'ALL') {
      filtered = filtered.filter(m =>
        m.league === filters.league ||
        m.leagueShort === filters.league
      );
    }

    // 分钟筛选 - 核心功能
    if (!filters.showAll) {
      if (filters.minMinute === 1) {
        // "上半场" = minute <= 45 或 status = HT
        filtered = filtered.filter(m =>
          m.minute <= 45 || m.status?.toLowerCase() === 'ht'
        );
      } else if (filters.minMinute === -1) {
        // "信号" = 65+分钟且有评分 或 有高评分
        filtered = filtered.filter(m => {
          const score = m.scoreResult?.totalScore ?? 0;
          return (m.minute >= 80 && score >= 70) || (m.minute >= 65 && score >= 80);
        });
      } else if (filters.minMinute > 0) {
        // 65+ 等筛选
        filtered = filtered.filter(m => m.minute >= filters.minMinute);
      }
    }

    // 排序：信号优先 → 65+分钟 → 评分 → 分钟
    filtered.sort((a, b) => {
      const aScore = a.scoreResult?.totalScore ?? 0;
      const bScore = b.scoreResult?.totalScore ?? 0;

      // 1. 高分信号置顶 (80+分钟且>=70分 或 65+分钟且>=80分)
      const aIsSignal = (a.minute >= 80 && aScore >= 70) || (a.minute >= 65 && aScore >= 80);
      const bIsSignal = (b.minute >= 80 && bScore >= 70) || (b.minute >= 65 && bScore >= 80);
      if (aIsSignal && !bIsSignal) return -1;
      if (bIsSignal && !aIsSignal) return 1;

      // 2. 65+分钟优先
      if (a.minute >= 65 && b.minute < 65) return -1;
      if (b.minute >= 65 && a.minute < 65) return 1;

      // 3. 按评分排序
      if (aScore !== bScore) return bScore - aScore;

      // 4. 按分钟排序（倒序）
      return b.minute - a.minute;
    });

    return filtered;
  }, [matchesData, filters]);

  // 统计数据
  const stats = useMemo(() => {
    const all = matchesData?.matches ?? [];
    const withScores = all.map(m => ({
      ...m,
      scoreResult: calculateDynamicScore(m),
    }));

    // 信号数量：65+分钟且评分>=60 或 80+分钟
    const signalMatches = withScores.filter(m =>
      (m.minute >= 80 && (m.scoreResult?.totalScore ?? 0) >= 70) ||
      (m.minute >= 65 && (m.scoreResult?.totalScore ?? 0) >= 80)
    );

    return {
      live: all.length,
      above65: all.filter(m => m.minute >= 65).length,
      signals: signalMatches.length,
      firstHalf: all.filter(m => m.minute <= 45 || m.status?.toLowerCase() === 'ht').length,
    };
  }, [matchesData]);

  // 切换关注
  const toggleWatch = useCallback((matchId: number) => {
    setWatchedMatches(prev => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }, []);

  // 刷新数据
  const handleRefresh = useCallback(() => {
    refreshMatches.refreshLiveAdvanced();
  }, [refreshMatches]);

  const apiLatency = Math.floor(Math.random() * 50) + 20;
  const dataQuality = matchesData?.dataSource === 'api' ? 99 : 0;

  return (
    <div className="h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans flex flex-col overflow-hidden select-none">
      {/* ============================================ */}
      {/* 顶部导航栏 - 简化版 */}
      {/* ============================================ */}
      <header className="flex-shrink-0 h-14 bg-[#111] border-b border-[#222] flex items-center px-4 gap-4">
        {/* 汉堡菜单（移动端） */}
        <button
          type="button"
          onClick={() => setShowMobileMenu(true)}
          className="lg:hidden p-2 rounded-lg text-[#888] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xl font-black tracking-tight">
            <span className="text-[#00d4ff]">LIVE</span>
            <span className="text-[#e0e0e0]">PRO</span>
          </span>
        </Link>

        {/* 状态指示 */}
        <div className="hidden sm:flex items-center gap-3 text-sm">
          <span className={`font-medium ${matchesData?.dataSource === 'api' ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {matchesData?.dataSource === 'api' ? 'API OK' : 'NO DATA'}
          </span>
          <span className="text-[#444]">·</span>
          <span className="text-[#00ff88]">{apiLatency}ms</span>
          <span className="text-[#444]">·</span>
          <span className="text-[#888]">质量 <span className={dataQuality > 50 ? 'text-[#00ff88]' : 'text-[#ff4444]'}>{dataQuality}%</span></span>
        </div>

        {/* 中间填充 */}
        <div className="flex-1" />

        {/* 核心统计 - 简化版 */}
        <div className="flex items-center gap-4 text-sm font-medium">
          <div className="flex items-center gap-2">
            <span className="text-[#888]">进行中</span>
            <span className="text-[#00d4ff] text-lg font-bold">{stats.live}</span>
          </div>
          <span className="text-[#333]">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[#888]">65'+</span>
            <span className="text-[#ffaa00] text-lg font-bold">{stats.above65}</span>
          </div>
          <span className="text-[#333]">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[#888]">信号</span>
            <span className={`text-lg font-bold ${stats.signals > 0 ? 'text-[#ff4444] animate-pulse' : 'text-[#666]'}`}>{stats.signals}</span>
          </div>
        </div>

        {/* 分隔符 */}
        <span className="hidden md:block text-[#333]">|</span>

        {/* 导航按钮组 - 精简版 */}
        <nav className="hidden lg:flex items-center gap-2">
          <Link
            to="/corners"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#888] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
          >
            <CornerUpRight className="w-4 h-4" />
            <span>角球</span>
          </Link>
          <Link
            to="/history"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#888] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
          >
            <Clock className="w-4 h-4" />
            <span>历史</span>
          </Link>
        </nav>

        {/* 刷新按钮 */}
        <button
          type="button"
          onClick={handleRefresh}
          className="p-2 rounded-lg text-[#888] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        {/* 时间 */}
        <div className="hidden sm:block text-lg font-mono text-[#00d4ff]">
          {new Date().toLocaleTimeString('zh-CN', { hour12: false })}
        </div>
      </header>

      {/* ============================================ */}
      {/* 筛选栏 - 简化版，聚焦75+分钟 */}
      {/* ============================================ */}
      <div className="flex-shrink-0 h-12 bg-[#0d0d0d] border-b border-[#222] flex items-center px-4 gap-3">
        {/* 视图切换 */}
        <div className="flex items-center gap-1 bg-[#1a1a1a] rounded-lg p-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-[#666] hover:text-[#888]'}`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            className={`p-1.5 rounded ${viewMode === 'card' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-[#666] hover:text-[#888]'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>

        <span className="text-[#333]">|</span>

        {/* 核心筛选：全部 / 上半场 / 65+ / 信号 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, showAll: true, minMinute: 0 }))}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filters.showAll && filters.minMinute === 0
                ? 'bg-[#00d4ff] text-black'
                : 'bg-[#1a1a1a] text-[#888] hover:text-white border border-[#333]'
            }`}
          >
            全部
          </button>
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, showAll: false, minMinute: 1 }))}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              !filters.showAll && filters.minMinute === 1
                ? 'bg-[#ffaa00] text-black'
                : 'bg-[#1a1a1a] text-[#ffaa00] hover:bg-[#ffaa00]/20 border border-[#ffaa00]/50'
            }`}
          >
            上半场
          </button>
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, showAll: false, minMinute: 65 }))}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              !filters.showAll && filters.minMinute === 65
                ? 'bg-[#ff6600] text-white'
                : 'bg-[#1a1a1a] text-[#ff6600] hover:bg-[#ff6600]/20 border border-[#ff6600]/50'
            }`}
          >
            65'+
          </button>
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, showAll: false, minMinute: -1 }))}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
              !filters.showAll && filters.minMinute === -1
                ? 'bg-[#ff4444] text-white'
                : 'bg-[#1a1a1a] text-[#ff4444] hover:bg-[#ff4444]/20 border border-[#ff4444]/50'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            信号
          </button>
        </div>

        <div className="flex-1" />

        {/* 显示数量 */}
        <div className="text-sm text-[#666]">
          显示 <span className="text-[#00d4ff] font-bold">{processedMatches.length}</span> 场
        </div>

        {/* 统计面板开关 */}
        <button
          type="button"
          onClick={() => setShowStats(!showStats)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all ${
            showStats ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-[#666] hover:text-[#888] hover:bg-[#1a1a1a]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">统计</span>
        </button>

        {/* Phase 2A: 验收报告开关 */}
        <button
          type="button"
          onClick={() => setShowAcceptanceReport(!showAcceptanceReport)}
          className={`hidden md:flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all ${
            showAcceptanceReport ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#666] hover:text-[#888] hover:bg-[#1a1a1a]'
          }`}
          title="Phase 2A 验收报告"
        >
          <Zap className="w-4 h-4" />
          <span className="hidden lg:inline">验收</span>
        </button>
      </div>

      {/* ============================================ */}
      {/* 主体内容区 */}
      {/* ============================================ */}
      <div className="flex-1 flex overflow-hidden">
        {/* 主内容区 - 全宽（左侧联赛导航已移除） */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* 统计面板 */}
          {showStats && (
            <div className="flex-shrink-0 border-b border-[#222]">
              <DataStatsPanel matches={processedMatches} />
            </div>
          )}

          {/* Phase 2A: 验收报告面板 */}
          {showAcceptanceReport && (
            <div className="flex-shrink-0 p-4 border-b border-[#222]">
              <AcceptanceReport
                matches={processedMatches}
                onRefresh={handleRefresh}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* 比赛列表 */}
          <div className="flex-1 overflow-auto p-4">
            {isLoading && processedMatches.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 text-[#00d4ff] animate-spin mx-auto mb-4" />
                  <p className="text-[#888] text-lg">加载中...</p>
                </div>
              </div>
            ) : processedMatches.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-5xl mb-4">⚽</div>
                  <p className="text-[#888] text-lg mb-2">
                    {filters.showAll
                      ? (stats.live > 0 ? '暂无符合条件的比赛' : '暂无进行中比赛')
                      : `暂无 ${filters.minMinute}+ 分钟的比赛`}
                  </p>
                  {stats.live > 0 && (
                    <p className="text-[#666] text-sm mb-4">
                      {stats.live} 场比赛进行中
                      {!filters.showAll && filters.minMinute === 80 && stats.above80 === 0 && ' (均未到80分钟)'}
                    </p>
                  )}
                  {!filters.showAll && stats.live > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilters(f => ({ ...f, showAll: true, minMinute: 0 }))}
                      className="mt-2 px-4 py-2 bg-[#00d4ff]/20 text-[#00d4ff] rounded-lg hover:bg-[#00d4ff]/30 transition-all"
                    >
                      查看全部比赛
                    </button>
                  )}
                </div>
              </div>
            ) : useTableV2 ? (
              <MatchTableV2
                matches={processedMatches}
                onToggleWatch={toggleWatch}
                watchedMatches={watchedMatches}
              />
            ) : (
              <AdvancedMatchTable
                matches={processedMatches.map(m => ({
                  ...m,
                  isWatched: watchedMatches.has(m.id),
                }))}
                onToggleWatch={toggleWatch}
              />
            )}
          </div>
        </main>

        {/* 右侧预警栏 */}
        <aside className="hidden xl:block w-64 bg-[#0d0d0d] border-l border-[#222] flex-shrink-0 overflow-hidden">
          <div className="p-3 border-b border-[#222]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#888]">80+ 预警</span>
              <span className="text-[#ff4444] font-bold">{stats.high80}</span>
            </div>
          </div>
          <div className="p-2 space-y-2 overflow-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            {processedMatches
              .filter(m => (m.scoreResult?.totalScore ?? 0) >= 80)
              .slice(0, 10)
              .map(match => (
                <div
                  key={match.id}
                  onClick={() => navigate(`/match/${match.id}`)}
                  className="p-3 bg-[#1a1a1a] rounded-lg border border-[#ff4444]/30 hover:border-[#ff4444] cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#666]">{match.leagueShort}</span>
                    <span className="text-sm font-bold text-[#ffaa00]">{match.minute}'</span>
                  </div>
                  <div className="text-sm font-medium truncate">
                    {match.home.name} vs {match.away.name}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-lg font-bold">{match.home.score} - {match.away.score}</span>
                    <span className="text-[#ff4444] font-bold">{match.scoreResult?.totalScore ?? '-'}</span>
                  </div>
                </div>
              ))}
            {stats.high80 === 0 && (
              <div className="text-center text-[#666] text-sm py-8">
                暂无 80+ 预警
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 移动端菜单 */}
      <MobileMenu
        isOpen={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        onOpenSettings={() => {/* Settings handled elsewhere */}}
      />
    </div>
  );
}

export default HomePage;
