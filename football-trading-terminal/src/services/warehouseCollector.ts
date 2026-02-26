// ============================================================
// WAREHOUSE COLLECTOR SERVICE - Phase 2A Task 5
// 80+ Warehouse Collector: 采集 → 验证 → 写入
// ============================================================
//
// 功能:
// 1. 每60秒采集 fixtures/live + statistics + odds/live
// 2. 只写入验证通过的真实数据 (NULL for missing)
// 3. 80-95分钟运行 Module A 评分
// 4. 写入 model_signals 表
// ============================================================

import { supabase } from '../lib/supabase';
import type { Match, TeamStatistics, MatchEvent, LiveOddsData } from '../types';
import type { AdvancedMatch } from '../data/advancedMockData';
import type { UnifiedSignal } from '../types/unified-scoring';
import { validateAllData, canWriteToWarehouse, type DataValidationResult } from './dataValidation';
import { convertApiMatchToAdvanced } from './apiConverter';
import { calculateSignalFromMatch } from './unifiedScoringEngine';

// ============================================================
// 使用 API-Football SDK (统一缓存和错误处理)
// ============================================================
import * as SDK from './apiFootballSDK';

// ============================================================
// Types
// ============================================================

export interface CollectorStats {
  // 采集统计
  fixtures_fetched: number;
  fixtures_with_stats: number;
  fixtures_with_odds: number;
  fixtures_80_plus: number;

  // 验证统计
  data_quality_real: number;
  data_quality_partial: number;
  data_quality_invalid: number;

  // 写入统计
  raw_fixtures_written: number;
  raw_statistics_written: number;
  raw_odds_written: number;
  model_signals_written: number;

  // 信号统计
  signals_generated: number;
  signals_bet: number;
  signals_prepare: number;
  signals_watch: number;

  // 错误统计
  write_errors: number;
  error_messages: string[];

  // 时间戳
  collection_started_at: string;
  collection_finished_at: string;
  duration_ms: number;
}

export interface RawFixtureInsert {
  fixture_id: number;
  league_id: number;
  season: number;
  match_date: string;
  kickoff: string;
  home_team_id: number;
  away_team_id: number;
  home_team_name: string | null;
  away_team_name: string | null;
  home_score: number | null;
  away_score: number | null;
  ht_home_score: number | null;
  ht_away_score: number | null;
  status: string;
  venue_id: number | null;
  venue_name: string | null;
  referee: string | null;
  raw: object;
}

export interface RawStatisticsInsert {
  fixture_id: number;
  minute: number;
  shots_home: number | null;
  shots_away: number | null;
  shots_on_home: number | null;
  shots_on_away: number | null;
  xg_home: number | null;
  xg_away: number | null;
  corners_home: number | null;
  corners_away: number | null;
  possession_home: number | null;
  possession_away: number | null;
  dangerous_home: number | null;
  dangerous_away: number | null;
  fouls_home: number | null;
  fouls_away: number | null;
  raw: object;
}

export interface RawOddsInsert {
  fixture_id: number;
  bookmaker: string;
  bookmaker_id: number | null;
  market: string;
  line: number | null;
  selection: string;
  odds: number;
  is_live: boolean;
  raw: object;
}

export interface ModelSignalInsert {
  fixture_id: number;
  module_type: string;
  module_version: string;
  trigger_minute: number;
  trigger_score_home: number;
  trigger_score_away: number;
  heat_score: number;
  confidence_score: number;
  signal_type: string;
  signal_strength: string;
  factors: object;
  reasons: object;
  predicted_outcome: string | null;
  predicted_confidence: number | null;
}

// ============================================================
// Collector Class
// ============================================================

