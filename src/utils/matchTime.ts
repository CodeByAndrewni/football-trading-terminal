import type { AdvancedMatch } from '../data/advancedMockData';

/**
 * 使用 API 的 fixture.status.elapsed 作为唯一时间来源，前端不再做本地分钟推算。
 *
 * - HT/NS/FT/AET/PEN 使用短文案
 * - 其他状态直接使用 match.minute（来自 API 的 elapsed）
 */
export function formatMatchMinute(match: AdvancedMatch): string {
  const status = match.status?.toLowerCase?.() ?? match.status;

  if (status === 'ht') return '半';
  if (status === 'ns' || status === '未开始') return '未';
  if (status === 'ft') return '完';
  if (status === 'aet') return '加';
  if (status === 'pen') return '点';

  const extra = match.extraMinute ?? null;
  if (extra && extra > 0) {
    // 简单区分上半场/下半场补时：以 API 返回的 minute 为参考
    if (match.minute < 60) {
      return `45'+${extra}`;
    }
    return `90'+${extra}`;
  }

  return `${match.minute}'`;
}
