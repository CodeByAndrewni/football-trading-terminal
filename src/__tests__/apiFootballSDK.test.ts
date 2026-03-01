// ============================================
// API-Football SDK 单元测试
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearCache,
  getCacheStatistics,
  ApiFootballError,
  CACHE_TTL,
  BOOKMAKER_IDS,
  BET_TYPE_IDS,
  LEAGUE_IDS,
} from '../services/apiFootballSDK';

// ============================================
// Mock 数据
// ============================================

const mockLiveFixturesResponse = {
  get: 'fixtures',
  parameters: { live: 'all' },
  errors: [],
  results: 2,
  response: [
    {
      fixture: {
        id: 1035034,
        referee: 'M. Oliver',
        timezone: 'UTC',
        date: '2024-01-15T20:00:00+00:00',
        timestamp: 1705348800,
        periods: { first: 1705348800, second: 1705352400 },
        venue: { id: 556, name: 'Old Trafford', city: 'Manchester' },
        status: { long: 'Second Half', short: '2H', elapsed: 67 },
      },
      league: {
        id: 39,
        name: 'Premier League',
        country: 'England',
        logo: 'https://...',
        flag: 'https://...',
        season: 2023,
        round: 'Regular Season - 21',
      },
      teams: {
        home: { id: 33, name: 'Manchester United', logo: 'https://...', winner: null },
        away: { id: 40, name: 'Liverpool', logo: 'https://...', winner: null },
      },
      goals: { home: 1, away: 2 },
      score: {
        halftime: { home: 0, away: 1 },
        fulltime: { home: null, away: null },
        extratime: { home: null, away: null },
        penalty: { home: null, away: null },
      },
    },
  ],
};

const mockStatisticsResponse = {
  get: 'fixtures/statistics',
  parameters: { fixture: '1035034' },
  errors: [],
  results: 2,
  response: [
    {
      team: { id: 33, name: 'Manchester United', logo: 'https://...' },
      statistics: [
        { type: 'Shots on Goal', value: 5 },
        { type: 'Shots off Goal', value: 3 },
        { type: 'Total Shots', value: 12 },
        { type: 'Corner Kicks', value: 6 },
        { type: 'Ball Possession', value: '55%' },
        { type: 'expected_goals', value: '1.45' },
      ],
    },
    {
      team: { id: 40, name: 'Liverpool', logo: 'https://...' },
      statistics: [
        { type: 'Shots on Goal', value: 7 },
        { type: 'Shots off Goal', value: 4 },
        { type: 'Total Shots', value: 15 },
        { type: 'Corner Kicks', value: 4 },
        { type: 'Ball Possession', value: '45%' },
        { type: 'expected_goals', value: '1.85' },
      ],
    },
  ],
};

const mockEventsResponse = {
  get: 'fixtures/events',
  parameters: { fixture: '1035034' },
  errors: [],
  results: 3,
  response: [
    {
      time: { elapsed: 23, extra: null },
      team: { id: 40, name: 'Liverpool', logo: 'https://...' },
      player: { id: 1100, name: 'Mohamed Salah' },
      assist: { id: 1102, name: 'Trent Alexander-Arnold' },
      type: 'Goal',
      detail: 'Normal Goal',
      comments: null,
    },
    {
      time: { elapsed: 55, extra: null },
      team: { id: 33, name: 'Manchester United', logo: 'https://...' },
      player: { id: 909, name: 'Marcus Rashford' },
      assist: { id: 747, name: 'Bruno Fernandes' },
      type: 'Goal',
      detail: 'Normal Goal',
      comments: null,
    },
    {
      time: { elapsed: 78, extra: null },
      team: { id: 40, name: 'Liverpool', logo: 'https://...' },
      player: { id: 1100, name: 'Mohamed Salah' },
      assist: { id: null, name: null },
      type: 'Goal',
      detail: 'Penalty',
      comments: null,
    },
  ],
};

