// ============================================
// 盘口分析回测页面 - 增强版
// ============================================

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Play, RefreshCw, TrendingUp, TrendingDown,
  Target, AlertTriangle, BarChart3, CheckCircle, XCircle,
  Zap, DollarSign, Percent, Clock, Settings2, Info,
  Activity, Shield, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
  AreaChart, Area, ComposedChart, ReferenceLine
} from 'recharts';
import {
  runBacktest, generateHistoricalMatches,
  type BacktestResult, type OddsAlertType
} from '../services/oddsAnalyzer';

// 信号类型名称映射
const getSignalTypeName = (type: OddsAlertType): string => {
  const names: Record<OddsAlertType, string> = {
    handicap_rapid_change: '让球急变',
    over_rapid_drop: '大球急跌',
    under_rapid_drop: '小球急跌',
    odds_divergence: '盘口背离',
    late_odds_shift: '临场变盘',
    money_flow_reversal: '资金逆转',
  };
  return names[type] || type;
};

// 回测参数配置
interface BacktestParams {
  matchCount: number;
  leagues: string[];
  minuteRange: [number, number];
  signalTypes: OddsAlertType[];
  minConfidence: number;
  stakingStrategy: 'flat' | 'kelly' | 'percentage';
  baseStake: number;
}

// 高级统计指标
interface AdvancedStats {
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  winStreak: number;
  loseStreak: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  recoveryFactor: number;
  roi: number;
}

// 资金曲线数据点
interface EquityCurvePoint {
  index: number;
  equity: number;
  drawdown: number;
  signal: string;
}

// 每日统计
interface DailyStats {
  day: number;
  signals: number;
  wins: number;
  losses: number;
  profit: number;
  cumProfit: number;
}

// 联赛选项
const LEAGUE_OPTIONS = [
  { value: 'all', label: '全部联赛' },
  { value: '英超', label: '英超' },
  { value: '西甲', label: '西甲' },
  { value: '德甲', label: '德甲' },
  { value: '意甲', label: '意甲' },
  { value: '法甲', label: '法甲' },
];

// 信号类型选项
const SIGNAL_TYPE_OPTIONS: { value: OddsAlertType; label: string }[] = [
  { value: 'handicap_rapid_change', label: '让球急变' },
  { value: 'over_rapid_drop', label: '大球急跌' },
  { value: 'under_rapid_drop', label: '小球急跌' },
  { value: 'odds_divergence', label: '盘口背离' },
  { value: 'late_odds_shift', label: '临场变盘' },
  { value: 'money_flow_reversal', label: '资金逆转' },
];

