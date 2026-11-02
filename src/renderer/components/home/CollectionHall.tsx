import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Gem, RotateCw, Search, X } from 'lucide-react';
import type { CollectionChampion, CollectionItem, CollectionShelf, CollectionSkin, MyCollection } from '../../../shared/api';
import { HubDialog } from '../hub/HubDialog';
import { ProfileIcon } from '../ProfileIcon';
import { Art, ChromaDots, RARITY_LABEL } from './HomeArt';
import { collectionTotals } from './homeData';
import type { HallTarget } from './Wardrobe';

// 收藏馆：自己号上的全部收藏。
// 皮肤按英雄分组（常玩的在前），可以只看有的 / 只看没有的、按最近获得或品质铺开；
// 点一张皮肤看大图和它的炫彩，左右键翻。

type Tab = NonNullable<HallTarget['tab']>;
type Own = 'owned' | 'all' | 'missing';
type Order = 'champion' | 'recent' | 'rarity';

const RARITY_RANK: Record<CollectionSkin['rarity'], number> = { exalted: 6, transcendent: 6, ultimate: 5, mythic: 4, legendary: 3, epic: 2, none: 1 };
const SHELF_TABS: Array<{ key: CollectionShelf; label: string }> = [
  { key: 'wards', label: '守卫' },
  { key: 'emotes', label: '表情' },
  { key: 'icons', label: '头像' },
  { key: 'companions', label: '小小英雄' },
];

interface CollectionHallProps {
  open: boolean;
  collection: MyCollection | null;
  loading: boolean;
  error: string;
  /** 常玩英雄的顺序（皮肤分组时排在前面） */
  favoriteOrder: number[];
  target: HallTarget | null;
  onReload: () => void;
  onClose: () => void;
}

function championMatches(champion: CollectionChampion | undefined, needle: string): boolean {
  if (!needle) return true;
  return Boolean(champion && (champion.title.toLowerCase().includes(needle) || champion.name.toLowerCase().includes(needle)));
}

