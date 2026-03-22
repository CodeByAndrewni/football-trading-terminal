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
  Menu, LayoutGrid, LayoutList, ChevronUp, TrendingUp, Target, Zap, Bot
} from 'lucide-react';
// LeagueSidebar removed per P0 requirements
import { AiChatPanel } from '../components/AiChatPanel';
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
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../services/battleRoomWatchlist';
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

type LiveViewMode = 'OPPORTUNITIES' | 'ALL_LIVE';

type OddsMode = 'ALL' | 'WITH_LIVE' | 'WITHOUT_LIVE';

interface Filters {
  league: string;
  minMinute: number;
  showAll: boolean; // 显示所有比赛还是只显示75+
  scannerMode: boolean; // Phase 2: 失衡扫描器模式
  oddsMode: OddsMode; // 滚球盘口筛选：全部 / 有滚球 / 无滚球
}

// ============================================
// 筛选模型（替换 HomePage 顶部旧筛选条）
// ============================================
type FilterModelType =
  | 'GOAL_INDEX'
  | 'POSSESSION_RATE'
  | 'HANDICAP_INDEX'
  | 'GOAL_COUNT'
  | 'CORNER_COUNT'
  | 'SHOTS_SINGLE'
  | 'SHOTS_ON_TARGET_SINGLE'
  | 'RED_CARDS_SINGLE';

interface FilterModelState {
  startMinute: number; // 0-90
  endMinute: number; // 0-90
  type: FilterModelType;
  value: number;
}

const FILTER_MODEL_TYPES: Array<{ key: FilterModelType; label: string }> = [
  { key: 'GOAL_INDEX', label: '进球指数' },
  { key: 'POSSESSION_RATE', label: '控球率' },
  { key: 'HANDICAP_INDEX', label: '让球指数' },
  { key: 'GOAL_COUNT', label: '进球数' },
  { key: 'CORNER_COUNT', label: '角球数' },
  { key: 'SHOTS_SINGLE', label: '射门次数（单方）' },
  { key: 'SHOTS_ON_TARGET_SINGLE', label: '射中次数（单方）' },
  { key: 'RED_CARDS_SINGLE', label: '红牌（单方）' },
];

// 默认配置：尽量避免“空筛选结果”，同时保证 UI 一打开就能看到比赛
const DEFAULT_FILTER_MODEL: FilterModelState = {
  startMinute: 0,
  endMinute: 90,
  type: 'GOAL_COUNT',
  value: 0,
};

