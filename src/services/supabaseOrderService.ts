/**
 * ============================================
 * Supabase 订单服务 - 云端持久化模拟订单
 * ============================================
 */

import { supabase } from '../lib/supabase';
import { getOrCreateUser, getCurrentUserId } from './deviceService';
import type { SimulatedOrder } from './matchHistoryService';

// Supabase 订单表结构
interface SupabaseOrder {
  id: string;
  user_id: string;
  fixture_id: number;
  created_at: number;
  minute: number;
  bet_type: 'handicap' | 'overUnder' | 'matchWinner';
  selection: string;
  odds: number;
  amount: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  profit: number | null;
  settled_at: number | null;
  home_team: string | null;
  away_team: string | null;
  league_name: string | null;
  match_score: string | null;
  updated_at: string;
}

// 转换为本地格式
function toLocalOrder(supaOrder: SupabaseOrder): SimulatedOrder {
  return {
    id: supaOrder.id,
    fixtureId: supaOrder.fixture_id,
    createdAt: supaOrder.created_at,
    minute: supaOrder.minute,
    betType: supaOrder.bet_type,
    selection: supaOrder.selection,
    odds: Number(supaOrder.odds),
    amount: Number(supaOrder.amount),
    status: supaOrder.status,
    profit: supaOrder.profit !== null ? Number(supaOrder.profit) : undefined,
    settledAt: supaOrder.settled_at ?? undefined,
  };
}

// 转换为 Supabase 格式
function toSupabaseOrder(
  order: SimulatedOrder,
  userId: string,
  matchInfo?: { homeTeam?: string; awayTeam?: string; leagueName?: string; matchScore?: string }
): Partial<SupabaseOrder> {
  return {
    id: order.id,
    user_id: userId,
    fixture_id: order.fixtureId,
    created_at: order.createdAt,
    minute: order.minute,
    bet_type: order.betType,
    selection: order.selection,
    odds: order.odds,
    amount: order.amount,
    status: order.status,
    profit: order.profit ?? null,
    settled_at: order.settledAt ?? null,
    home_team: matchInfo?.homeTeam ?? null,
    away_team: matchInfo?.awayTeam ?? null,
    league_name: matchInfo?.leagueName ?? null,
    match_score: matchInfo?.matchScore ?? null,
  };
}

/**
 * 创建订单到云端
 */
export async function createCloudOrder(
  order: SimulatedOrder,
  matchInfo?: { homeTeam?: string; awayTeam?: string; leagueName?: string; matchScore?: string }
): Promise<boolean> {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      console.error('无法获取用户信息');
      return false;
    }

    const supaOrder = toSupabaseOrder(order, user.id, matchInfo);

    const { error } = await supabase
      .from('simulated_orders')
      .insert(supaOrder);

    if (error) {
      console.error('创建云端订单失败:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('创建云端订单异常:', error);
    return false;
  }
}

/**
 * 更新订单状态
 */
export async function updateCloudOrderStatus(
  orderId: string,
  status: 'won' | 'lost' | 'void',
  profit?: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('simulated_orders')
      .update({
        status,
        profit: profit ?? null,
        settled_at: Date.now(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) {
      console.error('更新云端订单失败:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('更新云端订单异常:', error);
    return false;
  }
}

/**
 * 获取用户所有订单
 */
export async function getCloudOrders(limit = 100): Promise<SimulatedOrder[]> {
  try {
    let userId = getCurrentUserId();
    if (!userId) {
      const user = await getOrCreateUser();
      if (!user) return [];
      userId = user.id;
    }

    const { data, error } = await supabase
      .from('simulated_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('获取云端订单失败:', error);
      return [];
    }

    return (data || []).map(toLocalOrder);
  } catch (error) {
    console.error('获取云端订单异常:', error);
    return [];
  }
}

/**
 * 获取比赛订单
 */
export async function getCloudMatchOrders(fixtureId: number): Promise<SimulatedOrder[]> {
  try {
    const user = await getOrCreateUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('simulated_orders')
      .select('*')
      .eq('user_id', user.id)
      .eq('fixture_id', fixtureId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('获取比赛订单失败:', error);
      return [];
    }

    return (data || []).map(toLocalOrder);
  } catch (error) {
    console.error('获取比赛订单异常:', error);
    return [];
  }
}

/**
 * 获取订单统计
 */
export async function getCloudOrderStats(): Promise<{
  totalOrders: number;
  pendingOrders: number;
  wonOrders: number;
  lostOrders: number;
  winRate: number;
  totalProfit: number;
  totalStake: number;
  roi: number;
}> {
  const emptyStats = {
    totalOrders: 0,
    pendingOrders: 0,
    wonOrders: 0,
    lostOrders: 0,
    winRate: 0,
    totalProfit: 0,
    totalStake: 0,
    roi: 0,
  };

  try {
    const user = await getOrCreateUser();
    if (!user) {
      return emptyStats;
    }

    const { data, error } = await supabase
      .from('simulated_orders')
      .select('status, amount, profit')
      .eq('user_id', user.id);

    if (error || !data) {
      console.error('获取订单统计失败:', error);
      return emptyStats;
    }

    const totalOrders = data.length;
    const pendingOrders = data.filter(o => o.status === 'pending').length;
    const wonOrders = data.filter(o => o.status === 'won').length;
    const lostOrders = data.filter(o => o.status === 'lost').length;
    const settledOrders = data.filter(o => o.status !== 'pending');

    const totalProfit = settledOrders.reduce((sum, o) => sum + (Number(o.profit) || 0), 0);
    const totalStake = settledOrders.reduce((sum, o) => sum + Number(o.amount), 0);
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
  } catch (error) {
    console.error('获取订单统计异常:', error);
    return emptyStats;
  }
}

/**
 * 同步本地订单到云端
 */
export async function syncLocalOrdersToCloud(localOrders: SimulatedOrder[]): Promise<number> {
  try {
    const user = await getOrCreateUser();
    if (!user) return 0;

    const { data: cloudOrders } = await supabase
      .from('simulated_orders')
      .select('id')
      .eq('user_id', user.id);

    const cloudIds = new Set((cloudOrders || []).map(o => o.id));
    const ordersToSync = localOrders.filter(o => !cloudIds.has(o.id));

    if (ordersToSync.length === 0) return 0;

    const supaOrders = ordersToSync.map(o => toSupabaseOrder(o, user.id));

    const { error } = await supabase
      .from('simulated_orders')
      .insert(supaOrders);

    if (error) {
      console.error('同步订单失败:', error);
      return 0;
    }

    return ordersToSync.length;
  } catch (error) {
    console.error('同步订单异常:', error);
    return 0;
  }
}

/**
 * 删除订单
 */
export async function deleteCloudOrder(orderId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('simulated_orders')
      .delete()
      .eq('id', orderId);

    if (error) {
      console.error('删除订单失败:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('删除订单异常:', error);
    return false;
  }
}

/**
 * 清除用户所有订单
 */
export async function clearCloudOrders(): Promise<boolean> {
  try {
    const user = await getOrCreateUser();
    if (!user) return false;

    const { error } = await supabase
      .from('simulated_orders')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('清除订单失败:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('清除订单异常:', error);
    return false;
  }
}
