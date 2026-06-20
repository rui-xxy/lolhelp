import { AppShell } from '@/components/AppShell';
import { AppStatusCard } from '@/components/AppStatusCard';

// 页面根组件：用 AppShell 外壳包裹内容。
// AppShell 管布局（顶部+侧边栏+主区），这里只传标题和主区内容。
export function App() {
  return (
    <AppShell title="工作台">
      <h1 className="mb-1 text-xl font-bold">LOL 助手</h1>
      <p className="mb-6 text-sm text-app-muted">
        工作台已就绪 · 点击调用 IPC
      </p>
      <AppStatusCard />
    </AppShell>
  );
}
