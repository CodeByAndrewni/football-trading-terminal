/**
 * 检查是否有大小球和让球盘
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY || 'df56bd35debe868a2cdf391a493e9734';

async function checkOdds() {
  const fixturesRes = await fetch(`${API_BASE}/fixtures?live=all`, {
    headers: { 'x-apisports-key': API_KEY }
  });
  const fixturesData = await fixturesRes.json();
  const fixtureId = fixturesData.response[0].fixture.id;
  
  console.log(`测试比赛 ID: ${fixtureId}`);
  console.log();

  // 滚球赔率
  const liveRes = await fetch(`${API_BASE}/odds/live?fixture=${fixtureId}`, {
    headers: { 'x-apisports-key': API_KEY }
  });
  const liveData = await liveRes.json();
  
  if (liveData.response && liveData.response.length > 0) {
    const odds = liveData.response[0].odds || [];
    console.log('🔥 滚球赔率所有盘口:');
    odds.forEach((odd: any) => {
      console.log(`  ${odd.id.toString().padStart(3)} - ${odd.name}`);
    });
    console.log();
    
    // 查找关键盘口
    const ouLine = odds.find((o: any) => 
      o.id === 36 || o.id === 25 || o.name.includes('Over/Under')
    );
    const handicap = odds.find((o: any) =>
      o.id === 33 || o.id === 8 || o.name.includes('Asian Handicap')
    );
    
    console.log('📊 关键盘口检查:');
    console.log(`  Over/Under (36/25): ${ouLine ? '✅ 找到 - ' + ouLine.name : '❌ 未找到'}`);
    console.log(`  Asian Handicap (33/8): ${handicap ? '✅ 找到 - ' + handicap.name : '❌ 未找到'}`);
    
    if (ouLine) {
      console.log();
      console.log('📈 Over/Under 详情:');
      console.log(JSON.stringify(ouLine, null, 2));
    }
  }
}

checkOdds();
