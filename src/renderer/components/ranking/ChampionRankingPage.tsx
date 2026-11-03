import { motion } from 'framer-motion';
import {
  Ban,
  Crown,
  Gem,
  Globe2,
  LandPlot,
  LayoutList,
  Orbit,
  RefreshCw,
  ScatterChart,
  Search,
  Snowflake,
  Sparkles,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChampionRankingEntry,
  ChampionRankingMode,
  ChampionRankingPosition,
  ChampionRankingRegion,
  ChampionRankingResult,
} from '../../../shared/api';
import { cn, formatUpdatedAt } from '../../lib/utils';
import { LaneIcon } from '../LaneIcon';
import { ChampionDossier } from './ChampionDossier';
import { MayhemGuidePage } from './MayhemGuidePage';
import {
  formatGames,
  formatPercent,
  primaryRateLabel,
  quadrantDomain,
  quadrantPickPosition,
  quadrantPosition,
  rankChange,
  rankingAverages,
  rankingInsights,
  sortEntries,
  thirdRate,
  thirdRateLabel,
  tierLabel,
  tierNote,
  winBar,
  winScale,
  type InsightKind,
  type RankingAverages,
  type RankingSortKey,
} from './rankingModel';
import { FilterMenu, GradeChip, Portrait, championIcon, type MenuOption } from './rankingParts';

export type RankingChapter = 'mayhem' | 'ranking';
type RiftMode = Exclude<ChampionRankingMode, 'hextech'>;
type ViewMode = 'list' | 'map';

const MODES: Array<{ value: RiftMode; label: string; icon: LucideIcon }> = [
  { value: 'ranked', label: '召唤师峡谷', icon: LandPlot },
  { value: 'aram', label: '极地大乱斗', icon: Snowflake },
  { value: 'arena', label: '斗魂竞技场', icon: Orbit },
];

const POSITIONS: Array<{ value: ChampionRankingPosition; label: string; lane?: string }> = [
  { value: 'TOP', label: '上单', lane: 'top' },
  { value: 'JUNGLE', label: '打野', lane: 'jungle' },
  { value: 'MID', label: '中单', lane: 'middle' },
  { value: 'ADC', label: '下路', lane: 'bottom' },
  { value: 'SUPPORT', label: '辅助', lane: 'utility' },
  { value: 'ALL', label: '全部' },
];

const REGION_OPTIONS: MenuOption<ChampionRankingRegion>[] = [
  { value: 'global', label: '全球' },
  { value: 'kr', label: '韩服' },
  { value: 'na', label: '北美' },
  { value: 'jp', label: '日服' },
  { value: 'tw', label: '台服' },
];

const TIER_OPTIONS: MenuOption<string>[] = [
  { value: 'all', label: '全部段位' },
  { value: 'emerald_plus', label: '翡翠以上', description: '大多数玩家的参考线' },
  { value: 'diamond_plus', label: '钻石以上' },
  { value: 'master_plus', label: '大师以上' },
  { value: 'challenger', label: '王者' },
  { value: 'platinum_plus', label: '铂金以上' },
  { value: 'gold_plus', label: '黄金以上' },
];

const INSIGHT_ICONS: Record<InsightKind, LucideIcon> = {
  answer: Crown,
  rising: TrendingUp,
  ban: Ban,
  hidden: Gem,
};

const SORT_COLUMNS: Array<{ key: RankingSortKey; label: (mode: RiftMode) => string }> = [
  { key: 'winRate', label: primaryRateLabel },
  { key: 'pickRate', label: () => '登场率' },
  { key: 'banRate', label: thirdRateLabel },
  { key: 'trend', label: () => '变化' },
];

const SESSION_KEY = 'lolhelp.ranking.filters';

interface SavedFilters {
  mode: RiftMode;
  region: ChampionRankingRegion;
  tier: string;
  position: ChampionRankingPosition;
  view: ViewMode;
}

