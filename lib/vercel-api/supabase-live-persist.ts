/**
 * Supabase 持久化：将每次 refresh 的 live 数据写入 raw 表
 * 包括 raw_fixtures、raw_events、raw_statistics、raw_odds
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) {
    _client = null;
    return null;
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function isLivePersistConfigured(): boolean {
  return getClient() !== null;
}

interface AggregatedMatch {
  id: number;
  leagueId?: number;
  leagueName?: string;
  leagueShort?: string;
  status?: string;
  minute?: number;
  home?: { id?: number; name?: string; score?: number; rank?: number | null };
  away?: { id?: number; name?: string; score?: number; rank?: number | null };
  events?: Array<{
    time?: { elapsed?: number; extra?: number | null };
    team?: { id?: number; name?: string };
    type?: string;
    detail?: string;
    player?: { id?: number; name?: string };
    assist?: { id?: number; name?: string };
    comments?: string | null;
  }>;
  stats?: {
    possession?: { home?: number; away?: number };
    shots?: { home?: number; away?: number };
    shotsOnTarget?: { home?: number; away?: number };
    xG?: { home?: number; away?: number };
    corners?: { home?: number; away?: number };
    fouls?: { home?: number; away?: number };
    offsides?: { home?: number; away?: number };
    passes?: { home?: number; away?: number };
    passesAccurate?: { home?: number; away?: number };
    saves?: { home?: number; away?: number };
    _realDataAvailable?: boolean;
  };
  corners?: { home?: number; away?: number };
  cards?: { yellow?: { home?: number; away?: number }; red?: { home?: number; away?: number } };
  odds?: {
    handicap?: { value?: number | null; home?: number | null; away?: number | null };
    overUnder?: { total?: number | null; over?: number | null; under?: number | null };
    matchWinner?: { home?: number | null; draw?: number | null; away?: number | null };
    bothTeamsScore?: { yes?: number | null; no?: number | null };
    bts?: { yes?: number | null; no?: number | null };
    _oddsSource?: string;
    _fetch_status?: string;
  };
  /** 与聚合层 AdvancedMatch 一致 */
  _oddsSource?: 'live' | 'prematch' | null;
  timestamp?: number;
  round?: string;
  enrichment?: unknown;
}

export type PersistTier = 'gold' | 'silver' | 'bronze';

/** 金：已解析出至少一类盘口；银：无完整盘口但有统计或事件；铜：其余 */
function getPersistTier(m: AggregatedMatch): { tier: PersistTier; reason: string } {
  const o = m.odds;
  const btsYes = o?.bothTeamsScore?.yes ?? o?.bts?.yes;
  const hasParsedOdds =
    o &&
    o._fetch_status === 'SUCCESS' &&
    (o.handicap?.value != null ||
      o.handicap?.home != null ||
      o.overUnder?.total != null ||
      o.matchWinner?.home != null ||
      btsYes != null);

  if (hasParsedOdds) return { tier: 'gold', reason: 'parsed_odds' };

  const s = m.stats;
  const hasStats = s && s._realDataAvailable;
  const evLen = m.events?.length ?? 0;
  if (hasStats && evLen > 0) return { tier: 'silver', reason: 'stats_and_events' };
  if (hasStats) return { tier: 'silver', reason: 'stats_only' };
  if (evLen > 0) return { tier: 'silver', reason: 'events_only' };

  return { tier: 'bronze', reason: 'minimal' };
}

function eventHash(fixtureId: number, evt: AggregatedMatch['events'] extends (infer E)[] | undefined ? E : never): string {
  return `${fixtureId}_${evt.time?.elapsed ?? 0}_${evt.type ?? ''}_${evt.team?.id ?? 0}_${evt.player?.id ?? 0}_${evt.detail ?? ''}`;
}

/**
 * Persist aggregated match data to Supabase raw tables.
 * Runs fire-and-forget — errors are logged but don't break the refresh cycle.
 */
