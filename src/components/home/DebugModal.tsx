// ============================================
// DebugModal - 调试信息弹窗
// 显示比赛的完整数据结构用于调试
// ============================================

import type React from 'react';
import { useState } from 'react';
import { X, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import type { UnifiedSignal } from '../../types/unified-scoring';
import type { UnifiedLateSignal } from '../../services/modules/unifiedLateModule';

interface DebugModalProps {
  match: AdvancedMatch;
  signal?: UnifiedSignal | null;
  lateSignal?: UnifiedLateSignal | null;  // v159: 晚期模块信号
  onClose: () => void;
}

export function DebugModal({ match, signal, lateSignal, onClose }: DebugModalProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['basic', 'odds', 'stats'])
  );
  const [copied, setCopied] = useState(false);

  const toggleSection = (section: string) => {
    const newSections = new Set(expandedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setExpandedSections(newSections);
  };

  const copyToClipboard = () => {
    const data = {
      match,
      signal,
      lateSignal,  // v159: 包含晚期模块信号
      timestamp: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderSection = (title: string, key: string, content: React.ReactNode) => {
    const isExpanded = expandedSections.has(key);
    return (
      <div className="border border-zinc-700 rounded-lg overflow-hidden mb-2">
        <button
          type="button"
          onClick={() => toggleSection(key)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-750 transition-colors"
        >
          <span className="text-sm font-medium text-zinc-200">{title}</span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          )}
        </button>
        {isExpanded && (
          <div className="p-3 bg-zinc-900 text-xs font-mono overflow-auto max-h-60">
            {content}
          </div>
        )}
      </div>
    );
  };

  const renderJsonValue = (value: unknown): React.ReactNode => {
    if (value === null) return <span className="text-zinc-500">null</span>;
    if (value === undefined) return <span className="text-zinc-500">undefined</span>;
    if (typeof value === 'boolean') {
      return <span className={value ? 'text-green-400' : 'text-red-400'}>{String(value)}</span>;
    }
    if (typeof value === 'number') {
      return <span className="text-amber-400">{value}</span>;
    }
    if (typeof value === 'string') {
      return <span className="text-emerald-400">"{value}"</span>;
    }
    return <span className="text-zinc-300">{JSON.stringify(value)}</span>;
  };

  const renderKeyValue = (key: string, value: unknown) => (
    <div key={key} className="flex gap-2 py-0.5">
      <span className="text-cyan-400">{key}:</span>
      {renderJsonValue(value)}
    </div>
  );

  return (
    <tr>
      <td colSpan={12} className="p-0">
        <div className="bg-zinc-900/95 border border-zinc-700 rounded-lg m-2 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-zinc-100">
                🔍 调试信息: {match.home.name} vs {match.away.name}
              </h3>
              <span className="text-xs text-zinc-500">ID: {match.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>复制JSON</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1 hover:bg-zinc-800 rounded transition-colors"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-auto">
            {/* Left Column */}
            <div>
              {/* Basic Info */}
              {renderSection('基本信息', 'basic', (
                <div className="space-y-1">
                  {renderKeyValue('id', match.id)}
                  {renderKeyValue('league', match.league)}
                  {renderKeyValue('leagueId', match.leagueId)}
                  {renderKeyValue('minute', match.minute)}
                  {renderKeyValue('status', match.status)}
                  {renderKeyValue('score', `${match.home.score} - ${match.away.score}`)}
                  {renderKeyValue('totalGoals', match.totalGoals)}
                  {renderKeyValue('scenarioTags', match.scenarioTags)}
                  {renderKeyValue('killScore', match.killScore)}
                  {renderKeyValue('rating', match.rating)}
                  {renderKeyValue('_unscoreable', match._unscoreable)}
                  {renderKeyValue('_noStatsReason', match._noStatsReason)}
                </div>
              ))}

              {/* Home Team */}
              {renderSection('主队信息', 'home', (
                <div className="space-y-1">
                  {renderKeyValue('id', match.home.id)}
                  {renderKeyValue('name', match.home.name)}
                  {renderKeyValue('score', match.home.score)}
                  {renderKeyValue('handicap', match.home.handicap)}
                  {renderKeyValue('_handicap_source', match.home._handicap_source)}
                  {renderKeyValue('rank', match.home.rank)}
                </div>
              ))}

              {/* Away Team */}
              {renderSection('客队信息', 'away', (
                <div className="space-y-1">
                  {renderKeyValue('id', match.away.id)}
                  {renderKeyValue('name', match.away.name)}
                  {renderKeyValue('score', match.away.score)}
                  {renderKeyValue('overUnder', match.away.overUnder)}
                  {renderKeyValue('_ou_source', match.away._ou_source)}
                  {renderKeyValue('rank', match.away.rank)}
                </div>
              ))}

              {/* Stats */}
              {renderSection('统计数据', 'stats', (
                <div className="space-y-1">
                  {match.stats ? (
                    <>
                      {renderKeyValue('_realDataAvailable', match.stats._realDataAvailable)}
                      {renderKeyValue('possession', match.stats.possession)}
                      {renderKeyValue('shots', match.stats.shots)}
                      {renderKeyValue('shotsOnTarget', match.stats.shotsOnTarget)}
                      {renderKeyValue('xG', match.stats.xG)}
                      {renderKeyValue('dangerousAttacks', match.stats.dangerousAttacks)}
                      {renderKeyValue('fouls', match.stats.fouls)}
                    </>
                  ) : (
                    <span className="text-zinc-500">无统计数据</span>
                  )}
                </div>
              ))}
            </div>

            {/* Right Column */}
            <div>
              {/* Odds */}
              {renderSection('赔率数据', 'odds', (
                <div className="space-y-1">
                  {renderKeyValue('_fetch_status', match.odds._fetch_status)}
                  {renderKeyValue('_source', match.odds._source)}
                  {renderKeyValue('_bookmaker', match.odds._bookmaker)}
                  {renderKeyValue('_is_live', match.odds._is_live)}
                  {renderKeyValue('_captured_at', match.odds._captured_at)}
                  <div className="mt-2 pt-2 border-t border-zinc-700">
                    <div className="text-zinc-400 mb-1">让球盘:</div>
                    {renderKeyValue('handicap.value', match.odds.handicap?.value)}
                    {renderKeyValue('handicap.home', match.odds.handicap?.home)}
                    {renderKeyValue('handicap.away', match.odds.handicap?.away)}
                  </div>
                  <div className="mt-2 pt-2 border-t border-zinc-700">
                    <div className="text-zinc-400 mb-1">大小球:</div>
                    {renderKeyValue('overUnder.total', match.odds.overUnder?.total)}
                    {renderKeyValue('overUnder.over', match.odds.overUnder?.over)}
                    {renderKeyValue('overUnder.under', match.odds.overUnder?.under)}
                    {renderKeyValue('allLines.length', match.odds.overUnder?.allLines?.length)}
                  </div>
                  {match.odds.matchWinner && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <div className="text-zinc-400 mb-1">胜平负:</div>
                      {renderKeyValue('home', match.odds.matchWinner.home)}
                      {renderKeyValue('draw', match.odds.matchWinner.draw)}
                      {renderKeyValue('away', match.odds.matchWinner.away)}
                    </div>
                  )}
                </div>
              ))}

              {/* Cards */}
              {renderSection('牌况', 'cards', (
                <div className="space-y-1">
                  {renderKeyValue('yellow.home', match.cards.yellow.home)}
                  {renderKeyValue('yellow.away', match.cards.yellow.away)}
                  {renderKeyValue('red.home', match.cards.red.home)}
                  {renderKeyValue('red.away', match.cards.red.away)}
                  {renderKeyValue('yellow.players', match.cards.yellow.players)}
                  {renderKeyValue('red.players', match.cards.red.players)}
                </div>
              ))}

              {/* Validation */}
              {renderSection('数据验证', 'validation', (
                <div className="space-y-1">
                  {match._validation ? (
                    <>
                      {renderKeyValue('data_quality', match._validation.data_quality)}
                      {renderKeyValue('fixtures_real', match._validation.fixtures_real)}
                      {renderKeyValue('stats_real', match._validation.stats_real)}
                      {renderKeyValue('odds_real', match._validation.odds_real)}
                      {renderKeyValue('events_real', match._validation.events_real)}
                      {match._validation.invalid_reasons?.length > 0 && (
                        <div className="mt-2">
                          <div className="text-zinc-400 mb-1">invalid_reasons:</div>
                          {match._validation.invalid_reasons.map((r, i) => (
                            <div key={i} className="text-red-400 pl-2">• {r}</div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500">无验证数据</span>
                  )}
                </div>
              ))}

              {/* Signal */}
              {signal && renderSection('信号数据', 'signal', (
                <div className="space-y-1">
                  {renderKeyValue('module', signal.module)}
                  {renderKeyValue('fixture_id', signal.fixture_id)}
                  {renderKeyValue('minute', signal.minute)}
                  {renderKeyValue('score', signal.score)}
                  {renderKeyValue('confidence', signal.confidence)}
                  {renderKeyValue('action', signal.action)}
                  {renderKeyValue('captured_at', signal.captured_at)}
                  {signal.bet_plan && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <div className="text-zinc-400 mb-1">投注计划:</div>
                      {renderKeyValue('market', signal.bet_plan.market)}
                      {renderKeyValue('selection', signal.bet_plan.selection)}
                      {renderKeyValue('odds_min', signal.bet_plan.odds_min)}
                      {renderKeyValue('stake_pct', signal.bet_plan.stake_pct)}
                    </div>
                  )}
                  {signal.reasons && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <div className="text-zinc-400 mb-1">reasons.state:</div>
                      {renderKeyValue('status', signal.reasons.state?.status)}
                      {renderKeyValue('score_diff', signal.reasons.state?.score_diff)}
                      {renderKeyValue('is_second_half', signal.reasons.state?.is_second_half)}
                    </div>
                  )}
                </div>
              ))}

              {/* v159: 晚期模块信号 */}
              {lateSignal && renderSection('晚期模块 (65-90+)', 'lateSignal', (
                <div className="space-y-1">
                  {renderKeyValue('module', lateSignal.module)}
                  {renderKeyValue('scenario_tag', lateSignal.scenario_tag)}
                  {renderKeyValue('is_warmup', lateSignal.is_warmup)}
                  {renderKeyValue('score', lateSignal.score)}
                  {renderKeyValue('confidence', lateSignal.confidence)}
                  {renderKeyValue('action', lateSignal.action)}
                  {renderKeyValue('poisson_goal_prob', lateSignal.poisson_goal_prob?.toFixed(3))}

                  <div className="mt-2 pt-2 border-t border-zinc-700">
                    <div className="text-zinc-400 mb-1">Edge 组件:</div>
                    {renderKeyValue('pressure_index', lateSignal.score_breakdown?.edge?.components?.pressure_index)}
                    {renderKeyValue('xg_velocity', lateSignal.score_breakdown?.edge?.components?.xg_velocity)}
                    {renderKeyValue('shot_quality', lateSignal.score_breakdown?.edge?.components?.shot_quality)}
                    {renderKeyValue('strength_gap', lateSignal.score_breakdown?.edge?.components?.strength_gap)}
                    {renderKeyValue('trailing_pressure', lateSignal.score_breakdown?.edge?.components?.trailing_pressure)}
                    {renderKeyValue('scenario_bonus', lateSignal.score_breakdown?.edge?.components?.scenario_bonus)}
                  </div>

                  {lateSignal.bet_plan && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <div className="text-zinc-400 mb-1">投注计划:</div>
                      {renderKeyValue('market', lateSignal.bet_plan.market)}
                      {renderKeyValue('line', lateSignal.bet_plan.line)}
                      {renderKeyValue('selection', lateSignal.bet_plan.selection)}
                      {renderKeyValue('odds_min', lateSignal.bet_plan.odds_min)}
                      {renderKeyValue('stake_pct', lateSignal.bet_plan.stake_pct)}
                      {renderKeyValue('ttl_minutes', lateSignal.bet_plan.ttl_minutes)}
                    </div>
                  )}

                  {lateSignal.team_strength && (
                    <div className="mt-2 pt-2 border-t border-zinc-700">
                      <div className="text-zinc-400 mb-1">球队强弱:</div>
                      {renderKeyValue('homeStrength', lateSignal.team_strength.homeStrength)}
                      {renderKeyValue('awayStrength', lateSignal.team_strength.awayStrength)}
                      {renderKeyValue('strengthGap', lateSignal.team_strength.strengthGap)}
                      {renderKeyValue('isHomeStrong', lateSignal.team_strength.isHomeStrong)}
                    </div>
                  )}
                </div>
              ))}

              {/* Events */}
              {renderSection('事件列表', 'events', (
                <div className="space-y-1">
                  {match.events && match.events.length > 0 ? (
                    match.events.slice(0, 10).map((event, i) => (
                      <div key={i} className="text-xs py-1 border-b border-zinc-800 last:border-0">
                        <span className="text-amber-400">{event.minute}'</span>
                        <span className="text-zinc-400 mx-1">|</span>
                        <span className={event.teamSide === 'home' ? 'text-blue-400' : 'text-red-400'}>
                          {event.teamSide}
                        </span>
                        <span className="text-zinc-400 mx-1">|</span>
                        <span className="text-zinc-300">{event.type}: {event.detail}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-zinc-500">无事件数据</span>
                  )}
                  {match.events && match.events.length > 10 && (
                    <div className="text-zinc-500 text-center pt-1">
                      ... 还有 {match.events.length - 10} 条事件
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default DebugModal;
