// ============================================
// 作战室 - 实时决策页面
// Version: 139 - 信号强度系统
// 三档分类：高信号 / 观望 / 低信号
// ============================================

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Volume2, VolumeX, RefreshCw, ChevronDown, ChevronUp,
  Flame, AlertTriangle, Snowflake, Bell, CheckCircle, Clock,
  ArrowRight, Copy, Check, XCircle
} from 'lucide-react';
import { useLiveMatchesAdvanced } from '../hooks/useMatches';
import { calculateDynamicScore, type ScoreResult } from '../services/scoringEngine';
import type { AdvancedMatch } from '../data/advancedMockData';
import { soundService } from '../services/soundService';

// 新模块导入
import { SIGNAL_THRESHOLD, REFRESH_CONFIG, type SignalTier } from '../config/battleRoomConstants';
import { calculateSignalStrength, type SignalStrengthResult } from '../services/signalStrengthEngine';
import { formatOddsDisplay, type KellyResult } from '../services/kellyCalculator';
import { useBattleRoomHysteresis } from '../hooks/useBattleRoomState';
import {
  createSignalRecord,
  loadSignals,
  saveSignals,
  addSignal,
  getTodayStats,
  getRecentSignals,
  type SignalRecord,
  type SignalStatus,
} from '../services/signalSettlement';
import { extractReasonsWithDetails, getReasonLabels, type ReasonItem } from '../services/reasonExtractor';
import { useSignalSettlement } from '../hooks/useSignalSettlement';

// ============================================
// 测试模式配置
// ============================================
const TEST_MODE = false; // 设置为 true 启用测试按钮（仅开发调试用）

// ============================================
// 类型定义
// ============================================

interface MatchWithSignal extends AdvancedMatch {
  scoreResult: ScoreResult;
  signalResult: SignalStrengthResult;
  signalStrength: number;
  tier: SignalTier;
  kellyResult: KellyResult;
  reasons: ReasonItem[];
}

interface Filters {
  minMinute: number;
  league: string;
  onlyHigh: boolean;
}

// ============================================
// 联赛配置
// ============================================

const LEAGUE_OPTIONS = [
  { key: 'ALL', label: '全部联赛' },
  { key: '五大联赛', label: '五大联赛' },
  { key: '英超', label: '英超' },
  { key: '西甲', label: '西甲' },
  { key: '德甲', label: '德甲' },
  { key: '意甲', label: '意甲' },
  { key: '法甲', label: '法甲' },
];

const TOP_LEAGUES = ['英超', '西甲', '德甲', '意甲', '法甲'];

// ============================================
// 主组件
// ============================================