function formatDate(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function HallSkin({ skin, onOpen }: { skin: CollectionSkin; onOpen: () => void }) {
  return (
    <button type="button" className="ch-skin" data-owned={skin.owned ? 'true' : undefined} data-rarity={skin.rarity} onClick={onOpen} title={skin.name}>
      <Art src={skin.portrait} fallback={skin.portraitFallback} className="ch-skin__art" />
      <span className="ch-skin__body">
        <b>{skin.name}</b>
        <ChromaDots chromas={skin.chromas} max={5} />
      </span>
    </button>
  );
}

function SkinDetail({ skins, index, champion, onMove, onClose }: { skins: CollectionSkin[]; index: number; champion?: CollectionChampion; onMove: (next: number) => void; onClose: () => void }) {
  const skin = skins[index];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onMove(index - 1);
      } else if (event.key === 'ArrowRight' && index < skins.length - 1) {
        onMove(index + 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, onClose, onMove, skins.length]);
  if (!skin) return null;
  const ownedChromas = skin.chromas.filter((chroma) => chroma.owned).length;
  return (
    <div className="ch-detail" role="dialog" aria-label={skin.name}>
      <Art key={skin.id} src={skin.splash} fallback={skin.splashFallback} className="ch-detail__art" loading="eager" />
      <button type="button" className="ch-detail__close hub-icon-btn" onClick={onClose} aria-label="返回">
        <X />
      </button>
      {index > 0 && (
        <button type="button" className="ch-detail__nav" data-side="prev" onClick={() => onMove(index - 1)} aria-label="上一张">
          <ChevronLeft />
        </button>
      )}
      {index < skins.length - 1 && (
        <button type="button" className="ch-detail__nav" data-side="next" onClick={() => onMove(index + 1)} aria-label="下一张">
          <ChevronRight />
        </button>
      )}
      <div className="ch-detail__info">
        <span className="ch-detail__champ">{champion?.title}{champion?.name ? ` · ${champion.name}` : ''}</span>
        <h3>{skin.name}</h3>
        <div className="ch-detail__tags">
          <span data-owned={skin.owned ? 'true' : undefined}>{skin.owned ? '已拥有' : '未拥有'}</span>
          {RARITY_LABEL[skin.rarity] && <span data-rarity={skin.rarity}>{RARITY_LABEL[skin.rarity]}</span>}
          {skin.acquiredAt && <span>{formatDate(skin.acquiredAt)} 获得</span>}
          {skin.chromas.length > 0 && <span>炫彩 {ownedChromas}/{skin.chromas.length}</span>}
        </div>
        {skin.chromas.length > 0 && (
          <div className="ch-detail__chromas">
            {skin.chromas.map((chroma) => (
              <span key={chroma.id} data-owned={chroma.owned ? 'true' : undefined} title={`${chroma.name}${chroma.owned ? '' : '（未拥有）'}`}>
                <Art src={chroma.image} fallback={chroma.imageFallback} />
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="ch-detail__count">{index + 1} / {skins.length}</span>
    </div>
  );
}

export function CollectionHall({ open, collection, loading, error, favoriteOrder, target, onReload, onClose }: CollectionHallProps) {
  const [tab, setTab] = useState<Tab>('skins');
  const [own, setOwn] = useState<Own>('owned');
  const [order, setOrder] = useState<Order>('champion');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<{ list: CollectionSkin[]; index: number } | null>(null);

  const champions = useMemo(() => new Map((collection?.champions ?? []).map((c) => [c.id, c])), [collection]);
  const totals = useMemo(() => (collection ? collectionTotals(collection) : null), [collection]);

  // 打开时跳到指定的位置（从衣橱点进来的那张皮肤）
  useEffect(() => {
    if (!open) return;
    setTab(target?.tab ?? 'skins');
    setQuery('');
    setOrder('champion');
    if (target?.skinId && collection) {
      const skin = collection.skins.find((item) => item.id === target.skinId);
      if (skin) {
        const list = collection.skins
          .filter((item) => item.championId === skin.championId)
          .sort((a, b) => Number(b.owned) - Number(a.owned) || Number(a.isBase) - Number(b.isBase) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.id - a.id);
        setOwn(skin.owned ? 'owned' : 'all');
        setDetail({ list, index: Math.max(0, list.findIndex((item) => item.id === skin.id)) });
        return;
      }
    }
    setOwn('owned');
    setDetail(null);
  }, [open, target, collection]);

  const needle = query.trim().toLowerCase();

  const skins = useMemo(() => {
    if (!collection) return [];
    return collection.skins.filter((skin) => {
      if (skin.isBase) return false;
      if (own === 'owned' && !skin.owned) return false;
      if (own === 'missing' && skin.owned) return false;
      if (!needle) return true;
      return skin.name.toLowerCase().includes(needle) || championMatches(champions.get(skin.championId), needle);
    });
  }, [collection, own, needle, champions]);

  const groups = useMemo(() => {
    if (order !== 'champion') return [];
    const rank = new Map(favoriteOrder.map((id, index) => [id, index]));
    const byChampion = new Map<number, CollectionSkin[]>();
    for (const skin of skins) {
      const list = byChampion.get(skin.championId) ?? [];
      list.push(skin);
      byChampion.set(skin.championId, list);
    }
    return [...byChampion.entries()]
      .map(([id, list]) => {
        const all = collection?.skins.filter((skin) => skin.championId === id && !skin.isBase) ?? [];
        return {
          champion: champions.get(id),
          id,
          skins: list.sort((a, b) => Number(b.owned) - Number(a.owned) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.id - a.id),
          owned: all.filter((skin) => skin.owned).length,
          total: all.length,
        };
      })
      .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) || b.owned - a.owned || (a.champion?.title ?? '').localeCompare(b.champion?.title ?? '', 'zh-CN'));
  }, [champions, collection, favoriteOrder, order, skins]);

  const flat = useMemo(() => {
    if (order === 'champion') return [];
    return [...skins].sort((a, b) =>
      order === 'recent'
        ? (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0) || b.id - a.id
        : RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.id - a.id,
    );
  }, [order, skins]);

  const chromas = useMemo(() => {
    if (!collection) return [];
    return collection.skins.flatMap((skin) =>
      skin.chromas
        .filter((chroma) => (own === 'owned' ? chroma.owned : own === 'missing' ? !chroma.owned : true))
        .filter(() => !needle || skin.name.toLowerCase().includes(needle) || championMatches(champions.get(skin.championId), needle))
        .map((chroma) => ({ chroma, skin })),
    );
  }, [collection, own, needle, champions]);

  const championList = useMemo(() => {
    if (!collection) return [];
    return collection.champions
      .filter((champion) => (own === 'owned' ? champion.owned : own === 'missing' ? !champion.owned : true))
      .filter((champion) => championMatches(champion, needle))
      .sort((a, b) => (b.masteryPoints ?? 0) - (a.masteryPoints ?? 0) || a.title.localeCompare(b.title, 'zh-CN'));
  }, [collection, own, needle]);

  const shelfItems = (shelf: CollectionShelf): CollectionItem[] =>
    (collection?.shelves[shelf]?.items ?? []).filter((item) => !needle || item.name.toLowerCase().includes(needle));

  const openSkin = (list: CollectionSkin[], skin: CollectionSkin) => setDetail({ list, index: list.indexOf(skin) });
  const isShelf = SHELF_TABS.some((item) => item.key === tab);
  const showOwnFilter = tab === 'skins' || tab === 'chromas' || tab === 'champions';

  const nav: Array<{ key: Tab; label: string; count?: string }> = [
    { key: 'skins', label: '皮肤', count: totals ? `${totals.skins}` : undefined },
    { key: 'chromas', label: '炫彩', count: totals ? `${totals.chromas}` : undefined },
    { key: 'champions', label: '英雄', count: totals ? `${totals.champions}` : undefined },
    ...SHELF_TABS.map((item) => {
      const shelf = collection?.shelves[item.key];
      return { key: item.key, label: item.label, count: shelf?.ok ? `${shelf.items.length}` : shelf ? '—' : undefined };
    }),
  ];

  return (
    <HubDialog
      open={open}
      onClose={onClose}
      title="收藏馆"
      subtitle={collection?.riotId.split('#')[0]}
      icon={<Gem />}
      variant="collection"
      actions={(
        <button type="button" className="hub-icon-btn" onClick={onReload} disabled={loading} title="重新读取" aria-label="重新读取">
          <RotateCw className={loading ? 'animate-spin' : undefined} />
        </button>
      )}
    >
      <div className="ch">
        <nav className="ch-nav" aria-label="收藏分类">
          {nav.map((item) => (
            <button key={item.key} type="button" aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>
              {item.label}
              {item.count !== undefined && <b>{item.count}</b>}
            </button>
          ))}
          {totals && (
            <div className="ch-nav__meter" style={{ '--p': totals.skinsAll ? totals.skins / totals.skinsAll : 0 } as CSSProperties}>
              <span>皮肤收集</span>
              <b>{totals.skinsAll ? ((totals.skins / totals.skinsAll) * 100).toFixed(1) : '0'}<small>%</small></b>
              <i aria-hidden="true" />
            </div>
          )}
          {collection && collection.diagnostics.length > 0 && (
            <p className="ch-nav__note" title={collection.diagnostics.join('\n')}>有 {collection.diagnostics.length} 项没读到</p>
          )}
        </nav>

        <div className="ch-main">
          <div className="ch-tools">
            <label className="ch-search">
              <Search aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'skins' || tab === 'chromas' || tab === 'champions' ? '英雄或皮肤名' : '名字'} />
            </label>
            {showOwnFilter && (
              <div className="ch-seg" role="radiogroup" aria-label="拥有">
                {(['owned', 'all', 'missing'] as Own[]).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={own === value} onClick={() => setOwn(value)}>
                    {value === 'owned' ? '已有' : value === 'all' ? '全部' : '没有'}
                  </button>
                ))}
              </div>
            )}
            {tab === 'skins' && (
              <div className="ch-seg" role="radiogroup" aria-label="排列">
                {(['champion', 'recent', 'rarity'] as Order[]).map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={order === value} onClick={() => setOrder(value)}>
                    {value === 'champion' ? '按英雄' : value === 'recent' ? '最近获得' : '按品质'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ch-scroll">
            {!collection ? (
              <div className="ch-empty">
                {loading ? '读取中…' : error || '连上客户端后显示'}
                {!loading && <button type="button" onClick={onReload}>重新读取</button>}
              </div>
            ) : tab === 'skins' ? (
              order === 'champion' ? (
                groups.length > 0 ? groups.map((group) => (
                  <section key={group.id} className="ch-group">
                    <header>
                      <Art src={group.champion?.avatar ?? ''} className="ch-group__face" />
                      <b>{group.champion?.title ?? `英雄 ${group.id}`}</b>
                      <span className="ch-group__meter" style={{ '--p': group.total ? group.owned / group.total : 0 } as CSSProperties}>
                        <i aria-hidden="true" />
                        {group.owned}/{group.total}
                      </span>
                    </header>
                    <div className="ch-grid">
                      {group.skins.map((skin) => <HallSkin key={skin.id} skin={skin} onOpen={() => openSkin(group.skins, skin)} />)}
                    </div>
                  </section>
                )) : <div className="ch-empty">没有符合的皮肤</div>
              ) : (
                <div className="ch-grid">
                  {flat.map((skin) => <HallSkin key={skin.id} skin={skin} onOpen={() => openSkin(flat, skin)} />)}
                </div>
              )
            ) : tab === 'chromas' ? (
              <div className="ch-tiles ch-tiles--chroma">
                {chromas.map(({ chroma, skin }) => (
                  <div key={chroma.id} className="ch-tile" data-owned={chroma.owned ? 'true' : undefined} title={`${skin.name} · ${chroma.name}`}>
                    <Art src={chroma.image} fallback={chroma.imageFallback} className="ch-tile__art" />
                    <b>{chroma.name || skin.name}</b>
                    <small>{skin.name}</small>
                  </div>
                ))}
                {chromas.length === 0 && <div className="ch-empty">没有符合的炫彩</div>}
              </div>
            ) : tab === 'champions' ? (
              <div className="ch-tiles ch-tiles--champ">
                {championList.map((champion) => (
                  <div key={champion.id} className="ch-tile" data-owned={champion.owned ? 'true' : undefined}>
                    <Art src={champion.avatar} className="ch-tile__art" />
                    <b>{champion.title}</b>
                    <small>{champion.masteryLevel ? `熟练度 ${champion.masteryLevel} 级` : champion.name}</small>
                  </div>
                ))}
              </div>
            ) : isShelf ? (
              (() => {
                const shelf = collection.shelves[tab as CollectionShelf];
                const items = shelfItems(tab as CollectionShelf);
                if (!shelf?.ok) return <div className="ch-empty">这一类没读到</div>;
                return (
                  <>
                    {shelf.total > 0 && <p className="ch-shelf-meta">{shelf.items.length} / {shelf.total}</p>}
                    <div className={`ch-tiles ch-tiles--${tab}`}>
                      {items.map((item) => (
                        <div key={item.id} className="ch-tile" data-owned="true" title={item.name}>
                          {tab === 'icons' ? (
                            <ProfileIcon iconId={item.id} alt={item.name} size={64} className="ch-tile__art" />
                          ) : (
                            <Art src={item.image} fallback={item.imageFallback} className="ch-tile__art" />
                          )}
                          <b>{item.name}</b>
                          {item.acquiredAt && <small>{formatDate(item.acquiredAt)}</small>}
                        </div>
                      ))}
                      {items.length === 0 && <div className="ch-empty">还没有</div>}
                    </div>
                  </>
                );
              })()
            ) : null}
          </div>
        </div>

        {detail && (
          <SkinDetail
            skins={detail.list}
            index={detail.index}
            champion={champions.get(detail.list[detail.index]?.championId ?? 0)}
            onMove={(index) => setDetail((current) => (current ? { ...current, index } : current))}
            onClose={() => setDetail(null)}
          />
        )}
      </div>
    </HubDialog>
  );
}
