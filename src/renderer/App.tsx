import { Activity, memo, useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { AppShell, type ScoutSidebarStatus, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';
import { type MatchRegionOption } from './components/match/MatchRegionPicker';
import { FollowAccountsDialog, type FollowAccountRequest } from './components/match/FollowAccountsDialog';
import { SavedMatchPickerDialog } from './components/match/SavedMatchPickerDialog';
import {
  loadSavedMatchesSummary,
  SAVED_MATCHES_CHANGED_EVENT,
  type SavedMatchAccount,
} from './components/match/savedMatchesStore';
import { LiveGamePage } from './components/live/LiveGamePage';
import { ScoutPage } from './components/scout/ScoutPage';
import { ChampionRankingPage, type RankingChapter } from './components/ranking/ChampionRankingPage';
import { FriendPanel } from './components/FriendPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { AssistPage } from './components/assist/AssistPage';
import { ChatSessionDialog } from './components/chat/ChatSessionDialog';
import { FriendManagerDialog } from './components/friends/FriendManagerDialog';
import { GlobalSearch, type GlobalSearchHandle } from './components/shell/GlobalSearch';
import { Segmented } from './components/ui/kit';
import {
  createAcceptedAlerts,
  loadFriendAcceptedAlerts,
  loadTrackedOutgoingRequests,
  mergeAcceptedAlerts,
  saveFriendAcceptedAlerts,
  saveTrackedOutgoingRequests,
} from './components/friends/friendRequestTracking';
import { APP_LAYOUT, LOL_REGIONS } from '../shared/constants';

const PAGE_TITLES: Record<View, string> = {
  home: '首页',
  matches: '战绩',
  live: '对局',
  scout: '高手雷达',
  ranking: '数据',
  assist: '助手',
  settings: '设置',
};

const StableHomePage = memo(HomePage);
const StableMatchHistoryPage = memo(MatchHistoryPage);
const StableLiveGamePage = memo(LiveGamePage);
const StableScoutPage = memo(ScoutPage);
const StableChampionRankingPage = memo(ChampionRankingPage);
const StableAssistPage = memo(AssistPage);
const StableFriendPanel = memo(FriendPanel);
const FRIEND_REQUEST_CHECK_INTERVAL_MS = 10_000;
const FOLLOW_ALERTS_READ_STORAGE_KEY = 'lolhelp:follow-alerts-read:v1';
const APP_SESSION_STORAGE_KEY = 'lolhelp:ui-session:v1';
const FRIEND_DRAWER_STORAGE_KEY = 'lolhelp:friend-drawer-open:v1';
const APP_VIEWS: View[] = ['home', 'matches', 'live', 'scout', 'ranking', 'assist', 'settings'];
const RANKING_CHAPTERS: RankingChapter[] = ['mayhem', 'ranking'];

const NATIVE_SELECTABLE_SELECTOR =
  'input, textarea, [contenteditable="true"], [data-selectable="true"], .select-text, pre, code';

function allowsNativeTextSelection(target: EventTarget | Node | null): boolean {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  return Boolean(element?.closest(NATIVE_SELECTABLE_SELECTOR));
}

interface AppSessionState {
  activeView?: View;
  matchSearchName?: string;
  matchRegion?: string;
  rankingChapter?: RankingChapter;
}

function loadAppSessionState(): AppSessionState {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY) ?? '{}') as AppSessionState;
    return {
      activeView: APP_VIEWS.includes(parsed.activeView as View) ? parsed.activeView : undefined,
      matchSearchName: typeof parsed.matchSearchName === 'string' ? parsed.matchSearchName : undefined,
      matchRegion: typeof parsed.matchRegion === 'string' ? parsed.matchRegion : undefined,
      rankingChapter: RANKING_CHAPTERS.includes(parsed.rankingChapter as RankingChapter)
        ? parsed.rankingChapter
        : undefined,
    };
  } catch {
    return {};
  }
}

