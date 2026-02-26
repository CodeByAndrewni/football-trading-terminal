#!/usr/bin/env bun
/**
 * 测试原始赔率 API 响应
 */

const API_KEY = process.env.FOOTBALL_API_KEY || '';

async function testOddsRaw(fixtureId: number) {
  console.log(`\n📡 测试 fixture ${fixtureId} 的滚球赔率...`);

  const res = await fetch(`https://v3.football.api-sports.io/odds/live?fixture=${fixtureId}`, {
    headers: { 'x-apisports-key': API_KEY }
  });

  const data = await res.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    console.log('❌ API Errors:', data.errors);
    return;
  }

  const response = data.response?.[0];
  if (!response) {
    console.log('❌ Empty response');
    return;
  }

  console.log('✅ Fixture ID:', response.fixture?.id);
  console.log('   Status:', JSON.stringify(response.status));
  console.log('   Odds markets count:', response.odds?.length || 0);

  // 查找关键市场
  const odds = response.odds || [];

  const ahOdds = odds.find((o: any) => o.id === 33);
  const ouOdds = odds.find((o: any) => o.id === 36);
  const ftOdds = odds.find((o: any) => o.id === 59);

  console.log('\n   关键市场:');

  if (ahOdds) {
    console.log('   - Asian Handicap (33):', ahOdds.values?.length, 'values');
    const mainAH = ahOdds.values?.find((v: any) => v.main);
    if (mainAH) {
      console.log('     主盘:', JSON.stringify(mainAH));
    }
  } else {
    console.log('   - Asian Handicap (33): ❌ NOT FOUND');
  }

  if (ouOdds) {
    console.log('   - Over/Under (36):', ouOdds.values?.length, 'values');
    const mainOU = ouOdds.values?.filter((v: any) => v.main);
    if (mainOU?.length > 0) {
      console.log('     主盘:', JSON.stringify(mainOU));
    }
  } else {
    console.log('   - Over/Under (36): ❌ NOT FOUND');
  }

  if (ftOdds) {
    console.log('   - Fulltime Result (59):', ftOdds.values?.length, 'values');
    if (ftOdds.values?.[0]) {
      console.log('     Sample:', JSON.stringify(ftOdds.values.slice(0, 3)));
    }
  } else {
    console.log('   - Fulltime Result (59): ❌ NOT FOUND');
  }
}

async function main() {
  console.log('🔍 原始赔率 API 测试\n');

  // 先获取进行中的比赛
  const liveRes = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
    headers: { 'x-apisports-key': API_KEY }
  });

  const liveData = await liveRes.json();
  const liveMatches = liveData.response || [];

  console.log(`找到 ${liveMatches.length} 场进行中的比赛`);

  // 测试前3场
  for (const match of liveMatches.slice(0, 3)) {
    const fixtureId = match.fixture.id;
    console.log(`\n比赛: ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`);
    await testOddsRaw(fixtureId);
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
