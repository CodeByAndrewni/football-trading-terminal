// ============================================
// Unit Tests: API Converter Service
// Tests for convertApiMatchToAdvanced and related functions
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertApiMatchToAdvanced,
  convertApiMatchesToAdvanced,
  isHighAlertMatch,
  isCriticalTimeMatch,
  filterByScenario,
  getScenarioDescription,
} from '../services/apiConverter';
import type { Match, TeamStatistics, MatchEvent, Lineup } from '../types';
import type { AdvancedMatch } from '../data/advancedMockData';

// ============================================
// Test Fixtures - Factory Functions
// ============================================

function createMockMatch(overrides: Partial<Match> = {}): Match {
  return {
    fixture: {
      id: 12345,
      referee: 'John Smith',
      timezone: 'UTC',
      date: '2024-01-01T15:00:00Z',
      timestamp: 1704121200,
      periods: { first: 1704121200, second: 1704124800 },
      venue: { id: 1, name: 'Test Stadium', city: 'Test City' },
      status: { long: 'Second Half', short: '2H', elapsed: 75 },
      ...overrides.fixture,
    },
    league: {
      id: 39,
      name: 'Premier League',
      country: 'England',
      logo: 'https://example.com/logo.png',
      flag: 'https://example.com/flag.png',
      season: 2024,
      round: 'Regular Season - 20',
      ...overrides.league,
    },
    teams: {
      home: { id: 100, name: 'Home Team', logo: 'https://example.com/home.png' },
      away: { id: 200, name: 'Away Team', logo: 'https://example.com/away.png' },
      ...overrides.teams,
    },
    goals: {
      home: 1,
      away: 1,
      ...overrides.goals,
    },
    score: {
      halftime: { home: 0, away: 1 },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
      ...overrides.score,
    },
    ...overrides,
  };
}

function createMockStatistics(
  homeTeamId = 100,
  awayTeamId = 200,
  overrides: Partial<{
    shots: number;
    shotsOnTarget: number;
    possession: number;
    corners: number;
    dangerousAttacks: number;
    xg: number;
    fouls: number;
  }> = {}
): TeamStatistics[] {
  const homeShots = overrides.shots ?? 12;
  const awayShots = Math.floor((overrides.shots ?? 12) * 0.8);
  const homePossession = overrides.possession ?? 55;
  const homeCorners = overrides.corners ?? 5;
  const awayCorners = Math.floor((overrides.corners ?? 5) * 0.6);

  return [
    {
      team: { id: homeTeamId, name: 'Home Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: homeShots },
        { type: 'Shots on Goal', value: overrides.shotsOnTarget ?? 5 },
        { type: 'Ball Possession', value: `${homePossession}%` },
        { type: 'Corner Kicks', value: homeCorners },
        { type: 'Dangerous Attacks', value: overrides.dangerousAttacks ?? 45 },
        { type: 'expected_goals', value: overrides.xg ?? 1.2 },
        { type: 'Fouls', value: overrides.fouls ?? 10 },
      ],
    },
    {
      team: { id: awayTeamId, name: 'Away Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: awayShots },
        { type: 'Shots on Goal', value: Math.floor((overrides.shotsOnTarget ?? 5) * 0.6) },
        { type: 'Ball Possession', value: `${100 - homePossession}%` },
        { type: 'Corner Kicks', value: awayCorners },
        { type: 'Dangerous Attacks', value: Math.floor((overrides.dangerousAttacks ?? 45) * 0.7) },
        { type: 'expected_goals', value: (overrides.xg ?? 1.2) * 0.7 },
        { type: 'Fouls', value: Math.floor((overrides.fouls ?? 10) * 0.8) },
      ],
    },
  ];
}

