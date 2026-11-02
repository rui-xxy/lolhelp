import type { CollectionChroma, CollectionRarity, CollectionSkin } from '../../shared/api';

// 收藏数据的解析：客户端原始 JSON → 渲染进程用的结构。纯函数，单测覆盖。

const GTIMG = 'https://game.gtimg.cn/images/lol/act/img/';
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';
export type Raw = Record<string, unknown>;

export const rec = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
export const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** /lol-game-data/assets/… 的路径换成 CommunityDragon 上的同一张图。 */
export function lcuAsset(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const match = path.match(/^\/lol-game-data\/assets\/(.+)$/i);
  return match ? CDRAGON + match[1].toLowerCase() : '';
}

export function rarityOf(raw: Raw): CollectionRarity {
  const value = `${text(raw.rarity)} ${text(raw.rarityGemPath)}`.toLowerCase();
  if (value.includes('transcendent')) return 'transcendent';
  if (value.includes('exalted')) return 'exalted';
  if (value.includes('ultimate')) return 'ultimate';
  if (value.includes('mythic')) return 'mythic';
  if (value.includes('legendary')) return 'legendary';
  if (value.includes('epic')) return 'epic';
  return 'none';
}

/** 背包里的时间是 20210115T183019.000Z 这种格式。 */
export function parseInventoryDate(value: unknown): number | undefined {
  if (typeof value === 'number' && value > 0) return value;
  const raw = text(value);
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function ownedFlag(raw: Raw): boolean {
  const ownership = rec(raw.ownership);
  if ('owned' in ownership) return ownership.owned === true && rec(ownership.rental).rented !== true;
  return raw.owned === true;
}

function chromaFrom(raw: Raw, championId: number, owned: (id: number) => boolean): CollectionChroma | null {
  const id = num(raw.id);
  if (id <= 0) return null;
  return {
    id,
    name: text(raw.name),
    colors: list(raw.colors).filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 2),
    image: `${GTIMG}chromas/${championId}/${id}.png`,
    imageFallback: lcuAsset(text(raw.chromaPath)),
    owned: owned(id),
  };
}

export function skinFrom(
  raw: Raw,
  championId: number,
  owned: (id: number, raw: Raw) => boolean,
  acquired?: (id: number) => number | undefined,
): CollectionSkin | null {
  const id = num(raw.id);
  if (id <= 0 || Math.floor(id / 1000) !== championId) return null;
  const isBase = raw.isBase === true || id === championId * 1000;
  const chromas = list(raw.chromas)
    .map((chroma) => chromaFrom(rec(chroma), championId, (chromaId) => owned(chromaId, rec(chroma))))
    .filter((chroma): chroma is CollectionChroma => chroma !== null);
  return {
    id,
    championId,
    name: isBase ? '经典' : text(raw.name) || `皮肤 ${id % 1000}`,
    isBase,
    rarity: rarityOf(raw),
    legacy: raw.isLegacy === true,
    owned: owned(id, raw),
    acquiredAt: acquired?.(id),
    portrait: `${GTIMG}skinloading/${id}.jpg`,
    portraitFallback: lcuAsset(text(raw.loadScreenPath)),
    splash: `${GTIMG}skin/big${id}.jpg`,
    splashFallback: lcuAsset(text(raw.uncenteredSplashPath) || text(raw.splashPath)),
    chromas,
  };
}
