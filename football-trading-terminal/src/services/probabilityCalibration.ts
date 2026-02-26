// ============================================
// 概率校准服务
// Phase 2: 分桶校准
// Version: 145
// ============================================

// ============================================
// 类型定义
// ============================================

/**
 * 校准桶：每个信号强度区间的统计数据
 */
export interface CalibrationBucket {
  signalMin: number;        // 区间下限（含）
  signalMax: number;        // 区间上限（不含）
  sampleSize: number;       // 样本数量
  hitCount: number;         // 命中次数
  actualGoalRate: number;   // 真实进球率 (0-1)
  confidence: number;       // 置信度 (基于样本量)
  lastUpdated: string;      // 最后更新时间
}

/**
 * 校准表：所有桶的集合
 */
export interface CalibrationTable {
  version: string;
  createdAt: string;
  totalSamples: number;
  buckets: CalibrationBucket[];
}

/**
 * 校准记录：单条信号的结算记录（用于统计）
 */
export interface CalibrationRecord {
  id: string;
  signalStrength: number;
  triggerMinute: number;
  isHit: boolean;           // 是否命中
  goalMinute?: number;      // 如果命中，进球分钟
  settledAt: string;
  // 上下文数据（用于后续分析）
  context: {
    league?: string;
    minute: number;
    scoreDiff: number;
    timePhase: string;
    totalXg?: number;
  };
}

// ============================================
// 常量配置
// ============================================

// 校准桶配置：每10分一桶
const BUCKET_CONFIG = {
  MIN_SIGNAL: 0,
  MAX_SIGNAL: 100,
  BUCKET_SIZE: 10,
  // 最小样本量要求
  MIN_SAMPLE_SIZE: 30,
  // 高置信度样本量
  HIGH_CONFIDENCE_SIZE: 100,
};

// 存储键
const STORAGE_KEYS = {
  CALIBRATION_TABLE: 'ftt_calibration_table_v1',
  CALIBRATION_RECORDS: 'ftt_calibration_records_v1',
};

// ============================================
// 默认校准表（经验值，待数据替换）
// ============================================

const DEFAULT_CALIBRATION_TABLE: CalibrationTable = {
  version: 'v1.0-default',
  createdAt: new Date().toISOString(),
  totalSamples: 0,
  buckets: [
    { signalMin: 0, signalMax: 10, sampleSize: 0, hitCount: 0, actualGoalRate: 0.10, confidence: 0, lastUpdated: '' },
    { signalMin: 10, signalMax: 20, sampleSize: 0, hitCount: 0, actualGoalRate: 0.15, confidence: 0, lastUpdated: '' },
    { signalMin: 20, signalMax: 30, sampleSize: 0, hitCount: 0, actualGoalRate: 0.20, confidence: 0, lastUpdated: '' },
    { signalMin: 30, signalMax: 40, sampleSize: 0, hitCount: 0, actualGoalRate: 0.28, confidence: 0, lastUpdated: '' },
    { signalMin: 40, signalMax: 50, sampleSize: 0, hitCount: 0, actualGoalRate: 0.35, confidence: 0, lastUpdated: '' },
    { signalMin: 50, signalMax: 60, sampleSize: 0, hitCount: 0, actualGoalRate: 0.42, confidence: 0, lastUpdated: '' },
    { signalMin: 60, signalMax: 70, sampleSize: 0, hitCount: 0, actualGoalRate: 0.50, confidence: 0, lastUpdated: '' },
    { signalMin: 70, signalMax: 80, sampleSize: 0, hitCount: 0, actualGoalRate: 0.58, confidence: 0, lastUpdated: '' },
    { signalMin: 80, signalMax: 90, sampleSize: 0, hitCount: 0, actualGoalRate: 0.68, confidence: 0, lastUpdated: '' },
    { signalMin: 90, signalMax: 100, sampleSize: 0, hitCount: 0, actualGoalRate: 0.78, confidence: 0, lastUpdated: '' },
  ],
};

// ============================================
// 校准表管理
// ============================================

/**
 * 加载校准表
 */
export function loadCalibrationTable(): CalibrationTable {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CALIBRATION_TABLE);
    if (!raw) return DEFAULT_CALIBRATION_TABLE;
    return JSON.parse(raw) as CalibrationTable;
  } catch {
    return DEFAULT_CALIBRATION_TABLE;
  }
}

/**
 * 保存校准表
 */
export function saveCalibrationTable(table: CalibrationTable): void {
  localStorage.setItem(STORAGE_KEYS.CALIBRATION_TABLE, JSON.stringify(table));
}

/**
 * 加载校准记录
 */
export function loadCalibrationRecords(): CalibrationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CALIBRATION_RECORDS);
    if (!raw) return [];
    return JSON.parse(raw) as CalibrationRecord[];
  } catch {
    return [];
  }
}

/**
 * 保存校准记录
 */
export function saveCalibrationRecords(records: CalibrationRecord[]): void {
  // 保留最近 5000 条记录
  const recentRecords = records.slice(-5000);
  localStorage.setItem(STORAGE_KEYS.CALIBRATION_RECORDS, JSON.stringify(recentRecords));
}

/**
 * 添加校准记录
 */
export function addCalibrationRecord(record: CalibrationRecord): void {
  const records = loadCalibrationRecords();
  records.push(record);
  saveCalibrationRecords(records);
}

// ============================================
// 校准核心逻辑
// ============================================

