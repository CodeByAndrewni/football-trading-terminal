/**
 * /api/cron/late-goal-collect — 采集昨日已完成比赛中 85'+ 进球数据
 *
 * 设计为每日 cron 任务（UTC 08:00 运行，采集前一天数据），
 * 将绝杀事件按特征分桶存入 KV，用于替换情景引擎的经验阈值。
 *
 * GET /api/cron/late-goal-collect          → 采集昨天
 * GET /api/cron/late-goal-collect?date=YYYY-MM-DD → 指定日期
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFixturesByDate, getEventsBatch, getStatisticsBatch, type Match, type MatchEvent } from './api-football.js';

// ============================================
// 类型
// ============================================

interface LateGoalRecord {
  fixtureId: number;
  league: string;
  leagueId: number;
  country: string;
  round: string;
  home: string;
  away: string;
  /** 进球时的比分快照（进球前） */
  scoreBefore: string;
  /** 最终比分 */
  finalScore: string;
  /** 进球分钟 */
  goalMinute: number;
  /** 进球方 */
  goalTeam: 'home' | 'away';
  /** 进球类型 */
  goalDetail: string;
  /** 比赛特征快照 */
  features: {
    totalGoalsBefore: number;
    scoreDiffBefore: number;
    totalShots: number;
    totalXG: number;
    possessionHome: number;
    totalCorners: number;
    totalFouls: number;
    totalYellow: number;
    totalRed: number;
    /** 让球方 */
    favSide: 'home' | 'away' | null;
    /** 赛事类型推断 */
    isCup: boolean;
  };
  /** 情景分桶标签 */
  buckets: string[];
}

interface CollectionResult {
  date: string;
  totalFinished: number;
  totalLateGoals: number;
  records: LateGoalRecord[];
  bucketSummary: Record<string, number>;
  apiCalls: number;
}

// ============================================
// 分桶逻辑
// ============================================

function classifyBuckets(r: LateGoalRecord): string[] {
  const b: string[] = [];
  const f = r.features;

  // S01-like: 强队追分
  if (f.favSide && r.goalTeam === f.favSide && f.scoreDiffBefore <= 0) {
    b.push('STRONG_FAV_CHASING');
  }

  // S03-like: 主场压哨
  if (r.goalTeam === 'home' && f.scoreDiffBefore <= 0 && r.goalMinute >= 85) {
    b.push('HOME_LAST_GASP');
  }

  // S04-like: 高比分拉锯
  if (f.totalGoalsBefore >= 4 && Math.abs(f.scoreDiffBefore) <= 1) {
    b.push('HIGH_SCORE_SEESAW');
  }

  // S07-like: 摆大巴被破
  if (f.scoreDiffBefore !== 0 && f.possessionHome > 0) {
    const leadingSide = f.scoreDiffBefore > 0 ? 'home' : 'away';
    const leadingPoss = leadingSide === 'home' ? f.possessionHome : 100 - f.possessionHome;
    if (leadingPoss < 40) {
      b.push('PARK_BUS_BROKEN');
    }
  }

  // S08-like: 红牌翻盘
  if (f.totalRed >= 1) {
    b.push('RED_CARD_SHIFT');
  }

  // S10-like: 弱队被绝杀
  if (f.favSide && r.goalTeam === f.favSide && f.scoreDiffBefore < 0) {
    b.push('WEAK_BESIEGED_EQUALIZED');
  }

  // S14-like: 角球多
  if (f.totalCorners >= 10) {
    b.push('HIGH_CORNERS');
  }

  // S16-like: 超 90 分钟
  if (r.goalMinute >= 90) {
    b.push('STOPPAGE_TIME_GOAL');
  }

  // 平局绝杀
  if (f.scoreDiffBefore === 0) {
    b.push('DEADLOCK_BREAKER');
  }

  if (b.length === 0) b.push('OTHER');
  return b;
}

// ============================================
// 采集逻辑
// ============================================