function createMockEvents(
  homeTeamId = 100,
  awayTeamId = 200,
  options: {
    goals?: Array<{ minute: number; team: 'home' | 'away' }>;
    cards?: Array<{ minute: number; team: 'home' | 'away'; type: 'yellow' | 'red' }>;
    subs?: Array<{ minute: number; team: 'home' | 'away' }>;
  } = {}
): MatchEvent[] {
  const events: MatchEvent[] = [];
  const { goals = [], cards = [], subs = [] } = options;

  for (const goal of goals) {
    events.push({
      time: { elapsed: goal.minute, extra: null },
      team: { id: goal.team === 'home' ? homeTeamId : awayTeamId, name: '', logo: '' },
      player: { id: 1, name: 'Goal Scorer' },
      assist: { id: null, name: null },
      type: 'Goal',
      detail: 'Normal Goal',
      comments: null,
    });
  }

  for (const card of cards) {
    events.push({
      time: { elapsed: card.minute, extra: null },
      team: { id: card.team === 'home' ? homeTeamId : awayTeamId, name: '', logo: '' },
      player: { id: 2, name: 'Card Player' },
      assist: { id: null, name: null },
      type: 'Card',
      detail: card.type === 'red' ? 'Red Card' : 'Yellow Card',
      comments: null,
    });
  }

  for (const sub of subs) {
    events.push({
      time: { elapsed: sub.minute, extra: null },
      team: { id: sub.team === 'home' ? homeTeamId : awayTeamId, name: '', logo: '' },
      player: { id: 3, name: 'Player In' },
      assist: { id: 4, name: 'Player Out' },
      type: 'subst',
      detail: 'Substitution 1',
      comments: null,
    });
  }

  return events.sort((a, b) => a.time.elapsed - b.time.elapsed);
}

// ============================================
// convertApiMatchToAdvanced Tests
// ============================================

