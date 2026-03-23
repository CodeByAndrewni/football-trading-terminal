/**
 * 策略监控面板 — 20 情景引擎驱动，按三大类分组，实时命中提醒 + 声音
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, ChevronDown, ChevronRight, Volume2 } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import { soundService } from '../../services/soundService';
import { formatLeagueWithCountry } from '../../utils/leagueDisplay';
import { getActiveScenarios, type ScenarioSignal } from '../../services/modules/scenarioEngine';
import { SCENARIO_META, type ScenarioId, type ScenarioCategory } from '../../config/scenarioConfig';

// ---------------------------------------------------------------------------
// Legacy exports for backward-compat (MatchTableV2 still imports these)
// ---------------------------------------------------------------------------

export interface StrategyDef {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  filter: (m: AdvancedMatch) => boolean;
}

export const BUILTIN_STRATEGIES: StrategyDef[] = Object.values(SCENARIO_META).map(meta => ({
  id: meta.id,
  label: meta.label,
  emoji: meta.emoji,
  desc: meta.desc,
  filter: (m: AdvancedMatch) => {
    const signals = getActiveScenarios(m);
    return signals.some(s => s.id === meta.id);
  },
}));

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type AlertKey = string;

interface AlertRecord {
  key: AlertKey;
  scenarioId: ScenarioId;
  scenarioLabel: string;
  scenarioEmoji: string;
  matchId: number;
  homeName: string;
  awayName: string;
  score: string;
  minute: number;
  league: string;
  signalScore: number;
  ts: number;
}

const CATEGORY_LABELS: Record<ScenarioCategory, { label: string; emoji: string }> = {
  match_state: { label: '比赛状态', emoji: '⚽' },
  momentum: { label: '场面/体能', emoji: '💪' },
  price_psychology: { label: '补时/心理/价格', emoji: '💰' },
};

const CATEGORY_ORDER: ScenarioCategory[] = ['match_state', 'momentum', 'price_psychology'];

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface Props {
  matches: AdvancedMatch[];
  onMatchClick: (id: number) => void;
}

export function StrategyMonitorPanel({ matches, onMatchClick }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<ScenarioCategory | null>('match_state');
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const firedRef = useRef<Set<AlertKey>>(new Set());
  const [soundOn, setSoundOn] = useState(true);

  // Per-scenario hits across all matches
  const { hitsByScenario, hitsByCategory, totalHits } = useMemo(() => {
    const byScenario = new Map<ScenarioId, Array<{ match: AdvancedMatch; signal: ScenarioSignal }>>();
    const byCategory: Record<ScenarioCategory, number> = { match_state: 0, momentum: 0, price_psychology: 0 };
    let total = 0;

    for (const m of matches) {
      const active = getActiveScenarios(m);
      for (const sig of active) {
        const list = byScenario.get(sig.id) ?? [];
        list.push({ match: m, signal: sig });
        byScenario.set(sig.id, list);
        byCategory[sig.category]++;
        total++;
      }
    }

    return { hitsByScenario: byScenario, hitsByCategory: byCategory, totalHits: total };
  }, [matches]);

  // Fire alerts for new hits
  useEffect(() => {
    let hasNew = false;
    for (const [scenarioId, hits] of hitsByScenario) {
      for (const { match: h, signal: sig } of hits) {
        const key: AlertKey = `${scenarioId}:${h.id}`;
        if (firedRef.current.has(key)) continue;
        firedRef.current.add(key);
        hasNew = true;
        const rec: AlertRecord = {
          key,
          scenarioId,
          scenarioLabel: sig.label,
          scenarioEmoji: sig.emoji,
          matchId: h.id,
          homeName: h.home?.name ?? '?',
          awayName: h.away?.name ?? '?',
          score: `${h.home?.score ?? 0}-${h.away?.score ?? 0}`,
          minute: h.minute ?? 0,
          league: formatLeagueWithCountry(h),
          signalScore: sig.score,
          ts: Date.now(),
        };
        setAlerts(prev => [rec, ...prev].slice(0, 50));
      }
    }
    if (hasNew && soundOn) {
      soundService.play('alert');
    }
  }, [hitsByScenario, soundOn]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <div className="h-full flex flex-col text-sm select-text">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-[#222]">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white">情景监控</span>
          <span className="text-[10px] text-[#666]">20 策略</span>
          {totalHits > 0 && (
            <span className="bg-red-500/90 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none animate-pulse">
              {totalHits}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSoundOn(p => !p)}
          className={`p-1 rounded transition-colors ${soundOn ? 'text-accent-primary' : 'text-[#555]'}`}
          title={soundOn ? '提醒声音 ON' : '提醒声音 OFF'}
        >
          {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Alert banner */}
      {alerts.length > 0 && (
        <div className="flex-none border-b border-[#222] max-h-[120px] overflow-y-auto">
          {alerts.slice(0, 5).map(a => (
            <button
              key={a.key}
              type="button"
              onClick={() => onMatchClick(a.matchId)}
              className="w-full text-left px-3 py-1.5 hover:bg-[#1a1a1a] transition-colors border-b border-[#1a1a1a] last:border-b-0"
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <Bell className="w-3 h-3 text-red-400 animate-pulse flex-shrink-0" />
                <span className="text-red-400 font-medium">{a.scenarioEmoji} {a.scenarioLabel}</span>
                <span className="text-[#888] font-mono">{a.signalScore}分</span>
                <span className="text-[#666] ml-auto">{new Date(a.ts).toLocaleTimeString().slice(0, 5)}</span>
              </div>
              <div className="text-[11px] text-[#bbb] mt-0.5 truncate">
                {a.league} | {a.homeName} {a.score} {a.awayName} | {a.minute}'
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Category groups */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {CATEGORY_ORDER.map(cat => {
          const catMeta = CATEGORY_LABELS[cat];
          const catHits = hitsByCategory[cat];
          const expanded = expandedCategory === cat;
          const scenarioIds = (Object.values(SCENARIO_META) as typeof SCENARIO_META[ScenarioId][])
            .filter(m => m.category === cat)
            .map(m => m.id);

          return (
            <div
              key={cat}
              className={`rounded-lg border transition-colors ${
                catHits > 0
                  ? 'border-red-500/40 bg-red-500/5'
                  : 'border-[#333] bg-[#111]'
              }`}
            >
              {/* Category header */}
              <button
                type="button"
                onClick={() => setExpandedCategory(expanded ? null : cat)}
                className="w-full flex items-center gap-2 px-3 py-2"
              >
                <span className="flex-shrink-0 text-[#666]">
                  {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </span>
                <span className="text-sm">{catMeta.emoji}</span>
                <span className="text-xs font-medium text-white">{catMeta.label}</span>
                <span className="text-[10px] text-[#666]">{scenarioIds.length} 个情景</span>
                {catHits > 0 && (
                  <span className="ml-auto bg-red-500/90 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {catHits}
                  </span>
                )}
              </button>

              {/* Expanded scenarios */}
              {expanded && (
                <div className="px-2 pb-2 space-y-1">
                  {scenarioIds.map(sid => {
                    const meta = SCENARIO_META[sid];
                    const hits = hitsByScenario.get(sid) ?? [];

                    return (
                      <div
                        key={sid}
                        className={`rounded border px-2.5 py-1.5 ${
                          hits.length > 0
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-[#222] bg-[#0d0d0d]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px]">{meta.emoji}</span>
                          <span className="text-[11px] font-medium text-[#ccc] flex-1">{meta.label}</span>
                          {hits.length > 0 && (
                            <span className="bg-amber-500/80 text-white text-[9px] font-bold rounded-full px-1 py-0.5 leading-none">
                              {hits.length}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-[#666] mt-0.5 leading-relaxed">{meta.desc}</p>

                        {/* Hit matches */}
                        {hits.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {hits.map(({ match: h, signal: sig }) => (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => onMatchClick(h.id)}
                                className="w-full text-left px-2 py-1 rounded bg-[#0d0d0d] hover:bg-[#181818] transition-colors"
                              >
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-[#888] truncate max-w-[100px]">{formatLeagueWithCountry(h)}</span>
                                  <span className="text-accent-primary font-mono">{h.minute}' · {sig.score}分</span>
                                </div>
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-[#ccc] text-[11px] truncate flex-1">{h.home?.name}</span>
                                  <span className="text-white font-mono text-[11px] mx-2 font-bold">
                                    {h.home?.score ?? 0}-{h.away?.score ?? 0}
                                  </span>
                                  <span className="text-[#ccc] text-[11px] truncate flex-1 text-right">{h.away?.name}</span>
                                </div>
                                {sig.reasons.length > 0 && (
                                  <div className="text-[9px] text-[#666] mt-0.5 truncate">
                                    {sig.reasons.slice(0, 3).join(' · ')}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StrategyMonitorPanel;