export function BattleRoomPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusId = Number(searchParams.get('focusId') || 0) || 0;
  const [currentTime, setCurrentTime] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(soundService.isEnabled());
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [lowCollapsed, setLowCollapsed] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Hysteresis Hook
  const { updateTier, shouldEmitSignal } = useBattleRoomHysteresis();

  // 信号自动结算 Hook
  const { processMatchUpdate, initSnapshots } = useSignalSettlement();
  const isInitializedRef = useRef(false);

  // 筛选状态
  const [filters, setFilters] = useState<Filters>({
    minMinute: 0,
    league: 'ALL',
    onlyHigh: false,
  });

  // 获取数据
  const { data: matchesData, isFetching, refetch } = useLiveMatchesAdvanced({
    refetchInterval: REFRESH_CONFIG.DATA_INTERVAL_MS,
  });

  // 时钟
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), REFRESH_CONFIG.CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // 加载历史信号
  useEffect(() => {
    setSignals(getRecentSignals(20));
  }, []);

  // 自动结算逻辑：检测进球并更新信号状态
  useEffect(() => {
    const rawMatches = matchesData?.matches ?? [];
    if (rawMatches.length === 0) return;

    // 首次加载时初始化快照
    if (!isInitializedRef.current) {
      initSnapshots(rawMatches);
      isInitializedRef.current = true;
      return;
    }

    // 处理比赛更新：检测进球 + 结算信号
    const { goals, settlement } = processMatchUpdate(rawMatches);

    // 如果有进球，播放音效
    if (goals.length > 0 && soundEnabled) {
      soundService.playGoal();
    }

    // 如果有信号状态变化，更新 UI
    if (settlement.newHits.length > 0 || settlement.newMisses.length > 0) {
      setSignals(getRecentSignals(20));

      // 命中时播放庆祝音效
      if (settlement.newHits.length > 0 && soundEnabled) {
        setTimeout(() => {
          soundService.play('notification');
        }, 500);
      }
    }
  }, [matchesData, processMatchUpdate, initSnapshots, soundEnabled]);

  // 处理比赛数据
  const processedMatches: MatchWithSignal[] = useMemo(() => {
    const rawMatches = matchesData?.matches ?? [];
    const result: MatchWithSignal[] = [];

    for (const match of rawMatches) {
      // ⚠️ Guard：供应商无赔率的比赛只作为 stats 参考场，不进入 Battle Room 机会/信号流
      if (match.noOddsFromProvider) {
        continue;
      }

      const scoreResult = calculateDynamicScore(match);
      if (!scoreResult) continue;

      // 计算信号强度
      const signalResult = calculateSignalStrength(match, scoreResult);

      // Hysteresis 处理
      const { tier: stableTier, isUpgrade } = updateTier(match.id, signalResult.signalStrength);

      // 提取理由
      const reasons = extractReasonsWithDetails(scoreResult, match);

      // 如果升级到高信号，发出信号
      if (isUpgrade && stableTier === 'high') {
        if (shouldEmitSignal(match.id, 'high_signal')) {
          const newSignal = createSignalRecord({
            fixtureId: match.id,
            matchName: `${match.home.name} vs ${match.away.name}`,
            minute: match.minute,
            signalStrength: signalResult.signalStrength,
            tier: stableTier,
            reasonsTop3: getReasonLabels(reasons),
            odds: signalResult.kellyResult.oddsInfo.odds,
            line: signalResult.kellyResult.oddsInfo.line,
          });
          addSignal(newSignal);
          setSignals(prev => [newSignal, ...prev].slice(0, 20));

          // 播放提示音
          if (soundEnabled) {
            soundService.playHighScoreAlert();
          }
        }
      }

      result.push({
        ...match,
        scoreResult,
        signalResult,
        signalStrength: signalResult.signalStrength,
        tier: stableTier,
        kellyResult: signalResult.kellyResult,
        reasons,
      });
    }

    result.sort((a, b) => b.signalStrength - a.signalStrength);
    return result;
  }, [matchesData, updateTier, shouldEmitSignal, soundEnabled]);

  // 筛选
  const filteredMatches = useMemo(() => {
    let result = processedMatches;

    if (filters.minMinute > 0) {
      result = result.filter(m => m.minute >= filters.minMinute);
    }

    if (filters.league !== 'ALL') {
      if (filters.league === '五大联赛') {
        result = result.filter(m => TOP_LEAGUES.some(l => m.league.includes(l) || m.leagueShort === l));
      } else {
        result = result.filter(m => m.league.includes(filters.league) || m.leagueShort === filters.league);
      }
    }

    if (filters.onlyHigh) {
      result = result.filter(m => m.tier === 'high');
    }

    return result;
  }, [processedMatches, filters]);

  // 分类
  const { highMatches, watchMatches, lowMatches } = useMemo(() => {
    return {
      highMatches: filteredMatches.filter(m => m.tier === 'high'),
      watchMatches: filteredMatches.filter(m => m.tier === 'watch'),
      lowMatches: filteredMatches.filter(m => m.tier === 'low'),
    };
  }, [filteredMatches]);

  // 今日命中率
  const todayStats = useMemo(() => getTodayStats(), [signals]);

  // 复制建议
  const handleCopy = useCallback((match: MatchWithSignal) => {
    const oddsText = match.kellyResult.hasRealOdds
      ? formatOddsDisplay(match.kellyResult.oddsInfo)
      : '暂无赔率';
    const betText = match.kellyResult.betSuggestion
      ? `建议${match.kellyResult.betSuggestion}%`
      : '仅供参考';
    const text = `${match.home.name} vs ${match.away.name} | ${match.minute}' | 信号${match.signalStrength} | ${oddsText} | ${betText}`;
    navigator.clipboard.writeText(text);
    setCopiedId(match.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // ============================================
  // 测试功能
  // ============================================

  // 创建测试信号
  const handleCreateTestSignal = useCallback(() => {
    const testSignal = createSignalRecord({
      fixtureId: 999999,
      matchName: '测试队A vs 测试队B',
      minute: 80,
      signalStrength: 75,
      tier: 'high',
      reasonsTop3: ['动量爆发', '末段冲刺', 'xG欠债'],
      odds: 1.85,
      line: '大0.5球',
    });
    addSignal(testSignal);
    setSignals(prev => [testSignal, ...prev].slice(0, 20));
    if (soundEnabled) {
      soundService.playHighScoreAlert();
    }
    alert(`测试信号已创建！\nID: ${testSignal.id}\n触发分钟: ${testSignal.triggerMinute}'\n状态: 待结算\n\n10分钟窗口结束于: ${testSignal.triggerMinute + 10}'`);
  }, [soundEnabled]);

  // 模拟进球（将最近的待结算信号标记为命中）
  const handleSimulateGoal = useCallback(() => {
    const currentSignals = loadSignals();
    const pendingSignal = currentSignals.find(s => s.status === 'pending');

    if (!pendingSignal) {
      alert('没有待结算的信号！请先创建测试信号。');
      return;
    }

    const goalMinute = pendingSignal.triggerMinute + 5; // 在触发后5分钟进球
    const updatedSignals = currentSignals.map(s => {
      if (s.id === pendingSignal.id) {
        return {
          ...s,
          status: 'hit' as const,
          settledAt: new Date().toISOString(),
          goalMinute,
          settlementNote: `${goalMinute}' 进球，窗口内 ${goalMinute - s.triggerMinute} 分钟`,
        };
      }
      return s;
    });

    saveSignals(updatedSignals);
    setSignals(getRecentSignals(20));

    if (soundEnabled) {
      soundService.playGoal();
    }

    alert(`模拟进球成功！\n信号: ${pendingSignal.matchName}\n进球分钟: ${goalMinute}'\n状态: 命中 ✅`);
  }, [soundEnabled]);

  // 模拟错失（将最近的待结算信号标记为错失）
  const handleSimulateMiss = useCallback(() => {
    const currentSignals = loadSignals();
    const pendingSignal = currentSignals.find(s => s.status === 'pending');

    if (!pendingSignal) {
      alert('没有待结算的信号！请先创建测试信号。');
      return;
    }

    const updatedSignals = currentSignals.map(s => {
      if (s.id === pendingSignal.id) {
        return {
          ...s,
          status: 'miss' as const,
          settledAt: new Date().toISOString(),
          settlementNote: '10 分钟内无进球',
        };
      }
      return s;
    });

    saveSignals(updatedSignals);
    setSignals(getRecentSignals(20));

    alert(`模拟错失！\n信号: ${pendingSignal.matchName}\n状态: 错失 ❌`);
  }, []);

  // 清空所有信号
  const handleClearSignals = useCallback(() => {
    if (confirm('确定要清空所有信号记录吗？')) {
      saveSignals([]);
      setSignals([]);
      alert('所有信号已清空');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0]">
      {/* ============================================ */}
      {/* 顶部栏 */}
      {/* ============================================ */}
      <header className="sticky top-0 z-50 bg-[#111] border-b border-[#222] px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[#888] hover:text-white transition-colors">
              ← 返回
            </Link>
            <span className="text-[#333]">|</span>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="text-2xl">⚽</span>
              <span>作战室</span>
              <span className="text-xs text-[#666] font-normal">v139</span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                const newEnabled = !soundEnabled;
                soundService.setEnabled(newEnabled);
                setSoundEnabled(newEnabled);
              }}
              className={`p-2 rounded-lg transition-colors ${soundEnabled ? 'text-[#00d4ff] bg-[#00d4ff]/10' : 'text-[#555] hover:text-[#888]'}`}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className={`p-2 rounded-lg text-[#888] hover:text-white transition-colors ${isFetching ? 'animate-spin' : ''}`}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <Link
              to="/review"
              className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-[#888] hover:text-white border border-[#333] hover:border-[#555] transition-colors text-sm"
            >
              复盘台 →
            </Link>
            <span className="text-[#00d4ff] font-mono text-sm">
              {currentTime.toLocaleDateString('zh-CN')} {currentTime.toLocaleTimeString('zh-CN')}
            </span>
          </div>
        </div>
      </header>

      {/* ============================================ */}
      {/* 筛选栏 */}
      {/* ============================================ */}
      <div className="bg-[#0d0d0d] border-b border-[#1a1a1a] px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-4">
          {/* 时间筛选 */}
          <div className="flex items-center gap-2">
            <FilterButton
              active={filters.minMinute === 75}
              onClick={() => setFilters(f => ({ ...f, minMinute: f.minMinute === 75 ? 0 : 75 }))}
            >
              75分钟+
            </FilterButton>
            <FilterButton
              active={filters.minMinute === 0}
              onClick={() => setFilters(f => ({ ...f, minMinute: 0 }))}
              variant="secondary"
            >
              全部时段
            </FilterButton>
          </div>

          <span className="text-[#333]">│</span>

          {/* 联赛筛选 */}
          <div className="flex items-center gap-2">
            {LEAGUE_OPTIONS.slice(0, 3).map(opt => (
              <FilterButton
                key={opt.key}
                active={filters.league === opt.key}
                onClick={() => setFilters(f => ({ ...f, league: opt.key }))}
                variant={opt.key === 'ALL' ? 'secondary' : 'primary'}
              >
                {opt.label}
              </FilterButton>
            ))}
          </div>

          <span className="text-[#333]">│</span>

          {/* 信号筛选 */}
          <div className="flex items-center gap-2">
            <FilterButton
              active={filters.onlyHigh}
              onClick={() => setFilters(f => ({ ...f, onlyHigh: !f.onlyHigh }))}
              variant="danger"
            >
              <Flame className="w-3.5 h-3.5" />
              仅高信号
            </FilterButton>
            <FilterButton
              active={!filters.onlyHigh}
              onClick={() => setFilters(f => ({ ...f, onlyHigh: false }))}
              variant="secondary"
            >
              全部
            </FilterButton>
          </div>

          <div className="flex-1" />

          <span className="text-[#666] text-sm">
            {filteredMatches.length} 场比赛
          </span>
        </div>
      </div>

      {/* ============================================ */}
      {/* 测试面板 */}
      {/* ============================================ */}
      {TEST_MODE && (
        <div className="bg-[#1a0a1a] border-b border-[#ff00ff]/30 px-4 py-3">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[#ff00ff] text-sm font-semibold flex items-center gap-1">
                🧪 测试模式
              </span>
              <button
                type="button"
                onClick={handleCreateTestSignal}
                className="px-3 py-1.5 text-xs font-medium border border-[#00ff88]/50 text-[#00ff88] rounded-lg hover:bg-[#00ff88]/10 transition-colors"
              >
                + 创建测试信号
              </button>
              <button
                type="button"
                onClick={handleSimulateGoal}
                className="px-3 py-1.5 text-xs font-medium border border-[#00d4ff]/50 text-[#00d4ff] rounded-lg hover:bg-[#00d4ff]/10 transition-colors"
              >
                ⚽ 模拟进球 (命中)
              </button>
              <button
                type="button"
                onClick={handleSimulateMiss}
                className="px-3 py-1.5 text-xs font-medium border border-[#ff4444]/50 text-[#ff4444] rounded-lg hover:bg-[#ff4444]/10 transition-colors"
              >
                ❌ 模拟错失
              </button>
              <button
                type="button"
                onClick={handleClearSignals}
                className="px-3 py-1.5 text-xs font-medium border border-[#666]/50 text-[#666] rounded-lg hover:bg-[#666]/10 transition-colors"
              >
                🗑️ 清空信号
              </button>
              <span className="text-[#666] text-xs ml-auto">
                待结算: {signals.filter(s => s.status === 'pending').length} |
                命中: {signals.filter(s => s.status === 'hit').length} |
                错失: {signals.filter(s => s.status === 'miss').length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* 主内容区 */}
      {/* ============================================ */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* 🔥 高信号区 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#ff4444]" />
              <span>高信号</span>
              <span className="text-[#ff4444]">（{highMatches.length}场）</span>
              <span className="text-xs text-[#666] font-normal ml-2">阈值≥{SIGNAL_THRESHOLD.HIGH}</span>
            </h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#888]">今日命中</span>
              <span className={`font-bold ${todayStats.hitRate >= 60 ? 'text-[#00ff88]' : 'text-[#ffaa00]'}`}>
                {todayStats.hits}/{todayStats.hits + todayStats.misses}
                {todayStats.hits + todayStats.misses > 0 && ` (${todayStats.hitRate}%)`}
              </span>
            </div>
          </div>

          {highMatches.length > 0 ? (
            <HighSignalList
              matches={highMatches}
              focusId={focusId}
              onViewDetail={(id) => navigate(`/match/${id}`)}
              onCopy={handleCopy}
              copiedId={copiedId}
            />
          ) : (
            <div className="bg-[#111] border border-[#222] rounded-xl p-8 text-center text-[#666]">
              <Flame className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>暂无高信号比赛</p>
              <p className="text-sm mt-1">等待信号强度≥{SIGNAL_THRESHOLD.HIGH}的比赛...</p>
            </div>
          )}
        </section>

        {/* ⚠️ 观望区 */}
        {!filters.onlyHigh && (
          <section>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-[#ffaa00]" />
              <span>观望中</span>
              <span className="text-[#ffaa00]">（{watchMatches.length}场）</span>
              <span className="text-xs text-[#666] font-normal ml-2">{SIGNAL_THRESHOLD.WATCH}-{SIGNAL_THRESHOLD.HIGH - 1}</span>
            </h2>

            {watchMatches.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {watchMatches.map(match => (
                  <WatchCard
                    key={match.id}
                    match={match}
                    onViewDetail={() => navigate(`/match/${match.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-[#555] text-sm py-4">暂无观望中的比赛</div>
            )}
          </section>
        )}

        {/* ❄️ 低信号区 */}
        {!filters.onlyHigh && (
          <section>
            <button
              type="button"
              onClick={() => setLowCollapsed(!lowCollapsed)}
              className="w-full flex items-center justify-between text-lg font-bold mb-3 hover:text-[#aaa] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Snowflake className="w-5 h-5 text-[#4488ff]" />
                <span>低信号</span>
                <span className="text-[#4488ff]">（{lowMatches.length}场）</span>
                <span className="text-xs text-[#666] font-normal ml-2">&lt;{SIGNAL_THRESHOLD.WATCH}</span>
              </div>
              {lowCollapsed ? (
                <ChevronDown className="w-5 h-5 text-[#666]" />
              ) : (
                <ChevronUp className="w-5 h-5 text-[#666]" />
              )}
            </button>

            {!lowCollapsed && lowMatches.length > 0 && (
              <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-3">
                <div className="flex flex-wrap gap-2">
                  {lowMatches.map(match => (
                    <LowCard key={match.id} match={match} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ============================================ */}
      {/* 底部信号栏 */}
      {/* ============================================ */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#111] border-t border-[#222] px-4 py-3">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-[#ffaa00]" />
            <span className="text-sm font-semibold text-[#888]">最近信号</span>
            <span className="text-xs text-[#555]">({signals.length})</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-thin">
            {signals.length > 0 ? (
              signals.slice(0, 5).map(signal => (
                <SignalItem key={signal.id} signal={signal} />
              ))
            ) : (
              <span className="text-[#555] text-sm">等待信号...</span>
            )}
          </div>
        </div>
      </footer>

      {/* 底部占位 */}
      <div className="h-24" />
    </div>
  );
}

// ============================================
// 子组件
// ============================================

function FilterButton({
  children,
  active,
  onClick,
  variant = 'primary',
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const variants = {
    primary: active
      ? 'bg-[#00d4ff] text-black border-[#00d4ff]'
      : 'text-[#00d4ff] border-[#00d4ff]/30 hover:bg-[#00d4ff]/10',
    secondary: active
      ? 'bg-[#333] text-white border-[#555]'
      : 'text-[#888] border-[#333] hover:bg-[#1a1a1a]',
    danger: active
      ? 'bg-[#ff4444] text-white border-[#ff4444]'
      : 'text-[#ff4444] border-[#ff4444]/30 hover:bg-[#ff4444]/10',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium border rounded-lg transition-colors flex items-center gap-1.5 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

function HighSignalList({
  matches,
  focusId,
  onViewDetail,
  onCopy,
  copiedId,
}: {
  matches: MatchWithSignal[];
  focusId: number;
  onViewDetail: (id: number) => void;
  onCopy: (match: MatchWithSignal) => void;
  copiedId: number | null;
}) {
  const focusedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focusId) return;
    if (!focusedRef.current) return;
    focusedRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId]);

  return (
    <div className="space-y-4">
      {matches.map(match => {
        const isFocused = focusId !== 0 && match.id === focusId;
        const rowRef = isFocused ? focusedRef : undefined;
        return (
          <HighSignalCard
            key={match.id}
            match={match}
            onViewDetail={() => onViewDetail(match.id)}
            onCopy={() => onCopy(match)}
            copied={copiedId === match.id}
            isFocused={isFocused}
            rowRef={rowRef}
          />
        );
      })}
    </div>
  );
}

function HighSignalCard({
  match,
  onViewDetail,
  onCopy,
  copied,
  isFocused,
  rowRef,
}: {
  match: MatchWithSignal;
  onViewDetail: () => void;
  onCopy: () => void;
  copied: boolean;
  isFocused: boolean;
  rowRef?: React.RefObject<HTMLDivElement>;
}) {
  const { signalStrength, kellyResult, reasons, signalResult } = match;

  // 走势指示
  const getTrend = () => {
    const momentum = match.scoreResult?.factors.momentumFactor.score ?? 0;
    if (momentum >= 25) return { attack: '▲▲▲', shots: '▲▲', corner: '▲' };
    if (momentum >= 15) return { attack: '▲▲', shots: '▲', corner: '—' };
    return { attack: '▲', shots: '—', corner: '—' };
  };
  const trend = getTrend();

  return (
    <div
      ref={rowRef}
      className={`bg-[#111] border rounded-xl overflow-hidden hover:border-[#ff4444]/50 transition-colors ${
        isFocused
          ? 'border-[#00d4ff] ring-2 ring-[#00d4ff]/60 ring-offset-2 ring-offset-[#050505]'
          : 'border-[#ff4444]/30'
      }`}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a0808] border-b border-[#ff4444]/20">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[#ff4444] font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#ff4444] animate-pulse" />
            LIVE {match.minute}'
          </span>
          <span className="text-[#888]">{match.leagueShort || match.league}</span>
          {signalResult.components.timePhase === 'extraLate' && (
            <span className="px-2 py-0.5 bg-[#ff4444]/20 text-[#ff4444] text-xs rounded">末段</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#888] text-sm">信号强度</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-3 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#ff4444] to-[#ff8800] rounded-full"
                style={{ width: `${signalStrength}%` }}
              />
            </div>
            <span className="text-2xl font-bold text-[#ff4444]">{signalStrength}</span>
          </div>
        </div>
      </div>

      {/* 比分 */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-center gap-6 text-xl mb-4">
          <span className="font-semibold text-[#eee]">{match.home.name}</span>
          <div className="flex items-center gap-3 font-bold text-3xl">
            <span className={match.home.score > match.away.score ? 'text-[#00d4ff]' : 'text-white'}>
              {match.home.score}
            </span>
            <span className="text-[#444]">:</span>
            <span className={match.away.score > match.home.score ? 'text-[#ff4444]' : 'text-white'}>
              {match.away.score}
            </span>
          </div>
          <span className="font-semibold text-[#eee]">{match.away.name}</span>
        </div>

        {/* 为什么会有进球 - Top3 理由 */}
        <div className="mb-4">
          <div className="text-sm text-[#888] mb-2">信号来源 (Top3)</div>
          <div className="flex flex-wrap gap-2">
            {reasons.map((reason, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] rounded-lg text-sm"
              >
                <span>{reason.icon}</span>
                <span className="text-[#ccc]">{reason.label}</span>
                <span className="text-[#888] text-xs">({reason.detail})</span>
                <span className="text-[#00ff88] font-mono text-xs">+{reason.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats 通道概要（仅展示，不参与排序/信号） */}
        <div className="mb-4 text-xs text-[#888] space-y-1">
          {match.scoreResult?.statsChannel ? (
            <>
              <div>
                Stats分: {match.scoreResult.statsChannel.totalScore}{' '}
                (射门:{match.scoreResult.statsChannel.shotsScore} 控球:{match.scoreResult.statsChannel.possessionScore}{' '}
                事件:{match.scoreResult.statsChannel.eventsScore} 兑现:{match.scoreResult.statsChannel.lineRealizationScore})
              </div>
              <div className="text-[10px] text-[#777]">
                {/* 简要模块说明：从 reasons 中取前几条 */}
                {match.scoreResult.statsChannel.reasons.slice(0, 2).map((r, i) => (
                  <span key={i} className="mr-2">· {r}</span>
                ))}
              </div>
              {/* 仅 stats 无赔率的提示 */}
              {match.noOddsFromProvider && (
                <div className="text-[10px] text-[#f97316]">
                  仅有 stats，无赔率（供应商未提供盘口），仅作场面参考。
                </div>
              )}
              {/* 数据不完整提示 */}
              {(match.scoreResult.statsChannel.flags?.missingCoreStats ||
                match.scoreResult.statsChannel.flags?.missingAuxStats) && (
                <div className="text-[10px] text-[#ffaa00]">
                  数据不完整，分数仅供参考。
                </div>
              )}
            </>
          ) : (
            <span>Stats 通道不可用</span>
          )}
        </div>

        {/* 走势 */}
        <div className="flex items-center gap-4 mb-4 px-3 py-2 bg-[#0d0d0d] rounded-lg text-sm">
          <span className="text-[#888]">近15分钟走势：</span>
          <span className="text-[#00ff88]">攻势 {trend.attack}</span>
          <span className="text-[#00d4ff]">射门 {trend.shots}</span>
          <span className="text-[#ffaa00]">角球 {trend.corner}</span>
          <span className="text-[#666]">|</span>
          <span className="text-[#888]">时间乘数: <span className="text-[#00d4ff]">{signalResult.components.timeMultiplier.toFixed(2)}x</span></span>
        </div>

        {/* 建议 */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] rounded-lg">
          <div className="flex items-center gap-6 text-sm">
            {kellyResult.hasRealOdds ? (
              <>
                <span>
                  <span className="text-[#888]">盘口：</span>
                  <span className="text-[#00d4ff] font-semibold">{formatOddsDisplay(kellyResult.oddsInfo)}</span>
                </span>
                <span>
                  <span className="text-[#888]">凯利值：</span>
                  <span className="text-[#00ff88] font-mono">{kellyResult.kellyFraction?.toFixed(2) ?? '-'}</span>
                </span>
                <span>
                  <span className="text-[#888]">建议投：</span>
                  <span className="text-[#ffaa00] font-semibold">
                    {kellyResult.betSuggestion ? `${kellyResult.betSuggestion}%` : '观望'}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-[#666]">暂无实时赔率，仅供参考</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#252525] text-[#888] hover:text-white transition-colors text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-[#00ff88]" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制'}
            </button>
            <button
              type="button"
              onClick={onViewDetail}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00d4ff]/10 text-[#00d4ff] hover:bg-[#00d4ff]/20 transition-colors text-sm"
            >
              查看详情
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WatchCard({
  match,
  onViewDetail,
}: {
  match: MatchWithSignal;
  onViewDetail: () => void;
}) {
  const { signalStrength, reasons } = match;

  return (
    <div
      onClick={onViewDetail}
      className="bg-[#111] border border-[#333] rounded-lg p-4 cursor-pointer hover:border-[#ffaa00]/50 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[#ffaa00] font-mono">{match.minute}'</span>
          <span className="text-[#666] text-sm">{match.leagueShort || match.league}</span>
        </div>
        <span className="text-[#ffaa00] font-bold">{signalStrength}</span>
      </div>
      <div className="text-[#eee] font-semibold mb-2">
        {match.home.name} {match.home.score} : {match.away.score} {match.away.name}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {reasons.slice(0, 2).map((r, i) => (
          <span key={i} className="px-2 py-0.5 bg-[#1a1a1a] rounded text-[#888]">
            {r.label}
          </span>
        ))}
        <span className="px-2 py-0.5 bg-[#ffaa00]/10 text-[#ffaa00] rounded">观望</span>
      </div>
      {match.scoreResult?.statsChannel ? (
        <div className="mt-2 text-[10px] text-[#666] space-y-1">
          <div>
            Stats分: {match.scoreResult.statsChannel.totalScore} (射门:{match.scoreResult.statsChannel.shotsScore}{' '}
            控球:{match.scoreResult.statsChannel.possessionScore} 事件:{match.scoreResult.statsChannel.eventsScore}{' '}
            兑现:{match.scoreResult.statsChannel.lineRealizationScore})
          </div>
          {/* 仅 stats 无赔率提示 */}
          {match.noOddsFromProvider && (
            <div className="text-[10px] text-[#f97316]">
              仅有 stats，无赔率（供应商未提供盘口），仅作场面参考。
            </div>
          )}
          {/* 数据不完整提示 */}
          {(match.scoreResult.statsChannel.flags?.missingCoreStats ||
            match.scoreResult.statsChannel.flags?.missingAuxStats) && (
            <div className="text-[10px] text-[#ffaa00]">
              数据不完整，分数仅供参考。
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 text-[10px] text-[#555]">Stats 通道不可用</div>
      )}
    </div>
  );
}

function LowCard({ match }: { match: MatchWithSignal }) {
  return (
    <span className="text-sm text-[#666]">
      {match.home.name.slice(0, 4)} {match.home.score}:{match.away.score} {match.away.name.slice(0, 4)}
      <span className="text-[#4488ff] ml-1">{match.signalStrength}</span>
      <span className="text-[#444] mx-1">│</span>
    </span>
  );
}

function SignalItem({ signal }: { signal: SignalRecord }) {
  const icons: Record<SignalStatus, React.ReactNode> = {
    pending: <Clock className="w-4 h-4 text-[#ffaa00]" />,
    hit: <CheckCircle className="w-4 h-4 text-[#00ff88]" />,
    miss: <XCircle className="w-4 h-4 text-[#ff4444]" />,
    expired: <Clock className="w-4 h-4 text-[#666]" />,
  };

  const colors: Record<SignalStatus, string> = {
    pending: 'border-[#ffaa00]/30 bg-[#ffaa00]/5',
    hit: 'border-[#00ff88]/30 bg-[#00ff88]/5',
    miss: 'border-[#ff4444]/30 bg-[#ff4444]/5',
    expired: 'border-[#666]/30 bg-[#666]/5',
  };

  const statusText: Record<SignalStatus, string> = {
    pending: '待结算',
    hit: '命中',
    miss: '错失',
    expired: '已过期',
  };

  const time = new Date(signal.triggeredAt);

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors[signal.status]} text-sm whitespace-nowrap`}>
      {icons[signal.status]}
      <span className="text-[#888] font-mono">
        {time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="text-[#ccc]">{signal.matchName.slice(0, 15)}</span>
      <span className="text-[#00d4ff]">{signal.signalStrength}</span>
      <span className="text-[#666]">{statusText[signal.status]}</span>
    </div>
  );
}

export default BattleRoomPage;
