// ============================================
// 移动端比赛卡片组件
// ============================================

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, ChevronRight, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import { LEAGUE_COLORS } from '../../data/advancedMockData';
import { calculateDynamicScore, type ScoreResult } from '../../services/scoringEngine';
import { useLiveClock } from '../../hooks/useLiveClock';
import { formatMatchMinute } from '../../utils/matchTime';

interface MobileMatchCardProps {
  match: AdvancedMatch;
  onToggleWatch: (matchId: number) => void;
}

export function MobileMatchCard({ match, onToggleWatch }: MobileMatchCardProps) {
  const navigate = useNavigate();

  // 计算动态评分
  const scoreResult = useMemo(() => calculateDynamicScore(match), [match]);

  // 检查是否有统计数据和赔率数据
  const hasStats = match.stats?._realDataAvailable === true;
  const hasOdds = match.odds?._fetch_status === 'SUCCESS';

  // 🔥 DEBUG: 移动端卡片数据状态
  console.log(`[Odds Debug Mobile] fixture=${match.id}`, {
    hasStats,
    hasOdds,
    hasScore: !!scoreResult,
  });

  const leagueColor = LEAGUE_COLORS[match.league] || LEAGUE_COLORS.默认;

  // 即使无法评分，比赛项仍然应该显示
  const isUnscoreable = !scoreResult || match._unscoreable === true;

  const liveClockTick = useLiveClock(5000);
  const deltaMinutes = Math.floor((liveClockTick * 5) / 60);

  // 评分样式
  const getScoreStyle = () => {
    if (isUnscoreable || !scoreResult) return 'text-text-muted border-border-default';
    if (scoreResult.totalScore >= 80) return 'text-accent-danger border-accent-danger';
    if (scoreResult.totalScore >= 60) return 'text-accent-warning border-accent-warning';
    if (scoreResult.totalScore >= 40) return 'text-accent-success border-accent-success';
    return 'text-text-secondary border-border-default';
  };

  // 时间样式
  const getMinuteStyle = () => {
    if (match.minute >= 90) return 'text-accent-danger font-bold';
    if (match.minute >= 80) return 'text-accent-warning font-bold';
    return 'text-accent-success';
  };

  // 边框样式
  const getBorderStyle = () => {
    if (isUnscoreable || !scoreResult) return 'border-l-2 border-l-border-default';
    if (scoreResult.totalScore >= 80) return 'border-l-4 border-l-accent-danger';
    if (scoreResult.totalScore >= 60) return 'border-l-4 border-l-accent-warning';
    if (scoreResult.isStrongTeamBehind) return 'border-l-4 border-l-accent-primary';
    return 'border-l-2 border-l-border-default';
  };

  return (
    <div
      className={`mobile-card ${getBorderStyle()} ${match.recentEvent === 'goal' ? 'animate-goal-flash' : ''}`}
      onClick={() => navigate(`/match/${match.id}`)}
    >
      {/* 头部：联赛 + 时间 + 评分 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
            style={{ backgroundColor: leagueColor }}
          >
            {match.leagueShort}
          </span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse" />
            <span className={`font-mono text-xs ${getMinuteStyle()}`}>{formatMatchMinute(match, deltaMinutes)}</span>
          </div>
        </div>

        {/* 评分 */}
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${getScoreStyle()}`}>
          {isUnscoreable ? (
            <span className="font-mono text-sm font-bold text-text-muted">N/A</span>
          ) : (
            <>
              <span className="font-mono text-sm font-bold">{scoreResult.totalScore}</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <span
                    key={i}
                    className={`text-[8px] ${
                      i <= scoreResult.stars
                        ? scoreResult.stars >= 4 ? 'text-accent-danger' : 'text-accent-warning'
                        : 'text-text-muted/30'
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 主队 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-text-primary truncate">{match.home.name}</span>
          {(match.home.rank ?? 0) > 0 && (
            <span className="text-[10px] text-text-muted">[{match.home.rank}]</span>
          )}
        </div>
        <span className="font-mono text-lg font-bold text-text-primary ml-2">{match.home.score}</span>
      </div>

      {/* 客队 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-text-primary truncate">{match.away.name}</span>
          {(match.away.rank ?? 0) > 0 && (
            <span className="text-[10px] text-text-muted">[{match.away.rank}]</span>
          )}
        </div>
        <span className="font-mono text-lg font-bold text-text-primary ml-2">{match.away.score}</span>
      </div>

      {/* 底部信息栏 */}
      <div className="flex items-center justify-between pt-2 border-t border-border-default">
        {/* 左侧数据 */}
        <div className="flex items-center gap-3 text-[10px]">
          {/* 让球盘：优先使用当前盘口线，其次回退到球队字段 */}
          <div className="flex items-center gap-1">
            <span className="text-text-muted">让球</span>
            {(() => {
              const handicapValue =
                match.odds?.handicap?.value ??
                match.home.handicap ??
                null;
              const display =
                handicapValue != null
                  ? `${handicapValue > 0 ? '+' : ''}${handicapValue}`
                  : 'N/A';
              const isNegative = (handicapValue ?? 0) < 0;
              return (
                <span
                  className={`font-mono ${
                    isNegative ? 'text-accent-danger' : 'text-accent-success'
                  }`}
                >
                  {display}
                </span>
              );
            })()}
          </div>

          {/* 大小球：优先使用当前盘口线，其次回退到球队字段 */}
          <div className="flex items-center gap-1">
            <span className="text-text-muted">大小</span>
            <span className="font-mono text-text-secondary">
              {match.odds?.overUnder?.total ??
                match.away.overUnder ??
                'N/A'}
            </span>
          </div>

          {/* 角球 */}
          <div className="flex items-center gap-1">
            <span className="text-text-muted">角球</span>
            <span className="font-mono text-text-secondary">{match.corners?.home ?? 0}:{match.corners?.away ?? 0}</span>
          </div>
        </div>

        {/* 右侧操作 */}
        <div className="flex items-center gap-1">
          {/* 强队落后标记 */}
          {scoreResult?.isStrongTeamBehind && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent-danger/20 text-accent-danger text-[10px]">
              <Zap className="w-3 h-3" />
              强队落后
            </span>
          )}

          {/* 关注按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleWatch(match.id); }}
            className={`p-1.5 rounded-lg transition-colors ${
              match.isWatched
                ? 'text-accent-warning bg-accent-warning/10'
                : 'text-text-muted hover:text-accent-warning'
            }`}
          >
            <Star className={`w-4 h-4 ${match.isWatched ? 'fill-current' : ''}`} />
          </button>

          <ChevronRight className="w-4 h-4 text-text-muted" />
        </div>
      </div>

      {/* 最近事件标记 */}
      {match.recentEvent && (
        <div className="absolute top-2 right-2">
          {match.recentEvent === 'goal' && <span className="text-xs">⚽</span>}
          {match.recentEvent === 'red_card' && <span className="text-xs">🟥</span>}
        </div>
      )}
    </div>
  );
}

