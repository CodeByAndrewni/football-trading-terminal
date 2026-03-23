// ============================================
// 足球交易决策终端 - 首页（简化版）
// 核心诉求：75分钟后的进球机会 = 投资机会
// ============================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Wifi, WifiOff,
  Menu, Target, Zap, Bot, X
} from 'lucide-react';
import { AiChatPanel } from '../components/AiChatPanel';
import { MatchTableV2 } from '../components/home/MatchTableV2';
import { useLiveMatchesAdvanced, useRefreshMatches } from '../hooks/useMatches';
import { calculateDynamicScore, type ScoreResult } from '../services/scoringEngine';
import type { AdvancedMatch } from '../data/advancedMockData';
import { soundService } from '../services/soundService';
import { MobileMenu } from '../components/layout/MobileMenu';
import { LateHunterPanel } from '../components/home/LateHunterPanel';
import { StrategyMonitorPanel, BUILTIN_STRATEGIES } from '../components/home/StrategyMonitorPanel';
import { StrategyAlertMarquee } from '../components/home/StrategyAlertMarquee';

// ============================================
// 类型定义
// ============================================

interface MatchWithScore extends AdvancedMatch {
  scoreResult: ScoreResult | null;
}

type OddsMode = 'ALL' | 'WITH_LIVE' | 'WITHOUT_LIVE';

interface Filters {
  league: string;
  minMinute: number;
  showAll: boolean;
  oddsMode: OddsMode;
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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // 简化的筛选器 - 默认显示全部比赛
  const [filters, setFilters] = useState<Filters>({
    league: 'ALL',
    minMinute: 0,
    showAll: true,
    oddsMode: 'ALL',
  });

  // 筛选模型状态
  const [showFilterModel, setShowFilterModel] = useState(false);
  const [filterModelDraft, setFilterModelDraft] = useState<FilterModelState>(DEFAULT_FILTER_MODEL);
  const [filterModelApplied, setFilterModelApplied] = useState<FilterModelState>(DEFAULT_FILTER_MODEL);

  // 数据获取
  const { data: matchesData, isLoading, error, refetch, liveMatches } = useLiveMatchesAdvanced();
  const refreshMatches = useRefreshMatches();
  const [nowString, setNowString] = useState(
    new Date().toLocaleTimeString('zh-CN', { hour12: false })
  );

  // 顶部本地时钟（每秒更新一次）
  useEffect(() => {
    const id = setInterval(() => {
      setNowString(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);


  // 处理比赛数据 - 过滤已结束比赛，保存到历史
  const processedMatches = useMemo(() => {
    const rawAll = matchesData?.matches ?? [];

    const base: AdvancedMatch[] = rawAll.filter((m) => {
      const s = String(m.status).toLowerCase();
      return s !== 'ns' && s !== 'ft';
    });

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

    let filtered = liveWithScores;

    // 不再过滤无赔率比赛——所有比赛默认展示

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
  }, [liveMatches, matchesData, filterModelApplied]);

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
    };
  }, [liveMatches]);

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
        <span className="text-xl font-black tracking-tight flex-shrink-0">
          <span className="text-[#00d4ff]">LIVE</span>
          <span className="text-[#e0e0e0]">PRO</span>
        </span>

        {/* 状态指示 */}
        <div className="hidden sm:flex items-center gap-3 text-sm">
          <span className={`font-medium ${apiStatus.color}`}>
            {apiStatus.text}
          </span>
        </div>

        {/* 中间填充 */}
        <div className="flex-1" />

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

      {/* 筛选模型弹窗仍保留，但不再显示工具栏入口 */}

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

      {/* 策略命中跑马灯 */}
      <StrategyAlertMarquee matches={processedMatches} onMatchClick={(id) => navigate(`/match/${id}`)} />

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
            ) : (
              <MatchTableV2
                matches={processedMatches}
                onToggleWatch={() => {}}
                watchedMatches={new Set()}
                filters={{ oddsMode: 'ALL' }}
                showImbalanceColumns={false}
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

type RightTab = 'ai' | 'hunter' | 'strategy';

function RightSidePanel({ processedMatches, onMatchClick }: {
  processedMatches: MatchWithScore[];
  onMatchClick: (id: number) => void;
}) {
  const [tab, setTab] = useState<RightTab>('ai');
  const [width, setWidth] = useState(420);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const hunterCount = useMemo(
    () => processedMatches.filter((m) => m.minute >= 65 && !['ft', 'aet', 'pen', 'ns'].includes(m.status?.toLowerCase?.() ?? '')).length,
    [processedMatches],
  );
  const strategyCount = useMemo(() => {
    let count = 0;
    for (const s of BUILTIN_STRATEGIES) {
      count += processedMatches.filter(s.filter).length;
    }
    return count;
  }, [processedMatches]);

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

  const tabCls = (t: RightTab) =>
    `flex-1 px-2 py-2 text-xs font-medium transition-colors relative ${tab === t ? 'text-accent-primary border-b-2 border-accent-primary bg-[#0a0f14]' : 'text-[#888] hover:text-[#ccc]'}`;

  return (
    <aside className="hidden xl:flex flex-shrink-0 h-full" style={{ width }}>
      <div
        className="w-1.5 bg-[#111] hover:bg-accent-primary/30 cursor-col-resize transition-colors flex-shrink-0"
        onMouseDown={(e) => { dragging.current = true; startX.current = e.clientX; startW.current = width; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
      />
      <div className="flex-1 flex flex-col bg-[#0d0d0d] overflow-hidden">
        <div className="flex-none flex border-b border-[#222]">
          <button type="button" className={tabCls('ai')} onClick={() => setTab('ai')}>
            <Bot className="w-3.5 h-3.5 inline mr-1" />AI 顾问
          </button>
          <button type="button" className={tabCls('hunter')} onClick={() => setTab('hunter')}>
            <Zap className="w-3.5 h-3.5 inline mr-1" />尾盘猎手
            {hunterCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
                {hunterCount}
              </span>
            )}
          </button>
          <button type="button" className={tabCls('strategy')} onClick={() => setTab('strategy')}>
            <Target className="w-3.5 h-3.5 inline mr-1" />策略监控
            {strategyCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none animate-pulse">
                {strategyCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === 'ai' && <AiChatPanel className="h-full" />}
          {tab === 'hunter' && (
            <div className="h-full overflow-auto p-2">
              <LateHunterPanel matches={processedMatches} onMatchClick={onMatchClick} />
            </div>
          )}
          {tab === 'strategy' && <StrategyMonitorPanel matches={processedMatches} onMatchClick={onMatchClick} />}
        </div>
      </div>
    </aside>
  );
}


export default HomePage;
