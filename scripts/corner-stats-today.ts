/**
 * 查询「今天」所有比赛中有角球数据的比赛，并说明 85'/90'/85' 进球后角球几率的 API 限制
 *
 * 使用 API Football:
 * - GET /fixtures?date=YYYY-MM-DD  今日赛程
 * - GET /fixtures/statistics?fixture=id  比赛统计（含 Corner Kicks 总数）
 * - GET /fixtures/events?fixture=id  比赛事件（进球/牌/换人，不含角球事件）
 *
 * 重要：API Football 的 events 仅包含 Goal / Card / subst / Var，不提供角球事件及发生分钟，
 * 因此无法通过该 API 统计「85 分钟后 / 90 分钟补时后 / 85 分钟进球之后」的角球出现几率。
 */

const API_KEY =
  process.env.FOOTBALL_API_KEY ||
  process.env.VITE_FOOTBALL_API_KEY ||
  process.env.API_FOOTBALL_KEY ||
  '';
const API_BASE = 'https://v3.football.api-sports.io';

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function fetchAPI<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(path, API_BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.response as T;
}

// API 返回的统计项：{ type: string, value: number | string }
function getCornerKicks(teamStats: { statistics?: Array<{ type: string; value: number | string }> }): number | null {
  const stat = teamStats.statistics?.find((s) => s.type === 'Corner Kicks');
  if (stat == null) return null;
  const v = stat.value;
  return typeof v === 'number' ? v : parseInt(String(v), 10) || null;
}

// 事件：{ time: { elapsed, extra }, type, detail, ... }
interface ApiEvent {
  time: { elapsed: number; extra: number | null };
  type: string;
  team: { id: number; name: string };
  detail?: string;
}

function isGoal(event: ApiEvent): boolean {
  return event.type === 'Goal' && event.detail !== 'Missed Penalty';
}

async function main() {
  if (!API_KEY) {
    console.error('请设置环境变量 FOOTBALL_API_KEY 或 VITE_FOOTBALL_API_KEY');
    process.exit(1);
  }

  const date = todayISO();
  console.log('日期:', date);
  console.log('请求: GET /fixtures?date=' + date);
  console.log('');

  const fixtures: Array<{
    fixture: { id: number; status: { short: string; elapsed: number | null }; date: string };
    league: { name: string; country: string };
    teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    goals: { home: number | null; away: number | null };
  }> = await fetchAPI('/fixtures', { date });

  if (!fixtures.length) {
    console.log('今日无赛程或暂无数据。');
    return;
  }

  console.log('今日赛程数量:', fixtures.length);
  console.log('');

  const withCorners: Array<{
    id: number;
    home: string;
    away: string;
    league: string;
    status: string;
    cornersHome: number;
    cornersAway: number;
    totalCorners: number;
    goals: Array<{ minute: number; extra: number | null; team: string }>;
    hasGoalAround85: boolean;
  }> = [];

  for (const m of fixtures) {
    const id = m.fixture.id;
    let stats: Array<{ team: { id: number }; statistics?: Array<{ type: string; value: number | string }> }>;
    let events: ApiEvent[];

    try {
      [stats, events] = await Promise.all([
        fetchAPI('/fixtures/statistics', { fixture: id }),
        fetchAPI('/fixtures/events', { fixture: id }),
      ]);
    } catch (e) {
      console.warn(`  [${m.teams.home.name} vs ${m.teams.away.name}] 拉取统计/事件失败:`, (e as Error).message);
      continue;
    }

    const homeStats = stats.find((s) => s.team.id === m.teams.home.id);
    const awayStats = stats.find((s) => s.team.id === m.teams.away.id);
    const cornersHome = getCornerKicks(homeStats || {});
    const cornersAway = getCornerKicks(awayStats || {});

    const hasCornerData = cornersHome !== null || cornersAway !== null;
    if (!hasCornerData) continue;

    const goalEvents = (events || []).filter(isGoal).map((e) => ({
      minute: e.time.elapsed,
      extra: e.time.extra,
      team: e.team?.name ?? '',
    }));

    const hasGoalAround85 = goalEvents.some((g) => g.minute >= 83 && g.minute <= 87);

    withCorners.push({
      id,
      home: m.teams.home.name,
      away: m.teams.away.name,
      league: m.league.name,
      status: m.fixture.status?.short ?? '?',
      cornersHome: cornersHome ?? 0,
      cornersAway: cornersAway ?? 0,
      totalCorners: (cornersHome ?? 0) + (cornersAway ?? 0),
      goals: goalEvents,
      hasGoalAround85,
    });
  }

  console.log('--- 今日「有角球统计」的比赛 ---');
  console.log('(角球数据来自 GET /fixtures/statistics，即每场主客队 Corner Kicks 总数)');
  console.log('');

  if (withCorners.length === 0) {
    console.log('今日赛程中暂无已提供角球统计的比赛（可能未开赛或未结束）。');
  } else {
    for (const row of withCorners) {
      console.log(
        `[${row.league}] ${row.home} vs ${row.away} | 角球 ${row.cornersHome}-${row.cornersAway} (总 ${row.totalCorners}) | 状态 ${row.status}`
      );
      if (row.goals.length) {
        const goalStr = row.goals.map((g) => `${g.minute}'${g.extra ? `+${g.extra}` : ''}`).join(', ');
        console.log(`  进球时间: ${goalStr}${row.hasGoalAround85 ? ' (含 85 分钟附近进球)' : ''}`);
      }
    }
  }

  console.log('');
  console.log('--- 关于「85 分钟 / 90 分钟补时 / 85 分钟进球后」角球几率 ---');
  console.log('API Football 的 GET /fixtures/events 仅包含事件类型: Goal, Card, subst, Var；');
  console.log('不包含角球事件，也没有每条角球的发生时间（分钟）。');
  console.log('因此无法通过该 API 统计：');
  console.log('  - 85 分钟之后角球出现的几率');
  console.log('  - 90 分钟之后（补时阶段）角球出现的几率');
  console.log('  - 85 分钟进球之后角球出现的几率');
  console.log('');
  console.log('若需上述统计，需使用提供「角球事件 + 发生分钟」的数据源（如部分供应商的 play-by-play 或 corner 事件接口）。');
  console.log('');
  console.log('--- 本脚本可提供的汇总 ---');
  const totalMatches = withCorners.length;
  const withGoal85 = withCorners.filter((r) => r.hasGoalAround85).length;
  const avgCorners = totalMatches
    ? withCorners.reduce((s, r) => s + r.totalCorners, 0) / totalMatches
    : 0;
  console.log(`有角球数据的比赛数: ${totalMatches}`);
  console.log(`其中有 83′-87′ 进球的比赛数: ${withGoal85}`);
  console.log(`平均角球数（全场）: ${avgCorners.toFixed(1)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
