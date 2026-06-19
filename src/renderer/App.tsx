import { useState } from 'react';
import type { AppStatus } from '../shared/api';

// 应用状态调试卡：演示 React 组件通过 window.lolHelper 调 IPC。
// 样式全部用 Tailwind 工具类 + 自定义 lol-* theme token（见 styles/index.css）。
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
    <div className="min-h-screen bg-lol-bg p-8 text-lol-text">
      <div className="max-w-md">
        <h1 className="mb-1 text-2xl font-bold text-lol-gold">LOL 助手</h1>
        <p className="mb-5 text-sm text-lol-muted">
          Tailwind 已就绪 · 点击调用 IPC
        </p>
        <button
          onClick={handleGetStatus}
          disabled={loading}
          className="rounded bg-lol-gold px-5 py-2.5 font-semibold text-lol-bg transition-colors enabled:hover:bg-lol-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '请求中…' : '获取应用状态'}
        </button>
        {error && (
          <pre className="mt-4 break-all rounded border border-lol-danger/40 bg-lol-panel p-4 text-sm whitespace-pre-wrap text-lol-danger">
            {error}
          </pre>
        )}
        {status && (
          <pre className="mt-4 break-all rounded border border-lol-border bg-lol-panel p-4 text-sm whitespace-pre-wrap text-lol-accent">
            {JSON.stringify(status, null, 2)}
          </pre>
        )}
        {!status && !error && (
          <pre className="mt-4 break-all rounded border border-lol-border bg-lol-panel p-4 text-sm whitespace-pre-wrap text-lol-accent">
            点击按钮，通过 IPC 向主进程请求应用状态…
          </pre>
        )}
      </div>
    </div>
  );
}
