import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Wifi, WifiOff, Menu, Bot } from 'lucide-react';
import { ApiSettingsPanel } from '../settings/ApiSettingsPanel';
import { MobileMenu } from './MobileMenu';
import { isApiKeyConfigured } from '../../services/api';

interface HeaderProps {
  selectedLeague?: number | null;
  onSelectLeague?: (leagueId: number | null) => void;
}

export function Header({ selectedLeague, onSelectLeague }: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);

  useEffect(() => {
    setApiConfigured(isApiKeyConfigured());
  }, []);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-bg-card/95 backdrop-blur-md border-b border-border-default">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => setShowMobileMenu(true)}
                className="lg:hidden p-2 -ml-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-component transition-all"
              >
                <Menu className="w-5 h-5" />
              </button>
              <Link to="/" className="flex items-center gap-2 group">
                <span className="text-lg sm:text-xl font-black tracking-tight">
                  <span className="text-accent-primary">LIVE</span>
                  <span className="text-text-primary">PRO</span>
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                to="/ai"
                className="hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-bg-component border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-primary transition-all"
              >
                <Bot className="w-4 h-4" />
                <span className="text-sm font-medium hidden md:inline">AI 问答</span>
              </Link>

              <button
                type="button"
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg border transition-all ${
                  apiConfigured
                    ? 'bg-accent-success/10 border-accent-success/30 text-accent-success'
                    : 'bg-accent-warning/10 border-accent-warning/30 text-accent-warning'
                }`}
                onClick={() => setShowSettings(true)}
              >
                {apiConfigured ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                <span className="text-xs font-medium hidden sm:inline">
                  {apiConfigured ? '实时' : '模拟'}
                </span>
              </button>

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

      <MobileMenu
        isOpen={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        onOpenSettings={() => setShowSettings(true)}
      />
      <ApiSettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}
