// ============================================
// Unit Tests: Odds Service - Main O/U Line Detection
// ============================================

import { describe, it, expect } from 'vitest';
import { parseLiveOdds, type ParsedOULine } from '../services/oddsService';

// ============================================
// Test Data Fixtures
// ============================================

// Live odds response with main: true markers
const createLiveOddsResponse = (overUnderValues: Array<{
  value: string;
  odd: string;
  handicap: string;
  main?: boolean;
  suspended?: boolean;
}>) => ({
  fixture: {
    id: 12345,
    status: {
      long: 'Second Half',
      elapsed: 65,
      seconds: '65:00',
    },
  },
  league: { id: 39, season: 2024 },
  teams: {
    home: { id: 1, goals: 1 },
    away: { id: 2, goals: 0 },
  },
  status: { stopped: false, blocked: false, finished: false },
  update: '2024-01-01T12:00:00Z',
  odds: [
    {
      id: 36, // OVER_UNDER_LINE
      name: 'Over/Under',
      values: overUnderValues,
    },
  ],
});

// ============================================
// parseLiveOverUnder Tests
// ============================================

describe('parseLiveOdds - Main O/U Line Detection', () => {

  describe('main: true marker detection', () => {
    it('should detect main line with explicit main: true marker', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.85', handicap: '1.5', main: false },
        { value: 'Under', odd: '1.95', handicap: '1.5', main: false },
        { value: 'Over', odd: '2.10', handicap: '2.25', main: true },
        { value: 'Under', odd: '1.75', handicap: '2.25', main: true },
        { value: 'Over', odd: '2.50', handicap: '2.5', main: false },
        { value: 'Under', odd: '1.50', handicap: '2.5', main: false },
      ]);

      const result = parseLiveOdds(response);

      expect(result.main_ou_line).toBe(2.25);
      expect(result.main_ou_over).toBe(2.10);
      expect(result.main_ou_under).toBe(1.75);
    });

    it('should detect main line when only one value has main: true', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.85', handicap: '1.5' },
        { value: 'Under', odd: '1.95', handicap: '1.5' },
        { value: 'Over', odd: '2.10', handicap: '2.0', main: true },
        { value: 'Under', odd: '1.75', handicap: '2.0' },
      ]);

      const result = parseLiveOdds(response);

      // Should still detect 2.0 as main since one value has main: true
      expect(result.main_ou_line).toBe(2.0);
      expect(result.main_ou_over).toBe(2.10);
      expect(result.main_ou_under).toBe(1.75);
    });
  });

  describe('fallback logic when no main marker', () => {
    it('should fallback to 2.5 when no main marker and 2.5 is available', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.85', handicap: '1.5' },
        { value: 'Under', odd: '1.95', handicap: '1.5' },
        { value: 'Over', odd: '2.50', handicap: '2.5' },
        { value: 'Under', odd: '1.50', handicap: '2.5' },
        { value: 'Over', odd: '3.20', handicap: '3.5' },
        { value: 'Under', odd: '1.30', handicap: '3.5' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.main_ou_line).toBe(2.5);
      expect(result.main_ou_over).toBe(2.50);
      expect(result.main_ou_under).toBe(1.50);
    });

    it('should fallback to 2.25 when 2.5 is not available', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.85', handicap: '1.5' },
        { value: 'Under', odd: '1.95', handicap: '1.5' },
        { value: 'Over', odd: '2.10', handicap: '2.25' },
        { value: 'Under', odd: '1.75', handicap: '2.25' },
        { value: 'Over', odd: '3.20', handicap: '3.5' },
        { value: 'Under', odd: '1.30', handicap: '3.5' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.main_ou_line).toBe(2.25);
      expect(result.main_ou_over).toBe(2.10);
      expect(result.main_ou_under).toBe(1.75);
    });

    it('should fallback to 2.0 when 2.5 and 2.25 are not available', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.85', handicap: '1.5' },
        { value: 'Under', odd: '1.95', handicap: '1.5' },
        { value: 'Over', odd: '2.00', handicap: '2.0' },
        { value: 'Under', odd: '1.80', handicap: '2.0' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.main_ou_line).toBe(2.0);
      expect(result.main_ou_over).toBe(2.00);
      expect(result.main_ou_under).toBe(1.80);
    });

    it('should fallback to 1.75 when only lower lines are available', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.50', handicap: '1.5' },
        { value: 'Under', odd: '2.50', handicap: '1.5' },
        { value: 'Over', odd: '1.75', handicap: '1.75' },
        { value: 'Under', odd: '2.10', handicap: '1.75' },
      ]);

      const result = parseLiveOdds(response);

      // Fallback order: 2.5, 2.25, 2.0, 1.75, 1.5 - so 1.75 should be selected
      expect(result.main_ou_line).toBe(1.75);
      expect(result.main_ou_over).toBe(1.75);
      expect(result.main_ou_under).toBe(2.10);
    });
  });

  describe('fixed lines extraction (1.5, 2.5, 3.5)', () => {
    it('should extract all fixed lines correctly', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.25', handicap: '1.5' },
        { value: 'Under', odd: '3.50', handicap: '1.5' },
        { value: 'Over', odd: '1.90', handicap: '2.5' },
        { value: 'Under', odd: '1.90', handicap: '2.5' },
        { value: 'Over', odd: '3.00', handicap: '3.5' },
        { value: 'Under', odd: '1.35', handicap: '3.5' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.over_1_5).toBe(1.25);
      expect(result.under_1_5).toBe(3.50);
      expect(result.over_2_5).toBe(1.90);
      expect(result.under_2_5).toBe(1.90);
      expect(result.over_3_5).toBe(3.00);
      expect(result.under_3_5).toBe(1.35);
    });

    it('should handle partial fixed lines (only some available)', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '2.10', handicap: '2.5' },
        { value: 'Under', odd: '1.75', handicap: '2.5' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.over_1_5).toBeNull();
      expect(result.under_1_5).toBeNull();
      expect(result.over_2_5).toBe(2.10);
      expect(result.under_2_5).toBe(1.75);
      expect(result.over_3_5).toBeNull();
      expect(result.under_3_5).toBeNull();
    });
  });

  describe('all_ou_lines collection', () => {
    it('should collect all available lines sorted by line value', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '3.00', handicap: '3.5' },
        { value: 'Under', odd: '1.35', handicap: '3.5' },
        { value: 'Over', odd: '1.25', handicap: '1.5' },
        { value: 'Under', odd: '3.50', handicap: '1.5' },
        { value: 'Over', odd: '1.90', handicap: '2.5', main: true },
        { value: 'Under', odd: '1.90', handicap: '2.5', main: true },
        { value: 'Over', odd: '2.10', handicap: '2.25' },
        { value: 'Under', odd: '1.75', handicap: '2.25' },
      ]);

      const result = parseLiveOdds(response);

      // Should be sorted: 1.5, 2.25, 2.5, 3.5
      expect(result.all_ou_lines.length).toBe(4);
      expect(result.all_ou_lines[0].line).toBe(1.5);
      expect(result.all_ou_lines[1].line).toBe(2.25);
      expect(result.all_ou_lines[2].line).toBe(2.5);
      expect(result.all_ou_lines[3].line).toBe(3.5);
    });

    it('should mark main line correctly in all_ou_lines', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.85', handicap: '1.5' },
        { value: 'Under', odd: '1.95', handicap: '1.5' },
        { value: 'Over', odd: '2.10', handicap: '2.25', main: true },
        { value: 'Under', odd: '1.75', handicap: '2.25', main: true },
        { value: 'Over', odd: '2.50', handicap: '2.5' },
        { value: 'Under', odd: '1.50', handicap: '2.5' },
      ]);

      const result = parseLiveOdds(response);

      const line1_5 = result.all_ou_lines.find(l => l.line === 1.5);
      const line2_25 = result.all_ou_lines.find(l => l.line === 2.25);
      const line2_5 = result.all_ou_lines.find(l => l.line === 2.5);

      expect(line1_5?.isMain).toBe(false);
      expect(line2_25?.isMain).toBe(true);
      expect(line2_5?.isMain).toBe(false);
    });

    it('should handle quarter lines (e.g., 2.75)', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '2.20', handicap: '2.75', main: true },
        { value: 'Under', odd: '1.70', handicap: '2.75', main: true },
        { value: 'Over', odd: '2.80', handicap: '3.0' },
        { value: 'Under', odd: '1.45', handicap: '3.0' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.main_ou_line).toBe(2.75);
      expect(result.all_ou_lines.find(l => l.line === 2.75)).toBeTruthy();
      expect(result.all_ou_lines.find(l => l.line === 3.0)).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('should handle empty odds array', () => {
      const response = {
        fixture: { id: 12345, status: { long: 'Live', elapsed: 45, seconds: '45:00' } },
        league: { id: 39, season: 2024 },
        teams: { home: { id: 1, goals: 0 }, away: { id: 2, goals: 0 } },
        status: { stopped: false, blocked: false, finished: false },
        update: '2024-01-01T12:00:00Z',
        odds: [],
      };

      const result = parseLiveOdds(response);

      expect(result.main_ou_line).toBeNull();
      expect(result.main_ou_over).toBeNull();
      expect(result.main_ou_under).toBeNull();
      expect(result.all_ou_lines.length).toBe(0);
      expect(result._fetch_status).toBe('EMPTY');
    });

    it('should skip suspended values', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.90', handicap: '2.5', suspended: true },
        { value: 'Under', odd: '1.90', handicap: '2.5', suspended: true },
        { value: 'Over', odd: '2.10', handicap: '2.25' },
        { value: 'Under', odd: '1.75', handicap: '2.25' },
      ]);

      const result = parseLiveOdds(response);

      // 2.5 should not be extracted because it's suspended
      expect(result.over_2_5).toBeNull();
      expect(result.under_2_5).toBeNull();
      // Should fallback to 2.25
      expect(result.main_ou_line).toBe(2.25);
    });

    it('should handle missing handicap values', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.90', handicap: '' },
        { value: 'Under', odd: '1.90', handicap: '' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.all_ou_lines.length).toBe(0);
      expect(result.main_ou_line).toBeNull();
    });

    it('should handle invalid odd values', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: 'N/A', handicap: '2.5' },
        { value: 'Under', odd: '1.90', handicap: '2.5' },
      ]);

      const result = parseLiveOdds(response);

      // Over should be NaN-filtered
      const line2_5 = result.all_ou_lines.find(l => l.line === 2.5);
      expect(line2_5).toBeTruthy();
      // Under should still work
      expect(line2_5?.under).toBe(1.90);
    });

    it('should handle only Over or only Under available for a line', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.90', handicap: '2.5' },
        // No Under for 2.5
        { value: 'Under', odd: '2.10', handicap: '1.5' },
        // No Over for 1.5
      ]);

      const result = parseLiveOdds(response);

      // Lines with partial data should still be collected
      expect(result.all_ou_lines.length).toBe(2);

      const line2_5 = result.all_ou_lines.find(l => l.line === 2.5);
      expect(line2_5?.over).toBe(1.90);
      expect(line2_5?.under).toBeNull();

      const line1_5 = result.all_ou_lines.find(l => l.line === 1.5);
      expect(line1_5?.over).toBeNull();
      expect(line1_5?.under).toBe(2.10);
    });
  });

  describe('metadata and status', () => {
    it('should set correct metadata for live odds', () => {
      const response = createLiveOddsResponse([
        { value: 'Over', odd: '1.90', handicap: '2.5' },
        { value: 'Under', odd: '1.90', handicap: '2.5' },
      ]);

      const result = parseLiveOdds(response);

      expect(result.fixture_id).toBe(12345);
      expect(result.is_live).toBe(true);
      expect(result.bookmaker).toBe('API-Football Live');
      expect(result.minute).toBe(65);
      expect(result._raw_available).toBe(true);
      expect(result._fetch_status).toBe('SUCCESS');
    });

    it('should handle fixtures without elapsed time', () => {
      const response = {
        fixture: { id: 12345, status: { long: 'Not Started', elapsed: null as any, seconds: null as any } },
        league: { id: 39, season: 2024 },
        teams: { home: { id: 1, goals: 0 }, away: { id: 2, goals: 0 } },
        status: { stopped: false, blocked: false, finished: false },
        update: '2024-01-01T12:00:00Z',
        odds: [
          { id: 36, name: 'Over/Under', values: [
            { value: 'Over', odd: '1.90', handicap: '2.5' },
            { value: 'Under', odd: '1.90', handicap: '2.5' },
          ]},
        ],
      };

      const result = parseLiveOdds(response);

      // Should handle null elapsed gracefully (returns undefined or null)
      expect(result.minute == null).toBe(true);
    });
  });
});

