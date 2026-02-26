/**
 * ============================================================
 * LIVEPRO FOOTBALL TERMINAL
 * Live Match Update Script (Every 60 Seconds)
 * ARCHITECTURE_FREEZE_V1
 * ============================================================
 *
 * 用途：比赛中实时更新数据到 RAW 层
 *
 * 比赛中更新（每60秒）：
 * - fixtures?live (进行中比赛)
 * - fixtures/statistics (统计数据)
 * - fixtures/events (事件)
 *
 * 赔率更新（仅观察池比赛）：
 * - odds/live (滚球赔率)
 *
 * 执行频率：每 60 秒
 * 预计 API 调用：约 10-50 requests/分钟（取决于进行中比赛数量）
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

  // 更新间隔（毫秒）
  UPDATE_INTERVAL_MS: 60000,

  // 请求延迟
  REQUEST_DELAY_MS: 200,

  // 只更新这些联赛的滚球赔率
  PRIORITY_LEAGUES: [39, 140, 78, 135, 61, 2, 3],

  // 最大并发请求
  MAX_CONCURRENT: 5,
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

async function fetchAPI(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://${CONFIG.API_HOST}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: { 'x-apisports-key': CONFIG.API_KEY },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

function generateEventHash(event: any): string {
  const key = `${event.time?.elapsed || 0}-${event.type}-${event.team?.id || 0}-${event.player?.id || 0}-${event.detail || ''}`;
  return Buffer.from(key).toString('base64').substring(0, 32);
}

// ============================================================
// 更新函数
// ============================================================

interface LiveMatch {
  fixtureId: number;
  leagueId: number;
  minute: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  status: string;
}

/**
 * 获取进行中比赛
 */
async function getLiveMatches(): Promise<LiveMatch[]> {
  console.log('🔴 Fetching live matches...');

  try {
    const data = await fetchAPI('/fixtures', { live: 'all' });

    if (!data.response || data.response.length === 0) {
      console.log('   No live matches');
      return [];
    }

    const matches: LiveMatch[] = data.response.map((f: any) => ({
      fixtureId: f.fixture.id,
      leagueId: f.league.id,
      minute: f.fixture.status.elapsed || 0,
      homeTeamId: f.teams.home.id,
      awayTeamId: f.teams.away.id,
      homeScore: f.goals.home || 0,
      awayScore: f.goals.away || 0,
      status: f.fixture.status.short,
    }));

    // 更新 raw_fixtures
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
      raw: f,
    }));

    await supabase
      .from('raw_fixtures')
      .upsert(fixtures, { onConflict: 'fixture_id' });

    console.log(`   Found ${matches.length} live matches`);
    return matches;

  } catch (error) {
    console.error('   Error fetching live matches:', error);
    return [];
  }
}

/**
 * 更新比赛统计
 */
async function updateStatistics(match: LiveMatch): Promise<void> {
  try {
    const data = await fetchAPI('/fixtures/statistics', {
      fixture: match.fixtureId.toString(),
    });

    if (!data.response || data.response.length === 0) return;

    const homeStats = data.response[0];
    const awayStats = data.response[1];

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
      fixture_id: match.fixtureId,
      minute: match.minute,
      shots_home: extractStat(homeStats?.statistics, 'Total Shots'),
      shots_away: extractStat(awayStats?.statistics, 'Total Shots'),
      shots_on_home: extractStat(homeStats?.statistics, 'Shots on Goal'),
      shots_on_away: extractStat(awayStats?.statistics, 'Shots on Goal'),
      corners_home: extractStat(homeStats?.statistics, 'Corner Kicks'),
      corners_away: extractStat(awayStats?.statistics, 'Corner Kicks'),
      possession_home: extractStat(homeStats?.statistics, 'Ball Possession'),
      possession_away: extractStat(awayStats?.statistics, 'Ball Possession'),
      dangerous_home: extractStat(homeStats?.statistics, 'Dangerous Attacks'),
      dangerous_away: extractStat(awayStats?.statistics, 'Dangerous Attacks'),
      attacks_home: extractStat(homeStats?.statistics, 'Attacks'),
      attacks_away: extractStat(awayStats?.statistics, 'Attacks'),
      fouls_home: extractStat(homeStats?.statistics, 'Fouls'),
      fouls_away: extractStat(awayStats?.statistics, 'Fouls'),
      raw: data.response,
    }, { onConflict: 'fixture_id,captured_at' });

  } catch (error) {
    console.error(`   Stats error for ${match.fixtureId}:`, error);
  }
}

/**
 * 更新比赛事件
 */
