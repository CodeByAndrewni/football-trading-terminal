// ============================================
// 足球交易决策终端 - 主应用
// ============================================

import { Component, Suspense, lazy } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ToastProvider } from './components/ui/Toast';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center p-6">
          <div className="max-w-lg text-center space-y-4">
            <div className="text-red-400 text-lg font-semibold">页面渲染出错</div>
            <div className="text-gray-400 text-sm font-mono bg-gray-900 rounded p-3 text-left whitespace-pre-wrap break-all">
              {this.state.error.message}
            </div>
            <button
              type="button"
              className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-500 text-sm"
              onClick={() => this.setState({ error: null })}
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 路由级代码分割
const HomePage = lazy(() => import('./pages/HomePage'));
const MatchDetailPage = lazy(() => import('./pages/MatchDetailPage'));
const AiChatPage = lazy(() => import('./pages/AiChatPage'));
const PaperTradePage = lazy(() => import('./pages/PaperTradePage'));

// 加载中显示
function PageLoading() {
  return (
    <div className="min-h-screen bg-[#0a0f14] flex items-center justify-center">
      <div className="text-cyan-400 text-lg animate-pulse">Loading...</div>
    </div>
  );
}

function App() {

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Suspense fallback={<PageLoading />}>
              <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/match/:matchId" element={<MatchDetailPage />} />
            <Route path="/ai" element={<AiChatPage />} />
            <Route path="/paper-trade" element={<PaperTradePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
