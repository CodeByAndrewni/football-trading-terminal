/**
 * ============================================
 * 设备服务 - 管理设备 ID 和用户注册
 * 无需登录，通过设备 ID 实现数据同步
 * ============================================
 */

import { supabase } from '../lib/supabase';

const DEVICE_ID_KEY = 'livepro_device_id';
const USER_ID_KEY = 'livepro_user_id';

interface DeviceUser {
  id: string;
  deviceId: string;
  deviceName: string;
}

let cachedUser: DeviceUser | null = null;

/**
 * 生成设备 ID
 */
function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const randomPart2 = Math.random().toString(36).substring(2, 10);
  return `device_${timestamp}_${randomPart}${randomPart2}`;
}

/**
 * 获取设备名称
 */
function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Mac')) return 'Mac';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown Device';
}

/**
 * 获取或创建设备 ID
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

/**
 * 获取本地缓存的用户 ID
 */
export function getCachedUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

/**
 * 注册或获取用户
 */
export async function getOrCreateUser(): Promise<DeviceUser | null> {
  // 如果有缓存，直接返回
  if (cachedUser) {
    return cachedUser;
  }

  const deviceId = getDeviceId();
  const cachedUserId = getCachedUserId();

  // 先尝试查询现有用户
  if (cachedUserId) {
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', cachedUserId)
      .single();

    if (!fetchError && existingUser) {
      // 更新最后活跃时间
      await supabase
        .from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', cachedUserId);

      cachedUser = {
        id: existingUser.id,
        deviceId: existingUser.device_id,
        deviceName: existingUser.device_name || getDeviceName(),
      };
      return cachedUser;
    }
  }

  // 通过 device_id 查询
  const { data: userByDevice, error: deviceError } = await supabase
    .from('users')
    .select('*')
    .eq('device_id', deviceId)
    .single();

  if (!deviceError && userByDevice) {
    // 找到了用户，更新缓存
    localStorage.setItem(USER_ID_KEY, userByDevice.id);

    // 更新最后活跃时间
    await supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userByDevice.id);

    cachedUser = {
      id: userByDevice.id,
      deviceId: userByDevice.device_id,
      deviceName: userByDevice.device_name || getDeviceName(),
    };
    return cachedUser;
  }

  // 创建新用户
  const { data: newUser, error: insertError } = await supabase
    .from('users')
    .insert({
      device_id: deviceId,
      device_name: getDeviceName(),
    })
    .select()
    .single();

  if (insertError) {
    console.error('创建用户失败:', insertError);
    return null;
  }

  if (newUser) {
    localStorage.setItem(USER_ID_KEY, newUser.id);
    cachedUser = {
      id: newUser.id,
      deviceId: newUser.device_id,
      deviceName: newUser.device_name || getDeviceName(),
    };
    return cachedUser;
  }

  return null;
}

/**
 * 获取当前用户 ID (同步方法，可能返回 null)
 */
export function getCurrentUserId(): string | null {
  return cachedUser?.id || getCachedUserId();
}

/**
 * 清除本地设备数据
 */
export function clearDeviceData(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(USER_ID_KEY);
  cachedUser = null;
}

/**
 * 导入设备 ID (用于多设备同步)
 */
export async function importDeviceId(newDeviceId: string): Promise<boolean> {
  try {
    // 查询是否存在该设备
    const { data: existingUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('device_id', newDeviceId)
      .single();

    if (error || !existingUser) {
      console.error('设备不存在:', newDeviceId);
      return false;
    }

    // 更新本地存储
    localStorage.setItem(DEVICE_ID_KEY, newDeviceId);
    localStorage.setItem(USER_ID_KEY, existingUser.id);

    cachedUser = {
      id: existingUser.id,
      deviceId: existingUser.device_id,
      deviceName: existingUser.device_name || getDeviceName(),
    };

    return true;
  } catch (error) {
    console.error('导入设备 ID 失败:', error);
    return false;
  }
}
