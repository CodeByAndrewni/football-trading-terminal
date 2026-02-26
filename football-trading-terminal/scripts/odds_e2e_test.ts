#!/usr/bin/env bun
/**
 * PHASE 2B: End-to-End Odds Pipeline Test
 * Tests the complete flow: API -> parseLiveOdds -> convertToOddsInfo -> OddsInfo
 */

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.FOOTBALL_API_KEY || '436ad44cf47ee6a4acf971c37aafdf1a';

// Import the actual parsing functions
import { parseLiveOdds, convertToOddsInfo } from '../src/services/oddsService';
import type { LiveOddsData } from '../src/types';

async function fetchLiveOddsRaw(fixtureId: number): Promise<unknown[]> {
  const url = `${API_BASE}/odds/live?fixture=${fixtureId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-apisports-key': API_KEY },
  });
  const data = await res.json();
  return data.response || [];
}

async function fetchLiveFixtures(): Promise<any[]> {
  const url = `${API_BASE}/fixtures?live=all`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-apisports-key': API_KEY },
  });
  const data = await res.json();
  return data.response || [];
}

async function main() {
  console.log('\n====================================================');
  console.log('PHASE 2B: END-TO-END ODDS PIPELINE TEST');
  console.log('====================================================\n');

  // Step 1: Get live fixtures
  console.log('### STEP 1: Fetching live fixtures ###\n');
  const fixtures = await fetchLiveFixtures();
  console.log(`Found ${fixtures.length} live fixtures\n`);

  if (fixtures.length === 0) {
    console.log('No live fixtures. Exiting.');
    return;
  }

  // Test first 5 fixtures
  const testFixtures = fixtures.slice(0, 5);

  for (const f of testFixtures) {
    const fixtureId = f.fixture.id;
    const minute = f.fixture.status.elapsed || 0;

    console.log('='.repeat(70));
    console.log(`FIXTURE ${fixtureId}: ${f.teams.home.name} vs ${f.teams.away.name}`);
    console.log(`League: ${f.league.name} (${f.league.country}) | ${f.fixture.status.short} @ ${minute}'`);
    console.log('='.repeat(70));

    // Step 2: Fetch raw odds
    console.log('\n  [1] Fetching /odds/live...');
    const rawResponse = await fetchLiveOddsRaw(fixtureId);

    console.log(`      Raw response length: ${rawResponse.length}`);

    if (rawResponse.length === 0) {
      console.log('      ❌ NO DATA - Reason: ODDS_LIVE_NOT_RETURNED_FOR_FIXTURE');
      console.log('      (This league/fixture may not have live odds coverage)\n');
      continue;
    }

    const rawOdds = rawResponse[0] as any;
    console.log(`      Raw keys: ${Object.keys(rawOdds).join(', ')}`);

    // Check structure
    if (rawOdds.odds && Array.isArray(rawOdds.odds)) {
      console.log(`      Odds array length: ${rawOdds.odds.length}`);
      console.log(`      Sample bet IDs: ${rawOdds.odds.slice(0, 10).map((o: any) => o.id).join(', ')}`);
    } else if (rawOdds.bookmakers) {
      console.log(`      ⚠️ Has bookmakers (pre-match structure)!`);
    }

    // Step 3: Run through parseLiveOdds
    console.log('\n  [2] Running parseLiveOdds()...');

    // Cast to LiveOddsData (the parser handles the actual structure detection)
    const parsed = parseLiveOdds(rawOdds as any, minute);

    console.log(`      fixture_id: ${parsed.fixture_id}`);
    console.log(`      is_live: ${parsed.is_live}`);
    console.log(`      bookmaker: ${parsed.bookmaker}`);
    console.log(`      _fetch_status: ${parsed._fetch_status}`);
    console.log(`      _raw_available: ${parsed._raw_available}`);
    console.log(`      PARSED VALUES:`);
    console.log(`        - asian_handicap_line: ${parsed.asian_handicap_line}`);
    console.log(`        - asian_handicap_home: ${parsed.asian_handicap_home}`);
    console.log(`        - asian_handicap_away: ${parsed.asian_handicap_away}`);
    console.log(`        - over_2_5: ${parsed.over_2_5}`);
    console.log(`        - under_2_5: ${parsed.under_2_5}`);
    console.log(`        - home_win: ${parsed.home_win}`);
    console.log(`        - draw: ${parsed.draw}`);
    console.log(`        - away_win: ${parsed.away_win}`);

    // Step 4: Run through convertToOddsInfo
    console.log('\n  [3] Running convertToOddsInfo()...');
    const oddsInfo = convertToOddsInfo(parsed);

    console.log(`      ODDSINFO RESULT:`);
    console.log(`        - handicap.value: ${oddsInfo.handicap?.value}`);
    console.log(`        - handicap.home: ${oddsInfo.handicap?.home}`);
    console.log(`        - handicap.away: ${oddsInfo.handicap?.away}`);
    console.log(`        - overUnder.total: ${oddsInfo.overUnder?.total}`);
    console.log(`        - overUnder.over: ${oddsInfo.overUnder?.over}`);
    console.log(`        - overUnder.under: ${oddsInfo.overUnder?.under}`);
    console.log(`        - _fetch_status: ${oddsInfo._fetch_status}`);
    console.log(`        - _source: ${oddsInfo._source}`);
    console.log(`        - _bookmaker: ${oddsInfo._bookmaker}`);

    // Step 5: Simulate UI check
    console.log('\n  [4] UI Display Check...');

    const oddsSource = oddsInfo._fetch_status;
    const handicapValue = oddsInfo.handicap?.value;
    const ouTotal = oddsInfo.overUnder?.total;

    const showHandicap = oddsSource === 'SUCCESS' && handicapValue !== null && handicapValue !== undefined;
    const showOverUnder = oddsSource === 'SUCCESS' && ouTotal !== null && ouTotal !== undefined;

    console.log(`      UI would show handicap: ${showHandicap ? `✓ line=${handicapValue}` : '❌ N/A'}`);
    console.log(`      UI would show overUnder: ${showOverUnder ? `✓ total=${ouTotal}` : '❌ N/A'}`);

    if (!showHandicap || !showOverUnder) {
      console.log(`\n      ROOT CAUSE ANALYSIS:`);
      console.log(`        - oddsSource === 'SUCCESS': ${oddsSource === 'SUCCESS'} (actual: ${oddsSource})`);
      console.log(`        - handicapValue !== null: ${handicapValue !== null} (actual: ${handicapValue})`);
      console.log(`        - ouTotal !== null: ${ouTotal !== null} (actual: ${ouTotal})`);

      if (oddsSource !== 'SUCCESS') {
        console.log(`        ISSUE: _fetch_status is not SUCCESS`);
      }
      if (handicapValue === null) {
        console.log(`        ISSUE: handicap.value is null (bet 33 not found or not parsed)`);
      }
      if (ouTotal === null) {
        console.log(`        ISSUE: overUnder.total is null (bet 36 not found or no 2.5 line)`);
      }
    }

    console.log('\n');

    // Small delay
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('====================================================');
  console.log('END-TO-END TEST COMPLETE');
  console.log('====================================================\n');
}

main().catch(console.error);
