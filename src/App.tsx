// ============================================
// 足球交易决策终端 - 主应用
// ============================================

import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ToastProvider } from './components/ui/Toast';
import { initDataSync } from './services/dataSyncService';

// 路由级代码分割
const HomePage = lazy(() => import('./pages/HomePage'));
const MatchDetailPage = lazy(() => import('./pages/MatchDetailPage'));
const CornerAnalysisPage = lazy(() => import('./pages/CornerAnalysisPage'));
const CornersLandingPage = lazy(() => import('./pages/CornersLandingPage'));
const BacktestPage = lazy(() => import('./pages/BacktestPage'));
const LateModuleBacktestPage = lazy(() => import('./pages/LateModuleBacktestPage'));
const TerminalPage = lazy(() => import('./pages/TerminalPage'));
const BattleRoomPage = lazy(() => import('./pages/BattleRoomPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));

// 加载中显示
function PageLoading() {
  return (
    <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center">
      <div className="text-cyan-400 text-lg animate-pulse">Loading...</div>
    </div>
  );
}

function App() {
  // 初始化数据同步服务
  useEffect(() => {
    initDataSync().catch(console.error);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoading />}>
            <Routes>
            {/* 首页 - 比赛大厅（独立布局） */}
            <Route path="/" element={<HomePage />} />

            {/* 比赛详情页 */}
            <Route path="/match/:matchId" element={<MatchDetailPage />} />

            {/* 角球分析入口页 */}
            <Route path="/corners" element={<CornersLandingPage />} />

            {/* 角球分析详情页 */}
            <Route path="/corners/:matchId" element={<CornerAnalysisPage />} />

            {/* 盘口分析回测 */}
            <Route path="/backtest" element={<BacktestPage />} />

            {/* 晚期模块大规模回测 */}
            <Route path="/backtest/late" element={<LateModuleBacktestPage />} />

            {/* 终端模式 */}
            <Route path="/terminal" element={<TerminalPage />} />

            {/* 作战室 - 保留但不在主导航显示，可通过URL直接访问 */}
            <Route path="/battle" element={<BattleRoomPage />} />

            {/* 复盘台 */}
            <Route path="/review" element={<ReviewPage />} />

            {/* 历史比赛页 */}
            <Route path="/history" element={<HistoryPage />} />

            {/* 旧路由重定向 */}
            <Route path="/monitor" element={<Navigate to="/battle" replace />} />
            <Route path="/radar" element={<Navigate to="/battle" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
