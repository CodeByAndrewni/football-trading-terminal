// ============================================
// 历史验证模块组件
// ============================================

import { useState, useEffect } from 'react';
import { History, TrendingUp, Target, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import {
  scoreHistoryService,
  type MatchResult,
} from '../../services/scoreHistory';

interface HistoryValidationProps {
  teamName: string;
  scenarioTags: string[];
  pressure: 'home' | 'away' | 'neutral';
  currentMinute: number;
  currentScore: number;
}

// 场景名称映射
const SCENARIO_NAMES: Record<string, string> = {
  strong_behind: '强队落后',
  red_card: '红牌',
  dense_corners: '角球密集',
  large_lead: '大比分',
  multiple_subs: '多换人',
};

export function HistoryValidation({
  teamName,
  scenarioTags,
  pressure,
  currentMinute,
  currentScore,
}: HistoryValidationProps) {
  const [similarHistory, setSimilarHistory] = useState<{
    totalMatches: number;
    goalRate: number;
    avgGoals: number;
    matches: MatchResult[];
  } | null>(null);

  const [teamHistory, setTeamHistory] = useState<{
    totalMatches: number;
    goalRate: number;
    avgScore: number;
    recentMatches: MatchResult[];
  } | null>(null);

  // 加载历史数据
  useEffect(() => {
    // PRODUCTION STRICT MODE: 不再初始化演示数据

    // 获取类似场景历史
    const similar = scoreHistoryService.getSimilarScenarioHistory(
      scenarioTags,
      pressure,
      [Math.max(60, currentMinute - 10), 90]
    );
    setSimilarHistory(similar);

    // 获取球队历史
    const team = scoreHistoryService.getTeamHistory(teamName);
    setTeamHistory(team);
  }, [teamName, scenarioTags, pressure, currentMinute]);

  // 如果没有数据
  if (!similarHistory || !teamHistory) {
    return null;
  }

  // 如果所有历史都是空的
  if (similarHistory.totalMatches === 0 && teamHistory.totalMatches === 0) {
    return (
      <div className="p-4 rounded-xl bg-bg-component/50 border border-border-default">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-accent-primary" />
          <h3 className="font-medium text-text-primary">历史验证</h3>
        </div>
        <p className="text-sm text-text-muted">暂无足够的历史数据进行验证分析</p>
      </div>
    );
  }

  // 计算信心指数
  const getConfidenceLevel = (): { level: 'high' | 'medium' | 'low'; text: string } => {
    if (similarHistory.totalMatches >= 10 && similarHistory.goalRate >= 60) {
      return { level: 'high', text: '高置信度' };
    }
    if (similarHistory.totalMatches >= 5 && similarHistory.goalRate >= 50) {
      return { level: 'medium', text: '中置信度' };
    }
    return { level: 'low', text: '低置信度' };
  };

  const confidence = getConfidenceLevel();

  return (
    <div className="p-4 rounded-xl bg-bg-component/50 border border-border-default">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-accent-primary" />
          <h3 className="font-medium text-text-primary">历史验证</h3>
        </div>
        <div className={`px-2 py-0.5 rounded text-xs font-medium ${
          confidence.level === 'high' ? 'bg-accent-success/20 text-accent-success' :
          confidence.level === 'medium' ? 'bg-accent-warning/20 text-accent-warning' :
          'bg-bg-deepest text-text-muted'
        }`}>
          {confidence.text}
        </div>
      </div>

      {/* 当前状态标签 */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="px-2 py-0.5 rounded bg-bg-deepest text-xs text-text-secondary flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {currentMinute}'
        </span>
        <span className="px-2 py-0.5 rounded bg-accent-primary/20 text-xs text-accent-primary">
          评分 {currentScore}
        </span>
        {scenarioTags.slice(0, 2).map(tag => (
          <span key={tag} className="px-2 py-0.5 rounded bg-accent-warning/20 text-xs text-accent-warning">
            {SCENARIO_NAMES[tag] || tag}
          </span>
        ))}
        <span className={`px-2 py-0.5 rounded text-xs ${
          pressure === 'home' ? 'bg-accent-success/20 text-accent-success' :
          pressure === 'away' ? 'bg-accent-danger/20 text-accent-danger' :
          'bg-bg-deepest text-text-muted'
        }`}>
          {pressure === 'home' ? '主队压迫' : pressure === 'away' ? '客队压迫' : '均势'}
        </span>
      </div>

      {/* 统计数据 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* 类似场景进球率 */}
        <div className="p-3 rounded-lg bg-bg-deepest/50">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-accent-warning" />
            <span className="text-xs text-text-muted">类似场景进球率</span>
          </div>
          {similarHistory.totalMatches > 0 ? (
            <>
              <div className={`text-2xl font-bold font-mono ${
                similarHistory.goalRate >= 60 ? 'text-accent-success' :
                similarHistory.goalRate >= 50 ? 'text-accent-warning' :
                'text-accent-danger'
              }`}>
                {similarHistory.goalRate}%
              </div>
              <div className="text-xs text-text-muted mt-1">
                样本: {similarHistory.totalMatches}场 | 平均{similarHistory.avgGoals}球
              </div>
            </>
          ) : (
            <div className="text-sm text-text-muted">数据不足</div>
          )}
        </div>

        {/* 球队历史进球率 */}
        <div className="p-3 rounded-lg bg-bg-deepest/50">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-accent-primary" />
            <span className="text-xs text-text-muted">{teamName}历史</span>
          </div>
          {teamHistory.totalMatches > 0 ? (
            <>
              <div className={`text-2xl font-bold font-mono ${
                teamHistory.goalRate >= 60 ? 'text-accent-success' :
                teamHistory.goalRate >= 50 ? 'text-accent-warning' :
                'text-accent-danger'
              }`}>
                {teamHistory.goalRate}%
              </div>
              <div className="text-xs text-text-muted mt-1">
                样本: {teamHistory.totalMatches}场 | 平均评分{teamHistory.avgScore}
              </div>
            </>
          ) : (
            <div className="text-sm text-text-muted">数据不足</div>
          )}
        </div>
      </div>

      {/* 最近类似场景 */}
      {similarHistory.matches.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs text-text-muted mb-2">最近类似场景</h4>
          <div className="space-y-1.5">
            {similarHistory.matches.slice(-3).map((match, index) => (
              <div
                key={`${match.matchId}-${index}`}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-bg-deepest/30"
              >
                <div className="flex items-center gap-2">
                  {match.goalAfterPeak ? (
                    <CheckCircle className="w-3.5 h-3.5 text-accent-success" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-accent-danger" />
                  )}
                  <span className="text-xs text-text-secondary">
                    {match.homeTeam} vs {match.awayTeam}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-muted">
                    {match.peakScoreMinute}'
                  </span>
                  <span className={`text-xs font-mono font-bold ${
                    match.peakScore >= 80 ? 'text-accent-danger' :
                    match.peakScore >= 70 ? 'text-accent-warning' :
                    'text-text-secondary'
                  }`}>
                    {match.peakScore}分
                  </span>
                  <span className={`text-xs ${
                    match.goalAfterPeak ? 'text-accent-success' : 'text-text-muted'
                  }`}>
                    {match.goalAfterPeak ? `+${match.goalsAfterPeakCount}球` : '无进球'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 预测建议 */}
      <div className={`p-3 rounded-lg ${
        confidence.level === 'high' && similarHistory.goalRate >= 55
          ? 'bg-accent-success/10 border border-accent-success/30'
          : confidence.level === 'high' && similarHistory.goalRate < 45
          ? 'bg-accent-danger/10 border border-accent-danger/30'
          : 'bg-bg-deepest/30'
      }`}>
        <div className="flex items-start gap-2">
          <AlertCircle className={`w-4 h-4 mt-0.5 ${
            confidence.level === 'high' && similarHistory.goalRate >= 55
              ? 'text-accent-success'
              : confidence.level === 'high' && similarHistory.goalRate < 45
              ? 'text-accent-danger'
              : 'text-text-muted'
          }`} />
          <div>
            <p className="text-sm text-text-primary">
              {getRecommendation(similarHistory.goalRate, similarHistory.totalMatches, currentMinute, currentScore)}
            </p>
            <p className="text-xs text-text-muted mt-1">
              基于 {similarHistory.totalMatches} 场类似场景历史数据分析
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 生成建议文本
function getRecommendation(
  goalRate: number,
  sampleSize: number,
  minute: number,
  score: number
): string {
  if (sampleSize < 5) {
    return '历史样本较少，建议结合其他因素综合判断';
  }

  if (goalRate >= 65) {
    if (score >= 80) {
      return '历史数据显示该场景进球概率较高，当前高评分状态值得重点关注';
    }
    return '类似场景历史进球率较高，可适当关注进球机会';
  }

  if (goalRate >= 50) {
    if (minute >= 80) {
      return '进入尾声阶段，历史数据显示仍有进球可能，需密切关注';
    }
    return '历史进球率处于中等水平，建议观望或轻仓参与';
  }

  if (goalRate >= 35) {
    return '历史进球率偏低，建议谨慎操作或关注其他机会';
  }

  return '历史数据显示该场景进球概率较低，不建议追进';
}

// 紧凑版历史验证（用于表格展开行）
export function HistoryValidationCompact({
  scenarioTags,
  pressure,
}: {
  scenarioTags: string[];
  pressure: 'home' | 'away' | 'neutral';
}) {
  const [similarHistory, setSimilarHistory] = useState<{
    totalMatches: number;
    goalRate: number;
  } | null>(null);

  useEffect(() => {
    // PRODUCTION STRICT MODE: 不再初始化演示数据
    const similar = scoreHistoryService.getSimilarScenarioHistory(scenarioTags, pressure);
    setSimilarHistory(similar);
  }, [scenarioTags, pressure]);

  if (!similarHistory || similarHistory.totalMatches < 3) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-bg-deepest/50">
      <History className="w-3 h-3 text-text-muted" />
      <span className="text-xs text-text-muted">历史进球率:</span>
      <span className={`text-xs font-bold font-mono ${
        similarHistory.goalRate >= 60 ? 'text-accent-success' :
        similarHistory.goalRate >= 50 ? 'text-accent-warning' :
        'text-accent-danger'
      }`}>
        {similarHistory.goalRate}%
      </span>
      <span className="text-xs text-text-muted">({similarHistory.totalMatches}场)</span>
    </div>
  );
}