const mockOddsResponse = {
  get: 'odds',
  parameters: { fixture: '1035034' },
  errors: [],
  results: 1,
  response: [
    {
      league: { id: 39, name: 'Premier League', country: 'England', logo: '', flag: '', season: 2023 },
      fixture: { id: 1035034, timezone: 'UTC', date: '2024-01-15', timestamp: 1705348800 },
      update: '2024-01-15T19:00:00+00:00',
      bookmakers: [
        {
          id: 8,
          name: 'Bet365',
          bets: [
            {
              id: 1,
              name: 'Match Winner',
              values: [
                { value: 'Home', odd: '2.10' },
                { value: 'Draw', odd: '3.40' },
                { value: 'Away', odd: '3.20' },
              ],
            },
            {
              id: 5,
              name: 'Goals Over/Under',
              values: [
                { value: 'Over 2.5', odd: '1.85' },
                { value: 'Under 2.5', odd: '1.95' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const mockStandingsResponse = {
  get: 'standings',
  parameters: { league: '39', season: '2023' },
  errors: [],
  results: 1,
  response: [
    {
      league: {
        id: 39,
        name: 'Premier League',
        country: 'England',
        logo: 'https://...',
        flag: 'https://...',
        season: 2023,
        standings: [
          [
            {
              rank: 1,
              team: { id: 50, name: 'Manchester City', logo: 'https://...' },
              points: 52,
              goalsDiff: 35,
              form: 'WWDWW',
              status: 'same',
              description: 'Champions League',
              all: { played: 21, win: 16, draw: 4, lose: 1, goals: { for: 52, against: 17 } },
              home: { played: 10, win: 8, draw: 2, lose: 0, goals: { for: 28, against: 8 } },
              away: { played: 11, win: 8, draw: 2, lose: 1, goals: { for: 24, against: 9 } },
              update: '2024-01-15T00:00:00+00:00',
            },
            {
              rank: 2,
              team: { id: 40, name: 'Liverpool', logo: 'https://...' },
              points: 48,
              goalsDiff: 28,
              form: 'WWWDW',
              status: 'same',
              description: 'Champions League',
              all: { played: 21, win: 15, draw: 3, lose: 3, goals: { for: 48, against: 20 } },
              home: { played: 10, win: 8, draw: 1, lose: 1, goals: { for: 26, against: 8 } },
              away: { played: 11, win: 7, draw: 2, lose: 2, goals: { for: 22, against: 12 } },
              update: '2024-01-15T00:00:00+00:00',
            },
          ],
        ],
      },
    },
  ],
};

const mockErrorResponse = {
  get: 'fixtures',
  parameters: { id: '999999' },
  errors: { fixture: 'The fixture does not exist' },
  results: 0,
  response: [],
};

// ============================================
// 测试套件
// ============================================

describe('API-Football SDK', () => {
  // 在每个测试前清除缓存
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // 缓存机制测试
  // ============================================
  describe('Cache Mechanism', () => {
    it('should start with empty cache', () => {
      const stats = getCacheStatistics();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });

    it('should clear cache successfully', () => {
      // 手动设置一些缓存（通过内部测试）
      clearCache();
      const stats = getCacheStatistics();
      expect(stats.size).toBe(0);
    });

    it('should have correct CACHE_TTL values', () => {
      expect(CACHE_TTL.LIVE_FIXTURES).toBe(10 * 1000);
      expect(CACHE_TTL.LIVE_ODDS).toBe(10 * 1000);
      expect(CACHE_TTL.FIXTURE_STATS).toBe(30 * 1000);
      expect(CACHE_TTL.PREMATCH_ODDS).toBe(5 * 60 * 1000);
      expect(CACHE_TTL.H2H).toBe(5 * 60 * 1000);
      expect(CACHE_TTL.STANDINGS).toBe(60 * 60 * 1000);
      expect(CACHE_TTL.TEAM_STATS).toBe(60 * 60 * 1000);
      expect(CACHE_TTL.INJURIES).toBe(60 * 60 * 1000);
      expect(CACHE_TTL.LEAGUES).toBe(24 * 60 * 60 * 1000);
      expect(CACHE_TTL.BASIC_DATA).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================
  describe('Error Handling', () => {
    it('should create ApiFootballError with correct properties', () => {
      const error = new ApiFootballError(429, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiFootballError);
      expect(error.status).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.name).toBe('ApiFootballError');
    });

    it('should create ApiFootballError without code', () => {
      const error = new ApiFootballError(500, 'Server error');

      expect(error.status).toBe(500);
      expect(error.message).toBe('Server error');
      expect(error.code).toBeUndefined();
    });
  });

  // ============================================
  // 常量测试
  // ============================================
  describe('Constants', () => {
    describe('BOOKMAKER_IDS', () => {
      it('should have correct bookmaker IDs', () => {
        expect(BOOKMAKER_IDS.PINNACLE).toBe(1);
        expect(BOOKMAKER_IDS.UNIBET).toBe(3);
        expect(BOOKMAKER_IDS.BWIN).toBe(6);
        expect(BOOKMAKER_IDS.BET365).toBe(8);
        expect(BOOKMAKER_IDS.ONE_XBET).toBe(11);
      });
    });

    describe('BET_TYPE_IDS', () => {
      it('should have correct bet type IDs', () => {
        expect(BET_TYPE_IDS.MATCH_WINNER).toBe(1);
        expect(BET_TYPE_IDS.GOALS_OVER_UNDER).toBe(5);
        expect(BET_TYPE_IDS.ASIAN_HANDICAP).toBe(8);
        expect(BET_TYPE_IDS.BOTH_TEAMS_SCORE).toBe(26);
      });
    });

    describe('LEAGUE_IDS', () => {
      it('should have correct league IDs for top 5 leagues', () => {
        expect(LEAGUE_IDS.PREMIER_LEAGUE).toBe(39);
        expect(LEAGUE_IDS.LA_LIGA).toBe(140);
        expect(LEAGUE_IDS.SERIE_A).toBe(135);
        expect(LEAGUE_IDS.BUNDESLIGA).toBe(78);
        expect(LEAGUE_IDS.LIGUE_1).toBe(61);
      });

      it('should have correct league IDs for European competitions', () => {
        expect(LEAGUE_IDS.CHAMPIONS_LEAGUE).toBe(2);
        expect(LEAGUE_IDS.EUROPA_LEAGUE).toBe(3);
      });

      it('should have correct league IDs for international', () => {
        expect(LEAGUE_IDS.WORLD_CUP).toBe(1);
        expect(LEAGUE_IDS.EURO).toBe(4);
      });
    });
  });

  // ============================================
  // Mock数据结构验证测试
  // ============================================
  describe('Response Structure Validation', () => {
    describe('Fixtures Response', () => {
      it('should have correct structure for live fixtures', () => {
        const response = mockLiveFixturesResponse.response[0];

        // Fixture
        expect(response.fixture).toBeDefined();
        expect(response.fixture.id).toBe(1035034);
        expect(response.fixture.status.short).toBe('2H');
        expect(response.fixture.status.elapsed).toBe(67);

        // Teams
        expect(response.teams.home.id).toBe(33);
        expect(response.teams.home.name).toBe('Manchester United');
        expect(response.teams.away.id).toBe(40);
        expect(response.teams.away.name).toBe('Liverpool');

        // Goals
        expect(response.goals.home).toBe(1);
        expect(response.goals.away).toBe(2);

        // League
        expect(response.league.id).toBe(39);
        expect(response.league.name).toBe('Premier League');
      });
    });

    describe('Statistics Response', () => {
      it('should have correct structure for statistics', () => {
        const homeStats = mockStatisticsResponse.response[0];
        const awayStats = mockStatisticsResponse.response[1];

        expect(homeStats.team.id).toBe(33);
        expect(awayStats.team.id).toBe(40);

        // Check statistics array
        expect(homeStats.statistics).toBeInstanceOf(Array);
        expect(homeStats.statistics.length).toBeGreaterThan(0);

        // Check specific stats
        const shotsOnGoal = homeStats.statistics.find(s => s.type === 'Shots on Goal');
        expect(shotsOnGoal).toBeDefined();
        expect(shotsOnGoal?.value).toBe(5);

        const xg = homeStats.statistics.find(s => s.type === 'expected_goals');
        expect(xg).toBeDefined();
        expect(xg?.value).toBe('1.45');
      });
    });

    describe('Events Response', () => {
      it('should have correct structure for events', () => {
        const events = mockEventsResponse.response;

        expect(events.length).toBe(3);

        // First goal
        const firstGoal = events[0];
        expect(firstGoal.type).toBe('Goal');
        expect(firstGoal.detail).toBe('Normal Goal');
        expect(firstGoal.time.elapsed).toBe(23);
        expect(firstGoal.player.name).toBe('Mohamed Salah');

        // Penalty goal
        const penaltyGoal = events[2];
        expect(penaltyGoal.type).toBe('Goal');
        expect(penaltyGoal.detail).toBe('Penalty');
        expect(penaltyGoal.time.elapsed).toBe(78);
      });

      it('should correctly identify goals in 75+ minutes', () => {
        const events = mockEventsResponse.response;
        const lateGoals = events.filter(e => e.type === 'Goal' && e.time.elapsed >= 75);

        expect(lateGoals.length).toBe(1);
        expect(lateGoals[0].time.elapsed).toBe(78);
      });
    });

    describe('Odds Response', () => {
      it('should have correct structure for odds', () => {
        const odds = mockOddsResponse.response[0];

        expect(odds.fixture.id).toBe(1035034);
        expect(odds.bookmakers).toBeInstanceOf(Array);
        expect(odds.bookmakers.length).toBeGreaterThan(0);

        const bet365 = odds.bookmakers.find(b => b.id === 8);
        expect(bet365).toBeDefined();
        expect(bet365?.name).toBe('Bet365');
      });

      it('should parse Match Winner odds correctly', () => {
        const odds = mockOddsResponse.response[0];
        const bet365 = odds.bookmakers[0];
        const matchWinner = bet365.bets.find(b => b.id === 1);

        expect(matchWinner).toBeDefined();
        expect(matchWinner?.name).toBe('Match Winner');

        const homeOdd = matchWinner?.values.find(v => v.value === 'Home');
        const drawOdd = matchWinner?.values.find(v => v.value === 'Draw');
        const awayOdd = matchWinner?.values.find(v => v.value === 'Away');

        expect(homeOdd?.odd).toBe('2.10');
        expect(drawOdd?.odd).toBe('3.40');
        expect(awayOdd?.odd).toBe('3.20');
      });

      it('should parse Over/Under odds correctly', () => {
        const odds = mockOddsResponse.response[0];
        const bet365 = odds.bookmakers[0];
        const overUnder = bet365.bets.find(b => b.id === 5);

        expect(overUnder).toBeDefined();
        expect(overUnder?.name).toBe('Goals Over/Under');

        const over25 = overUnder?.values.find(v => v.value === 'Over 2.5');
        const under25 = overUnder?.values.find(v => v.value === 'Under 2.5');

        expect(over25?.odd).toBe('1.85');
        expect(under25?.odd).toBe('1.95');
      });
    });

    describe('Standings Response', () => {
      it('should have correct structure for standings', () => {
        const standings = mockStandingsResponse.response[0];

        expect(standings.league.id).toBe(39);
        expect(standings.league.standings).toBeInstanceOf(Array);
        expect(standings.league.standings[0]).toBeInstanceOf(Array);
      });

      it('should correctly order teams by rank', () => {
        const teams = mockStandingsResponse.response[0].league.standings[0];

        expect(teams[0].rank).toBe(1);
        expect(teams[0].team.name).toBe('Manchester City');
        expect(teams[0].points).toBe(52);

        expect(teams[1].rank).toBe(2);
        expect(teams[1].team.name).toBe('Liverpool');
        expect(teams[1].points).toBe(48);
      });

      it('should have form string for each team', () => {
        const teams = mockStandingsResponse.response[0].league.standings[0];

        teams.forEach(team => {
          expect(team.form).toBeDefined();
          expect(team.form.length).toBe(5);
          expect(team.form).toMatch(/^[WDL]+$/);
        });
      });
    });

    describe('Error Response', () => {
      it('should have correct structure for error response', () => {
        expect(mockErrorResponse.errors).toBeDefined();
        expect(mockErrorResponse.errors.fixture).toBe('The fixture does not exist');
        expect(mockErrorResponse.results).toBe(0);
        expect(mockErrorResponse.response).toEqual([]);
      });
    });
  });

  // ============================================
  // 业务逻辑测试
  // ============================================
  describe('Business Logic', () => {
    describe('Strong Team Detection', () => {
      it('should identify favorite from odds', () => {
        const odds = mockOddsResponse.response[0];
        const bet365 = odds.bookmakers[0];
        const matchWinner = bet365.bets.find(b => b.id === 1);

        const homeOdd = Number.parseFloat(matchWinner?.values.find(v => v.value === 'Home')?.odd || '0');
        const awayOdd = Number.parseFloat(matchWinner?.values.find(v => v.value === 'Away')?.odd || '0');

        // Lower odds = favorite
        const favorite = homeOdd < awayOdd ? 'home' : 'away';
        expect(favorite).toBe('home'); // 2.10 < 3.20
      });
    });

    describe('Score Difference Calculation', () => {
      it('should calculate score difference correctly', () => {
        const match = mockLiveFixturesResponse.response[0];
        const homeGoals = match.goals.home;
        const awayGoals = match.goals.away;

        const scoreDiff = Math.abs(homeGoals - awayGoals);
        const isDrawn = homeGoals === awayGoals;
        const leadingTeam = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : null;

        expect(scoreDiff).toBe(1);
        expect(isDrawn).toBe(false);
        expect(leadingTeam).toBe('away');
      });
    });

    describe('Match Status Detection', () => {
      it('should detect if match is in second half', () => {
        const match = mockLiveFixturesResponse.response[0];
        const status = match.fixture.status.short;
        const isSecondHalf = status === '2H';

        expect(isSecondHalf).toBe(true);
      });

      it('should detect if match is in critical time (75+)', () => {
        const match = mockLiveFixturesResponse.response[0];
        const elapsed = match.fixture.status.elapsed || 0;
        const isCriticalTime = elapsed >= 75;

        expect(elapsed).toBe(67);
        expect(isCriticalTime).toBe(false);
      });
    });

    describe('xG Analysis', () => {
      it('should calculate xG debt', () => {
        const stats = mockStatisticsResponse.response;
        const homeStats = stats[0];
        const awayStats = stats[1];

        const homeXg = Number.parseFloat(homeStats.statistics.find(s => s.type === 'expected_goals')?.value as string || '0');
        const awayXg = Number.parseFloat(awayStats.statistics.find(s => s.type === 'expected_goals')?.value as string || '0');

        const match = mockLiveFixturesResponse.response[0];
        const homeGoals = match.goals.home;
        const awayGoals = match.goals.away;

        const homeXgDebt = homeXg - homeGoals;
        const awayXgDebt = awayXg - awayGoals;

        expect(homeXg).toBe(1.45);
        expect(awayXg).toBe(1.85);
        expect(homeXgDebt).toBeCloseTo(0.45, 2); // 1.45 - 1 = 0.45
        expect(awayXgDebt).toBeCloseTo(-0.15, 2); // 1.85 - 2 = -0.15
      });
    });

    describe('Goal Probability from Odds', () => {
      it('should estimate goal probability from over/under odds', () => {
        const odds = mockOddsResponse.response[0];
        const bet365 = odds.bookmakers[0];
        const overUnder = bet365.bets.find(b => b.id === 5);

        const over25Odd = Number.parseFloat(overUnder?.values.find(v => v.value === 'Over 2.5')?.odd || '0');

        // Implied probability = 1 / odds (simplified, without margin)
        const impliedProb = 1 / over25Odd;

        expect(over25Odd).toBe(1.85);
        expect(impliedProb).toBeCloseTo(0.54, 2); // ~54% probability
      });
    });
  });
});
