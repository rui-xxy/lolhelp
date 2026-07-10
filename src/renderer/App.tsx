import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe2, Search } from 'lucide-react';
import { AppShell, type ScoutSidebarStatus, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';
import { FollowAccountsDialog, type FollowAccountRequest } from './components/match/FollowAccountsDialog';
import { SavedMatchPickerDialog } from './components/match/SavedMatchPickerDialog';
import {
  loadSavedMatchesState,
  SAVED_MATCHES_CHANGED_EVENT,
  type SavedMatchAccount,
} from './components/match/savedMatchesStore';
import { LiveGamePage } from './components/live/LiveGamePage';
import { ScoutPage } from './components/scout/ScoutPage';
import { ChampionRankingPage } from './components/ranking/ChampionRankingPage';
import { FriendPanel } from './components/FriendPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { AssistPage } from './components/assist/AssistPage';
import { ChatSessionDialog } from './components/chat/ChatSessionDialog';
import { APP_LAYOUT, LOL_REGIONS } from '../shared/constants';

// 页面根组件：持有当前视图状态 + 战绩搜索词 + 大区（搜索框在顶部标题栏）。
const PAGE_TITLES: Record<View, string> = {
  home: '主页',
  matches: '', // 战绩页标题栏放搜索框，标题留空
  live: '',
  scout: '高手雷达',
  ranking: '英雄排行',
  assist: '辅助功能',
};

const EXPANDED_APP_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.friendPanelWidth;
const HIDDEN_APP_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.hiddenFriendPanelWidth;
const FRIEND_PANEL_ANIMATION_MS = 220;
const FOLLOW_ALERTS_READ_STORAGE_KEY = 'lolhelp:follow-alerts-read:v1';

function loadReadFollowAlertIds(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(FOLLOW_ALERTS_READ_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function saveReadFollowAlertIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(FOLLOW_ALERTS_READ_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore localStorage failures; the badge will refresh on the next app session.
  }
}

export function App() {
  const [activeView, setActiveView] = useState<View>('home');
  const [matchSearchName, setMatchSearchName] = useState('');
  const [matchRegion, setMatchRegion] = useState('');
  const [matchSearchTrigger, setMatchSearchTrigger] = useState(0); // 自增触发搜索
  const [livePageTitle, setLivePageTitle] = useState('未进入对局');
  const [currentRegionKey, setCurrentRegionKey] = useState('');
  const [currentRegionName, setCurrentRegionName] = useState('读取大区...');
  const [friendPanelHidden, setFriendPanelHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatSessionsOpen, setChatSessionsOpen] = useState(false);
  const [savedPickerOpen, setSavedPickerOpen] = useState(false);
  const [followAccountsOpen, setFollowAccountsOpen] = useState(false);
  const [followAlertCount, setFollowAlertCount] = useState(0);
  const [followAccountRequest, setFollowAccountRequest] = useState<FollowAccountRequest | null>(null);
  const [savedAccountRequest, setSavedAccountRequest] = useState<{
    account: SavedMatchAccount;
    nonce: number;
  } | null>(null);
  const [scoutSidebarStatus, setScoutSidebarStatus] = useState<ScoutSidebarStatus | null>(null);
  const [scoutPanelMinimized, setScoutPanelMinimized] = useState(false);
  const friendPanelTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const refreshRegion = async () => {
      try {
        const region = await window.lolHelper.lcu.getCurrentRegion();
        if (cancelled) return;
        if (region.name && !region.error) {
          setCurrentRegionKey(region.key ?? '');
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
      className="flex h-8 items-stretch overflow-hidden rounded-md border border-app-border-strong bg-white/75 shadow-[0_1px_2px_rgba(26,28,31,0.06)] transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-app-primary/30 focus-within:bg-white/90 focus-within:shadow-[0_0_0_3px_rgba(255,56,92,0.10),0_5px_18px_rgba(255,56,92,0.16)]"
    >
      <div className="relative flex w-32 shrink-0 items-center border-r border-app-border bg-app-shell/45">
        <Globe2 className="pointer-events-none absolute left-2.5 size-3.5 text-app-primary/75" />
        <select
          value={matchRegion}
          onChange={(e) => setMatchRegion(e.target.value)}
          className="h-full w-full appearance-none bg-transparent py-0 pr-7 pl-7 text-xs font-medium text-app-text outline-none"
        >
          {regions.map((r) => (
            <option key={r.key} value={r.key} title={'description' in r ? r.description : undefined}>
              {formatRegionOption(r)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-app-subtle" />
      </div>
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-app-muted" />
        <input
          type="text"
          value={matchSearchName}
          onChange={(e) => setMatchSearchName(e.target.value)}
          placeholder="名字#编号"
          className="h-full w-48 bg-transparent pr-3 pl-8 text-xs text-app-text placeholder:text-app-subtle outline-none"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 bg-app-primary px-4 text-xs font-semibold text-white transition-colors hover:bg-app-primary-hover"
      >
        查询
      </button>
    </form>
  ) : null;

  // 点击好友查战绩：切到战绩页 + 填入 Riot ID + 触发搜索
  const handleFriendClick = useCallback((riotId: string) => {
    setActiveView('matches');
    setMatchSearchName(riotId);
    setMatchRegion(''); // 好友默认使用已读取到的大区
    // 延迟触发搜索（等视图切换完成）
    setTimeout(() => setMatchSearchTrigger((n) => n + 1), 100);
  }, []);

  const handlePlayerSearch = useCallback((name: string, region?: string) => {
    setMatchSearchName(name);
    setMatchRegion(region ?? '');
    setActiveView('matches');
    setMatchSearchTrigger((n) => n + 1);
  }, []);

  const handleFollowAccount = useCallback((riotId: string, region?: string) => {
    setSavedPickerOpen(false);
    setChatSessionsOpen(false);
    setSettingsOpen(false);
    setFollowAccountsOpen(true);
    setFollowAccountRequest({ riotId, region, nonce: Date.now() });
  }, []);

  const markCurrentFollowAlertsRead = useCallback(async () => {
    try {
      const state = await loadSavedMatchesState();
      saveReadFollowAlertIds(new Set((state.followAlerts ?? []).map((alert) => alert.id)));
      setFollowAlertCount(0);
    } catch {
      setFollowAlertCount(0);
    }
  }, []);

  const refreshFollowAlertCount = useCallback(async () => {
    try {
      const state = await loadSavedMatchesState();
      const alertIds = (state.followAlerts ?? []).map((alert) => alert.id);
      if (followAccountsOpen) {
        saveReadFollowAlertIds(new Set(alertIds));
        setFollowAlertCount(0);
        return;
      }

      const activeIds = new Set(alertIds);
      const readIds = loadReadFollowAlertIds();
      const keptReadIds = new Set(Array.from(readIds).filter((id) => activeIds.has(id)));
      if (keptReadIds.size !== readIds.size) {
        saveReadFollowAlertIds(keptReadIds);
      }
      setFollowAlertCount(alertIds.filter((id) => !keptReadIds.has(id)).length);
    } catch {
      setFollowAlertCount(0);
    }
  }, [followAccountsOpen]);

  useEffect(() => {
    void refreshFollowAlertCount();
    const listener = () => void refreshFollowAlertCount();
    window.addEventListener(SAVED_MATCHES_CHANGED_EVENT, listener);
    window.addEventListener('focus', listener);
    const timer = window.setInterval(listener, 30_000);
    return () => {
      window.removeEventListener(SAVED_MATCHES_CHANGED_EVENT, listener);
      window.removeEventListener('focus', listener);
      window.clearInterval(timer);
    };
  }, [refreshFollowAlertCount]);

  useEffect(() => {
    if (followAccountsOpen) void markCurrentFollowAlertsRead();
  }, [followAccountsOpen, markCurrentFollowAlertsRead]);

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

  const scoutPanelActuallyMinimized = scoutPanelMinimized && scoutSidebarStatus !== null;

  return (
    <AppShell
      title={activeView === 'live' ? livePageTitle : PAGE_TITLES[activeView]}
      activeView={activeView}
      onNavigate={setActiveView}
      fullBleed={activeView === 'matches' || activeView === 'live' || activeView === 'scout' || activeView === 'ranking' || activeView === 'assist'}
      headerExtra={matchSearchBar}
      friendPanelHidden={friendPanelHidden}
      onToggleFriendPanel={toggleFriendPanelHidden}
      chatSessionsOpen={chatSessionsOpen}
      savedMatchesOpen={savedPickerOpen}
      followAccountsOpen={followAccountsOpen}
      followAlertCount={followAlertCount}
      scoutStatus={scoutPanelActuallyMinimized ? scoutSidebarStatus : null}
      onScoutPlayerSearch={handlePlayerSearch}
      onScoutStatusClick={() => {
        setActiveView('scout');
        setScoutPanelMinimized(false);
      }}
      onOpenSavedMatches={() => {
        setChatSessionsOpen(false);
        setSettingsOpen(false);
        setFollowAccountsOpen(false);
        setSavedPickerOpen(true);
      }}
      onOpenFollowAccounts={() => {
        setSavedPickerOpen(false);
        setChatSessionsOpen(false);
        setSettingsOpen(false);
        setFollowAccountsOpen(true);
        void markCurrentFollowAlertsRead();
      }}
      onOpenChatSessions={() => {
        setSavedPickerOpen(false);
        setFollowAccountsOpen(false);
        setSettingsOpen(false);
        setChatSessionsOpen(true);
      }}
      onOpenSettings={() => {
        setSavedPickerOpen(false);
        setChatSessionsOpen(false);
        setFollowAccountsOpen(false);
        setSettingsOpen(true);
      }}
      settingsOpen={settingsOpen}
      friendPanel={
        <FriendPanel
          onFriendClick={handleFriendClick}
          onFriendFollow={handleFollowAccount}
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
          currentRegionKey={currentRegionKey}
          currentRegionName={currentRegionName}
          savedAccountRequest={savedAccountRequest}
          onPlayerSearch={handlePlayerSearch}
        />
      </div>
      <div className={activeView === 'live' ? 'h-full' : 'hidden'}>
        <LiveGamePage onTitleChange={setLivePageTitle} />
      </div>
      <div className={activeView === 'scout' ? 'h-full' : 'hidden'}>
        <ScoutPage
          currentRegionName={currentRegionName}
          onPlayerSearch={handlePlayerSearch}
          onStatusChange={setScoutSidebarStatus}
          configPanelMinimized={scoutPanelActuallyMinimized}
          onConfigPanelMinimize={() => setScoutPanelMinimized(true)}
        />
      </div>
      <div className={activeView === 'ranking' ? 'h-full' : 'hidden'}>
        <ChampionRankingPage />
      </div>
      <div className={activeView === 'assist' ? 'h-full' : 'hidden'}>
        <AssistPage
          onPlayerSearch={handlePlayerSearch}
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
      <FollowAccountsDialog
        open={followAccountsOpen}
        onClose={() => setFollowAccountsOpen(false)}
        currentRegionKey={currentRegionKey}
        currentRegionName={currentRegionName}
        request={followAccountRequest}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </AppShell>
  );
}
