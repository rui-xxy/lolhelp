import { AppStatusCard } from '@/components/AppStatusCard';

// 页面根组件：只负责布局（标题 + 容器），不持有业务状态。
// 业务逻辑和 IPC 调用都在 AppStatusCard 里（页面/组件/ui 三层分离）。
export function App() {
  return (
    <div className="app-grid-bg min-h-screen p-8 text-app-text">
      <main className="mx-auto max-w-md">
        <h1 className="mb-1 text-xl font-bold">LOL 助手</h1>
        <p className="mb-6 text-sm text-app-muted">
          暖白纸感工作台 · shadcn 已就绪
        </p>
        <AppStatusCard />
      </main>
    </div>
  );
}