// 移动端比赛列表 - 使用虚拟滚动优化大列表
import { VirtualList } from '../ui/VirtualList';

interface MobileMatchListProps {
  matches: AdvancedMatch[];
  onToggleWatch: (matchId: number) => void;
}

// 每张卡片的预估高度（根据实际卡片高度调整）
const CARD_HEIGHT = 145;

export function MobileMatchList({ matches, onToggleWatch }: MobileMatchListProps) {
  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="text-5xl mb-4">⚽</div>
        <p className="text-text-secondary text-center">暂无符合条件的比赛</p>
      </div>
    );
  }

  // 小列表直接渲染，大列表使用虚拟滚动
  if (matches.length <= 20) {
    return (
      <div className="p-3 space-y-3">
        {matches.map((match) => (
          <MobileMatchCard key={match.id} match={match} onToggleWatch={onToggleWatch} />
        ))}
      </div>
    );
  }

  return (
    <div className="p-3">
      <VirtualList
        items={matches}
        estimateSize={CARD_HEIGHT}
        height="calc(100vh - 200px)"
        gap={12}
        overscan={5}
        getItemKey={(match) => match.id}
        renderItem={(match) => (
          <MobileMatchCard match={match} onToggleWatch={onToggleWatch} />
        )}
        emptyContent={
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="text-5xl mb-4">⚽</div>
            <p className="text-text-secondary text-center">暂无符合条件的比赛</p>
          </div>
        }
      />
    </div>
  );
}
