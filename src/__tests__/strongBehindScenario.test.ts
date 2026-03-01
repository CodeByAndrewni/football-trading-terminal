// ============================================
// Unit Tests: Strong Team Behind Scenario
// 验证强队落后场景检测（使用赛前赔率）
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertApiMatchToAdvanced,
  filterByScenario,
  isHighAlertMatch,
} from '../services/apiConverter';
import type { Match, TeamStatistics, OddsData } from '../types';

// ============================================
// Test Fixtures
// ============================================

function createMockMatch(options: {
  fixtureId?: number;
  minute?: number;
  homeGoals?: number;
  awayGoals?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  status?: string;
}): Match {
  return {
    fixture: {
      id: options.fixtureId || 12345,
      referee: 'John Smith',
      timezone: 'UTC',
      date: '2024-01-01T15:00:00Z',
      timestamp: 1704121200,
      periods: { first: 1704121200, second: 1704124800 },
      venue: { id: 1, name: 'Test Stadium', city: 'Test City' },
      status: {
        long: 'Second Half',
        short: options.status || '2H',
        elapsed: options.minute || 75,
      },
    },
    league: {
      id: 39,
      name: 'Premier League',
      country: 'England',
      logo: 'https://example.com/logo.png',
      flag: 'https://example.com/flag.png',
      season: 2024,
      round: 'Regular Season - 20',
    },
    teams: {
      home: { id: options.homeTeamId || 100, name: 'Home Team', logo: 'https://example.com/home.png' },
      away: { id: options.awayTeamId || 200, name: 'Away Team', logo: 'https://example.com/away.png' },
    },
    goals: {
      home: options.homeGoals ?? 0,
      away: options.awayGoals ?? 1,
    },
    score: {
      halftime: { home: 0, away: 1 },
      fulltime: { home: null, away: null },
      extratime: { home: null, away: null },
      penalty: { home: null, away: null },
    },
  };
}

function createMockStatistics(): TeamStatistics[] {
  return [
    {
      team: { id: 100, name: 'Home Team', logo: '' },
      statistics: [
        { type: 'Total Shots', value: 15 },
        { type: 'Shots on Goal', value: 6 },
        { type: 'Ball Possession', value: '55%' },
        { type: 'Corner Kicks', value: 7 },
        { type: 'Dangerous Attacks', value: 50 },
        { type: 'expected_goals', value: 1.5 },
        { type: 'Fouls', value: 10 },
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
        { type: 'Fouls', value: 12 },
      ],
    },
  ];
}

