import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { AppShell, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';
import { LiveGamePage } from './components/live/LiveGamePage';
import { ScoutPage } from './components/scout/ScoutPage';
import { FriendPanel } from './components/FriendPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { APP_LAYOUT, LOL_REGIONS } from '../shared/constants';

// 页面根组件：持有当前视图状态 + 战绩搜索词 + 大区（搜索框在顶部标题栏）。
const PAGE_TITLES: Record<View, string> = {
  home: '主页',
  matches: '', // 战绩页标题栏放搜索框，标题留空
  live: '实时对局',
  scout: '高手雷达',
};

const EXPANDED_APP_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.friendPanelWidth;
const HIDDEN_APP_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.hiddenFriendPanelWidth;
const FRIEND_PANEL_ANIMATION_MS = 220;

export function App() {
  const [activeView, setActiveView] = useState<View>('home');
  const [matchSearchName, setMatchSearchName] = useState('');
  const [matchRegion, setMatchRegion] = useState('');
  const [matchSearchTrigger, setMatchSearchTrigger] = useState(0); // 自增触发搜索
  const [currentRegionName, setCurrentRegionName] = useState('读取大区...');
  const [friendPanelHidden, setFriendPanelHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const friendPanelTimerRef = useRef<number | null>(null);

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

  const regions = [{ key: '', name: currentRegionName }, ...LOL_REGIONS];

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

  const setWindowWidth = useCallback((width: number) => {
    void window.lolHelper.window.setWidth(width).catch((err) => {
      console.error('[friend] 设置好友栏窗口宽度失败:', err);
    });
  }, []);

  useEffect(() => {
    setWindowWidth(EXPANDED_APP_WIDTH);
    return () => {
      if (friendPanelTimerRef.current !== null) {
        window.clearTimeout(friendPanelTimerRef.current);
      }
    };
  }, [setWindowWidth]);

  const toggleFriendPanelHidden = useCallback(() => {
    if (friendPanelTimerRef.current !== null) {
      window.clearTimeout(friendPanelTimerRef.current);
      friendPanelTimerRef.current = null;
    }

    if (friendPanelHidden) {
      setWindowWidth(EXPANDED_APP_WIDTH);
      friendPanelTimerRef.current = window.setTimeout(() => {
        setFriendPanelHidden(false);
        friendPanelTimerRef.current = null;
      }, 40);
      return;
    }

    setFriendPanelHidden(true);
    friendPanelTimerRef.current = window.setTimeout(() => {
      setWindowWidth(HIDDEN_APP_WIDTH);
      friendPanelTimerRef.current = null;
    }, FRIEND_PANEL_ANIMATION_MS);
  }, [friendPanelHidden, setWindowWidth]);

  return (
    <AppShell
      title={PAGE_TITLES[activeView]}
      onNavigate={setActiveView}
      fullBleed={activeView === 'matches' || activeView === 'live' || activeView === 'scout'}
      headerExtra={matchSearchBar}
      friendPanelHidden={friendPanelHidden}
      onToggleFriendPanel={toggleFriendPanelHidden}
      onOpenSettings={() => setSettingsOpen(true)}
      friendPanel={
        <FriendPanel
          onFriendClick={handleFriendClick}
        />
      }
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
      <div className={activeView === 'live' ? 'h-full' : 'hidden'}>
        <LiveGamePage />
      </div>
      <div className={activeView === 'scout' ? 'h-full' : 'hidden'}>
        <ScoutPage
          onPlayerSearch={(name) => {
            setMatchSearchName(name);
            setActiveView('matches');
            setMatchSearchTrigger((n) => n + 1);
          }}
        />
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AppShell>
  );
}
