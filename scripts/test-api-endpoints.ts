#!/usr/bin/env bun

/**
 * API 端点测试脚本
 *
 * 使用方法：
 * 1. 本地开发环境：bun run scripts/test-api-endpoints.ts
 * 2. 生产环境：BASE_URL=https://your-domain.vercel.app bun run scripts/test-api-endpoints.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface TestResult {
  endpoint: string;
  success: boolean;
  statusCode: number;
  responseTime: number;
  dataCount: number;
  error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(
  name: string,
  url: string,
  expectedDataKey: string = 'data'
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    console.log(`\n🧪 测试: ${name}`);
    console.log(`   URL: ${url}`);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000), // 15秒超时
    });

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    const result: TestResult = {
      endpoint: name,
      success: data.success === true,
      statusCode: response.status,
      responseTime,
      dataCount: Array.isArray(data[expectedDataKey])
        ? data[expectedDataKey].length
        : data[expectedDataKey] ? 1 : 0,
    };

    if (!data.success && data.error) {
      result.error = `${data.error.code}: ${data.error.message}`;
    }

    console.log(`   ✅ 状态码: ${result.statusCode}`);
    console.log(`   ✅ 响应时间: ${result.responseTime}ms`);
    console.log(`   ✅ 数据数量: ${result.dataCount}`);

    if (result.error) {
      console.log(`   ⚠️  错误: ${result.error}`);
    }

    return result;

  } catch (error) {
    const responseTime = Date.now() - startTime;

    const result: TestResult = {
      endpoint: name,
      success: false,
      statusCode: 0,
      responseTime,
      dataCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    console.log(`   ❌ 失败: ${result.error}`);

    return result;
  }
}

async function runTests() {
  console.log('🚀 开始测试 API 端点...');
  console.log(`📍 Base URL: ${BASE_URL}\n`);
  console.log('━'.repeat(60));

  // Test 1: Fixtures - Live matches
  results.push(
    await testEndpoint(
      'Fixtures (Live)',
      `${BASE_URL}/api/football/fixtures?live=true`
    )
  );

  // Test 2: Fixtures - Today's matches
  const today = new Date().toISOString().split('T')[0];
  results.push(
    await testEndpoint(
      'Fixtures (Today)',
      `${BASE_URL}/api/football/fixtures?date=${today}`
    )
  );

  // Test 3: Odds - 需要一个真实的 fixture ID
  // 先从 live fixtures 获取一个 ID
  const liveFixturesResponse = await fetch(`${BASE_URL}/api/football/fixtures?live=true`);
  const liveFixturesData = await liveFixturesResponse.json();

  if (liveFixturesData.success && liveFixturesData.data.length > 0) {
    const fixtureId = liveFixturesData.data[0].fixtureId;

    // Test 3a: Prematch Odds
    results.push(
      await testEndpoint(
        'Odds (Prematch)',
        `${BASE_URL}/api/football/odds?fixture=${fixtureId}`
      )
    );

    // Test 3b: Live Odds
    results.push(
      await testEndpoint(
        'Odds (Live)',
        `${BASE_URL}/api/football/odds?fixture=${fixtureId}&live=true`
      )
    );

    // Test 4: Stats
    results.push(
      await testEndpoint(
        'Stats',
        `${BASE_URL}/api/football/stats?fixture=${fixtureId}`
      )
    );
  } else {
    console.log('\n⚠️  跳过 Odds 和 Stats 测试（无进行中比赛）');
  }

  // Test 5: Standings - 英超
  results.push(
    await testEndpoint(
      'Standings (Premier League)',
      `${BASE_URL}/api/football/standings?league=39`,
      'data'
    )
  );

  // 打印总结
  console.log('\n' + '━'.repeat(60));
  console.log('\n📊 测试结果总结:\n');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

  console.log(`   总测试数: ${results.length}`);
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failCount}`);
  console.log(`   ⏱️  平均响应时间: ${Math.round(avgResponseTime)}ms\n`);

  // 打印详细结果表格
  console.log('详细结果:');
  console.log('┌─────────────────────────────┬─────────┬────────┬──────────┬─────────┐');
  console.log('│ 端点                        │ 状态    │ 状态码 │ 响应时间 │ 数据量  │');
  console.log('├─────────────────────────────┼─────────┼────────┼──────────┼─────────┤');

  for (const result of results) {
    const status = result.success ? '✅ 成功' : '❌ 失败';
    const endpoint = result.endpoint.padEnd(27);
    const statusCode = String(result.statusCode).padStart(6);
    const responseTime = `${result.responseTime}ms`.padStart(8);
    const dataCount = String(result.dataCount).padStart(7);

    console.log(`│ ${endpoint} │ ${status} │ ${statusCode} │ ${responseTime} │ ${dataCount} │`);

    if (result.error) {
      console.log(`│ ⚠️  ${result.error.padEnd(76)} │`);
    }
  }

  console.log('└─────────────────────────────┴─────────┴────────┴──────────┴─────────┘\n');

  // 退出码
  process.exit(failCount > 0 ? 1 : 0);
}

// 运行测试
runTests().catch((error) => {
  console.error('\n❌ 测试运行失败:', error);
  process.exit(1);
});
