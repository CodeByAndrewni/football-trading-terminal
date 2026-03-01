#!/usr/bin/env bun
/**
 * 赔率诊断脚本
 * 测试 API-Football /odds/live 端点
 */

const API_KEY = process.env.FOOTBALL_API_KEY;
const API_BASE = 'https://v3.football.api-sports.io';

if (!API_KEY) {
  console.error('❌ FOOTBALL_API_KEY 未设置');
  process.exit(1);
}

interface LiveMatch {
  fixture: { id: number };
  league: { name: string };
  teams: { home: { name: string }; away: { name: string } };
}

interface LiveOddsResponse {
  fixture: { id: number };
  odds: Array<{ id: number; name: string; values: unknown[] }>;
  status: { stopped: boolean; blocked: boolean };
}

async function fetchAPI<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'x-apisports-key': API_KEY! },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function diagnose() {
  console.log('🔍 赔率诊断开始...\n');

  // Step 1: 获取进行中的比赛
  console.log('📡 Step 1: 获取进行中的比赛...');
  const liveFixtures = await fetchAPI<{ response: LiveMatch[] }>('/fixtures?live=all');
  const liveCount = liveFixtures.response?.length || 0;
  console.log(`   找到 ${liveCount} 场进行中的比赛`);

  if (liveCount === 0) {
    console.log('   ⚠️ 没有进行中的比赛，无法测试滚球赔率');
    return;
  }

  // 显示前5场比赛
  console.log('\n   进行中的比赛:');
  const sampleMatches = liveFixtures.response.slice(0, 5);
  for (const m of sampleMatches) {
    console.log(`   - [${m.fixture.id}] ${m.teams.home.name} vs ${m.teams.away.name} (${m.league.name})`);
  }

  // Step 2: 测试滚球赔率 API
  console.log('\n📡 Step 2: 测试滚球赔率 API...');

  let oddsFound = 0;
  let oddsEmpty = 0;
  let oddsError = 0;

  const results: Array<{
    fixtureId: number;
    league: string;
    teams: string;
    hasOdds: boolean;
    oddsCount: number;
    markets: string[];
    status: { stopped: boolean; blocked: boolean } | null;
  }> = [];

  for (const match of sampleMatches) {
    const fixtureId = match.fixture.id;

    try {
      const oddsResponse = await fetchAPI<{ response: LiveOddsResponse[] }>(
        `/odds/live?fixture=${fixtureId}`
      );

      const odds = oddsResponse.response?.[0];

      if (odds && odds.odds && odds.odds.length > 0) {
        oddsFound++;
        results.push({
          fixtureId,
          league: match.league.name,
          teams: `${match.teams.home.name} vs ${match.teams.away.name}`,
          hasOdds: true,
          oddsCount: odds.odds.length,
          markets: odds.odds.map(o => `${o.id}:${o.name}`),
          status: odds.status,
        });
      } else {
        oddsEmpty++;
        results.push({
          fixtureId,
          league: match.league.name,
          teams: `${match.teams.home.name} vs ${match.teams.away.name}`,
          hasOdds: false,
          oddsCount: 0,
          markets: [],
          status: odds?.status || null,
        });
      }
    } catch (error) {
      oddsError++;
      console.error(`   ❌ fixture=${fixtureId} 请求失败:`, error);
    }

    // 避免速率限制
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Step 3: 输出结果
  console.log('\n📊 Step 3: 诊断结果\n');
  console.log(`   有赔率: ${oddsFound}/${sampleMatches.length}`);
  console.log(`   无赔率: ${oddsEmpty}/${sampleMatches.length}`);
  console.log(`   请求错误: ${oddsError}/${sampleMatches.length}`);

  console.log('\n   详细结果:');
  console.log('   ' + '='.repeat(80));

  for (const r of results) {
    const icon = r.hasOdds ? '✅' : '❌';
    console.log(`   ${icon} [${r.fixtureId}] ${r.teams}`);
    console.log(`      联赛: ${r.league}`);
    console.log(`      赔率市场数: ${r.oddsCount}`);
    if (r.hasOdds) {
      console.log(`      市场: ${r.markets.join(', ')}`);
    }
    if (r.status) {
      console.log(`      状态: stopped=${r.status.stopped}, blocked=${r.status.blocked}`);
    }
    console.log('');
  }

  // Step 4: 结论
  console.log('\n📝 结论:');
  if (oddsFound === 0) {
    console.log('   ⚠️ 所有比赛都没有滚球赔率数据');
    console.log('   可能原因:');
    console.log('   1. 这些联赛不支持滚球赔率 (API-Football 只覆盖部分联赛)');
    console.log('   2. API 订阅等级不支持 /odds/live 端点');
    console.log('   3. 比赛时间点没有开放赔率 (如半场休息)');
    console.log('\n   建议: 检查 API 订阅计划是否包含 Live Odds 功能');
  } else {
    console.log(`   ✅ ${oddsFound} 场比赛有滚球赔率`);
    console.log(`   ❌ ${oddsEmpty} 场比赛无赔率 (可能是小联赛)`);
  }
}

diagnose().catch(console.error);
