// ============================================
// 移动端菜单组件
// ============================================

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, Home, Swords, CornerUpRight, Settings, Wifi, WifiOff, BarChart3, FileText } from 'lucide-react';
import { isApiKeyConfigured } from '../../services/api';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function MobileMenu({ isOpen, onClose, onOpenSettings }: MobileMenuProps) {
  const location = useLocation();
  const apiConfigured = isApiKeyConfigured();

  // 禁止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  const navItems = [
    { path: '/', label: '比赛大厅', icon: Home },
    { path: '/battle', label: '作战室', icon: Swords, highlight: true },
    { path: '/review', label: '复盘台', icon: FileText },
    { path: '/corners', label: '角球分析', icon: CornerUpRight },
    { path: '/backtest', label: '盘口回测', icon: BarChart3 },
  ];

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="drawer-overlay animate-fade-in"
        onClick={onClose}
      />

      {/* 抽屉内容 */}
      <div className="drawer-content animate-slide-right">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight">
              <span className="text-accent-primary">LIVE</span>
              <span className="text-text-primary">PRO</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-component transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 导航链接 */}
        <nav className="p-4 space-y-2">
          {navItems.map(({ path, label, icon: Icon, highlight }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-accent-primary/10 text-accent-primary border-l-2 border-accent-primary'
                    : highlight
                    ? 'text-accent-danger bg-accent-danger/5 hover:bg-accent-danger/10'
                    : 'text-text-secondary hover:bg-bg-component hover:text-text-primary'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 分隔线 */}
        <div className="mx-4 border-t border-border-default" />

        {/* API 状态 */}
        <div className="p-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all ${
              apiConfigured
                ? 'bg-accent-success/10 text-accent-success'
                : 'bg-accent-warning/10 text-accent-warning'
            }`}
          >
            {apiConfigured ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            <div className="text-left">
              <p className="font-medium">{apiConfigured ? '实时数据' : '无数据'}</p>
              <p className="text-xs opacity-70">点击配置 API</p>
            </div>
          </button>
        </div>

        {/* 设置按钮 */}
        <div className="p-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-text-secondary hover:bg-bg-component hover:text-text-primary transition-all"
          >
            <Settings className="w-5 h-5" />
            <span className="font-medium">设置</span>
          </button>
        </div>

        {/* 底部版本信息 */}
        <div className="absolute bottom-0 left-0 right-0 p-4 text-center text-xs text-text-muted border-t border-border-default">
          <p>Football Trading Terminal</p>
          <p>v3.3.0</p>
        </div>
      </div>
    </>
  );
}
