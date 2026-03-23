/**
 * Paper Trading 前端 Hook
 *
 * 1. usePaperTradeMonitor — 挂在首页，轮询时自动检测并下单
 * 2. usePaperTrades       — 查询订单列表 + 统计
 * 3. usePaperTradeSettle  — 手动触发结算
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdvancedMatch } from '../data/advancedMockData';
import type { ScenarioSignal } from '../services/modules/scenarioEngine';
import { getActiveScenarios } from '../services/modules/scenarioEngine';
import { aggregateScenarioSignals, type CompositeSignal } from '../services/compositeSignal';
import { PAPER_TRADE_RULES, isPaperTradeEnabled, type PaperTradeRule } from '../config/paperTradeConfig';
import { formatLeagueWithCountry } from '../utils/leagueDisplay';

// ============================================
// Types
// ============================================

export interface PaperTradeEntry {
  fixture_id: number;
  league: string;
  home_team: string;
  away_team: string;
  entry_minute: number;
  entry_score_home: number;
  entry_score_away: number;
  entry_composite_score: number;
  entry_action: string;
  entry_scenarios: Array<{
    id: string;
    label: string;
    score: number;
    reasons: string[];
  }>;
  entry_stats_snapshot: Record<string, unknown> | null;
  entry_odds_snapshot: Record<string, unknown> | null;
  market_type: string;
  market_line: number | null;
  entry_odds: number | null;
  stake: number;
  trigger_rule: string;
  cooldown_minutes: number;
}

export interface PaperTradeRow {
  id: string;
  created_at: string;
  fixture_id: number;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  entry_minute: number;
  entry_score_home: number;
  entry_score_away: number;
  entry_composite_score: number;
  entry_action: string;
  entry_scenarios: unknown;
  entry_stats_snapshot: unknown;
  entry_odds_snapshot: unknown;
  market_type: string;
  market_line: number | null;
  entry_odds: number | null;
  stake: number;
  trigger_rule: string;
  status: string;
  final_score_home: number | null;
  final_score_away: number | null;
  settled_at: string | null;
  pnl: number | null;
  settlement_reason: string | null;
  post_entry_events: unknown;
  user_notes: string | null;
}

export interface PaperTradeStats {
  total: number;
  open: number;
  settled: number;
  won: number;
  lost: number;
  winRate: number;
  totalPnl: number;
  totalStake: number;
  roi: number;
}

// ============================================
// API helpers
// ============================================

const API_BASE = '/api/paper-trade';

async function postTrade(entry: PaperTradeEntry): Promise<{ success: boolean; trade?: PaperTradeRow; error?: { code: string; message?: string } }> {
  const resp = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  return resp.json();
}

async function fetchTrades(days: number): Promise<{ rows: PaperTradeRow[]; stats: PaperTradeStats }> {
  const resp = await fetch(`${API_BASE}?days=${days}`);
  const data = await resp.json();
  return { rows: data.rows ?? [], stats: data.stats ?? {} };
}

async function triggerSettle(): Promise<{ settledCount: number; settled: unknown[] }> {
  const resp = await fetch(`${API_BASE}/settle`);
  return resp.json();
}

// ============================================
// 快照构建
// ============================================

function buildStatsSnapshot(m: AdvancedMatch): Record<string, unknown> | null {
  if (!m.stats?._realDataAvailable) return null;
  return {
    possession: m.stats.possession,
    shots: m.stats.shots,
    shotsOnTarget: m.stats.shotsOnTarget,
    xG: m.stats.xG,
    corners: m.stats.corners ?? m.corners,
    dangerousAttacks: m.stats.dangerousAttacks,
    fouls: m.stats.fouls,
  };
}

function buildOddsSnapshot(m: AdvancedMatch): Record<string, unknown> | null {
  if (!m.odds) return null;
  return {
    handicap: m.odds.handicap,
    overUnder: m.odds.overUnder,
    matchWinner: m.odds.matchWinner,
    bothTeamsScore: m.odds.bothTeamsScore,
  };
}

function buildEntry(
  m: AdvancedMatch,
  composite: CompositeSignal,
  activeSignals: ScenarioSignal[],
  rule: PaperTradeRule,
): PaperTradeEntry {
  const overLine = m.odds?.overUnder?.total ?? 2.5;
  const overOdds = m.odds?.overUnder?.over ?? null;

  return {
    fixture_id: m.id,
    league: formatLeagueWithCountry(m),
    home_team: m.home?.name ?? '',
    away_team: m.away?.name ?? '',
    entry_minute: m.minute,
    entry_score_home: m.home?.score ?? 0,
    entry_score_away: m.away?.score ?? 0,
    entry_composite_score: composite.compositeScore,
    entry_action: composite.action,
    entry_scenarios: activeSignals.map(s => ({
      id: s.id,
      label: s.label,
      score: s.score,
      reasons: s.reasons,
    })),
    entry_stats_snapshot: buildStatsSnapshot(m),
    entry_odds_snapshot: buildOddsSnapshot(m),
    market_type: rule.marketType,
    market_line: rule.marketType === 'OVER' ? overLine : null,
    entry_odds: rule.marketType === 'OVER' ? overOdds : null,
    stake: rule.stake,
    trigger_rule: rule.id,
    cooldown_minutes: rule.cooldownMinutes,
  };
}

// ============================================
// usePaperTradeMonitor
// ============================================

export interface PaperTradeEvent {
  match: AdvancedMatch;
  rule: PaperTradeRule;
  composite: CompositeSignal;
  timestamp: number;
}

/**
 * 挂在首页，每次 matches 刷新时扫描是否触发模拟下单。
 * 返回最近触发的事件列表，供 UI 展示 toast / badge。
 */