function loadFilters(): SavedFilters {
  const fallback: SavedFilters = { mode: 'ranked', region: 'global', tier: 'emerald_plus', position: 'TOP', view: 'list' };
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') as Partial<SavedFilters>;
    return {
      mode: MODES.some((mode) => mode.value === parsed.mode) ? parsed.mode as RiftMode : fallback.mode,
      region: REGION_OPTIONS.some((option) => option.value === parsed.region) ? parsed.region as ChampionRankingRegion : fallback.region,
      tier: TIER_OPTIONS.some((option) => option.value === parsed.tier) ? parsed.tier as string : fallback.tier,
      position: POSITIONS.some((option) => option.value === parsed.position) ? parsed.position as ChampionRankingPosition : fallback.position,
      view: parsed.view === 'map' ? 'map' : 'list',
    };
  } catch {
    return fallback;
  }
}

function TrendMark({ entry }: { entry: ChampionRankingEntry }) {
  const change = rankChange(entry);
  if (change === null || change === 0) return <span className="rk-trend is-flat">—</span>;
  return (
    <span className={cn('rk-trend num', change > 0 ? 'is-up' : 'is-down')}>
      {change > 0 ? '↑' : '↓'}{Math.abs(change)}
    </span>
  );
}

function WinCell({ entry, averages, scale }: { entry: ChampionRankingEntry; averages: RankingAverages; scale: number }) {
  const bar = winBar(entry.winRate, averages.winRate, scale);
  return (
    <span className={cn('rk-win', bar.side === 'up' ? 'is-up' : 'is-down')}>
      <span className="rk-win__track" aria-hidden="true">
        <i style={{ width: `${bar.width}%` }} />
      </span>
      <b className="num">{formatPercent(entry.winRate)}</b>
    </span>
  );
}

