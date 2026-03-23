/**
 * Paper Trade 自动扫描 — 独立 Serverless Function
 *
 * 路径: GET /api/pt-scan
 *
 * 独立部署，不走 api/[...path].ts catch-all。
 * 所有情景引擎/复合信号/规则配置均从 lib/vercel-api/scenario-eval-backend 导入，
 * 不依赖 src/（避免 Vercel bundler 无法追踪 src/ 运行时模块的问题）。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getMatches } from '../lib/vercel-api/kv.js';
import type { AdvancedMatch } from '../src/data/advancedMockData';
import {
  getActiveScenarios,
  aggregateScenarioSignals,
  PAPER_TRADE_RULES,
  type ScenarioSignal,
  type PaperTradeRule,
} from '../lib/vercel-api/scenario-eval-backend.js';

function getServiceClient(): SupabaseClient | null {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function buildTradeRow(
  m: AdvancedMatch,
  activeSignals: ScenarioSignal[],
  composite: ReturnType<typeof aggregateScenarioSignals>,
  rule: PaperTradeRule,
) {
  const overLine = m.odds?.overUnder?.total ?? 2.5;
  const overOdds = m.odds?.overUnder?.over ?? null;

  return {
    fixture_id: m.id,
    league: m.leagueShort ?? m.league ?? null,
    home_team: m.home?.name ?? null,
    away_team: m.away?.name ?? null,
    entry_minute: m.minute,
    entry_score_home: m.home?.score ?? 0,
    entry_score_away: m.away?.score ?? 0,
    entry_composite_score: composite.compositeScore,
    entry_action: composite.action,
    entry_scenarios: activeSignals.map(s => ({
      id: s.id, label: s.label, score: s.score, reasons: s.reasons,
    })),
    entry_stats_snapshot: m.stats?._realDataAvailable ? {
      possession: m.stats.possession,
      shots: m.stats.shots,
      shotsOnTarget: m.stats.shotsOnTarget,
      xG: m.stats.xG,
      corners: m.stats.corners ?? m.corners,
      dangerousAttacks: m.stats.dangerousAttacks,
      fouls: m.stats.fouls,
    } : null,
    entry_odds_snapshot: m.odds ? {
      handicap: m.odds.handicap,
      overUnder: m.odds.overUnder,
      matchWinner: m.odds.matchWinner,
      bothTeamsScore: m.odds.bothTeamsScore,
    } : null,
    market_type: rule.marketType,
    market_line: rule.marketType === 'OVER' ? overLine : null,
    entry_odds: rule.marketType === 'OVER' ? overOdds : null,
    stake: rule.stake,
    trigger_rule: rule.id,
    status: 'OPEN',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const supabase = getServiceClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: { code: 'SUPABASE_NOT_CONFIGURED' } });
  }

  const cached = await getMatches();
  if (!cached || cached.matches.length === 0) {
    return res.status(200).json({ success: true, message: 'No live matches in cache', scanned: 0, triggered: 0 });
  }

  const allMatches = cached.matches as AdvancedMatch[];
  const enabledRules = PAPER_TRADE_RULES.filter(r => r.enabled);

  if (enabledRules.length === 0) {
    return res.status(200).json({ success: true, message: 'No enabled rules', scanned: allMatches.length, triggered: 0 });
  }

  const liveStatuses = new Set(['1H', '2H', 'HT', 'live', '1h', '2h', 'ht']);
  const candidates = allMatches.filter(m => liveStatuses.has(m.status) && m.minute >= 70);

  let triggered = 0;
  const trades: Array<{ fixture_id: number; home: string; away: string; rule: string; score: number }> = [];

  for (const m of candidates) {
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

      const cooldownSince = new Date(Date.now() - rule.cooldownMinutes * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from('paper_trades').select('id')
        .eq('fixture_id', m.id).eq('trigger_rule', rule.id)
        .gte('created_at', cooldownSince).limit(1);

      if (existing && existing.length > 0) continue;

      const row = buildTradeRow(m, activeSignals, composite, rule);
      const { error } = await supabase.from('paper_trades').insert(row);

      if (!error) {
        triggered++;
        trades.push({
          fixture_id: m.id, home: m.home?.name ?? '', away: m.away?.name ?? '',
          rule: rule.id, score: composite.compositeScore,
        });
        console.log(`[pt-scan] 模拟下单: ${m.home?.name} vs ${m.away?.name} | ${rule.id} | score=${composite.compositeScore} | ${m.minute}'`);
      }
    }
  }

  return res.status(200).json({ success: true, scanned: allMatches.length, candidates: candidates.length, triggered, trades, cacheAge: cached.cacheAge });
}

export const config = { maxDuration: 30 };
