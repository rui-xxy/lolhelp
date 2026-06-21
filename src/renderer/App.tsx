import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { AppShell, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';
import { FriendPanel } from './components/FriendPanel';

// 页面根组件：持有当前视图状态 + 战绩搜索词 + 大区（搜索框在顶部标题栏）。
const PAGE_TITLES: Record<View, string> = {
  home: '主页',
  matches: '', // 战绩页标题栏放搜索框，标题留空
};

// 国服大区列表（与 src/main/sgp/region.ts 同步）
const BASE_REGIONS = [
  { key: 'HN1', name: '艾欧尼亚' },
  { key: 'HN2', name: '祖安' },
  { key: 'HN3', name: '诺克萨斯' },
  { key: 'HN4', name: '班德尔城' },
  { key: 'HN5', name: '皮尔特沃夫' },
  { key: 'HN6', name: '战争学院' },
  { key: 'HN7', name: '巨神峰' },
  { key: 'HN8', name: '雷瑟守备' },
  { key: 'HN9', name: '裁决之地' },
  { key: 'HN10', name: '黑色玫瑰' },
  { key: 'HN11', name: '暗影岛' },
  { key: 'HN12', name: '钢铁烈阳' },
  { key: 'HN13', name: '水晶之痕' },
  { key: 'HN14', name: '均衡教派' },
  { key: 'HN15', name: '扭曲丛林' },
  { key: 'HN16', name: '教育网专区' },
  { key: 'HN17', name: '蛮荒之地' },
  { key: 'HN18', name: '恕瑞玛' },
  { key: 'HN19', name: '皮城警备' },
  { key: 'BGP1', name: '男爵领域' },
  { key: 'BGP2', name: '峡谷之巅' },
  { key: 'WT1', name: '网通一区' },
  { key: 'NJ100', name: '联盟一区' },
  { key: 'GZ100', name: '联盟二区' },
  { key: 'CQ100', name: '联盟三区' },
  { key: 'TJ100', name: '联盟四区' },
  { key: 'TJ101', name: '联盟五区' },
];

export function App() {
  const [activeView, setActiveView] = useState<View>('home');
  const [matchSearchName, setMatchSearchName] = useState('');
  const [matchRegion, setMatchRegion] = useState('');
  const [matchSearchTrigger, setMatchSearchTrigger] = useState(0); // 自增触发搜索
  const [currentRegionName, setCurrentRegionName] = useState('读取大区...');

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const refreshRegion = async () => {
      try {
        const region = await window.lolHelper.lcu.getCurrentRegion();
        if (cancelled) return;
        if (region.name && !region.error) {
          setCurrentRegionName(region.name);
          return;
        }
      } catch {
        // 等下一轮重试。这里不展示错误文案，避免标题栏出现“未知大区”。
      }

      if (!cancelled) {
        retryTimer = window.setTimeout(refreshRegion, 2500);
      }
    };

    void refreshRegion();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [activeView]);

  const regions = [{ key: '', name: currentRegionName }, ...BASE_REGIONS];

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
        {regions.map((r) => (
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

  // 点击好友查战绩：切到战绩页 + 填入 Riot ID + 触发搜索
  const handleFriendClick = useCallback((riotId: string) => {
    setActiveView('matches');
    setMatchSearchName(riotId);
    setMatchRegion(''); // 好友默认本区
    // 延迟触发搜索（等视图切换完成）
    setTimeout(() => setMatchSearchTrigger((n) => n + 1), 100);
  }, []);

  return (
    <AppShell
      title={PAGE_TITLES[activeView]}
      onNavigate={setActiveView}
      fullBleed={activeView === 'matches'}
      headerExtra={matchSearchBar}
      friendPanel={<FriendPanel onFriendClick={handleFriendClick} />}
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
