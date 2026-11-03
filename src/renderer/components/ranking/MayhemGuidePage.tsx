import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  CloudOff,
  Crosshair,
  Gem,
  HeartHandshake,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Swords,
  WandSparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LiveBattleInfo,
  MayhemAugmentRankingResult,
  MayhemChampionBuild,
  MayhemChampionEntry,
  MayhemChampionRole,
  MayhemSourceMeta,
  MayhemTierListResult,
} from '../../../shared/api';
import { cn, formatUpdatedAt } from '../../lib/utils';
import { MayhemAugmentCodex } from './MayhemAugmentCodex';
import { MayhemComboBoard } from './MayhemComboRanking';
import { MayhemPlaybook } from './MayhemPlaybook';
import {
  CHAMPION_TIER_COPY,
  CHAMPION_TIER_ORDER,
  championForId,
  liveMayhemTeam,
  matchesChampion,
  percent,
  tierToken,
} from './mayhemModel';
import { GradeChip, Portrait } from './rankingParts';

type MayhemTab = 'champions' | 'augments' | 'combos';
type RoleFilter = 'all' | MayhemChampionRole;

const TABS: Array<{ value: MayhemTab; label: string; icon: LucideIcon }> = [
  { value: 'champions', label: '英雄攻略', icon: BookOpen },
  { value: 'augments', label: '强化图鉴', icon: Gem },
  { value: 'combos', label: '强势组合', icon: Sparkles },
];

const ROLES: Array<{ value: RoleFilter; label: string; icon: LucideIcon }> = [
  { value: 'all', label: '全部', icon: Sparkles },
  { value: 'assassin', label: '刺客', icon: Zap },
  { value: 'fighter', label: '战士', icon: Swords },
  { value: 'mage', label: '法师', icon: WandSparkles },
  { value: 'marksman', label: '射手', icon: Crosshair },
  { value: 'support', label: '辅助', icon: HeartHandshake },
  { value: 'tank', label: '坦克', icon: Shield },
];

export function SourcePill({ meta, patch, updatedAt }: { meta?: MayhemSourceMeta; patch?: string; updatedAt?: string }) {
  if (!meta?.fetchedAt) return null;
  const cached = meta.origin === 'cache';
  return (
    <span
      className={cn('mh-source', cached && 'is-cache')}
      title={cached ? `数据源暂时连不上，这是 ${formatUpdatedAt(meta.fetchedAt)} 保存在本机的数据` : `数据来自 ${meta.source}`}
    >
      {cached ? <CloudOff className="size-3.5" /> : <Radio className="size-3.5" />}
      <span className="num">
        {patch ? `${patch} 版本` : meta.source}
        {updatedAt ? ` · ${updatedAt} 数据` : ''}
        {cached ? ' · 离线缓存' : ''}
      </span>
    </span>
  );
}

