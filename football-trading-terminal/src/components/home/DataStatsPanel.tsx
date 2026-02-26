// ============================================
// 数据统计面板 - 首页实时数据可视化
// ============================================

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, Target, Zap, Users, Activity, BarChart3 } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';

interface DataStatsPanelProps {
  matches: AdvancedMatch[];
}

const COLORS = {
  danger: '#ff4444',
  warning: '#ffaa00',
  success: '#00cc66',
  primary: '#00d9ff',
  muted: '#64748b',
};

export function DataStatsPanel({ matches }: DataStatsPanelProps) {
  // 评分分布统计
  const scoreDistribution = useMemo(() => {
    const ranges = [
      { name: '< 70', min: 0, max: 70, count: 0, color: COLORS.muted },
      { name: '70-80', min: 70, max: 80, count: 0, color: COLORS.primary },
      { name: '80-85', min: 80, max: 85, count: 0, color: COLORS.warning },
      { name: '85-90', min: 85, max: 90, count: 0, color: COLORS.danger },
      { name: '90+', min: 90, max: 100, count: 0, color: '#ff1744' },
    ];

    matches.forEach(match => {
      const score = typeof match.rating === 'number' ? match.rating : Number(match.rating) || 0;
      ranges.forEach(range => {
        if (score >= range.min && score < range.max) {
          range.count++;
        }
      });
    });

    return ranges;
  }, [matches]);

  // 联赛分布统计
  const leagueDistribution = useMemo(() => {
    const leagueMap = new Map<string, number>();
    matches.forEach(match => {
      leagueMap.set(match.league, (leagueMap.get(match.league) || 0) + 1);
    });

    return Array.from(leagueMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6); // 只显示前6个联赛
  }, [matches]);

  // 比赛时间分布
  const minuteDistribution = useMemo(() => {
    const ranges = [
      { name: '0-45', count: 0 },
      { name: '45-60', count: 0 },
      { name: '60-75', count: 0 },
      { name: '75-90', count: 0 },
      { name: '90+', count: 0 },
    ];

    matches.forEach(match => {
      const minute = match.minute;
      if (minute <= 45) ranges[0].count++;
      else if (minute <= 60) ranges[1].count++;
      else if (minute <= 75) ranges[2].count++;
      else if (minute <= 90) ranges[3].count++;
      else ranges[4].count++;
    });

    return ranges;
  }, [matches]);

  // 高评分比赛趋势（按时间）
  const highScoreTrend = useMemo(() => {
    const trend = matches
      .filter(m => {
        const rating = typeof m.rating === 'number' ? m.rating : Number(m.rating) || 0;
        return rating >= 80;
      })
      .reduce((acc, match) => {
        const minute = Math.floor(match.minute / 15) * 15; // 15分钟间隔
        const existing = acc.find(item => item.minute === minute);
        const score = typeof match.rating === 'number' ? match.rating : Number(match.rating) || 0;
        if (existing) {
          existing.count++;
          existing.avgScore = (existing.avgScore * (existing.count - 1) + score) / existing.count;
        } else {
          acc.push({ minute, count: 1, avgScore: score });
        }
        return acc;
      }, [] as { minute: number; count: number; avgScore: number }[])
      .sort((a, b) => a.minute - b.minute);

    return trend;
  }, [matches]);

  // 统计卡片数据
  const stats = useMemo(() => {
    const totalMatches = matches.length;
    const getRating = (m: typeof matches[0]) => typeof m.rating === 'number' ? m.rating : Number(m.rating) || 0;
    const highScoreMatches = matches.filter(m => getRating(m) >= 80).length;
    const avgScore = totalMatches > 0 ? matches.reduce((sum, m) => sum + getRating(m), 0) / totalMatches : 0;
    const criticalMatches = matches.filter(m => m.minute >= 70).length;

    return [
      {
        label: '进行中比赛',
        value: totalMatches,
        icon: Activity,
        color: 'primary',
      },
      {
        label: '80+ 高评分',
        value: highScoreMatches,
        icon: Zap,
        color: 'danger',
      },
      {
        label: '平均评分',
        value: avgScore.toFixed(1),
        icon: Target,
        color: 'warning',
      },
      {
        label: '关键时段',
        value: criticalMatches,
        icon: TrendingUp,
        color: 'success',
      },
    ];
  }, [matches]);

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-bg-card border border-border-default rounded-lg p-3 hover:border-accent-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted">{stat.label}</span>
              <stat.icon className={`w-4 h-4 text-accent-${stat.color}`} />
            </div>
            <div className="text-2xl font-bold text-text-primary">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* 图表网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 评分分布 */}
        <div className="bg-bg-card border border-border-default rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-accent-primary" />
            <h3 className="text-sm font-medium text-text-primary">评分分布</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {scoreDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 联赛分布 */}
        <div className="bg-bg-card border border-border-default rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-accent-primary" />
            <h3 className="text-sm font-medium text-text-primary">联赛分布</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={leagueDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={(entry) => `${entry.name} (${entry.value})`}
                labelLine={false}
                style={{ fontSize: 11 }}
              >
                {leagueDistribution.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={[COLORS.primary, COLORS.warning, COLORS.success, COLORS.danger, COLORS.muted, '#9333ea'][index % 6]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 比赛时间分布 */}
        <div className="bg-bg-card border border-border-default rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent-primary" />
            <h3 className="text-sm font-medium text-text-primary">比赛时间分布</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={minuteDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" style={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 高评分趋势 */}
        <div className="bg-bg-card border border-border-default rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-accent-primary" />
            <h3 className="text-sm font-medium text-text-primary">80+ 评分趋势</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={highScoreTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="minute"
                stroke="#64748b"
                style={{ fontSize: 11 }}
                label={{ value: '比赛时间', position: 'insideBottom', offset: -5, style: { fontSize: 10, fill: '#64748b' } }}
              />
              <YAxis stroke="#64748b" style={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke={COLORS.danger}
                strokeWidth={2}
                dot={{ fill: COLORS.danger, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
