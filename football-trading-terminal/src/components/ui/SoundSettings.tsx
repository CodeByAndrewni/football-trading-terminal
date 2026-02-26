// ============================================
// 音效 & 通知设置面板
// ============================================

import { useState, useEffect } from 'react';
import { Volume2, VolumeX, Volume1, Play, Settings, Bell, BellOff, BellRing, ExternalLink } from 'lucide-react';
import { soundService, type SoundType } from '../../services/soundService';
import { notificationService, type NotificationType, type NotificationTypeSettings } from '../../services/notificationService';

interface SoundSettingsProps {
  compact?: boolean;  // 紧凑模式（仅显示开关）
}

export function SoundSettings({ compact = false }: SoundSettingsProps) {
  const [enabled, setEnabled] = useState(soundService.isEnabled());
  const [volume, setVolume] = useState(soundService.getVolume());
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sound' | 'notification'>('sound');

  // 通知相关状态
  const [notificationEnabled, setNotificationEnabled] = useState(notificationService.isEnabled());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    notificationService.getPermission()
  );
  const [typeSettings, setTypeSettings] = useState<NotificationTypeSettings>(
    notificationService.getTypeSettings()
  );

  // 同步状态 - 当面板打开时更新状态
  useEffect(() => {
    if (isOpen) {
      setEnabled(soundService.isEnabled());
      setVolume(soundService.getVolume());
      setNotificationEnabled(notificationService.isEnabled());
      setNotificationPermission(notificationService.getPermission());
      setTypeSettings(notificationService.getTypeSettings());
    }
  }, [isOpen]);

  const handleToggle = () => {
    const newEnabled = !enabled;
    soundService.setEnabled(newEnabled);
    setEnabled(newEnabled);
    if (newEnabled) {
      soundService.test('notification');
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number.parseFloat(e.target.value);
    soundService.setVolume(newVolume);
    setVolume(newVolume);
  };

  const handleTest = (type: SoundType) => {
    soundService.test(type);
  };

  const handleNotificationToggle = () => {
    const newEnabled = !notificationEnabled;
    notificationService.setEnabled(newEnabled);
    setNotificationEnabled(newEnabled);
  };

  const handleRequestPermission = async () => {
    const permission = await notificationService.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      notificationService.test();
    }
  };

  const handleTestNotification = () => {
    notificationService.test();
  };

  const handleTypeToggle = (type: NotificationType) => {
    const newValue = !typeSettings[type];
    notificationService.setTypeEnabled(type, newValue);
    setTypeSettings(prev => ({ ...prev, [type]: newValue }));
  };

  const getVolumeIcon = () => {
    if (!enabled) return <VolumeX className="w-4 h-4" />;
    if (volume < 0.3) return <Volume1 className="w-4 h-4" />;
    return <Volume2 className="w-4 h-4" />;
  };

  const getNotificationIcon = () => {
    if (notificationPermission !== 'granted') return <BellOff className="w-4 h-4" />;
    if (!notificationEnabled) return <BellOff className="w-4 h-4" />;
    return <Bell className="w-4 h-4" />;
  };

  // 紧凑模式 - 仅显示开关按钮
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
            enabled
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-bg-component text-text-muted hover:text-text-secondary'
          }`}
          title={enabled ? '点击关闭音效' : '点击开启音效'}
        >
          {getVolumeIcon()}
        </button>
        <button
          type="button"
          onClick={handleNotificationToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
            notificationEnabled && notificationPermission === 'granted'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-bg-component text-text-muted hover:text-text-secondary'
          }`}
          title={notificationEnabled ? '点击关闭通知' : '点击开启通知'}
        >
          {getNotificationIcon()}
        </button>
      </div>
    );
  }

  // 完整模式 - 下拉面板
  return (
    <div className="relative">
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
          enabled || (notificationEnabled && notificationPermission === 'granted')
            ? 'bg-accent-primary/20 text-accent-primary'
            : 'bg-bg-component text-text-muted hover:text-text-secondary'
        }`}
      >
        {getVolumeIcon()}
        <span className="hidden sm:inline">{enabled ? '音效' : '静音'}</span>
        <Settings className="w-3 h-3 opacity-50" />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* 设置面板 */}
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl bg-bg-card border border-border-default shadow-xl overflow-hidden">
            {/* 标签页切换 */}
            <div className="flex border-b border-border-default">
              <button
                type="button"
                onClick={() => setActiveTab('sound')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'sound'
                    ? 'bg-bg-component text-text-primary border-b-2 border-accent-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                音效
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('notification')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'notification'
                    ? 'bg-bg-component text-text-primary border-b-2 border-accent-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Bell className="w-4 h-4" />
                通知
              </button>
            </div>

            {/* 音效设置 */}
            {activeTab === 'sound' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-text-primary">音效设置</h3>
                  <button
                    type="button"
                    onClick={handleToggle}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      enabled
                        ? 'bg-accent-success/20 text-accent-success'
                        : 'bg-accent-danger/20 text-accent-danger'
                    }`}
                  >
                    {enabled ? '已开启' : '已关闭'}
                  </button>
                </div>

                {/* 音量滑块 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-text-secondary">音量</span>
                    <span className="text-sm font-mono text-text-primary">
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={handleVolumeChange}
                    disabled={!enabled}
                    className="w-full h-2 bg-bg-deepest rounded-full appearance-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-accent-primary
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-webkit-slider-thumb]:transition-transform
                      [&::-webkit-slider-thumb]:hover:scale-110
                      disabled:opacity-50"
                  />
                </div>

                {/* 测试音效 */}
                <div>
                  <span className="text-sm text-text-secondary mb-2 block">测试音效</span>
                  <div className="grid grid-cols-2 gap-2">
                    <TestButton
                      label="进球"
                      icon="⚽"
                      onClick={() => handleTest('goal')}
                      disabled={!enabled}
                      color="success"
                    />
                    <TestButton
                      label="高评分"
                      icon="🔴"
                      onClick={() => handleTest('high_score')}
                      disabled={!enabled}
                      color="danger"
                    />
                    <TestButton
                      label="强队落后"
                      icon="⚡"
                      onClick={() => handleTest('strong_behind')}
                      disabled={!enabled}
                      color="warning"
                    />
                    <TestButton
                      label="评分上升"
                      icon="📈"
                      onClick={() => handleTest('score_up')}
                      disabled={!enabled}
                      color="primary"
                    />
                    <TestButton
                      label="角球"
                      icon="🚩"
                      onClick={() => handleTest('corner')}
                      disabled={!enabled}
                      color="primary"
                    />
                    <TestButton
                      label="红牌"
                      icon="🟥"
                      onClick={() => handleTest('red_card')}
                      disabled={!enabled}
                      color="danger"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 通知设置 */}
            {activeTab === 'notification' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-text-primary">浏览器通知</h3>
                  {notificationPermission === 'granted' && (
                    <button
                      type="button"
                      onClick={handleNotificationToggle}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        notificationEnabled
                          ? 'bg-accent-success/20 text-accent-success'
                          : 'bg-accent-danger/20 text-accent-danger'
                      }`}
                    >
                      {notificationEnabled ? '已开启' : '已关闭'}
                    </button>
                  )}
                </div>

                {/* 权限状态 */}
                {notificationPermission !== 'granted' && (
                  <div className="mb-4">
                    <div className={`p-3 rounded-lg ${
                      notificationPermission === 'denied'
                        ? 'bg-accent-danger/10 border border-accent-danger/30'
                        : 'bg-accent-warning/10 border border-accent-warning/30'
                    }`}>
                      {notificationPermission === 'denied' ? (
                        <div className="flex items-start gap-2">
                          <BellOff className="w-4 h-4 text-accent-danger mt-0.5" />
                          <div>
                            <p className="text-sm text-accent-danger font-medium">通知权限被拒绝</p>
                            <p className="text-xs text-text-muted mt-1">
                              请在浏览器设置中允许此网站发送通知
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <BellRing className="w-4 h-4 text-accent-warning mt-0.5" />
                          <div>
                            <p className="text-sm text-accent-warning font-medium">需要通知权限</p>
                            <p className="text-xs text-text-muted mt-1">
                              开启后可在浏览器后台收到盘口预警推送
                            </p>
                            <button
                              type="button"
                              onClick={handleRequestPermission}
                              className="mt-2 px-3 py-1.5 rounded-lg bg-accent-primary text-bg-deepest text-xs font-medium transition-colors hover:bg-accent-primary/90"
                            >
                              授权通知权限
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 通知类型开关 */}
                {notificationPermission === 'granted' && (
                  <>
                    <div className="space-y-1 mb-4">
                      <p className="text-sm text-text-secondary mb-2">通知类型开关</p>
                      <NotificationTypeToggle
                        icon="🎯"
                        label="80+ 雷达预警"
                        description="评分达到80时推送"
                        enabled={typeSettings.radar_80plus && notificationEnabled}
                        onToggle={() => handleTypeToggle('radar_80plus')}
                        disabled={!notificationEnabled}
                      />
                      <NotificationTypeToggle
                        icon="⚽"
                        label="进球通知"
                        description="比赛进球时推送"
                        enabled={typeSettings.goal && notificationEnabled}
                        onToggle={() => handleTypeToggle('goal')}
                        disabled={!notificationEnabled}
                      />
                      <NotificationTypeToggle
                        icon="🔥"
                        label="高评分预警"
                        description="其他高评分信号"
                        enabled={typeSettings.high_score && notificationEnabled}
                        onToggle={() => handleTypeToggle('high_score')}
                        disabled={!notificationEnabled}
                      />
                      <NotificationTypeToggle
                        icon="⚠️"
                        label="盘口异常"
                        description="盘口急变时推送"
                        enabled={typeSettings.odds_alert && notificationEnabled}
                        onToggle={() => handleTypeToggle('odds_alert')}
                        disabled={!notificationEnabled}
                      />
                      <NotificationTypeToggle
                        icon="🔴"
                        label="强队落后"
                        description="强队落后时推送"
                        enabled={typeSettings.strong_behind && notificationEnabled}
                        onToggle={() => handleTypeToggle('strong_behind')}
                        disabled={!notificationEnabled}
                      />
                      <NotificationTypeToggle
                        icon="📊"
                        label="盘口背离"
                        description="盘口与比分背离"
                        enabled={typeSettings.divergence && notificationEnabled}
                        onToggle={() => handleTypeToggle('divergence')}
                        disabled={!notificationEnabled}
                      />
                      <NotificationTypeToggle
                        icon="🚩"
                        label="角球密集"
                        description="角球频繁时推送"
                        enabled={typeSettings.corner_dense && notificationEnabled}
                        onToggle={() => handleTypeToggle('corner_dense')}
                        disabled={!notificationEnabled}
                      />
                      <NotificationTypeToggle
                        icon="⏰"
                        label="临场变盘"
                        description="75分钟后大幅变盘"
                        enabled={typeSettings.late_shift && notificationEnabled}
                        onToggle={() => handleTypeToggle('late_shift')}
                        disabled={!notificationEnabled}
                      />
                    </div>

                    {/* 测试通知 */}
                    <button
                      type="button"
                      onClick={handleTestNotification}
                      disabled={!notificationEnabled}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary hover:bg-bg-deepest transition-colors disabled:opacity-50"
                    >
                      <Bell className="w-4 h-4" />
                      发送测试通知
                    </button>
                  </>
                )}
              </div>
            )}

            {/* 提示 */}
            <div className="px-4 py-3 bg-bg-deepest/50 border-t border-border-default">
              <p className="text-[10px] text-text-muted text-center">
                {activeTab === 'sound'
                  ? '音效会在重要事件时播放'
                  : '通知会在浏览器后台时推送'
                }
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 通知类型开关项
function NotificationTypeToggle({
  icon,
  label,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  icon: string;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-bg-component cursor-pointer'
      }`}
    >
      <span className="text-base">{icon}</span>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-[10px] text-text-muted truncate">{description}</p>
      </div>
      {/* 开关 */}
      <div className={`relative w-9 h-5 rounded-full transition-colors ${
        enabled ? 'bg-accent-success' : 'bg-bg-deepest'
      }`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </div>
    </button>
  );
}

