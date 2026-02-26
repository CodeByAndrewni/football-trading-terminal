// ============================================
// E2E Tests: Complete Odds Data Flow
// Tests the entire pipeline: fetch → parse → validate → convert → score
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLiveOdds, convertToOddsInfo, storeOddsSnapshot } from '../services/oddsService';
import { validateOddsLive, validateAllData } from '../services/dataValidation';
import { convertApiMatchToAdvanced } from '../services/apiConverter';
import { calculateDynamicScoreWithOdds, calculateOddsFactor } from '../services/scoringEngine';
import type { Match, TeamStatistics, MatchEvent, LiveOddsData } from '../types';
import type { OddsAnalysis } from '../types';

// ============================================
// Mock Data - Simulates Real API Responses
// ============================================

// Simulates a live odds response from /odds/live
function createMockLiveOddsResponse(options: {
  fixtureId: number;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  mainLine?: number;
  overOdd?: number;
  underOdd?: number;
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  ahLine?: number;
  ahHome?: number;
  ahAway?: number;
}): LiveOddsData {
  const {
    fixtureId,
    minute,
    homeGoals,
    awayGoals,
    mainLine = 2.5,
    overOdd = 1.85,
    underOdd = 1.95,
    homeWin = 2.10,
    draw = 3.40,
    awayWin = 3.20,
    ahLine = -0.5,
    ahHome = 1.90,
    ahAway = 1.90,
  } = options;

  return {
    fixture: {
      id: fixtureId,
      status: {
        long: 'Second Half',
        elapsed: minute,
        seconds: `${minute}:00`,
      },
    },
    league: { id: 39, season: 2024 },
    teams: {
      home: { id: 100, goals: homeGoals },
      away: { id: 200, goals: awayGoals },
    },
    status: { stopped: false, blocked: false, finished: false },
    update: new Date().toISOString(),
    odds: [
      // Match Winner (id: 59)
      {
        id: 59,
        name: 'Match Winner',
        values: [
          { value: 'Home', odd: homeWin.toString() },
          { value: 'Draw', odd: draw.toString() },
          { value: 'Away', odd: awayWin.toString() },
        ],
      },
      // Over/Under (id: 36)
      {
        id: 36,
        name: 'Over/Under',
        values: [
          { value: 'Over', odd: '1.25', handicap: '1.5' },
          { value: 'Under', odd: '3.50', handicap: '1.5' },
          { value: 'Over', odd: overOdd.toString(), handicap: mainLine.toString(), main: true },
          { value: 'Under', odd: underOdd.toString(), handicap: mainLine.toString(), main: true },
          { value: 'Over', odd: '2.50', handicap: '3.5' },
          { value: 'Under', odd: '1.50', handicap: '3.5' },
        ],
      },
      // Asian Handicap (id: 33)
      {
        id: 33,
        name: 'Asian Handicap',
        values: [
          { value: 'Home', odd: ahHome.toString(), handicap: ahLine.toString(), main: true },
          { value: 'Away', odd: ahAway.toString(), handicap: (ahLine * -1).toString(), main: true },
        ],
      },
    ],
  };
}

