import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { parseRequestJsonBody } from './parse-request-json.js';

function getServiceClient() {
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

/**
 * GET /api/ai/journal?days=10&limit=50
 * PATCH /api/ai/journal  body: { id, outcome_status?, final_home?, final_away?, match_ended_at?, ai_review?, user_review_notes? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const supabase = getServiceClient();
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: { code: 'SUPABASE_NOT_CONFIGURED', message: '需要 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY' },
    });
  }

  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://localhost');
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 10));
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('ai_trade_journal')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }

    return res.status(200).json({ success: true, rows: data ?? [] });
  }

  if (req.method === 'PATCH') {
    const body = (await parseRequestJsonBody(req)) as Record<string, unknown> | null;
    const id = typeof body?.id === 'string' ? body.id : null;
    if (!id || !body) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_ID', message: 'id 必填' } });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.outcome_status === 'string') patch.outcome_status = body.outcome_status;
    if (typeof body.final_home === 'number') patch.final_home = body.final_home;
    if (typeof body.final_away === 'number') patch.final_away = body.final_away;
    if (typeof body.match_ended_at === 'string') patch.match_ended_at = body.match_ended_at;
    if (typeof body.ai_review === 'string') patch.ai_review = body.ai_review;
    if (typeof body.user_review_notes === 'string') patch.user_review_notes = body.user_review_notes;

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, error: { code: 'EMPTY_PATCH', message: '无可更新字段' } });
    }

    const { data, error } = await supabase
      .from('ai_trade_journal')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }

    return res.status(200).json({ success: true, row: data });
  }

  return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
}
