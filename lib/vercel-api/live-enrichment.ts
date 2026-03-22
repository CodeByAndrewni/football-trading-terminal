/**
 * Live 扩展采集：积分榜（KV 长缓存）、阵容、预测、伤病、对战、球队赛季统计
 */

import { kvGet, kvSet, KV_CONFIG, KV_KEYS } from './kv.js';
import type { Match } from './api-football.js';
import type { AdvancedMatch } from './aggregator.js';
import {
  getStandings,
  getHeadToHead,
  getPredictions,
  getInjuries,
  getFixtureLineups,
  getTeamsStatistics,
} from './api-football.js';

export type TeamRankMap = Map<number, number>;

/** 从 /standings 响应解析 球队 id -> 排名 */
export function parseStandingsToRanks(standingsResponse: unknown): TeamRankMap {
  const map: TeamRankMap = new Map();
  if (!standingsResponse || !Array.isArray(standingsResponse)) return map;
  for (const block of standingsResponse as Array<{ standings?: unknown[][] }>) {
    const groups = block.standings;
    if (!Array.isArray(groups)) continue;
    for (const row of groups) {
      if (!Array.isArray(row)) continue;
      for (const entry of row) {
        const e = entry as { rank?: number; team?: { id?: number } };
        if (typeof e?.team?.id === 'number' && typeof e.rank === 'number') {
          map.set(e.team.id, e.rank);
        }
      }
    }
  }
  return map;
}

export async function getStandingsRanksCached(leagueId: number, season: number): Promise<TeamRankMap | null> {
  const key = KV_KEYS.standings(leagueId, season);
  const cached = await kvGet<{ ranks: Record<string, number> }>(key);
  if (cached?.ranks) {
    const m: TeamRankMap = new Map();
    for (const [k, v] of Object.entries(cached.ranks)) {
      m.set(Number(k), v);
    }
    return m;
  }
  try {
    const raw = await getStandings(leagueId, season);
    const ranks = parseStandingsToRanks(raw);
    const obj: Record<string, number> = {};
    for (const [tid, r] of ranks) obj[String(tid)] = r;
    await kvSet(key, { ranks: obj, at: Date.now() }, KV_CONFIG.STANDINGS_TTL);
    return ranks;
  } catch (e) {
    console.error(`[Enrichment] standings ${leagueId}/${season}:`, e);
    return null;
  }
}

export interface FixtureEnrichment {
  predictions?: unknown;
  injuries?: unknown;
  lineups?: unknown;
  headToHead?: unknown;
  teamStatsHome?: unknown;
  teamStatsAway?: unknown;
}

const defaultBatch = Number(process.env.LIVE_ENRICHMENT_BATCH_SIZE ?? '6');
const defaultDelay = Number(process.env.LIVE_ENRICHMENT_DELAY_MS ?? '40');
const highLoadThreshold = Number(process.env.LIVE_ENRICHMENT_HIGH_LOAD_THRESHOLD ?? '80');

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function getTeamStatsCached(teamId: number, leagueId: number, season: number): Promise<unknown | null> {
  const key = KV_KEYS.teamStats(teamId, leagueId, season);
  const cached = await kvGet<unknown>(key);
  if (cached) return cached;
  try {
    const raw = await getTeamsStatistics(teamId, leagueId, season);
    if (raw) await kvSet(key, raw, KV_CONFIG.TEAM_STATS_TTL);
    return raw;
  } catch {
    return null;
  }
}

/**
 * 按场次拉取扩展数据（分批并行 + 批次间延迟，控制配额）
 */
