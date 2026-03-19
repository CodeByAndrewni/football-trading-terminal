#!/usr/bin/env bun
/**
 * 简易回测：按评分分桶统计「未来15分钟进球率」
 *
 * 数据来源: Supabase historical_matches
 * - snapshots: 历史快照数组（含 minute / score / shots / corners / xg...）
 * - goal_minutes: 本场进球分钟数组
 *
 * 运行:
 *   bun run scripts/backtest_goal_next15.ts
 */

import { createClient } from '@supabase/supabase-js';
import { calculateDynamicScore } from '../src/services/scoringEngine';

type Snapshot = {
  minute: number;
  score_home: number;
  score_away: number;
  shots_home?: number;
  shots_away?: number;
  shots_on_home?: number;
  shots_on_away?: number;
  corners_home?: number;
  corners_away?: number;
  possession_home?: number;
  possession_away?: number;
  xg_home?: number;
  xg_away?: number;
};

type HistoricalRow = {
  fixture_id: number;
  snapshots: Snapshot[] | null;
  goal_minutes: number[] | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

const BUCKETS = [
  { name: '>=80', min: 80, max: 999 },
  { name: '70-79', min: 70, max: 79 },
  { name: '60-69', min: 60, max: 69 },
  { name: '<60', min: 0, max: 59 },
] as const;

function isGoalInNext15(goalMinutes: number[], minute: number): boolean {
  return goalMinutes.some((g) => g > minute && g <= minute + 15);
}

function toAdvancedMatchLike(fixtureId: number, s: Snapshot): any {
  return {
    id: fixtureId,
    minute: s.minute,
    status: 'live',
    home: { name: 'HOME', score: s.score_home, handicap: null },
    away: { name: 'AWAY', score: s.score_away },
    corners: { home: s.corners_home ?? 0, away: s.corners_away ?? 0 },
    stats: {
      _realDataAvailable: true,
      shots: { home: s.shots_home ?? 0, away: s.shots_away ?? 0 },
      shotsOnTarget: { home: s.shots_on_home ?? 0, away: s.shots_on_away ?? 0 },
      xG: { home: s.xg_home ?? 0, away: s.xg_away ?? 0 },
      possession: { home: s.possession_home ?? 50, away: s.possession_away ?? 50 },
      dangerousAttacks: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
    },
    cards: { red: { home: 0, away: 0 } },
    subsRemaining: { home: 5, away: 5 },
    recentAttackSubs: 0,
    varCancelled: false,
    events: [],
    substitutions: [],
    scenarioTags: [],
    pressure: { level: 'medium' },
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('请配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY（或兼容变量）');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase
    .from('historical_matches')
    .select('fixture_id,snapshots,goal_minutes')
    .not('snapshots', 'is', null)
    .limit(5000);

  if (error) {
    console.error('读取 historical_matches 失败:', error.message);
    process.exit(1);
  }

  const rows = (data || []) as HistoricalRow[];
  if (!rows.length) {
    console.log('没有可用历史数据。');
    return;
  }

  const bucketStats = new Map<string, { total: number; hit: number }>();
  for (const b of BUCKETS) bucketStats.set(b.name, { total: 0, hit: 0 });

  let samples = 0;
  for (const row of rows) {
    const goals = Array.isArray(row.goal_minutes) ? row.goal_minutes : [];
    const snapshots = Array.isArray(row.snapshots) ? row.snapshots : [];

    for (const s of snapshots) {
      if (s.minute < 70 || s.minute > 90) continue;
      const matchLike = toAdvancedMatchLike(row.fixture_id, s);
      const score = calculateDynamicScore(matchLike)?.totalScore;
      if (typeof score !== 'number') continue;

      const bucket = BUCKETS.find((b) => score >= b.min && score <= b.max);
      if (!bucket) continue;

      const stat = bucketStats.get(bucket.name)!;
      stat.total += 1;
      if (isGoalInNext15(goals, s.minute)) stat.hit += 1;
      samples += 1;
    }
  }

  console.log('\n=== 未来15分钟进球率（按评分分桶） ===');
  console.log(`总样本: ${samples}`);
  console.log('--------------------------------------');
  for (const b of BUCKETS) {
    const stat = bucketStats.get(b.name)!;
    const rate = stat.total > 0 ? ((stat.hit / stat.total) * 100).toFixed(1) : '0.0';
    console.log(`${b.name.padEnd(6)} | 样本 ${String(stat.total).padStart(5)} | 命中 ${String(stat.hit).padStart(5)} | 进球率 ${rate}%`);
  }
  console.log('--------------------------------------\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

