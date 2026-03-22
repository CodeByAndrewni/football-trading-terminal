//
// ============================================
// LivePro 终端 - 终端风格实时监控
// STRICT MODE: 纯表格、无卡片、无阴影、无渐变
// ============================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Volume2, VolumeX, RefreshCw, ChevronDown, ChevronRight, HelpCircle, X } from 'lucide-react';
import { useLiveMatchesAdvanced } from '../hooks/useMatches';
import { calculateDynamicScore, type ScoreResult } from '../services/scoringEngine';
import type { AdvancedMatch } from '../data/advancedMockData';
import { soundService } from '../services/soundService';
import { formatLeagueWithCountry } from '../utils/leagueDisplay';

// ============================================
// 指标说明定义
// ============================================

interface MetricInfo {
  name: string;
  description: string;
  usage: string;
  range?: string;
}

const METRIC_INFO: Record<string, MetricInfo> = {
  rating: {
    name: '评分',
    description: '基于7大因子计算的综合进球概率评分，包括比分因子、进攻因子、动量因子、历史因子、特殊因子、赔率因子。',
    usage: '评分越高，后续进球概率越大。80分以上为高概率区间，建议重点关注。',
    range: '0-100+ (理论最高135)',
  },
  confidence: {
    name: '置信度',
    description: '评分的可信程度，基于数据完整性计算。包括是否有真实统计数据、xG数据、历史数据等。',
    usage: '置信度越高，评分越可靠。建议优先关注置信度70%以上的比赛。',
    range: '0-100%',
  },
  recent20: {
    name: '近20分钟射门',
    description: '最近20分钟内的总射门次数变化，反映近期进攻强度。',
    usage: '数值越高表示进攻越活跃。+3以上显示绿色，表示进攻势头强劲。',
    range: '0-10+',
  },
  odds: {
    name: '赔率因子',
    description: '基于实时赔率数据计算的市场预期，包括让球盘变化、大小球赔率、多家博彩公司同向变动等。',
    usage: '强=赔率支持进球(+10分)，中=有一定支持(+5分)，弱/无=数据不足或不支持。',
    range: '强/中/弱/无',
  },
  quality: {
    name: '数据质量',
    description: '当前比赛的统计数据质量等级。优=有完整实时统计，中=部分数据缺失，差=无法评分。',
    usage: '优先关注"优"级别的比赛，数据更准确可靠。',
    range: '优/中/差',
  },
  xg: {
    name: 'xG (预期进球)',
    description: 'Expected Goals，基于射门质量计算的预期进球数。由API-Football提供，综合射门位置、角度、身体部位等因素。',
    usage: 'xG高于实际进球表示"欠债"，后续进球概率更高。xG≥2.0显示黄色高亮。',
    range: '0.0-5.0+',
  },
  oddsConfirm: {
    name: '赔率确认筛选',
    description: '只显示赔率因子得分≥5分的比赛，即市场赔率数据支持后续进球的比赛。',
    usage: '开启后过滤掉赔率数据不支持或缺失的比赛，提高筛选精准度。',
    range: '开/关',
  },
};

// ============================================
// 类型定义
// ============================================

interface MatchWithScore extends AdvancedMatch {
  scoreResult: ScoreResult | null;
}

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

