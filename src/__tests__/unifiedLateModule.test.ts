// ============================================
// Unified Late Module 测试
// ============================================

import { describe, it, expect } from 'vitest';
import {
  calculateUnifiedLateSignal,
  shouldTriggerLateModule,
  getLateModulePhase,
  getScenarioLabel,
  type ScenarioTag,
} from '../services/modules/unifiedLateModule';
import type { MatchStateInput, MarketStateInput } from '../types/unified-scoring';

// ============================================
// 测试数据工厂
// ============================================

function createMatchState(overrides: Partial<MatchStateInput> = {}): MatchStateInput {
  return {
    fixture_id: 12345,
    minute: 80,
    score_home: 1,
    score_away: 1,
    status: '2H',
    shots_home: 12,
    shots_away: 8,
    shots_on_home: 5,
    shots_on_away: 3,
    xg_home: 1.2,
    xg_away: 0.9,
    corners_home: 5,
    corners_away: 3,
    possession_home: 55,
    possession_away: 45,
    dangerous_home: 45,
    dangerous_away: 35,
    shots_last_15: 6,
    xg_last_15: 0.5,
    corners_last_15: 2,
    shots_prev_15: 4,
    xg_prev_15: 0.3,
    red_cards_home: 0,
    red_cards_away: 0,
    recent_goals: 0,
    recent_subs_attack: 2,
    stats_available: true,
    events_available: true,
    data_timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMarketState(overrides: Partial<MarketStateInput> = {}): MarketStateInput {
  return {
    fixture_id: 12345,
    over_odds: 1.75,
    under_odds: 2.05,
    ou_line: 2.5,
    ah_line: -0.5,
    ah_home: 1.90,
    ah_away: 1.95,
    win_home: 2.10,
    win_draw: 3.20,
    win_away: 3.40,
    over_odds_prev: 1.85,
    ah_line_prev: -0.5,
    bookmaker: 'bet365',
    is_live: true,
    captured_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================
// 工具函数测试
// ============================================

describe('晚期模块工具函数', () => {
  describe('shouldTriggerLateModule', () => {
    it('65分钟前不触发', () => {
      expect(shouldTriggerLateModule(64)).toBe(false);
      expect(shouldTriggerLateModule(50)).toBe(false);
      expect(shouldTriggerLateModule(30)).toBe(false);
    });

    it('65分钟及之后触发', () => {
      expect(shouldTriggerLateModule(65)).toBe(true);
      expect(shouldTriggerLateModule(80)).toBe(true);
      expect(shouldTriggerLateModule(90)).toBe(true);
    });
  });

  describe('getLateModulePhase', () => {
    it('正确识别各阶段', () => {
      expect(getLateModulePhase(60)).toBe('inactive');
      expect(getLateModulePhase(65)).toBe('warmup');
      expect(getLateModulePhase(75)).toBe('warmup');
      expect(getLateModulePhase(79)).toBe('warmup');
      expect(getLateModulePhase(80)).toBe('active');
      expect(getLateModulePhase(85)).toBe('active');
      expect(getLateModulePhase(92)).toBe('active');
    });
  });

  describe('getScenarioLabel', () => {
    it('返回正确的场景标签', () => {
      const scenarios: ScenarioTag[] = [
        'OVER_SPRINT',
        'STRONG_BEHIND',
        'DEADLOCK_BREAK',
        'WEAK_DEFEND',
        'BLOWOUT',
        'BALANCED_LATE',
      ];

      for (const scenario of scenarios) {
        const label = getScenarioLabel(scenario);
        expect(label).toHaveProperty('label');
        expect(label).toHaveProperty('color');
        expect(label).toHaveProperty('icon');
        expect(typeof label.label).toBe('string');
        expect(label.label.length).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================
// 信号计算测试
// ============================================

describe('calculateUnifiedLateSignal', () => {
  describe('基础信号生成', () => {
    it('返回正确结构', () => {
      const match = createMatchState();
      const signal = calculateUnifiedLateSignal(match);

      expect(signal).toHaveProperty('fixture_id');
      expect(signal).toHaveProperty('module', 'LATE');
      expect(signal).toHaveProperty('score');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('action');
      expect(signal).toHaveProperty('scenario_tag');
      expect(signal).toHaveProperty('is_warmup');
      expect(signal).toHaveProperty('poisson_goal_prob');
      expect(signal).toHaveProperty('score_breakdown');
      expect(signal).toHaveProperty('reasons');
    });

    it('分数和置信度在合理范围', () => {
      const match = createMatchState();
      const signal = calculateUnifiedLateSignal(match);

      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(100);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('预热模式 (65-79分钟)', () => {
    it('65-79分钟处于预热模式', () => {
      const match = createMatchState({ minute: 70 });
      const signal = calculateUnifiedLateSignal(match);

      expect(signal.is_warmup).toBe(true);
    });

    it('预热模式分数上限75', () => {
      const match = createMatchState({
        minute: 75,
        xg_home: 2.5,
        xg_away: 2.0,
        shots_home: 20,
        shots_away: 15,
        shots_last_15: 12,
      });
      const signal = calculateUnifiedLateSignal(match);

      expect(signal.score).toBeLessThanOrEqual(75);
    });

    it('预热模式最高行动为 WATCH', () => {
      const match = createMatchState({ minute: 75 });
      const market = createMarketState();
      const signal = calculateUnifiedLateSignal(match, market);

      expect(['WATCH', 'IGNORE']).toContain(signal.action);
      expect(signal.action).not.toBe('BET');
      expect(signal.action).not.toBe('PREPARE');
    });

    it('预热模式不生成下注计划', () => {
      const match = createMatchState({ minute: 72 });
      const market = createMarketState();
      const signal = calculateUnifiedLateSignal(match, market);

      expect(signal.bet_plan).toBeNull();
    });
  });

  describe('激活模式 (80+分钟)', () => {
    it('80分钟及之后为激活模式', () => {
      const match = createMatchState({ minute: 80 });
      const signal = calculateUnifiedLateSignal(match);

      expect(signal.is_warmup).toBe(false);
    });

    it('高分信号可触发 BET 行动', () => {
      const match = createMatchState({
        minute: 85,
        score_home: 0,
        score_away: 0,
        xg_home: 2.0,
        xg_away: 1.5,
        shots_home: 18,
        shots_away: 12,
        shots_on_home: 8,
        shots_on_away: 5,
        shots_last_15: 10,
        xg_last_15: 0.8,
      });
      const market = createMarketState({
        over_odds: 1.45,
        over_odds_prev: 1.60,
      });
      const signal = calculateUnifiedLateSignal(match, market);

      // 高活跃度 + 0-0 + 大球赔率下降 应该是强信号
      expect(signal.score).toBeGreaterThan(70);
    });
  });

  describe('场景检测', () => {
    it('检测大比分场景', () => {
      const match = createMatchState({
        minute: 80,
        score_home: 4,
        score_away: 1,
      });
      const signal = calculateUnifiedLateSignal(match);

      expect(signal.scenario_tag).toBe('BLOWOUT');
      expect(signal.action).toBe('IGNORE');
    });

    it('检测破僵局场景 (0-0)', () => {
      const match = createMatchState({
        minute: 82,
        score_home: 0,
        score_away: 0,
        xg_home: 1.2,
        xg_away: 0.8,
      });
      const signal = calculateUnifiedLateSignal(match);

      expect(signal.scenario_tag).toBe('DEADLOCK_BREAK');
    });

    it('检测大球冲刺场景 (高xG欠债)', () => {
      const match = createMatchState({
        minute: 80,
        score_home: 2,
        score_away: 1,
        xg_home: 2.5,
        xg_away: 2.0,
        shots_home: 22,
        shots_away: 18,
      });
      const signal = calculateUnifiedLateSignal(match);

      // xG 4.5 vs 实际 3 = 1.5 欠债, 且 totalGoals > 1 → OVER_SPRINT
      expect(signal.scenario_tag).toBe('OVER_SPRINT');
    });
  });

  describe('带盘口数据', () => {
    it('盘口数据提高置信度', () => {
      const match = createMatchState({ minute: 82 });

      const signalNoOdds = calculateUnifiedLateSignal(match, null);
      const signalWithOdds = calculateUnifiedLateSignal(match, createMarketState());

      expect(signalWithOdds.confidence).toBeGreaterThan(signalNoOdds.confidence);
    });

    it('大球赔率下降提高评分', () => {
      const match = createMatchState({ minute: 82 });

      const signalStable = calculateUnifiedLateSignal(match, createMarketState({
        over_odds: 1.80,
        over_odds_prev: 1.80,
      }));

      const signalDropping = calculateUnifiedLateSignal(match, createMarketState({
        over_odds: 1.50,
        over_odds_prev: 1.80,
      }));

      expect(signalDropping.score).toBeGreaterThan(signalStable.score);
    });
  });

  describe('泊松概率', () => {
    it('晚期高xG时泊松概率较高', () => {
      const match = createMatchState({
        minute: 85,
        xg_home: 2.5,
        xg_away: 2.0,
      });
      const signal = calculateUnifiedLateSignal(match);

      // 高 xG + 晚期 应该有较高的进球概率
      expect(signal.poisson_goal_prob).toBeGreaterThan(50);
    });
  });

  describe('评分细节', () => {
    it('包含所有评分组件', () => {
      const match = createMatchState();
      const signal = calculateUnifiedLateSignal(match);
      const breakdown = signal.score_breakdown;

      expect(breakdown).toHaveProperty('base');
      expect(breakdown).toHaveProperty('edge');
      expect(breakdown).toHaveProperty('timing');
      expect(breakdown).toHaveProperty('market');
      expect(breakdown).toHaveProperty('quality');

      // Edge 组件检查
      expect(breakdown.edge.components).toHaveProperty('pressure_index');
      expect(breakdown.edge.components).toHaveProperty('xg_velocity');
      expect(breakdown.edge.components).toHaveProperty('shot_quality');
      expect(breakdown.edge.components).toHaveProperty('strength_gap');
      expect(breakdown.edge.components).toHaveProperty('trailing_pressure');
      expect(breakdown.edge.components).toHaveProperty('scenario_bonus');
    });
  });
});

// ============================================
// 回归测试场景
// ============================================

describe('回归测试场景', () => {
  it('场景: 曼城落后1球，85分钟', () => {
    const match = createMatchState({
      minute: 85,
      score_home: 0,
      score_away: 1,
      xg_home: 1.8,
      xg_away: 0.6,
      shots_home: 18,
      shots_away: 6,
      shots_on_home: 7,
      shots_on_away: 2,
      shots_last_15: 8,
    });

    const teamStrength = {
      homeStrength: 90,
      awayStrength: 65,
      isHomeStrong: true,
      isAwayStrong: false,
      strengthGap: 25,
    };

    const market = createMarketState({
      ah_line: -1.5,
      over_odds: 1.55,
    });

    const signal = calculateUnifiedLateSignal(match, market, teamStrength);

    // 强队落后 + 大幅压制 + 晚期 = 强信号
    expect(signal.scenario_tag).toBe('STRONG_BEHIND');
    expect(signal.is_warmup).toBe(false);
    expect(signal.score).toBeGreaterThan(70);
  });

  it('场景: 0-0 僵局，88分钟', () => {
    const match = createMatchState({
      minute: 88,
      score_home: 0,
      score_away: 0,
      xg_home: 1.5,
      xg_away: 1.2,
      shots_home: 14,
      shots_away: 12,
      shots_last_15: 10,
    });

    const signal = calculateUnifiedLateSignal(match);

    expect(signal.scenario_tag).toBe('DEADLOCK_BREAK');
    expect(signal.score).toBeGreaterThan(65);
    expect(signal.reasons.tags).toContain('SCORELESS');
  });

  it('场景: 已4-0大胜，80分钟', () => {
    const match = createMatchState({
      minute: 80,
      score_home: 4,
      score_away: 0,
    });

    const signal = calculateUnifiedLateSignal(match);

    expect(signal.scenario_tag).toBe('BLOWOUT');
    expect(signal.action).toBe('IGNORE');
  });
});
