/**
 * 情景引擎 + 复合信号 + Paper Trade 规则 — 后端自包含版本
 *
 * 把 src/ 下散落在 scenarioConfig / scenarioEngine / compositeSignal / paperTradeConfig
 * 的「运行时代码」全部内联到这里，避免 Vercel bundler 追踪不到 src/ 模块的问题。
 *
 * 类型仍然用 import type 从 src/ 导入（编译后擦除，安全）。
 */

import type { AdvancedMatch, MatchEvent } from '../../src/data/advancedMockData';

// ============================================================
// scenarioConfig 内联
// ============================================================

export type ScenarioId =
  | 'S01_STRONG_FAV_CHASING' | 'S02_DRAW_BOTH_NEED_WIN' | 'S03_HOME_LAST_GASP'
  | 'S04_HIGH_SCORE_SEESAW'  | 'S05_1H_GOALS_2H_QUIET'  | 'S06_PREMATCH_OVER_UNMET'
  | 'S07_PARK_BUS_EQUALIZED' | 'S08_RED_CARD_SHIFT'      | 'S09_CUP_MUST_SCORE'
  | 'S10_WEAK_BESIEGED'      | 'S11_STRONG_2H_TAKEOVER'  | 'S12_WEAK_FATIGUE'
  | 'S13_SUPER_SUB_IMPACT'   | 'S14_CORNER_SET_PIECE_PILE' | 'S15_2H_TEMPO_RISE'
  | 'S16_LONG_STOPPAGE_CHAOS' | 'S17_MENTAL_COLLAPSE'    | 'S18_PRICE_MISMATCH'
  | 'S19_80MIN_PRICE_WINDOW' | 'S20_BTTS_2H';

export type ScenarioCategory = 'match_state' | 'momentum' | 'price_psychology';
export type DataTier = 'A' | 'B' | 'C';

interface ScenarioMeta { id: ScenarioId; label: string; emoji: string; category: ScenarioCategory; tier: DataTier; minuteRange: [number, number]; desc: string; }

const SCENARIO_META: Record<ScenarioId, ScenarioMeta> = {
  S01_STRONG_FAV_CHASING:   { id: 'S01_STRONG_FAV_CHASING',   label: '强队追分绝杀', emoji: '🔥', category: 'match_state', tier: 'A', minuteRange: [75, 95], desc: '' },
  S02_DRAW_BOTH_NEED_WIN:   { id: 'S02_DRAW_BOTH_NEED_WIN',   label: '平局+双方抢3分', emoji: '⚔️', category: 'match_state', tier: 'B', minuteRange: [80, 95], desc: '' },
  S03_HOME_LAST_GASP:       { id: 'S03_HOME_LAST_GASP',       label: '主场压哨绝杀', emoji: '🏟️', category: 'match_state', tier: 'A', minuteRange: [85, 95], desc: '' },
  S04_HIGH_SCORE_SEESAW:    { id: 'S04_HIGH_SCORE_SEESAW',    label: '高比分拉锯', emoji: '🎢', category: 'match_state', tier: 'A', minuteRange: [75, 95], desc: '' },
  S05_1H_GOALS_2H_QUIET:    { id: 'S05_1H_GOALS_2H_QUIET',    label: '上半场大球下半场闷', emoji: '⏳', category: 'match_state', tier: 'A', minuteRange: [75, 90], desc: '' },
  S06_PREMATCH_OVER_UNMET:  { id: 'S06_PREMATCH_OVER_UNMET',  label: '赛前大球未兑现', emoji: '📊', category: 'match_state', tier: 'B', minuteRange: [75, 90], desc: '' },
  S07_PARK_BUS_EQUALIZED:   { id: 'S07_PARK_BUS_EQUALIZED',   label: '摆大巴被绝平', emoji: '🚌', category: 'match_state', tier: 'A', minuteRange: [75, 95], desc: '' },
  S08_RED_CARD_SHIFT:       { id: 'S08_RED_CARD_SHIFT',       label: '红牌翻盘', emoji: '🟥', category: 'match_state', tier: 'A', minuteRange: [70, 95], desc: '' },
  S09_CUP_MUST_SCORE:       { id: 'S09_CUP_MUST_SCORE',       label: '杯赛必进球', emoji: '🏆', category: 'match_state', tier: 'B', minuteRange: [75, 95], desc: '' },
  S10_WEAK_BESIEGED:        { id: 'S10_WEAK_BESIEGED',        label: '弱队被围殴', emoji: '🛡️', category: 'match_state', tier: 'A', minuteRange: [70, 95], desc: '' },
  S11_STRONG_2H_TAKEOVER:   { id: 'S11_STRONG_2H_TAKEOVER',   label: '下半场强队接管', emoji: '💪', category: 'momentum',    tier: 'A', minuteRange: [70, 90], desc: '' },
  S12_WEAK_FATIGUE:         { id: 'S12_WEAK_FATIGUE',         label: '弱队体能崩盘', emoji: '😰', category: 'momentum',    tier: 'B', minuteRange: [75, 90], desc: '' },
  S13_SUPER_SUB_IMPACT:     { id: 'S13_SUPER_SUB_IMPACT',     label: '替补碾压', emoji: '🔄', category: 'momentum',    tier: 'B', minuteRange: [70, 90], desc: '' },
  S14_CORNER_SET_PIECE_PILE: { id: 'S14_CORNER_SET_PIECE_PILE', label: '角球定位球堆积', emoji: '🚩', category: 'momentum',    tier: 'A', minuteRange: [80, 95], desc: '' },
  S15_2H_TEMPO_RISE:        { id: 'S15_2H_TEMPO_RISE',        label: '下半场节奏飙升', emoji: '📈', category: 'momentum',    tier: 'A', minuteRange: [70, 90], desc: '' },
  S16_LONG_STOPPAGE_CHAOS:  { id: 'S16_LONG_STOPPAGE_CHAOS',  label: '长补时混乱', emoji: '⏱️', category: 'momentum',    tier: 'C', minuteRange: [90, 100], desc: '' },
  S17_MENTAL_COLLAPSE:      { id: 'S17_MENTAL_COLLAPSE',      label: '心态崩盘', emoji: '😤', category: 'price_psychology', tier: 'C', minuteRange: [80, 95], desc: '' },
  S18_PRICE_MISMATCH:       { id: 'S18_PRICE_MISMATCH',       label: '价格错配绝杀', emoji: '💰', category: 'price_psychology', tier: 'C', minuteRange: [80, 90], desc: '' },
  S19_80MIN_PRICE_WINDOW:   { id: 'S19_80MIN_PRICE_WINDOW',   label: '80\'价格窗口', emoji: '🪟', category: 'price_psychology', tier: 'C', minuteRange: [80, 88], desc: '' },
  S20_BTTS_2H:              { id: 'S20_BTTS_2H',              label: 'BTTS下半场型', emoji: '⚽', category: 'price_psychology', tier: 'A', minuteRange: [75, 90], desc: '' },
};