function loadFriendDrawerOpen(): boolean {
  try {
    const stored = window.localStorage.getItem(FRIEND_DRAWER_STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // 读不到偏好时按窗口宽度决定。
  }
  return window.innerWidth >= APP_LAYOUT.friendDrawerDockMinWidth;
}

function saveFriendDrawerOpen(open: boolean): void {
  try {
    window.localStorage.setItem(FRIEND_DRAWER_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // 偏好只影响下次启动。
  }
}

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

async function showFriendAcceptedNotification(alerts: Array<{ riotId: string }>): Promise<void> {
  if (alerts.length === 0 || !('Notification' in window)) return;
  try {
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const body = alerts.length === 1
      ? `${alerts[0].riotId} 已经通过你的好友申请`
      : `${alerts.length} 位玩家已经通过你的好友申请`;
    new Notification('好友已添加', { body });
  } catch {
    // The toolbar badge remains available when native notifications are disabled.
  }
}

export function App() {
  const [initialSession] = useState(loadAppSessionState);
  const [activeView, setActiveView] = useState<View>(initialSession.activeView ?? 'home');
  const [matchSearchName, setMatchSearchName] = useState(initialSession.matchSearchName ?? '');
  const [matchRegion, setMatchRegion] = useState(initialSession.matchRegion ?? '');
  const [matchSearchTrigger, setMatchSearchTrigger] = useState(
    initialSession.activeView === 'matches' && initialSession.matchSearchName ? 1 : 0,
  ); // 自增触发搜索
  const searchRef = useRef<GlobalSearchHandle>(null);
  const [livePageTitle, setLivePageTitle] = useState('');
  const [currentRegionKey, setCurrentRegionKey] = useState('');
  const [currentRegionName, setCurrentRegionName] = useState('读取大区...');
  const [clientConnected, setClientConnected] = useState(false);
  const [clientSessionId, setClientSessionId] = useState('');
  const [friendDrawerOpen, setFriendDrawerOpen] = useState(loadFriendDrawerOpen);
  const [chatSessionsOpen, setChatSessionsOpen] = useState(false);
  const [savedPickerOpen, setSavedPickerOpen] = useState(false);
  const [followAccountsOpen, setFollowAccountsOpen] = useState(false);
  const [friendManagerOpen, setFriendManagerOpen] = useState(false);
  const [friendAcceptedAlerts, setFriendAcceptedAlerts] = useState(loadFriendAcceptedAlerts);
  const [followAlertCount, setFollowAlertCount] = useState(0);
  const [followAccountRequest, setFollowAccountRequest] = useState<FollowAccountRequest | null>(null);
  const [savedAccountRequest, setSavedAccountRequest] = useState<{
    account: SavedMatchAccount;
    nonce: number;
  } | null>(null);
  const [scoutSidebarStatus, setScoutSidebarStatus] = useState<ScoutSidebarStatus | null>(null);
  const [scoutPanelMinimized, setScoutPanelMinimized] = useState(false);
  const [rankingChapter, setRankingChapter] = useState<RankingChapter>(
    initialSession.rankingChapter ?? 'mayhem',
  );
  const trackedOutgoingRequestsRef = useRef(loadTrackedOutgoingRequests());
  const friendRequestCheckInFlightRef = useRef(false);

  useEffect(() => {
    const clearSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) selection.removeAllRanges();
    };

    const handleSelectStart = (event: Event) => {
      if (allowsNativeTextSelection(event.target)) return;
      event.preventDefault();
      clearSelection();
    };

    const handleSelectionChange = () => {
      // Chromium exposes an input's document selection on its surrounding
      // container, not inside the input. Clearing that selection also clears
      // its caret and can move keyboard focus back to the document.
      if (allowsNativeTextSelection(document.activeElement)) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      if (allowsNativeTextSelection(selection.anchorNode) && allowsNativeTextSelection(selection.focusNode)) {
        return;
      }
      clearSelection();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (allowsNativeTextSelection(event.target)) return;
      clearSelection();
    };

    const handleNativeDragStart = (event: DragEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        event.preventDefault();
        return;
      }
      if (target.closest('[data-native-drag="true"]')) return;
      event.preventDefault();
    };

    document.addEventListener('selectstart', handleSelectStart, true);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('dragstart', handleNativeDragStart, true);

    return () => {
      document.removeEventListener('selectstart', handleSelectStart, true);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('dragstart', handleNativeDragStart, true);
    };
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify({
        activeView,
        matchSearchName,
        matchRegion,
        rankingChapter,
      } satisfies AppSessionState));
    } catch {
      // Session restore is best-effort; normal app behavior does not depend on it.
    }
  }, [activeView, matchRegion, matchSearchName, rankingChapter]);

  useEffect(() => {
    let cancelled = false;
    let refreshInFlight = false;

    const refreshRegion = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const region = await window.lolHelper.lcu.getCurrentRegion();
        if (cancelled) return;
        if (region.name && !region.error) {
          setCurrentRegionKey(region.key ?? '');
          setCurrentRegionName(region.name);
          setClientConnected(true);
          if (region.sessionId) setClientSessionId(region.sessionId);
        } else {
          setClientConnected(false);
        }
      } catch {
        // 保留上一次成功读取到的区域，下一轮继续检查。
        if (!cancelled) setClientConnected(false);
      } finally {
        refreshInFlight = false;
      }
    };

    const handleWindowFocus = () => void refreshRegion();
    void refreshRegion();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshRegion();
    }, 15_000);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkFriendRequests = async () => {
      if (friendRequestCheckInFlightRef.current) return;
      friendRequestCheckInFlightRef.current = true;
      try {
        const status = await window.lolHelper.lcu.detectClient();
        if (!status.connected || cancelled) return;
        const requests = await window.lolHelper.lcu.getFriendRequests();
        if (cancelled) return;
        const outgoing = requests.filter((request) => request.direction === 'out');
        const outgoingPuuids = new Set(outgoing.map((request) => request.puuid));
        const removed = trackedOutgoingRequestsRef.current.filter(
          (request) => !outgoingPuuids.has(request.puuid),
        );

        if (removed.length > 0) {
          const friends = await window.lolHelper.lcu.getFriends();
          if (cancelled) return;
          const accepted = createAcceptedAlerts(
            removed,
            new Set(friends.map((friend) => friend.puuid)),
          );
          if (accepted.length > 0) {
            setFriendAcceptedAlerts((current) => {
              const next = mergeAcceptedAlerts(current, accepted);
              saveFriendAcceptedAlerts(next);
              return next;
            });
            void showFriendAcceptedNotification(accepted);
            window.dispatchEvent(new CustomEvent('lolhelp:friends-changed'));
          }
        }

        trackedOutgoingRequestsRef.current = outgoing;
        saveTrackedOutgoingRequests(outgoing);
      } catch {
        // Keep the last snapshot and retry after the client is available again.
      } finally {
        friendRequestCheckInFlightRef.current = false;
      }
    };

    const handleFocus = () => void checkFriendRequests();
    const handleFriendRequestsChanged = () => void checkFriendRequests();
    void checkFriendRequests();
    const timer = window.setInterval(() => void checkFriendRequests(), FRIEND_REQUEST_CHECK_INTERVAL_MS);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('lolhelp:friend-requests-changed', handleFriendRequestsChanged);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('lolhelp:friend-requests-changed', handleFriendRequestsChanged);
    };
  }, []);

  const markFriendAcceptedAlertsRead = useCallback(() => {
    setFriendAcceptedAlerts((current) => {
      if (current.every((alert) => alert.read)) return current;
      const next = current.map((alert) => ({ ...alert, read: true }));
      saveFriendAcceptedAlerts(next);
      return next;
    });
  }, []);

  const regions: MatchRegionOption[] = [{ key: '', name: currentRegionName }, ...LOL_REGIONS];

  const closeDialogs = useCallback(() => {
    setSavedPickerOpen(false);
    setChatSessionsOpen(false);
    setFollowAccountsOpen(false);
    setFriendManagerOpen(false);
  }, []);

  // 查人：所有入口（顶栏、好友、对局、雷达、首页）都走这里，结果在战绩页打开。
  const handlePlayerSearch = useCallback((name: string, region?: string) => {
    setMatchSearchName(name);
    searchRef.current?.setValue(name);
    setMatchRegion(region ?? '');
    setActiveView('matches');
    setMatchSearchTrigger((n) => n + 1);
  }, []);

  const handleFriendClick = useCallback((riotId: string) => {
    handlePlayerSearch(riotId, ''); // 好友默认使用已读取到的大区
  }, [handlePlayerSearch]);

  const handleLivePlayerSearch = useCallback((riotId: string) => {
    handlePlayerSearch(riotId, currentRegionKey);
  }, [currentRegionKey, handlePlayerSearch]);

  const handleScoutPanelMinimize = useCallback(() => {
    setScoutPanelMinimized(true);
  }, []);

  const handleScoutPanelRestore = useCallback(() => {
    setScoutPanelMinimized(false);
  }, []);

  const handleFollowAccount = useCallback((riotId: string, region?: string) => {
    closeDialogs();
    setFollowAccountsOpen(true);
    setFollowAccountRequest({ riotId, region, nonce: Date.now() });
  }, [closeDialogs]);

  const markCurrentFollowAlertsRead = useCallback(async () => {
    try {
      const summary = await loadSavedMatchesSummary();
      saveReadFollowAlertIds(new Set(summary.followAlertIds));
      setFollowAlertCount(0);
    } catch {
      setFollowAlertCount(0);
    }
  }, []);

  const refreshFollowAlertCount = useCallback(async () => {
    try {
      const { followAlertIds: alertIds } = await loadSavedMatchesSummary();
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

  const toggleFriendDrawer = useCallback(() => {
    setFriendDrawerOpen((open) => {
      saveFriendDrawerOpen(!open);
      return !open;
    });
  }, []);

  const closeFriendDrawer = useCallback(() => {
    setFriendDrawerOpen(false);
    saveFriendDrawerOpen(false);
  }, []);

  const openSavedMatches = useCallback(() => {
    closeDialogs();
    setSavedPickerOpen(true);
  }, [closeDialogs]);

  const openFollowAccounts = useCallback(() => {
    closeDialogs();
    setFollowAccountsOpen(true);
    void markCurrentFollowAlertsRead();
  }, [closeDialogs, markCurrentFollowAlertsRead]);

  const openFriendManager = useCallback(() => {
    closeDialogs();
    setFriendManagerOpen(true);
    markFriendAcceptedAlertsRead();
  }, [closeDialogs, markFriendAcceptedAlertsRead]);

  const scoutPanelActuallyMinimized = scoutPanelMinimized && scoutSidebarStatus !== null;
  const unreadFriendAccepted = friendAcceptedAlerts.filter((alert) => !alert.read).length;

  // 页面自己的切换控件放在顶栏标题旁边。
  const headerExtra = activeView === 'ranking' ? (
    <Segmented<RankingChapter>
      size="sm"
      ariaLabel="数据分类"
      value={rankingChapter}
      onChange={setRankingChapter}
      options={[
        { value: 'mayhem', label: '海克斯大乱斗' },
        { value: 'ranking', label: '英雄排行' },
      ]}
    />
  ) : null;

  const title = activeView === 'live' && livePageTitle ? `对局 · ${livePageTitle}` : PAGE_TITLES[activeView];

  return (
    // reducedMotion="user"：系统开了「减少动态效果」时，framer-motion 的位移/缩放动画自动关闭。
    <MotionConfig reducedMotion="user">
    <AppShell
      title={title}
      activeView={activeView}
      onNavigate={setActiveView}
      headerExtra={headerExtra}
      search={(
        <GlobalSearch
          ref={searchRef}
          defaultValue={matchSearchName}
          region={matchRegion}
          regions={regions}
          onRegionChange={setMatchRegion}
          onValueCommit={setMatchSearchName}
          onSubmit={(name) => handlePlayerSearch(name, matchRegion)}
        />
      )}
      connection={{
        connected: clientConnected,
        label: clientConnected ? currentRegionName : '未连接客户端',
      }}
      actions={{
        savedOpen: savedPickerOpen,
        onOpenSaved: openSavedMatches,
        followOpen: followAccountsOpen,
        followCount: followAlertCount,
        onOpenFollow: openFollowAccounts,
        friendRequestsOpen: friendManagerOpen,
        friendRequestCount: unreadFriendAccepted,
        onOpenFriendRequests: openFriendManager,
      }}
      chatOpen={chatSessionsOpen}
      onOpenChat={() => {
        closeDialogs();
        setChatSessionsOpen(true);
      }}
      friendDrawerOpen={friendDrawerOpen}
      onToggleFriendDrawer={toggleFriendDrawer}
      onCloseFriendDrawer={closeFriendDrawer}
      scoutStatus={scoutPanelActuallyMinimized ? scoutSidebarStatus : null}
      onScoutStatusClick={() => {
        setActiveView('scout');
        setScoutPanelMinimized(false);
      }}
      friendPanel={
        <StableFriendPanel
          onFriendClick={handleFriendClick}
          onFriendFollow={handleFollowAccount}
          onOpenFriendRequests={openFriendManager}
          active={friendDrawerOpen}
        />
      }
    >
      <Activity name="home" mode={activeView === 'home' ? 'visible' : 'hidden'}>
        <div className="h-full">
          <StableHomePage
            active={activeView === 'home'}
            connected={clientConnected}
            regionName={currentRegionName}
            onNavigate={setActiveView}
            onPlayerSearch={handlePlayerSearch}
            onOpenFollow={openFollowAccounts}
          />
        </div>
      </Activity>
      <Activity name="matches" mode={activeView === 'matches' ? 'visible' : 'hidden'}>
        <div className="h-full">
          <StableMatchHistoryPage
            key={clientSessionId || 'client-session'}
            searchName={matchSearchName}
            searchTrigger={matchSearchTrigger}
            region={matchRegion}
            currentRegionKey={currentRegionKey}
            currentRegionName={currentRegionName}
            savedAccountRequest={savedAccountRequest}
            onPlayerSearch={handlePlayerSearch}
          />
        </div>
      </Activity>
      <Activity name="live" mode={activeView === 'live' ? 'visible' : 'hidden'}>
        <div className="h-full">
          <StableLiveGamePage
            onTitleChange={setLivePageTitle}
            onPlayerSearch={handleLivePlayerSearch}
          />
        </div>
      </Activity>
      <Activity
        name="scout"
        mode={activeView === 'scout' || scoutSidebarStatus?.running ? 'visible' : 'hidden'}
      >
        <div className={activeView === 'scout' ? 'h-full' : 'hidden'}>
          <StableScoutPage
            currentRegionName={currentRegionName}
            onPlayerSearch={handlePlayerSearch}
            onStatusChange={setScoutSidebarStatus}
            configPanelMinimized={scoutPanelActuallyMinimized}
            onConfigPanelMinimize={handleScoutPanelMinimize}
            onConfigPanelRestore={handleScoutPanelRestore}
          />
        </div>
      </Activity>
      <Activity name="ranking" mode={activeView === 'ranking' ? 'visible' : 'hidden'}>
        <div className="h-full"><StableChampionRankingPage chapter={rankingChapter} /></div>
      </Activity>
      <Activity name="assist" mode={activeView === 'assist' ? 'visible' : 'hidden'}>
        <div className="h-full"><StableAssistPage onPlayerSearch={handlePlayerSearch} /></div>
      </Activity>
      <Activity name="settings" mode={activeView === 'settings' ? 'visible' : 'hidden'}>
        <div className="h-full"><SettingsDialog open embedded onClose={() => setActiveView('home')} /></div>
      </Activity>
      {chatSessionsOpen && (
        <ChatSessionDialog open onClose={() => setChatSessionsOpen(false)} />
      )}
      {savedPickerOpen && (
        <SavedMatchPickerDialog
          open
          onClose={() => setSavedPickerOpen(false)}
          onSelect={(account) => {
            setActiveView('matches');
            setSavedAccountRequest({ account, nonce: Date.now() });
          }}
        />
      )}
      {followAccountsOpen && (
        <FollowAccountsDialog
          open
          onClose={() => setFollowAccountsOpen(false)}
          currentRegionKey={currentRegionKey}
          currentRegionName={currentRegionName}
          request={followAccountRequest}
        />
      )}
      {friendManagerOpen && (
        <FriendManagerDialog
          open
          onClose={() => setFriendManagerOpen(false)}
          acceptedAlerts={friendAcceptedAlerts}
        />
      )}
    </AppShell>
    </MotionConfig>
  );
}