export async function enrichFixtures(
  fixtures: Match[],
  options?: { batchSize?: number; delayMs?: number; highLoad?: boolean },
): Promise<Map<number, FixtureEnrichment>> {
  const highLoad =
    options?.highLoad === true ||
    (options?.highLoad !== false && fixtures.length >= highLoadThreshold);
  let batchSize = options?.batchSize ?? defaultBatch;
  let delayMs = options?.delayMs ?? defaultDelay;
  if (highLoad && options?.batchSize === undefined) {
    batchSize = Math.min(batchSize, 3);
    delayMs = Math.max(delayMs, 100);
  }
  const out = new Map<number, FixtureEnrichment>();

  if (process.env.LIVE_ENRICHMENT_ENABLED === 'false') {
    return out;
  }

  const teamStatsCache = new Map<string, unknown>();

  for (let i = 0; i < fixtures.length; i += batchSize) {
    const batch = fixtures.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (fx) => {
        const fid = fx.fixture.id;
        const hid = fx.teams.home.id;
        const aid = fx.teams.away.id;
        const lid = fx.league.id;
        const season = fx.league.season;
        const enc: FixtureEnrichment = {};

        try {
          const [pred, inj, lu, h2h] = await Promise.all([
            getPredictions(fid).catch(() => null),
            getInjuries(fid).catch(() => null),
            getFixtureLineups(fid).catch(() => null),
            getHeadToHead(hid, aid).catch(() => null),
          ]);
          if (pred) enc.predictions = pred;
          if (inj) enc.injuries = inj;
          if (lu) enc.lineups = lu;
          if (h2h) enc.headToHead = h2h;
        } catch (e) {
          console.error(`[Enrichment] fixture ${fid} core:`, e);
        }

        const tsKey = (tid: number) => `t:${tid}:${lid}:${season}`;
        try {
          let hRaw = teamStatsCache.get(tsKey(hid));
          if (hRaw === undefined) {
            hRaw = await getTeamStatsCached(hid, lid, season);
            teamStatsCache.set(tsKey(hid), hRaw);
          }
          let aRaw = teamStatsCache.get(tsKey(aid));
          if (aRaw === undefined) {
            aRaw = await getTeamStatsCached(aid, lid, season);
            teamStatsCache.set(tsKey(aid), aRaw);
          }
          if (hRaw) enc.teamStatsHome = hRaw;
          if (aRaw) enc.teamStatsAway = aRaw;
        } catch (e) {
          console.error(`[Enrichment] team stats ${fid}:`, e);
        }

        if (Object.keys(enc).length > 0) out.set(fid, enc);
      }),
    );
    if (i + batchSize < fixtures.length && delayMs > 0) await sleep(delayMs);
  }

  return out;
}

/** 拉取所有 live 场次涉及联赛的积分榜（去重），返回 leagueId:season -> 排名表 */
export async function fetchStandingsForLiveFixtures(
  fixtures: Match[],
  options?: { delayBetweenLeaguesMs?: number },
): Promise<Map<string, TeamRankMap>> {
  const leagueDelay =
    options?.delayBetweenLeaguesMs ??
    Number(process.env.STANDINGS_LEAGUE_DELAY_MS ?? '90');
  const unique = new Map<string, { leagueId: number; season: number }>();
  for (const f of fixtures) {
    const k = `${f.league.id}:${f.league.season}`;
    if (!unique.has(k)) unique.set(k, { leagueId: f.league.id, season: f.league.season });
  }
  const out = new Map<string, TeamRankMap>();
  let first = true;
  for (const [k, { leagueId, season }] of unique) {
    if (!first && leagueDelay > 0) await sleep(leagueDelay);
    first = false;
    const ranks = await getStandingsRanksCached(leagueId, season);
    if (ranks && ranks.size > 0) out.set(k, ranks);
  }
  return out;
}

export function applyRanksToMatches(
  fixtures: Match[],
  matches: AdvancedMatch[],
  leagueSeasonRanks: Map<string, TeamRankMap>,
): void {
  for (const m of matches) {
    const fx = fixtures.find((f) => f.fixture.id === m.id);
    if (!fx) continue;
    const key = `${fx.league.id}:${fx.league.season}`;
    const ranks = leagueSeasonRanks.get(key);
    if (!ranks) continue;
    if (m.home.id != null) m.home.rank = ranks.get(m.home.id) ?? m.home.rank ?? null;
    if (m.away.id != null) m.away.rank = ranks.get(m.away.id) ?? m.away.rank ?? null;
  }
}

export function mergeEnrichmentIntoMatches(
  matches: AdvancedMatch[],
  enrichmentByFixture: Map<number, FixtureEnrichment>,
): void {
  for (const m of matches) {
    const enc = enrichmentByFixture.get(m.id);
    if (enc && Object.keys(enc).length > 0) {
      m.enrichment = enc;
    }
  }
}