const SCENARIO_THRESHOLDS = {
  ACTIVE_SCORE: 50,
  COMPOSITE: { HIGH: 75, MEDIUM: 55, LOW: 35 },
  TIER_WEIGHT: { A: 1.0, B: 0.8, C: 0.6 } as const,
} as const;

// ============================================================
// ScenarioSignal 类型
// ============================================================

export interface ScenarioSignal {
  id: ScenarioId;
  label: string;
  emoji: string;
  category: ScenarioCategory;
  tier: DataTier;
  score: number;
  active: boolean;
  reasons: string[];
}

// ============================================================
// 辅助函数
// ============================================================

function clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

function signal(id: ScenarioId, score: number, reasons: string[]): ScenarioSignal {
  const meta = SCENARIO_META[id];
  return { id, label: meta.label, emoji: meta.emoji, category: meta.category, tier: meta.tier, score: clamp(Math.round(score)), active: Math.round(score) >= SCENARIO_THRESHOLDS.ACTIVE_SCORE, reasons };
}

function inactive(id: ScenarioId): ScenarioSignal { return signal(id, 0, []); }

function getFavSide(m: AdvancedMatch): 'home' | 'away' | null {
  const hdp = m.initialHandicap ?? m.odds?.handicap?.value ?? null;
  if (typeof hdp !== 'number') return null;
  if (hdp < -0.25) return 'home';
  if (hdp > 0.25) return 'away';
  return null;
}

