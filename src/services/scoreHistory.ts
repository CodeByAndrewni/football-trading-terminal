// ============================================
// 评分历史追踪服务 - 验证评分系统准确性
// ============================================

// 评分快照记录
export interface ScoreSnapshot {
  matchId: number;
  timestamp: number;           // 记录时间戳
  minute: number;              // 比赛分钟
  score: number;               // 当时评分
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  league: string;
  pressure: 'home' | 'away' | 'neutral';
  scenarioTags: string[];      // 场景标签
}

// 比赛结果记录
export interface MatchResult {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;                // YYYY-MM-DD 格式

  // 评分相关
  peakScore: number;           // 最高评分
  peakScoreMinute: number;     // 最高评分时刻
  peakScoreHomeScore: number;  // 最高评分时的主队比分
  peakScoreAwayScore: number;  // 最高评分时的客队比分

  // 比赛结果
  finalHomeScore: number;      // 最终主队比分
  finalAwayScore: number;      // 最终客队比分

  // 验证结果
  goalAfterPeak: boolean;      // 最高评分后是否进球
  goalsAfterPeakCount: number; // 最高评分后进球数
  wasHighScore: boolean;       // 是否达到高评分(≥70)
  wasVeryHighScore: boolean;   // 是否达到超高评分(≥80)

  // 场景信息
  scenarioAtPeak: string[];    // 最高评分时的场景
  pressureAtPeak: 'home' | 'away' | 'neutral';

  // 额外统计
  minutesAfterPeak: number;    // 最高评分后剩余时间
  verified: boolean;           // 是否已验证（比赛已结束）
}

// 每日统计
export interface DailyStats {
  date: string;
  totalMatches: number;
  highScoreMatches: number;        // ≥70分的场次
  veryHighScoreMatches: number;    // ≥80分的场次
  goalAfterHighScore: number;      // 高评分后进球的场次
  goalAfterVeryHighScore: number;  // 超高评分后进球的场次
  highScoreAccuracy: number;       // 高评分准确率 (%)
  veryHighScoreAccuracy: number;   // 超高评分准确率 (%)
  avgGoalsAfterPeak: number;       // 平均峰值后进球数
}

// 场景统计
export interface ScenarioStats {
  scenario: string;
  totalMatches: number;
  goalRate: number;           // 进球率 (%)
  avgScore: number;           // 平均评分
  avgGoalsAfter: number;      // 平均后续进球数
}

// 存储键
const STORAGE_KEY = 'ftt_score_history';
const SNAPSHOTS_KEY = 'ftt_score_snapshots';

// 获取今天的日期字符串
const getTodayString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// 评分历史服务类
class ScoreHistoryService {
  private results: MatchResult[] = [];
  private snapshots: Map<number, ScoreSnapshot> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  // 记录评分快照（比赛进行中调用）
  recordSnapshot(
    matchId: number,
    minute: number,
    score: number,
    homeTeam: string,
    awayTeam: string,
    homeScore: number,
    awayScore: number,
    league: string,
    pressure: 'home' | 'away' | 'neutral',
    scenarioTags: string[]
  ): void {
    const existing = this.snapshots.get(matchId);

    // 如果是新的峰值评分或第一次记录
    if (!existing || score > existing.score) {
      this.snapshots.set(matchId, {
        matchId,
        timestamp: Date.now(),
        minute,
        score,
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        league,
        pressure,
        scenarioTags,
      });
      this.saveSnapshots();
    }
  }

  // 记录比赛结果（比赛结束后调用）
  recordMatchResult(
    matchId: number,
    homeTeam: string,
    awayTeam: string,
    league: string,
    finalHomeScore: number,
    finalAwayScore: number
  ): void {
    const snapshot = this.snapshots.get(matchId);
    if (!snapshot) return;

    // 检查是否已经记录过
    if (this.results.some(r => r.matchId === matchId)) return;

    const goalsAfterPeak = (finalHomeScore + finalAwayScore) - (snapshot.homeScore + snapshot.awayScore);
    const wasHighScore = snapshot.score >= 70;
    const wasVeryHighScore = snapshot.score >= 80;

    const result: MatchResult = {
      matchId,
      homeTeam,
      awayTeam,
      league,
      date: getTodayString(),

      peakScore: snapshot.score,
      peakScoreMinute: snapshot.minute,
      peakScoreHomeScore: snapshot.homeScore,
      peakScoreAwayScore: snapshot.awayScore,

      finalHomeScore,
      finalAwayScore,

      goalAfterPeak: goalsAfterPeak > 0,
      goalsAfterPeakCount: Math.max(0, goalsAfterPeak),
      wasHighScore,
      wasVeryHighScore,

      scenarioAtPeak: snapshot.scenarioTags,
      pressureAtPeak: snapshot.pressure,

      minutesAfterPeak: 90 - snapshot.minute,
      verified: true,
    };

    this.results.push(result);
    this.snapshots.delete(matchId);
    this.saveToStorage();
    this.saveSnapshots();

    // 清理超过30天的记录
    this.cleanOldRecords();
  }

