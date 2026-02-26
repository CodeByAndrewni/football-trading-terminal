/**
 * ============================================
 * 晚期模块回测脚本
 * 验证 UnifiedLateModule 在历史数据上的表现
 *
 * 使用方式:
 *   bun run src/scripts/backtestLateModule.ts
 *
 * Version: 1.0
 * ============================================
 */

import {
  calculateUnifiedLateSignal,
  type UnifiedLateSignal,
  type ScenarioTag,
} from '../services/modules/unifiedLateModule';
import type { MatchStateInput, MarketStateInput } from '../types/unified-scoring';

// ============================================
// 类型定义
// ============================================

interface HistoricalMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  finalScore: { home: number; away: number };
  // 各时间点快照
  snapshots: MatchSnapshot[];
}

interface MatchSnapshot {
  minute: number;
  score: { home: number; away: number };
  stats: {
    shots: { home: number; away: number };
    shotsOn: { home: number; away: number };
    xg: { home: number; away: number };
    corners: { home: number; away: number };
    possession: { home: number; away: number };
  };
  odds?: {
    overOdds: number;
    underOdds: number;
    ouLine: number;
    ahLine: number;
    ahHome: number;
    ahAway: number;
  };
}

interface BacktestResult {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  minute: number;
  signalScore: number;
  confidence: number;
  action: string;
  scenario: ScenarioTag;
  // 结果验证
  predictedOutcome: 'OVER' | 'UNDER' | 'AH_HOME' | 'AH_AWAY' | null;
  actualGoalsAfter: number;  // 信号后实际进球数
  signalCorrect: boolean | null;
  // 盈亏
  potentialProfit: number;  // 假设 1 单位下注
}

interface BacktestSummary {
  totalMatches: number;
  totalSignals: number;
  signalsByAction: Record<string, number>;
  signalsByScenario: Record<string, number>;
  // 准确率
  betSignals: number;
  betCorrect: number;
  betAccuracy: number;
  prepareSignals: number;
  prepareCorrect: number;
  prepareAccuracy: number;
  // 盈亏
  totalProfit: number;
  roi: number;
  // 时间分布
  signalsByMinute: Record<number, number>;
}

// ============================================
// 模拟历史数据生成 (实际使用时替换为真实历史数据)
// ============================================

