// ============================================
// Supabase 数据服务 - v3.0.0
// ============================================
// 功能：设备ID同步、比赛记录、赔率快照、用户设置、关注列表
// ============================================

import { supabase } from '../lib/supabase';

// ============================================
// 类型定义
// ============================================

// 用户/设备
export interface User {
  id: string;
  device_id: string;
  device_name: string | null;
  created_at: string;
  last_seen_at: string;
}

// 比赛记录（合并评分历史 + 80+ 雷达）
export interface MatchRecord {
  id: number;
  user_id: string | null;
  fixture_id: number;

  // 比赛信息
  league_id: number | null;
  league_name: string | null;
  league_logo: string | null;
  home_team_id: number | null;
  home_team: string;
  home_team_logo: string | null;
  away_team_id: number | null;
  away_team: string;
  away_team_logo: string | null;

  // 比分
  home_score: number;
  away_score: number;
  ht_home_score: number | null;
  ht_away_score: number | null;

  // 评分数据
  max_score: number | null;
  max_score_minute: number | null;
  score_at_alert: number | null;
  alert_minute: number | null;

  // JSONB 字段
  score_factors: ScoreFactors | null;
  alerts: AlertItem[] | null;
  stats_snapshot: StatsSnapshot | null;

  // 80+ 雷达
  is_radar_alert: boolean;
  radar_triggered_at: string | null;

  // 比赛结果
  match_status: string | null;
  final_score: string | null;
  goals_after_alert: number | null;
  is_hit: boolean | null;

  // 时间
  match_date: string | null;
  kick_off_time: string | null;
  created_at: string;
  updated_at: string;
}

// 评分因子
export interface ScoreFactors {
  base: number;
  scoreFactor?: { score: number; details: string };
  attackFactor?: { score: number; details: string };
  momentumFactor?: { score: number; details: string };
  historyFactor?: { score: number; details: string };
  specialFactor?: { score: number; details: string };
  oddsFactor?: { score: number; details: string };
}

// 预警项
export interface AlertItem {
  type: string;
  message: string;
  minute?: number;
}

// 统计快照
export interface StatsSnapshot {
  shots?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
  corners?: { home: number; away: number };
  possession?: { home: number; away: number };
  xg?: { home: number; away: number };
  dangerousAttacks?: { home: number; away: number };
}

// 赔率快照
export interface OddsSnapshot {
  id: number;
  fixture_id: number;
  minute: number | null;

  // 胜平负
  home_win: number | null;
  draw: number | null;
  away_win: number | null;

  // 大小球 - 固定线
  over_1_5: number | null;
  under_1_5: number | null;
  over_2_5: number | null;
  under_2_5: number | null;
  over_3_5: number | null;
  under_3_5: number | null;

  // 大小球 - 主盘口（动态线）
  main_ou_line: number | null;
  main_ou_over: number | null;
  main_ou_under: number | null;

  // 让球
  asian_handicap_line: number | null;
  asian_handicap_home: number | null;
  asian_handicap_away: number | null;

  // 元数据
  bookmaker: string;
  is_live: boolean;
  captured_at: string;
}

// 用户设置
export interface UserSettings {
  user_id: string;
  alert_threshold: number;
  sound_enabled: boolean;
  theme: 'dark' | 'light';
  favorite_leagues: number[] | null;
  default_filters: DefaultFilters | null;
  created_at: string;
  updated_at: string;
}

export interface DefaultFilters {
  minScore?: number;
  maxScore?: number;
  scenarios?: string[];
  leagues?: number[];
}

// 关注列表
export interface WatchlistItem {
  id: number;
  user_id: string | null;
  fixture_id: number;
  home_team: string | null;
  away_team: string | null;
  league_name: string | null;
  match_date: string | null;
  note: string | null;
  added_at: string;
}

// ============================================
// 设备 ID 管理
// ============================================

const DEVICE_ID_KEY = 'ftt_device_id';
const USER_ID_KEY = 'ftt_user_id';

// 生成 UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 获取设备名称
function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS Device';
  if (/Android/.test(ua)) return 'Android Device';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown Device';
}

// 获取或创建设备 ID
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

// 设置设备 ID（用于多设备同步）
export function setDeviceId(deviceId: string): void {
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  localStorage.removeItem(USER_ID_KEY); // 清除旧的 user_id，需要重新获取
}

// 获取当前用户 ID
export function getUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

