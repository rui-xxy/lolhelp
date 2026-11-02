import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CollectionChampion,
  CollectionSkin,
  LolConfigState,
  MyCollection,
  PlayerMatchDetail,
} from '../../../shared/api';

// 主页用到的数据：我的收藏（整个应用只读一次，手动刷新才重读）、常玩英雄、设置方案。

let collectionCache: MyCollection | null = null;

export interface CollectionState {
  data: MyCollection | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

const errorText = (error: unknown, fallback: string) => {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (/No handler registered/i.test(text)) return '请重启助手';
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || fallback;
};

export function useMyCollection(enabled: boolean): CollectionState {
  const [data, setData] = useState<MyCollection | null>(collectionCache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  const load = useCallback(async (force: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const next = await window.lolHelper.lcu.getMyCollection(force);
      collectionCache = next;
      setData(next);
    } catch (err) {
      setError(errorText(err, '读取收藏失败'));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && !collectionCache) void load(false);
  }, [enabled, load]);

  const reload = useCallback(() => void load(true), [load]);
  return { data, loading, error, reload };
}

export interface WardrobeChampion {
  champion: CollectionChampion;
  games: number;
  wins: number;
  skins: CollectionSkin[];
  owned: number;
  total: number;
  chromas: number;
}

/** 皮肤排序：有的在前（品质高的、新的靠前），没有的在后（新的靠前）。经典皮肤放在已有的最后。 */
const RARITY_RANK: Record<CollectionSkin['rarity'], number> = {
  exalted: 6,
  transcendent: 6,
  ultimate: 5,
  mythic: 4,
  legendary: 3,
  epic: 2,
  none: 1,
};

export function sortSkins(skins: CollectionSkin[]): CollectionSkin[] {
  return [...skins].sort((a, b) => {
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    if (a.isBase !== b.isBase) return a.isBase ? 1 : -1;
    return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.id - a.id;
  });
}

export function championSkins(collection: MyCollection, championId: number): CollectionSkin[] {
  return sortSkins(collection.skins.filter((skin) => skin.championId === championId));
}

function summarize(collection: MyCollection, champion: CollectionChampion, games = 0, wins = 0): WardrobeChampion {
  const skins = championSkins(collection, champion.id);
  const extra = skins.filter((skin) => !skin.isBase);
  return {
    champion,
    games,
    wins,
    skins,
    owned: extra.filter((skin) => skin.owned).length,
    total: extra.length,
    chromas: skins.reduce((sum, skin) => sum + skin.chromas.filter((chroma) => chroma.owned).length, 0),
  };
}

/** 常玩：最近的对局里玩得多的在前，不够再用熟练度补。 */
export function frequentChampions(collection: MyCollection, matches: PlayerMatchDetail[], limit = 8): WardrobeChampion[] {
  const byId = new Map(collection.champions.map((champion) => [champion.id, champion]));
  const tally = new Map<number, { games: number; wins: number; last: number }>();
  for (const match of matches) {
    const entry = tally.get(match.championId) ?? { games: 0, wins: 0, last: 0 };
    entry.games += 1;
    entry.wins += match.win ? 1 : 0;
    entry.last = Math.max(entry.last, match.gameCreation);
    tally.set(match.championId, entry);
  }
  const picked: WardrobeChampion[] = [...tally.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => b[1].games - a[1].games || b[1].last - a[1].last)
    .map(([id, entry]) => summarize(collection, byId.get(id) as CollectionChampion, entry.games, entry.wins));
  if (picked.length < limit) {
    const taken = new Set(picked.map((item) => item.champion.id));
    const byMastery = collection.champions
      .filter((champion) => !taken.has(champion.id) && (champion.masteryPoints ?? 0) > 0)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || (b.masteryPoints ?? 0) - (a.masteryPoints ?? 0));
    for (const champion of byMastery) {
      if (picked.length >= limit) break;
      picked.push(summarize(collection, champion));
    }
  }
  return picked.slice(0, limit);
}

export interface CollectionTotals {
  skins: number;
  skinsAll: number;
  chromas: number;
  champions: number;
  championsAll: number;
}

export function collectionTotals(collection: MyCollection): CollectionTotals {
  let skins = 0;
  let skinsAll = 0;
  let chromas = 0;
  for (const skin of collection.skins) {
    if (skin.isBase) continue;
    skinsAll += 1;
    if (skin.owned) skins += 1;
    chromas += skin.chromas.filter((chroma) => chroma.owned).length;
  }
  return {
    skins,
    skinsAll,
    chromas,
    champions: collection.champions.filter((champion) => champion.owned).length,
    championsAll: collection.champions.length,
  };
}

// ---------- 设置方案 ----------

export interface ProfilesState {
  state: LolConfigState | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<LolConfigState | null>;
}

export function useConfigProfiles(enabled: boolean): ProfilesState {
  const [state, setState] = useState<LolConfigState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await window.lolHelper.config.read();
      setState(next);
      return next;
    } catch (err) {
      setError(errorText(err, '读取设置失败'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  return { state, loading, error, refresh };
}

export { errorText };
