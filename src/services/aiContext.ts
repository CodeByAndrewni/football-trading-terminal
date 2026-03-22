import type { AdvancedMatch, MatchEvent } from '../data/advancedMockData';
import { calculateDynamicScore } from './scoringEngine';

export type AiTeamSide = 'home' | 'away';

export interface AiOdds {
  handicap?: { home: number | null; value: number | null; away: number | null };
  overUnder?: { over: number | null; total: number | null; under: number | null };
  matchWinner?: { home: number | null; draw: number | null; away: number | null };
  bts?: { yes: number | null; no: number | null };
  source?: 'live' | 'prematch' | null;
  noOdds?: boolean;
}

export interface AiMatchCard {
  id: number;
  leagueShort: string;
  minute: number;
  status: string;

  home: { name: string; score: number; handicap: number | null; rank?: number | null };
  away: { name: string; score: number; overUnder: number | null; rank?: number | null };

  corners: { home: number | null; away: number | null } | null;
  cardsYellow: { home: number | null; away: number | null } | null;
  cardsRed: { home: number | null; away: number | null } | null;

  stats: {
    possession: { home: number | null; away: number | null } | null;
    shots: { home: number | null; away: number | null } | null;
    shotsOnTarget: { home: number | null; away: number | null } | null;
    xG: { home: number | null; away: number | null } | null;
  } | null;

  odds: AiOdds;

  killScore: number | null;

  score?: {
    totalScore: number | null;
    confidence: number | null;
    stars: number | null;
    recommendation: string | null;
    alerts: string[];
    dataHealthScore: number | null;
    oddsHealthScore: number | null;
  };

  events?: {
    minute: number;
    type: string;
    team: AiTeamSide;
    player: string | null;
    detail?: string | null;
  }[];

  /** 预测、伤病、阵容、对战、球队赛季统计等（体积可能较大，已截断） */
  enrichment?: unknown;
}

export interface AiMatchIndex {
  id: number;
  league: string;
  home: string;
  away: string;
  score: string;
  minute: number;
  status: string;
}

export interface AiChatContext {
  generatedAt: string;
  meta?: {
    cacheAgeSeconds?: number | null;
    matchCount: number;
    totalLive: number;
    /** 详细区 matches 中，至少有一项可解析盘口（亚盘/大小/胜平负/BTS）的场次数 */
    detailMatchesWithOddsMarkets?: number;
    /** 本 snapshot 聚合了哪些数据维度（供模型自检） */
    aggregatedDimensions?: string;
    /** 用户指定或从消息解析的焦点场次（详细区第一场优先为该场） */
    focusFixtureId?: number | null;
  };
  topN: number;
  matches: AiMatchCard[];
  allMatchIndex?: AiMatchIndex[];
}

function safeInt(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
}

