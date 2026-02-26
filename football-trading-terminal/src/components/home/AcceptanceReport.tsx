// ============================================================
// ACCEPTANCE REPORT - Phase 2A Task 6
// 数据质量验收报告组件
// ============================================================

import { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Database,
  Zap,
  Clock
} from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import type { DataValidationResult } from '../../services/dataValidation';
import { formatInvalidReasons } from '../../services/dataValidation';

interface AcceptanceReportProps {
  matches: AdvancedMatch[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function AcceptanceReport({ matches, onRefresh, isLoading = false }: AcceptanceReportProps) {
  const [expanded, setExpanded] = useState(false);

  // 计算统计数据
  const stats = useMemo(() => {
    const total = matches.length;

    // 数据质量统计
    const qualityCounts = { REAL: 0, PARTIAL: 0, INVALID: 0, UNKNOWN: 0 };
    const reasonCounts = new Map<string, number>();

    for (const match of matches) {
      const quality = match._validation?.data_quality ?? 'UNKNOWN';
      qualityCounts[quality as keyof typeof qualityCounts]++;

      // 统计无效原因
      for (const reason of match._validation?.invalid_reasons ?? []) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }

    // 统计覆盖率
    const withStats = matches.filter(m => m.stats?._realDataAvailable).length;
    const withOdds = matches.filter(m => m.odds?._fetch_status === 'SUCCESS').length;
    const withEvents = matches.filter(m => m._validation?.events_real).length;

    // 80+ 比赛统计
    const matches80Plus = matches.filter(m => m.minute >= 80);
    const matches80PlusWithStats = matches80Plus.filter(m => m.stats?._realDataAvailable).length;

    // 信号统计
    const signalsGenerated = matches.filter(m => m.minute >= 65 && !m._unscoreable && m.stats?._realDataAvailable).length;

    // Top N/A 原因
    const topReasons = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      total,
      qualityCounts,
      withStats,
      withOdds,
      withEvents,
      statsCoverage: total > 0 ? (withStats / total) * 100 : 0,
      oddsCoverage: total > 0 ? (withOdds / total) * 100 : 0,
      eventsCoverage: total > 0 ? (withEvents / total) * 100 : 0,
      matches80Plus: matches80Plus.length,
      matches80PlusWithStats,
      signalsGenerated,
      topReasons,
    };
  }, [matches]);

  // 生成示例数据
  const examples = useMemo(() => {
    return matches
      .filter(m => m.stats?._realDataAvailable)
      .slice(0, 3)
      .map(m => ({
        fixture_id: m.id,
        home_team: m.home.name,
        away_team: m.away.name,
        minute: m.minute,
        shots_total: (m.stats?.shots?.home ?? 0) + (m.stats?.shots?.away ?? 0),
        shots_on_total: (m.stats?.shotsOnTarget?.home ?? 0) + (m.stats?.shotsOnTarget?.away ?? 0),
        xg_total: ((m.stats?.xG?.home ?? 0) + (m.stats?.xG?.away ?? 0)).toFixed(2),
        corners_total: (m.corners?.home ?? 0) + (m.corners?.away ?? 0),
        over_2_5: m.odds?.overUnder?.over?.toFixed(2) ?? 'N/A',
        data_quality: m._validation?.data_quality ?? 'UNKNOWN',
      }));
  }, [matches]);

  // 导出报告
  const handleExport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      summary: {
        total_matches: stats.total,
        stats_coverage: `${stats.statsCoverage.toFixed(1)}%`,
        odds_coverage: `${stats.oddsCoverage.toFixed(1)}%`,
        events_coverage: `${stats.eventsCoverage.toFixed(1)}%`,
        data_quality: stats.qualityCounts,
      },
      top_na_reasons: stats.topReasons.map(([reason, count]) => ({
        reason,
        count,
        description: formatInvalidReasons([reason])[0],
      })),
      examples,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acceptance-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[#0d0d0d] border border-[#333] rounded-xl overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#00d4ff]" />
          <span className="font-bold text-white">Acceptance Report</span>
          <span className="text-xs text-[#666]">Phase 2A</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[#888] hover:text-white transition-colors"
            title="导出报告"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[#888] hover:text-white transition-colors disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 统计覆盖率 */}
        <div className="bg-[#1a1a1a] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-green-400" />
            <span className="text-xs text-[#888]">Stats 覆盖</span>
          </div>
          <div className="text-2xl font-bold text-green-400">
            {stats.statsCoverage.toFixed(0)}%
          </div>
          <div className="text-xs text-[#666] mt-1">
            {stats.withStats}/{stats.total} 场
          </div>
        </div>

        {/* 赔率覆盖率 */}
        <div className="bg-[#1a1a1a] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-[#888]">Odds 覆盖</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">
            {stats.oddsCoverage.toFixed(0)}%
          </div>
          <div className="text-xs text-[#666] mt-1">
            {stats.withOdds}/{stats.total} 场
          </div>
        </div>

        {/* 80+ 比赛 */}
        <div className="bg-[#1a1a1a] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-[#888]">80+ 比赛</span>
          </div>
          <div className="text-2xl font-bold text-orange-400">
            {stats.matches80Plus}
          </div>
          <div className="text-xs text-[#666] mt-1">
            有数据: {stats.matches80PlusWithStats} 场
          </div>
        </div>

        {/* 数据质量 */}
        <div className="bg-[#1a1a1a] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-[#00d4ff]" />
            <span className="text-xs text-[#888]">数据质量</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-green-400">{stats.qualityCounts.REAL}</span>
            <span className="text-[#444]">/</span>
            <span className="text-sm font-bold text-yellow-400">{stats.qualityCounts.PARTIAL}</span>
            <span className="text-[#444]">/</span>
            <span className="text-sm font-bold text-red-400">{stats.qualityCounts.INVALID}</span>
          </div>
          <div className="text-xs text-[#666] mt-1">
            REAL / PARTIAL / INVALID
          </div>
        </div>
      </div>

      {/* 数据质量分布条 */}
      <div className="px-4 pb-4">
        <div className="flex h-2 rounded-full overflow-hidden bg-[#333]">
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${(stats.qualityCounts.REAL / Math.max(stats.total, 1)) * 100}%` }}
          />
          <div
            className="bg-yellow-500 transition-all"
            style={{ width: `${(stats.qualityCounts.PARTIAL / Math.max(stats.total, 1)) * 100}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${(stats.qualityCounts.INVALID / Math.max(stats.total, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* 展开内容 */}
      <div className="border-t border-[#333]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 flex items-center justify-between text-sm text-[#888] hover:text-white hover:bg-white/5 transition-colors"
        >
          <span>{expanded ? '收起详情' : '展开详情'}</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4">
            {/* Top N/A 原因 */}
            <div>
              <h4 className="text-xs font-medium text-[#888] mb-2 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" />
                TOP N/A 原因
              </h4>
              <div className="space-y-1">
                {stats.topReasons.length === 0 ? (
                  <div className="text-xs text-[#666]">无 N/A 数据</div>
                ) : (
                  stats.topReasons.map(([reason, count], i) => (
                    <div key={reason} className="flex items-center gap-2 text-xs">
                      <span className="text-[#666] w-4">{i + 1}.</span>
                      <span className="flex-1 text-red-400 font-mono">{reason}</span>
                      <span className="text-white font-bold">{count}</span>
                      <span className="text-[#666]">
                        ({((count / stats.total) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Raw → Mapped 示例 */}
            <div>
              <h4 className="text-xs font-medium text-[#888] mb-2 flex items-center gap-2">
                <Database className="w-3 h-3" />
                RAW → MAPPED 示例
              </h4>
              {examples.length === 0 ? (
                <div className="text-xs text-[#666]">无可用示例</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#888] border-b border-[#333]">
                        <th className="text-left py-1 px-2">比赛</th>
                        <th className="text-center py-1 px-2">分钟</th>
                        <th className="text-center py-1 px-2">射门</th>
                        <th className="text-center py-1 px-2">射正</th>
                        <th className="text-center py-1 px-2">xG</th>
                        <th className="text-center py-1 px-2">角球</th>
                        <th className="text-center py-1 px-2">大2.5</th>
                        <th className="text-center py-1 px-2">质量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examples.map((ex, i) => (
                        <tr key={ex.fixture_id} className="border-b border-[#222]">
                          <td className="py-1.5 px-2">
                            <div className="truncate max-w-[150px]">
                              {ex.home_team} vs {ex.away_team}
                            </div>
                          </td>
                          <td className="text-center py-1.5 px-2 text-[#00d4ff]">{ex.minute}'</td>
                          <td className="text-center py-1.5 px-2">{ex.shots_total}</td>
                          <td className="text-center py-1.5 px-2">{ex.shots_on_total}</td>
                          <td className="text-center py-1.5 px-2">{ex.xg_total}</td>
                          <td className="text-center py-1.5 px-2">{ex.corners_total}</td>
                          <td className="text-center py-1.5 px-2">{ex.over_2_5}</td>
                          <td className="text-center py-1.5 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              ex.data_quality === 'REAL' ? 'bg-green-500/20 text-green-400' :
                              ex.data_quality === 'PARTIAL' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {ex.data_quality}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AcceptanceReport;
