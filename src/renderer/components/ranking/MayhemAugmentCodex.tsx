import { motion } from 'framer-motion';
import { ArrowUpRight, Check, Gem, Plus, Scale, Search, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  MayhemAugmentDetail,
  MayhemAugmentRankingEntry,
  MayhemAugmentRankingResult,
  MayhemAugmentRarity,
  MayhemChampionBuild,
} from '../../../shared/api';
import { cn } from '../../lib/utils';
import { RARITY_COPY, compareAugments, percent } from './mayhemModel';
import { GradeChip, Portrait, SectionTitle, SkeletonLines, Sparkline } from './rankingParts';

type RarityFilter = 'all' | MayhemAugmentRarity;

const detailCache = new Map<string, MayhemAugmentDetail>();
// 切到别的标签再回来时，对比栏里的强化还在。
let rememberedCompare: string[] = [];

function useAugmentDetail(slug: string | null) {
  const [state, setState] = useState<{ slug: string | null; detail: MayhemAugmentDetail | null; error: string; loading: boolean }>({
    slug: null,
    detail: null,
    error: '',
    loading: false,
  });
  useEffect(() => {
    if (!slug) return undefined;
    const hit = detailCache.get(slug);
    if (hit) {
      setState({ slug, detail: hit, error: '', loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ slug, detail: null, error: '', loading: true });
    window.lolHelper.ranking.getMayhemAugmentDetail(slug)
      .then((result) => {
        if (cancelled) return;
        if (result.detail) detailCache.set(slug, result.detail);
        setState({ slug, detail: result.detail, error: result.error ?? '', loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ slug, detail: null, error: error instanceof Error ? error.message : '详情获取失败', loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return state.slug === slug ? state : { slug, detail: null, error: '', loading: Boolean(slug) };
}

function CompareTray({
  picks,
  entries,
  build,
  onRemove,
  onClear,
  onFocus,
}: {
  picks: string[];
  entries: MayhemAugmentRankingEntry[];
  build: MayhemChampionBuild | null;
  onRemove: (slug: string) => void;
  onClear: () => void;
  onFocus: (slug: string) => void;
}) {
  const [useChampion, setUseChampion] = useState(true);
  const candidates = picks.flatMap((slug) => entries.filter((entry) => entry.slug === slug).slice(0, 1));
  const ranked = compareAugments(candidates, useChampion ? build : null);
  const winner = ranked.length >= 2 ? ranked[0] : null;

  return (
    <section className={cn('mh-tray', picks.length > 0 && 'is-active')}>
      <header>
        <Scale className="size-4" />
        <div>
          <strong>三选一助手</strong>
          <small>
            {picks.length === 0
              ? '游戏里刷出三个强化拿不准？在下面点「＋」把它们放进来比一比'
              : picks.length === 1 ? '再放一个进来就能比较' : winner ? `建议拿「${winner.augment.name}」` : ''}
          </small>
        </div>
        {build && (
          <button
            type="button"
            className={cn('mh-tray__context', useChampion && 'is-on')}
            onClick={() => setUseChampion((value) => !value)}
            title="开启后，优先参考这位英雄自己的强化数据"
          >
            <Portrait src={build.image} fallbackId={build.id} name={build.name} size={20} />
            {useChampion ? `按${build.title || build.name}比较` : '按总榜比较'}
          </button>
        )}
        {picks.length > 0 && (
          <button type="button" className="mh-tray__clear" onClick={onClear}>清空</button>
        )}
      </header>
      <div className="mh-tray__slots">
        {[0, 1, 2].map((index) => {
          const row = ranked[index];
          if (!row) {
            return <span key={`empty-${index}`} className="mh-tray__slot is-empty"><Plus className="size-4" /></span>;
          }
          const isWinner = winner?.augment.slug === row.augment.slug;
          return (
            <motion.div
              layout
              key={row.augment.slug}
              className={cn('mh-tray__slot', `is-${row.augment.rarity}`, isWinner && 'is-winner')}
            >
              <button type="button" className="mh-tray__body" onClick={() => onFocus(row.augment.slug)}>
                <span className="mh-tray__order num">{index + 1}</span>
                <img src={row.augment.icon} alt="" />
                <span>
                  <strong>{row.augment.name}</strong>
                  <small>{row.reason}</small>
                </span>
                {isWinner && <em><Check className="size-3" />选它</em>}
              </button>
              <button type="button" className="mh-tray__remove" onClick={() => onRemove(row.augment.slug)} aria-label={`移出 ${row.augment.name}`}>
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function AugmentCard({
  entry,
  selected,
  picked,
  onFocus,
  onTogglePick,
}: {
  entry: MayhemAugmentRankingEntry;
  selected: boolean;
  picked: boolean;
  onFocus: () => void;
  onTogglePick: () => void;
}) {
  return (
    <div className={cn('mh-aug', `is-${entry.rarity}`, selected && 'is-selected', entry.availability === 'removed' && 'is-removed')}>
      <button type="button" className="mh-aug__main" onClick={onFocus}>
        <span className="mh-aug__icon"><img src={entry.icon} alt="" loading="lazy" /></span>
        <span className="mh-aug__body">
          <span className="mh-aug__head">
            <strong>{entry.name}</strong>
            {entry.isNew && <em>新</em>}
          </span>
          <span className="mh-aug__meta num">
            <span className="mh-aug__rarity">{RARITY_COPY[entry.rarity]}</span>
            #{entry.rank} · 登场 {percent(entry.pickRate)}
          </span>
          {entry.effect && <small className="mh-aug__effect">{entry.effect}</small>}
        </span>
        {entry.tier && <GradeChip label={entry.tier} className="mh-aug__tier" />}
      </button>
      <div className="mh-aug__foot">
        <span className="mh-aug__champions">
          {entry.topChampions.slice(0, 5).map((champion) => (
            <Portrait key={`${entry.slug}-${champion.slug || champion.name}`} src={champion.icon} fallbackId={champion.id} name={champion.name} size={20} />
          ))}
        </span>
        <button
          type="button"
          className={cn('mh-aug__pick', picked && 'is-on')}
          onClick={onTogglePick}
          aria-pressed={picked}
          title={picked ? '移出对比' : '加入三选一对比'}
        >
          {picked ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
          {picked ? '已加入' : '对比'}
        </button>
      </div>
    </div>
  );
}

function AugmentDetailPanel({
  slug,
  entry,
  picked,
  onTogglePick,
  onOpenChampion,
}: {
  slug: string | null;
  entry: MayhemAugmentRankingEntry | null;
  picked: boolean;
  onTogglePick: () => void;
  onOpenChampion: (slug: string) => void;
}) {
  const state = useAugmentDetail(slug);
  const detail = state.detail;
  if (!slug || !entry) {
    return (
      <aside className="mh-aug-detail is-empty">
        <Gem className="size-5" />
        <span>点一个强化，看它适合谁、强在哪</span>
      </aside>
    );
  }
  const history = [...(detail?.history ?? [])].reverse();
  return (
    <aside className={cn('mh-aug-detail', `is-${entry.rarity}`)}>
      <div className="mh-aug-detail__scroll">
        <header className="mh-aug-detail__hero">
          <span className="mh-aug-detail__icon"><img src={entry.icon} alt="" /></span>
          <div>
            <small>{RARITY_COPY[entry.rarity]}强化 · 总榜第 {entry.rank}</small>
            <h2>{entry.name}</h2>
          </div>
          {entry.tier && <GradeChip label={entry.tier} className="mh-aug-detail__tier" />}
        </header>
        <p className="mh-aug-detail__effect">{detail?.effect || entry.effect || '暂无效果说明'}</p>
        <div className="mh-aug-detail__stats">
          <span><small>登场率</small><b className="num">{percent(entry.pickRate)}</b>
            {detail?.pickDelta ? <em className={cn('num', detail.pickDelta > 0 ? 'is-up' : 'is-down')}>{detail.pickDelta > 0 ? '▲' : '▼'} {Math.abs(detail.pickDelta).toFixed(2)}</em> : null}
          </span>
          <span><small>等级</small><b className="num">{entry.tier ?? '—'}</b></span>
          <span><small>版本</small><b className="num">{detail?.patch || '—'}</b></span>
        </div>
        <button type="button" className={cn('mh-aug-detail__pick', picked && 'is-on')} onClick={onTogglePick}>
          {picked ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
          {picked ? '已在三选一对比里' : '加入三选一对比'}
        </button>

        {state.loading && !detail && <div className="mh-aug-detail__section"><SkeletonLines count={4} /></div>}

        {detail && detail.champions.length > 0 && (
          <section className="mh-aug-detail__section">
            <SectionTitle title="最适配英雄" hint="在该英雄同品质强化里的排名" />
            <div className="mh-fit-list">
              {detail.champions.slice(0, 8).map((champion) => (
                <button key={champion.slug} type="button" className="mh-fit" onClick={() => onOpenChampion(champion.slug)}>
                  <Portrait src={champion.icon} name={champion.name} size={30} />
                  <span>
                    <strong>{champion.name}</strong>
                    {champion.highlight && <em>上分英雄</em>}
                  </span>
                  <GradeChip label={champion.tier} />
                  <small className="num">{percent(champion.pickRate)}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {history.length > 1 && (
          <section className="mh-aug-detail__section">
            <SectionTitle title="登场率走势" hint={`近 ${history.length} 次快照`} />
            <Sparkline
              values={history.map((point) => point.pickRate ?? 0)}
              labels={history.map((point) => `${point.date} · ${point.tier}`)}
              format={(value) => `${value.toFixed(2)}%`}
            />
          </section>
        )}

        {detail && detail.guide.length > 0 && (
          <section className="mh-aug-detail__section">
            <SectionTitle title="使用提示" />
            <dl className="mh-guide">
              {detail.guide.map((item) => (
                <div key={item.title}>
                  <dt>{item.title}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {state.error && !detail && <p className="mh-card__empty">{state.error}</p>}

        <footer className="mh-playbook__foot">
          <span>数据：ARAM Mayhem</span>
          <button type="button" onClick={() => void window.lolHelper.ranking.openSource(`https://arammayhem.com/zh-cn/augments/${slug}/`)}>
            网页版 <ArrowUpRight className="size-3.5" />
          </button>
        </footer>
      </div>
    </aside>
  );
}

export function MayhemAugmentCodex({
  result,
  loading,
  focusSlug,
  onFocus,
  build,
  onOpenChampion,
}: {
  result: MayhemAugmentRankingResult | null;
  loading: boolean;
  focusSlug: string | null;
  onFocus: (slug: string) => void;
  build: MayhemChampionBuild | null;
  onOpenChampion: (slug: string) => void;
}) {
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [search, setSearch] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [picks, setPicks] = useState<string[]>(rememberedCompare);
  const entries = useMemo(() => (result?.entries ?? []).filter((entry) => entry.availability === 'live'), [result?.entries]);

  useEffect(() => {
    rememberedCompare = picks;
  }, [picks]);

  useEffect(() => {
    if (!focusSlug && entries[0]) onFocus(entries[0].slug);
  }, [entries, focusSlug, onFocus]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => (rarity === 'all' || entry.rarity === rarity)
      && (!onlyNew || entry.isNew)
      && (!keyword || `${entry.name} ${entry.slug} ${entry.effect}`.toLocaleLowerCase().includes(keyword)));
  }, [entries, onlyNew, rarity, search]);

  const counts = result?.meta.rarityCounts;
  const togglePick = (slug: string) => {
    setPicks((current) => (current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug].slice(-3)));
  };
  const focused = entries.find((entry) => entry.slug === focusSlug) ?? null;

  return (
    <div className="mh-codex">
      <div className="mh-codex__main">
        <CompareTray
          picks={picks}
          entries={entries}
          build={build}
          onRemove={(slug) => setPicks((current) => current.filter((item) => item !== slug))}
          onClear={() => setPicks([])}
          onFocus={onFocus}
        />

        <div className="mh-codex__filters">
          <div className="mh-rarity" role="tablist" aria-label="稀有度">
            {(['all', 'prismatic', 'gold', 'silver'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={rarity === value}
                className={cn(`is-${value}`, rarity === value && 'is-active')}
                onClick={() => setRarity(value)}
              >
                {value !== 'all' && <i aria-hidden="true" />}
                {value === 'all' ? '全部' : RARITY_COPY[value]}
                <small className="num">{value === 'all' ? result?.meta.activeCount ?? 0 : counts?.[value] ?? 0}</small>
              </button>
            ))}
          </div>
          <button type="button" className={cn('mh-toggle', onlyNew && 'is-on')} onClick={() => setOnlyNew((value) => !value)} aria-pressed={onlyNew}>
            <Sparkles className="size-3.5" />本版本新增
          </button>
          <label className="rk-search mh-codex__search">
            <Search className="size-3.5" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜名字或效果：护盾、移速…" />
          </label>
        </div>

        <div className="mh-codex__grid">
          {loading && !entries.length ? (
            Array.from({ length: 12 }, (_, index) => <span key={index} className="mh-aug is-skeleton" />)
          ) : visible.length ? visible.map((entry) => (
            <AugmentCard
              key={entry.slug}
              entry={entry}
              selected={entry.slug === focusSlug}
              picked={picks.includes(entry.slug)}
              onFocus={() => onFocus(entry.slug)}
              onTogglePick={() => togglePick(entry.slug)}
            />
          )) : (
            <div className="rk-empty mh-codex__empty"><Search className="size-5" /><span>没有符合条件的强化</span></div>
          )}
        </div>
      </div>
      <AugmentDetailPanel
        slug={focused?.slug ?? null}
        entry={focused}
        picked={focused ? picks.includes(focused.slug) : false}
        onTogglePick={() => focused && togglePick(focused.slug)}
        onOpenChampion={onOpenChampion}
      />
    </div>
  );
}
