import type { AdvancedMatch, MatchEvent } from '../data/advancedMockData';

export type AiTeamSide = 'home' | 'away';

export interface AiMatchCard {
  id: number;
  leagueShort: string;
  minute: number;
  status: string;

  home: { name: string; score: number; handicap: number | null };
  away: { name: string; score: number; overUnder: number | null };

  corners: { home: number | null; away: number | null } | null;
  cardsRed: { home: number | null; away: number | null } | null;

  stats: {
    possession: { home: number | null; away: number | null } | null;
    shots: { home: number | null; away: number | null } | null;
    shotsOnTarget: { home: number | null; away: number | null } | null;
    xG: { home: number | null; away: number | null } | null;
  } | null;

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

  // 仅用于需要“进球/红牌时间点”时的辅助（可选、默认不填）
  events?: {
    minute: number;
    type: string;
    team: AiTeamSide;
    player: string | null;
    detail?: string | null;
  }[];
}

export interface AiChatContext {
  generatedAt: string;
  meta?: {
    cacheAgeSeconds?: number | null;
    matchCount: number;
  };
  topN: number;
  matches: AiMatchCard[];
}

function safeInt(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
}

function safeNumber(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
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
  return simplified.slice(0, maxEventsPerMatch);
}

/**
 * 把 AdvancedMatch 压缩为 LLM 友好的、尽量短的结构化上下文。
 * - 缺失字段用 `null` 表示
 * - 别在上下文里放大块数据（比如完整 events）
 */
export function buildMatchContext(
  matches: AdvancedMatch[],
  topN: number,
  params?: {
    cacheAgeSeconds?: number | null;
    includeEvents?: boolean;
    maxEventsPerMatch?: number;
    scoreResultsById?: Record<
      number,
      {
        totalScore: number | null;
        confidence: number | null;
        stars: number | null;
        recommendation: string | null;
        alerts: string[] | undefined;
        dataHealthScore: number | null;
        oddsHealthScore: number | null;
      }
    >;
  },
): AiChatContext {
  const includeEvents = params?.includeEvents ?? false;
  const maxEventsPerMatch = params?.maxEventsPerMatch ?? 20;
  const scoreResultsById = params?.scoreResultsById ?? {};

  const sliced = matches.slice(0, topN);

  return {
    generatedAt: new Date().toISOString(),
    meta: {
      cacheAgeSeconds: params?.cacheAgeSeconds ?? null,
      matchCount: matches.length,
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

      return {
        id: m.id,
        leagueShort: m.leagueShort,
        minute: safeInt(m.minute) ?? 0,
        status: m.status,
        home: {
          name: m.home.name,
          score: safeInt(m.home.score) ?? 0,
          handicap: m.home.handicap ?? null,
        },
        away: {
          name: m.away.name,
          score: safeInt(m.away.score) ?? 0,
          overUnder: m.away.overUnder ?? null,
        },
        corners,
        cardsRed,
        stats,
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
      };
    }),
  };
}