function generateMockHistoricalData(): HistoricalMatch[] {
  const matches: HistoricalMatch[] = [];

  // 场景 1: 大球冲刺成功 - 75分钟0-0，最终1-1
  matches.push({
    id: 1001,
    homeTeam: '曼城',
    awayTeam: '利物浦',
    league: '英超',
    finalScore: { home: 1, away: 1 },
    snapshots: [
      {
        minute: 65,
        score: { home: 0, away: 0 },
        stats: {
          shots: { home: 8, away: 6 },
          shotsOn: { home: 4, away: 3 },
          xg: { home: 1.2, away: 0.9 },
          corners: { home: 5, away: 4 },
          possession: { home: 55, away: 45 },
        },
        odds: { overOdds: 1.65, underOdds: 2.20, ouLine: 2.5, ahLine: -0.5, ahHome: 1.85, ahAway: 1.95 },
      },
      {
        minute: 75,
        score: { home: 0, away: 0 },
        stats: {
          shots: { home: 12, away: 8 },
          shotsOn: { home: 6, away: 4 },
          xg: { home: 1.8, away: 1.2 },
          corners: { home: 7, away: 5 },
          possession: { home: 52, away: 48 },
        },
        odds: { overOdds: 1.55, underOdds: 2.40, ouLine: 2.5, ahLine: -0.25, ahHome: 1.90, ahAway: 1.90 },
      },
      {
        minute: 85,
        score: { home: 1, away: 0 },
        stats: {
          shots: { home: 15, away: 10 },
          shotsOn: { home: 8, away: 5 },
          xg: { home: 2.1, away: 1.5 },
          corners: { home: 8, away: 6 },
          possession: { home: 50, away: 50 },
        },
        odds: { overOdds: 1.35, underOdds: 3.00, ouLine: 2.5, ahLine: -0.5, ahHome: 1.70, ahAway: 2.10 },
      },
    ],
  });

  // 场景 2: 强队追分成功 - 70分钟0-1落后，最终2-1
  matches.push({
    id: 1002,
    homeTeam: '皇马',
    awayTeam: '马竞',
    league: '西甲',
    finalScore: { home: 2, away: 1 },
    snapshots: [
      {
        minute: 70,
        score: { home: 0, away: 1 },
        stats: {
          shots: { home: 10, away: 4 },
          shotsOn: { home: 5, away: 2 },
          xg: { home: 1.5, away: 0.6 },
          corners: { home: 6, away: 2 },
          possession: { home: 62, away: 38 },
        },
        odds: { overOdds: 1.75, underOdds: 2.05, ouLine: 2.5, ahLine: -1.0, ahHome: 2.00, ahAway: 1.80 },
      },
      {
        minute: 80,
        score: { home: 1, away: 1 },
        stats: {
          shots: { home: 14, away: 5 },
          shotsOn: { home: 7, away: 2 },
          xg: { home: 2.0, away: 0.7 },
          corners: { home: 8, away: 3 },
          possession: { home: 65, away: 35 },
        },
        odds: { overOdds: 1.50, underOdds: 2.50, ouLine: 2.5, ahLine: -0.5, ahHome: 1.75, ahAway: 2.05 },
      },
    ],
  });

  // 场景 3: 大比分 - 信号应该减弱
  matches.push({
    id: 1003,
    homeTeam: '拜仁',
    awayTeam: '多特',
    league: '德甲',
    finalScore: { home: 4, away: 0 },
    snapshots: [
      {
        minute: 75,
        score: { home: 3, away: 0 },
        stats: {
          shots: { home: 18, away: 6 },
          shotsOn: { home: 10, away: 2 },
          xg: { home: 3.2, away: 0.5 },
          corners: { home: 10, away: 3 },
          possession: { home: 70, away: 30 },
        },
        odds: { overOdds: 1.20, underOdds: 4.00, ouLine: 3.5, ahLine: -2.5, ahHome: 1.85, ahAway: 1.95 },
      },
    ],
  });

  // 场景 4: 破僵局 - 0-0到85分钟
  matches.push({
    id: 1004,
    homeTeam: '尤文',
    awayTeam: '国米',
    league: '意甲',
    finalScore: { home: 0, away: 0 },
    snapshots: [
      {
        minute: 85,
        score: { home: 0, away: 0 },
        stats: {
          shots: { home: 6, away: 5 },
          shotsOn: { home: 2, away: 2 },
          xg: { home: 0.8, away: 0.7 },
          corners: { home: 4, away: 3 },
          possession: { home: 48, away: 52 },
        },
        odds: { overOdds: 3.00, underOdds: 1.35, ouLine: 0.5, ahLine: 0, ahHome: 1.90, ahAway: 1.90 },
      },
    ],
  });

  // 场景 5: 1-1僵持，最终2-2
  matches.push({
    id: 1005,
    homeTeam: '切尔西',
    awayTeam: '阿森纳',
    league: '英超',
    finalScore: { home: 2, away: 2 },
    snapshots: [
      {
        minute: 80,
        score: { home: 1, away: 1 },
        stats: {
          shots: { home: 9, away: 8 },
          shotsOn: { home: 4, away: 4 },
          xg: { home: 1.4, away: 1.3 },
          corners: { home: 5, away: 5 },
          possession: { home: 50, away: 50 },
        },
        odds: { overOdds: 1.60, underOdds: 2.30, ouLine: 2.5, ahLine: 0, ahHome: 1.88, ahAway: 1.92 },
      },
    ],
  });

  return matches;
}

// ============================================
// 回测核心逻辑
// ============================================

