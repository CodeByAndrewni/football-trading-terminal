/**
 * ============================================
 * 历史比赛页面 - 显示已结束的比赛记录
 * ============================================
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Download,
  Calendar,
  TrendingUp,
  Target,
  CheckCircle,
  BarChart3,
  Cloud,
} from 'lucide-react';
import {
  getMatchHistory,
  clearHistory,
  getHistoryStats,
  type HistoryMatch,
} from '../services/matchHistoryService';
import { CloudSyncPanel } from '../components/settings/CloudSyncPanel';

type SortField = 'time' | 'score' | 'league';

export function HistoryPage() {
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterHighScore, setFilterHighScore] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);

  // 获取历史数据
  const history = useMemo(() => getMatchHistory(), []);
  const stats = useMemo(() => getHistoryStats(), []);

  // 排序和过滤
  const displayedMatches = useMemo(() => {
    let filtered = [...history];

    if (filterHighScore) {
      filtered = filtered.filter(m => m.lastScore >= 80);
    }

    filtered.sort((a, b) => {
      switch (sortField) {
        case 'score':
          return sortAsc ? a.lastScore - b.lastScore : b.lastScore - a.lastScore;
        case 'league':
          return sortAsc
            ? a.leagueShort.localeCompare(b.leagueShort)
            : b.leagueShort.localeCompare(a.leagueShort);
        case 'time':
        default:
          return sortAsc ? a.finishedAt - b.finishedAt : b.finishedAt - a.finishedAt;
      }
    });

    return filtered;
  }, [history, sortField, sortAsc, filterHighScore]);

  // 处理清除历史
  const handleClearHistory = () => {
    if (window.confirm('确定要清除所有历史记录吗？此操作不可撤销。')) {
      clearHistory();
      window.location.reload();
    }
  };

  // 导出CSV
  const handleExportCSV = () => {
    const headers = ['比赛ID', '联赛', '主队', '客队', '比分', '评分', '置信度', '75+进球', '80+进球', '结束时间'];
    const rows = history.map(m => [
      m.id,
      m.leagueShort,
      m.home.name,
      m.away.name,
      `${m.finalScore.home}-${m.finalScore.away}`,
      m.lastScore,
      m.lastConfidence,
      m.hadGoalAfter75 ? '是' : '否',
      m.hadGoalAfter80 ? '是' : '否',
      new Date(m.finishedAt).toLocaleString('zh-CN'),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `livepro_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0]">
      {/* 顶部导航 */}
      <header className="h-14 bg-[#111] border-b border-[#222] flex items-center px-4 gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-[#888] hover:text-[#00d4ff] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回</span>
        </Link>

        <div className="flex-1" />

        <h1 className="text-lg font-bold">
          <span className="text-[#888]">历史</span>
          <span className="text-[#00d4ff] ml-2">比赛记录</span>
        </h1>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setShowSyncPanel(!showSyncPanel)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
            showSyncPanel
              ? 'bg-[#00d4ff]/20 text-[#00d4ff]'
              : 'text-[#888] hover:text-[#00d4ff] hover:bg-[#1a1a1a]'
          }`}
        >
          <Cloud className="w-4 h-4" />
          <span className="hidden sm:inline">云同步</span>
        </button>

        <button
          type="button"
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-[#888] hover:text-[#00d4ff] hover:bg-[#1a1a1a] transition-all"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">导出</span>
        </button>

        <button
          type="button"
          onClick={handleClearHistory}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-[#888] hover:text-[#ff4444] hover:bg-[#1a1a1a] transition-all"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">清除</span>
        </button>
      </header>

      {/* 云同步面板 */}
      {showSyncPanel && (
        <div className="p-4 border-b border-[#222]">
          <CloudSyncPanel onClose={() => setShowSyncPanel(false)} />
        </div>
      )}

      {/* 统计卡片 */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<Calendar className="w-5 h-5" />}
          label="总记录"
          value={stats.totalMatches}
          color="#00d4ff"
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="80+评分"
          value={stats.matchesWithHighScore}
          color="#ff4444"
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="75后进球"
          value={stats.matchesWithGoalAfter75}
          color="#00ff88"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="80后进球"
          value={stats.matchesWithGoalAfter80}
          color="#ffaa00"
        />
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="高分命中率"
          value={`${stats.highScoreAccuracy}%`}
          color="#00d4ff"
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="平均评分"
          value={stats.averageScore}
          color="#888"
        />
      </div>

      {/* 筛选栏 */}
      <div className="px-4 py-2 flex items-center gap-4 border-b border-[#222]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#666]">排序:</span>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-sm text-[#e0e0e0]"
          >
            <option value="time">时间</option>
            <option value="score">评分</option>
            <option value="league">联赛</option>
          </select>
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="px-2 py-1 text-sm text-[#888] hover:text-[#00d4ff]"
          >
            {sortAsc ? '升序' : '降序'}
          </button>
        </div>

        <div className="flex-1" />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterHighScore}
            onChange={(e) => setFilterHighScore(e.target.checked)}
            className="w-4 h-4 rounded bg-[#1a1a1a] border-[#333]"
          />
          <span className="text-sm text-[#888]">只看 80+ 评分</span>
        </label>

        <span className="text-sm text-[#666]">
          显示 {displayedMatches.length} / {history.length} 场
        </span>
      </div>

      {/* 比赛列表 */}
      <div className="p-4">
        {displayedMatches.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-[#888] text-lg">暂无历史记录</p>
            <p className="text-[#666] text-sm mt-2">已结束的比赛将自动保存到这里</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayedMatches.map((match) => (
              <HistoryMatchCard key={match.id} match={match} formatTime={formatTime} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 统计卡片组件
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-[#111] rounded-lg p-3 border border-[#222]">
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color }}>{icon}</div>
        <span className="text-xs text-[#666]">{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// 历史比赛卡片
function HistoryMatchCard({
  match,
  formatTime,
}: {
  match: HistoryMatch;
  formatTime: (timestamp: number) => string;
}) {
  const getScoreStyle = (score: number) => {
    if (score >= 80) return 'text-[#ff4444]';
    if (score >= 70) return 'text-[#ffaa00]';
    return 'text-[#666]';
  };

  return (
    <div className="bg-[#111] rounded-lg p-4 border border-[#222] hover:border-[#333] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#666] bg-[#1a1a1a] px-2 py-1 rounded">
            {match.leagueShort || match.league}
          </span>
          <span className="text-xs text-[#888]">{formatTime(match.finishedAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          {match.hadGoalAfter75 && (
            <span className="text-xs bg-[#00ff88]/20 text-[#00ff88] px-2 py-0.5 rounded">
              75+进球
            </span>
          )}
          {match.hadGoalAfter80 && (
            <span className="text-xs bg-[#ffaa00]/20 text-[#ffaa00] px-2 py-0.5 rounded">
              80+进球
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {/* 球队和比分 */}
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-[#e0e0e0]">{match.home.name}</div>
              <div className="text-sm font-medium text-[#e0e0e0]">{match.away.name}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold font-mono">
                <span className={match.finalScore.home > match.finalScore.away ? 'text-[#00d4ff]' : 'text-white'}>
                  {match.finalScore.home}
                </span>
                <span className="text-[#444] mx-2">-</span>
                <span className={match.finalScore.away > match.finalScore.home ? 'text-[#ff6b6b]' : 'text-white'}>
                  {match.finalScore.away}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 评分 */}
        <div className="ml-6 text-center">
          <div className={`text-2xl font-bold ${getScoreStyle(match.lastScore)}`}>
            {match.lastScore > 0 ? match.lastScore : '--'}
          </div>
          <div className="text-xs text-[#666]">
            {match.lastConfidence > 0 ? `置信 ${match.lastConfidence}%` : '-'}
          </div>
        </div>

        {/* 统计数据 */}
        <div className="ml-6 flex items-center gap-4 text-xs text-[#666]">
          {match.stats.shots && (
            <div className="text-center">
              <div className="text-[#00d4ff]">
                {match.stats.shots.home + match.stats.shots.away}
              </div>
              <div>射门</div>
            </div>
          )}
          {match.stats.corners && (
            <div className="text-center">
              <div className="text-[#ffaa00]">
                {match.stats.corners.home + match.stats.corners.away}
              </div>
              <div>角球</div>
            </div>
          )}
          {match.stats.xG && (
            <div className="text-center">
              <div className="text-[#00ff88]">
                {(match.stats.xG.home + match.stats.xG.away).toFixed(1)}
              </div>
              <div>xG</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HistoryPage;
