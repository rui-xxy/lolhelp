import { Archive, Gem, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MayhemAugmentRarity,
  MayhemAugmentRankingResult,
} from '../../../shared/api';

type RarityFilter = 'all' | MayhemAugmentRarity;

const RARITY_OPTIONS: Array<{ value: RarityFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'prismatic', label: '棱彩' },
  { value: 'gold', label: '金色' },
  { value: 'silver', label: '银色' },
];

const RARITY_LABELS: Record<MayhemAugmentRarity, string> = {
  prismatic: '棱彩',
  gold: '金色',
  silver: '银色',
};

function formatRate(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

function AugmentRankingSkeleton() {
  return (
    <div className="mayhem-augment-skeleton" aria-label="正在载入强化符文排行">
      {Array.from({ length: 10 }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function MayhemAugmentRanking() {
  const [result, setResult] = useState<MayhemAugmentRankingResult | null>(null);
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [search, setSearch] = useState('');
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRanking = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const next = await window.lolHelper.ranking.getMayhemAugmentRanking(refresh);
      setResult(next);
      setError(next.error ?? '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '强化符文排行获取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRanking(false);
  }, [loadRanking]);

  const visibleEntries = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return (result?.entries ?? []).filter((entry) => {
      const matchesAvailability = includeRemoved || entry.availability === 'live';
      const matchesRarity = rarity === 'all' || entry.rarity === rarity;
      const matchesSearch = !keyword || `${entry.name} ${entry.slug}`.toLocaleLowerCase().includes(keyword);
      return matchesAvailability && matchesRarity && matchesSearch;
    });
  }, [includeRemoved, rarity, result?.entries, search]);

  return (
    <div className="mayhem-augment-page">
      {error && <div className="ranking-notice">{error}</div>}

      <div className="mayhem-augment-intro">
        <div className="mayhem-augment-summary">
          <span>LIVE</span>
          <strong>{visibleEntries.length}</strong>
          <small>个强化符文</small>
          <p>{result?.meta.updatedAt ? `${result.meta.updatedAt} 更新` : '真实榜单数据'}</p>
        </div>

        <div className="mayhem-augment-controls">
          <div className="mayhem-rarity-filter" role="tablist" aria-label="强化符文品质">
            {RARITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={rarity === option.value}
                className={rarity === option.value ? `is-active rarity-${option.value}` : `rarity-${option.value}`}
                onClick={() => setRarity(option.value)}
              >
                <i aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
          <label className="ranking-search mayhem-augment-search">
            <Search className="size-3.5" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索强化符文" />
          </label>
          <button
            type="button"
            className={`mayhem-removed-toggle ${includeRemoved ? 'is-active' : ''}`}
            onClick={() => setIncludeRemoved((value) => !value)}
            title={includeRemoved ? '隐藏已移除强化符文' : `查看 ${result?.meta.removedCount ?? 0} 个已移除强化符文`}
            aria-label={includeRemoved ? '隐藏已移除强化符文' : '显示已移除强化符文'}
            aria-pressed={includeRemoved}
          >
            <Archive className="size-3.5" />
          </button>
          <button
            type="button"
            className="ranking-refresh"
            onClick={() => void loadRanking(true)}
            title="刷新强化符文排行"
            aria-label="刷新强化符文排行"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mayhem-augment-scroll">
        <div className="mayhem-augment-table-head" aria-hidden="true">
          <span>排名</span>
          <span>强化符文</span>
          <span>胜率</span>
          <span>登场率</span>
          <span>常用英雄</span>
        </div>

        {loading && !result ? <AugmentRankingSkeleton /> : visibleEntries.length > 0 ? (
          <div className="mayhem-augment-rows">
            {visibleEntries.map((entry) => (
              <div
                key={`${entry.availability}-${entry.slug}`}
                className={`mayhem-augment-rank-row rarity-${entry.rarity} ${entry.availability === 'removed' ? 'is-removed' : ''}`}
              >
                <span className="mayhem-augment-rank">{String(entry.rank).padStart(2, '0')}</span>
                <div className="mayhem-augment-identity">
                  <span className="mayhem-augment-icon">
                    {entry.icon ? <img src={entry.icon} alt="" /> : <Gem className="size-5" />}
                  </span>
                  <div>
                    <strong>{entry.name}</strong>
                    <small>
                      <i aria-hidden="true" />
                      {RARITY_LABELS[entry.rarity]}
                      {entry.isNew && <em>新</em>}
                      {entry.availability === 'removed' && <em>已移除</em>}
                    </small>
                  </div>
                </div>
                <strong className="mayhem-augment-rate is-win">{formatRate(entry.winRate)}</strong>
                <span className="mayhem-augment-rate">{formatRate(entry.pickRate)}</span>
                <div className="mayhem-augment-champions">
                  {entry.topChampions.length > 0 ? entry.topChampions.map((champion) => (
                    <img key={`${entry.slug}-${champion.id}-${champion.name}`} src={champion.icon} alt={champion.name} title={champion.name} />
                  )) : <span>暂无数据</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ranking-empty"><Search className="size-5" /><span>没有符合条件的强化符文</span></div>
        )}
      </div>
    </div>
  );
}