function safeNumber(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const ENRICHMENT_JSON_MAX = 6000;
const ENRICHMENT_JSON_MAX_FOCUS = 12000;

function compactEnrichmentForPrompt(e: unknown, maxChars: number = ENRICHMENT_JSON_MAX): unknown {
  if (e == null) return undefined;
  try {
    const s = JSON.stringify(e);
    if (s.length <= maxChars) return e;
    return {
      _truncated: true,
      _note: `JSON 长度 ${s.length}，已截断至 ${maxChars} 字符`,
      preview: s.slice(0, maxChars),
    };
  } catch {
    return { _error: 'enrichment_not_serializable' };
  }
}

function extractTeamSide(e: MatchEvent | undefined): AiTeamSide {
  if (!e) return 'home';
  return e.teamSide === 'away' ? 'away' : 'home';
}

function miniEvents(
  events: MatchEvent[] | undefined,
  maxEventsPerMatch: number,
): AiMatchCard['events'] | undefined {
  if (!events || events.length === 0) return undefined;

  const simplified = events
    .map((e) => {
      const minute = safeInt(e.minute ?? e.time?.elapsed);
      if (minute == null) return null;

      return {
        minute,
        type: typeof e.type === 'string' ? e.type : 'other',
        team: extractTeamSide(e),
        player: e.player?.name ?? null,
        detail: e.detail ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (simplified.length === 0) return undefined;
  simplified.sort((a, b) => a.minute - b.minute);
  return simplified.slice(-maxEventsPerMatch);
}

function extractOdds(m: AdvancedMatch): AiOdds {
  const raw = (m as any).odds;
  const noOddsFromProvider = (m as any).noOddsFromProvider === true;
  // 若供应商标记无赔率，但对象里仍有 SUCCESS 且已解析出的盘口，仍以实际字段为准（避免 KV/序列化丢 flag）
  const hasParsedMarketsInRaw =
    raw &&
    (raw._fetch_status === 'SUCCESS' ||
      (raw.handicap && (raw.handicap.value != null || raw.handicap.home != null || raw.handicap.away != null)) ||
      (raw.overUnder && (raw.overUnder.total != null || raw.overUnder.over != null || raw.overUnder.under != null)) ||
      (raw.matchWinner && (raw.matchWinner.home != null || raw.matchWinner.draw != null || raw.matchWinner.away != null)) ||
      (raw.bothTeamsScore && raw.bothTeamsScore.yes != null));

  if (!raw || (noOddsFromProvider && !hasParsedMarketsInRaw)) {
    return { noOdds: true, source: (m as any)._oddsSource ?? null };
  }

  const result: AiOdds = {
    source: (m as any)._oddsSource ?? null,
  };

  if (raw.handicap && (raw.handicap.home != null || raw.handicap.value != null)) {
    result.handicap = {
      home: safeNumber(raw.handicap.home),
      value: safeNumber(raw.handicap.value),
      away: safeNumber(raw.handicap.away),
    };
  }

  if (raw.overUnder && (raw.overUnder.total != null || raw.overUnder.over != null)) {
    result.overUnder = {
      over: safeNumber(raw.overUnder.over),
      total: safeNumber(raw.overUnder.total),
      under: safeNumber(raw.overUnder.under),
    };
  }

  if (raw.matchWinner && (raw.matchWinner.home != null || raw.matchWinner.draw != null)) {
    result.matchWinner = {
      home: safeNumber(raw.matchWinner.home),
      draw: safeNumber(raw.matchWinner.draw),
      away: safeNumber(raw.matchWinner.away),
    };
  }

  if (raw.bothTeamsScore && (raw.bothTeamsScore.yes != null)) {
    result.bts = {
      yes: safeNumber(raw.bothTeamsScore.yes),
      no: safeNumber(raw.bothTeamsScore.no),
    };
  }

  const hasAnyOdds = result.handicap || result.overUnder || result.matchWinner || result.bts;
  if (!hasAnyOdds) {
    result.noOdds = true;
  }

  return result;
}

export type AiScoreResultRow = {
  totalScore: number | null;
  confidence: number | null;
  stars: number | null;
  recommendation: string | null;
  alerts: string[] | undefined;
  dataHealthScore: number | null;
  oddsHealthScore: number | null;
};

/** 与终端 UI 一致的动态评分（无赔率因子扩展）；不可评分场次跳过 */
export function buildAiScoreResultsById(matches: AdvancedMatch[]): Record<number, AiScoreResultRow> {
  const out: Record<number, AiScoreResultRow> = {};
  for (const m of matches) {
    try {
      const sr = calculateDynamicScore(m);
      if (!sr) continue;
      out[m.id] = {
        totalScore: sr.totalScore,
        confidence: sr.confidence,
        stars: sr.stars,
        recommendation: sr.recommendation,
        alerts: sr.alerts,
        dataHealthScore: sr.dataHealthScore ?? null,
        oddsHealthScore: sr.oddsHealthScore ?? null,
      };
    } catch {
      // 单场异常数据不拖垮整次 AI 请求
    }
  }
  return out;
}

export function buildMatchContext(
  matches: AdvancedMatch[],
  topN: number,
  params?: {
    cacheAgeSeconds?: number | null;
    includeEvents?: boolean;
    maxEventsPerMatch?: number;
    allMatches?: AdvancedMatch[];
    scoreResultsById?: Record<number, AiScoreResultRow>;
    /** 该场 enrichment 使用更高字符上限（与 message 中点名场次配合） */
    focusMatchId?: number | null;
  },
): AiChatContext {
  const includeEvents = params?.includeEvents ?? false;
  const maxEventsPerMatch = params?.maxEventsPerMatch ?? 20;
  const scoreResultsById = params?.scoreResultsById ?? {};
  const focusMatchId = params?.focusMatchId ?? null;
  const allMatches = params?.allMatches ?? matches;

  const sliced = matches.slice(0, topN);
  const detailIds = new Set(sliced.map((m) => m.id));

  const allMatchIndex: AiMatchIndex[] = allMatches
    .filter((m) => !detailIds.has(m.id))
    .map((m) => ({
      id: m.id,
      league: m.leagueShort,
      home: m.home.name,
      away: m.away.name,
      score: `${safeInt(m.home.score) ?? 0}-${safeInt(m.away.score) ?? 0}`,
      minute: safeInt(m.minute) ?? 0,
      status: m.status,
    }));

  let detailMatchesWithOddsMarkets = 0;
  for (const m of sliced) {
    const o = extractOdds(m);
    if (!o.noOdds) detailMatchesWithOddsMarkets++;
  }

  return {
    generatedAt: new Date().toISOString(),
    meta: {
      cacheAgeSeconds: params?.cacheAgeSeconds ?? null,
      matchCount: sliced.length,
      totalLive: allMatches.length,
      detailMatchesWithOddsMarkets,
      aggregatedDimensions:
        'live fixtures + statistics + events + odds (prematch+live when API returns) + standings ranks + enrichment (predictions, injuries, lineups, h2h, team season stats); allMatchIndex is compact index only (no odds)',
      focusFixtureId: focusMatchId,
    },
    topN: topN,
    matches: sliced.map((m) => {
      const corners =
        m.corners && typeof m.corners.home === 'number' && typeof m.corners.away === 'number'
          ? { home: safeInt(m.corners.home), away: safeInt(m.corners.away) }
          : null;

      const cardsRed =
        m.cards?.red &&
        typeof m.cards.red.home === 'number' &&
        typeof m.cards.red.away === 'number'
          ? { home: safeInt(m.cards.red.home), away: safeInt(m.cards.red.away) }
          : null;

      const cardsYellow =
        m.cards?.yellow &&
        typeof m.cards.yellow.home === 'number' &&
        typeof m.cards.yellow.away === 'number'
          ? { home: safeInt(m.cards.yellow.home), away: safeInt(m.cards.yellow.away) }
          : null;

      const stats = m.stats
        ? {
            possession: {
              home: safeNumber(m.stats.possession?.home),
              away: safeNumber(m.stats.possession?.away),
            },
            shots: {
              home: safeNumber(m.stats.shots?.home),
              away: safeNumber(m.stats.shots?.away),
            },
            shotsOnTarget: {
              home: safeNumber(m.stats.shotsOnTarget?.home),
              away: safeNumber(m.stats.shotsOnTarget?.away),
            },
            xG: {
              home: safeNumber(m.stats.xG?.home),
              away: safeNumber(m.stats.xG?.away),
            },
          }
        : null;

      const scoreSummary = scoreResultsById[m.id];

      const enr = (m as { enrichment?: unknown }).enrichment;

      return {
        id: m.id,
        leagueShort: m.leagueShort,
        minute: safeInt(m.minute) ?? 0,
        status: m.status,
        home: {
          name: m.home.name,
          score: safeInt(m.home.score) ?? 0,
          handicap: m.home.handicap ?? null,
          rank: m.home.rank ?? null,
        },
        away: {
          name: m.away.name,
          score: safeInt(m.away.score) ?? 0,
          overUnder: m.away.overUnder ?? null,
          rank: m.away.rank ?? null,
        },
        corners,
        cardsYellow,
        cardsRed,
        stats,
        odds: extractOdds(m),
        killScore: safeNumber(m.killScore),
        score: scoreSummary
          ? {
              totalScore: scoreSummary.totalScore,
              confidence: scoreSummary.confidence,
              stars: scoreSummary.stars,
              recommendation: scoreSummary.recommendation,
              alerts: scoreSummary.alerts ?? [],
              dataHealthScore: scoreSummary.dataHealthScore,
              oddsHealthScore: scoreSummary.oddsHealthScore,
            }
          : undefined,
        events: includeEvents ? miniEvents(m.events, maxEventsPerMatch) : undefined,
        enrichment: compactEnrichmentForPrompt(
          enr,
          m.id === focusMatchId ? ENRICHMENT_JSON_MAX_FOCUS : ENRICHMENT_JSON_MAX,
        ),
      };
    }),
    allMatchIndex: allMatchIndex.length > 0 ? allMatchIndex : undefined,
  };
}
