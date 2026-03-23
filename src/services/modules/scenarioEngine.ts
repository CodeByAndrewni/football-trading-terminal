/**
 * 20 情景多模型策略评估引擎
 *
 * 每个情景函数接收 AdvancedMatch，返回 ScenarioSignal。
 * evaluateAllScenarios() 批量执行全部 20 个，返回活跃信号列表。
 *
 * 与 unifiedLateModule / moduleA 并行运行，不替换。
 */

import type { AdvancedMatch } from '../../data/advancedMockData';
import {
  type ScenarioId,
  type ScenarioCategory,
  type DataTier,
  SCENARIO_META,
  SCENARIO_THRESHOLDS,
} from '../../config/scenarioConfig';

// ============================================
// 信号类型
// ============================================

export interface ScenarioSignal {
  id: ScenarioId;
  label: string;
  emoji: string;
  category: ScenarioCategory;
  tier: DataTier;
  score: number;       // 0-100
  active: boolean;     // score >= ACTIVE_SCORE
  reasons: string[];
}

// ============================================
// 辅助函数
// ============================================

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function signal(id: ScenarioId, score: number, reasons: string[]): ScenarioSignal {
  const meta = SCENARIO_META[id];
  return {
    id,
    label: meta.label,
    emoji: meta.emoji,
    category: meta.category,
    tier: meta.tier,
    score: clamp(Math.round(score)),
    active: Math.round(score) >= SCENARIO_THRESHOLDS.ACTIVE_SCORE,
    reasons,
  };
}

function inactive(id: ScenarioId): ScenarioSignal {
  return signal(id, 0, []);
}

/** 判断让球方：hdp < 0 表示主队让球 */
function getFavSide(m: AdvancedMatch): 'home' | 'away' | null {
  const hdp = m.initialHandicap ?? m.odds?.handicap?.value ?? null;
  if (typeof hdp !== 'number') return null;
  if (hdp < -0.25) return 'home';
  if (hdp > 0.25) return 'away';
  return null;
}

function totalGoals(m: AdvancedMatch): number {
  return (m.home?.score ?? 0) + (m.away?.score ?? 0);
}

function scoreDiff(m: AdvancedMatch): number {
  return (m.home?.score ?? 0) - (m.away?.score ?? 0);
}

function totalShots(m: AdvancedMatch): number {
  return (m.stats?.shots?.home ?? 0) + (m.stats?.shots?.away ?? 0);
}

function totalXG(m: AdvancedMatch): number {
  return (m.stats?.xG?.home ?? 0) + (m.stats?.xG?.away ?? 0);
}

function totalCorners(m: AdvancedMatch): number {
  return (m.stats?.corners?.home ?? 0) + (m.stats?.corners?.away ?? 0);
}

function totalDangerousAttacks(m: AdvancedMatch): number {
  return (m.stats?.dangerousAttacks?.home ?? 0) + (m.stats?.dangerousAttacks?.away ?? 0);
}

function hasRealStats(m: AdvancedMatch): boolean {
  return m.stats?._realDataAvailable === true;
}

function sideScore(m: AdvancedMatch, side: 'home' | 'away'): number {
  return side === 'home' ? (m.home?.score ?? 0) : (m.away?.score ?? 0);
}

function sideShots(m: AdvancedMatch, side: 'home' | 'away'): number {
  return side === 'home' ? (m.stats?.shots?.home ?? 0) : (m.stats?.shots?.away ?? 0);
}

function sideXG(m: AdvancedMatch, side: 'home' | 'away'): number {
  return side === 'home' ? (m.stats?.xG?.home ?? 0) : (m.stats?.xG?.away ?? 0);
}

function sidePossession(m: AdvancedMatch, side: 'home' | 'away'): number {
  return side === 'home' ? (m.stats?.possession?.home ?? 50) : (m.stats?.possession?.away ?? 50);
}

function sideDangerousAttacks(m: AdvancedMatch, side: 'home' | 'away'): number {
  return side === 'home' ? (m.stats?.dangerousAttacks?.home ?? 0) : (m.stats?.dangerousAttacks?.away ?? 0);
}

