import { motion } from 'framer-motion';
import { ArrowUpRight, BookOpen, CloudOff, Gem, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MayhemAugmentRankingEntry,
  MayhemAugmentRecommendation,
  MayhemAugmentRarity,
  MayhemChampionBuild,
  MayhemChampionEntry,
  MayhemItemBuildOption,
} from '../../../shared/api';
import { cn } from '../../lib/utils';
import { RARITY_COPY, augmentEffectMap, balanceIsBuff, percent, tierToken } from './mayhemModel';
import {
  GradeChip,
  Portrait,
  SectionTitle,
  SkeletonLines,
  SkillMatrix,
  SkillPriority,
  championSplash,
} from './rankingParts';

const buildCache = new Map<string, { build: MayhemChampionBuild; cached: boolean }>();
const RARITIES: MayhemAugmentRarity[] = ['prismatic', 'gold', 'silver'];

function useMayhemBuild(slug: string | null, refreshKey: number) {
  const [state, setState] = useState<{ slug: string | null; build: MayhemChampionBuild | null; cached: boolean; error: string; loading: boolean }>({
    slug: null,
    build: null,
    cached: false,
    error: '',
    loading: false,
  });
  // 顶栏点「刷新」时 refreshKey 变化：当前英雄强制重新拉取，其余走缓存。
  const refreshRef = useRef(refreshKey);

  useEffect(() => {
    if (!slug) return undefined;
    const forceRefresh = refreshRef.current !== refreshKey;
    refreshRef.current = refreshKey;
    const hit = buildCache.get(slug);
    if (hit && !forceRefresh) {
      setState({ slug, build: hit.build, cached: hit.cached, error: '', loading: false });
      return undefined;
    }
    let cancelled = false;
    setState((current) => ({ slug, build: current.slug === slug ? current.build : null, cached: false, error: '', loading: true }));
    window.lolHelper.ranking.getMayhemBuild(slug, forceRefresh)
      .then((result) => {
        if (cancelled) return;
        if (result.build) buildCache.set(slug, { build: result.build, cached: result.origin === 'cache' });
        setState({ slug, build: result.build, cached: result.origin === 'cache', error: result.error ?? '', loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ slug, build: null, cached: false, error: error instanceof Error ? error.message : '英雄攻略获取失败', loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, slug]);

  return state.slug === slug ? state : { slug, build: null, cached: false, error: '', loading: Boolean(slug) };
}

function openSource(url: string) {
  void window.lolHelper.ranking.openSource(url).catch(() => undefined);
}

function AugmentPick({
  augment,
  effect,
  onOpen,
}: {
  augment: MayhemAugmentRecommendation;
  effect: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={cn('mh-pick', `is-${augment.rarity}`)} onClick={onOpen} title={effect || augment.name}>
      <span className="mh-pick__icon"><img src={augment.icon} alt="" loading="lazy" /></span>
      <span className="mh-pick__body">
        <span className="mh-pick__head">
          <strong>{augment.name}</strong>
          <GradeChip label={augment.tier} />
        </span>
        {effect ? <small>{effect}</small> : <small className="is-muted">总榜 {augment.overallTier || '—'} · #{augment.overallRank ?? '—'}</small>}
      </span>
      <span className="mh-pick__rate">
        <b className="num">{percent(augment.pickRate)}</b>
        <small>选用</small>
      </span>
    </button>
  );
}

function ItemChain({ option, chain = true }: { option: MayhemItemBuildOption; chain?: boolean }) {
  return (
    <span className="mh-items">
      {option.items.map((item, index) => (
        <span key={`${item.name}-${index}`} className="mh-items__item">
          {chain && index > 0 && <i aria-hidden="true">›</i>}
          <img src={item.icon} alt={item.name} title={item.name} loading="lazy" />
        </span>
      ))}
    </span>
  );
}

function BuildOption({ option, chain = true, best = false }: { option: MayhemItemBuildOption; chain?: boolean; best?: boolean }) {
  return (
    <div className={cn('mh-build-option', best && 'is-best')}>
      <ItemChain option={option} chain={chain} />
      <span className="mh-build-option__stats">
        <b className={cn('num', option.winRate >= 50 ? 'is-up' : 'is-down')}>{percent(option.winRate)}</b>
        <small className="num">{percent(option.pickRate)} 使用</small>
      </span>
    </div>
  );
}

// 胜率最高的那一条标出来，但只在使用率不太低（≥ 3%）时才算数。
function bestIndex(options: MayhemItemBuildOption[]): number {
  let best = -1;
  options.forEach((option, index) => {
    if (option.pickRate < 3) return;
    if (best < 0 || option.winRate > options[best].winRate) best = index;
  });
  return best;
}

function PlaybookHero({ build, entry, cached }: { build: MayhemChampionBuild | null; entry: MayhemChampionEntry | null; cached: boolean }) {
  const name = build?.name ?? entry?.name ?? '';
  const title = build?.title || entry?.title || '';
  const tier = build?.tier ?? entry?.tier ?? 'C';
  const alias = build?.alias || entry?.alias || '';
  const rank = build?.rank ?? entry?.rank ?? null;
  const trend = build?.trend ?? entry?.trend ?? null;
  const winRate = build?.winRate ?? entry?.winRate ?? null;
  return (
    <header className={cn('mh-hero', `rk-tone--${tierToken(tier)}`)}>
      {alias ? (
        <img className="mh-hero__splash" src={championSplash(alias)} alt="" draggable={false} />
      ) : (
        (build?.image || entry?.image) && <img className="mh-hero__splash is-square" src={build?.image || entry?.image} alt="" draggable={false} />
      )}
      <div className="mh-hero__tier">
        <span className="num">{tier}</span>
        <small>{rank ? `第 ${rank} 名` : ''}{trend ? ` ${trend > 0 ? '↑' : '↓'}${Math.abs(trend)}` : ''}</small>
      </div>
      <div className="mh-hero__identity">
        <p>{title}{build?.roles.length ? ` · ${build.roles.join(' / ')}` : ''}</p>
        <h2>{name}</h2>
        <div className="mh-hero__stats">
          <span><small>胜率</small><b className={cn('num', (winRate ?? 0) >= 50 ? 'is-up' : 'is-down')}>{percent(winRate)}</b></span>
          <span><small>登场率</small><b className="num">{percent(build?.pickRate ?? entry?.pickRate ?? null)}</b></span>
          {build?.patch && <span><small>版本</small><b className="num">{build.patch}</b></span>}
        </div>
      </div>
      <div className="mh-hero__balance">
        {build?.balance.length ? build.balance.map((modifier) => {
          const buff = balanceIsBuff(modifier);
          return (
            <span key={`${modifier.label}-${modifier.value}`} className={cn('mh-balance', buff === true && 'is-buff', buff === false && 'is-nerf')}>
              <small>{modifier.label}</small>
              <b className="num">{modifier.value}</b>
            </span>
          );
        }) : build ? <span className="mh-balance is-none">大乱斗里没有额外平衡调整</span> : null}
        {cached && <span className="mh-balance is-cache"><CloudOff className="size-3.5" />离线缓存</span>}
      </div>
    </header>
  );
}

export function MayhemPlaybook({
  slug,
  entry,
  augments,
  teamSlugs,
  refreshKey,
  onOpenChampion,
  onOpenAugment,
  onBuildLoaded,
}: {
  slug: string | null;
  entry: MayhemChampionEntry | null;
  augments: MayhemAugmentRankingEntry[];
  teamSlugs: Set<string>;
  refreshKey: number;
  onOpenChampion: (slug: string) => void;
  onOpenAugment: (slug: string) => void;
  onBuildLoaded: (build: MayhemChampionBuild | null) => void;
}) {
  const state = useMayhemBuild(slug, refreshKey);
  const effects = useMemo(() => augmentEffectMap(augments), [augments]);
  const build = state.build;

  useEffect(() => {
    onBuildLoaded(build);
  }, [build, onBuildLoaded]);

  if (!slug) {
    return (
      <div className="mh-playbook mh-playbook--empty">
        <BookOpen className="size-5" />
        <span>从左边选一位英雄，看他的强化、出装和加点</span>
      </div>
    );
  }

  const skill = build?.skillOrders[0];
  const coreBest = build ? bestIndex(build.itemGroups.core) : -1;

  return (
    <motion.div
      key={slug}
      className="mh-playbook"
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
    >
      <PlaybookHero build={build} entry={entry} cached={state.cached} />

      {!build && state.loading && (
        <div className="mh-playbook__grid">
          <section className="mh-card mh-card--wide"><SkeletonLines count={4} /></section>
          <section className="mh-card"><SkeletonLines count={4} /></section>
          <section className="mh-card"><SkeletonLines count={4} /></section>
        </div>
      )}

      {!build && !state.loading && (
        <div className="mh-playbook__error">
          <strong>这位英雄的攻略暂时拿不到</strong>
          <span>{state.error || '数据源没有返回内容'}</span>
          <button type="button" onClick={() => openSource(`https://arammayhem.com/zh-cn/build/${slug}/`)}>
            去网页看看 <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      )}

      {build && (
        <div className="mh-playbook__grid">
          <section className="mh-card mh-card--wide">
            <SectionTitle
              title="强化怎么选"
              hint="按这位英雄的实战数据排序，点开看详情"
              action={<span className="mh-legend"><i className="is-prismatic" />棱彩<i className="is-gold" />金色<i className="is-silver" />银色</span>}
            />
            {build.augments.length ? (
              <div className="mh-picks">
                {RARITIES.map((rarity) => {
                  const list = build.augments.filter((augment) => augment.rarity === rarity).slice(0, 6);
                  if (!list.length) return null;
                  return (
                    <div key={rarity} className={cn('mh-picks__column', `is-${rarity}`)}>
                      <header><Gem className="size-3.5" />{RARITY_COPY[rarity]}</header>
                      {list.map((augment) => (
                        <AugmentPick
                          key={augment.slug}
                          augment={augment}
                          effect={augment.effect || effects.get(augment.slug) || ''}
                          onOpen={() => onOpenAugment(augment.slug)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : <p className="mh-card__empty">数据源这次没有给出强化推荐</p>}
          </section>

          <section className="mh-card">
            <SectionTitle title="核心出装" hint="三件套 · 胜率 · 使用率" />
            {build.itemGroups.core.length ? (
              <div className="mh-build-list">
                {build.itemGroups.core.slice(0, 4).map((option, index) => (
                  <BuildOption key={`core-${index}`} option={option} best={index === coreBest} />
                ))}
              </div>
            ) : <p className="mh-card__empty">暂无</p>}
            {build.itemGroups.late.length > 0 && (
              <>
                <h4 className="mh-card__sub">后续可选</h4>
                <div className="mh-late">
                  {build.itemGroups.late.slice(0, 6).map((option, index) => (
                    <span key={`late-${index}`} className="mh-late__item" title={`${option.items[0]?.name} · 胜率 ${percent(option.winRate)}`}>
                      <img src={option.items[0]?.icon} alt={option.items[0]?.name} loading="lazy" />
                      <small className="num">{percent(option.pickRate, 0)}</small>
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="mh-card">
            <SectionTitle title="开局与鞋子" />
            <h4 className="mh-card__sub is-first">出门装</h4>
            <div className="mh-build-list">
              {build.itemGroups.starting.slice(0, 3).map((option, index) => <BuildOption key={`start-${index}`} option={option} />)}
            </div>
            <h4 className="mh-card__sub">鞋子</h4>
            <div className="mh-build-list">
              {build.itemGroups.boots.slice(0, 3).map((option, index) => <BuildOption key={`boots-${index}`} option={option} chain={false} />)}
            </div>
          </section>

          {skill && (
            <section className="mh-card mh-card--wide mh-skills">
              <SectionTitle title="技能加点" hint="主升顺序 · 胜率 · 使用率" />
              <div className="mh-skills__layout">
                <div className="mh-skills__orders">
                  {build.skillOrders.slice(0, 3).map((order, index) => (
                    <div key={order.priority} className={cn('mh-skills__order', index === 0 && 'is-main')}>
                      <SkillPriority keys={order.priority.split('>')} />
                      <b className="num">{percent(order.winRate)}</b>
                      <small className="num">{percent(order.pickRate)} 使用</small>
                    </div>
                  ))}
                </div>
                {skill.sequences[0] && <SkillMatrix order={skill.sequences[0].sequence.split('')} />}
              </div>
            </section>
          )}

          {build.combos.length > 0 && (
            <section className="mh-card mh-card--wide">
              <SectionTitle title="组合玩法" hint="玩家整理的强化搭配思路" action={<Sparkles className="size-3.5 mh-dim" />} />
              <div className="mh-combos-mini">
                {build.combos.slice(0, 6).map((combo) => (
                  <button key={combo.slug} type="button" className="mh-combo-mini" onClick={() => openSource(combo.sourceUrl)} title="在网页中打开">
                    <span className="mh-combo-mini__icons">
                      {combo.augments.slice(0, 2).map((augment) => <img key={augment.name} src={augment.icon} alt={augment.name} loading="lazy" />)}
                    </span>
                    <span className="mh-combo-mini__body">
                      <span className="mh-combo-mini__head">
                        <strong>{combo.title}</strong>
                        {combo.tier && <GradeChip label={combo.tier} />}
                        {combo.types.map((type) => <em key={type}>{type}</em>)}
                      </span>
                      <small>{combo.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {build.partners.length > 0 && (
            <section className="mh-card mh-card--wide">
              <SectionTitle title="最佳搭档" hint="和这些英雄同队时，胜率最高" action={<Users className="size-3.5 mh-dim" />} />
              <div className="mh-partners">
                {build.partners.slice(0, 6).map((partner) => (
                  <button
                    key={partner.slug}
                    type="button"
                    className={cn('mh-partner', teamSlugs.has(partner.slug) && 'is-team')}
                    onClick={() => onOpenChampion(partner.slug)}
                  >
                    <Portrait src={partner.icon} name={partner.name} size={38} />
                    <span>
                      <strong>{partner.name}</strong>
                      <small className="num">同队 {percent(partner.pickRate)}</small>
                    </span>
                    <b className="num">{percent(partner.winRate)}</b>
                    {teamSlugs.has(partner.slug) && <em>就在你队里</em>}
                  </button>
                ))}
              </div>
            </section>
          )}

          <footer className="mh-playbook__foot">
            <span className="num">数据：ARAM Mayhem{build.updatedAt ? ` · ${build.updatedAt}` : ''}{build.patch ? ` · ${build.patch} 版本` : ''}</span>
            <button type="button" onClick={() => openSource(build.sourceUrl)}>网页版 <ArrowUpRight className="size-3.5" /></button>
          </footer>
        </div>
      )}
    </motion.div>
  );
}
