/**
 * ============================================================
 * LIVEPRO FOOTBALL TERMINAL
 * Historical Data Download Script (1 Year)
 * ARCHITECTURE_FREEZE_V1
 * ============================================================
 *
 * 用途：下载历史1年的足球数据到 RAW 层
 *
 * 下载端口：
 * - GET /fixtures (比赛列表)
 * - GET /fixtures/statistics (比赛统计)
 * - GET /fixtures/events (比赛事件)
 * - GET /odds (赔率)
 * - GET /standings (积分榜)
 * - GET /teams/statistics (球队统计)
 *
 * 不下载：
 * - players, injuries, coach, transfers
 *
 * 限流策略：
 * - API-Football 免费版: 100 requests/day
 * - Pro 版: 7500 requests/day
 * - 建议批量大小: 10 requests/batch
 * - 批次间隔: 1 second
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================
// 配置
// ============================================================

const CONFIG = {
  // API-Football 配置
  API_HOST: 'v3.football.api-sports.io',
  API_KEY: process.env.API_FOOTBALL_KEY || '',

  // Supabase 配置
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',

  // 下载配置
  LEAGUES: [
    39,   // 英超
    140,  // 西甲
    78,   // 德甲
    135,  // 意甲
    61,   // 法甲
    2,    // 欧冠
    3,    // 欧联
    94,   // 葡超
    88,   // 荷甲
    98,   // 日职
  ],

  // 时间范围
  START_DATE: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1年前
  END_DATE: new Date(),

  // 限流配置
  BATCH_SIZE: 10,
  BATCH_DELAY_MS: 1000,
  REQUEST_DELAY_MS: 200,

  // 重试配置
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
};

// ============================================================
// 类型定义
// ============================================================

interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  currentPhase: string;
}

interface APIResponse<T> {
  response: T;
  errors: string[];
  results: number;
  paging: { current: number; total: number };
}

// ============================================================
// 初始化
// ============================================================

const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

let progress: DownloadProgress = {
  total: 0,
  completed: 0,
  failed: 0,
  currentPhase: 'initializing',
};

// ============================================================
// API 请求
// ============================================================

async function fetchAPI<T>(endpoint: string, params: Record<string, string> = {}): Promise<APIResponse<T>> {
  const url = new URL(`https://${CONFIG.API_HOST}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': CONFIG.API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchWithRetry<T>(
  endpoint: string,
  params: Record<string, string> = {},
  retries = CONFIG.MAX_RETRIES
): Promise<APIResponse<T>> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchAPI<T>(endpoint, params);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry ${i + 1}/${retries} for ${endpoint}`);
      await delay(CONFIG.RETRY_DELAY_MS);
    }
  }
  throw new Error('Max retries exceeded');
}

// ============================================================
// 工具函数
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function generateEventHash(event: any): string {
  const key = `${event.time?.elapsed || 0}-${event.type}-${event.team?.id || 0}-${event.player?.id || 0}-${event.detail || ''}`;
  return Buffer.from(key).toString('base64').substring(0, 32);
}

function logProgress() {
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  console.log(`[${progress.currentPhase}] Progress: ${progress.completed}/${progress.total} (${pct}%) | Failed: ${progress.failed}`);
}

// ============================================================
// 下载函数
// ============================================================

/**
 * 下载比赛列表
 */
async function downloadFixtures(leagueId: number, season: number): Promise<number[]> {
  console.log(`📥 Downloading fixtures for league ${leagueId}, season ${season}...`);

  const fixtureIds: number[] = [];

  try {
    const data = await fetchWithRetry<any[]>('/fixtures', {
      league: leagueId.toString(),
      season: season.toString(),
    });

    if (!data.response || data.response.length === 0) {
      console.log(`  No fixtures found`);
      return [];
    }

    console.log(`  Found ${data.response.length} fixtures`);

    // 批量插入
    const fixtures = data.response.map((f: any) => ({
      fixture_id: f.fixture.id,
      league_id: f.league.id,
      season: season,
      match_date: f.fixture.date.split('T')[0],
      kickoff: f.fixture.date,
      home_team_id: f.teams.home.id,
      away_team_id: f.teams.away.id,
      home_team_name: f.teams.home.name,
      away_team_name: f.teams.away.name,
      home_score: f.goals.home,
      away_score: f.goals.away,
      ht_home_score: f.score.halftime?.home,
      ht_away_score: f.score.halftime?.away,
      status: f.fixture.status.short,
      venue_id: f.fixture.venue?.id,
      venue_name: f.fixture.venue?.name,
      referee: f.fixture.referee,
      raw: f,
    }));

    const { error } = await supabase
      .from('raw_fixtures')
      .upsert(fixtures, { onConflict: 'fixture_id' });

    if (error) {
      console.error(`  Error inserting fixtures:`, error.message);
      progress.failed++;
    } else {
      progress.completed++;
      fixtureIds.push(...fixtures.map((f: any) => f.fixture_id));
    }

  } catch (error) {
    console.error(`  Download failed:`, error);
    progress.failed++;
  }

  return fixtureIds;
}

