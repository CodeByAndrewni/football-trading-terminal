#!/usr/bin/env bun
/**
 * PHASE 2B: Test parseLiveOdds with real API data
 * This directly tests our parser with actual API responses
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY || '436ad44cf47ee6a4acf971c37aafdf1a';

// Copy the parsing logic to test
const LIVE_BET_TYPE_IDS = {
  ASIAN_HANDICAP: 33,
  OVER_UNDER_LINE: 36,
  FULLTIME_RESULT: 59,
  MATCH_GOALS: 25,
  BOTH_TEAMS_SCORE: 69,
};

interface LiveOddsBet {
  id: number;
  name: string;
  values: Array<{
    value: string;
    odd: string;
    handicap?: string | null;
    main?: boolean | null;
    suspended?: boolean;
  }>;
}

interface LiveOddsApiResponse {
  fixture: { id: number; status: { long: string; elapsed: number } };
  league: { id: number; name: string };
  teams: { home: { id: number; goals: number }; away: { id: number; goals: number } };
  status: { stopped: boolean; blocked: boolean; finished: boolean };
  update: string;
  odds: LiveOddsBet[];
}

function findLiveBet(odds: LiveOddsBet[], betId: number): LiveOddsBet | undefined {
  return odds.find(o => o.id === betId);
}

function parseLiveOverUnder(bet: LiveOddsBet | undefined): Record<string, number | null> {
  const result: Record<string, number | null> = {
    over_1_5: null, under_1_5: null,
    over_2_5: null, under_2_5: null,
    over_3_5: null, under_3_5: null,
  };
  if (!bet?.values) return result;

  for (const v of bet.values) {
    const handicap = v.handicap;
    const odd = Number.parseFloat(v.odd);
    if (Number.isNaN(odd) || v.suspended) continue;

    if (handicap === '1.5') {
      if (v.value === 'Over') result.over_1_5 = odd;
      if (v.value === 'Under') result.under_1_5 = odd;
    } else if (handicap === '2.5') {
      if (v.value === 'Over') result.over_2_5 = odd;
      if (v.value === 'Under') result.under_2_5 = odd;
    } else if (handicap === '3.5') {
      if (v.value === 'Over') result.over_3_5 = odd;
      if (v.value === 'Under') result.under_3_5 = odd;
    }
  }
  return result;
}

function parseLiveAsianHandicap(bet: LiveOddsBet | undefined): { line: number | null; home: number | null; away: number | null } {
  if (!bet?.values) return { line: null, home: null, away: null };

  // Find main=true values first
  const mainValues = bet.values.filter(v => v.main && !v.suspended);

  if (mainValues.length >= 2) {
    const homeVal = mainValues.find(v => v.value === 'Home');
    const awayVal = mainValues.find(v => v.value === 'Away');
    if (homeVal && awayVal) {
      return {
        line: homeVal.handicap ? Number.parseFloat(homeVal.handicap) : null,
        home: Number.parseFloat(homeVal.odd) || null,
        away: Number.parseFloat(awayVal.odd) || null,
      };
    }
  }

  // Fallback: take first non-suspended pair
  const validValues = bet.values.filter(v => !v.suspended);
  const homeVal = validValues.find(v => v.value === 'Home');
  const awayVal = validValues.find(v => v.value === 'Away');
  if (homeVal && awayVal) {
    return {
      line: homeVal.handicap ? Number.parseFloat(homeVal.handicap) : null,
      home: Number.parseFloat(homeVal.odd) || null,
      away: Number.parseFloat(awayVal.odd) || null,
    };
  }
  return { line: null, home: null, away: null };
}

function parseLiveFulltimeResult(bet: LiveOddsBet | undefined): { home: number | null; draw: number | null; away: number | null } {
  if (!bet?.values) return { home: null, draw: null, away: null };
  const homeVal = bet.values.find(v => v.value === 'Home' && !v.suspended);
  const drawVal = bet.values.find(v => v.value === 'Draw' && !v.suspended);
  const awayVal = bet.values.find(v => v.value === 'Away' && !v.suspended);
  return {
    home: homeVal ? Number.parseFloat(homeVal.odd) || null : null,
    draw: drawVal ? Number.parseFloat(drawVal.odd) || null : null,
    away: awayVal ? Number.parseFloat(awayVal.odd) || null : null,
  };
}

async function main() {
  console.log('\n====================================================');
  console.log('PHASE 2B: PARSER TEST WITH REAL API DATA');
  console.log('====================================================\n');

  // Step 1: Get a live fixture
  const fixturesRes = await fetch(`${API_BASE}/fixtures?live=all`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  const fixturesData = await fixturesRes.json();
  const fixtures = fixturesData.response || [];

  console.log(`Found ${fixtures.length} live fixtures`);

  if (fixtures.length === 0) {
    console.log('No live fixtures. Exiting.');
    return;
  }

  // Test 3 fixtures
  for (let i = 0; i < Math.min(3, fixtures.length); i++) {
    const f = fixtures[i];
    const fixtureId = f.fixture.id;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TESTING FIXTURE ${fixtureId}: ${f.teams.home.name} vs ${f.teams.away.name}`);
    console.log(`League: ${f.league.name} (${f.league.country})`);
    console.log(`Status: ${f.fixture.status.short} @ ${f.fixture.status.elapsed}'`);
    console.log(`${'='.repeat(60)}\n`);

    // Fetch live odds
    const oddsRes = await fetch(`${API_BASE}/odds/live?fixture=${fixtureId}`, {
      headers: { 'x-apisports-key': API_KEY },
    });
    const oddsData = await oddsRes.json();

    console.log(`API Response:`);
    console.log(`  - get: ${oddsData.get}`);
    console.log(`  - results: ${oddsData.results}`);
    console.log(`  - errors: ${JSON.stringify(oddsData.errors)}`);

    if (!oddsData.response || oddsData.response.length === 0) {
      console.log('\n❌ NO ODDS DATA RETURNED');
      console.log('Reason: ODDS_LIVE_NOT_RETURNED_FOR_FIXTURE');
      continue;
    }

    const oddsResponse = oddsData.response[0] as LiveOddsApiResponse;

    console.log(`\nRaw Response Structure:`);
    console.log(`  - Keys: ${Object.keys(oddsResponse).join(', ')}`);

    // Check if it has 'odds' array (correct live structure)
    if ('odds' in oddsResponse && Array.isArray(oddsResponse.odds)) {
      console.log(`  - odds array length: ${oddsResponse.odds.length}`);
      console.log(`  - Bet IDs present: ${oddsResponse.odds.map(o => o.id).join(', ')}`);

      // Parse each bet type
      console.log('\n### PARSING BET TYPES ###\n');

      // Asian Handicap (id=33)
      const ahBet = findLiveBet(oddsResponse.odds, LIVE_BET_TYPE_IDS.ASIAN_HANDICAP);
      console.log(`Asian Handicap (id=33):`);
      if (ahBet) {
        console.log(`  - Found: YES (${ahBet.values.length} values)`);
        console.log(`  - Raw values sample: ${JSON.stringify(ahBet.values.slice(0, 4), null, 2)}`);
        const ahParsed = parseLiveAsianHandicap(ahBet);
        console.log(`  - PARSED: line=${ahParsed.line}, home=${ahParsed.home}, away=${ahParsed.away}`);
      } else {
        console.log(`  - Found: NO`);
      }

      // Over/Under Line (id=36)
      const ouBet = findLiveBet(oddsResponse.odds, LIVE_BET_TYPE_IDS.OVER_UNDER_LINE);
      console.log(`\nOver/Under Line (id=36):`);
      if (ouBet) {
        console.log(`  - Found: YES (${ouBet.values.length} values)`);
        console.log(`  - Raw values sample: ${JSON.stringify(ouBet.values.slice(0, 6), null, 2)}`);
        const ouParsed = parseLiveOverUnder(ouBet);
        console.log(`  - PARSED: over_2.5=${ouParsed.over_2_5}, under_2.5=${ouParsed.under_2_5}`);
      } else {
        console.log(`  - Found: NO`);
        // Try Match Goals (id=25) as fallback
        const mgBet = findLiveBet(oddsResponse.odds, LIVE_BET_TYPE_IDS.MATCH_GOALS);
        if (mgBet) {
          console.log(`  - But Match Goals (id=25) found: YES (${mgBet.values.length} values)`);
          console.log(`  - Raw values sample: ${JSON.stringify(mgBet.values.slice(0, 6), null, 2)}`);
          const mgParsed = parseLiveOverUnder(mgBet);
          console.log(`  - Match Goals PARSED: over_2.5=${mgParsed.over_2_5}, under_2.5=${mgParsed.under_2_5}`);
        }
      }

      // Fulltime Result (id=59)
      const ftBet = findLiveBet(oddsResponse.odds, LIVE_BET_TYPE_IDS.FULLTIME_RESULT);
      console.log(`\nFulltime Result (id=59):`);
      if (ftBet) {
        console.log(`  - Found: YES (${ftBet.values.length} values)`);
        console.log(`  - Raw values: ${JSON.stringify(ftBet.values, null, 2)}`);
        const ftParsed = parseLiveFulltimeResult(ftBet);
        console.log(`  - PARSED: home=${ftParsed.home}, draw=${ftParsed.draw}, away=${ftParsed.away}`);
      } else {
        console.log(`  - Found: NO`);
      }

      // Summary
      const ah = parseLiveAsianHandicap(findLiveBet(oddsResponse.odds, 33));
      const ou = parseLiveOverUnder(findLiveBet(oddsResponse.odds, 36));
      const ft = parseLiveFulltimeResult(findLiveBet(oddsResponse.odds, 59));

      const hasAnyOdds = ft.home !== null || ou.over_2_5 !== null || ah.line !== null;

      console.log('\n### FINAL MAPPED VALUES ###');
      console.log(`  - 即时让球盘 (live AH): line=${ah.line}, home=${ah.home}, away=${ah.away}`);
      console.log(`  - 即时大小球 (live O/U): over_2.5=${ou.over_2_5}, under_2.5=${ou.under_2_5}`);
      console.log(`  - 1x2: home=${ft.home}, draw=${ft.draw}, away=${ft.away}`);
      console.log(`  - _raw_available: ${hasAnyOdds}`);
      console.log(`  - _fetch_status: ${hasAnyOdds ? 'SUCCESS' : 'EMPTY'}`);

    } else if ('bookmakers' in oddsResponse) {
      console.log(`\n⚠️ Got bookmakers structure instead of odds array!`);
      console.log(`This is PRE-MATCH structure from /odds endpoint, not live odds.`);
      console.log(`ROOT CAUSE: Endpoint mismatch - may be receiving pre-match data`);
    } else {
      console.log(`\n⚠️ Unknown structure!`);
      console.log(`Keys: ${Object.keys(oddsResponse).join(', ')}`);
    }

    // Small delay
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n====================================================');
  console.log('TEST COMPLETE');
  console.log('====================================================\n');
}

main().catch(console.error);
