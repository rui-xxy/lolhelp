import type {
  CollectionChampion,
  CollectionItem,
  CollectionShelf,
  CollectionSkin,
  CollectionWallet,
  MyCollection,
} from '../../shared/api';
import { getCachedCredentials } from '../lcu/lockfile';
import { LcuClient } from '../lcu/client';
import { getAllHeroes, getHeroByKey } from '../lcu/heroData';
import { lcuAsset, list, num, ownedFlag, parseInventoryDate, rec, skinFrom, text, type Raw } from './collectionParse';

// 我的收藏：只读本地客户端登录的这个号。
// 英雄与皮肤优先用 /lol-champions/v1/inventories/{id}/champions（一次拿到全部英雄、全部皮肤和炫彩，带拥有标记），
// 读不到再用 skins.json 目录 + 背包（/lol-inventory）里的拥有列表拼出来。
// 守卫 / 表情 / 头像 / 小小英雄：背包里拥有的 id + game-data 目录里的名字和图。
// 图片一律换成公开图床（腾讯 gtimg / CommunityDragon），渲染进程不需要客户端鉴权。
// 任何一块读失败都不影响其它块，原因写进 diagnostics。

const CACHE_TTL_MS = 5 * 60_000;
const SHELF_LABEL: Record<CollectionShelf, string> = { wards: '守卫', emotes: '表情', icons: '头像', companions: '小小英雄' };

let cache: { puuid: string; at: number; value: MyCollection } | null = null;
let pending: Promise<MyCollection> | null = null;

function championMeta(id: number, raw: Raw = {}): Omit<CollectionChampion, 'owned'> {
  const hero = getHeroByKey(id);
  return {
    id,
    name: hero?.name || text(raw.alias) || text(raw.name),
    title: hero?.title || text(raw.name) || text(raw.title) || `英雄 ${id}`,
    avatar: hero?.avatar || lcuAsset(text(raw.squarePortraitPath)),
  };
}

async function firstOk<T>(client: LcuClient, paths: string[]): Promise<T> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await client.get<T>(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('读取失败');
}

interface Owned {
  ids: Set<number>;
  acquired: Map<number, number>;
}