function totalGoals(m: AdvancedMatch) { return (m.home?.score ?? 0) + (m.away?.score ?? 0); }
function scoreDiff(m: AdvancedMatch) { return (m.home?.score ?? 0) - (m.away?.score ?? 0); }
function totalShots(m: AdvancedMatch) { return (m.stats?.shots?.home ?? 0) + (m.stats?.shots?.away ?? 0); }
function totalXG(m: AdvancedMatch) { return (m.stats?.xG?.home ?? 0) + (m.stats?.xG?.away ?? 0); }
function totalDangerousAttacks(m: AdvancedMatch) { return (m.stats?.dangerousAttacks?.home ?? 0) + (m.stats?.dangerousAttacks?.away ?? 0); }
function hasRealStats(m: AdvancedMatch) { return m.stats?._realDataAvailable === true; }
function sideScore(m: AdvancedMatch, s: 'home' | 'away') { return s === 'home' ? (m.home?.score ?? 0) : (m.away?.score ?? 0); }
function sideShots(m: AdvancedMatch, s: 'home' | 'away') { return s === 'home' ? (m.stats?.shots?.home ?? 0) : (m.stats?.shots?.away ?? 0); }
function sideXG(m: AdvancedMatch, s: 'home' | 'away') { return s === 'home' ? (m.stats?.xG?.home ?? 0) : (m.stats?.xG?.away ?? 0); }
function sidePossession(m: AdvancedMatch, s: 'home' | 'away') { return s === 'home' ? (m.stats?.possession?.home ?? 50) : (m.stats?.possession?.away ?? 50); }
function sideDangerousAttacks(m: AdvancedMatch, s: 'home' | 'away') { return s === 'home' ? (m.stats?.dangerousAttacks?.home ?? 0) : (m.stats?.dangerousAttacks?.away ?? 0); }
function sideCorners(m: AdvancedMatch, s: 'home' | 'away') { return s === 'home' ? (m.stats?.corners?.home ?? 0) : (m.stats?.corners?.away ?? 0); }
function sideFouls(m: AdvancedMatch, s: 'home' | 'away') { return s === 'home' ? (m.stats?.fouls?.home ?? 0) : (m.stats?.fouls?.away ?? 0); }
function other(s: 'home' | 'away'): 'home' | 'away' { return s === 'home' ? 'away' : 'home'; }

// ============================================================
// S01 ~ S20 评估函数
// ============================================================

function s01(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S01_STRONG_FAV_CHASING';
  if (m.minute < 75) return inactive(id);
  const fav = getFavSide(m); if (!fav) return inactive(id);
  const dog = other(fav);
  const diff = sideScore(m, fav) - sideScore(m, dog);
  if (diff > 0 || diff < -1) return inactive(id);
  let sc = 30; const r: string[] = [];
  if (sideShots(m, fav) >= sideShots(m, dog) * 1.2 && sideShots(m, fav) >= 8) { sc += 15; r.push('射门优势'); }
  if (sideXG(m, fav) >= sideXG(m, dog) * 1.2 && sideXG(m, fav) >= 1.0) { sc += 15; r.push('xG 优势'); }
  if (sideDangerousAttacks(m, fav) >= sideDangerousAttacks(m, dog)) { sc += 10; r.push('危险进攻主导'); }
  if (sidePossession(m, fav) >= 55) { sc += 5; r.push('控球优势'); }
  if (m.needsWinProxy === fav || m.needsWinProxy === 'both') { sc += 10; r.push('争胜压力'); }
  if (m.minute >= 85) sc += 5;
  const favRed = fav === 'home' ? (m.cards?.red?.home ?? 0) : (m.cards?.red?.away ?? 0);
  const dogRed = dog === 'home' ? (m.cards?.red?.home ?? 0) : (m.cards?.red?.away ?? 0);
  if (favRed > dogRed) { sc -= 15; r.push('强队少人'); }
  return signal(id, sc, r);
}

function s02(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S02_DRAW_BOTH_NEED_WIN';
  if (m.minute < 80 || scoreDiff(m) !== 0) return inactive(id);
  let sc = 25; const r: string[] = [];
  if (m.needsWinProxy === 'both') { sc += 30; r.push('双方都有争胜压力'); }
  else if (m.needsWinProxy) { sc += 15; r.push(`${m.needsWinProxy === 'home' ? '主队' : '客队'}有争胜压力`); }
  if (totalShots(m) >= 15) { sc += 10; r.push('场面活跃'); }
  if (totalDangerousAttacks(m) >= 30) { sc += 10; r.push('危险进攻多'); }
  if (m.minute >= 85) sc += 10;
  return signal(id, sc, r);
}

function s03(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S03_HOME_LAST_GASP';
  if (m.minute < 85) return inactive(id);
  if ((m.home?.score ?? 0) > (m.away?.score ?? 0)) return inactive(id);
  let sc = 30; const r: string[] = [];
  if (sideShots(m, 'home') > sideShots(m, 'away')) { sc += 15; r.push('主队射门更多'); }
  if (sidePossession(m, 'home') >= 55) { sc += 10; r.push('主队控球优势'); }
  if (sideDangerousAttacks(m, 'home') > sideDangerousAttacks(m, 'away')) { sc += 10; r.push('主队危险进攻主导'); }
  if (sideCorners(m, 'home') > sideCorners(m, 'away') + 2) { sc += 10; r.push('主队角球优势'); }
  if (m.needsWinProxy === 'home' || m.needsWinProxy === 'both') { sc += 10; r.push('主队有争胜压力'); }
  return signal(id, sc, r);
}