function sideCorners(m: AdvancedMatch, side: 'home' | 'away'): number {
  return side === 'home' ? (m.stats?.corners?.home ?? 0) : (m.stats?.corners?.away ?? 0);
}

function sideFouls(m: AdvancedMatch, side: 'home' | 'away'): number {
  return side === 'home' ? (m.stats?.fouls?.home ?? 0) : (m.stats?.fouls?.away ?? 0);
}

function other(side: 'home' | 'away'): 'home' | 'away' {
  return side === 'home' ? 'away' : 'home';
}

// ============================================
// S01 ~ S10: 比赛状态类
// ============================================

function s01_strongFavChasing(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S01_STRONG_FAV_CHASING';
  if (m.minute < 75) return inactive(id);

  const fav = getFavSide(m);
  if (!fav) return inactive(id);
  const dog = other(fav);

  const favScore = sideScore(m, fav);
  const dogScore = sideScore(m, dog);
  const diff = favScore - dogScore;
  if (diff > 0 || diff < -1) return inactive(id);

  let score = 30;
  const reasons: string[] = [];

  // 场面优势
  if (sideShots(m, fav) >= sideShots(m, dog) * 1.2 && sideShots(m, fav) >= 8) {
    score += 15; reasons.push('射门优势');
  }
  if (sideXG(m, fav) >= sideXG(m, dog) * 1.2 && sideXG(m, fav) >= 1.0) {
    score += 15; reasons.push('xG 优势');
  }
  if (sideDangerousAttacks(m, fav) >= sideDangerousAttacks(m, dog)) {
    score += 10; reasons.push('危险进攻主导');
  }
  if (sidePossession(m, fav) >= 55) {
    score += 5; reasons.push('控球优势');
  }

  // 动机
  if (m.needsWinProxy === fav || m.needsWinProxy === 'both') {
    score += 10; reasons.push('争胜压力');
  }

  // 时间加成
  if (m.minute >= 85) score += 5;

  // 红牌降级
  const favRed = fav === 'home' ? (m.cards?.red?.home ?? 0) : (m.cards?.red?.away ?? 0);
  const dogRed = dog === 'home' ? (m.cards?.red?.home ?? 0) : (m.cards?.red?.away ?? 0);
  if (favRed > dogRed) { score -= 15; reasons.push('强队少人'); }

  return signal(id, score, reasons);
}

function s02_drawBothNeedWin(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S02_DRAW_BOTH_NEED_WIN';
  if (m.minute < 80 || scoreDiff(m) !== 0) return inactive(id);

  let score = 25;
  const reasons: string[] = [];

  if (m.needsWinProxy === 'both') {
    score += 30; reasons.push('双方都有争胜压力');
  } else if (m.needsWinProxy) {
    score += 15; reasons.push(`${m.needsWinProxy === 'home' ? '主队' : '客队'}有争胜压力`);
  }

  if (totalShots(m) >= 15) { score += 10; reasons.push('场面活跃'); }
  if (totalDangerousAttacks(m) >= 30) { score += 10; reasons.push('危险进攻多'); }
  if (m.minute >= 85) score += 10;

  return signal(id, score, reasons);
}

function s03_homeLastGasp(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S03_HOME_LAST_GASP';
  if (m.minute < 85) return inactive(id);

  const hScore = m.home?.score ?? 0;
  const aScore = m.away?.score ?? 0;
  if (hScore > aScore) return inactive(id);

  let score = 30;
  const reasons: string[] = [];

  if (sideShots(m, 'home') > sideShots(m, 'away')) {
    score += 15; reasons.push('主队射门更多');
  }
  if (sidePossession(m, 'home') >= 55) {
    score += 10; reasons.push('主队控球优势');
  }
  if (sideDangerousAttacks(m, 'home') > sideDangerousAttacks(m, 'away')) {
    score += 10; reasons.push('主队危险进攻主导');
  }
  if (sideCorners(m, 'home') > sideCorners(m, 'away') + 2) {
    score += 10; reasons.push('主队角球优势');
  }
  if (m.needsWinProxy === 'home' || m.needsWinProxy === 'both') {
    score += 10; reasons.push('主队有争胜压力');
  }

  return signal(id, score, reasons);
}