async function inventory(client: LcuClient, type: string): Promise<Owned> {
  const data = await firstOk<unknown>(client, [
    `/lol-inventory/v2/inventory/${type}`,
    `/lol-inventory/v1/inventory?inventoryTypes=${encodeURIComponent(JSON.stringify([type]))}`,
  ]);
  const ids = new Set<number>();
  const acquired = new Map<number, number>();
  for (const entry of list(data)) {
    const item = rec(entry);
    const id = num(item.itemId ?? item.id);
    const ownership = text(item.ownershipType).toUpperCase();
    if (!Number.isFinite(id) || ownership === 'RENTED') continue;
    ids.add(id);
    const at = parseInventoryDate(item.purchaseDate);
    if (at) acquired.set(id, at);
  }
  return { ids, acquired };
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface ChampionsAndSkins {
  champions: CollectionChampion[];
  skins: CollectionSkin[];
}

// 首选：英雄背包，一次拿全
async function fromChampionInventory(client: LcuClient, summonerId: number, rarityById: Map<number, Raw>): Promise<ChampionsAndSkins> {
  const data = await client.get<unknown[]>(`/lol-champions/v1/inventories/${summonerId}/champions`);
  const champions: CollectionChampion[] = [];
  const skins: CollectionSkin[] = [];
  for (const entry of list(data)) {
    const raw = rec(entry);
    const id = num(raw.id);
    if (id <= 0 || id >= 10000) continue;
    const owned = ownedFlag(raw);
    champions.push({ ...championMeta(id, raw), owned });
    for (const skinEntry of list(raw.skins)) {
      const skinRaw = rec(skinEntry);
      const extra = rarityById.get(num(skinRaw.id));
      const merged = extra ? { ...skinRaw, rarity: extra.rarity, isLegacy: extra.isLegacy } : skinRaw;
      const skin = skinFrom(merged, id, (skinId, itemRaw) => (skinId === id * 1000 ? owned : ownedFlag(itemRaw)));
      if (skin) skins.push(skin);
    }
  }
  if (champions.length === 0) throw new Error('英雄背包是空的');
  return { champions, skins };
}

// 兜底：皮肤目录 + 背包拥有列表
async function fromCatalog(client: LcuClient, catalog: Raw): Promise<ChampionsAndSkins> {
  const [ownedSkins, ownedChampions] = await Promise.all([
    inventory(client, 'CHAMPION_SKIN'),
    inventory(client, 'CHAMPION').catch(async () => {
      const minimal = await client.get<unknown[]>('/lol-champions/v1/owned-champions-minimal');
      return { ids: new Set(list(minimal).map((c) => num(rec(c).id)).filter((id) => id > 0)), acquired: new Map<number, number>() };
    }),
  ]);
  const skins: CollectionSkin[] = [];
  for (const value of Object.values(catalog)) {
    const raw = rec(value);
    const championId = Math.floor(num(raw.id) / 1000);
    const skin = skinFrom(
      raw,
      championId,
      (id) => (id === championId * 1000 ? ownedChampions.ids.has(championId) : ownedSkins.ids.has(id)),
      (id) => ownedSkins.acquired.get(id),
    );
    if (skin) skins.push(skin);
  }
  const championIds = new Set(skins.map((skin) => skin.championId));
  const champions = getAllHeroes()
    .filter((hero) => championIds.has(hero.id))
    .map((hero) => ({ ...championMeta(hero.id), owned: ownedChampions.ids.has(hero.id) }));
  return { champions, skins };
}

interface ShelfSpec {
  type: string;
  catalogPath: string;
  name: (raw: Raw) => string;
  image: (raw: Raw) => string;
  id?: (raw: Raw) => number;
}

const SHELVES: Record<CollectionShelf, ShelfSpec> = {
  wards: {
    type: 'WARD_SKIN',
    catalogPath: '/lol-game-data/assets/v1/ward-skins.json',
    name: (raw) => text(raw.name),
    image: (raw) => lcuAsset(text(raw.wardImagePath)),
  },
  emotes: {
    type: 'EMOTE',
    catalogPath: '/lol-game-data/assets/v1/summoner-emotes.json',
    name: (raw) => text(raw.name),
    image: (raw) => lcuAsset(text(raw.inventoryIcon)),
  },
  icons: {
    type: 'SUMMONER_ICON',
    catalogPath: '/lol-game-data/assets/v1/summoner-icons.json',
    name: (raw) => text(raw.title),
    image: () => '',
  },
  companions: {
    type: 'COMPANION',
    catalogPath: '/lol-game-data/assets/v1/companions.json',
    name: (raw) => text(raw.name),
    image: (raw) => lcuAsset(text(raw.loadoutsIcon)),
    id: (raw) => num(raw.itemId ?? raw.contentId),
  },
};

async function readShelf(client: LcuClient, shelf: CollectionShelf, notes: string[]): Promise<{ items: CollectionItem[]; total: number; ok: boolean }> {
  const spec = SHELVES[shelf];
  const [owned, catalog] = await Promise.allSettled([inventory(client, spec.type), client.get<unknown>(spec.catalogPath)]);
  if (owned.status === 'rejected') {
    notes.push(`${SHELF_LABEL[shelf]}：${reason(owned.reason)}`);
    return { items: [], total: 0, ok: false };
  }
  const byId = new Map<number, Raw>();
  if (catalog.status === 'fulfilled') {
    for (const entry of list(catalog.value)) {
      const raw = rec(entry);
      const id = spec.id ? spec.id(raw) : num(raw.id);
      if (id > 0) byId.set(id, raw);
    }
  } else {
    notes.push(`${SHELF_LABEL[shelf]}目录：${reason(catalog.reason)}`);
  }
  const items: CollectionItem[] = [];
  for (const id of owned.value.ids) {
    if (id <= 0) continue;
    const raw = byId.get(id) ?? {};
    items.push({ id, name: spec.name(raw) || `#${id}`, image: spec.image(raw), acquiredAt: owned.value.acquired.get(id) });
  }
  items.sort((a, b) => (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0) || b.id - a.id);
  return { items, total: byId.size, ok: true };
}

async function readWallet(client: LcuClient, notes: string[]): Promise<CollectionWallet> {
  const wallet: CollectionWallet = {};
  const [loot, rp] = await Promise.allSettled([
    client.get<Record<string, unknown>>('/lol-loot/v1/player-loot-map'),
    firstOk<unknown>(client, ['/lol-inventory/v1/wallet/RP', '/lol-store/v1/wallet']),
  ]);
  if (loot.status === 'fulfilled') {
    let chests = 0;
    for (const [key, value] of Object.entries(loot.value)) {
      const entry = rec(value);
      const count = Math.max(0, Math.floor(num(entry.count)));
      if (key === 'CURRENCY_champion') wallet.blueEssence = count;
      else if (key === 'CURRENCY_cosmetic') wallet.orangeEssence = count;
      else if (key === 'CURRENCY_mythic') wallet.mythicEssence = count;
      else if (key === 'MATERIAL_key') wallet.keys = count;
      else if (key === 'MATERIAL_key_fragment') wallet.keyFragments = count;
      else if (text(entry.type) === 'CHEST') chests += count;
    }
    wallet.chests = chests;
  } else {
    notes.push(`战利品：${reason(loot.reason)}`);
  }
  if (rp.status === 'fulfilled') {
    const raw = rp.value;
    const value = typeof raw === 'number' ? raw : num(rec(raw).RP ?? rec(raw).rp);
    if (value >= 0) wallet.rp = value;
  }
  return wallet;
}

async function readMastery(client: LcuClient): Promise<Map<number, Raw>> {
  const data = await client.get<unknown[]>('/lol-champion-mastery/v1/local-player/champion-mastery');
  return new Map(list(data).map((entry) => [num(rec(entry).championId), rec(entry)]));
}

async function load(): Promise<MyCollection> {
  const creds = getCachedCredentials();
  if (!creds) throw new Error('英雄联盟客户端未连接');
  const client = new LcuClient(creds);
  const me = rec(await client.get('/lol-summoner/v1/current-summoner'));
  const summonerId = num(me.summonerId);
  const puuid = text(me.puuid);
  const riotId = [text(me.gameName) || text(me.displayName), text(me.tagLine)].filter(Boolean).join('#');
  if (cache && cache.puuid === puuid && Date.now() - cache.at < CACHE_TTL_MS) return structuredClone(cache.value);

  const notes: string[] = [];
  const [catalogResult, masteryResult, wallet, ...shelfResults] = await Promise.all([
    client.get<Raw>('/lol-game-data/assets/v1/skins.json').then(
      (value) => ({ ok: true as const, value: rec(value) }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    readMastery(client).catch((error: unknown) => {
      notes.push(`熟练度：${reason(error)}`);
      return new Map<number, Raw>();
    }),
    readWallet(client, notes),
    ...(Object.keys(SHELVES) as CollectionShelf[]).map((shelf) => readShelf(client, shelf, notes)),
  ]);

  const rarityById = new Map<number, Raw>();
  if (catalogResult.ok) {
    for (const value of Object.values(catalogResult.value)) {
      const raw = rec(value);
      if (num(raw.id) > 0) rarityById.set(num(raw.id), raw);
    }
  } else {
    notes.push(`皮肤目录：${reason(catalogResult.error)}`);
  }

  let base: ChampionsAndSkins = { champions: [], skins: [] };
  try {
    base = await fromChampionInventory(client, summonerId, rarityById);
  } catch (error) {
    notes.push(`英雄背包：${reason(error)}`);
    if (catalogResult.ok) {
      try {
        base = await fromCatalog(client, catalogResult.value);
      } catch (fallbackError) {
        notes.push(`皮肤背包：${reason(fallbackError)}`);
      }
    }
  }

  const champions = base.champions.map((champion) => {
    const mastery = masteryResult.get(champion.id);
    return mastery
      ? {
          ...champion,
          masteryLevel: num(mastery.championLevel) || undefined,
          masteryPoints: num(mastery.championPoints) || undefined,
          lastPlayed: num(mastery.lastPlayTime) || undefined,
        }
      : champion;
  });

  const shelves = Object.fromEntries(
    (Object.keys(SHELVES) as CollectionShelf[]).map((shelf, index) => [shelf, shelfResults[index]]),
  ) as MyCollection['shelves'];

  const value: MyCollection = {
    puuid,
    riotId,
    fetchedAt: Date.now(),
    champions,
    skins: base.skins.sort((a, b) => a.id - b.id),
    shelves,
    wallet,
    diagnostics: notes,
  };
  // 英雄和皮肤都读到了才缓存，失败的下次再试
  if (base.skins.length > 0) cache = { puuid, at: Date.now(), value };
  return structuredClone(value);
}

export async function getMyCollection(force = false): Promise<MyCollection> {
  if (force) cache = null;
  pending ??= load().finally(() => {
    pending = null;
  });
  return pending;
}
