/**
 * 中文/俗称 → API 队名常见英文片段（去空格小写后用于 includes）
 * 仅用于「只写一队且 live 里唯一命中」时的焦点解析，可逐步扩充。
 */
export const TEAM_NAME_COMPACT_SNIPPETS: Record<string, string> = {
  曼联: 'manchesterunited',
  曼城: 'manchestercity',
  利物浦: 'liverpool',
  阿森纳: 'arsenal',
  切尔西: 'chelsea',
  热刺: 'tottenham',
  纽卡斯尔: 'newcastle',
  布莱顿: 'brighton',
  西汉姆: 'westham',
  巴塞罗那: 'barcelona',
  巴萨: 'barcelona',
  皇马: 'realmadrid',
  马德里竞技: 'atleticomadrid',
  马竞: 'atleticomadrid',
  拜仁: 'bayern',
  多特蒙德: 'dortmund',
  巴黎: 'psg',
  尤文图斯: 'juventus',
  国米: 'inter',
  AC米兰: 'acmilan',
  曼联队: 'manchesterunited',
  凯尔特人: 'celtic',
  邓迪联: 'dundee',
  流浪者: 'rangers',
};

/** 队名单词级匹配（支持 Utd/United、多词队名），用于从用户话里解析焦点场次 */
function tokenMatchesInMessage(token: string, lower: string): boolean {
  if (token.length < 3) return false;
  if (lower.includes(token)) return true;
  if (token === 'united' || token === 'utd') {
    return lower.includes('utd') || lower.includes('united');
  }
  return false;
}

export function teamNameMatchesLoose(teamName: string, message: string): boolean {
  const lower = message.toLowerCase();
  const tokens = teamName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (tokens.length === 0) return false;
  return tokens.every((t) => tokenMatchesInMessage(t, lower));
}

export function teamPairMatchesMessage(homeName: string, awayName: string, message: string): boolean {
  return teamNameMatchesLoose(homeName, message) && teamNameMatchesLoose(awayName, message);
}
