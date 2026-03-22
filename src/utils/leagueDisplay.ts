/**
 * 未在 LEAGUE_NAME_MAP 命中时的联赛简称（避免 league.name.slice(0,4) →「Prim」「Segu」）
 */
export function fallbackLeagueShort(rawName: string, maxLen = 14): string {
  const n = (rawName || '').trim();
  if (!n) return '—';
  if (n.length <= maxLen) return n;
  return `${n.slice(0, maxLen - 1)}…`;
}

/** 列表行：联赛简称 + 国家（区分同名联赛） */
export function formatLeagueWithCountry(m: {
  leagueShort?: string;
  league?: string;
  leagueCountry?: string;
}): string {
  const base = (m.leagueShort || m.league || '—').trim();
  const c = (m.leagueCountry || '').trim();
  if (!c) return base;
  return `${base} · ${c}`;
}
