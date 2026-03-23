/**
 * Paper Trading API
 *
 * POST   /api/paper-trade          → 创建模拟订单
 * GET    /api/paper-trade?days=7   → 查询订单列表
 * PATCH  /api/paper-trade          → 手动更新（结算/备注）
 * POST   /api/paper-trade/settle   → 批量自动结算 OPEN 订单
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseRequestJsonBody } from './parse-request-json.js';

// ============================================
// Supabase client
// ============================================

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

// ============================================
// Types
// ============================================

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

// ============================================
// POST: 创建模拟订单
// ============================================

async function handlePost(supabase: SupabaseClient, body: Record<string, unknown>, res: VercelResponse) {
  const fixtureId = typeof body.fixture_id === 'number' ? body.fixture_id : null;
  if (!fixtureId) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIXTURE_ID' } });
  }

  // 冷却检查：同 fixture + 同 rule 在 N 分钟内不重复下单
  const triggerRule = typeof body.trigger_rule === 'string' ? body.trigger_rule : 'MANUAL';
  const cooldownMinutes = typeof body.cooldown_minutes === 'number' ? body.cooldown_minutes : 5;
  const cooldownSince = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from('paper_trades')
    .select('id')
    .eq('fixture_id', fixtureId)
    .eq('trigger_rule', triggerRule)
    .gte('created_at', cooldownSince)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.status(409).json({
      success: false,
      error: { code: 'COOLDOWN', message: `同场同规则 ${cooldownMinutes} 分钟内已下单` },
    });
  }

  const row = {
    fixture_id: fixtureId,
    league: typeof body.league === 'string' ? body.league : null,
    home_team: typeof body.home_team === 'string' ? body.home_team : null,
    away_team: typeof body.away_team === 'string' ? body.away_team : null,
    entry_minute: typeof body.entry_minute === 'number' ? body.entry_minute : 0,
    entry_score_home: typeof body.entry_score_home === 'number' ? body.entry_score_home : 0,
    entry_score_away: typeof body.entry_score_away === 'number' ? body.entry_score_away : 0,
    entry_composite_score: typeof body.entry_composite_score === 'number' ? body.entry_composite_score : 0,
    entry_action: typeof body.entry_action === 'string' ? body.entry_action : 'NONE',
    entry_scenarios: body.entry_scenarios ?? [],
    entry_stats_snapshot: body.entry_stats_snapshot ?? null,
    entry_odds_snapshot: body.entry_odds_snapshot ?? null,
    market_type: typeof body.market_type === 'string' ? body.market_type : 'OVER',
    market_line: typeof body.market_line === 'number' ? body.market_line : null,
    entry_odds: typeof body.entry_odds === 'number' ? body.entry_odds : null,
    stake: typeof body.stake === 'number' ? body.stake : 10,
    trigger_rule: triggerRule,
    status: 'OPEN',
  };

  const { data, error } = await supabase
    .from('paper_trades')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }

  return res.status(201).json({ success: true, trade: data });
}

// ============================================
// GET: 查询订单列表
// ============================================

async function handleGet(supabase: SupabaseClient, req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 7));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
  const statusFilter = url.searchParams.get('status') || null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('paper_trades')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }

  const rows = (data ?? []) as PaperTradeRow[];

  // 汇总统计
  const settled = rows.filter(r => r.status !== 'OPEN');
  const won = rows.filter(r => r.status === 'WON');
  const lost = rows.filter(r => r.status === 'LOST');
  const totalPnl = settled.reduce((s, r) => s + (r.pnl ?? 0), 0);
  const totalStake = settled.reduce((s, r) => s + r.stake, 0);

  return res.status(200).json({
    success: true,
    rows,
    stats: {
      total: rows.length,
      open: rows.filter(r => r.status === 'OPEN').length,
      settled: settled.length,
      won: won.length,
      lost: lost.length,
      winRate: settled.length > 0 ? +(won.length / settled.length * 100).toFixed(1) : 0,
      totalPnl: +totalPnl.toFixed(2),
      totalStake: +totalStake.toFixed(2),
      roi: totalStake > 0 ? +(totalPnl / totalStake * 100).toFixed(1) : 0,
    },
  });
}

// ============================================
// PATCH: 手动更新（结算/备注）
// ============================================

async function handlePatch(supabase: SupabaseClient, body: Record<string, unknown>, res: VercelResponse) {
  const id = typeof body.id === 'string' ? body.id : null;
  if (!id) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_ID' } });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.status === 'string') patch.status = body.status;
  if (typeof body.final_score_home === 'number') patch.final_score_home = body.final_score_home;
  if (typeof body.final_score_away === 'number') patch.final_score_away = body.final_score_away;
  if (typeof body.pnl === 'number') patch.pnl = body.pnl;
  if (typeof body.settled_at === 'string') patch.settled_at = body.settled_at;
  if (typeof body.settlement_reason === 'string') patch.settlement_reason = body.settlement_reason;
  if (body.post_entry_events !== undefined) patch.post_entry_events = body.post_entry_events;
  if (typeof body.user_notes === 'string') patch.user_notes = body.user_notes;

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ success: false, error: { code: 'EMPTY_PATCH' } });
  }

  const { data, error } = await supabase
    .from('paper_trades')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }

  return res.status(200).json({ success: true, trade: data });
}

// ============================================
// Handler
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const supabase = getServiceClient();
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: '需要 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' },
    });
  }

  if (req.method === 'GET') return handleGet(supabase, req, res);

  if (req.method === 'POST') {
    const body = (await parseRequestJsonBody(req)) as Record<string, unknown> | null;
    if (!body) return res.status(400).json({ success: false, error: { code: 'INVALID_BODY' } });
    return handlePost(supabase, body, res);
  }

  if (req.method === 'PATCH') {
    const body = (await parseRequestJsonBody(req)) as Record<string, unknown> | null;
    if (!body) return res.status(400).json({ success: false, error: { code: 'INVALID_BODY' } });
    return handlePatch(supabase, body, res);
  }

  return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
}