function createMockPrematchOdds(handicapLine: number): OddsData[] {
  return [{
    league: {
      id: 39,
      name: 'Premier League',
      country: 'England',
      logo: '',
      flag: '',
      season: 2024,
    },
    fixture: {
      id: 12345,
      timezone: 'UTC',
      date: '2024-01-01T15:00:00Z',
      timestamp: 1704121200,
    },
    update: '2024-01-01T14:00:00Z',
    bookmakers: [{
      id: 8,
      name: 'Bet365',
      bets: [
        {
          id: 8,
          name: 'Asian Handicap',
          values: [
            { value: `Home ${handicapLine}`, odd: '1.90' },
            { value: `Away ${-handicapLine}`, odd: '1.90' },
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
    }],
  }];
}

// ============================================
// Tests
// ============================================

describe('Strong Team Behind Scenario', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('Home team strong and behind', () => {
    it('should detect strong_behind when home favorite is losing at 80+', () => {
      const match = createMockMatch({
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-1.5); // Home is strong favorite

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result).not.toBeNull();
      expect(result?.home.handicap).toBe(-1.5);
      expect(result?.home._handicap_source).toBe('PREMATCH_API');
      expect(result?.scenarioTags).toContain('strong_behind');
      expect(result?.scenarioTags).toContain('critical_time');
    });

    it('should detect strong_behind when home favorite is losing at 75', () => {
      const match = createMockMatch({
        minute: 75,
        homeGoals: 1,
        awayGoals: 2,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-0.5);

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.scenarioTags).toContain('strong_behind');
    });

    it('should NOT detect strong_behind when home favorite is winning', () => {
      const match = createMockMatch({
        minute: 80,
        homeGoals: 2,
        awayGoals: 0,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-1.5);

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.scenarioTags).not.toContain('strong_behind');
    });

    it('should NOT detect strong_behind when home favorite is drawing', () => {
      const match = createMockMatch({
        minute: 80,
        homeGoals: 1,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-1.0);

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.scenarioTags).not.toContain('strong_behind');
    });
  });

  describe('Away team strong and behind', () => {
    it('should detect strong_behind when away favorite is losing', () => {
      const match = createMockMatch({
        minute: 82,
        homeGoals: 2,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(0.5); // Positive = away is strong

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.home.handicap).toBe(0.5);
      expect(result?.scenarioTags).toContain('strong_behind');
    });

    it('should detect strong_behind when away big favorite is losing', () => {
      const match = createMockMatch({
        minute: 85,
        homeGoals: 1,
        awayGoals: 0,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(1.5); // Away is big favorite

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.scenarioTags).toContain('strong_behind');
    });
  });

  describe('Time threshold', () => {
    it('should NOT detect strong_behind before minute 70', () => {
      const match = createMockMatch({
        minute: 65,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-1.5);

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.scenarioTags).not.toContain('strong_behind');
    });

    it('should detect strong_behind at exactly minute 70', () => {
      const match = createMockMatch({
        minute: 70,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-1.0);

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.scenarioTags).toContain('strong_behind');
    });
  });

  describe('Without prematch odds', () => {
    it('should NOT detect strong_behind without prematch odds', () => {
      const match = createMockMatch({
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, undefined);

      expect(result?.home.handicap).toBeNull();
      expect(result?.scenarioTags).not.toContain('strong_behind');
    });

    it('should still detect critical_time without prematch odds', () => {
      const match = createMockMatch({
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, undefined);

      expect(result?.scenarioTags).toContain('critical_time');
    });
  });

  describe('isHighAlertMatch with strong_behind', () => {
    it('should return true for strong_behind scenario', () => {
      const match = createMockMatch({
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-1.5);

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(isHighAlertMatch(result!)).toBe(true);
    });
  });

  describe('filterByScenario with strong_behind', () => {
    it('should filter matches by strong_behind scenario', () => {
      const match1 = createMockMatch({ fixtureId: 1, minute: 82, homeGoals: 0, awayGoals: 1 });
      const match2 = createMockMatch({ fixtureId: 2, minute: 82, homeGoals: 2, awayGoals: 0 });
      const match3 = createMockMatch({ fixtureId: 3, minute: 82, homeGoals: 0, awayGoals: 2 });

      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-1.5);

      const adv1 = convertApiMatchToAdvanced(match1, stats, [], undefined, undefined, prematchOdds);
      const adv2 = convertApiMatchToAdvanced(match2, stats, [], undefined, undefined, prematchOdds);
      const adv3 = convertApiMatchToAdvanced(match3, stats, [], undefined, undefined, prematchOdds);

      const allMatches = [adv1!, adv2!, adv3!];
      const strongBehindMatches = filterByScenario(allMatches, 'strong_behind');

      // match1 and match3 have home (strong) losing
      expect(strongBehindMatches.length).toBe(2);
      expect(strongBehindMatches.map(m => m.id)).toContain(1);
      expect(strongBehindMatches.map(m => m.id)).toContain(3);
    });
  });

  describe('Handicap line edge cases', () => {
    it('should handle zero handicap (even match) - no strong team', () => {
      const match = createMockMatch({
        minute: 82,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(0); // Even match

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      // With handicap = 0, neither team is "strong"
      // isHomeStrong = (0 < 0) = false, isAwayStrong = (0 > 0) = false
      expect(result?.scenarioTags).not.toContain('strong_behind');
    });

    it('should handle small handicap (-0.25)', () => {
      const match = createMockMatch({
        minute: 80,
        homeGoals: 0,
        awayGoals: 1,
      });
      const stats = createMockStatistics();
      const prematchOdds = createMockPrematchOdds(-0.25);

      const result = convertApiMatchToAdvanced(match, stats, [], undefined, undefined, prematchOdds);

      expect(result?.home.handicap).toBe(-0.25);
      expect(result?.scenarioTags).toContain('strong_behind');
    });
  });
});
