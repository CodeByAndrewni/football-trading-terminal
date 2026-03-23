/**
 * /api/data-audit — 诊断当前所有进行中比赛的数据齐全度
 * 只返回"数据齐全"的比赛，方便快速定位可用于策略的高质量比赛。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getLiveFixtures,
  getStatisticsBatch,
  getEventsBatch,
  getStandings,
  getTeamsStatistics,
  type Match,
  type TeamStatistics,
  type MatchEvent,
} from './api-football.js';

// ============================================
// 数据字段检测
// ============================================

interface FieldCheck {
  present: boolean;
  value?: string | number;
}

interface MatchAuditResult {
  fixtureId: number;
  league: string;
  leagueId: number;
  country: string;
  season: number;
  round: string;
  minute: number;
  status: string;
  home: string;
  away: string;
  score: string;

  realtime: {
    shots: FieldCheck;
    shotsOnTarget: FieldCheck;
    possession: FieldCheck;
    corners: FieldCheck;
    xG: FieldCheck;
    attacks: FieldCheck;
    dangerousAttacks: FieldCheck;
  };
  events: FieldCheck;
  standings: FieldCheck;
  teamHistory: {
    homeGoalsByMinute: FieldCheck;
    awayGoalsByMinute: FieldCheck;
  };

  completenessScore: number;
  isComplete: boolean;
}

function getStat(stats: TeamStatistics, type: string): number | null {
  const stat = stats.statistics.find(s => s.type === type);
  if (!stat || stat.value === null) return null;
  if (typeof stat.value === 'string') {
    const n = parseInt(stat.value.replace('%', ''), 10);
    return Number.isFinite(n) ? n : null;
  }
  return stat.value;
}

function checkPair(
  homeStats: TeamStatistics | undefined,
  awayStats: TeamStatistics | undefined,
  type: string,
): FieldCheck {
  if (!homeStats || !awayStats) return { present: false };
  const h = getStat(homeStats, type);
  const a = getStat(awayStats, type);
  if (h === null && a === null) return { present: false };
  return { present: true, value: `${h ?? 0}-${a ?? 0}` };
}

// ============================================
// 主处理函数
// ============================================

async function auditLiveMatches(): Promise<{
  total: number;
  complete: MatchAuditResult[];
  incomplete: MatchAuditResult[];
  summary: {
    totalLive: number;
    completeCount: number;
    incompleteCount: number;
    byLeague: Record<string, { total: number; complete: number }>;
  };
}> {
  // 1. 获取所有进行中比赛
  const fixtures = await getLiveFixtures();
  if (!fixtures || fixtures.length === 0) {
    return {
      total: 0,
      complete: [],
      incomplete: [],
      summary: { totalLive: 0, completeCount: 0, incompleteCount: 0, byLeague: {} },
    };
  }

  // 只审计真正进行中的 (1H, 2H, HT, ET, BT, P, LIVE)
  const liveStatuses = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT']);
  const liveFixtures = fixtures.filter(f => liveStatuses.has(f.fixture.status.short));

  const fixtureIds = liveFixtures.map(f => f.fixture.id);

  // 2. 批量获取统计和事件
  const [statsMap, eventsMap] = await Promise.all([
    getStatisticsBatch(fixtureIds),
    getEventsBatch(fixtureIds),
  ]);

  // 3. 收集需要查询的联赛和球队
  const leagueQueries = new Map<number, { season: number }>();
  const teamQueries: Array<{ teamId: number; leagueId: number; season: number }> = [];

  for (const f of liveFixtures) {
    const lid = f.league.id;
    const season = f.league.season;
    if (!leagueQueries.has(lid)) {
      leagueQueries.set(lid, { season });
    }
    teamQueries.push(
      { teamId: f.teams.home.id, leagueId: lid, season },
      { teamId: f.teams.away.id, leagueId: lid, season },
    );
  }

  // 4. 并行查询积分榜（每个联赛一次）和球队赛季统计（每支球队一次，限前 10 场节省配额）
  const standingsResults = new Map<number, boolean>();
  const standingsPromises = Array.from(leagueQueries.entries()).map(
    async ([lid, { season }]) => {
      try {
        const data = await getStandings(lid, season);
        standingsResults.set(lid, !!data);
      } catch {
        standingsResults.set(lid, false);
      }
    },
  );

  // 球队历史统计只查前 20 支球队（避免超配额）
  const teamStatsResults = new Map<string, boolean>();
  const limitedTeamQueries = teamQueries.slice(0, 40);
  const teamPromises = limitedTeamQueries.map(async ({ teamId, leagueId, season }) => {
    const key = `${teamId}:${leagueId}`;
    try {
      const data = await getTeamsStatistics(teamId, leagueId, season) as any;
      const hasGoalsByMinute = !!(data?.goals?.for?.minute);
      teamStatsResults.set(key, hasGoalsByMinute);
    } catch {
      teamStatsResults.set(key, false);
    }
  });

  await Promise.all([...standingsPromises, ...teamPromises]);

  // 5. 汇总每场比赛
  const results: MatchAuditResult[] = [];
  const byLeague: Record<string, { total: number; complete: number }> = {};

  for (const f of liveFixtures) {
    const fid = f.fixture.id;
    const stats = statsMap.get(fid);
    const events = eventsMap.get(fid);
    const homeStats = stats?.[0];
    const awayStats = stats?.[1];
    const lid = f.league.id;
    const season = f.league.season;

    const realtimeChecks = {
      shots: checkPair(homeStats, awayStats, 'Total Shots'),
      shotsOnTarget: checkPair(homeStats, awayStats, 'Shots on Goal'),
      possession: checkPair(homeStats, awayStats, 'Ball Possession'),
      corners: checkPair(homeStats, awayStats, 'Corner Kicks'),
      xG: checkPair(homeStats, awayStats, 'expected_goals'),
      attacks: checkPair(homeStats, awayStats, 'Attacks'),
      dangerousAttacks: checkPair(homeStats, awayStats, 'Dangerous Attacks'),
    };

    const eventsCheck: FieldCheck = {
      present: !!events && events.length > 0,
      value: events?.length ?? 0,
    };

    const standingsCheck: FieldCheck = {
      present: standingsResults.get(lid) === true,
    };

    const homeKey = `${f.teams.home.id}:${lid}`;
    const awayKey = `${f.teams.away.id}:${lid}`;
    const teamHistoryChecks = {
      homeGoalsByMinute: { present: teamStatsResults.get(homeKey) === true } as FieldCheck,
      awayGoalsByMinute: { present: teamStatsResults.get(awayKey) === true } as FieldCheck,
    };

    // 计算齐全度分数（满分 100）
    const weights = [
      { check: realtimeChecks.shots, w: 15 },
      { check: realtimeChecks.shotsOnTarget, w: 12 },
      { check: realtimeChecks.possession, w: 10 },
      { check: realtimeChecks.corners, w: 8 },
      { check: realtimeChecks.xG, w: 10 },
      { check: realtimeChecks.attacks, w: 5 },
      { check: realtimeChecks.dangerousAttacks, w: 5 },
      { check: eventsCheck, w: 10 },
      { check: standingsCheck, w: 10 },
      { check: teamHistoryChecks.homeGoalsByMinute, w: 7.5 },
      { check: teamHistoryChecks.awayGoalsByMinute, w: 7.5 },
    ];
    const score = weights.reduce((s, { check, w }) => s + (check.present ? w : 0), 0);

    const leagueLabel = `${f.league.country} - ${f.league.name}`;
    if (!byLeague[leagueLabel]) byLeague[leagueLabel] = { total: 0, complete: 0 };
    byLeague[leagueLabel].total++;

    const isComplete = score >= 80;
    if (isComplete) byLeague[leagueLabel].complete++;

    results.push({
      fixtureId: fid,
      league: f.league.name,
      leagueId: lid,
      country: f.league.country,
      season,
      round: f.league.round,
      minute: f.fixture.status.elapsed ?? 0,
      status: f.fixture.status.short,
      home: f.teams.home.name,
      away: f.teams.away.name,
      score: `${f.goals.home ?? 0}-${f.goals.away ?? 0}`,
      realtime: realtimeChecks,
      events: eventsCheck,
      standings: standingsCheck,
      teamHistory: teamHistoryChecks,
      completenessScore: Math.round(score),
      isComplete,
    });
  }

  results.sort((a, b) => b.completenessScore - a.completenessScore);

  const complete = results.filter(r => r.isComplete);
  const incomplete = results.filter(r => !r.isComplete);

  return {
    total: results.length,
    complete,
    incomplete,
    summary: {
      totalLive: results.length,
      completeCount: complete.length,
      incompleteCount: incomplete.length,
      byLeague,
    },
  };
}

// ============================================
// Vercel handler
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await auditLiveMatches();
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    console.error('[data-audit] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Unknown error',
    });
  }
}