// ============================================
// Integration-style tests
// ============================================

describe('parseLiveOdds - Real-world scenarios', () => {
  it('should handle a typical live match with multiple O/U lines', () => {
    // Simulates a 70' minute match where main line has shifted to 2.25
    const response = createLiveOddsResponse([
      // Lower lines (already passed)
      { value: 'Over', odd: '1.10', handicap: '1.5' },
      { value: 'Under', odd: '6.50', handicap: '1.5' },
      { value: 'Over', odd: '1.35', handicap: '1.75' },
      { value: 'Under', odd: '3.20', handicap: '1.75' },
      { value: 'Over', odd: '1.65', handicap: '2.0' },
      { value: 'Under', odd: '2.25', handicap: '2.0' },
      // Main line (market focus)
      { value: 'Over', odd: '1.95', handicap: '2.25', main: true },
      { value: 'Under', odd: '1.85', handicap: '2.25', main: true },
      // Higher lines
      { value: 'Over', odd: '2.30', handicap: '2.5' },
      { value: 'Under', odd: '1.60', handicap: '2.5' },
      { value: 'Over', odd: '2.85', handicap: '2.75' },
      { value: 'Under', odd: '1.42', handicap: '2.75' },
      { value: 'Over', odd: '3.50', handicap: '3.0' },
      { value: 'Under', odd: '1.28', handicap: '3.0' },
      { value: 'Over', odd: '5.00', handicap: '3.5' },
      { value: 'Under', odd: '1.15', handicap: '3.5' },
    ]);

    const result = parseLiveOdds(response);

    // Main line detection
    expect(result.main_ou_line).toBe(2.25);
    expect(result.main_ou_over).toBe(1.95);
    expect(result.main_ou_under).toBe(1.85);

    // Fixed lines
    expect(result.over_1_5).toBe(1.10);
    expect(result.under_1_5).toBe(6.50);
    expect(result.over_2_5).toBe(2.30);
    expect(result.under_2_5).toBe(1.60);
    expect(result.over_3_5).toBe(5.00);
    expect(result.under_3_5).toBe(1.15);

    // All lines collected (8 lines total)
    expect(result.all_ou_lines.length).toBe(8);
    expect(result.all_ou_lines.map(l => l.line)).toEqual([1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.5]);

    // Main line marker
    const mainLineInfo = result.all_ou_lines.find(l => l.line === 2.25);
    expect(mainLineInfo?.isMain).toBe(true);
  });

  it('should handle early match scenario (0-0, main line at 2.5)', () => {
    const response = createLiveOddsResponse([
      { value: 'Over', odd: '1.65', handicap: '2.5', main: true },
      { value: 'Under', odd: '2.25', handicap: '2.5', main: true },
      { value: 'Over', odd: '1.30', handicap: '2.0' },
      { value: 'Under', odd: '3.40', handicap: '2.0' },
      { value: 'Over', odd: '2.10', handicap: '3.0' },
      { value: 'Under', odd: '1.72', handicap: '3.0' },
    ]);

    const result = parseLiveOdds(response);

    expect(result.main_ou_line).toBe(2.5);
    expect(result.main_ou_over).toBe(1.65);
  });

  it('should handle late match scenario (2-1, main line at 3.75)', () => {
    const response = createLiveOddsResponse([
      { value: 'Over', odd: '1.90', handicap: '3.75', main: true },
      { value: 'Under', odd: '1.90', handicap: '3.75', main: true },
      { value: 'Over', odd: '1.45', handicap: '3.5' },
      { value: 'Under', odd: '2.75', handicap: '3.5' },
      { value: 'Over', odd: '2.50', handicap: '4.0' },
      { value: 'Under', odd: '1.52', handicap: '4.0' },
    ]);

    const result = parseLiveOdds(response);

    expect(result.main_ou_line).toBe(3.75);
    expect(result.main_ou_over).toBe(1.90);
    expect(result.main_ou_under).toBe(1.90);

    // Fixed lines should be null (not available)
    expect(result.over_2_5).toBeNull();
    expect(result.under_2_5).toBeNull();
  });
});