// 初始化用户（获取或创建）
export async function initUser(): Promise<User | null> {
  const deviceId = getDeviceId();

  // 先尝试查找现有用户
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('device_id', deviceId)
    .single();

  if (existingUser && !findError) {
    // 更新 last_seen_at
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existingUser.id);

    localStorage.setItem(USER_ID_KEY, existingUser.id);
    return existingUser as User;
  }

  // 创建新用户
  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      device_id: deviceId,
      device_name: getDeviceName(),
    })
    .select()
    .single();

  if (createError) {
    console.error('创建用户失败:', createError);
    return null;
  }

  localStorage.setItem(USER_ID_KEY, newUser.id);
  return newUser as User;
}

// ============================================
// Match Records - 比赛记录
// ============================================

export interface MatchRecordInsert {
  fixture_id: number;
  league_id?: number;
  league_name?: string;
  league_logo?: string;
  home_team_id?: number;
  home_team: string;
  home_team_logo?: string;
  away_team_id?: number;
  away_team: string;
  away_team_logo?: string;
  home_score?: number;
  away_score?: number;
  max_score?: number;
  max_score_minute?: number;
  score_at_alert?: number;
  alert_minute?: number;
  score_factors?: ScoreFactors;
  alerts?: AlertItem[];
  stats_snapshot?: StatsSnapshot;
  is_radar_alert?: boolean;
  match_status?: string;
  match_date?: string;
  kick_off_time?: string;
}

export interface MatchRecordUpdate {
  max_score?: number;
  max_score_minute?: number;
  score_at_alert?: number;
  alert_minute?: number;
  score_factors?: ScoreFactors;
  alerts?: AlertItem[];
  stats_snapshot?: StatsSnapshot;
  is_radar_alert?: boolean;
  radar_triggered_at?: string;
  match_status?: string;
  final_score?: string;
  goals_after_alert?: number;
  is_hit?: boolean;
  home_score?: number;
  away_score?: number;
}

// 创建或更新比赛记录
export async function upsertMatchRecord(
  data: MatchRecordInsert
): Promise<MatchRecord | null> {
  const userId = getUserId();

  const { data: record, error } = await supabase
    .from('match_records')
    .upsert(
      {
        user_id: userId,
        ...data,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,fixture_id',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('保存比赛记录失败:', error);
    return null;
  }

  return record as MatchRecord;
}

// 更新比赛记录
export async function updateMatchRecord(
  fixtureId: number,
  update: MatchRecordUpdate
): Promise<boolean> {
  const userId = getUserId();

  const { error } = await supabase
    .from('match_records')
    .update({
      ...update,
      updated_at: new Date().toISOString(),
    })
    .eq('fixture_id', fixtureId)
    .eq('user_id', userId);

  if (error) {
    console.error('更新比赛记录失败:', error);
    return false;
  }

  return true;
}

// 获取比赛记录
export async function getMatchRecord(fixtureId: number): Promise<MatchRecord | null> {
  const userId = getUserId();

  const { data, error } = await supabase
    .from('match_records')
    .select('*')
    .eq('fixture_id', fixtureId)
    .eq('user_id', userId)
    .single();

  if (error) {
    return null;
  }

  return data as MatchRecord;
}

// 获取所有 80+ 雷达记录
export async function getRadarRecords(limit = 100): Promise<MatchRecord[]> {
  const userId = getUserId();

  const { data, error } = await supabase
    .from('match_records')
    .select('*')
    .eq('is_radar_alert', true)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('获取雷达记录失败:', error);
    return [];
  }

  return (data as MatchRecord[]) ?? [];
}

// 获取今日比赛记录
export async function getTodayRecords(): Promise<MatchRecord[]> {
  const userId = getUserId();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('match_records')
    .select('*')
    .eq('match_date', today)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('获取今日记录失败:', error);
    return [];
  }

  return (data as MatchRecord[]) ?? [];
}

