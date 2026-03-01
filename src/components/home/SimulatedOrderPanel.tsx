/**
 * ============================================
 * 模拟下单面板 - 用于比赛详情页
 * 支持：让球盘、大小球、胜平负
 * ============================================
 */

import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  Check,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  getMatchOrders,
  updateOrderStatus,
  getOrderStats,
  type SimulatedOrder,
} from '../../services/matchHistoryService';
import {
  createOrderWithSync,
  getOrderStatsWithSync,
} from '../../services/dataSyncService';
import type { AdvancedMatch } from '../../data/advancedMockData';

interface SimulatedOrderPanelProps {
  match: AdvancedMatch;
  onOrderCreated?: (order: SimulatedOrder) => void;
}

type BetType = 'handicap' | 'overUnder' | 'matchWinner';

const BET_TYPE_LABELS: Record<BetType, string> = {
  handicap: '让球盘',
  overUnder: '大小球',
  matchWinner: '胜平负',
};

export function SimulatedOrderPanel({ match, onOrderCreated }: SimulatedOrderPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [betType, setBetType] = useState<BetType>('overUnder');
  const [selection, setSelection] = useState<string>('');
  const [amount, setAmount] = useState<string>('100');
  const [showSuccess, setShowSuccess] = useState(false);

  // 获取当前比赛的订单
  const matchOrders = useMemo(() => getMatchOrders(match.id), [match.id]);
  const orderStats = useMemo(() => getOrderStats(), []);

  // 获取当前可选择的选项和赔率
  const options = useMemo(() => {
    const handicapValue = match.home?.handicap ?? 0;
    const overUnderValue = match.odds?.overUnder?.total ?? 2.5;

    switch (betType) {
      case 'handicap':
        return [
          {
            value: `home ${handicapValue > 0 ? '+' : ''}${handicapValue}`,
            label: `${match.home?.name} (${handicapValue > 0 ? '+' : ''}${handicapValue})`,
            odds: match.odds?.handicap?.home ?? 1.90,
          },
          {
            value: `away ${handicapValue > 0 ? '-' : '+'}${Math.abs(handicapValue)}`,
            label: `${match.away?.name} (${handicapValue > 0 ? '-' : '+'}${Math.abs(handicapValue)})`,
            odds: match.odds?.handicap?.away ?? 1.90,
          },
        ];
      case 'overUnder':
        return [
          {
            value: `over ${overUnderValue}`,
            label: `大 ${overUnderValue}`,
            odds: match.odds?.overUnder?.over ?? 1.90,
          },
          {
            value: `under ${overUnderValue}`,
            label: `小 ${overUnderValue}`,
            odds: match.odds?.overUnder?.under ?? 1.90,
          },
        ];
      case 'matchWinner':
        return [
          {
            value: 'home',
            label: `${match.home?.name} 胜`,
            odds: 2.10,
          },
          {
            value: 'draw',
            label: '平局',
            odds: 3.40,
          },
          {
            value: 'away',
            label: `${match.away?.name} 胜`,
            odds: 3.20,
          },
        ];
      default:
        return [];
    }
  }, [betType, match]);

  // 获取选中选项的赔率
  const selectedOdds = useMemo(() => {
    const opt = options.find(o => o.value === selection);
    return opt?.odds ?? 0;
  }, [options, selection]);

  // 计算潜在收益
  const potentialProfit = useMemo(() => {
    const amt = Number.parseFloat(amount) || 0;
    return amt * selectedOdds - amt;
  }, [amount, selectedOdds]);

  // 处理下单
  const handlePlaceOrder = async () => {
    if (!selection || !amount || Number.parseFloat(amount) <= 0) {
      return;
    }

    const matchInfo = {
      homeTeam: match.home?.name,
      awayTeam: match.away?.name,
      leagueName: match.league,
      matchScore: `${match.home?.score ?? 0}-${match.away?.score ?? 0}`,
    };

    const order = await createOrderWithSync(
      {
        fixtureId: match.id,
        minute: match.minute,
        betType,
        selection,
        odds: selectedOdds,
        amount: Number.parseFloat(amount),
      },
      matchInfo
    );

    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);

    setSelection('');
    setAmount('100');

    onOrderCreated?.(order);
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  // 获取状态样式
  const getStatusStyle = (status: SimulatedOrder['status']) => {
    switch (status) {
      case 'won':
        return 'bg-[#00ff88]/20 text-[#00ff88]';
      case 'lost':
        return 'bg-[#ff4444]/20 text-[#ff4444]';
      case 'void':
        return 'bg-[#888]/20 text-[#888]';
      default:
        return 'bg-[#ffaa00]/20 text-[#ffaa00]';
    }
  };

  const getStatusLabel = (status: SimulatedOrder['status']) => {
    switch (status) {
      case 'won':
        return '赢';
      case 'lost':
        return '输';
      case 'void':
        return '作废';
      default:
        return '待结算';
    }
  };

  return (
    <div className="bg-[#111] rounded-lg border border-[#333] overflow-hidden">
      {/* 标题栏 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a1a1a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[#00d4ff]" />
          <span className="font-medium text-[#e0e0e0]">模拟下单</span>
          {matchOrders.length > 0 && (
            <span className="text-xs bg-[#00d4ff]/20 text-[#00d4ff] px-2 py-0.5 rounded">
              {matchOrders.length} 单
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-[#888]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#888]" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-[#222]">
          {/* 成功提示 */}
          {showSuccess && (
            <div className="mb-4 p-3 bg-[#00ff88]/20 border border-[#00ff88]/50 rounded-lg flex items-center gap-2">
              <Check className="w-5 h-5 text-[#00ff88]" />
              <span className="text-[#00ff88] text-sm">下单成功！</span>
            </div>
          )}

          {/* 下单表单 */}
          <div className="space-y-4">
            {/* 下单类型 */}
            <div>
              <label className="block text-xs text-[#888] mb-2">下单类型</label>
              <div className="flex gap-2">
                {(Object.keys(BET_TYPE_LABELS) as BetType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setBetType(type);
                      setSelection('');
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      betType === type
                        ? 'bg-[#00d4ff] text-black'
                        : 'bg-[#1a1a1a] text-[#888] hover:text-white border border-[#333]'
                    }`}
                  >
                    {BET_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* 选择方向 */}
            <div>
              <label className="block text-xs text-[#888] mb-2">选择方向</label>
              <div className="grid grid-cols-2 gap-2">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelection(opt.value)}
                    className={`p-3 rounded-lg text-sm transition-all ${
                      selection === opt.value
                        ? 'bg-[#ffaa00]/20 border-2 border-[#ffaa00] text-[#ffaa00]'
                        : 'bg-[#1a1a1a] border border-[#333] text-[#e0e0e0] hover:border-[#555]'
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-lg font-bold mt-1">@ {opt.odds.toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 金额输入 */}
            <div>
              <label className="block text-xs text-[#888] mb-2">下单金额</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]">¥</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg text-[#e0e0e0] focus:border-[#00d4ff] focus:outline-none"
                    placeholder="输入金额"
                    min="1"
                  />
                </div>
                <div className="flex gap-1">
                  {[50, 100, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className="px-3 py-2 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-[#888] hover:text-white hover:border-[#555]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 收益预览 */}
            {selection && selectedOdds > 0 && (
              <div className="p-3 bg-[#1a1a1a] rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#888]">当前赔率</span>
                  <span className="text-[#ffaa00] font-bold">@ {selectedOdds.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#888]">潜在收益</span>
                  <span className="text-[#00ff88] font-bold">
                    +¥{potentialProfit.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* 下单按钮 */}
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={!selection || !amount || Number.parseFloat(amount) <= 0}
              className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
                selection && amount && Number.parseFloat(amount) > 0
                  ? 'bg-[#00d4ff] text-black hover:bg-[#00d4ff]/90'
                  : 'bg-[#333] text-[#666] cursor-not-allowed'
              }`}
            >
              确认下单
            </button>
          </div>

          {/* 本场下单记录 */}
          {matchOrders.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[#222]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[#888]">本场下单记录</span>
                <span className="text-xs text-[#666]">{matchOrders.length} 单</span>
              </div>
              <div className="space-y-2">
                {matchOrders.slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="p-3 bg-[#1a1a1a] rounded-lg flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-3 h-3 text-[#666]" />
                        <span className="text-[#888]">{order.minute}'</span>
                        <span className="text-[#e0e0e0]">{BET_TYPE_LABELS[order.betType]}</span>
                        <span className="text-[#ffaa00]">{order.selection}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-[#666]">
                        <span>@ {order.odds.toFixed(2)}</span>
                        <span>¥{order.amount}</span>
                        <span>{formatTime(order.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.status !== 'pending' && order.profit !== undefined && (
                        <span className={order.profit >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}>
                          {order.profit >= 0 ? '+' : ''}¥{order.profit.toFixed(2)}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusStyle(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 总体统计 */}
          {orderStats.totalOrders > 0 && (
            <div className="mt-4 pt-4 border-t border-[#222]">
              <div className="text-xs text-[#888] mb-2">总体统计</div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-[#1a1a1a] rounded p-2">
                  <div className="text-[#00d4ff] font-bold">{orderStats.totalOrders}</div>
                  <div className="text-[#666]">总单数</div>
                </div>
                <div className="bg-[#1a1a1a] rounded p-2">
                  <div className="text-[#00ff88] font-bold">{orderStats.winRate}%</div>
                  <div className="text-[#666]">胜率</div>
                </div>
                <div className="bg-[#1a1a1a] rounded p-2">
                  <div className={`font-bold ${orderStats.totalProfit >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                    {orderStats.totalProfit >= 0 ? '+' : ''}¥{orderStats.totalProfit.toFixed(0)}
                  </div>
                  <div className="text-[#666]">盈亏</div>
                </div>
                <div className="bg-[#1a1a1a] rounded p-2">
                  <div className={`font-bold ${orderStats.roi >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                    {orderStats.roi >= 0 ? '+' : ''}{orderStats.roi}%
                  </div>
                  <div className="text-[#666]">ROI</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
