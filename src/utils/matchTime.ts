import type { AdvancedMatch } from '../data/advancedMockData';

// 估算显示用分钟：使用 API 返回的 minute 作为基准，叠加一个小的本地增量，并做上限保护。
export function computeDisplayMinute(match: AdvancedMatch, deltaMinutes: number): number {
  const status = match.status?.toLowerCase?.() ?? match.status;
  const nonRunningStatuses = new Set(['ht', 'ns', '未开始', 'ft', 'aet', 'pen']);

  if (nonRunningStatuses.has(status as string)) {
    return match.minute;
  }

  const base = match.minute + deltaMinutes;
  const capped = Math.max(0, Math.min(base, 120));
  return capped;
}

/**
 * 格式化比赛时间：
 * - HT/NS/FT/AET/PEN 使用现有短文案
 * - 进行中时优先显示补时时间（45'+X / 90'+X），否则显示 displayMinute'
 */
export function formatMatchMinute(match: AdvancedMatch, deltaMinutes: number): string {
  const status = match.status?.toLowerCase?.() ?? match.status;

  if (status === 'ht') return '半';
  if (status === 'ns' || status === '未开始') return '未';
  if (status === 'ft') return '完';
  if (status === 'aet') return '加';
  if (status === 'pen') return '点';

  const displayMinute = computeDisplayMinute(match, deltaMinutes);

  const extra = match.extraMinute ?? null;
  if (extra && extra > 0) {
    // 简单区分上半场/下半场补时：以 API 返回的 minute 为参考
    if (match.minute < 60) {
      return `45'+${extra}`;
    }
    return `90'+${extra}`;
  }

  return `${displayMinute}'`;
}

