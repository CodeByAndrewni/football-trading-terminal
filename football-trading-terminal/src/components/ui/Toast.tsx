// ============================================
// Toast 实时推送通知系统 - 已禁用
// ============================================

import { createContext, useContext, useCallback, type ReactNode } from 'react';

export interface ToastData {
  id: string;
  type: 'goal' | 'card' | 'score_change' | 'alert' | 'high_score' | 'strong_behind' | 'corner';
  title: string;
  message: string;
  matchId?: number;
  scoreChange?: { from: number; to: number };
  duration?: number;
  playSound?: boolean;
}

interface ToastContextType {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, 'id'>) => void;
  removeToast: (id: string) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // 空实现 - 通知功能已禁用
  const addToast = useCallback((_toast: Omit<ToastData, 'id'>) => {
    // 不做任何事情
  }, []);

  const removeToast = useCallback((_id: string) => {
    // 不做任何事情
  }, []);

  const toggleSound = useCallback(() => {
    // 不做任何事情
  }, []);

  return (
    <ToastContext.Provider value={{ toasts: [], addToast, removeToast, soundEnabled: false, toggleSound }}>
      {children}
    </ToastContext.Provider>
  );
}
