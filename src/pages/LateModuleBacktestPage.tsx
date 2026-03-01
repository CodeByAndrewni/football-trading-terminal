/**
 * ============================================
 * 晚期模块大规模回测页面
 * 支持真实历史数据获取和分析
 *
 * Version: 1.0.0
 * ============================================
 */

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Play, RefreshCw, TrendingUp, TrendingDown,
  Target, BarChart3, CheckCircle, XCircle,
  Zap, DollarSign, Clock, Settings2,
  Activity, Shield, Download, Upload, Database, Wifi,
  FileText, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend,
  AreaChart, Area, ComposedChart, ReferenceLine,
} from 'recharts';
import {
  runLateModuleBacktest,
  saveBacktestData,
  loadBacktestData,
  getSavedDataStats,
  generateMockHistoricalMatches,
  DEFAULT_BACKTEST_CONFIG,
  MAJOR_LEAGUES,
  type BacktestConfig,
  type BacktestSummary,
  type SignalBacktestResult,
  type BacktestProgress,
} from '../services/lateModuleBacktestService';
import type { ScenarioTag } from '../services/modules/unifiedLateModule';
import type { HistoricalMatch } from '../services/historicalDataCollector';

// ============================================
// 常量定义
// ============================================

const LEAGUE_OPTIONS = [
  { id: MAJOR_LEAGUES.PREMIER_LEAGUE, name: '英超', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: MAJOR_LEAGUES.LA_LIGA, name: '西甲', flag: '🇪🇸' },
  { id: MAJOR_LEAGUES.BUNDESLIGA, name: '德甲', flag: '🇩🇪' },
  { id: MAJOR_LEAGUES.SERIE_A, name: '意甲', flag: '🇮🇹' },
  { id: MAJOR_LEAGUES.LIGUE_1, name: '法甲', flag: '🇫🇷' },
  { id: MAJOR_LEAGUES.CHAMPIONS_LEAGUE, name: '欧冠', flag: '🏆' },
  { id: MAJOR_LEAGUES.EUROPA_LEAGUE, name: '欧联', flag: '🏆' },
];

const SCENARIO_OPTIONS: { value: ScenarioTag; label: string; color: string }[] = [
  { value: 'OVER_SPRINT', label: '大球冲刺', color: '#00cc66' },
  { value: 'STRONG_BEHIND', label: '强队追分', color: '#ff6600' },
  { value: 'DEADLOCK_BREAK', label: '破僵局', color: '#00d4ff' },
  { value: 'GENERIC', label: '通用场景', color: '#8b949e' },
];

const SCENARIO_COLORS: Record<ScenarioTag, string> = {
  OVER_SPRINT: '#00cc66',
  STRONG_BEHIND: '#ff6600',
  DEADLOCK_BREAK: '#00d4ff',
  WEAK_DEFEND: '#6366f1',
  BLOWOUT: '#6b7280',
  BALANCED_LATE: '#06b6d4',
  GENERIC: '#8b949e',
};

// ============================================
// 主组件
// ============================================

