import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleDot,
  Gem,
  LandPlot,
  Layers3,
  Minus,
  Orbit,
  RefreshCw,
  Search,
  Snowflake,
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
import { RANKING_HERO_TONES, RANKING_MODE_TONES } from '../../styles/palette';
import { MayhemGuidePage } from './MayhemGuidePage';

export type RankingChapter = 'mayhem' | 'ranking';

interface MenuOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: LucideIcon;
  tone?: string;
}

const MODE_OPTIONS: MenuOption<ChampionRankingMode>[] = [
  { value: 'ranked', label: '召唤师峡谷', description: '排位赛综合强度', icon: LandPlot, tone: RANKING_MODE_TONES.ranked },
  { value: 'aram', label: '极地大乱斗', description: '嚎哭深渊全英雄', icon: Snowflake, tone: RANKING_MODE_TONES.aram },
  { value: 'arena', label: '斗魂竞技场', description: '双人竞技场表现', icon: Orbit, tone: RANKING_MODE_TONES.arena },
  { value: 'hextech', label: '海克斯大乱斗', description: '强化符文环境', icon: Gem, tone: RANKING_MODE_TONES.hextech },
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
  { value: 'challenger', label: '王者' },
  { value: 'master_plus', label: '大师+' },
  { value: 'diamond_plus', label: '钻石+' },
  { value: 'emerald_plus', label: '翡翠+' },
  { value: 'platinum_plus', label: '铂金+' },
  { value: 'gold_plus', label: '黄金+' },
];

const POSITION_OPTIONS: MenuOption<ChampionRankingPosition>[] = [
  { value: 'ALL', label: '全部位置' },
  { value: 'TOP', label: '上单' },
  { value: 'JUNGLE', label: '打野' },
  { value: 'MID', label: '中单' },
  { value: 'ADC', label: '下路' },
  { value: 'SUPPORT', label: '辅助' },
];

const TIER_NAMES: Record<number, string> = {
  1: 'S',
  2: 'A',
  3: 'B',
  4: 'C',
  5: 'D',
};

const ROLE_NAMES: Record<string, string> = {
  Assassin: '刺客',
  Fighter: '战士',
  Mage: '法师',
  Marksman: '射手',
  Support: '辅助',
  Tank: '坦克',
};

const HERO_TONES = RANKING_HERO_TONES;

export function RankingChapterSwitch({
  value,
  onChange,
}: {
  value: RankingChapter;
  onChange: (value: RankingChapter) => void;
}) {
  return (
    <div className="ranking-chapter-switch" role="tablist" aria-label="排行章节">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'mayhem'}
        className={value === 'mayhem' ? 'is-active' : ''}
        onClick={() => onChange('mayhem')}
      >
        <Gem className="size-4" />
        <strong>海克斯大乱斗</strong>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'ranking'}
        className={value === 'ranking' ? 'is-active' : ''}
        onClick={() => onChange('ranking')}
      >
        <Layers3 className="size-4" />
        <strong>英雄排行</strong>
      </button>
    </div>
  );
}