function RankingRow({
  entry,
  mode,
  averages,
  maxPick,
  scale,
  selected,
  onSelect,
}: {
  entry: ChampionRankingEntry;
  mode: RiftMode;
  averages: RankingAverages;
  maxPick: number;
  scale: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const third = thirdRate(entry, mode);
  return (
    <button
      type="button"
      className={cn('rk-row', selected && 'is-selected')}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={cn('rk-row__rank num', entry.rank <= 3 && 'is-podium')}>{entry.rank}</span>
      <span className="rk-row__champion">
        <Portrait src={entry.champion.avatar} fallbackId={entry.champion.id} name={entry.champion.name} size={34} />
        <span>
          <strong>{entry.champion.name}</strong>
          <small>{entry.champion.title || `${formatGames(entry.games)} 场`}</small>
        </span>
      </span>
      <WinCell entry={entry} averages={averages} scale={scale} />
      <span className="rk-pick">
        <span className="rk-pick__track" aria-hidden="true"><i style={{ width: `${Math.min(100, (entry.pickRate / maxPick) * 100)}%` }} /></span>
        <span className="num">{formatPercent(entry.pickRate)}</span>
      </span>
      <span className={cn('rk-row__third num', third !== null && third >= 15 && 'is-hot')}>{formatPercent(third)}</span>
      <TrendMark entry={entry} />
    </button>
  );
}

function QuadrantMap({
  entries,
  averages,
  selectedId,
  onSelect,
  mode,
}: {
  entries: ChampionRankingEntry[];
  averages: RankingAverages;
  selectedId: number | null;
  onSelect: (id: number) => void;
  mode: RiftMode;
}) {
  const domain = quadrantDomain(entries, averages);
  const midY = (1 - (averages.winRate - domain.minWin) / (domain.maxWin - domain.minWin)) * 100;
  const midX = quadrantPickPosition(averages.pickRate, domain);
  const [hover, setHover] = useState<ChampionRankingEntry | null>(null);
  const rateLabel = primaryRateLabel(mode);

  return (
    <div className="rk-map">
      <div className="rk-map__plane">
        <span className="rk-map__zone is-tl" style={{ width: `${midX}%`, height: `${midY}%` }}><b>冷门宝藏</b><small>玩的人少，但很能赢</small></span>
        <span className="rk-map__zone is-tr" style={{ left: `${midX}%`, height: `${midY}%` }}><b>版本答案</b><small>又热门又能赢</small></span>
        <span className="rk-map__zone is-bl" style={{ width: `${midX}%`, top: `${midY}%` }}><b>暂避锋芒</b><small>冷门且偏弱</small></span>
        <span className="rk-map__zone is-br" style={{ left: `${midX}%`, top: `${midY}%` }}><b>人气陷阱</b><small>很多人玩，但输得多</small></span>
        <span className="rk-map__axis is-h" style={{ top: `${midY}%` }}><small className="num">平均{rateLabel} {averages.winRate.toFixed(1)}%</small></span>
        <span className="rk-map__axis is-v" style={{ left: `${midX}%` }} />
        {entries.map((entry) => {
          const point = quadrantPosition(entry, domain);
          const selected = entry.champion.id === selectedId;
          return (
            <button
              key={entry.champion.id}
              type="button"
              className={cn('rk-map__dot', `rk-tier-ring--${tierLabel(entry.tier) === 'S+' ? 'splus' : tierLabel(entry.tier).toLowerCase()}`, selected && 'is-selected')}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onClick={() => onSelect(entry.champion.id)}
              onPointerEnter={() => setHover(entry)}
              onPointerLeave={() => setHover((current) => (current === entry ? null : current))}
              aria-label={`${entry.champion.name}，${rateLabel} ${formatPercent(entry.winRate)}，登场率 ${formatPercent(entry.pickRate)}`}
            >
              <img src={championIcon(entry.champion.id)} alt="" draggable={false} />
            </button>
          );
        })}
        {hover && (() => {
          const point = quadrantPosition(hover, domain);
          return (
            <span
              className={cn('rk-map__tip', point.x > 70 && 'is-left', point.y < 18 && 'is-below')}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            >
              <strong>{hover.champion.name}</strong>
              <small className="num">{rateLabel} {formatPercent(hover.winRate)} · 登场 {formatPercent(hover.pickRate)}</small>
            </span>
          );
        })()}
      </div>
      <div className="rk-map__legend">
        <span>↑ {rateLabel}</span>
        <span>登场率 →</span>
      </div>
    </div>
  );
}

function RankingSkeleton() {
  return (
    <div className="rk-list__body" aria-label="正在载入英雄排行">
      {Array.from({ length: 12 }, (_, index) => <span key={index} className="rk-row is-skeleton" />)}
    </div>
  );
}

export function ChampionRankingPage({ chapter }: { chapter: RankingChapter }) {
  const initial = useMemo(loadFilters, []);
  const [mode, setMode] = useState<RiftMode>(initial.mode);
  const [region, setRegion] = useState<ChampionRankingRegion>(initial.region);
  const [tier, setTier] = useState(initial.tier);
  const [position, setPosition] = useState<ChampionRankingPosition>(initial.position);
  const [view, setView] = useState<ViewMode>(initial.view);
  const [sortKey, setSortKey] = useState<RankingSortKey>('rank');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<ChampionRankingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const requestRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ mode, region, tier, position, view }));
    } catch {
      // 存不了就算了，只是下次打开回到默认筛选
    }
  }, [mode, position, region, tier, view]);

  const load = useCallback(async (refresh = false) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const next = await window.lolHelper.ranking.getChampions({ mode, region, tier, position, refresh });
      if (requestId !== requestRef.current) return;
      setResult(next);
      setSelectedId((current) => (next.entries.some((entry) => entry.champion.id === current)
        ? current
        : next.entries[0]?.champion.id ?? null));
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setResult({
        entries: [],
        meta: { mode, version: '', analyzedAt: '', matchCount: null, source: 'OP.GG' },
        error: error instanceof Error ? error.message : '英雄排行获取失败',
      });
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [mode, position, region, tier]);

  useEffect(() => {
    if (chapter === 'ranking') void load(false);
  }, [chapter, load]);

  const entries = useMemo(() => result?.entries ?? [], [result?.entries]);
  const averages = useMemo(() => rankingAverages(entries), [entries]);
  const insights = useMemo(() => rankingInsights(entries, mode), [entries, mode]);
  const maxPick = useMemo(() => Math.max(1, ...entries.map((entry) => entry.pickRate)), [entries]);
  const scale = useMemo(() => winScale(entries, averages.winRate), [averages.winRate, entries]);

  const visible = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    const filtered = keyword
      ? entries.filter((entry) => `${entry.champion.name} ${entry.champion.title} ${entry.champion.alias}`.toLocaleLowerCase().includes(keyword))
      : entries;
    return sortEntries(filtered, sortKey, mode);
  }, [entries, mode, search, sortKey]);

  const groups = useMemo(() => {
    if (sortKey !== 'rank') return [{ tier: -1, entries: visible }];
    const map = new Map<number, ChampionRankingEntry[]>();
    for (const entry of visible) map.set(entry.tier, [...(map.get(entry.tier) ?? []), entry]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([groupTier, groupEntries]) => ({ tier: groupTier, entries: groupEntries }));
  }, [sortKey, visible]);

  const selected = entries.find((entry) => entry.champion.id === selectedId) ?? visible[0] ?? null;

  const selectChampion = useCallback((id: number) => {
    setSelectedId(id);
    // 在版图里选中后，切回榜单时能直接看到它
    requestAnimationFrame(() => {
      listRef.current?.querySelector('.rk-row.is-selected')?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  if (chapter === 'mayhem') return <MayhemGuidePage />;

  const meta = result?.meta;
  const canPickTier = mode !== 'arena';

  return (
    <section className="rk-page">
      <header className="rk-toolbar">
        <div className="rk-modes" role="tablist" aria-label="游戏模式">
          {MODES.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={mode === option.value}
                className={cn(mode === option.value && 'is-active')}
                onClick={() => {
                  setMode(option.value);
                  setSortKey('rank');
                }}
              >
                <Icon className="size-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>

        {mode === 'ranked' && (
          <div className="rk-lanes" role="tablist" aria-label="位置">
            {POSITIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={position === option.value}
                className={cn(position === option.value && 'is-active')}
                onClick={() => setPosition(option.value)}
                title={option.label}
              >
                {option.lane ? <LaneIcon lane={option.lane} className="rk-lanes__icon" /> : <Sparkles className="size-3.5" />}
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="rk-toolbar__tail">
          {canPickTier && <FilterMenu value={tier} options={TIER_OPTIONS} onChange={setTier} icon={Trophy} ariaLabel="段位" />}
          <FilterMenu value={region} options={REGION_OPTIONS} onChange={setRegion} icon={Globe2} ariaLabel="地区" />
          <label className="rk-search">
            <Search className="size-3.5" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜英雄、真名或拼写" />
          </label>
          <button type="button" className="rk-icon-button" onClick={() => void load(true)} title="刷新数据" aria-label="刷新数据">
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </header>

      {result?.error && <div className="rk-notice">{result.error}</div>}

      <div className="rk-workspace">
        <div className="rk-main">
          {insights.length > 0 && (
            <div className="rk-insights">
              {insights.map((insight) => {
                const Icon = INSIGHT_ICONS[insight.kind];
                return (
                  <button
                    key={insight.kind}
                    type="button"
                    className={cn('rk-insight', `rk-insight--${insight.kind}`, selected?.champion.id === insight.entry.champion.id && 'is-selected')}
                    onClick={() => selectChampion(insight.entry.champion.id)}
                  >
                    <span className="rk-insight__label"><Icon className="size-3.5" />{insight.label}</span>
                    <span className="rk-insight__body">
                      <Portrait src={insight.entry.champion.avatar} fallbackId={insight.entry.champion.id} name={insight.entry.champion.name} size={40} />
                      <span>
                        <strong>{insight.entry.champion.name}</strong>
                        <small>{insight.note}</small>
                      </span>
                      <b className="num">{insight.value}</b>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="rk-board">
            <div className="rk-board__bar">
              <div className="rk-views" role="tablist" aria-label="展示方式">
                <button type="button" role="tab" aria-selected={view === 'list'} className={cn(view === 'list' && 'is-active')} onClick={() => setView('list')}>
                  <LayoutList className="size-3.5" />榜单
                </button>
                <button type="button" role="tab" aria-selected={view === 'map'} className={cn(view === 'map' && 'is-active')} onClick={() => setView('map')}>
                  <ScatterChart className="size-3.5" />版图
                </button>
              </div>
              <span className="rk-board__meta num">
                {meta?.version ? `${meta.version} 版本` : ''}
                {meta?.matchCount ? ` · ${formatGames(meta.matchCount)} 场对局` : ''}
                {meta?.analyzedAt ? ` · ${formatUpdatedAt(meta.analyzedAt)} 更新` : ''}
                {' · '}{visible.length} 位英雄
              </span>
            </div>

            {view === 'map' && entries.length > 0 ? (
              <QuadrantMap entries={visible} averages={averages} selectedId={selected?.champion.id ?? null} onSelect={selectChampion} mode={mode} />
            ) : (
              <div className="rk-list" ref={listRef}>
                <div className="rk-list__head">
                  <button type="button" className={cn(sortKey === 'rank' && 'is-active')} onClick={() => setSortKey('rank')}>排名</button>
                  <span>英雄</span>
                  {SORT_COLUMNS.map((column) => (
                    <button
                      key={column.key}
                      type="button"
                      className={cn(sortKey === column.key && 'is-active')}
                      onClick={() => setSortKey((current) => (current === column.key ? 'rank' : column.key))}
                      title={`按${column.label(mode)}排序`}
                    >
                      {column.label(mode)}
                    </button>
                  ))}
                </div>
                {loading && !result ? <RankingSkeleton /> : visible.length > 0 ? (
                  <div className="rk-list__body">
                    {groups.map((group) => (
                      <div key={group.tier} className="rk-group">
                        {group.tier >= 0 && (
                          <div className={cn('rk-group__head', `rk-tone--${tierLabel(group.tier) === 'S+' ? 'splus' : tierLabel(group.tier).toLowerCase()}`)}>
                            <GradeChip label={tierLabel(group.tier)} />
                            <strong>{tierNote(group.tier)}</strong>
                            <small className="num">{group.entries.length} 位</small>
                          </div>
                        )}
                        {group.entries.map((entry, index) => (
                          <motion.div
                            key={entry.champion.id}
                            initial={index < 14 ? { opacity: 0, y: 4 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.16, delay: Math.min(index, 10) * 0.012 }}
                          >
                            <RankingRow
                              entry={entry}
                              mode={mode}
                              averages={averages}
                              maxPick={maxPick}
                              scale={scale}
                              selected={entry.champion.id === selected?.champion.id}
                              onSelect={() => setSelectedId(entry.champion.id)}
                            />
                          </motion.div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rk-empty">
                    <Search className="size-5" />
                    <span>{search ? `没找到「${search}」` : '暂时没有排行数据，稍后点右上角刷新试试'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <ChampionDossier
          entry={selected}
          mode={mode}
          averages={averages}
          total={entries.length}
          region={region}
          tier={canPickTier ? tier : 'all'}
          position={mode === 'ranked' ? position : 'ALL'}
        />
      </div>
    </section>
  );
}
