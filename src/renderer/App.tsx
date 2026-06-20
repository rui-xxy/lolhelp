import { useState } from 'react';
import { Search } from 'lucide-react';
import { AppShell, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';

// 页面根组件：持有当前视图状态 + 战绩搜索词 + 大区（搜索框在顶部标题栏）。
const PAGE_TITLES: Record<View, string> = {
  home: '主页',
  matches: '', // 战绩页标题栏放搜索框，标题留空
};

// 国服大区列表（与 src/main/sgp/region.ts 同步）
const REGIONS = [
  { key: '', name: '本区' },
  { key: 'HN1', name: '艾欧尼亚' },
  { key: 'HN10', name: '黑色玫瑰' },
  { key: 'TJ100', name: '比尔吉沃特' },
  { key: 'NJ100', name: '祖安' },
  { key: 'GZ100', name: '诺克萨斯' },
  { key: 'TJ101', name: '德玛西亚' },
  { key: 'CQ100', name: '班德尔城' },
  { key: 'BGP2', name: '峡谷之巅' },
];

export function App() {
  const [activeView, setActiveView] = useState<View>('home');
  const [matchSearchName, setMatchSearchName] = useState('');
  const [matchRegion, setMatchRegion] = useState('');
  const [matchSearchTrigger, setMatchSearchTrigger] = useState(0); // 自增触发搜索

  // 战绩搜索框 + 大区选择器（仅在战绩视图显示，渲染到 AppShell 顶部标题栏左侧）
  const matchSearchBar = activeView === 'matches' ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMatchSearchTrigger((n) => n + 1);
      }}
      className="flex items-center gap-2"
    >
      <select
        value={matchRegion}
        onChange={(e) => setMatchRegion(e.target.value)}
        className="h-8 rounded-sm border border-app-border bg-app-surface-soft px-2 text-xs text-app-text focus:border-app-primary focus:outline-none"
      >
        {REGIONS.map((r) => (
          <option key={r.key} value={r.key}>{r.name}</option>
        ))}
      </select>
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-app-subtle" />
        <input
          type="text"
          value={matchSearchName}
          onChange={(e) => setMatchSearchName(e.target.value)}
          placeholder="名字#数字（留空查自己）"
          className="h-8 w-56 rounded-sm border border-app-border bg-app-surface-soft pr-3 pl-8 text-xs text-app-text placeholder:text-app-subtle focus:border-app-primary focus:bg-app-surface focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="h-8 rounded-sm bg-app-primary px-3 text-xs font-medium text-white transition-colors hover:bg-app-primary-hover"
      >
        查询
      </button>
    </form>
  ) : null;

  return (
    <AppShell
      title={PAGE_TITLES[activeView]}
      activeView={activeView}
      onNavigate={setActiveView}
      fullBleed={activeView === 'matches'}
      headerExtra={matchSearchBar}
    >
      <div className={activeView === 'home' ? '' : 'hidden'}>
        <HomePage />
      </div>
      <div className={activeView === 'matches' ? 'h-full' : 'hidden'}>
        <MatchHistoryPage
          searchName={matchSearchName}
          searchTrigger={matchSearchTrigger}
          region={matchRegion}
          onPlayerSearch={(name) => {
            setMatchSearchName(name);
            setActiveView('matches');
            setMatchSearchTrigger((n) => n + 1);
          }}
        />
      </div>
    </AppShell>
  );
}
