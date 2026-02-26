// ============================================
// 数据导出服务 - 导出比赛数据和统计
// ============================================

import type { AdvancedMatch } from '../data/advancedMockData';
import type { MatchResult } from './scoreHistory';
import { scoreHistoryService } from './scoreHistory';

// 导出格式
export type ExportFormat = 'csv' | 'json';

// 导出数据类型
export type ExportDataType =
  | 'matches'           // 当前比赛列表
  | 'verification'      // 验证历史
  | 'statistics'        // 统计数据
  | 'backtest'          // 回测结果
  | 'presets';          // 筛选预设

// CSV转换器
function jsonToCsv<T extends Record<string, unknown>>(data: T[], headers?: string[]): string {
  if (data.length === 0) return '';

  const keys = headers || Object.keys(data[0]);
  const headerRow = keys.join(',');

  const rows = data.map(item => {
    return keys.map(key => {
      const value = item[key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') {
        // 转义双引号并包裹
        return `"${value.replace(/"/g, '""')}"`;
      }
      if (Array.isArray(value)) {
        return `"${value.join(';')}"`;
      }
      return String(value);
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
}

// 下载文件
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([`\ufeff${content}`], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 格式化时间戳
function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// 导出服务类
class ExportService {
  // 导出当前比赛列表
  exportMatches(matches: AdvancedMatch[], format: ExportFormat = 'csv'): void {
    const timestamp = formatTimestamp();
    const filename = `matches_${timestamp}.${format}`;

    const exportData = matches.map(m => ({
      id: m.id,
      league: m.league,
      minute: m.minute,
      status: m.status,
      homeTeam: m.home.name,
      homeScore: m.home.score,
      homeRank: m.home.rank,
      awayTeam: m.away.name,
      awayScore: m.away.score,
      awayRank: m.away.rank,
      killScore: m.killScore,
      rating: m.rating,
      pressure: m.pressure,
      cornersHome: m.corners?.home ?? 0,
      cornersAway: m.corners?.away ?? 0,
      handicapValue: m.odds.handicap.value,
      handicapHome: m.odds.handicap.home,
      handicapAway: m.odds.handicap.away,
      overUnderTotal: m.odds.overUnder.total,
      overOdds: m.odds.overUnder.over,
      underOdds: m.odds.overUnder.under,
      xgHome: m.stats?.xG?.home || 0,
      xgAway: m.stats?.xG?.away || 0,
      possessionHome: m.stats?.possession?.home || 0,
      possessionAway: m.stats?.possession?.away || 0,
      scenarioTags: m.scenarioTags?.join(';') || '',
      isWatched: m.isWatched,
    }));

    if (format === 'json') {
      downloadFile(
        JSON.stringify(exportData, null, 2),
        filename,
        'application/json'
      );
    } else {
      const csv = jsonToCsv(exportData);
      downloadFile(csv, filename, 'text/csv;charset=utf-8');
    }
  }

  // 导出验证历史
  exportVerificationHistory(format: ExportFormat = 'csv'): void {
    const timestamp = formatTimestamp();
    const filename = `verification_history_${timestamp}.${format}`;

    const results = scoreHistoryService.getAllResults();

    const exportData = results.map(r => ({
      matchId: r.matchId,
      date: r.date,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      league: r.league,
      peakScore: r.peakScore,
      peakScoreMinute: r.peakScoreMinute,
      peakHomeScore: r.peakScoreHomeScore,
      peakAwayScore: r.peakScoreAwayScore,
      finalHomeScore: r.finalHomeScore,
      finalAwayScore: r.finalAwayScore,
      goalAfterPeak: r.goalAfterPeak,
      goalsAfterPeakCount: r.goalsAfterPeakCount,
      wasHighScore: r.wasHighScore,
      wasVeryHighScore: r.wasVeryHighScore,
      scenarioAtPeak: r.scenarioAtPeak.join(';'),
      pressureAtPeak: r.pressureAtPeak,
      minutesAfterPeak: r.minutesAfterPeak,
      verified: r.verified,
    }));

    if (format === 'json') {
      downloadFile(
        JSON.stringify(exportData, null, 2),
        filename,
        'application/json'
      );
    } else {
      const csv = jsonToCsv(exportData);
      downloadFile(csv, filename, 'text/csv;charset=utf-8');
    }
  }

  // 导出统计数据
  exportStatistics(format: ExportFormat = 'csv'): void {
    const timestamp = formatTimestamp();
    const filename = `statistics_${timestamp}.${format}`;

    // 获取场景统计
    const scenarioStats = scoreHistoryService.getScenarioStats();
    const overallStats = scoreHistoryService.getOverallStats(30);

    // 组合导出数据
    const exportData = {
      scenarioStats,
      overall: overallStats,
      exportDate: formatTimestamp(),
    };

    if (format === 'json') {
      downloadFile(
        JSON.stringify(exportData, null, 2),
        filename,
        'application/json'
      );
    } else {
      const scenarioCsv = jsonToCsv(scenarioStats.map(s => ({
        scenario: s.scenario,
        totalMatches: s.totalMatches,
        goalRate: s.goalRate,
        avgScore: s.avgScore,
        avgGoalsAfter: s.avgGoalsAfter,
      })));

      downloadFile(scenarioCsv, filename, 'text/csv;charset=utf-8');
    }
  }

  // 导出筛选预设
  exportPresets(format: ExportFormat = 'json'): void {
    const timestamp = formatTimestamp();
    const filename = `filter_presets_${timestamp}.${format}`;

    try {
      const saved = localStorage.getItem('ftt_filter_presets');
      const presets = saved ? JSON.parse(saved) : [];

      if (format === 'json') {
        downloadFile(
          JSON.stringify(presets, null, 2),
          filename,
          'application/json'
        );
      } else {
        const csv = jsonToCsv(presets.map((p: Record<string, unknown>) => ({
          id: p.id,
          name: p.name,
          icon: p.icon,
          createdAt: p.createdAt,
        })));
        downloadFile(csv, filename, 'text/csv;charset=utf-8');
      }
    } catch (error) {
      console.error('导出预设失败:', error);
    }
  }

  // 通用导出方法
  export(options: { format: ExportFormat; dataType: ExportDataType }, data?: unknown): void {
    const { format, dataType } = options;

    switch (dataType) {
      case 'matches':
        if (data && Array.isArray(data)) {
          this.exportMatches(data as AdvancedMatch[], format);
        }
        break;
      case 'verification':
        this.exportVerificationHistory(format);
        break;
      case 'statistics':
        this.exportStatistics(format);
        break;
      case 'presets':
        this.exportPresets(format);
        break;
      default:
        console.warn('未知的导出类型:', dataType);
    }
  }

  // 获取导出预览数据
  getExportPreview(dataType: ExportDataType): {
    count: number;
    sample: Record<string, unknown>[];
  } {
    switch (dataType) {
      case 'verification': {
        const results = scoreHistoryService.getAllResults();
        return {
          count: results.length,
          sample: results.slice(0, 3).map(r => ({
            date: r.date,
            match: `${r.homeTeam} vs ${r.awayTeam}`,
            peakScore: r.peakScore,
            goalAfterPeak: r.goalAfterPeak,
          })),
        };
      }
      case 'statistics': {
        const overall = scoreHistoryService.getOverallStats(30);
        return {
          count: overall.totalMatches,
          sample: [{
            period: '最近30天',
            totalMatches: overall.totalMatches,
            accuracy: `${overall.highScoreAccuracy}%`,
          }],
        };
      }
      default:
        return { count: 0, sample: [] };
    }
  }
}

// 导出单例
export const exportService = new ExportService();