export function BacktestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'equity' | 'signals' | 'daily'>('overview');

  // 回测参数
  const [params, setParams] = useState<BacktestParams>({
    matchCount: 200,
    leagues: ['all'],
    minuteRange: [60, 90],
    signalTypes: ['handicap_rapid_change', 'over_rapid_drop', 'odds_divergence', 'late_odds_shift'],
    minConfidence: 50,
    stakingStrategy: 'flat',
    baseStake: 100,
  });

  // 高级统计
  const [advancedStats, setAdvancedStats] = useState<AdvancedStats | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityCurvePoint[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);

  // 计算高级统计指标
  const calculateAdvancedStats = (result: BacktestResult): AdvancedStats => {
    const signals = result.signalBreakdown;
    const totalSignals = result.signalsGenerated;
    const correctSignals = result.correctPredictions;
    const wrongSignals = totalSignals - correctSignals;

    // 模拟盈亏数组
    const returns: number[] = [];
    for (let i = 0; i < correctSignals; i++) {
      returns.push(0.85 + Math.random() * 0.3);
    }
    for (let i = 0; i < wrongSignals; i++) {
      returns.push(-1);
    }
    // 打乱顺序
    returns.sort(() => Math.random() - 0.5);

    // 计算夏普比率
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

    // 计算最大回撤
    let equity = params.baseStake * totalSignals;
    let peak = equity;
    let maxDrawdown = 0;
    const equityCurveData: EquityCurvePoint[] = [];

    returns.forEach((ret, index) => {
      equity += ret * params.baseStake;
      if (equity > peak) peak = equity;
      const drawdown = peak - equity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      equityCurveData.push({
        index: index + 1,
        equity: Math.round(equity),
        drawdown: Math.round(drawdown),
        signal: ret > 0 ? '盈利' : '亏损',
      });
    });

    setEquityCurve(equityCurveData);

    // 计算连胜连败
    let winStreak = 0;
    let loseStreak = 0;
    let currentWin = 0;
    let currentLose = 0;
    for (const ret of returns) {
      if (ret > 0) {
        currentWin++;
        currentLose = 0;
        winStreak = Math.max(winStreak, currentWin);
      } else {
        currentLose++;
        currentWin = 0;
        loseStreak = Math.max(loseStreak, currentLose);
      }
    }

    // 平均盈利/亏损
    const wins = returns.filter(r => r > 0);
    const losses = returns.filter(r => r < 0);
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length * params.baseStake : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) * params.baseStake : 0;

    // 盈利因子
    const grossProfit = wins.reduce((a, b) => a + b, 0) * params.baseStake;
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0)) * params.baseStake;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    // 回收因子
    const totalProfit = result.profitLoss * params.baseStake;
    const recoveryFactor = maxDrawdown > 0 ? totalProfit / maxDrawdown : 0;

    // ROI
    const initialCapital = params.baseStake * totalSignals;
    const roi = initialCapital > 0 ? (totalProfit / initialCapital) * 100 : 0;

    // 生成每日统计（模拟7天）
    const dailyData: DailyStats[] = [];
    const signalsPerDay = Math.ceil(totalSignals / 7);
    let cumProfit = 0;

    for (let day = 1; day <= 7; day++) {
      const startIdx = (day - 1) * signalsPerDay;
      const endIdx = Math.min(day * signalsPerDay, returns.length);
      const dayReturns = returns.slice(startIdx, endIdx);

      const dayWins = dayReturns.filter(r => r > 0).length;
      const dayLosses = dayReturns.filter(r => r < 0).length;
      const dayProfit = dayReturns.reduce((a, b) => a + b, 0) * params.baseStake;
      cumProfit += dayProfit;

      dailyData.push({
        day,
        signals: dayReturns.length,
        wins: dayWins,
        losses: dayLosses,
        profit: Math.round(dayProfit),
        cumProfit: Math.round(cumProfit),
      });
    }
    setDailyStats(dailyData);

    return {
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown),
      maxDrawdownPercent: Math.round((maxDrawdown / peak) * 10000) / 100,
      winStreak,
      loseStreak,
      avgWin: Math.round(avgWin),
      avgLoss: Math.round(avgLoss),
      profitFactor: Math.round(profitFactor * 100) / 100,
      recoveryFactor: Math.round(recoveryFactor * 100) / 100,
      roi: Math.round(roi * 100) / 100,
    };
  };

  // 运行回测
  const handleRunBacktest = async () => {
    setIsRunning(true);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 8, 90));
    }, 100);

    await new Promise(resolve => setTimeout(resolve, 500));
    const historicalMatches = generateHistoricalMatches(params.matchCount);

    setProgress(95);
    await new Promise(resolve => setTimeout(resolve, 200));

    const backtestResult = runBacktest(historicalMatches);

    clearInterval(progressInterval);
    setProgress(100);
    setResult(backtestResult);
    setAdvancedStats(calculateAdvancedStats(backtestResult));
    setIsRunning(false);
  };

  // 自动运行一次回测
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只需运行一次
  useEffect(() => {
    handleRunBacktest();
  }, []);

  // 图表数据
  const chartData = useMemo(() => {
    if (!result) return { signalBreakdown: [], pieData: [], winLossData: [] };

    const signalBreakdown = result.signalBreakdown.map(s => ({
      name: getSignalTypeName(s.type),
      type: s.type,
      count: s.count,
      correct: s.correct,
      wrong: s.count - s.correct,
      accuracy: Math.round(s.accuracy),
    }));

    const pieData = [
      { name: '正确预测', value: result.correctPredictions, color: '#00cc66' },
      { name: '错误预测', value: result.signalsGenerated - result.correctPredictions, color: '#ff4444' },
    ];

    const winLossData = signalBreakdown.map(s => ({
      name: s.name,
      盈利: s.correct,
      亏损: -s.wrong,
    }));

    return { signalBreakdown, pieData, winLossData };
  }, [result]);

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
              <BarChart3 className="w-6 h-6 text-accent-primary" />
              <div>
                <h1 className="text-xl font-bold text-text-primary">盘口分析回测</h1>
                <p className="text-[10px] text-text-muted">Odds Analysis Backtest System</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 设置按钮 */}
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
              <span className="hidden sm:inline text-sm">参数设置</span>
            </button>

            {/* 运行按钮 */}
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
              {isRunning ? '运行中...' : '运行回测'}
            </button>
          </div>
        </div>

        {/* 进度条 */}
        {isRunning && (
          <div className="h-1 bg-bg-deepest">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </header>

      {/* 参数设置面板 */}
      {showSettings && (
        <div className="border-b border-border-default bg-bg-card/50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 样本数量 */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5">样本数量</label>
              <select
                value={params.matchCount}
                onChange={(e) => setParams({ ...params, matchCount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value={50}>50场</option>
                <option value={100}>100场</option>
                <option value={200}>200场</option>
                <option value={500}>500场</option>
                <option value={1000}>1000场</option>
              </select>
            </div>

            {/* 时间范围 */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5">比赛分钟范围</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={params.minuteRange[0]}
                  onChange={(e) => setParams({ ...params, minuteRange: [Number(e.target.value), params.minuteRange[1]] })}
                  className="w-full px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  min={0}
                  max={90}
                />
                <span className="text-text-muted">-</span>
                <input
                  type="number"
                  value={params.minuteRange[1]}
                  onChange={(e) => setParams({ ...params, minuteRange: [params.minuteRange[0], Number(e.target.value)] })}
                  className="w-full px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  min={0}
                  max={90}
                />
              </div>
            </div>

            {/* 最低置信度 */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5">最低置信度 ({params.minConfidence}%)</label>
              <input
                type="range"
                value={params.minConfidence}
                onChange={(e) => setParams({ ...params, minConfidence: Number(e.target.value) })}
                className="w-full h-2 bg-bg-component rounded-lg appearance-none cursor-pointer accent-accent-primary"
                min={0}
                max={100}
              />
            </div>

            {/* 投注策略 */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5">投注策略</label>
              <select
                value={params.stakingStrategy}
                onChange={(e) => setParams({ ...params, stakingStrategy: e.target.value as BacktestParams['stakingStrategy'] })}
                className="w-full px-3 py-2 rounded-lg bg-bg-component border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              >
                <option value="flat">固定金额</option>
                <option value="percentage">固定比例</option>
                <option value="kelly">凯利公式</option>
              </select>
            </div>
          </div>

          {/* 信号类型选择 */}
          <div className="mt-4">
            <label className="block text-xs text-text-muted mb-2">信号类型筛选</label>
            <div className="flex flex-wrap gap-2">
              {SIGNAL_TYPE_OPTIONS.map(option => {
                const isSelected = params.signalTypes.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setParams({ ...params, signalTypes: params.signalTypes.filter(t => t !== option.value) });
                      } else {
                        setParams({ ...params, signalTypes: [...params.signalTypes, option.value] });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/50'
                        : 'bg-bg-component text-text-secondary border border-border-default hover:border-text-muted'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 标签页切换 */}
      <div className="border-b border-border-default bg-bg-card/30">
        <div className="flex gap-1 px-4 py-2">
          {[
            { key: 'overview', label: '总览', icon: Target },
            { key: 'equity', label: '资金曲线', icon: Activity },
            { key: 'signals', label: '信号分析', icon: Zap },
            { key: 'daily', label: '每日统计', icon: BarChart3 },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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

      {/* 主内容 */}
      <div className="p-4 lg:p-6">
        {result ? (
          <>
            {/* 总览标签页 */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* 核心指标卡片 */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricCard
                    icon={Target}
                    label="总准确率"
                    value={`${result.accuracy.toFixed(1)}%`}
                    color={result.accuracy >= 55 ? 'success' : result.accuracy >= 45 ? 'warning' : 'danger'}
                    subtext={`${result.correctPredictions}/${result.signalsGenerated} 正确`}
                    trend={result.accuracy >= 50 ? 'up' : 'down'}
                  />
                  <MetricCard
                    icon={DollarSign}
                    label="模拟盈亏"
                    value={`${result.profitLoss >= 0 ? '+' : ''}${(result.profitLoss * params.baseStake).toFixed(0)}`}
                    color={result.profitLoss >= 0 ? 'success' : 'danger'}
                    subtext={`ROI: ${advancedStats?.roi.toFixed(2)}%`}
                    trend={result.profitLoss >= 0 ? 'up' : 'down'}
                  />
                  <MetricCard
                    icon={Activity}
                    label="夏普比率"
                    value={advancedStats?.sharpeRatio.toFixed(2) || '-'}
                    color={advancedStats && advancedStats.sharpeRatio >= 1 ? 'success' : advancedStats && advancedStats.sharpeRatio >= 0.5 ? 'warning' : 'danger'}
                    subtext={advancedStats && advancedStats.sharpeRatio >= 1 ? '优秀' : advancedStats && advancedStats.sharpeRatio >= 0.5 ? '良好' : '需改进'}
                  />
                  <MetricCard
                    icon={Shield}
                    label="最大回撤"
                    value={`${advancedStats?.maxDrawdownPercent.toFixed(1)}%`}
                    color={advancedStats && advancedStats.maxDrawdownPercent <= 10 ? 'success' : advancedStats && advancedStats.maxDrawdownPercent <= 20 ? 'warning' : 'danger'}
                    subtext={`${advancedStats?.maxDrawdown} 单位`}
                    trend="down"
                  />
                </div>

                {/* 高级统计 */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <SmallMetricCard label="盈利因子" value={advancedStats?.profitFactor.toFixed(2) || '-'} />
                  <SmallMetricCard label="平均盈利" value={`+${advancedStats?.avgWin || 0}`} positive />
                  <SmallMetricCard label="平均亏损" value={`-${advancedStats?.avgLoss || 0}`} negative />
                  <SmallMetricCard label="最大连胜" value={advancedStats?.winStreak.toString() || '-'} positive />
                  <SmallMetricCard label="最大连败" value={advancedStats?.loseStreak.toString() || '-'} negative />
                  <SmallMetricCard label="回收因子" value={advancedStats?.recoveryFactor.toFixed(2) || '-'} />
                </div>

                {/* 图表区域 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 信号准确率柱状图 */}
                  <div className="card">
                    <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-accent-primary" />
                      各信号类型准确率
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.signalBreakdown} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                          <XAxis type="number" domain={[0, 100]} tick={{ fill: '#8b949e', fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#8b949e', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                            formatter={(value, name) => [`${value}%`, name === 'accuracy' ? '准确率' : name]}
                          />
                          <ReferenceLine x={50} stroke="#ffaa00" strokeDasharray="3 3" />
                          <Bar dataKey="accuracy" fill="#00d4ff" radius={[0, 4, 4, 0]}>
                            {chartData.signalBreakdown.map((entry, index) => (
                              <Cell
                                key={`cell-${entry.name}-${index}`}
                                fill={entry.accuracy >= 60 ? '#00cc66' : entry.accuracy >= 50 ? '#ffaa00' : '#ff4444'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 预测结果饼图 */}
                  <div className="card">
                    <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                      <Target className="w-4 h-4 text-accent-primary" />
                      预测结果分布
                    </h3>
                    <div className="h-64 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData.pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={5}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            {chartData.pieData.map((entry) => (
                              <Cell key={`cell-${entry.name}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* 结论与建议 */}
                <div className="card bg-gradient-to-br from-bg-card to-bg-component">
                  <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                    <Info className="w-4 h-4 text-accent-primary" />
                    回测结论
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-bg-deepest/50">
                      <h4 className="text-sm font-medium text-accent-success mb-2 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        推荐使用的信号
                      </h4>
                      <ul className="space-y-1 text-sm text-text-secondary">
                        {result.signalBreakdown
                          .filter(s => s.accuracy >= 55)
                          .map(s => (
                            <li key={s.type} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-success" />
                              {getSignalTypeName(s.type)} ({s.accuracy.toFixed(1)}%)
                            </li>
                          ))
                        }
                        {result.signalBreakdown.filter(s => s.accuracy >= 55).length === 0 && (
                          <li className="text-text-muted">暂无高准确率信号</li>
                        )}
                      </ul>
                    </div>
                    <div className="p-4 rounded-lg bg-bg-deepest/50">
                      <h4 className="text-sm font-medium text-accent-danger mb-2 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        需谨慎的信号
                      </h4>
                      <ul className="space-y-1 text-sm text-text-secondary">
                        {result.signalBreakdown
                          .filter(s => s.accuracy < 45)
                          .map(s => (
                            <li key={s.type} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-danger" />
                              {getSignalTypeName(s.type)} ({s.accuracy.toFixed(1)}%)
                            </li>
                          ))
                        }
                        {result.signalBreakdown.filter(s => s.accuracy < 45).length === 0 && (
                          <li className="text-text-muted">暂无低准确率信号</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-text-muted">
                    * 回测结果基于模拟历史数据，仅供参考。实际交易中应结合多种因素综合判断。
                  </p>
                </div>
              </div>
            )}

            {/* 资金曲线标签页 */}
            {activeTab === 'equity' && (
              <div className="space-y-6">
                {/* 资金曲线图 */}
                <div className="card">
                  <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-accent-primary" />
                    资金曲线
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                        <XAxis dataKey="index" tick={{ fill: '#8b949e', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                          formatter={(value) => [`${value}`, '资金']}
                        />
                        <ReferenceLine y={params.baseStake * result.signalsGenerated} stroke="#8b949e" strokeDasharray="3 3" />
                        <Area
                          type="monotone"
                          dataKey="equity"
                          stroke="#00d4ff"
                          fill="url(#equityGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 回撤图 */}
                <div className="card">
                  <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-accent-danger" />
                    回撤分析
                  </h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ff4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ff4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                        <XAxis dataKey="index" tick={{ fill: '#8b949e', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                          formatter={(value) => [`${value}`, '回撤']}
                        />
                        <Area
                          type="monotone"
                          dataKey="drawdown"
                          stroke="#ff4444"
                          fill="url(#drawdownGradient)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* 信号分析标签页 */}
            {activeTab === 'signals' && (
              <div className="space-y-6">
                {/* 盈亏对比图 */}
                <div className="card">
                  <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-accent-primary" />
                    各信号盈亏对比
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData.winLossData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                        <XAxis type="number" tick={{ fill: '#8b949e', fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#8b949e', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Bar dataKey="盈利" fill="#00cc66" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="亏损" fill="#ff4444" radius={[4, 0, 0, 4]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 信号详细统计 */}
                <div className="card">
                  <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-accent-warning" />
                    信号详细统计
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border-default text-xs text-text-muted">
                          <th className="py-3 px-4 text-left">信号类型</th>
                          <th className="py-3 px-4 text-center">触发次数</th>
                          <th className="py-3 px-4 text-center">正确预测</th>
                          <th className="py-3 px-4 text-center">错误预测</th>
                          <th className="py-3 px-4 text-center">准确率</th>
                          <th className="py-3 px-4 text-center">评级</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.signalBreakdown.map((signal) => (
                          <tr key={signal.type} className="border-b border-border-default/50 hover:bg-bg-component/50">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-accent-primary" />
                                <span className="font-medium text-text-primary">{getSignalTypeName(signal.type)}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-text-secondary">{signal.count}</td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <CheckCircle className="w-4 h-4 text-accent-success" />
                                <span className="font-mono text-accent-success">{signal.correct}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <XCircle className="w-4 h-4 text-accent-danger" />
                                <span className="font-mono text-accent-danger">{signal.count - signal.correct}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`font-mono font-bold ${
                                signal.accuracy >= 60 ? 'text-accent-success' :
                                signal.accuracy >= 50 ? 'text-accent-warning' :
                                'text-accent-danger'
                              }`}>
                                {signal.accuracy.toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <SignalRating accuracy={signal.accuracy} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 每日统计标签页 */}
            {activeTab === 'daily' && (
              <div className="space-y-6">
                {/* 累计盈亏曲线 */}
                <div className="card">
                  <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-accent-primary" />
                    每日累计盈亏
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                        <XAxis dataKey="day" tick={{ fill: '#8b949e', fontSize: 11 }} tickFormatter={(v) => `Day ${v}`} />
                        <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                          formatter={(value, name) => [value, name === 'cumProfit' ? '累计盈亏' : name === 'profit' ? '当日盈亏' : name]}
                        />
                        <Legend />
                        <ReferenceLine y={0} stroke="#8b949e" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="cumProfit" stroke="#00d4ff" strokeWidth={2} dot={{ fill: '#00d4ff' }} name="累计盈亏" />
                        <Line type="monotone" dataKey="profit" stroke="#00cc66" strokeWidth={2} dot={{ fill: '#00cc66' }} name="当日盈亏" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 每日统计表格 */}
                <div className="card">
                  <h3 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-accent-primary" />
                    每日详细统计
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border-default text-xs text-text-muted">
                          <th className="py-3 px-4 text-left">日期</th>
                          <th className="py-3 px-4 text-center">信号数</th>
                          <th className="py-3 px-4 text-center">盈利</th>
                          <th className="py-3 px-4 text-center">亏损</th>
                          <th className="py-3 px-4 text-center">胜率</th>
                          <th className="py-3 px-4 text-center">当日盈亏</th>
                          <th className="py-3 px-4 text-center">累计盈亏</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyStats.map((day) => {
                          const winRate = day.signals > 0 ? (day.wins / day.signals) * 100 : 0;
                          return (
                            <tr key={day.day} className="border-b border-border-default/50 hover:bg-bg-component/50">
                              <td className="py-3 px-4 font-medium text-text-primary">Day {day.day}</td>
                              <td className="py-3 px-4 text-center font-mono text-text-secondary">{day.signals}</td>
                              <td className="py-3 px-4 text-center font-mono text-accent-success">{day.wins}</td>
                              <td className="py-3 px-4 text-center font-mono text-accent-danger">{day.losses}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`font-mono ${winRate >= 50 ? 'text-accent-success' : 'text-accent-danger'}`}>
                                  {winRate.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`font-mono font-bold ${day.profit >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                                  {day.profit >= 0 ? '+' : ''}{day.profit}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`font-mono font-bold ${day.cumProfit >= 0 ? 'text-accent-success' : 'text-accent-danger'}`}>
                                  {day.cumProfit >= 0 ? '+' : ''}{day.cumProfit}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="w-12 h-12 text-accent-primary animate-spin mb-4" />
            <p className="text-text-secondary">正在加载回测数据...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// 指标卡片
function MetricCard({
  icon: Icon,
  label,
  value,
  color,
  subtext,
  trend,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: 'success' | 'danger' | 'warning' | 'primary';
  subtext: string;
  trend?: 'up' | 'down' | 'neutral';
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

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColors[color]}`} />
          <span className="text-sm text-text-secondary">{label}</span>
        </div>
        {trend && (
          <TrendIcon className={`w-4 h-4 ${trend === 'up' ? 'text-accent-success' : trend === 'down' ? 'text-accent-danger' : 'text-text-muted'}`} />
        )}
      </div>
      <p className={`text-2xl font-bold font-mono ${iconColors[color]}`}>{value}</p>
      <p className="text-xs text-text-muted mt-1">{subtext}</p>
    </div>
  );
}

// 小型指标卡片
function SmallMetricCard({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-bg-component border border-border-default">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${
        positive ? 'text-accent-success' :
        negative ? 'text-accent-danger' :
        'text-text-primary'
      }`}>
        {value}
      </p>
    </div>
  );
}

// 信号评级
function SignalRating({ accuracy }: { accuracy: number }) {
  if (accuracy >= 65) {
    return <span className="px-2 py-0.5 rounded bg-accent-success/20 text-accent-success text-xs font-medium">优秀</span>;
  }
  if (accuracy >= 55) {
    return <span className="px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-xs font-medium">良好</span>;
  }
  if (accuracy >= 45) {
    return <span className="px-2 py-0.5 rounded bg-accent-warning/20 text-accent-warning text-xs font-medium">一般</span>;
  }
  return <span className="px-2 py-0.5 rounded bg-accent-danger/20 text-accent-danger text-xs font-medium">较差</span>;
}

export default BacktestPage;
