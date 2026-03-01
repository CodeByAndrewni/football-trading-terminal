#!/usr/bin/env bun
/**
 * 获取所有有赔率覆盖的联赛
 */

const API_KEY = process.env.FOOTBALL_API_KEY || '';

interface LeagueResponse {
  league: { id: number; name: string; type: string };
  country: { name: string; code: string };
  seasons: Array<{
    year: number;
    coverage: { odds: boolean };
  }>;
}

async function fetchLeaguesWithOdds() {
  console.log('🔍 获取所有有赔率覆盖的联赛...\n');

  const res = await fetch('https://v3.football.api-sports.io/leagues', {
    headers: { 'x-apisports-key': API_KEY }
  });

  const data = await res.json();
  const leagues: LeagueResponse[] = data.response || [];

  console.log(`总联赛数: ${leagues.length}`);

  // 筛选有赔率覆盖的联赛
  const withOdds = leagues.filter(l => {
    const latestSeason = l.seasons?.[l.seasons.length - 1];
    return latestSeason?.coverage?.odds === true;
  });

  console.log(`有赔率覆盖的联赛数: ${withOdds.length}`);

  // 按国家分组
  const byCountry: Record<string, Array<{ id: number; name: string; type: string }>> = {};

  for (const l of withOdds) {
    const country = l.country?.name || 'World';
    if (!byCountry[country]) {
      byCountry[country] = [];
    }
    byCountry[country].push({
      id: l.league.id,
      name: l.league.name,
      type: l.league.type,
    });
  }

  const countries = Object.keys(byCountry).sort();
  console.log(`\n涉及国家数: ${countries.length}`);

  // 输出所有联赛 ID（按类型和国家排序）
  console.log('\n========== 完整列表 (可直接复制) ==========\n');

  // 先输出国际赛事
  if (byCountry['World']) {
    console.log('// ========== 国际赛事 ==========');
    for (const l of byCountry['World']) {
      console.log(`  ${l.id},   // ${l.name}`);
    }
    console.log('');
  }

  // 按重要性输出各国联赛
  const priorityCountries = [
    'England', 'Spain', 'Germany', 'Italy', 'France',
    'Portugal', 'Netherlands', 'Belgium', 'Turkey', 'Greece',
    'Scotland', 'Russia', 'Ukraine', 'Poland', 'Czech-Republic',
    'Austria', 'Switzerland', 'Denmark', 'Norway', 'Sweden',
    'Finland', 'Croatia', 'Serbia', 'Romania', 'Bulgaria',
    'Brazil', 'Argentina', 'Colombia', 'Chile', 'Mexico',
    'USA', 'China', 'Japan', 'South-Korea', 'Saudi-Arabia',
    'Australia', 'Egypt', 'South-Africa',
  ];

  for (const country of priorityCountries) {
    if (byCountry[country]) {
      console.log(`// ========== ${country} ==========`);
      for (const l of byCountry[country]) {
        console.log(`  ${l.id},   // ${l.name}`);
      }
      console.log('');
    }
  }

  // 输出其他国家
  console.log('// ========== 其他国家 ==========');
  for (const country of countries) {
    if (!priorityCountries.includes(country) && country !== 'World') {
      for (const l of byCountry[country]) {
        console.log(`  ${l.id},   // ${country} - ${l.name}`);
      }
    }
  }

  // 输出统计
  console.log('\n========== 统计 ==========');
  console.log(`总共 ${withOdds.length} 个联赛有赔率覆盖`);

  // 输出纯数字列表（方便复制）
  console.log('\n========== 纯 ID 列表 ==========');
  const allIds = withOdds.map(l => l.league.id).sort((a, b) => a - b);
  console.log(allIds.join(', '));
}

fetchLeaguesWithOdds().catch(console.error);