function s04_highScoreSeesaw(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S04_HIGH_SCORE_SEESAW';
  if (m.minute < 75) return inactive(id);

  const goals = totalGoals(m);
  const diff = Math.abs(scoreDiff(m));
  if (goals < 4 || diff > 1) return inactive(id);

  let score = 40;
  const reasons: string[] = [`总进球 ${goals}`];

  if (diff === 0) { score += 15; reasons.push('比分持平'); }
  if (totalShots(m) >= 20) { score += 10; reasons.push('射门活跃'); }
  if (totalXG(m) >= 3) { score += 10; reasons.push('xG 高'); }
  if (m.minute >= 85) score += 10;

  return signal(id, score, reasons);
}

function s05_1hGoals2hQuiet(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S05_1H_GOALS_2H_QUIET';
  if (m.minute < 75 || m.minute > 90) return inactive(id);

  const ht = m.halftimeScore;
  if (!ht) return inactive(id);
  const htGoals = (ht.home ?? 0) + (ht.away ?? 0);
  if (htGoals < 2) return inactive(id);

  const goalsIn2h = totalGoals(m) - htGoals;
  if (goalsIn2h > 0) return inactive(id);

  let score = 35;
  const reasons: string[] = [`半场 ${htGoals} 球，下半场 0 球`];

  if (totalShots(m) >= 15) { score += 15; reasons.push('射门仍活跃'); }
  if (totalXG(m) > totalGoals(m) + 0.5) { score += 15; reasons.push('xG 欠债'); }
  if (totalDangerousAttacks(m) >= 25) { score += 10; reasons.push('危险进攻持续'); }

  return signal(id, score, reasons);
}

function s06_prematchOverUnmet(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S06_PREMATCH_OVER_UNMET';
  if (m.minute < 75 || m.minute > 90) return inactive(id);

  const initOU = m.initialOverUnder;
  if (typeof initOU !== 'number' || initOU < 2.5) return inactive(id);

  const goals = totalGoals(m);
  if (goals >= Math.floor(initOU)) return inactive(id);

  let score = 25;
  const reasons: string[] = [`赛前 O/U ${initOU}，当前 ${goals} 球`];

  if (initOU >= 3.5) { score += 10; reasons.push('强烈大球预期'); }
  if (totalShots(m) >= 15) { score += 15; reasons.push('射门活跃'); }
  if (totalXG(m) >= 2.0) { score += 15; reasons.push('xG 支撑'); }
  if (totalDangerousAttacks(m) >= 30) { score += 10; reasons.push('场面未死'); }

  return signal(id, score, reasons);
}

function s07_parkBusEqualized(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S07_PARK_BUS_EQUALIZED';
  if (m.minute < 75) return inactive(id);

  const diff = scoreDiff(m);
  if (Math.abs(diff) !== 1) return inactive(id);

  const leading: 'home' | 'away' = diff > 0 ? 'home' : 'away';
  const trailing = other(leading);

  // 领先方"摆大巴"特征：控球低、射门少、角球少
  if (sidePossession(m, leading) > 40) return inactive(id);

  let score = 30;
  const reasons: string[] = [];

  if (sideShots(m, trailing) >= sideShots(m, leading) * 2) {
    score += 15; reasons.push('落后方射门碾压');
  }
  if (sidePossession(m, trailing) >= 60) {
    score += 10; reasons.push('落后方控球 60%+');
  }
  if (sideDangerousAttacks(m, trailing) >= sideDangerousAttacks(m, leading) * 1.5) {
    score += 15; reasons.push('危险进攻碾压');
  }
  if (sideCorners(m, trailing) > sideCorners(m, leading) + 3) {
    score += 10; reasons.push('角球优势大');
  }

  return signal(id, score, reasons);
}

