import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';
import { initAppearance } from './lib/appearance';

// React 入口：把 <App /> 挂到 index.html 的 <div id="app">。
// StrictMode 开发期双调组件帮助发现副作用问题，生产构建自动移除。
// 先套上保存的外观（深浅色、配色、微光），再渲染，避免启动时闪一下默认色。
initAppearance();

const rootElement = document.getElementById('app');
if (!rootElement) {
  throw new Error('找不到 #app 挂载点，检查 index.html');
}

// 最外层兜底：任何没接住的渲染错误都显示出错页，而不是整个窗口白屏
function AppCrashScreen({ error }: { error: Error }) {
  return (
    <div className="grid h-screen place-items-center bg-app-bg p-8 text-text-1">
      <div className="grid max-w-[520px] gap-3">
        <h1 className="text-section font-semibold">界面出错了</h1>
        <p className="text-body text-text-3">
          可以先重新加载试试；如果刚更新过代码，请把应用完全关掉再打开一次。
        </p>
        <pre className="max-h-40 overflow-auto rounded-md bg-ink-2 p-3 text-meta whitespace-pre-wrap text-text-2 shadow-ui-inset-line">
          {error.message}
        </pre>
        <div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-9 rounded-md bg-app-primary px-4 text-body font-medium text-app-primary-foreground"
          >
            重新加载
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary label="应用" fallback={(error) => <AppCrashScreen error={error} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
