/**
 * 策略监控面板 — 可扩展多策略，实时筛选 + 命中提醒 + 声音
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, ChevronDown, ChevronRight, Volume2 } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import { soundService } from '../../services/soundService';
import { formatLeagueWithCountry } from '../../utils/leagueDisplay';

// ---------------------------------------------------------------------------
// Strategy definition
// ---------------------------------------------------------------------------

export interface StrategyDef {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  /** Return true if the match satisfies this strategy */
  filter: (m: AdvancedMatch) => boolean;
}

// ---------------------------------------------------------------------------
// Built-in strategies
// ---------------------------------------------------------------------------

/**
 * 让球方末段落后
 * - 初始大小球 ≥ 3.5
 * - 让球盘 |value| = 1（即 -1 或 +1）
 * - 上半场至少进 1 球
 * - 下半场双方各进至少 1 球
 * - 75-88 分钟，让球方落后恰好 1 球
 *
 * 数据缺失（无初始盘口等）的比赛自动排除，不报错。
 */
function favoriteTrailingLate(m: AdvancedMatch): boolean {
  const minute = m.minute ?? 0;
  if (minute < 75 || minute > 88) return false;

  const initOU = m.initialOverUnder;
  if (typeof initOU !== 'number' || initOU < 3.5) return false;

  const hdpValue = m.initialHandicap ?? m.odds?.handicap?.value ?? null;
  if (typeof hdpValue !== 'number') return false;
  const absHdp = Math.abs(hdpValue);
  if (absHdp < 0.75 || absHdp > 1.25) return false;

  const ht = m.halftimeScore;
  if (!ht || (ht.home ?? 0) + (ht.away ?? 0) < 1) return false;

  const hTotal = m.home?.score ?? 0;
  const aTotal = m.away?.score ?? 0;
  const hHalf = ht.home ?? 0;
  const aHalf = ht.away ?? 0;
  const h2nd = hTotal - hHalf;
  const a2nd = aTotal - aHalf;
  if (h2nd < 1 || a2nd < 1) return false;

  // hdpValue < 0 → home is favorite; hdpValue > 0 → away is favorite
  const favScore = hdpValue < 0 ? hTotal : aTotal;
  const undScore = hdpValue < 0 ? aTotal : hTotal;
  if (favScore !== undScore - 1) return false;

  return true;
}

/**
 * 红牌比赛
 * 场上任一方出现红牌即命中，不限时间、不限联赛。
 */
function hasRedCard(m: AdvancedMatch): boolean {
  const red = m.cards?.red;
  if (!red) return false;
  return (red.home ?? 0) + (red.away ?? 0) > 0;
}

export const BUILTIN_STRATEGIES: StrategyDef[] = [
  {
    id: 'favorite_trailing_80',
    label: '让球方末段落后',
    emoji: '🎯',
    desc: '初盘O/U≥3.5 · 让球±1 · 半场有球 · 下半场双方各进≥1 · 75-88\'让球方落后1球',
    filter: favoriteTrailingLate,
  },
  {
    id: 'red_card_alert',
    label: '红牌比赛',
    emoji: '🟥',
    desc: '场上任一方出现红牌 — 不限时间、不限联赛',
    filter: hasRedCard,
  },
];

// ---------------------------------------------------------------------------
// Alert tracking — remember which (strategy, matchId) has already fired
// ---------------------------------------------------------------------------

type AlertKey = string; // `${strategyId}:${matchId}`