function s08_redCardShift(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S08_RED_CARD_SHIFT';
  if (m.minute < 70) return inactive(id);

  const redHome = m.cards?.red?.home ?? 0;
  const redAway = m.cards?.red?.away ?? 0;
  if (redHome + redAway === 0) return inactive(id);

  let score = 30;
  const reasons: string[] = [`红牌: 主${redHome} 客${redAway}`];

  // 少人一方领先 → 另一方更可能追分
  const diff = scoreDiff(m);
  if (redHome > redAway && diff > 0) {
    score += 20; reasons.push('少人方领先，被追平概率大');
  } else if (redAway > redHome && diff < 0) {
    score += 20; reasons.push('少人方领先，被追平概率大');
  }

  // VAR 事件加成
  const varEvents = (m.events ?? []).filter(e => e.type === 'Var');
  if (varEvents.length > 0) {
    score += 10; reasons.push('有 VAR 判罚');
  }

  if (m.minute >= 80) score += 10;

  return signal(id, score, reasons);
}

function s09_cupMustScore(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S09_CUP_MUST_SCORE';
  if (m.minute < 75) return inactive(id);

  const round = (m.round ?? '').toLowerCase();
  const isCup = round.includes('round') || round.includes('leg') ||
                round.includes('final') || round.includes('semi') ||
                round.includes('quarter') || round.includes('knockout');
  if (!isCup) return inactive(id);

  let score = 30;
  const reasons: string[] = ['杯赛/淘汰赛'];

  const diff = scoreDiff(m);
  if (diff === 0) { score += 15; reasons.push('比分打平'); }
  else if (Math.abs(diff) === 1) { score += 10; reasons.push('仅差 1 球'); }

  if (totalShots(m) >= 12) { score += 10; reasons.push('射门活跃'); }
  if (m.minute >= 85) score += 10;

  return signal(id, score, reasons);
}

function s10_weakBesieged(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S10_WEAK_BESIEGED';
  if (m.minute < 70) return inactive(id);

  const fav = getFavSide(m);
  if (!fav) return inactive(id);
  const dog = other(fav);

  if (sideScore(m, dog) <= sideScore(m, fav)) return inactive(id);

  let score = 30;
  const reasons: string[] = ['弱队领先'];

  if (sideShots(m, fav) >= sideShots(m, dog) * 1.5) {
    score += 15; reasons.push('强队射门碾压');
  }
  if (sidePossession(m, fav) >= 60) {
    score += 10; reasons.push('强队控球 60%+');
  }
  if (sideDangerousAttacks(m, fav) >= sideDangerousAttacks(m, dog) * 1.5) {
    score += 15; reasons.push('强队危险进攻碾压');
  }
  if (sideCorners(m, fav) > sideCorners(m, dog) + 3) {
    score += 10; reasons.push('角球优势');
  }
  if (m.minute >= 80) score += 5;

  return signal(id, score, reasons);
}

// ============================================
// S11 ~ S16: 场面/体能类
// ============================================

function s11_strong2hTakeover(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S11_STRONG_2H_TAKEOVER';
  if (m.minute < 70 || m.minute > 90) return inactive(id);

  const ht = m.halftimeScore;
  if (!ht) return inactive(id);
  const htDiff = (ht.home ?? 0) - (ht.away ?? 0);
  if (Math.abs(htDiff) > 1) return inactive(id);

  const fav = getFavSide(m);
  if (!fav) return inactive(id);

  let score = 25;
  const reasons: string[] = [];

  // 全场场面远超对手 → 推测下半场接管
  if (sideShots(m, fav) >= sideShots(m, other(fav)) * 1.5 && sideShots(m, fav) >= 10) {
    score += 20; reasons.push('射门全面压制');
  }
  if (sideXG(m, fav) >= sideXG(m, other(fav)) + 0.8) {
    score += 15; reasons.push('xG 明显占优');
  }
  if (sideDangerousAttacks(m, fav) >= sideDangerousAttacks(m, other(fav)) * 1.3) {
    score += 10; reasons.push('危险进攻占优');
  }

  // halfStatsDelta 作为节奏加成
  if (m.halfStatsDelta && m.halfStatsDelta.shotsDelta > 0) {
    score += 10; reasons.push('下半场射门增长');
  }

  return signal(id, score, reasons);
}