// 获取历史记录（分页）
export async function getHistoryRecords(
  page = 1,
  pageSize = 20,
  onlyRadar = false
): Promise<{ records: MatchRecord[]; total: number }> {
  const userId = getUserId();
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('match_records')
    .select('*', { count: 'exact' })
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('match_date', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (onlyRadar) {
    query = query.eq('is_radar_alert', true);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('获取历史记录失败:', error);
    return { records: [], total: 0 };
  }

  return {
    records: (data as MatchRecord[]) ?? [],
    total: count ?? 0,
  };
}

// 获取雷达统计
export async function getRadarStats(): Promise<{
  total: number;
  hits: number;
  misses: number;
  pending: number;
  hitRate: number;
  avgScore: number;
}> {
  const { data, error } = await supabase
    .from('match_records')
    .select('is_hit, max_score, match_status')
    .eq('is_radar_alert', true);

  if (error || !data) {
    return { total: 0, hits: 0, misses: 0, pending: 0, hitRate: 0, avgScore: 0 };
  }

  const records = data as Array<{ is_hit: boolean | null; max_score: number | null; match_status: string | null }>;
  const total = records.length;
  const completed = records.filter(r => r.match_status === 'FT');
  const hits = completed.filter(r => r.is_hit === true).length;
  const misses = completed.filter(r => r.is_hit === false).length;
  const pending = records.filter(r => r.match_status !== 'FT').length;
  const hitRate = completed.length > 0 ? (hits / completed.length) * 100 : 0;
  const avgScore = total > 0
    ? records.reduce((sum, r) => sum + (r.max_score ?? 0), 0) / total
    : 0;

  return { total, hits, misses, pending, hitRate, avgScore };
}

// ============================================
// Odds Snapshots - 赔率快照
// ============================================

export interface OddsSnapshotInsert {
  fixture_id: number;
  minute?: number;
  home_win?: number;
  draw?: number;
  away_win?: number;
  // 大小球 - 固定线
  over_1_5?: number;
  under_1_5?: number;
  over_2_5?: number;
  under_2_5?: number;
  over_3_5?: number;
  under_3_5?: number;
  // 大小球 - 主盘口（动态线）
  main_ou_line?: number;
  main_ou_over?: number;
  main_ou_under?: number;
  // 让球
  asian_handicap_line?: number;
  asian_handicap_home?: number;
  asian_handicap_away?: number;
  bookmaker?: string;
  is_live?: boolean;
}

// 保存赔率快照
export async function saveOddsSnapshot(data: OddsSnapshotInsert): Promise<OddsSnapshot | null> {
  const { data: snapshot, error } = await supabase
    .from('odds_snapshots')
    .upsert(
      {
        ...data,
        bookmaker: data.bookmaker ?? 'API-Football',
        is_live: data.is_live ?? false,
      },
      {
        onConflict: 'fixture_id,minute,bookmaker',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('保存赔率快照失败:', error);
    return null;
  }

  return snapshot as OddsSnapshot;
}

// 获取比赛的赔率历史
export async function getOddsHistory(fixtureId: number): Promise<OddsSnapshot[]> {
  const { data, error } = await supabase
    .from('odds_snapshots')
    .select('*')
    .eq('fixture_id', fixtureId)
    .order('captured_at', { ascending: true });

  if (error) {
    console.error('获取赔率历史失败:', error);
    return [];
  }

  return (data as OddsSnapshot[]) ?? [];
}

// 获取最新赔率
export async function getLatestOdds(fixtureId: number): Promise<OddsSnapshot | null> {
  const { data, error } = await supabase
    .from('odds_snapshots')
    .select('*')
    .eq('fixture_id', fixtureId)
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return null;
  }

  return data as OddsSnapshot;
}

// ============================================
// User Settings - 用户设置
// ============================================

// 获取用户设置
export async function getUserSettings(): Promise<UserSettings | null> {
  const userId = getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // 如果没有设置，创建默认设置
    if (error.code === 'PGRST116') {
      return createDefaultSettings();
    }
    console.error('获取用户设置失败:', error);
    return null;
  }

  return data as UserSettings;
}

// 创建默认设置
async function createDefaultSettings(): Promise<UserSettings | null> {
  const userId = getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .insert({
      user_id: userId,
      alert_threshold: 80,
      sound_enabled: true,
      theme: 'dark',
    })
    .select()
    .single();

  if (error) {
    console.error('创建默认设置失败:', error);
    return null;
  }

  return data as UserSettings;
}

// 更新用户设置
export async function updateUserSettings(
  settings: Partial<Omit<UserSettings, 'user_id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  const userId = getUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from('user_settings')
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('更新用户设置失败:', error);
    return false;
  }

  return true;
}

// ============================================
// Watchlist - 关注列表
// ============================================