export function LateModuleBacktestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [results, setResults] = useState<SignalBacktestResult[]>([]);
  const [matches, setMatches] = useState<HistoricalMatch[]>([]);
  const [showSettings, setShowSettings] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'equity' | 'scenarios' | 'signals'>('overview');
  const [expandedSignals, setExpandedSignals] = useState<Set<number>>(new Set());

  const [config, setConfig] = useState<BacktestConfig>({
    ...DEFAULT_BACKTEST_CONFIG,
    dataSource: 'mock',
  });

  const savedStats = useMemo(() => getSavedDataStats(), []);

  const handleRunBacktest = useCallback(async () => {
    setIsRunning(true);
    setProgress(null);
    setSummary(null);
    setResults([]);

    try {
      const result = await runLateModuleBacktest(config, (p) => {
        setProgress({ ...p });
      });

      setSummary(result.summary);
      setResults(result.results);
      setMatches(result.matches);
    } catch (error) {
      console.error('回测失败:', error);
    } finally {
      setIsRunning(false);
    }
  }, [config]);

  const handleSaveData = useCallback(() => {
    if (matches.length > 0) {
      saveBacktestData(matches);
      alert(`已保存 ${matches.length} 场比赛数据`);
    }
  }, [matches]);

  const handleLoadData = useCallback(() => {
    const loaded = loadBacktestData();
    if (loaded.length > 0) {
      setMatches(loaded);
      setConfig(prev => ({ ...prev, dataSource: 'local' }));
      alert(`已加载 ${loaded.length} 场比赛数据`);
    } else {
      alert('没有找到已保存的数据');
    }
  }, []);

  const handleGenerateMock = useCallback((count: number) => {
    const mockMatches = generateMockHistoricalMatches(count);
    setMatches(mockMatches);
    saveBacktestData(mockMatches);
    alert(`已生成并保存 ${count} 场模拟比赛数据`);
  }, []);

  const toggleLeague = (leagueId: number) => {
    setConfig(prev => {
      const current = prev.leagueIds || [];
      if (current.includes(leagueId)) {
        return { ...prev, leagueIds: current.filter(id => id !== leagueId) };
      }
      return { ...prev, leagueIds: [...current, leagueId] };
    });
  };

  const toggleScenario = (scenario: ScenarioTag) => {
    setConfig(prev => {
      if (prev.scenarios.includes(scenario)) {
        return { ...prev, scenarios: prev.scenarios.filter(s => s !== scenario) };
      }
      return { ...prev, scenarios: [...prev.scenarios, scenario] };
    });
  };

  const progressPercent = useMemo(() => {
    if (!progress) return 0;
    if (progress.phase === 'completed') return 100;
    if (progress.totalMatches === 0) return 0;
    const collectProgress = (progress.processedMatches / progress.totalMatches) * 50;
    const analyzeProgress = progress.totalSnapshots > 0
      ? (progress.processedSnapshots / progress.totalSnapshots) * 50
      : 0;
    return Math.min(99, Math.round(collectProgress + analyzeProgress));
  }, [progress]);

  return (
    <div className="min-h-screen bg-bg-deepest">
      {/* 头部 */}
      <header className="sticky top-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent-primary/20">
                <Activity className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-text-primary">晚期模块回测</h1>
                <p className="text-[10px] text-text-muted">Late Module Backtest - Real Data</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 mr-4">
              <button
                type="button"
                onClick={handleLoadData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-component text-text-secondary hover:text-text-primary text-sm transition-colors"
                title="加载已保存数据"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>加载</span>
              </button>
              {matches.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveData}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-component text-text-secondary hover:text-text-primary text-sm transition-colors"
                  title="保存数据到本地"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>保存</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                showSettings
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-bg-component text-text-secondary hover:text-text-primary'
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">设置</span>
            </button>

            <button
              type="button"
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-bg-deepest font-medium transition-all hover:bg-accent-primary/90 disabled:opacity-50"
            >
              {isRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isRunning ? '运行中...' : '开始回测'}
            </button>
          </div>
        </div>

        {isRunning && (
          <div className="relative h-1 bg-bg-deepest">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
            {progress && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
                {progress.phase === 'collecting' ? '收集数据' : progress.phase === 'analyzing' ? '分析中' : '完成'}
                {' '}
                {progress.processedMatches}/{progress.totalMatches}
              </div>
            )}
          </div>
        )}
      </header>

      {/* 设置面板 */}
      {showSettings && (
        <div className="border-b border-border-default bg-bg-card/50 p-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">数据源</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, dataSource: 'mock' })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      config.dataSource === 'mock'
                        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                        : 'bg-bg-component text-text-secondary border border-border-default'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    模拟数据
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, dataSource: 'api' })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      config.dataSource === 'api'
                        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                        : 'bg-bg-component text-text-secondary border border-border-default'
                    }`}
                  >
                    <Wifi className="w-4 h-4" />
                    API数据
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, dataSource: 'local' })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      config.dataSource === 'local'
                        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                        : 'bg-bg-component text-text-secondary border border-border-default'
                    }`}
                    disabled={!savedStats.hasData}
                  >
                    <FileText className="w-4 h-4" />
                    本地数据
                    {savedStats.hasData && (
                      <span className="text-[10px] bg-accent-success/20 text-accent-success px-1.5 py-0.5 rounded">
                        {savedStats.matchCount}场
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {config.dataSource === 'mock' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">生成数量</label>
                  <div className="flex gap-1">
                    {[100, 200, 500, 1000].map(count => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => handleGenerateMock(count)}
                        className="px-3 py-2 rounded-lg text-sm bg-bg-component text-text-secondary hover:text-text-primary border border-border-default"
                      >
                        {count}场
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {config.dataSource === 'api' && (
                <>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">开始日期</label>
                    <input
                      type="date"
                      value={config.dateFrom || ''}
                      onChange={(e) => setConfig({ ...config, dateFrom: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1.5">结束日期</label>
                    <input
                      type="date"
                      value={config.dateTo || ''}
                      onChange={(e) => setConfig({ ...config, dateTo: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary"
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-2">联赛选择</label>
              <div className="flex flex-wrap gap-2">
                {LEAGUE_OPTIONS.map(league => {
                  const isSelected = config.leagueIds?.includes(league.id);
                  return (
                    <button
                      key={league.id}
                      type="button"
                      onClick={() => toggleLeague(league.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                          : 'bg-bg-component text-text-secondary border border-border-default hover:border-text-muted'
                      }`}
                    >
                      <span>{league.flag}</span>
                      {league.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-2">场景筛选</label>
                <div className="flex flex-wrap gap-1">
                  {SCENARIO_OPTIONS.map(scenario => {
                    const isSelected = config.scenarios.includes(scenario.value);
                    return (
                      <button
                        key={scenario.value}
                        type="button"
                        onClick={() => toggleScenario(scenario.value)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                          isSelected
                            ? 'text-white'
                            : 'bg-bg-component text-text-muted border border-border-default'
                        }`}
                        style={isSelected ? { backgroundColor: scenario.color } : {}}
                      >
                        {scenario.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1.5">分钟范围</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={config.minMinute}
                    onChange={(e) => setConfig({ ...config, minMinute: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary"
                    min={0}
                    max={90}
                  />
                  <span className="text-text-muted">-</span>
                  <input
                    type="number"
                    value={config.maxMinute}
                    onChange={(e) => setConfig({ ...config, maxMinute: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary"
                    min={0}
                    max={90}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1.5">最低分数 ({config.minScore})</label>
                <input
                  type="range"
                  value={config.minScore}
                  onChange={(e) => setConfig({ ...config, minScore: Number(e.target.value) })}
                  className="w-full h-2 bg-bg-component rounded-lg appearance-none cursor-pointer accent-accent-primary"
                  min={-50}
                  max={100}
                />
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1.5">基础注码</label>
                <select
                  value={config.baseStake}
                  onChange={(e) => setConfig({ ...config, baseStake: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary"
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 标签页切换 */}
      {summary && (
        <div className="border-b border-border-default bg-bg-card/30">
          <div className="flex gap-1 px-4 py-2 overflow-x-auto">
            {[
              { key: 'overview', label: '总览', icon: Target },
              { key: 'equity', label: '资金曲线', icon: Activity },
              { key: 'scenarios', label: '场景分析', icon: Zap },
              { key: 'signals', label: '信号详情', icon: BarChart3 },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-component'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 主内容 */}
      <div className="p-4 lg:p-6">
        {summary ? (
          <>
            {activeTab === 'overview' && <OverviewTab summary={summary} />}
            {activeTab === 'equity' && <EquityTab summary={summary} />}
            {activeTab === 'scenarios' && <ScenariosTab summary={summary} />}
            {activeTab === 'signals' && (
              <SignalsTab
                results={results}
                expandedSignals={expandedSignals}
                setExpandedSignals={setExpandedSignals}
              />
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            {isRunning ? (
              <>
                <RefreshCw className="w-12 h-12 text-accent-primary animate-spin mb-4" />
                <p className="text-text-secondary">
                  {progress?.phase === 'collecting' ? '正在收集历史数据...' : '正在分析数据...'}
                </p>
                {progress?.currentMatch && (
                  <p className="text-sm text-text-muted mt-2">{progress.currentMatch}</p>
                )}
              </>
            ) : (
              <>
                <div className="p-4 rounded-xl bg-bg-card border border-border-default mb-4">
                  <Activity className="w-12 h-12 text-text-muted" />
                </div>
                <h2 className="text-lg font-medium text-text-primary mb-2">晚期模块回测系统</h2>
                <p className="text-sm text-text-secondary text-center max-w-md mb-6">
                  使用真实或模拟的历史数据验证晚期模块 (UnifiedLateModule) 的信号准确率和盈利能力
                </p>
                <button
                  type="button"
                  onClick={handleRunBacktest}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-primary text-bg-deepest font-medium"
                >
                  <Play className="w-5 h-5" />
                  开始回测
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 总览标签页
// ============================================

function OverviewTab({ summary }: { summary: BacktestSummary }) {
  const pieData = [
    { name: '正确', value: summary.correctPredictions, color: '#00cc66' },
    { name: '错误', value: summary.betSignals + summary.prepareSignals - summary.correctPredictions, color: '#ff4444' },
  ];

  const scenarioPieData = summary.byScenario.map(s => ({
    name: s.scenario === 'OVER_SPRINT' ? '大球冲刺' :
          s.scenario === 'STRONG_BEHIND' ? '强队追分' :
          s.scenario === 'DEADLOCK_BREAK' ? '破僵局' : '通用',
    value: s.totalSignals,
    color: SCENARIO_COLORS[s.scenario],
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Target}
          label="总准确率"
          value={`${summary.overallAccuracy.toFixed(1)}%`}
          color={summary.overallAccuracy >= 55 ? 'success' : summary.overallAccuracy >= 45 ? 'warning' : 'danger'}
          subtext={`${summary.correctPredictions}/${summary.betSignals + summary.prepareSignals} 正确`}
        />
        <MetricCard
          icon={DollarSign}
          label="总盈亏"
          value={`${summary.totalProfit >= 0 ? '+' : ''}${summary.totalProfit.toFixed(0)}`}
          color={summary.totalProfit >= 0 ? 'success' : 'danger'}
          subtext={`ROI: ${summary.roi.toFixed(2)}%`}
        />
        <MetricCard
          icon={Activity}
          label="夏普比率"
          value={summary.sharpeRatio.toFixed(2)}
          color={summary.sharpeRatio >= 1 ? 'success' : summary.sharpeRatio >= 0.5 ? 'warning' : 'danger'}
          subtext={summary.sharpeRatio >= 1 ? '优秀' : summary.sharpeRatio >= 0.5 ? '良好' : '需改进'}
        />
        <MetricCard
          icon={Shield}
          label="最大回撤"
          value={`${summary.maxDrawdown.toFixed(0)}`}
          color={summary.maxDrawdown / Math.max(1, summary.totalStake) <= 0.1 ? 'success' : 'warning'}
          subtext={`${((summary.maxDrawdown / Math.max(1, summary.totalStake)) * 100).toFixed(1)}% of stake`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <SmallMetricCard label="比赛数" value={summary.totalMatches.toString()} />
        <SmallMetricCard label="快照数" value={summary.totalSnapshots.toString()} />
        <SmallMetricCard label="总信号" value={summary.totalSignals.toString()} />
        <SmallMetricCard label="BET 信号" value={summary.betSignals.toString()} positive />
        <SmallMetricCard label="PREPARE 信号" value={summary.prepareSignals.toString()} />
        <SmallMetricCard label="盈利因子" value={summary.profitFactor.toFixed(2)} positive={summary.profitFactor > 1} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-accent-primary" />
            信号准确率
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 rounded-lg bg-bg-component">
              <p className="text-xs text-text-muted mb-1">BET 信号</p>
              <p className={`text-xl font-bold font-mono ${summary.betAccuracy >= 55 ? 'text-accent-success' : 'text-accent-warning'}`}>
                {summary.betAccuracy.toFixed(1)}%
              </p>
            </div>
            <div className="p-3 rounded-lg bg-bg-component">
              <p className="text-xs text-text-muted mb-1">PREPARE 信号</p>
              <p className={`text-xl font-bold font-mono ${summary.prepareAccuracy >= 55 ? 'text-accent-success' : 'text-accent-warning'}`}>
                {summary.prepareAccuracy.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-primary" />
            场景分布
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={scenarioPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {scenarioPieData.map((entry) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent-primary" />
          信号时间分布
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={summary.byMinute}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="minute" tick={{ fill: '#8b949e', fontSize: 11 }} tickFormatter={(v) => `${v}'`} />
              <YAxis yAxisId="left" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
              <Legend />
              <Bar yAxisId="left" dataKey="signals" fill="#00d4ff" name="信号数" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 资金曲线标签页
// ============================================

function EquityTab({ summary }: { summary: BacktestSummary }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-primary" />
          资金曲线
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.equityCurve}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="index" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
              <ReferenceLine y={0} stroke="#8b949e" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="equity" stroke="#00d4ff" fill="url(#equityGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-accent-danger" />
          回撤分析
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={summary.equityCurve}>
              <defs>
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="index" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="drawdown" stroke="#ff4444" fill="url(#drawdownGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent-success" />
            最佳信号 TOP 10
          </h3>
          <div className="space-y-2">
            {summary.bestSignals.slice(0, 10).map((s, i) => (
              <div key={`best-${s.matchId}-${s.minute}-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-bg-component">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted w-4">{i + 1}</span>
                  <div>
                    <p className="text-sm text-text-primary">{s.homeTeam} vs {s.awayTeam}</p>
                    <p className="text-[10px] text-text-muted">{s.minute}' | {s.scenario}</p>
                  </div>
                </div>
                <span className="font-mono text-accent-success">+{s.profit.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-accent-danger" />
            最差信号 TOP 10
          </h3>
          <div className="space-y-2">
            {summary.worstSignals.slice(0, 10).map((s, i) => (
              <div key={`worst-${s.matchId}-${s.minute}-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-bg-component">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted w-4">{i + 1}</span>
                  <div>
                    <p className="text-sm text-text-primary">{s.homeTeam} vs {s.awayTeam}</p>
                    <p className="text-[10px] text-text-muted">{s.minute}' | {s.scenario}</p>
                  </div>
                </div>
                <span className="font-mono text-accent-danger">{s.profit.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 场景分析标签页
// ============================================

function ScenariosTab({ summary }: { summary: BacktestSummary }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.byScenario.map(scenario => (
          <div
            key={scenario.scenario}
            className="card border-l-4"
            style={{ borderLeftColor: SCENARIO_COLORS[scenario.scenario] }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${SCENARIO_COLORS[scenario.scenario]}20` }}
                >
                  <Zap className="w-5 h-5" style={{ color: SCENARIO_COLORS[scenario.scenario] }} />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary">
                    {scenario.scenario === 'OVER_SPRINT' ? '大球冲刺' :
                     scenario.scenario === 'STRONG_BEHIND' ? '强队追分' :
                     scenario.scenario === 'DEADLOCK_BREAK' ? '破僵局' : '通用场景'}
                  </h3>
                  <p className="text-xs text-text-muted">{scenario.scenario}</p>
                </div>
              </div>
              <div className={`text-lg font-bold font-mono ${scenario.accuracy >= 55 ? 'text-accent-success' : 'text-accent-warning'}`}>
                {scenario.accuracy.toFixed(1)}%
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded bg-bg-component">
                <p className="text-[10px] text-text-muted">总信号</p>
                <p className="font-mono text-text-primary">{scenario.totalSignals}</p>
              </div>
              <div className="p-2 rounded bg-bg-component">
                <p className="text-[10px] text-text-muted">BET</p>
                <p className="font-mono text-accent-success">{scenario.betSignals}</p>
              </div>
              <div className="p-2 rounded bg-bg-component">
                <p className="text-[10px] text-text-muted">PREPARE</p>
                <p className="font-mono text-accent-warning">{scenario.prepareSignals}</p>
              </div>
              <div className="p-2 rounded bg-bg-component">
                <p className="text-[10px] text-text-muted">盈亏</p>
                <p className={`font-mono ${scenario.totalProfit >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                  {scenario.totalProfit >= 0 ? '+' : ''}{scenario.totalProfit.toFixed(0)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
              <span>正确: {scenario.correctPredictions}</span>
              <span>平均赔率: {scenario.avgOdds.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent-primary" />
          场景准确率对比
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.byScenario.map(s => ({
              name: s.scenario === 'OVER_SPRINT' ? '大球冲刺' :
                    s.scenario === 'STRONG_BEHIND' ? '强队追分' :
                    s.scenario === 'DEADLOCK_BREAK' ? '破僵局' : '通用',
              accuracy: s.accuracy,
              signals: s.totalSignals,
              scenario: s.scenario,
            }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#8b949e', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
              <ReferenceLine x={50} stroke="#ffaa00" strokeDasharray="3 3" />
              <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                {summary.byScenario.map((entry) => (
                  <Cell key={`cell-${entry.scenario}`} fill={SCENARIO_COLORS[entry.scenario]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 信号详情标签页
// ============================================

function SignalsTab({
  results,
  expandedSignals,
  setExpandedSignals,
}: {
  results: SignalBacktestResult[];
  expandedSignals: Set<number>;
  setExpandedSignals: (s: Set<number>) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'bet' | 'prepare' | 'correct' | 'wrong'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filteredResults = useMemo(() => {
    let filtered = results.filter(r => r.action !== 'IGNORE');
    if (filter === 'bet') filtered = filtered.filter(r => r.action === 'BET');
    if (filter === 'prepare') filtered = filtered.filter(r => r.action === 'PREPARE');
    if (filter === 'correct') filtered = filtered.filter(r => r.isCorrect === true);
    if (filter === 'wrong') filtered = filtered.filter(r => r.isCorrect === false);
    return filtered;
  }, [results, filter]);

  const paginatedResults = useMemo(() => {
    const start = page * pageSize;
    return filteredResults.slice(start, start + pageSize);
  }, [filteredResults, page]);

  const totalPages = Math.ceil(filteredResults.length / pageSize);

  const toggleExpand = (index: number) => {
    const newSet = new Set(expandedSignals);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setExpandedSignals(newSet);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'all', label: '全部' },
          { key: 'bet', label: 'BET' },
          { key: 'prepare', label: 'PREPARE' },
          { key: 'correct', label: '正确' },
          { key: 'wrong', label: '错误' },
        ].map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => { setFilter(f.key as typeof filter); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === f.key
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-bg-component text-text-secondary'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-sm text-text-muted ml-auto">
          共 {filteredResults.length} 条信号
        </span>
      </div>

      <div className="space-y-2">
        {paginatedResults.map((result, idx) => {
          const globalIdx = page * pageSize + idx;
          const isExpanded = expandedSignals.has(globalIdx);

          return (
            <div key={`${result.matchId}-${result.minute}-${idx}`} className="card p-0 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(globalIdx)}
                className="w-full flex items-center justify-between p-3 hover:bg-bg-component/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {result.isCorrect === true ? (
                    <CheckCircle className="w-5 h-5 text-accent-success" />
                  ) : result.isCorrect === false ? (
                    <XCircle className="w-5 h-5 text-accent-danger" />
                  ) : (
                    <Target className="w-5 h-5 text-text-muted" />
                  )}

                  <div>
                    <p className="font-medium text-text-primary">
                      {result.homeTeam} vs {result.awayTeam}
                    </p>
                    <p className="text-xs text-text-muted">
                      {result.league} | {result.date} | {result.minute}'
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      backgroundColor: `${SCENARIO_COLORS[result.scenario]}20`,
                      color: SCENARIO_COLORS[result.scenario],
                    }}
                  >
                    {result.scenario === 'OVER_SPRINT' ? '大球冲刺' :
                     result.scenario === 'STRONG_BEHIND' ? '强队追分' :
                     result.scenario === 'DEADLOCK_BREAK' ? '破僵局' : '通用'}
                  </span>

                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    result.action === 'BET'
                      ? 'bg-accent-success/20 text-accent-success'
                      : 'bg-accent-warning/20 text-accent-warning'
                  }`}>
                    {result.action}
                  </span>

                  <span className={`font-mono font-bold ${result.profit >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                    {result.profit >= 0 ? '+' : ''}{result.profit.toFixed(0)}
                  </span>

                  {isExpanded ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border-default p-4 bg-bg-component/30">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-text-muted">信号时比分</p>
                      <p className="font-mono text-text-primary">{result.scoreAtSignal.home} - {result.scoreAtSignal.away}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">最终比分</p>
                      <p className="font-mono text-text-primary">{result.finalScore.home} - {result.finalScore.away}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">后续进球</p>
                      <p className="font-mono text-text-primary">{result.actualGoalsAfter}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">赔率</p>
                      <p className="font-mono text-text-primary">{result.odds.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">分数</p>
                      <p className="font-mono text-text-primary">{result.score}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">置信度</p>
                      <p className="font-mono text-text-primary">{result.confidence}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">目标线</p>
                      <p className="font-mono text-text-primary">{result.predictedOutcome} {result.targetLine}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">注码</p>
                      <p className="font-mono text-text-primary">{result.stake}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-text-muted mb-2">信号原因</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(result.reasons) && (result.reasons as string[]).map((reason: string, i: number) => (
                        <span key={`reason-${i}`} className="px-2 py-1 rounded bg-bg-component text-xs text-text-secondary">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded bg-bg-component text-text-secondary disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm text-text-muted">{page + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded bg-bg-component text-text-secondary disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// 通用组件
// ============================================

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  subtext,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: 'success' | 'danger' | 'warning' | 'primary';
  subtext: string;
}) {
  const colorClasses = {
    success: 'text-accent-success bg-accent-success/10 border-accent-success/30',
    danger: 'text-accent-danger bg-accent-danger/10 border-accent-danger/30',
    warning: 'text-accent-warning bg-accent-warning/10 border-accent-warning/30',
    primary: 'text-accent-primary bg-accent-primary/10 border-accent-primary/30',
  };

  const iconColors = {
    success: 'text-accent-success',
    danger: 'text-accent-danger',
    warning: 'text-accent-warning',
    primary: 'text-accent-primary',
  };

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconColors[color]}`} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${iconColors[color]}`}>{value}</p>
      <p className="text-xs text-text-muted mt-1">{subtext}</p>
    </div>
  );
}

function SmallMetricCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-bg-component border border-border-default">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${positive ? 'text-accent-success' : 'text-text-primary'}`}>
        {value}
      </p>
    </div>
  );
}

export default LateModuleBacktestPage;
