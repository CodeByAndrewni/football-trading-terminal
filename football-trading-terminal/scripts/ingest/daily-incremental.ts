/**
 * ============================================================
 * LIVEPRO FOOTBALL TERMINAL
 * Daily Incremental Update Script
 * ARCHITECTURE_FREEZE_V1
 * ============================================================
 *
 * 用途：每日增量更新数据到 RAW 层
 *
 * 每日更新（建议 UTC 00:00 执行）：
 * - fixtures（按日期）
 * - standings
 * - teams/statistics
 *
 * 执行频率：每天一次
 * 预计 API 调用：约 50-100 requests
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';

// ============================================================
// 配置
// ============================================================

const CONFIG = {
  API_HOST: 'v3.football.api-sports.io',
  API_KEY: process.env.API_FOOTBALL_KEY || '',

  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',

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

  REQUEST_DELAY_MS: 300,
  MAX_RETRIES: 3,
};

// ============================================================
// 初始化
// ============================================================

const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// ============================================================
// 工具函数
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function fetchAPI<T>(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://${CONFIG.API_HOST}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  for (let i = 0; i < CONFIG.MAX_RETRIES; i++) {
    try {
      const response = await fetch(url.toString(), {
        headers: { 'x-apisports-key': CONFIG.API_KEY },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (i === CONFIG.MAX_RETRIES - 1) throw error;
      await delay(2000);
    }
  }
}

function generateEventHash(event: any): string {
  const key = `${event.time?.elapsed || 0}-${event.type}-${event.team?.id || 0}-${event.player?.id || 0}-${event.detail || ''}`;
  return Buffer.from(key).toString('base64').substring(0, 32);
}

// ============================================================
// 更新函数
// ============================================================

/**
 * 更新今日比赛
 */
