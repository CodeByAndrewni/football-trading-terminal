// ============================================
// Supabase 客户端配置 - 80+ 雷达功能
// ============================================

import { createClient } from '@supabase/supabase-js';

// Supabase 配置（浏览器端使用 anon key）
// URL / Key 均从环境变量读取，避免在代码库中硬编码敏感信息。
// 统一推荐的变量名：
// - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY（前端）
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（服务端）
// 旧的 SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY / NEXT_PUBLIC_SUPABASE_* 仍保留为兼容读取。
const SUPABASE_URL =
  // 推荐：前端环境变量（Vite 公共变量）
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  // 兼容：旧 Next 公共变量
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL ||
  // Node / Serverless 环境变量兜底
  (typeof process !== 'undefined'
    ? process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL
    : undefined) ||
  '';

const SUPABASE_ANON_KEY =
  // 推荐：前端环境变量（Vite 公共变量）
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  // 兼容：旧 Next 公共变量
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  // 兼容：旧 SUPABASE_ANON_KEY（Node 端）
  (typeof process !== 'undefined'
    ? process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY
    : undefined) ||
  '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // 在开发/本地模式下给出友好提示，避免核心逻辑直接崩溃
  console.warn(
    '[Supabase] SUPABASE_URL / ANON_KEY 未配置，云端同步与雷达等功能将被禁用（核心评分仍使用 API-Football 实时数据）。'
  );
}

// 数据库类型定义
export interface RadarAlert {
  id: string;
  match_id: number;
  league_name: string;
  home_team: string;
  away_team: string;
  trigger_minute: number;
  trigger_score_home: number;
  trigger_score_away: number;
  trigger_rating: number;
  trigger_xg_home: number | null;
  trigger_xg_away: number | null;
  trigger_handicap: number | null;
  trigger_over_under: number | null;
  scenario_tags: string[] | null;
  final_score_home: number | null;
  final_score_away: number | null;
  final_minute: number | null;
  had_goal_after_trigger: boolean | null;
  goal_count_after_trigger: number | null;
  first_goal_minute: number | null;
  result_status: 'pending' | 'success' | 'failed' | 'partial';
  success_type: 'goal_scored' | 'trend_correct' | null;
  created_at: string;
  updated_at: string;
  match_ended_at: string | null;
}

export interface RadarStats {
  id: string;
  stat_date: string;
  total_alerts: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  success_rate: number | null;
  avg_trigger_rating: number | null;
  avg_goal_time: number | null;
  created_at: string;
  updated_at: string;
}

export interface RadarAlertInsert {
  match_id: number;
  league_name: string;
  home_team: string;
  away_team: string;
  trigger_minute: number;
  trigger_score_home: number;
  trigger_score_away: number;
  trigger_rating: number;
  trigger_xg_home?: number | null;
  trigger_xg_away?: number | null;
  trigger_handicap?: number | null;
  trigger_over_under?: number | null;
  scenario_tags?: string[] | null;
}

export interface RadarAlertUpdate {
  final_score_home?: number;
  final_score_away?: number;
  final_minute?: number;
  had_goal_after_trigger?: boolean;
  goal_count_after_trigger?: number;
  first_goal_minute?: number;
  result_status?: 'pending' | 'success' | 'failed' | 'partial';
  success_type?: 'goal_scored' | 'trend_correct' | null;
  match_ended_at?: string;
  updated_at?: string;
}

