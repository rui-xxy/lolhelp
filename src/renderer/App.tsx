import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe2, Search } from 'lucide-react';
import { AppShell, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';
import { SavedMatchPickerDialog } from './components/match/SavedMatchPickerDialog';
import type { SavedMatchAccount } from './components/match/savedMatchesStore';
import { LiveGamePage } from './components/live/LiveGamePage';
import { ScoutPage } from './components/scout/ScoutPage';
import { FriendPanel } from './components/FriendPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { AssistPage } from './components/assist/AssistPage';
import { ChatSessionDialog } from './components/chat/ChatSessionDialog';
import { APP_LAYOUT, LOL_REGIONS } from '../shared/constants';

// 页面根组件：持有当前视图状态 + 战绩搜索词 + 大区（搜索框在顶部标题栏）。
const PAGE_TITLES: Record<View, string> = {
  home: '主页',
  matches: '', // 战绩页标题栏放搜索框，标题留空
  live: '实时对局',
  scout: '高手雷达',
  assist: '辅助功能',
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
  const [chatSessionsOpen, setChatSessionsOpen] = useState(false);
  const [savedPickerOpen, setSavedPickerOpen] = useState(false);
  const [savedAccountRequest, setSavedAccountRequest] = useState<{
    account: SavedMatchAccount;
    nonce: number;
  } | null>(null);
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
  const formatRegionOption = (region: (typeof regions)[number]) => region.name;

  // 战绩搜索框 + 大区选择器（仅在战绩视图显示，渲染到 AppShell 顶部标题栏左侧）
  const matchSearchBar = activeView === 'matches' ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMatchSearchTrigger((n) => n + 1);
      }}
      className="flex h-9 items-center gap-1.5 rounded-full border border-app-primary/20 bg-app-surface-soft/95 p-1 shadow-sm shadow-app-primary/5 ring-1 ring-white/70"
    >
      <div className="relative flex h-7 w-32 shrink-0 items-center">
        <Globe2 className="pointer-events-none absolute left-2.5 size-3.5 text-app-primary" />
        <select
          value={matchRegion}
          onChange={(e) => setMatchRegion(e.target.value)}
          className="h-7 w-full appearance-none rounded-full border border-app-border/70 bg-app-surface py-0 pr-7 pl-7 text-xs font-medium text-app-text outline-none transition-colors hover:border-app-primary/40 focus:border-app-primary focus:ring-2 focus:ring-app-primary/15"
        >
          {regions.map((r) => (
            <option key={r.key} value={r.key} title={'description' in r ? r.description : undefined}>
              {formatRegionOption(r)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-app-subtle" />
      </div>
      <div className="h-5 w-px shrink-0 bg-app-border" />
      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-app-primary" />
        <input
          type="text"
          value={matchSearchName}
          onChange={(e) => setMatchSearchName(e.target.value)}
          placeholder="名字#编号"
          className="h-7 w-48 rounded-full border border-transparent bg-transparent pr-3 pl-8 text-xs text-app-text placeholder:text-app-subtle outline-none transition-colors focus:border-app-primary/25 focus:bg-app-surface"
        />
      </div>
      <button
        type="submit"
        className="h-7 shrink-0 rounded-full bg-gradient-to-r from-app-primary to-[#ff6b85] px-4 text-xs font-semibold text-white shadow-sm shadow-app-primary/25 transition-all hover:-translate-y-px hover:shadow-md hover:shadow-app-primary/25 active:translate-y-0"
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
      fullBleed={activeView === 'matches' || activeView === 'live' || activeView === 'scout' || activeView === 'assist'}
      headerExtra={matchSearchBar}
      friendPanelHidden={friendPanelHidden}
      onToggleFriendPanel={toggleFriendPanelHidden}
      chatSessionsOpen={chatSessionsOpen}
      savedMatchesOpen={savedPickerOpen}
      onOpenSavedMatches={() => {
        setChatSessionsOpen(false);
        setSettingsOpen(false);
        setSavedPickerOpen(true);
      }}
      onOpenChatSessions={() => {
        setSavedPickerOpen(false);
        setSettingsOpen(false);
        setChatSessionsOpen(true);
      }}
      onOpenSettings={() => {
        setSavedPickerOpen(false);
        setChatSessionsOpen(false);
        setSettingsOpen(true);
      }}
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
          savedAccountRequest={savedAccountRequest}
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
          onPlayerSearch={(name, region) => {
            setMatchSearchName(name);
            setMatchRegion(region ?? '');
            setActiveView('matches');
            setMatchSearchTrigger((n) => n + 1);
          }}
        />
      </div>
      <div className={activeView === 'assist' ? 'h-full' : 'hidden'}>
        <AssistPage
          onPlayerSearch={(riotId, region) => {
            setMatchSearchName(riotId);
            setMatchRegion(region ?? '');
            setActiveView('matches');
            setMatchSearchTrigger((n) => n + 1);
          }}
        />
      </div>
      <ChatSessionDialog
        open={chatSessionsOpen}
        onClose={() => setChatSessionsOpen(false)}
      />
      <SavedMatchPickerDialog
        open={savedPickerOpen}
        onClose={() => setSavedPickerOpen(false)}
        onSelect={(account) => {
          setActiveView('matches');
          setSavedAccountRequest({ account, nonce: Date.now() });
        }}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AppShell>
  );
}
