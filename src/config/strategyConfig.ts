/**
 * 统一策略配置 — 所有分钟阈值、分数阈值集中管理
 */

export const STRATEGY_CONFIG = {
  /** 预热开始（场景标签开始生成，信号弱） */
  WARMUP_MINUTE: 65,
  /** 激活阶段（信号正式可用） */
  ACTIVE_MINUTE: 75,
  /** 末段高亮（行样式 pulse、进度条颜色变化） */
  ENDGAME_MINUTE: 85,

  /** 信号强度阈值 */
  SIGNAL: {
    BET_SCORE: 85,
    BET_CONFIDENCE: 70,
    PREPARE_SCORE: 75,
    PREPARE_CONFIDENCE: 55,
    WATCH_SCORE: 65,
  },
} as const;
