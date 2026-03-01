// ============================================
// 复盘台 - 历史分析页面
// 统计卡片、趋势图、场景分析、复盘明细
// ============================================

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Target, DollarSign, Percent, Download, Search,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Filter,
  Calendar, Trophy, AlertTriangle, Zap, BarChart3
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid
} from 'recharts';
import {
  getRecentAlerts,
  calculateOverallStats,
  getDailyStats,
  type RadarAlert,
  type DailyStats,
} from '../lib/supabase';
import { useEffect } from 'react';

// ============================================
// 类型定义
// ============================================

type DateRange = 'today' | '7days' | '30days';
type ResultFilter = 'all' | 'hit' | 'miss' | 'pending';

interface ScenarioStat {
  name: string;
  key: string;
  hitRate: number;
  count: number;
  profit: number;
  color: string;
}

// 场景配置
const SCENARIOS: Record<string, { name: string; color: string }> = {
  xg_debt: { name: 'xG远超实际进球', color: '#00d4ff' },
  attack_dominant: { name: '一方攻势压制', color: '#00ff88' },
  deadlock_75: { name: '0:0僵局75分钟+', color: '#ffaa00' },
  strong_behind: { name: '强队落后', color: '#ff4444' },
  high_shots: { name: '双方大量射门', color: '#a855f7' },
  late_pressure: { name: '尾段压制', color: '#f97316' },
};

// ============================================
// 主组件
// ============================================

