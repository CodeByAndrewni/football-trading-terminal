// ============================================
// 移动端底部导航栏
// ============================================

import { Link, useLocation } from 'react-router-dom';
import { Home, Monitor, CornerUpRight, Radar, Settings } from 'lucide-react';

interface BottomNavProps {
  onOpenSettings?: () => void;
}

export function BottomNav({ onOpenSettings }: BottomNavProps) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '大厅', icon: Home },
    { path: '/monitor', label: '监控', icon: Monitor },
    { path: '/corners', label: '角球', icon: CornerUpRight },
    { path: '/radar', label: '雷达', icon: Radar },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bottom-nav lg:hidden">
      <div className="flex items-center justify-around h-14 px-2">
        {navItems.map(({ path, label, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              isActive(path)
                ? 'text-accent-primary'
                : 'text-text-muted'
            }`}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}

        {/* 设置按钮 */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex flex-col items-center justify-center flex-1 h-full text-text-muted transition-colors"
          >
            <Settings className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">设置</span>
          </button>
        )}
      </div>
    </nav>
  );
}