describe('convertApiMatchToAdvanced', () => {
  beforeEach(() => {
    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('basic conversion', () => {
    it('should convert a live match with statistics correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics();
      const events = createMockEvents();

      const result = convertApiMatchToAdvanced(match, statistics, events);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(12345);
      expect(result?.minute).toBe(75);
      expect(result?.status).toBe('live');
      expect(result?.home.name).toBe('Home Team');
      expect(result?.away.name).toBe('Away Team');
      expect(result?.home.score).toBe(1);
      expect(result?.away.score).toBe(1);
    });

    it('should convert Premier League to 英超', () => {
      const match = createMockMatch({ league: { id: 39, name: 'Premier League' } as any });
      const statistics = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.league).toBe('英超');
      expect(result?.leagueShort).toBe('英超');
    });

    it('should convert La Liga to 西甲', () => {
      const match = createMockMatch({ league: { id: 140, name: 'La Liga' } as any });
      const statistics = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.league).toBe('西甲');
    });
  });

  describe('status mapping', () => {
    const statusTests = [
      { short: '1H', expected: 'live' },
      { short: '2H', expected: 'live' },
      { short: 'HT', expected: 'ht' },
      { short: 'FT', expected: 'ft' },
      { short: 'NS', expected: 'ns' },
      { short: 'ET', expected: 'live' },
      { short: 'SUSP', expected: 'live' },
    ];

    for (const { short, expected } of statusTests) {
      it(`should map status ${short} to ${expected}`, () => {
        const match = createMockMatch({
          fixture: { status: { short, long: '', elapsed: 45 } } as any,
        });
        const statistics = createMockStatistics();

        const result = convertApiMatchToAdvanced(match, statistics);

        expect(result?.status).toBe(expected);
      });
    }
  });

  describe('statistics extraction', () => {
    it('should extract shots correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics(100, 200, { shots: 15 });

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.stats?.shots.home).toBe(15);
      expect(result?.stats?.shots.away).toBe(12); // 15 * 0.8
    });

    it('should extract possession correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics(100, 200, { possession: 60 });

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.stats?.possession.home).toBe(60);
      expect(result?.stats?.possession.away).toBe(40);
    });

    it('should extract xG correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics(100, 200, { xg: 1.5 });

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.stats?.xG?.home).toBe(1.5);
      expect(result?.stats?.xG?.away).toBeCloseTo(1.05, 2);
    });

    it('should extract corners correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics(100, 200, { corners: 8 });

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.corners?.home).toBe(8);
      expect(result?.corners?.away).toBe(4); // 8 * 0.6 = 4.8 -> 4
    });

    it('should extract dangerous attacks correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics(100, 200, { dangerousAttacks: 60 });

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.stats?.dangerousAttacks?.home).toBe(60);
      expect(result?.stats?.dangerousAttacks?.away).toBe(42);
    });
  });

  describe('events extraction', () => {
    it('should extract card events correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics();
      const events = createMockEvents(100, 200, {
        cards: [
          { minute: 30, team: 'home', type: 'yellow' },
          { minute: 55, team: 'away', type: 'yellow' },
          { minute: 70, team: 'home', type: 'red' },
        ],
      });

      const result = convertApiMatchToAdvanced(match, statistics, events);

      expect(result?.cards.yellow.home).toBe(1);
      expect(result?.cards.yellow.away).toBe(1);
      expect(result?.cards.red.home).toBe(1);
      expect(result?.cards.red.away).toBe(0);
    });

    it('should extract substitutions correctly', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics();
      const events = createMockEvents(100, 200, {
        subs: [
          { minute: 60, team: 'home' },
          { minute: 65, team: 'away' },
          { minute: 75, team: 'home' },
        ],
      });

      const result = convertApiMatchToAdvanced(match, statistics, events);

      expect(result?.substitutions.length).toBe(3);
      expect(result?.subsRemaining?.home).toBe(3); // 5 - 2
      expect(result?.subsRemaining?.away).toBe(4); // 5 - 1
    });
  });

  describe('scenario tags', () => {
    it('should add critical_time tag at minute 75+', () => {
      const match = createMockMatch({
        fixture: { status: { short: '2H', elapsed: 80 } } as any,
      });
      const statistics = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.scenarioTags).toContain('critical_time');
    });

    it('should add red_card tag when red card is present', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics();
      const events = createMockEvents(100, 200, {
        cards: [{ minute: 50, team: 'away', type: 'red' }],
      });

      const result = convertApiMatchToAdvanced(match, statistics, events);

      expect(result?.scenarioTags).toContain('red_card');
      expect(result?.scenarioTags).toContain('away_red');
    });

    it('should add balanced tag for 0-0 draw in 60-75 minute range', () => {
      const match = createMockMatch({
        goals: { home: 0, away: 0 },
        fixture: { status: { short: '2H', elapsed: 65 } } as any,
      });
      const statistics = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.scenarioTags).toContain('balanced');
      expect(result?.scenarioTags).toContain('deadlock');
    });

    it('should add large_lead tag for 3+ goal difference', () => {
      const match = createMockMatch({ goals: { home: 4, away: 1 } });
      const statistics = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.scenarioTags).toContain('large_lead');
    });
  });

  describe('unscoreable matches', () => {
    it('should return unscoreable match when no statistics provided for live match', () => {
      const match = createMockMatch();

      const result = convertApiMatchToAdvanced(match, undefined);

      expect(result).not.toBeNull();
      expect(result?._unscoreable).toBe(true);
      expect(result?._noStatsReason).toBe('MISSING_STATISTICS_DATA');
      expect(result?.scenarioTags).toContain('no_stats');
    });

    it('should mark _realDataAvailable correctly when statistics present', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?.stats?._realDataAvailable).toBe(true);
    });
  });

  describe('validation integration', () => {
    it('should include validation result in output', () => {
      const match = createMockMatch();
      const statistics = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, statistics);

      expect(result?._validation).toBeDefined();
      expect(result?._validation?.fixture_id).toBe(12345);
      expect(result?._validation?.fixtures_real).toBe(true);
    });
  });

  describe('rating calculation', () => {
    it('should calculate higher rating for draw at 85+ minutes', () => {
      const match85 = createMockMatch({
        goals: { home: 1, away: 1 },
        fixture: { status: { short: '2H', elapsed: 85 } } as any,
      });
      const match60 = createMockMatch({
        goals: { home: 1, away: 1 },
        fixture: { status: { short: '2H', elapsed: 60 } } as any,
      });
      const statistics = createMockStatistics();

      const result85 = convertApiMatchToAdvanced(match85, statistics);
      const result60 = convertApiMatchToAdvanced(match60, statistics);

      expect(result85?.killScore).toBeGreaterThan(result60?.killScore ?? 0);
    });

    it('should calculate higher rating for 1-goal difference', () => {
      const matchOneGoal = createMockMatch({ goals: { home: 2, away: 1 } });
      const matchThreeGoals = createMockMatch({ goals: { home: 3, away: 0 } });
      const statistics = createMockStatistics();

      const resultOne = convertApiMatchToAdvanced(matchOneGoal, statistics);
      const resultThree = convertApiMatchToAdvanced(matchThreeGoals, statistics);

      expect(resultOne?.killScore).toBeGreaterThan(resultThree?.killScore ?? 0);
    });
  });
});