  // 模拟记录结果（用于演示）
  simulateResults(count: number): void {
    const scenarios = ['strong_behind', 'red_card', 'dense_corners', 'large_lead', 'multiple_subs'];
    const leagues = ['英超', '西甲', '德甲', '意甲', '法甲'];
    const teams = [
      ['皇马', '巴萨'], ['曼城', '曼联'], ['拜仁', '多特'], ['国米', 'AC米兰'], ['巴黎', '里昂'],
      ['利物浦', '切尔西'], ['阿森纳', '热刺'], ['尤文', '那不勒斯'], ['莱比锡', '勒沃库森']
    ];

    for (let i = 0; i < count; i++) {
      const teamPair = teams[Math.floor(Math.random() * teams.length)];
      const league = leagues[Math.floor(Math.random() * leagues.length)];
      const peakScore = 50 + Math.floor(Math.random() * 45); // 50-95
      const peakMinute = 60 + Math.floor(Math.random() * 25); // 60-85

      const homeScoreAtPeak = Math.floor(Math.random() * 3);
      const awayScoreAtPeak = Math.floor(Math.random() * 3);

      // 高评分后更可能进球
      const goalProbability = peakScore >= 80 ? 0.65 : peakScore >= 70 ? 0.55 : 0.40;
      const goalAfter = Math.random() < goalProbability;
      const goalsCount = goalAfter ? (1 + Math.floor(Math.random() * 2)) : 0;

      const result: MatchResult = {
        matchId: 100000 + i,
        homeTeam: teamPair[0],
        awayTeam: teamPair[1],
        league,
        date: getTodayString(),

        peakScore,
        peakScoreMinute: peakMinute,
        peakScoreHomeScore: homeScoreAtPeak,
        peakScoreAwayScore: awayScoreAtPeak,

        finalHomeScore: homeScoreAtPeak + (goalAfter ? Math.floor(Math.random() * 2) + (Math.random() > 0.5 ? 1 : 0) : 0),
        finalAwayScore: awayScoreAtPeak + (goalAfter ? Math.floor(Math.random() * 2) : 0),

        goalAfterPeak: goalAfter,
        goalsAfterPeakCount: goalsCount,
        wasHighScore: peakScore >= 70,
        wasVeryHighScore: peakScore >= 80,

        scenarioAtPeak: [scenarios[Math.floor(Math.random() * scenarios.length)]],
        pressureAtPeak: ['home', 'away', 'neutral'][Math.floor(Math.random() * 3)] as 'home' | 'away' | 'neutral',

        minutesAfterPeak: 90 - peakMinute,
        verified: true,
      };

      this.results.push(result);
    }

    this.saveToStorage();
  }

  // 获取所有结果
  getAllResults(): MatchResult[] {
    return [...this.results];
  }

  // 获取今日结果
  getTodayResults(): MatchResult[] {
    const today = getTodayString();
    return this.results.filter(r => r.date === today);
  }

  // 获取指定日期的结果
  getResultsByDate(date: string): MatchResult[] {
    return this.results.filter(r => r.date === date);
  }