function runBacktest(matches: HistoricalMatch[]): BacktestResult[] {
  const results: BacktestResult[] = [];

  for (const match of matches) {
    for (const snapshot of match.snapshots) {
      // 只处理 65+ 分钟的快照
      if (snapshot.minute < 65) continue;

      // 构建 MatchStateInput
      const matchState: MatchStateInput = {
        fixture_id: match.id,
        minute: snapshot.minute,
        score_home: snapshot.score.home,
        score_away: snapshot.score.away,
        shots_home: snapshot.stats.shots.home,
        shots_away: snapshot.stats.shots.away,
        shots_on_home: snapshot.stats.shotsOn.home,
        shots_on_away: snapshot.stats.shotsOn.away,
        xg_home: snapshot.stats.xg.home,
        xg_away: snapshot.stats.xg.away,
        corners_home: snapshot.stats.corners.home,
        corners_away: snapshot.stats.corners.away,
        possession_home: snapshot.stats.possession.home,
        possession_away: snapshot.stats.possession.away,
        dangerous_home: 0,
        dangerous_away: 0,
        shots_last_15: Math.round(snapshot.stats.shots.home * 0.3 + snapshot.stats.shots.away * 0.3),
        xg_last_15: (snapshot.stats.xg.home + snapshot.stats.xg.away) * 0.25,
        shots_prev_15: Math.round(snapshot.stats.shots.home * 0.2 + snapshot.stats.shots.away * 0.2),
        corners_last_15: Math.round((snapshot.stats.corners.home + snapshot.stats.corners.away) * 0.2),
        stats_available: true,
        events_available: true,
      };

      // 构建 MarketStateInput
      let marketState: MarketStateInput | null = null;
      if (snapshot.odds) {
        marketState = {
          over_odds: snapshot.odds.overOdds,
          under_odds: snapshot.odds.underOdds,
          over_odds_prev: snapshot.odds.overOdds + 0.05, // 模拟之前赔率略高
          ou_line: snapshot.odds.ouLine,
          ah_line: snapshot.odds.ahLine,
          ah_home: snapshot.odds.ahHome,
          ah_away: snapshot.odds.ahAway,
          win_home: null,
          win_draw: null,
          win_away: null,
          is_live: true,
        };
      }

      // 计算信号
      const signal = calculateUnifiedLateSignal(matchState, marketState);

      // 验证结果
      const goalsAtSignal = snapshot.score.home + snapshot.score.away;
      const finalGoals = match.finalScore.home + match.finalScore.away;
      const goalsAfter = finalGoals - goalsAtSignal;

      // 判断信号正确性 (简化: 只看大球)
      let predictedOutcome: BacktestResult['predictedOutcome'] = null;
      let signalCorrect: boolean | null = null;
      let potentialProfit = 0;

      if (signal.action === 'BET' || signal.action === 'PREPARE') {
        if (signal.scenario_tag === 'OVER_SPRINT' || signal.scenario_tag === 'DEADLOCK_BREAK') {
          // 大球信号
          predictedOutcome = 'OVER';
          const ouLine = snapshot.odds?.ouLine ?? 2.5;
          signalCorrect = finalGoals > ouLine;
          potentialProfit = signalCorrect
            ? (snapshot.odds?.overOdds ?? 1.8) - 1
            : -1;
        } else if (signal.scenario_tag === 'STRONG_BEHIND') {
          // 强队追分 - 暂时也用大球验证
          predictedOutcome = 'OVER';
          signalCorrect = goalsAfter > 0;
          potentialProfit = signalCorrect
            ? (snapshot.odds?.overOdds ?? 1.8) - 1
            : -1;
        }
      }

      results.push({
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        minute: snapshot.minute,
        signalScore: signal.score,
        confidence: signal.confidence,
        action: signal.action,
        scenario: signal.scenario_tag,
        predictedOutcome,
        actualGoalsAfter: goalsAfter,
        signalCorrect,
        potentialProfit,
      });
    }
  }

  return results;
}

// ============================================
// 生成回测报告
// ============================================

function generateSummary(results: BacktestResult[]): BacktestSummary {
  const summary: BacktestSummary = {
    totalMatches: new Set(results.map(r => r.matchId)).size,
    totalSignals: results.length,
    signalsByAction: {},
    signalsByScenario: {},
    betSignals: 0,
    betCorrect: 0,
    betAccuracy: 0,
    prepareSignals: 0,
    prepareCorrect: 0,
    prepareAccuracy: 0,
    totalProfit: 0,
    roi: 0,
    signalsByMinute: {},
  };

  for (const r of results) {
    // 按 action 统计
    summary.signalsByAction[r.action] = (summary.signalsByAction[r.action] ?? 0) + 1;

    // 按场景统计
    summary.signalsByScenario[r.scenario] = (summary.signalsByScenario[r.scenario] ?? 0) + 1;

    // 按分钟统计
    const minBucket = Math.floor(r.minute / 5) * 5;
    summary.signalsByMinute[minBucket] = (summary.signalsByMinute[minBucket] ?? 0) + 1;

    // BET 信号统计
    if (r.action === 'BET') {
      summary.betSignals++;
      if (r.signalCorrect === true) summary.betCorrect++;
      summary.totalProfit += r.potentialProfit;
    }

    // PREPARE 信号统计
    if (r.action === 'PREPARE') {
      summary.prepareSignals++;
      if (r.signalCorrect === true) summary.prepareCorrect++;
      summary.totalProfit += r.potentialProfit * 0.5; // PREPARE 注码减半
    }
  }

  // 计算准确率
  if (summary.betSignals > 0) {
    summary.betAccuracy = (summary.betCorrect / summary.betSignals) * 100;
  }
  if (summary.prepareSignals > 0) {
    summary.prepareAccuracy = (summary.prepareCorrect / summary.prepareSignals) * 100;
  }

  // 计算 ROI
  const totalStake = summary.betSignals + summary.prepareSignals * 0.5;
  if (totalStake > 0) {
    summary.roi = (summary.totalProfit / totalStake) * 100;
  }

  return summary;
}

