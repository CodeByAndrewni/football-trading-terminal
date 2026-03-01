/**
 * 检查滚球赔率是否包含大小球和让球盘
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY || 'df56bd35debe868a2cdf391a493e9734';

async function checkKeyMarkets() {
  // 获取一场进行中的比赛
  const fixturesRes = await fetch(`${API_BASE}/fixtures?live=all`, {
    headers: { 'x-apisports-key': API_KEY }
  });
  const fixturesData = await fixturesRes.json();

  if (!fixturesData.response || fixturesData.response.length === 0) {
    console.log('没有进行中的比赛');
    return;
  }

  const fixture = fixturesData.response[0];
  const fixtureId = fixture.fixture.id;

  console.log('='.repeat(60));
  console.log(`测试比赛: ${fixture.teams.home.name} vs ${fixture.teams.away.name}`);
  console.log(`Fixture ID: ${fixtureId}`);
  console.log(`比分: ${fixture.goals.home}-${fixture.goals.away}`);
  console.log('='.repeat(60));
  console.log();

  // 获取滚球赔率
  const liveRes = await fetch(`${API_BASE}/odds/live?fixture=${fixtureId}`, {
    headers: { 'x-apisports-key': API_KEY }
  });
  const liveData = await liveRes.json();

  if (!liveData.response || liveData.response.length === 0) {
    console.log('❌ 滚球赔率为空');
    return;
  }

  const oddsData = liveData.response[0];
  const allOdds = oddsData.odds || [];

  console.log(`🔥 滚球赔率包含 ${allOdds.length} 个盘口:`);
  console.log();

  allOdds.forEach((odd: any) => {
    const marker = (odd.id === 36 || odd.id === 25 || odd.id === 33 || odd.id === 8) ? ' ⭐' : '';
    console.log(`  ${odd.id.toString().padStart(3)} - ${odd.name}${marker}`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log('📊 关键盘口检查:');
  console.log('='.repeat(60));

  // 检查大小球
  const ouMarkets = allOdds.filter((o: any) =>
    o.id === 36 || o.id === 25 || o.id === 5 ||
    o.name.toLowerCase().includes('over') ||
    o.name.toLowerCase().includes('under') ||
    o.name.toLowerCase().includes('goals')
  );

  console.log(`\n1️⃣  大小球相关盘口 (${ouMarkets.length} 个):`);
  if (ouMarkets.length > 0) {
    ouMarkets.forEach((o: any) => {
      console.log(`  ✅ ${o.id} - ${o.name}`);
      if (o.values && o.values.length > 0) {
        console.log(`     值数量: ${o.values.length}`);
        const sample = o.values.slice(0, 2);
        sample.forEach((v: any) => {
          console.log(`       ${v.value}: ${v.odd}${v.handicap ? ` (line: ${v.handicap})` : ''}`);
        });
      }
    });
  } else {
    console.log('  ❌ 未找到大小球盘口');
  }

  // 检查让球盘
  const handicapMarkets = allOdds.filter((o: any) =>
    o.id === 33 || o.id === 8 ||
    o.name.toLowerCase().includes('handicap') ||
    o.name.toLowerCase().includes('spread')
  );

  console.log(`\n2️⃣  让球盘相关盘口 (${handicapMarkets.length} 个):`);
  if (handicapMarkets.length > 0) {
    handicapMarkets.forEach((o: any) => {
      console.log(`  ✅ ${o.id} - ${o.name}`);
      if (o.values && o.values.length > 0) {
        console.log(`     值数量: ${o.values.length}`);
        const sample = o.values.slice(0, 2);
        sample.forEach((v: any) => {
          console.log(`       ${v.value}: ${v.odd}${v.handicap ? ` (line: ${v.handicap})` : ''}`);
        });
      }
    });
  } else {
    console.log('  ❌ 未找到让球盘');
  }

  // 检查胜平负
  const matchWinner = allOdds.find((o: any) =>
    o.id === 59 || o.id === 1 ||
    o.name === 'Match Winner' ||
    o.name === 'Fulltime Result'
  );

  console.log(`\n3️⃣  胜平负:`);
  if (matchWinner) {
    console.log(`  ✅ ${matchWinner.id} - ${matchWinner.name}`);
  } else {
    console.log('  ❌ 未找到胜平负');
  }

  console.log();
  console.log('='.repeat(60));
  console.log('🔍 结论:');
  console.log('='.repeat(60));

  if (ouMarkets.length === 0 && handicapMarkets.length === 0) {
    console.log('❌ 该比赛没有大小球和让球盘数据');
    console.log('   可能原因:');
    console.log('   1. 博彩公司对该比赛封盘');
    console.log('   2. 该联赛不提供滚球盘口');
    console.log('   3. 需要测试其他比赛');
  } else {
    console.log('✅ 找到关键盘口数据');
    console.log(`   大小球: ${ouMarkets.length} 个`);
    console.log(`   让球盘: ${handicapMarkets.length} 个`);
  }
}

checkKeyMarkets();
