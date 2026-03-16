/**
 * ============================================
 * 比赛表格 - 简化版，聚焦核心数据
 * ============================================
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Zap, AlertCircle } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import { calculateDynamicScore, type ScoreResult } from '../../services/scoringEngine';
import { useLiveClock } from '../../hooks/useLiveClock';
import { formatMatchMinute } from '../../utils/matchTime';

interface AdvancedMatchTableProps {
  matches: AdvancedMatch[];
  onToggleWatch: (matchId: number) => void;
}

export function AdvancedMatchTable({ matches, onToggleWatch }: AdvancedMatchTableProps) {
  const navigate = useNavigate();

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-6xl mb-4">⚽</div>
        <p className="text-[#888] text-lg">暂无符合条件的比赛</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 移动端 + 桌面端统一使用卡片列表 */}
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          onToggleWatch={() => onToggleWatch(match.id)}
          onViewDetail={() => navigate(`/match/${match.id}`)}
        />
      ))}
    </div>
  );
}

// 单场比赛卡片
function MatchCard({
  match,
  onToggleWatch,
  onViewDetail,
}: {
  match: AdvancedMatch;
  onToggleWatch: () => void;
  onViewDetail: () => void;
}) {
  const liveClockTick = useLiveClock(5000);
  const deltaMinutes = Math.floor((liveClockTick * 5) / 60);
  const scoreResult = calculateDynamicScore(match);
  const rating = scoreResult?.totalScore ?? 0;
  const confidence = scoreResult?.confidence ?? 0;

  // 检查是否有真实统计数据
  const hasStats = match.stats?._realDataAvailable === true;
  const isUnscoreable = match._unscoreable === true;

  // 样式计算
  const getMinuteStyle = () => {
    if (match.minute >= 85) return 'text-[#ff4444] animate-pulse font-bold';
    if (match.minute >= 80) return 'text-[#ff6600] font-bold';
    if (match.minute >= 75) return 'text-[#ffaa00] font-bold';
    return 'text-[#888]';
  };

  const getRatingStyle = () => {
    if (isUnscoreable) return 'bg-[#333] text-[#666]';
    if (rating >= 90) return 'bg-[#ff4444] text-white';
    if (rating >= 80) return 'bg-[#ff6600] text-white';
    if (rating >= 70) return 'bg-[#ffaa00] text-black';
    if (rating >= 60) return 'bg-[#888] text-white';
    return 'bg-[#444] text-[#888]';
  };

  const getBorderStyle = () => {
    if (isUnscoreable) return 'border-[#333] hover:border-[#444]';
    if (rating >= 80) return 'border-[#ff4444]/50 hover:border-[#ff4444]';
    if (rating >= 70) return 'border-[#ffaa00]/30 hover:border-[#ffaa00]';
    return 'border-[#333] hover:border-[#555]';
  };

  // 统计数据 - 检查是否有真实数据
  const shots = hasStats ? (match.stats?.shots?.home ?? 0) + (match.stats?.shots?.away ?? 0) : null;
  const shotsOn = hasStats ? (match.stats?.shotsOnTarget?.home ?? 0) + (match.stats?.shotsOnTarget?.away ?? 0) : null;
  const corners = match.corners ? (match.corners.home ?? 0) + (match.corners.away ?? 0) : null;
  const xgTotal = hasStats ? ((match.stats?.xG?.home ?? 0) + (match.stats?.xG?.away ?? 0)).toFixed(1) : null;

  // 预警标签
  const alerts = scoreResult?.alerts?.slice(0, 3) ?? [];

  return (
    <div
      className={`bg-[#111] border ${getBorderStyle()} rounded-lg p-4 cursor-pointer transition-all hover:bg-[#1a1a1a]`}
      onClick={onViewDetail}
    >
      {/* 顶部：联赛 + 时间 + 评分 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#666] font-medium">{match.leagueShort || match.league}</span>
          <span className={`text-lg ${getMinuteStyle()}`}>{formatMatchMinute(match)}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 评分徽章 */}
          <div className={`px-3 py-1 rounded-lg text-lg font-bold ${getRatingStyle()}`}>
            {rating > 0 ? rating : '-'}
          </div>
          {/* 关注按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleWatch(); }}
            className={`p-2 rounded-lg transition-all ${
              match.isWatched
                ? 'bg-[#ffaa00]/20 text-[#ffaa00]'
                : 'text-[#555] hover:text-[#ffaa00] hover:bg-[#1a1a1a]'
            }`}
          >
            <Star className={`w-5 h-5 ${match.isWatched ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* 中间：球队 + 比分 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          {/* 主队 */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-medium text-white truncate max-w-[200px]">{match.home.name}</span>
            {(match.initialHandicap ?? match.home.handicap) != null &&
              (match.initialHandicap ?? match.home.handicap) !== 0 && (
                <span className="text-sm text-[#888]">
                  ({(match.initialHandicap ?? match.home.handicap)! > 0 ? '+' : ''}
                  {match.initialHandicap ?? match.home.handicap})
                </span>
              )}
          </div>
          {/* 客队 */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium text-white truncate max-w-[200px]">{match.away.name}</span>
          </div>
        </div>

        {/* 比分 */}
        <div className="text-center px-6">
          <div className="text-3xl font-bold">
            <span className={match.home.score > match.away.score ? 'text-[#00d4ff]' : 'text-white'}>
              {match.home.score}
            </span>
            <span className="text-[#555] mx-2">:</span>
            <span className={match.away.score > match.home.score ? 'text-[#ff4444]' : 'text-white'}>
              {match.away.score}
            </span>
          </div>
          <div className="text-sm text-[#666] mt-1">
            {match.minute > 45 ? '下半场' : '上半场'}
          </div>
        </div>

        {/* 统计概览 */}
        <div className="flex-1 flex justify-end gap-6 text-sm">
          <div className="text-center">
            <div className="text-[#666] mb-1">射门</div>
            <div className={`font-medium ${shots === null ? 'text-[#555]' : 'text-white'}`}>
              {shots === null ? '-' : `${shots}/${shotsOn}`}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[#666] mb-1">角球</div>
            <div className={`font-medium ${corners === null ? 'text-[#555]' : 'text-white'}`}>
              {corners === null ? '-' : corners}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[#666] mb-1">xG</div>
            <div className={`font-medium ${xgTotal === null ? 'text-[#555]' : (Number(xgTotal) >= 2 ? 'text-[#ffaa00]' : 'text-white')}`}>
              {xgTotal === null ? '-' : xgTotal}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[#666] mb-1">置信</div>
            <div className={`font-medium ${isUnscoreable ? 'text-[#555]' : (confidence >= 70 ? 'text-[#00ff88]' : 'text-white')}`}>
              {isUnscoreable ? '-' : `${confidence}%`}
            </div>
          </div>
        </div>
      </div>

      {/* 底部：预警标签 */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-[#222]">
          {alerts.map((alert, i) => (
            <span
              key={i}
              className="text-xs px-2 py-1 bg-[#1a1a1a] text-[#888] rounded"
            >
              {alert.replace(/[🔴🟠⚡⏰📊🔥🎯🟥🔄📺💰📉🏦⚠️]/gu, '').trim()}
            </span>
          ))}
        </div>
      )}

      {/* 数据缺失提示 */}
      {isUnscoreable && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#555]/30">
          <AlertCircle className="w-4 h-4 text-[#666]" />
          <span className="text-sm text-[#666]">统计数据暂未同步，无法评分</span>
        </div>
      )}

      {/* 高分提示 */}
      {!isUnscoreable && rating >= 80 && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#ff4444]/30">
          <Zap className="w-4 h-4 text-[#ff4444]" />
          <span className="text-sm text-[#ff4444] font-medium">高概率进球机会</span>
        </div>
      )}
    </div>
  );
}

export default AdvancedMatchTable;
