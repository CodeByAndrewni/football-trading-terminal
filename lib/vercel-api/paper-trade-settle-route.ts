/**
 * Paper Trade 自动结算
 *
 * GET /api/paper-trade/settle — 扫描 OPEN 订单，查 API-Football 最终比分并结算
 *
 * 可通过 cron 定时调用，也可手动触发。
 * 只结算比赛已结束（FT/AET/PEN）的订单。
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getFixturesQuery, getFixtureEvents, type Match, type MatchEvent } from './api-football.js';

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

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

interface SettleResult {
  id: string;
  fixture_id: number;
  status: string;
  pnl: number;
  final_score_home: number;
  final_score_away: number;
  settlement_reason: string;
}

function settleMarket(
  marketType: string,
  marketLine: number | null,
  entryOdds: number | null,
  stake: number,
  finalHome: number,
  finalAway: number,
  entryScoreHome: number,
  entryScoreAway: number,
): { status: string; pnl: number; reason: string } {
  const totalFinal = finalHome + finalAway;
  const odds = entryOdds ?? 1.9;

  if (marketType === 'OVER') {
    const line = marketLine ?? 2.5;
    if (totalFinal > line) {
      const pnl = +(stake * (odds - 1)).toFixed(2);
      return { status: 'WON', pnl, reason: `总进球 ${totalFinal} > ${line}` };
    }
    if (totalFinal === line) {
      return { status: 'PUSH', pnl: 0, reason: `总进球 ${totalFinal} = ${line}（走水）` };
    }
    return { status: 'LOST', pnl: -stake, reason: `总进球 ${totalFinal} ≤ ${line}` };
  }

  if (marketType === 'NEXT_GOAL') {
    const entryTotal = entryScoreHome + entryScoreAway;
    if (totalFinal > entryTotal) {
      const pnl = +(stake * (odds - 1)).toFixed(2);
      return { status: 'WON', pnl, reason: `下单后有进球（${entryTotal} → ${totalFinal}）` };
    }
    return { status: 'LOST', pnl: -stake, reason: `下单后无进球（${entryTotal} → ${totalFinal}）` };
  }

  if (marketType === 'BTTS_YES') {
    if (finalHome >= 1 && finalAway >= 1) {
      const pnl = +(stake * (odds - 1)).toFixed(2);
      return { status: 'WON', pnl, reason: `双方都进球 ${finalHome}-${finalAway}` };
    }
    return { status: 'LOST', pnl: -stake, reason: `非双方进球 ${finalHome}-${finalAway}` };
  }

  return { status: 'VOID', pnl: 0, reason: `未知市场类型 ${marketType}` };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED' },
    });
  }

  // 1. 查 OPEN 订单
  const { data: openTrades, error: fetchErr } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('status', 'OPEN')
    .order('created_at', { ascending: true })
    .limit(100);

  if (fetchErr) {
    return res.status(500).json({ success: false, error: { message: fetchErr.message } });
  }

  if (!openTrades || openTrades.length === 0) {
    return res.status(200).json({ success: true, message: '无 OPEN 订单', settled: [] });
  }

  // 2. 收集需要查询的 fixture IDs（去重）
  const fixtureIds = [...new Set(openTrades.map(t => t.fixture_id as number))];
  let apiCalls = 0;
  const settled: SettleResult[] = [];

  // 3. 逐个查询 fixture 状态
  const fixtureMap = new Map<number, Match>();
  const eventsMap = new Map<number, MatchEvent[]>();

  for (const fid of fixtureIds) {
    try {
      const fixtures = await getFixturesQuery({ id: String(fid) });
      apiCalls++;
      if (fixtures.length > 0) {
        fixtureMap.set(fid, fixtures[0]);

        if (FINISHED_STATUSES.has(fixtures[0].fixture.status.short)) {
          try {
            const events = await getFixtureEvents(fid);
            apiCalls++;
            eventsMap.set(fid, events);
          } catch {
            // events 非必需，失败不阻塞结算
          }
        }
      }
    } catch (err) {
      console.warn(`[paper-trade-settle] Failed to fetch fixture ${fid}:`, err);
    }
  }

  // 4. 结算
  for (const trade of openTrades) {
    const fid = trade.fixture_id as number;
    const fixture = fixtureMap.get(fid);
    if (!fixture) continue;

    const statusShort = fixture.fixture.status.short;
    if (!FINISHED_STATUSES.has(statusShort)) continue;

    const finalHome = fixture.goals.home ?? 0;
    const finalAway = fixture.goals.away ?? 0;

    const { status, pnl, reason } = settleMarket(
      trade.market_type,
      trade.market_line,
      trade.entry_odds,
      trade.stake,
      finalHome,
      finalAway,
      trade.entry_score_home,
      trade.entry_score_away,
    );

    // 收集下单后事件
    const events = eventsMap.get(fid) ?? [];
    const postEntryEvents = events
      .filter((e: MatchEvent) => e.time.elapsed >= (trade.entry_minute as number))
      .map((e: MatchEvent) => ({
        minute: e.time.elapsed,
        type: e.type,
        detail: e.detail,
        player: e.player?.name ?? null,
        team: e.team?.name ?? null,
      }));

    const patch = {
      status,
      pnl,
      final_score_home: finalHome,
      final_score_away: finalAway,
      settled_at: new Date().toISOString(),
      settlement_reason: reason,
      post_entry_events: postEntryEvents.length > 0 ? postEntryEvents : null,
    };

    const { error: updateErr } = await supabase
      .from('paper_trades')
      .update(patch)
      .eq('id', trade.id);

    if (!updateErr) {
      settled.push({
        id: trade.id,
        fixture_id: fid,
        status,
        pnl,
        final_score_home: finalHome,
        final_score_away: finalAway,
        settlement_reason: reason,
      });
    }
  }

  return res.status(200).json({
    success: true,
    openCount: openTrades.length,
    settledCount: settled.length,
    apiCalls,
    settled,
  });
}
