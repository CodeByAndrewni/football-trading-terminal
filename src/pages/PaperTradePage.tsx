/**
 * Paper Trading 复盘页面
 * 列表 + 快照详情 + 统计仪表盘
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Zap,
  DollarSign,
  Target,
  Clock,
} from 'lucide-react';
import {
  usePaperTrades,
  usePaperTradeSettle,
  type PaperTradeRow,
  type PaperTradeStats,
} from '../hooks/usePaperTrade';

// ============================================
// Status badge
// ============================================

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    OPEN: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: '进行中' },
    WON: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '盈利' },
    LOST: { bg: 'bg-red-500/20', text: 'text-red-400', label: '亏损' },
    VOID: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: '作废' },
    PUSH: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '走水' },
  };
  const s = map[status] ?? map.VOID;
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ============================================
// Stats Dashboard
// ============================================

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs text-[#888]">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-[#666] mt-1">{sub}</div>}
    </div>
  );
}

function StatsPanel({ stats }: { stats: PaperTradeStats }) {
  const pnlColor = stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400';
  const roiColor = stats.roi >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        icon={<Target size={16} />}
        label="总单数"
        value={String(stats.total)}
        sub={`进行中 ${stats.open} / 已结算 ${stats.settled}`}
        color="text-cyan-400"
      />
      <StatCard
        icon={<BarChart3 size={16} />}
        label="胜率"
        value={stats.settled > 0 ? `${stats.winRate}%` : '-'}
        sub={`${stats.won} 胜 / ${stats.lost} 负`}
        color={stats.winRate >= 55 ? 'text-emerald-400' : stats.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}
      />
      <StatCard
        icon={<DollarSign size={16} />}
        label="总盈亏"
        value={stats.totalPnl >= 0 ? `+${stats.totalPnl}` : String(stats.totalPnl)}
        sub={`总注额 ${stats.totalStake}`}
        color={pnlColor}
      />
      <StatCard
        icon={<TrendingUp size={16} />}
        label="ROI"
        value={stats.settled > 0 ? `${stats.roi >= 0 ? '+' : ''}${stats.roi}%` : '-'}
        color={roiColor}
      />
    </div>
  );
}

// ============================================
// Scenario breakdown
// ============================================

interface ScenarioStat {
  id: string;
  label: string;
  count: number;
  won: number;
  lost: number;
  pnl: number;
}

function ScenarioBreakdown({ rows }: { rows: PaperTradeRow[] }) {
  const scenarioStats = useMemo(() => {
    const map = new Map<string, ScenarioStat>();
    for (const row of rows) {
      if (row.status === 'OPEN') continue;
      const scenarios = Array.isArray(row.entry_scenarios) ? row.entry_scenarios as Array<{ id: string; label: string }> : [];
      for (const s of scenarios) {
        const existing = map.get(s.id) ?? { id: s.id, label: s.label, count: 0, won: 0, lost: 0, pnl: 0 };
        existing.count++;
        if (row.status === 'WON') existing.won++;
        if (row.status === 'LOST') existing.lost++;
        existing.pnl += row.pnl ?? 0;
        map.set(s.id, existing);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  if (scenarioStats.length === 0) return null;

  return (
    <div className="bg-[#111] rounded-lg border border-[#222] p-4 mb-6">
      <h3 className="text-sm font-medium text-[#ccc] mb-3 flex items-center gap-2">
        <Zap size={14} className="text-yellow-400" />
        按情景统计
      </h3>
      <div className="space-y-2">
        {scenarioStats.slice(0, 10).map(s => {
          const winRate = s.count > 0 ? Math.round(s.won / s.count * 100) : 0;
          return (
            <div key={s.id} className="flex items-center gap-3 text-xs">
              <span className="text-[#aaa] w-36 truncate">{s.label}</span>
              <span className="text-[#666] w-12 text-right">{s.count} 单</span>
              <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500/60"
                  style={{ width: `${winRate}%` }}
                />
              </div>
              <span className={`w-12 text-right ${winRate >= 55 ? 'text-emerald-400' : winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                {winRate}%
              </span>
              <span className={`w-16 text-right ${s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Trade row + expanded detail
// ============================================

function TradeDetail({ trade }: { trade: PaperTradeRow }) {
  const scenarios = Array.isArray(trade.entry_scenarios)
    ? (trade.entry_scenarios as Array<{ id: string; label: string; score: number; reasons: string[] }>)
    : [];
  const stats = trade.entry_stats_snapshot as Record<string, unknown> | null;
  const odds = trade.entry_odds_snapshot as Record<string, unknown> | null;
  const postEvents = Array.isArray(trade.post_entry_events)
    ? (trade.post_entry_events as Array<{ minute: number; type: string; detail: string; player: string; team: string }>)
    : [];

  return (
    <div className="bg-[#0c0c0c] border-t border-[#1a1a1a] p-4 text-xs space-y-4">
      {/* 命中情景 */}
      <div>
        <div className="text-[#888] mb-2 font-medium">命中情景</div>
        <div className="flex flex-wrap gap-2">
          {scenarios.map(s => (
            <div key={s.id} className="bg-[#1a1a1a] rounded px-2 py-1.5 border border-[#2a2a2a]">
              <div className="text-[#ccc] font-medium">{s.label} — {s.score}分</div>
              {s.reasons.length > 0 && (
                <div className="text-[#666] mt-0.5">{s.reasons.join(' · ')}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 下单时数据 */}
      <div className="grid grid-cols-2 gap-4">
        {stats && (
          <div>
            <div className="text-[#888] mb-1 font-medium">下单时统计</div>
            <pre className="text-[#666] bg-[#111] rounded p-2 overflow-auto text-[10px] leading-relaxed max-h-40">
              {JSON.stringify(stats, null, 2)}
            </pre>
          </div>
        )}
        {odds && (
          <div>
            <div className="text-[#888] mb-1 font-medium">下单时赔率</div>
            <pre className="text-[#666] bg-[#111] rounded p-2 overflow-auto text-[10px] leading-relaxed max-h-40">
              {JSON.stringify(odds, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* 下单后事件 */}
      {postEvents.length > 0 && (
        <div>
          <div className="text-[#888] mb-2 font-medium">下单后事件</div>
          <div className="space-y-1">
            {postEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[#aaa]">
                <span className="text-[#555] w-8 text-right">{e.minute}'</span>
                <span className={
                  e.type === 'Goal' ? 'text-emerald-400' :
                  e.type === 'Card' ? 'text-yellow-400' :
                  'text-[#888]'
                }>
                  {e.type === 'Goal' ? '⚽' : e.type === 'Card' ? '🟨' : e.type === 'subst' ? '🔄' : '📋'}
                </span>
                <span>{e.player ?? ''} ({e.team ?? ''})</span>
                {e.detail && <span className="text-[#555]">— {e.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade }: { trade: PaperTradeRow }) {
  const [open, setOpen] = useState(false);
  const pnl = trade.pnl ?? 0;
  const time = new Date(trade.created_at).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="border-b border-[#1a1a1a]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#111] transition-colors text-left"
      >
        <span className="text-[10px] text-[#555] w-20 flex-shrink-0">{time}</span>
        <span className="text-xs text-[#ccc] flex-1 truncate">
          {trade.home_team} {trade.entry_score_home}-{trade.entry_score_away} {trade.away_team}
        </span>
        <span className="text-[10px] text-[#888] w-8 text-right">{trade.entry_minute}'</span>
        <span className="text-[10px] text-cyan-400 w-10 text-right">{trade.entry_composite_score}</span>
        <span className="text-[10px] text-[#888] w-16 text-center">
          {trade.market_type} {trade.market_line ?? ''}
        </span>
        {trade.status !== 'OPEN' && (
          <span className="text-[10px] text-[#888] w-14 text-center">
            {trade.final_score_home}-{trade.final_score_away}
          </span>
        )}
        <StatusBadge status={trade.status} />
        <span className={`text-xs w-14 text-right font-mono ${
          pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-[#666]'
        }`}>
          {trade.status === 'OPEN' ? '-' : pnl >= 0 ? `+${pnl.toFixed(1)}` : pnl.toFixed(1)}
        </span>
        {open ? <ChevronUp size={12} className="text-[#555]" /> : <ChevronDown size={12} className="text-[#555]" />}
      </button>
      {open && <TradeDetail trade={trade} />}
    </div>
  );
}

// ============================================
// Filters
// ============================================

type ViewFilter = 'ALL' | 'OPEN' | 'WON' | 'LOST';

// ============================================
// Page
// ============================================

export function PaperTradePage() {
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<ViewFilter>('ALL');
  const { data, isLoading, isFetching, refetch } = usePaperTrades(days);
  const settleMutation = usePaperTradeSettle();

  const rows = data?.rows ?? [];
  const stats = data?.stats ?? {
    total: 0, open: 0, settled: 0, won: 0, lost: 0,
    winRate: 0, totalPnl: 0, totalStake: 0, roi: 0,
  };

  const filteredRows = useMemo(() => {
    if (filter === 'ALL') return rows;
    return rows.filter(r => {
      if (filter === 'OPEN') return r.status === 'OPEN';
      if (filter === 'WON') return r.status === 'WON';
      if (filter === 'LOST') return r.status === 'LOST';
      return true;
    });
  }, [rows, filter]);

  const filterBtn = (f: ViewFilter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      className={`px-3 py-1 text-xs rounded transition-colors ${
        filter === f
          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
          : 'text-[#888] hover:text-[#ccc] border border-transparent'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="text-[#888] hover:text-[#ccc] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-sm font-bold text-[#ccc] flex items-center gap-2">
            <TrendingUp size={16} className="text-cyan-400" />
            Paper Trading 模拟交易
          </h1>
          <div className="flex-1" />

          {/* 时间范围 */}
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="bg-[#111] border border-[#333] text-xs text-[#ccc] rounded px-2 py-1"
          >
            <option value={1}>今天</option>
            <option value={3}>3 天</option>
            <option value={7}>7 天</option>
            <option value={30}>30 天</option>
          </select>

          {/* 手动结算 */}
          <button
            type="button"
            onClick={() => settleMutation.mutate()}
            disabled={settleMutation.isPending}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          >
            <Clock size={12} />
            {settleMutation.isPending ? '结算中...' : '手动结算'}
          </button>

          {/* 刷新 */}
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[#888] hover:text-[#ccc] transition-colors"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* 统计仪表盘 */}
            <StatsPanel stats={stats} />

            {/* 情景统计 */}
            <ScenarioBreakdown rows={rows} />

            {/* 结算结果通知 */}
            {settleMutation.isSuccess && settleMutation.data && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-4 text-xs text-emerald-400">
                已结算 {(settleMutation.data as { settledCount: number }).settledCount} 单
              </div>
            )}

            {/* 筛选 */}
            <div className="flex items-center gap-2 mb-4">
              {filterBtn('ALL', `全部 (${rows.length})`)}
              {filterBtn('OPEN', `进行中 (${stats.open})`)}
              {filterBtn('WON', `盈利 (${stats.won})`)}
              {filterBtn('LOST', `亏损 (${stats.lost})`)}
            </div>

            {/* 表头 */}
            <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-[#555] border-b border-[#1a1a1a]">
              <span className="w-20">时间</span>
              <span className="flex-1">比赛</span>
              <span className="w-8 text-right">分钟</span>
              <span className="w-10 text-right">评分</span>
              <span className="w-16 text-center">市场</span>
              <span className="w-14 text-center">终场</span>
              <span className="w-14 text-center">状态</span>
              <span className="w-14 text-right">盈亏</span>
              <span className="w-3" />
            </div>

            {/* 列表 */}
            {filteredRows.length === 0 ? (
              <div className="text-center py-16 text-[#555] text-sm">
                {rows.length === 0
                  ? '暂无模拟交易记录。开启 Paper Trading 开关后，系统将在情景评分达标时自动下单。'
                  : '当前筛选条件下没有记录'}
              </div>
            ) : (
              <div className="border border-[#1a1a1a] rounded-lg overflow-hidden">
                {filteredRows.map(t => (
                  <TradeRow key={t.id} trade={t} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PaperTradePage;