// 测试按钮组件
function TestButton({
  label,
  icon,
  onClick,
  disabled,
  color,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
  color: 'success' | 'danger' | 'warning' | 'primary';
}) {
  const colorClasses = {
    success: 'hover:bg-accent-success/20 hover:border-accent-success/50',
    danger: 'hover:bg-accent-danger/20 hover:border-accent-danger/50',
    warning: 'hover:bg-accent-warning/20 hover:border-accent-warning/50',
    primary: 'hover:bg-accent-primary/20 hover:border-accent-primary/50',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border-default text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${colorClasses[color]}`}
    >
      <span>{icon}</span>
      <span className="text-text-secondary">{label}</span>
      <Play className="w-3 h-3 text-text-muted" />
    </button>
  );
}

// 简单的音效开关按钮（用于导航栏等）
export function SoundToggleButton() {
  const [enabled, setEnabled] = useState(soundService.isEnabled());

  const handleToggle = () => {
    const newEnabled = !enabled;
    soundService.setEnabled(newEnabled);
    setEnabled(newEnabled);
    if (newEnabled) {
      soundService.test('notification');
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`p-2 rounded-lg transition-all ${
        enabled
          ? 'bg-accent-primary/20 text-accent-primary'
          : 'bg-bg-component text-text-muted hover:text-text-secondary'
      }`}
      title={enabled ? '关闭音效' : '开启音效'}
    >
      {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
}
