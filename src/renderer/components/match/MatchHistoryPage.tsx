import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, MailPlus, X } from 'lucide-react';
import { MatchList, type RecurringMate } from './MatchList';
import { MatchDetail } from './MatchDetail';
import type { PlayerLookupResult, PlayerMatchDetail } from '../../../shared/api';
import { ProfileIcon } from '../ProfileIcon';
import { RankEmblem } from '../RankEmblem';
import { saveMatchesForProfile, type SavedMatchAccount } from './savedMatchesStore';
import { LOL_REGIONS } from '../../../shared/constants';

const PAGE_SIZE = 12;
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

// 模式筛选选项（tag → 中文名，tag 是 SGP 的 q_{queueId} 格式）
const QUEUE_FILTERS = [
  { key: '', tag: '', name: '全部' },
  { key: '420', tag: 'q_420', name: '单双排' },
  { key: '440', tag: 'q_440', name: '灵活组排' },
  { key: '450', tag: 'q_450', name: '大乱斗' },
  { key: '2400', tag: 'q_2400', name: '海克斯大乱斗' },
  { key: '490', tag: 'q_490', name: '快速模式' },
  { key: '1700', tag: 'q_1700', name: '竞技场' },
];

function QueueFilterMenu({
  value,
  onChange,
}: {
  value: string;
  onChange: (queueKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeFilter = QUEUE_FILTERS.find((filter) => filter.key === value) ?? QUEUE_FILTERS[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 min-w-[102px] items-center justify-between gap-2 rounded-sm border px-2.5 text-xs transition-[background-color,border-color,box-shadow] ${
          open
            ? 'border-app-border-strong bg-app-surface shadow-ui-neutral-ring'
            : 'border-app-border-strong bg-app-surface shadow-ui-neutral-sm hover:border-app-primary/25'
        }`}
      >
        <span className="truncate text-app-body">{activeFilter.name}</span>
        <ChevronDown className={`size-3.5 text-app-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-10 right-0 z-30 w-40 rounded-md border border-app-border bg-app-surface p-1 shadow-[var(--shadow-ui-popover)]"
        >
          {QUEUE_FILTERS.map((filter) => {
            const selected = filter.key === activeFilter.key;
            return (
              <button
                key={filter.key}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onChange(filter.key);
                }}
                className={`flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors ${
                  selected
                    ? 'bg-app-selected font-medium text-app-text'
                    : 'text-app-body hover:bg-app-nav-hover hover:text-app-text'
                }`}
              >
                <Check className={`size-3.5 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                <span>{filter.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getPageNumbers(currentPage: number, totalPages: number): number[] {
  const maxVisible = 5;
  const half = Math.floor(maxVisible / 2);
  const start = Math.max(1, Math.min(currentPage - half, totalPages - maxVisible + 1));
  const end = Math.min(totalPages, start + maxVisible - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function getDisplayedMatches(matches: PlayerMatchDetail[], page: number): PlayerMatchDetail[] {
  const start = (page - 1) * PAGE_SIZE;
  return matches.slice(start, start + PAGE_SIZE);
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
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-app-surface-soft text-[10px] text-app-subtle">
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
          <div className="text-[11px] text-app-subtle">按当前已加载战绩统计</div>
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
  const transparentDragImageRef = useRef<HTMLCanvasElement | null>(null);
  const tabLoadSeqRef = useRef<Record<string, number>>({});
  const friendNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

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

  const getTransparentDragImage = () => {
    if (!transparentDragImageRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      transparentDragImageRef.current = canvas;
    }
    return transparentDragImageRef.current;
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
  const displayedMatches = activeTab ? getDisplayedMatches(activeTab.matches, activeTab.currentPage) : [];

  // 计算经常一起玩的队友（所有已加载对局中出现≥2次的同队玩家）
  const recurringMates = new Map<string, RecurringMate>();
  const targetPuuid = activeTab?.result?.profile.puuid ?? '';
  if (activeTab && targetPuuid) {
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
      if (info.count >= 2) {
        recurringMates.set(puuid, {
          puuid,
          riotId: info.riotId,
          profileIconId: info.iconId,
          profileIconUrl: info.icon,
          count: info.count,
        });
      }
    }
  }
  const knownPages = activeTab ? Math.max(1, Math.ceil(activeTab.matches.length / PAGE_SIZE)) : 1;
  const totalPages = activeTab?.hasMore ? knownPages + 5 : knownPages;
  const pageNumbers = activeTab ? getPageNumbers(activeTab.currentPage, totalPages) : [];
  const isProfilePanelOpen = activeTab ? profilePanelTabId === activeTab.id : false;
  const isSaveMode = activeTab ? saveModeTabId === activeTab.id : false;
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

  const handlePageChange = async (page: number) => {
    if (!activeTab || activeTab.loading || activeTab.pageLoading) return;
    setProfilePanelTabId(null);

    const targetEnd = page * PAGE_SIZE;
    if (targetEnd <= activeTab.matches.length || !activeTab.hasMore) {
      const pageMatches = getDisplayedMatches(activeTab.matches, page);
      updateTab(activeTab.id, (tab) => ({
        ...tab,
        currentPage: page,
        selectedGameId: pageMatches[0]?.gameId ?? tab.selectedGameId,
      }));
      return;
    }

    const requestSeq = (tabLoadSeqRef.current[activeTab.id] ?? 0) + 1;
    tabLoadSeqRef.current[activeTab.id] = requestSeq;
    const isLatestRequest = () => tabLoadSeqRef.current[activeTab.id] === requestSeq;

    updateTab(activeTab.id, (tab) => ({ ...tab, pageLoading: true }));

    try {
      let nextMatches = [...activeTab.matches];
      let loadedUpTo = activeTab.loadedUpTo;
      let hasMore: boolean = activeTab.hasMore;
      let result = activeTab.result;
      let guard = 0;

      while (hasMore && targetEnd > nextMatches.length && guard < 5) {
        const currentTag = QUEUE_FILTERS.find((f) => f.key === activeTab.filterQueue)?.tag;
        const response = await requestBatch(activeTab.query, activeTab.region, loadedUpTo, currentTag);
        if (!isLatestRequest()) return;
        const existingIds = new Set(nextMatches.map((match) => match.gameId));
        const additions = response.matches.filter((match) => !existingIds.has(match.gameId));
        nextMatches = [...nextMatches, ...additions];
        loadedUpTo += response.matches.length;
        hasMore = response.matches.length >= SGP_BATCH;
        result = result ?? response;
        if (additions.length === 0) break;
        guard++;
      }

      if (!isLatestRequest()) return;
      const pageMatches = getDisplayedMatches(nextMatches, page);
      updateTab(activeTab.id, (tab) => ({
        ...tab,
        pageLoading: false,
        result,
        matches: nextMatches,
        loadedUpTo,
        hasMore,
        currentPage: page,
        selectedGameId: pageMatches[0]?.gameId ?? tab.selectedGameId,
      }));
    } catch (err) {
      if (!isLatestRequest()) return;
      console.error('[match] 翻页加载失败:', err);
      updateTab(activeTab.id, (tab) => ({ ...tab, pageLoading: false }));
    }
  };

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

  const handleDragOverTab = (overTabId: string, clientX: number, targetRect: DOMRect) => {
    if (!draggingTabId || draggingTabId === overTabId) return;
    const targetMiddleX = targetRect.left + targetRect.width / 2;

    setTabs((currentTabs) => {
      const from = currentTabs.findIndex((tab) => tab.id === draggingTabId);
      const to = currentTabs.findIndex((tab) => tab.id === overTabId);
      if (from < 0 || to < 0) return currentTabs;
      if (from < to && clientX < targetMiddleX) return currentTabs;
      if (from > to && clientX > targetMiddleX) return currentTabs;

      const nextTabs = [...currentTabs];
      const [moved] = nextTabs.splice(from, 1);
      nextTabs.splice(to, 0, moved);
      return nextTabs;
    });
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
      <div className="flex h-11 shrink-0 items-center border-b border-app-border bg-app-surface px-2 [-webkit-app-region:no-drag]">
        <div className="scrollbar-none flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden py-1.5">
          {tabs.map((tab) => {
            const tabLabel = getTabLabel(tab);
            const isPressedOrDragging = tab.id === draggingTabId || tab.id === pressedTabId;
            return (
              <div
                key={tab.id}
                draggable
                onMouseDown={(event) => {
                  if (event.button === 0) setPressedTabId(tab.id);
                }}
                onDragStart={(event) => {
                  setDraggingTabId(tab.id);
                  setPressedTabId(null);
                  setActiveTabId(tab.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
                }}
                onDragEnd={() => {
                  setDraggingTabId(null);
                  setPressedTabId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  handleDragOverTab(tab.id, event.clientX, event.currentTarget.getBoundingClientRect());
                }}
                onDrop={(event) => event.preventDefault()}
                className={`group flex h-8 min-w-[108px] max-w-52 shrink-0 items-center gap-2 rounded-md border px-2.5 pr-1.5 text-xs transition-[background-color,color,border-color,opacity,transform,box-shadow] duration-150 ${
                  isPressedOrDragging ? 'cursor-grabbing' : 'cursor-default'
                } ${
                  tab.id === activeTabId
                    ? 'border-app-border bg-app-selected text-app-text shadow-[var(--shadow-ui-sm)]'
                    : 'border-transparent bg-transparent text-app-muted hover:bg-app-nav-hover hover:text-app-text'
                } ${tab.id === draggingTabId ? 'z-10 scale-[0.98] opacity-[0.65] shadow-airbnb' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className="flex min-w-0 flex-1 cursor-inherit items-center gap-2 text-left"
                  title={tabLabel}
                >
                  <ProfileIcon
                    iconId={tab.result?.profile.profileIconId}
                    src={tab.result?.profile.profileIconUrl}
                    alt={tabLabel}
                    title={tabLabel}
                    size={22}
                    className={`ring-1 ${
                      tab.id === activeTabId ? 'ring-app-border-strong' : 'ring-app-border'
                    }`}
                  />
                  <span
                    className={`min-w-0 truncate ${
                      tab.id === activeTabId ? 'font-semibold text-app-text' : 'font-medium'
                    }`}
                  >
                    {tabLabel}
                  </span>
                  {tab.loading && (
                    <span className="size-1.5 shrink-0 rounded-full bg-app-primary shadow-ui-focus" />
                  )}
                </button>
                <button
                  type="button"
                  title="关闭"
                  aria-label="关闭标签页"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  className={`flex size-5 shrink-0 items-center justify-center rounded-sm text-app-subtle transition-[background-color,color,opacity] hover:bg-app-nav-hover hover:text-app-text group-hover:opacity-100 focus:opacity-100 ${
                    tab.id === activeTabId ? 'opacity-60' : 'opacity-0'
                  }`}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 bg-app-bg-soft">
        <div className="flex w-[292px] shrink-0 flex-col border-r border-app-border bg-app-bg-soft">
          {activeTab && (
            <div className="relative shrink-0 border-b border-app-border bg-app-surface px-3 py-3">
              <div className="flex items-center gap-2">
                {activeTab.result?.profile ? (
                  <button
                    type="button"
                    disabled={!activeTab.result.profile.puuid}
                    onClick={() =>
                      setProfilePanelTabId((current) => (current === activeTab.id ? null : activeTab.id))
                    }
                    className={`flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 text-left transition-colors disabled:cursor-default disabled:opacity-50 ${
                      isProfilePanelOpen
                        ? 'bg-app-selected text-app-text'
                        : 'text-app-body hover:bg-app-nav-hover hover:text-app-text'
                    }`}
                    title={activeTab.result.profile.riotId}
                  >
                    <ProfileIcon
                      iconId={activeTab.result.profile.profileIconId}
                      src={activeTab.result.profile.profileIconUrl}
                      alt={getDisplayName(activeTab.result.profile.riotId)}
                      size={28}
                      className="ring-1 ring-app-border"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {getDisplayName(activeTab.result.profile.riotId)}
                    </span>
                  </button>
                ) : (
                  <div className="flex h-10 min-w-0 flex-1 items-center text-xs text-app-subtle">
                    {activeTab.loading ? '正在读取玩家...' : '暂无玩家信息'}
                  </div>
                )}
                <QueueFilterMenu value={activeTab.filterQueue} onChange={handleFilterChange} />
              </div>

              <div className="mt-2 flex h-7 items-center justify-between gap-2 border-t border-app-border pt-2 text-[11px] text-app-muted">
                <div className="min-w-0 truncate tabular-nums">
                  {activeTab.loading ? (
                    <span className="text-app-subtle">加载战绩中...</span>
                  ) : activeTab.matches.length > 0 ? (
                    <>
                      <span className="font-medium text-app-success">
                        {activeTab.matches.filter((match) => match.win).length} 胜
                      </span>
                      <span className="mx-1.5 text-app-border-strong">/</span>
                      <span className="font-medium text-app-danger">
                        {activeTab.matches.filter((match) => !match.win).length} 负
                      </span>
                      <span className="ml-2 text-app-subtle">已加载 {activeTab.matches.length} 场</span>
                      {activeTab.pageLoading && <span className="ml-1.5 text-app-primary">读取中</span>}
                    </>
                  ) : (
                    <span className="text-app-subtle">{activeTab.result?.error ?? '暂无战绩'}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!isSaveMode && activeTab.result?.profile.riotId && (
                    <button
                      type="button"
                      disabled={addingFriendTabId === activeTab.id}
                      onClick={() => void handleAddCurrentPlayerFriend()}
                      className="flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] font-medium text-app-muted transition-colors hover:bg-app-primary-soft hover:text-app-primary disabled:opacity-50"
                      title="添加好友"
                    >
                      <MailPlus className="size-3" />
                      {addingFriendTabId === activeTab.id ? '发送中' : '加好友'}
                    </button>
                  )}
                  {isSaveMode ? (
                    <>
                      <button
                        type="button"
                        disabled={selectedSaveCount === 0}
                        onClick={() => void handleSaveSelectedMatches()}
                        className="h-6 rounded-sm bg-app-primary px-2 text-[11px] font-medium text-app-primary-foreground transition-colors enabled:hover:bg-app-primary-hover disabled:cursor-default disabled:opacity-40"
                      >
                        保存{selectedSaveCount > 0 ? selectedSaveCount : ''}
                      </button>
                      <button
                        type="button"
                        onClick={stopSaveMode}
                        className="h-6 rounded-sm px-2 text-[11px] text-app-muted transition-colors hover:bg-app-nav-hover hover:text-app-text"
                      >
                        取消
                      </button>
                    </>
                  ) : activeTab.source === 'saved' ? (
                    <span className="h-6 rounded-sm bg-app-surface-soft px-2 leading-6 text-[11px] font-medium text-app-muted">
                      本地保存
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setProfilePanelTabId(null);
                        setSaveModeTabId(activeTab.id);
                      }}
                      className="h-6 rounded-sm px-2 text-[11px] font-medium text-app-primary transition-colors hover:bg-app-primary-soft"
                    >
                      保存战绩
                    </button>
                  )}
                </div>
              </div>
              {friendNotice?.tabId === activeTab.id && (
                <div
                  className={`absolute right-3 top-[calc(100%_-_2px)] z-30 max-w-[250px] rounded-sm border px-2.5 py-1.5 text-[11px] shadow-md ${
                    friendNotice.success
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-app-danger/20 bg-app-danger/10 text-app-danger'
                  }`}
                >
                  {friendNotice.message}
                </div>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 p-2.5">
            {activeTab?.loading ? (
              <div className="flex h-full items-center justify-center text-xs text-app-subtle">加载中...</div>
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
              />
            ) : activeTab?.result?.error ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-app-danger">
                {activeTab.result.error}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-app-subtle">
                查询战绩
              </div>
            )}
          </div>

          {activeTab && activeTab.matches.length > 0 && (
            <div className="shrink-0 border-t border-app-border bg-app-surface px-3 py-2">
              <div className="mx-auto flex h-7 w-max max-w-full items-center gap-0.5">
                <button
                  type="button"
                  title="上一页"
                  aria-label="上一页"
                  disabled={activeTab.loading || activeTab.pageLoading || activeTab.currentPage <= 1}
                  onClick={() => handlePageChange(activeTab.currentPage - 1)}
                  className="flex size-6 items-center justify-center rounded-sm text-app-muted transition-colors enabled:hover:bg-app-nav-hover enabled:hover:text-app-text disabled:opacity-25"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <div className="flex items-center gap-0.5">
                  {pageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      disabled={activeTab.loading || activeTab.pageLoading}
                      onClick={() => handlePageChange(page)}
                      className={`h-6 min-w-6 rounded-sm px-1.5 text-[11px] font-medium tabular-nums transition-colors ${
                        page === activeTab.currentPage
                          ? 'bg-app-primary-soft text-app-primary'
                          : 'text-app-muted hover:bg-app-nav-hover hover:text-app-text'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  title="下一页"
                  aria-label="下一页"
                  disabled={
                    activeTab.loading ||
                    activeTab.pageLoading ||
                    (activeTab.currentPage >= totalPages && !activeTab.hasMore)
                  }
                  onClick={() => handlePageChange(activeTab.currentPage + 1)}
                  className="flex size-6 items-center justify-center rounded-sm text-app-muted transition-colors enabled:hover:bg-app-nav-hover enabled:hover:text-app-text disabled:opacity-25"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
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
            <div className="flex h-full items-center justify-center text-xs text-app-subtle">
              选择左侧的一场对局查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