// ============================================
// 打印报告
// ============================================

function printReport(results: BacktestResult[], summary: BacktestSummary): void {
  console.log('\n' + '='.repeat(60));
  console.log('           晚期模块回测报告 (UnifiedLateModule v1.0)');
  console.log('='.repeat(60));

  console.log('\n📊 概览:');
  console.log(`  比赛数量: ${summary.totalMatches}`);
  console.log(`  信号总数: ${summary.totalSignals}`);

  console.log('\n📈 信号分布 (按行动):');
  for (const [action, count] of Object.entries(summary.signalsByAction)) {
    const pct = ((count / summary.totalSignals) * 100).toFixed(1);
    console.log(`  ${action}: ${count} (${pct}%)`);
  }

  console.log('\n🏷️ 信号分布 (按场景):');
  for (const [scenario, count] of Object.entries(summary.signalsByScenario)) {
    const pct = ((count / summary.totalSignals) * 100).toFixed(1);
    console.log(`  ${scenario}: ${count} (${pct}%)`);
  }

  console.log('\n⏱️ 时间分布:');
  for (const [minute, count] of Object.entries(summary.signalsByMinute).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const bar = '█'.repeat(Math.min(count * 2, 20));
    console.log(`  ${minute}'-${Number(minute) + 4}': ${bar} ${count}`);
  }

  console.log('\n🎯 准确率:');
  console.log(`  BET 信号: ${summary.betCorrect}/${summary.betSignals} (${summary.betAccuracy.toFixed(1)}%)`);
  console.log(`  PREPARE 信号: ${summary.prepareCorrect}/${summary.prepareSignals} (${summary.prepareAccuracy.toFixed(1)}%)`);

  console.log('\n💰 盈亏:');
  console.log(`  总盈亏: ${summary.totalProfit >= 0 ? '+' : ''}${summary.totalProfit.toFixed(2)} 单位`);
  console.log(`  ROI: ${summary.roi >= 0 ? '+' : ''}${summary.roi.toFixed(1)}%`);

  console.log('\n📋 信号详情:');
  console.log('-'.repeat(100));
  console.log(
    '比赛'.padEnd(20) +
    '分钟'.padEnd(6) +
    '分数'.padEnd(8) +
    '置信'.padEnd(8) +
    '行动'.padEnd(10) +
    '场景'.padEnd(16) +
    '预测'.padEnd(8) +
    '后续进球'.padEnd(10) +
    '结果'.padEnd(6) +
    '盈亏'
  );
  console.log('-'.repeat(100));

  for (const r of results) {
    if (r.action === 'IGNORE') continue; // 跳过 IGNORE

    const matchName = `${r.homeTeam} vs ${r.awayTeam}`.slice(0, 18);
    const resultIcon = r.signalCorrect === true ? '✅' : r.signalCorrect === false ? '❌' : '—';
    const profitStr = r.potentialProfit !== 0
      ? (r.potentialProfit >= 0 ? '+' : '') + r.potentialProfit.toFixed(2)
      : '—';

    console.log(
      matchName.padEnd(20) +
      String(r.minute).padEnd(6) +
      String(r.signalScore).padEnd(8) +
      String(r.confidence).padEnd(8) +
      r.action.padEnd(10) +
      r.scenario.padEnd(16) +
      (r.predictedOutcome ?? '—').padEnd(8) +
      String(r.actualGoalsAfter).padEnd(10) +
      resultIcon.padEnd(6) +
      profitStr
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('回测完成');
  console.log('='.repeat(60) + '\n');
}

// ============================================
// 主函数
// ============================================

function main(): void {
  console.log('🚀 开始晚期模块回测...\n');

  // 生成模拟历史数据 (实际使用时替换为真实数据)
  const historicalMatches = generateMockHistoricalData();
  console.log(`📥 加载了 ${historicalMatches.length} 场历史比赛`);

  // 运行回测
  const results = runBacktest(historicalMatches);
  console.log(`📊 生成了 ${results.length} 个信号点`);

  // 生成摘要
  const summary = generateSummary(results);

  // 打印报告
  printReport(results, summary);
}

// 运行
main();
