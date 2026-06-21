import fs from 'node:fs';
import path from 'node:path';

// 英雄/装备/召唤师技能/符文的 ID→中文名+图标映射。
// 数据来自项目根的 datas.json（2.3MB，含装备639/技能18/符文61/英雄171条）。
// 移植自参考项目 my-app/src/main/heroData.ts，适配 lolhelp 的 node: import 风格。

export interface HeroSummary {
  id: number;
  alias: string;
  name: string;
  title: string;
  avatar: string;
  tags: string[];
}

export interface ItemSummary {
  id: number;
  name: string;
  icon: string;
}

export interface SummonerSpellSummary {
  id: number;
  name: string;
  icon: string;
}

export interface RuneSummary {
  id: number;
  name: string;
  icon: string;
}

interface DatasJson {
  version?: string;
  lol?: {
    champions?: Record<string, unknown>;
    items?: Record<string, unknown>;
    spells?: Record<string, unknown>;
    runes?: Array<Record<string, unknown>>;
  };
}

const championIdToCategory: Record<string, string> = {};

let heroCache: Record<string, HeroSummary> | null = null;
let heroList: HeroSummary[] | null = null;
let itemCache: Record<number, ItemSummary> | null = null;
let spellCache: Record<number, SummonerSpellSummary> | null = null;
let runeCache: Record<number, RuneSummary> | null = null;
let dataDragonVersion = 'latest';
let dataLoaded = false;

// datas.json 位置：优先项目根（开发时 process.cwd 是项目根；
// 打包后 .vite/build 运行时 cwd 可能不同，回退到上一级）。
function resolveDataPath(): string {
  const direct = path.resolve(process.cwd(), 'datas.json');
  if (fs.existsSync(direct)) return direct;
  const parentPath = path.resolve(process.cwd(), '..', 'datas.json');
  if (fs.existsSync(parentPath)) return parentPath;
  throw new Error(`datas.json 未找到。尝试路径: ${direct} 和 ${parentPath}`);
}

