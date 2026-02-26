/**
 * ============================================
 * Supabase 用户设置服务 - 云端持久化用户配置
 * ============================================
 */

import { supabase } from '../lib/supabase';
import { getOrCreateUser } from './deviceService';
import type { WatchlistItem, StrategyConfig } from '../types';

// Supabase 用户设置结构
interface SupabaseUserSettings {
  user_id: string;
  alert_threshold: number;
  sound_enabled: boolean;
  theme: string;
  refresh_interval: number;
  favorite_leagues: number[] | null;
  default_filters: Record<string, unknown>;
  strategies: StrategyConfig[];
  watchlist: WatchlistItem[];
  created_at: string;
  updated_at: string;
}

// 本地设置结构
export interface LocalUserSettings {
  alertThreshold: number;
  soundEnabled: boolean;
  theme: 'dark';
  refreshInterval: number;
  favoriteLeagues: number[];
  defaultFilters: Record<string, unknown>;
  strategies: StrategyConfig[];
  watchlist: WatchlistItem[];
}

// 默认设置
const DEFAULT_SETTINGS: LocalUserSettings = {
  alertThreshold: 80,
  soundEnabled: true,
  theme: 'dark',
  refreshInterval: 30,
  favoriteLeagues: [],
  defaultFilters: {},
  strategies: [
    {
      id: 'default_late_goal',
      name: '80分钟后进球策略',
      enabled: true,
      params: {
        minScore: 70,
        minMinute: 80,
        maxMinute: 90,
        alertSound: true,
      },
    },
  ],
  watchlist: [],
};

// 转换为本地格式
function toLocalSettings(supaSettings: SupabaseUserSettings): LocalUserSettings {
  return {
    alertThreshold: supaSettings.alert_threshold ?? 80,
    soundEnabled: supaSettings.sound_enabled ?? true,
    theme: 'dark',
    refreshInterval: supaSettings.refresh_interval ?? 30,
    favoriteLeagues: supaSettings.favorite_leagues ?? [],
    defaultFilters: supaSettings.default_filters ?? {},
    strategies: supaSettings.strategies ?? DEFAULT_SETTINGS.strategies,
    watchlist: supaSettings.watchlist ?? [],
  };
}

// 转换为 Supabase 格式
function toSupabaseSettings(
  settings: Partial<LocalUserSettings>,
  userId: string
): Partial<SupabaseUserSettings> {
  const update: Partial<SupabaseUserSettings> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (settings.alertThreshold !== undefined) {
    update.alert_threshold = settings.alertThreshold;
  }
  if (settings.soundEnabled !== undefined) {
    update.sound_enabled = settings.soundEnabled;
  }
  if (settings.theme !== undefined) {
    update.theme = settings.theme;
  }
  if (settings.refreshInterval !== undefined) {
    update.refresh_interval = settings.refreshInterval;
  }
  if (settings.favoriteLeagues !== undefined) {
    update.favorite_leagues = settings.favoriteLeagues;
  }
  if (settings.defaultFilters !== undefined) {
    update.default_filters = settings.defaultFilters;
  }
  if (settings.strategies !== undefined) {
    update.strategies = settings.strategies;
  }
  if (settings.watchlist !== undefined) {
    update.watchlist = settings.watchlist;
  }

  return update;
}

/**
 * 获取用户设置
 */
export async function getCloudSettings(): Promise<LocalUserSettings> {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      return DEFAULT_SETTINGS;
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        await createDefaultSettings(user.id);
        return DEFAULT_SETTINGS;
      }
      console.error('获取云端设置失败:', error);
      return DEFAULT_SETTINGS;
    }

    return toLocalSettings(data as SupabaseUserSettings);
  } catch (error) {
    console.error('获取云端设置异常:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * 创建默认设置
 */
async function createDefaultSettings(userId: string): Promise<void> {
  try {
    const settings = toSupabaseSettings(DEFAULT_SETTINGS, userId);
    settings.created_at = new Date().toISOString();

    await supabase
      .from('user_settings')
      .insert(settings);
  } catch (error) {
    console.error('创建默认设置失败:', error);
  }
}

/**
 * 更新用户设置
 */
export async function updateCloudSettings(
  settings: Partial<LocalUserSettings>
): Promise<boolean> {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      console.error('无法获取用户信息');
      return false;
    }

    const supaSettings = toSupabaseSettings(settings, user.id);

    const { error } = await supabase
      .from('user_settings')
      .upsert(supaSettings, { onConflict: 'user_id' });

    if (error) {
      console.error('更新云端设置失败:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('更新云端设置异常:', error);
    return false;
  }
}

/**
 * 添加到关注列表
 */
export async function addToCloudWatchlist(item: WatchlistItem): Promise<boolean> {
  try {
    const settings = await getCloudSettings();
    const watchlist = settings.watchlist || [];

    if (watchlist.some(w => w.matchId === item.matchId)) {
      return true;
    }

    watchlist.push(item);
    return await updateCloudSettings({ watchlist });
  } catch (error) {
    console.error('添加关注失败:', error);
    return false;
  }
}

/**
 * 从关注列表移除
 */
export async function removeFromCloudWatchlist(matchId: number): Promise<boolean> {
  try {
    const settings = await getCloudSettings();
    const watchlist = (settings.watchlist || []).filter(w => w.matchId !== matchId);
    return await updateCloudSettings({ watchlist });
  } catch (error) {
    console.error('移除关注失败:', error);
    return false;
  }
}

/**
 * 更新策略配置
 */
export async function updateCloudStrategies(strategies: StrategyConfig[]): Promise<boolean> {
  return await updateCloudSettings({ strategies });
}

/**
 * 更新收藏联赛
 */
export async function updateFavoriteLeagues(leagueIds: number[]): Promise<boolean> {
  return await updateCloudSettings({ favoriteLeagues: leagueIds });
}

/**
 * 同步本地设置到云端
 */
export async function syncLocalSettingsToCloud(localSettings: LocalUserSettings): Promise<boolean> {
  return await updateCloudSettings(localSettings);
}

/**
 * 重置设置为默认值
 */
export async function resetCloudSettings(): Promise<boolean> {
  return await updateCloudSettings(DEFAULT_SETTINGS);
}

export { DEFAULT_SETTINGS };
