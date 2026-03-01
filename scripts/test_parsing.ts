#!/usr/bin/env bun
/**
 * 测试完整的赔率解析流程
 */

import { parseLiveOdds, convertToOddsInfo } from '../src/services/oddsService';
import type { LiveOddsData } from '../src/types';

const API_KEY = process.env.FOOTBALL_API_KEY || '';

async function fetchLiveOdds(fixtureId: number): Promise<LiveOddsData | null> {
  const res = await fetch(`https://v3.football.api-sports.io/odds/live?fixture=${fixtureId}`, {
    headers: { 'x-apisports-key': API_KEY }
  });

  const data = await res.json();
  return data.response?.[0] || null;
}

async function testParsing(fixtureId: number, matchName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试: ${matchName} (fixture ${fixtureId})`);
  console.log('='.repeat(60));

  // 1. 获取原始数据
  const rawOdds = await fetchLiveOdds(fixtureId);

  if (!rawOdds) {
    console.log('❌ 无赔率数据');
    return;
  }

  console.log('\n📥 原始 API 响应:');
  console.log('   fixture.id:', rawOdds.fixture?.id);
  console.log('   status:', JSON.stringify(rawOdds.status));
  console.log('   odds array length:', rawOdds.odds?.length);

  // 2. 调用 parseLiveOdds
  console.log('\n📊 调用 parseLiveOdds:');
  const parsed = parseLiveOdds(rawOdds, 60);

  console.log('   fixture_id:', parsed.fixture_id);
  console.log('   _fetch_status:', parsed._fetch_status);
  console.log('   _raw_available:', parsed._raw_available);
  console.log('   bookmaker:', parsed.bookmaker);
  console.log('');
  console.log('   1x2 (胜平负):');
  console.log('      home_win:', parsed.home_win);
  console.log('      draw:', parsed.draw);
  console.log('      away_win:', parsed.away_win);
  console.log('');
  console.log('   O/U (大小球):');
  console.log('      main_line:', parsed.main_ou_line);
  console.log('      main_over:', parsed.main_ou_over);
  console.log('      main_under:', parsed.main_ou_under);
  console.log('      over_2.5:', parsed.over_2_5);
  console.log('      under_2.5:', parsed.under_2_5);
  console.log('      all_lines count:', parsed.all_ou_lines.length);
  console.log('');
  console.log('   AH (让球):');
  console.log('      line:', parsed.asian_handicap_line);
  console.log('      home:', parsed.asian_handicap_home);
  console.log('      away:', parsed.asian_handicap_away);

  // 3. 调用 convertToOddsInfo
  console.log('\n📦 调用 convertToOddsInfo:');
  const oddsInfo = convertToOddsInfo(parsed);

  console.log('   _fetch_status:', oddsInfo._fetch_status);
  console.log('   _is_live:', oddsInfo._is_live);
  console.log('   handicap:', JSON.stringify(oddsInfo.handicap));
  console.log('   overUnder:', JSON.stringify(oddsInfo.overUnder));
  console.log('   matchWinner:', JSON.stringify(oddsInfo.matchWinner));

  // 4. 结论
  console.log('\n📝 结论:');
  if (parsed._fetch_status === 'SUCCESS' && parsed._raw_available) {
    console.log('   ✅ 解析成功！数据应该正确显示在 UI 中');
  } else {
    console.log('   ❌ 解析失败或无数据');
    console.log('      _fetch_status:', parsed._fetch_status);
    console.log('      _raw_available:', parsed._raw_available);
  }
}

async function main() {
  console.log('🔍 赔率解析流程测试\n');

  // 获取进行中的比赛
  const liveRes = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
    headers: { 'x-apisports-key': API_KEY }
  });

  const liveData = await liveRes.json();
  const liveMatches = liveData.response || [];

  console.log(`找到 ${liveMatches.length} 场进行中的比赛`);

  // 找一场有赔率的比赛测试
  for (const match of liveMatches.slice(0, 5)) {
    const fixtureId = match.fixture.id;
    const matchName = `${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
    await testParsing(fixtureId, matchName);
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
