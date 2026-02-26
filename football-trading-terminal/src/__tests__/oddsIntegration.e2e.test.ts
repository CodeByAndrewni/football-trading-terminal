// ============================================
// E2E Tests: Odds Integration
// Tests pre-match → live odds flow, trends, and market analysis
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLiveOdds, convertToOddsInfo } from '../services/oddsService';
import { validateOddsLive, validateAllData } from '../services/dataValidation';
import { convertApiMatchToAdvanced } from '../services/apiConverter';
import { calculateDynamicScoreWithOdds, calculateOddsFactor } from '../services/scoringEngine';
import type { Match, TeamStatistics, LiveOddsData, OddsData } from '../types';
import type { OddsAnalysis } from '../types';

// ============================================
// Mock Data Factories
// ============================================

function createMockMatch(fixtureId: number, minute: number, homeGoals: number, awayGoals: number): Match {
  return {
    fixture: {
      id: fixtureId,
      referee: 'Test Referee',
      timezone: 'UTC',
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      periods: { first: null, second: null },
      venue: { id: 1, name: 'Test Stadium', city: 'Test City' },
      status: { long: 'Second Half', short: '2H', elapsed: minute },
    },
    league: { id: 39, name: 'Premier League', country: 'England', logo: '', flag: '', season: 2024 },
    teams: {
      home: { id: 100, name: 'Home Team', logo: '' },
      away: { id: 200, name: 'Away Team', logo: '' },
    },
    goals: { home: homeGoals, away: awayGoals },
    score: {
      halftime: { home: null, away: null },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

function createMockStats(): TeamStatistics[] {
  return [
    {
      team: { id: 100, name: 'Home Team', logo: '' },
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
      team: { id: 200, name: 'Away Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: 8 },
        { type: 'Shots on Goal', value: 3 },
        { type: 'Ball Possession', value: '45%' },
        { type: 'Corner Kicks', value: 4 },
        { type: 'Dangerous Attacks', value: 35 },
        { type: 'expected_goals', value: 0.8 },
        { type: 'Fouls', value: 10 },
      ],
    },
  ];
}

interface OddsConfig {
  mainLine?: number;
  overOdd?: number;
  underOdd?: number;
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  ahLine?: number;
  ahHome?: number;
  ahAway?: number;
  suspended?: boolean;
}

function createLiveOdds(
  fixtureId: number,
  minute: number,
  homeGoals: number,
  awayGoals: number,
  config: OddsConfig = {}
): LiveOddsData {
  const {
    mainLine = 2.5,
    overOdd = 1.85,
    underOdd = 1.95,
    homeWin = 2.10,
    draw = 3.40,
    awayWin = 3.20,
    ahLine = -0.5,
    ahHome = 1.90,
    ahAway = 1.90,
    suspended = false,
  } = config;

  if (suspended) {
    return {
      fixture: {
        id: fixtureId,
        status: { long: 'Second Half', elapsed: minute, seconds: `${minute}:00` },
      },
      league: { id: 39, season: 2024 },
      teams: { home: { id: 100, goals: homeGoals }, away: { id: 200, goals: awayGoals } },
      status: { stopped: true, blocked: false, finished: false },
      update: new Date().toISOString(),
      odds: [],
    };
  }

  return {
    fixture: {
      id: fixtureId,
      status: { long: 'Second Half', elapsed: minute, seconds: `${minute}:00` },
    },
    league: { id: 39, season: 2024 },
    teams: { home: { id: 100, goals: homeGoals }, away: { id: 200, goals: awayGoals } },
    status: { stopped: false, blocked: false, finished: false },
    update: new Date().toISOString(),
    odds: [
      {
        id: 59,
        name: 'Match Winner',
        values: [
          { value: 'Home', odd: homeWin.toString() },
          { value: 'Draw', odd: draw.toString() },
          { value: 'Away', odd: awayWin.toString() },
        ],
      },
      {
        id: 36,
        name: 'Over/Under',
        values: [
          { value: 'Over', odd: '1.15', handicap: '1.5' },
          { value: 'Under', odd: '5.00', handicap: '1.5' },
          { value: 'Over', odd: overOdd.toString(), handicap: mainLine.toString(), main: true },
          { value: 'Under', odd: underOdd.toString(), handicap: mainLine.toString(), main: true },
          { value: 'Over', odd: '3.00', handicap: '3.5' },
          { value: 'Under', odd: '1.35', handicap: '3.5' },
          { value: 'Over', odd: '4.50', handicap: '4.5' },
          { value: 'Under', odd: '1.18', handicap: '4.5' },
        ],
      },
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

function createPreMatchOdds(
  fixtureId: number,
  config: OddsConfig = {}
): OddsData {
  const {
    homeWin = 1.95,
    draw = 3.50,
    awayWin = 3.80,
    mainLine = 2.5,
    overOdd = 1.90,
    underOdd = 1.90,
    ahLine = -0.5,
    ahHome = 1.92,
    ahAway = 1.88,
  } = config;

  return {
    league: { id: 39, name: 'Premier League', country: 'England', logo: '', flag: '', season: 2024 },
    fixture: {
      id: fixtureId,
      timezone: 'UTC',
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
    },
    update: new Date().toISOString(),
    bookmakers: [
      {
        id: 8,
        name: 'Bet365',
        bets: [
          {
            id: 1,
            name: 'Match Winner',
            values: [
              { value: 'Home', odd: homeWin.toString() },
              { value: 'Draw', odd: draw.toString() },
              { value: 'Away', odd: awayWin.toString() },
            ],
          },
          {
            id: 5,
            name: 'Goals Over/Under',
            values: [
              { value: `Over ${mainLine}`, odd: overOdd.toString() },
              { value: `Under ${mainLine}`, odd: underOdd.toString() },
            ],
          },
          {
            id: 8,
            name: 'Asian Handicap',
            values: [
              { value: `Home ${ahLine}`, odd: ahHome.toString() },
              { value: `Away ${ahLine * -1}`, odd: ahAway.toString() },
            ],
          },
        ],
      },
    ],
  };
}

// ============================================
// Test Suites
// ============================================

describe('Odds Integration E2E', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Live Odds Parsing', () => {
    it('should parse standard live odds correctly', () => {
      const liveOdds = createLiveOdds(1001, 75, 1, 1, {
        mainLine: 2.5,
        overOdd: 1.85,
        underOdd: 1.95,
        homeWin: 2.50,
        draw: 3.20,
        awayWin: 2.80,
        ahLine: 0,
        ahHome: 1.92,
        ahAway: 1.88,
      });

      const parsed = parseLiveOdds(liveOdds, 75);

      expect(parsed.fixture_id).toBe(1001);
      expect(parsed.is_live).toBe(true);
      expect(parsed.main_ou_line).toBe(2.5);
      expect(parsed.main_ou_over).toBe(1.85);
      expect(parsed.main_ou_under).toBe(1.95);
      expect(parsed.home_win).toBe(2.50);
      expect(parsed.draw).toBe(3.20);
      expect(parsed.away_win).toBe(2.80);
      expect(parsed.asian_handicap_line).toBe(0);
      expect(parsed.asian_handicap_home).toBe(1.92);
      expect(parsed.asian_handicap_away).toBe(1.88);
      expect(parsed._fetch_status).toBe('SUCCESS');
    });

    it('should extract all O/U lines for tooltip display', () => {
      const liveOdds = createLiveOdds(1002, 60, 0, 0, { mainLine: 2.5 });
      const parsed = parseLiveOdds(liveOdds, 60);

      expect(parsed.all_ou_lines).toBeDefined();
      expect(parsed.all_ou_lines.length).toBeGreaterThan(1);

      // Check that lines are sorted
      const lines = parsed.all_ou_lines.map(l => l.line);
      const sortedLines = [...lines].sort((a, b) => a - b);
      expect(lines).toEqual(sortedLines);

      // Check main line is marked
      const mainLine = parsed.all_ou_lines.find(l => l.isMain);
      expect(mainLine).toBeDefined();
      expect(mainLine?.line).toBe(2.5);
    });

    it('should handle shifted main line (high scoring match)', () => {
      const liveOdds = createLiveOdds(1003, 70, 3, 2, {
        mainLine: 5.5, // Line shifted up due to current score
        overOdd: 1.90,
        underOdd: 1.90,
      });

      const parsed = parseLiveOdds(liveOdds, 70);

      expect(parsed.main_ou_line).toBe(5.5);
    });

    it('should handle suspended odds during goal scoring', () => {
      const liveOdds = createLiveOdds(1004, 72, 2, 1, { suspended: true });
      const parsed = parseLiveOdds(liveOdds, 72);

      // When odds are suspended, status should be EMPTY (no odds data available)
      expect(parsed._fetch_status).toBe('EMPTY');
      expect(parsed.main_ou_line).toBeNull(); // No odds data
      expect(parsed.home_win).toBeNull();
      // Fixture info is still parsed
      expect(parsed.fixture_id).toBe(1004);
      expect(parsed.minute).toBe(72);
    });

    it('should extract fixed lines (1.5, 2.5, 3.5)', () => {
      const liveOdds = createLiveOdds(1005, 65, 1, 0, { mainLine: 2.5 });
      const parsed = parseLiveOdds(liveOdds, 65);

      expect(parsed.over_1_5).toBeDefined();
      expect(parsed.under_1_5).toBeDefined();
      expect(parsed.over_3_5).toBeDefined();
      expect(parsed.under_3_5).toBeDefined();
    });
  });

  describe('Pre-Match vs Live Odds Comparison', () => {
    it('should detect odds movement (over odds dropped)', () => {
      // Pre-match: Over 2.5 @ 1.90
      const preMatchOdds: OddsAnalysis = {
        fixtureId: 2001,
        timestamp: Date.now() - 3600000, // 1 hour ago
        matchWinner: { home: 1.95, draw: 3.50, away: 3.80, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.90, under: 1.90 },
        asianHandicap: { line: -0.5, home: 1.92, away: 1.88 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      // Live: Over 2.5 @ 1.70 (dropped from 1.90)
      const liveOdds: OddsAnalysis = {
        fixtureId: 2001,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.20, away: 3.40, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.70, under: 2.10 },
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const match = createMockMatch(2001, 60, 0, 0);
      const stats = createMockStats();
      const advancedMatch = convertApiMatchToAdvanced(
        match,
        stats,
        [],
        undefined,
        [createLiveOdds(2001, 60, 0, 0)]
      );

      const oddsFactor = calculateOddsFactor(advancedMatch!, liveOdds, preMatchOdds);

      expect(oddsFactor.details.overOddsDrop).toBe(true);
      expect(oddsFactor.score).toBeGreaterThan(0);
    });

    it('should detect handicap tightening', () => {
      // Pre-match: Home -1.5
      const preMatchOdds: OddsAnalysis = {
        fixtureId: 2002,
        timestamp: Date.now() - 3600000,
        matchWinner: { home: 1.50, draw: 4.50, away: 5.50, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.85, under: 1.95 },
        asianHandicap: { line: -1.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'HOME_FAVORED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      // Live: Home -1.0 (tightened from -1.5)
      const liveOdds: OddsAnalysis = {
        fixtureId: 2002,
        timestamp: Date.now(),
        matchWinner: { home: 1.70, draw: 4.00, away: 4.50, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.90, under: 1.90 },
        asianHandicap: { line: -1.0, home: 1.90, away: 1.90 }, // Tightened
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'HOME_FAVORED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const match = createMockMatch(2002, 55, 0, 0);
      const stats = createMockStats();
      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const oddsFactor = calculateOddsFactor(advancedMatch!, liveOdds, preMatchOdds);

      expect(oddsFactor.details.handicapTightening).toBe(true);
      expect(oddsFactor.score).toBeGreaterThanOrEqual(10);
    });

    it('should detect handicap widening (negative signal)', () => {
      // Pre-match: Home -0.5
      const preMatchOdds: OddsAnalysis = {
        fixtureId: 2003,
        timestamp: Date.now() - 3600000,
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.90, under: 1.90 },
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      // Live: Home -1.0 (widened from -0.5)
      const liveOdds: OddsAnalysis = {
        fixtureId: 2003,
        timestamp: Date.now(),
        matchWinner: { home: 1.80, draw: 3.80, away: 4.00, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.90, under: 1.90 },
        asianHandicap: { line: -1.0, home: 1.90, away: 1.90 }, // Widened
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'HOME_FAVORED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const match = createMockMatch(2003, 30, 1, 0);
      const stats = createMockStats();
      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const oddsFactor = calculateOddsFactor(advancedMatch!, liveOdds, preMatchOdds);

      expect(oddsFactor.details.handicapWidening).toBe(true);
      expect(oddsFactor.score).toBeLessThan(0);
    });
  });

  describe('Goal Expectation Detection', () => {
    it('should detect HIGH goal expectation from odds', () => {
      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 3001,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.55, under: 2.40 }, // Low over odds = high expectation
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: { yes: 1.50, no: 2.40 }, // Low BTTS yes = high scoring
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'HIGH',
        anomalies: [],
      };

      const match = createMockMatch(3001, 70, 1, 1);
      const stats = createMockStats();
      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const oddsFactor = calculateOddsFactor(advancedMatch!, oddsAnalysis);

      expect(oddsFactor.details.goalExpectation).toBe('HIGH');
      expect(oddsFactor.score).toBeGreaterThan(0);
    });

    it('should detect LOW goal expectation from odds', () => {
      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 3002,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 2.40, under: 1.55 }, // High over odds = low expectation
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'LOW',
        anomalies: [],
      };

      // Use a match with 2-1 score (3 goals) to avoid triggering xG divergence bonus
      // xG divergence check: xgTotal (2.3) > currentGoals + 1.5 (4.5) → false
      const match = createMockMatch(3002, 75, 2, 1);
      const stats = createMockStats();
      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const oddsFactor = calculateOddsFactor(advancedMatch!, oddsAnalysis);

      expect(oddsFactor.details.goalExpectation).toBe('LOW');
      // LOW expectation gives -3 score, no other factors should add to it
      expect(oddsFactor.score).toBeLessThan(0);
    });
  });

  describe('Multi-Bookmaker Movement Detection', () => {
    it('should detect synchronized downward movement', () => {
      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 4001,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.75, under: 2.05 },
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [
          { bookmaker: 'Bet365', betType: 'OU', direction: 'DOWN', oldOdd: 1.90, newOdd: 1.75, changePercent: -7.9, timestamp: Date.now() },
          { bookmaker: 'Bwin', betType: 'OU', direction: 'DOWN', oldOdd: 1.88, newOdd: 1.72, changePercent: -8.5, timestamp: Date.now() },
          { bookmaker: '1xBet', betType: 'OU', direction: 'DOWN', oldOdd: 1.92, newOdd: 1.78, changePercent: -7.3, timestamp: Date.now() },
          { bookmaker: 'Unibet', betType: 'OU', direction: 'DOWN', oldOdd: 1.89, newOdd: 1.74, changePercent: -7.9, timestamp: Date.now() },
        ],
        marketSentiment: 'BALANCED',
        goalExpectation: 'HIGH',
        anomalies: [],
      };

      const match = createMockMatch(4001, 65, 1, 1);
      const stats = createMockStats();
      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const oddsFactor = calculateOddsFactor(advancedMatch!, oddsAnalysis);

      expect(oddsFactor.details.multiBookmakerMovement).toBe(true);
      expect(oddsFactor.score).toBeGreaterThanOrEqual(12);
    });

    it('should not trigger for mixed movements', () => {
      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 4002,
        timestamp: Date.now(),
        matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.85, under: 1.95 },
        asianHandicap: { line: -0.5, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [
          { bookmaker: 'Bet365', betType: 'OU', direction: 'DOWN', oldOdd: 1.90, newOdd: 1.85, changePercent: -2.6, timestamp: Date.now() },
          { bookmaker: 'Bwin', betType: 'OU', direction: 'UP', oldOdd: 1.80, newOdd: 1.88, changePercent: 4.4, timestamp: Date.now() },
          { bookmaker: '1xBet', betType: 'OU', direction: 'STABLE', oldOdd: 1.85, newOdd: 1.85, changePercent: 0, timestamp: Date.now() },
        ],
        marketSentiment: 'BALANCED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const match = createMockMatch(4002, 60, 0, 0);
      const stats = createMockStats();
      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const oddsFactor = calculateOddsFactor(advancedMatch!, oddsAnalysis);

      expect(oddsFactor.details.multiBookmakerMovement).toBe(false);
    });
  });

  describe('Odds-xG Divergence Detection', () => {
    it('should detect market underestimating goals based on xG', () => {
      // High xG but market still showing high over odds
      const match = createMockMatch(5001, 70, 0, 0);
      const stats: TeamStatistics[] = [
        {
          team: { id: 100, name: 'Home Team', logo: '' },
          statistics: [
            { type: 'Total Shots', value: 18 },
            { type: 'Shots on Goal', value: 8 },
            { type: 'Ball Possession', value: '60%' },
            { type: 'Corner Kicks', value: 8 },
            { type: 'Dangerous Attacks', value: 65 },
            { type: 'expected_goals', value: 2.2 }, // High xG
            { type: 'Fouls', value: 6 },
          ],
        },
        {
          team: { id: 200, name: 'Away Team', logo: '' },
          statistics: [
            { type: 'Total Shots', value: 6 },
            { type: 'Shots on Goal', value: 2 },
            { type: 'Ball Possession', value: '40%' },
            { type: 'Corner Kicks', value: 3 },
            { type: 'Dangerous Attacks', value: 25 },
            { type: 'expected_goals', value: 0.8 },
            { type: 'Fouls', value: 12 },
          ],
        },
      ];

      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 5001,
        timestamp: Date.now(),
        matchWinner: { home: 1.80, draw: 3.80, away: 4.20, favorite: 'home' },
        overUnder: { line: 0.5, over: 2.20, under: 1.65 }, // Over 0.5 @ 2.20 = market expects low goals
        asianHandicap: { line: -0.75, home: 1.90, away: 1.90 },
        bothTeamsScore: null,
        movements: [],
        marketSentiment: 'HOME_FAVORED',
        goalExpectation: 'MEDIUM',
        anomalies: [],
      };

      const oddsFactor = calculateOddsFactor(advancedMatch!, oddsAnalysis);

      // xG is 3.0 but current goals are 0, over odds are 2.20
      // This represents a divergence
      expect(oddsFactor.details.oddsXgDivergence).toBe(true);
    });
  });

  describe('Complete Scoring with Odds Factor', () => {
    it('should include odds factor in total score calculation', () => {
      const match = createMockMatch(6001, 82, 1, 1);
      const stats = createMockStats();
      const liveOddsData = [createLiveOdds(6001, 82, 1, 1, {
        mainLine: 2.5,
        overOdd: 1.75,
        underOdd: 2.05,
      })];

      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, liveOddsData);

      const oddsAnalysis: OddsAnalysis = {
        fixtureId: 6001,
        timestamp: Date.now(),
        matchWinner: { home: 2.30, draw: 3.10, away: 3.00, favorite: 'home' },
        overUnder: { line: 2.5, over: 1.75, under: 2.05 },
        asianHandicap: { line: 0, home: 1.90, away: 1.90 },
        bothTeamsScore: { yes: 1.35, no: 3.00 },
        movements: [],
        marketSentiment: 'BALANCED',
        goalExpectation: 'HIGH',
        anomalies: [],
      };

      const result = calculateDynamicScoreWithOdds(advancedMatch!, { oddsAnalysis });

      expect(result).not.toBeNull();
      expect(result?.factors.oddsFactor).toBeDefined();
      expect(result?.factors.oddsFactor?.dataAvailable).toBe(true);
      expect(result?.factors.oddsFactor?.details.goalExpectation).toBe('HIGH');
      expect(result?.totalScore).toBeGreaterThan(30); // Base + factors
    });

    it('should handle scoring without odds data gracefully', () => {
      const match = createMockMatch(6002, 80, 2, 1);
      const stats = createMockStats();

      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const result = calculateDynamicScoreWithOdds(advancedMatch!, {});

      expect(result).not.toBeNull();
      expect(result?.factors.oddsFactor?.dataAvailable).toBe(false);
      expect(result?.factors.oddsFactor?.score).toBe(0);
    });

    it('should add confidence when odds data is available', () => {
      const match = createMockMatch(6003, 78, 0, 0);
      const stats = createMockStats();

      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      const resultWithoutOdds = calculateDynamicScoreWithOdds(advancedMatch!, {});
      const resultWithOdds = calculateDynamicScoreWithOdds(advancedMatch!, {
        oddsAnalysis: {
          fixtureId: 6003,
          timestamp: Date.now(),
          matchWinner: { home: 2.10, draw: 3.40, away: 3.20, favorite: 'home' },
          overUnder: { line: 0.5, over: 1.85, under: 1.95 },
          asianHandicap: { line: 0, home: 1.90, away: 1.90 },
          bothTeamsScore: null,
          movements: [],
          marketSentiment: 'BALANCED',
          goalExpectation: 'MEDIUM',
          anomalies: [],
        },
      });

      expect(resultWithOdds?.confidence).toBeGreaterThan(resultWithoutOdds?.confidence ?? 0);
    });
  });

  describe('OddsInfo Conversion and UI Display', () => {
    it('should convert live odds to OddsInfo for UI display', () => {
      const liveOdds = createLiveOdds(7001, 75, 1, 1, {
        mainLine: 2.5,
        overOdd: 1.82,
        underOdd: 1.98,
        homeWin: 2.40,
        draw: 3.30,
        awayWin: 2.90,
        ahLine: 0,
        ahHome: 1.88,
        ahAway: 1.92,
      });

      const parsed = parseLiveOdds(liveOdds, 75);
      const oddsInfo = convertToOddsInfo(parsed);

      expect(oddsInfo._fetch_status).toBe('SUCCESS');
      expect(oddsInfo._is_live).toBe(true);
      expect(oddsInfo.overUnder?.total).toBe(2.5);
      expect(oddsInfo.overUnder?.over).toBe(1.82);
      expect(oddsInfo.overUnder?.under).toBe(1.98);
      expect(oddsInfo.handicap?.value).toBe(0);
      expect(oddsInfo.handicap?.home).toBe(1.88);
      expect(oddsInfo.handicap?.away).toBe(1.92);
      expect(oddsInfo.matchWinner?.home).toBe(2.40);
      expect(oddsInfo.matchWinner?.draw).toBe(3.30);
      expect(oddsInfo.matchWinner?.away).toBe(2.90);
    });

    it('should include all O/U lines for hover tooltip', () => {
      const liveOdds = createLiveOdds(7002, 65, 1, 0, { mainLine: 2.5 });
      const parsed = parseLiveOdds(liveOdds, 65);
      const oddsInfo = convertToOddsInfo(parsed);

      expect(oddsInfo.overUnder?.allLines).toBeDefined();
      expect(oddsInfo.overUnder?.allLines?.length).toBeGreaterThan(1);

      // Verify structure of allLines
      const mainLine = oddsInfo.overUnder?.allLines?.find(l => l.isMain);
      expect(mainLine).toBeDefined();
      expect(mainLine?.line).toBe(2.5);
    });

    it('should return empty OddsInfo when no data', () => {
      const match = createMockMatch(7003, 70, 0, 0);
      const stats = createMockStats();

      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      expect(advancedMatch?.odds._fetch_status).toBe('EMPTY');
      expect(advancedMatch?.odds.overUnder?.over).toBeNull();
      expect(advancedMatch?.odds.handicap?.value).toBeNull();
    });
  });

  describe('Validation Edge Cases', () => {
    it('should validate odds with only 1x2 market', () => {
      const partialOdds: LiveOddsData = {
        fixture: {
          id: 8001,
          status: { long: 'Second Half', elapsed: 60, seconds: '60:00' },
        },
        league: { id: 39, season: 2024 },
        teams: { home: { id: 100, goals: 0 }, away: { id: 200, goals: 0 } },
        status: { stopped: false, blocked: false, finished: false },
        update: new Date().toISOString(),
        odds: [
          {
            id: 59,
            name: 'Match Winner',
            values: [
              { value: 'Home', odd: '2.10' },
              { value: 'Draw', odd: '3.40' },
              { value: 'Away', odd: '3.20' },
            ],
          },
          // No O/U or AH markets
        ],
      };

      const validation = validateOddsLive([partialOdds]);

      expect(validation.is_real).toBe(true); // At least one market present
      expect(validation.has_1x2).toBe(true);
      expect(validation.has_over_under).toBe(false);
      expect(validation.has_asian_handicap).toBe(false);
    });

    it('should mark empty odds array as invalid', () => {
      const validation = validateOddsLive([]);

      expect(validation.is_real).toBe(false);
      expect(validation.reasons).toContain('ODDS_EMPTY');
    });

    it('should validate pre-match odds structure', () => {
      const preMatchOdds = createPreMatchOdds(8002, {});

      // Pre-match odds have bookmakers array
      expect(preMatchOdds.bookmakers).toBeDefined();
      expect(preMatchOdds.bookmakers.length).toBeGreaterThan(0);
      expect(preMatchOdds.bookmakers[0].bets.length).toBeGreaterThan(0);

      const validation = validateOddsLive([preMatchOdds as any]);

      expect(validation.is_real).toBe(true);
      expect(validation.is_live).toBe(false); // Pre-match, not live
    });
  });
});
