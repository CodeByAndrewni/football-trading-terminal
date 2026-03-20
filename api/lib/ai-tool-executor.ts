/**
 * AI Agent 工具定义与执行（服务端）
 * - 白名单工具，参数校验，API-Football 调用计数
 */

import { getMatches } from './kv.js';
import {
  getFixtureEvents,
  getFixtureStatistics,
  getFixturesQuery,
  getLiveFixtures,
  type Match,
  type MatchEvent,
  type TeamStatistics,
} from './api-football.js';

/** OpenAI/MiniMax Chat Completions 风格的 tools 定义 */
export const AI_AGENT_TOOLS: Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> = [
  {
    type: 'function',
    function: {
      name: 'kv_list_live_matches',
      description:
        '读取 Vercel KV 中缓存的 live 聚合比赛列表（若已配置 KV）。包含 cacheAge、每场 id/队名/比分/分钟/killScore 等摘要。无 KV 或缓存为空时返回说明。',
      parameters: {
        type: 'object',
        properties: {
          maxItems: {
            type: 'integer',
            description: '最多返回多少场摘要，默认 25，最大 40',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apifootball_get_fixtures',
      description:
        '调用 API-Football /fixtures。三选一：live 全部滚球；或按 fixtureId；或按 league+season+date。每次调用消耗 1 次 API 配额。',
      parameters: {
        type: 'object',
        properties: {
          liveAll: {
            type: 'boolean',
            description: '为 true 时拉取 live=all（进行中的比赛）',
          },
          fixtureId: {
            type: 'integer',
            description: '指定单场 id，与 liveAll / 日期查询互斥',
          },
          league: { type: 'integer', description: '联赛 id，需与 season、date 同用' },
          season: { type: 'integer', description: '赛季年份' },
          date: { type: 'string', description: '日期 YYYY-MM-DD' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apifootball_get_statistics',
      description: '获取单场 team statistics（射门、角球总数等）。每次调用消耗 1 次 API 配额。',
      parameters: {
        type: 'object',
        properties: {
          fixtureId: { type: 'integer', description: '比赛 fixture id' },
        },
        required: ['fixtureId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apifootball_get_events',
      description:
        '获取单场事件（进球、换人、牌、VAR 等）。角球通常无分钟级事件。每次调用消耗 1 次 API 配额。返回会截断过长列表。',
      parameters: {
        type: 'object',
        properties: {
          fixtureId: { type: 'integer', description: '比赛 fixture id' },
          maxEvents: {
            type: 'integer',
            description: '最多返回多少条事件，默认 60，最大 80',
          },
        },
        required: ['fixtureId'],
      },
    },
  },
];

export type FootballQuota = {
  /** 本次请求已消耗的 API-Football 调用次数 */
  used: number;
  max: number;
  tryConsume(): boolean;
};

export function createFootballQuota(maxCalls: number): FootballQuota {
  let used = 0;
  return {
    get used() {
      return used;
    },
    max: maxCalls,
    tryConsume() {
      if (used >= maxCalls) return false;
      used++;
      return true;
    },
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeFixtureId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 2_000_000_000) {
    return Math.floor(v);
  }
  return null;
}

function slimFixture(m: Match): Record<string, unknown> {
  return {
    id: m.fixture.id,
    date: m.fixture.date,
    status: m.fixture.status,
    league: m.league?.name,
    leagueId: m.league?.id,
    home: m.teams.home.name,
    away: m.teams.away.name,
    goals: m.goals,
  };
}

function slimStats(rows: TeamStatistics[]): unknown {
  return rows.map((t) => ({
    team: t.team.name,
    statistics: t.statistics?.slice(0, 40),
  }));
}

function slimEvents(ev: MatchEvent[], max: number): unknown {
  const slice = ev.slice(-max);
  return slice.map((e) => ({
    minute: e.time.elapsed + (e.time.extra ? `+${e.time.extra}` : ''),
    type: e.type,
    detail: e.detail,
    team: e.team?.name,
    player: e.player?.name,
  }));
}

export type ExecuteToolResult =
  | { ok: true; content: string }
  | { ok: false; content: string };

/**
 * 执行单个工具，content 为传入模型的 tool 消息正文（JSON 字符串）
 */
export async function executeAgentTool(args: {
  name: string;
  argumentsJson: string;
  quota: FootballQuota;
  canUseKv: boolean;
}): Promise<ExecuteToolResult> {
  const { name, quota } = args;
  let parsed: unknown;
  try {
    parsed = args.argumentsJson.trim() ? JSON.parse(args.argumentsJson) : {};
  } catch {
    return { ok: false, content: JSON.stringify({ error: 'INVALID_JSON_ARGUMENTS' }) };
  }
  const obj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};

  try {
    switch (name) {
      case 'kv_list_live_matches': {
        if (!args.canUseKv) {
          return {
            ok: true,
            content: JSON.stringify({
              available: false,
              message: 'KV 未配置或不可用；请改用 apifootball_get_fixtures(liveAll=true)。',
            }),
          };
        }
        const maxItems = clamp(typeof obj.maxItems === 'number' ? obj.maxItems : 25, 1, 40);
        const kv = await getMatches();
        if (!kv || !Array.isArray(kv.matches) || kv.matches.length === 0) {
          return {
            ok: true,
            content: JSON.stringify({
              available: true,
              cacheAgeSeconds: kv?.cacheAge ?? null,
              count: 0,
              matches: [],
              message: 'KV 已配置但当前缓存为空，可先请求 /api/matches 刷新或改用 apifootball_get_fixtures。',
            }),
          };
        }
        const matches = kv.matches.slice(0, maxItems).map((m: unknown) => {
          const row = m as Record<string, unknown>;
          return {
            id: row.id,
            homeTeam: row.homeTeam,
            awayTeam: row.awayTeam,
            score: row.score,
            minute: row.minute,
            league: row.league,
            killScore: row.killScore,
            totalScore: row.totalScore,
          };
        });
        return {
          ok: true,
          content: JSON.stringify({
            available: true,
            cacheAgeSeconds: kv.cacheAge,
            count: matches.length,
            matches,
          }),
        };
      }

      case 'apifootball_get_fixtures': {
        const fid = safeFixtureId(obj.fixtureId);
        const liveAll = obj.liveAll === true;
        const league = typeof obj.league === 'number' ? obj.league : null;
        const season = typeof obj.season === 'number' ? obj.season : null;
        const date = typeof obj.date === 'string' ? obj.date : null;

        const argsOk =
          fid !== null ||
          liveAll ||
          (league !== null &&
            season !== null &&
            date !== null &&
            /^\d{4}-\d{2}-\d{2}$/.test(date));

        if (!argsOk) {
          return {
            ok: false,
            content: JSON.stringify({
              error: 'INVALID_ARGUMENTS',
              hint: 'Specify fixtureId, or liveAll:true, or league+season+date(YYYY-MM-DD).',
            }),
          };
        }

        if (!quota.tryConsume()) {
          return {
            ok: false,
            content: JSON.stringify({ error: 'FOOTBALL_API_QUOTA_EXCEEDED', max: quota.max }),
          };
        }

        let list: Match[];
        if (fid !== null) {
          list = await getFixturesQuery({ id: String(fid) });
        } else if (liveAll) {
          list = await getLiveFixtures();
        } else {
          list = await getFixturesQuery({
            league: String(league),
            season: String(season),
            date: date!,
          });
        }

        const slim = list.slice(0, 30).map(slimFixture);
        return { ok: true, content: JSON.stringify({ count: list.length, fixtures: slim }) };
      }

      case 'apifootball_get_statistics': {
        const fid = safeFixtureId(obj.fixtureId);
        if (fid === null) {
          return { ok: false, content: JSON.stringify({ error: 'INVALID_FIXTURE_ID' }) };
        }
        if (!quota.tryConsume()) {
          return {
            ok: false,
            content: JSON.stringify({ error: 'FOOTBALL_API_QUOTA_EXCEEDED', max: quota.max }),
          };
        }
        const stats = await getFixtureStatistics(fid);
        return { ok: true, content: JSON.stringify(slimStats(stats)) };
      }

      case 'apifootball_get_events': {
        const fid = safeFixtureId(obj.fixtureId);
        if (fid === null) {
          return { ok: false, content: JSON.stringify({ error: 'INVALID_FIXTURE_ID' }) };
        }
        if (!quota.tryConsume()) {
          return {
            ok: false,
            content: JSON.stringify({ error: 'FOOTBALL_API_QUOTA_EXCEEDED', max: quota.max }),
          };
        }
        const maxEv = clamp(typeof obj.maxEvents === 'number' ? obj.maxEvents : 60, 1, 80);
        const events = await getFixtureEvents(fid);
        return {
          ok: true,
          content: JSON.stringify({
            fixtureId: fid,
            total: events.length,
            events: slimEvents(events, maxEv),
          }),
        };
      }

      default:
        return { ok: false, content: JSON.stringify({ error: 'UNKNOWN_TOOL', name }) };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: true, content: JSON.stringify({ error: 'TOOL_EXECUTION_FAILED', message: msg }) };
  }
}

export function getDefaultMaxFootballCalls(): number {
  const raw = process.env.AI_AGENT_MAX_FOOTBALL_CALLS;
  const n = raw ? Number.parseInt(raw, 10) : 20;
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(n, 50);
}

export function getDefaultMaxToolRounds(): number {
  const raw = process.env.AI_AGENT_MAX_TOOL_ROUNDS;
  const n = raw ? Number.parseInt(raw, 10) : 4;
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.min(n, 8);
}
