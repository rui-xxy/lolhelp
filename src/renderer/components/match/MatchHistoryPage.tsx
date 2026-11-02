import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import { Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, CircleAlert, Ellipsis, History as HistoryIcon, LoaderCircle, MousePointerClick, PanelRightOpen, Trash2, UserPlus, X } from 'lucide-react';
import { MatchList, type RecurringMate } from './MatchList';
import { MatchDetail } from './MatchDetail';
import { MonthActivityNavigator, getHistoryDayKey } from './MatchActivityNavigator';
import type { PlayerLookupResult, PlayerMatchDetail } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { QUEUE_FILTERS, QueueFilterMenu, TierGem, WinRateAvatar, formatRankTier, pickHeaderRank } from './MatchPlayerHeader';
import { RankEmblem } from '../RankEmblem';
import { EmptyState } from '../ui/kit';
import { saveMatchesForProfile, type SavedMatchAccount } from './savedMatchesStore';
import { LOL_REGIONS } from '../../../shared/constants';

const SGP_BATCH = 50;

interface MatchHistoryPageProps {
  searchName: string;
  searchTrigger: number;
  region?: string;
  currentRegionKey?: string;
  currentRegionName?: string;
  savedAccountRequest?: { account: SavedMatchAccount; nonce: number } | null;
  onPlayerSearch?: (name: string, region?: string) => void;
}

interface MatchTab {
  id: string;
  query: string;
  region: string;
  title: string;
  loading: boolean;
  pageLoading: boolean;
  result: PlayerLookupResult | null;
  matches: PlayerMatchDetail[];
  loadedUpTo: number;
  hasMore: boolean;
  selectedGameId: number | null;
  currentPage: number;
  filterQueue: string; // '' = 全部，'420' = 单排，'450' = 大乱斗 等
  source?: 'search' | 'saved';
  savedAccountId?: string;
  savedMatches?: PlayerMatchDetail[];
}

interface OpenSearchTabOptions {
  forceRefresh?: boolean;
}

function createEmptyResult(error: string): PlayerLookupResult {
  return {
    profile: {
      riotId: '',
      puuid: '',
      level: 0,
      profileIconId: 0,
      profileIconUrl: '',
      rank: null,
      ranks: [],
      championCount: null,
      skinCount: null,
    },
    matches: [],
    summary: { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 },
    totalMatches: 0,
    error,
  };
}

function buildLookupResultFromSavedAccount(account: SavedMatchAccount): PlayerLookupResult {
  const matches = [...account.matches].sort((a, b) => b.gameCreation - a.gameCreation);
  const wins = matches.filter((match) => match.win).length;
  const losses = matches.length - wins;
  const divisor = Math.max(1, matches.length);

  return {
    profile: account.profile,
    matches,
    summary: {
      wins,
      losses,
      averageKda: matches.reduce((sum, match) => sum + match.kda, 0) / divisor,
      averageDamage: matches.reduce((sum, match) => sum + match.damage, 0) / divisor,
      averageCs: matches.reduce((sum, match) => sum + match.cs, 0) / divisor,
    },
    totalMatches: matches.length,
  };
}

function filterSavedMatches(matches: PlayerMatchDetail[], queueKey: string): PlayerMatchDetail[] {
  if (!queueKey) return matches;
  const queueId = Number(queueKey);
  if (!Number.isFinite(queueId)) return matches;
  return matches.filter((match) => match.queueId === queueId);
}

function makeTabId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeTabTitle(query: string, result: PlayerLookupResult): string {
  const targetParticipant = result.matches
    .flatMap((match) => match.participants)
    .find((participant) => participant.puuid === result.profile.puuid);
  const resolvedName = result.profile.riotId || targetParticipant?.riotId || targetParticipant?.summonerName || '';
  if (resolvedName) return resolvedName;
  if (query) return query;
  return result.error ? '查询失败' : '账号名读取失败';
}

interface CommonChampion {
  championId: number;
  championName: string;
  championAvatar: string;
  games: number;
  wins: number;
  kdaTotal: number;
}

function getDisplayName(riotId: string | undefined): string {
  const normalized = (riotId ?? '').trim();
  const [gameName] = normalized.split('#');
  return gameName || normalized || '未知玩家';
}

function getTabLabel(tab: MatchTab): string {
  return getDisplayName(tab.result?.profile.riotId || tab.query || tab.title);
}

function getProfileRanks(profile: PlayerLookupResult['profile'] | null | undefined) {
  const ranks = profile?.ranks?.length ? profile.ranks : profile?.rank ? [profile.rank] : [];
  return ranks;
}

function getQueueRank(profile: PlayerLookupResult['profile'] | null | undefined, queueType: string) {
  return getProfileRanks(profile).find((rank) => rank.queueType === queueType) ?? null;
}

function formatOptionalNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '--';
}

function getRankWinRate(rank: NonNullable<PlayerLookupResult['profile']['rank']>): string {
  const total = rank.wins + rank.losses;
  if (total <= 0) return '--';
  return `${Math.round((rank.wins / total) * 100)}%`;
}

function getCommonChampions(matches: PlayerMatchDetail[]): CommonChampion[] {
  const stats = new Map<number, CommonChampion>();
  for (const match of matches) {
    const current = stats.get(match.championId) ?? {
      championId: match.championId,
      championName: match.championName,
      championAvatar: match.championAvatar,
      games: 0,
      wins: 0,
      kdaTotal: 0,
    };
    current.games += 1;
    current.wins += match.win ? 1 : 0;
    current.kdaTotal += match.kda;
    stats.set(match.championId, current);
  }

  return Array.from(stats.values())
    .sort((a, b) => b.games - a.games || b.wins - a.wins || b.kdaTotal - a.kdaTotal)
    .slice(0, 6);
}

