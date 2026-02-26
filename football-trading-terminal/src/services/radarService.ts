// ============================================
// 80+ 雷达监控服务
// ============================================

import type { AdvancedMatch } from '../data/advancedMockData';
import { calculateDynamicScore } from './scoringEngine';
import { notificationService } from './notificationService';
import {
  supabase,
  createRadarAlert,
  hasExistingAlert,
  updateRadarAlertResult,
  getPendingAlerts,
  type RadarAlert,
  type RadarAlertInsert,
} from '../lib/supabase';

// 80+ 阈值
const ALERT_THRESHOLD = 80;

// 已处理的比赛ID缓存（防止重复记录）
const processedMatchIds = new Set<number>();

/**
 * 检测并记录 80+ 比赛
 */
export async function detectAndRecordHighScoreMatches(
  matches: AdvancedMatch[]
): Promise<{ newAlerts: number; matchIds: number[] }> {
  const newAlertMatchIds: number[] = [];

  for (const match of matches) {
    // 只处理进行中的比赛
    if (match.status !== 'live') continue;

    // 计算评分
    const scoreResult = calculateDynamicScore(match);
    if (!scoreResult) continue;

    // 检查是否达到 80+ 阈值
    if (scoreResult.totalScore >= ALERT_THRESHOLD) {
      // 检查是否已在本地缓存
      if (processedMatchIds.has(match.id)) continue;

      // 检查数据库是否已有记录
      const exists = await hasExistingAlert(match.id);
      if (exists) {
        processedMatchIds.add(match.id);
        continue;
      }

      // 创建新的预警记录
      const alertData: RadarAlertInsert = {
        match_id: match.id,
        league_name: match.league,
        home_team: match.home.name,
        away_team: match.away.name,
        trigger_minute: match.minute,
        trigger_score_home: match.home.score,
        trigger_score_away: match.away.score,
        trigger_rating: scoreResult.totalScore,
        trigger_xg_home: match.stats?.xG?.home ?? null,
        trigger_xg_away: match.stats?.xG?.away ?? null,
        trigger_handicap: match.home.handicap,
        trigger_over_under: match.away.overUnder,
        scenario_tags: match.scenarioTags ?? null,
      };

      const created = await createRadarAlert(alertData);
      if (created) {
        processedMatchIds.add(match.id);
        newAlertMatchIds.push(match.id);
        console.log(`[80+ 雷达] 新预警: ${match.home.name} vs ${match.away.name} (${scoreResult.totalScore}分 @ ${match.minute}')`);

        // 发送浏览器通知
        notificationService.notifyRadar80Plus(
          match.id,
          match.home.name,
          match.away.name,
          scoreResult.totalScore,
          match.minute,
          `${match.home.score}:${match.away.score}`,
          match.league
        );
      }
    }
  }

  return { newAlerts: newAlertMatchIds.length, matchIds: newAlertMatchIds };
}

/**
 * 更新已结束比赛的结果
 */
export async function updateCompletedMatchResults(
  matches: AdvancedMatch[]
): Promise<number> {
  // 获取待处理的预警
  const pendingAlerts = await getPendingAlerts();
  if (pendingAlerts.length === 0) return 0;

  let updatedCount = 0;

  // 创建比赛ID到比赛数据的映射
  const matchMap = new Map(matches.map(m => [m.id, m]));

  for (const alert of pendingAlerts) {
    const match = matchMap.get(alert.match_id);

    // 检查比赛是否已结束
    if (match && match.status === 'ft') {
      // 计算触发后的进球数
      const totalGoalsNow = match.home.score + match.away.score;
      const totalGoalsAtTrigger = alert.trigger_score_home + alert.trigger_score_away;
      const goalCountAfter = totalGoalsNow - totalGoalsAtTrigger;
      const hadGoal = goalCountAfter > 0;

      // 更新结果
      const success = await updateRadarAlertResult(alert.match_id, {
        final_score_home: match.home.score,
        final_score_away: match.away.score,
        final_minute: 90, // 或从比赛数据获取
        had_goal_after_trigger: hadGoal,
        goal_count_after_trigger: goalCountAfter,
        result_status: hadGoal ? 'success' : 'failed',
        success_type: hadGoal ? 'goal_scored' : null,
        match_ended_at: new Date().toISOString(),
      });

      if (success) {
        updatedCount++;
        console.log(`[80+ 雷达] 结果更新: ${alert.home_team} vs ${alert.away_team} -> ${hadGoal ? '成功' : '失败'}`);
      }
    }
  }

  return updatedCount;
}

/**
 * 获取当前 80+ 比赛列表（实时）
 */
export function getCurrentHighScoreMatches(matches: AdvancedMatch[]): {
  match: AdvancedMatch;
  score: number;
  isNew: boolean;
}[] {
  const results: { match: AdvancedMatch; score: number; isNew: boolean }[] = [];

  for (const match of matches) {
    if (match.status !== 'live') continue;

    const scoreResult = calculateDynamicScore(match);
    if (!scoreResult) continue;
    if (scoreResult.totalScore >= ALERT_THRESHOLD) {
      results.push({
        match,
        score: scoreResult.totalScore,
        isNew: !processedMatchIds.has(match.id),
      });
    }
  }

  // 按评分降序排序
  return results.sort((a, b) => b.score - a.score);
}

/**
 * 清除过期的缓存（每日清理）
 */
export function clearProcessedCache(): void {
  processedMatchIds.clear();
  console.log('[80+ 雷达] 已清除处理缓存');
}

/**
 * 订阅实时预警更新（使用 Supabase Realtime）
 */
export function subscribeToAlerts(
  onNewAlert: (alert: RadarAlert) => void,
  onUpdate: (alert: RadarAlert) => void
): () => void {
  const channel = supabase
    .channel('radar_alerts_changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'radar_alerts',
      },
      (payload) => {
        onNewAlert(payload.new as RadarAlert);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'radar_alerts',
      },
      (payload) => {
        onUpdate(payload.new as RadarAlert);
      }
    )
    .subscribe();

  // 返回取消订阅函数
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * 格式化预警状态显示
 */
export function formatAlertStatus(status: RadarAlert['result_status']): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'success':
      return { label: '命中', color: 'text-accent-success', bgColor: 'bg-accent-success/20' };
    case 'failed':
      return { label: '未中', color: 'text-accent-danger', bgColor: 'bg-accent-danger/20' };
    case 'partial':
      return { label: '部分', color: 'text-accent-warning', bgColor: 'bg-accent-warning/20' };
    case 'pending':
    default:
      return { label: '进行中', color: 'text-accent-primary', bgColor: 'bg-accent-primary/20' };
  }
}

/**
 * 计算成功率
 */
export function calculateSuccessRate(alerts: RadarAlert[]): {
  total: number;
  completed: number;
  success: number;
  rate: number;
} {
  const total = alerts.length;
  const completed = alerts.filter(a => a.result_status !== 'pending').length;
  const success = alerts.filter(a => a.result_status === 'success').length;
  const rate = completed > 0 ? (success / completed) * 100 : 0;

  return { total, completed, success, rate };
}