// Supabase 浏览器客户端（使用 anon key）
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Supabase 服务端客户端（仅在 Node / Serverless 环境使用 service role key）
export function createServerSupabaseClient() {
  if (typeof process === 'undefined') {
    throw new Error('createServerSupabaseClient 只能在服务端环境中调用');
  }

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  if (!url || !serviceRoleKey) {
    console.warn('[Supabase] 服务端 SUPABASE_URL / SERVICE_ROLE_KEY 未配置，跳过服务端访问。');
    throw new Error('Supabase server credentials not configured');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Radar Alert 服务函数
export async function createRadarAlert(data: RadarAlertInsert): Promise<RadarAlert | null> {
  const { data: alert, error } = await supabase
    .from('radar_alerts')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('创建预警记录失败:', error);
    return null;
  }

  return alert as RadarAlert;
}

export async function hasExistingAlert(matchId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('radar_alerts')
    .select('id')
    .eq('match_id', matchId)
    .limit(1);

  if (error) {
    console.error('查询预警记录失败:', error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

export async function updateRadarAlertResult(
  matchId: number,
  update: RadarAlertUpdate
): Promise<boolean> {
  const { error } = await supabase
    .from('radar_alerts')
    .update({
      ...update,
      updated_at: new Date().toISOString(),
    })
    .eq('match_id', matchId);

  if (error) {
    console.error('更新预警结果失败:', error);
    return false;
  }

  return true;
}

export async function getPendingAlerts(): Promise<RadarAlert[]> {
  const { data, error } = await supabase
    .from('radar_alerts')
    .select('*')
    .eq('result_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('获取待处理预警失败:', error);
    return [];
  }

  return (data as RadarAlert[]) ?? [];
}

export async function getRecentAlerts(limit = 50): Promise<RadarAlert[]> {
  const { data, error } = await supabase
    .from('radar_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('获取预警记录失败:', error);
    return [];
  }

  return (data as RadarAlert[]) ?? [];
}

export async function getTodayAlerts(): Promise<RadarAlert[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('radar_alerts')
    .select('*')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('获取今日预警失败:', error);
    return [];
  }

  return (data as RadarAlert[]) ?? [];
}

export async function calculateOverallStats(): Promise<{
  total: number;
  success: number;
  failed: number;
  pending: number;
  successRate: number;
  avgRating: number;
}> {
  const { data, error } = await supabase
    .from('radar_alerts')
    .select('result_status, trigger_rating');

  if (error || !data) {
    return { total: 0, success: 0, failed: 0, pending: 0, successRate: 0, avgRating: 0 };
  }

  const alerts = data as Array<{ result_status: string; trigger_rating: number }>;
  const total = alerts.length;
  const success = alerts.filter(d => d.result_status === 'success').length;
  const failed = alerts.filter(d => d.result_status === 'failed').length;
  const pending = alerts.filter(d => d.result_status === 'pending').length;
  const avgRating = total > 0
    ? alerts.reduce((sum, d) => sum + d.trigger_rating, 0) / total
    : 0;
  const completedCount = success + failed;
  const successRate = completedCount > 0 ? (success / completedCount) * 100 : 0;

  return { total, success, failed, pending, successRate, avgRating };
}

// 每日统计数据接口
export interface DailyStats {
  date: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  successRate: number;
  avgRating: number;
}

// 获取历史每日统计数据（用于趋势图表）
export async function getDailyStats(days = 30): Promise<DailyStats[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('radar_alerts')
    .select('created_at, result_status, trigger_rating')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error || !data) {
    return [];
  }

  // 按日期分组统计
  const dailyMap = new Map<string, {
    total: number;
    success: number;
    failed: number;
    pending: number;
    ratings: number[];
  }>();

  // 初始化所有日期
  for (let i = 0; i <= days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));
    const dateStr = date.toISOString().split('T')[0];
    dailyMap.set(dateStr, { total: 0, success: 0, failed: 0, pending: 0, ratings: [] });
  }

  // 统计数据
  for (const alert of data) {
    const dateStr = new Date(alert.created_at).toISOString().split('T')[0];
    const stats = dailyMap.get(dateStr);
    if (stats) {
      stats.total++;
      stats.ratings.push(alert.trigger_rating);
      if (alert.result_status === 'success') stats.success++;
      else if (alert.result_status === 'failed') stats.failed++;
      else stats.pending++;
    }
  }

  // 转换为数组
  const result: DailyStats[] = [];
  dailyMap.forEach((stats, date) => {
    const completed = stats.success + stats.failed;
    result.push({
      date,
      total: stats.total,
      success: stats.success,
      failed: stats.failed,
      pending: stats.pending,
      successRate: completed > 0 ? (stats.success / completed) * 100 : 0,
      avgRating: stats.ratings.length > 0
        ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
        : 0,
    });
  });

  return result;
}
