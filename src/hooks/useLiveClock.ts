import { useEffect, useState } from 'react';

/**
 * 轻量级心跳 Hook，用于驱动本地时间类 UI 更新。
 * 默认每 5 秒自增一次 tick。
 */
export function useLiveClock(intervalMs: number = 5000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
    }, intervalMs);

    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return tick;
}

