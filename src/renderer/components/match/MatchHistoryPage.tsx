import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { MatchList, type RecurringMate } from './MatchList';
import { MatchDetail } from './MatchDetail';
import type { PlayerLookupResult, PlayerMatchDetail } from '../../../shared/api';

const PAGE_SIZE = 12;
const SGP_BATCH = 100;

interface MatchHistoryPageProps {
  searchName: string;
  searchTrigger: number;
  region?: string;
  onPlayerSearch?: (name: string) => void;
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
    profile: { riotId: '', puuid: '', level: 0, profileIconId: 0, profileIconUrl: '', rank: null },
    matches: [],
    summary: { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 },
    totalMatches: 0,
    error,
  };
}

function getRankText(profile: PlayerLookupResult['profile'] | null | undefined): string {
  return profile?.rank?.displayText || '未定级';
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

export function MatchHistoryPage({
  searchName,
  searchTrigger,
  region = '',
  onPlayerSearch,
}: MatchHistoryPageProps) {
  const [tabs, setTabs] = useState<MatchTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

  const tabsRef = useRef<MatchTab[]>([]);
  const lastTriggerRef = useRef(0);
  const transparentDragImageRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

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
    updateTab(tabId, (tab) => ({
      ...tab,
      loading: true,
      pageLoading: false,
      result: null,
      matches: [],
      loadedUpTo: 0,
      hasMore: false,
      selectedGameId: null,
      currentPage: 1,
      filterQueue: tag ? QUEUE_FILTERS.find((f) => f.tag === tag)?.key ?? '' : '',
    }));

    try {
      const result = await requestBatch(query, regionKey, 0, tag);
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
      const errorResult = createEmptyResult(err instanceof Error ? err.message : String(err));
      updateTab(tabId, (tab) => ({
        ...tab,
        title: makeTabTitle(query, errorResult),
        loading: false,
        result: errorResult,
      }));
    }
  };

  const openSearchTab = (rawQuery: string, regionKey: string) => {
    const query = rawQuery.trim();
    const existingTab = tabsRef.current.find((tab) => tab.query === query && tab.region === regionKey);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      if (
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
    };

    setTabs((currentTabs) => [...currentTabs, tab]);
    setActiveTabId(tabId);
    void loadInitialTab(tabId, query, regionKey);
  };

  useEffect(() => {
    if (searchTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = searchTrigger;
    if (searchTrigger > 0) {
      openSearchTab(searchName, region);
    }
  }, [searchTrigger, searchName, region]);

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
  const pageStart = activeTab && displayedMatches.length > 0 ? (activeTab.currentPage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = displayedMatches.length > 0 ? pageStart + displayedMatches.length - 1 : 0;
  const pageNumbers = activeTab ? getPageNumbers(activeTab.currentPage, totalPages) : [];

  // 切换模式筛选：重新向 SGP 查询该模式的战绩（不是前端过滤）
  const handleFilterChange = (queueKey: string) => {
    if (!activeTab) return;
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
        const existingIds = new Set(nextMatches.map((match) => match.gameId));
        const additions = response.matches.filter((match) => !existingIds.has(match.gameId));
        nextMatches = [...nextMatches, ...additions];
        loadedUpTo += response.matches.length;
        hasMore = response.matches.length >= SGP_BATCH;
        result = result ?? response;
        if (additions.length === 0) break;
        guard++;
      }

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
      console.error('[match] 翻页加载失败:', err);
      updateTab(activeTab.id, (tab) => ({ ...tab, pageLoading: false }));
    }
  };

  const handleCloseTab = (tabId: string) => {
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
    if (onPlayerSearch) {
      onPlayerSearch(riotId);
    } else {
      openSearchTab(riotId, region);
    }
  };

  return (
    <div className="flex h-full flex-col bg-app-bg">
      <div className="flex h-9 shrink-0 items-end border-b border-app-border bg-app-surface px-3 [-webkit-app-region:no-drag]">
        <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              draggable
              onDragStart={(event) => {
                setDraggingTabId(tab.id);
                setActiveTabId(tab.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
              }}
              onDragEnd={() => setDraggingTabId(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                handleDragOverTab(tab.id, event.clientX, event.currentTarget.getBoundingClientRect());
              }}
              onDrop={(event) => event.preventDefault()}
              className={`group flex h-7 max-w-44 cursor-grab items-center gap-1.5 rounded-t-sm border border-b-0 px-2 text-xs transition-[background-color,color,border-color,opacity,transform,box-shadow] duration-150 active:cursor-grabbing ${
                tab.id === activeTabId
                  ? 'border-app-border bg-app-bg-soft text-app-text'
                  : 'border-transparent bg-transparent text-app-muted hover:bg-app-surface-soft hover:text-app-text'
              } ${tab.id === draggingTabId ? 'z-10 scale-[0.98] opacity-[0.65] shadow-airbnb' : ''}`}
            >
              <button
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                className="min-w-0 flex-1 truncate text-left"
                title={tab.title}
              >
                {tab.loading ? '加载中...' : tab.title}
              </button>
              <button
                type="button"
                title="关闭"
                aria-label="关闭标签页"
                onClick={(event) => {
                  event.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                className="flex size-4 shrink-0 items-center justify-center rounded-xs text-app-subtle opacity-0 transition-opacity hover:bg-app-nav-hover hover:text-app-text group-hover:opacity-100 focus:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 bg-app-bg-soft">
        <div className="flex w-[300px] shrink-0 flex-col border-r border-app-border bg-app-sidebar">
          {/* 汇总统计（常驻，loading 时显示占位） */}
          {activeTab && (
            <div className="shrink-0 border-b border-app-border px-3 py-2 text-[11px] text-app-muted">
              {activeTab.loading ? (
                <span className="text-app-subtle">加载中...</span>
              ) : activeTab.matches.length > 0 ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate">
                    <span className="text-app-success">{activeTab.matches.filter((match) => match.win).length}</span>胜{' '}
                    <span className="text-app-danger">{activeTab.matches.filter((match) => !match.win).length}</span>败 ·
                    已加载 {activeTab.matches.length} 场
                    {activeTab.pageLoading && <span className="ml-2 text-app-primary">加载更早战绩...</span>}
                  </div>
                  <span className="max-w-[120px] shrink-0 truncate text-right font-medium text-app-text">
                    {getRankText(activeTab.result?.profile)}
                  </span>
                </div>
              ) : (
                <span className="text-app-subtle">{activeTab.result?.error ?? '暂无战绩'}</span>
              )}
            </div>
          )}

          {/* 模式筛选（常驻显示，不依赖有无战绩数据） */}
          {activeTab && (
            <div className="flex shrink-0 items-center border-b border-app-border px-3 py-1.5">
              <select
                value={activeTab.filterQueue}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="h-6 flex-1 rounded-xs border border-app-border bg-app-surface-soft px-1.5 text-[11px] text-app-text focus:border-app-primary focus:outline-none"
              >
                {QUEUE_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
              </select>
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
                  updateTab(activeTab.id, (tab) => ({ ...tab, selectedGameId: gameId }));
                }}
                recurringMates={recurringMates}
                targetPuuid={targetPuuid}
                onMateClick={(riotId) => {
                  // 点击队友头像 → 用他的 Riot ID 开新搜索
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
            <div className="shrink-0 border-t border-app-border bg-app-surface px-3 py-1.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-app-subtle">
                <span>显示 {pageStart}-{pageEnd}</span>
                <span>{activeTab.hasMore ? '可继续翻页加载更早战绩' : `${activeTab.matches.length} 场（全部）`}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  title="上一页"
                  aria-label="上一页"
                  disabled={activeTab.loading || activeTab.pageLoading || activeTab.currentPage <= 1}
                  onClick={() => handlePageChange(activeTab.currentPage - 1)}
                  className="flex size-6 items-center justify-center rounded-xs border border-transparent bg-transparent text-app-muted transition-colors enabled:hover:bg-app-surface-soft enabled:hover:text-app-text disabled:opacity-30"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <div className="flex items-center gap-0.5 rounded-xs bg-app-surface-soft p-0.5">
                  {pageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      disabled={activeTab.loading || activeTab.pageLoading}
                      onClick={() => handlePageChange(page)}
                      className={`h-6 min-w-6 rounded-xs px-1.5 text-[11px] font-medium tabular-nums transition-colors ${
                        page === activeTab.currentPage
                          ? 'bg-app-text text-white'
                          : 'text-app-muted hover:bg-app-surface hover:text-app-text'
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
                  className="flex size-6 items-center justify-center rounded-xs border border-transparent bg-transparent text-app-muted transition-colors enabled:hover:bg-app-surface-soft enabled:hover:text-app-text disabled:opacity-30"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {selectedMatch && activeTab ? (
            <MatchDetail
              match={selectedMatch}
              targetPuuid={activeTab.result?.profile.puuid ?? ''}
              recurringMates={recurringMates}
              onPlayerSearch={handlePlayerSearch}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-sm border border-dashed border-app-border bg-app-surface text-xs text-app-subtle">
              选择左侧的一场对局查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
