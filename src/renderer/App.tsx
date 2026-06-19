import { useState } from 'react';
import type { AppStatus } from '../shared/api';

// 应用状态调试卡：演示 React 组件通过 window.lolHelper 调 IPC。
// Warm Paper Dashboard 风：纸感网格背景 + 暖白卡片 + 方正小圆角 + 橙主按钮。
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      // window.lolHelper 由 preload 暴露 → ipcRenderer.invoke → 主进程 handler
      // 与迁移前完全相同的调用，契约未变
      const result = await window.lolHelper.app.getStatus();
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-grid-bg min-h-screen p-8 text-app-text">
      <div className="mx-auto max-w-md">
        <h1 className="mb-1 text-xl font-bold text-app-text">LOL 助手</h1>
        <p className="mb-6 text-sm text-app-muted">
          暖白纸感工作台 · 点击调用 IPC
        </p>

        <section className="rounded-sm border border-app-border bg-app-surface p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-app-text">
            应用状态
          </div>

          <button
            onClick={handleGetStatus}
            disabled={loading}
            className="rounded-lg bg-app-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors enabled:hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '请求中…' : '获取应用状态'}
          </button>

          {error && (
            <pre className="mt-4 break-all rounded-sm border border-app-danger/40 bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-danger">
              {error}
            </pre>
          )}
          {status && (
            <pre className="mt-4 break-all rounded-sm border border-app-border bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-muted">
              {JSON.stringify(status, null, 2)}
            </pre>
          )}
          {!status && !error && (
            <pre className="mt-4 break-all rounded-sm border border-app-border bg-app-surface-soft p-4 text-sm whitespace-pre-wrap text-app-subtle">
              点击按钮，通过 IPC 向主进程请求应用状态…
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