function buildAvatarUrl(champ: Record<string, unknown>): string {
  const avatar = champ?.avatar as string | undefined;
  if (avatar && avatar.trim() !== '') return avatar;
  const version = (champ?.version as string) ?? 'latest';
  const full = champ?.image ? ((champ.image as Record<string, unknown>).full as string) : undefined;
  if (version && full) {
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${full}`;
  }
  return '';
}

function buildItemIcon(full: string | undefined, version: string): string {
  return full ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${full}` : '';
}

function buildSpellIcon(full: string | undefined, version: string): string {
  return full ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${full}` : '';
}

function buildRuneIcon(relativePath: string | undefined): string {
  if (!relativePath) return '';
  if (relativePath.startsWith('http')) return relativePath;
  return `https://ddragon.leagueoflegends.com/cdn/img/${relativePath.replace(/^\/+/, '')}`;
}

function loadFromFile(): {
  map: Record<string, HeroSummary>;
  list: HeroSummary[];
  items: Record<number, ItemSummary>;
  spells: Record<number, SummonerSpellSummary>;
  runes: Record<number, RuneSummary>;
  version: string;
} {
  const filePath = resolveDataPath();
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DatasJson;
  const champions = parsed.lol?.champions ?? {};
  const itemsRaw = parsed.lol?.items ?? {};
  const spellsRaw = parsed.lol?.spells ?? {};
  const runesRaw = Array.isArray(parsed.lol?.runes) ? parsed.lol?.runes ?? [] : [];
  const version = parsed.version ?? 'latest';

  const entries: Record<string, HeroSummary> = {};
  const list: HeroSummary[] = [];
  const itemEntries: Record<number, ItemSummary> = {};
  const spellEntries: Record<number, SummonerSpellSummary> = {};
  const runeEntries: Record<number, RuneSummary> = {};

  for (const key of Object.keys(champions)) {
    const champ = (champions[key] ?? {}) as Record<string, unknown>;
    const normalizedKey = (champ.key as string | number) ?? key;
    const summary: HeroSummary = {
      id: Number(normalizedKey),
      alias: (champ.id as string) ?? '',
      name: (champ.name as string) ?? '',
      title: (champ.title as string) ?? '',
      avatar: buildAvatarUrl(champ),
      tags: (champ.tags as string[]) ?? [],
    };
    if (!entries[String(normalizedKey)]) {
      entries[String(normalizedKey)] = summary;
      list.push(summary);
    }
    if (summary.alias) entries[summary.alias] = summary;
    const primaryTag = (champ.tags as string[] | undefined)?.[0];
    if (primaryTag) {
      championIdToCategory[String(summary.id)] = primaryTag;
      if (summary.alias) championIdToCategory[summary.alias] = primaryTag;
    }
  }

  for (const [key, item] of Object.entries(itemsRaw)) {
    const numericId = Number(key);
    if (!Number.isFinite(numericId)) continue;
    const it = (item ?? {}) as Record<string, unknown>;
    const image = it.image ? (it.image as Record<string, unknown>) : undefined;
    itemEntries[numericId] = {
      id: numericId,
      name: (it.name as string) ?? '',
      icon: buildItemIcon(image?.full as string | undefined, version),
    };
  }

  for (const spell of Object.values(spellsRaw)) {
    const sp = (spell ?? {}) as Record<string, unknown>;
    const numericId = Number(sp.key ?? sp.id);
    if (!Number.isFinite(numericId)) continue;
    const image = sp.image ? (sp.image as Record<string, unknown>) : undefined;
    spellEntries[numericId] = {
      id: numericId,
      name: (sp.name as string) ?? '',
      icon: buildSpellIcon(image?.full as string | undefined, version),
    };
  }

  for (const rune of runesRaw) {
    const r = (rune ?? {}) as Record<string, unknown>;
    const numericId = Number(r.id);
    if (!Number.isFinite(numericId)) continue;
    runeEntries[numericId] = {
      id: numericId,
      name: (r.name as string) ?? '',
      icon: buildRuneIcon(r.icon as string | undefined),
    };
  }

  return { map: entries, list, items: itemEntries, spells: spellEntries, runes: runeEntries, version };
}

export function ensureHeroDataLoaded(): void {
  if (!dataLoaded) {
    const data = loadFromFile();
    heroCache = data.map;
    heroList = data.list;
    itemCache = data.items;
    spellCache = data.spells;
    runeCache = data.runes;
    dataDragonVersion = data.version || 'latest';
    dataLoaded = true;
  }
}

export function getAllHeroes(): HeroSummary[] {
  ensureHeroDataLoaded();
  return heroList ?? [];
}

export function getHeroByKey(key: number | string): HeroSummary | null {
  ensureHeroDataLoaded();
  return heroCache?.[String(key)] ?? null;
}

export function getItemById(id: number | string): ItemSummary | null {
  ensureHeroDataLoaded();
  const numericId = Number(id);
  return Number.isFinite(numericId) ? itemCache?.[numericId] ?? null : null;
}

export function getSummonerSpellById(id: number | string): SummonerSpellSummary | null {
  ensureHeroDataLoaded();
  const numericId = Number(id);
  return Number.isFinite(numericId) ? spellCache?.[numericId] ?? null : null;
}

export function getRuneById(id: number | string): RuneSummary | null {
  ensureHeroDataLoaded();
  const numericId = Number(id);
  return Number.isFinite(numericId) ? runeCache?.[numericId] ?? null : null;
}

export function getDataDragonVersion(): string {
  ensureHeroDataLoaded();
  return dataDragonVersion;
}

// LCU 预加载刷新的入参类型（与 gameData.ts 的输出对齐）
interface LcuRefreshData {
  champions: { id: number; alias: string; name: string; title: string; avatar: string; tags: string[] }[];
  items: { id: number; name: string; icon: string }[];
  spells: { id: number; name: string; icon: string }[];
  runes: { id: number; name: string; icon: string }[];
}

// 用 LCU 拉取的最新数据覆盖刷新模块级缓存（由 gameData.preloadGameData 调用）。
// 重建与 loadFromFile 完全一致的双索引结构（数字 id + alias），保证下游 getHeroByKey 不变。
// 任一类别为空则跳过该类别（保留 datas.json 兜底），不全量清空。
export function refreshFromLcu(data: LcuRefreshData): void {
  // 英雄：重建 id + alias 双索引
  if (data.champions.length > 0) {
    const entries: Record<string, HeroSummary> = {};
    const list: HeroSummary[] = [];
    for (const c of data.champions) {
      const summary: HeroSummary = {
        id: c.id,
        alias: c.alias,
        name: c.name,
        title: c.title,
        avatar: c.avatar,
        tags: c.tags,
      };
      const idKey = String(summary.id);
      entries[idKey] = summary;
      if (summary.alias) entries[summary.alias] = summary;
      list.push(summary);
    }
    heroCache = entries;
    heroList = list;
  }
  // 装备
  if (data.items.length > 0) {
    const itemEntries: Record<number, ItemSummary> = {};
    for (const it of data.items) {
      itemEntries[it.id] = { id: it.id, name: it.name, icon: it.icon };
    }
    itemCache = itemEntries;
  }
  // 技能
  if (data.spells.length > 0) {
    const spellEntries: Record<number, SummonerSpellSummary> = {};
    for (const s of data.spells) {
      spellEntries[s.id] = { id: s.id, name: s.name, icon: s.icon };
    }
    spellCache = spellEntries;
  }
  // 符文
  if (data.runes.length > 0) {
    const runeEntries: Record<number, RuneSummary> = {};
    for (const r of data.runes) {
      runeEntries[r.id] = { id: r.id, name: r.name, icon: r.icon };
    }
    runeCache = runeEntries;
  }
  dataLoaded = true;
}
