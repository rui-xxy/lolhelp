import { useEffect, useRef, useState, type CSSProperties, type WheelEvent } from 'react';
import { ArrowRight, RotateCw } from 'lucide-react';
import type { CollectionSkin } from '../../../shared/api';
import { Art, ChromaDots, RARITY_LABEL } from './HomeArt';
import type { CollectionTotals, WardrobeChampion } from './homeData';

// 衣橱：最近常玩的英雄排成一排，头像外圈是这个英雄的皮肤收集进度；
// 选中一个，下面就是他的全部皮肤：有的整张点亮，没有的缩小成两排、褪成灰，悬停才显出颜色。

export interface HallTarget {
  tab?: 'skins' | 'chromas' | 'champions' | 'wards' | 'emotes' | 'icons' | 'companions';
  skinId?: number;
  championId?: number;
}

interface WardrobeProps {
  connected: boolean;
  loading: boolean;
  error: string;
  champions: WardrobeChampion[];
  totals: CollectionTotals | null;
  onReload: () => void;
  onOpenHall: (target?: HallTarget) => void;
}

function SkinCard({ skin, onOpen }: { skin: CollectionSkin; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="hm-skin"
      data-owned={skin.owned ? 'true' : undefined}
      data-rarity={skin.rarity}
      onClick={onOpen}
      title={`${skin.name}${skin.owned ? '' : '（未拥有）'}`}
    >
      <Art src={skin.portrait} fallback={skin.portraitFallback} className="hm-skin__art" />
      <span className="hm-skin__body">
        {RARITY_LABEL[skin.rarity] && <em className="hm-skin__rarity">{RARITY_LABEL[skin.rarity]}</em>}
        <b>{skin.name}</b>
        <ChromaDots chromas={skin.chromas} max={6} />
      </span>
    </button>
  );
}

export function Wardrobe({ connected, loading, error, champions, totals, onReload, onOpenHall }: WardrobeProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const selected = champions.find((item) => item.champion.id === selectedId) ?? champions[0] ?? null;

  useEffect(() => {
    stripRef.current?.scrollTo({ left: 0 });
  }, [selected?.champion.id]);

  // 竖着滚轮也能横着翻
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    strip.scrollLeft += event.deltaY;
  };

  const owned = selected ? selected.skins.filter((skin) => skin.owned) : [];
  const missing = selected ? selected.skins.filter((skin) => !skin.owned) : [];

  return (
    <section className="hm-wardrobe" aria-label="常玩英雄的皮肤">
      <header className="hm-wardrobe__head">
        {selected ? (
          <h3>
            <b>{selected.champion.title}</b>
            <span>
              已有 <em>{selected.owned}</em>/{selected.total}
              {selected.chromas > 0 && <> · 炫彩 <em>{selected.chromas}</em></>}
              {selected.games > 0 && <> · 近期 {selected.games} 局 {selected.wins} 胜</>}
            </span>
          </h3>
        ) : (
          <h3><b>常玩英雄的皮肤</b></h3>
        )}
        <button type="button" className="hm-hall-link" onClick={() => onOpenHall()} disabled={!totals}>
          收藏馆
          {totals && (
            <span>
              皮肤 <b>{totals.skins}</b> · 炫彩 <b>{totals.chromas}</b> · 英雄 <b>{totals.champions}</b>
            </span>
          )}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </button>
      </header>

      {champions.length > 0 ? (
        <>
          <div className="hm-champs" role="tablist" aria-label="常玩英雄">
            {champions.map((item) => {
              const progress = item.total > 0 ? item.owned / item.total : 0;
              const active = item.champion.id === selected?.champion.id;
              return (
                <button
                  key={item.champion.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="hm-champ"
                  onClick={() => setSelectedId(item.champion.id)}
                  title={`${item.champion.title} · 皮肤 ${item.owned}/${item.total}`}
                  style={{ '--p': progress } as CSSProperties}
                >
                  <span className="hm-champ__ring">
                    <Art src={item.champion.avatar} className="hm-champ__face" />
                  </span>
                  <span className="hm-champ__name">{item.champion.title}</span>
                  <span className="hm-champ__count"><b>{item.owned}</b>/{item.total}</span>
                </button>
              );
            })}
          </div>

          <div className="hm-strip" ref={stripRef} onWheel={onWheel}>
            {owned.map((skin) => (
              <SkinCard key={skin.id} skin={skin} onOpen={() => onOpenHall({ tab: 'skins', skinId: skin.id })} />
            ))}
            {missing.length > 0 && (
              <span className="hm-strip__gap" aria-hidden="true">
                <b>{missing.length}</b>
                <small>未拥有</small>
              </span>
            )}
            {missing.length > 0 && (
              <div className="hm-strip__wall">
                {missing.map((skin) => (
                  <SkinCard key={skin.id} skin={skin} onOpen={() => onOpenHall({ tab: 'skins', skinId: skin.id })} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="hm-wardrobe__empty">
          {loading ? (
            <span className="hm-strip hm-strip--ghost" aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}
            </span>
          ) : (
            <p>
              {!connected ? '连上客户端后显示你的皮肤' : error || '暂无数据'}
              {connected && (
                <button type="button" onClick={onReload}>
                  <RotateCw className="size-3.5" aria-hidden="true" />
                  重新读取
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