/**
 * 下载比赛统计
 */
async function downloadStatistics(fixtureId: number): Promise<void> {
  try {
    const data = await fetchWithRetry<any[]>('/fixtures/statistics', {
      fixture: fixtureId.toString(),
    });

    if (!data.response || data.response.length === 0) return;

    // 提取主客队统计
    const homeStats = data.response.find((s: any) => s.team.id === data.response[0]?.team.id);
    const awayStats = data.response.find((s: any) => s.team.id !== data.response[0]?.team.id);

    const extractStat = (stats: any[] | undefined, type: string): number | null => {
      if (!stats) return null;
      const stat = stats.find((s: any) => s.type === type);
      if (!stat || stat.value === null) return null;
      if (typeof stat.value === 'string') {
        return parseInt(stat.value.replace('%', ''), 10) || null;
      }
      return stat.value;
    };

    const record = {
      fixture_id: fixtureId,
      minute: 90, // 最终统计
      shots_home: extractStat(homeStats?.statistics, 'Total Shots'),
      shots_away: extractStat(awayStats?.statistics, 'Total Shots'),
      shots_on_home: extractStat(homeStats?.statistics, 'Shots on Goal'),
      shots_on_away: extractStat(awayStats?.statistics, 'Shots on Goal'),
      corners_home: extractStat(homeStats?.statistics, 'Corner Kicks'),
      corners_away: extractStat(awayStats?.statistics, 'Corner Kicks'),
      possession_home: extractStat(homeStats?.statistics, 'Ball Possession'),
      possession_away: extractStat(awayStats?.statistics, 'Ball Possession'),
      fouls_home: extractStat(homeStats?.statistics, 'Fouls'),
      fouls_away: extractStat(awayStats?.statistics, 'Fouls'),
      yellow_cards_home: extractStat(homeStats?.statistics, 'Yellow Cards'),
      yellow_cards_away: extractStat(awayStats?.statistics, 'Yellow Cards'),
      red_cards_home: extractStat(homeStats?.statistics, 'Red Cards'),
      red_cards_away: extractStat(awayStats?.statistics, 'Red Cards'),
      raw: data.response,
    };

    await supabase.from('raw_statistics').upsert(record, {
      onConflict: 'fixture_id,captured_at',
    });

    progress.completed++;
  } catch (error) {
    progress.failed++;
  }
}

/**
 * 下载比赛事件
 */
async function downloadEvents(fixtureId: number): Promise<void> {
  try {
    const data = await fetchWithRetry<any[]>('/fixtures/events', {
      fixture: fixtureId.toString(),
    });

    if (!data.response || data.response.length === 0) return;

    const events = data.response.map((e: any) => ({
      fixture_id: fixtureId,
      minute: e.time?.elapsed || 0,
      extra_minute: e.time?.extra,
      team_id: e.team?.id,
      team_name: e.team?.name,
      event_type: e.type,
      detail: e.detail,
      player_id: e.player?.id,
      player_name: e.player?.name,
      assist_id: e.assist?.id,
      assist_name: e.assist?.name,
      comments: e.comments,
      event_hash: generateEventHash(e),
      raw: e,
    }));

    const { error } = await supabase
      .from('raw_events')
      .upsert(events, { onConflict: 'fixture_id,event_hash' });

    if (!error) progress.completed++;
    else progress.failed++;

  } catch (error) {
    progress.failed++;
  }
}

/**
 * 下载赔率
 */