// Simulates a match response from /fixtures?live=all
function createMockMatchResponse(options: {
  fixtureId: number;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  leagueId?: number;
}): Match {
  const {
    fixtureId,
    minute,
    homeGoals,
    awayGoals,
    leagueId = 39,
  } = options;

  return {
    fixture: {
      id: fixtureId,
      referee: 'Test Referee',
      timezone: 'UTC',
      date: '2024-01-01T15:00:00Z',
      timestamp: 1704121200,
      periods: { first: 1704121200, second: 1704124800 },
      venue: { id: 1, name: 'Test Stadium', city: 'Test City' },
      status: { long: 'Second Half', short: '2H', elapsed: minute },
    },
    league: {
      id: leagueId,
      name: 'Premier League',
      country: 'England',
      logo: '',
      flag: '',
      season: 2024,
    },
    teams: {
      home: { id: 100, name: 'Home Team', logo: '' },
      away: { id: 200, name: 'Away Team', logo: '' },
    },
    goals: { home: homeGoals, away: awayGoals },
    score: {
      halftime: { home: 0, away: 0 },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

// Simulates statistics response
function createMockStatisticsResponse(homeTeamId = 100, awayTeamId = 200): TeamStatistics[] {
  return [
    {
      team: { id: homeTeamId, name: 'Home Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: 12 },
        { type: 'Shots on Goal', value: 5 },
        { type: 'Ball Possession', value: '55%' },
        { type: 'Corner Kicks', value: 6 },
        { type: 'Dangerous Attacks', value: 50 },
        { type: 'expected_goals', value: 1.5 },
        { type: 'Fouls', value: 8 },
      ],
    },
    {
      team: { id: awayTeamId, name: 'Away Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: 10 },
        { type: 'Shots on Goal', value: 4 },
        { type: 'Ball Possession', value: '45%' },
        { type: 'Corner Kicks', value: 4 },
        { type: 'Dangerous Attacks', value: 40 },
        { type: 'expected_goals', value: 1.2 },
        { type: 'Fouls', value: 10 },
      ],
    },
  ];
}

// Simulates events response
function createMockEventsResponse(homeTeamId = 100, awayTeamId = 200): MatchEvent[] {
  return [
    {
      time: { elapsed: 15, extra: null },
      team: { id: homeTeamId, name: 'Home Team', logo: '' },
      player: { id: 1, name: 'Player A' },
      assist: { id: null, name: null },
      type: 'Goal',
      detail: 'Normal Goal',
      comments: null,
    },
    {
      time: { elapsed: 30, extra: null },
      team: { id: awayTeamId, name: 'Away Team', logo: '' },
      player: { id: 2, name: 'Player B' },
      assist: { id: null, name: null },
      type: 'Card',
      detail: 'Yellow Card',
      comments: null,
    },
    {
      time: { elapsed: 60, extra: null },
      team: { id: homeTeamId, name: 'Home Team', logo: '' },
      player: { id: 3, name: 'Player C' },
      assist: { id: 4, name: 'Player D' },
      type: 'subst',
      detail: 'Substitution 1',
      comments: null,
    },
  ];
}

// ============================================
// E2E Test Suite
// ============================================

describe('Odds Data Flow E2E', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Step 1: Odds Parsing', () => {
    it('should parse live odds response correctly', () => {
      const liveOdds = createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
        mainLine: 2.5,
        overOdd: 1.85,
        underOdd: 1.95,
      });

      const parsed = parseLiveOdds(liveOdds, 75);

      expect(parsed.fixture_id).toBe(12345);
      expect(parsed.is_live).toBe(true);
      expect(parsed.main_ou_line).toBe(2.5);
      expect(parsed.main_ou_over).toBe(1.85);
      expect(parsed.main_ou_under).toBe(1.95);
      expect(parsed._fetch_status).toBe('SUCCESS');
    });

    it('should handle dynamic main line detection', () => {
      const liveOdds = createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 80,
        homeGoals: 2,
        awayGoals: 1,
        mainLine: 3.75, // Market shifted to higher line
        overOdd: 1.90,
        underOdd: 1.90,
      });

      const parsed = parseLiveOdds(liveOdds, 80);

      expect(parsed.main_ou_line).toBe(3.75);
    });
  });

  describe('Step 2: Odds Validation', () => {
    it('should validate live odds as real data', () => {
      const liveOdds = createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });

      const validation = validateOddsLive([liveOdds]);

      expect(validation.is_real).toBe(true);
      expect(validation.has_1x2).toBe(true);
      expect(validation.has_over_under).toBe(true);
      expect(validation.has_asian_handicap).toBe(true);
      expect(validation.is_live).toBe(true);
    });

    it('should mark empty odds as invalid', () => {
      const validation = validateOddsLive([]);

      expect(validation.is_real).toBe(false);
      expect(validation.reasons).toContain('ODDS_EMPTY');
    });
  });

  describe('Step 3: OddsInfo Conversion', () => {
    it('should convert parsed odds to OddsInfo format', () => {
      const liveOdds = createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
        homeWin: 2.10,
        draw: 3.40,
        awayWin: 3.20,
        ahLine: -0.5,
        ahHome: 1.85,
        ahAway: 1.95,
      });

      const parsed = parseLiveOdds(liveOdds, 75);
      const oddsInfo = convertToOddsInfo(parsed);

      expect(oddsInfo.handicap?.value).toBe(-0.5);
      expect(oddsInfo.handicap?.home).toBe(1.85);
      expect(oddsInfo.handicap?.away).toBe(1.95);
      expect(oddsInfo.overUnder?.total).toBe(2.5);
      expect(oddsInfo.matchWinner?.home).toBe(2.10);
      expect(oddsInfo._fetch_status).toBe('SUCCESS');
    });

    it('should include all O/U lines for hover tooltip', () => {
      const liveOdds = createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });

      const parsed = parseLiveOdds(liveOdds, 75);
      const oddsInfo = convertToOddsInfo(parsed);

      expect(oddsInfo.overUnder?.allLines).toBeDefined();
      expect(oddsInfo.overUnder?.allLines?.length).toBeGreaterThan(0);
    });
  });

  describe('Step 4: Full Data Validation', () => {
    it('should validate complete match data', () => {
      const match = createMockMatchResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const statistics = createMockStatisticsResponse();
      const events = createMockEventsResponse();
      const odds = [createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      })];

      const validation = validateAllData(match, statistics, events, odds);

      expect(validation.fixtures_real).toBe(true);
      expect(validation.stats_real).toBe(true);
      expect(validation.odds_real).toBe(true);
      expect(validation.events_real).toBe(true);
      expect(validation.data_quality).toBe('REAL');
    });

    it('should return PARTIAL when odds missing', () => {
      const match = createMockMatchResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const statistics = createMockStatisticsResponse();
      const events = createMockEventsResponse();

      const validation = validateAllData(match, statistics, events, []);

      expect(validation.fixtures_real).toBe(true);
      expect(validation.stats_real).toBe(true);
      expect(validation.odds_real).toBe(false);
      expect(validation.data_quality).toBe('PARTIAL');
    });
  });

  describe('Step 5: Match Conversion with Odds', () => {
    it('should convert match with live odds to AdvancedMatch', () => {
      const match = createMockMatchResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const statistics = createMockStatisticsResponse();
      const events = createMockEventsResponse();
      const odds = [createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
        ahLine: -0.5,
      })];

      const result = convertApiMatchToAdvanced(match, statistics, events, undefined, odds);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(12345);
      // Phase 2A: home.handicap 现在来自赛前赔率，未提供则为 null
      expect(result?.home.handicap).toBeNull();
      expect(result?.odds._fetch_status).toBe('SUCCESS');
      expect(result?.odds.overUnder?.total).toBe(2.5);
    });

    it('should mark odds as N/A when not provided', () => {
      const match = createMockMatchResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const statistics = createMockStatisticsResponse();
      const events = createMockEventsResponse();

      const result = convertApiMatchToAdvanced(match, statistics, events, undefined, undefined);

      expect(result?.odds._fetch_status).toBe('EMPTY');
      expect(result?.home.handicap).toBeNull();
    });
  });

  describe('Step 6: Scoring with Odds Factor', () => {
    it('should calculate score including odds factor', () => {
      const match = createMockMatchResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const statistics = createMockStatisticsResponse();
      const events = createMockEventsResponse();
      const odds = [createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      })];

      const advancedMatch = convertApiMatchToAdvanced(match, statistics, events, undefined, odds);
      expect(advancedMatch).not.toBeNull();

      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 12345,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.85, under: 1.95 },
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: { yes: 1.75, no: 2.05 },
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'HIGH', // High goal expectation
        anomalies: [],
      };

      const result = calculateDynamicScoreWithOdds(advancedMatch!, {
        oddsAnalysis,
      });

      expect(result).not.toBeNull();
      expect(result?.factors.oddsFactor).toBeDefined();
      expect(result?.factors.oddsFactor?.dataAvailable).toBe(true);
      expect(result?.factors.oddsFactor?.score).toBeGreaterThan(0);
    });

    it('should detect odds movements and add to score', () => {
      const match = createMockMatchResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const statistics = createMockStatisticsResponse();
      const odds = [createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      })];

      const advancedMatch = convertApiMatchToAdvanced(match, statistics, [], undefined, odds);

      const currentOdds: OddsAnalysis = {
        fixtureId: 12345,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.70, under: 2.10 }, // Over dropped
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const previousOdds: OddsAnalysis = {
        fixtureId: 12345,
        timestamp: Date.now() - 60000,
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.90, under: 1.90 }, // Over was higher
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const oddsFactor = calculateOddsFactor(advancedMatch!, currentOdds, previousOdds);

      expect(oddsFactor.details.overOddsDrop).toBe(true);
      expect(oddsFactor.score).toBeGreaterThan(0);
    });
  });

  describe('Complete Pipeline Integration', () => {
    it('should process complete data flow from API response to final score', () => {
      // Step 1: Simulate API responses
      const matchResponse = createMockMatchResponse({
        fixtureId: 12345,
        minute: 80,
        homeGoals: 0,
        awayGoals: 1,
        leagueId: 39, // Premier League
      });
      const statsResponse = createMockStatisticsResponse();
      const eventsResponse = createMockEventsResponse();
      const oddsResponse = [createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 80,
        homeGoals: 0,
        awayGoals: 1,
        mainLine: 2.5,
        overOdd: 2.20, // Higher over odds (less likely to hit)
        underOdd: 1.65,
        ahLine: -1.0, // Home is strong favorite
        ahHome: 1.85,
        ahAway: 1.95,
      })];

      // Step 2: Parse and validate odds
      const parsedOdds = parseLiveOdds(oddsResponse[0], 80);
      expect(parsedOdds._fetch_status).toBe('SUCCESS');
      expect(parsedOdds.asian_handicap_line).toBe(-1.0);

      // Step 3: Validate all data
      const validation = validateAllData(
        matchResponse,
        statsResponse,
        eventsResponse,
        oddsResponse
      );
      expect(validation.data_quality).toBe('REAL');

      // Step 4: Convert to AdvancedMatch
      const advancedMatch = convertApiMatchToAdvanced(
        matchResponse,
        statsResponse,
        eventsResponse,
        undefined,
        oddsResponse
      );
      expect(advancedMatch).not.toBeNull();
      expect(advancedMatch?.status).toBe('live');
      expect(advancedMatch?.minute).toBe(80);
      // Phase 2A: home.handicap 现在来自赛前赔率，未提供则为 null
      expect(advancedMatch?.home.handicap).toBeNull();
      expect(advancedMatch?.odds._fetch_status).toBe('SUCCESS');

      // Step 5: Check scenario tags
      // 由于没有提供 prematch odds，strong_behind 不会被检测到
      expect(advancedMatch?.scenarioTags).toContain('critical_time');
      // 测试验证：没有 prematch handicap 时，无法判断强队落后

      // Step 6: Calculate final score
      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 12345,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 2.20, under: 1.65 },
        asianHandicap: { line: -1.0, home: 1.85, away: 1.95 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'HOME_FAVORED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const result = calculateDynamicScoreWithOdds(advancedMatch!, {
        oddsAnalysis,
      });

      expect(result).not.toBeNull();
      expect(result?.totalScore).toBeGreaterThan(30); // Should be above base
      expect(result?._dataMode).toBe('STRICT_REAL_DATA');
      expect(result?.factors.oddsFactor?.dataAvailable).toBe(true);

      // Step 7: Verify alerts are generated
      expect(Array.isArray(result?.alerts)).toBe(true);
    });

    it('should handle data flow with missing odds gracefully', () => {
      const matchResponse = createMockMatchResponse({
        fixtureId: 12345,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const statsResponse = createMockStatisticsResponse();
      const eventsResponse = createMockEventsResponse();

      // No odds data
      const validation = validateAllData(
        matchResponse,
        statsResponse,
        eventsResponse,
        undefined
      );
      expect(validation.data_quality).toBe('PARTIAL');

      const advancedMatch = convertApiMatchToAdvanced(
        matchResponse,
        statsResponse,
        eventsResponse,
        undefined,
        undefined // No odds
      );

      expect(advancedMatch).not.toBeNull();
      expect(advancedMatch?.odds._fetch_status).toBe('EMPTY');
      expect(advancedMatch?.home.handicap).toBeNull();

      // Should still be scoreable
      const result = calculateDynamicScoreWithOdds(advancedMatch!, {});
      expect(result).not.toBeNull();
      expect(result?.factors.oddsFactor?.dataAvailable).toBe(false);
      expect(result?.factors.oddsFactor?.score).toBe(0);
    });

    it('should preserve real data markers throughout pipeline', () => {
      const matchResponse = createMockMatchResponse({
        fixtureId: 12345,
        minute: 85,
        homeGoals: 2,
        awayGoals: 2,
      });
      const statsResponse = createMockStatisticsResponse();
      const oddsResponse = [createMockLiveOddsResponse({
        fixtureId: 12345,
        minute: 85,
        homeGoals: 2,
        awayGoals: 2,
      })];

      const advancedMatch = convertApiMatchToAdvanced(
        matchResponse,
        statsResponse,
        [],
        undefined,
        oddsResponse
      );

      // Check real data markers
      expect(advancedMatch?.stats?._realDataAvailable).toBe(true);
      expect(advancedMatch?.odds._fetch_status).toBe('SUCCESS');
      expect(advancedMatch?._validation?.fixtures_real).toBe(true);
      expect(advancedMatch?._validation?.stats_real).toBe(true);
      expect(advancedMatch?._validation?.odds_real).toBe(true);

      const result = calculateDynamicScoreWithOdds(advancedMatch!, {
        oddsAnalysis: {
          fixtureId: 12345,
          timestamp: Date.now(),
          matchWinner: null,
          overUnder: { line: 4.5, over: 2.10, under: 1.70 },
          asianHandicap: null,
          bothTeamsScore: null,
          movements: [],
          marketSentiment: 'BALANCED',
          goalExpectation: 'HIGH',
          anomalies: [],
        },
      });

      expect(result?._dataMode).toBe('STRICT_REAL_DATA');
    });
  });
});
