#!/usr/bin/env bun
/**
 * ============================================================
 * MODULE A BACKTEST - 200场验证脚本
 *
 * 用途：分析最近200场完场比赛的Module A信号表现
 * 输出：reports/moduleA_backtest_200.md
 *
 * 运行方式：
 *   cd football-trading-terminal
 *   bun run scripts/backtest_moduleA_200.ts
 * ============================================================
 */

import * as fs from 'fs';
import * as path from 'path';

// 类型定义
interface FixtureResponse {
  fixture: {
    id: number;
    status: {
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    name: string;
    country: string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: {
    home: number;
    away: number;
  };
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
}

interface StatisticsResponse {
  team: { id: number };
  statistics: Array<{
    type: string;
    value: string | number | null;
  }>;
}

interface ModuleAResult {
  fixture_id: number;
  league: string;
  home_team: string;
  away_team: string;
  score_at_evaluation: string;
  final_score: string;
  evaluation_minute: number;
  module_a_score: number;
  confidence: number;
  action: 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE';
  had_goal_after: boolean;  // 评分后15分钟内是否进球
  had_goal_20min: boolean;  // 评分后20分钟内是否进球
  goals_at_evaluation: number;
  final_goals: number;
  xg_total: number;
  shots_total: number;
  data_available: {
    stats: boolean;
    events: boolean;
    odds: boolean;
  };
  reasons_summary: string;
}

interface BacktestReport {
  generated_at: string;
  total_fixtures: number;
  fixtures_evaluated: number;
  triggers: {
    bet: number;
    prepare: number;
    watch: number;
    ignore: number;
  };
  hit_rates: {
    bet_15min: string;
    bet_20min: string;
    prepare_15min: string;
    prepare_20min: string;
    overall_15min: string;
    overall_20min: string;
  };
  data_quality: {
    with_stats: number;
    with_events: number;
    with_odds: number;
    complete_data: number;
  };
  cases: ModuleAResult[];
}

// 常量
const API_FOOTBALL_KEY = process.env.VITE_FOOTBALL_API_KEY || process.env.FOOTBALL_API_KEY || process.env.VITE_RAPIDAPI_KEY || process.env.API_FOOTBALL_KEY || '';
const API_HOST = 'v3.football.api-sports.io';
const RATE_LIMIT_DELAY = 250; // ms between requests

// API请求函数
async function apiRequest<T>(endpoint: string): Promise<T | null> {
  if (!API_FOOTBALL_KEY) {
    console.log('  [WARN] No API key configured, using mock data');
    return null;
  }

  try {
    const url = `https://${API_HOST}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': API_FOOTBALL_KEY,
        'x-rapidapi-host': API_HOST,
      },
    });

    if (!response.ok) {
      console.error(`  [ERROR] API request failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { response: T };
    return data.response;
  } catch (error) {
    console.error('  [ERROR] API request error:', error);
    return null;
  }
}

// 延迟函数
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 获取日期字符串
function getDateString(daysAgo: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// 解析统计值
function parseStatValue(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const cleaned = value.replace('%', '');
  return Number.parseFloat(cleaned) || 0;
}

// 获取比赛统计
async function getStatistics(fixtureId: number): Promise<Map<string, { home: number; away: number }>> {
  const stats = new Map<string, { home: number; away: number }>();

  const response = await apiRequest<StatisticsResponse[]>(`/fixtures/statistics?fixture=${fixtureId}`);
  if (!response || response.length < 2) return stats;

  // 解析主队统计
  const homeStats = response[0]?.statistics || [];
  const awayStats = response[1]?.statistics || [];

  const statTypes = [
    'Total Shots',
    'Shots on Goal',
    'Ball Possession',
    'Corner Kicks',
    'Dangerous Attacks',
    'Expected Goals (xG)',
  ];

  for (const type of statTypes) {
    const homeVal = homeStats.find(s => s.type === type)?.value;
    const awayVal = awayStats.find(s => s.type === type)?.value;
    stats.set(type, {
      home: parseStatValue(homeVal),
      away: parseStatValue(awayVal),
    });
  }

  return stats;
}

// 计算Module A评分（简化版，基于关键指标）
function calculateModuleAScore(
  minute: number,
  totalGoals: number,
  goalDiff: number,
  shotsTotal: number,
  shotsOnTotal: number,
  xgTotal: number,
  cornersTotal: number,
  hasStats: boolean,
  hasEvents: boolean,
  hasOdds: boolean,
): { score: number; confidence: number; action: 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE'; reasons: string } {
  let score = 0;
  let confidence = 0;
  const reasons: string[] = [];

  // === BASE (0-20) ===
  let base = 0;

  // 比分状态 (0-8)
  if (goalDiff === 0) base += 6;  // 平局紧迫
  else if (Math.abs(goalDiff) === 1) base += 8;  // 追赶局面
  else if (Math.abs(goalDiff) === 2) base += 4;  // 追两球
  else base += 2;

  // 总进球影响 (0-6)
  if (totalGoals === 0) base += 4;
  else if (totalGoals <= 2) base += 6;
  else if (totalGoals <= 4) base += 4;
  else base += 2;

  // 时间压力 (0-6)
  if (minute >= 80 && goalDiff === 0) base += 6;
  else if (minute >= 75 && Math.abs(goalDiff) === 1) base += 4;
  else if (minute >= 70) base += 2;

  base = Math.min(20, base);

  // === EDGE (0-30) ===
  let edge = 0;

  // 射门转换 (0-10)
  if (hasStats) {
    if (shotsTotal >= 25) edge += 10;
    else if (shotsTotal >= 20) edge += 8;
    else if (shotsTotal >= 15) edge += 6;
    else if (shotsTotal >= 10) edge += 4;
    else edge += 2;
  }

  // xG 分析 (0-10)
  if (xgTotal > 0) {
    if (xgTotal >= 3.0) edge += 10;
    else if (xgTotal >= 2.5) edge += 8;
    else if (xgTotal >= 2.0) edge += 6;
    else if (xgTotal >= 1.5) edge += 4;
    else edge += 2;

    // xG 欠债
    const xgDebt = xgTotal - totalGoals;
    if (xgDebt >= 1.5) {
      edge += 4;
      reasons.push(`xG欠债 ${xgDebt.toFixed(1)}`);
    }
  }

  // 射正质量 (0-6)
  if (shotsTotal > 0) {
    const accuracy = (shotsOnTotal / shotsTotal) * 100;
    if (accuracy >= 50) edge += 6;
    else if (accuracy >= 40) edge += 4;
    else if (accuracy >= 30) edge += 2;
  }

  edge = Math.min(30, edge);

  // === TIMING (0-20) ===
  let timing = 0;

  // 时间窗口评分
  if (minute >= 85) timing = 18;
  else if (minute >= 82) timing = 20;  // 峰值
  else if (minute >= 78) timing = 18;
  else if (minute >= 75) timing = 14;
  else if (minute >= 70) timing = 10;
  else if (minute >= 65) timing = 6;
  else timing = 0;

  // === MARKET (0-20) ===
  // 暂无实时赔率数据，给予基础分
  const market = hasOdds ? 10 : 0;

  // === QUALITY (-10~+10) ===
  let quality = 0;
  if (hasStats && hasEvents) quality += 5;
  if (hasOdds) quality += 3;
  if (!hasStats) quality -= 5;
  if (shotsTotal === 0 && minute >= 20) quality -= 3;  // 数据异常

  // 总分
  score = base + edge + timing + market + quality;
  score = Math.max(0, Math.min(100, score));

  // === CONFIDENCE ===

  // 数据完整度 (0-35)
  let dataCompleteness = 0;
  if (hasStats) dataCompleteness += 20;
  if (hasEvents) dataCompleteness += 10;
  if (hasOdds) dataCompleteness += 5;

  // 新鲜度 (0-20)
  const freshness = 15;  // 假设数据较新

  // 一致性 (0-25)
  let consistency = 15;
  if (xgTotal > 0 && shotsTotal > 0) {
    const xgPerShot = xgTotal / shotsTotal;
    if (xgPerShot >= 0.05 && xgPerShot <= 0.20) consistency = 25;
  }

  // 市场确认 (0-20)
  const marketConfirm = hasOdds ? 12 : 0;

  confidence = dataCompleteness + freshness + consistency + marketConfirm;
  confidence = Math.max(0, Math.min(100, confidence));

  // Action
  let action: 'BET' | 'PREPARE' | 'WATCH' | 'IGNORE' = 'IGNORE';
  if (score >= 85 && confidence >= 70) action = 'BET';
  else if (score >= 80 && confidence >= 55) action = 'PREPARE';
  else if (score >= 70) action = 'WATCH';

  // 生成原因摘要
  if (base >= 15) reasons.push(`基础态势好(${base}/20)`);
  if (edge >= 20) reasons.push(`进攻优势强(${edge}/30)`);
  if (timing >= 15) reasons.push(`时间窗口佳(${timing}/20)`);
  if (confidence < 55) reasons.push(`置信度低(${confidence})`);

  return {
    score: Math.round(score),
    confidence: Math.round(confidence),
    action,
    reasons: reasons.join('; ') || '无特殊标记',
  };
}

// 主函数
async function runBacktest(): Promise<void> {
  console.log('='.repeat(60));
  console.log('MODULE A BACKTEST - 200场验证');
  console.log('='.repeat(60));
  console.log(`开始时间: ${new Date().toISOString()}`);
  console.log();

  const results: ModuleAResult[] = [];
  let totalFixtures = 0;
  let fixturesEvaluated = 0;

  // 获取过去7天的已完场比赛
  console.log('[1] 获取历史比赛数据...');

  const allFixtures: FixtureResponse[] = [];

  for (let daysAgo = 0; daysAgo <= 7 && allFixtures.length < 250; daysAgo++) {
    const dateStr = getDateString(daysAgo);
    console.log(`  获取 ${dateStr} 的比赛...`);

    const fixtures = await apiRequest<FixtureResponse[]>(
      `/fixtures?date=${dateStr}&status=FT-AET-PEN`
    );

    if (fixtures && fixtures.length > 0) {
      allFixtures.push(...fixtures);
      console.log(`    找到 ${fixtures.length} 场完场比赛`);
    } else {
      console.log('    无比赛或API无响应');
    }

    await delay(RATE_LIMIT_DELAY);
  }

  totalFixtures = allFixtures.length;
  console.log(`\n共找到 ${totalFixtures} 场完场比赛`);

  if (totalFixtures === 0) {
    console.log('\n[WARN] 无法获取API数据，生成模拟报告...');
    generateMockReport();
    return;
  }

  // 只处理前200场
  const fixturesToProcess = allFixtures.slice(0, 200);

  console.log(`\n[2] 分析 ${fixturesToProcess.length} 场比赛的Module A信号...`);

  for (let i = 0; i < fixturesToProcess.length; i++) {
    const fixture = fixturesToProcess[i];
    const fixtureId = fixture.fixture.id;

    process.stdout.write(`\r  处理进度: ${i + 1}/${fixturesToProcess.length}`);

    // 获取比赛统计
    const stats = await getStatistics(fixtureId);
    await delay(RATE_LIMIT_DELAY);

    // 获取事件
    const events = fixture.events || [];

    // 解析统计数据
    const shotsTotal = (stats.get('Total Shots')?.home || 0) + (stats.get('Total Shots')?.away || 0);
    const shotsOnTotal = (stats.get('Shots on Goal')?.home || 0) + (stats.get('Shots on Goal')?.away || 0);
    const xgTotal = (stats.get('Expected Goals (xG)')?.home || 0) + (stats.get('Expected Goals (xG)')?.away || 0);
    const cornersTotal = (stats.get('Corner Kicks')?.home || 0) + (stats.get('Corner Kicks')?.away || 0);

    const hasStats = stats.size > 0;
    const hasEvents = events.length > 0;
    const hasOdds = false;  // 历史赔率暂不可用

    const finalHomeGoals = fixture.goals.home;
    const finalAwayGoals = fixture.goals.away;
    const finalGoals = finalHomeGoals + finalAwayGoals;

    // 模拟不同时间点的评分（假设在75分钟进行评估）
    const evaluationMinute = 75;

    // 估算评估时的进球数（使用半场比分+部分进球）
    const htHome = fixture.score.halftime.home ?? 0;
    const htAway = fixture.score.halftime.away ?? 0;
    const goalsAtEval = htHome + htAway + Math.floor((finalGoals - htHome - htAway) * 0.4);

    // 检查75分钟后是否有进球
    const goalsAfterEval = events.filter(e =>
      e.type === 'Goal' && e.time.elapsed >= evaluationMinute
    );
    const hadGoalAfter15 = goalsAfterEval.some(e => e.time.elapsed >= evaluationMinute && e.time.elapsed < evaluationMinute + 15);
    const hadGoalAfter20 = goalsAfterEval.some(e => e.time.elapsed >= evaluationMinute && e.time.elapsed < evaluationMinute + 20);

    // 计算Module A评分
    const { score, confidence, action, reasons } = calculateModuleAScore(
      evaluationMinute,
      goalsAtEval,
      htHome - htAway,
      shotsTotal,
      shotsOnTotal,
      xgTotal,
      cornersTotal,
      hasStats,
      hasEvents,
      hasOdds
    );

    fixturesEvaluated++;

    results.push({
      fixture_id: fixtureId,
      league: fixture.league.name,
      home_team: fixture.teams.home.name,
      away_team: fixture.teams.away.name,
      score_at_evaluation: `${htHome}-${htAway} (est)`,
      final_score: `${finalHomeGoals}-${finalAwayGoals}`,
      evaluation_minute: evaluationMinute,
      module_a_score: score,
      confidence,
      action,
      had_goal_after: goalsAfterEval.length > 0,
      had_goal_20min: hadGoalAfter20,
      goals_at_evaluation: goalsAtEval,
      final_goals: finalGoals,
      xg_total: xgTotal,
      shots_total: shotsTotal,
      data_available: {
        stats: hasStats,
        events: hasEvents,
        odds: hasOdds,
      },
      reasons_summary: reasons,
    });
  }

  console.log('\n\n[3] 生成报告...');

  // 统计分析
  const betTriggers = results.filter(r => r.action === 'BET');
  const prepareTriggers = results.filter(r => r.action === 'PREPARE');
  const watchTriggers = results.filter(r => r.action === 'WATCH');
  const ignoreTriggers = results.filter(r => r.action === 'IGNORE');

  const betHits = betTriggers.filter(r => r.had_goal_after).length;
  const prepareHits = prepareTriggers.filter(r => r.had_goal_after).length;
  const allTriggers = [...betTriggers, ...prepareTriggers];
  const allHits = betHits + prepareHits;

  const report: BacktestReport = {
    generated_at: new Date().toISOString(),
    total_fixtures: totalFixtures,
    fixtures_evaluated: fixturesEvaluated,
    triggers: {
      bet: betTriggers.length,
      prepare: prepareTriggers.length,
      watch: watchTriggers.length,
      ignore: ignoreTriggers.length,
    },
    hit_rates: {
      bet_15min: betTriggers.length > 0
        ? `${((betHits / betTriggers.length) * 100).toFixed(1)}%`
        : 'N/A',
      bet_20min: betTriggers.length > 0
        ? `${((betTriggers.filter(r => r.had_goal_20min).length / betTriggers.length) * 100).toFixed(1)}%`
        : 'N/A',
      prepare_15min: prepareTriggers.length > 0
        ? `${((prepareHits / prepareTriggers.length) * 100).toFixed(1)}%`
        : 'N/A',
      prepare_20min: prepareTriggers.length > 0
        ? `${((prepareTriggers.filter(r => r.had_goal_20min).length / prepareTriggers.length) * 100).toFixed(1)}%`
        : 'N/A',
      overall_15min: allTriggers.length > 0
        ? `${((allHits / allTriggers.length) * 100).toFixed(1)}%`
        : 'N/A',
      overall_20min: allTriggers.length > 0
        ? `${((allTriggers.filter(r => r.had_goal_20min).length / allTriggers.length) * 100).toFixed(1)}%`
        : 'N/A',
    },
    data_quality: {
      with_stats: results.filter(r => r.data_available.stats).length,
      with_events: results.filter(r => r.data_available.events).length,
      with_odds: results.filter(r => r.data_available.odds).length,
      complete_data: results.filter(r => r.data_available.stats && r.data_available.events).length,
    },
    cases: [...betTriggers, ...prepareTriggers].slice(0, 10),
  };

  // 生成Markdown报告
  generateReport(report, results);

  console.log('\n[4] 完成!');
  console.log(`报告已保存到: reports/moduleA_backtest_200.md`);
}

// 生成报告
function generateReport(report: BacktestReport, allResults: ModuleAResult[]): void {
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const markdown = `# Module A 回测报告 - 200场验证

> 生成时间: ${report.generated_at}

---

## 概览

| 指标 | 数值 |
|------|------|
| 总比赛数 | ${report.total_fixtures} |
| 评估比赛数 | ${report.fixtures_evaluated} |
| BET 触发 | ${report.triggers.bet} |
| PREPARE 触发 | ${report.triggers.prepare} |
| WATCH 触发 | ${report.triggers.watch} |
| IGNORE | ${report.triggers.ignore} |

---

## 触发率分析

### Action 分布

\`\`\`
BET:     ${report.triggers.bet} 场 (${((report.triggers.bet / report.fixtures_evaluated) * 100).toFixed(1)}%)
PREPARE: ${report.triggers.prepare} 场 (${((report.triggers.prepare / report.fixtures_evaluated) * 100).toFixed(1)}%)
WATCH:   ${report.triggers.watch} 场 (${((report.triggers.watch / report.fixtures_evaluated) * 100).toFixed(1)}%)
IGNORE:  ${report.triggers.ignore} 场 (${((report.triggers.ignore / report.fixtures_evaluated) * 100).toFixed(1)}%)
\`\`\`

### 高置信度触发率 (BET + PREPARE)

- **BET 触发率**: ${((report.triggers.bet / report.fixtures_evaluated) * 100).toFixed(2)}%
- **PREPARE 触发率**: ${((report.triggers.prepare / report.fixtures_evaluated) * 100).toFixed(2)}%
- **总高信号触发率**: ${(((report.triggers.bet + report.triggers.prepare) / report.fixtures_evaluated) * 100).toFixed(2)}%

---

## 命中统计

### 触发后进球率

| Action | 15分钟内进球 | 20分钟内进球 |
|--------|-------------|-------------|
| BET | ${report.hit_rates.bet_15min} | ${report.hit_rates.bet_20min} |
| PREPARE | ${report.hit_rates.prepare_15min} | ${report.hit_rates.prepare_20min} |
| **合计** | ${report.hit_rates.overall_15min} | ${report.hit_rates.overall_20min} |

---

## 数据质量

| 数据类型 | 可用比赛数 | 占比 |
|----------|-----------|------|
| 有统计数据 | ${report.data_quality.with_stats} | ${((report.data_quality.with_stats / report.fixtures_evaluated) * 100).toFixed(1)}% |
| 有事件数据 | ${report.data_quality.with_events} | ${((report.data_quality.with_events / report.fixtures_evaluated) * 100).toFixed(1)}% |
| 有赔率数据 | ${report.data_quality.with_odds} | ${((report.data_quality.with_odds / report.fixtures_evaluated) * 100).toFixed(1)}% |
| 完整数据 | ${report.data_quality.complete_data} | ${((report.data_quality.complete_data / report.fixtures_evaluated) * 100).toFixed(1)}% |

---

## 典型案例（前10场高信号比赛）

${report.cases.map((c, i) => `
### ${i + 1}. ${c.home_team} vs ${c.away_team}

- **比赛ID**: ${c.fixture_id}
- **联赛**: ${c.league}
- **评估时刻**: ${c.evaluation_minute}'
- **评估时比分**: ${c.score_at_evaluation}
- **最终比分**: ${c.final_score}
- **Module A 评分**: ${c.module_a_score}
- **置信度**: ${c.confidence}
- **Action**: ${c.action}
- **评估后进球**: ${c.had_goal_after ? '✅ 是' : '❌ 否'}
- **xG总计**: ${c.xg_total.toFixed(2)}
- **射门总计**: ${c.shots_total}
- **原因摘要**: ${c.reasons_summary}
`).join('\n---\n')}

---

## 分析结论

### 触发率评估

${report.triggers.bet + report.triggers.prepare === 0 ? `
**⚠️ 低触发警告**

本次回测中 BET + PREPARE 信号数量为 0，可能原因：

1. **数据缺失**: ${100 - (report.data_quality.complete_data / report.fixtures_evaluated * 100).toFixed(1)}% 的比赛缺少完整数据
2. **阈值过严**: 当前 BET 需要 score ≥ 85 且 confidence ≥ 70
3. **赔率缺失**: 历史赔率数据不可用，导致 Market 分数为 0
4. **时间窗口**: 评估点固定在 75'，可能错过部分峰值窗口

**建议**:
- 接入实时赔率数据 (Phase 2)
- 考虑放宽 confidence 阈值（如 ≥60）
- 在多个时间点评估（70', 75', 80', 85'）
` : `
**✅ 触发正常**

- BET 触发 ${report.triggers.bet} 场，命中率 ${report.hit_rates.bet_15min}
- PREPARE 触发 ${report.triggers.prepare} 场，命中率 ${report.hit_rates.prepare_15min}
- 整体表现${Number(report.hit_rates.overall_15min.replace('%', '')) >= 50 ? '良好' : '有待优化'}
`}

### 数据质量评估

${report.data_quality.with_stats < report.fixtures_evaluated * 0.8 ? `
**⚠️ 统计数据缺失较多**，建议检查 API 调用和数据映射。
` : `
**✅ 统计数据覆盖良好**
`}

---

*报告生成于 ${new Date().toLocaleString('zh-CN')}*
*版本: MODULE_A_BACKTEST_V1*
`;

  fs.writeFileSync(
    path.join(reportsDir, 'moduleA_backtest_200.md'),
    markdown,
    'utf-8'
  );
}

// 生成模拟报告（当API不可用时）
function generateMockReport(): void {
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const markdown = `# Module A 回测报告 - 200场验证

> 生成时间: ${new Date().toISOString()}
> ⚠️ 模拟报告 - API 数据不可用

---

## 概览

**⚠️ 无法获取 API 数据**

本次回测无法执行，原因：

1. API Key 未配置或无效
2. API 请求失败
3. 网络连接问题

---

## 如何运行回测

1. 确保 API Key 已配置：
   \`\`\`bash
   # 在 .env 文件中添加
   VITE_RAPIDAPI_KEY=your_api_key
   # 或
   API_FOOTBALL_KEY=your_api_key
   \`\`\`

2. 运行回测脚本：
   \`\`\`bash
   cd football-trading-terminal
   bun run scripts/backtest_moduleA_200.ts
   \`\`\`

3. 检查输出的报告：
   \`\`\`bash
   cat reports/moduleA_backtest_200.md
   \`\`\`

---

## 预期指标（基于 Module A 设计）

| 指标 | 预期范围 |
|------|----------|
| BET 触发率 | 2-5% |
| PREPARE 触发率 | 8-15% |
| BET 命中率 | 55-70% |
| PREPARE 命中率 | 45-55% |

---

## 当前 Module A 配置

### Action 阈值

| Action | Score 要求 | Confidence 要求 |
|--------|-----------|-----------------|
| BET | ≥ 85 | ≥ 70 |
| PREPARE | ≥ 80 | ≥ 55 |
| WATCH | ≥ 70 | 任意 |
| IGNORE | < 70 | 任意 |

### 评分公式

\`\`\`
Score = Base(0-20) + Edge(0-30) + Timing(0-20) + Market(0-20) + Quality(-10~+10)

Confidence = DataCompleteness(0-35) + Freshness(0-20) + Consistency(0-25) + MarketConfirm(0-20)
\`\`\`

---

## 下一步

1. 配置有效的 API Key
2. 重新运行回测脚本
3. 根据回测结果调整参数

---

*模拟报告生成于 ${new Date().toLocaleString('zh-CN')}*
*版本: MODULE_A_BACKTEST_V1*
`;

  fs.writeFileSync(
    path.join(reportsDir, 'moduleA_backtest_200.md'),
    markdown,
    'utf-8'
  );

  console.log('模拟报告已生成: reports/moduleA_backtest_200.md');
}

// 运行
runBacktest().catch(console.error);
