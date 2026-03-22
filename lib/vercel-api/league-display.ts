/** 后端与 aggregator 共用：未知联赛不要用前 4 字缩写 */
export function fallbackLeagueShort(rawName: string, maxLen = 14): string {
  const n = (rawName || '').trim();
  if (!n) return '—';
  if (n.length <= maxLen) return n;
  return `${n.slice(0, maxLen - 1)}…`;
}
