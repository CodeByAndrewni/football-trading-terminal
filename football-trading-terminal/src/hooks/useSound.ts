// ============================================
// 音效管理 Hook
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  soundService,
  type SoundType,
  playSound,
  playGoalSound,
  playHighScoreAlert,
} from '../services/soundService';

export function useSound() {
  const [enabled, setEnabled] = useState(soundService.isEnabled());
  const [volume, setVolume] = useState(soundService.getVolume());

  // 同步状态
  useEffect(() => {
    const handleStorageChange = () => {
      setEnabled(soundService.isEnabled());
      setVolume(soundService.getVolume());
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 切换启用状态
  const toggleEnabled = useCallback(() => {
    const newEnabled = !soundService.isEnabled();
    soundService.setEnabled(newEnabled);
    setEnabled(newEnabled);

    // 播放测试音效确认已开启
    if (newEnabled) {
      soundService.test('notification');
    }
  }, []);

  // 设置启用状态
  const setSoundEnabled = useCallback((value: boolean) => {
    soundService.setEnabled(value);
    setEnabled(value);
  }, []);

  // 设置音量
  const setSoundVolume = useCallback((value: number) => {
    soundService.setVolume(value);
    setVolume(value);
  }, []);

  // 播放音效
  const play = useCallback((type: SoundType) => {
    playSound(type);
  }, []);

  // 测试音效
  const test = useCallback((type: SoundType = 'notification') => {
    soundService.test(type);
  }, []);

  // 预热（在用户首次交互时调用）
  const warmup = useCallback(() => {
    soundService.warmup();
  }, []);

  return {
    enabled,
    volume,
    toggleEnabled,
    setSoundEnabled,
    setSoundVolume,
    play,
    playGoal: playGoalSound,
    playHighScore: playHighScoreAlert,
    test,
    warmup,
  };
}

// 用于在组件外部播放音效的辅助函数
export { playSound, playGoalSound, playHighScoreAlert };