function RankSummaryCard({
  label,
  rank,
}: {
  label: string;
  rank: NonNullable<PlayerLookupResult['profile']['rank']> | null;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 px-4 py-3">
      {rank ? (
        <RankEmblem rank={rank} size={44} variant="mini" />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-app-surface-soft text-[11px] text-app-subtle">
          未定
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-app-muted">{label}</div>
        <div className="mt-0.5 truncate text-sm font-semibold text-app-text">{rank?.displayText || '未定级'}</div>
        <div className="mt-0.5 truncate text-[11px] text-app-subtle">
          {rank ? `${rank.leaguePoints} LP · ${rank.wins}胜 ${rank.losses}负 · 胜率 ${getRankWinRate(rank)}` : '暂无排位数据'}
        </div>
      </div>
    </div>
  );
}

function PlayerProfilePanel({
  result,
  matches,
}: {
  result: PlayerLookupResult;
  matches: PlayerMatchDetail[];
}) {
  const profile = result.profile;
  const displayName = getDisplayName(profile.riotId);
  const soloRank = getQueueRank(profile, 'RANKED_SOLO_5x5');
  const flexRank = getQueueRank(profile, 'RANKED_FLEX_SR');
  const commonChampions = getCommonChampions(matches);

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-3">
      <section className="overflow-hidden rounded-md border border-app-border bg-app-surface shadow-[var(--shadow-ui-shell)]">
        <div className="flex items-center gap-4 px-5 py-4">
          <ProfileIcon
            iconId={profile.profileIconId}
            src={profile.profileIconUrl}
            alt={displayName}
            title={profile.riotId}
            size={56}
            className="ring-1 ring-app-border"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold text-app-text" title={profile.riotId}>
              {displayName}
            </div>
            <div className="mt-1 text-xs text-app-muted" title={profile.riotId}>
              {profile.riotId || 'Riot ID 未读取'} · 等级 {formatOptionalNumber(profile.level)}
            </div>
          </div>
          <div className="flex shrink-0 items-stretch divide-x divide-app-border text-center">
            <div className="min-w-20 px-4">
              <div className="text-base font-semibold tabular-nums text-app-text">{formatOptionalNumber(profile.championCount)}</div>
              <div className="mt-0.5 text-[11px] text-app-subtle">英雄</div>
            </div>
            <div className="min-w-20 px-4">
              <div className="text-base font-semibold tabular-nums text-app-text">{formatOptionalNumber(profile.skinCount)}</div>
              <div className="mt-0.5 text-[11px] text-app-subtle">皮肤</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-app-border border-t border-app-border bg-app-bg-soft/60">
          <RankSummaryCard label="单双排" rank={soloRank} />
          <RankSummaryCard label="灵活组排" rank={flexRank} />
        </div>
      </section>

      <section className="rounded-md border border-app-border bg-app-surface p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="text-sm font-semibold text-app-text">常玩英雄</div>
        </div>
        {commonChampions.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-1.5">
            {commonChampions.map((champion) => {
              const winRate = champion.games > 0 ? Math.round((champion.wins / champion.games) * 100) : 0;
              const averageKda = champion.games > 0 ? (champion.kdaTotal / champion.games).toFixed(1) : '--';
              return (
                <div
                  key={champion.championId}
                  className="flex items-center gap-3 rounded-sm px-2.5 py-2 transition-colors hover:bg-app-surface-soft"
                >
                  <img
                    src={champion.championAvatar}
                    alt={champion.championName}
                    className="size-9 shrink-0 rounded-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-app-text">{champion.championName}</div>
                    <div className="mt-0.5 text-[11px] text-app-muted">
                      {champion.games} 场 · 胜率 {winRate}% · KDA {averageKda}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-sm bg-app-surface-soft px-3 py-7 text-center text-xs text-app-subtle">
            暂无可统计的英雄数据
          </div>
        )}
      </section>
    </div>
  );
}

export function MatchHistoryPage({
  searchName,
  searchTrigger,
  region = '',
  currentRegionKey = '',
  currentRegionName = '',
  savedAccountRequest,
  onPlayerSearch,
}: MatchHistoryPageProps) {
  const [tabs, setTabs] = useState<MatchTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [pressedTabId, setPressedTabId] = useState<string | null>(null);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const [tabsScrollState, setTabsScrollState] = useState({ overflowing: false, canLeft: false, canRight: false });
  const [profilePanelTabId, setProfilePanelTabId] = useState<string | null>(null);
  const [saveModeTabId, setSaveModeTabId] = useState<string | null>(null);
  const [saveSelections, setSaveSelections] = useState<Record<string, number[]>>({});
  const [addingFriendTabId, setAddingFriendTabId] = useState<string | null>(null);
  const [friendNotice, setFriendNotice] = useState<{
    tabId: string;
    message: string;
    success: boolean;
  } | null>(null);

  const tabsRef = useRef<MatchTab[]>([]);
  const lastTriggerRef = useRef(0);
  const lastSavedAccountNonceRef = useRef(0);
  const tabLoadSeqRef = useRef<Record<string, number>>({});
  const friendNoticeTimerRef = useRef<number | null>(null);
  const tabsViewportRef = useRef<HTMLDivElement | null>(null);
  const tabsMenuRef = useRef<HTMLDivElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const historyScrollRafRef = useRef<number | null>(null);
  const historyLoadLockRef = useRef(false);
  const activeHistoryDayRef = useRef<string | null>(null);
  const [activeHistoryDay, setActiveHistoryDay] = useState<string | null>(null);
  const [historyScrollProgress, setHistoryScrollProgress] = useState(0);
  const [historyViewportRange, setHistoryViewportRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const syncTabsScrollState = useCallback(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport) {
      setTabsScrollState({ overflowing: false, canLeft: false, canRight: false });
      return;
    }
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    setTabsScrollState({
      overflowing: maxScrollLeft > 2,
      canLeft: viewport.scrollLeft > 2,
      canRight: viewport.scrollLeft < maxScrollLeft - 2,
    });
  }, []);

  const scrollTabsBy = (direction: -1 | 1) => {
    tabsViewportRef.current?.scrollBy({ left: direction * 220, behavior: 'smooth' });
  };

  useEffect(() => {
    activeHistoryDayRef.current = activeHistoryDay;
  }, [activeHistoryDay]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(syncTabsScrollState);
    observer.observe(viewport);
    const frame = window.requestAnimationFrame(syncTabsScrollState);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [syncTabsScrollState, tabs.length]);

  useEffect(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport || !activeTabId) return;
    const activeElement = viewport.querySelector<HTMLElement>('[data-player-tab-active="true"]');
    if (!activeElement) return;
    activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    const frame = window.requestAnimationFrame(syncTabsScrollState);
    return () => window.cancelAnimationFrame(frame);
  }, [activeTabId, syncTabsScrollState]);

  useEffect(() => {
    if (!tabsMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!tabsMenuRef.current?.contains(event.target as Node)) setTabsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTabsMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tabsMenuOpen]);

  useEffect(() => {
    if (!pressedTabId) return;
    const clearPressedTab = () => setPressedTabId(null);
    window.addEventListener('mouseup', clearPressedTab);
    window.addEventListener('blur', clearPressedTab);
    return () => {
      window.removeEventListener('mouseup', clearPressedTab);
      window.removeEventListener('blur', clearPressedTab);
    };
  }, [pressedTabId]);

  useEffect(() => () => {
    if (friendNoticeTimerRef.current !== null) {
      window.clearTimeout(friendNoticeTimerRef.current);
    }
  }, []);

  const updateTab = (tabId: string, updater: (tab: MatchTab) => MatchTab) => {
    setTabs((currentTabs) => currentTabs.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
  };

  const requestBatch = async (
    query: string,
    regionKey: string,
    startIndex: number,
    tag?: string,
  ): Promise<PlayerLookupResult> => {
    return window.lolHelper.match.search({
      name: query,
      startIndex,
      pageSize: SGP_BATCH,
      region: regionKey || undefined,
      tag: tag || undefined,
    });
  };

  const loadInitialTab = async (tabId: string, query: string, regionKey: string, tag?: string) => {
    const requestSeq = (tabLoadSeqRef.current[tabId] ?? 0) + 1;
    tabLoadSeqRef.current[tabId] = requestSeq;
    const isLatestRequest = () => tabLoadSeqRef.current[tabId] === requestSeq;

    updateTab(tabId, (tab) => ({
      ...tab,
      query,
      region: regionKey,
      loading: true,
      pageLoading: false,
      result: null,
      matches: [],
      loadedUpTo: 0,
      hasMore: false,
      selectedGameId: null,
      currentPage: 1,
      filterQueue: tag ? QUEUE_FILTERS.find((f) => f.tag === tag)?.key ?? '' : '',
      source: 'search',
      savedAccountId: undefined,
      savedMatches: undefined,
    }));

    try {
      const result = await requestBatch(query, regionKey, 0, tag);
      if (!isLatestRequest()) return;
      updateTab(tabId, (tab) => {
        const nextMatches = result.matches;
        return {
          ...tab,
          title: makeTabTitle(query, result),
          loading: false,
          result,
          matches: nextMatches,
          loadedUpTo: result.matches.length,
          hasMore: result.matches.length >= SGP_BATCH,
          selectedGameId: nextMatches[0]?.gameId ?? null,
        };
      });
    } catch (err) {
      if (!isLatestRequest()) return;
      const errorResult = createEmptyResult(err instanceof Error ? err.message : String(err));
      updateTab(tabId, (tab) => ({
        ...tab,
        title: makeTabTitle(query, errorResult),
        loading: false,
        result: errorResult,
      }));
    }
  };

  const openSearchTab = (rawQuery: string, regionKey: string, options: OpenSearchTabOptions = {}) => {
    const query = rawQuery.trim();
    const existingTab = tabsRef.current.find((tab) => tab.query === query && tab.region === regionKey);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      if (options.forceRefresh) {
        void loadInitialTab(existingTab.id, query, regionKey);
      } else if (
        !existingTab.loading &&
        (!existingTab.result?.profile.riotId ||
          existingTab.title === '我的战绩' ||
          existingTab.title === '当前账号' ||
          existingTab.title === '账号名读取失败')
      ) {
        void loadInitialTab(existingTab.id, query, regionKey);
      }
      return;
    }

    const tabId = makeTabId();
    const tab: MatchTab = {
      id: tabId,
      query,
      region: regionKey,
      title: query || '读取账号名...',
      loading: true,
      pageLoading: false,
      result: null,
      matches: [],
      loadedUpTo: 0,
      hasMore: false,
      selectedGameId: null,
      currentPage: 1,
      filterQueue: '',
      source: 'search',
    };

    setTabs((currentTabs) => [...currentTabs, tab]);
    setActiveTabId(tabId);
    void loadInitialTab(tabId, query, regionKey);
  };

  const openSavedAccountTab = (account: SavedMatchAccount) => {
    const result = buildLookupResultFromSavedAccount(account);
    const matches = result.matches;
    const title = `${getDisplayName(account.profile.riotId)} · 保存`;
    const existingTab = tabsRef.current.find(
      (tab) => tab.source === 'saved' && tab.savedAccountId === account.id,
    );

    if (existingTab) {
      updateTab(existingTab.id, (tab) => ({
        ...tab,
        title,
        loading: false,
        pageLoading: false,
        result,
        matches: filterSavedMatches(matches, tab.filterQueue),
        savedMatches: matches,
        loadedUpTo: matches.length,
        hasMore: false,
        selectedGameId: filterSavedMatches(matches, tab.filterQueue)[0]?.gameId ?? null,
        currentPage: 1,
      }));
      setActiveTabId(existingTab.id);
      setProfilePanelTabId(null);
      setSaveModeTabId(null);
      return;
    }

    const tabId = makeTabId();
    const tab: MatchTab = {
      id: tabId,
      query: account.profile.riotId,
      region: account.region,
      title,
      loading: false,
      pageLoading: false,
      result,
      matches,
      savedMatches: matches,
      source: 'saved',
      savedAccountId: account.id,
      loadedUpTo: matches.length,
      hasMore: false,
      selectedGameId: matches[0]?.gameId ?? null,
      currentPage: 1,
      filterQueue: '',
    };

    setTabs((currentTabs) => [...currentTabs, tab]);
    setActiveTabId(tabId);
    setProfilePanelTabId(null);
    setSaveModeTabId(null);
  };

  useEffect(() => {
    if (searchTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = searchTrigger;
    if (searchTrigger > 0) {
      openSearchTab(searchName, region, { forceRefresh: true });
    }
  }, [searchTrigger, searchName, region]);

  useEffect(() => {
    if (!savedAccountRequest || savedAccountRequest.nonce === lastSavedAccountNonceRef.current) return;
    lastSavedAccountNonceRef.current = savedAccountRequest.nonce;
    openSavedAccountTab(savedAccountRequest.account);
  }, [savedAccountRequest?.nonce]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const selectedMatch = activeTab?.matches.find((match) => match.gameId === activeTab.selectedGameId);
  // SGP 已按 tag 筛选，直接用 matches（不再前端过滤）
  const displayedMatches = activeTab?.matches ?? [];

  // 只在当前标签的战绩数据变化时重算关系，避免每次标签交互都重复扫描整批对局。
  const targetPuuid = activeTab?.result?.profile.puuid ?? '';
  const recurringMates = useMemo(() => {
    const mates = new Map<string, RecurringMate>();
    if (!activeTab || !targetPuuid) return mates;

    const counts: Record<string, { count: number; riotId: string; iconId: number; icon: string }> = {};
    for (const m of activeTab.matches) {
      const myTeam = m.participants.find((p) => p.puuid === targetPuuid)?.teamId;
      if (myTeam == null) continue;
      for (const p of m.participants) {
        if (p.puuid === targetPuuid || p.teamId !== myTeam) continue;
        if (!counts[p.puuid]) {
          counts[p.puuid] = {
            count: 0,
            riotId: p.riotId || p.summonerName || p.gameName || '未知',
            iconId: p.profileIconId,
            icon: p.profileIconUrl,
          };
        }
        counts[p.puuid].count++;
      }
    }

    for (const [puuid, info] of Object.entries(counts)) {
      if (info.count < 2) continue;
      mates.set(puuid, {
        puuid,
        riotId: info.riotId,
        profileIconId: info.iconId,
        profileIconUrl: info.icon,
        count: info.count,
      });
    }
    return mates;
  }, [activeTab, targetPuuid]);
  const isProfilePanelOpen = activeTab ? profilePanelTabId === activeTab.id : false;
  const isSaveMode = activeTab ? saveModeTabId === activeTab.id : false;
  const headerMatches = activeTab?.matches ?? [];
  const headerWins = headerMatches.filter((match) => match.win).length;
  const headerLosses = headerMatches.length - headerWins;
  const headerWinRate = headerMatches.length > 0 ? Math.round((headerWins / headerMatches.length) * 100) : null;
  const headerRanks = activeTab?.result?.profile
    ? activeTab.result.profile.ranks?.length
      ? activeTab.result.profile.ranks
      : activeTab.result.profile.rank
        ? [activeTab.result.profile.rank]
        : []
    : [];
  const headerRank = pickHeaderRank(headerRanks, activeTab?.filterQueue ?? '');
  const selectedSaveIds = new Set(activeTab ? saveSelections[activeTab.id] ?? [] : []);
  const selectedSaveCount = selectedSaveIds.size;

  const stopSaveMode = () => {
    setSaveModeTabId(null);
  };

  const handleToggleSaveSelection = (gameId: number) => {
    if (!activeTab) return;
    setSaveSelections((current) => {
      const nextIds = new Set(current[activeTab.id] ?? []);
      if (nextIds.has(gameId)) {
        nextIds.delete(gameId);
      } else {
        nextIds.add(gameId);
      }
      return { ...current, [activeTab.id]: Array.from(nextIds) };
    });
  };

  const handleSaveSelectedMatches = async () => {
    if (!activeTab?.result?.profile || selectedSaveIds.size === 0) return;
    const matchesToSave = activeTab.matches.filter((match) => selectedSaveIds.has(match.gameId));
    if (matchesToSave.length === 0) return;
    const savedRegionKey = activeTab.region || currentRegionKey;
    const savedRegionName = LOL_REGIONS.find((item) => item.key === savedRegionKey)?.name
      ?? (activeTab.region ? '' : currentRegionName);
    await saveMatchesForProfile(activeTab.result.profile, savedRegionKey, matchesToSave, savedRegionName);
    setSaveSelections((current) => ({ ...current, [activeTab.id]: [] }));
    setSaveModeTabId(null);
  };

  const handleAddCurrentPlayerFriend = async () => {
    if (!activeTab?.result?.profile.riotId || addingFriendTabId) return;
    const tabId = activeTab.id;
    setAddingFriendTabId(tabId);
    try {
      const result = await window.lolHelper.lcu.addFriend(activeTab.result.profile.riotId);
      setFriendNotice({ tabId, message: result.message, success: result.success });
      if (result.success) {
        window.dispatchEvent(new CustomEvent('lolhelp:friend-requests-changed'));
      }
      if (friendNoticeTimerRef.current !== null) {
        window.clearTimeout(friendNoticeTimerRef.current);
      }
      friendNoticeTimerRef.current = window.setTimeout(() => {
        friendNoticeTimerRef.current = null;
        setFriendNotice((current) => (current?.tabId === tabId ? null : current));
      }, 4_000);
    } finally {
      setAddingFriendTabId(null);
    }
  };

  // 切换模式筛选：重新向 SGP 查询该模式的战绩（不是前端过滤）
  const handleFilterChange = (queueKey: string) => {
    if (!activeTab) return;
    setProfilePanelTabId(null);
    stopSaveMode();

    if (activeTab.source === 'saved') {
      const savedMatches = activeTab.savedMatches ?? activeTab.matches;
      const nextMatches = filterSavedMatches(savedMatches, queueKey);
      updateTab(activeTab.id, (tab) => ({
        ...tab,
        filterQueue: queueKey,
        currentPage: 1,
        matches: nextMatches,
        selectedGameId: nextMatches[0]?.gameId ?? null,
      }));
      return;
    }

    const filter = QUEUE_FILTERS.find((f) => f.key === queueKey);
    const tag = filter?.tag ?? '';
    // 重新加载该 tab（带 tag）
    updateTab(activeTab.id, (tab) => ({
      ...tab,
      filterQueue: queueKey,
      currentPage: 1,
      loading: true,
      matches: [],
      loadedUpTo: 0,
      hasMore: false,
      selectedGameId: null,
    }));
    void loadInitialTab(activeTab.id, activeTab.query, activeTab.region, tag);
  };

  const loadMoreHistory = async () => {
    const tab = tabsRef.current.find((item) => item.id === activeTabId);
    if (
      !tab ||
      tab.loading ||
      tab.pageLoading ||
      !tab.hasMore ||
      tab.source === 'saved' ||
      historyLoadLockRef.current
    ) {
      return;
    }

    historyLoadLockRef.current = true;
    const requestSeq = (tabLoadSeqRef.current[tab.id] ?? 0) + 1;
    tabLoadSeqRef.current[tab.id] = requestSeq;
    const isLatestRequest = () => tabLoadSeqRef.current[tab.id] === requestSeq;

    updateTab(tab.id, (current) => ({ ...current, pageLoading: true }));

    try {
      const currentTag = QUEUE_FILTERS.find((filter) => filter.key === tab.filterQueue)?.tag;
      const response = await requestBatch(tab.query, tab.region, tab.loadedUpTo, currentTag);
      if (!isLatestRequest()) return;

      const existingIds = new Set(tab.matches.map((match) => match.gameId));
      const additions = response.matches.filter((match) => !existingIds.has(match.gameId));
      const loadedUpTo = tab.loadedUpTo + response.matches.length;

      updateTab(tab.id, (current) => ({
        ...current,
        pageLoading: false,
        result: current.result ?? response,
        matches: [...current.matches, ...additions],
        loadedUpTo,
        hasMore: response.matches.length >= SGP_BATCH,
      }));
    } catch (err) {
      if (!isLatestRequest()) return;
      console.error('[match] 加载更早战绩失败:', err);
      updateTab(tab.id, (current) => ({ ...current, pageLoading: false }));
    } finally {
      historyLoadLockRef.current = false;
    }
  };

  const updateHistoryFocusWindow = (container: HTMLDivElement): string | null => {
    const containerRect = container.getBoundingClientRect();
    const viewportCenter = containerRect.top + containerRect.height / 2;
    const fadeZone = Math.max(78, Math.min(126, containerRect.height * 0.23));
    const handoffZone = Math.max(104, Math.min(132, containerRect.height * 0.22));
    const handoffHalf = handoffZone / 2;
    // 聚焦线：平时在视口 36% 的高度；刚打开、还在最顶上时贴近顶部，
    // 这样最新的那一天是亮的，往下滚时聚焦线再平滑地移到原位。
    const restingFocusOffset = Math.max(116, Math.min(190, containerRect.height * 0.36));
    const focusY =
      containerRect.top + Math.min(restingFocusOffset, 28 + container.scrollTop);
    // 只有那一侧还能继续滚动时才做边缘淡出（在最顶上时，最上面几行不该是淡的）
    const topFadeStrength = Math.max(0, Math.min(1, container.scrollTop / fadeZone));
    const bottomFadeStrength = Math.max(
      0,
      Math.min(1, (container.scrollHeight - container.clientHeight - container.scrollTop) / fadeZone),
    );
    const entries = Array.from(
      container.querySelectorAll<HTMLElement>('.match-history-entry[data-history-day-key]'),
    );

    const groups: Array<{
      key: string;
      entries: HTMLElement[];
      top: number;
      bottom: number;
    }> = [];

    for (const entry of entries) {
      const key = entry.dataset.historyDayKey;
      if (!key) continue;
      const rect = entry.getBoundingClientRect();
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.key !== key) {
        groups.push({ key, entries: [entry], top: rect.top, bottom: rect.bottom });
      } else {
        lastGroup.entries.push(entry);
        lastGroup.bottom = rect.bottom;
      }
    }

    const baselineFocus = 0.08;
    const focusWeights = new Map<string, number>();
    groups.forEach((group) => focusWeights.set(group.key, baselineFocus));

    let bridgeGroup: (typeof groups)[number] | null = null;
    let bridgeStrength = 0;
    let bridgeOffset = 0;

    let nearestBoundaryIndex = -1;
    let nearestBoundaryDistance = Number.POSITIVE_INFINITY;
    let nearestBoundaryY = 0;

    for (let index = 0; index < groups.length - 1; index++) {
      const boundaryY = (groups[index].bottom + groups[index + 1].top) / 2;
      const distance = Math.abs(boundaryY - focusY);
      if (distance < nearestBoundaryDistance) {
        nearestBoundaryDistance = distance;
        nearestBoundaryIndex = index;
        nearestBoundaryY = boundaryY;
      }
    }

    if (nearestBoundaryIndex >= 0 && nearestBoundaryDistance <= handoffHalf) {
      const upperGroup = groups[nearestBoundaryIndex];
      const lowerGroup = groups[nearestBoundaryIndex + 1];
      const progress = Math.max(
        0,
        Math.min(1, (focusY + handoffHalf - nearestBoundaryY) / handoffZone),
      );
      const easedProgress = progress * progress * (3 - 2 * progress);
      const upperFocus = baselineFocus + (1 - baselineFocus) * (1 - easedProgress);
      const lowerFocus = baselineFocus + (1 - baselineFocus) * easedProgress;
      focusWeights.set(upperGroup.key, upperFocus);
      focusWeights.set(lowerGroup.key, lowerFocus);

      bridgeGroup = lowerGroup;
      bridgeStrength = 1 - Math.abs(easedProgress - 0.5) * 2;
      bridgeOffset = (0.5 - easedProgress) * 12;
    } else if (groups.length > 0) {
      const containingGroup =
        groups.find((group) => focusY >= group.top && focusY <= group.bottom) ??
        groups.reduce((nearest, group) => {
          const groupCenter = (group.top + group.bottom) / 2;
          const nearestCenter = (nearest.top + nearest.bottom) / 2;
          return Math.abs(groupCenter - focusY) < Math.abs(nearestCenter - focusY)
            ? group
            : nearest;
        }, groups[0]);
      focusWeights.set(containingGroup.key, 1);
    }

    let candidateDay: string | null = null;
    let candidateWeight = -1;
    for (const [key, weight] of focusWeights) {
      if (weight > candidateWeight) {
        candidateDay = key;
        candidateWeight = weight;
      }
    }

    const currentDay = activeHistoryDayRef.current;
    const currentWeight = currentDay ? (focusWeights.get(currentDay) ?? baselineFocus) : 0;
    if (
      candidateDay &&
      (currentDay === null ||
        (candidateDay !== currentDay && candidateWeight >= 0.62 && currentWeight <= 0.46))
    ) {
      activeHistoryDayRef.current = candidateDay;
      setActiveHistoryDay(candidateDay);
    }

    entries.forEach((entry) => {
      const rect = entry.getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      const topRatio = Math.max(0, Math.min(1, (rowCenter - containerRect.top) / fadeZone));
      const bottomRatio = Math.max(0, Math.min(1, (containerRect.bottom - rowCenter) / fadeZone));
      const edgeRatio = Math.min(
        1 - topFadeStrength * (1 - topRatio),
        1 - bottomFadeStrength * (1 - bottomRatio),
      );
      const easedEdge = edgeRatio * edgeRatio * (3 - 2 * edgeRatio);
      const centerDistance = Math.abs(rowCenter - viewportCenter);
      const centerRatio = Math.max(
        0,
        1 - centerDistance / Math.max(1, containerRect.height * 0.46),
      );
      const dayFocus = focusWeights.get(entry.dataset.historyDayKey ?? '') ?? baselineFocus;

      const opacity = (0.46 + easedEdge * 0.54) * (0.7 + dayFocus * 0.3);
      const brightness = 0.79 + easedEdge * 0.08 + centerRatio * 0.015 + dayFocus * 0.185;
      const saturation = 0.68 + easedEdge * 0.1 + dayFocus * 0.24;
      const ambient = 0.35 + centerRatio * 0.55 + dayFocus * 5.8;
      const glowPercent = 1.1 + dayFocus * 7.9;
      const glowOpacity = 0.05 + dayFocus * 0.95;
      const shadowPercent = dayFocus * 4.4;
      const railPercent = 6 + dayFocus * 44;
      const railShadowPercent = dayFocus * 19;
      const nodePercent = 18 + dayFocus * 66;
      const stampOpacity = 0.42 + dayFocus * 0.58;

      entry.style.setProperty('--history-row-opacity', opacity.toFixed(3));
      entry.style.setProperty('--history-row-brightness', brightness.toFixed(3));
      entry.style.setProperty('--history-row-saturation', saturation.toFixed(3));
      entry.style.setProperty('--history-row-ambient', `${ambient.toFixed(2)}%`);
      entry.style.setProperty('--history-day-focus', dayFocus.toFixed(3));
      entry.style.setProperty('--history-day-glow-percent', `${glowPercent.toFixed(2)}%`);
      entry.style.setProperty('--history-day-glow-opacity', glowOpacity.toFixed(3));
      entry.style.setProperty('--history-day-shadow-percent', `${shadowPercent.toFixed(2)}%`);
      entry.style.setProperty('--history-day-rail-percent', `${railPercent.toFixed(2)}%`);
      entry.style.setProperty(
        '--history-day-rail-shadow-percent',
        `${railShadowPercent.toFixed(2)}%`,
      );
      entry.style.setProperty('--history-day-node-percent', `${nodePercent.toFixed(2)}%`);
      entry.style.setProperty('--history-day-stamp-opacity', stampOpacity.toFixed(3));
      entry.style.setProperty('--history-day-bridge', '0');
      entry.style.setProperty('--history-day-bridge-offset', '0px');
    });

    if (bridgeGroup?.entries[0]) {
      bridgeGroup.entries[0].style.setProperty(
        '--history-day-bridge',
        Math.max(0, bridgeStrength).toFixed(3),
      );
      bridgeGroup.entries[0].style.setProperty(
        '--history-day-bridge-offset',
        `${bridgeOffset.toFixed(2)}px`,
      );
    }

    return activeHistoryDayRef.current ?? candidateDay;
  };

  const handleHistoryScroll = () => {
    if (historyScrollRafRef.current !== null) return;
    historyScrollRafRef.current = window.requestAnimationFrame(() => {
      historyScrollRafRef.current = null;
      const container = historyScrollRef.current;
      if (!container) return;
      updateHistoryFocusWindow(container);

      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      setHistoryScrollProgress(maxScroll > 0 ? container.scrollTop / maxScroll : 0);

      const containerRect = container.getBoundingClientRect();
      const rows = Array.from(
        container.querySelectorAll<HTMLElement>('[data-history-day-row]'),
      );
      let firstVisibleIndex = -1;
      let lastVisibleIndex = -1;
      rows.forEach((row, index) => {
        const rect = row.getBoundingClientRect();
        if (rect.bottom > containerRect.top + 3 && rect.top < containerRect.bottom - 3) {
          if (firstVisibleIndex < 0) firstVisibleIndex = index;
          lastVisibleIndex = index;
        }
      });
      if (firstVisibleIndex >= 0 && lastVisibleIndex >= firstVisibleIndex) {
        setHistoryViewportRange((current) =>
          current?.start === firstVisibleIndex && current.end === lastVisibleIndex
            ? current
            : { start: firstVisibleIndex, end: lastVisibleIndex },
        );
      }

      const distanceToBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceToBottom < 180) {
        void loadMoreHistory();
      }
    });
  };

  const scrollToHistoryDay = (dayKey: string, behavior: ScrollBehavior = 'smooth') => {
    const container = historyScrollRef.current;
    if (!container) return;
    const marker = container.querySelector<HTMLElement>(`[data-history-day="${dayKey}"]`);
    if (!marker) return;

    const containerRect = container.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const targetTop = container.scrollTop + markerRect.top - containerRect.top - 6;
    activeHistoryDayRef.current = dayKey;
    setActiveHistoryDay(dayKey);
    container.scrollTo({ top: Math.max(0, targetTop), behavior });
  };

  const previewHistoryDay = (dayKey: string) => {
    scrollToHistoryDay(dayKey, 'auto');
  };

  const firstHistoryDay =
    activeTab?.matches[0] ? getHistoryDayKey(activeTab.matches[0].gameCreation) : null;

  useEffect(() => {
    const container = historyScrollRef.current;
    if (container) container.scrollTop = 0;
    setHistoryScrollProgress(0);
    setHistoryViewportRange(null);
    activeHistoryDayRef.current = firstHistoryDay;
    setActiveHistoryDay(firstHistoryDay);

    window.requestAnimationFrame(() => {
      const currentContainer = historyScrollRef.current;
      if (!currentContainer) return;
      const containerRect = currentContainer.getBoundingClientRect();
      const rows = Array.from(
        currentContainer.querySelectorAll<HTMLElement>('[data-history-day-row]'),
      );
      let start = -1;
      let end = -1;
      rows.forEach((row, index) => {
        const rect = row.getBoundingClientRect();
        if (rect.bottom > containerRect.top + 3 && rect.top < containerRect.bottom - 3) {
          if (start < 0) start = index;
          end = index;
        }
      });
      if (start >= 0 && end >= start) {
        setHistoryViewportRange({ start, end });
      }
      updateHistoryFocusWindow(currentContainer);
    });
  }, [activeTabId, activeTab?.filterQueue, firstHistoryDay]);

  useEffect(() => {
    return () => {
      if (historyScrollRafRef.current !== null) {
        window.cancelAnimationFrame(historyScrollRafRef.current);
      }
    };
  }, []);

  const handleCloseTab = (tabId: string) => {
    delete tabLoadSeqRef.current[tabId];
    setProfilePanelTabId((current) => (current === tabId ? null : current));
    setSaveModeTabId((current) => (current === tabId ? null : current));
    setSaveSelections((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    setTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const closedIndex = currentTabs.findIndex((tab) => tab.id === tabId);
        const nextActive = nextTabs[Math.max(0, closedIndex - 1)] ?? nextTabs[0] ?? null;
        setActiveTabId(nextActive?.id ?? null);
      }
      return nextTabs;
    });
  };

  const handleCloseAllTabs = () => {
    tabLoadSeqRef.current = {};
    setTabs([]);
    setActiveTabId(null);
    setDraggingTabId(null);
    setPressedTabId(null);
    setProfilePanelTabId(null);
    setSaveModeTabId(null);
    setSaveSelections({});
    setFriendNotice(null);
    setTabsMenuOpen(false);
    setActiveHistoryDay(null);
    setHistoryScrollProgress(0);
    setHistoryViewportRange(null);
  };

  const handlePlayerSearch = (riotId: string) => {
    if (!riotId.trim()) return;
    const searchRegion = activeTab?.region ?? region;
    if (onPlayerSearch) {
      onPlayerSearch(riotId, searchRegion);
    } else {
      openSearchTab(riotId, searchRegion);
    }
  };

  return (
    <div className="flex h-full flex-col bg-app-bg">
      <div className="match-player-tabs-bar [-webkit-app-region:no-drag]">
        <Reorder.Group
          ref={tabsViewportRef}
          as="div"
          axis="x"
          values={tabs}
          onReorder={setTabs}
          role="tablist"
          aria-label="已打开玩家"
          onScroll={syncTabsScrollState}
          onWheel={(event) => {
            if (!tabsScrollState.overflowing) return;
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.preventDefault();
            event.currentTarget.scrollLeft += event.deltaY;
          }}
          className="match-player-tabs-viewport scrollbar-none"
        >
          <AnimatePresence initial={false}>
            {tabs.map((tab) => {
              const tabLabel = getTabLabel(tab);
              const isPressedOrDragging = tab.id === draggingTabId || tab.id === pressedTabId;
              const isActive = tab.id === activeTabId;
              return (
                <Reorder.Item
                  key={tab.id}
                  as="div"
                  value={tab}
                  role="tab"
                  tabIndex={0}
                  aria-selected={isActive}
                  data-player-tab-active={isActive ? 'true' : 'false'}
                  title={tabLabel}
                  dragElastic={0.06}
                  dragMomentum={false}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    setPressedTabId(tab.id);
                    if (!isActive) setActiveTabId(tab.id);
                  }}
                  onClick={() => {
                    if (!isActive) setActiveTabId(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveTabId(tab.id);
                    }
                  }}
                  onDragStart={() => {
                    setDraggingTabId(tab.id);
                    setPressedTabId(null);
                    if (!isActive) setActiveTabId(tab.id);
                  }}
                  onDragEnd={() => {
                    setDraggingTabId(null);
                    setPressedTabId(null);
                  }}
                  initial={{ opacity: 0, y: 3, scale: 0.985 }}
                  animate={{
                    opacity: tab.id === draggingTabId ? 0.72 : 1,
                    y: 0,
                    scale: tab.id === draggingTabId ? 0.985 : 1,
                  }}
                  exit={{ opacity: 0, y: 2, scale: 0.97 }}
                  transition={{
                    duration: 0.13,
                    layout: { type: 'spring', stiffness: 520, damping: 40, mass: 0.72 },
                  }}
                  className={
                    'match-player-tab group ' +
                    (isPressedOrDragging ? 'match-player-tab--pressed ' : '') +
                    (isActive ? 'match-player-tab--active' : '')
                  }
                >
                  {isActive && (
                    <>
                      <motion.span
                        layoutId="match-player-tab-surface"
                        className="match-player-tab__surface"
                        transition={{ type: 'spring', stiffness: 560, damping: 42, mass: 0.68 }}
                      />
                      <motion.span
                        layoutId="match-player-tab-indicator"
                        className="match-player-tab__indicator"
                        transition={{ type: 'spring', stiffness: 620, damping: 44, mass: 0.65 }}
                      />
                    </>
                  )}
                  <span className="match-player-tab__content">
                    <ProfileIcon
                      iconId={tab.result?.profile.profileIconId}
                      src={tab.result?.profile.profileIconUrl}
                      alt={tabLabel}
                      title={tabLabel}
                      size={20}
                      className={`match-player-tab__avatar ${
                        isActive ? 'ring-1 ring-app-border-strong' : 'ring-1 ring-app-border/50'
                      }`}
                    />
                    <span
                      className={`match-player-tab__label ${
                        isActive ? 'match-player-tab__label--active' : ''
                      }`}
                    >
                      {tabLabel}
                    </span>
                    {tab.loading && <span className="match-player-tab__loading" />}
                    <button
                      type="button"
                      title="关闭"
                      aria-label="关闭标签页"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCloseTab(tab.id);
                      }}
                      className={
                        'match-player-tab__close ' +
                        (isActive ? 'match-player-tab__close--visible' : '')
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                </Reorder.Item>
              );
            })}
          </AnimatePresence>
        </Reorder.Group>

        {tabs.length > 0 && (
          <div ref={tabsMenuRef} className="match-player-tabs-tools">
            {tabsScrollState.overflowing && (
              <div className="match-player-tabs-scroll-controls">
                <button
                  type="button"
                  aria-label="向左查看更多标签页"
                  title="向左"
                  disabled={!tabsScrollState.canLeft}
                  onClick={() => scrollTabsBy(-1)}
                >
                  <ChevronLeft />
                </button>
                <button
                  type="button"
                  aria-label="向右查看更多标签页"
                  title="向右"
                  disabled={!tabsScrollState.canRight}
                  onClick={() => scrollTabsBy(1)}
                >
                  <ChevronRight />
                </button>
              </div>
            )}
            <button
              type="button"
              className={`match-player-tabs-more ${tabsMenuOpen ? 'match-player-tabs-more--open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={tabsMenuOpen}
              aria-label="标签页选项"
              title="标签页选项"
              onClick={() => setTabsMenuOpen((current) => !current)}
            >
              <Ellipsis />
            </button>

            {tabsMenuOpen && (
              <div className="match-player-tabs-menu" role="menu">
                <div className="match-player-tabs-menu__head">
                  <span>已打开标签</span>
                  <strong>{tabs.length}</strong>
                </div>
                <div className="match-player-tabs-menu__list scrollbar-none">
                  {tabs.map((tab) => {
                    const tabLabel = getTabLabel(tab);
                    const isActive = tab.id === activeTabId;
                    return (
                      <div
                        key={tab.id}
                        className={`match-player-tabs-menu__row ${isActive ? 'is-active' : ''}`}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="match-player-tabs-menu__item"
                          onClick={() => {
                            setActiveTabId(tab.id);
                            setTabsMenuOpen(false);
                          }}
                        >
                          <ProfileIcon
                            iconId={tab.result?.profile.profileIconId}
                            src={tab.result?.profile.profileIconUrl}
                            alt={tabLabel}
                            title={tabLabel}
                            size={18}
                          />
                          <span>{tabLabel}</span>
                          {isActive && <Check />}
                        </button>
                        <button
                          type="button"
                          className="match-player-tabs-menu__remove"
                          aria-label={`关闭 ${tabLabel}`}
                          title={`关闭 ${tabLabel}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCloseTab(tab.id);
                          }}
                        >
                          <X />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="match-player-tabs-menu__divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="match-player-tabs-menu__danger"
                  onClick={handleCloseAllTabs}
                >
                  <Trash2 />
                  <span>关闭全部标签页</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 bg-app-bg-soft">
        <div className="flex w-[320px] shrink-0 flex-col border-r border-app-border bg-app-bg-soft">
          {activeTab && (
            <div className="relative shrink-0 border-b border-app-border bg-app-bg-soft px-3 pt-3.5 pb-3">
              <div className="flex items-center gap-3">
                {activeTab.result?.profile ? (
                  <button
                    type="button"
                    disabled={!activeTab.result.profile.puuid}
                    onClick={() =>
                      setProfilePanelTabId((current) => (current === activeTab.id ? null : activeTab.id))
                    }
                    className="group -my-1 -ml-1 flex min-w-0 flex-1 items-center gap-3 rounded-sm py-1 pl-1 text-left outline-none transition-colors focus-visible:bg-app-nav-hover disabled:cursor-default"
                    title={
                      headerWinRate === null
                        ? activeTab.result.profile.riotId
                        : `${activeTab.result.profile.riotId}\n近 ${headerMatches.length} 场胜率 ${headerWinRate}%`
                    }
                  >
                    <WinRateAvatar
                      wins={headerWins}
                      losses={headerLosses}
                      iconId={activeTab.result.profile.profileIconId}
                      iconUrl={activeTab.result.profile.profileIconUrl}
                      name={getDisplayName(activeTab.result.profile.riotId)}
                      level={activeTab.result.profile.level}
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate text-list font-semibold tracking-[-0.01em] text-app-text">
                          {getDisplayName(activeTab.result.profile.riotId)}
                        </span>
                        <PanelRightOpen
                          className={`size-3.5 shrink-0 text-app-subtle transition-opacity ${
                            isProfilePanelOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                          }`}
                        />
                      </span>
                      {headerRank ? (
                        <span
                          className="flex min-w-0 items-center gap-1.5 text-meta text-app-body"
                          title={headerRank.displayText}
                        >
                          <TierGem tier={headerRank.tier} />
                          <span className="truncate">{formatRankTier(headerRank)}</span>
                          <span className="num shrink-0 text-app-muted">· {headerRank.leaguePoints} LP</span>
                        </span>
                      ) : (
                        <span className="text-meta text-app-subtle">未定级</span>
                      )}
                    </span>
                  </button>
                ) : (
                  <div className="flex h-[46px] min-w-0 flex-1 items-center text-meta text-app-subtle">
                    {activeTab.loading ? '正在读取玩家...' : '暂无玩家信息'}
                  </div>
                )}

                <div className="flex shrink-0 items-center gap-0.5 self-start">
                  {isSaveMode ? (
                    <>
                      <button
                        type="button"
                        disabled={selectedSaveCount === 0}
                        onClick={() => void handleSaveSelectedMatches()}
                        className="h-6 rounded-sm bg-app-primary px-2 text-meta font-medium text-app-primary-foreground transition-colors enabled:hover:bg-app-primary-hover disabled:cursor-default disabled:opacity-40"
                      >
                        保存{selectedSaveCount > 0 ? ` ${selectedSaveCount} 场` : ''}
                      </button>
                      <button
                        type="button"
                        onClick={stopSaveMode}
                        className="h-6 rounded-sm px-2 text-meta text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      {activeTab.result?.profile.riotId && (
                        <button
                          type="button"
                          aria-label={addingFriendTabId === activeTab.id ? '正在发送好友请求' : '加为好友'}
                          disabled={addingFriendTabId === activeTab.id}
                          onClick={() => void handleAddCurrentPlayerFriend()}
                          className="flex size-7 items-center justify-center rounded-sm text-app-subtle outline-none transition-colors hover:bg-app-nav-hover hover:text-app-text focus-visible:bg-app-nav-hover focus-visible:text-app-text disabled:opacity-40"
                          title={addingFriendTabId === activeTab.id ? '发送中' : '加为好友'}
                        >
                          {addingFriendTabId === activeTab.id ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <UserPlus className="size-4" />
                          )}
                        </button>
                      )}
                      {activeTab.source === 'saved' ? (
                        <span
                          className="flex size-7 items-center justify-center text-gold"
                          title="已保存的战绩"
                          aria-label="已保存的战绩"
                        >
                          <BookmarkCheck className="size-4" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label="挑选对局保存"
                          title="挑选对局保存"
                          onClick={() => {
                            setProfilePanelTabId(null);
                            setSaveModeTabId(activeTab.id);
                          }}
                          className="flex size-7 items-center justify-center rounded-sm text-app-subtle outline-none transition-colors hover:bg-app-nav-hover hover:text-app-text focus-visible:bg-app-nav-hover focus-visible:text-app-text"
                        >
                          <Bookmark className="size-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 flex h-7 items-center gap-2.5">
                <div className="flex min-w-0 flex-1 items-baseline gap-2 truncate text-meta text-app-muted">
                  {activeTab.loading ? (
                    <span className="text-app-subtle">加载战绩中...</span>
                  ) : headerWinRate !== null ? (
                    <>
                      <span className="num text-title leading-none font-bold tracking-[-0.01em] text-app-text">
                        {headerWinRate}
                        <span className="ml-px text-meta font-semibold text-app-muted">%</span>
                      </span>
                      <span className="num">
                        <b className="font-semibold text-ally">{headerWins}</b> 胜{' '}
                        <b className="font-semibold text-enemy">{headerLosses}</b> 负
                      </span>
                      <span className="num truncate text-app-subtle">
                        {activeTab.pageLoading ? '读取中…' : `近 ${headerMatches.length} 场`}
                      </span>
                    </>
                  ) : (
                    <span className="text-app-subtle">{activeTab.result?.error ?? '暂无战绩'}</span>
                  )}
                </div>
                <QueueFilterMenu value={activeTab.filterQueue} onChange={handleFilterChange} ranks={headerRanks} />
              </div>
              {friendNotice?.tabId === activeTab.id && (
                <div
                  className={`absolute right-3 top-[calc(100%_-_2px)] z-30 max-w-[250px] rounded-sm border bg-app-surface px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-ui-popover)] ${
                    friendNotice.success
                      ? 'border-app-success/20 text-app-success'
                      : 'border-app-danger/20 text-app-danger'
                  }`}
                >
                  {friendNotice.message}
                </div>
              )}
            </div>
          )}

          <div
            ref={historyScrollRef}
            onScroll={handleHistoryScroll}
            className="match-history-focus-viewport scrollbar-none relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 pt-1.5 pb-2"
          >
            {activeTab?.loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-meta text-text-3" aria-live="polite">
                <LoaderCircle className="size-3.5 animate-spin" />
                正在读取战绩…
              </div>
            ) : displayedMatches.length > 0 ? (
              <MatchList
                matches={displayedMatches}
                selectedGameId={activeTab?.selectedGameId ?? null}
                onSelect={(gameId) => {
                  if (!activeTab) return;
                  setProfilePanelTabId(null);
                  updateTab(activeTab.id, (tab) => ({ ...tab, selectedGameId: gameId }));
                }}
                recurringMates={recurringMates}
                targetPuuid={targetPuuid}
                selectionMode={isSaveMode}
                selectedIds={selectedSaveIds}
                onToggleSelection={handleToggleSaveSelection}
                onMateClick={(riotId) => {
                  setProfilePanelTabId(null);
                  openSearchTab(riotId, activeTab?.region ?? '');
                }}
                activeDayKey={activeHistoryDay}
                viewportRange={historyViewportRange}
              />
            ) : activeTab?.result?.error ? (
              <EmptyState
                className="h-full"
                icon={<CircleAlert />}
                title="没查到战绩"
                description={activeTab.result.error}
              />
            ) : (
              <EmptyState
                className="h-full"
                icon={<HistoryIcon />}
                title={activeTab ? '暂无对局' : '输入 名字#编号 查询'}
              />
            )}
            {activeTab?.pageLoading && (
              <div className="match-history-loading" aria-live="polite">
                <span />
                <em>正在读取更早战绩</em>
              </div>
            )}
          </div>

          {activeTab && activeTab.matches.length > 0 && (
            <MonthActivityNavigator
              matches={activeTab.matches}
              activeDayKey={activeHistoryDay}
              hasMore={activeTab.hasMore}
              loading={activeTab.pageLoading}
              scrollProgress={historyScrollProgress}
              onDaySelect={scrollToHistoryDay}
              onDayPreview={previewHistoryDay}
            />
          )}
        </div>

        <div className="scrollbar-none min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-app-surface">
          {isProfilePanelOpen && activeTab?.result ? (
            <div className="p-4">
              <PlayerProfilePanel result={activeTab.result} matches={activeTab.matches} />
            </div>
          ) : selectedMatch && activeTab ? (
            <MatchDetail
              match={selectedMatch}
              targetPuuid={activeTab.result?.profile.puuid ?? ''}
              region={activeTab.region}
              recurringMates={recurringMates}
              onPlayerSearch={handlePlayerSearch}
            />
          ) : (
            <EmptyState
              className="h-full"
              icon={<MousePointerClick />}
              title="选择一场对局"
            />
          )}
        </div>
      </div>
    </div>
  );
}