function FilterMenu<T extends string>({
  value,
  options,
  onChange,
  icon: TriggerIcon,
  wide = false,
  disabled = false,
}: {
  value: T;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  icon?: LucideIcon;
  wide?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const SelectedIcon = selected.icon ?? TriggerIcon;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`ranking-filter-trigger ${wide ? 'ranking-filter-trigger--wide' : ''} ${disabled ? 'ranking-filter-trigger--disabled' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? '当前模式使用统一数据' : undefined}
      >
        {SelectedIcon && (
          <SelectedIcon
            className="size-3.5 shrink-0"
            style={selected.tone ? { color: selected.tone } : undefined}
          />
        )}
        <span className="truncate">{selected.label}</span>
        <ChevronDown className={`ml-auto size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -3, scale: 0.99 }}
            transition={{ duration: 0.15 }}
            className={`ranking-filter-popover ${wide ? 'ranking-filter-popover--wide' : ''}`}
            role="listbox"
          >
            {options.map((option) => {
              const OptionIcon = option.icon;
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`ranking-filter-option ${active ? 'ranking-filter-option--active' : ''}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={active}
                >
                  {OptionIcon && (
                    <span className="ranking-filter-option-icon" style={{ color: option.tone }}>
                      <OptionIcon className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-semibold">{option.label}</span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-[10px] text-app-subtle">{option.description}</span>
                    )}
                  </span>
                  {active && <Check className="size-3.5 shrink-0 text-app-primary" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatCompactNumber(value: number | null): string {
  if (!value) return '0';
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
}

function trendValue(entry: ChampionRankingEntry): number | null {
  return entry.previousRank === null ? null : entry.previousRank - entry.rank;
}

function TrendMark({ entry }: { entry: ChampionRankingEntry }) {
  const change = trendValue(entry);
  if (change === null || change === 0) {
    return <span className="ranking-trend ranking-trend--flat"><Minus className="size-3" /></span>;
  }
  if (change > 0) {
    return <span className="ranking-trend ranking-trend--up"><ArrowUp className="size-3" />{change}</span>;
  }
  return <span className="ranking-trend ranking-trend--down"><ArrowDown className="size-3" />{Math.abs(change)}</span>;
}

function ChampionAvatar({ entry, size = 'row' }: { entry: ChampionRankingEntry; size?: 'row' | 'detail' }) {
  const tone = HERO_TONES[entry.champion.id % HERO_TONES.length];
  return (
    <span
      className={`ranking-avatar ranking-avatar--${size}`}
      style={{ '--champion-tone': tone } as React.CSSProperties}
    >
      {entry.champion.avatar ? (
        <img src={entry.champion.avatar} alt={entry.champion.name} />
      ) : (
        <span>{entry.champion.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

function DetailPanel({
  entry,
  mode,
  totalEntries,
}: {
  entry: ChampionRankingEntry | null;
  mode: ChampionRankingMode;
  totalEntries: number;
}) {
  if (!entry) {
    return (
      <aside className="ranking-detail ranking-detail--empty">
        <CircleDot className="size-5 text-app-primary/55" />
        <span>选择一位英雄</span>
      </aside>
    );
  }

  const splash = entry.champion.alias
    ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${entry.champion.alias}_0.jpg`
    : '';
  const primaryLabel = mode === 'arena' ? '前二率' : '胜率';
  const thirdLabel = mode === 'arena' ? '第一率' : '禁用率';
  const thirdValue = mode === 'arena' ? entry.firstPlaceRate : entry.banRate;
  const rankingPercent = totalEntries > 0
    ? Math.max(1, Math.ceil((entry.rank / totalEntries) * 100))
    : 100;
  const winScalePosition = Math.min(100, Math.max(0, ((entry.winRate - 40) / 20) * 100));
  const tone = HERO_TONES[entry.champion.id % HERO_TONES.length];
  const roleNames = entry.champion.tags.map((tag) => ROLE_NAMES[tag] ?? tag).filter(Boolean);

  return (
    <motion.aside
      key={entry.champion.id}
      initial={{ opacity: 0.72, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="ranking-detail"
      style={{ '--champion-tone': tone } as React.CSSProperties}
    >
      <div className="ranking-detail-art">
        {splash && <img src={splash} alt={entry.champion.name} />}
        <div className="ranking-detail-art-shade" />
      </div>

      <div className="ranking-detail-profile">
        <ChampionAvatar entry={entry} size="detail" />
        <div className="min-w-0">
          <p>
            {entry.champion.title || '英雄档案'}
            {roleNames.length > 0 ? ` · ${roleNames.join('/')}` : ''}
          </p>
          <h2>{entry.champion.name}</h2>
        </div>
      </div>

      <div className="ranking-detail-body">
        <div className="ranking-rank-story">
          <span className="ranking-rank-story-number">{String(entry.rank).padStart(2, '0')}</span>
          <span className="ranking-rank-story-copy">
            <strong>{TIER_NAMES[entry.tier] ?? entry.tier} 级</strong>
            <small>{formatCompactNumber(entry.games)} 场样本</small>
          </span>
          <span className="ranking-rank-story-percent">
            <strong>前 {rankingPercent}%</strong>
            <small>综合位置</small>
          </span>
        </div>

        <div className="ranking-signature">
          <div className="ranking-signature-head">
            <span>{primaryLabel}表现</span>
            <strong>{entry.winRate.toFixed(1)}<small>%</small></strong>
          </div>
          <div className="ranking-signature-scale">
            <span className="ranking-signature-scale-mid" />
            <motion.i
              key={entry.champion.id}
              initial={{ left: '50%', opacity: 0 }}
              animate={{ left: `${winScalePosition}%`, opacity: 1 }}
              transition={{ duration: 0.38, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>
          <div className="ranking-signature-ticks"><span>40</span><span>50</span><span>60+</span></div>
          <div className="ranking-signature-secondary">
            <span><small>登场率</small><strong>{formatPercent(entry.pickRate)}</strong></span>
            <span><small>{thirdLabel}</small><strong>{formatPercent(thirdValue)}</strong></span>
            {entry.kda !== null && <span><small>KDA</small><strong>{entry.kda.toFixed(2)}</strong></span>}
          </div>
        </div>

        {entry.counters.length > 0 && (
          <div className="ranking-counter-section">
            <div className="ranking-detail-section-title">
              <span>克制关系</span>
              <small>对阵胜率</small>
            </div>
            <div className="ranking-counter-list">
              {entry.counters.map((counter) => (
                <div key={counter.champion.id} className="ranking-counter-portrait">
                  <span className="ranking-counter-avatar">
                    {counter.champion.avatar && <img src={counter.champion.avatar} alt={counter.champion.name} />}
                  </span>
                  <span>{counter.champion.name}</span>
                  <strong>{formatPercent(counter.winRate)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </motion.aside>
  );
}

function RankingSkeleton() {
  return (
    <div className="ranking-list-body" aria-label="正在载入英雄排行">
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="ranking-row ranking-row--skeleton">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function ChampionRankingPage({ chapter }: { chapter: RankingChapter }) {
  const [mode, setMode] = useState<ChampionRankingMode>('ranked');
  const [region, setRegion] = useState<ChampionRankingRegion>('global');
  const [tier, setTier] = useState('all');
  const [position, setPosition] = useState<ChampionRankingPosition>('TOP');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<ChampionRankingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const next = await window.lolHelper.ranking.getChampions({
        mode,
        region,
        tier,
        position,
        refresh,
      });
      if (requestId !== requestRef.current) return;
      setResult(next);
      setSelectedId((current) => next.entries.some((entry) => entry.champion.id === current)
        ? current
        : next.entries[0]?.champion.id ?? null);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setResult({
        entries: [],
        meta: { mode, version: '', analyzedAt: '', matchCount: null, source: '' },
        error: error instanceof Error ? error.message : '英雄排行获取失败',
      });
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [mode, position, region, tier]);

  useEffect(() => {
    if (chapter === 'ranking') void load(false);
  }, [chapter, load]);

  const visibleEntries = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    if (!keyword) return result?.entries ?? [];
    return (result?.entries ?? []).filter((entry) =>
      `${entry.champion.name} ${entry.champion.title} ${entry.champion.alias}`
        .toLocaleLowerCase()
        .includes(keyword));
  }, [result?.entries, search]);

  const selectedEntry = useMemo(() => {
    const entries = result?.entries ?? [];
    return entries.find((entry) => entry.champion.id === selectedId) ?? visibleEntries[0] ?? null;
  }, [result?.entries, selectedId, visibleEntries]);

  const primaryLabel = mode === 'arena' ? '前二率' : '胜率';
  const thirdLabel = mode === 'arena' ? '第一率' : '禁用率';
  const canChooseRegion = mode !== 'hextech';
  const canChooseTier = mode === 'ranked' || mode === 'aram';
  const canChoosePosition = mode === 'ranked';
  const fixedRegionOptions: MenuOption<ChampionRankingRegion>[] = [{ value: 'global', label: '统一数据' }];
  const fixedTierOptions: MenuOption<string>[] = [{ value: 'all', label: '全部段位' }];
  const fixedPositionOptions: MenuOption<ChampionRankingPosition>[] = [{ value: 'ALL', label: '全部位置' }];
  if (chapter === 'mayhem') {
    return <MayhemGuidePage />;
  }

  return (
    <section className="ranking-page">
      <header className="ranking-toolbar">
        <div className="ranking-filters">
          <FilterMenu value={mode} options={MODE_OPTIONS} onChange={setMode} wide />
          <FilterMenu
            value={canChooseRegion ? region : 'global'}
            options={canChooseRegion ? REGION_OPTIONS : fixedRegionOptions}
            onChange={setRegion}
            disabled={!canChooseRegion}
          />
          <FilterMenu
            value={canChooseTier ? tier : 'all'}
            options={canChooseTier ? TIER_OPTIONS : fixedTierOptions}
            onChange={setTier}
            disabled={!canChooseTier}
          />
          <FilterMenu
            value={canChoosePosition ? position : 'ALL'}
            options={canChoosePosition ? POSITION_OPTIONS : fixedPositionOptions}
            onChange={setPosition}
            disabled={!canChoosePosition}
          />
          <label className="ranking-search">
            <Search className="size-3.5" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索英雄"
            />
          </label>
          <button
            type="button"
            onClick={() => void load(true)}
            className="ranking-refresh"
            title="刷新排行"
            aria-label="刷新排行"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {result?.error && <div className="ranking-notice">{result.error}</div>}

      <div className="ranking-workspace">
        <div className="ranking-list">
          <div className="ranking-list-head">
            <span>排名</span>
            <span>英雄</span>
            <span>级别</span>
            <span>{primaryLabel}</span>
            <span>登场率</span>
            <span>{thirdLabel}</span>
            <span>变化</span>
          </div>

          {loading && !result ? (
            <RankingSkeleton />
          ) : visibleEntries.length > 0 ? (
            <div className="ranking-list-body">
              {visibleEntries.map((entry, index) => {
                const selected = entry.champion.id === selectedEntry?.champion.id;
                const tone = HERO_TONES[entry.champion.id % HERO_TONES.length];
                const thirdValue = mode === 'arena' ? entry.firstPlaceRate : entry.banRate;
                return (
                  <motion.button
                    layout="position"
                    key={entry.champion.id}
                    type="button"
                    onClick={() => setSelectedId(entry.champion.id)}
                    className={`ranking-row ${selected ? 'ranking-row--selected' : ''}`}
                    style={{ '--champion-tone': tone } as React.CSSProperties}
                    initial={index < 12 ? { opacity: 0, y: 5 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(index, 8) * 0.018 }}
                  >
                    <span className={`ranking-number ranking-number--${Math.min(entry.rank, 4)}`}>
                      {String(entry.rank).padStart(2, '0')}
                    </span>
                    <span className="ranking-champion-cell">
                      <ChampionAvatar entry={entry} />
                      <span className="min-w-0">
                        <strong>{entry.champion.name}</strong>
                        <small>{entry.champion.title || formatCompactNumber(entry.games) + ' 场'}</small>
                      </span>
                    </span>
                    <span className={`ranking-tier ranking-tier--${entry.tier}`}>
                      {TIER_NAMES[entry.tier] ?? entry.tier}
                    </span>
                    <span className={entry.winRate >= 50 ? 'ranking-positive' : ''}>{formatPercent(entry.winRate)}</span>
                    <span>{formatPercent(entry.pickRate)}</span>
                    <span>{formatPercent(thirdValue)}</span>
                    <TrendMark entry={entry} />
                  </motion.button>
                );
              })}
            </div>
          ) : (
            <div className="ranking-empty">
              <Search className="size-5" />
              <span>{search ? '没有找到这个英雄' : '暂时没有排行数据'}</span>
            </div>
          )}
        </div>

        <DetailPanel
          entry={selectedEntry}
          mode={mode}
          totalEntries={result?.entries.length ?? 0}
        />
      </div>
    </section>
  );
}
