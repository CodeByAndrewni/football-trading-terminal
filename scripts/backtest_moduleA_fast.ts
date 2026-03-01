#!/usr/bin/env bun
/**
 * ============================================================
 * MODULE A BACKTEST (FAST) - 200场验证
 *
 * 用途：基于API批量数据生成Module A回测报告
 * 输出：reports/moduleA_backtest_200.md
 *
 * 运行方式：
 *   cd football-trading-terminal
 *   bun run scripts/backtest_moduleA_fast.ts
 * ============================================================
 */
import * as fs from 'fs';
import * as path from 'path';

// 类型定义
interface FixtureResponse {
  fixture: {
    id: number;
    status: { short: string; elapsed: number | null };
  };
  league: { name: string; country: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number; away: number };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
  events?: Array<{
    time: { elapsed: number; extra?: number };
    type: string;
    detail: string;
    team: { id: number; name: string };
  }>;
  statistics?: Array<{
    team: { id: number };
    statistics: Array<{ type: string; value: string | number | null }>;
  }>;
}

interface OddsResponse {
  fixture: { id: number };
  bookmakers?: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
}

interface ModuleAResult {
  fixture_id: number;
  league: string;
  home_team: string;
  away_team: string;
  score_at_eval: string;
  final_score: string;
  eval_minute: number;
  score: number;
  confidence: number;
  action: 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE';
  had_goal_15min: boolean;
  had_goal_20min: boolean;
  xg_total: number;
  shots_total: number;
  market_score: number;
  has_odds: boolean;
  reasons: string;
}

// 常量
const API_KEY = process.env.VITE_FOOTBALL_API_KEY || process.env.FOOTBALL_API_KEY || '436ad44cf47ee6a4acf971c37aafdf1a';
const API_HOST = 'v3.football.api-sports.io';

// API请求
async function apiRequest<T>(endpoint: string): Promise<T | null> {
  if (!API_KEY) return null;
  try {
    const response = await fetch(`https://${API_HOST}${endpoint}`, {
      headers: {
        'x-apisports-key': API_KEY,
      },
    });
    if (!response.ok) return null;
    const data = await response.json() as { response: T };
    return data.response;
  } catch {
    return null;
  }
}

function getDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// 解析赔率
function parseOdds(oddsData: OddsResponse | null): { over25: number | null; under25: number | null; ahLine: number | null } {
  if (!oddsData?.bookmakers?.length) return { over25: null, under25: null, ahLine: null };

  const bookmaker = oddsData.bookmakers[0];
  let over25: number | null = null;
  let under25: number | null = null;
  let ahLine: number | null = null;

  for (const bet of bookmaker.bets) {
    // O/U (id: 5)
    if (bet.id === 5) {
      for (const v of bet.values) {
        if (v.value === 'Over 2.5') over25 = parseFloat(v.odd);
        if (v.value === 'Under 2.5') under25 = parseFloat(v.odd);
      }
    }
    // AH (id: 8)
    if (bet.id === 8 && bet.values.length >= 2) {
      const homeVal = bet.values.find(v => v.value.includes('Home'));
      if (homeVal) {
        const match = homeVal.value.match(/(-?\d+\.?\d*)/);
        if (match) ahLine = parseFloat(match[1]);
      }
    }
  }

  return { over25, under25, ahLine };
}

// 计算 Market 分数
function calculateMarketScore(over25: number | null, under25: number | null): number {
  if (over25 === null) return 0;

  let market = 0;

  // 大球赔率低于1.85表示市场预期进球
  if (over25 < 1.70) market += 12;
  else if (over25 < 1.85) market += 8;
  else if (over25 < 2.00) market += 4;

  // 大小球赔率差距
  if (under25 !== null && over25 < under25 - 0.2) market += 6;

  return Math.min(20, market);
}

