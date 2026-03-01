/**
 * ============================================
 * 比赛时间轴组件 - 显示比赛事件
 * 支持事件类型: 进球⚽、换人↔、黄牌▪、红牌▪
 * 注意: 角球不在时间轴显示（API不支持角球时刻）
 * Version: 147 - 移除随机模拟，添加比分显示
 * ============================================
 */

import { useMemo } from "react";
import type { AdvancedMatch } from "../../data/advancedMockData";

interface MatchTimelineProps {
  match: AdvancedMatch;
  className?: string;
}

interface TimelineEvent {
  minute: number;
  type: "goal" | "sub" | "yellow" | "red";
  team: "home" | "away";
  detail?: string;
}

export function MatchTimeline({ match, className = "" }: MatchTimelineProps) {
  const currentMinute = match.minute;
  const status = match.status?.toLowerCase?.() ?? match.status;
  const isHalfTime = status === "ht";
  const isNotStarted = status === "ns" || status === "未开始";
  const isFinished = status === "ft" || status === "aet" || status === "pen";

  // 解析比赛事件 - 只使用真实事件数据
  const events = useMemo((): TimelineEvent[] => {
    const eventList: TimelineEvent[] = [];

    // 从 match.events 解析（如果有）
    if (match.events && Array.isArray(match.events)) {
      for (const event of match.events) {
        const minute = event.time?.elapsed ?? event.minute ?? 0;
        const isHome =
          event.team?.id === match.homeTeamId ||
          event.team?.name === match.home?.name ||
          event.teamSide === "home";

        let type: TimelineEvent["type"] | null = null;
        if (event.type === "Goal" || event.type === "goal") {
          type = "goal";
        } else if (event.type === "subst" || event.type === "Substitution") {
          type = "sub";
        } else if (event.type === "Card" || event.type === "card") {
          if (
            event.detail?.toLowerCase().includes("red") ||
            event.detail === "红牌"
          ) {
            type = "red";
          } else {
            type = "yellow";
          }
        }

        if (type) {
          eventList.push({
            minute,
            type,
            team: isHome ? "home" : "away",
            detail: event.detail,
          });
        }
      }
    }

    // 不再随机模拟进球位置 - 只显示真实事件

    return eventList.sort((a, b) => a.minute - b.minute);
  }, [match]);

  // 计算进度百分比
  const progressPercent = useMemo(() => {
    if (isNotStarted) return 0;
    if (isFinished) return 100;
    if (isHalfTime) return 50;
    return Math.min((currentMinute / 90) * 100, 100);
  }, [currentMinute, isNotStarted, isFinished, isHalfTime]);

  // 获取开赛时间显示
  const kickoffTime = useMemo(() => {
    if (!isNotStarted) return null;
    const date = match.kickoffTime || match.startTime;
    if (!date) return null;

    try {
      const d = new Date(date);
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      return `${hours}:${mins}`;
    } catch {
      return null;
    }
  }, [match, isNotStarted]);

  // 渲染事件图标
  const renderEventIcon = (event: TimelineEvent, idx: number) => {
    const baseClass = "text-[9px] transform -translate-x-1/2";
    const positionStyle = {
      left: `${Math.min((event.minute / 90) * 100, 98)}%`,
    };

    switch (event.type) {
      case "goal":
        return (
          <span
            key={`${event.team}-${event.type}-${event.minute}-${idx}`}
            className={`${baseClass} absolute ${event.team === "home" ? "text-[#00ff88]" : "text-[#ff6b6b]"}`}
            style={positionStyle}
            title={`${event.minute}' 进球`}
          >
            ⚽
          </span>
        );
      case "sub":
        return (
          <span
            key={`${event.team}-${event.type}-${event.minute}-${idx}`}
            className={`${baseClass} absolute text-[#00d4ff] text-[8px]`}
            style={positionStyle}
            title={`${event.minute}' 换人`}
          >
            ↔
          </span>
        );
      case "yellow":
        return (
          <span
            key={`${event.team}-${event.type}-${event.minute}-${idx}`}
            className={`${baseClass} absolute text-[#ffdd00] text-[8px]`}
            style={positionStyle}
            title={`${event.minute}' 黄牌`}
          >
            ▪
          </span>
        );
      case "red":
        return (
          <span
            key={`${event.team}-${event.type}-${event.minute}-${idx}`}
            className={`${baseClass} absolute text-[#ff4444]`}
            style={positionStyle}
            title={`${event.minute}' 红牌`}
          >
            ▪
          </span>
        );
      default:
        return null;
    }
  };

  const homeEvents = events.filter((e) => e.team === "home");
  const awayEvents = events.filter((e) => e.team === "away");

  // 当前比分
  const homeScore = match.home?.score ?? 0;
  const awayScore = match.away?.score ?? 0;
  const hasEvents = events.length > 0;
  const hasGoals = homeScore > 0 || awayScore > 0;

  return (
    <div
      className={`relative h-8 bg-[#1a1a1a] rounded overflow-hidden ${className}`}
    >
      {/* 进度条 */}
      <div
        className={`absolute left-0 top-0 h-full transition-all duration-300 ${
          isHalfTime
            ? "bg-gradient-to-r from-[#2a2a0a] to-[#3d3d0d]"
            : isFinished
              ? "bg-gradient-to-r from-[#1a1a2a] to-[#1a1a2a]"
              : "bg-gradient-to-r from-[#0a2a1a] to-[#0d3d1d]"
        }`}
        style={{ width: `${progressPercent}%` }}
      />

      {/* 中场线 */}
      <div className="absolute left-1/2 top-0 h-full w-px bg-[#444]" />

      {/* 中场休息标签 */}
      {isHalfTime && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#333] text-[#888] px-1 py-0.5 rounded text-[9px] z-10">
          HT
        </div>
      )}

      {/* 未开始显示开赛时间 */}
      {isNotStarted && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#666] text-[11px] whitespace-nowrap">
          {kickoffTime || "待定"}
        </div>
      )}

      {/* 进行中：显示事件或比分 */}
      {!isNotStarted && !isHalfTime && !isFinished && (
        <>
          {/* 主队事件（上方） */}
          <div className="absolute left-0 top-0.5 w-full h-3.5 flex items-center">
            {homeEvents.map(renderEventIcon)}
          </div>

          {/* 客队事件（下方） */}
          <div className="absolute left-0 bottom-0.5 w-full h-3.5 flex items-center">
            {awayEvents.map(renderEventIcon)}
          </div>

          {/* 当没有事件数据时，显示比分 */}
          {!hasEvents && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              {hasGoals ? (
                <span className="text-[11px] font-mono font-medium text-[#aaa]">
                  {homeScore}-{awayScore}
                </span>
              ) : (
                <span className="text-[10px] text-[#555]">0-0</span>
              )}
            </div>
          )}
        </>
      )}

      {/* 已结束 */}
      {isFinished && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <span className="text-[11px] font-mono font-medium text-[#888]">
            {homeScore}-{awayScore} 完
          </span>
        </div>
      )}
    </div>
  );
}