export function usePaperTradeMonitor(matches: AdvancedMatch[]) {
  const [recentEvents, setRecentEvents] = useState<PaperTradeEvent[]>([]);
  const [totalTriggered, setTotalTriggered] = useState(0);
  const pendingRef = useRef(new Set<string>());

  const evaluate = useCallback(async () => {
    if (!isPaperTradeEnabled()) return;
    if (!matches || matches.length === 0) return;

    const enabledRules = PAPER_TRADE_RULES.filter(r => r.enabled);
    if (enabledRules.length === 0) return;

    const liveMatches = matches.filter(m =>
      ['1H', '2H', 'HT', 'live'].includes(m.status) && m.minute >= 70
    );

    for (const m of liveMatches) {
      const activeSignals = getActiveScenarios(m);
      if (activeSignals.length === 0) continue;

      const composite = aggregateScenarioSignals(activeSignals, m);

      for (const rule of enabledRules) {
        if (composite.compositeScore < rule.minCompositeScore) continue;
        if (composite.activeCount < rule.minActiveScenarios) continue;
        if (m.minute < rule.minuteRange[0] || m.minute > rule.minuteRange[1]) continue;

        if (rule.requiredScenarios && rule.requiredScenarios.length > 0) {
          const activeIds = new Set(activeSignals.map(s => s.id));
          if (!rule.requiredScenarios.some(sid => activeIds.has(sid))) continue;
        }

        const dedupKey = `${m.id}_${rule.id}`;
        if (pendingRef.current.has(dedupKey)) continue;
        pendingRef.current.add(dedupKey);

        const entry = buildEntry(m, composite, activeSignals, rule);

        try {
          const result = await postTrade(entry);
          if (result.success) {
            const event: PaperTradeEvent = {
              match: m,
              rule,
              composite,
              timestamp: Date.now(),
            };
            setRecentEvents(prev => [event, ...prev].slice(0, 20));
            setTotalTriggered(prev => prev + 1);
            console.log(
              `[PaperTrade] 模拟下单: ${m.home?.name} vs ${m.away?.name} | ` +
              `${rule.id} | score=${composite.compositeScore} | ${m.minute}'`
            );
          } else if (result.error?.code === 'COOLDOWN') {
            // 冷却中，静默跳过
          } else {
            console.warn('[PaperTrade] 下单失败:', result.error);
          }
        } catch (err) {
          console.warn('[PaperTrade] 网络错误:', err);
        } finally {
          setTimeout(() => pendingRef.current.delete(dedupKey), 60_000);
        }
      }
    }
  }, [matches]);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  return { recentEvents, totalTriggered };
}

// ============================================
// usePaperTrades — 查询列表
// ============================================

export function usePaperTrades(days = 7) {
  return useQuery({
    queryKey: ['paper-trades', days],
    queryFn: () => fetchTrades(days),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ============================================
// usePaperTradeSettle — 手动触发结算
// ============================================

export function usePaperTradeSettle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: triggerSettle,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paper-trades'] });
    },
  });
}