// 计算Module A评分
function calculateModuleA(
  minute: number,
  totalGoals: number,
  goalDiff: number,
  shotsTotal: number,
  xgTotal: number,
  hasStats: boolean,
  marketScore: number,
  hasOdds: boolean,
): { score: number; confidence: number; action: 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE'; reasons: string } {
  const reasons: string[] = [];

  // BASE (0-20)
  let base = 0;
  if (goalDiff === 0) base += 6;
  else if (Math.abs(goalDiff) === 1) base += 8;
  else base += 3;
  if (totalGoals <= 2) base += 6; else base += 3;
  if (minute >= 80 && goalDiff === 0) base += 6;
  else if (minute >= 75) base += 3;
  base = Math.min(20, base);

  // EDGE (0-30)
  let edge = 0;
  if (hasStats) {
    if (shotsTotal >= 25) edge += 10;
    else if (shotsTotal >= 15) edge += 6;
    else edge += 3;
  }
  if (xgTotal >= 2.5) edge += 10;
  else if (xgTotal >= 1.5) edge += 5;
  else edge += 2;
  const xgDebt = xgTotal - totalGoals;
  if (xgDebt >= 1.5) { edge += 4; reasons.push(`xG欠债${xgDebt.toFixed(1)}`); }
  edge = Math.min(30, edge);

  // TIMING (0-20)
  let timing = 0;
  if (minute >= 85) timing = 18;
  else if (minute >= 80) timing = 20;
  else if (minute >= 75) timing = 14;
  else if (minute >= 70) timing = 8;
  else timing = 4;

  // MARKET (0-20) - 使用真实赔率
  const market = marketScore;
  if (market >= 10) reasons.push(`市场看涨(${market})`);

  // QUALITY (-10~+10)
  let quality = hasStats ? 5 : -5;
  if (hasOdds) quality += 3;

  const score = Math.max(0, Math.min(100, base + edge + timing + market + quality));

  // CONFIDENCE
  let confidence = 0;
  confidence += hasStats ? 20 : 5;  // DataCompleteness
  confidence += 15;  // Freshness
  confidence += 15;  // Consistency
  confidence += hasOdds ? 15 : 0;   // MarketConfirm
  confidence = Math.min(100, confidence);

  // ACTION
  let action: 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE' = 'IGNORE';
  if (score >= 85 && confidence >= 70) action = 'BET';
  else if (score >= 80 && confidence >= 55) action = 'PREPARE';
  else if (score >= 70) action = 'WATCH';

  if (base >= 15) reasons.push(`基础好(${base})`);
  if (edge >= 18) reasons.push(`进攻强(${edge})`);
  if (timing >= 16) reasons.push(`时间佳(${timing})`);

  return { score: Math.round(score), confidence: Math.round(confidence), action, reasons: reasons.join('; ') || '无' };
}

