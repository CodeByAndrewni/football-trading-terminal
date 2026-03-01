// ============================================
// 盘口预警徽章组件
// ============================================

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Zap, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import type { OddsAnalysisResult, MoneyFlow, DivergenceSignal, OddsAlert } from '../../services/oddsAnalyzer';

interface OddsAlertBadgeProps {
  analysis: OddsAnalysisResult;
  compact?: boolean;  // 紧凑模式（仅显示图标）
}

// 完整的盘口预警徽章
export function OddsAlertBadge({ analysis, compact = false }: OddsAlertBadgeProps) {
  const { alerts, divergence, moneyFlow } = analysis;

  const hasAlerts = alerts.length > 0;
  const hasDivergence = divergence.detected;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  if (!hasAlerts && !hasDivergence) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {criticalAlerts.length > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-danger/20 animate-pulse" title={criticalAlerts[0].message}>
            <span className="text-[10px]">🔴</span>
          </span>
        )}
        {warningAlerts.length > 0 && !criticalAlerts.length && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-warning/20" title={warningAlerts[0].message}>
            <span className="text-[10px]">🟠</span>
          </span>
        )}
        {hasDivergence && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-primary/20" title={divergence.description}>
            <AlertTriangle className="w-3 h-3 text-accent-primary" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* 赔率急变预警 */}
      {alerts.map(alert => (
        <AlertBadgeItem key={alert.id} alert={alert} />
      ))}

      {/* 盘口背离 */}
      {hasDivergence && (
        <DivergenceBadge divergence={divergence} />
      )}
    </div>
  );
}

// 单个预警徽章
function AlertBadgeItem({ alert }: { alert: OddsAlert }) {
  const getBgColor = () => {
    if (alert.severity === 'critical') return 'bg-accent-danger/20 border-accent-danger/40';
    if (alert.severity === 'warning') return 'bg-accent-warning/20 border-accent-warning/40';
    return 'bg-accent-primary/20 border-accent-primary/40';
  };

  const getTextColor = () => {
    if (alert.severity === 'critical') return 'text-accent-danger';
    if (alert.severity === 'warning') return 'text-accent-warning';
    return 'text-accent-primary';
  };

  const getIcon = () => {
    switch (alert.type) {
      case 'handicap_rapid_change':
        return <Zap className="w-3 h-3" />;
      case 'over_rapid_drop':
      case 'under_rapid_drop':
        return <TrendingDown className="w-3 h-3" />;
      case 'late_odds_shift':
        return <AlertTriangle className="w-3 h-3" />;
      default:
        return <Zap className="w-3 h-3" />;
    }
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${getBgColor()}`}>
      <span className={getTextColor()}>{getIcon()}</span>
      <span className={`text-[10px] font-medium ${getTextColor()}`}>
        {alert.type === 'handicap_rapid_change' && '让球急变'}
        {alert.type === 'over_rapid_drop' && '大球急跌'}
        {alert.type === 'under_rapid_drop' && '小球急跌'}
        {alert.type === 'late_odds_shift' && '临场变盘'}
      </span>
      {alert.details.change !== undefined && (
        <span className={`font-mono text-[10px] ${alert.details.change < 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
          {alert.details.change > 0 ? '+' : ''}{alert.details.change.toFixed(2)}
        </span>
      )}
    </div>
  );
}

// 盘口背离徽章
function DivergenceBadge({ divergence }: { divergence: DivergenceSignal }) {
  if (!divergence.detected) return null;

  const getSeverityStyle = () => {
    if (divergence.severity === 'strong') return 'bg-accent-danger/20 border-accent-danger/40 text-accent-danger';
    if (divergence.severity === 'moderate') return 'bg-accent-warning/20 border-accent-warning/40 text-accent-warning';
    return 'bg-accent-primary/20 border-accent-primary/40 text-accent-primary';
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${getSeverityStyle()}`}>
      <AlertTriangle className="w-3 h-3" />
      <span className="text-[10px] font-medium">盘口背离</span>
      {divergence.severity === 'strong' && <span className="text-[10px]">⚠️</span>}
    </div>
  );
}

// 资金流向指示器
interface MoneyFlowIndicatorProps {
  moneyFlow: MoneyFlow;
  homeTeam?: string;
  awayTeam?: string;
  showLabels?: boolean;
}

export function MoneyFlowIndicator({ moneyFlow, homeTeam = '主', awayTeam = '客', showLabels = true }: MoneyFlowIndicatorProps) {
  const { homePercent, awayPercent, trend, direction, confidence } = moneyFlow;

  // 生成进度条
  const barWidth = Math.max(20, Math.min(80, homePercent));

  const getTrendIcon = () => {
    if (trend === 'accelerating') return <ArrowUp className="w-3 h-3 text-accent-success animate-bounce" />;
    if (trend === 'decelerating') return <ArrowDown className="w-3 h-3 text-accent-danger" />;
    return <ArrowRight className="w-3 h-3 text-text-muted" />;
  };

  const getDirectionColor = () => {
    if (direction === 'home') return 'text-accent-primary';
    if (direction === 'away') return 'text-accent-danger';
    return 'text-text-secondary';
  };

  return (
    <div className="space-y-1">
      {showLabels && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-text-muted">资金流向</span>
          <div className="flex items-center gap-1">
            {getTrendIcon()}
            <span className={`font-medium ${getDirectionColor()}`}>
              {direction === 'home' ? '→主' : direction === 'away' ? '→客' : '均衡'}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-secondary w-4">{homeTeam}</span>
        <div className="flex-1 h-2 bg-bg-deepest rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              homePercent >= 55 ? 'bg-accent-primary' : homePercent <= 45 ? 'bg-accent-danger' : 'bg-text-muted'
            }`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <span className="text-[10px] text-text-secondary w-4">{awayTeam}</span>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className={`font-mono ${homePercent >= 55 ? 'text-accent-primary font-bold' : 'text-text-secondary'}`}>
          {homePercent}%
        </span>
        <span className="text-text-muted">置信度 {confidence}%</span>
        <span className={`font-mono ${awayPercent >= 55 ? 'text-accent-danger font-bold' : 'text-text-secondary'}`}>
          {awayPercent}%
        </span>
      </div>
    </div>
  );
}

