import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdvancedMatch } from '../../src/data/advancedMockData';
import type { AiChatContext } from '../../src/services/aiContext.js';

export type AiTradeJournalRow = {
  id: string;
  created_at: string;
  fixture_id: number | null;
  related_fixture_ids: number[] | null;
  league_short: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  minute_at_judgment: number | null;
  score_home: number | null;
  score_away: number | null;
  user_message: string;
  assistant_message: string;
  context_snapshot: Record<string, unknown> | null;
  outcome_status: string;
  final_home: number | null;
  final_away: number | null;
  match_ended_at: string | null;
  ai_review: string | null;
  user_review_notes: string | null;
  meta: Record<string, unknown> | null;
};

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

export function isAiJournalPersistenceConfigured(): boolean {
  return getServiceClient() !== null;
}

/**
 * 拉取近期判断记录，注入模型上下文（按时间倒序取最近 N 条，再按时间正序拼进 prompt）
 */
/** 注入 prompt 时压缩 token，保留复盘关键字段 */
export function compactJournalForPrompt(rows: AiTradeJournalRow[]): unknown[] {
  return rows.map((r) => ({
    id: r.id,
    at: r.created_at,
    fixture_id: r.fixture_id,
    match:
      r.home_team_name && r.away_team_name ? `${r.home_team_name} vs ${r.away_team_name}` : null,
    minute_at_judgment: r.minute_at_judgment,
    score_at_judgment:
      r.score_home != null && r.score_away != null ? `${r.score_home}-${r.score_away}` : null,
    user: r.user_message,
    assistant:
      r.assistant_message.length > 1200
        ? `${r.assistant_message.slice(0, 1200)}…`
        : r.assistant_message,
    outcome: r.outcome_status,
    final:
      r.final_home != null && r.final_away != null
        ? `${r.final_home}-${r.final_away}`
        : null,
    ai_review: r.ai_review,
  }));
}

export async function fetchJournalForPrompt(params: {
  days: number;
  limit: number;
}): Promise<AiTradeJournalRow[]> {
  const supabase = getServiceClient();
  if (!supabase) return [];

  const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('ai_trade_journal')
    .select(
      'id, created_at, fixture_id, related_fixture_ids, league_short, home_team_name, away_team_name, minute_at_judgment, score_home, score_away, user_message, assistant_message, outcome_status, final_home, final_away, match_ended_at, ai_review, user_review_notes, meta',
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(params.limit);

  if (error) {
    console.warn('[ai_trade_journal] fetch failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as AiTradeJournalRow[];
  return rows.slice().reverse();
}

export async function insertAiTradeJournal(args: {
  message: string;
  answer: string;
  selected: AdvancedMatch[];
  context: AiChatContext;
  mode: string;
  agentMeta?: { toolRounds: number; footballCallsUsed: number; maxFootballCalls: number };
}): Promise<string | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const primary = args.selected[0];
  const related = args.selected.map((m) => m.id).filter((id) => typeof id === 'number');

  const snapshot = {
    mode: args.mode,
    topN: args.context.topN,
    generatedAt: args.context.generatedAt,
    cacheAgeSeconds: args.context.meta?.cacheAgeSeconds ?? null,
    matchIds: related,
    agent: args.agentMeta ?? null,
  };

  const row = {
    fixture_id: primary?.id ?? null,
    related_fixture_ids: related.length > 0 ? related : [],
    league_short: primary?.leagueShort ?? null,
    home_team_name: primary?.home?.name ?? null,
    away_team_name: primary?.away?.name ?? null,
    minute_at_judgment: typeof primary?.minute === 'number' ? primary.minute : null,
    score_home: typeof primary?.home?.score === 'number' ? primary.home.score : null,
    score_away: typeof primary?.away?.score === 'number' ? primary.away.score : null,
    user_message: args.message,
    assistant_message: args.answer,
    context_snapshot: snapshot,
    outcome_status: 'pending',
    meta: { mode: args.mode },
  };

  const { data, error } = await supabase.from('ai_trade_journal').insert(row).select('id').single();

  if (error) {
    console.warn('[ai_trade_journal] insert failed:', error.message);
    return null;
  }

  return typeof data?.id === 'string' ? data.id : null;
}

/** Agent：无预聚合 selected 时写入（fixture 未知） */
export async function insertAiTradeJournalAgent(args: {
  message: string;
  answer: string;
  agentMeta: { toolRounds: number; footballCallsUsed: number; maxFootballCalls: number };
}): Promise<string | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const row = {
    fixture_id: null,
    related_fixture_ids: [],
    user_message: args.message,
    assistant_message: args.answer,
    context_snapshot: { agent: true, ...args.agentMeta },
    outcome_status: 'pending',
    meta: { mode: 'AGENT' },
  };

  const { data, error } = await supabase.from('ai_trade_journal').insert(row).select('id').single();

  if (error) {
    console.warn('[ai_trade_journal] insert (agent) failed:', error.message);
    return null;
  }

  return typeof data?.id === 'string' ? data.id : null;
}