function normalizeFilterModel(model: FilterModelState): FilterModelState {
  const start = Math.max(0, Math.min(90, Number(model.startMinute)));
  const end = Math.max(0, Math.min(90, Number(model.endMinute)));
  const [a, b] = start <= end ? [start, end] : [end, start];
  return {
    ...model,
    startMinute: a,
    endMinute: b,
  };
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
  const [liveViewMode, setLiveViewMode] = useState<LiveViewMode>('OPPORTUNITIES');

  // 简化的筛选器 - 默认显示全部比赛
  const [filters, setFilters] = useState<Filters>({
    league: 'ALL',
    minMinute: 0,
    showAll: true, // 默认显示全部，用户可选择75+或80+筛选
    scannerMode: false, // Phase 2: 失衡扫描器模式
    oddsMode: 'ALL', // 默认不过滤盘口类型
  });

  // 筛选模型状态（替换旧的顶部筛选条）
  const [showFilterModel, setShowFilterModel] = useState(false);
  const [filterModelDraft, setFilterModelDraft] = useState<FilterModelState>(DEFAULT_FILTER_MODEL);
  const [filterModelApplied, setFilterModelApplied] = useState<FilterModelState>(DEFAULT_FILTER_MODEL);

  // Phase 2: 扫描器配置
  const [scannerConfig, setScannerConfig] = useState<Partial<ScannerFilterConfig>>({
    minMinute: 75,
    maxGoalDiff: 1,
    minXgDiff: 0.5,
    minShotsDiff: 5,
  });

  // 数据获取
  const { data: matchesData, isLoading, error, refetch, liveMatches } = useLiveMatchesAdvanced();
  console.log('[RAW_MATCHES]', matchesData?.matches?.length, matchesData?.matches);
  // 调试：id=1508863 单场结构
  const rawMatches = matchesData?.matches ?? [];
  const match1508863 = rawMatches.find((m: { id?: number }) => m.id === 1508863);
  if (match1508863) {
    const m = match1508863 as any;
    console.log('[MATCH_1508863]', {
      id: m.id,
      status: m.status,
      minute: m.minute,
      home: m.home,
      away: m.away,
      initialHandicap: m.initialHandicap,
      initialOverUnder: m.initialOverUnder,
      stats: m.stats,
      odds: m.odds,
      unscoreable: m._unscoreable,
      noStatsReason: m._noStatsReason,
    });
  }
  const refreshMatches = useRefreshMatches();
  const [nowString, setNowString] = useState(
    new Date().toLocaleTimeString('zh-CN', { hour12: false })
  );

  // 简单统计：liveMatches 总数与有赔率数量
  useEffect(() => {
    console.log('[DEBUG] useEffect 触发了，liveMatches:', liveMatches);
    if (!liveMatches) return;
    const list = liveMatches ?? [];
    const withOdds = list.filter((m) => m.odds?._fetch_status === 'SUCCESS');
    console.log('[ODDS_DIAG] liveMatches 总数:', list.length, '有赔率:', withOdds.length);
  }, [liveMatches]);

  // 顶部本地时钟（每秒更新一次）
  useEffect(() => {
    const id = setInterval(() => {
      setNowString(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 初始化 watchlist（从本地存储加载）
  useEffect(() => {
    const ids = getWatchlist();
    if (ids && ids.length > 0) {
      setWatchedMatches(new Set(ids));
    }
  }, []);

  // 是否使用新表格 V2
  const [useTableV2, setUseTableV2] = useState(true);

  // Phase 2A: 显示验收报告
  const [showAcceptanceReport, setShowAcceptanceReport] = useState(false);

  // 处理比赛数据 - 过滤已结束比赛，保存到历史
  const processedMatches = useMemo(() => {
    const rawAll = matchesData?.matches ?? [];

    const base: AdvancedMatch[] =
      liveViewMode === 'ALL_LIVE'
        ? rawAll.filter((m) => {
            const s = String(m.status).toLowerCase();
            return s !== 'ns' && s !== 'ft';
          })
        : (liveMatches ?? []);

    const all = base;

    // 定义已结束状态（仅用于 UI 层防御性过滤）
    const finishedStatusSet = new Set<string | number | undefined>([
      'ft', 'aet', 'pen', 'finished', 'canc', 'awd', 'abd',
      'FT', 'AET', 'PEN', '完场', '已结束',
    ]);

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
    const liveWithScores: MatchWithScore[] = [];
    const finishedMatches: MatchWithScore[] = [];

    for (const match of withScores) {
      const status = String(match.status);
      const statusLower = status.toLowerCase();
      if (finishedStatusSet.has(status) || finishedStatusSet.has(statusLower)) {
        finishedMatches.push(match);
      } else {
        liveWithScores.push(match);
      }
    }

    // 将已结束的比赛保存到历史（副作用，在 useEffect 中处理更好，但这里简化处理）
    for (const match of finishedMatches) {
      addToHistory(match, match.scoreResult);
    }

    let filtered = liveWithScores;

    // ⚠️ Guard：供应商无赔率的比赛只作为 stats 参考场，不进入首页机会表 / 信号筛选
    if (liveViewMode !== 'ALL_LIVE') {
      filtered = filtered.filter(m => !m.noOddsFromProvider);
    }

    // 过滤模型：时间段 + 类型阈值
    const model = normalizeFilterModel(filterModelApplied);
    filtered = filtered.filter(m => {
      // 处理补时：API 的 elapsed 可能会超过 90
      const minute = Math.min(90, Math.max(0, m.minute));
      return minute >= model.startMinute && minute <= model.endMinute;
    });

    filtered = filtered.filter(m => {
      const threshold = model.value;
      let metricValue: number | null = null;

      switch (model.type) {
        case 'GOAL_INDEX':
          metricValue = m.scoreResult?.totalScore ?? m.killScore ?? 0;
          break;
        case 'POSSESSION_RATE': {
          const home = m.stats?.possession?.home ?? 0;
          const away = m.stats?.possession?.away ?? 0;
          metricValue = Math.max(home, away);
          break;
        }
        case 'HANDICAP_INDEX': {
          const home = m.home.handicap ?? 0;
          const away = (m as any).away?.handicap ?? 0;
          metricValue = Math.max(home, away);
          break;
        }
        case 'GOAL_COUNT':
          metricValue = m.totalGoals ?? (m.home.score + m.away.score);
          break;
        case 'CORNER_COUNT': {
          const homeCorners = m.corners?.home ?? m.stats?.corners?.home ?? 0;
          const awayCorners = m.corners?.away ?? m.stats?.corners?.away ?? 0;
          metricValue = (homeCorners ?? 0) + (awayCorners ?? 0);
          break;
        }
        case 'SHOTS_SINGLE': {
          const home = m.stats?.shots?.home ?? 0;
          const away = m.stats?.shots?.away ?? 0;
          metricValue = Math.max(home, away);
          break;
        }
        case 'SHOTS_ON_TARGET_SINGLE': {
          const home = m.stats?.shotsOnTarget?.home ?? 0;
          const away = m.stats?.shotsOnTarget?.away ?? 0;
          metricValue = Math.max(home, away);
          break;
        }
        case 'RED_CARDS_SINGLE': {
          const home = m.cards?.red?.home ?? 0;
          const away = m.cards?.red?.away ?? 0;
          metricValue = Math.max(home, away);
          break;
        }
      }

      if (Number.isNaN(metricValue)) return false;
      return metricValue >= threshold;
    });

    // 排序：赔率确认优先 → 评分高 → 置信度高 → 分钟越后越优先
    filtered.sort((a, b) => {
      const aOdds = a.scoreResult?.factors.oddsFactor?.dataAvailable &&
        (a.scoreResult?.factors.oddsFactor?.score ?? 0) >= 5;
      const bOdds = b.scoreResult?.factors.oddsFactor?.dataAvailable &&
        (b.scoreResult?.factors.oddsFactor?.score ?? 0) >= 5;
      if (aOdds !== bOdds) return bOdds ? 1 : -1;

      const ratingDiff = (b.scoreResult?.totalScore ?? 0) - (a.scoreResult?.totalScore ?? 0);
      if (Math.abs(ratingDiff) > 5) return ratingDiff;

      const confDiff = (b.scoreResult?.confidence ?? 0) - (a.scoreResult?.confidence ?? 0);
      if (Math.abs(confDiff) > 10) return confDiff;

      if (a.minute >= 75 && b.minute < 75) return -1;
      if (b.minute >= 75 && a.minute < 75) return 1;

      return ratingDiff;
    });

    return filtered;
  }, [liveMatches, matchesData, filterModelApplied, liveViewMode]);

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
    const all = liveMatches ?? [];
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
      if (next.has(matchId)) {
        next.delete(matchId);
        removeFromWatchlist(matchId);
      } else {
        next.add(matchId);
        addToWatchlist(matchId);
      }
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
  const safeLiveMatches = liveMatches ?? [];
  const totalMatches = safeLiveMatches.length;
  const scorableMatches = safeLiveMatches.filter((m: AdvancedMatch) => !m._unscoreable).length;
  const dataQuality = totalMatches > 0 ? Math.round((scorableMatches / totalMatches) * 100) : 0;

  // 赔率覆盖率统计（从 meta 或本地计算）
  const oddsCoverage = useMemo(() => {
    const matches = liveMatches ?? [];
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
            to="/ai"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#888] hover:text-[#c084fc] hover:bg-[#1a1a1a] border border-transparent hover:border-[#a855f7]/35 transition-all"
            title="Minimax / 赛事上下文 AI 问答"
          >
            <Bot className="w-4 h-4" />
            <span>AI 问答</span>
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
          {nowString}
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

        <button
          type="button"
          onClick={() => {
            setFilterModelDraft(filterModelApplied);
            setShowFilterModel(true);
          }}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-all bg-[#111] text-[#e0e0e0] border border-[#222] hover:bg-[#1a1a1a]"
          title="打开筛选模型"
        >
          筛选模型
        </button>

        <span className="text-[#888] text-[12px] truncate">
          {filterModelApplied.startMinute}~{filterModelApplied.endMinute}'{' '}
          {FILTER_MODEL_TYPES.find(t => t.key === filterModelApplied.type)?.label ?? ''}{' '}
          &gt;= {filterModelApplied.value}
        </span>

        {/* 核心筛选：全部 / 上半场 / 65+ / 信号 */}
        <div className="hidden flex items-center gap-2">
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

        <span className="hidden text-[#333]">|</span>

        {/* 盘口筛选：全部 / 有滚球 / 无滚球 */}
        <div className="hidden flex items-center gap-1 bg-[#111] rounded-lg p-1">
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, oddsMode: 'ALL' }))}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
              filters.oddsMode === 'ALL'
                ? 'bg-[#00d4ff] text-black'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            盘口:全部
          </button>
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, oddsMode: 'WITH_LIVE' }))}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
              filters.oddsMode === 'WITH_LIVE'
                ? 'bg-[#22c55e] text-black'
                : 'text-[#22c55e] hover:bg-[#22c55e]/15'
            }`}
          >
            有滚球
          </button>
          <button
            type="button"
            onClick={() => setFilters(f => ({ ...f, oddsMode: 'WITHOUT_LIVE' }))}
            className={`px-2 py-1 rounded text-xs font-medium transition-all ${
              filters.oddsMode === 'WITHOUT_LIVE'
                ? 'bg-[#444] text-white'
                : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            无滚球
          </button>
        </div>

        {/* 视图模式：机会视图 / 全部 Live */}
        <div className="hidden flex items-center gap-1 text-xs ml-2">
          <button
            type="button"
            onClick={() => setLiveViewMode('OPPORTUNITIES')}
            className={`px-2 py-1 rounded font-medium transition-all ${
              liveViewMode === 'OPPORTUNITIES'
                ? 'bg-[#f97316] text-black'
                : 'text-[#f97316] hover:bg-[#f97316]/15'
            }`}
          >
            机会视图
          </button>
          <button
            type="button"
            onClick={() => setLiveViewMode('ALL_LIVE')}
            className={`px-2 py-1 rounded font-medium transition-all ${
              liveViewMode === 'ALL_LIVE'
                ? 'bg-[#0ea5e9] text-black'
                : 'text-[#0ea5e9] hover:bg-[#0ea5e9]/15'
            }`}
          >
            全部 Live
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

      {showFilterModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowFilterModel(false)}
          />

          <div className="relative w-full max-w-sm bg-[#0f0f0f] border border-[#222] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[#e0e0e0] font-bold text-[14px]">模型设置</div>
              <button
                type="button"
                onClick={() => setShowFilterModel(false)}
                className="p-1 rounded hover:bg-white/10 text-[#888]"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-[12px] text-[#aaa] mb-2">选择时间段（0-90分钟）</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={90}
                    step={1}
                    value={filterModelDraft.startMinute}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setFilterModelDraft(prev => ({
                        ...prev,
                        startMinute: Number.isFinite(next) ? next : prev.startMinute,
                      }));
                    }}
                    className="w-full bg-[#111] border border-[#222] rounded px-3 py-2 text-[#e0e0e0] text-[13px] font-mono focus:outline-none focus:border-[#00d4ff]"
                  />
                  <span className="text-[#888]">~</span>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    step={1}
                    value={filterModelDraft.endMinute}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setFilterModelDraft(prev => ({
                        ...prev,
                        endMinute: Number.isFinite(next) ? next : prev.endMinute,
                      }));
                    }}
                    className="w-full bg-[#111] border border-[#222] rounded px-3 py-2 text-[#e0e0e0] text-[13px] font-mono focus:outline-none focus:border-[#00d4ff]"
                  />
                </div>
                <div className="text-[11px] text-[#666] mt-1">任1分钟都可以选择（步长=1）</div>
              </div>

              <div>
                <div className="text-[12px] text-[#aaa] mb-2">选择类型</div>
                <select
                  value={filterModelDraft.type}
                  onChange={(e) => {
                    const next = e.target.value as FilterModelType;
                    setFilterModelDraft(prev => ({ ...prev, type: next }));
                  }}
                  className="w-full bg-[#111] border border-[#222] rounded px-3 py-2 text-[#e0e0e0] text-[13px] focus:outline-none focus:border-[#00d4ff]"
                >
                  {FILTER_MODEL_TYPES.map(t => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[12px] text-[#aaa] mb-2">输入值（阈值 &gt;=）</div>
                <input
                  type="number"
                  step={filterModelDraft.type === 'HANDICAP_INDEX' ? 0.25 : 1}
                  value={filterModelDraft.value}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setFilterModelDraft(prev => ({ ...prev, value: Number.isFinite(next) ? next : prev.value }));
                  }}
                  className="w-full bg-[#111] border border-[#222] rounded px-3 py-2 text-[#e0e0e0] text-[13px] font-mono focus:outline-none focus:border-[#00d4ff]"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-[#222]">
              <button
                type="button"
                onClick={() => {
                  setFilterModelDraft(filterModelApplied);
                  setShowFilterModel(false);
                }}
                className="flex-1 px-3 py-2 rounded bg-[#111] text-[#888] border border-[#222] hover:bg-[#1a1a1a] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterModelApplied(normalizeFilterModel(filterModelDraft));
                  setShowFilterModel(false);
                }}
                className="flex-1 px-3 py-2 rounded bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/30 hover:bg-[#00d4ff]/30 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

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
                      {stats.live > 0 ? '暂无符合筛选模型的比赛' : '暂无进行中比赛'}
                  </p>
                  {stats.live > 0 && (
                    <p className="text-[#666] text-sm mb-4">
                      {stats.live} 场比赛进行中
                    </p>
                  )}
                  {stats.live > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterModelDraft(DEFAULT_FILTER_MODEL);
                        setFilterModelApplied(DEFAULT_FILTER_MODEL);
                      }}
                      className="mt-2 px-4 py-2 bg-[#00d4ff]/20 text-[#00d4ff] rounded-lg hover:bg-[#00d4ff]/30 transition-all"
                    >
                      重置筛选模型
                    </button>
                  )}
                </div>
              </div>
            ) : useTableV2 ? (
              <MatchTableV2
                matches={processedMatches}
                onToggleWatch={toggleWatch}
                watchedMatches={watchedMatches}
                filters={{ oddsMode: 'ALL' }}
                showImbalanceColumns={false}
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

        {/* 右侧面板：AI 交易顾问 / 尾盘猎手 */}
        <RightSidePanel processedMatches={processedMatches} onMatchClick={(matchId) => navigate(`/match/${matchId}`)} />
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

type RightTab = 'ai' | 'hunter';

function RightSidePanel({ processedMatches, onMatchClick }: {
  processedMatches: MatchWithScore[];
  onMatchClick: (id: number) => void;
}) {
  const [tab, setTab] = useState<RightTab>('ai');
  const [width, setWidth] = useState(420);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(Math.min(800, Math.max(300, startW.current + delta)));
    }
    function onUp() { dragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <aside className="hidden xl:flex flex-shrink-0 h-full" style={{ width }}>
      {/* 拖拽条 */}
      <div
        className="w-1.5 bg-[#111] hover:bg-accent-primary/30 cursor-col-resize transition-colors flex-shrink-0"
        onMouseDown={(e) => { dragging.current = true; startX.current = e.clientX; startW.current = width; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
      />
      <div className="flex-1 flex flex-col bg-[#0d0d0d] overflow-hidden">
        {/* Tab 切换 */}
        <div className="flex-none flex border-b border-[#222]">
          <button type="button"
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${tab === 'ai' ? 'text-accent-primary border-b-2 border-accent-primary bg-[#0a0f14]' : 'text-[#888] hover:text-[#ccc]'}`}
            onClick={() => setTab('ai')}>
            <Bot className="w-3.5 h-3.5 inline mr-1" />AI 交易顾问
          </button>
          <button type="button"
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${tab === 'hunter' ? 'text-accent-primary border-b-2 border-accent-primary bg-[#0a0f14]' : 'text-[#888] hover:text-[#ccc]'}`}
            onClick={() => setTab('hunter')}>
            <Zap className="w-3.5 h-3.5 inline mr-1" />尾盘猎手
          </button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-hidden">
          {tab === 'ai' ? (
            <AiChatPanel className="h-full" />
          ) : (
            <div className="h-full overflow-auto p-2">
              <LateGameHunterPanel matches={processedMatches} onMatchClick={onMatchClick} />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default HomePage;