export function ReviewPage() {
  const [dateRange, setDateRange] = useState<DateRange>('7days');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [overallStats, setOverallStats] = useState({
    total: 0,
    success: 0,
    failed: 0,
    pending: 0,
    successRate: 0,
    avgRating: 0,
  });

  // 加载数据
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const days = dateRange === 'today' ? 1 : dateRange === '7days' ? 7 : 30;
        const [alertsData, statsData, daily] = await Promise.all([
          getRecentAlerts(200),
          calculateOverallStats(),
          getDailyStats(days),
        ]);
        setAlerts(alertsData);
        setOverallStats(statsData);
        setDailyStats(daily);
      } catch (error) {
        console.error('加载复盘数据失败:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [dateRange]);

  // 筛选后的预警列表
  const filteredAlerts = useMemo(() => {
    let result = alerts;

    // 日期筛选
    const now = new Date();
    const cutoff = new Date();
    if (dateRange === 'today') {
      cutoff.setHours(0, 0, 0, 0);
    } else if (dateRange === '7days') {
      cutoff.setDate(now.getDate() - 7);
    } else {
      cutoff.setDate(now.getDate() - 30);
    }
    result = result.filter(a => new Date(a.created_at) >= cutoff);

    // 结果筛选
    if (resultFilter === 'hit') {
      result = result.filter(a => a.result_status === 'success');
    } else if (resultFilter === 'miss') {
      result = result.filter(a => a.result_status === 'failed');
    } else if (resultFilter === 'pending') {
      result = result.filter(a => a.result_status === 'pending');
    }

    // 联赛筛选
    if (leagueFilter !== 'all') {
      result = result.filter(a => a.league_name?.includes(leagueFilter));
    }

    // 搜索筛选
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.home_team?.toLowerCase().includes(q) ||
        a.away_team?.toLowerCase().includes(q) ||
        a.league_name?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [alerts, dateRange, resultFilter, leagueFilter, searchQuery]);

  // 计算场景统计（模拟数据）
  const scenarioStats: ScenarioStat[] = useMemo(() => {
    // TODO: 从实际数据计算
    return [
      { key: 'xg_debt', name: 'xG远超实际进球', hitRate: 78, count: 34, profit: 1200, color: '#00d4ff' },
      { key: 'attack_dominant', name: '一方攻势压制', hitRate: 71, count: 45, profit: 890, color: '#00ff88' },
      { key: 'deadlock_75', name: '0:0僵局75分钟+', hitRate: 65, count: 28, profit: 340, color: '#ffaa00' },
      { key: 'strong_behind', name: '强队落后', hitRate: 68, count: 22, profit: 520, color: '#ff4444' },
      { key: 'high_shots', name: '双方大量射门', hitRate: 52, count: 49, profit: -120, color: '#a855f7' },
      { key: 'late_pressure', name: '尾段压制', hitRate: 62, count: 31, profit: 280, color: '#f97316' },
    ].sort((a, b) => b.hitRate - a.hitRate);
  }, []);

  // 模拟盈亏数据
  const totalProfit = 2340;
  const roi = 12.3;

  // 趋势图数据
  const trendData = useMemo(() => {
    if (dailyStats.length === 0) {
      // 生成模拟数据
      const data = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        data.push({
          date: `${date.getMonth() + 1}/${date.getDate()}`,
          hitRate: 55 + Math.floor(Math.random() * 20),
          count: Math.floor(Math.random() * 8) + 2,
        });
      }
      return data;
    }
    return dailyStats.map(d => ({
      date: d.date.slice(5), // MM-DD
      hitRate: d.total > 0 ? Math.round((d.success / d.total) * 100) : 0,
      count: d.total,
    }));
  }, [dailyStats]);

  // 导出 CSV
  const handleExportCSV = useCallback(() => {
    const headers = ['日期', '比赛', '联赛', '预警时间', '概率', '结果', '盈亏'];
    const rows = filteredAlerts.map(a => [
      new Date(a.created_at).toLocaleDateString('zh-CN'),
      `${a.home_team} vs ${a.away_team}`,
      a.league_name || '',
      `${a.trigger_minute}'`,
      `${a.trigger_rating}%`,
      a.result_status === 'success' ? '命中' : a.result_status === 'failed' ? '未中' : '待定',
      a.result_status === 'success' ? '+185' : a.result_status === 'failed' ? '-100' : '-',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `复盘数据_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredAlerts]);

  // 获取联赛列表
  const leagues = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach(a => {
      if (a.league_name) set.add(a.league_name);
    });
    return Array.from(set);
  }, [alerts]);

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
              <span className="text-2xl">📊</span>
              <span>复盘台</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/battle"
              className="px-3 py-1.5 rounded-lg bg-[#ff4444]/10 text-[#ff4444] hover:bg-[#ff4444]/20 border border-[#ff4444]/30 transition-colors text-sm"
            >
              ← 作战室
            </Link>
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00d4ff]/10 text-[#00d4ff] hover:bg-[#00d4ff]/20 border border-[#00d4ff]/30 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              导出CSV
            </button>
          </div>
        </div>
      </header>

      {/* ============================================ */}
      {/* 筛选栏 */}
      {/* ============================================ */}
      <div className="bg-[#0d0d0d] border-b border-[#1a1a1a] px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-4">
          {/* 时间范围 */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#666]" />
            <DateButton active={dateRange === 'today'} onClick={() => setDateRange('today')}>
              今天
            </DateButton>
            <DateButton active={dateRange === '7days'} onClick={() => setDateRange('7days')}>
              7天
            </DateButton>
            <DateButton active={dateRange === '30days'} onClick={() => setDateRange('30days')}>
              30天
            </DateButton>
          </div>

          <span className="text-[#333]">│</span>

          {/* 联赛筛选 */}
          <select
            value={leagueFilter}
            onChange={e => setLeagueFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#ccc] text-sm focus:outline-none focus:border-[#00d4ff]"
          >
            <option value="all">全部联赛</option>
            {leagues.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <div className="flex-1" />

          {/* 搜索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
            <input
              type="text"
              placeholder="搜索球队..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333] text-[#ccc] text-sm focus:outline-none focus:border-[#00d4ff] w-48"
            />
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* 主内容区 */}
      {/* ============================================ */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Target className="w-5 h-5" />}
            label="总预警数"
            value={overallStats.total}
            change={`本周 +${Math.floor(overallStats.total * 0.15)}`}
            color="primary"
          />
          <StatCard
            icon={<Percent className="w-5 h-5" />}
            label="命中率"
            value={`${overallStats.successRate}%`}
            change={`上周 ${overallStats.successRate - 2}%`}
            color={overallStats.successRate >= 60 ? 'success' : 'warning'}
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="总盈亏"
            value={totalProfit > 0 ? `+${totalProfit}` : String(totalProfit)}
            change={`本周 +580`}
            color={totalProfit > 0 ? 'success' : 'danger'}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="ROI"
            value={`${roi > 0 ? '+' : ''}${roi}%`}
            change={`上周 11%`}
            color={roi > 0 ? 'success' : 'danger'}
          />
        </div>

        {/* 命中率趋势图 */}
        <div className="bg-[#111] border border-[#222] rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#00d4ff]" />
            命中率趋势（{dateRange === 'today' ? '今天' : dateRange === '7days' ? '7天' : '30天'}）
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="date" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} domain={[40, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                  labelStyle={{ color: '#888' }}
                />
                <Line
                  type="monotone"
                  dataKey="hitRate"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  dot={{ fill: '#00d4ff', r: 3 }}
                  name="命中率 %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 场景分析 */}
        <div className="bg-[#111] border border-[#222] rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#ffaa00]" />
            哪种场景最赚钱？
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#888] border-b border-[#222]">
                  <th className="text-left py-3 px-4">排名</th>
                  <th className="text-left py-3 px-4">场景</th>
                  <th className="text-center py-3 px-4">命中率</th>
                  <th className="text-center py-3 px-4">出现次数</th>
                  <th className="text-right py-3 px-4">盈亏</th>
                </tr>
              </thead>
              <tbody>
                {scenarioStats.map((s, i) => (
                  <tr key={s.key} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                    <td className="py-3 px-4">
                      {i === 0 && <span className="text-[#ffd700]">🥇</span>}
                      {i === 1 && <span className="text-[#c0c0c0]">🥈</span>}
                      {i === 2 && <span className="text-[#cd7f32]">🥉</span>}
                      {i > 2 && <span className="text-[#666]">{i + 1}</span>}
                    </td>
                    <td className="py-3 px-4 font-medium" style={{ color: s.color }}>{s.name}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={s.hitRate >= 65 ? 'text-[#00ff88]' : s.hitRate >= 55 ? 'text-[#ffaa00]' : 'text-[#ff4444]'}>
                        {s.hitRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-[#888]">{s.count}次</td>
                    <td className={`py-3 px-4 text-right font-mono ${s.profit >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                      {s.profit >= 0 ? '+' : ''}{s.profit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 结论 */}
          <div className="mt-4 p-3 bg-[#0d0d0d] rounded-lg text-sm">
            <span className="text-[#ffaa00]">💡 结论：</span>
            <span className="text-[#ccc]">
              专注 <span className="text-[#00d4ff]">xG差值大</span> + <span className="text-[#00ff88]">攻势压制</span> 的场景，
              回避 <span className="text-[#ff4444]">双方大量射门但不进</span> 的情况
            </span>
          </div>
        </div>

        {/* 复盘明细 */}
        <div className="bg-[#111] border border-[#222] rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#888]" />
              每场复盘明细
            </h3>
            {/* 结果筛选 */}
            <div className="flex items-center gap-2">
              <ResultButton active={resultFilter === 'all'} onClick={() => setResultFilter('all')}>
                全部
              </ResultButton>
              <ResultButton active={resultFilter === 'hit'} onClick={() => setResultFilter('hit')} color="success">
                命中
              </ResultButton>
              <ResultButton active={resultFilter === 'miss'} onClick={() => setResultFilter('miss')} color="danger">
                未中
              </ResultButton>
              <ResultButton active={resultFilter === 'pending'} onClick={() => setResultFilter('pending')} color="warning">
                待定
              </ResultButton>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-[#666]">加载中...</div>
          ) : filteredAlerts.length === 0 ? (
            <div className="py-12 text-center text-[#666]">暂无数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#888] border-b border-[#222]">
                    <th className="text-left py-3 px-3">日期</th>
                    <th className="text-left py-3 px-3">比赛</th>
                    <th className="text-center py-3 px-3">预警时间</th>
                    <th className="text-center py-3 px-3">概率</th>
                    <th className="text-center py-3 px-3">结果</th>
                    <th className="text-right py-3 px-3">盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.slice(0, 50).map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredAlerts.length > 50 && (
            <div className="mt-4 text-center text-[#666] text-sm">
              显示前 50 条，共 {filteredAlerts.length} 条记录
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ============================================
// 子组件
// ============================================

function StatCard({
  icon,
  label,
  value,
  change,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change: string;
  color: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    primary: 'text-[#00d4ff]',
    success: 'text-[#00ff88]',
    warning: 'text-[#ffaa00]',
    danger: 'text-[#ff4444]',
  };

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4">
      <div className="flex items-center gap-2 text-[#888] mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-[#666] mt-1">{change}</div>
    </div>
  );
}

function DateButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-[#00d4ff] text-black'
          : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
      }`}
    >
      {children}
    </button>
  );
}

function ResultButton({
  children,
  active,
  onClick,
  color = 'default',
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const colors = {
    default: active ? 'bg-[#333] text-white' : 'text-[#888]',
    success: active ? 'bg-[#00ff88]/20 text-[#00ff88]' : 'text-[#888]',
    danger: active ? 'bg-[#ff4444]/20 text-[#ff4444]' : 'text-[#888]',
    warning: active ? 'bg-[#ffaa00]/20 text-[#ffaa00]' : 'text-[#888]',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${colors[color]} hover:bg-[#1a1a1a]`}
    >
      {children}
    </button>
  );
}

function AlertRow({ alert }: { alert: RadarAlert }) {
  const getResultIcon = () => {
    if (alert.result_status === 'success') return <CheckCircle className="w-4 h-4 text-[#00ff88]" />;
    if (alert.result_status === 'failed') return <XCircle className="w-4 h-4 text-[#ff4444]" />;
    return <Clock className="w-4 h-4 text-[#ffaa00]" />;
  };

  const getProfit = () => {
    if (alert.result_status === 'success') return <span className="text-[#00ff88]">+185</span>;
    if (alert.result_status === 'failed') return <span className="text-[#ff4444]">-100</span>;
    return <span className="text-[#666]">-</span>;
  };

  return (
    <tr className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
      <td className="py-3 px-3 text-[#888]">
        {new Date(alert.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
      </td>
      <td className="py-3 px-3">
        <span className="text-[#eee]">{alert.home_team}</span>
        <span className="text-[#666] mx-1">vs</span>
        <span className="text-[#eee]">{alert.away_team}</span>
        {alert.league_name && (
          <span className="ml-2 text-xs text-[#666]">{alert.league_name}</span>
        )}
      </td>
      <td className="py-3 px-3 text-center text-[#ffaa00] font-mono">{alert.trigger_minute}'</td>
      <td className="py-3 px-3 text-center">
        <span className={`font-bold ${(alert.trigger_rating ?? 0) >= 80 ? 'text-[#ff4444]' : 'text-[#ffaa00]'}`}>
          {alert.trigger_rating}%
        </span>
      </td>
      <td className="py-3 px-3 text-center">{getResultIcon()}</td>
      <td className="py-3 px-3 text-right font-mono">{getProfit()}</td>
    </tr>
  );
}

export default ReviewPage;
