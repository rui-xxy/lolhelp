import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type {
  MayhemAugmentRarity,
  MayhemAugmentRankingResult,
  MayhemChampionBuild,
  MayhemChampionBuildResult,
  MayhemChampionRole,
  MayhemChampionTier,
  MayhemComboResult,
  MayhemComboTier,
  MayhemItemBuildOption,
  MayhemItemGroupKey,
  MayhemSkillOrder,
  MayhemTierListResult,
} from '../../shared/api';

const MAYHEM_BASE_URL = 'https://arammayhem.com';
const MAYHEM_TIER_LIST_URL = `${MAYHEM_BASE_URL}/zh-cn/tier-list/`;
const MAYHEM_AUGMENTS_URL = `${MAYHEM_BASE_URL}/zh-cn/augments/`;
const MAYHEM_COMBOS_INDEX_URL = `${MAYHEM_BASE_URL}/zh-cn/combo-index-data.json`;
const CACHE_TTL_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;

const VALID_TIERS = new Set<MayhemChampionTier>(['S+', 'S', 'A', 'B', 'C', 'D']);
const VALID_ROLES = new Set<MayhemChampionRole>([
  'assassin',
  'fighter',
  'mage',
  'marksman',
  'support',
  'tank',
]);

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

let tierListCache: CacheEntry<MayhemTierListResult> | null = null;
let augmentRankingCache: CacheEntry<MayhemAugmentRankingResult> | null = null;
let comboCache: CacheEntry<MayhemComboResult> | null = null;
const buildCache = new Map<string, CacheEntry<MayhemChampionBuildResult>>();

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentFromText(value: string, label?: string): number {
  const scoped = label
    ? value.match(new RegExp(`${label}\\s*[:：]?\\s*(-?\\d+(?:\\.\\d+)?)%`, 'i'))?.[1]
    : value.match(/(-?\d+(?:\.\d+)?)%/)?.[1];
  return finiteNumber(scoped);
}

function optionalPercentFromText(value: string): number | null {
  const match = value.match(/(-?\d+(?:\.\d+)?)%/)?.[1];
  return match === undefined ? null : finiteNumber(match);
}

function absoluteUrl(value: string | undefined): string {
  if (!value) return '';
  return new URL(value, MAYHEM_BASE_URL).toString();
}

function tierFromText(value: string): MayhemChampionTier {
  const match = value.match(/S\+|S|A|B|C|D/)?.[0] as MayhemChampionTier | undefined;
  return match && VALID_TIERS.has(match) ? match : 'C';
}

