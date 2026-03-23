/**
 * 比赛详情页 — 简洁数据视图
 * 布局：头部比分 → 事件时间轴条 → 统计概览 → 子Tab（事件直播 / 双方阵容 / 攻防走势 / 积分榜）
 */

import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, WifiOff, AlertTriangle, Bot } from 'lucide-react';
import type { AdvancedMatch, MatchEvent } from '../data/advancedMockData';
import { LEAGUE_COLORS } from '../data/advancedMockData';
import { useMatchAdvanced } from '../hooks/useMatches';
import { formatLeagueWithCountry } from '../utils/leagueDisplay';
import { AiChatPanel } from '../components/AiChatPanel';
import { getActiveScenarios } from '../services/modules/scenarioEngine';
import { aggregateScenarioSignals, formatCompositeForAI } from '../services/compositeSignal';

// ============================================
// Helper: format display value, show "-" when missing
// ============================================
function v(n: number | null | undefined): string {
  return n != null ? String(n) : '-';
}

function pct(n: number | null | undefined): string {
  return n != null ? `${n}%` : '-';
}

// ============================================
// Position label
// ============================================
const POS_LABEL: Record<string, string> = {
  G: '门将', D: '后卫', M: '中场', F: '前锋',
};

// ============================================
// Event emoji
// ============================================
function eventIcon(type: string, detail?: string): string {
  const t = type.toLowerCase();
  const d = (detail ?? '').toLowerCase();
  if (t === 'goal') {
    if (d.includes('own')) return '🔴';
    if (d.includes('penalty')) return '⚽🅿️';
    return '⚽';
  }
  if (t === 'card') {
    if (d.includes('red') || d.includes('second yellow')) return '🟥';
    return '🟨';
  }
  if (t === 'subst') return '🔄';
  if (t === 'var') return '📺';
  return '📋';
}

// ============================================
// Sub-tab types
// ============================================
type DetailTab = 'events' | 'lineups' | 'momentum' | 'standings' | 'ai';

function buildMatchContext(m: AdvancedMatch): string {
  const lines: string[] = [
    `📋 **当前比赛上下文** (fixture ${m.id})`,
    `**${m.home.name}** ${m.home.score} - ${m.away.score} **${m.away.name}**`,
    `联赛: ${formatLeagueWithCountry(m)} | 状态: ${m.status} | ${m.minute}'`,
  ];
  const s = m.stats;
  if (s?._realDataAvailable) {
    lines.push('', '**统计:**');
    if (s.possession) lines.push(`控球: ${s.possession.home}% - ${s.possession.away}%`);
    if (s.shots) lines.push(`射门: ${s.shots.home} - ${s.shots.away}`);
    if (s.shotsOnTarget) lines.push(`射正: ${s.shotsOnTarget.home} - ${s.shotsOnTarget.away}`);
    if (s.xG) lines.push(`xG: ${s.xG.home?.toFixed(2)} - ${s.xG.away?.toFixed(2)}`);
    if (m.corners) lines.push(`角球: ${m.corners.home} - ${m.corners.away}`);
  }
  if (m.odds?._fetch_status === 'SUCCESS') {
    lines.push('', '**赔率:**');
    if (m.odds.handicap) lines.push(`让球: ${m.odds.handicap.value} (${m.odds.handicap.home}/${m.odds.handicap.away})`);
    if (m.odds.overUnder) lines.push(`大小: ${m.odds.overUnder.total} (${m.odds.overUnder.over}/${m.odds.overUnder.under})`);
  }
  if (m.cards?.red && ((m.cards.red.home ?? 0) + (m.cards.red.away ?? 0) > 0)) {
    lines.push(`红牌: 主 ${m.cards.red.home ?? 0} / 客 ${m.cards.red.away ?? 0}`);
  }

  // 情景引擎分析
  const activeScenarios = getActiveScenarios(m);
  if (activeScenarios.length > 0) {
    const composite = aggregateScenarioSignals(activeScenarios);
    lines.push('', formatCompositeForAI(composite));
  }

  lines.push('', '你可以直接问「这场该不该进？」「大球还是小球？」等问题。');
  return lines.join('\n');
}