function s04(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S04_HIGH_SCORE_SEESAW';
  if (m.minute < 75) return inactive(id);
  const goals = totalGoals(m); const diff = Math.abs(scoreDiff(m));
  if (goals < 4 || diff > 1) return inactive(id);
  let sc = 40; const r: string[] = [`总进球 ${goals}`];
  if (diff === 0) { sc += 15; r.push('比分持平'); }
  if (totalShots(m) >= 20) { sc += 10; r.push('射门活跃'); }
  if (totalXG(m) >= 3) { sc += 10; r.push('xG 高'); }
  if (m.minute >= 85) sc += 10;
  return signal(id, sc, r);
}

function s05(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S05_1H_GOALS_2H_QUIET';
  if (m.minute < 75 || m.minute > 90) return inactive(id);
  const ht = m.halftimeScore; if (!ht) return inactive(id);
  const htGoals = (ht.home ?? 0) + (ht.away ?? 0);
  if (htGoals < 2) return inactive(id);
  if (totalGoals(m) - htGoals > 0) return inactive(id);
  let sc = 35; const r: string[] = [`半场 ${htGoals} 球，下半场 0 球`];
  if (totalShots(m) >= 15) { sc += 15; r.push('射门仍活跃'); }
  if (totalXG(m) > totalGoals(m) + 0.5) { sc += 15; r.push('xG 欠债'); }
  if (totalDangerousAttacks(m) >= 25) { sc += 10; r.push('危险进攻持续'); }
  return signal(id, sc, r);
}

function s06(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S06_PREMATCH_OVER_UNMET';
  if (m.minute < 75 || m.minute > 90) return inactive(id);
  const initOU = m.initialOverUnder;
  if (typeof initOU !== 'number' || initOU < 2.5) return inactive(id);
  const goals = totalGoals(m);
  if (goals >= Math.floor(initOU)) return inactive(id);
  let sc = 25; const r: string[] = [`赛前 O/U ${initOU}，当前 ${goals} 球`];
  if (initOU >= 3.5) { sc += 10; r.push('强烈大球预期'); }
  if (totalShots(m) >= 15) { sc += 15; r.push('射门活跃'); }
  if (totalXG(m) >= 2.0) { sc += 15; r.push('xG 支撑'); }
  if (totalDangerousAttacks(m) >= 30) { sc += 10; r.push('场面未死'); }
  return signal(id, sc, r);
}

function s07(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S07_PARK_BUS_EQUALIZED';
  if (m.minute < 75) return inactive(id);
  const diff = scoreDiff(m);
  if (Math.abs(diff) !== 1) return inactive(id);
  const leading: 'home' | 'away' = diff > 0 ? 'home' : 'away';
  const trailing = other(leading);
  if (sidePossession(m, leading) > 40) return inactive(id);
  let sc = 30; const r: string[] = [];
  if (sideShots(m, trailing) >= sideShots(m, leading) * 2) { sc += 15; r.push('落后方射门碾压'); }
  if (sidePossession(m, trailing) >= 60) { sc += 10; r.push('落后方控球 60%+'); }
  if (sideDangerousAttacks(m, trailing) >= sideDangerousAttacks(m, leading) * 1.5) { sc += 15; r.push('危险进攻碾压'); }
  if (sideCorners(m, trailing) > sideCorners(m, leading) + 3) { sc += 10; r.push('角球优势大'); }
  return signal(id, sc, r);
}

function s08(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S08_RED_CARD_SHIFT';
  if (m.minute < 70) return inactive(id);
  const redH = m.cards?.red?.home ?? 0; const redA = m.cards?.red?.away ?? 0;
  if (redH + redA === 0) return inactive(id);
  let sc = 30; const r: string[] = [`红牌: 主${redH} 客${redA}`];
  const diff = scoreDiff(m);
  if (redH > redA && diff > 0) { sc += 20; r.push('少人方领先，被追平概率大'); }
  else if (redA > redH && diff < 0) { sc += 20; r.push('少人方领先，被追平概率大'); }
  const varEvents = (m.events ?? []).filter(e => e.type === 'Var');
  if (varEvents.length > 0) { sc += 10; r.push('有 VAR 判罚'); }
  if (m.minute >= 80) sc += 10;
  return signal(id, sc, r);
}

