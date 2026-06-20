import { useState } from 'react';
import { AppShell, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';

// 页面根组件：持有当前视图状态，根据视图渲染对应页面，把状态和导航回调传给 AppShell。
// 视图状态提升到这里（不在 AppShell 内部），让 AppShell 只管布局，App 管视图映射。
const PAGE_TITLES: Record<View, string> = {
  home: '主页',
  matches: '战绩',
};

export function App() {
  const [activeView, setActiveView] = useState<View>('home');

  return (
    <AppShell
      title={PAGE_TITLES[activeView]}
      activeView={activeView}
      onNavigate={setActiveView}
      fullBleed={activeView === 'matches'}
    >
      <div className={activeView === 'home' ? '' : 'hidden'}>
        <HomePage />
      </div>
      <div className={activeView === 'matches' ? 'h-full' : 'hidden'}>
        <MatchHistoryPage />
      </div>
    </AppShell>
  );
}