// ============================================
// Page
// ============================================
export function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [tab, setTab] = useState<DetailTab>('events');

  const { data: matchResult, isLoading, isFetching, refetch } = useMatchAdvanced(
    matchId ? Number(matchId) : undefined,
    { refetchInterval: 30000 },
  );

  const match = matchResult?.match ?? null;

  // ---------- Loading ----------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-deepest flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">加载比赛数据…</p>
        </div>
      </div>
    );
  }

  // ---------- Error ----------
  if (!match) {
    return (
      <div className="min-h-screen bg-bg-deepest flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 p-8 bg-bg-card rounded-2xl border border-border-default max-w-md text-center">
          <WifiOff className="w-12 h-12 text-red-500" />
          <h2 className="text-xl font-bold text-text-primary">无法加载比赛</h2>
          <div className="flex gap-3">
            <button onClick={() => refetch()} className="px-4 py-2 bg-accent-primary text-white rounded-lg text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />重试
            </button>
            <Link to="/" className="px-4 py-2 bg-bg-elevated text-text-secondary rounded-lg text-sm">返回大厅</Link>
          </div>
        </div>
      </div>
    );
  }

  const leagueColor = LEAGUE_COLORS[match.league] || LEAGUE_COLORS.默认 || '#666';
  const isLive = ['live', '1h', '2h', 'ht'].includes(match.status);
  const minuteDisplay = match.extraMinute
    ? `${match.minute}+${match.extraMinute}'`
    : `${match.minute}'`;

  const aiContext = useMemo(() => buildMatchContext(match), [match]);

  const tabCls = (t: DetailTab) =>
    `flex-1 py-2 text-xs font-medium text-center transition-colors ${
      tab === t
        ? 'text-accent-primary border-b-2 border-accent-primary'
        : 'text-[#888] hover:text-[#ccc]'
    }`;

  return (
    <div className="min-h-screen bg-bg-deepest">
      {/* ====== Header ====== */}
      <header className="sticky top-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-md border-b border-[#222]">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[#888] hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-medium text-white max-w-[min(240px,70vw)] truncate inline-block align-middle"
              style={{ backgroundColor: leagueColor }}
              title={formatLeagueWithCountry(match)}
            >
              {formatLeagueWithCountry(match)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1a1a1a] text-[#888] hover:text-white text-xs disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        {/* ====== Score Board ====== */}
        <ScoreBoard match={match} minuteDisplay={minuteDisplay} isLive={isLive} />

        {/* ====== Event Timeline Bar ====== */}
        <EventTimelineBar match={match} />

        {/* ====== Stats Overview ====== */}
        <StatsOverview match={match} />

        {/* ====== Sub Tabs ====== */}
        <div className="flex border-b border-[#222] mt-2">
          <button type="button" className={tabCls('events')} onClick={() => setTab('events')}>事件直播</button>
          <button type="button" className={tabCls('lineups')} onClick={() => setTab('lineups')}>双方阵容</button>
          <button type="button" className={tabCls('momentum')} onClick={() => setTab('momentum')}>攻防走势</button>
          <button type="button" className={tabCls('standings')} onClick={() => setTab('standings')}>积分榜</button>
          <button type="button" className={tabCls('ai')} onClick={() => setTab('ai')}>
            <Bot className="w-3 h-3 inline mr-0.5" />AI 分析
          </button>
        </div>

        <div className="px-4 py-3 pb-12">
          {tab === 'events' && <EventsFeed match={match} />}
          {tab === 'lineups' && <LineupsTab match={match} />}
          {tab === 'momentum' && <MomentumTab match={match} />}
          {tab === 'standings' && <StandingsTab match={match} />}
          {tab === 'ai' && (
            <div className="h-[60vh] -mx-4">
              <AiChatPanel className="h-full" initialContext={aiContext} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Score Board
// ============================================
function ScoreBoard({ match, minuteDisplay, isLive }: { match: AdvancedMatch; minuteDisplay: string; isLive: boolean }) {
  const hdp = match.initialHandicap;
  const ou = match.initialOverUnder;
  const ht = match.halftimeScore;
  const mw = match.odds?.matchWinner;

  return (
    <div className="px-4 py-5">
      <div className="flex items-center justify-between">
        {/* Home */}
        <div className="flex flex-col items-center gap-1.5 w-32">
          {match.home.logo ? (
            <img src={match.home.logo} alt="" className="w-14 h-14 object-contain" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xl font-bold text-white">
              {match.home.name.slice(0, 2)}
            </div>
          )}
          <span className="text-xs text-white text-center leading-tight">{match.home.name}</span>
          <span className="text-[10px] text-[#666]">
            {(match.home.rank ?? 0) > 0 ? `#${match.home.rank}` : '-'}
          </span>
        </div>

        {/* Score */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-4xl font-black text-white">{match.home.score}</span>
            <span className="text-xl text-[#555]">-</span>
            <span className="font-mono text-4xl font-black text-white">{match.away.score}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
            <span className={`font-mono text-sm font-bold ${isLive ? 'text-green-400' : 'text-[#888]'}`}>
              {isLive ? minuteDisplay : match.status === 'ft' ? '完场' : match.status === 'ht' ? '中场' : match.status}
            </span>
          </div>
          {ht && <span className="text-[10px] text-[#555]">HT {ht.home ?? 0}-{ht.away ?? 0}</span>}
          {/* Initial odds row */}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] flex-wrap justify-center">
            <span className="text-[#999]">初:</span>
            <span className="text-[#ccc]">{hdp != null ? `让球 ${hdp > 0 ? '+' : ''}${hdp}` : '让球 —'}</span>
            <span className="text-[#555]">|</span>
            <span className="text-[#ccc]">{ou != null ? `大小 ${ou}` : '大小 —'}</span>
            {mw && (
              <>
                <span className="text-[#555]">|</span>
                <span className="text-[#ccc]">胜<span className="text-[#e0e0e0] font-mono">{mw.home ?? '-'}</span></span>
                <span className="text-[#ccc]">平<span className="text-[#e0e0e0] font-mono">{mw.draw ?? '-'}</span></span>
                <span className="text-[#ccc]">负<span className="text-[#e0e0e0] font-mono">{mw.away ?? '-'}</span></span>
              </>
            )}
          </div>
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-1.5 w-32">
          {match.away.logo ? (
            <img src={match.away.logo} alt="" className="w-14 h-14 object-contain" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xl font-bold text-white">
              {match.away.name.slice(0, 2)}
            </div>
          )}
          <span className="text-xs text-white text-center leading-tight">{match.away.name}</span>
          <span className="text-[10px] text-[#666]">
            {(match.away.rank ?? 0) > 0 ? `#${match.away.rank}` : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Event Timeline Bar — larger, with time labels for key events
// ============================================
function EventTimelineBar({ match }: { match: AdvancedMatch }) {
  const events = match.events ?? [];
  if (events.length === 0) {
    return (
      <div className="px-4 pb-3">
        <div className="h-14 rounded-lg bg-[#111] flex items-center justify-center text-[11px] text-[#555]">
          暂无事件数据
        </div>
      </div>
    );
  }

  // Filter key events that get time labels (goals, red cards, VAR goals cancelled)
  const keyEvents = events.filter((ev) => {
    const t = (ev.type ?? '').toLowerCase();
    const d = (ev.detail ?? '').toLowerCase();
    if (t === 'goal') return true;
    if (t === 'card' && (d.includes('red') || d.includes('second yellow'))) return true;
    return false;
  });

  return (
    <div className="px-4 pb-3">
      {/* Time labels above the bar */}
      <div className="relative h-5 mb-0.5">
        {keyEvents.map((ev, i) => {
          const minute = ev.minute ?? ev.time?.elapsed ?? 0;
          const extra = ev.time?.extra;
          const x = Math.min((minute / 95) * 100, 98);
          const t = (ev.type ?? '').toLowerCase();
          const d = (ev.detail ?? '').toLowerCase();
          const isGoal = t === 'goal';
          const isRed = t === 'card' && (d.includes('red') || d.includes('second yellow'));
          const color = isGoal ? 'text-green-400' : 'text-red-400';
          const icon = isGoal ? '⚽' : '🟥';
          const mStr = extra ? `${minute}+${extra}'` : `${minute}'`;
          return (
            <span
              key={`label-${minute}-${i}`}
              className={`absolute text-[9px] font-mono ${color} -translate-x-1/2 whitespace-nowrap`}
              style={{ left: `${x}%`, top: 0 }}
            >
              {icon}{mStr}
            </span>
          );
        })}
      </div>

      {/* Main bar */}
      <div className="relative h-10 bg-[#0d1117] rounded-lg overflow-hidden">
        {/* Time scale marks: 0, 15, 30, HT, 60, 75, 90 */}
        {[0, 15, 30, 45, 60, 75, 90].map((m) => (
          <div key={m} className="absolute top-0 bottom-0" style={{ left: `${(m / 95) * 100}%` }}>
            <div className={`h-full ${m === 45 ? 'w-px bg-[#444]' : 'w-px bg-[#1a1a1a]'}`} />
            <span className="absolute -bottom-3.5 -translate-x-1/2 text-[8px] text-[#666] font-mono">
              {m === 45 ? 'HT' : m}
            </span>
          </div>
        ))}

        {/* Current minute indicator */}
        {match.minute > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-green-500/80 z-10"
            style={{ left: `${Math.min((match.minute / 95) * 100, 100)}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-green-500" />
          </div>
        )}

        {/* Event markers */}
        {events.map((ev, i) => {
          const minute = ev.minute ?? ev.time?.elapsed ?? 0;
          const x = Math.min((minute / 95) * 100, 99);
          const isHome = ev.teamSide === 'home';
          const t = (ev.type ?? '').toLowerCase();
          const d = (ev.detail ?? '').toLowerCase();

          let color = '#444';
          let w = 2;
          let h = 8;
          if (t === 'goal') { color = '#22c55e'; w = 3; h = 16; }
          else if (t === 'card' && (d.includes('red') || d.includes('second yellow'))) { color = '#ef4444'; w = 3; h = 14; }
          else if (t === 'card') { color = '#eab308'; w = 2; h = 10; }
          else if (t === 'subst') { color = '#3b82f6'; w = 2; h = 8; }
          else if (t === 'var') { color = '#a855f7'; w = 2; h = 10; }

          return (
            <div
              key={`ev-${minute}-${i}`}
              className="absolute rounded-sm z-[5]"
              style={{
                left: `${x}%`,
                width: w,
                height: h,
                backgroundColor: color,
                top: isHome ? 2 : undefined,
                bottom: isHome ? undefined : 2,
              }}
              title={`${minute}' ${ev.player?.name ?? ''} ${ev.type} ${ev.detail ?? ''}`}
            />
          );
        })}
      </div>

      {/* Bottom scale space + Legend */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3 text-[10px] text-[#888]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" /> 进球</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-500 inline-block" /> 黄牌</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> 红牌</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> 换人</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Stats Overview — compact two-column comparison
// ============================================
function StatsOverview({ match }: { match: AdvancedMatch }) {
  const s = match.stats;

  const rows: { label: string; home: string; away: string }[] = [
    { label: '危险进攻', home: v(s?.dangerousAttacks?.home), away: v(s?.dangerousAttacks?.away) },
    { label: '进攻', home: v(s?.attacks?.home), away: v(s?.attacks?.away) },
    { label: '控球率', home: pct(s?.possession?.home), away: pct(s?.possession?.away) },
    { label: 'xG', home: s?.xG?.home != null ? s.xG.home.toFixed(2) : '-', away: s?.xG?.away != null ? s.xG.away.toFixed(2) : '-' },
    { label: '射正', home: v(s?.shotsOnTarget?.home), away: v(s?.shotsOnTarget?.away) },
    { label: '射偏', home: v(s?.shotsOffTarget?.home), away: v(s?.shotsOffTarget?.away) },
  ];

  return (
    <div className="px-4 py-2">
      <div className="grid grid-cols-3 gap-y-1.5 text-xs">
        {rows.map((r) => {
          const hNum = parseFloat(r.home) || 0;
          const aNum = parseFloat(r.away) || 0;
          const hWin = hNum > aNum;
          const aWin = aNum > hNum;
          return (
            <div key={r.label} className="contents">
              <span className={`text-right font-mono pr-2 ${hWin ? 'text-cyan-400 font-bold' : 'text-[#bbb]'}`}>{r.home}</span>
              <span className="text-center text-[#999]">{r.label}</span>
              <span className={`text-left font-mono pl-2 ${aWin ? 'text-rose-400 font-bold' : 'text-[#bbb]'}`}>{r.away}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Tab: Events Feed (reverse chronological)
// ============================================
function EventsFeed({ match }: { match: AdvancedMatch }) {
  const events = useMemo(() => {
    const raw = match.events ?? [];
    return [...raw].sort((a, b) => {
      const am = (a.minute ?? a.time?.elapsed ?? 0) + ((a.time?.extra ?? 0) / 100);
      const bm = (b.minute ?? b.time?.elapsed ?? 0) + ((b.time?.extra ?? 0) / 100);
      return bm - am;
    });
  }, [match.events]);

  if (events.length === 0) {
    return <EmptyState text="暂无事件数据" />;
  }

  return (
    <div className="space-y-0.5">
      {events.map((ev, i) => {
        const minute = ev.minute ?? ev.time?.elapsed ?? 0;
        const extra = ev.time?.extra;
        const mStr = extra ? `${minute}+${extra}'` : `${minute}'`;
        const icon = eventIcon(ev.type, ev.detail);
        const isHome = ev.teamSide === 'home';
        const playerName = ev.player?.name ?? '';
        const assistName = ev.assist?.name;
        const teamName = ev.team?.name ?? (isHome ? match.home.name : match.away.name);
        const t = (ev.type ?? '').toLowerCase();

        let desc = '';
        if (t === 'goal') desc = assistName ? `进球 (助攻: ${assistName})` : '进球';
        else if (t === 'card') desc = ev.detail ?? '牌';
        else if (t === 'subst') desc = `换人 ~ ${playerName} ~ ${assistName ?? ''}`;
        else if (t === 'var') desc = ev.detail ?? 'VAR';
        else desc = ev.detail ?? ev.type;

        let subLine: string;
        let subIntent: string | null = null;
        if (t === 'subst') {
          const sub = match.substitutions?.find(
            (s) => s.minute === minute && (s.playerIn === playerName || s.playerOut === (assistName ?? '')),
          );
          const posIn = sub?.playerInPosition ? POS_LABEL[sub.playerInPosition] ?? sub.playerInPosition : '';
          const posOut = sub?.playerOutPosition ? POS_LABEL[sub.playerOutPosition] ?? sub.playerOutPosition : '';
          const inLabel = posIn ? `${playerName}(${posIn})` : playerName;
          const outLabel = posOut ? `${assistName ?? '?'}(${posOut})` : (assistName ?? '?');
          subLine = `换上 ${inLabel} · 换下 ${outLabel}`;
          if (sub?.type === 'attack') subIntent = '进攻加强';
          else if (sub?.type === 'defense') subIntent = '防守加强';
        } else {
          subLine = `${playerName}${playerName ? ' - ' : ''}${desc}`;
        }

        return (
          <div
            key={`${minute}-${i}`}
            className={`flex items-start gap-2.5 px-2 py-1.5 rounded transition-colors hover:bg-[#111] ${
              t === 'goal' ? 'bg-green-500/8' : t === 'card' ? 'bg-red-500/5' : ''
            }`}
          >
            <span className="font-mono text-[11px] text-[#999] w-10 text-right flex-shrink-0 pt-0.5">{mStr}</span>
            <span className="text-sm flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#e0e0e0] truncate">
                {subLine}
                {subIntent && (
                  <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${
                    subIntent === '进攻加强' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {subIntent}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[#888] truncate">({teamName})</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Tab: Lineups
// ============================================
function LineupsTab({ match }: { match: AdvancedMatch }) {
  const lineups = match.lineups;
  if (!lineups || lineups.length === 0) {
    return <EmptyState text="暂无阵容数据" />;
  }

  const home = lineups.find((l) => l.team.id === match.home.id) ?? lineups[0];
  const away = lineups.find((l) => l.team.id === match.away.id) ?? lineups[1];

  return (
    <div className="space-y-4">
      {/* Formations */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-accent-primary font-medium">{home?.team.name}</span>
        <span className="text-[#666] font-mono">{home?.formation ?? '-'} vs {away?.formation ?? '-'}</span>
        <span className="text-red-400 font-medium">{away?.team.name}</span>
      </div>

      {/* Side-by-side starting XI */}
      <div className="grid grid-cols-2 gap-3">
        {home && <TeamLineupList lineup={home} side="home" />}
        {away && <TeamLineupList lineup={away} side="away" />}
      </div>
    </div>
  );
}

function TeamLineupList({ lineup, side }: {
  lineup: NonNullable<AdvancedMatch['lineups']>[number];
  side: 'home' | 'away';
}) {
  const accent = side === 'home' ? 'text-accent-primary' : 'text-red-400';

  return (
    <div>
      {/* Coach */}
      <div className="flex items-center gap-1.5 mb-2 text-[10px] text-[#666]">
        <span>教练:</span>
        <span className="text-[#aaa]">{lineup.coach?.name ?? '-'}</span>
      </div>

      {/* Starting XI */}
      <div className="text-[10px] text-[#777] mb-1 font-medium">首发 ({lineup.formation})</div>
      <div className="space-y-0.5">
        {lineup.startXI.map((item) => (
          <PlayerRow key={item.player.id} player={item.player} accent={accent} />
        ))}
      </div>

      {/* Substitutes */}
      <div className="text-[10px] text-[#777] mt-3 mb-1 font-medium">替补</div>
      <div className="space-y-0.5">
        {lineup.substitutes.map((item) => (
          <PlayerRow key={item.player.id} player={item.player} accent={accent} isSub />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ player, accent, isSub }: {
  player: { id: number; name: string; number: number; pos: string; grid: string | null };
  accent: string;
  isSub?: boolean;
}) {
  const posLabel = POS_LABEL[player.pos] || player.pos || '-';
  const posColor =
    player.pos === 'G' ? 'text-yellow-500' :
    player.pos === 'D' ? 'text-blue-400' :
    player.pos === 'M' ? 'text-green-400' :
    player.pos === 'F' ? 'text-red-400' : 'text-[#666]';

  return (
    <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] ${isSub ? 'opacity-70' : ''} hover:bg-[#111]`}>
      <span className={`font-mono w-5 text-right ${accent}`}>{player.number}</span>
      <span className="text-[#ccc] flex-1 truncate">{player.name}</span>
      <span className={`text-[10px] ${posColor}`}>{posLabel}</span>
    </div>
  );
}

// ============================================
// Tab: Momentum (attack timeline)
// ============================================
function MomentumTab({ match }: { match: AdvancedMatch }) {
  const attacks = match.attacks ?? [];
  if (attacks.length === 0) {
    return <EmptyState text="暂无攻防走势数据" />;
  }

  const homeAttacks = attacks.filter((a) => a.team === 'home');
  const awayAttacks = attacks.filter((a) => a.team === 'away');
  const homeDangerous = homeAttacks.filter((a) => a.type === 'dangerous').length;
  const awayDangerous = awayAttacks.filter((a) => a.type === 'dangerous').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#111]">
          <span className="text-[#888]">主队进攻</span>
          <span className="font-mono text-accent-primary font-bold">{homeAttacks.length} <span className="text-[#666] font-normal">({homeDangerous} 危险)</span></span>
        </div>
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#111]">
          <span className="text-[#888]">客队进攻</span>
          <span className="font-mono text-red-400 font-bold">{awayAttacks.length} <span className="text-[#666] font-normal">({awayDangerous} 危险)</span></span>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="relative h-24 bg-[#111] rounded-lg overflow-hidden">
        <div className="absolute inset-x-0 top-1/2 h-px bg-[#222]" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#222]" />
        <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[8px] text-[#555]">HT</span>

        {/* Recent 10min highlight */}
        <div
          className="absolute top-0 bottom-0 bg-accent-primary/5"
          style={{
            left: `${Math.max(0, ((match.minute - 10) / 95) * 100)}%`,
            width: `${(10 / 95) * 100}%`,
          }}
        />

        {attacks.map((a, i) => {
          const x = (a.minute / 95) * 100;
          const isHome = a.team === 'home';
          const isDangerous = a.type === 'dangerous';
          return (
            <div
              key={`${a.minute}-${i}`}
              className={`absolute w-1 rounded-sm ${isDangerous ? 'bg-accent-danger' : 'bg-accent-primary/40'}`}
              style={{
                left: `${x}%`,
                height: isDangerous ? 16 : 6,
                top: isHome ? 8 : undefined,
                bottom: isHome ? undefined : 8,
              }}
              title={`${a.minute}' ${a.team === 'home' ? '主队' : '客队'} ${isDangerous ? '危险进攻' : '普通进攻'}`}
            />
          );
        })}

        {/* Current minute */}
        {match.minute > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-green-500/70"
            style={{ left: `${Math.min((match.minute / 95) * 100, 100)}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Tab: Standings (from enrichment or N/A)
// ============================================
function StandingsTab({ match }: { match: AdvancedMatch }) {
  // enrichment.teamStatsHome / teamStatsAway or enrichment.predictions may contain standings
  // For now show a basic placeholder — data passthrough from enrichment
  const homeRank = match.home.rank;
  const awayRank = match.away.rank;

  if (!homeRank && !awayRank) {
    return <EmptyState text="暂无积分榜数据" />;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[#888] mb-2">{match.league} — 当前排名</div>
      <div className="space-y-1">
        <RankRow name={match.home.name} rank={homeRank} side="home" />
        <RankRow name={match.away.name} rank={awayRank} side="away" />
      </div>
      <p className="text-[10px] text-[#555] mt-2">完整积分榜将在后续版本中接入</p>
    </div>
  );
}

function RankRow({ name, rank, side }: { name: string; rank?: number | null; side: 'home' | 'away' }) {
  const accent = side === 'home' ? 'text-accent-primary' : 'text-red-400';
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#111] text-xs">
      <span className={`font-mono font-bold w-8 text-right ${accent}`}>{rank != null ? `#${rank}` : '-'}</span>
      <span className="text-[#ccc]">{name}</span>
    </div>
  );
}

// ============================================
// Empty state
// ============================================
function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <AlertTriangle className="w-8 h-8 text-[#333] mb-2" />
      <p className="text-xs text-[#555]">{text}</p>
    </div>
  );
}

export default MatchDetailPage;