async function updateEvents(match: LiveMatch): Promise<void> {
  try {
    const data = await fetchAPI('/fixtures/events', {
      fixture: match.fixtureId.toString(),
    });

    if (!data.response || data.response.length === 0) return;

    const events = data.response.map((e: any) => ({
      fixture_id: match.fixtureId,
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

  } catch (error) {
    console.error(`   Events error for ${match.fixtureId}:`, error);
  }
}

/**
 * 更新滚球赔率（仅优先联赛）
 */
async function updateLiveOdds(match: LiveMatch): Promise<void> {
  // 只更新优先联赛的赔率
  if (!CONFIG.PRIORITY_LEAGUES.includes(match.leagueId)) return;

  try {
    const data = await fetchAPI('/odds/live', {
      fixture: match.fixtureId.toString(),
    });

    if (!data.response || data.response.length === 0) return;

    const oddsRecords: any[] = [];

    for (const oddsData of data.response) {
      for (const bet of oddsData.odds || []) {
        for (const value of bet.values || []) {
          let line: number | null = null;
          const lineMatch = bet.name?.match(/[+-]?\d+\.?\d*/);
          if (lineMatch) line = parseFloat(lineMatch[0]);

          oddsRecords.push({
            fixture_id: match.fixtureId,
            bookmaker: 'API-Sports',
            market: mapMarketName(bet.name),
            line: line,
            selection: value.value,
            odds: parseFloat(value.odd),
            is_live: true,
            raw: { bet, value },
          });
        }
      }
    }

    if (oddsRecords.length > 0) {
      await supabase.from('raw_odds').upsert(oddsRecords, {
        onConflict: 'fixture_id,captured_at,bookmaker,market,line,selection',
      });
    }

  } catch (error) {
    console.error(`   Odds error for ${match.fixtureId}:`, error);
  }
}

function mapMarketName(name: string): string {
  if (name?.includes('Match Winner')) return '1X2';
  if (name?.includes('Over/Under')) return 'OU';
  if (name?.includes('Asian Handicap')) return 'AH';
  if (name?.includes('Both Teams')) return 'BTS';
  return name || 'OTHER';
}

/**
 * 更新 MODEL 层（比赛状态）
 */
async function updateMatchState(match: LiveMatch): Promise<void> {
  // 从 RAW 层读取最新统计
  const { data: stats } = await supabase
    .from('raw_statistics')
    .select('*')
    .eq('fixture_id', match.fixtureId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (!stats) return;

  // 计算压迫指数
  const homeDangerous = stats.dangerous_home || 0;
  const awayDangerous = stats.dangerous_away || 0;
  const totalDangerous = homeDangerous + awayDangerous;
  const pressureIndex = totalDangerous > 0
    ? ((homeDangerous - awayDangerous) / totalDangerous) * 100
    : 0;

  // 计算 xG 差值
  const xgDelta = (stats.xg_home || 0) - (stats.xg_away || 0);
  const xgDebt = ((stats.xg_home || 0) + (stats.xg_away || 0)) - (match.homeScore + match.awayScore);

  // 计算动量评分（简化版）
  const shotIntensity = ((stats.shots_home || 0) + (stats.shots_away || 0)) / Math.max(match.minute, 1) * 90;
  const cornerIntensity = ((stats.corners_home || 0) + (stats.corners_away || 0)) / Math.max(match.minute, 1) * 90;

  let momentumScore = 50; // 基础分
  if (shotIntensity > 25) momentumScore += 15;
  else if (shotIntensity > 18) momentumScore += 10;
  if (cornerIntensity > 10) momentumScore += 10;
  if (xgDebt > 1.5) momentumScore += 15;

  // 写入 MODEL 层
  await supabase.from('model_match_state').upsert({
    fixture_id: match.fixtureId,
    minute: match.minute,
    score_home: match.homeScore,
    score_away: match.awayScore,
    pressure_index: pressureIndex,
    pressure_direction: pressureIndex > 20 ? 'home' : pressureIndex < -20 ? 'away' : 'neutral',
    xg_home: stats.xg_home,
    xg_away: stats.xg_away,
    xg_delta: xgDelta,
    xg_debt: xgDebt,
    momentum_score: Math.min(100, momentumScore),
    shot_intensity: shotIntensity,
    corner_intensity: cornerIntensity,
  }, { onConflict: 'fixture_id,minute,captured_at' });
}

// ============================================================
// 批处理执行
// ============================================================

async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(processor));
    await delay(CONFIG.REQUEST_DELAY_MS);
  }
}

// ============================================================
// 单次更新周期
// ============================================================

async function runUpdateCycle(): Promise<void> {
  const startTime = Date.now();
  console.log(`\n⏰ ${new Date().toISOString()} - Starting update cycle...`);

  // 1. 获取进行中比赛
  const liveMatches = await getLiveMatches();

  if (liveMatches.length === 0) {
    console.log('   No live matches to update');
    return;
  }

  // 2. 更新统计数据
  console.log('📊 Updating statistics...');
  await processBatch(liveMatches, updateStatistics, CONFIG.MAX_CONCURRENT);

  // 3. 更新事件
  console.log('📋 Updating events...');
  await processBatch(liveMatches, updateEvents, CONFIG.MAX_CONCURRENT);

  // 4. 更新滚球赔率（仅优先联赛）
  const priorityMatches = liveMatches.filter(m =>
    CONFIG.PRIORITY_LEAGUES.includes(m.leagueId)
  );
  if (priorityMatches.length > 0) {
    console.log(`💰 Updating live odds for ${priorityMatches.length} priority matches...`);
    await processBatch(priorityMatches, updateLiveOdds, CONFIG.MAX_CONCURRENT);
  }

  // 5. 更新 MODEL 层
  console.log('🔧 Updating model layer...');
  await processBatch(liveMatches, updateMatchState, CONFIG.MAX_CONCURRENT);

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`✅ Cycle completed in ${duration}s | ${liveMatches.length} matches updated`);
}

// ============================================================
// 主循环
// ============================================================

async function main() {
  console.log('============================================================');
  console.log('LIVEPRO Live Update Service');
  console.log('ARCHITECTURE_FREEZE_V1');
  console.log('============================================================');

  if (!CONFIG.API_KEY || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  console.log(`Update interval: ${CONFIG.UPDATE_INTERVAL_MS / 1000}s`);
  console.log('Press Ctrl+C to stop\n');

  // 运行一次
  const runOnce = process.argv.includes('--once');

  if (runOnce) {
    await runUpdateCycle();
  } else {
    // 持续运行
    while (true) {
      try {
        await runUpdateCycle();
      } catch (error) {
        console.error('Cycle error:', error);
      }
      await delay(CONFIG.UPDATE_INTERVAL_MS);
    }
  }
}

main().catch(console.error);
