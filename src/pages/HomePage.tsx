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
import { LateGameHunterPanel } from '../components/home/LateGameHunterPanel';
import { LateHunterPanel } from '../components/home/LateHunterPanel';
// Phase 2: Live Scanner Engine
import {
  scanMatches,
  getMatchingMatches,
  DEFAULT_SCANNER_CONFIG,
  getRecommendationColor,
  getRecommendationLabel,
  type ScannerFilterConfig,
  type ScannerResult,
  type MatchInput,
} from '../services/liveScannerEngine';

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
  scannerMode: boolean; // Phase 2: 失衡扫描器模式
}

// ============================================
// API 状态判断辅助函数
// ============================================

/**
 * 获取全局 API 状态显示
 * 只要有比赛数据就显示成功，只有请求失败才显示错误
 */
function getApiStatusDisplay(matchesData: any, isLoading: boolean, error: any): {
  text: string;
  color: string;
  isOk: boolean;
} {
  // 加载中
  if (isLoading && !matchesData?.matches?.length) {
    return { text: '加载中...', color: 'text-[#888]', isOk: false };
  }

  // 有错误且没有数据
  if (error && !matchesData?.matches?.length) {
    return { text: 'API 错误', color: 'text-[#ff4444]', isOk: false };
  }

  // 有比赛数据 - 一律显示 API OK
  if (matchesData?.matches && matchesData.matches.length > 0) {
    const count = matchesData.matches.length;
    return { text: `API OK（${count}场）`, color: 'text-[#00ff88]', isOk: true };
  }

  // dataSource 检查
  if (matchesData?.dataSource === 'none' || matchesData?.error) {
    // 区分是初始化还是真正的错误
    if (matchesData?.error === 'INITIALIZING') {
      return { text: '初始化中...', color: 'text-[#ffaa00]', isOk: false };
    }
    if (matchesData?.error === 'NO_LIVE_MATCHES') {
      return { text: '暂无直播', color: 'text-[#ffaa00]', isOk: true };
    }
    return { text: 'API 未接入', color: '#ff4444', isOk: false };
  }

  // 没有数据但也没有错误（可能是没有直播）
  return { text: '暂无直播', color: 'text-[#888]', isOk: true };
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
    scannerMode: false, // Phase 2: 失衡扫描器模式
  });

  // Phase 2: 扫描器配置
  const [scannerConfig, setScannerConfig] = useState<Partial<ScannerFilterConfig>>({
    minMinute: 75,
    maxGoalDiff: 1,
    minXgDiff: 0.5,
    minShotsDiff: 5,
  });

  // 数据获取
  const { data: matchesData, isLoading, error, refetch, liveMatches } = useLiveMatchesAdvanced();
  const refreshMatches = useRefreshMatches();

  // 是否使用新表格 V2
  const [useTableV2, setUseTableV2] = useState(true);

  // Phase 2A: 显示验收报告
  const [showAcceptanceReport, setShowAcceptanceReport] = useState(false);

  // 处理比赛数据 - 过滤已结束比赛，保存到历史
  const processedMatches = useMemo(() => {
    const all = liveMatches;

    // 🔥 CRITICAL: 调试日志 - 追踪数据流
    console.log('[MATCHES_VIEW] Raw data from hook:', {
      hasMatchesData: !!matchesData,
      matchesCount: all.length,
      isLoading,
      hasError: !!error,
      dataSource: matchesData?.dataSource,
    });

    // 定义已结束状态
    const finishedStatuses = ['FT', 'AET', 'PEN', '完场', '已结束'];

    // 为每场比赛计算评分（可能为null），添加错误处理防止整个表格崩溃
    const withScores: MatchWithScore[] = all.map(m => {
      let scoreResult: ScoreResult | null = null;
      try {
        scoreResult = calculateDynamicScore(m);
      } catch (err) {
        console.warn(`[HomePage] Error calculating score for match ${m.id}:`, err);
      }
      return {
        ...m,
        scoreResult,
      };
    });

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
      if (filters.scannerMode) {
        // Phase 2: 失衡扫描器模式
        // 使用内联扫描逻辑，避免循环依赖
        filtered = filtered.filter(m => {
          const minute = m.minute;
          const goalDiff = Math.abs((m.home?.score ?? 0) - (m.away?.score ?? 0));
          const hasStats = m.stats?._realDataAvailable;

          // 基础条件: 75+ 分钟，分差 ≤1
          if (minute < 75 || goalDiff > 1 || !hasStats) return false;

          // 攻势条件: xG差 >= 0.5 或 射门差 >= 5
          const xgHome = m.stats?.xG?.home ?? 0;
          const xgAway = m.stats?.xG?.away ?? 0;
          const xgDiff = Math.abs(xgHome - xgAway);

          const shotsHome = m.stats?.shots?.home ?? 0;
          const shotsAway = m.stats?.shots?.away ?? 0;
          const shotsDiff = Math.abs(shotsHome - shotsAway);

          return xgDiff >= 0.5 || shotsDiff >= 5;
        });
      } else if (filters.minMinute === 1) {
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

    // 排序：扫描器模式下按失衡评分，否则信号优先
    if (filters.scannerMode) {
      // Phase 2: 按 imbalanceScore 排序
      filtered.sort((a, b) => {
        // 计算失衡评分
        const getImbalanceScore = (m: typeof a): number => {
          if (!m.stats) return 0;
          const shotsDiff = Math.abs((m.stats.shots?.home ?? 0) - (m.stats.shots?.away ?? 0));
          const xgDiff = Math.abs((m.stats.xG?.home ?? 0) - (m.stats.xG?.away ?? 0));
          const sotDiff = Math.abs((m.stats.shotsOnTarget?.home ?? 0) - (m.stats.shotsOnTarget?.away ?? 0));
          return shotsDiff * 3 + xgDiff * 25 + sotDiff * 5;
        };
        const aImbalance = getImbalanceScore(a);
        const bImbalance = getImbalanceScore(b);

        // 优先按失衡评分，然后按分钟
        if (Math.abs(aImbalance - bImbalance) > 5) {
          return bImbalance - aImbalance;
        }
        return b.minute - a.minute;
      });
    } else {
      // 原有排序逻辑
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
    }

    // 🔥 CRITICAL: 调试日志 - 最终渲染数据
    console.log('[MATCHES_VIEW] Processed matches:', {
      totalRaw: all.length,
      afterFiltering: filtered.length,
      filters: {
        league: filters.league,
        minMinute: filters.minMinute,
        showAll: filters.showAll,
        scannerMode: filters.scannerMode,
      },
    });

    if (filtered.length > 0) {
      console.log('[MATCHES_VIEW] ✅ Rendering', filtered.length, 'matches to UI');
    } else if (all.length > 0) {
      console.log('[MATCHES_VIEW] ⚠️ All matches filtered out by current filters');
    } else {
      console.log('[MATCHES_VIEW] ⚠️ No raw matches available');
    }

    return filtered;
  }, [liveMatches, filters, scannerConfig]);

  // Phase 2: 扫描器结果
  const scannerResults = useMemo(() => {
    const matchInputs: MatchInput[] = processedMatches.map(m => ({
      id: m.id,
      minute: m.minute,
      status: m.status,
      homeScore: m.home?.score ?? 0,
      awayScore: m.away?.score ?? 0,
      stats: m.stats ? {
        shots: m.stats.shots,
        shotsOnTarget: m.stats.shotsOnTarget,
        corners: m.corners ?? { home: 0, away: 0 },  // 使用顶层 corners 字段
        possession: m.stats.possession,
        xG: m.stats.xG,
        _realDataAvailable: m.stats._realDataAvailable,
      } : null,
      imbalance: (m as any).imbalance,
    }));

    const results = scanMatches(matchInputs, scannerConfig);
    const matching = results.filter(r => r.result.isMatch);

    return {
      all: results,
      matching,
      matchingIds: new Set(matching.map(r => r.match.id)),
      totalMatches: results.length,
      matchingCount: matching.length,
    };
  }, [processedMatches, scannerConfig]);

  // 统计数据
  const stats = useMemo(() => {
    const all = liveMatches;
    const withScores = all.map(m => {
      let scoreResult: ScoreResult | null = null;
      try {
        scoreResult = calculateDynamicScore(m);
      } catch (err) {
        // Silently ignore errors in stats calculation
      }
      return {
        ...m,
        scoreResult,
      };
    });

    // 信号数量：65+分钟且评分>=60 或 80+分钟
    const signalMatches = withScores.filter(m =>
      (m.minute >= 80 && (m.scoreResult?.totalScore ?? 0) >= 70) ||
      (m.minute >= 65 && (m.scoreResult?.totalScore ?? 0) >= 80)
    );

    // 80+ 高评分比赛
    const high80Matches = withScores.filter(m => (m.scoreResult?.totalScore ?? 0) >= 80);

    return {
      live: all.length,
      above65: all.filter(m => m.minute >= 65).length,
      above80: all.filter(m => m.minute >= 80).length,
      signals: signalMatches.length,
      firstHalf: all.filter(m => m.minute <= 45 || m.status?.toLowerCase() === 'ht').length,
      high80: high80Matches.length,
      // Phase 2: 扫描命中数
      scannerHits: 0, // 会在 scannerResults 中更新
    };
  }, [liveMatches]);

  // Phase 2: 更新扫描命中统计
  const statsWithScanner = useMemo(() => ({
    ...stats,
    scannerHits: scannerResults.matchingCount,
  }), [stats, scannerResults]);

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

  // 使用新的 API 状态判断逻辑
  const apiStatus = getApiStatusDisplay(matchesData, isLoading, error);

  // 数据质量：有真实数据的比赛比例
  const totalMatches = liveMatches.length;
  const scorableMatches = liveMatches.filter((m: AdvancedMatch) => !m._unscoreable).length;
  const dataQuality = totalMatches > 0 ? Math.round((scorableMatches / totalMatches) * 100) : 0;

  // 赔率覆盖率统计（从 meta 或本地计算）
  const oddsCoverage = useMemo(() => {
    const matches = liveMatches;
    const meta = matchesData?.meta;

    // 优先使用 meta 中的统计（后端计算）
    if (meta?.matchesWithAnyOdds !== undefined && meta?.matchesWithOverUnder !== undefined) {
      const anyOddsRate = totalMatches > 0 ? Math.round((meta.matchesWithAnyOdds / totalMatches) * 100) : 0;
      const ouRate = totalMatches > 0 ? Math.round((meta.matchesWithOverUnder / totalMatches) * 100) : 0;
      return {
        anyOdds: meta.matchesWithAnyOdds,
        anyOddsRate,
        overUnder: meta.matchesWithOverUnder,
        ouRate,
      };
    }

    // 否则本地计算
    const withAnyOdds = matches.filter((m: AdvancedMatch) =>
      m.odds?._fetch_status === 'SUCCESS' && (
        m.odds?.handicap?.value !== null ||
        m.odds?.overUnder?.total !== null ||
        m.odds?.matchWinner?.home !== null
      )
    ).length;

    const withOverUnder = matches.filter((m: AdvancedMatch) =>
      m.odds?.overUnder?.total !== null && m.odds?.overUnder?.over !== null
    ).length;

    const anyOddsRate = totalMatches > 0 ? Math.round((withAnyOdds / totalMatches) * 100) : 0;
    const ouRate = totalMatches > 0 ? Math.round((withOverUnder / totalMatches) * 100) : 0;

    return {
      anyOdds: withAnyOdds,
      anyOddsRate,
      overUnder: withOverUnder,
      ouRate,
    };
  }, [liveMatches, totalMatches]);

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

        {/* 状态指示 - 只要有比赛数据就显示 API OK */}
        <div className="hidden sm:flex items-center gap-3 text-sm">
          <span className={`font-medium ${apiStatus.color}`}>
            {apiStatus.text}
          </span>
          {apiStatus.isOk && totalMatches > 0 && (
            <>
              <span className="text-[#444]">·</span>
              <span className="text-[#888]">
                赔率 <span className={oddsCoverage.anyOddsRate >= 50 ? 'text-[#00ff88]' : 'text-[#ffaa00]'}>
                  {oddsCoverage.anyOdds}/{totalMatches}
                </span>
              </span>
              <span className="text-[#444]">·</span>
              <span className="text-[#888]">
                大小球 <span className={oddsCoverage.ouRate >= 50 ? 'text-[#00ff88]' : 'text-[#ffaa00]'}>
                  {oddsCoverage.overUnder}/{totalMatches}
                </span>
              </span>
              <span className="text-[#444]">·</span>
              <span className="text-[#888]">统计 <span className={dataQuality >= 50 ? 'text-[#00ff88]' : 'text-[#ffaa00]'}>{dataQuality}%</span></span>
            </>
          )}
        </div>

        {/* 中间填充 */}
        <div className="flex-1" />

        {/* 核心统计 - 简化版 + Phase 2 扫描命中 */}
        <div className="flex items-center gap-4 text-sm font-medium">
          <div className="flex items-center gap-2">
            <span className="text-[#888]">进行中</span>
            <span className="text-[#00d4ff] text-lg font-bold">{statsWithScanner.live}</span>
          </div>
          <span className="text-[#333]">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[#888]">65'+</span>
            <span className="text-[#ffaa00] text-lg font-bold">{statsWithScanner.above65}</span>
          </div>
          <span className="text-[#333]">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[#888]">信号</span>
            <span className={`text-lg font-bold ${statsWithScanner.signals > 0 ? 'text-[#ff4444] animate-pulse' : 'text-[#666]'}`}>{statsWithScanner.signals}</span>
          </div>
          {/* Phase 2: 扫描命中数 */}
          <span className="text-[#333]">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[#888]">失衡</span>
            <span className={`text-lg font-bold ${statsWithScanner.scannerHits > 0 ? 'text-[#22c55e]' : 'text-[#666]'}`}>{statsWithScanner.scannerHits}</span>
          </div>
        </div>

        {/* 分隔符 */}
        <span className="hidden md:block text-[#333]">|</span>

        {/* 导航按钮组 - 恢复作战室和复盘台 */}
        <nav className="hidden lg:flex items-center gap-2">
          <Link
            to="/battle"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-[#ff4444]/10 text-[#ff4444] hover:bg-[#ff4444]/20 border border-[#ff4444]/30 transition-all"
          >
            <Target className="w-4 h-4" />
            <span>作战室</span>
          </Link>
          <Link
            to="/review"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#888] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
          >
            <TrendingUp className="w-4 h-4" />
            <span>复盘台</span>
          </Link>
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
            onClick={() => setFilters(f => ({ ...f, showAll: false, minMinute: -1, scannerMode: false }))}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
              !filters.showAll && filters.minMinute === -1 && !filters.scannerMode
                ? 'bg-[#ff4444] text-white'
                : 'bg-[#1a1a1a] text-[#ff4444] hover:bg-[#ff4444]/20 border border-[#ff4444]/50'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            信号
          </button>
          {/* Phase 2: 失衡扫描器按钮 */}
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, showAll: false, minMinute: 75, scannerMode: true }))}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
              filters.scannerMode
                ? 'bg-[#22c55e] text-white'
                : 'bg-[#1a1a1a] text-[#22c55e] hover:bg-[#22c55e]/20 border border-[#22c55e]/50'
            }`}
            title="结构失衡扫描器：筛选 75+ 分钟、分差 ≤1、攻势失衡的比赛"
          >
            <Radar className="w-3.5 h-3.5" />
            失衡
            {statsWithScanner.scannerHits > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/20 rounded-full">
                {statsWithScanner.scannerHits}
              </span>
            )}
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
          {/* 尾盘猎手面板 - 整合大球冲刺+强队反扑 */}
          <div className="flex-shrink-0 p-4 pb-0">
            <LateHunterPanel
              matches={processedMatches}
              onMatchClick={(id) => navigate(`/match/${id}`)}
            />
          </div>

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
                showImbalanceColumns={filters.scannerMode}
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

        {/* 右侧尾盘猎手面板 */}
        <aside className="hidden xl:block w-80 bg-[#0d0d0d] border-l border-[#222] flex-shrink-0 overflow-hidden">
          <div className="h-full overflow-auto p-2">
            <LateGameHunterPanel
              matches={processedMatches}
              onMatchClick={(matchId) => navigate(`/match/${matchId}`)}
            />
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