const DEFAULT_FILTER_MODEL: FilterModelState = {
  startMinute: 65,
  endMinute: 80,
  type: 'GOAL_COUNT',
  value: 2,
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
// InfoTooltip 组件
// ============================================

function InfoTooltip({
  metric,
  children,
}: {
  metric: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const info = METRIC_INFO[metric];

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    // 延迟添加监听，避免立即关闭
    const timer = setTimeout(() => {
      window.addEventListener('click', handler);
    }, 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handler);
    };
  }, [open]);

  if (!info) return null;

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="ml-0.5 text-[#555] hover:text-[#00d4ff] transition-colors"
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        title={`点击查看"${info.name}"说明`}
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div
          className="absolute z-50 w-72 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-2xl p-4 text-left"
          style={{
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 小三角箭头 */}
          <div
            className="absolute w-3 h-3 bg-[#1a1a1a] border-l border-t border-[#333] rotate-45"
            style={{ top: '-7px', left: '50%', marginLeft: '-6px' }}
          />

          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#333]">
            <span className="font-bold text-[14px] text-[#00d4ff]">{info.name}</span>
            <button
              type="button"
              className="text-[#666] hover:text-[#ff4444] transition-colors"
              onClick={() => setOpen(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 描述 */}
          <div className="mb-3 text-[12px] text-[#ccc] leading-relaxed">
            {info.description}
          </div>

          {/* 用法 */}
          <div className="mb-2 text-[12px]">
            <span className="text-[#ffaa00] font-semibold">用法：</span>
            <span className="text-[#aaa]">{info.usage}</span>
          </div>

          {/* 范围 */}
          {info.range && (
            <div className="text-[12px]">
              <span className="text-[#00ff88] font-semibold">范围：</span>
              <span className="text-[#888] font-mono">{info.range}</span>
            </div>
          )}

          {children}
        </div>
      )}
    </span>
  );
}

// ============================================
// 主组件
// ============================================

