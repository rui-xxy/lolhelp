import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Crosshair,
  Gem,
  HeartHandshake,
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
  MayhemAugmentRarity,
  MayhemChampionBuild,
  MayhemChampionEntry,
  MayhemChampionRole,
  MayhemChampionTier,
  MayhemItemBuildOption,
  MayhemItemGroupKey,
  MayhemTierListResult,
} from '../../../shared/api';
import { MayhemAugmentRanking } from './MayhemAugmentRanking';
import { MayhemComboRanking } from './MayhemComboRanking';

type RoleFilter = 'all' | MayhemChampionRole;

interface RoleOption {
  value: RoleFilter;
  label: string;
  icon: LucideIcon;
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: 'all', label: '全部', icon: Sparkles },
  { value: 'assassin', label: '刺客', icon: Zap },
  { value: 'fighter', label: '战士', icon: Swords },
  { value: 'mage', label: '法师', icon: WandSparkles },
  { value: 'marksman', label: '射手', icon: Crosshair },
  { value: 'support', label: '辅助', icon: HeartHandshake },
  { value: 'tank', label: '坦克', icon: Shield },
];

const ROLE_LABELS: Record<MayhemChampionRole, string> = {
  assassin: '刺客',
  fighter: '战士',
  mage: '法师',
  marksman: '射手',
  support: '辅助',
  tank: '坦克',
};

const TIER_ORDER: MayhemChampionTier[] = ['S+', 'S', 'A', 'B', 'C', 'D'];
const TIER_COPY: Record<MayhemChampionTier, string> = {
  'S+': '神级',
  S: '强势',
  A: '优秀',
  B: '均衡',
  C: '偏弱',
  D: '艰难',
};

const ITEM_GROUP_COPY: Record<MayhemItemGroupKey, { title: string; note: string }> = {
  starting: { title: '优先装备', note: '单件选择' },
  boots: { title: '鞋子', note: '移动方案' },
  core: { title: '核心组合', note: '三件套路线' },
  late: { title: '前期组件', note: '开局过渡' },
};

const RARITY_COPY: Record<MayhemAugmentRarity, string> = {
  prismatic: '棱彩',
  gold: '金色',
  silver: '银色',
};

function compactPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function RoleFilters({ value, onChange }: { value: RoleFilter; onChange: (value: RoleFilter) => void }) {
  return (
    <div className="mayhem-role-filter" role="tablist" aria-label="英雄职业">
      {ROLE_OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={option.value === value}
            className={option.value === value ? 'is-active' : ''}
            onClick={() => onChange(option.value)}
            title={option.label}
          >
            <Icon className="size-3.5" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TierHeroCard({ champion, onOpen }: { champion: MayhemChampionEntry; onOpen: () => void }) {
  return (
    <motion.button
      layout="position"
      type="button"
      className="mayhem-hero-card"
      onClick={onOpen}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.14 }}
    >
      <span className="mayhem-hero-rank">{String(champion.rank).padStart(2, '0')}</span>
      <img src={champion.image} alt={champion.name} />
      <span className="mayhem-hero-copy">
        <strong>{champion.name}</strong>
        <small>{champion.roles.slice(0, 2).map((role) => ROLE_LABELS[role]).join(' / ')}</small>
      </span>
      <span className="mayhem-hero-rate">
        <strong>{compactPercent(champion.winRate)}</strong>
        <small>{compactPercent(champion.pickRate)} 登场</small>
      </span>
    </motion.button>
  );
}

function ItemIcons({ option }: { option: MayhemItemBuildOption }) {
  return (
    <span className="mayhem-item-icons">
      {option.items.map((item) => (
        <span key={`${item.name}:${item.icon}`} title={item.name}>
          <img src={item.icon} alt={item.name} />
        </span>
      ))}
    </span>
  );
}

function ItemBuildSection({
  groupKey,
  options,
}: {
  groupKey: MayhemItemGroupKey;
  options: MayhemItemBuildOption[];
}) {
  const copy = ITEM_GROUP_COPY[groupKey];
  return (
    <section className={`mayhem-build-group mayhem-build-group--${groupKey}`}>
      <header>
        <h3>{copy.title}</h3>
        <span>{copy.note}</span>
      </header>
      <div className="mayhem-build-options">
        {options.slice(0, groupKey === 'core' ? 5 : 4).map((option, index) => (
          <div key={`${groupKey}:${index}`} className="mayhem-build-option">
            <ItemIcons option={option} />
            <span className="mayhem-build-option-stats">
              <strong>{compactPercent(option.winRate)}</strong>
              <small>{compactPercent(option.pickRate)} 使用</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AugmentColumns({ build }: { build: MayhemChampionBuild }) {
  return (
    <section className="mayhem-detail-section">
      <div className="mayhem-section-heading">
        <div>
          <span className="mayhem-section-kicker">AUGMENT SIGNAL</span>
          <h2>强化推荐</h2>
        </div>
        <p>按稀有度展示当前英雄胜率更高的选择</p>
      </div>
      <div className="mayhem-augment-columns">
        {(['prismatic', 'gold', 'silver'] as const).map((rarity) => {
          const entries = build.augments.filter((augment) => augment.rarity === rarity).slice(0, 6);
          return (
            <div key={rarity} className={`mayhem-augment-column mayhem-augment-column--${rarity}`}>
              <header>
                <Gem className="size-3.5" />
                <strong>{RARITY_COPY[rarity]}</strong>
                <span>{entries.length}</span>
              </header>
              <div>
                {entries.map((augment) => (
                  <div
                    key={augment.slug}
                    className="mayhem-augment-row"
                    tabIndex={0}
                    aria-label={`${augment.name}，胜率 ${compactPercent(augment.winRate)}。${augment.effect}`}
                  >
                    <img src={augment.icon} alt={augment.name} />
                    <span>
                      <strong>{augment.name}</strong>
                      <small>{augment.effect}</small>
                    </span>
                    <b>{compactPercent(augment.winRate)}</b>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BuildDetail({ build, onBack }: { build: MayhemChampionBuild; onBack: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const mainSkill = build.skillOrders[0];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [build.slug]);

  return (
    <motion.div
      ref={scrollRef}
      key={build.slug}
      className="mayhem-detail-scroll"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2 }}
    >
      <button type="button" className="mayhem-back" onClick={onBack}>
        <ArrowLeft className="size-3.5" />
        返回强度榜
      </button>

      <section className="mayhem-profile-band">
        <div className={`mayhem-profile-tier mayhem-tier-tone--${build.tier.replace('+', 'plus')}`}>
          {build.tier}
        </div>
        <img className="mayhem-profile-avatar" src={build.image} alt={build.name} />
        <div className="mayhem-profile-copy">
          <span>{build.alias || '英雄档案'}</span>
          <h1>{build.name}</h1>
          <p>{build.roles.join(' · ')}</p>
        </div>
        <div className="mayhem-profile-stat">
          <small>胜率</small>
          <strong>{compactPercent(build.winRate)}</strong>
        </div>
        <div className="mayhem-profile-stat">
          <small>登场率</small>
          <strong>{compactPercent(build.pickRate)}</strong>
        </div>
        <div className="mayhem-profile-balance">
          {build.balance.length > 0 ? build.balance.map((modifier) => (
            <span key={`${modifier.label}:${modifier.value}`} data-direction={modifier.direction}>
              <small>{modifier.label}</small>
              <strong>{modifier.value}</strong>
            </span>
          )) : <span className="is-neutral">本版本无额外平衡修正</span>}
        </div>
      </section>

      <section className="mayhem-detail-section">
        <div className="mayhem-section-heading">
          <div>
            <span className="mayhem-section-kicker">BUILD ROUTES</span>
            <h2>装备路线</h2>
          </div>
          {mainSkill && (
            <div className="mayhem-skill-summary">
              <span>技能主升</span>
              <strong>{mainSkill.priority}</strong>
              <small>{compactPercent(mainSkill.winRate)} 胜率</small>
            </div>
          )}
        </div>
        <div className="mayhem-build-grid">
          {(Object.keys(ITEM_GROUP_COPY) as MayhemItemGroupKey[]).map((groupKey) => (
            <ItemBuildSection key={groupKey} groupKey={groupKey} options={build.itemGroups[groupKey]} />
          ))}
        </div>
      </section>

      <AugmentColumns build={build} />

      {build.skillOrders.length > 0 && (
        <section className="mayhem-detail-section mayhem-skill-section">
          <div className="mayhem-section-heading">
            <div>
              <span className="mayhem-section-kicker">LEVEL ORDER</span>
              <h2>技能加点</h2>
            </div>
          </div>
          <div className="mayhem-skill-orders">
            {build.skillOrders.map((order) => (
              <div key={order.priority}>
                <span className="mayhem-skill-priority">{order.priority}</span>
                <span>{compactPercent(order.pickRate)} 使用</span>
                <strong>{compactPercent(order.winRate)}</strong>
                <small>{order.sequences[0]?.sequence ?? ''}</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}

function ListSkeleton() {
  return (
    <div className="mayhem-list-skeleton" aria-label="正在载入海克斯大乱斗强度榜">
      {Array.from({ length: 20 }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function MayhemGuidePage() {
  const [contentTab, setContentTab] = useState<'champions' | 'augments' | 'combos'>('champions');
  const [role, setRole] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<MayhemTierListResult | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [build, setBuild] = useState<MayhemChampionBuild | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingBuild, setLoadingBuild] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const loadList = useCallback(async (refresh = false) => {
    setLoadingList(true);
    setError('');
    try {
      const next = await window.lolHelper.ranking.getMayhemTierList(refresh);
      setResult(next);
      setError(next.error ?? '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '海克斯大乱斗强度榜获取失败');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList(false);
  }, [loadList]);

  const openChampion = useCallback(async (slug: string) => {
    const requestId = ++requestRef.current;
    setSelectedSlug(slug);
    setBuild(null);
    setLoadingBuild(true);
    setError('');
    try {
      const next = await window.lolHelper.ranking.getMayhemBuild(slug, false);
      if (requestId !== requestRef.current) return;
      setBuild(next.build);
      setError(next.error ?? '');
    } catch (reason) {
      if (requestId !== requestRef.current) return;
      setError(reason instanceof Error ? reason.message : '英雄详情获取失败');
    } finally {
      if (requestId === requestRef.current) setLoadingBuild(false);
    }
  }, []);

  const closeBuild = useCallback(() => {
    requestRef.current += 1;
    setSelectedSlug(null);
    setBuild(null);
    setLoadingBuild(false);
    setError('');
  }, []);

  const visibleEntries = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return (result?.entries ?? []).filter((entry) => {
      const matchesRole = role === 'all' || entry.roles.includes(role);
      const matchesSearch = !keyword || `${entry.name} ${entry.slug}`.toLocaleLowerCase().includes(keyword);
      return matchesRole && matchesSearch;
    });
  }, [result?.entries, role, search]);

  const groupedEntries = useMemo(() => TIER_ORDER.map((tier) => ({
    tier,
    entries: visibleEntries.filter((entry) => entry.tier === tier),
  })).filter((group) => group.entries.length > 0), [visibleEntries]);

  return (
    <section className="ranking-page mayhem-page">
      <header className="ranking-toolbar mayhem-toolbar">
        <nav className="mayhem-content-tabs" aria-label="海克斯大乱斗数据分类">
          <button
            type="button"
            className={contentTab === 'champions' ? 'is-active' : ''}
            aria-current={contentTab === 'champions' ? 'page' : undefined}
            onClick={() => {
              setContentTab('champions');
              closeBuild();
            }}
          >
            <Swords className="size-3.5" />
            英雄排行
          </button>
          <button
            type="button"
            className={contentTab === 'augments' ? 'is-active' : ''}
            aria-current={contentTab === 'augments' ? 'page' : undefined}
            onClick={() => {
              setContentTab('augments');
              closeBuild();
            }}
          >
            <Gem className="size-3.5" />
            符文排行
          </button>
          <button
            type="button"
            className={contentTab === 'combos' ? 'is-active' : ''}
            aria-current={contentTab === 'combos' ? 'page' : undefined}
            onClick={() => {
              setContentTab('combos');
              closeBuild();
            }}
          >
            <Sparkles className="size-3.5" />
            强势组合
          </button>
        </nav>
      </header>

      {error && <div className="ranking-notice">{error}</div>}

      <AnimatePresence mode="wait">
        {contentTab === 'combos' ? (
          <motion.div
            key="combo-ranking"
            className="mayhem-combo-motion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MayhemComboRanking />
          </motion.div>
        ) : contentTab === 'augments' ? (
          <motion.div
            key="augment-ranking"
            className="mayhem-augment-motion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MayhemAugmentRanking />
          </motion.div>
        ) : selectedSlug ? (
          build ? (
            <BuildDetail key="detail" build={build} onBack={closeBuild} />
          ) : loadingBuild ? (
            <div key="detail-loading" className="mayhem-detail-loading">
              <span className="mayhem-loading-orbit"><Gem className="size-5" /></span>
              <strong>正在整理英雄出装</strong>
            </div>
          ) : (
            <div key="detail-empty" className="mayhem-detail-loading">
              <strong>暂时无法读取这个英雄</strong>
              <button type="button" onClick={closeBuild}>返回强度榜</button>
            </div>
          )
        ) : (
          <motion.div
            key="list"
            className="mayhem-tier-scroll"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="mayhem-list-intro">
              <div className="mayhem-list-summary">
                <span>PATCH {result?.meta.patch || '—'}</span>
                <strong>{visibleEntries.length}</strong>
                <small>位英雄</small>
                <p>按强化符文环境下的综合强度分层</p>
                {result?.meta.updatedAt && <time>{result.meta.updatedAt} 更新</time>}
              </div>
              <div className="mayhem-toolbar-controls">
                <RoleFilters value={role} onChange={setRole} />
                <label className="ranking-search mayhem-search">
                  <Search className="size-3.5" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索英雄" />
                </label>
                <button
                  type="button"
                  className="ranking-refresh"
                  onClick={() => void loadList(true)}
                  title="刷新海克斯大乱斗数据"
                  aria-label="刷新海克斯大乱斗数据"
                >
                  <RefreshCw className={`size-3.5 ${loadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loadingList && !result ? <ListSkeleton /> : groupedEntries.length > 0 ? (
              <div className="mayhem-tier-groups">
                {groupedEntries.map((group) => (
                  <section key={group.tier} className={`mayhem-tier-group mayhem-tier-group--${group.tier.replace('+', 'plus')}`}>
                    <header>
                      <span>{group.tier}</span>
                      <div>
                        <strong>{TIER_COPY[group.tier]}</strong>
                        <small>{group.entries.length} 位英雄</small>
                      </div>
                    </header>
                    <div className="mayhem-hero-grid">
                      {group.entries.map((champion) => (
                        <TierHeroCard
                          key={champion.slug}
                          champion={champion}
                          onOpen={() => void openChampion(champion.slug)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="ranking-empty"><Search className="size-5" /><span>没有符合条件的英雄</span></div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