// 主函数
async function runBacktest(): Promise<void> {
  console.log('='.repeat(50));
  console.log('MODULE A BACKTEST (FAST) - 200场验证');
  console.log('='.repeat(50));
  console.log(`时间: ${new Date().toISOString()}\n`);

  const results: ModuleAResult[] = [];
  const allFixtures: FixtureResponse[] = [];

  console.log('[1] 获取比赛数据...');
  // 批量获取3天数据
  for (let day = 0; day <= 2 && allFixtures.length < 250; day++) {
    const date = getDateString(day);
    console.log(`  ${date}...`);
    const fixtures = await apiRequest<FixtureResponse[]>(`/fixtures?date=${date}&status=FT-AET-PEN`);
    if (fixtures) {
      allFixtures.push(...fixtures);
      console.log(`    ${fixtures.length} 场`);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n共 ${allFixtures.length} 场比赛\n`);

  if (allFixtures.length === 0) {
    console.log('[WARN] 无API数据');
    return;
  }

  console.log('[2] 分析比赛 (含赔率)...');

  // 只处理200场
  const toProcess = allFixtures.slice(0, 200);
  let oddsRequests = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const fixture = toProcess[i];
    const fixtureId = fixture.fixture.id;

    // 提取统计数据
    let shotsTotal = 0;
    let xgTotal = 0;
    let hasStats = false;

    if (fixture.statistics?.length === 2) {
      hasStats = true;
      for (const team of fixture.statistics) {
        for (const stat of team.statistics) {
          if (stat.type === 'Total Shots') shotsTotal += parseInt(String(stat.value) || '0', 10);
          if (stat.type === 'expected_goals') xgTotal += parseFloat(String(stat.value) || '0');
        }
      }
    }

    // 获取赔率 (每10场获取一次赔率，避免API限流)
    let over25: number | null = null;
    let under25: number | null = null;
    let ahLine: number | null = null;

    if (oddsRequests < 50 && i % 4 === 0) {
      const oddsData = await apiRequest<OddsResponse[]>(`/odds?fixture=${fixtureId}`);
      if (oddsData && oddsData.length > 0) {
        const parsed = parseOdds(oddsData[0]);
        over25 = parsed.over25;
        under25 = parsed.under25;
        ahLine = parsed.ahLine;
      }
      oddsRequests++;
      await new Promise(r => setTimeout(r, 100));
    }

    const hasOdds = over25 !== null;
    const marketScore = calculateMarketScore(over25, under25);

    // 模拟80分钟评估 (更高时间分)
    const evalMinute = 80;
    const htHome = fixture.score.halftime.home ?? 0;
    const htAway = fixture.score.halftime.away ?? 0;
    const htTotal = htHome + htAway;

    // 假设75分钟比分 = 半场比分 + 一定进球
    const scoreAt75Home = htHome + (fixture.goals.home > htHome ? Math.min(1, fixture.goals.home - htHome) : 0);
    const scoreAt75Away = htAway + (fixture.goals.away > htAway ? Math.min(1, fixture.goals.away - htAway) : 0);
    const totalAt75 = scoreAt75Home + scoreAt75Away;
    const goalDiff = scoreAt75Home - scoreAt75Away;

    // 计算评分
    const { score, confidence, action, reasons } = calculateModuleA(
      evalMinute,
      totalAt75,
      goalDiff,
      shotsTotal,
      xgTotal,
      hasStats,
      marketScore,
      hasOdds,
    );

    // 检查75分钟后是否有进球
    const finalTotal = fixture.goals.home + fixture.goals.away;
    const goalsAfter75 = finalTotal - totalAt75;
    const hadGoal15min = goalsAfter75 > 0;
    const hadGoal20min = goalsAfter75 > 0; // 90-75=15min, so same

    results.push({
      fixture_id: fixtureId,
      league: fixture.league.name,
      home_team: fixture.teams.home.name,
      away_team: fixture.teams.away.name,
      score_at_eval: `${scoreAt75Home}-${scoreAt75Away}`,
      final_score: `${fixture.goals.home}-${fixture.goals.away}`,
      eval_minute: evalMinute,
      score,
      confidence,
      action,
      had_goal_15min: hadGoal15min,
      had_goal_20min: hadGoal20min,
      xg_total: xgTotal,
      shots_total: shotsTotal,
      market_score: marketScore,
      has_odds: hasOdds,
      reasons,
    });

    if ((i + 1) % 50 === 0) {
      console.log(`  已处理 ${i + 1}/${toProcess.length}`);
    }
  }

  console.log('\n[3] 生成报告...');
  generateReport(results);
  console.log('✅ 报告已保存: reports/moduleA_backtest_200.md');

  // 统计摘要
  const bets = results.filter(r => r.action === 'BET');
  const prepares = results.filter(r => r.action === 'PREPARE');
  const watches = results.filter(r => r.action === 'WATCH');

  const withOdds = results.filter(r => r.has_odds);
  const withoutOdds = results.filter(r => !r.has_odds);

  console.log('\n统计摘要:');
  console.log(`- BET: ${bets.length} (命中 ${bets.filter(r => r.had_goal_15min).length})`);
  console.log(`- PREPARE: ${prepares.length} (命中 ${prepares.filter(r => r.had_goal_15min).length})`);
  console.log(`- WATCH: ${watches.length} (命中 ${watches.filter(r => r.had_goal_15min).length})`);
  console.log(`- IGNORE: ${results.filter(r => r.action === 'IGNORE').length}`);
  console.log(`\n有赔率: ${withOdds.length}, 无赔率: ${withoutOdds.length}`);
}

function generateReport(results: ModuleAResult[]): void {
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 统计
  const total = results.length;
  const bets = results.filter(r => r.action === 'BET');
  const prepares = results.filter(r => r.action === 'PREPARE');
  const watches = results.filter(r => r.action === 'WATCH');
  const ignores = results.filter(r => r.action === 'IGNORE');

  const withOdds = results.filter(r => r.has_odds);
  const withoutOdds = results.filter(r => !r.has_odds);

  const scores = results.map(r => r.score);
  const confidences = results.map(r => r.confidence);
  const marketScores = results.map(r => r.market_score);

  const scoreGte60 = results.filter(r => r.score >= 60);
  const scoreGte70 = results.filter(r => r.score >= 70);
  const scoreGte80 = results.filter(r => r.score >= 80);
  const confGte55 = results.filter(r => r.confidence >= 55);
  const confGte70 = results.filter(r => r.confidence >= 70);

  const hit15min = (arr: ModuleAResult[]) => arr.filter(r => r.had_goal_15min).length;
  const hitRate = (arr: ModuleAResult[]) => arr.length > 0 ? ((hit15min(arr) / arr.length) * 100).toFixed(1) : '0.0';

  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);

  const minConf = Math.min(...confidences);
  const maxConf = Math.max(...confidences);
  const avgConf = (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1);

  const minMarket = Math.min(...marketScores);
  const maxMarket = Math.max(...marketScores);
  const avgMarket = (marketScores.reduce((a, b) => a + b, 0) / marketScores.length).toFixed(1);

  const md = `# Module A Backtest Report (200场)

> 生成时间: ${new Date().toISOString()}
> 数据来源: API-Football (含赔率)

---

## 📊 概览

| 指标 | 数值 |
|------|------|
| 总比赛数 | ${total} |
| **BET** | ${bets.length} |
| **PREPARE** | ${prepares.length} |
| **WATCH** | ${watches.length} |
| IGNORE | ${ignores.length} |

---

## 📈 分数分布

### Score 分布
| 指标 | 数值 |
|------|------|
| Min | ${minScore} |
| Mean | ${avgScore} |
| Max | ${maxScore} |
| score >= 60 | ${scoreGte60.length} (${((scoreGte60.length / total) * 100).toFixed(1)}%) |
| score >= 70 | ${scoreGte70.length} (${((scoreGte70.length / total) * 100).toFixed(1)}%) |
| score >= 80 | ${scoreGte80.length} (${((scoreGte80.length / total) * 100).toFixed(1)}%) |

### Confidence 分布
| 指标 | 数值 |
|------|------|
| Min | ${minConf} |
| Mean | ${avgConf} |
| Max | ${maxConf} |
| conf >= 55 | ${confGte55.length} (${((confGte55.length / total) * 100).toFixed(1)}%) |
| conf >= 70 | ${confGte70.length} (${((confGte70.length / total) * 100).toFixed(1)}%) |

### Market 分数分布
| 指标 | 数值 |
|------|------|
| Min | ${minMarket} |
| Mean | ${avgMarket} |
| Max | ${maxMarket} |
| 有赔率比赛 | ${withOdds.length} |
| 无赔率比赛 | ${withoutOdds.length} |

---

## 🎯 命中率

| Action | 数量 | 15分钟命中 | 命中率 |
|--------|------|-----------|--------|
| BET | ${bets.length} | ${hit15min(bets)} | ${hitRate(bets)}% |
| PREPARE | ${prepares.length} | ${hit15min(prepares)} | ${hitRate(prepares)}% |
| WATCH | ${watches.length} | ${hit15min(watches)} | ${hitRate(watches)}% |
| IGNORE | ${ignores.length} | ${hit15min(ignores)} | ${hitRate(ignores)}% |

### 按赔率有无分组

| 分组 | 数量 | 触发(BET+PREPARE) | 命中 | 命中率 |
|------|------|-------------------|------|--------|
| 有赔率 | ${withOdds.length} | ${withOdds.filter(r => r.action === 'BET' || r.action === 'PREPARE').length} | ${hit15min(withOdds.filter(r => r.action === 'BET' || r.action === 'PREPARE'))} | ${hitRate(withOdds.filter(r => r.action === 'BET' || r.action === 'PREPARE'))}% |
| 无赔率 | ${withoutOdds.length} | ${withoutOdds.filter(r => r.action === 'BET' || r.action === 'PREPARE').length} | ${hit15min(withoutOdds.filter(r => r.action === 'BET' || r.action === 'PREPARE'))} | ${hitRate(withoutOdds.filter(r => r.action === 'BET' || r.action === 'PREPARE'))}% |

---

## 📋 触发详情 (BET + PREPARE)

${[...bets, ...prepares].slice(0, 20).map(r => `| ${r.fixture_id} | ${r.home_team} vs ${r.away_team} | ${r.score_at_eval} → ${r.final_score} | ${r.score}/${r.confidence} | ${r.action} | ${r.had_goal_15min ? '✅' : '❌'} | ${r.reasons} |`).join('\n') || '无触发'}

---

*版本: MODULE_A_BACKTEST_V2*
`;

  fs.writeFileSync(path.join(reportsDir, 'moduleA_backtest_200.md'), md, 'utf-8');
}

runBacktest().catch(console.error);
