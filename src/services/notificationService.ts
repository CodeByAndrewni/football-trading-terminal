// ============================================
// 浏览器通知服务 - 盘口预警推送
// ============================================

import { soundService, type SoundType } from './soundService';

// 通知类型
export type NotificationType =
  | 'goal'              // 进球
  | 'high_score'        // 高评分预警
  | 'odds_alert'        // 盘口异常
  | 'strong_behind'     // 强队落后
  | 'divergence'        // 盘口背离
  | 'corner_dense'      // 角球密集
  | 'late_shift'        // 临场变盘
  | 'radar_80plus';     // 80+ 雷达预警

// 通知配置
interface NotificationConfig {
  title: string;
  icon: string;       // emoji 图标
  tag: string;        // 用于去重
  requireInteraction: boolean;
  sound?: SoundType;
}

// 预设通知配置
const NOTIFICATION_CONFIGS: Record<NotificationType, NotificationConfig> = {
  goal: {
    title: '⚽ 进球!',
    icon: '⚽',
    tag: 'goal',
    requireInteraction: false,
    sound: 'goal',
  },
  high_score: {
    title: '🔥 高评分机会',
    icon: '🔥',
    tag: 'high_score',
    requireInteraction: true,
    sound: 'high_score',
  },
  odds_alert: {
    title: '⚠️ 盘口异常',
    icon: '⚠️',
    tag: 'odds_alert',
    requireInteraction: true,
    sound: 'alert',
  },
  strong_behind: {
    title: '🔴 强队落后',
    icon: '🔴',
    tag: 'strong_behind',
    requireInteraction: true,
    sound: 'strong_behind',
  },
  divergence: {
    title: '📊 盘口背离',
    icon: '📊',
    tag: 'divergence',
    requireInteraction: true,
    sound: 'alert',
  },
  corner_dense: {
    title: '🚩 角球密集',
    icon: '🚩',
    tag: 'corner_dense',
    requireInteraction: false,
    sound: 'corner',
  },
  late_shift: {
    title: '🔴 临场变盘',
    icon: '🔴',
    tag: 'late_shift',
    requireInteraction: true,
    sound: 'high_score',
  },
  radar_80plus: {
    title: '🎯 80+ 雷达预警',
    icon: '🎯',
    tag: 'radar_80plus',
    requireInteraction: true,
    sound: 'high_score',
  },
};

// 通知历史记录（防止重复通知）
interface NotificationRecord {
  matchId: number;
  type: NotificationType;
  timestamp: number;
}

// 各类型通知的启用状态
export interface NotificationTypeSettings {
  goal: boolean;
  high_score: boolean;
  odds_alert: boolean;
  strong_behind: boolean;
  divergence: boolean;
  corner_dense: boolean;
  late_shift: boolean;
  radar_80plus: boolean;
}

// 默认通知类型设置
const DEFAULT_TYPE_SETTINGS: NotificationTypeSettings = {
  goal: true,
  high_score: true,
  odds_alert: true,
  strong_behind: true,
  divergence: true,
  corner_dense: false,  // 默认关闭角球通知（太频繁）
  late_shift: true,
  radar_80plus: true,
};

// 通知服务类
class NotificationService {
  private enabled = true;
  private permission: NotificationPermission = 'default';
  private notificationHistory: NotificationRecord[] = [];
  private historyMaxAge = 5 * 60 * 1000;  // 5分钟内不重复通知
  private playSound = true;
  private typeSettings: NotificationTypeSettings = { ...DEFAULT_TYPE_SETTINGS };

  constructor() {
    this.loadSettings();
    this.checkPermission();
  }

  // 检查通知权限
  private checkPermission(): void {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  // 请求通知权限
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('此浏览器不支持桌面通知');
      return 'denied';
    }

