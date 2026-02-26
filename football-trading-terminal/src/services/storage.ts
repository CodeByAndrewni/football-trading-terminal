// ============================================
// 足球交易决策终端 - 本地存储服务
// ============================================

import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../config/constants';
import type { WatchlistItem, StrategyConfig, UserSettings } from '../types';

// 通用存储方法
function getItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    console.error(`读取 ${key} 失败`);
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error(`保存 ${key} 失败`);
  }
}

// 关注列表
export function getWatchlist(): WatchlistItem[] {
  return getItem<WatchlistItem[]>(STORAGE_KEYS.WATCHLIST, []);
}

export function addToWatchlist(item: WatchlistItem): void {
  const watchlist = getWatchlist();
  const exists = watchlist.find(w => w.matchId === item.matchId);
  if (!exists) {
    watchlist.push(item);
    setItem(STORAGE_KEYS.WATCHLIST, watchlist);
  }
}

export function removeFromWatchlist(matchId: number): void {
  const watchlist = getWatchlist();
  const filtered = watchlist.filter(w => w.matchId !== matchId);
  setItem(STORAGE_KEYS.WATCHLIST, filtered);
}

export function isInWatchlist(matchId: number): boolean {
  const watchlist = getWatchlist();
  return watchlist.some(w => w.matchId === matchId);
}

export function updateWatchlistItem(matchId: number, updates: Partial<WatchlistItem>): void {
  const watchlist = getWatchlist();
  const index = watchlist.findIndex(w => w.matchId === matchId);
  if (index !== -1) {
    watchlist[index] = { ...watchlist[index], ...updates };
    setItem(STORAGE_KEYS.WATCHLIST, watchlist);
  }
}

// 策略配置
export function getStrategies(): StrategyConfig[] {
  return getItem<StrategyConfig[]>(STORAGE_KEYS.STRATEGIES, DEFAULT_SETTINGS.strategies);
}

export function saveStrategies(strategies: StrategyConfig[]): void {
  setItem(STORAGE_KEYS.STRATEGIES, strategies);
}

export function addStrategy(strategy: StrategyConfig): void {
  const strategies = getStrategies();
  strategies.push(strategy);
  setItem(STORAGE_KEYS.STRATEGIES, strategies);
}

export function updateStrategy(id: string, updates: Partial<StrategyConfig>): void {
  const strategies = getStrategies();
  const index = strategies.findIndex(s => s.id === id);
  if (index !== -1) {
    strategies[index] = { ...strategies[index], ...updates };
    setItem(STORAGE_KEYS.STRATEGIES, strategies);
  }
}

export function removeStrategy(id: string): void {
  const strategies = getStrategies();
  const filtered = strategies.filter(s => s.id !== id);
  setItem(STORAGE_KEYS.STRATEGIES, filtered);
}

// 用户设置
export function getSettings(): UserSettings {
  return getItem<UserSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export function saveSettings(settings: Partial<UserSettings>): void {
  const current = getSettings();
  setItem(STORAGE_KEYS.SETTINGS, { ...current, ...settings });
}

// 清除所有数据
export function clearAllData(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    localStorage.removeItem(key);
  }
}