// 紧凑版资金流向（用于表格）
export function MoneyFlowCompact({ moneyFlow }: { moneyFlow: MoneyFlow }) {
  const { homePercent, trend } = moneyFlow;

  const getTrendSymbol = () => {
    if (trend === 'accelerating') return '↑';
    if (trend === 'decelerating') return '↓';
    return '→';
  };

  const barWidth = Math.max(20, Math.min(80, homePercent));

  return (
    <div className="flex items-center gap-1 w-24">
      <div className="flex-1 h-1.5 bg-bg-deepest rounded-full overflow-hidden">
        <div
          className={`h-full ${homePercent >= 55 ? 'bg-accent-primary' : homePercent <= 45 ? 'bg-accent-danger' : 'bg-text-muted'}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <span className={`text-[10px] font-mono ${homePercent >= 55 ? 'text-accent-primary' : homePercent <= 45 ? 'text-accent-danger' : 'text-text-muted'}`}>
        {homePercent}%
      </span>
      <span className="text-[9px] text-text-muted">{getTrendSymbol()}</span>
    </div>
  );
}

// 盘口分析摘要卡片（用于详情页）
export function OddsAnalysisSummary({ analysis }: { analysis: OddsAnalysisResult }) {
  const { alerts, moneyFlow, divergence, riskLevel, recommendation } = analysis;

  const getRiskColor = () => {
    if (riskLevel === 'high') return 'text-accent-danger';
    if (riskLevel === 'medium') return 'text-accent-warning';
    return 'text-accent-success';
  };

  const getRecommendationStyle = () => {
    switch (recommendation) {
      case 'strong_buy':
        return 'bg-accent-danger/20 text-accent-danger border-accent-danger/40';
      case 'buy':
        return 'bg-accent-warning/20 text-accent-warning border-accent-warning/40';
      case 'hold':
        return 'bg-bg-component text-text-secondary border-border-default';
      case 'avoid':
        return 'bg-text-muted/20 text-text-muted border-text-muted/40';
      default:
        return 'bg-bg-component text-text-secondary border-border-default';
    }
  };

  const getRecommendationText = () => {
    switch (recommendation) {
      case 'strong_buy': return '强烈买入';
      case 'buy': return '建议买入';
      case 'hold': return '观望';
      case 'avoid': return '回避';
      default: return '观望';
    }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-text-primary flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent-primary" />
          盘口异常分析
        </h3>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRecommendationStyle()}`}>
          {getRecommendationText()}
        </span>
      </div>

      {/* 风险等级 */}
      <div className="flex items-center justify-between py-2 border-b border-border-default">
        <span className="text-sm text-text-secondary">风险等级</span>
        <span className={`font-medium ${getRiskColor()}`}>
          {riskLevel === 'high' ? '高' : riskLevel === 'medium' ? '中' : '低'}
        </span>
      </div>

      {/* 资金流向 */}
      <MoneyFlowIndicator moneyFlow={moneyFlow} />

      {/* 预警列表 */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-text-muted">盘口预警</span>
          <div className="flex flex-wrap gap-2">
            {alerts.map(alert => (
              <AlertBadgeItem key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* 盘口背离 */}
      {divergence.detected && (
        <div className="p-3 rounded-lg bg-accent-warning/10 border border-accent-warning/30">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-accent-warning" />
            <span className="font-medium text-accent-warning">盘口背离信号</span>
          </div>
          <p className="text-sm text-text-secondary">{divergence.description}</p>
          <p className="text-xs text-accent-warning mt-1">{divergence.recommendation}</p>
        </div>
      )}
    </div>
  );
}
