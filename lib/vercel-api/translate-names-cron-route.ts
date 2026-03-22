/**
 * GET /api/cron/translate-names?window=today|tomorrow
 *
 * 按北京时间预热译名：拉取当日或次日全球赛程，对 KV 中缺失的球队/联赛调用 Perplexity。
 * - 与 /api/matches 直播刷新解耦，不写入 matches:live
 * - 成本：每跑 1 次 ≈ 1～N 次 API-Football（按分页）+ Perplexity 批次数；Vercel 仅多 2 次/天 Cron 调用
 *
 * Vercel Cron（UTC）：
 * - 北京时间 06:00 → 0 22 * * *  → window=today
 * - 北京时间 00:00 → 0 16 * * *  → window=tomorrow
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFixturesByDate } from './api-football.js';
import {
  invalidateNameTranslatorLoadFlag,
  loadNameCache,
  collectUntranslatedTeams,
  collectUntranslatedLeagues,
  translatePendingTeams,
  translatePendingLeagues,
} from './name-translator.js';

const TZ = 'Asia/Shanghai';
const RUN_BUDGET_MS = 165_000;

function verifyCron(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization;
  return auth === `Bearer ${secret}`;
}

function shanghaiCalendarDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** YYYY-MM-DD 日历日 + dayDelta（纯日期算术，用于上海日历） */
function addCalendarDays(dateStr: string, dayDelta: number): string {
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
  const u = Date.UTC(y, m - 1, d + dayDelta);
  const dt = new Date(u);
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(dt.getUTCDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (!verifyCron(req)) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }

  if (!process.env.FOOTBALL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'FOOTBALL_API_KEY missing' });
  }

  const window = (req.query.window as string) || 'today';
  if (window !== 'today' && window !== 'tomorrow') {
    return res.status(400).json({ ok: false, error: 'query window must be today or tomorrow' });
  }

  const now = new Date();
  const todaySh = shanghaiCalendarDate(now);
  const targetDate = window === 'today' ? todaySh : addCalendarDays(todaySh, 1);

  const deadlineMs = Date.now() + RUN_BUDGET_MS;

  try {
    invalidateNameTranslatorLoadFlag();
    await loadNameCache();

    const fixtures = await getFixturesByDate(targetDate);
    const pendingTeams = collectUntranslatedTeams(fixtures as any);
    const pendingLeagues = collectUntranslatedLeagues(fixtures as any);

    console.log(
      `[TranslateNamesCron] date=${targetDate} window=${window} fixtures=${fixtures.length} pendingTeams=${pendingTeams.length} pendingLeagues=${pendingLeagues.length}`,
    );

    const teamResult = await translatePendingTeams(pendingTeams, {
      persistEachBatch: true,
      deadlineMs,
    });

    let leagueTranslated = 0;
    if (Date.now() < deadlineMs && pendingLeagues.length > 0) {
      leagueTranslated = await translatePendingLeagues(pendingLeagues);
    }

    return res.status(200).json({
      ok: true,
      window,
      targetDate,
      fixtures: fixtures.length,
      pendingTeams: pendingTeams.length,
      teamsTranslated: teamResult.translated,
      teamsSkippedByDeadline: teamResult.skippedByDeadline,
      pendingLeagues: pendingLeagues.length,
      leaguesTranslated: leagueTranslated,
    });
  } catch (e) {
    console.error('[TranslateNamesCron]', e);
    return res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : 'unknown_error',
    });
  }
}