/**
 * 根据信号强度获取校准后的概率
 *
 * @param signalStrength 信号强度 (0-100)
 * @returns 校准后的概率 (0-100) 和置信度信息
 */
export function getCalibratedProbability(signalStrength: number): {
  probability: number;
  isCalibrated: boolean;
  confidence: number;
  sampleSize: number;
} {
  const table = loadCalibrationTable();
  const bucket = table.buckets.find(
    b => signalStrength >= b.signalMin && signalStrength < b.signalMax
  );

  if (!bucket) {
    // 边界情况：信号强度 = 100
    const lastBucket = table.buckets[table.buckets.length - 1];
    return {
      probability: Math.round(lastBucket.actualGoalRate * 100),
      isCalibrated: lastBucket.sampleSize >= BUCKET_CONFIG.MIN_SAMPLE_SIZE,
      confidence: lastBucket.confidence,
      sampleSize: lastBucket.sampleSize,
    };
  }

  return {
    probability: Math.round(bucket.actualGoalRate * 100),
    isCalibrated: bucket.sampleSize >= BUCKET_CONFIG.MIN_SAMPLE_SIZE,
    confidence: bucket.confidence,
    sampleSize: bucket.sampleSize,
  };
}

/**
 * 从历史记录重新计算校准表
 */
export function recalculateCalibrationTable(): CalibrationTable {
  const records = loadCalibrationRecords();

  // 初始化桶
  const buckets: CalibrationBucket[] = [];
  for (let i = BUCKET_CONFIG.MIN_SIGNAL; i < BUCKET_CONFIG.MAX_SIGNAL; i += BUCKET_CONFIG.BUCKET_SIZE) {
    buckets.push({
      signalMin: i,
      signalMax: i + BUCKET_CONFIG.BUCKET_SIZE,
      sampleSize: 0,
      hitCount: 0,
      actualGoalRate: 0,
      confidence: 0,
      lastUpdated: '',
    });
  }

  // 统计每个桶
  for (const record of records) {
    const bucketIndex = Math.floor(record.signalStrength / BUCKET_CONFIG.BUCKET_SIZE);
    const bucket = buckets[bucketIndex];
    if (bucket) {
      bucket.sampleSize++;
      if (record.isHit) {
        bucket.hitCount++;
      }
    }
  }

  // 计算概率和置信度
  const now = new Date().toISOString();
  for (const bucket of buckets) {
    if (bucket.sampleSize > 0) {
      bucket.actualGoalRate = bucket.hitCount / bucket.sampleSize;
      bucket.confidence = Math.min(1, bucket.sampleSize / BUCKET_CONFIG.HIGH_CONFIDENCE_SIZE);
      bucket.lastUpdated = now;
    } else {
      // 没有样本时使用默认值
      const defaultBucket = DEFAULT_CALIBRATION_TABLE.buckets.find(
        b => b.signalMin === bucket.signalMin
      );
      if (defaultBucket) {
        bucket.actualGoalRate = defaultBucket.actualGoalRate;
      }
    }
  }

  const table: CalibrationTable = {
    version: `v1.1-${Date.now()}`,
    createdAt: now,
    totalSamples: records.length,
    buckets,
  };

  // 保存更新后的校准表
  saveCalibrationTable(table);

  return table;
}

// ============================================
// 统计和报告
// ============================================

/**
 * 获取校准统计摘要
 */
export function getCalibrationStats(): {
  totalRecords: number;
  totalHits: number;
  totalMisses: number;
  overallHitRate: number;
  bucketStats: Array<{
    range: string;
    samples: number;
    hitRate: number;
    isCalibrated: boolean;
  }>;
  readyForCalibration: boolean;
} {
  const records = loadCalibrationRecords();
  const table = loadCalibrationTable();

  const totalHits = records.filter(r => r.isHit).length;
  const totalMisses = records.filter(r => !r.isHit).length;

  const bucketStats = table.buckets.map(b => ({
    range: `${b.signalMin}-${b.signalMax}`,
    samples: b.sampleSize,
    hitRate: Math.round(b.actualGoalRate * 100),
    isCalibrated: b.sampleSize >= BUCKET_CONFIG.MIN_SAMPLE_SIZE,
  }));

  // 至少有 3 个桶达到最小样本量才算准备好校准
  const calibratedBuckets = table.buckets.filter(
    b => b.sampleSize >= BUCKET_CONFIG.MIN_SAMPLE_SIZE
  ).length;

  return {
    totalRecords: records.length,
    totalHits,
    totalMisses,
    overallHitRate: records.length > 0 ? Math.round((totalHits / records.length) * 100) : 0,
    bucketStats,
    readyForCalibration: calibratedBuckets >= 3,
  };
}

/**
 * 导出校准数据（用于分析）
 */
export function exportCalibrationData(): string {
  const records = loadCalibrationRecords();
  const table = loadCalibrationTable();

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    calibrationTable: table,
    records,
  }, null, 2);
}

/**
 * 导入校准数据
 */
export function importCalibrationData(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString);
    if (data.calibrationTable) {
      saveCalibrationTable(data.calibrationTable);
    }
    if (data.records && Array.isArray(data.records)) {
      saveCalibrationRecords(data.records);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 清空校准数据（重置）
 */
export function resetCalibrationData(): void {
  localStorage.removeItem(STORAGE_KEYS.CALIBRATION_TABLE);
  localStorage.removeItem(STORAGE_KEYS.CALIBRATION_RECORDS);
}
