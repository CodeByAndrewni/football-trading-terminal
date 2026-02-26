// ============================================
// 足球交易决策终端 - 主布局
// ============================================

import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Header } from './Header';

export function Layout() {
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-bg-deepest bg-grid">
      <Header
        selectedLeague={selectedLeague}
        onSelectLeague={setSelectedLeague}
      />
      <main className="pt-14 min-h-screen">
        <Outlet context={{ selectedLeague, setSelectedLeague }} />
      </main>
    </div>
  );
}

// 导出 context 类型
export interface LayoutContext {
  selectedLeague: number | null;
  setSelectedLeague: (id: number | null) => void;
}
