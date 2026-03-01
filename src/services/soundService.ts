// ============================================
// 音效通知服务 - 使用 Web Audio API
// ============================================

// 音效类型
export type SoundType =
  | 'goal'           // 进球 - 欢快的音效
  | 'high_score'     // 高评分预警 - 紧急音效
  | 'score_up'       // 评分上升 - 上升音效
  | 'alert'          // 一般预警 - 提示音
  | 'strong_behind'  // 强队落后 - 特殊警报
  | 'corner'         // 角球 - 短促提示
  | 'red_card'       // 红牌 - 警告音
  | 'notification';  // 通用通知

// 音效配置
interface SoundConfig {
  frequency: number;      // 基础频率
  duration: number;       // 持续时间（秒）
  type: OscillatorType;   // 波形类型
  gain: number;           // 音量 (0-1)
  pattern?: number[];     // 音调模式（多个频率）
  repeat?: number;        // 重复次数
  interval?: number;      // 重复间隔
}

// 预设音效配置
const SOUND_CONFIGS: Record<SoundType, SoundConfig> = {
  goal: {
    frequency: 587.33,  // D5
    duration: 0.15,
    type: 'sine',
    gain: 0.4,
    pattern: [587.33, 739.99, 880, 1046.5],  // D5-F#5-A5-C6 欢快上升
    repeat: 1,
    interval: 0.1,
  },
  high_score: {
    frequency: 880,     // A5
    duration: 0.2,
    type: 'square',
    gain: 0.35,
    pattern: [880, 1046.5, 880, 1046.5],  // 紧急警报模式
    repeat: 2,
    interval: 0.15,
  },
  score_up: {
    frequency: 523.25,  // C5
    duration: 0.12,
    type: 'sine',
    gain: 0.3,
    pattern: [523.25, 659.25, 783.99],  // C5-E5-G5 上升三音
    repeat: 1,
    interval: 0.08,
  },
  alert: {
    frequency: 440,     // A4
    duration: 0.15,
    type: 'sine',
    gain: 0.3,
    pattern: [440, 554.37],  // A4-C#5
    repeat: 1,
    interval: 0.1,
  },
  strong_behind: {
    frequency: 392,     // G4
    duration: 0.25,
    type: 'sawtooth',
    gain: 0.3,
    pattern: [392, 493.88, 392, 587.33],  // 特殊警报音
    repeat: 2,
    interval: 0.2,
  },
  corner: {
    frequency: 659.25,  // E5
    duration: 0.08,
    type: 'sine',
    gain: 0.25,
    pattern: [659.25, 783.99],  // 短促提示
    repeat: 1,
    interval: 0.05,
  },
  red_card: {
    frequency: 311.13,  // Eb4 低音警告
    duration: 0.3,
    type: 'square',
    gain: 0.35,
    pattern: [311.13, 261.63, 311.13],  // 警告下降
    repeat: 1,
    interval: 0.15,
  },
  notification: {
    frequency: 523.25,  // C5
    duration: 0.1,
    type: 'sine',
    gain: 0.25,
    pattern: [523.25, 659.25],
    repeat: 1,
    interval: 0.08,
  },
};

// 音效服务类
class SoundService {
  private audioContext: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;  // 主音量 0-1
  private lastPlayTime = 0;
  private minInterval = 500;  // 最小播放间隔（毫秒），防止音效过于频繁

  constructor() {
    // 从 localStorage 读取设置
    this.loadSettings();
  }

  // 初始化 AudioContext（需要用户交互后调用）
  private initAudioContext(): AudioContext | null {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch (error) {
        console.warn('Web Audio API 不可用:', error);
        return null;
      }
    }

    // 恢复暂停的 AudioContext
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    return this.audioContext;
  }

  // 播放单个音调
  private playTone(
    context: AudioContext,
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    startTime: number
  ): void {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // 音量包络（淡入淡出）
    const adjustedGain = gain * this.volume;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(adjustedGain, startTime + 0.01);
    gainNode.gain.setValueAtTime(adjustedGain, startTime + duration - 0.02);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  // 播放音效
  play(soundType: SoundType): void {
    // 检查是否启用
    if (!this.enabled) return;

    // 防止过于频繁播放
    const now = Date.now();
    if (now - this.lastPlayTime < this.minInterval) {
      return;
    }
    this.lastPlayTime = now;

    // 初始化 AudioContext
    const context = this.initAudioContext();
    if (!context) return;

    const config = SOUND_CONFIGS[soundType];
    if (!config) return;

    const { duration, type, gain, pattern, repeat = 1, interval = 0.1 } = config;

    let currentTime = context.currentTime;

    // 播放重复次数
    for (let r = 0; r < repeat; r++) {
      // 播放音调模式
      if (pattern && pattern.length > 0) {
        for (const freq of pattern) {
          this.playTone(context, freq, duration, type, gain, currentTime);
          currentTime += duration + 0.02;
        }
      } else {
        this.playTone(context, config.frequency, duration, type, gain, currentTime);
        currentTime += duration;
      }

      // 添加重复间隔
      if (r < repeat - 1) {
        currentTime += interval;
      }
    }
  }

  // 播放进球音效（特殊处理）
  playGoal(): void {
    this.play('goal');
    // 延迟播放额外的庆祝音效
    setTimeout(() => {
      if (this.enabled) {
        this.playCheerSound();
      }
    }, 400);
  }

  // 播放庆祝音效
  private playCheerSound(): void {
    const context = this.initAudioContext();
    if (!context) return;

    const startTime = context.currentTime;
    // 播放一个快速的上升音阶
    const notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
    notes.forEach((freq, i) => {
      this.playTone(context, freq, 0.08, 'sine', 0.2, startTime + i * 0.05);
    });
  }

  // 播放高评分预警（连续警报）
  playHighScoreAlert(): void {
    this.play('high_score');
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

  // 设置音量
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
  }

  // 获取音量
  getVolume(): number {
    return this.volume;
  }

  // 保存设置到 localStorage
  private saveSettings(): void {
    try {
      localStorage.setItem('ftt_sound_settings', JSON.stringify({
        enabled: this.enabled,
        volume: this.volume,
      }));
    } catch (error) {
      console.warn('保存音效设置失败:', error);
    }
  }

  // 从 localStorage 加载设置
  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('ftt_sound_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.enabled = settings.enabled ?? true;
        this.volume = settings.volume ?? 0.7;
      }
    } catch (error) {
      console.warn('加载音效设置失败:', error);
    }
  }

  // 测试音效
  test(soundType: SoundType = 'notification'): void {
    const wasEnabled = this.enabled;
    this.enabled = true;
    this.lastPlayTime = 0;  // 重置间隔限制
    this.play(soundType);
    this.enabled = wasEnabled;
  }

  // 预热 AudioContext（在用户首次交互时调用）
  warmup(): void {
    this.initAudioContext();
  }
}

// 导出单例
export const soundService = new SoundService();

// 便捷方法
export const playSound = (type: SoundType) => soundService.play(type);
export const playGoalSound = () => soundService.playGoal();
export const playHighScoreAlert = () => soundService.playHighScoreAlert();
export const setSoundEnabled = (enabled: boolean) => soundService.setEnabled(enabled);
export const isSoundEnabled = () => soundService.isEnabled();
export const setSoundVolume = (volume: number) => soundService.setVolume(volume);
export const getSoundVolume = () => soundService.getVolume();
export const testSound = (type?: SoundType) => soundService.test(type);
export const warmupSound = () => soundService.warmup();