    try {
      this.permission = await Notification.requestPermission();
      this.saveSettings();
      return this.permission;
    } catch (error) {
      console.error('请求通知权限失败:', error);
      return 'denied';
    }
  }

  // 获取权限状态
  getPermission(): NotificationPermission {
    return this.permission;
  }

  // 是否可以发送通知
  canNotify(): boolean {
    return this.enabled && this.permission === 'granted' && 'Notification' in window;
  }

  // 清理过期的历史记录
  private cleanHistory(): void {
    const now = Date.now();
    this.notificationHistory = this.notificationHistory.filter(
      record => now - record.timestamp < this.historyMaxAge
    );
  }

  // 检查是否已经通知过
  private hasRecentNotification(matchId: number, type: NotificationType): boolean {
    this.cleanHistory();
    return this.notificationHistory.some(
      record => record.matchId === matchId && record.type === type
    );
  }

  // 记录通知
  private recordNotification(matchId: number, type: NotificationType): void {
    this.notificationHistory.push({
      matchId,
      type,
      timestamp: Date.now(),
    });
  }

  // 发送通知
  notify(
    type: NotificationType,
    matchId: number,
    body: string,
    data?: { url?: string; matchInfo?: string }
  ): void {
    // 检查是否启用
    if (!this.canNotify()) return;

    // 检查该类型通知是否启用
    if (!this.isTypeEnabled(type)) return;

    // 检查是否已通知过
    if (this.hasRecentNotification(matchId, type)) return;

    const config = NOTIFICATION_CONFIGS[type];
    if (!config) return;

    try {
      const notification = new Notification(config.title, {
        body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: `${config.tag}-${matchId}`,
        requireInteraction: config.requireInteraction,
        silent: true,  // 我们使用自己的音效系统
        data,
      });

      // 点击通知时的处理
      notification.onclick = () => {
        window.focus();
        if (data?.url) {
          window.location.href = data.url;
        }
        notification.close();
      };

      // 自动关闭（非重要通知）
      if (!config.requireInteraction) {
        setTimeout(() => notification.close(), 8000);
      }

      // 记录通知
      this.recordNotification(matchId, type);

      // 播放音效
      if (this.playSound && config.sound) {
        soundService.play(config.sound);
      }

    } catch (error) {
      console.error('发送通知失败:', error);
    }
  }

  // 发送进球通知
  notifyGoal(matchId: number, homeTeam: string, awayTeam: string, score: string, minute: number): void {
    this.notify(
      'goal',
      matchId,
      `${homeTeam} ${score} ${awayTeam} (${minute}')`
    );
  }

  // 发送高评分通知
  notifyHighScore(matchId: number, homeTeam: string, awayTeam: string, score: number, minute: number): void {
    this.notify(
      'high_score',
      matchId,
      `${homeTeam} vs ${awayTeam} - 评分 ${score.toFixed(1)} (${minute}')`
    );
  }

  // 发送盘口异常通知
  notifyOddsAlert(matchId: number, homeTeam: string, awayTeam: string, message: string, minute: number): void {
    this.notify(
      'odds_alert',
      matchId,
      `${homeTeam} vs ${awayTeam} - ${message} (${minute}')`
    );
  }

  // 发送强队落后通知
  notifyStrongBehind(matchId: number, teamName: string, scoreDiff: number, minute: number): void {
    this.notify(
      'strong_behind',
      matchId,
      `${teamName} 落后 ${Math.abs(scoreDiff)} 球 (${minute}')`
    );
  }

  // 发送盘口背离通知
  notifyDivergence(matchId: number, homeTeam: string, awayTeam: string, description: string, minute: number): void {
    this.notify(
      'divergence',
      matchId,
      `${homeTeam} vs ${awayTeam} - ${description} (${minute}')`
    );
  }

  // 发送临场变盘通知
  notifyLateShift(matchId: number, homeTeam: string, awayTeam: string, change: number, minute: number): void {
    this.notify(
      'late_shift',
      matchId,
      `${homeTeam} vs ${awayTeam} - 盘口变化 ${change.toFixed(2)} (${minute}')`
    );
  }

  // 发送 80+ 雷达预警通知
  notifyRadar80Plus(
    matchId: number,
    homeTeam: string,
    awayTeam: string,
    rating: number,
    minute: number,
    score: string,
    league: string
  ): void {
    const ratingEmoji = rating >= 90 ? '🔥🔥' : rating >= 85 ? '🔥' : '🎯';
    this.notify(
      'radar_80plus',
      matchId,
      `${league}\n${homeTeam} ${score} ${awayTeam}\n评分 ${rating} ${ratingEmoji} (${minute}')`,
      { url: `/match/${matchId}` }
    );
  }

  // 设置启用状态
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.saveSettings();
  }

  // 获取启用状态
  isEnabled(): boolean {
    return this.enabled;
  }

  // 设置是否播放音效
  setPlaySound(play: boolean): void {
    this.playSound = play;
    this.saveSettings();
  }

  // 获取音效设置
  isPlaySoundEnabled(): boolean {
    return this.playSound;
  }

  // 获取所有类型设置
  getTypeSettings(): NotificationTypeSettings {
    return { ...this.typeSettings };
  }

  // 检查某类型是否启用
  isTypeEnabled(type: NotificationType): boolean {
    return this.typeSettings[type] ?? true;
  }

  // 设置某类型的启用状态
  setTypeEnabled(type: NotificationType, enabled: boolean): void {
    this.typeSettings[type] = enabled;
    this.saveSettings();
  }

  // 批量设置类型状态
  setTypeSettings(settings: Partial<NotificationTypeSettings>): void {
    this.typeSettings = { ...this.typeSettings, ...settings };
    this.saveSettings();
  }

  // 重置为默认设置
  resetTypeSettings(): void {
    this.typeSettings = { ...DEFAULT_TYPE_SETTINGS };
    this.saveSettings();
  }

  // 保存设置
  private saveSettings(): void {
    try {
      localStorage.setItem('ftt_notification_settings', JSON.stringify({
        enabled: this.enabled,
        playSound: this.playSound,
        typeSettings: this.typeSettings,
      }));
    } catch (error) {
      console.warn('保存通知设置失败:', error);
    }
  }

  // 加载设置
  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('ftt_notification_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.enabled = settings.enabled ?? true;
        this.playSound = settings.playSound ?? true;
        this.typeSettings = { ...DEFAULT_TYPE_SETTINGS, ...settings.typeSettings };
      }
    } catch (error) {
      console.warn('加载通知设置失败:', error);
    }
  }

  // 测试通知
  test(): void {
    if (!('Notification' in window)) {
      alert('此浏览器不支持桌面通知');
      return;
    }

    if (this.permission !== 'granted') {
      this.requestPermission().then(permission => {
        if (permission === 'granted') {
          this.sendTestNotification();
        } else {
          alert('通知权限被拒绝，请在浏览器设置中允许通知');
        }
      });
    } else {
      this.sendTestNotification();
    }
  }

  // 发送测试通知
  private sendTestNotification(): void {
    const notification = new Notification('🎉 通知测试成功', {
      body: '浏览器通知已启用，您将收到盘口预警推送',
      icon: "/favicon.ico",
      tag: 'test',
    });

    setTimeout(() => notification.close(), 5000);

    if (this.playSound) {
      soundService.play('notification');
    }
  }
}

// 导出单例
export const notificationService = new NotificationService();

// 便捷方法
export const requestNotificationPermission = () => notificationService.requestPermission();
export const canSendNotification = () => notificationService.canNotify();
export const getNotificationPermission = () => notificationService.getPermission();
export const setNotificationEnabled = (enabled: boolean) => notificationService.setEnabled(enabled);
export const isNotificationEnabled = () => notificationService.isEnabled();
export const testNotification = () => notificationService.test();
export const getNotificationTypeSettings = () => notificationService.getTypeSettings();
export const setNotificationTypeEnabled = (type: NotificationType, enabled: boolean) =>
  notificationService.setTypeEnabled(type, enabled);
export const isNotificationTypeEnabled = (type: NotificationType) =>
  notificationService.isTypeEnabled(type);