interface AlertRecord {
  key: AlertKey;
  strategyId: string;
  strategyLabel: string;
  strategyEmoji: string;
  matchId: number;
  homeName: string;
  awayName: string;
  score: string;
  minute: number;
  league: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// Panel props
// ---------------------------------------------------------------------------

interface Props {
  matches: AdvancedMatch[];
  onMatchClick: (id: number) => void;
}

export function StrategyMonitorPanel({ matches, onMatchClick }: Props) {
  const [enabledIds, setEnabledIds] = useState<Set<string>>(
    () => new Set(BUILTIN_STRATEGIES.map((s) => s.id)),
  );
  const [expandedId, setExpandedId] = useState<string | null>(BUILTIN_STRATEGIES[0]?.id ?? null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const firedRef = useRef<Set<AlertKey>>(new Set());
  const [soundOn, setSoundOn] = useState(true);

  const toggle = useCallback((id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Per-strategy hits
  const hitsMap = useMemo(() => {
    const m = new Map<string, AdvancedMatch[]>();
    for (const s of BUILTIN_STRATEGIES) {
      if (!enabledIds.has(s.id)) {
        m.set(s.id, []);
        continue;
      }
      m.set(s.id, matches.filter(s.filter));
    }
    return m;
  }, [matches, enabledIds]);

  // Fire alerts for new hits
  useEffect(() => {
    let hasNew = false;
    for (const s of BUILTIN_STRATEGIES) {
      if (!enabledIds.has(s.id)) continue;
      const hits = hitsMap.get(s.id) ?? [];
      for (const h of hits) {
        const key: AlertKey = `${s.id}:${h.id}`;
        if (firedRef.current.has(key)) continue;
        firedRef.current.add(key);
        hasNew = true;
        const rec: AlertRecord = {
          key,
          strategyId: s.id,
          strategyLabel: s.label,
          strategyEmoji: s.emoji,
          matchId: h.id,
          homeName: h.home?.name ?? '?',
          awayName: h.away?.name ?? '?',
          score: `${h.home?.score ?? 0}-${h.away?.score ?? 0}`,
          minute: h.minute ?? 0,
          league: formatLeagueWithCountry(h),
          ts: Date.now(),
        };
        setAlerts((prev) => [rec, ...prev].slice(0, 50));
      }
    }
    if (hasNew && soundOn) {
      soundService.play('alert');
    }
  }, [hitsMap, enabledIds, soundOn]);

  // Request notification permission once
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const totalHits = useMemo(
    () => Array.from(hitsMap.values()).reduce((a, b) => a + b.length, 0),
    [hitsMap],
  );

  return (
    <div className="h-full flex flex-col text-sm select-text">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-[#222]">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white">策略监控</span>
          {totalHits > 0 && (
            <span className="bg-red-500/90 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none animate-pulse">
              {totalHits}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSoundOn((p) => !p)}
          className={`p-1 rounded transition-colors ${soundOn ? 'text-accent-primary' : 'text-[#555]'}`}
          title={soundOn ? '提醒声音 ON' : '提醒声音 OFF'}
        >
          {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Alert banner */}
      {alerts.length > 0 && (
        <div className="flex-none border-b border-[#222] max-h-[120px] overflow-y-auto">
          {alerts.slice(0, 5).map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onMatchClick(a.matchId)}
              className="w-full text-left px-3 py-1.5 hover:bg-[#1a1a1a] transition-colors border-b border-[#1a1a1a] last:border-b-0"
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <Bell className="w-3 h-3 text-red-400 animate-pulse flex-shrink-0" />
                <span className="text-red-400 font-medium">{a.strategyEmoji} {a.strategyLabel}</span>
                <span className="text-[#666] ml-auto">{new Date(a.ts).toLocaleTimeString().slice(0, 5)}</span>
              </div>
              <div className="text-[11px] text-[#bbb] mt-0.5 truncate">
                {a.league} | {a.homeName} {a.score} {a.awayName} | {a.minute}'
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Strategy cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {BUILTIN_STRATEGIES.map((s) => {
          const hits = hitsMap.get(s.id) ?? [];
          const enabled = enabledIds.has(s.id);
          const expanded = expandedId === s.id;

          return (
            <div
              key={s.id}
              className={`rounded-lg border transition-colors ${
                enabled
                  ? hits.length > 0
                    ? 'border-red-500/40 bg-red-500/5'
                    : 'border-[#333] bg-[#111]'
                  : 'border-[#222] bg-[#0d0d0d] opacity-60'
              }`}
            >
              {/* Card header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  className="flex-shrink-0 text-[#666] hover:text-white"
                >
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                <span className="text-sm">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{s.label}</div>
                </div>
                {hits.length > 0 && (
                  <span className="bg-red-500/90 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {hits.length}
                  </span>
                )}
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${
                    enabled ? 'bg-accent-primary' : 'bg-[#333]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Expanded body */}
              {expanded && (
                <div className="px-3 pb-2">
                  <p className="text-[10px] text-[#777] mb-2 leading-relaxed">{s.desc}</p>
                  {!enabled && (
                    <p className="text-[10px] text-[#555] text-center py-2">已关闭</p>
                  )}
                  {enabled && hits.length === 0 && (
                    <p className="text-[10px] text-[#555] text-center py-2">暂无匹配 — 持续监控中…</p>
                  )}
                  {enabled && hits.length > 0 && (
                    <div className="space-y-1">
                      {hits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => onMatchClick(h.id)}
                          className="w-full text-left px-2.5 py-1.5 rounded bg-[#0d0d0d] hover:bg-[#181818] transition-colors"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-[#888] truncate max-w-[120px]" title={formatLeagueWithCountry(h)}>
                              {formatLeagueWithCountry(h)}
                            </span>
                            <span className="text-accent-primary font-mono">{h.minute}'</span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[#ccc] text-xs truncate flex-1">{h.home?.name}</span>
                            <span className="text-white font-mono text-xs mx-2 font-bold">
                              {h.home?.score ?? 0} - {h.away?.score ?? 0}
                            </span>
                            <span className="text-[#ccc] text-xs truncate flex-1 text-right">{h.away?.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-[#666]">
                            {typeof h.initialOverUnder === 'number' && <span>O/U {h.initialOverUnder}</span>}
                            {typeof h.initialHandicap === 'number' && <span>让球 {h.initialHandicap > 0 ? '+' : ''}{h.initialHandicap}</span>}
                            {h.halftimeScore && <span>HT {h.halftimeScore.home ?? 0}-{h.halftimeScore.away ?? 0}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Placeholder for future strategies */}
        <div className="rounded-lg border border-dashed border-[#333] px-3 py-4 text-center">
          <p className="text-[10px] text-[#555]">更多策略即将加入</p>
        </div>
      </div>
    </div>
  );
}

export default StrategyMonitorPanel;
