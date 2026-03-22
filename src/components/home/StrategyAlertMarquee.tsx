/**
 * 策略提醒跑马灯 — 显示在主界面顶部，红色滚动条
 * 独立于策略面板运行，实时筛选 + 声音 + 浏览器通知
 */

import { useEffect, useMemo, useRef } from 'react';
import type { AdvancedMatch } from '../../data/advancedMockData';
import { BUILTIN_STRATEGIES } from './StrategyMonitorPanel';
import { soundService } from '../../services/soundService';

type AlertKey = string;

interface MarqueeItem {
  key: AlertKey;
  emoji: string;
  label: string;
  text: string;
  matchId: number;
}

interface Props {
  matches: AdvancedMatch[];
  onMatchClick: (id: number) => void;
}

export function StrategyAlertMarquee({ matches, onMatchClick }: Props) {
  const firedRef = useRef<Set<AlertKey>>(new Set());

  const items = useMemo(() => {
    const result: MarqueeItem[] = [];
    for (const s of BUILTIN_STRATEGIES) {
      const hits = matches.filter(s.filter);
      for (const h of hits) {
        const key = `${s.id}:${h.id}`;
        result.push({
          key,
          emoji: s.emoji,
          label: s.label,
          text: `${h.leagueShort ?? h.league} | ${h.home?.name} ${h.home?.score ?? 0}-${h.away?.score ?? 0} ${h.away?.name} | ${h.minute}'`,
          matchId: h.id,
        });
      }
    }
    return result;
  }, [matches]);

  // Fire sound + notification for new hits
  useEffect(() => {
    for (const item of items) {
      if (firedRef.current.has(item.key)) continue;
      firedRef.current.add(item.key);
      soundService.play('high_score');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`${item.emoji} ${item.label}`, {
          body: item.text,
          icon: '/favicon.ico',
        });
      }
    }
  }, [items]);

  // Request notification permission
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  if (items.length === 0) return null;

  const displayText = items.map((i) => `${i.emoji} ${i.label}: ${i.text}`).join('     ');

  return (
    <div className="flex-shrink-0 bg-red-600/90 text-white overflow-hidden relative h-7 flex items-center">
      <div
        className="whitespace-nowrap animate-marquee text-xs font-medium cursor-pointer"
        style={{ paddingLeft: '100%' }}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onMatchClick(item.matchId)}
            className="inline mr-8 hover:underline"
          >
            {item.emoji} <span className="font-bold">{item.label}</span>: {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default StrategyAlertMarquee;