function LiveTeamCard({
  team,
  entries,
  selectedSlug,
  onOpen,
}: {
  team: ReturnType<typeof liveMayhemTeam>;
  entries: MayhemChampionEntry[];
  selectedSlug: string | null;
  onOpen: (slug: string) => void;
}) {
  if (!team) return null;
  const members = team.championIds.map((id) => ({ id, entry: championForId(entries, id) }));
  const strongest = members
    .flatMap((member) => (member.entry ? [member.entry] : []))
    .sort((a, b) => a.rank - b.rank)[0];
  return (
    <section className="mh-live">
      <header>
        <span className="mh-live__pulse" aria-hidden="true" />
        <strong>{team.phase === 'ChampSelect' ? '正在选英雄' : '本局阵容'}</strong>
        {strongest && <small>队里最强：{strongest.name} {strongest.tier}</small>}
      </header>
      <div className="mh-live__team">
        {members.map(({ id, entry }) => (
          <button
            key={id}
            type="button"
            className={cn('mh-live__member', id === team.myChampionId && 'is-me', entry?.slug === selectedSlug && 'is-selected')}
            disabled={!entry}
            onClick={() => entry && onOpen(entry.slug)}
            title={entry ? `${entry.name} · ${entry.tier} · 胜率 ${percent(entry.winRate)}` : '暂无这个英雄的数据'}
          >
            <Portrait src={entry?.image} fallbackId={id} name={entry?.name ?? '?'} size={40} />
            {entry && <GradeChip label={entry.tier} />}
            {id === team.myChampionId && <em>你</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function ChampionRail({
  entries,
  loading,
  selectedSlug,
  onOpen,
  team,
}: {
  entries: MayhemChampionEntry[];
  loading: boolean;
  selectedSlug: string | null;
  onOpen: (slug: string) => void;
  team: ReturnType<typeof liveMayhemTeam>;
}) {
  const [role, setRole] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const keyword = search.trim().toLocaleLowerCase();
  const groups = useMemo(() => {
    const visible = entries.filter((entry) => (role === 'all' || entry.roles.includes(role)) && matchesChampion(entry, keyword));
    return CHAMPION_TIER_ORDER
      .map((tier) => ({ tier, entries: visible.filter((entry) => entry.tier === tier) }))
      .filter((group) => group.entries.length > 0);
  }, [entries, keyword, role]);
  const teamIds = new Set(team?.championIds ?? []);

  useEffect(() => {
    listRef.current?.querySelector('.mh-rail__row.is-selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedSlug]);

  return (
    <aside className="mh-rail">
      <LiveTeamCard team={team} entries={entries} selectedSlug={selectedSlug} onOpen={onOpen} />
      <div className="mh-rail__filters">
        <label className="rk-search mh-rail__search">
          <Search className="size-3.5" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="找英雄：提莫 / 迅捷斥候 / teemo" />
        </label>
        <div className="mh-roles" role="tablist" aria-label="职业">
          {ROLES.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={role === option.value}
                className={cn(role === option.value && 'is-active')}
                onClick={() => setRole(option.value)}
                title={option.label}
              >
                <Icon className="size-3.5" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mh-rail__list" ref={listRef}>
        {loading && !entries.length ? (
          <div className="rk-skeleton mh-rail__skeleton">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>
        ) : groups.length ? groups.map((group) => (
          <section key={group.tier} className={cn('mh-rail__group', `rk-tone--${tierToken(group.tier)}`)}>
            <header>
              <GradeChip label={group.tier} />
              <strong>{CHAMPION_TIER_COPY[group.tier]}</strong>
              <small className="num">{group.entries.length}</small>
            </header>
            {group.entries.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                className={cn('mh-rail__row', entry.slug === selectedSlug && 'is-selected', teamIds.has(entry.id) && 'is-team')}
                onClick={() => onOpen(entry.slug)}
              >
                <span className="mh-rail__rank num">{entry.rank}</span>
                <Portrait src={entry.image} fallbackId={entry.id} name={entry.name} size={32} />
                <span className="mh-rail__name">
                  <strong>{entry.name}</strong>
                  <small>{entry.title || entry.alias}</small>
                </span>
                <span className="mh-rail__rate">
                  <b className={cn('num', entry.winRate >= 50 ? 'is-up' : 'is-down')}>{percent(entry.winRate)}</b>
                  {entry.trend !== null && entry.trend !== 0 && (
                    <small className={cn('num', entry.trend > 0 ? 'is-up' : 'is-down')}>
                      {entry.trend > 0 ? '↑' : '↓'}{Math.abs(entry.trend)}
                    </small>
                  )}
                </span>
              </button>
            ))}
          </section>
        )) : (
          <div className="rk-empty"><Search className="size-5" /><span>没有符合条件的英雄</span></div>
        )}
      </div>
    </aside>
  );
}

export function MayhemGuidePage() {
  const [tab, setTab] = useState<MayhemTab>('champions');
  const [tierList, setTierList] = useState<MayhemTierListResult | null>(null);
  const [augments, setAugments] = useState<MayhemAugmentRankingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [focusAugment, setFocusAugment] = useState<string | null>(null);
  const [build, setBuild] = useState<MayhemChampionBuild | null>(null);
  const [battle, setBattle] = useState<LiveBattleInfo | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const autoOpenedRef = useRef<number | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const [nextTier, nextAugments] = await Promise.all([
        window.lolHelper.ranking.getMayhemTierList(refresh),
        window.lolHelper.ranking.getMayhemAugmentRanking(refresh),
      ]);
      setTierList(nextTier);
      setAugments(nextAugments);
      setSelectedSlug((current) => current ?? nextTier.entries[0]?.slug ?? null);
    } catch (error) {
      setTierList((current) => current ?? {
        entries: [],
        meta: { patch: '', updatedAt: '', source: 'ARAM Mayhem', origin: 'live', fetchedAt: '' },
        error: error instanceof Error ? error.message : '海克斯大乱斗数据获取失败',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // 选人 / 对局中自动带出自己的英雄：拿到英雄的那一刻，攻略就已经在眼前了。
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      window.lolHelper.live.getBattle()
        .then((next) => {
          if (!disposed) setBattle(next);
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = window.lolHelper.live.onStateChanged(() => refresh());
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      disposed = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  const entries = useMemo(() => tierList?.entries ?? [], [tierList?.entries]);
  const team = useMemo(() => liveMayhemTeam(battle), [battle]);

  useEffect(() => {
    const myId = team?.myChampionId ?? null;
    if (!myId || autoOpenedRef.current === myId) return;
    const mine = championForId(entries, myId);
    if (!mine) return;
    autoOpenedRef.current = myId;
    setSelectedSlug(mine.slug);
    setTab('champions');
  }, [entries, team?.myChampionId]);

  const openChampion = useCallback((slug: string) => {
    setSelectedSlug(slug);
    setTab('champions');
  }, []);

  const openAugment = useCallback((slug: string) => {
    setFocusAugment(slug);
    setTab('augments');
  }, []);

  const selectedEntry = entries.find((entry) => entry.slug === selectedSlug) ?? null;
  const teamSlugs = useMemo(() => {
    const ids = new Set(team?.championIds ?? []);
    return new Set(entries.filter((entry) => ids.has(entry.id)).map((entry) => entry.slug));
  }, [entries, team?.championIds]);
  const error = tab === 'augments' ? augments?.error : tierList?.error;

  return (
    <section className="mh-page">
      <header className="mh-toolbar">
        <nav className="mh-tabs" aria-label="海克斯大乱斗">
          {TABS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(tab === option.value && 'is-active')}
                aria-current={tab === option.value ? 'page' : undefined}
                onClick={() => setTab(option.value)}
              >
                <Icon className="size-4" />
                {option.label}
                {option.value === 'augments' && augments?.meta.activeCount ? <small className="num">{augments.meta.activeCount}</small> : null}
                {option.value === 'champions' && entries.length ? <small className="num">{entries.length}</small> : null}
              </button>
            );
          })}
        </nav>
        <div className="mh-toolbar__tail">
          <SourcePill meta={tierList?.meta} patch={tierList?.meta.patch} updatedAt={tierList?.meta.updatedAt} />
          <button
            type="button"
            className="rk-icon-button"
            onClick={() => {
              setRefreshKey((value) => value + 1);
              void load(true);
            }}
            title="重新拉取海克斯大乱斗数据"
            aria-label="刷新"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </header>

      {error && <div className="rk-notice">{error}</div>}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="mh-body"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
        >
          {tab === 'champions' ? (
            <div className="mh-champions">
              <ChampionRail entries={entries} loading={loading} selectedSlug={selectedSlug} onOpen={openChampion} team={team} />
              <MayhemPlaybook
                slug={selectedSlug}
                entry={selectedEntry}
                augments={augments?.entries ?? []}
                teamSlugs={teamSlugs}
                refreshKey={refreshKey}
                onOpenChampion={openChampion}
                onOpenAugment={openAugment}
                onBuildLoaded={setBuild}
              />
            </div>
          ) : tab === 'augments' ? (
            <MayhemAugmentCodex
              result={augments}
              loading={loading}
              focusSlug={focusAugment}
              onFocus={setFocusAugment}
              build={build}
              onOpenChampion={openChampion}
            />
          ) : (
            <MayhemComboBoard refreshKey={refreshKey} onOpenChampion={openChampion} onOpenAugment={openAugment} />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
