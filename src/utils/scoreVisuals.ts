export type HealthLevel = 'LOW' | 'MEDIUM' | 'HIGH' | undefined;

export function getScoreTextClass(score: number, fallback = 'text-text-muted'): string {
  if (score >= 80) return 'text-accent-danger';
  if (score >= 70) return 'text-[#f97316]';
  if (score >= 60) return 'text-accent-warning';
  if (score >= 40) return 'text-accent-success';
  return fallback;
}

export function getScoreBgGradient(score: number): string {
  if (score >= 80) return 'from-accent-danger/20 to-transparent';
  if (score >= 70) return 'from-[#f97316]/20 to-transparent';
  if (score >= 60) return 'from-accent-warning/20 to-transparent';
  return 'from-accent-primary/10 to-transparent';
}

export function getDataHealthIcon(score?: number): string {
  if ((score ?? 0) >= 70) return '🟢';
  if ((score ?? 0) >= 45) return '🟡';
  return '⚪';
}

export function getOddsHealthIcon(level?: HealthLevel): string {
  if (level === 'HIGH') return '💰';
  if (level === 'MEDIUM') return '◎';
  if (level === 'LOW') return '◌';
  return '⚪';
}

