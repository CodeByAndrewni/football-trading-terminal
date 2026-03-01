/**
 * 测试 API-Football 赔率端点
 * 诊断为什么前端看不到赔率数据
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY || 'df56bd35debe868a2cdf391a493e9734';

async function testOddsEndpoints() {
  console.log('='.repeat(60));
  console.log('📊 API-Football 赔率端点诊断');
  console.log('='.repeat(60));
  console.log();

  // 1. 获取进行中的比赛
  console.log('1️⃣  获取进行中的比赛...');
  try {
    const fixturesRes = await fetch(`${API_BASE}/fixtures?live=all`, {
      headers: { 'x-apisports-key': API_KEY }
    });
    const fixturesData = await fixturesRes.json();

    if (fixturesData.errors && Object.keys(fixturesData.errors).length > 0) {
      console.error('❌ API 错误:', fixturesData.errors);
      return;
    }

    const fixtures = fixturesData.response || [];
    console.log(`✅ 找到 ${fixtures.length} 场进行中的比赛`);

    if (fixtures.length === 0) {
      console.log('⚠️  当前没有进行中的比赛，使用示例 fixture ID');
      return;
    }

    const testFixture = fixtures[0];
    const fixtureId = testFixture.fixture.id;
    console.log(`   测试比赛: ${testFixture.teams.home.name} vs ${testFixture.teams.away.name}`);
    console.log(`   Fixture ID: ${fixtureId}`);
    console.log();

    // 2. 测试滚球赔率
    console.log('2️⃣  测试滚球赔率 (/odds/live)...');
    const liveOddsRes = await fetch(`${API_BASE}/odds/live?fixture=${fixtureId}`, {
      headers: { 'x-apisports-key': API_KEY }
    });
    const liveOddsData = await liveOddsRes.json();

    if (liveOddsData.errors && Object.keys(liveOddsData.errors).length > 0) {
      console.error('❌ 滚球赔率 API 错误:', liveOddsData.errors);
    } else {
      const liveOdds = liveOddsData.response || [];
      console.log(`   返回数据数量: ${liveOdds.length}`);

      if (liveOdds.length === 0) {
        console.log('   ⚠️  滚球赔率为空！');
        console.log('   原因可能：');
        console.log('     - API-Football 免费账号不包含滚球赔率');
        console.log('     - 该比赛没有滚球赔率数据');
        console.log('     - 盘口已封盘');
      } else {
        const firstOdds = liveOdds[0];
        console.log('   ✅ 滚球赔率获取成功');
        console.log(`   状态: stopped=${firstOdds.status?.stopped}, blocked=${firstOdds.status?.blocked}`);
        console.log(`   盘口数量: ${firstOdds.odds?.length || 0}`);

        if (firstOdds.odds && firstOdds.odds.length > 0) {
          console.log('   可用盘口:');
          firstOdds.odds.slice(0, 5).forEach((odd: any) => {
            console.log(`     - ${odd.name} (id: ${odd.id})`);
          });
        }
      }
    }
    console.log();

    // 3. 测试赛前赔率
    console.log('3️⃣  测试赛前赔率 (/odds)...');
    const prematchOddsRes = await fetch(`${API_BASE}/odds?fixture=${fixtureId}`, {
      headers: { 'x-apisports-key': API_KEY }
    });
    const prematchOddsData = await prematchOddsRes.json();

    if (prematchOddsData.errors && Object.keys(prematchOddsData.errors).length > 0) {
      console.error('❌ 赛前赔率 API 错误:', prematchOddsData.errors);
    } else {
      const prematchOdds = prematchOddsData.response || [];
      console.log(`   返回数据数量: ${prematchOdds.length}`);

      if (prematchOdds.length === 0) {
        console.log('   ⚠️  赛前赔率为空！');
      } else {
        const firstOdds = prematchOdds[0];
        console.log('   ✅ 赛前赔率获取成功');
        console.log(`   博彩公司数量: ${firstOdds.bookmakers?.length || 0}`);

        if (firstOdds.bookmakers && firstOdds.bookmakers.length > 0) {
          const bookmaker = firstOdds.bookmakers[0];
          console.log(`   博彩公司: ${bookmaker.name}`);
          console.log(`   盘口数量: ${bookmaker.bets?.length || 0}`);

          if (bookmaker.bets && bookmaker.bets.length > 0) {
            console.log('   可用盘口:');
            bookmaker.bets.slice(0, 5).forEach((bet: any) => {
              console.log(`     - ${bet.name} (id: ${bet.id})`);
            });
          }
        }
      }
    }
    console.log();

    // 4. 检查 API 配额
    console.log('4️⃣  检查 API 配额...');
    const statusRes = await fetch(`${API_BASE}/status`, {
      headers: { 'x-apisports-key': API_KEY }
    });
    const statusData = await statusRes.json();

    if (statusData.response) {
      const { requests, subscription } = statusData.response;
      console.log(`   今日已用: ${requests.current} / ${requests.limit_day}`);
      console.log(`   订阅计划: ${subscription.plan}`);
      console.log(`   订阅状态: ${subscription.active ? '✅ 活跃' : '❌ 未激活'}`);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('🔍 诊断结论：');
  console.log('   如果滚球赔率和赛前赔率都为空，说明：');
  console.log('   1. API-Football 免费账号可能不包含赔率数据');
  console.log('   2. 需要升级到付费订阅才能获取赔率');
  console.log('   3. 或者赔率功能需要单独开通');
  console.log('='.repeat(60));
}

testOddsEndpoints();
