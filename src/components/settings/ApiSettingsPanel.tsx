// ============================================
// API 设置面板
// ============================================

import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { checkAPIStatus, isApiKeyConfigured } from '../../services/api';

interface ApiSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiSettingsPanel({ isOpen, onClose }: ApiSettingsPanelProps) {
  const [status, setStatus] = useState<{ ok: boolean; message: string; remaining?: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    const result = await checkAPIStatus();
    setStatus(result);
    setChecking(false);
  };

  useEffect(() => {
    if (isOpen) {
      setChecking(true);
      checkAPIStatus().then(result => {
        setStatus(result);
        setChecking(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfigured = isApiKeyConfigured();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 面板 */}
      <div className="relative bg-bg-card border border-border-default rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-border-default">
          <h2 className="text-lg font-semibold text-text-primary">API 设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-component transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-6">
          {/* API 状态 */}
          <div className="bg-bg-component rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-text-secondary">API 连接状态</span>
              <button
                type="button"
                onClick={checkStatus}
                disabled={checking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-bg-card border border-border-default text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                <span>刷新</span>
              </button>
            </div>

            {status ? (
              <div className="flex items-center gap-3">
                {status.ok ? (
                  <CheckCircle className="w-6 h-6 text-accent-success" />
                ) : (
                  <XCircle className="w-6 h-6 text-accent-danger" />
                )}
                <div>
                  <p className={`font-medium ${status.ok ? 'text-accent-success' : 'text-accent-danger'}`}>
                    {status.message}
                  </p>
                  {status.remaining !== undefined && (
                    <p className="text-xs text-text-muted mt-0.5">
                      今日剩余请求: <span className="font-mono text-text-primary">{status.remaining}</span>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-text-muted border-t-accent-primary animate-spin" />
                <span className="text-text-secondary">检测中...</span>
              </div>
            )}
          </div>

          {/* 配置说明 */}
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-accent-primary/10 border border-accent-primary/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-accent-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-text-primary mb-1">如何配置 API Key</p>
                <ol className="text-xs text-text-secondary space-y-1.5 list-decimal list-inside">
                  <li>访问 <a href="https://www.api-football.com/" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">api-football.com</a> 注册账号</li>
                  <li>获取你的 API Key</li>
                  <li>在项目根目录创建 <code className="px-1.5 py-0.5 bg-bg-component rounded text-accent-primary">.env</code> 文件</li>
                  <li>添加: <code className="px-1.5 py-0.5 bg-bg-component rounded text-accent-primary">VITE_FOOTBALL_API_KEY=你的Key</code></li>
                  <li>重启开发服务器</li>
                </ol>
              </div>
            </div>

            {/* 当前状态 */}
            <div className="flex items-center justify-between p-4 bg-bg-component rounded-xl">
              <span className="text-sm text-text-secondary">API Key 配置状态</span>
              {isConfigured ? (
                <span className="flex items-center gap-1.5 text-accent-success text-sm">
                  <CheckCircle className="w-4 h-4" />
                  已配置
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-accent-warning text-sm">
                  <AlertCircle className="w-4 h-4" />
                  未配置（无数据）
                </span>
              )}
            </div>

            {/* API 文档链接 */}
            <a
              href="https://www.api-football.com/documentation-v3"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-3 bg-bg-component rounded-xl text-text-secondary hover:text-accent-primary transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="text-sm">查看 API-Football 文档</span>
            </a>
          </div>
        </div>

        {/* 底部 */}
        <div className="p-6 border-t border-border-default bg-bg-deepest/50">
          <p className="text-xs text-text-muted text-center">
            免费版每日限制 100 次请求 · 支持全球 800+ 联赛
          </p>
        </div>
      </div>
    </div>
  );
}