function s09(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S09_CUP_MUST_SCORE';
  if (m.minute < 75) return inactive(id);
  const round = (m.round ?? '').toLowerCase();
  const isCup = round.includes('round') || round.includes('leg') || round.includes('final') || round.includes('semi') || round.includes('quarter') || round.includes('knockout');
  if (!isCup) return inactive(id);
  let sc = 30; const r: string[] = ['杯赛/淘汰赛'];
  const diff = scoreDiff(m);
  if (diff === 0) { sc += 15; r.push('比分打平'); } else if (Math.abs(diff) === 1) { sc += 10; r.push('仅差 1 球'); }
  if (totalShots(m) >= 12) { sc += 10; r.push('射门活跃'); }
  if (m.minute >= 85) sc += 10;
  return signal(id, sc, r);
}

function s10(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S10_WEAK_BESIEGED';
  if (m.minute < 70) return inactive(id);
  const fav = getFavSide(m); if (!fav) return inactive(id);
  const dog = other(fav);
  if (sideScore(m, dog) <= sideScore(m, fav)) return inactive(id);
  let sc = 30; const r: string[] = ['弱队领先'];
  if (sideShots(m, fav) >= sideShots(m, dog) * 1.5) { sc += 15; r.push('强队射门碾压'); }
  if (sidePossession(m, fav) >= 60) { sc += 10; r.push('强队控球 60%+'); }
  if (sideDangerousAttacks(m, fav) >= sideDangerousAttacks(m, dog) * 1.5) { sc += 15; r.push('强队危险进攻碾压'); }
  if (sideCorners(m, fav) > sideCorners(m, dog) + 3) { sc += 10; r.push('角球优势'); }
  if (m.minute >= 80) sc += 5;
  return signal(id, sc, r);
}

function s11(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S11_STRONG_2H_TAKEOVER';
  if (m.minute < 70 || m.minute > 90) return inactive(id);
  const ht = m.halftimeScore; if (!ht) return inactive(id);
  if (Math.abs((ht.home ?? 0) - (ht.away ?? 0)) > 1) return inactive(id);
  const fav = getFavSide(m); if (!fav) return inactive(id);
  let sc = 25; const r: string[] = [];
  if (sideShots(m, fav) >= sideShots(m, other(fav)) * 1.5 && sideShots(m, fav) >= 10) { sc += 20; r.push('射门全面压制'); }
  if (sideXG(m, fav) >= sideXG(m, other(fav)) + 0.8) { sc += 15; r.push('xG 明显占优'); }
  if (sideDangerousAttacks(m, fav) >= sideDangerousAttacks(m, other(fav)) * 1.3) { sc += 10; r.push('危险进攻占优'); }
  if (m.halfStatsDelta && m.halfStatsDelta.shotsDelta > 0) { sc += 10; r.push('下半场射门增长'); }
  return signal(id, sc, r);
}

function s12(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S12_WEAK_FATIGUE';
  if (m.minute < 75 || m.minute > 90) return inactive(id);
  const fav = getFavSide(m); if (!fav) return inactive(id);
  const dog = other(fav);
  let sc = 20; const r: string[] = [];
  const dogFouls = sideFouls(m, dog); const favFouls = sideFouls(m, fav);
  if (dogFouls >= favFouls + 3 && dogFouls >= 10) { sc += 20; r.push('弱队犯规远超强队'); }
  const dogYellow = dog === 'home' ? (m.cards?.yellow?.home ?? 0) : (m.cards?.yellow?.away ?? 0);
  if (dogYellow >= 3) { sc += 15; r.push('弱队黄牌多'); }
  if (sideShots(m, fav) >= sideShots(m, dog) * 1.5) { sc += 15; r.push('强队射门碾压'); }
  if (sidePossession(m, fav) >= 60) { sc += 10; r.push('强队控球高'); }
  return signal(id, sc, r);
}

function s13(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S13_SUPER_SUB_IMPACT';
  if (m.minute < 70 || m.minute > 90) return inactive(id);
  const attackSubs = m.subsAfter70Attack ?? 0;
  if (attackSubs < 1) return inactive(id);
  const fav = getFavSide(m);
  let sc = 25; const r: string[] = [`70' 后攻击型换人 ${attackSubs} 次`];
  if (attackSubs >= 2) { sc += 15; r.push('多人攻击型换人'); }
  if (fav) {
    if (sideShots(m, fav) > sideShots(m, other(fav))) { sc += 10; r.push('换人后强队射门更多'); }
    if (sideDangerousAttacks(m, fav) > sideDangerousAttacks(m, other(fav))) { sc += 10; r.push('换人后进攻压力增大'); }
  }
  if (totalShots(m) >= 15) { sc += 10; r.push('场面活跃'); }
  return signal(id, sc, r);
}

