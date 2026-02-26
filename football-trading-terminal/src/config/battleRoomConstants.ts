// ============================================
// 作战室常量配置
// Version: 139
// ============================================

// ============================================
// 分档阈值（统一口径）
// ============================================
export const SIGNAL_THRESHOLD = {
  HIGH: 70,     // 高信号强度阈值
  WATCH: 50,    // 观望阈值
  LOW: 0,       // 低信号
} as const;

export type SignalTier = 'high' | 'watch' | 'low';

// ============================================
// 时间衰减配置（Weibull 思想）
// ============================================
export const TIME_DECAY_CONFIG = {
  // 分段乘数（基于历史统计）
  phaseMultipliers: {
    early: 0.85,       // 0-15分钟：开场谨慎 -15%
    mid: 1.0,          // 15-75分钟：正常
    late: 1.25,        // 75-85分钟：末段 +25%
    extraLate: 1.45,   // 85-90+分钟：desperation +45%
  },
  // 疲劳因子（75分钟后每分钟递增）
  fatiguePerMinute: 0.003,
  // 绝望因子（落后时触发）
  desperationBonus: 0.15,
} as const;

// ============================================
// Hysteresis 配置
// ============================================
export const HYSTERESIS_CONFIG = {
  CONFIRM_THRESHOLD: 2,              // 连续2次确认才变档
  SIGNAL_COOLDOWN_MS: 5 * 60 * 1000, // 5分钟信号冷却
} as const;

// ============================================
// 信号结算配置
// ============================================
export const SETTLEMENT_CONFIG = {
  WINDOW_MINUTES: 10,        // 10分钟结算窗口
  MAX_PENDING_HOURS: 3,      // 超过3小时自动过期
  STORAGE_RETENTION_DAYS: 7, // 本地存储保留7天
} as const;

// ============================================
// Kelly 配置
// ============================================
export const KELLY_CONFIG = {
  // 保守系数：信号强度转胜率时打折
  CONSERVATIVE_FACTOR: 0.85,
  // 仓位系数：凯利值的 1/4
  POSITION_FRACTION: 0.25,
  // 最大建议投注比例
  MAX_BET_PERCENTAGE: 5,
} as const;

// ============================================
// 信号强度混合权重
// ============================================
export const SIGNAL_BLEND_WEIGHTS = {
  baseScore: 0.7,       // 基础评分权重
  poissonEstimate: 0.3, // 泊松估算权重
} as const;

// ============================================
// UI 刷新间隔
// ============================================
export const REFRESH_CONFIG = {
  DATA_INTERVAL_MS: 15000,  // 15秒刷新数据
  CLOCK_INTERVAL_MS: 1000,  // 1秒更新时钟
} as const;
