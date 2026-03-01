/**
 * ============================================
 * 云同步状态面板 - 显示同步状态和操作
 * ============================================
 */

import { useState, useEffect } from 'react';
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Check,
  AlertTriangle,
  Smartphone,
  Copy,
  Download,
  Upload,
} from 'lucide-react';
import {
  getSyncStatus,
  triggerSync,
  forceRefreshFromCloud,
  getOrderStatsWithSync,
} from '../../services/dataSyncService';
import { getDeviceId, importDeviceId } from '../../services/deviceService';
import { syncLocalOrdersToCloud, clearCloudOrders } from '../../services/supabaseOrderService';
import { getSimulatedOrders } from '../../services/matchHistoryService';

interface CloudSyncPanelProps {
  onClose?: () => void;
}

export function CloudSyncPanel({ onClose }: CloudSyncPanelProps) {
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [orderStats, setOrderStats] = useState<{
    totalOrders: number;
    wonOrders: number;
    lostOrders: number;
    winRate: number;
    totalProfit: number;
    roi: number;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deviceId] = useState(getDeviceId());
  const [showDeviceInput, setShowDeviceInput] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 加载同步状态和订单统计
  useEffect(() => {
    const loadData = async () => {
      setSyncStatus(getSyncStatus());
      const stats = await getOrderStatsWithSync();
      setOrderStats(stats);
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 手动同步
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const localOrders = getSimulatedOrders();
      const synced = await syncLocalOrdersToCloud(localOrders);
      await triggerSync();
      setSyncStatus(getSyncStatus());
      setMessage({ type: 'success', text: `同步完成，上传了 ${synced} 个订单` });
    } catch (error) {
      setMessage({ type: 'error', text: '同步失败' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 从云端刷新
  const handleRefreshFromCloud = async () => {
    setIsSyncing(true);
    try {
      await forceRefreshFromCloud();
      const stats = await getOrderStatsWithSync();
      setOrderStats(stats);
      setMessage({ type: 'success', text: '已从云端刷新数据' });
    } catch (error) {
      setMessage({ type: 'error', text: '刷新失败' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // 复制设备 ID
  const handleCopyDeviceId = () => {
    navigator.clipboard.writeText(deviceId);
    setMessage({ type: 'success', text: '设备 ID 已复制' });
    setTimeout(() => setMessage(null), 2000);
  };

  // 导入设备 ID
  const handleImportDevice = async () => {
    if (!newDeviceId.trim()) return;

    const success = await importDeviceId(newDeviceId.trim());
    if (success) {
      setMessage({ type: 'success', text: '设备已关联，正在同步数据...' });
      setShowDeviceInput(false);
      setNewDeviceId('');
      await handleRefreshFromCloud();
    } else {
      setMessage({ type: 'error', text: '设备 ID 无效' });
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '从未同步';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-[#111] rounded-lg border border-[#333] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {syncStatus.isOnline ? (
            <Cloud className="w-5 h-5 text-[#00d4ff]" />
          ) : (
            <CloudOff className="w-5 h-5 text-[#888]" />
          )}
          <h3 className="text-lg font-medium text-[#e0e0e0]">云同步</h3>
        </div>
        <div className={`px-2 py-1 rounded text-xs ${
          syncStatus.isOnline
            ? 'bg-[#00ff88]/20 text-[#00ff88]'
            : 'bg-[#ff4444]/20 text-[#ff4444]'
        }`}>
          {syncStatus.isOnline ? '在线' : '离线'}
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
          message.type === 'success'
            ? 'bg-[#00ff88]/20 text-[#00ff88]'
            : 'bg-[#ff4444]/20 text-[#ff4444]'
        }`}>
          {message.type === 'success' ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {message.text}
        </div>
      )}

      {/* 同步状态 */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-[#888]">上次同步</span>
          <span className="text-[#e0e0e0]">{formatTime(syncStatus.lastSyncTime)}</span>
        </div>
        {syncStatus.pendingOrdersCount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-[#888]">待同步订单</span>
            <span className="text-[#ffaa00]">{syncStatus.pendingOrdersCount}</span>
          </div>
        )}
      </div>

      {/* 订单统计 */}
      {orderStats && (
        <div className="bg-[#1a1a1a] rounded-lg p-3 mb-4">
          <div className="text-xs text-[#888] mb-2">云端数据统计</div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-[#00d4ff] font-bold">{orderStats.totalOrders}</div>
              <div className="text-[#666]">总订单</div>
            </div>
            <div>
              <div className="text-[#00ff88] font-bold">{orderStats.winRate}%</div>
              <div className="text-[#666]">胜率</div>
            </div>
            <div>
              <div className={`font-bold ${orderStats.roi >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {orderStats.roi >= 0 ? '+' : ''}{orderStats.roi}%
              </div>
              <div className="text-[#666]">ROI</div>
            </div>
          </div>
        </div>
      )}

      {/* 同步操作 */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing || !syncStatus.isOnline}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSyncing || !syncStatus.isOnline
              ? 'bg-[#333] text-[#666] cursor-not-allowed'
              : 'bg-[#00d4ff] text-black hover:bg-[#00d4ff]/90'
          }`}
        >
          <Upload className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          上传同步
        </button>
        <button
          type="button"
          onClick={handleRefreshFromCloud}
          disabled={isSyncing || !syncStatus.isOnline}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSyncing || !syncStatus.isOnline
              ? 'bg-[#333] text-[#666] cursor-not-allowed'
              : 'bg-[#1a1a1a] text-[#e0e0e0] border border-[#333] hover:border-[#555]'
          }`}
        >
          <Download className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          云端刷新
        </button>
      </div>

      {/* 设备 ID */}
      <div className="border-t border-[#222] pt-4">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="w-4 h-4 text-[#888]" />
          <span className="text-sm text-[#888]">设备 ID</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-[#1a1a1a] px-3 py-2 rounded text-[#00d4ff] font-mono truncate">
            {deviceId}
          </code>
          <button
            type="button"
            onClick={handleCopyDeviceId}
            className="p-2 bg-[#1a1a1a] rounded hover:bg-[#222] transition-colors"
            title="复制设备 ID"
          >
            <Copy className="w-4 h-4 text-[#888]" />
          </button>
        </div>
        <p className="text-xs text-[#666] mt-2">
          在其他设备输入此 ID 可同步数据
        </p>

        {/* 导入设备 */}
        {!showDeviceInput ? (
          <button
            type="button"
            onClick={() => setShowDeviceInput(true)}
            className="mt-3 text-xs text-[#00d4ff] hover:underline"
          >
            导入其他设备数据
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={newDeviceId}
              onChange={(e) => setNewDeviceId(e.target.value)}
              placeholder="输入其他设备的 ID"
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333] rounded text-sm text-[#e0e0e0] focus:border-[#00d4ff] focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleImportDevice}
                className="flex-1 py-2 bg-[#00d4ff] text-black rounded text-sm font-medium hover:bg-[#00d4ff]/90"
              >
                导入
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeviceInput(false);
                  setNewDeviceId('');
                }}
                className="flex-1 py-2 bg-[#333] text-[#e0e0e0] rounded text-sm hover:bg-[#444]"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