function s12_weakFatigue(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S12_WEAK_FATIGUE';
  if (m.minute < 75 || m.minute > 90) return inactive(id);

  const fav = getFavSide(m);
  if (!fav) return inactive(id);
  const dog = other(fav);

  let score = 20;
  const reasons: string[] = [];

  // 弱队犯规多 → 体能/心理代理
  const dogFouls = sideFouls(m, dog);
  const favFouls = sideFouls(m, fav);
  if (dogFouls >= favFouls + 3 && dogFouls >= 10) {
    score += 20; reasons.push('弱队犯规远超强队');
  }

  // 弱队黄牌多
  const dogYellow = dog === 'home' ? (m.cards?.yellow?.home ?? 0) : (m.cards?.yellow?.away ?? 0);
  if (dogYellow >= 3) { score += 15; reasons.push('弱队黄牌多'); }

  // 强队射门优势
  if (sideShots(m, fav) >= sideShots(m, dog) * 1.5) {
    score += 15; reasons.push('强队射门碾压');
  }

  // 强队控球优势
  if (sidePossession(m, fav) >= 60) {
    score += 10; reasons.push('强队控球高');
  }

  return signal(id, score, reasons);
}

function s13_superSubImpact(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S13_SUPER_SUB_IMPACT';
  if (m.minute < 70 || m.minute > 90) return inactive(id);

  const attackSubs = m.subsAfter70Attack ?? 0;
  if (attackSubs < 1) return inactive(id);

  const fav = getFavSide(m);

  let score = 25;
  const reasons: string[] = [`70' 后攻击型换人 ${attackSubs} 次`];

  if (attackSubs >= 2) { score += 15; reasons.push('多人攻击型换人'); }

  // 如果是强队换人 + 场面占优
  if (fav) {
    if (sideShots(m, fav) > sideShots(m, other(fav))) {
      score += 10; reasons.push('换人后强队射门更多');
    }
    if (sideDangerousAttacks(m, fav) > sideDangerousAttacks(m, other(fav))) {
      score += 10; reasons.push('换人后进攻压力增大');
    }
  }

  if (totalShots(m) >= 15) { score += 10; reasons.push('场面活跃'); }

  return signal(id, score, reasons);
}

function s14_cornerSetPiecePile(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S14_CORNER_SET_PIECE_PILE';
  if (m.minute < 80) return inactive(id);

  const hCorners = m.stats?.corners?.home ?? 0;
  const aCorners = m.stats?.corners?.away ?? 0;
  const cornerDiff = Math.abs(hCorners - aCorners);
  const corners = hCorners + aCorners;

  if (corners < 8) return inactive(id);

  let score = 25;
  const reasons: string[] = [`角球 ${hCorners}-${aCorners}`];

  if (cornerDiff >= 4) { score += 15; reasons.push('角球严重不对称'); }
  if (corners >= 12) { score += 15; reasons.push('总角球 12+'); }
  if (corners >= 10) { score += 10; reasons.push('总角球 10+'); }
  if (m.minute >= 85) score += 10;

  // 角球多的一方还在施压
  const pressing = hCorners > aCorners ? 'home' : 'away';
  if (sideDangerousAttacks(m, pressing) > sideDangerousAttacks(m, other(pressing))) {
    score += 10; reasons.push('角球多方仍在进攻');
  }

  return signal(id, score, reasons);
}

function s15_2hTempoRise(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S15_2H_TEMPO_RISE';
  if (m.minute < 70 || m.minute > 90) return inactive(id);

  const ht = m.halftimeScore;
  if (!ht) return inactive(id);
  const htGoals = (ht.home ?? 0) + (ht.away ?? 0);
  const goals2h = totalGoals(m) - htGoals;

  let score = 20;
  const reasons: string[] = [];

  // 下半场进球比上半场多
  if (goals2h > htGoals) {
    score += 20; reasons.push(`下半场 ${goals2h} 球 > 上半场 ${htGoals} 球`);
  }

  // 使用 halfStatsDelta
  if (m.halfStatsDelta) {
    if (m.halfStatsDelta.shotsDelta > 0) {
      score += 15; reasons.push('下半场射门节奏提升');
    }
    if (m.halfStatsDelta.cornersDelta > 0) {
      score += 10; reasons.push('下半场角球增加');
    }
  }

  if (totalShots(m) >= 20) { score += 10; reasons.push('射门总量高'); }
  if (totalDangerousAttacks(m) >= 35) { score += 10; reasons.push('危险进攻频繁'); }

  return signal(id, score, reasons);
}