async function updateTodayFixtures(): Promise<number[]> {
  const today = formatDate(new Date());
  console.log(`📅 Updating fixtures for ${today}...`);

  const fixtureIds: number[] = [];

  for (const leagueId of CONFIG.LEAGUES) {
    try {
      const data = await fetchAPI('/fixtures', {
        league: leagueId.toString(),
        date: today,
      });

      if (!data.response || data.response.length === 0) continue;

      const fixtures = data.response.map((f: any) => ({
        fixture_id: f.fixture.id,
        league_id: f.league.id,
        season: f.league.season,
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

      await supabase
        .from('raw_fixtures')
        .upsert(fixtures, { onConflict: 'fixture_id' });

      fixtureIds.push(...fixtures.map((f: any) => f.fixture_id));
      console.log(`  League ${leagueId}: ${fixtures.length} fixtures`);

      await delay(CONFIG.REQUEST_DELAY_MS);
    } catch (error) {
      console.error(`  Error for league ${leagueId}:`, error);
    }
  }

  return fixtureIds;
}

/**
 * 更新已结束比赛的统计数据
 */
async function updateFinishedMatchStats(fixtureIds: number[]): Promise<void> {
  console.log(`📊 Updating statistics for ${fixtureIds.length} fixtures...`);

  for (const fixtureId of fixtureIds) {
    try {
      // 检查是否已结束
      const { data: fixture } = await supabase
        .from('raw_fixtures')
        .select('status')
        .eq('fixture_id', fixtureId)
        .single();

      if (!fixture || !['FT', 'AET', 'PEN'].includes(fixture.status)) continue;

      // 下载统计
      const statsData = await fetchAPI('/fixtures/statistics', {
        fixture: fixtureId.toString(),
      });

      if (statsData.response && statsData.response.length > 0) {
        const homeStats = statsData.response[0];
        const awayStats = statsData.response[1];

        const extractStat = (stats: any[] | undefined, type: string): number | null => {
          if (!stats) return null;
          const stat = stats.find((s: any) => s.type === type);
          if (!stat || stat.value === null) return null;
          if (typeof stat.value === 'string') {
            return parseInt(stat.value.replace('%', ''), 10) || null;
          }
          return stat.value;
        };

        await supabase.from('raw_statistics').upsert({
          fixture_id: fixtureId,
          minute: 90,
          shots_home: extractStat(homeStats?.statistics, 'Total Shots'),
          shots_away: extractStat(awayStats?.statistics, 'Total Shots'),
          shots_on_home: extractStat(homeStats?.statistics, 'Shots on Goal'),
          shots_on_away: extractStat(awayStats?.statistics, 'Shots on Goal'),
          corners_home: extractStat(homeStats?.statistics, 'Corner Kicks'),
          corners_away: extractStat(awayStats?.statistics, 'Corner Kicks'),
          possession_home: extractStat(homeStats?.statistics, 'Ball Possession'),
          possession_away: extractStat(awayStats?.statistics, 'Ball Possession'),
          raw: statsData.response,
        }, { onConflict: 'fixture_id,captured_at' });
      }

      // 下载事件
      const eventsData = await fetchAPI('/fixtures/events', {
        fixture: fixtureId.toString(),
      });

      if (eventsData.response && eventsData.response.length > 0) {
        const events = eventsData.response.map((e: any) => ({
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
          event_hash: generateEventHash(e),
          raw: e,
        }));

        await supabase
          .from('raw_events')
          .upsert(events, { onConflict: 'fixture_id,event_hash' });
      }

      await delay(CONFIG.REQUEST_DELAY_MS);
    } catch (error) {
      console.error(`  Error for fixture ${fixtureId}:`, error);
    }
  }
}

/**
 * 更新积分榜
 */
async function updateStandings(): Promise<void> {
  const currentSeason = new Date().getFullYear();
  console.log(`🏆 Updating standings for season ${currentSeason}...`);

  for (const leagueId of CONFIG.LEAGUES) {
    try {
      const data = await fetchAPI('/standings', {
        league: leagueId.toString(),
        season: currentSeason.toString(),
      });

      if (!data.response || data.response.length === 0) continue;

      const standings = data.response[0]?.league?.standings?.[0] || [];

      const records = standings.map((s: any) => ({
        league_id: leagueId,
        season: currentSeason,
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
        raw: s,
      }));

      await supabase
        .from('raw_standings')
        .upsert(records, { onConflict: 'league_id,season,team_id' });

      console.log(`  League ${leagueId}: ${records.length} teams`);
      await delay(CONFIG.REQUEST_DELAY_MS);
    } catch (error) {
      console.error(`  Error for league ${leagueId}:`, error);
    }
  }
}

/**
 * 更新球队统计（仅更新今日有比赛的球队）
 */
async function updateTeamStats(fixtureIds: number[]): Promise<void> {
  if (fixtureIds.length === 0) return;

  const currentSeason = new Date().getFullYear();
  console.log(`📈 Updating team stats...`);

  // 获取今日比赛的球队
  const { data: fixtures } = await supabase
    .from('raw_fixtures')
    .select('home_team_id, away_team_id, league_id')
    .in('fixture_id', fixtureIds);

  if (!fixtures) return;

  const teamLeagues = new Set<string>();
  for (const f of fixtures) {
    teamLeagues.add(`${f.home_team_id}-${f.league_id}`);
    teamLeagues.add(`${f.away_team_id}-${f.league_id}`);
  }

  for (const tl of teamLeagues) {
    const [teamId, leagueId] = tl.split('-').map(Number);

    try {
      const data = await fetchAPI('/teams/statistics', {
        team: teamId.toString(),
        league: leagueId.toString(),
        season: currentSeason.toString(),
      });

      if (!data.response) continue;

      const s = data.response;

      const parseGoalPeriod = (period: any): number | null => {
        if (!period?.percentage) return null;
        return parseFloat(period.percentage.replace('%', '')) || null;
      };

      await supabase.from('raw_team_stats').upsert({
        team_id: teamId,
        league_id: leagueId,
        season: currentSeason,
        team_name: s.team?.name,
        matches_played: s.fixtures?.played?.total,
        goals_for_total: s.goals?.for?.total?.total,
        goals_against_total: s.goals?.against?.total?.total,
        avg_goals_for: parseFloat(s.goals?.for?.average?.total) || null,
        avg_goals_against: parseFloat(s.goals?.against?.average?.total) || null,
        goals_76_90: parseGoalPeriod(s.goals?.for?.minute?.['76-90']),
        raw: s,
      }, { onConflict: 'team_id,league_id,season' });

      await delay(CONFIG.REQUEST_DELAY_MS);
    } catch (error) {
      console.error(`  Error for team ${teamId}:`, error);
    }
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('============================================================');
  console.log('LIVEPRO Daily Incremental Update');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('============================================================\n');

  if (!CONFIG.API_KEY || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  const startTime = Date.now();

  // Step 1: Update today's fixtures
  const fixtureIds = await updateTodayFixtures();

  // Step 2: Update finished match stats
  await updateFinishedMatchStats(fixtureIds);

  // Step 3: Update standings
  await updateStandings();

  // Step 4: Update team stats
  await updateTeamStats(fixtureIds);

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('\n============================================================');
  console.log('✅ Daily update completed!');
  console.log(`   Duration: ${duration}s`);
  console.log(`   Fixtures processed: ${fixtureIds.length}`);
  console.log('============================================================');
}

main().catch(console.error);
