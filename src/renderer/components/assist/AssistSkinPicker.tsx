import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Check, LoaderCircle, Search, X } from 'lucide-react';
import type { AssistChampionSkin, ChampionSummary } from '../../../shared/api';
import { ChampionAvatar, championDisplayName } from './AssistChampionPicker';
import { localizeAssistMessage } from './assistText';

// 生涯背景选择：左边挑英雄，右边是这个英雄的全部皮肤原画，点哪张就用哪张。

const collator = new Intl.Collator('zh-CN-u-co-pinyin');

export function backgroundSkinId(value: number): number {
  if (value <= 0) return 0;
  return value < 1000 ? value * 1000 : value;
}

export function skinSplashSources(skinId: number): string[] {
  if (skinId <= 0) return [];
  const championId = Math.floor(skinId / 1000);
  return [
    `https://game.gtimg.cn/images/lol/act/img/skin/big${skinId}.jpg`,
    `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-splashes/${championId}/${skinId}.jpg`,
  ];
}

function SkinImage({ sources, alt }: { sources: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const src = sources[index];
  if (!src) return <span className="sp-skin__missing">暂无原画</span>;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIndex((current) => current + 1)}
    />
  );
}

export function AssistSkinPicker({
  champions,
  value,
  onSelect,
  onClose,
}: {
  champions: ChampionSummary[];
  value: number;
  onSelect: (skinId: number) => void;
  onClose: () => void;
}) {
  const currentSkin = backgroundSkinId(value);
  const sorted = useMemo(
    () => [...champions].sort((a, b) => collator.compare(championDisplayName(a), championDisplayName(b))),
    [champions],
  );
  const [championId, setChampionId] = useState(() => (currentSkin ? Math.floor(currentSkin / 1000) : sorted[0]?.id ?? 0));
  const [query, setQuery] = useState('');
  const [skinsByChampion, setSkinsByChampion] = useState<Map<number, AssistChampionSkin[]>>(new Map());
  const [errors, setErrors] = useState<Map<number, string>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时把当前背景所在的英雄滚到视野里。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!championId || skinsByChampion.has(championId) || errors.has(championId)) return undefined;
    let cancelled = false;
    const load = typeof window.lolHelper.assist.getChampionSkins === 'function'
      ? window.lolHelper.assist.getChampionSkins(championId)
      : Promise.reject(new Error('当前版本不支持，请重启助手'));
    load
      .then((skins) => {
        if (!cancelled) setSkinsByChampion((current) => new Map(current).set(championId, skins));
      })
      .catch((error) => {
        if (!cancelled) setErrors((current) => new Map(current).set(championId, localizeAssistMessage(String(error))));
      });
    return () => {
      cancelled = true;
    };
  }, [championId, errors, skinsByChampion]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sorted;
    return sorted.filter((champion) => [champion.title, champion.name, champion.alias]
      .some((text) => String(text ?? '').toLowerCase().includes(keyword)));
  }, [query, sorted]);

  const champion = champions.find((item) => item.id === championId);
  const skins = skinsByChampion.get(championId);
  const error = errors.get(championId);

  return (
    <Dialog.Root open onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="cp-overlay" />
        <Dialog.Content className="cp-dialog sp-dialog">
          <header className="cp-head">
            <div>
              <Dialog.Title className="cp-title">选一张生涯背景</Dialog.Title>
              <Dialog.Description className="cp-subtitle">先在左边挑英雄，再点一张皮肤原画</Dialog.Description>
            </div>
            <Dialog.Close className="cp-close" aria-label="关闭"><X /></Dialog.Close>
          </header>

          <div className="sp-body">
            <aside className="sp-champs">
              <div className="cp-search">
                <Search />
                <input
                  autoFocus
                  value={query}
                  placeholder="搜英雄"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div ref={listRef} className="sp-champ-list" role="listbox" aria-label="英雄">
                {visible.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.id === championId}
                    className="sp-champ"
                    onClick={() => setChampionId(item.id)}
                  >
                    <ChampionAvatar champion={item} />
                    <span>{championDisplayName(item)}</span>
                    {currentSkin > 0 && Math.floor(currentSkin / 1000) === item.id && <i>当前</i>}
                  </button>
                ))}
              </div>
            </aside>

            <section className="sp-skins">
              <div className="sp-skins__head">
                <b>{champion ? championDisplayName(champion) : '选一个英雄'}</b>
                {skins && <span>共 {skins.length} 款皮肤</span>}
              </div>
              {error ? (
                <div className="as-empty"><b>皮肤读不出来</b><span>{error}</span></div>
              ) : !skins ? (
                <div className="as-empty"><LoaderCircle className="as-spin" /><b>正在读取皮肤…</b></div>
              ) : (
                <div className="sp-grid">
                  {skins.map((skin) => (
                    <button
                      key={skin.id}
                      type="button"
                      className="sp-skin"
                      aria-pressed={skin.id === currentSkin}
                      onClick={() => {
                        onSelect(skin.id);
                        onClose();
                      }}
                    >
                      <SkinImage sources={[skin.splash, skin.splashFallback]} alt={skin.name} />
                      <span className="sp-skin__name">{skin.name}</span>
                      {skin.id === currentSkin && <span className="sp-skin__check"><Check /></span>}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