function s14(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S14_CORNER_SET_PIECE_PILE';
  if (m.minute < 80) return inactive(id);
  const hC = m.stats?.corners?.home ?? 0; const aC = m.stats?.corners?.away ?? 0;
  const corners = hC + aC;
  if (corners < 8) return inactive(id);
  let sc = 25; const r: string[] = [`角球 ${hC}-${aC}`];
  if (Math.abs(hC - aC) >= 4) { sc += 15; r.push('角球严重不对称'); }
  if (corners >= 12) { sc += 15; r.push('总角球 12+'); }
  if (corners >= 10) { sc += 10; r.push('总角球 10+'); }
  if (m.minute >= 85) sc += 10;
  const pressing = hC > aC ? 'home' as const : 'away' as const;
  if (sideDangerousAttacks(m, pressing) > sideDangerousAttacks(m, other(pressing))) { sc += 10; r.push('角球多方仍在进攻'); }
  return signal(id, sc, r);
}

function s15(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S15_2H_TEMPO_RISE';
  if (m.minute < 70 || m.minute > 90) return inactive(id);
  const ht = m.halftimeScore; if (!ht) return inactive(id);
  const htGoals = (ht.home ?? 0) + (ht.away ?? 0);
  const goals2h = totalGoals(m) - htGoals;
  let sc = 20; const r: string[] = [];
  if (goals2h > htGoals) { sc += 20; r.push(`下半场 ${goals2h} 球 > 上半场 ${htGoals} 球`); }
  if (m.halfStatsDelta) {
    if (m.halfStatsDelta.shotsDelta > 0) { sc += 15; r.push('下半场射门节奏提升'); }
    if (m.halfStatsDelta.cornersDelta > 0) { sc += 10; r.push('下半场角球增加'); }
  }
  if (totalShots(m) >= 20) { sc += 10; r.push('射门总量高'); }
  if (totalDangerousAttacks(m) >= 35) { sc += 10; r.push('危险进攻频繁'); }
  return signal(id, sc, r);
}

function s16(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S16_LONG_STOPPAGE_CHAOS';
  if (m.minute < 90) return inactive(id);
  const addedTime = m.stoppageTimeAnnounced ?? m.extraMinute ?? 0;
  if (addedTime < 5) return inactive(id);
  const diff = Math.abs(scoreDiff(m));
  if (diff > 1) return inactive(id);
  let sc = 35; const r: string[] = [`补时 ${addedTime} 分钟`];
  if (addedTime >= 8) { sc += 15; r.push('超长补时'); }
  if (diff === 0) { sc += 10; r.push('比分持平'); }
  if (totalShots(m) >= 15) { sc += 10; r.push('场面活跃'); }
  const totalRed = (m.cards?.red?.home ?? 0) + (m.cards?.red?.away ?? 0);
  if (totalRed >= 1) { sc += 10; r.push('有红牌'); }
  return signal(id, sc, r);
}

function s17(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S17_MENTAL_COLLAPSE';
  if (m.minute < 80) return inactive(id);
  let sc = 15; const r: string[] = [];
  const totalFouls = (m.stats?.fouls?.home ?? 0) + (m.stats?.fouls?.away ?? 0);
  const totalYellow = (m.cards?.yellow?.home ?? 0) + (m.cards?.yellow?.away ?? 0);
  const totalRed = (m.cards?.red?.home ?? 0) + (m.cards?.red?.away ?? 0);
  if (totalFouls >= 25) { sc += 15; r.push('犯规频繁'); }
  if (totalYellow >= 5) { sc += 15; r.push('黄牌多'); }
  if (totalRed >= 1) { sc += 15; r.push('有红牌'); }
  const varEvents = (m.events ?? []).filter(e => e.type === 'Var');
  if (varEvents.length >= 1) { sc += 10; r.push('VAR 争议'); }
  if (Math.abs(scoreDiff(m)) <= 1) { sc += 10; r.push('比分胶着'); }
  return signal(id, sc, r);
}

