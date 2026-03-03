import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/supabase-heartbeat
 *
 * 目的：防止 Supabase 免费项目因长时间无访问被自动 Pause。
 * 实现：定期由 Vercel Cron 调用，执行一次极轻量的查询。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 通过环境变量控制是否启用心跳（避免生产环境或升级到 Pro 后继续打心跳）
  if (process.env.ENABLE_SUPABASE_HEARTBEAT !== 'true') {
    return res.status(200).json({ ok: true, skipped: true, reason: 'heartbeat_disabled' });
  }

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  if (!url || !serviceKey) {
    console.warn('[Supabase Heartbeat] SUPABASE_URL 或 SERVICE_ROLE_KEY 未配置，跳过心跳。');
    return res.status(200).json({ ok: false, skipped: true, reason: 'supabase_not_configured' });
  }

  try {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    // 轻量查询：对一个小表执行 count(*) 头部请求（例如 teams 表）
    const { count, error } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error('[Supabase Heartbeat] Query error:', error);
      return res.status(200).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, count: count ?? 0 });
  } catch (err) {
    console.error('[Supabase Heartbeat] Unexpected error:', err);
    return res.status(200).json({ ok: false, error: 'unexpected_error' });
  }
}

