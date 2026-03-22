import type { AdvancedMatch, MatchEvent } from '../data/advancedMockData';

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

  home: { name: string; score: number; handicap: number | null };
  away: { name: string; score: number; overUnder: number | null };

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

function extractOdds(m: AdvancedMatch): AiOdds {
  const raw = (m as any).odds;
  if (!raw || (m as any).noOddsFromProvider) {
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
      };
    }),
  };
}
