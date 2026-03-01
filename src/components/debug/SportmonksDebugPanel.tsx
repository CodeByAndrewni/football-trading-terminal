// ============================================
// Sportmonks Debug Panel
// 用于测试和展示 Sportmonks API 数据
// ============================================

import { useState } from 'react';
import { RefreshCw, CheckCircle, XCircle, Globe, Loader2 } from 'lucide-react';
import {
  useSportmonksLivescores,
  useSportmonksConnectionTest,
  getSportmonksRateLimitStats,
  clearSportmonksCache,
} from '../../hooks/useSportmonks';

interface SportmonksDebugPanelProps {
  onClose?: () => void;
}

export function SportmonksDebugPanel({ onClose }: SportmonksDebugPanelProps) {
  const [showRawData, setShowRawData] = useState(false);

  // Fetch connection test
  const connectionTest = useSportmonksConnectionTest();

  // Fetch livescores
  const livescores = useSportmonksLivescores({
    enabled: true,
    refetchInterval: 30000,
  });

  const rateLimitStats = getSportmonksRateLimitStats();

  const handleRefresh = () => {
    clearSportmonksCache();
    livescores.refetch();
    connectionTest.refetch();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333]">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-[#00d4ff]" />
            <h2 className="text-lg font-bold text-white">Sportmonks API 调试面板</h2>
            <span className="px-2 py-0.5 bg-[#00d4ff]/20 text-[#00d4ff] text-xs rounded">
              中文翻译
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 rounded hover:bg-white/10 text-[#888] hover:text-white transition-colors"
              title="刷新数据"
            >
              <RefreshCw className={`w-4 h-4 ${livescores.isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-white/10 text-[#888] hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Connection Status */}
          <div className="bg-[#222] rounded-lg p-4">
            <h3 className="text-sm font-medium text-[#888] mb-3">连接状态</h3>
            <div className="flex items-center gap-4">
              {connectionTest.isLoading ? (
                <div className="flex items-center gap-2 text-[#888]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>测试连接中...</span>
                </div>
              ) : connectionTest.data?.ok ? (
                <div className="flex items-center gap-2 text-[#22c55e]">
                  <CheckCircle className="w-4 h-4" />
                  <span>{connectionTest.data.message}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[#ef4444]">
                  <XCircle className="w-4 h-4" />
                  <span>{connectionTest.data?.message || '连接失败'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Rate Limit */}
          <div className="bg-[#222] rounded-lg p-4">
            <h3 className="text-sm font-medium text-[#888] mb-3">API 配额</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[#666]">本分钟请求: </span>
                <span className="text-white font-mono">{rateLimitStats.requestsLastMinute}</span>
              </div>
              <div>
                <span className="text-[#666]">剩余配额: </span>
                <span className="text-[#22c55e] font-mono">{rateLimitStats.remainingInMinute}</span>
              </div>
              <div>
                <span className="text-[#666]">重置倒计时: </span>
                <span className="text-[#ffaa00] font-mono">{rateLimitStats.secondsUntilReset}s</span>
              </div>
            </div>
          </div>

          {/* Live Matches */}
          <div className="bg-[#222] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#888]">
                进行中比赛 ({livescores.data?.length || 0})
              </h3>
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="text-xs text-[#00d4ff] hover:underline"
              >
                {showRawData ? '显示表格' : '显示原始数据'}
              </button>
            </div>

            {livescores.isLoading ? (
              <div className="flex items-center justify-center py-8 text-[#666]">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                加载中...
              </div>
            ) : livescores.error ? (
              <div className="text-center py-8 text-[#ef4444]">
                加载失败: {livescores.error.message}
              </div>
            ) : livescores.data && livescores.data.length > 0 ? (
              showRawData ? (
                <pre className="text-xs text-[#aaa] bg-[#111] rounded p-3 overflow-auto max-h-[400px]">
                  {JSON.stringify(livescores.data.slice(0, 3), null, 2)}
                </pre>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-auto">
                  {livescores.data.map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center justify-between bg-[#111] rounded px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[#888] text-xs w-16">{match.league}</span>
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          match.isLive ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#666]/20 text-[#888]'
                        }`}>
                          {match.minute}'
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white truncate max-w-[120px]">
                          {match.homeTeam.name}
                        </span>
                        <span className="font-bold font-mono text-[#00d4ff]">
                          {match.homeTeam.score}
                        </span>
                        <span className="text-[#666]">-</span>
                        <span className="font-bold font-mono text-[#ff6b6b]">
                          {match.awayTeam.score}
                        </span>
                        <span className="text-white truncate max-w-[120px]">
                          {match.awayTeam.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#666]">
                        <span>射门: {match.statistics.shots.home}-{match.statistics.shots.away}</span>
                        <span>角球: {match.statistics.corners.home}-{match.statistics.corners.away}</span>
                        {match.hasOdds && (
                          <span className="text-[#ffaa00]">有赔率</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-center py-8 text-[#666]">
                当前无进行中比赛
              </div>
            )}
          </div>

          {/* API Info */}
          <div className="bg-[#222] rounded-lg p-4">
            <h3 className="text-sm font-medium text-[#888] mb-3">API 信息</h3>
            <div className="text-xs text-[#666] space-y-1">
              <p>• 数据源: Sportmonks Football API v3</p>
              <p>• 中文翻译: locale=zh (beta)</p>
              <p>• 试用期: 14天</p>
              <p>• 支持实体: 球队名、联赛名、球员名、城市名</p>
              <p>• 包含数据: participants, scores, statistics, events, league, state, periods, venue</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SportmonksDebugPanel;
