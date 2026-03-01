// ============================================
// E2E Tests: Warehouse Collector Flow
// Tests the complete pipeline: fetch → validate → write → signal
// ============================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateAllData,
  validateFixturesLive,
  validateStatistics,
  validateOddsLive,
  validateEvents,
  canWriteToWarehouse,
  getDataQualityDisplay,
  formatInvalidReasons,
} from '../services/dataValidation';
import { convertApiMatchToAdvanced, convertApiMatchesToAdvanced } from '../services/apiConverter';
import { calculateDynamicScore, calculateScore, calculateAllScores } from '../services/scoringEngine';
import type { Match, TeamStatistics, MatchEvent, LiveOddsData, OddsData } from '../types';
import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================
// Mock Data Factories - Realistic API Responses
// ============================================

/**
 * Creates a complete live match response simulating /fixtures?live=all
 */
function createLiveMatchResponse(options: {
  fixtureId: number;
  leagueId?: number;
  minute: number;
  status?: '1H' | '2H' | 'HT' | 'FT' | 'NS';
  homeGoals: number;
  awayGoals: number;
  homeTeamId?: number;
  awayTeamId?: number;
  homeTeamName?: string;
  awayTeamName?: string;
  htHomeScore?: number | null;
  htAwayScore?: number | null;
}): Match {
  const {
    fixtureId,
    leagueId = 39,
    minute,
    status = '2H',
    homeGoals,
    awayGoals,
    homeTeamId = 100,
    awayTeamId = 200,
    homeTeamName = 'Home Team',
    awayTeamName = 'Away Team',
    htHomeScore = null,
    htAwayScore = null,
  } = options;

  return {
    fixture: {
      id: fixtureId,
      referee: 'Test Referee',
      timezone: 'UTC',
      date: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000),
      periods: { first: Math.floor(Date.now() / 1000) - 3600, second: Math.floor(Date.now() / 1000) - 1800 },
      venue: { id: 1, name: 'Test Stadium', city: 'Test City' },
      status: { long: status === '2H' ? 'Second Half' : status, short: status, elapsed: minute },
    },
    league: {
      id: leagueId,
      name: leagueId === 39 ? 'Premier League' : 'Test League',
      country: 'England',
      logo: '',
      flag: '',
      season: 2024,
    },
    teams: {
      home: { id: homeTeamId, name: homeTeamName, logo: '' },
      away: { id: awayTeamId, name: awayTeamName, logo: '' },
    },
    goals: { home: homeGoals, away: awayGoals },
    score: {
      halftime: { home: htHomeScore, away: htAwayScore },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

/**
 * Creates statistics response simulating /fixtures/statistics
 */
function createStatisticsResponse(options: {
  homeTeamId?: number;
  awayTeamId?: number;
  homeShots?: number;
  awayShots?: number;
  homeShotsOnTarget?: number;
  awayShotsOnTarget?: number;
  homePossession?: number;
  homeCorners?: number;
  awayCorners?: number;
  homeDangerous?: number;
  awayDangerous?: number;
  homeXG?: number;
  awayXG?: number;
  homeFouls?: number;
  awayFouls?: number;
}): TeamStatistics[] {
  const {
    homeTeamId = 100,
    awayTeamId = 200,
    homeShots = 12,
    awayShots = 8,
    homeShotsOnTarget = 5,
    awayShotsOnTarget = 3,
    homePossession = 55,
    homeCorners = 6,
    awayCorners = 4,
    homeDangerous = 50,
    awayDangerous = 35,
    homeXG = 1.5,
    awayXG = 0.8,
    homeFouls = 8,
    awayFouls = 10,
  } = options;

  return [
    {
      team: { id: homeTeamId, name: 'Home Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: homeShots },
        { type: 'Shots on Goal', value: homeShotsOnTarget },
        { type: 'Ball Possession', value: `${homePossession}%` },
        { type: 'Corner Kicks', value: homeCorners },
        { type: 'Dangerous Attacks', value: homeDangerous },
        { type: 'expected_goals', value: homeXG },
        { type: 'Fouls', value: homeFouls },
        { type: 'Blocked Shots', value: 2 },
        { type: 'Offsides', value: 3 },
      ],
    },
    {
      team: { id: awayTeamId, name: 'Away Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: awayShots },
        { type: 'Shots on Goal', value: awayShotsOnTarget },
        { type: 'Ball Possession', value: `${100 - homePossession}%` },
        { type: 'Corner Kicks', value: awayCorners },
        { type: 'Dangerous Attacks', value: awayDangerous },
        { type: 'expected_goals', value: awayXG },
        { type: 'Fouls', value: awayFouls },
        { type: 'Blocked Shots', value: 1 },
        { type: 'Offsides', value: 2 },
      ],
    },
  ];
}

/**
 * Creates events response simulating /fixtures/events
 */
function createEventsResponse(options: {
  homeTeamId?: number;
  awayTeamId?: number;
  events?: Array<{
    minute: number;
    type: 'Goal' | 'Card' | 'subst' | 'Var';
    team: 'home' | 'away';
    detail?: string;
    playerIn?: string;
    playerOut?: string;
  }>;
}): MatchEvent[] {
  const {
    homeTeamId = 100,
    awayTeamId = 200,
    events = [],
  } = options;

  return events.map((e, idx) => ({
    time: { elapsed: e.minute, extra: null },
    team: {
      id: e.team === 'home' ? homeTeamId : awayTeamId,
      name: e.team === 'home' ? 'Home Team' : 'Away Team',
      logo: '',
    },
    player: { id: idx + 1, name: e.playerIn || `Player ${idx + 1}` },
    assist: {
      id: e.type === 'subst' ? idx + 100 : null,
      name: e.type === 'subst' ? (e.playerOut || `Player Out ${idx + 1}`) : null,
    },
    type: e.type,
    detail: e.detail || (e.type === 'Goal' ? 'Normal Goal' : e.type === 'Card' ? 'Yellow Card' : 'Substitution 1'),
    comments: null,
  }));
}

/**
 * Creates live odds response simulating /odds/live
 */
function createLiveOddsResponse(options: {
  fixtureId: number;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  suspended?: boolean;
  blocked?: boolean;
  finished?: boolean;
  odds?: {
    mainLine?: number;
    overOdd?: number;
    underOdd?: number;
    homeWin?: number;
    draw?: number;
    awayWin?: number;
    ahLine?: number;
    ahHome?: number;
    ahAway?: number;
  };
}): LiveOddsData {
  const {
    fixtureId,
    minute,
    homeGoals,
    awayGoals,
    suspended = false,
    blocked = false,
    finished = false,
    odds = {},
  } = options;

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
  } = odds;

  // If suspended, return empty odds array
  if (suspended) {
    return {
      fixture: {
        id: fixtureId,
        status: { long: 'Second Half', elapsed: minute, seconds: `${minute}:00` },
      },
      league: { id: 39, season: 2024 },
      teams: {
        home: { id: 100, goals: homeGoals },
        away: { id: 200, goals: awayGoals },
      },
      status: { stopped: true, blocked, finished },
      update: new Date().toISOString(),
      odds: [], // Suspended = no odds
    };
  }

  return {
    fixture: {
      id: fixtureId,
      status: { long: 'Second Half', elapsed: minute, seconds: `${minute}:00` },
    },
    league: { id: 39, season: 2024 },
    teams: {
      home: { id: 100, goals: homeGoals },
      away: { id: 200, goals: awayGoals },
    },
    status: { stopped: false, blocked, finished },
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
          { value: 'Over', odd: '1.20', handicap: '1.5' },
          { value: 'Under', odd: '4.00', handicap: '1.5' },
          { value: 'Over', odd: overOdd.toString(), handicap: mainLine.toString(), main: true },
          { value: 'Under', odd: underOdd.toString(), handicap: mainLine.toString(), main: true },
          { value: 'Over', odd: '2.80', handicap: '3.5' },
          { value: 'Under', odd: '1.40', handicap: '3.5' },
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

/**
 * Creates pre-match odds response simulating /odds?fixture=xxx
 */
function createPreMatchOddsResponse(options: {
  fixtureId: number;
  bookmakerName?: string;
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  overLine?: number;
  overOdd?: number;
  underOdd?: number;
  ahLine?: number;
  ahHome?: number;
  ahAway?: number;
}): OddsData {
  const {
    fixtureId,
    bookmakerName = 'Bet365',
    homeWin = 1.95,
    draw = 3.50,
    awayWin = 3.80,
    overLine = 2.5,
    overOdd = 1.90,
    underOdd = 1.90,
    ahLine = -0.5,
    ahHome = 1.92,
    ahAway = 1.88,
  } = options;

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
        name: bookmakerName,
        bets: [
          {
            id: 1, // Match Winner
            name: 'Match Winner',
            values: [
              { value: 'Home', odd: homeWin.toString() },
              { value: 'Draw', odd: draw.toString() },
              { value: 'Away', odd: awayWin.toString() },
            ],
          },
          {
            id: 5, // Over/Under
            name: 'Goals Over/Under',
            values: [
              { value: `Over ${overLine}`, odd: overOdd.toString() },
              { value: `Under ${overLine}`, odd: underOdd.toString() },
            ],
          },
          {
            id: 8, // Asian Handicap
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

describe('Warehouse Collector E2E Flow', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Data Validation Pipeline', () => {
    it('should validate complete match data with REAL quality', () => {
      const match = createLiveMatchResponse({
        fixtureId: 1001,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      });
      const stats = createStatisticsResponse({});
      const events = createEventsResponse({
        events: [
          { minute: 25, type: 'Goal', team: 'home' },
          { minute: 45, type: 'Goal', team: 'away' },
        ],
      });
      const odds = [createLiveOddsResponse({
        fixtureId: 1001,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
      })];

      const validation = validateAllData(match, stats, events, odds);

      expect(validation.fixtures_real).toBe(true);
      expect(validation.stats_real).toBe(true);
      expect(validation.odds_real).toBe(true);
      expect(validation.events_real).toBe(true);
      expect(validation.data_quality).toBe('REAL');
      expect(validation.invalid_reasons).toHaveLength(0);
      expect(canWriteToWarehouse(validation)).toBe(true);
    });

    it('should validate PARTIAL quality when stats missing', () => {
      const match = createLiveMatchResponse({
        fixtureId: 1002,
        minute: 60,
        homeGoals: 0,
        awayGoals: 0,
      });
      const odds = [createLiveOddsResponse({
        fixtureId: 1002,
        minute: 60,
        homeGoals: 0,
        awayGoals: 0,
      })];

      const validation = validateAllData(match, undefined, undefined, odds);

      expect(validation.fixtures_real).toBe(true);
      expect(validation.stats_real).toBe(false);
      expect(validation.odds_real).toBe(true);
      expect(validation.data_quality).toBe('PARTIAL');
      expect(canWriteToWarehouse(validation)).toBe(true); // Can still write fixture
    });

    it('should mark INVALID when fixture data is missing', () => {
      const validation = validateAllData(null, undefined, undefined, undefined);

      expect(validation.data_quality).toBe('INVALID');
      expect(validation.fixtures_real).toBe(false);
      expect(canWriteToWarehouse(validation)).toBe(false);
    });

    it('should handle suspended odds correctly', () => {
      const match = createLiveMatchResponse({
        fixtureId: 1003,
        minute: 89,
        homeGoals: 2,
        awayGoals: 2,
      });
      const stats = createStatisticsResponse({});
      const odds = [createLiveOddsResponse({
        fixtureId: 1003,
        minute: 89,
        homeGoals: 2,
        awayGoals: 2,
        suspended: true, // Odds suspended during goal
      })];

      const validation = validateAllData(match, stats, [], odds);

      expect(validation.fixtures_real).toBe(true);
      expect(validation.stats_real).toBe(true);
      expect(validation.odds_real).toBe(false); // No odds when suspended
      expect(validation.data_quality).toBe('PARTIAL');
    });

    it('should validate half-time status correctly', () => {
      const match = createLiveMatchResponse({
        fixtureId: 1004,
        minute: 45,
        status: 'HT',
        homeGoals: 1,
        awayGoals: 0,
        htHomeScore: 1,
        htAwayScore: 0,
      });
      const stats = createStatisticsResponse({});

      const fixtureValidation = validateFixturesLive(match);
      const statsValidation = validateStatistics(stats);

      expect(fixtureValidation.is_real).toBe(true);
      expect(statsValidation.is_real).toBe(true);
    });
  });

  describe('Match Conversion Pipeline', () => {
    it('should convert match with full data to AdvancedMatch', () => {
      const match = createLiveMatchResponse({
        fixtureId: 2001,
        leagueId: 39,
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createStatisticsResponse({
        homeShots: 18,
        awayShots: 8,
        homeXG: 1.8,
        awayXG: 0.6,
      });
      const events = createEventsResponse({
        events: [
          { minute: 55, type: 'Goal', team: 'away' },
          { minute: 70, type: 'subst', team: 'home', playerIn: 'Striker', playerOut: 'Midfielder' },
          { minute: 78, type: 'Card', team: 'away', detail: 'Yellow Card' },
        ],
      });
      const odds = [createLiveOddsResponse({
        fixtureId: 2001,
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
        odds: { ahLine: -1.5, mainLine: 2.5, overOdd: 2.50, underOdd: 1.55 },
      })];

      const advancedMatch = convertApiMatchToAdvanced(match, stats, events, undefined, odds);

      expect(advancedMatch).not.toBeNull();
      expect(advancedMatch?.id).toBe(2001);
      expect(advancedMatch?.league).toBe('英超');
      expect(advancedMatch?.minute).toBe(82);
      expect(advancedMatch?.home.score).toBe(0);
      expect(advancedMatch?.away.score).toBe(1);
      // Phase 2A: home.handicap 现在来自赛前赔率，未提供则为 null
      expect(advancedMatch?.home.handicap).toBeNull();
      expect(advancedMatch?.stats?._realDataAvailable).toBe(true);
      expect(advancedMatch?.stats?.shots.home).toBe(18);
      expect(advancedMatch?.stats?.xG?.home).toBe(1.8);
      expect(advancedMatch?.cards.yellow.away).toBe(1);
      expect(advancedMatch?.substitutions.length).toBe(1);
      expect(advancedMatch?.odds._fetch_status).toBe('SUCCESS');
      expect(advancedMatch?.scenarioTags).toContain('critical_time');
      // Phase 2A: 没有 prematch odds 时，无法检测 strong_behind
      // 只能检测到 critical_time
    });

    it('should create unscoreable match when stats missing', () => {
      const match = createLiveMatchResponse({
        fixtureId: 2002,
        minute: 70,
        homeGoals: 1,
        awayGoals: 1,
      });

      const advancedMatch = convertApiMatchToAdvanced(match, undefined, undefined, undefined, undefined);

      expect(advancedMatch).not.toBeNull();
      expect(advancedMatch?._unscoreable).toBe(true);
      expect(advancedMatch?._noStatsReason).toBe('MISSING_STATISTICS_DATA');
      expect(advancedMatch?.scenarioTags).toContain('no_stats');
      expect(advancedMatch?.odds._fetch_status).toBe('EMPTY');
    });

    it('should batch convert multiple matches', () => {
      const matches = [
        createLiveMatchResponse({ fixtureId: 3001, minute: 75, homeGoals: 2, awayGoals: 1 }),
        createLiveMatchResponse({ fixtureId: 3002, minute: 60, homeGoals: 0, awayGoals: 0 }),
        createLiveMatchResponse({ fixtureId: 3003, minute: 88, homeGoals: 1, awayGoals: 3 }),
      ];

      const statsMap = new Map([
        [3001, createStatisticsResponse({})],
        [3002, createStatisticsResponse({})],
        [3003, createStatisticsResponse({})],
      ]);

      const oddsMap = new Map([
        [3001, [createLiveOddsResponse({ fixtureId: 3001, minute: 75, homeGoals: 2, awayGoals: 1 })]],
        [3002, [createLiveOddsResponse({ fixtureId: 3002, minute: 60, homeGoals: 0, awayGoals: 0 })]],
        // 3003 has no odds
      ]);

      const results = convertApiMatchesToAdvanced(matches, statsMap, undefined, undefined, oddsMap);

      expect(results.length).toBe(3);
      expect(results.find(m => m.id === 3001)?.odds._fetch_status).toBe('SUCCESS');
      expect(results.find(m => m.id === 3002)?.odds._fetch_status).toBe('SUCCESS');
      expect(results.find(m => m.id === 3003)?.odds._fetch_status).toBe('EMPTY');
    });
  });

  describe('Scoring Pipeline (80+ Minute Focus)', () => {
    it('should score 80+ minute matches correctly', () => {
      const match = createLiveMatchResponse({
        fixtureId: 4001,
        minute: 85,
        homeGoals: 1,
        awayGoals: 1,
      });
      const stats = createStatisticsResponse({
        homeShots: 15,
        awayShots: 12,
        homeXG: 1.6,
        awayXG: 1.2,
      });
      const events = createEventsResponse({
        events: [
          { minute: 30, type: 'Goal', team: 'home' },
          { minute: 65, type: 'Goal', team: 'away' },
        ],
      });

      const advancedMatch = convertApiMatchToAdvanced(match, stats, events, undefined, undefined);
      expect(advancedMatch).not.toBeNull();

      const result = calculateScore(advancedMatch!);

      expect(result.scoreable).toBe(true);
      if (result.scoreable) {
        expect(result.totalScore).toBeGreaterThan(30); // Base score + time factor + draw bonus
        expect(result.factors.scoreFactor.details.isDraw).toBe(true);
        expect(result.alerts.length).toBeGreaterThan(0);
      }
    });

    it('should give higher score for strong team behind at 80+', () => {
      const matchStrongBehind = createLiveMatchResponse({
        fixtureId: 4002,
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });
      const matchNormal = createLiveMatchResponse({
        fixtureId: 4003,
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });

      const statsHigh = createStatisticsResponse({ homeShots: 20, homeXG: 2.2 });
      const statsNormal = createStatisticsResponse({ homeShots: 10, homeXG: 0.8 });

      const oddsStrong = [createLiveOddsResponse({
        fixtureId: 4002,
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
        odds: { ahLine: -1.5 }, // Home is strong favorite
      })];
      const oddsNormal = [createLiveOddsResponse({
        fixtureId: 4003,
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
        odds: { ahLine: 0 }, // Even match
      })];

      const advStrongBehind = convertApiMatchToAdvanced(matchStrongBehind, statsHigh, [], undefined, oddsStrong);
      const advNormal = convertApiMatchToAdvanced(matchNormal, statsNormal, [], undefined, oddsNormal);

      const resultStrong = calculateDynamicScore(advStrongBehind!);
      const resultNormal = calculateDynamicScore(advNormal!);

      expect(resultStrong).not.toBeNull();
      expect(resultNormal).not.toBeNull();
      // Phase 2A: 高 xG/射门数 的比赛应有更高评分
      expect(resultStrong!.totalScore).toBeGreaterThan(resultNormal!.totalScore);
      // Phase 2A: 没有 prematch odds 时，isStrongTeamBehind 为 false
      // 因为 home.handicap 来自 prematch odds，未提供则为 null
      expect(resultStrong!.isStrongTeamBehind).toBe(false);
    });

    it('should filter 65-95 minute matches for Module A', () => {
      const matches = [
        createLiveMatchResponse({ fixtureId: 5001, minute: 55, homeGoals: 1, awayGoals: 0 }),
        createLiveMatchResponse({ fixtureId: 5002, minute: 72, homeGoals: 0, awayGoals: 0 }),
        createLiveMatchResponse({ fixtureId: 5003, minute: 85, homeGoals: 2, awayGoals: 1 }),
        createLiveMatchResponse({ fixtureId: 5004, minute: 92, homeGoals: 1, awayGoals: 2 }),
      ];

      const statsMap = new Map(matches.map(m => [m.fixture.id, createStatisticsResponse({})]));
      const advancedMatches = convertApiMatchesToAdvanced(matches, statsMap);

      // Filter 65-95 range (Module A window)
      const moduleAMatches = advancedMatches.filter(
        m => m.minute >= 65 && m.minute <= 95 && !m._unscoreable
      );

      expect(moduleAMatches.length).toBe(3); // 72, 85, 92
      expect(moduleAMatches.map(m => m.id)).toEqual([5002, 5003, 5004]);
    });

    it('should skip unscoreable matches in batch scoring', () => {
      const matchWithStats = createLiveMatchResponse({
        fixtureId: 6001,
        minute: 80,
        homeGoals: 1,
        awayGoals: 1,
      });
      const matchWithoutStats = createLiveMatchResponse({
        fixtureId: 6002,
        minute: 80,
        homeGoals: 2,
        awayGoals: 0,
      });

      const advWithStats = convertApiMatchToAdvanced(
        matchWithStats,
        createStatisticsResponse({}),
        [],
        undefined,
        undefined
      );
      const advWithoutStats = convertApiMatchToAdvanced(
        matchWithoutStats,
        undefined, // No stats
        [],
        undefined,
        undefined
      );

      const allMatches = [advWithStats!, advWithoutStats!];
      const scores = calculateAllScores(allMatches);

      expect(scores.size).toBe(1); // Only one scoreable
      expect(scores.has(6001)).toBe(true);
      expect(scores.has(6002)).toBe(false);
    });
  });

  describe('Data Quality Display', () => {
    it('should return correct display info for REAL quality', () => {
      const display = getDataQualityDisplay('REAL');

      expect(display.label).toBe('真实数据');
      expect(display.color).toContain('green');
      expect(display.icon).toBe('✓');
    });

    it('should return correct display info for PARTIAL quality', () => {
      const display = getDataQualityDisplay('PARTIAL');

      expect(display.label).toBe('部分数据');
      expect(display.color).toContain('yellow');
      expect(display.icon).toBe('⚠');
    });

    it('should return correct display info for INVALID quality', () => {
      const display = getDataQualityDisplay('INVALID');

      expect(display.label).toBe('无效数据');
      expect(display.color).toContain('red');
      expect(display.icon).toBe('✗');
    });

    it('should format invalid reasons to readable text', () => {
      const reasons = [
        'STATS:STATS_EMPTY',
        'ODDS:MISSING_OVER_UNDER',
        'FIXTURE:MISSING_ELAPSED_TIME',
      ];

      const formatted = formatInvalidReasons(reasons);

      expect(formatted).toContain('统计数据为空');
      expect(formatted).toContain('缺少大小球赔率');
      expect(formatted).toContain('缺少比赛时间');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle match with zero shots after 10 minutes as suspicious', () => {
      const match = createLiveMatchResponse({
        fixtureId: 7001,
        minute: 35,
        homeGoals: 0,
        awayGoals: 0,
      });
      const stats = createStatisticsResponse({
        homeShots: 0,
        awayShots: 0,
        homeShotsOnTarget: 0,
        awayShotsOnTarget: 0,
      });

      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);
      const result = calculateScore(advancedMatch!);

      // This should still be scoreable but with lower confidence
      expect(result.scoreable).toBe(false); // Suspicious zero shots
      if (!result.scoreable) {
        expect(result.reason).toBe('SUSPICIOUS_ZERO_SHOTS');
      }
    });

    it('should handle pre-match status correctly (NS)', () => {
      const match = createLiveMatchResponse({
        fixtureId: 7002,
        minute: 0,
        status: 'NS',
        homeGoals: 0,
        awayGoals: 0,
      });

      const fixtureValidation = validateFixturesLive(match);

      // NS status with null elapsed is normal
      expect(fixtureValidation.is_real).toBe(true);
    });

    it('should handle finished match (FT) correctly', () => {
      const match = createLiveMatchResponse({
        fixtureId: 7003,
        minute: 90,
        status: 'FT',
        homeGoals: 2,
        awayGoals: 1,
      });
      const stats = createStatisticsResponse({});

      const advancedMatch = convertApiMatchToAdvanced(match, stats, [], undefined, undefined);

      expect(advancedMatch?.status).toBe('ft');
    });

    it('should handle missing team IDs gracefully', () => {
      const match: Match = {
        fixture: {
          id: 7004,
          referee: null,
          timezone: 'UTC',
          date: new Date().toISOString(),
          timestamp: Date.now() / 1000,
          periods: { first: null, second: null },
          venue: { id: 0, name: '', city: '' },
          status: { long: 'Second Half', short: '2H', elapsed: 75 },
        },
        league: {
          id: 39,
          name: 'Premier League',
          country: 'England',
          logo: '',
          flag: '',
          season: 2024,
        },
        teams: {
          home: { id: undefined as any, name: 'Home Team', logo: '' },
          away: { id: undefined as any, name: 'Away Team', logo: '' },
        },
        goals: { home: 1, away: 0 },
        score: {
          halftime: { home: 1, away: 0 },
          fulltime: { home: null, away: null },
          extratime: { home: null, away: null },
          penalty: { home: null, away: null },
        },
      };

      const validation = validateFixturesLive(match);

      expect(validation.is_real).toBe(false);
      expect(validation.reasons).toContain('MISSING_TEAM_IDS');
    });

    it('should handle red card scenario correctly', () => {
      const match = createLiveMatchResponse({
        fixtureId: 8001,
        minute: 75,
        homeGoals: 1,
        awayGoals: 0,
      });
      const stats = createStatisticsResponse({});
      const events = createEventsResponse({
        events: [
          { minute: 30, type: 'Goal', team: 'home' },
          { minute: 60, type: 'Card', team: 'away', detail: 'Red Card' },
        ],
      });

      const advancedMatch = convertApiMatchToAdvanced(match, stats, events, undefined, undefined);

      expect(advancedMatch?.cards.red.away).toBe(1);
      expect(advancedMatch?.scenarioTags).toContain('red_card');
      expect(advancedMatch?.scenarioTags).toContain('away_red');

      const result = calculateDynamicScore(advancedMatch!);
      expect(result?.factors.specialFactor.details.redCardAdvantage).toBe(true);
    });

    it('should handle VAR cancelled goal correctly', () => {
      const match = createLiveMatchResponse({
        fixtureId: 8002,
        minute: 70,
        homeGoals: 0,
        awayGoals: 0,
      });
      const stats = createStatisticsResponse({});
      const events = createEventsResponse({
        events: [
          { minute: 65, type: 'Goal', team: 'home' },
          { minute: 68, type: 'Var', team: 'home', detail: 'Goal cancelled' },
        ],
      });

      const advancedMatch = convertApiMatchToAdvanced(match, stats, events, undefined, undefined);

      expect(advancedMatch?.varCancelled).toBe(true);
    });
  });

  describe('Complete Warehouse Write Validation Flow', () => {
    it('should prepare RawFixture insert data correctly', () => {
      const match = createLiveMatchResponse({
        fixtureId: 9001,
        leagueId: 39,
        minute: 80,
        homeGoals: 2,
        awayGoals: 1,
        homeTeamId: 100,
        awayTeamId: 200,
        homeTeamName: 'Arsenal',
        awayTeamName: 'Chelsea',
        htHomeScore: 1,
        htAwayScore: 0,
      });

      // Validate the structure that would be inserted to raw_fixtures
      const validation = validateFixturesLive(match);
      expect(validation.is_real).toBe(true);

      // Verify all required fields are present
      expect(match.fixture.id).toBe(9001);
      expect(match.league.id).toBe(39);
      expect(match.teams.home.id).toBe(100);
      expect(match.teams.away.id).toBe(200);
      expect(match.goals.home).toBe(2);
      expect(match.goals.away).toBe(1);
      expect(match.score.halftime.home).toBe(1);
      expect(match.score.halftime.away).toBe(0);
    });

    it('should prepare RawStatistics insert data correctly', () => {
      const stats = createStatisticsResponse({
        homeTeamId: 100,
        awayTeamId: 200,
        homeShots: 15,
        awayShots: 10,
        homeShotsOnTarget: 7,
        awayShotsOnTarget: 4,
        homePossession: 58,
        homeCorners: 8,
        awayCorners: 3,
        homeXG: 1.8,
        awayXG: 0.9,
      });

      const validation = validateStatistics(stats, 100, 200);
      expect(validation.is_real).toBe(true);
      expect(validation.critical_stats_present).toContain('Total Shots');
      expect(validation.critical_stats_present).toContain('Shots on Goal');
      expect(validation.critical_stats_present).toContain('Ball Possession');
      expect(validation.critical_stats_present).toContain('Corner Kicks');
    });

    it('should prepare RawOdds insert data correctly', () => {
      const odds = [createLiveOddsResponse({
        fixtureId: 9002,
        minute: 75,
        homeGoals: 1,
        awayGoals: 1,
        odds: {
          mainLine: 2.5,
          overOdd: 1.85,
          underOdd: 1.95,
          homeWin: 2.50,
          draw: 3.20,
          awayWin: 2.80,
          ahLine: 0,
          ahHome: 1.92,
          ahAway: 1.88,
        },
      })];

      const validation = validateOddsLive(odds);
      expect(validation.is_real).toBe(true);
      expect(validation.has_1x2).toBe(true);
      expect(validation.has_over_under).toBe(true);
      expect(validation.has_asian_handicap).toBe(true);
      expect(validation.is_live).toBe(true);
    });

    it('should validate complete flow ready for database write', () => {
      const match = createLiveMatchResponse({
        fixtureId: 9999,
        minute: 85,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createStatisticsResponse({
        homeShots: 18,
        homeXG: 2.1,
      });
      const events = createEventsResponse({
        events: [
          { minute: 55, type: 'Goal', team: 'away' },
        ],
      });
      const odds = [createLiveOddsResponse({
        fixtureId: 9999,
        minute: 85,
        homeGoals: 0,
        awayGoals: 1,
        odds: { ahLine: -1.0 },
      })];

      // Step 1: Validate
      const validation = validateAllData(match, stats, events, odds);
      expect(validation.data_quality).toBe('REAL');
      expect(canWriteToWarehouse(validation)).toBe(true);

      // Step 2: Convert
      const advancedMatch = convertApiMatchToAdvanced(match, stats, events, undefined, odds);
      expect(advancedMatch).not.toBeNull();
      expect(advancedMatch?._validation?.data_quality).toBe('REAL');

      // Step 3: Score (Module A check - 65-95 min)
      expect(advancedMatch!.minute).toBeGreaterThanOrEqual(65);
      expect(advancedMatch!.minute).toBeLessThanOrEqual(95);

      const result = calculateScore(advancedMatch!);
      expect(result.scoreable).toBe(true);

      if (result.scoreable) {
        // Step 4: Verify signal-ready data
        expect(result.totalScore).toBeGreaterThan(0);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result._dataMode).toBe('STRICT_REAL_DATA');

        // Verify signal structure would be valid
        const signalData = {
          fixture_id: advancedMatch!.id,
          module_type: 'A',
          trigger_minute: advancedMatch!.minute,
          trigger_score_home: advancedMatch!.home.score,
          trigger_score_away: advancedMatch!.away.score,
          heat_score: result.totalScore,
          confidence_score: result.confidence,
          signal_type: result.recommendation === 'STRONG_BUY' ? 'GOAL_ALERT' : 'MOMENTUM_SHIFT',
        };

        expect(signalData.fixture_id).toBe(9999);
        expect(signalData.trigger_minute).toBe(85);
        expect(signalData.heat_score).toBeGreaterThan(0);
      }
    });
  });
});