function findSection($: CheerioAPI, heading: string): Cheerio<AnyNode> | null {
  let result: Cheerio<AnyNode> | null = null;
  $('main section').each((_index, element) => {
    if (result) return;
    const firstChildText = cleanText($(element).children().first().text());
    if (firstChildText === heading) result = $(element);
  });
  return result;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': 'lolhelp/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('海克斯大乱斗数据超过大小限制');
    }
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': 'lolhelp/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('海克斯大乱斗数据超过大小限制');
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseMayhemTierList(html: string): MayhemTierListResult {
  const $ = load(html);
  const subtitle = cleanText($('main h1').first().next('p').text());
  const patch = subtitle.match(/补丁\s*([\d.]+)/)?.[1] ?? '';
  const updatedAt = subtitle.match(/数据更新时间[:：]\s*([\d-]+)/)?.[1] ?? '';
  const entries: MayhemTierListResult['entries'] = [];

  $('main .tier-section').each((_sectionIndex, section) => {
    const tier = tierFromText(cleanText($(section).children().first().text()));
    $(section).find('a.champion-card[href*="/build/"]').each((_cardIndex, card) => {
      const href = $(card).attr('href') ?? '';
      const slug = href.match(/\/build\/([^/]+)/)?.[1] ?? '';
      const title = $(card).attr('title') ?? '';
      const image = absoluteUrl($(card).find('img').first().attr('src'));
      const name = cleanText($(card).find('img').first().attr('alt'));
      const championId = finiteNumber(image.match(/champion-icons\/(\d+)\.png/)?.[1]);
      const rank = finiteNumber(title.match(/排名[:：]\s*#?(\d+)/)?.[1]);
      const roleValues = ($(card).attr('data-tags') ?? '')
        .split(',')
        .map((role) => role.trim())
        .filter((role): role is MayhemChampionRole => VALID_ROLES.has(role as MayhemChampionRole));
      const trendMatch = cleanText($(card).text()).match(/([▲▼])\s*(\d+)/);
      const trend = trendMatch
        ? finiteNumber(trendMatch[2]) * (trendMatch[1] === '▲' ? 1 : -1)
        : null;

      if (!slug || !name || !rank) return;
      entries.push({
        id: championId,
        slug,
        name,
        image,
        rank,
        tier,
        roles: roleValues,
        winRate: percentFromText(title, '胜率'),
        pickRate: percentFromText(title, '登场率'),
        trend,
      });
    });
  });

  return {
    entries: entries.sort((left, right) => left.rank - right.rank),
    meta: { patch, updatedAt, source: 'ARAM Mayhem' },
  };
}

export function parseMayhemAugmentRanking(html: string): MayhemAugmentRankingResult {
  const $ = load(html);
  const entries: MayhemAugmentRankingResult['entries'] = [];

  $('a.augment-rank-row').each((_index, row) => {
    const element = $(row);
    const href = element.attr('href') ?? '';
    const slug = href.match(/\/augments\/([^/?#]+)/)?.[1] ?? '';
    const rarityValue = element.attr('data-rarity') ?? '';
    const availabilityValue = element.attr('data-availability') ?? '';
    if (!slug || !['prismatic', 'gold', 'silver'].includes(rarityValue)) return;
    if (!['live', 'removed'].includes(availabilityValue)) return;

    const images = element.find('img').toArray();
    const augmentImage = images[0];
    const name = cleanText($(augmentImage).attr('alt'));
    if (!name) return;

    const allRank = finiteNumber(element.attr('data-all-rank'));
    const liveRank = finiteNumber(element.attr('data-live-rank'));
    const availability = availabilityValue as 'live' | 'removed';
    const children = element.children();
    const topChampions = images.slice(1).flatMap((image) => {
      const icon = absoluteUrl($(image).attr('src'));
      const championName = cleanText($(image).attr('alt'));
      if (!icon || !championName) return [];
      return [{
        id: finiteNumber(icon.match(/champion-icons\/(\d+)\.png/)?.[1]),
        name: championName,
        icon,
      }];
    });

    entries.push({
      slug,
      name,
      icon: absoluteUrl($(augmentImage).attr('src')),
      rarity: rarityValue as MayhemAugmentRarity,
      availability,
      rank: availability === 'live' && liveRank > 0 ? liveRank : allRank,
      allRank,
      winRate: optionalPercentFromText(cleanText(children.eq(2).text())),
      pickRate: optionalPercentFromText(cleanText(children.eq(3).text())),
      isNew: element.find('span').toArray().some((span) => cleanText($(span).text()) === '新'),
      topChampions,
    });
  });

  const liveEntries = entries.filter((entry) => entry.availability === 'live');
  const updatedAt = cleanText($('main').text()).match(/数据更新\s*([0-9年月日-]+)/)?.[1] ?? '';
  const rarityCounts = liveEntries.reduce<MayhemAugmentRankingResult['meta']['rarityCounts']>(
    (counts, entry) => ({ ...counts, [entry.rarity]: counts[entry.rarity] + 1 }),
    { prismatic: 0, gold: 0, silver: 0 },
  );

  return {
    entries: entries.sort((left, right) => left.allRank - right.allRank),
    meta: {
      updatedAt,
      activeCount: liveEntries.length,
      removedCount: entries.length - liveEntries.length,
      rarityCounts,
      source: 'ARAM Mayhem',
    },
  };
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function parseMayhemCombos(html: string): MayhemComboResult {
  const $ = load(html);
  const entries: MayhemComboResult['entries'] = [];
  const summary = cleanText($('main').text());
  const summaryMatch = summary.match(/(\d+)\s*个组合[^\d]+(\d+)\s*位英雄/);

  $('main article.combo-card[data-combo-id]').each((index, article) => {
    const element = $(article);
    const tierValue = element.attr('data-tier') ?? '';
    if (!['S+', 'S', 'A', 'B', 'C'].includes(tierValue)) return;

    const comboLink = element.find('a[href*="/combo/"]').first();
    const buildLink = element.find('a[href*="/build/"]').first();
    const comboHref = comboLink.attr('href') ?? '';
    const buildHref = buildLink.attr('href') ?? '';
    const slug = comboHref.match(/\/combo\/([^/?#]+)/)?.[1] ?? '';
    const championSlug = buildHref.match(/\/build\/([^/?#]+)/)?.[1] ?? '';
    const images = element.find('img').toArray();
    const augmentImage = images[0];
    const championImage = images[1];
    const augmentImagePath = $(augmentImage).attr('src') ?? '';
    const augmentName = cleanText($(augmentImage).attr('alt'));
    const championName = cleanText($(championImage).attr('alt'));
    const championIcon = absoluteUrl($(championImage).attr('src'));
    const id = cleanText(element.attr('data-combo-id'));
    if (!id || !slug || !augmentName || !championName) return;

    entries.push({
      id,
      slug,
      rank: index + 1,
      tier: tierValue as MayhemComboTier,
      types: parseStringArray(element.attr('data-types')),
      description: cleanText(element.find('p').first().text()),
      votes: finiteNumber(element.attr('data-upvote-count')),
      rankScore: finiteNumber(element.attr('data-rank-score')),
      curated: element.find('span').toArray().some((span) => cleanText($(span).text()) === 'Curated'),
      champion: {
        id: finiteNumber(championIcon.match(/champion-icons\/(\d+)\.png/)?.[1]),
        slug: championSlug,
        name: championName,
        icon: championIcon,
      },
      augment: {
        slug: (augmentImagePath.split('/').pop() ?? '')
          .replace(/_mayhem_augment\.webp$/i, '')
          .replace(/_/g, '-')
          .toLocaleLowerCase(),
        name: augmentName,
        icon: absoluteUrl(augmentImagePath),
      },
      sourceUrl: absoluteUrl(comboHref),
    });
  });

  return {
    entries,
    meta: {
      totalCount: finiteNumber(summaryMatch?.[1], entries.length),
      championCount: finiteNumber(summaryMatch?.[2]),
      featuredCount: entries.length,
      pageSize: 30,
      pageCount: Math.max(1, Math.ceil(finiteNumber(summaryMatch?.[1], entries.length) / 30)),
      source: 'ARAM Mayhem',
    },
  };
}

interface MayhemComboManifestCard {
  id?: string | number;
  slug?: string;
  championId?: string;
  augmentId?: string;
  tier?: string;
  types?: unknown;
  champName?: string;
  champIcon?: string;
  championHref?: string;
  augmentName?: string;
  augmentIcon?: string;
  comboHref?: string;
  comboDescription?: string;
  comboRef?: string;
  upvoteCount?: number;
  rankScore?: number;
}

interface MayhemComboManifest {
  cards?: MayhemComboManifestCard[];
  pageSize?: number;
  totalCombos?: number;
}

export function parseMayhemComboManifest(manifest: MayhemComboManifest): MayhemComboResult {
  const cards = Array.isArray(manifest.cards) ? manifest.cards : [];
  const entries = cards.flatMap<MayhemComboResult['entries'][number]>((card, index) => {
    const id = cleanText(String(card.id ?? ''));
    const slug = cleanText(card.slug);
    const tier = cleanText(card.tier);
    const championName = cleanText(card.champName);
    const championIcon = absoluteUrl(card.champIcon);
    const championSlug = card.championHref?.match(/\/build\/([^/?#]+)/)?.[1] ?? '';
    const augmentName = cleanText(card.augmentName);
    const augmentIcon = absoluteUrl(card.augmentIcon);
    const comboHref = card.comboHref || `/zh-cn/combo/${slug}/`;
    if (!id || !slug || !championName || !augmentName || !['S+', 'S', 'A', 'B', 'C'].includes(tier)) {
      return [];
    }

    return [{
      id,
      slug,
      rank: index + 1,
      tier: tier as MayhemComboTier,
      types: Array.isArray(card.types)
        ? card.types.filter((value): value is string => typeof value === 'string')
        : [],
      description: cleanText(card.comboDescription),
      votes: finiteNumber(card.upvoteCount),
      rankScore: finiteNumber(card.rankScore),
      curated: card.comboRef?.startsWith('curated:') ?? false,
      champion: {
        id: finiteNumber(championIcon.match(/champion-icons\/(\d+)\.png/)?.[1]),
        slug: championSlug || cleanText(card.championId).toLocaleLowerCase(),
        name: championName,
        icon: championIcon,
      },
      augment: {
        slug: cleanText(card.augmentId).replace(/_/g, '-').toLocaleLowerCase(),
        name: augmentName,
        icon: augmentIcon,
      },
      sourceUrl: absoluteUrl(comboHref),
    }];
  });
  const totalCount = Math.max(finiteNumber(manifest.totalCombos), entries.length);
  const pageSize = Math.max(1, finiteNumber(manifest.pageSize, 30));

  return {
    entries,
    meta: {
      totalCount,
      championCount: new Set(entries.map((entry) => entry.champion.slug)).size,
      featuredCount: entries.length,
      pageSize,
      pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
      source: 'ARAM Mayhem',
    },
  };
}

function parseItemGroup($: CheerioAPI, heading: string): MayhemItemBuildOption[] {
  const section = findSection($, heading);
  if (!section) return [];
  const options: MayhemItemBuildOption[] = [];
  const rows = section.children('div').eq(1).children('div');

  rows.each((_rowIndex, row) => {
    const items = $(row).find('a[href*="/items/"]').toArray().flatMap((item) => {
      const name = cleanText($(item).attr('title') ?? $(item).find('img').attr('alt'));
      const icon = absoluteUrl($(item).find('img').attr('src'));
      return name && icon ? [{ name, icon }] : [];
    });
    const statsText = cleanText($(row).children('div').eq(1).text());
    if (!items.length) return;
    options.push({
      items,
      pickRate: percentFromText(statsText, '登场率'),
      winRate: percentFromText(statsText, '胜率'),
    });
  });

  return options;
}

function parseSkillOrders($: CheerioAPI): MayhemSkillOrder[] {
  const section = findSection($, '技能主升顺序');
  if (!section) return [];
  const orders: MayhemSkillOrder[] = [];

  section.find('div.rounded-lg').each((_orderIndex, row) => {
    const summary = $(row).children('div').first();
    const priority = cleanText(summary.children('span').first().text());
    if (!priority || !priority.includes('>')) return;
    const summaryText = cleanText(summary.text());
    const sequences = $(row).find('div.mt-2 > div').toArray().flatMap((sequenceRow) => {
      const sequence = cleanText($(sequenceRow).children('span').first().text());
      const text = cleanText($(sequenceRow).text());
      return sequence ? [{
        sequence,
        pickRate: percentFromText(text, '登场率'),
        winRate: percentFromText(text, '胜率'),
      }] : [];
    });
    orders.push({
      priority,
      pickRate: percentFromText(summaryText, '登场率'),
      winRate: percentFromText(summaryText, '胜率'),
      sequences,
    });
  });

  return orders;
}

function rarityFromClass(value: string): MayhemAugmentRarity | null {
  if (value.includes('rarity-prismatic')) return 'prismatic';
  if (value.includes('rarity-gold')) return 'gold';
  if (value.includes('rarity-silver')) return 'silver';
  return null;
}

export function parseMayhemChampionBuild(html: string, slug: string): MayhemChampionBuild {
  const $ = load(html);
  const h1 = $('main h1').first();
  const h1Text = cleanText(h1.text());
  const portrait = $('main img[width="96"]').first();
  const name = cleanText(portrait.attr('alt')) || cleanText(h1Text.split(/\s(?:S\+|S|A|B|C|D)\s/)[0]);
  const aliasLine = cleanText(h1.next('p').text());
  const alias = cleanText(aliasLine.split('·').slice(1).join('·'));
  const profile = h1.parent();
  const profileText = cleanText(profile.text());
  const roles = profile.find('span[data-slot="badge"]').toArray()
    .map((badge) => cleanText($(badge).text()))
    .filter((role) => ['刺客', '战士', '法师', '射手', '辅助', '坦克'].includes(role));
  const balance = $('[title="大乱斗平衡改动"]').toArray().map((modifier) => {
    const parts = $(modifier).children('span').toArray().map((part) => cleanText($(part).text()));
    const arrow = parts[0] ?? '';
    return {
      direction: arrow.includes('↑') ? 'up' as const : arrow.includes('↓') ? 'down' as const : 'neutral' as const,
      label: parts[1] ?? '',
      value: parts[2] ?? '',
    };
  }).filter((modifier) => modifier.label && modifier.value);

  const augments = $('a[href*="/augments/"]').toArray().flatMap((augment) => {
    const className = $(augment).attr('class') ?? '';
    if (!className.includes('items-start')) return [];
    const rarity = rarityFromClass(className);
    const href = $(augment).attr('href') ?? '';
    const augmentSlug = href.match(/\/augments\/([^/?#]+)/)?.[1] ?? '';
    const augmentName = cleanText($(augment).find('img').attr('alt'));
    if (!rarity || !augmentSlug || !augmentName) return [];
    return [{
      slug: augmentSlug,
      name: augmentName,
      rarity,
      icon: absoluteUrl($(augment).find('img').attr('src')),
      winRate: percentFromText(cleanText($(augment).text()), '胜率'),
      effect: cleanText($(augment).find('div.mt-2').last().text()),
    }];
  });

  const itemGroups: Record<MayhemItemGroupKey, MayhemItemBuildOption[]> = {
    starting: parseItemGroup($, '出门装'),
    boots: parseItemGroup($, '鞋子'),
    core: parseItemGroup($, '核心出装'),
    late: parseItemGroup($, '后期出装'),
  };

  return {
    slug,
    name,
    alias,
    image: absoluteUrl(portrait.attr('src')),
    tier: tierFromText(h1Text.match(/\s(S\+|S|A|B|C|D)\s*级/)?.[1] ?? h1Text),
    roles,
    winRate: percentFromText(profileText.match(/\d+(?:\.\d+)?%\s*WR/i)?.[0] ?? ''),
    pickRate: percentFromText(profileText.match(/\d+(?:\.\d+)?%\s*PR/i)?.[0] ?? ''),
    patch: profileText.match(/补丁[:：]\s*([\d.]+)/)?.[1] ?? '',
    balance,
    skillOrders: parseSkillOrders($),
    itemGroups,
    augments,
    sourceUrl: `${MAYHEM_BASE_URL}/zh-cn/build/${slug}/`,
  };
}

export async function getMayhemTierList(refresh = false): Promise<MayhemTierListResult> {
  if (!refresh && tierListCache && tierListCache.expiresAt > Date.now()) return tierListCache.value;
  try {
    const html = await fetchHtml(MAYHEM_TIER_LIST_URL);
    const value = parseMayhemTierList(html);
    if (!value.entries.length) throw new Error('没有解析到海克斯大乱斗英雄数据');
    tierListCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    if (tierListCache) return { ...tierListCache.value, error: '刷新失败，当前显示上一次的数据' };
    return {
      entries: [],
      meta: { patch: '', updatedAt: '', source: 'ARAM Mayhem' },
      error: error instanceof Error ? error.message : '海克斯大乱斗强度榜获取失败',
    };
  }
}

export async function getMayhemAugmentRanking(refresh = false): Promise<MayhemAugmentRankingResult> {
  if (!refresh && augmentRankingCache && augmentRankingCache.expiresAt > Date.now()) {
    return augmentRankingCache.value;
  }
  try {
    const html = await fetchHtml(MAYHEM_AUGMENTS_URL);
    const value = parseMayhemAugmentRanking(html);
    if (!value.entries.length) throw new Error('没有解析到海克斯大乱斗强化符文数据');
    augmentRankingCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    if (augmentRankingCache) {
      return { ...augmentRankingCache.value, error: '刷新失败，当前显示上一次的数据' };
    }
    return {
      entries: [],
      meta: {
        updatedAt: '',
        activeCount: 0,
        removedCount: 0,
        rarityCounts: { prismatic: 0, gold: 0, silver: 0 },
        source: 'ARAM Mayhem',
      },
      error: error instanceof Error ? error.message : '强化符文排行获取失败',
    };
  }
}

export async function getMayhemCombos(refresh = false): Promise<MayhemComboResult> {
  if (!refresh && comboCache && comboCache.expiresAt > Date.now()) return comboCache.value;
  try {
    const manifest = await fetchJson<MayhemComboManifest>(MAYHEM_COMBOS_INDEX_URL);
    const value = parseMayhemComboManifest(manifest);
    if (!value.entries.length) throw new Error('没有解析到海克斯大乱斗强势组合');
    comboCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    if (comboCache) return { ...comboCache.value, error: '刷新失败，当前显示上一次的数据' };
    return {
      entries: [],
      meta: {
        totalCount: 0,
        championCount: 0,
        featuredCount: 0,
        pageSize: 30,
        pageCount: 1,
        source: 'ARAM Mayhem',
      },
      error: error instanceof Error ? error.message : '强势组合获取失败',
    };
  }
}

export async function getMayhemChampionBuild(slug: string, refresh = false): Promise<MayhemChampionBuildResult> {
  const normalizedSlug = slug.trim().toLocaleLowerCase();
  if (!/^[a-z0-9-]{1,48}$/.test(normalizedSlug)) {
    return { build: null, error: '英雄标识无效' };
  }

  const cached = buildCache.get(normalizedSlug);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const html = await fetchHtml(`${MAYHEM_BASE_URL}/zh-cn/build/${normalizedSlug}/`);
    const build = parseMayhemChampionBuild(html, normalizedSlug);
    if (!build.name) throw new Error('没有解析到英雄详情');
    const value = { build };
    buildCache.set(normalizedSlug, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    if (cached) return { ...cached.value, error: '刷新失败，当前显示上一次的数据' };
    return {
      build: null,
      error: error instanceof Error ? error.message : '海克斯大乱斗英雄详情获取失败',
    };
  }
}
