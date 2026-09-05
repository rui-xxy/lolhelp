import { ArrowUp, ChevronLeft, ChevronRight, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MayhemComboResult, MayhemComboTier } from '../../../shared/api';

type TierFilter = 'all' | MayhemComboTier;
type ComboSort = 'featured' | 'votes' | 'tier';

const TIER_WEIGHT: Record<MayhemComboTier, number> = { 'S+': 5, S: 4, A: 3, B: 2, C: 1 };
const DISPLAY_PAGE_SIZE = 7 as const;
const TYPE_LABELS: Record<string, string> = {
  god: '神级',
  strong: '强力',
  trap: '陷阱',
  fun: '娱乐',
  entertainment: '娱乐',
  offmeta: '黑科技',
  blackTech: '黑科技',
  bug: 'Bug',
};

function ComboSkeleton() {
  return (
    <div className="mayhem-combo-skeleton" aria-label="正在载入强势组合">
      {Array.from({ length: DISPLAY_PAGE_SIZE }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function MayhemComboRanking() {
  const [result, setResult] = useState<MayhemComboResult | null>(null);
  const [tier, setTier] = useState<TierFilter>('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState<ComboSort>('featured');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadCombos = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const next = await window.lolHelper.ranking.getMayhemCombos(refresh);
      setResult(next);
      setError(next.error ?? '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '强势组合获取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCombos(false);
  }, [loadCombos]);

  const availableTypes = useMemo(() => Array.from(new Set(
    (result?.entries ?? []).flatMap((entry) => entry.types),
  )), [result?.entries]);

  const filteredEntries = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    const entries = (result?.entries ?? []).filter((entry) => {
      const matchesTier = tier === 'all' || entry.tier === tier;
      const matchesType = type === 'all' || entry.types.includes(type);
      const matchesSearch = !keyword || [
        entry.champion.name,
        entry.champion.slug,
        entry.augment.name,
        entry.description,
      ].join(' ').toLocaleLowerCase().includes(keyword);
      return matchesTier && matchesType && matchesSearch;
    });

    return entries.toSorted((left, right) => {
      if (sort === 'votes') return right.votes - left.votes || left.rank - right.rank;
      if (sort === 'tier') return TIER_WEIGHT[right.tier] - TIER_WEIGHT[left.tier] || right.rankScore - left.rankScore;
      return left.rank - right.rank;
    });
  }, [result?.entries, search, sort, tier, type]);

  const pageSize = DISPLAY_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const visibleEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, page, pageSize]);

  const pageItems = useMemo<(number | 'gap')[]>(() => {
    if (pageCount <= 9) return Array.from({ length: pageCount }, (_, index) => index + 1);
    if (page <= 5) return [1, 2, 3, 4, 5, 6, 7, 'gap', pageCount];
    if (page >= pageCount - 4) {
      return [1, 'gap', ...Array.from({ length: 7 }, (_, index) => pageCount - 6 + index)];
    }
    return [1, 'gap', page - 2, page - 1, page, page + 1, page + 2, 'gap', pageCount];
  }, [page, pageCount]);

  useEffect(() => {
    setPage(1);
  }, [search, sort, tier, type]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page, result?.entries, search, sort, tier, type]);

  return (
    <div className="mayhem-combo-page">
      {error && <div className="ranking-notice">{error}</div>}

      <div className="mayhem-combo-intro">
        <div className="mayhem-combo-summary">
          <span>COMBOS</span>
          <strong>{filteredEntries.length}</strong>
          <small>条组合</small>
          <p>第 {page} / {pageCount} 页 · 收录 {result?.meta.totalCount ?? 0} 条 · {result?.meta.championCount ?? 0} 位英雄</p>
        </div>
        <div className="mayhem-combo-controls">
          <label className="mayhem-combo-select">
            <span>等级</span>
            <select value={tier} onChange={(event) => setTier(event.target.value as TierFilter)}>
              <option value="all">全部</option>
              <option value="S+">S+</option>
              <option value="S">S</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </label>
          {availableTypes.length > 0 && (
            <label className="mayhem-combo-select">
              <span>类型</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="all">全部</option>
                {availableTypes.map((value) => <option key={value} value={value}>{TYPE_LABELS[value] ?? value}</option>)}
              </select>
            </label>
          )}
          <label className="mayhem-combo-select">
            <span>排序</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as ComboSort)}>
              <option value="featured">精选推荐</option>
              <option value="votes">热门投票</option>
              <option value="tier">按等级</option>
            </select>
          </label>
          <label className="ranking-search mayhem-combo-search">
            <Search className="size-3.5" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索英雄或符文" />
          </label>
          <button
            type="button"
            className="ranking-refresh"
            onClick={() => void loadCombos(true)}
            title="刷新强势组合"
            aria-label="刷新强势组合"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="mayhem-combo-scroll">
        <div className="mayhem-combo-table-head" aria-hidden="true">
          <span>序号</span>
          <span>英雄与核心强化</span>
          <span>组合说明</span>
          <span>热度</span>
        </div>

        {loading && !result ? <ComboSkeleton /> : visibleEntries.length > 0 ? (
          <div className="mayhem-combo-rows">
            {visibleEntries.map((entry) => (
              <article key={entry.id} className={`mayhem-combo-row tier-${entry.tier.replace('+', 'plus')}`}>
                <span className="mayhem-combo-rank">{String(entry.rank).padStart(2, '0')}</span>
                <div className="mayhem-combo-pair">
                  <div className="mayhem-combo-portraits" aria-hidden="true">
                    <img className="is-champion" src={entry.champion.icon} alt="" />
                    <img className="is-augment" src={entry.augment.icon} alt="" />
                  </div>
                  <div className="mayhem-combo-names">
                    <strong>{entry.champion.name}</strong>
                    <span><Sparkles className="size-3" />{entry.augment.name}</span>
                    <small>
                      <b>{entry.tier}</b>
                      {entry.curated && <em>精选</em>}
                      {entry.types.map((value) => <i key={value}>{TYPE_LABELS[value] ?? value}</i>)}
                    </small>
                  </div>
                </div>
                <p className="mayhem-combo-description" title={entry.description}>{entry.description}</p>
                <span className="mayhem-combo-votes" title="推荐票数"><ArrowUp className="size-3.5" />{entry.votes}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="ranking-empty"><Search className="size-5" /><span>没有符合条件的组合</span></div>
        )}
      </div>

      {filteredEntries.length > 0 && (
        <nav className="mayhem-combo-pagination" aria-label="强势组合分页">
          <div className="mayhem-combo-page-status" aria-label={`第 ${page} 页，共 ${pageCount} 页`}>
            <span>PAGE</span>
            <strong>{String(page).padStart(2, '0')}</strong>
            <i>/ {String(pageCount).padStart(2, '0')}</i>
          </div>
          <div className="mayhem-combo-page-controls">
            <button
              type="button"
              className="is-direction"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1}
              title="上一页"
              aria-label="上一页"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <div className="mayhem-combo-page-numbers">
              {pageItems.map((item, index) => item === 'gap' ? (
                <span key={`gap-${index}`}>...</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={item === page ? 'is-active' : ''}
                  onClick={() => setPage(item)}
                  aria-current={item === page ? 'page' : undefined}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="is-direction"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={page === pageCount}
              title="下一页"
              aria-label="下一页"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <small>每页 {DISPLAY_PAGE_SIZE} 条 · 共 {filteredEntries.length} 条</small>
        </nav>
      )}
    </div>
  );
}
