#!/usr/bin/env bun
/**
 * PHASE 2B ODDS DIAGNOSTIC SCRIPT
 *
 * Tests real API responses for:
 * - /fixtures?live=all
 * - /odds/live?fixture={id}
 * - /odds/live/bets
 * - /odds?fixture={id} (pre-match)
 * - /odds/bets
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY || '436ad44cf47ee6a4acf971c37aafdf1a';

interface FetchResult {
  endpoint: string;
  url: string;
  method: string;
  headers: string[];
  status: number;
  get: number;
  results: number;
  errors: Record<string, string>;
  paging: { current: number; total: number };
  sampleKeys?: string[];
  rawSample?: unknown;
}

async function fetchAPI(endpoint: string, params?: Record<string, string>): Promise<{ raw: unknown; meta: FetchResult }> {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.append(k, v);
    }
  }

  const startTime = Date.now();
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-apisports-key': API_KEY,
    },
  });

  const data = await response.json();
  const elapsed = Date.now() - startTime;

  const meta: FetchResult = {
    endpoint,
    url: url.toString().replace(API_KEY, '***'),
    method: 'GET',
    headers: ['x-apisports-key'], // Only this header is sent
    status: response.status,
    get: data.get ?? 0,
    results: data.results ?? 0,
    errors: data.errors ?? {},
    paging: data.paging ?? { current: 0, total: 0 },
    sampleKeys: data.response?.[0] ? Object.keys(data.response[0]) : undefined,
  };

  console.log(`\n=== ${endpoint} (${elapsed}ms) ===`);
  console.log(`URL: ${meta.url}`);
  console.log(`Status: ${meta.status}`);
  console.log(`Results: ${meta.results}`);
  console.log(`Errors: ${JSON.stringify(meta.errors)}`);
  console.log(`Rate-Limit Headers:`);
  console.log(`  x-ratelimit-requests-limit: ${response.headers.get('x-ratelimit-requests-limit')}`);
  console.log(`  x-ratelimit-requests-remaining: ${response.headers.get('x-ratelimit-requests-remaining')}`);

  if (meta.sampleKeys) {
    console.log(`Sample Keys: ${meta.sampleKeys.join(', ')}`);
  }

  return { raw: data, meta };
}

interface LiveFixture {
  fixture: { id: number; status: { short: string; elapsed: number } };
  league: { id: number; name: string; country: string };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number; away: number };
}

async function main() {
  console.log('\n====================================================');
  console.log('PHASE 2B ODDS ROOT-CAUSE DIAGNOSTIC');
  console.log('====================================================\n');

  // Step 1: Get live fixtures
  console.log('\n### STEP 1: Get live fixtures ###');
  const { raw: fixturesData } = await fetchAPI('/fixtures', { live: 'all' });
  const fixtures = (fixturesData as { response: LiveFixture[] }).response || [];

  console.log(`\nLive fixtures found: ${fixtures.length}`);

  if (fixtures.length === 0) {
    console.log('\n❌ No live fixtures available. Cannot test odds endpoints.');
    return;
  }

  // Pick 3 fixtures from different leagues (prefer major leagues)
  // Major league IDs: 39 (EPL), 140 (La Liga), 78 (Bundesliga), 135 (Serie A), 61 (Ligue 1)
  const majorLeagueIds = [39, 140, 78, 135, 61, 88, 94, 203, 253, 307];

  const selectedFixtures: LiveFixture[] = [];

  // First try to get from major leagues
  for (const leagueId of majorLeagueIds) {
    const match = fixtures.find(f => f.league.id === leagueId && !selectedFixtures.some(s => s.fixture.id === f.fixture.id));
    if (match) {
      selectedFixtures.push(match);
      if (selectedFixtures.length >= 3) break;
    }
  }

  // Fill remaining slots with any fixture
  for (const f of fixtures) {
    if (!selectedFixtures.some(s => s.fixture.id === f.fixture.id)) {
      selectedFixtures.push(f);
      if (selectedFixtures.length >= 3) break;
    }
  }

  console.log('\n### SELECTED TEST FIXTURES ###');
  for (const f of selectedFixtures) {
    console.log(`  - fixture_id=${f.fixture.id} | ${f.league.name} (${f.league.country}) | ${f.teams.home.name} vs ${f.teams.away.name} | ${f.goals.home}-${f.goals.away} @ ${f.fixture.status.elapsed}'`);
  }

  // Step 2: Get live bets catalog
  console.log('\n### STEP 2: Get /odds/live/bets (live bet catalog) ###');
  const { raw: liveBetsData } = await fetchAPI('/odds/live/bets');
  const liveBets = (liveBetsData as { response: { id: number; name: string }[] }).response || [];

  console.log(`\nLive bet types available: ${liveBets.length}`);
  console.log('Sample live bet types:');
  for (const bet of liveBets.slice(0, 10)) {
    console.log(`  - id=${bet.id}: ${bet.name}`);
  }

  // Step 3: Get pre-match bets catalog
  console.log('\n### STEP 3: Get /odds/bets (pre-match bet catalog) ###');
  const { raw: preBetsData } = await fetchAPI('/odds/bets');
  const preBets = (preBetsData as { response: { id: number; name: string }[] }).response || [];

  console.log(`\nPre-match bet types available: ${preBets.length}`);
  console.log('Sample pre-match bet types:');
  for (const bet of preBets.slice(0, 10)) {
    console.log(`  - id=${bet.id}: ${bet.name}`);
  }

  // Check for key bets
  const keyLiveBets = {
    'Asian Handicap': liveBets.find(b => b.name.includes('Asian Handicap')),
    'Over/Under': liveBets.find(b => b.name.includes('Over/Under') || b.name.includes('Goals')),
    'Match Result': liveBets.find(b => b.name.includes('Match') || b.name.includes('Winner')),
  };
  console.log('\nKey live bet IDs:');
  for (const [name, bet] of Object.entries(keyLiveBets)) {
    console.log(`  ${name}: ${bet ? `id=${bet.id} (${bet.name})` : 'NOT FOUND'}`);
  }

  // Step 4: Test /odds/live for each fixture
  console.log('\n### STEP 4: Test /odds/live for each fixture ###');

  const results: Array<{
    fixture_id: number;
    league: string;
    status: string;
    elapsed: number;
    endpoint: string;
    has_data: boolean;
    odds_structure: string[];
    sample_bet_ids: number[];
    raw_sample?: unknown;
    invalid_reason?: string;
  }> = [];

  for (const f of selectedFixtures) {
    const fixtureId = f.fixture.id;
    console.log(`\n--- Testing fixture ${fixtureId} (${f.teams.home.name} vs ${f.teams.away.name}) ---`);

    const { raw: liveOddsData } = await fetchAPI('/odds/live', { fixture: fixtureId.toString() });
    const liveOddsResponse = (liveOddsData as { response: unknown[] }).response || [];

    let result: typeof results[0] = {
      fixture_id: fixtureId,
      league: `${f.league.name} (${f.league.country})`,
      status: f.fixture.status.short,
      elapsed: f.fixture.status.elapsed,
      endpoint: '/odds/live',
      has_data: liveOddsResponse.length > 0,
      odds_structure: [],
      sample_bet_ids: [],
    };

    if (liveOddsResponse.length > 0) {
      const oddsObj = liveOddsResponse[0] as Record<string, unknown>;
      result.odds_structure = Object.keys(oddsObj);

      // Check the structure
      if ('odds' in oddsObj && Array.isArray(oddsObj.odds)) {
        // This is the CORRECT live odds structure
        const odds = oddsObj.odds as Array<{ id: number; name: string; values: unknown[] }>;
        result.sample_bet_ids = odds.map(o => o.id);
        console.log(`  ✓ Found ${odds.length} bet types in odds array`);
        console.log(`    Bet IDs: ${result.sample_bet_ids.slice(0, 10).join(', ')}${odds.length > 10 ? '...' : ''}`);

        // Log sample values
        for (const bet of odds.slice(0, 3)) {
          console.log(`    - Bet ${bet.id} (${bet.name}): ${bet.values.length} values`);
          if (bet.values.length > 0) {
            console.log(`      Sample value: ${JSON.stringify(bet.values[0])}`);
          }
        }
        result.raw_sample = odds.slice(0, 3);
      } else if ('bookmakers' in oddsObj && Array.isArray(oddsObj.bookmakers)) {
        // This is PRE-MATCH structure - NOT expected from /odds/live
        console.log(`  ⚠️ WARNING: Got bookmakers structure from /odds/live (expected odds array)`);
        result.invalid_reason = 'WRONG_STRUCTURE_BOOKMAKERS_NOT_ODDS_ARRAY';
        result.raw_sample = oddsObj;
      } else {
        console.log(`  ⚠️ Unknown structure: ${result.odds_structure.join(', ')}`);
        result.invalid_reason = 'UNKNOWN_STRUCTURE';
        result.raw_sample = oddsObj;
      }
    } else {
      console.log(`  ❌ No live odds data returned`);
      result.invalid_reason = 'ODDS_LIVE_NOT_RETURNED_FOR_FIXTURE';
    }

    results.push(result);

    // Also test pre-match odds for comparison
    console.log(`\n  Testing pre-match /odds for same fixture...`);
    const { raw: preOddsData } = await fetchAPI('/odds', { fixture: fixtureId.toString() });
    const preOddsResponse = (preOddsData as { response: unknown[] }).response || [];

    if (preOddsResponse.length > 0) {
      const preObj = preOddsResponse[0] as Record<string, unknown>;
      console.log(`  Pre-match structure: ${Object.keys(preObj).join(', ')}`);
      if ('bookmakers' in preObj && Array.isArray(preObj.bookmakers)) {
        const bookmakers = preObj.bookmakers as Array<{ id: number; name: string; bets: Array<{ id: number; name: string }> }>;
        console.log(`  Found ${bookmakers.length} bookmakers`);
        if (bookmakers[0]?.bets) {
          console.log(`  Sample bookmaker bets: ${bookmakers[0].bets.slice(0, 5).map(b => `${b.id}:${b.name}`).join(', ')}`);
        }
      }
    } else {
      console.log(`  No pre-match odds (expected for live matches)`);
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }

  // Summary
  console.log('\n====================================================');
  console.log('PHASE 2B DIAGNOSTIC SUMMARY');
  console.log('====================================================\n');

  console.log('### BET ID ANALYSIS ###');
  console.log('Pre-match bet IDs (from /odds/bets):');
  const preBetById: Record<number, string> = {};
  for (const b of preBets) {
    preBetById[b.id] = b.name;
  }
  console.log(`  Asian Handicap (pre): id=8 -> ${preBetById[8] || 'NOT IN CATALOG'}`);
  console.log(`  Over/Under (pre): id=5 -> ${preBetById[5] || 'NOT IN CATALOG'}`);
  console.log(`  Match Winner (pre): id=1 -> ${preBetById[1] || 'NOT IN CATALOG'}`);

  console.log('\nLive bet IDs (from /odds/live/bets):');
  const liveBetById: Record<number, string> = {};
  for (const b of liveBets) {
    liveBetById[b.id] = b.name;
  }
  console.log(`  Asian Handicap (live): id=33 -> ${liveBetById[33] || 'NOT IN CATALOG'}`);
  console.log(`  Over/Under Line (live): id=36 -> ${liveBetById[36] || 'NOT IN CATALOG'}`);
  console.log(`  Fulltime Result (live): id=59 -> ${liveBetById[59] || 'NOT IN CATALOG'}`);
  console.log(`  Match Goals (live): id=25 -> ${liveBetById[25] || 'NOT IN CATALOG'}`);

  console.log('\n### FIXTURE ODDS RESULTS ###');
  for (const r of results) {
    console.log(`\nFixture ${r.fixture_id} (${r.league}) @ ${r.elapsed}':`);
    console.log(`  Endpoint: ${r.endpoint}`);
    console.log(`  Has Data: ${r.has_data}`);
    console.log(`  Structure: ${r.odds_structure.join(', ') || 'N/A'}`);
    console.log(`  Bet IDs Found: ${r.sample_bet_ids.join(', ') || 'N/A'}`);
    if (r.invalid_reason) {
      console.log(`  Invalid Reason: ${r.invalid_reason}`);
    }
  }

  // Check current code's bet IDs vs actual
  console.log('\n### CODE BET ID VERIFICATION ###');
  const codeLiveBetIds = {
    ASIAN_HANDICAP: 33,
    OVER_UNDER_LINE: 36,
    FULLTIME_RESULT: 59,
    MATCH_GOALS: 25,
    BOTH_TEAMS_SCORE: 69,
  };

  for (const [name, id] of Object.entries(codeLiveBetIds)) {
    const catalogName = liveBetById[id];
    console.log(`  ${name} (id=${id}): ${catalogName ? `✓ ${catalogName}` : '❌ NOT FOUND IN CATALOG'}`);
  }

  // Output raw sample for debugging
  console.log('\n### RAW SAMPLE OUTPUT (first fixture with data) ###');
  const withData = results.find(r => r.has_data && r.raw_sample);
  if (withData) {
    console.log(`Fixture ${withData.fixture_id}:`);
    console.log(JSON.stringify(withData.raw_sample, null, 2));
  } else {
    console.log('No fixtures had usable odds data');
  }

  console.log('\n====================================================');
  console.log('END DIAGNOSTIC');
  console.log('====================================================');
}

main().catch(console.error);