function s16_longStoppageChaos(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S16_LONG_STOPPAGE_CHAOS';
  if (m.minute < 90) return inactive(id);

  const addedTime = m.stoppageTimeAnnounced ?? m.extraMinute ?? 0;
  if (addedTime < 5) return inactive(id);

  const diff = Math.abs(scoreDiff(m));
  if (diff > 1) return inactive(id);

  let score = 35;
  const reasons: string[] = [`补时 ${addedTime} 分钟`];

  if (addedTime >= 8) { score += 15; reasons.push('超长补时'); }
  if (diff === 0) { score += 10; reasons.push('比分持平'); }
  if (totalShots(m) >= 15) { score += 10; reasons.push('场面活跃'); }

  // 红牌/VAR 加成混乱度
  const totalRed = (m.cards?.red?.home ?? 0) + (m.cards?.red?.away ?? 0);
  if (totalRed >= 1) { score += 10; reasons.push('有红牌'); }

  return signal(id, score, reasons);
}

// ============================================
// S17 ~ S20: 补时/心理/价格类
// ============================================

function s17_mentalCollapse(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S17_MENTAL_COLLAPSE';
  if (m.minute < 80) return inactive(id);

  let score = 15;
  const reasons: string[] = [];

  // 高犯规 + 多黄牌 = 心理波动信号
  const totalFouls = (m.stats?.fouls?.home ?? 0) + (m.stats?.fouls?.away ?? 0);
  const totalYellow = (m.cards?.yellow?.home ?? 0) + (m.cards?.yellow?.away ?? 0);
  const totalRed = (m.cards?.red?.home ?? 0) + (m.cards?.red?.away ?? 0);

  if (totalFouls >= 25) { score += 15; reasons.push('犯规频繁'); }
  if (totalYellow >= 5) { score += 15; reasons.push('黄牌多'); }
  if (totalRed >= 1) { score += 15; reasons.push('有红牌'); }

  // VAR 争议
  const varEvents = (m.events ?? []).filter(e => e.type === 'Var');
  if (varEvents.length >= 1) { score += 10; reasons.push('VAR 争议'); }

  // 比分接近 → 心态更紧张
  if (Math.abs(scoreDiff(m)) <= 1) { score += 10; reasons.push('比分胶着'); }

  return signal(id, score, reasons);
}

function s18_priceMismatch(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S18_PRICE_MISMATCH';
  if (m.minute < 80 || m.minute > 90) return inactive(id);
  if (!hasRealStats(m)) return inactive(id);

  // 简单经验版：over 赔率偏高 + 场面热
  const overOdds = m.odds?.overUnder?.over ?? null;
  if (typeof overOdds !== 'number' || overOdds < 2.0) return inactive(id);

  let score = 20;
  const reasons: string[] = [`Over 赔率 ${overOdds.toFixed(2)}`];

  if (overOdds >= 3.0) { score += 15; reasons.push('赔率极高'); }
  else if (overOdds >= 2.5) { score += 10; reasons.push('赔率偏高'); }

  if (totalShots(m) >= 15) { score += 15; reasons.push('射门活跃'); }
  if (totalXG(m) >= 2.0) { score += 15; reasons.push('xG 高'); }
  if (totalDangerousAttacks(m) >= 30) { score += 10; reasons.push('危险进攻多'); }

  return signal(id, score, reasons);
}