async function downloadOdds(fixtureId: number): Promise<void> {
  try {
    const data = await fetchWithRetry<any[]>('/odds', {
      fixture: fixtureId.toString(),
    });

    if (!data.response || data.response.length === 0) return;

    const oddsRecords: any[] = [];

    for (const oddsData of data.response) {
      for (const bookmaker of oddsData.bookmakers || []) {
        for (const bet of bookmaker.bets || []) {
          for (const value of bet.values || []) {
            // 解析盘口线
            let line: number | null = null;
            const lineMatch = value.value?.match(/[+-]?\d+\.?\d*/);
            if (lineMatch && (bet.name?.includes('Over/Under') || bet.name?.includes('Handicap'))) {
              line = parseFloat(lineMatch[0]);
            }

            oddsRecords.push({
              fixture_id: fixtureId,
              bookmaker: bookmaker.name,
              bookmaker_id: bookmaker.id,
              market: mapMarketName(bet.name),
              line: line,
              selection: value.value,
              odds: parseFloat(value.odd),
              is_live: false,
              raw: { bet, value },
            });
          }
        }
      }
    }

    if (oddsRecords.length > 0) {
      const { error } = await supabase
        .from('raw_odds')
        .upsert(oddsRecords, { onConflict: 'fixture_id,captured_at,bookmaker,market,line,selection' });

      if (!error) progress.completed++;
      else progress.failed++;
    }

  } catch (error) {
    progress.failed++;
  }
}

function mapMarketName(name: string): string {
  if (name?.includes('Match Winner')) return '1X2';
  if (name?.includes('Over/Under')) return 'OU';
  if (name?.includes('Asian Handicap')) return 'AH';
  if (name?.includes('Both Teams')) return 'BTS';
  if (name?.includes('Double Chance')) return 'DC';
  return name || 'OTHER';
}

/**
 * 下载积分榜
 */
async function downloadStandings(leagueId: number, season: number): Promise<void> {
  console.log(`📥 Downloading standings for league ${leagueId}, season ${season}...`);

  try {
    const data = await fetchWithRetry<any[]>('/standings', {
      league: leagueId.toString(),
      season: season.toString(),
    });

    if (!data.response || data.response.length === 0) return;

    const standings = data.response[0]?.league?.standings?.[0] || [];

    const records = standings.map((s: any) => ({
      league_id: leagueId,
      season: season,
      team_id: s.team.id,
      team_name: s.team.name,
      team_logo: s.team.logo,
      rank: s.rank,
      played: s.all.played,
      won: s.all.win,
      drawn: s.all.draw,
      lost: s.all.lose,
      goals_for: s.all.goals.for,
      goals_against: s.all.goals.against,
      goal_diff: s.goalsDiff,
      points: s.points,
      form: s.form,
      description: s.description,
      raw: s,
    }));

    const { error } = await supabase
      .from('raw_standings')
      .upsert(records, { onConflict: 'league_id,season,team_id' });

    if (!error) {
      console.log(`  Inserted ${records.length} standings`);
      progress.completed++;
    } else {
      console.error(`  Error:`, error.message);
      progress.failed++;
    }

  } catch (error) {
    console.error(`  Download failed:`, error);
    progress.failed++;
  }
}

/**
 * 下载球队统计
 */
async function downloadTeamStats(teamId: number, leagueId: number, season: number): Promise<void> {
  try {
    const data = await fetchWithRetry<any>('/teams/statistics', {
      team: teamId.toString(),
      league: leagueId.toString(),
      season: season.toString(),
    });

    if (!data.response) return;

    const s = data.response;

    const record = {
      team_id: teamId,
      league_id: leagueId,
      season: season,
      team_name: s.team?.name,
      team_logo: s.team?.logo,
      matches_played: s.fixtures?.played?.total,
      matches_home: s.fixtures?.played?.home,
      matches_away: s.fixtures?.played?.away,
      goals_for_total: s.goals?.for?.total?.total,
      goals_for_home: s.goals?.for?.total?.home,
      goals_for_away: s.goals?.for?.total?.away,
      goals_against_total: s.goals?.against?.total?.total,
      goals_against_home: s.goals?.against?.total?.home,
      goals_against_away: s.goals?.against?.total?.away,
      avg_goals_for: parseFloat(s.goals?.for?.average?.total) || null,
      avg_goals_against: parseFloat(s.goals?.against?.average?.total) || null,
      home_avg_goals: parseFloat(s.goals?.for?.average?.home) || null,
      away_avg_goals: parseFloat(s.goals?.for?.average?.away) || null,
      // 进球时段
      goals_0_15: parseGoalPeriod(s.goals?.for?.minute?.['0-15']),
      goals_16_30: parseGoalPeriod(s.goals?.for?.minute?.['16-30']),
      goals_31_45: parseGoalPeriod(s.goals?.for?.minute?.['31-45']),
      goals_46_60: parseGoalPeriod(s.goals?.for?.minute?.['46-60']),
      goals_61_75: parseGoalPeriod(s.goals?.for?.minute?.['61-75']),
      goals_76_90: parseGoalPeriod(s.goals?.for?.minute?.['76-90']),
      raw: s,
    };

    await supabase.from('raw_team_stats').upsert(record, {
      onConflict: 'team_id,league_id,season',
    });

    progress.completed++;
  } catch (error) {
    progress.failed++;
  }
}

