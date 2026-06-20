import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { MatchList } from './MatchList';
import { MatchDetail } from './MatchDetail';
import type { PlayerLookupResult, PlayerMatchDetail } from '../../../shared/api';

const PAGE_SIZE = 12;
const MAX_HISTORY_MATCHES = 100;

function getPageNumbers(currentPage: number, totalPages: number): number[] {
  const maxVisible = 5;
  const half = Math.floor(maxVisible / 2);
  const start = Math.max(1, Math.min(currentPage - half, totalPages - maxVisible + 1));
  const end = Math.min(totalPages, start + maxVisible - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function getDisplayedMatches(matches: PlayerMatchDetail[], page: number): PlayerMatchDetail[] {
  if (matches.length <= PAGE_SIZE) return matches;
  const start = (page - 1) * PAGE_SIZE;
  return matches.slice(start, start + PAGE_SIZE);
}

// 战绩查询页：左侧历史列表 + 右侧对局详情。
// 状态：搜索词、加载态、查询结果（profile+matches+summary）、选中场次的 gameId。
// 输入召唤师名搜索 → window.lolHelper.match.search → 渲染列表 → 点选查看详情。
export function MatchHistoryPage() {
  const [searchName, setSearchName] = useState('');
  const [queryName, setQueryName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlayerLookupResult | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const runSearch = async (name: string, page: number) => {
    if (loading) return;
    setLoading(true);
    setSelectedGameId(null);
    try {
      const res = await window.lolHelper.match.search({ name, page, pageSize: PAGE_SIZE });
      setResult(res);
      const nextMatches = getDisplayedMatches(res.matches, page);
      // 默认选中第一场
      if (nextMatches.length > 0) {
        setSelectedGameId(nextMatches[0].gameId);
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
    if (loading) return;
    const nextQuery = searchName.trim();
    setQueryName(nextQuery);
    setCurrentPage(1);
    await runSearch(nextQuery, 1);
  };

  const handlePageChange = async (page: number) => {
    if (loading || !result) return;
    const totalAvailable = Math.min(result.totalMatches, MAX_HISTORY_MATCHES);
    const totalPages = Math.max(1, Math.ceil(totalAvailable / PAGE_SIZE));
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    if (nextPage === currentPage) return;
    setCurrentPage(nextPage);
    await runSearch(queryName, nextPage);
  };

  const selectedMatch: PlayerMatchDetail | undefined = result?.matches.find(
    (m) => m.gameId === selectedGameId,
  );
  const displayedMatches = result ? getDisplayedMatches(result.matches, currentPage) : [];
  const totalAvailable = result ? Math.min(result.totalMatches, MAX_HISTORY_MATCHES) : 0;
  const totalPages = result ? Math.max(1, Math.ceil(totalAvailable / PAGE_SIZE)) : 1;
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
              placeholder="输入召唤师名，留空查询自己"
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
        {/* 左侧：历史列表（固定分页，不依赖滚动条） */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-app-border bg-app-sidebar">
          {/* 列表 */}
          <div className="min-h-0 flex-1 p-2.5">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-app-subtle">加载中…</div>
            ) : result && displayedMatches.length > 0 ? (
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
                输入召唤师名开始查询
              </div>
            )}
          </div>

          {result && result.matches.length > 0 && (
            <div className="shrink-0 border-t border-app-border bg-app-surface px-3 py-1.5">
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-app-subtle">
                <span>显示 {pageStart}-{pageEnd}</span>
                <span>{result.totalMatches > MAX_HISTORY_MATCHES ? `可翻看最近 ${MAX_HISTORY_MATCHES} 场` : `${result.totalMatches} 场`}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  title="上一页"
                  aria-label="上一页"
                  disabled={loading || currentPage <= 1}
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
                      disabled={loading}
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
                  disabled={loading || currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="flex size-6 items-center justify-center rounded-xs border border-transparent bg-transparent text-app-muted transition-colors enabled:hover:bg-app-surface-soft enabled:hover:text-app-text disabled:opacity-30"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}

          {result?.error && result.matches.length > 0 && (
            <div className="shrink-0 border-t border-app-border bg-app-surface px-3 py-2 text-[11px] leading-4 text-app-muted">
              {result.error}
            </div>
          )}
        </div>

        {/* 右侧：对局详情（只保留双队详情，专注战绩数据） */}
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