function s19_80minPriceWindow(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S19_80MIN_PRICE_WINDOW';
  if (m.minute < 80 || m.minute > 88) return inactive(id);

  const goals = totalGoals(m);
  const diff = Math.abs(scoreDiff(m));
  if (goals > 3 || diff > 1) return inactive(id);

  const overOdds = m.odds?.overUnder?.over ?? null;
  if (typeof overOdds !== 'number') return inactive(id);

  let score = 20;
  const reasons: string[] = [];

  // 赔率 2.0~2.5 是典型"价格窗口"
  if (overOdds >= 2.0 && overOdds <= 3.0) {
    score += 15; reasons.push(`Over 赔率 ${overOdds.toFixed(2)}，在窗口区间`);
  }

  if (totalShots(m) >= 12) { score += 10; reasons.push('射门 12+'); }
  if (totalDangerousAttacks(m) >= 25) { score += 10; reasons.push('危险进攻 25+'); }
  if (sidePossession(m, 'home') > 55 || sidePossession(m, 'away') > 55) {
    score += 10; reasons.push('一方控球优势');
  }

  // 半场有进球说明比赛不沉闷
  const ht = m.halftimeScore;
  if (ht && ((ht.home ?? 0) + (ht.away ?? 0)) >= 1) {
    score += 5; reasons.push('半场有进球');
  }

  return signal(id, score, reasons);
}

function s20_btts2h(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S20_BTTS_2H';
  if (m.minute < 75 || m.minute > 90) return inactive(id);

  const ht = m.halftimeScore;
  if (!ht) return inactive(id);

  let score = 20;
  const reasons: string[] = [];

  // 上半场双方都有进球 → 比赛开放
  if ((ht.home ?? 0) >= 1 && (ht.away ?? 0) >= 1) {
    score += 20; reasons.push('上半场双方都进球');
  } else if ((ht.home ?? 0) + (ht.away ?? 0) >= 1) {
    score += 10; reasons.push('上半场有进球');
  }

  // 双方都有射门
  if (sideShots(m, 'home') >= 5 && sideShots(m, 'away') >= 5) {
    score += 10; reasons.push('双方射门均衡');
  }

  // 双方 xG 都不低
  if (sideXG(m, 'home') >= 0.5 && sideXG(m, 'away') >= 0.5) {
    score += 15; reasons.push('双方 xG 都有');
  }

  // BTTS 赔率加成
  const bttsYes = m.odds?.bothTeamsScore?.yes ?? null;
  if (typeof bttsYes === 'number' && bttsYes >= 1.8) {
    score += 10; reasons.push(`BTTS Yes 赔率 ${bttsYes.toFixed(2)}`);
  }

  return signal(id, score, reasons);
}

// ============================================
// 聚合入口
// ============================================

const ALL_EVALUATORS: Array<(m: AdvancedMatch) => ScenarioSignal> = [
  s01_strongFavChasing,
  s02_drawBothNeedWin,
  s03_homeLastGasp,
  s04_highScoreSeesaw,
  s05_1hGoals2hQuiet,
  s06_prematchOverUnmet,
  s07_parkBusEqualized,
  s08_redCardShift,
  s09_cupMustScore,
  s10_weakBesieged,
  s11_strong2hTakeover,
  s12_weakFatigue,
  s13_superSubImpact,
  s14_cornerSetPiecePile,
  s15_2hTempoRise,
  s16_longStoppageChaos,
  s17_mentalCollapse,
  s18_priceMismatch,
  s19_80minPriceWindow,
  s20_btts2h,
];

/**
 * 对单场比赛运行全部 20 个情景，返回所有信号（含不活跃的）
 */
export function evaluateAllScenarios(match: AdvancedMatch): ScenarioSignal[] {
  return ALL_EVALUATORS.map(fn => fn(match));
}

/**
 * 仅返回活跃的情景信号，按 score 降序
 */
export function getActiveScenarios(match: AdvancedMatch): ScenarioSignal[] {
  return evaluateAllScenarios(match)
    .filter(s => s.active)
    .sort((a, b) => b.score - a.score);
}

/**
 * 批量评估多场比赛
 */
export function batchEvaluateScenarios(
  matches: AdvancedMatch[]
): Map<number, ScenarioSignal[]> {
  const result = new Map<number, ScenarioSignal[]>();
  for (const m of matches) {
    result.set(m.id, getActiveScenarios(m));
  }
  return result;
}