export async function persistLiveToSupabase(matches: unknown[]): Promise<void> {
  const sb = getClient();
  if (!sb || matches.length === 0) return;

  const now = new Date().toISOString();
  const typed = matches as AggregatedMatch[];

  try {
    let goldN = 0;
    let silverN = 0;
    let bronzeN = 0;

    // 1. raw_fixtures — upsert basic match info
    const fixtureRows = typed.map((m) => {
      const { tier, reason } = getPersistTier(m);
      if (tier === 'gold') goldN++;
      else if (tier === 'silver') silverN++;
      else bronzeN++;

      return {
        fixture_id: m.id,
        league_id: m.leagueId ?? 0,
        season: new Date().getFullYear(),
        match_date: new Date().toISOString().split('T')[0],
        kickoff: m.timestamp ? new Date(m.timestamp * 1000).toISOString() : now,
        home_team_id: m.home?.id ?? 0,
        away_team_id: m.away?.id ?? 0,
        home_team_name: m.home?.name ?? null,
        away_team_name: m.away?.name ?? null,
        home_score: m.home?.score ?? null,
        away_score: m.away?.score ?? null,
        status: m.status ?? 'LIVE',
        raw: {
          home_rank: m.home?.rank ?? null,
          away_rank: m.away?.rank ?? null,
          enrichment: m.enrichment ?? null,
          captured_at: now,
          persist_tier: tier,
          persist_tier_reason: reason,
        },
      };
    });

    const { error: fErr } = await sb
      .from('raw_fixtures')
      .upsert(fixtureRows, { onConflict: 'fixture_id' });
    if (fErr) console.error('[LivePersist] raw_fixtures upsert error:', fErr.message);

    // 2. raw_events — insert new events (ignore duplicates via event_hash unique constraint)
    const eventRows: Array<{
      fixture_id: number;
      minute: number;
      extra_minute: number | null;
      team_id: number | null;
      team_name: string | null;
      event_type: string;
      detail: string | null;
      player_id: number | null;
      player_name: string | null;
      assist_id: number | null;
      assist_name: string | null;
      comments: string | null;
      event_hash: string;
    }> = [];

    for (const m of typed) {
      if (!m.events) continue;
      for (const evt of m.events) {
        eventRows.push({
          fixture_id: m.id,
          minute: evt.time?.elapsed ?? 0,
          extra_minute: evt.time?.extra ?? null,
          team_id: evt.team?.id ?? null,
          team_name: evt.team?.name ?? null,
          event_type: evt.type ?? 'unknown',
          detail: evt.detail ?? null,
          player_id: evt.player?.id ?? null,
          player_name: evt.player?.name ?? null,
          assist_id: evt.assist?.id ?? null,
          assist_name: evt.assist?.name ?? null,
          comments: evt.comments ?? null,
          event_hash: eventHash(m.id, evt),
        });
      }
    }

    if (eventRows.length > 0) {
      const { error: eErr } = await sb
        .from('raw_events')
        .upsert(eventRows, { onConflict: 'fixture_id,event_hash', ignoreDuplicates: true });
      if (eErr) console.error('[LivePersist] raw_events upsert error:', eErr.message);
    }

    // 3. raw_statistics — insert time-series snapshot (one per fixture per captured_at)
    const statRows: Array<Record<string, unknown>> = [];
    for (const m of typed) {
      const s = m.stats;
      if (!s || !s._realDataAvailable) continue;
      statRows.push({
        fixture_id: m.id,
        minute: m.minute ?? 0,
        shots_home: s.shots?.home ?? 0,
        shots_away: s.shots?.away ?? 0,
        shots_on_home: s.shotsOnTarget?.home ?? 0,
        shots_on_away: s.shotsOnTarget?.away ?? 0,
        xg_home: s.xG?.home ?? null,
        xg_away: s.xG?.away ?? null,
        corners_home: m.corners?.home ?? s.corners?.home ?? 0,
        corners_away: m.corners?.away ?? s.corners?.away ?? 0,
        possession_home: s.possession?.home ?? 50,
        possession_away: s.possession?.away ?? 50,
        fouls_home: s.fouls?.home ?? 0,
        fouls_away: s.fouls?.away ?? 0,
        offsides_home: s.offsides?.home ?? 0,
        offsides_away: s.offsides?.away ?? 0,
        yellow_cards_home: m.cards?.yellow?.home ?? 0,
        yellow_cards_away: m.cards?.yellow?.away ?? 0,
        red_cards_home: m.cards?.red?.home ?? 0,
        red_cards_away: m.cards?.red?.away ?? 0,
        saves_home: s.saves?.home ?? 0,
        saves_away: s.saves?.away ?? 0,
        passes_home: s.passes?.home ?? 0,
        passes_away: s.passes?.away ?? 0,
        passes_accurate_home: s.passesAccurate?.home ?? 0,
        passes_accurate_away: s.passesAccurate?.away ?? 0,
        captured_at: now,
      });
    }

    if (statRows.length > 0) {
      const { error: sErr } = await sb
        .from('raw_statistics')
        .insert(statRows);
      if (sErr && !sErr.message?.includes('duplicate')) {
        console.error('[LivePersist] raw_statistics insert error:', sErr.message);
      }
    }

    // 4. raw_odds — snapshot current odds
    const oddsRows: Array<Record<string, unknown>> = [];
    for (const m of typed) {
      const o = m.odds;
      if (!o || o._fetch_status !== 'SUCCESS') continue;
      const isLive = m._oddsSource === 'live' || o._oddsSource === 'live';

      if (o.handicap?.value != null) {
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: 'AH', line: o.handicap.value, selection: 'Home', odds: o.handicap.home ?? 0, is_live: isLive, captured_at: now });
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: 'AH', line: o.handicap.value, selection: 'Away', odds: o.handicap.away ?? 0, is_live: isLive, captured_at: now });
      }
      if (o.overUnder?.total != null) {
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: 'OU', line: o.overUnder.total, selection: 'Over', odds: o.overUnder.over ?? 0, is_live: isLive, captured_at: now });
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: 'OU', line: o.overUnder.total, selection: 'Under', odds: o.overUnder.under ?? 0, is_live: isLive, captured_at: now });
      }
      if (o.matchWinner?.home != null) {
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: '1X2', line: null, selection: 'Home', odds: o.matchWinner.home, is_live: isLive, captured_at: now });
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: '1X2', line: null, selection: 'Draw', odds: o.matchWinner.draw ?? 0, is_live: isLive, captured_at: now });
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: '1X2', line: null, selection: 'Away', odds: o.matchWinner.away ?? 0, is_live: isLive, captured_at: now });
      }
      const bts = o.bothTeamsScore ?? o.bts;
      if (bts?.yes != null) {
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: 'BTS', line: null, selection: 'Yes', odds: bts.yes, is_live: isLive, captured_at: now });
        oddsRows.push({ fixture_id: m.id, bookmaker: 'aggregated', market: 'BTS', line: null, selection: 'No', odds: bts.no ?? 0, is_live: isLive, captured_at: now });
      }
    }

    if (oddsRows.length > 0) {
      const { error: oErr } = await sb
        .from('raw_odds')
        .insert(oddsRows);
      if (oErr && !oErr.message?.includes('duplicate')) {
        console.error('[LivePersist] raw_odds insert error:', oErr.message);
      }
    }

    console.log(
      `[LivePersist] Done: ${fixtureRows.length} fixtures (gold ${goldN} / silver ${silverN} / bronze ${bronzeN}), ${eventRows.length} events, ${statRows.length} stats, ${oddsRows.length} odds rows`,
    );
  } catch (e) {
    console.error('[LivePersist] Unexpected error:', e instanceof Error ? e.message : e);
  }
}
