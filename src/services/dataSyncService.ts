/**
 * ============================================
 * 数据同步服务 - 本地存储 + 云端同步
 * 实现离线优先，在线时自动同步到 Supabase
 * ============================================
 */

import { getOrCreateUser, getDeviceId } from './deviceService';
import {
  getSimulatedOrders,
  saveSimulatedOrders,
  type SimulatedOrder,
} from './matchHistoryService';
import {
  createCloudOrder,
  updateCloudOrderStatus,
  getCloudOrders,
  syncLocalOrdersToCloud,
  getCloudOrderStats,
} from './supabaseOrderService';
import {
  getCloudSettings,
  updateCloudSettings,
  type LocalUserSettings,
} from './supabaseSettingsService';
import { getSettings, saveSettings } from './storage';

// 同步状态
interface SyncStatus {
  lastSyncTime: number | null;
  pendingOrdersCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  error: string | null;
}

const syncStatus: SyncStatus = {
  lastSyncTime: null,
  pendingOrdersCount: 0,
  isOnline: navigator.onLine,
  isSyncing: false,
  error: null,
};

// 监听在线状态
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncStatus.isOnline = true;
    triggerSync();
  });

  window.addEventListener('offline', () => {
    syncStatus.isOnline = false;
  });
}

/**
 * 初始化数据同步服务
 */
export async function initDataSync(): Promise<void> {
  try {
    // 确保用户已注册
    await getOrCreateUser();

    // 同步本地订单到云端
    if (syncStatus.isOnline) {
      await syncAllData();
    }

    console.log('[DataSync] 初始化完成, 设备ID:', getDeviceId());
  } catch (error) {
    console.error('[DataSync] 初始化失败:', error);
  }
}

/**
 * 触发同步
 */
export async function triggerSync(): Promise<void> {
  if (!syncStatus.isOnline || syncStatus.isSyncing) {
    return;
  }

  await syncAllData();
}

/**
 * 同步所有数据
 */
async function syncAllData(): Promise<void> {
  if (syncStatus.isSyncing) return;

  syncStatus.isSyncing = true;
  syncStatus.error = null;

  try {
    // 1. 同步本地订单到云端
    const localOrders = getSimulatedOrders();
    const syncedCount = await syncLocalOrdersToCloud(localOrders);

    if (syncedCount > 0) {
      console.log(`[DataSync] 同步了 ${syncedCount} 个订单到云端`);
    }

    // 2. 从云端获取最新订单
    const cloudOrders = await getCloudOrders(500);

    // 合并云端订单到本地（云端优先）
    const mergedOrders = mergeOrders(localOrders, cloudOrders);
    saveSimulatedOrders(mergedOrders);

    syncStatus.lastSyncTime = Date.now();
    syncStatus.pendingOrdersCount = 0;

    console.log('[DataSync] 数据同步完成');
  } catch (error) {
    syncStatus.error = error instanceof Error ? error.message : '同步失败';
    console.error('[DataSync] 同步失败:', error);
  } finally {
    syncStatus.isSyncing = false;
  }
}

/**
 * 合并订单（云端状态优先）
 */
