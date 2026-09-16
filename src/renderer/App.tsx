import { Activity, memo, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe2, Search } from 'lucide-react';
import { AppShell, type ScoutSidebarStatus, type View } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { MatchHistoryPage } from './components/match/MatchHistoryPage';
import { FollowAccountsDialog, type FollowAccountRequest } from './components/match/FollowAccountsDialog';
import { SavedMatchPickerDialog } from './components/match/SavedMatchPickerDialog';
import {
  loadSavedMatchesSummary,
  SAVED_MATCHES_CHANGED_EVENT,
  type SavedMatchAccount,
} from './components/match/savedMatchesStore';
import { LiveGamePage } from './components/live/LiveGamePage';
import { ScoutPage } from './components/scout/ScoutPage';
import {
  ChampionRankingPage,
  RankingChapterSwitch,
  type RankingChapter,
} from './components/ranking/ChampionRankingPage';
import { FriendPanel } from './components/FriendPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { AssistPage } from './components/assist/AssistPage';
import { ChatSessionDialog } from './components/chat/ChatSessionDialog';
import { FriendManagerDialog } from './components/friends/FriendManagerDialog';
import {
  createAcceptedAlerts,
  loadFriendAcceptedAlerts,
  loadTrackedOutgoingRequests,
  mergeAcceptedAlerts,
  saveFriendAcceptedAlerts,
  saveTrackedOutgoingRequests,
  type FriendAcceptedAlert,
} from './components/friends/friendRequestTracking';
import { APP_LAYOUT, LOL_REGIONS } from '../shared/constants';

const PAGE_TITLES: Record<View, string> = {
  home: '主页',
  matches: '', // 战绩页标题栏放搜索框，标题留空
  live: '',
  scout: '高手雷达',
  ranking: '',
  assist: '辅助功能',
};

const EXPANDED_APP_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.friendPanelWidth;
const HIDDEN_APP_WIDTH = APP_LAYOUT.workspaceWidth + APP_LAYOUT.hiddenFriendPanelWidth;
const FRIEND_PANEL_ANIMATION_MS = 200;

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
const APP_VIEWS: View[] = ['home', 'matches', 'live', 'scout', 'ranking', 'assist'];
const RANKING_CHAPTERS: RankingChapter[] = ['mayhem', 'ranking'];

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

async function showFriendAcceptedNotification(alerts: FriendAcceptedAlert[]): Promise<void> {
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
  const [livePageTitle, setLivePageTitle] = useState('未进入对局');
  const [currentRegionKey, setCurrentRegionKey] = useState('');
  const [currentRegionName, setCurrentRegionName] = useState('读取大区...');
  const [clientSessionId, setClientSessionId] = useState('');
  const [friendPanelHidden, setFriendPanelHidden] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const friendPanelTimerRef = useRef<number | null>(null);
  const trackedOutgoingRequestsRef = useRef(loadTrackedOutgoingRequests());
  const friendRequestCheckInFlightRef = useRef(false);

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
          if (region.sessionId) setClientSessionId(region.sessionId);
        }
      } catch {
        // 保留上一次成功读取到的区域，下一轮继续检查。
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

  const regions = [{ key: '', name: currentRegionName }, ...LOL_REGIONS];
  const formatRegionOption = (region: (typeof regions)[number]) => region.name;

  const matchSearchBar = activeView === 'matches' ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMatchSearchTrigger((n) => n + 1);
      }}
      className="flex h-8 items-stretch overflow-hidden rounded-md border border-app-border-strong bg-app-surface transition-[background-color,border-color,box-shadow] duration-200 focus-within:border-app-primary/40 focus-within:bg-app-surface-soft focus-within:shadow-ui-focus-compact"
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
        className="shrink-0 bg-app-primary px-4 text-xs font-semibold text-app-primary-foreground transition-colors hover:bg-app-primary-hover"
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

  const handleLivePlayerSearch = useCallback((riotId: string) => {
    handlePlayerSearch(riotId, currentRegionKey);
  }, [currentRegionKey, handlePlayerSearch]);

  const handleScoutPanelMinimize = useCallback(() => {
    setScoutPanelMinimized(true);
  }, []);

  const handleFollowAccount = useCallback((riotId: string, region?: string) => {
    setSavedPickerOpen(false);
    setChatSessionsOpen(false);
    setSettingsOpen(false);
    setFriendManagerOpen(false);
    setFollowAccountsOpen(true);
    setFollowAccountRequest({ riotId, region, nonce: Date.now() });
  }, []);

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
  const headerExtra = matchSearchBar ?? (activeView === 'ranking' ? (
    <RankingChapterSwitch value={rankingChapter} onChange={setRankingChapter} />
  ) : null);

  return (
    <AppShell
      title={activeView === 'live' ? livePageTitle : PAGE_TITLES[activeView]}
      activeView={activeView}
      onNavigate={setActiveView}
      fullBleed={activeView === 'matches' || activeView === 'live' || activeView === 'scout' || activeView === 'ranking' || activeView === 'assist'}
      headerExtra={headerExtra}
      friendPanelHidden={friendPanelHidden}
      onToggleFriendPanel={toggleFriendPanelHidden}
      chatSessionsOpen={chatSessionsOpen}
      savedMatchesOpen={savedPickerOpen}
      followAccountsOpen={followAccountsOpen}
      friendManagerOpen={friendManagerOpen}
      friendRequestAlertCount={friendAcceptedAlerts.filter((alert) => !alert.read).length}
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
        setFriendManagerOpen(false);
        setSavedPickerOpen(true);
      }}
      onOpenFollowAccounts={() => {
        setSavedPickerOpen(false);
        setChatSessionsOpen(false);
        setSettingsOpen(false);
        setFriendManagerOpen(false);
        setFollowAccountsOpen(true);
        void markCurrentFollowAlertsRead();
      }}
      onOpenChatSessions={() => {
        setSavedPickerOpen(false);
        setFollowAccountsOpen(false);
        setSettingsOpen(false);
        setFriendManagerOpen(false);
        setChatSessionsOpen(true);
      }}
      onOpenFriendManager={() => {
        setSavedPickerOpen(false);
        setChatSessionsOpen(false);
        setFollowAccountsOpen(false);
        setSettingsOpen(false);
        setFriendManagerOpen(true);
        markFriendAcceptedAlertsRead();
      }}
      onOpenSettings={() => {
        setSavedPickerOpen(false);
        setChatSessionsOpen(false);
        setFollowAccountsOpen(false);
        setFriendManagerOpen(false);
        setSettingsOpen(true);
      }}
      settingsOpen={settingsOpen}
      friendPanel={
         <StableFriendPanel
           onFriendClick={handleFriendClick}
           onFriendFollow={handleFollowAccount}
           active={!friendPanelHidden}
         />
      }
    >
      <Activity name="home" mode={activeView === 'home' ? 'visible' : 'hidden'}>
        <div><StableHomePage /></div>
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
          />
        </div>
      </Activity>
      <Activity name="ranking" mode={activeView === 'ranking' ? 'visible' : 'hidden'}>
        <div className="h-full"><StableChampionRankingPage chapter={rankingChapter} /></div>
      </Activity>
      <Activity name="assist" mode={activeView === 'assist' ? 'visible' : 'hidden'}>
        <div className="h-full"><StableAssistPage onPlayerSearch={handlePlayerSearch} /></div>
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
      {settingsOpen && <SettingsDialog open onClose={() => setSettingsOpen(false)} />}
    </AppShell>
  );
}