  // 获取每日统计
  getDailyStats(date?: string): DailyStats {
    const targetDate = date || getTodayString();
    const dayResults = this.getResultsByDate(targetDate);

    if (dayResults.length === 0) {
      return {
        date: targetDate,
        totalMatches: 0,
        highScoreMatches: 0,
        veryHighScoreMatches: 0,
        goalAfterHighScore: 0,
        goalAfterVeryHighScore: 0,
        highScoreAccuracy: 0,
        veryHighScoreAccuracy: 0,
        avgGoalsAfterPeak: 0,
      };
    }

    const highScoreMatches = dayResults.filter(r => r.wasHighScore);
    const veryHighScoreMatches = dayResults.filter(r => r.wasVeryHighScore);
    const goalAfterHighScore = highScoreMatches.filter(r => r.goalAfterPeak).length;
    const goalAfterVeryHighScore = veryHighScoreMatches.filter(r => r.goalAfterPeak).length;

    return {
      date: targetDate,
      totalMatches: dayResults.length,
      highScoreMatches: highScoreMatches.length,
      veryHighScoreMatches: veryHighScoreMatches.length,
      goalAfterHighScore,
      goalAfterVeryHighScore,
      highScoreAccuracy: highScoreMatches.length > 0
        ? Math.round((goalAfterHighScore / highScoreMatches.length) * 100)
        : 0,
      veryHighScoreAccuracy: veryHighScoreMatches.length > 0
        ? Math.round((goalAfterVeryHighScore / veryHighScoreMatches.length) * 100)
        : 0,
      avgGoalsAfterPeak: dayResults.length > 0
        ? Math.round((dayResults.reduce((sum, r) => sum + r.goalsAfterPeakCount, 0) / dayResults.length) * 100) / 100
        : 0,
    };
  }

  // 获取总体统计（最近N天）
  getOverallStats(days = 7): DailyStats {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffString = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;

    const recentResults = this.results.filter(r => r.date >= cutoffString);

    if (recentResults.length === 0) {
      return {
        date: `最近${days}天`,
        totalMatches: 0,
        highScoreMatches: 0,
        veryHighScoreMatches: 0,
        goalAfterHighScore: 0,
        goalAfterVeryHighScore: 0,
        highScoreAccuracy: 0,
        veryHighScoreAccuracy: 0,
        avgGoalsAfterPeak: 0,
      };
    }

    const highScoreMatches = recentResults.filter(r => r.wasHighScore);
    const veryHighScoreMatches = recentResults.filter(r => r.wasVeryHighScore);
    const goalAfterHighScore = highScoreMatches.filter(r => r.goalAfterPeak).length;
    const goalAfterVeryHighScore = veryHighScoreMatches.filter(r => r.goalAfterPeak).length;

    return {
      date: `最近${days}天`,
      totalMatches: recentResults.length,
      highScoreMatches: highScoreMatches.length,
      veryHighScoreMatches: veryHighScoreMatches.length,
      goalAfterHighScore,
      goalAfterVeryHighScore,
      highScoreAccuracy: highScoreMatches.length > 0
        ? Math.round((goalAfterHighScore / highScoreMatches.length) * 100)
        : 0,
      veryHighScoreAccuracy: veryHighScoreMatches.length > 0
        ? Math.round((goalAfterVeryHighScore / veryHighScoreMatches.length) * 100)
        : 0,
      avgGoalsAfterPeak: recentResults.length > 0
        ? Math.round((recentResults.reduce((sum, r) => sum + r.goalsAfterPeakCount, 0) / recentResults.length) * 100) / 100
        : 0,
    };
  }

  // 获取场景统计
  getScenarioStats(): ScenarioStats[] {
    const scenarioMap = new Map<string, MatchResult[]>();

    for (const result of this.results) {
      for (const scenario of result.scenarioAtPeak) {
        if (!scenarioMap.has(scenario)) {
          scenarioMap.set(scenario, []);
        }
        scenarioMap.get(scenario)?.push(result);
      }
    }

    const stats: ScenarioStats[] = [];
    for (const [scenario, matches] of scenarioMap) {
      const goalsAfter = matches.filter(m => m.goalAfterPeak).length;
      stats.push({
        scenario,
        totalMatches: matches.length,
        goalRate: Math.round((goalsAfter / matches.length) * 100),
        avgScore: Math.round(matches.reduce((sum, m) => sum + m.peakScore, 0) / matches.length),
        avgGoalsAfter: Math.round((matches.reduce((sum, m) => sum + m.goalsAfterPeakCount, 0) / matches.length) * 100) / 100,
      });
    }

    return stats.sort((a, b) => b.goalRate - a.goalRate);
  }

