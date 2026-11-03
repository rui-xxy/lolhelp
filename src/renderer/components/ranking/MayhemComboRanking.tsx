import { ArrowUp, ArrowUpRight, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MayhemComboResult, MayhemComboTier } from '../../../shared/api';
import { cn } from '../../lib/utils';
import { GradeChip, Portrait } from './rankingParts';

type TierFilter = 'all' | MayhemComboTier;

const TIERS: MayhemComboTier[] = ['S+', 'S', 'A', 'B', 'C'];
const PAGE = 48;
let comboCache: MayhemComboResult | null = null;

export function MayhemComboBoard({
  refreshKey,
  onOpenChampion,
  onOpenAugment,
}: {
  refreshKey: number;
  onOpenChampion: (slug: string) => void;
  onOpenAugment: (slug: string) => void;
}) {
  const [result, setResult] = useState<MayhemComboResult | null>(comboCache);
  const [loading, setLoading] = useState(!comboCache);
  const [tier, setTier] = useState<TierFilter>('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const refreshRef = useRef(refreshKey);

  useEffect(() => {
    const force = refreshRef.current !== refreshKey;
    refreshRef.current = refreshKey;
    if (comboCache && !force) return undefined;
    let cancelled = false;
    setLoading(true);
    window.lolHelper.ranking.getMayhemCombos(force)
      .then((next) => {
        if (cancelled) return;
        comboCache = next.entries.length ? next : comboCache;
        setResult(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const labels = result?.meta.typeLabels ?? {};
  const types = useMemo(() => Array.from(new Set((result?.entries ?? []).flatMap((entry) => entry.types))), [result?.entries]);
  const visible = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return (result?.entries ?? []).filter((entry) => (tier === 'all' || entry.tier === tier)
      && (type === 'all' || entry.types.includes(type))
      && (!keyword || `${entry.champion.name} ${entry.champion.slug} ${entry.augment.name} ${entry.description}`.toLocaleLowerCase().includes(keyword)));
  }, [result?.entries, search, tier, type]);

  useEffect(() => {
    setLimit(PAGE);
  }, [search, tier, type]);

  return (
    <div className="mh-combos">
      <div className="mh-codex__filters">
        <div className="mh-rarity" role="tablist" aria-label="组合等级">
          <button type="button" role="tab" aria-selected={tier === 'all'} className={cn(tier === 'all' && 'is-active')} onClick={() => setTier('all')}>
            全部<small className="num">{result?.entries.length ?? 0}</small>
          </button>
          {TIERS.map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tier === value} className={cn(tier === value && 'is-active')} onClick={() => setTier(value)}>
              {value}
            </button>
          ))}
        </div>
        {types.length > 0 && (
          <div className="mh-chips">
            <button type="button" className={cn(type === 'all' && 'is-on')} onClick={() => setType('all')}>不限玩法</button>
            {types.map((value) => (
              <button key={value} type="button" className={cn(type === value && 'is-on')} onClick={() => setType(value)}>
                {labels[value] ?? value}
              </button>
            ))}
          </div>
        )}
        <label className="rk-search mh-codex__search">
          <Search className="size-3.5" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜英雄、强化或思路" />
        </label>
      </div>

      {result?.error && <div className="rk-notice">{result.error}</div>}

      <div className="mh-combos__grid">
        {loading && !result ? (
          Array.from({ length: 9 }, (_, index) => <span key={index} className="mh-combo is-skeleton" />)
        ) : visible.length ? visible.slice(0, limit).map((entry) => (
          <article key={entry.id} className={cn('mh-combo', `rk-tone--${entry.tier === 'S+' ? 'splus' : entry.tier.toLowerCase()}`)}>
            <div className="mh-combo__art">
              <button type="button" className="mh-combo__champion" onClick={() => entry.champion.slug && onOpenChampion(entry.champion.slug)} title={`查看${entry.champion.name}的攻略`}>
                <Portrait src={entry.champion.icon} fallbackId={entry.champion.id} name={entry.champion.name} size={48} />
              </button>
              <span className="mh-combo__plus" aria-hidden="true">+</span>
              <button type="button" className="mh-combo__augment" onClick={() => onOpenAugment(entry.augment.slug)} title={`查看强化「${entry.augment.name}」`}>
                <img src={entry.augment.icon} alt={entry.augment.name} loading="lazy" />
              </button>
              <GradeChip label={entry.tier} className="mh-combo__tier" />
            </div>
            <div className="mh-combo__body">
              <h3>{entry.champion.name} <span>×</span> {entry.augment.name}</h3>
              <div className="mh-combo__tags">
                {entry.curated && <em className="is-curated">编辑精选</em>}
                {entry.types.map((value) => <em key={value}>{labels[value] ?? value}</em>)}
              </div>
              <p>{entry.description || '暂无说明'}</p>
            </div>
            <footer>
              <span className="num"><ArrowUp className="size-3" />{entry.votes}</span>
              <button type="button" onClick={() => void window.lolHelper.ranking.openSource(entry.sourceUrl)}>
                详细思路 <ArrowUpRight className="size-3" />
              </button>
            </footer>
          </article>
        )) : (
          <div className="rk-empty mh-codex__empty">
            <Sparkles className="size-5" />
            <span>{result?.entries.length ? '没有符合条件的组合' : '暂时没有组合数据'}</span>
          </div>
        )}
      </div>
      {visible.length > limit && (
        <button type="button" className="mh-more" onClick={() => setLimit((value) => value + PAGE)}>
          再看 {Math.min(PAGE, visible.length - limit)} 个（还剩 {visible.length - limit}）
        </button>
      )}
    </div>
  );
}
