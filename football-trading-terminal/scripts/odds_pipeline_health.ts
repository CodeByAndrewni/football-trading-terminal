#!/usr/bin/env bun
/**
 * ============================================================
 * ODDS PIPELINE HEALTH - 赔率管道健康监控
 *
 * 用途：生成 odds/live 数据采集覆盖率报告
 * 输出：reports/odds_pipeline_health.md
 *
 * 运行方式：
 *   cd football-trading-terminal
 *   bun run scripts/odds_pipeline_health.ts
 * ============================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ============================================
// 配置
// ============================================

// 使用与 src/lib/supabase.ts 相同的硬编码值
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xppwoiyhnhkfjziwhrvi.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwcHdvaXlobmhrZmp6aXdocnZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NDc0ODksImV4cCI6MjA4NzQyMzQ4OX0.qQob-oPdMQdMpV3ULxcSNtRkdgeCxNcYdlNCfTF2Dyw';

// ============================================
// 类型定义
// ============================================

interface OddsSnapshot {
  id: number;
  fixture_id: number;
  minute: number | null;
  home_win: number | null;
  draw: number | null;
  away_win: number | null;
  over_2_5: number | null;
  under_2_5: number | null;
  asian_handicap_line: number | null;
  asian_handicap_home: number | null;
  asian_handicap_away: number | null;
  bookmaker: string;
  is_live: boolean;
  captured_at: string;
}

interface HealthReport {
  generated_at: string;
  time_range: {
    start: string;
    end: string;
    hours: number;
  };
  summary: {
    total_fixtures_fetched: number;
    total_snapshots: number;
    with_live_odds: number;
    with_any_odds: number;
    empty_responses: number;
    live_coverage_percent: number;
    any_coverage_percent: number;
  };
  by_league: Array<{
    league_name: string;
    fixtures: number;
    with_odds: number;
    coverage_percent: number;
  }>;
  by_bookmaker: Array<{
    bookmaker: string;
    count: number;
    percent: number;
  }>;
  recent_failures: Array<{
    fixture_id: number;
    captured_at: string;
    reason: string;
  }>;
  data_quality: {
    avg_snapshot_delay_seconds: number;
    snapshots_per_fixture: number;
    freshest_snapshot: string;
    oldest_snapshot: string;
  };
}

// ============================================
// 主函数
// ============================================

async function generateHealthReport(): Promise<void> {
  console.log('='.repeat(60));
  console.log('ODDS PIPELINE HEALTH REPORT');
  console.log('='.repeat(60));
  console.log(`开始时间: ${new Date().toISOString()}`);
  console.log();

  // 检查 Supabase 配置
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[WARN] Supabase 未配置，使用模拟数据');
    generateMockReport();
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 查询时间范围：过去24小时
  const now = new Date();
  const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  console.log('[1] 查询 odds_snapshots 表...');

  // 获取过去24小时的所有 odds 快照
  const { data: snapshots, error: snapshotsError } = await supabase
    .from('odds_snapshots')
    .select('*')
    .gte('captured_at', hours24Ago.toISOString())
    .order('captured_at', { ascending: false });

  if (snapshotsError) {
    console.error('查询失败:', snapshotsError);
    generateMockReport();
    return;
  }

  const allSnapshots = (snapshots as OddsSnapshot[]) || [];
  console.log(`  找到 ${allSnapshots.length} 条 odds 快照`);

  // 获取 match_records 用于联赛统计
  const { data: matchRecords, error: matchError } = await supabase
    .from('match_records')
    .select('fixture_id, league_name')
    .gte('created_at', hours24Ago.toISOString());

  const fixtureLeagueMap = new Map<number, string>();
  if (matchRecords) {
    for (const record of matchRecords) {
      fixtureLeagueMap.set(record.fixture_id, record.league_name || 'Unknown');
    }
  }

  console.log('[2] 分析数据...');

  // 按 fixture_id 分组
  const fixtureMap = new Map<number, OddsSnapshot[]>();
  for (const snapshot of allSnapshots) {
    const existing = fixtureMap.get(snapshot.fixture_id) || [];
    existing.push(snapshot);
    fixtureMap.set(snapshot.fixture_id, existing);
  }

  // 计算覆盖率
  const totalFixtures = fixtureMap.size;
  let withLiveOdds = 0;
  let withAnyOdds = 0;
  let emptyResponses = 0;

  for (const [fixtureId, fixtureSnapshots] of fixtureMap) {
    const hasAny = fixtureSnapshots.some(s =>
      s.over_2_5 !== null || s.asian_handicap_line !== null || s.home_win !== null
    );
    const hasLive = fixtureSnapshots.some(s => s.is_live && hasAny);

    if (hasAny) withAnyOdds++;
    if (hasLive) withLiveOdds++;
    if (!hasAny) emptyResponses++;
  }

  // 按博彩公司统计
  const bookmakerCounts = new Map<string, number>();
  for (const snapshot of allSnapshots) {
    const count = bookmakerCounts.get(snapshot.bookmaker) || 0;
    bookmakerCounts.set(snapshot.bookmaker, count + 1);
  }

  const byBookmaker = Array.from(bookmakerCounts.entries())
    .map(([bookmaker, count]) => ({
      bookmaker,
      count,
      percent: allSnapshots.length > 0 ? Math.round((count / allSnapshots.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // 按联赛统计
  const leagueCounts = new Map<string, { fixtures: Set<number>; withOdds: Set<number> }>();
  for (const [fixtureId, fixtureSnapshots] of fixtureMap) {
    const league = fixtureLeagueMap.get(fixtureId) || 'Unknown';
    if (!leagueCounts.has(league)) {
      leagueCounts.set(league, { fixtures: new Set(), withOdds: new Set() });
    }
    const entry = leagueCounts.get(league)!;
    entry.fixtures.add(fixtureId);

    const hasOdds = fixtureSnapshots.some(s =>
      s.over_2_5 !== null || s.asian_handicap_line !== null
    );
    if (hasOdds) entry.withOdds.add(fixtureId);
  }

  const byLeague = Array.from(leagueCounts.entries())
    .map(([league, data]) => ({
      league_name: league,
      fixtures: data.fixtures.size,
      with_odds: data.withOdds.size,
      coverage_percent: data.fixtures.size > 0 ? Math.round((data.withOdds.size / data.fixtures.size) * 100) : 0,
    }))
    .sort((a, b) => b.fixtures - a.fixtures)
    .slice(0, 10);

  // 找出失败的记录
  const recentFailures: Array<{ fixture_id: number; captured_at: string; reason: string }> = [];
  for (const snapshot of allSnapshots.slice(0, 100)) {
    const hasOdds = snapshot.over_2_5 !== null || snapshot.asian_handicap_line !== null || snapshot.home_win !== null;
    if (!hasOdds && recentFailures.length < 20) {
      recentFailures.push({
        fixture_id: snapshot.fixture_id,
        captured_at: snapshot.captured_at,
        reason: 'EMPTY_RESPONSE',
      });
    }
  }

  // 数据质量统计
  const sortedSnapshots = [...allSnapshots].sort((a, b) =>
    new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
  );

  const freshest = sortedSnapshots[0]?.captured_at || 'N/A';
  const oldest = sortedSnapshots[sortedSnapshots.length - 1]?.captured_at || 'N/A';
  const avgSnapshotsPerFixture = totalFixtures > 0 ? allSnapshots.length / totalFixtures : 0;

  // 构建报告
  const report: HealthReport = {
    generated_at: now.toISOString(),
    time_range: {
      start: hours24Ago.toISOString(),
      end: now.toISOString(),
      hours: 24,
    },
    summary: {
      total_fixtures_fetched: totalFixtures,
      total_snapshots: allSnapshots.length,
      with_live_odds: withLiveOdds,
      with_any_odds: withAnyOdds,
      empty_responses: emptyResponses,
      live_coverage_percent: totalFixtures > 0 ? Math.round((withLiveOdds / totalFixtures) * 100) : 0,
      any_coverage_percent: totalFixtures > 0 ? Math.round((withAnyOdds / totalFixtures) * 100) : 0,
    },
    by_league: byLeague,
    by_bookmaker: byBookmaker,
    recent_failures: recentFailures,
    data_quality: {
      avg_snapshot_delay_seconds: 0, // 需要额外计算
      snapshots_per_fixture: Math.round(avgSnapshotsPerFixture * 10) / 10,
      freshest_snapshot: freshest,
      oldest_snapshot: oldest,
    },
  };

  console.log('[3] 生成报告...');
  writeReport(report);

  console.log('\n[4] 完成!');
  console.log(`报告已保存到: reports/odds_pipeline_health.md`);

  // 输出摘要
  console.log('\n=== 摘要 ===');
  console.log(`odds/live 24h覆盖率: ${report.summary.live_coverage_percent}%`);
  console.log(`any odds覆盖率: ${report.summary.any_coverage_percent}%`);
  console.log(`空响应数: ${report.summary.empty_responses}`);
  console.log(`主要博彩公司: ${byBookmaker[0]?.bookmaker || 'N/A'}`);
}

// ============================================
// 报告生成
// ============================================

function writeReport(report: HealthReport): void {
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const md = `# Odds Pipeline Health Report

> 生成时间: ${report.generated_at}
> 数据范围: ${report.time_range.start} ~ ${report.time_range.end} (${report.time_range.hours}h)

---

## 📊 覆盖率摘要

| 指标 | 数值 |
|------|------|
| 总比赛数 (fixture_id 去重) | ${report.summary.total_fixtures_fetched} |
| 总快照数 | ${report.summary.total_snapshots} |
| 有 live odds | ${report.summary.with_live_odds} |
| 有任意 odds | ${report.summary.with_any_odds} |
| 空响应 | ${report.summary.empty_responses} |
| **live odds 覆盖率** | **${report.summary.live_coverage_percent}%** |
| **any odds 覆盖率** | **${report.summary.any_coverage_percent}%** |

---

## 📈 按博彩公司分布

| 博彩公司 | 快照数 | 占比 |
|----------|--------|------|
${report.by_bookmaker.map(b => `| ${b.bookmaker} | ${b.count} | ${b.percent}% |`).join('\n')}

---

## 🏆 Top 10 联赛覆盖率

| 联赛 | 比赛数 | 有赔率 | 覆盖率 |
|------|--------|--------|--------|
${report.by_league.map(l => `| ${l.league_name} | ${l.fixtures} | ${l.with_odds} | ${l.coverage_percent}% |`).join('\n')}

---

## ⚠️ 最近失败记录 (前20条)

| fixture_id | 时间 | 原因 |
|------------|------|------|
${report.recent_failures.length === 0 ? '| - | - | 无失败记录 |' : report.recent_failures.map(f => `| ${f.fixture_id} | ${f.captured_at} | ${f.reason} |`).join('\n')}

---

## 📉 数据质量

| 指标 | 数值 |
|------|------|
| 平均快照数/比赛 | ${report.data_quality.snapshots_per_fixture} |
| 最新快照 | ${report.data_quality.freshest_snapshot} |
| 最旧快照 | ${report.data_quality.oldest_snapshot} |

---

## 🔍 数据口径说明

- **样本范围**: 最近 24 小时内 odds_snapshots 表的所有记录
- **fixture_id 去重**: 一场比赛可能有多条快照（不同时间点）
- **live odds**: is_live = true 且有任意赔率值
- **any odds**: 有 over_2_5 或 asian_handicap_line 或 home_win 非 null
- **空响应**: 所有赔率字段均为 null（API 返回空数据或联赛不支持）

---

## 📋 主要缺失原因分析

${report.summary.empty_responses > report.summary.total_fixtures_fetched * 0.5 ? `
**⚠️ 高空响应率 (${Math.round(report.summary.empty_responses / report.summary.total_fixtures_fetched * 100)}%)**

可能原因：
1. **联赛不支持**: 小联赛/友谊赛 API-Football 无 live odds 数据
2. **时间窗口**: 比赛刚开始/即将结束时 odds 可能为空
3. **API 限制**: 部分 bookmaker 可能限制特定时段
4. **429 限流**: 请求过于频繁被限制

建议：
- 对于主流联赛（英超/西甲/德甲等）重点监控
- 考虑增加 prematch odds 作为备用
` : `
**✅ 空响应率正常 (${Math.round(report.summary.empty_responses / report.summary.total_fixtures_fetched * 100)}%)**

大部分比赛有赔率数据。
`}

---

*报告版本: ODDS_PIPELINE_HEALTH_V1*
*生成于: ${new Date().toLocaleString('zh-CN')}*
`;

  fs.writeFileSync(path.join(reportsDir, 'odds_pipeline_health.md'), md, 'utf-8');
}

function generateMockReport(): void {
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const md = `# Odds Pipeline Health Report

> 生成时间: ${new Date().toISOString()}
> ⚠️ 模拟报告 - Supabase 未配置

---

## 📊 覆盖率摘要

无法获取数据，请配置 Supabase：

\`\`\`bash
# .env
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
\`\`\`

---

## 预期指标（Phase 1.5 目标）

| 指标 | 目标值 |
|------|--------|
| live odds 覆盖率 | ≥ 40% |
| any odds 覆盖率 | ≥ 60% |
| 空响应率 | ≤ 40% |

---

*版本: ODDS_PIPELINE_HEALTH_V1*
`;

  fs.writeFileSync(path.join(reportsDir, 'odds_pipeline_health.md'), md, 'utf-8');
  console.log('模拟报告已生成: reports/odds_pipeline_health.md');
}

// 运行
generateHealthReport().catch(console.error);