  // 获取类似场景的历史数据
  getSimilarScenarioHistory(
    scenarioTags: string[],
    pressure: 'home' | 'away' | 'neutral',
    minuteRange: [number, number] = [70, 90]
  ): {
    totalMatches: number;
    goalRate: number;
    avgGoals: number;
    matches: MatchResult[];
  } {
    const similarMatches = this.results.filter(r => {
      // 匹配场景标签
      const hasMatchingScenario = scenarioTags.some(tag => r.scenarioAtPeak.includes(tag));
      // 匹配压迫方向
      const matchesPressure = r.pressureAtPeak === pressure;
      // 匹配时间范围
      const inMinuteRange = r.peakScoreMinute >= minuteRange[0] && r.peakScoreMinute <= minuteRange[1];

      return hasMatchingScenario && matchesPressure && inMinuteRange;
    });

    if (similarMatches.length === 0) {
      return { totalMatches: 0, goalRate: 0, avgGoals: 0, matches: [] };
    }

    const goalsAfter = similarMatches.filter(m => m.goalAfterPeak).length;
    const totalGoals = similarMatches.reduce((sum, m) => sum + m.goalsAfterPeakCount, 0);

    return {
      totalMatches: similarMatches.length,
      goalRate: Math.round((goalsAfter / similarMatches.length) * 100),
      avgGoals: Math.round((totalGoals / similarMatches.length) * 100) / 100,
      matches: similarMatches.slice(-5), // 返回最近5场
    };
  }

  // 获取球队历史数据
  getTeamHistory(teamName: string): {
    totalMatches: number;
    goalRate: number;
    avgScore: number;
    recentMatches: MatchResult[];
  } {
    const teamMatches = this.results.filter(
      r => r.homeTeam === teamName || r.awayTeam === teamName
    );

    if (teamMatches.length === 0) {
      return { totalMatches: 0, goalRate: 0, avgScore: 0, recentMatches: [] };
    }

    const goalsAfter = teamMatches.filter(m => m.goalAfterPeak).length;
    const avgScore = teamMatches.reduce((sum, m) => sum + m.peakScore, 0) / teamMatches.length;

    return {
      totalMatches: teamMatches.length,
      goalRate: Math.round((goalsAfter / teamMatches.length) * 100),
      avgScore: Math.round(avgScore),
      recentMatches: teamMatches.slice(-5),
    };
  }

  // 清理超过30天的记录
  private cleanOldRecords(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffString = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-${String(cutoffDate.getDate()).padStart(2, '0')}`;

    this.results = this.results.filter(r => r.date >= cutoffString);
    this.saveToStorage();
  }

  // 保存到 localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.results));
    } catch (error) {
      console.warn('保存评分历史失败:', error);
    }
  }

  // 保存快照
  private saveSnapshots(): void {
    try {
      const snapshotsArray = Array.from(this.snapshots.values());
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshotsArray));
    } catch (error) {
      console.warn('保存评分快照失败:', error);
    }
  }

  // 从 localStorage 加载
  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.results = JSON.parse(saved);
      }

      const savedSnapshots = localStorage.getItem(SNAPSHOTS_KEY);
      if (savedSnapshots) {
        const snapshotsArray: ScoreSnapshot[] = JSON.parse(savedSnapshots);
        this.snapshots = new Map(snapshotsArray.map(s => [s.matchId, s]));
      }
    } catch (error) {
      console.warn('加载评分历史失败:', error);
      this.results = [];
      this.snapshots = new Map();
    }
  }

  // 清除所有数据（用于测试）
  clearAll(): void {
    this.results = [];
    this.snapshots = new Map();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SNAPSHOTS_KEY);
  }

  // ============================================
  // PRODUCTION STRICT MODE: initDemoData 已删除
  // 不再支持模拟数据初始化
  // ============================================
}

// 导出单例
export const scoreHistoryService = new ScoreHistoryService();

// 便捷方法
export const recordScoreSnapshot = (
  matchId: number,
  minute: number,
  score: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  league: string,
  pressure: 'home' | 'away' | 'neutral',
  scenarioTags: string[]
) => scoreHistoryService.recordSnapshot(matchId, minute, score, homeTeam, awayTeam, homeScore, awayScore, league, pressure, scenarioTags);

export const recordMatchResult = (
  matchId: number,
  homeTeam: string,
  awayTeam: string,
  league: string,
  finalHomeScore: number,
  finalAwayScore: number
) => scoreHistoryService.recordMatchResult(matchId, homeTeam, awayTeam, league, finalHomeScore, finalAwayScore);

export const getTodayStats = () => scoreHistoryService.getDailyStats();
export const getOverallStats = (days?: number) => scoreHistoryService.getOverallStats(days);
export const getScenarioStats = () => scoreHistoryService.getScenarioStats();
export const getSimilarHistory = (
  scenarioTags: string[],
  pressure: 'home' | 'away' | 'neutral',
  minuteRange?: [number, number]
) => scoreHistoryService.getSimilarScenarioHistory(scenarioTags, pressure, minuteRange);
export const getTeamHistory = (teamName: string) => scoreHistoryService.getTeamHistory(teamName);

// PRODUCTION STRICT MODE: initDemoScoreHistory 已删除
