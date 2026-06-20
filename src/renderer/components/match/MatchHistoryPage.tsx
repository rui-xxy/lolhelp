import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { MatchList } from './MatchList';
import { MatchDetail } from './MatchDetail';
import type { PlayerLookupResult, PlayerMatchDetail } from '../../../shared/api';

// 每页展示条数
const PAGE_SIZE = 12;
// SGP 单次请求上限
const SGP_BATCH = 100;

function getPageNumbers(currentPage: number, totalPages: number): number[] {
  const maxVisible = 5;
  const half = Math.floor(maxVisible / 2);
  const start = Math.max(1, Math.min(currentPage - half, totalPages - maxVisible + 1));
  const end = Math.min(totalPages, start + maxVisible - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

// 战绩查询页：左侧历史列表（固定分页）+ 右侧对局详情。
// 翻页：前 N 页从已加载数据切片（瞬时）；翻到未加载区间时，按需向 SGP 请求批次累加。
// 用 ref 同步跟踪累加数据，避免 setState 异步导致翻页逻辑读到旧值卡死。
export function MatchHistoryPage() {
  const [searchName, setSearchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [result, setResult] = useState<PlayerLookupResult | null>(null);
  const [, forceUpdate] = useState(0);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // 用 ref 同步持有累加数据，翻页逻辑直接读 ref（同步，无 setState 延迟）
  const matchesRef = useRef<PlayerMatchDetail[]>([]);
  const loadedUpToRef = useRef(0); // 已加载到第几条
  const hasMoreRef = useRef(false); // SGP 是否还有更早批次

  // 向 SGP 请求下一批，累加到 ref。返回本批新增数。
  async function fetchNextBatch(name: string): Promise<number> {
    const startIndex = loadedUpToRef.current;
    const res = await window.lolHelper.match.search({
      name,
      startIndex,
      pageSize: SGP_BATCH,
    });
    const existing = new Set(matchesRef.current.map((m) => m.gameId));
    const newOnes = res.matches.filter((m) => !existing.has(m.gameId));
    matchesRef.current = [...matchesRef.current, ...newOnes];
    loadedUpToRef.current = startIndex + res.matches.length;
    hasMoreRef.current = res.matches.length >= SGP_BATCH;
    if (!result && res.matches.length > 0) {
      setResult(res);
    } else if (res.matches.length === 0 && matchesRef.current.length === 0) {
      setResult(res); // 错误结果
    }
    return newOnes.length;
  }

  const runSearch = async (name: string) => {
    if (loading) return;
    setLoading(true);
    matchesRef.current = [];
    loadedUpToRef.current = 0;
    hasMoreRef.current = false;
    setCurrentPage(1);
    setSelectedGameId(null);
    setResult(null);
    forceUpdate((n) => n + 1);
    try {
      await fetchNextBatch(name);
      forceUpdate((n) => n + 1);
      if (matchesRef.current.length > 0) {
        setSelectedGameId(matchesRef.current[0].gameId);
      }
    } catch (err) {
      setResult({
        profile: { riotId: '', puuid: '', level: 0, profileIconId: 0, profileIconUrl: '' },
        matches: [],
        summary: { wins: 0, losses: 0, averageKda: 0, averageDamage: 0, averageCs: 0 },
        totalMatches: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchName.trim());
  };

  // 翻页：若目标页超出已加载，串行加载批次直到覆盖（加载期间保留当前页，不清空）。
  const handlePageChange = async (page: number) => {
    if (loading || pageLoading) return;
    const targetEnd = page * PAGE_SIZE;
    // 目标页在已加载范围内 → 直接切页（瞬时）
    if (targetEnd <= matchesRef.current.length || !hasMoreRef.current) {
      setCurrentPage(page);
      const start = (page - 1) * PAGE_SIZE;
      const pageMatches = matchesRef.current.slice(start, start + PAGE_SIZE);
      if (pageMatches.length > 0) setSelectedGameId(pageMatches[0].gameId);
      return;
    }
    // 需要加载更多批次：加载期间不切 currentPage（保留当前页内容），加载完再切
    setPageLoading(true);
    try {
      let guard = 0;
      while (
        hasMoreRef.current &&
        page * PAGE_SIZE > matchesRef.current.length &&
        guard < 5
      ) {
        const got = await fetchNextBatch(searchName.trim());
        if (got === 0) break;
        guard++;
      }
      forceUpdate((n) => n + 1);
      // 加载完成后再切到目标页（此时该页数据已就绪，列表不会闪空）
      setCurrentPage(page);
      const start = (page - 1) * PAGE_SIZE;
      const pageMatches = matchesRef.current.slice(start, start + PAGE_SIZE);
      if (pageMatches.length > 0) setSelectedGameId(pageMatches[0].gameId);
    } catch (err) {
      console.error('[match] 翻页加载失败:', err);
    } finally {
      setPageLoading(false);
    }
  };

  const matches = matchesRef.current;
  const selectedMatch = matches.find((m) => m.gameId === selectedGameId);
  const displayedMatches = matches.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const knownPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const totalPages = hasMoreRef.current ? knownPages + 5 : knownPages;
  const pageStart = displayedMatches.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = displayedMatches.length > 0 ? pageStart + displayedMatches.length - 1 : 0;
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex h-full flex-col bg-app-bg">
      {/* 搜索栏 */}
      <div className="shrink-0 border-b border-app-border bg-app-surface px-4 py-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-subtle" />
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="留空查询自己，或输入召唤师名"
              className="h-9 w-full rounded-sm border border-app-border bg-app-surface-soft pr-3 pl-9 text-sm text-app-text placeholder:text-app-subtle focus:border-app-primary focus:bg-app-surface focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-9 rounded-sm bg-app-primary px-4 text-sm font-medium text-white transition-colors enabled:hover:bg-app-primary-hover disabled:opacity-50"
          >
            {loading ? '查询中…' : '查询'}
          </button>
        </form>
      </div>

      {/* 主体：双栏 */}
      <div className="flex min-h-0 flex-1 bg-app-bg-soft">
        {/* 左侧：历史列表（固定分页） */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-app-border bg-app-sidebar">
          {result && matches.length > 0 && (
            <div className="shrink-0 border-b border-app-border px-3 py-2 text-[11px] text-app-muted">
              <span className="text-app-success">{result.summary.wins}</span>胜{' '}
              <span className="text-app-danger">{result.summary.losses}</span>败 ·
              均KDA {result.summary.averageKda} ·
              已加载 {matches.length} 场
              {pageLoading && <span className="ml-2 text-app-primary">加载更早战绩…</span>}
            </div>
          )}

          <div className="min-h-0 flex-1 p-2.5">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-app-subtle">
                加载中…
              </div>
            ) : displayedMatches.length > 0 ? (
              <MatchList
                matches={displayedMatches}
                selectedGameId={selectedGameId}
                onSelect={setSelectedGameId}
              />
            ) : result && result.error ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-app-danger">
                {result.error}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-app-subtle">
                查询战绩
              </div>
            )}
          </div>

          {matches.length > 0 && (
            <div className="shrink-0 border-t border-app-border bg-app-surface px-3 py-1.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-app-subtle">
                <span>显示 {pageStart}-{pageEnd}</span>
                <span>{hasMoreRef.current ? '可继续翻页加载更早战绩' : `${matches.length} 场（全部）`}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  title="上一页"
                  aria-label="上一页"
                  disabled={(loading || pageLoading) || currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="flex size-6 items-center justify-center rounded-xs border border-transparent bg-transparent text-app-muted transition-colors enabled:hover:bg-app-surface-soft enabled:hover:text-app-text disabled:opacity-30"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <div className="flex items-center gap-0.5 rounded-xs bg-app-surface-soft p-0.5">
                  {pageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      disabled={loading || pageLoading}
                      onClick={() => handlePageChange(page)}
                      className={`h-6 min-w-6 rounded-xs px-1.5 text-[11px] font-medium tabular-nums transition-colors ${
                        page === currentPage
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
                  disabled={(loading || pageLoading) || (currentPage >= totalPages && !hasMoreRef.current)}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="flex size-6 items-center justify-center rounded-xs border border-transparent bg-transparent text-app-muted transition-colors enabled:hover:bg-app-surface-soft enabled:hover:text-app-text disabled:opacity-30"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：对局详情 */}
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {selectedMatch ? (
            <MatchDetail match={selectedMatch} targetPuuid={result?.profile.puuid ?? ''} />
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