// ============================================
// convertApiMatchesToAdvanced Tests
// ============================================

describe('convertApiMatchesToAdvanced', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should convert multiple matches', () => {
    const match1 = createMockMatch();
    match1.fixture.id = 1;
    const match2 = createMockMatch();
    match2.fixture.id = 2;
    const match3 = createMockMatch();
    match3.fixture.id = 3;

    const matches = [match1, match2, match3];
    const statisticsMap = new Map([
      [1, createMockStatistics()],
      [2, createMockStatistics()],
      [3, createMockStatistics()],
    ]);

    const results = convertApiMatchesToAdvanced(matches, statisticsMap);

    expect(results.length).toBe(3);
    expect(results.map(r => r.id)).toEqual([1, 2, 3]);
  });

  it('should handle matches with missing statistics', () => {
    const match1 = createMockMatch();
    match1.fixture.id = 1;
    const match2 = createMockMatch();
    match2.fixture.id = 2;

    const matches = [match1, match2];
    const statisticsMap = new Map([[1, createMockStatistics()]]);

    const results = convertApiMatchesToAdvanced(matches, statisticsMap);

    expect(results.length).toBe(2);
    expect(results.find(r => r.id === 2)?._unscoreable).toBe(true);
  });
});

// ============================================
// Helper Functions Tests
// ============================================

describe('isHighAlertMatch', () => {
  it('should return true for killScore >= 70', () => {
    const match = { killScore: 75, scenarioTags: [] } as unknown as AdvancedMatch;
    expect(isHighAlertMatch(match)).toBe(true);
  });

  it('should return true for strong_behind scenario', () => {
    const match = { killScore: 50, scenarioTags: ['strong_behind'] } as unknown as AdvancedMatch;
    expect(isHighAlertMatch(match)).toBe(true);
  });

  it('should return false for low score without special tags', () => {
    const match = { killScore: 50, scenarioTags: ['normal'] } as unknown as AdvancedMatch;
    expect(isHighAlertMatch(match)).toBe(false);
  });
});

describe('isCriticalTimeMatch', () => {
  it('should return true for minute >= 75', () => {
    const match = { minute: 80 } as AdvancedMatch;
    expect(isCriticalTimeMatch(match)).toBe(true);
  });

  it('should return false for minute < 75', () => {
    const match = { minute: 60 } as AdvancedMatch;
    expect(isCriticalTimeMatch(match)).toBe(false);
  });
});

describe('filterByScenario', () => {
  it('should filter matches by scenario tag', () => {
    const matches = [
      { scenarioTags: ['strong_behind', 'critical_time'] } as AdvancedMatch,
      { scenarioTags: ['normal'] } as AdvancedMatch,
      { scenarioTags: ['red_card', 'strong_behind'] } as AdvancedMatch,
    ];

    const result = filterByScenario(matches, 'strong_behind');

    expect(result.length).toBe(2);
  });

  it('should return empty array if no matches', () => {
    const matches = [
      { scenarioTags: ['normal'] } as AdvancedMatch,
    ];

    const result = filterByScenario(matches, 'red_card');

    expect(result.length).toBe(0);
  });
});

describe('getScenarioDescription', () => {
  it('should return 强队落后 for strong_behind', () => {
    const match = { scenarioTags: ['strong_behind', 'critical_time'] } as AdvancedMatch;
    expect(getScenarioDescription(match)).toBe('强队落后');
  });

  it('should return 红牌影响 for red_card', () => {
    const match = { scenarioTags: ['red_card'] } as AdvancedMatch;
    expect(getScenarioDescription(match)).toBe('红牌影响');
  });

  it('should return 关键时段 for critical_time only', () => {
    const match = { scenarioTags: ['critical_time'] } as AdvancedMatch;
    expect(getScenarioDescription(match)).toBe('关键时段');
  });

  it('should return 普通比赛 for normal', () => {
    const match = { scenarioTags: ['normal'] } as AdvancedMatch;
    expect(getScenarioDescription(match)).toBe('普通比赛');
  });

  it('should return 普通比赛 for no tags', () => {
    const match = { scenarioTags: [] } as unknown as AdvancedMatch;
    expect(getScenarioDescription(match)).toBe('普通比赛');
  });
});