export class WarehouseCollector {
  private stats: CollectorStats;
  private isRunning = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.stats = this.createEmptyStats();
  }

  private createEmptyStats(): CollectorStats {
    return {
      fixtures_fetched: 0,
      fixtures_with_stats: 0,
      fixtures_with_odds: 0,
      fixtures_80_plus: 0,
      data_quality_real: 0,
      data_quality_partial: 0,
      data_quality_invalid: 0,
      raw_fixtures_written: 0,
      raw_statistics_written: 0,
      raw_odds_written: 0,
      model_signals_written: 0,
      signals_generated: 0,
      signals_bet: 0,
      signals_prepare: 0,
      signals_watch: 0,
      write_errors: 0,
      error_messages: [],
      collection_started_at: '',
      collection_finished_at: '',
      duration_ms: 0,
    };
  }

  // ============================================================
  // Main Collection Loop
  // ============================================================

  /**
   * 开始自动采集 (每60秒)
   */
  startAutoCollection(intervalMs = 60000): void {
    if (this.isRunning) {
      console.warn('[WAREHOUSE] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[WAREHOUSE] Starting auto-collection every ${intervalMs / 1000}s`);

    // 立即执行一次
    this.runCollection();

    // 设置定时器
    this.intervalId = setInterval(() => {
      this.runCollection();
    }, intervalMs);
  }

  /**
   * 停止自动采集
   */
  stopAutoCollection(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[WAREHOUSE] Stopped auto-collection');
  }

  /**
   * 执行一次采集
   */
  async runCollection(): Promise<CollectorStats> {
    this.stats = this.createEmptyStats();
    this.stats.collection_started_at = new Date().toISOString();
    const startTime = Date.now();

    console.log(`[WAREHOUSE] Collection started at ${this.stats.collection_started_at}`);

    try {
      // 1. 获取所有进行中的比赛
      const matches = await this.fetchLiveMatches();
      this.stats.fixtures_fetched = matches.length;

      if (matches.length === 0) {
        console.log('[WAREHOUSE] No live matches');
        return this.finishCollection(startTime);
      }

      // 2. 获取统计数据和赔率
      const { statisticsMap, oddsMap, eventsMap } = await this.fetchMatchDetails(matches);

      this.stats.fixtures_with_stats = statisticsMap.size;
      this.stats.fixtures_with_odds = oddsMap.size;

      // 3. 转换并验证数据
      const validatedMatches: Array<{
        match: Match;
        advanced: AdvancedMatch;
        validation: DataValidationResult;
        statistics?: TeamStatistics[];
        odds?: LiveOddsData[];
        events?: MatchEvent[];
      }> = [];

      for (const match of matches) {
        const stats = statisticsMap.get(match.fixture.id);
        const odds = oddsMap.get(match.fixture.id);
        const events = eventsMap.get(match.fixture.id);

        // 转换为 AdvancedMatch
        const advanced = convertApiMatchToAdvanced(match, stats, events, undefined, odds);
        if (!advanced) continue;

        // 验证数据
        const validation = validateAllData(match, stats, events, odds);

        // 统计数据质量
        if (validation.data_quality === 'REAL') this.stats.data_quality_real++;
        else if (validation.data_quality === 'PARTIAL') this.stats.data_quality_partial++;
        else this.stats.data_quality_invalid++;

        validatedMatches.push({
          match,
          advanced,
          validation,
          statistics: stats,
          odds,
          events,
        });
      }

      // 4. 写入 RAW 层 (只写入可写入仓库的数据)
      for (const { match, validation, statistics, odds } of validatedMatches) {
        if (!canWriteToWarehouse(validation)) {
          console.log(`[WAREHOUSE] Skipping fixture ${match.fixture.id} - invalid data`);
          continue;
        }

        // 写入 raw_fixtures
        const fixtureWritten = await this.writeRawFixture(match);
        if (fixtureWritten) this.stats.raw_fixtures_written++;

        // 写入 raw_statistics
        if (statistics && validation.stats_real) {
          const statsWritten = await this.writeRawStatistics(match.fixture.id, match.fixture.status.elapsed ?? 0, statistics);
          if (statsWritten) this.stats.raw_statistics_written++;
        }

        // 写入 raw_odds
        if (odds && validation.odds_real) {
          const oddsWritten = await this.writeRawOdds(match.fixture.id, odds);
          this.stats.raw_odds_written += oddsWritten;
        }
      }

      // 5. 筛选 80-95 分钟比赛，生成 Module A 信号
      const matches80Plus = validatedMatches.filter(
        m => m.advanced.minute >= 65 && m.advanced.minute <= 95 && !m.advanced._unscoreable
      );
      this.stats.fixtures_80_plus = matches80Plus.length;

      for (const { advanced, validation } of matches80Plus) {
        // 只有真实数据才生成信号
        if (validation.data_quality === 'INVALID') continue;

        const signal = calculateSignalFromMatch('A', advanced);
        if (signal) {
          this.stats.signals_generated++;

          // 统计 action 类型
          if (signal.action === 'BET') this.stats.signals_bet++;
          else if (signal.action === 'PREPARE') this.stats.signals_prepare++;
          else if (signal.action === 'WATCH') this.stats.signals_watch++;

          // 写入 model_signals
          const signalWritten = await this.writeModelSignal(signal, advanced);
          if (signalWritten) this.stats.model_signals_written++;
        }
      }

      return this.finishCollection(startTime);
    } catch (error) {
      this.stats.write_errors++;
      this.stats.error_messages.push(
        error instanceof Error ? error.message : 'Unknown error'
      );
      console.error('[WAREHOUSE] Collection error:', error);
      return this.finishCollection(startTime);
    }
  }

  private finishCollection(startTime: number): CollectorStats {
    this.stats.collection_finished_at = new Date().toISOString();
    this.stats.duration_ms = Date.now() - startTime;

    console.log(`[WAREHOUSE] Collection finished in ${this.stats.duration_ms}ms`);
    console.log(`[WAREHOUSE] Stats: fixtures=${this.stats.fixtures_fetched} ` +
      `stats=${this.stats.fixtures_with_stats} odds=${this.stats.fixtures_with_odds} ` +
      `80+=${this.stats.fixtures_80_plus} signals=${this.stats.signals_generated}`);
    console.log(`[WAREHOUSE] Quality: REAL=${this.stats.data_quality_real} ` +
      `PARTIAL=${this.stats.data_quality_partial} INVALID=${this.stats.data_quality_invalid}`);
    console.log(`[WAREHOUSE] Written: fixtures=${this.stats.raw_fixtures_written} ` +
      `stats=${this.stats.raw_statistics_written} odds=${this.stats.raw_odds_written} ` +
      `signals=${this.stats.model_signals_written}`);

    return this.stats;
  }

  // ============================================================
  // Data Fetching (使用 API-Football SDK)
  // [已优化] 统一使用SDK的缓存和错误处理
  // ============================================================

  private async fetchLiveMatches(): Promise<Match[]> {
    // [已迁移] 使用SDK，自动享受缓存
    return SDK.getLiveFixtures();
  }

  private async fetchMatchDetails(matches: Match[]): Promise<{
    statisticsMap: Map<number, TeamStatistics[]>;
    oddsMap: Map<number, LiveOddsData[]>;
    eventsMap: Map<number, MatchEvent[]>;
  }> {
    const statisticsMap = new Map<number, TeamStatistics[]>();
    const oddsMap = new Map<number, LiveOddsData[]>();
    const eventsMap = new Map<number, MatchEvent[]>();

    // 分批获取，避免速率限制
    // [优化] 增加批次大小，SDK有缓存减少重复请求
    const batchSize = 5;

    for (let i = 0; i < matches.length; i += batchSize) {
      const batch = matches.slice(i, i + batchSize);

      await Promise.all(batch.map(async (match) => {
        const fixtureId = match.fixture.id;

        // [已迁移] 使用SDK获取统计数据
        try {
          const stats = await SDK.getFixtureStatistics(fixtureId);
          if (stats && stats.length > 0) {
            statisticsMap.set(fixtureId, stats);
          }
        } catch (e) {
          console.warn(`[WAREHOUSE] Failed to fetch stats for ${fixtureId}:`, e);
        }

        // [已迁移] 使用SDK获取赔率数据
        try {
          const odds = await SDK.getLiveOdds(fixtureId);
          if (odds && odds.length > 0) {
            oddsMap.set(fixtureId, odds);
          }
        } catch (e) {
          console.warn(`[WAREHOUSE] Failed to fetch odds for ${fixtureId}:`, e);
        }

        // [已迁移] 使用SDK获取事件数据
        try {
          const events = await SDK.getFixtureEvents(fixtureId);
          if (events && events.length > 0) {
            eventsMap.set(fixtureId, events);
          }
        } catch (e) {
          console.warn(`[WAREHOUSE] Failed to fetch events for ${fixtureId}:`, e);
        }
      }));

      // 批次间延迟 - SDK有缓存，可以减少延迟
      if (i + batchSize < matches.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { statisticsMap, oddsMap, eventsMap };
  }

  // ============================================================
  // Database Write Functions
  // ============================================================

  private async writeRawFixture(match: Match): Promise<boolean> {
    const insert: RawFixtureInsert = {
      fixture_id: match.fixture.id,
      league_id: match.league.id,
      season: match.league.season ?? new Date().getFullYear(),
      match_date: new Date(match.fixture.date).toISOString().split('T')[0],
      kickoff: match.fixture.date,
      home_team_id: match.teams.home.id,
      away_team_id: match.teams.away.id,
      home_team_name: match.teams.home.name ?? null,
      away_team_name: match.teams.away.name ?? null,
      home_score: match.goals.home ?? null,
      away_score: match.goals.away ?? null,
      ht_home_score: match.score?.halftime?.home ?? null,
      ht_away_score: match.score?.halftime?.away ?? null,
      status: match.fixture.status.short,
      venue_id: match.fixture.venue?.id ?? null,
      venue_name: match.fixture.venue?.name ?? null,
      referee: match.fixture.referee ?? null,
      raw: match,
    };

    const { error } = await supabase
      .from('raw_fixtures')
      .upsert(insert, { onConflict: 'fixture_id' });

    if (error) {
      this.stats.write_errors++;
      this.stats.error_messages.push(`raw_fixtures: ${error.message}`);
      console.error('[WAREHOUSE] raw_fixtures write error:', error);
      return false;
    }

    return true;
  }

  private async writeRawStatistics(
    fixtureId: number,
    minute: number,
    statistics: TeamStatistics[]
  ): Promise<boolean> {
    const homeStats = statistics[0]?.statistics ?? [];
    const awayStats = statistics[1]?.statistics ?? [];

    const getStat = (stats: any[], type: string): number | null => {
      const stat = stats.find(s => s.type === type);
      if (!stat || stat.value === null) return null;
      if (typeof stat.value === 'string') {
        const cleaned = stat.value.replace('%', '');
        return Number.parseFloat(cleaned) || null;
      }
      return stat.value;
    };

    const insert: RawStatisticsInsert = {
      fixture_id: fixtureId,
      minute,
      shots_home: getStat(homeStats, 'Total Shots'),
      shots_away: getStat(awayStats, 'Total Shots'),
      shots_on_home: getStat(homeStats, 'Shots on Goal'),
      shots_on_away: getStat(awayStats, 'Shots on Goal'),
      xg_home: getStat(homeStats, 'expected_goals'),
      xg_away: getStat(awayStats, 'expected_goals'),
      corners_home: getStat(homeStats, 'Corner Kicks'),
      corners_away: getStat(awayStats, 'Corner Kicks'),
      possession_home: getStat(homeStats, 'Ball Possession'),
      possession_away: getStat(awayStats, 'Ball Possession'),
      dangerous_home: getStat(homeStats, 'Dangerous Attacks'),
      dangerous_away: getStat(awayStats, 'Dangerous Attacks'),
      fouls_home: getStat(homeStats, 'Fouls'),
      fouls_away: getStat(awayStats, 'Fouls'),
      raw: statistics,
    };

    const { error } = await supabase
      .from('raw_statistics')
      .insert(insert);

    if (error) {
      // 忽略重复插入错误
      if (!error.message.includes('duplicate')) {
        this.stats.write_errors++;
        this.stats.error_messages.push(`raw_statistics: ${error.message}`);
        console.error('[WAREHOUSE] raw_statistics write error:', error);
      }
      return false;
    }

    return true;
  }

  private async writeRawOdds(
    fixtureId: number,
    oddsData: LiveOddsData[]
  ): Promise<number> {
    let written = 0;

    for (const data of oddsData) {
      // 处理滚球赔率结构
      const liveOdds = data as any;
      if (liveOdds.odds && Array.isArray(liveOdds.odds)) {
        for (const bet of liveOdds.odds) {
          for (const value of bet.values ?? []) {
            if (value.suspended) continue;

            const insert: RawOddsInsert = {
              fixture_id: fixtureId,
              bookmaker: 'API-Football Live',
              bookmaker_id: null,
              market: bet.name ?? `bet_${bet.id}`,
              line: value.handicap ? Number.parseFloat(value.handicap) : null,
              selection: value.value,
              odds: Number.parseFloat(value.odd),
              is_live: true,
              raw: value,
            };

            const { error } = await supabase
              .from('raw_odds')
              .insert(insert);

            if (!error) written++;
          }
        }
      }

      // 处理赛前赔率结构
      const preMatch = data as any;
      if (preMatch.bookmakers && Array.isArray(preMatch.bookmakers)) {
        for (const bookmaker of preMatch.bookmakers) {
          for (const bet of bookmaker.bets ?? []) {
            for (const value of bet.values ?? []) {
              const insert: RawOddsInsert = {
                fixture_id: fixtureId,
                bookmaker: bookmaker.name,
                bookmaker_id: bookmaker.id,
                market: bet.name ?? `bet_${bet.id}`,
                line: null,
                selection: value.value,
                odds: Number.parseFloat(value.odd),
                is_live: false,
                raw: value,
              };

              const { error } = await supabase
                .from('raw_odds')
                .insert(insert);

              if (!error) written++;
            }
          }
        }
      }
    }

    return written;
  }

  private async writeModelSignal(
    signal: UnifiedSignal,
    match: AdvancedMatch
  ): Promise<boolean> {
    const insert: ModelSignalInsert = {
      fixture_id: signal.fixture_id,
      module_type: signal.module,
      module_version: 'v1',
      trigger_minute: signal.minute,
      trigger_score_home: match.home.score,
      trigger_score_away: match.away.score,
      heat_score: signal.score,
      confidence_score: signal.confidence,
      signal_type: signal.action === 'BET' ? 'GOAL_ALERT' :
                   signal.action === 'PREPARE' ? 'MOMENTUM_SHIFT' : 'WATCH',
      signal_strength: signal.action === 'BET' ? 'STRONG' :
                       signal.action === 'PREPARE' ? 'MEDIUM' : 'WEAK',
      factors: signal.score_breakdown,
      reasons: signal.reasons,
      predicted_outcome: signal.bet_plan?.market ?? null,
      predicted_confidence: signal.confidence,
    };

    const { error } = await supabase
      .from('model_signals')
      .insert(insert);

    if (error) {
      this.stats.write_errors++;
      this.stats.error_messages.push(`model_signals: ${error.message}`);
      console.error('[WAREHOUSE] model_signals write error:', error);
      return false;
    }

    console.log(`[WAREHOUSE] Signal written: fixture=${signal.fixture_id} ` +
      `score=${signal.score} confidence=${signal.confidence} action=${signal.action}`);
    return true;
  }

  // ============================================================
  // Getters
  // ============================================================

  getStats(): CollectorStats {
    return { ...this.stats };
  }

  isCollecting(): boolean {
    return this.isRunning;
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const warehouseCollector = new WarehouseCollector();

// ============================================================
// Acceptance Report Generator
// ============================================================

export interface AcceptanceReport {
  // 覆盖率
  stats_coverage_rate: number;
  odds_coverage_rate: number;

  // Top N/A 原因
  top_na_reasons: Array<{ reason: string; count: number; percentage: number }>;

  // 示例数据
  raw_mapped_examples: Array<{
    fixture_id: number;
    home_team: string;
    away_team: string;
    minute: number;
    raw_shots_total: number | null;
    mapped_shots_total: number;
    raw_xg_total: string | null;
    mapped_xg_total: number;
    raw_over_2_5: number | null;
    mapped_over_odds: number | null;
    data_quality: string;
  }>;

  // 时间戳
  generated_at: string;
}

/**
 * 生成 Acceptance Report
 */
export async function generateAcceptanceReport(
  matches: AdvancedMatch[],
  validations: Map<number, DataValidationResult>
): Promise<AcceptanceReport> {
  // 统计覆盖率
  const totalMatches = matches.length;
  const matchesWithStats = matches.filter(m => m.stats?._realDataAvailable).length;
  const matchesWithOdds = matches.filter(m => m.odds?._fetch_status === 'SUCCESS').length;

  const statsCoverageRate = totalMatches > 0 ? (matchesWithStats / totalMatches) * 100 : 0;
  const oddsCoverageRate = totalMatches > 0 ? (matchesWithOdds / totalMatches) * 100 : 0;

  // 统计 N/A 原因
  const reasonCounts = new Map<string, number>();
  for (const validation of validations.values()) {
    for (const reason of validation.invalid_reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  const totalReasons = Array.from(reasonCounts.values()).reduce((a, b) => a + b, 0);
  const topNaReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: totalReasons > 0 ? (count / totalReasons) * 100 : 0,
    }));

  // 生成 3 个示例
  const examples = matches
    .filter(m => m.stats?._realDataAvailable)
    .slice(0, 3)
    .map(m => {
      const validation = validations.get(m.id);
      return {
        fixture_id: m.id,
        home_team: m.home.name,
        away_team: m.away.name,
        minute: m.minute,
        raw_shots_total: m.stats ? (m.stats.shots?.home ?? 0) + (m.stats.shots?.away ?? 0) : null,
        mapped_shots_total: (m.stats?.shots?.home ?? 0) + (m.stats?.shots?.away ?? 0),
        raw_xg_total: m.stats?.xG ? `${((m.stats.xG.home ?? 0) + (m.stats.xG.away ?? 0)).toFixed(2)}` : null,
        mapped_xg_total: (m.stats?.xG?.home ?? 0) + (m.stats?.xG?.away ?? 0),
        raw_over_2_5: m.odds?.overUnder?.over ?? null,
        mapped_over_odds: m.odds?.overUnder?.over ?? null,
        data_quality: validation?.data_quality ?? 'UNKNOWN',
      };
    });

  return {
    stats_coverage_rate: Math.round(statsCoverageRate * 100) / 100,
    odds_coverage_rate: Math.round(oddsCoverageRate * 100) / 100,
    top_na_reasons: topNaReasons,
    raw_mapped_examples: examples,
    generated_at: new Date().toISOString(),
  };
}

// ============================================================
// Export
// ============================================================

export default {
  WarehouseCollector,
  warehouseCollector,
  generateAcceptanceReport,
};