function mergeOrders(
  localOrders: SimulatedOrder[],
  cloudOrders: SimulatedOrder[]
): SimulatedOrder[] {
  const orderMap = new Map<string, SimulatedOrder>();

  // 先添加本地订单
  for (const order of localOrders) {
    orderMap.set(order.id, order);
  }

  // 云端订单覆盖本地（云端状态更权威）
  for (const order of cloudOrders) {
    const local = orderMap.get(order.id);
    if (!local || order.settledAt) {
      // 云端订单是最新的，或者云端已结算
      orderMap.set(order.id, order);
    }
  }

  // 按创建时间排序
  return Array.from(orderMap.values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 创建订单（本地 + 云端）
 */
export async function createOrderWithSync(
  order: Omit<SimulatedOrder, 'id' | 'createdAt' | 'status'>,
  matchInfo?: { homeTeam?: string; awayTeam?: string; leagueName?: string; matchScore?: string }
): Promise<SimulatedOrder> {
  const newOrder: SimulatedOrder = {
    ...order,
    id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    status: 'pending',
  };

  // 保存到本地
  const orders = getSimulatedOrders();
  orders.unshift(newOrder);
  saveSimulatedOrders(orders);

  // 异步同步到云端
  if (syncStatus.isOnline) {
    createCloudOrder(newOrder, matchInfo).catch((err: unknown) => {
      console.error('[DataSync] 同步订单到云端失败:', err);
      syncStatus.pendingOrdersCount++;
    });
  } else {
    syncStatus.pendingOrdersCount++;
  }

  return newOrder;
}

/**
 * 更新订单状态（本地 + 云端）
 */
export async function updateOrderStatusWithSync(
  orderId: string,
  status: 'won' | 'lost' | 'void',
  profit?: number
): Promise<void> {
  // 更新本地
  const orders = getSimulatedOrders();
  const orderIndex = orders.findIndex(o => o.id === orderId);

  if (orderIndex !== -1) {
    orders[orderIndex] = {
      ...orders[orderIndex],
      status,
      profit,
      settledAt: Date.now(),
    };
    saveSimulatedOrders(orders);
  }

  // 异步同步到云端
  if (syncStatus.isOnline) {
    updateCloudOrderStatus(orderId, status, profit).catch((err: unknown) => {
      console.error('[DataSync] 更新云端订单状态失败:', err);
    });
  }
}

/**
 * 获取订单统计（优先使用云端数据）
 */
export async function getOrderStatsWithSync(): Promise<{
  totalOrders: number;
  pendingOrders: number;
  wonOrders: number;
  lostOrders: number;
  winRate: number;
  totalProfit: number;
  totalStake: number;
  roi: number;
}> {
  if (syncStatus.isOnline) {
    try {
      return await getCloudOrderStats();
    } catch {
      // 回退到本地统计
    }
  }

  // 本地统计
  const orders = getSimulatedOrders();
  const settledOrders = orders.filter(o => o.status !== 'pending');

  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const wonOrders = orders.filter(o => o.status === 'won').length;
  const lostOrders = orders.filter(o => o.status === 'lost').length;

  const totalProfit = settledOrders.reduce((sum, o) => sum + (o.profit ?? 0), 0);
  const totalStake = settledOrders.reduce((sum, o) => sum + o.amount, 0);
  const roi = totalStake > 0 ? Math.round((totalProfit / totalStake) * 100) : 0;
  const winRate = settledOrders.length > 0
    ? Math.round((wonOrders / settledOrders.length) * 100)
    : 0;

  return {
    totalOrders,
    pendingOrders,
    wonOrders,
    lostOrders,
    winRate,
    totalProfit,
    totalStake,
    roi,
  };
}

/**
 * 同步用户设置
 */
export async function syncSettings(): Promise<LocalUserSettings> {
  if (syncStatus.isOnline) {
    try {
      const cloudSettings = await getCloudSettings();
      return cloudSettings;
    } catch (error) {
      console.error('[DataSync] 获取云端设置失败:', error);
    }
  }

  // 回退到本地设置
  const localSettings = getSettings();
  return {
    alertThreshold: 80,
    soundEnabled: localSettings.soundEnabled,
    theme: 'dark',
    refreshInterval: localSettings.refreshInterval,
    favoriteLeagues: [],
    defaultFilters: {},
    strategies: localSettings.strategies,
    watchlist: localSettings.watchlist,
  };
}

/**
 * 保存用户设置（本地 + 云端）
 */
export async function saveSettingsWithSync(settings: Partial<LocalUserSettings>): Promise<void> {
  // 保存到本地
  const localUpdate: Record<string, unknown> = {};
  if (settings.soundEnabled !== undefined) localUpdate.soundEnabled = settings.soundEnabled;
  if (settings.refreshInterval !== undefined) localUpdate.refreshInterval = settings.refreshInterval;
  if (settings.strategies !== undefined) localUpdate.strategies = settings.strategies;
  if (settings.watchlist !== undefined) localUpdate.watchlist = settings.watchlist;

  saveSettings(localUpdate);

  // 同步到云端
  if (syncStatus.isOnline) {
    updateCloudSettings(settings).catch(err => {
      console.error('[DataSync] 同步设置到云端失败:', err);
    });
  }
}

/**
 * 获取同步状态
 */
export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

/**
 * 强制从云端刷新
 */
export async function forceRefreshFromCloud(): Promise<void> {
  if (!syncStatus.isOnline) {
    throw new Error('无网络连接');
  }

  const cloudOrders = await getCloudOrders(500);
  saveSimulatedOrders(cloudOrders);

  syncStatus.lastSyncTime = Date.now();
  console.log('[DataSync] 从云端刷新完成');
}