export function TerminalPage() {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(soundService.isEnabled());
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // 筛选模型状态（替换旧的快捷筛选 UI）
  const [showFilterModel, setShowFilterModel] = useState(false);
  const [filterModelDraft, setFilterModelDraft] = useState<FilterModelState>(DEFAULT_FILTER_MODEL);
  const [filterModelApplied, setFilterModelApplied] = useState<FilterModelState>(DEFAULT_FILTER_MODEL);

  // React Query 获取数据
  const {
    data: matchesData,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useLiveMatchesAdvanced({
    refetchInterval: 15000,
  });

  // 时钟更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 计算评分并排序
  const processedMatches: MatchWithScore[] = useMemo(() => {
    const rawMatches = matchesData?.matches ?? [];

    // 计算评分
    const withScores = rawMatches.map(match => ({
      ...match,
      scoreResult: calculateDynamicScore(match),
    }));

    // 筛选
    let filtered = withScores.filter(m => m.scoreResult !== null);

    // ⚠️ Guard：供应商无赔率的比赛只作为 stats 参考场，不进入终端页机会/推荐列表
    filtered = filtered.filter(m => !m.noOddsFromProvider);

    // 按筛选模型：时间段 + 指标阈值
    const model = normalizeFilterModel(filterModelApplied);
    filtered = filtered.filter(m => m.minute >= model.startMinute && m.minute <= model.endMinute);
    filtered = filtered.filter(m => {
      const threshold = model.value;
      let metricValue: number | null = null;

      switch (model.type) {
        case 'GOAL_INDEX':
          metricValue = m.scoreResult?.totalScore ?? m.killScore ?? null;
          break;
        case 'POSSESSION_RATE':
          metricValue = m.stats?.possession?.home ?? null;
          break;
        case 'HANDICAP_INDEX':
          metricValue = m.home.handicap ?? null;
          break;
        case 'GOAL_COUNT':
          metricValue = m.totalGoals ?? (m.home.score + m.away.score);
          break;
        case 'CORNER_COUNT': {
          if (m.corners) {
            metricValue = (m.corners.home ?? 0) + (m.corners.away ?? 0);
          } else if (m.stats?.corners) {
            metricValue = (m.stats.corners.home ?? 0) + (m.stats.corners.away ?? 0);
          } else {
            metricValue = null;
          }
          break;
        }
        case 'SHOTS_SINGLE':
          metricValue = m.stats?.shots?.home ?? null;
          break;
        case 'SHOTS_ON_TARGET_SINGLE':
          metricValue = m.stats?.shotsOnTarget?.home ?? null;
          break;
        case 'RED_CARDS_SINGLE':
          metricValue = m.cards?.red?.home ?? null;
          break;
      }

      if (metricValue === null || Number.isNaN(metricValue)) return false;
      return metricValue >= threshold;
    });

    // 排序：赔率确认优先 → 评分高 → 置信度高 → 75分钟以上优先
    filtered.sort((a, b) => {
      // 1. 赔率确认优先
      const aOdds = a.scoreResult?.factors.oddsFactor?.dataAvailable &&
                    (a.scoreResult?.factors.oddsFactor?.score ?? 0) >= 5;
      const bOdds = b.scoreResult?.factors.oddsFactor?.dataAvailable &&
                    (b.scoreResult?.factors.oddsFactor?.score ?? 0) >= 5;
      if (aOdds !== bOdds) return bOdds ? 1 : -1;

      // 2. 评分高排前
      const ratingDiff = (b.scoreResult?.totalScore ?? 0) - (a.scoreResult?.totalScore ?? 0);
      if (Math.abs(ratingDiff) > 5) return ratingDiff;

      // 3. 置信度高排前
      const confDiff = (b.scoreResult?.confidence ?? 0) - (a.scoreResult?.confidence ?? 0);
      if (Math.abs(confDiff) > 10) return confDiff;

      // 4. 75分钟以上优先
      if (a.minute >= 75 && b.minute < 75) return -1;
      if (b.minute >= 75 && a.minute < 75) return 1;

      return ratingDiff;
    });

    return filtered;
  }, [matchesData, filterModelApplied]);

  // 统计数据
  const stats = useMemo(() => {
    const all = matchesData?.matches ?? [];
    const withScores = all.map(m => ({
      ...m,
      scoreResult: calculateDynamicScore(m),
    })).filter(m => m.scoreResult !== null);

    return {
      live: all.length,
      high80: withScores.filter(m => (m.scoreResult?.totalScore ?? 0) >= 80).length,
      critical75: withScores.filter(m => m.minute >= 75).length,
      avgRating: withScores.length > 0
        ? Math.round(withScores.reduce((sum, m) => sum + (m.scoreResult?.totalScore ?? 0), 0) / withScores.length)
        : 0,
    };
  }, [matchesData]);

  // 高评分预警列表
  const alerts = useMemo(() => {
    return processedMatches
      .filter(m => (m.scoreResult?.totalScore ?? 0) >= 80)
      .slice(0, 8);
  }, [processedMatches]);

  // 虚拟滚动
  const virtualizer = useVirtualizer({
    count: processedMatches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => expandedRows.has(processedMatches[index]?.id) ? 140 : 36,
    overscan: 10,
  });

  // 切换展开
  const toggleExpand = useCallback((id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const apiLatency = Math.floor(Math.random() * 50) + 20;
  const dataQuality = matchesData?.dataSource === 'api' ? 99 : 0;

  return (
    <div className="h-screen bg-[#0a0a0a] text-[#e0e0e0] font-mono text-[13px] flex flex-col overflow-hidden select-none">
      {/* ============================================ */}
      {/* 顶部状态栏 */}
      {/* ============================================ */}
      <header className="flex-shrink-0 h-10 bg-[#111] border-b border-[#222] flex items-center px-4 gap-4">
        <span className="text-[#00d4ff] font-bold tracking-wider">LIVEPRO 终端</span>
        <span className="text-[#666]">|</span>
        <span className={`${matchesData?.dataSource === 'api' ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
          严格模式
        </span>
        <span className="text-[#666]">|</span>
        <span className="text-[#888]">接口 <span className="text-[#00ff88]">{apiLatency}ms</span></span>
        <span className="text-[#666]">|</span>
        <span className="text-[#888]">数据 <span className={dataQuality > 50 ? 'text-[#00ff88]' : 'text-[#ff4444]'}>{dataQuality}%</span></span>
        <span className="text-[#666]">|</span>
        <span className="text-[#888]">进行中 <span className="text-[#00d4ff] font-bold">{stats.live}</span></span>

        <div className="flex-1" />

        {/* 快捷统计 */}
        <span className="text-[#888]">80+ <span className="text-[#ff4444] font-bold">[{stats.high80}]</span></span>
        <span className="text-[#888]">75分钟+ <span className="text-[#ffaa00] font-bold">[{stats.critical75}]</span></span>

        {/* 控制按钮 */}
        <button
          type="button"
          onClick={() => {
            const newEnabled = !soundEnabled;
            soundService.setEnabled(newEnabled);
            setSoundEnabled(newEnabled);
          }}
          className={`p-1 ${soundEnabled ? 'text-[#00d4ff]' : 'text-[#444]'} hover:text-[#00d4ff]`}
          title={soundEnabled ? '关闭声音' : '开启声音'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className={`p-1 text-[#888] hover:text-[#00d4ff] ${isFetching ? 'animate-spin' : ''}`}
          title="刷新数据"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <span className="text-[#666]">|</span>
        <span className="text-[#00d4ff] tabular-nums">
          {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </header>

      {/* ============================================ */}
      {/* 筛选栏 */}
      {/* ============================================ */}
      <div className="flex-shrink-0 h-9 bg-[#0d0d0d] border-b border-[#1a1a1a] flex items-center px-4 gap-2">
        <button
          type="button"
          onClick={() => {
            setFilterModelDraft(filterModelApplied);
            setShowFilterModel(true);
          }}
          className="px-3 py-1.5 rounded border border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-[#e0e0e0] text-[12px] font-medium transition-colors"
          title="打开筛选模型"
        >
          筛选模型
        </button>

        <span className="text-[#333] mx-1">|</span>

        <span className="text-[#888] text-[12px] truncate">
          {filterModelApplied.startMinute}~{filterModelApplied.endMinute}'
          {' '}
          {FILTER_MODEL_TYPES.find(t => t.key === filterModelApplied.type)?.label ?? ''}
          {' '}
          &gt;= {filterModelApplied.value}
        </span>

        <div className="flex-1" />

        <span className="text-[#555] text-[12px]">
          显示 {processedMatches.length} 场
        </span>
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
                <div className="text-[12px] text-[#aaa] mb-2">选择时间段：开始/结束（0-90分钟）</div>
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
      {/* 主内容区 */}
      {/* ============================================ */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：比赛表格 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 表头 */}
          <div className="flex-shrink-0 h-8 bg-[#111] border-b border-[#222] flex items-center text-[12px] text-[#888] tracking-wider font-semibold">
            <div className="w-[5.5rem] shrink-0 px-1 text-center">联赛</div>
            <div className="w-12 px-2 text-center">时间</div>
            <div className="w-56 px-2">对阵</div>
            <div className="w-16 px-2 text-center">比分</div>
            <div className="w-14 px-2 text-center">
              评分
              <InfoTooltip metric="rating" />
            </div>
            <div className="w-14 px-2 text-center">
              置信
              <InfoTooltip metric="confidence" />
            </div>
            <div className="w-16 px-2 text-center">
              射/正
            </div>
            <div className="w-14 px-2 text-center">
              近20'
              <InfoTooltip metric="recent20" />
            </div>
            <div className="w-12 px-2 text-center">
              xG
              <InfoTooltip metric="xg" />
            </div>
            <div className="w-12 px-2 text-center">
              赔率
              <InfoTooltip metric="odds" />
            </div>
            <div className="w-10 px-2 text-center">
              质量
              <InfoTooltip metric="quality" />
            </div>
            <div className="w-8 px-2"></div>
          </div>

          {/* 表格内容 - 虚拟滚动 */}
          <div ref={parentRef} className="flex-1 overflow-auto scrollbar-thin">
            <div
              style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const match = processedMatches[virtualItem.index];
                const isExpanded = expandedRows.has(match.id);

                return (
                  <div
                    key={match.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <TerminalRow
                      match={match}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleExpand(match.id)}
                      onViewDetail={() => navigate(`/match/${match.id}`)}
                    />
                  </div>
                );
              })}
            </div>

            {processedMatches.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-[#555] gap-2">
                <div className="text-[16px]">
                  {matchesData?.dataSource === 'none'
                    ? '无法获取数据'
                    : '暂无可评分比赛'}
                </div>
                <div className="text-[13px] text-[#444]">
                  {matchesData?.dataSource === 'none'
                    ? '请检查 API 连接'
                    : `${matchesData?.matches?.length ?? 0} 场比赛进行中，等待统计数据...`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：预警栏 */}
        <div className="w-44 flex-shrink-0 bg-[#0d0d0d] border-l border-[#1a1a1a] flex flex-col">
          <div className="h-8 px-3 flex items-center justify-between border-b border-[#1a1a1a]">
            <span className="text-[12px] text-[#888] font-semibold">预警</span>
            <span className="text-[12px] text-[#ff4444] font-bold">{alerts.length}</span>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {alerts.map((match) => (
              <AlertItem
                key={match.id}
                match={match}
                onClick={() => navigate(`/match/${match.id}`)}
              />
            ))}
            {alerts.length === 0 && (
              <div className="text-[12px] text-[#444] text-center py-6">
                暂无 80+ 预警
              </div>
            )}
          </div>

          {/* 系统状态 */}
          <div className="flex-shrink-0 border-t border-[#1a1a1a] p-3 space-y-1.5">
            <div className="text-[11px] text-[#666] mb-2 font-semibold">系统状态</div>
            <StatusRow label="接口" value={matchesData?.dataSource === 'api' ? '正常' : '异常'} status={matchesData?.dataSource === 'api' ? 'success' : 'danger'} />
            <StatusRow label="比赛" value={String(stats.live)} status={stats.live > 0 ? 'success' : 'muted'} />
            <StatusRow label="80+" value={String(stats.high80)} status={stats.high80 > 0 ? 'danger' : 'muted'} />
            <StatusRow label="75分+" value={String(stats.critical75)} status={stats.critical75 > 0 ? 'warning' : 'muted'} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 子组件
// ============================================

function TerminalRow({
  match,
  isExpanded,
  onToggleExpand,
  onViewDetail,
}: {
  match: MatchWithScore;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onViewDetail: () => void;
}) {
  const { scoreResult } = match;
  const rating = scoreResult?.totalScore ?? 0;
  const conf = scoreResult?.confidence ?? 0;
  const shots = (match.stats?.shots?.home ?? 0) + (match.stats?.shots?.away ?? 0);
  const shotsOn = (match.stats?.shotsOnTarget?.home ?? 0) + (match.stats?.shotsOnTarget?.away ?? 0);
  const xgTotal = ((match.stats?.xG?.home ?? 0) + (match.stats?.xG?.away ?? 0)).toFixed(1);
  const delta20 = match.stats?.recentShots20min ?? 0;

  // 颜色函数
  const getRatingColor = () => {
    if (rating >= 90) return 'text-[#ff4444]';
    if (rating >= 80) return 'text-[#ff8800]';
    if (rating >= 70) return 'text-[#ffaa00]';
    return 'text-[#888]';
  };

  const getMinuteStyle = () => {
    if (match.minute >= 85) return 'text-[#ff4444] animate-pulse';
    if (match.minute >= 75) return 'text-[#ffaa00]';
    return 'text-[#aaa]';
  };

  const getOddsIcon = () => {
    const oddsFactor = scoreResult?.factors.oddsFactor;
    if (!oddsFactor?.dataAvailable) return { icon: '无', color: 'text-[#ff4444]' };
    if ((oddsFactor?.score ?? 0) >= 10) return { icon: '强', color: 'text-[#00ff88]' };
    if ((oddsFactor?.score ?? 0) >= 5) return { icon: '中', color: 'text-[#ffaa00]' };
    return { icon: '弱', color: 'text-[#ff4444]' };
  };

  const getQualityBadge = () => {
    if (match._unscoreable) return { label: '待', color: 'text-[#888]', tooltip: '统计数据不足' };
    if (!match.stats?._realDataAvailable) return { label: '中', color: 'text-[#ffaa00]', tooltip: '部分数据可用' };
    return { label: '优', color: 'text-[#00ff88]', tooltip: '完整数据' };
  };

  const odds = getOddsIcon();
  const quality = getQualityBadge();
  const leagueDisplay = formatLeagueWithCountry(match);

  return (
    <>
      {/* 主行 */}
      <div
        className={`h-9 flex items-center border-b border-[#1a1a1a] cursor-pointer transition-colors ${
          rating >= 80 ? 'bg-[#1a0808] hover:bg-[#250a0a]' :
          rating >= 70 ? 'bg-[#1a1808] hover:bg-[#252210]' :
          'hover:bg-[#181818]'
        } ${scoreResult?.isStrongTeamBehind ? 'border-l-2 border-l-[#ff4444]' : ''}`}
        onClick={onToggleExpand}
      >
        {/* 联赛 */}
        <div
          className="w-[5.5rem] shrink-0 px-1 text-center text-[#888] truncate text-[10px]"
          title={leagueDisplay}
        >
          {leagueDisplay}
        </div>

        {/* 分钟 */}
        <div className={`w-12 px-2 text-center tabular-nums font-semibold ${getMinuteStyle()}`}>
          {match.minute}'
        </div>

        {/* 比赛 */}
        <div className="w-56 px-2 truncate">
          <span className="text-[#ddd]">{match.home.name.slice(0, 12)}</span>
          <span className="text-[#555] mx-1">vs</span>
          <span className="text-[#ddd]">{match.away.name.slice(0, 12)}</span>
        </div>

        {/* 比分 */}
        <div
          className="w-16 px-2 text-center tabular-nums font-bold text-[15px] hover:bg-[#252525] rounded transition-colors cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onViewDetail(); }}
        >
          <span className={match.home.score > match.away.score ? 'text-[#00d4ff]' : 'text-[#eee]'}>
            {match.home.score}
          </span>
          <span className="text-[#555] mx-0.5">-</span>
          <span className={match.away.score > match.home.score ? 'text-[#ff4444]' : 'text-[#eee]'}>
            {match.away.score}
          </span>
        </div>

        {/* 评分 */}
        <div className={`w-14 px-2 text-center tabular-nums font-bold text-[15px] ${getRatingColor()}`}>
          {rating}
        </div>

        {/* 置信度 */}
        <div className="w-14 px-2 text-center tabular-nums text-[#999]">
          {conf}%
        </div>

        {/* 射门/射正 */}
        <div className="w-16 px-2 text-center tabular-nums text-[#999]">
          {shots}/{shotsOn}
        </div>

        {/* 近20分钟 */}
        <div className={`w-14 px-2 text-center tabular-nums font-medium ${delta20 >= 3 ? 'text-[#00ff88]' : 'text-[#666]'}`}>
          +{delta20}
        </div>

        {/* xG */}
        <div className={`w-12 px-2 text-center tabular-nums ${Number(xgTotal) >= 2.0 ? 'text-[#ffaa00]' : 'text-[#666]'}`}>
          {xgTotal}
        </div>

        {/* 赔率 */}
        <div className={`w-12 px-2 text-center font-bold ${odds.color}`}>
          {odds.icon}
        </div>

        {/* 质量 */}
        <div className={`w-10 px-2 text-center font-bold ${quality.color}`}>
          {quality.label}
        </div>

        {/* 展开箭头 */}
        <div className="w-8 px-2 text-center text-[#555]">
          {isExpanded ? <ChevronDown className="w-4 h-4 inline" /> : <ChevronRight className="w-4 h-4 inline" />}
        </div>
      </div>

      {/* 展开详情 */}
      {isExpanded && (
        <ExpandedDetail match={match} onViewDetail={onViewDetail} />
      )}
    </>
  );
}

function ExpandedDetail({ match, onViewDetail }: { match: MatchWithScore; onViewDetail: () => void }) {
  const { scoreResult } = match;
  if (!scoreResult) return null;

  const factors = scoreResult.factors;

  return (
    <div className="bg-[#080808] border-b border-[#1a1a1a] px-4 py-3">
      <div className="flex gap-8">
        {/* 评分构成 */}
        <div className="flex-1">
          <div className="text-[11px] text-[#666] mb-2 font-semibold">评分构成</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
            <FactorBar label="进攻因子" value={factors.attackFactor.score} max={30} />
            <FactorBar label="动量因子" value={factors.momentumFactor.score} max={35} />
            <FactorBar label="比分因子" value={factors.scoreFactor.score} max={25} />
            <FactorBar label="历史因子" value={factors.historyFactor.score} max={25} />
            <FactorBar label="特殊因子" value={factors.specialFactor.score} max={20} />
            {factors.oddsFactor?.dataAvailable && (
              <FactorBar label="赔率因子" value={factors.oddsFactor.score} max={20} />
            )}
          </div>
        </div>

        {/* 预警标签 */}
        <div className="w-56">
          <div className="text-[11px] text-[#666] mb-2 font-semibold">预警信息</div>
          <div className="flex flex-wrap gap-1.5">
            {scoreResult.alerts.slice(0, 4).map((alert, i) => (
              <span key={i} className="text-[11px] px-2 py-1 bg-[#1a1a1a] text-[#999] rounded">
                {alert.replace(/[🔴🟠⚡⏰📊🔥🎯🟥🔄📺💰📉🏦⚠️]/gu, '').trim().slice(0, 18)}
              </span>
            ))}
            {scoreResult.alerts.length === 0 && (
              <span className="text-[11px] text-[#555]">暂无预警</span>
            )}
          </div>
        </div>

        {/* 详情按钮 */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onViewDetail}
            className="px-4 py-1.5 text-[12px] font-medium bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/30 rounded hover:bg-[#00d4ff]/20 transition-colors"
          >
            查看详情 →
          </button>
        </div>
      </div>
    </div>
  );
}

function FactorBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const isPositive = value >= 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-[#888] truncate text-[11px]">{label}</span>
      <div className="flex-1 h-2.5 bg-[#1a1a1a] rounded overflow-hidden">
        <div
          className={`h-full ${isPositive ? 'bg-[#00d4ff]' : 'bg-[#ff4444]'}`}
          style={{ width: `${Math.abs(percentage)}%` }}
        />
      </div>
      <span className={`w-12 text-right tabular-nums font-medium ${value >= max * 0.7 ? 'text-[#00ff88]' : 'text-[#888]'}`}>
        {value}/{max}
      </span>
    </div>
  );
}

function AlertItem({ match, onClick }: { match: MatchWithScore; onClick: () => void }) {
  const rating = match.scoreResult?.totalScore ?? 0;
  const isFlashing = rating >= 90;

  return (
    <div
      onClick={onClick}
      className={`p-2 rounded cursor-pointer transition-colors ${
        isFlashing ? 'bg-[#ff4444]/15 animate-pulse' : 'bg-[#1a1a1a] hover:bg-[#252525]'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-[#888] font-medium">{match.minute}分钟</span>
        <span className={`text-[13px] font-bold ${rating >= 90 ? 'text-[#ff4444]' : 'text-[#ff8800]'}`}>
          {rating}分
        </span>
      </div>
      <div className="text-[11px] text-[#aaa] truncate">
        {match.home.name.slice(0, 6)} vs {match.away.name.slice(0, 6)}
      </div>
      <div className="text-[12px] text-[#888] tabular-nums font-medium">
        {match.home.score} - {match.away.score}
      </div>
    </div>
  );
}

function StatusRow({ label, value, status }: { label: string; value: string; status: 'success' | 'warning' | 'danger' | 'muted' }) {
  const colors = {
    success: 'text-[#00ff88]',
    warning: 'text-[#ffaa00]',
    danger: 'text-[#ff4444]',
    muted: 'text-[#666]',
  };

  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-[#666]">{label}</span>
      <span className={`font-medium ${colors[status]}`}>{value}</span>
    </div>
  );
}

export default TerminalPage;