function s18(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S18_PRICE_MISMATCH';
  if (m.minute < 80 || m.minute > 90) return inactive(id);
  if (!hasRealStats(m)) return inactive(id);
  const overOdds = m.odds?.overUnder?.over ?? null;
  if (typeof overOdds !== 'number' || overOdds < 2.0) return inactive(id);
  let sc = 20; const r: string[] = [`Over 赔率 ${overOdds.toFixed(2)}`];
  if (overOdds >= 3.0) { sc += 15; r.push('赔率极高'); } else if (overOdds >= 2.5) { sc += 10; r.push('赔率偏高'); }
  if (totalShots(m) >= 15) { sc += 15; r.push('射门活跃'); }
  if (totalXG(m) >= 2.0) { sc += 15; r.push('xG 高'); }
  if (totalDangerousAttacks(m) >= 30) { sc += 10; r.push('危险进攻多'); }
  return signal(id, sc, r);
}

function s19(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S19_80MIN_PRICE_WINDOW';
  if (m.minute < 80 || m.minute > 88) return inactive(id);
  const goals = totalGoals(m);
  if (goals > 3 || Math.abs(scoreDiff(m)) > 1) return inactive(id);
  const overOdds = m.odds?.overUnder?.over ?? null;
  if (typeof overOdds !== 'number') return inactive(id);
  let sc = 20; const r: string[] = [];
  if (overOdds >= 2.0 && overOdds <= 3.0) { sc += 15; r.push(`Over 赔率 ${overOdds.toFixed(2)}，在窗口区间`); }
  if (totalShots(m) >= 12) { sc += 10; r.push('射门 12+'); }
  if (totalDangerousAttacks(m) >= 25) { sc += 10; r.push('危险进攻 25+'); }
  if (sidePossession(m, 'home') > 55 || sidePossession(m, 'away') > 55) { sc += 10; r.push('一方控球优势'); }
  const ht = m.halftimeScore;
  if (ht && ((ht.home ?? 0) + (ht.away ?? 0)) >= 1) { sc += 5; r.push('半场有进球'); }
  return signal(id, sc, r);
}

function s20(m: AdvancedMatch): ScenarioSignal {
  const id: ScenarioId = 'S20_BTTS_2H';
  if (m.minute < 75 || m.minute > 90) return inactive(id);
  const ht = m.halftimeScore; if (!ht) return inactive(id);
  let sc = 20; const r: string[] = [];
  if ((ht.home ?? 0) >= 1 && (ht.away ?? 0) >= 1) { sc += 20; r.push('上半场双方都进球'); }
  else if ((ht.home ?? 0) + (ht.away ?? 0) >= 1) { sc += 10; r.push('上半场有进球'); }
  if (sideShots(m, 'home') >= 5 && sideShots(m, 'away') >= 5) { sc += 10; r.push('双方射门均衡'); }
  if (sideXG(m, 'home') >= 0.5 && sideXG(m, 'away') >= 0.5) { sc += 15; r.push('双方 xG 都有'); }
  const bttsYes = m.odds?.bothTeamsScore?.yes ?? null;
  if (typeof bttsYes === 'number' && bttsYes >= 1.8) { sc += 10; r.push(`BTTS Yes 赔率 ${bttsYes.toFixed(2)}`); }
  return signal(id, sc, r);
}

const ALL_EVALUATORS: Array<(m: AdvancedMatch) => ScenarioSignal> = [
  s01, s02, s03, s04, s05, s06, s07, s08, s09, s10,
  s11, s12, s13, s14, s15, s16, s17, s18, s19, s20,
];

// ============================================================
// 公开 API — scenarioEngine
// ============================================================

export function evaluateAllScenarios(match: AdvancedMatch): ScenarioSignal[] {
  return ALL_EVALUATORS.map(fn => fn(match));
}

export function getActiveScenarios(match: AdvancedMatch): ScenarioSignal[] {
  return evaluateAllScenarios(match).filter(s => s.active).sort((a, b) => b.score - a.score);
}

// ============================================================
// 公开 API — compositeSignal
// ============================================================

export type CompositeAction = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface OddsEdgeResult {
  impliedOverProb: number | null;
  edge: number | null;
  oddsMultiplier: number;
}

export interface CompositeSignal {
  topScenarios: ScenarioSignal[];
  rawScore: number;
  compositeScore: number;
  action: CompositeAction;
  activeCount: number;
  byCategory: Record<ScenarioCategory, number>;
  oddsEdge?: OddsEdgeResult;
}

const TIER_W = SCENARIO_THRESHOLDS.TIER_WEIGHT;

