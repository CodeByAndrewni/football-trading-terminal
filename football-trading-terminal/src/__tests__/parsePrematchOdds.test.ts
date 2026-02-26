// ============================================
// Unit Tests: parsePrematchOdds Function
// 验证赛前赔率解析逻辑
// ============================================

import { describe, it, expect } from 'vitest';
import { parsePrematchOdds } from '../services/apiConverter';
import type { OddsData, Bookmaker } from '../types';

// ============================================
// Test Fixtures
// ============================================

function createMockOddsData(options: {
  fixtureId?: number;
  bookmakers?: Bookmaker[];
}): OddsData[] {
  return [{
    league: {
      id: 39,
      name: 'Premier League',
      country: 'England',
      logo: 'https://example.com/logo.png',
      flag: 'https://example.com/flag.png',
      season: 2024,
    },
    fixture: {
      id: options.fixtureId || 12345,
      timezone: 'UTC',
      date: '2024-01-01T15:00:00Z',
      timestamp: 1704121200,
    },
    update: '2024-01-01T14:00:00Z',
    bookmakers: options.bookmakers || [],
  }];
}

function createMockBookmaker(options: {
  id?: number;
  name?: string;
  handicapLine?: number;
  overUnderLine?: number;
}): Bookmaker {
  const bets = [];

  // Asian Handicap bet (id=8)
  if (options.handicapLine !== undefined) {
    bets.push({
      id: 8,
      name: 'Asian Handicap',
      values: [
        { value: `Home ${options.handicapLine}`, odd: '1.90' },
        { value: `Away ${-options.handicapLine}`, odd: '1.90' },
      ],
    });
  }

  // Over/Under bet (id=5)
  if (options.overUnderLine !== undefined) {
    bets.push({
      id: 5,
      name: 'Goals Over/Under',
      values: [
        { value: `Over ${options.overUnderLine}`, odd: '1.85' },
        { value: `Under ${options.overUnderLine}`, odd: '1.95' },
      ],
    });
  }

  return {
    id: options.id || 8,
    name: options.name || 'Bet365',
    bets,
  };
}

// ============================================
// Tests
// ============================================

describe('parsePrematchOdds', () => {
  describe('empty/null inputs', () => {
    it('should return null values for undefined input', () => {
      const result = parsePrematchOdds(undefined);

      expect(result.handicap).toBeNull();
      expect(result.overUnder).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should return null values for empty array', () => {
      const result = parsePrematchOdds([]);

      expect(result.handicap).toBeNull();
      expect(result.overUnder).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should return null values when no bookmakers', () => {
      const odds = createMockOddsData({ bookmakers: [] });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBeNull();
      expect(result.overUnder).toBeNull();
      expect(result.source).toBeNull();
    });
  });

  describe('handicap parsing', () => {
    it('should parse negative handicap (home favorite)', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ handicapLine: -1.5 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(-1.5);
      expect(result.source).toBe('PREMATCH_API');
    });

    it('should parse positive handicap (away favorite)', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ handicapLine: 0.5 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(0.5);
      expect(result.source).toBe('PREMATCH_API');
    });

    it('should parse zero handicap (even match)', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ handicapLine: 0 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(0);
      expect(result.source).toBe('PREMATCH_API');
    });

    it('should parse quarter handicap (-0.25)', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ handicapLine: -0.25 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(-0.25);
    });

    it('should parse quarter handicap (-1.75)', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ handicapLine: -1.75 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(-1.75);
    });
  });

  describe('over/under parsing', () => {
    it('should parse 2.5 line', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ overUnderLine: 2.5 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.overUnder).toBe(2.5);
      expect(result.source).toBe('PREMATCH_API');
    });

    it('should parse 3.5 line', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ overUnderLine: 3.5 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.overUnder).toBe(3.5);
    });

    it('should parse 1.5 line', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ overUnderLine: 1.5 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.overUnder).toBe(1.5);
    });
  });

  describe('bookmaker priority', () => {
    it('should prefer Bet365 (id=8) over others', () => {
      const odds = createMockOddsData({
        bookmakers: [
          createMockBookmaker({ id: 1, name: 'Pinnacle', handicapLine: -0.5 }),
          createMockBookmaker({ id: 8, name: 'Bet365', handicapLine: -1.0 }),
          createMockBookmaker({ id: 6, name: 'Bwin', handicapLine: -0.75 }),
        ],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(-1.0); // Bet365's line
    });

    it('should use Bwin (id=6) if Bet365 not available', () => {
      const odds = createMockOddsData({
        bookmakers: [
          createMockBookmaker({ id: 1, name: 'Pinnacle', handicapLine: -0.5 }),
          createMockBookmaker({ id: 6, name: 'Bwin', handicapLine: -0.75 }),
        ],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(-0.75); // Bwin's line
    });

    it('should fallback to first bookmaker if none preferred', () => {
      const odds = createMockOddsData({
        bookmakers: [
          createMockBookmaker({ id: 99, name: 'Unknown', handicapLine: -2.0 }),
        ],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(-2.0);
    });
  });

  describe('combined handicap and O/U', () => {
    it('should parse both handicap and O/U from same bookmaker', () => {
      const odds = createMockOddsData({
        bookmakers: [{
          id: 8,
          name: 'Bet365',
          bets: [
            {
              id: 8,
              name: 'Asian Handicap',
              values: [
                { value: 'Home -1.5', odd: '1.90' },
                { value: 'Away 1.5', odd: '1.90' },
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
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBe(-1.5);
      expect(result.overUnder).toBe(2.5);
      expect(result.source).toBe('PREMATCH_API');
    });
  });

  describe('edge cases', () => {
    it('should handle bookmaker with no bets', () => {
      const odds = createMockOddsData({
        bookmakers: [{
          id: 8,
          name: 'Bet365',
          bets: [],
        }],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBeNull();
      expect(result.overUnder).toBeNull();
      expect(result.source).toBeNull();
    });

    it('should handle handicap bet with missing values', () => {
      const odds = createMockOddsData({
        bookmakers: [{
          id: 8,
          name: 'Bet365',
          bets: [{
            id: 8,
            name: 'Asian Handicap',
            values: [], // Empty values
          }],
        }],
      });
      const result = parsePrematchOdds(odds);

      expect(result.handicap).toBeNull();
    });

    it('should return source as PREMATCH_API when any data found', () => {
      const odds = createMockOddsData({
        bookmakers: [createMockBookmaker({ overUnderLine: 2.5 })],
      });
      const result = parsePrematchOdds(odds);

      expect(result.source).toBe('PREMATCH_API');
    });
  });
});