function parseGoalPeriod(period: any): number | null {
  if (!period?.percentage) return null;
  return parseFloat(period.percentage.replace('%', '')) || null;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('============================================================');
  console.log('LIVEPRO Historical Data Download');
  console.log('ARCHITECTURE_FREEZE_V1');
  console.log('============================================================');

  if (!CONFIG.API_KEY || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    console.error('   Required: API_FOOTBALL_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const currentSeason = new Date().getFullYear();
  const allFixtureIds: number[] = [];

  // Phase 1: Download fixtures
  progress.currentPhase = 'fixtures';
  console.log('\n📌 Phase 1: Downloading fixtures...\n');

  for (const leagueId of CONFIG.LEAGUES) {
    const ids = await downloadFixtures(leagueId, currentSeason);
    allFixtureIds.push(...ids);
    await delay(CONFIG.REQUEST_DELAY_MS);
    logProgress();
  }

  // Phase 2: Download standings
  progress.currentPhase = 'standings';
  console.log('\n📌 Phase 2: Downloading standings...\n');

  for (const leagueId of CONFIG.LEAGUES) {
    await downloadStandings(leagueId, currentSeason);
    await delay(CONFIG.REQUEST_DELAY_MS);
  }

  // Phase 3: Download statistics & events (批量处理)
  progress.currentPhase = 'statistics';
  progress.total = allFixtureIds.length;
  progress.completed = 0;
  console.log(`\n📌 Phase 3: Downloading statistics for ${allFixtureIds.length} fixtures...\n`);

  for (let i = 0; i < allFixtureIds.length; i += CONFIG.BATCH_SIZE) {
    const batch = allFixtureIds.slice(i, i + CONFIG.BATCH_SIZE);

    await Promise.all(batch.map(async (fixtureId) => {
      await downloadStatistics(fixtureId);
      await delay(CONFIG.REQUEST_DELAY_MS);
    }));

    logProgress();
    await delay(CONFIG.BATCH_DELAY_MS);
  }

  // Phase 4: Download events
  progress.currentPhase = 'events';
  progress.completed = 0;
  console.log(`\n📌 Phase 4: Downloading events...\n`);

  for (let i = 0; i < allFixtureIds.length; i += CONFIG.BATCH_SIZE) {
    const batch = allFixtureIds.slice(i, i + CONFIG.BATCH_SIZE);

    await Promise.all(batch.map(async (fixtureId) => {
      await downloadEvents(fixtureId);
      await delay(CONFIG.REQUEST_DELAY_MS);
    }));

    logProgress();
    await delay(CONFIG.BATCH_DELAY_MS);
  }

  // Phase 5: Download team stats
  progress.currentPhase = 'team_stats';
  console.log('\n📌 Phase 5: Downloading team statistics...\n');

  // 获取所有唯一球队
  const { data: fixtures } = await supabase
    .from('raw_fixtures')
    .select('home_team_id, away_team_id, league_id')
    .in('league_id', CONFIG.LEAGUES);

  if (fixtures) {
    const teamLeagues = new Set<string>();
    for (const f of fixtures) {
      teamLeagues.add(`${f.home_team_id}-${f.league_id}`);
      teamLeagues.add(`${f.away_team_id}-${f.league_id}`);
    }

    progress.total = teamLeagues.size;
    progress.completed = 0;

    const teamLeagueArray = Array.from(teamLeagues).map(tl => {
      const [teamId, leagueId] = tl.split('-');
      return { teamId: parseInt(teamId), leagueId: parseInt(leagueId) };
    });

    for (let i = 0; i < teamLeagueArray.length; i += CONFIG.BATCH_SIZE) {
      const batch = teamLeagueArray.slice(i, i + CONFIG.BATCH_SIZE);

      await Promise.all(batch.map(({ teamId, leagueId }) =>
        downloadTeamStats(teamId, leagueId, currentSeason)
      ));

      logProgress();
      await delay(CONFIG.BATCH_DELAY_MS);
    }
  }

  console.log('\n============================================================');
  console.log('✅ Historical download completed!');
  console.log(`   Total completed: ${progress.completed}`);
  console.log(`   Total failed: ${progress.failed}`);
  console.log('============================================================');
}

// 运行
main().catch(console.error);
