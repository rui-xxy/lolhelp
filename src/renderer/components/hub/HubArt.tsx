import { useEffect, useMemo, useState } from 'react';
import type { ChampionSummary } from '../../../shared/api';
import { buildChampionSplashFromAvatar } from '../../../shared/gameAssets';

// 两个窗口共用的小图形：英雄原画背景、近几场胜负条。

/** 英雄原画：优先用给定原画，否则从头像地址推出原画；加载失败就什么都不显示。 */
export function ChampionSplash({
  avatar,
  championId,
  src: explicitSrc,
  className,
}: {
  avatar?: string;
  championId?: number;
  src?: string;
  className: string;
}) {
  const src = explicitSrc || (avatar ? buildChampionSplashFromAvatar(avatar, championId, null, 0) : '');
  const [failed, setFailed] = useState('');
  if (!src || failed === src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      onError={() => setFailed(src)}
    />
  );
}

/** 胜负条：蓝胜红负，最新的在左边。 */
export function ResultDots({ results, className = 'pl-dots' }: { results: Array<{ key: string | number; win: boolean }>; className?: string }) {
  if (results.length === 0) return null;
  return (
    <span className={className} aria-label={`最近 ${results.length} 场 ${results.filter((item) => item.win).length} 胜`}>
      {results.map((item) => (
        <i key={item.key} data-win={item.win ? 'true' : 'false'} />
      ))}
    </span>
  );
}

let championCache: Map<number, ChampionSummary> | null = null;
let championPromise: Promise<Map<number, ChampionSummary>> | null = null;

/** 英雄表（id → 名字 / 头像），整个应用只读一次。 */
export function useChampionCatalog(): Map<number, ChampionSummary> {
  const [catalog, setCatalog] = useState<Map<number, ChampionSummary>>(() => championCache ?? new Map());
  useEffect(() => {
    if (championCache) return undefined;
    let cancelled = false;
    championPromise ??= window.lolHelper.match.getChampions()
      .then((list) => new Map(list.map((champion) => [champion.id, champion])))
      .catch(() => {
        championPromise = null;
        return new Map<number, ChampionSummary>();
      });
    void championPromise.then((map) => {
      if (map.size > 0) championCache = map;
      if (!cancelled) setCatalog(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return catalog;
}

/** 英雄中文名（id → 名字）。 */
export function useChampionNames(): Map<number, string> {
  const catalog = useChampionCatalog();
  return useMemo(
    () => new Map([...catalog.entries()].map(([id, champion]) => [id, champion.title || champion.name])),
    [catalog],
  );
}