function calculateOddsEdgeBackend(m: AdvancedMatch, rawScore: number): OddsEdgeResult {
  const overOdds = m.odds?.overUnder?.over ?? null;
  const underOdds = m.odds?.overUnder?.under ?? null;
  if (typeof overOdds !== 'number' || typeof underOdds !== 'number') {
    return { impliedOverProb: null, edge: null, oddsMultiplier: 1.0 };
  }
  const rawOver = 1 / overOdds;
  const rawUnder = 1 / underOdds;
  const total = rawOver + rawUnder;
  const overProb = total > 0 ? rawOver / total : 0.5;
  const remainMin = Math.max(1, 95 - m.minute);
  const baseline = Math.min(0.65, remainMin * 0.012);
  const modelProb = Math.min(0.85, baseline + (rawScore / 100) * 0.30);
  const edge = modelProb - overProb;
  let mult = 1.0;
  if (edge > 0.15) mult += 0.25;
  else if (edge > 0.08) mult += 0.15;
  else if (edge > 0) mult += 0.05;
  else if (edge < -0.15) mult -= 0.30;
  else if (edge < -0.05) mult -= 0.15;
  if (overOdds < 1.5) mult -= 0.20;
  if (overOdds >= 2.0 && overOdds <= 3.5 && edge > 0.05) mult += 0.10;
  mult = Math.max(0.3, Math.min(1.5, mult));
  return { impliedOverProb: overProb, edge, oddsMultiplier: mult };
}

export function aggregateScenarioSignals(activeSignals: ScenarioSignal[], match?: AdvancedMatch): CompositeSignal {
  if (activeSignals.length === 0) {
    return { topScenarios: [], rawScore: 0, compositeScore: 0, action: 'NONE', activeCount: 0, byCategory: { match_state: 0, momentum: 0, price_psychology: 0 } };
  }
  const sorted = [...activeSignals].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  let weightedSum = 0, weightTotal = 0;
  for (const s of top3) { const w = TIER_W[s.tier]; weightedSum += s.score * w; weightTotal += w; }
  let rawComposite = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const bonus = Math.min(15, (activeSignals.length - 1) * 3);
  rawComposite = Math.min(100, Math.round(rawComposite + bonus));

  let oddsEdge: OddsEdgeResult | undefined;
  let adjustedScore = rawComposite;
  if (match) {
    try {
      oddsEdge = calculateOddsEdgeBackend(match, rawComposite);
      adjustedScore = Math.round(Math.max(0, Math.min(100, rawComposite * oddsEdge.oddsMultiplier)));
    } catch { /* 不影响主链路 */ }
  }

  const byCategory: Record<ScenarioCategory, number> = { match_state: 0, momentum: 0, price_psychology: 0 };
  for (const s of activeSignals) byCategory[s.category]++;
  const action: CompositeAction = adjustedScore >= SCENARIO_THRESHOLDS.COMPOSITE.HIGH ? 'HIGH' : adjustedScore >= SCENARIO_THRESHOLDS.COMPOSITE.MEDIUM ? 'MEDIUM' : adjustedScore >= SCENARIO_THRESHOLDS.COMPOSITE.LOW ? 'LOW' : 'NONE';
  return { topScenarios: sorted.slice(0, 5), rawScore: rawComposite, compositeScore: adjustedScore, action, activeCount: activeSignals.length, byCategory, oddsEdge };
}

// ============================================================
// 公开 API — paperTradeConfig (仅运行时需要的部分，不含 localStorage)
// ============================================================

export type MarketType = 'OVER' | 'NEXT_GOAL' | 'BTTS_YES';

export interface PaperTradeRule {
  id: string;
  label: string;
  enabled: boolean;
  minCompositeScore: number;
  minActiveScenarios: number;
  requiredScenarios?: ScenarioId[];
  marketType: MarketType;
  minuteRange: [number, number];
  cooldownMinutes: number;
  stake: number;
}

export const PAPER_TRADE_RULES: PaperTradeRule[] = [
  {
    id: 'AUTO_HIGH',
    label: '高分自动买入',
    enabled: true,
    minCompositeScore: 75,
    minActiveScenarios: 2,
    marketType: 'OVER',
    minuteRange: [75, 92],
    cooldownMinutes: 5,
    stake: 10,
  },
  {
    id: 'AUTO_MEDIUM_MULTI',
    label: '中分多标签买入',
    enabled: true,
    minCompositeScore: 55,
    minActiveScenarios: 3,
    marketType: 'OVER',
    minuteRange: [80, 92],
    cooldownMinutes: 5,
    stake: 10,
  },
];
