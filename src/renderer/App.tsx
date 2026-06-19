import { useState } from 'react';
import type { AppStatus } from '../shared/api';

// 应用状态调试卡：演示 React 组件通过 window.lolHelper 调 IPC。
// 是原 main.ts 里 innerHTML 逻辑的 React 版本，功能完全等价，写法从命令式变声明式。
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
    <div className="container">
      <h1>LOL 助手</h1>
      <p className="hint">React 已就绪 · 点击调用 IPC</p>
      <button onClick={handleGetStatus} disabled={loading}>
        {loading ? '请求中…' : '获取应用状态'}
      </button>
      {error && <pre className="status-output error">{error}</pre>}
      {status && (
        <pre className="status-output">{JSON.stringify(status, null, 2)}</pre>
      )}
      {!status && !error && (
        <pre className="status-output">点击按钮，通过 IPC 向主进程请求应用状态…</pre>
      )}
    </div>
  );
}
