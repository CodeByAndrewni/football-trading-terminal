// ============================================
// 足球交易决策终端 - 头部导航（响应式）
// ============================================

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Swords, CornerUpRight, Settings, Wifi, WifiOff, Menu, BarChart3, FileText, Cloud, CloudOff } from 'lucide-react';
import { ApiSettingsPanel } from '../settings/ApiSettingsPanel';
import { MobileMenu } from './MobileMenu';
import { isApiKeyConfigured } from '../../services/api';
import { getSyncStatus } from '../../services/dataSyncService';

interface HeaderProps {
  selectedLeague?: number | null;
  onSelectLeague?: (leagueId: number | null) => void;
}

export function Header({ selectedLeague, onSelectLeague }: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [cloudOnline, setCloudOnline] = useState(true);

  useEffect(() => {
    setApiConfigured(isApiKeyConfigured());
    // 更新云同步状态
    const syncStatus = getSyncStatus();
    setCloudOnline(syncStatus.isOnline);

    // 监听在线状态变化
    const updateOnlineStatus = () => setCloudOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* 左侧：汉堡菜单 + Logo */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* 汉堡菜单（仅移动端） */}
              <button
                type="button"
                onClick={() => setShowMobileMenu(true)}
                className="lg:hidden p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-component transition-all"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Logo */}
              <Link to="/" className="flex items-center gap-2 group">
                <span className="text-lg sm:text-xl font-black tracking-tight">
                  <span className="text-accent-primary">LIVE</span>
                  <span className="text-text-primary">PRO</span>
                </span>
              </Link>
            </div>

            {/* 右侧入口按钮 */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* 作战室入口（高亮） */}
              <Link
                to="/battle"
                className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-accent-danger/10 border border-accent-danger/30 text-accent-danger hover:bg-accent-danger/20 hover:border-accent-danger transition-all"
              >
                <Swords className="w-4 h-4" />
                <span className="text-sm font-medium hidden md:inline">作战室</span>
              </Link>

              {/* 复盘台入口 */}
              <Link
                to="/review"
                className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-bg-component border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-primary transition-all"
              >
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium hidden md:inline">复盘台</span>
              </Link>

              {/* 角球分析入口（隐藏在小屏） */}
              <Link
                to="/corners"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-component border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-warning transition-all"
              >
                <CornerUpRight className="w-4 h-4" />
                <span className="text-sm font-medium hidden lg:inline">角球分析</span>
              </Link>

              {/* 盘口回测入口 */}
              <Link
                to="/backtest"
                className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-component border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-success transition-all"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="text-sm font-medium">回测</span>
              </Link>

              {/* 云同步状态 */}
              <Link
                to="/history"
                className={`hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all ${
                  cloudOnline
                    ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary'
                    : 'bg-bg-component border-border-default text-text-secondary'
                }`}
                title={cloudOnline ? '云端已连接' : '离线模式'}
              >
                {cloudOnline ? (
                  <Cloud className="w-4 h-4" />
                ) : (
                  <CloudOff className="w-4 h-4" />
                )}
              </Link>

              {/* API 状态 */}
              <button
                type="button"
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg border transition-all ${
                  apiConfigured
                    ? 'bg-accent-success/10 border-accent-success/30 text-accent-success'
                    : 'bg-accent-warning/10 border-accent-warning/30 text-accent-warning'
                }`}
                onClick={() => setShowSettings(true)}
                title={apiConfigured ? 'API 已连接' : '无数据连接'}
              >
                {apiConfigured ? (
                  <Wifi className="w-4 h-4" />
                ) : (
                  <WifiOff className="w-4 h-4" />
                )}
                <span className="text-xs font-medium hidden sm:inline">
                  {apiConfigured ? '实时' : '模拟'}
                </span>
              </button>

              {/* 设置（隐藏在移动端，用菜单代替） */}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="hidden sm:block p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-component transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 移动端菜单 */}
      <MobileMenu
        isOpen={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* API 设置面板 */}
      <ApiSettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}
