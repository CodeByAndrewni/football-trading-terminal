/**
 * 20 情景引擎 — 集中管理所有硬编码阈值
 * 按三大类分组，便于逐一调参
 */

// ============================================
// 情景 ID 枚举
// ============================================

export type ScenarioId =
  | 'S01_STRONG_FAV_CHASING'
  | 'S02_DRAW_BOTH_NEED_WIN'
  | 'S03_HOME_LAST_GASP'
  | 'S04_HIGH_SCORE_SEESAW'
  | 'S05_1H_GOALS_2H_QUIET'
  | 'S06_PREMATCH_OVER_UNMET'
  | 'S07_PARK_BUS_EQUALIZED'
  | 'S08_RED_CARD_SHIFT'
  | 'S09_CUP_MUST_SCORE'
  | 'S10_WEAK_BESIEGED'
  | 'S11_STRONG_2H_TAKEOVER'
  | 'S12_WEAK_FATIGUE'
  | 'S13_SUPER_SUB_IMPACT'
  | 'S14_CORNER_SET_PIECE_PILE'
  | 'S15_2H_TEMPO_RISE'
  | 'S16_LONG_STOPPAGE_CHAOS'
  | 'S17_MENTAL_COLLAPSE'
  | 'S18_PRICE_MISMATCH'
  | 'S19_80MIN_PRICE_WINDOW'
  | 'S20_BTTS_2H';

export type ScenarioCategory = 'match_state' | 'momentum' | 'price_psychology';

export type DataTier = 'A' | 'B' | 'C';

export interface ScenarioMeta {
  id: ScenarioId;
  label: string;
  emoji: string;
  category: ScenarioCategory;
  tier: DataTier;
  /** 典型生效分钟区间 [min, max] */
  minuteRange: [number, number];
  desc: string;
}

// ============================================
// 元数据注册表
// ============================================