// 添加到关注列表
export async function addToWatchlist(
  fixtureId: number,
  matchInfo: {
    home_team?: string;
    away_team?: string;
    league_name?: string;
    match_date?: string;
    note?: string;
  }
): Promise<WatchlistItem | null> {
  const userId = getUserId();

  const { data, error } = await supabase
    .from('watchlist')
    .upsert(
      {
        user_id: userId,
        fixture_id: fixtureId,
        ...matchInfo,
      },
      {
        onConflict: 'user_id,fixture_id',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('添加关注失败:', error);
    return null;
  }

  return data as WatchlistItem;
}

// 从关注列表移除
export async function removeFromWatchlist(fixtureId: number): Promise<boolean> {
  const userId = getUserId();

  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('fixture_id', fixtureId)
    .eq('user_id', userId);

  if (error) {
    console.error('移除关注失败:', error);
    return false;
  }

  return true;
}

// 获取关注列表
export async function getWatchlist(): Promise<WatchlistItem[]> {
  const userId = getUserId();

  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (error) {
    console.error('获取关注列表失败:', error);
    return [];
  }

  return (data as WatchlistItem[]) ?? [];
}

// 检查是否已关注
export async function isInWatchlist(fixtureId: number): Promise<boolean> {
  const userId = getUserId();

  const { data, error } = await supabase
    .from('watchlist')
    .select('id')
    .eq('fixture_id', fixtureId)
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    return false;
  }

  return (data?.length ?? 0) > 0;
}

// 更新关注备注
export async function updateWatchlistNote(fixtureId: number, note: string): Promise<boolean> {
  const userId = getUserId();

  const { error } = await supabase
    .from('watchlist')
    .update({ note })
    .eq('fixture_id', fixtureId)
    .eq('user_id', userId);

  if (error) {
    console.error('更新备注失败:', error);
    return false;
  }

  return true;
}

// ============================================
// 数据迁移工具
// ============================================

// 从 localStorage 迁移评分历史
export async function migrateScoreHistory(): Promise<number> {
  const historyKey = 'ftt_score_history';
  const historyData = localStorage.getItem(historyKey);

  if (!historyData) {
    return 0;
  }

  try {
    const history = JSON.parse(historyData);
    let migratedCount = 0;

    for (const item of history) {
      const result = await upsertMatchRecord({
        fixture_id: item.matchId || item.fixture_id,
        home_team: item.homeTeam || item.home_team || 'Unknown',
        away_team: item.awayTeam || item.away_team || 'Unknown',
        league_name: item.leagueName || item.league_name,
        max_score: item.maxScore || item.max_score,
        match_date: item.date || item.match_date,
        is_radar_alert: (item.maxScore || item.max_score) >= 80,
      });

      if (result) {
        migratedCount++;
      }
    }

    // 迁移成功后清除 localStorage
    if (migratedCount > 0) {
      localStorage.removeItem(historyKey);
      console.log(`成功迁移 ${migratedCount} 条评分历史`);
    }

    return migratedCount;
  } catch (e) {
    console.error('迁移评分历史失败:', e);
    return 0;
  }
}

// 从 localStorage 迁移关注列表
export async function migrateWatchlist(): Promise<number> {
  const watchlistKey = 'watchlist';
  const watchlistData = localStorage.getItem(watchlistKey);

  if (!watchlistData) {
    return 0;
  }

  try {
    const watchlist = JSON.parse(watchlistData);
    let migratedCount = 0;

    for (const item of watchlist) {
      const result = await addToWatchlist(
        item.fixtureId || item.fixture_id || item.matchId,
        {
          home_team: item.homeTeam || item.home_team,
          away_team: item.awayTeam || item.away_team,
          league_name: item.leagueName || item.league_name,
          match_date: item.date || item.match_date,
        }
      );

      if (result) {
        migratedCount++;
      }
    }

    // 迁移成功后清除 localStorage
    if (migratedCount > 0) {
      localStorage.removeItem(watchlistKey);
      console.log(`成功迁移 ${migratedCount} 条关注记录`);
    }

    return migratedCount;
  } catch (e) {
    console.error('迁移关注列表失败:', e);
    return 0;
  }
}

// 执行所有迁移
export async function migrateAllLocalData(): Promise<{
  scoreHistory: number;
  watchlist: number;
}> {
  const scoreHistory = await migrateScoreHistory();
  const watchlist = await migrateWatchlist();

  return { scoreHistory, watchlist };
}