async function collectLateGoals(targetDate: string): Promise<CollectionResult> {
  let apiCalls = 0;

  // 1. 拉取当天所有比赛
  const fixtures = await getFixturesByDate(targetDate);
  apiCalls++;

  // 只取已完成的比赛
  const finished = fixtures.filter(f => {
    const s = f.fixture.status.short;
    return ['FT', 'AET', 'PEN'].includes(s);
  });

  if (finished.length === 0) {
    return { date: targetDate, totalFinished: 0, totalLateGoals: 0, records: [], bucketSummary: {}, apiCalls };
  }

  // 2. 批量拉事件和统计（限制前 100 场以控制配额）
  const limitedFixtures = finished.slice(0, 100);
  const fixtureIds = limitedFixtures.map(f => f.fixture.id);

  const [eventsMap, statsMap] = await Promise.all([
    getEventsBatch(fixtureIds),
    getStatisticsBatch(fixtureIds),
  ]);
  apiCalls += fixtureIds.length * 2;

  // 3. 从事件中筛选 85'+ 进球
  const records: LateGoalRecord[] = [];
  const fixtureMap = new Map<number, Match>();
  for (const f of limitedFixtures) fixtureMap.set(f.fixture.id, f);

  for (const [fid, events] of eventsMap) {
    const fixture = fixtureMap.get(fid);
    if (!fixture) continue;

    const lateGoals = events.filter(e =>
      e.type === 'Goal' &&
      e.time.elapsed >= 85 &&
      !e.detail?.toLowerCase().includes('missed penalty')
    );

    if (lateGoals.length === 0) continue;

    // 解析统计
    const stats = statsMap.get(fid);
    const getStat = (side: 0 | 1, type: string): number => {
      if (!stats || stats.length < 2) return 0;
      const s = stats[side].statistics.find(x => x.type === type);
      if (!s || s.value === null) return 0;
      return typeof s.value === 'string' ? parseInt(s.value.replace('%', ''), 10) || 0 : s.value;
    };

    const totalShots = getStat(0, 'Total Shots') + getStat(1, 'Total Shots');
    const totalXG = (getStat(0, 'expected_goals') || 0) + (getStat(1, 'expected_goals') || 0);
    const possessionHome = getStat(0, 'Ball Possession');
    const totalCorners = getStat(0, 'Corner Kicks') + getStat(1, 'Corner Kicks');
    const totalFouls = getStat(0, 'Fouls') + getStat(1, 'Fouls');
    const totalYellow = getStat(0, 'Yellow Cards') + getStat(1, 'Yellow Cards');
    const totalRed = getStat(0, 'Red Cards') + getStat(1, 'Red Cards');

    // 判断让球方（用胜率推断，无赛前赔率时用 null）
    let favSide: 'home' | 'away' | null = null;
    if (fixture.teams.home.winner === true) favSide = 'home';
    else if (fixture.teams.away.winner === true) favSide = 'away';

    const isCup = (fixture.league.round ?? '').toLowerCase().match(
      /round|leg|final|semi|quarter|knockout/
    ) !== null;

    // 按时间排序所有进球事件，重建每个晚球的"进球前比分"
    const allGoals = events
      .filter(e => e.type === 'Goal' && !e.detail?.toLowerCase().includes('missed penalty'))
      .sort((a, b) => a.time.elapsed - b.time.elapsed);

    for (const goal of lateGoals) {
      const isHome = goal.team.id === fixture.teams.home.id;
      const goalsBefore = allGoals.filter(g => g.time.elapsed < goal.time.elapsed || (g.time.elapsed === goal.time.elapsed && g !== goal));
      const homeGoalsBefore = goalsBefore.filter(g => g.team.id === fixture.teams.home.id).length;
      const awayGoalsBefore = goalsBefore.filter(g => g.team.id !== fixture.teams.home.id).length;

      const record: LateGoalRecord = {
        fixtureId: fid,
        league: fixture.league.name,
        leagueId: fixture.league.id,
        country: fixture.league.country,
        round: fixture.league.round,
        home: fixture.teams.home.name,
        away: fixture.teams.away.name,
        scoreBefore: `${homeGoalsBefore}-${awayGoalsBefore}`,
        finalScore: `${fixture.goals.home ?? 0}-${fixture.goals.away ?? 0}`,
        goalMinute: goal.time.elapsed,
        goalTeam: isHome ? 'home' : 'away',
        goalDetail: goal.detail ?? 'Normal Goal',
        features: {
          totalGoalsBefore: homeGoalsBefore + awayGoalsBefore,
          scoreDiffBefore: homeGoalsBefore - awayGoalsBefore,
          totalShots,
          totalXG,
          possessionHome,
          totalCorners,
          totalFouls,
          totalYellow,
          totalRed,
          favSide,
          isCup,
        },
        buckets: [],
      };

      record.buckets = classifyBuckets(record);
      records.push(record);
    }
  }

  // 4. 汇总分桶
  const bucketSummary: Record<string, number> = {};
  for (const r of records) {
    for (const b of r.buckets) {
      bucketSummary[b] = (bucketSummary[b] ?? 0) + 1;
    }
  }

  return {
    date: targetDate,
    totalFinished: finished.length,
    totalLateGoals: records.length,
    records,
    bucketSummary,
    apiCalls,
  };
}

// ============================================
// Handler
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 默认采集昨天的数据
    const dateParam = (req.query.date as string) ?? null;
    let targetDate: string;

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      targetDate = dateParam;
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      targetDate = yesterday.toISOString().split('T')[0];
    }

    console.log(`[late-goal-collect] Collecting for ${targetDate}`);
    const result = await collectLateGoals(targetDate);
    console.log(
      `[late-goal-collect] Done: ${result.totalFinished} finished, ${result.totalLateGoals} late goals, ${result.apiCalls} API calls`
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[late-goal-collect] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Unknown error',
    });
  }
}