export const SCENARIO_META: Record<ScenarioId, ScenarioMeta> = {
  S01_STRONG_FAV_CHASING:   { id: 'S01_STRONG_FAV_CHASING',   label: '强队追分绝杀', emoji: '🔥', category: 'match_state', tier: 'A', minuteRange: [75, 95], desc: '强队落后/平局，场面占优但未反超' },
  S02_DRAW_BOTH_NEED_WIN:   { id: 'S02_DRAW_BOTH_NEED_WIN',   label: '平局+双方抢3分', emoji: '⚔️', category: 'match_state', tier: 'B', minuteRange: [80, 95], desc: '比分打平，双方都有争冠/保级压力' },
  S03_HOME_LAST_GASP:       { id: 'S03_HOME_LAST_GASP',       label: '主场压哨绝杀', emoji: '🏟️', category: 'match_state', tier: 'A', minuteRange: [85, 95], desc: '主队落后/平局，末段围攻' },
  S04_HIGH_SCORE_SEESAW:    { id: 'S04_HIGH_SCORE_SEESAW',    label: '高比分拉锯', emoji: '🎢', category: 'match_state', tier: 'A', minuteRange: [75, 95], desc: '2-2、3-3 等大开打局面' },
  S05_1H_GOALS_2H_QUIET:    { id: 'S05_1H_GOALS_2H_QUIET',    label: '上半场大球下半场闷', emoji: '⏳', category: 'match_state', tier: 'A', minuteRange: [75, 90], desc: '上半场热度高，下半场久未进球但节奏在' },
  S06_PREMATCH_OVER_UNMET:  { id: 'S06_PREMATCH_OVER_UNMET',  label: '赛前大球未兑现', emoji: '📊', category: 'match_state', tier: 'B', minuteRange: [75, 90], desc: '赛前预期大球但 75\' 仍是低比分' },
  S07_PARK_BUS_EQUALIZED:   { id: 'S07_PARK_BUS_EQUALIZED',   label: '摆大巴被绝平', emoji: '🚌', category: 'match_state', tier: 'A', minuteRange: [75, 95], desc: '领先方过早死守，另一方持续施压' },
  S08_RED_CARD_SHIFT:       { id: 'S08_RED_CARD_SHIFT',       label: '红牌翻盘', emoji: '🟥', category: 'match_state', tier: 'A', minuteRange: [70, 95], desc: '红牌/争议判罚改变形势' },
  S09_CUP_MUST_SCORE:       { id: 'S09_CUP_MUST_SCORE',       label: '杯赛必进球', emoji: '🏆', category: 'match_state', tier: 'B', minuteRange: [75, 95], desc: '淘汰赛中必须进球才能晋级' },
  S10_WEAK_BESIEGED:        { id: 'S10_WEAK_BESIEGED',        label: '弱队被围殴', emoji: '🛡️', category: 'match_state', tier: 'A', minuteRange: [70, 95], desc: '弱队意外领先但长期被压制' },
  S11_STRONG_2H_TAKEOVER:   { id: 'S11_STRONG_2H_TAKEOVER',   label: '下半场强队接管', emoji: '💪', category: 'momentum',    tier: 'A', minuteRange: [70, 90], desc: '上半场僵持，下半场强队加强压迫' },
  S12_WEAK_FATIGUE:         { id: 'S12_WEAK_FATIGUE',         label: '弱队体能崩盘', emoji: '😰', category: 'momentum',    tier: 'B', minuteRange: [75, 90], desc: '弱队犯规/黄牌增多，防线松动' },
  S13_SUPER_SUB_IMPACT:     { id: 'S13_SUPER_SUB_IMPACT',     label: '替补碾压', emoji: '🔄', category: 'momentum',    tier: 'B', minuteRange: [70, 90], desc: '强队换上攻击型替补后场面一边倒' },
  S14_CORNER_SET_PIECE_PILE: { id: 'S14_CORNER_SET_PIECE_PILE', label: '角球定位球堆积', emoji: '🚩', category: 'momentum',    tier: 'A', minuteRange: [80, 95], desc: '一方末段连续角球/任意球' },
  S15_2H_TEMPO_RISE:        { id: 'S15_2H_TEMPO_RISE',        label: '下半场节奏飙升', emoji: '📈', category: 'momentum',    tier: 'A', minuteRange: [70, 90], desc: '下半场节奏明显快于上半场' },
  S16_LONG_STOPPAGE_CHAOS:  { id: 'S16_LONG_STOPPAGE_CHAOS',  label: '长补时混乱', emoji: '⏱️', category: 'momentum',    tier: 'C', minuteRange: [90, 100], desc: '补时≥5分钟且节奏未降' },
  S17_MENTAL_COLLAPSE:      { id: 'S17_MENTAL_COLLAPSE',      label: '心态崩盘', emoji: '😤', category: 'price_psychology', tier: 'C', minuteRange: [80, 95], desc: '被围殴/争议判罚后情绪失衡' },
  S18_PRICE_MISMATCH:       { id: 'S18_PRICE_MISMATCH',       label: '价格错配绝杀', emoji: '💰', category: 'price_psychology', tier: 'C', minuteRange: [80, 90], desc: '场面热但赔率明显偏高' },
  S19_80MIN_PRICE_WINDOW:   { id: 'S19_80MIN_PRICE_WINDOW',   label: '80\'价格窗口', emoji: '🪟', category: 'price_psychology', tier: 'C', minuteRange: [80, 88], desc: '赔率从低位抬升但场面仍高压' },
  S20_BTTS_2H:              { id: 'S20_BTTS_2H',              label: 'BTTS下半场型', emoji: '⚽', category: 'price_psychology', tier: 'A', minuteRange: [75, 90], desc: '上半场双方有威胁，目标双方再进球' },
};

// ============================================
// 评分阈值
// ============================================

export const SCENARIO_THRESHOLDS = {
  /** 情景评分达到 ACTIVE 才算「命中」 */
  ACTIVE_SCORE: 50,

  /** 复合分数阈值 */
  COMPOSITE: {
    HIGH: 75,
    MEDIUM: 55,
    LOW: 35,
  },

  /** 数据档位权重 */
  TIER_WEIGHT: { A: 1.0, B: 0.8, C: 0.6 } as const,
} as const;
